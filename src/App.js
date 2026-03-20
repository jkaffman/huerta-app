import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, deleteField
} from "firebase/firestore";

const TAREAS_SISTEMA = [
  { id:"sembrar",     label:"Sembrar",      color:"#2d7a3a", light:"#e8f5e2", abrev:"SEM" },
  { id:"trasplantar", label:"Trasplantar",  color:"#7B5EA7", light:"#ede9fe", abrev:"TRA" },
  { id:"regar",       label:"Regar",        color:"#1d4ed8", light:"#eff6ff", abrev:"REG" },
  { id:"fertilizar",  label:"Fertilizar",   color:"#92660a", light:"#fef3c7", abrev:"FER" },
  { id:"plagas",      label:"Ctrl. plagas", color:"#b91c1c", light:"#fee2e2", abrev:"PLA" },
  { id:"malezas",     label:"Malezas",      color:"#6b21a8", light:"#f3e8ff", abrev:"MAL" },
  { id:"podar",       label:"Podar",        color:"#ca8a04", light:"#fefce8", abrev:"POD" },
  { id:"cosechar",    label:"Cosechar",     color:"#ea580c", light:"#fff7ed", abrev:"COS" },
];

const MONTHS   = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Fecha es "YYYY-MM" — devuelve nombre corto del mes
function mesLabel(fecha) {
  if (!fecha) return "";
  const m = parseInt(fecha.slice(5,7),10)-1;
  return MONTHS[m] || "";
}
// Posición X centrada en el mes
function mesX(fecha, labelW, colW) {
  if (!fecha) return labelW;
  const m = parseInt(fecha.slice(5,7),10)-1;
  return labelW + m*colW + colW/2;
}
// Dimensiones base (desktop). En móvil se escalan con un factor
const COL_W_BASE    = 90;
const ROW_H_BASE    = 38;
const LABEL_W_BASE  = 170;
const HEADER_H_BASE = 36;

function getGanttScale() {
  if (typeof window === "undefined") return 1;
  const w = window.innerWidth;
  if (w < 480) return 0.45;
  if (w < 640) return 0.58;
  if (w < 900) return 0.75;
  return 1;
}

// ── Paleta lila / naturalista ──
const C = {
  bg:"#F0EDF8", bgCard:"#FAF8FE", bgHeader:"#4A3D6B",
  bgGantt:"#F5F2FB", bgRow1:"#F5F2FB", bgRow2:"#EDE9F5",
  bgLabel1:"#EAE5F5", bgLabel2:"#E2DCF0", bgMonthH:"#4A3D6B",
  border:"#C9C2E0", borderDark:"#7B6FA0",
  textMain:"#2E2248", textSub:"#7B6FA0", textMuted:"#A99DC8",
  textHead:"#F0EDF8", monthText:"#F0EDF8",
  today:"#c2410c", accent:"#5D8C3A",
};

function colorParaPersonalizada(label) {
  const colores = [
    { color:"#065f46", light:"#d1fae5" },
    { color:"#1e3a5f", light:"#dbeafe" },
    { color:"#4a1d96", light:"#ede9fe" },
    { color:"#7c2d12", light:"#ffedd5" },
    { color:"#134e4a", light:"#ccfbf1" },
    { color:"#3f3f46", light:"#f4f4f5" },
  ];
  const idx = label.charCodeAt(0) % colores.length;
  return { ...colores[idx], abrev: label.slice(0,3).toUpperCase() };
}

function getTipoInfo(tipo, label, tareasCustom, coloresCustom={}) {
  const sistema = TAREAS_SISTEMA.find(t => t.id === tipo);
  if (sistema) {
    const colorOverride = coloresCustom[tipo];
    return colorOverride ? { ...sistema, color:colorOverride } : sistema;
  }
  const custom = tareasCustom.find(t => t.id === tipo);
  if (custom) {
    const colorOverride = coloresCustom[tipo];
    return colorOverride ? { ...custom, color:colorOverride } : custom;
  }
  return { color:"#4b5563", light:"#f3f4f6", abrev:(label||"OTR").slice(0,3).toUpperCase() };
}

export default function HuertaApp() {
  const [view,           setView]           = useState("gantt");
  const [cultivos,       setCultivos]       = useState([]);
  const [tareas,         setTareas]         = useState([]);
  const [tareasCustom,   setTareasCustom]   = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [ganttMode,      setGanttMode]      = useState("activos");
  const [libroMode,      setLibroMode]      = useState("activos");
  const [showAddTask,    setShowAddTask]    = useState(false);
  const [showAddCultivo, setShowAddCultivo] = useState(false);
  const [editTask,       setEditTask]       = useState(null);
  const [hoveredTask,    setHoveredTask]    = useState(null);
  const [year,           setYear]           = useState(new Date().getFullYear());
  const [newTask, setNewTask] = useState({ cultivoId:"", tipo:"sembrar", label:"Sembrar", fecha:"", comentario:"", nombreCustom:"" });
  const [recurrente,    setRecurrente]    = useState(null);
  const [fechasExtra,   setFechasExtra]   = useState([""]);
  const [newCult, setNewCult] = useState({ nombre:"", año:new Date().getFullYear(), ubicacion:"", activo:true });
  const [sortOrder,  setSortOrder]  = useState("none"); // "none" | "az" | "za"
  const [ganttScale, setGanttScale] = useState(getGanttScale);
  const [coloresCustom, setColoresCustom] = useState({}); // { tipoId: "#hexcolor" }
  useEffect(()=>{
    const fn = ()=>setGanttScale(getGanttScale());
    window.addEventListener("resize", fn);
    return ()=>window.removeEventListener("resize", fn);
  },[]);
  const sc = ganttScale;
  const COL_W    = Math.round(COL_W_BASE    * sc);
  const ROW_H    = Math.round(ROW_H_BASE    * sc);
  const LABEL_W  = Math.round(LABEL_W_BASE  * sc);
  const HEADER_H = Math.round(HEADER_H_BASE * sc);

  // ── Cargar datos de Firebase ──
  useEffect(() => {
    const u1 = onSnapshot(collection(db,"cultivos"), s => {
      setCultivos(s.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db,"tareas"), s => {
      setTareas(s.docs.map(d => ({ id:d.id, ...d.data() })));
    });
    const u3 = onSnapshot(collection(db,"tiposCustom"), s => {
      setTareasCustom(s.docs.map(d => ({ id:d.id, ...d.data() })));
    });
    const u4 = onSnapshot(collection(db,"coloresCustom"), s => {
      const obj = {};
      s.docs.forEach(d => { obj[d.id] = d.data().color; });
      setColoresCustom(obj);
    });
    // Migración: eliminar campo "año" de todos los cultivos existentes
    onSnapshot(collection(db,"cultivos"), snap => {
      snap.docs.forEach(d => {
        if (d.data().año !== undefined) {
          updateDoc(doc(db,"cultivos",d.id), { año: deleteField() });
        }
      });
    }, () => {}); // silencia errores de permisos
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  async function cambiarColor(tipoId, nuevoColor) {
    await setDoc(doc(db,"coloresCustom",tipoId), { color:nuevoColor });
  }

  function getColor(tipo) {
    return coloresCustom[tipo] || null;
  }

  const todosLosTipos = [...TAREAS_SISTEMA, ...tareasCustom];

  function handleTipoChange(tipo) {
    if (tipo === "otro") {
      setNewTask(t => ({ ...t, tipo:"otro", label:"", nombreCustom:"" }));
    } else {
      const info = todosLosTipos.find(t => t.id === tipo);
      setNewTask(t => ({ ...t, tipo, label:info?.label||tipo, nombreCustom:"" }));
    }
  }

  async function addCultivo() {
    if (!newCult.nombre) return;
    const datos = { nombre:newCult.nombre, ubicacion:newCult.ubicacion, activo:newCult.activo };
    if (newCult.sol) datos.sol = newCult.sol;
    if (newCult.riego) datos.riego = newCult.riego;
    if (newCult.texturaSuelo) datos.texturaSuelo = newCult.texturaSuelo;
    if (newCult.profundidadSuelo) datos.profundidadSuelo = newCult.profundidadSuelo;
    await addDoc(collection(db,"cultivos"), datos);
    setNewCult({ nombre:"", ubicacion:"", activo:true });
    setShowAddCultivo(false);
  }
  async function toggleActivo(id, actual) {
    await updateDoc(doc(db,"cultivos",id), { activo:!actual });
  }
  async function deleteCultivo(id) {
    if (!window.confirm("¿Eliminar este cultivo y todas sus tareas?")) return;
    await deleteDoc(doc(db,"cultivos",id));
    const tareasDelCultivo = tareas.filter(t=>t.cultivoId===id);
    for (const t of tareasDelCultivo) await deleteDoc(doc(db,"tareas",t.id));
  }
  async function addTarea() {
    if (!newTask.cultivoId || !newTask.fecha) return;
    let tipoFinal = newTask.tipo;
    let labelFinal = newTask.label;
    if (newTask.tipo === "otro") {
      const nombre = newTask.nombreCustom.trim();
      if (!nombre) return;
      labelFinal = nombre;
      const yaExiste = tareasCustom.find(t => t.label.toLowerCase()===nombre.toLowerCase());
      if (yaExiste) {
        tipoFinal = yaExiste.id;
      } else {
        const { color, light, abrev } = colorParaPersonalizada(nombre);
        const ref = await addDoc(collection(db,"tiposCustom"), { label:nombre, color, light, abrev });
        tipoFinal = ref.id;
      }
    }
    const todasLasFechas = [newTask.fecha];
    if (recurrente === true) {
      fechasExtra.forEach(f => { if (f) todasLasFechas.push(f); });
    }
    for (const fecha of todasLasFechas) {
      await addDoc(collection(db,"tareas"), {
        cultivoId:newTask.cultivoId, tipo:tipoFinal,
        label:labelFinal, fecha, comentario:newTask.comentario,
      });
    }
    setNewTask({ cultivoId:"", tipo:"sembrar", label:"Sembrar", fecha:"", comentario:"", nombreCustom:"" });
    setRecurrente(null);
    setFechasExtra([""]);
    setShowAddTask(false);
  }
  async function saveTarea() {
    const { id, ...data } = editTask;
    await updateDoc(doc(db,"tareas",id), data);
    setEditTask(null);
  }
  async function deleteTarea(id) {
    await deleteDoc(doc(db,"tareas",id));
    setEditTask(null);
  }

  function sortCultivos(arr) {
    if (sortOrder==="az") return [...arr].sort((a,b)=>a.nombre.localeCompare(b.nombre));
    if (sortOrder==="za") return [...arr].sort((a,b)=>b.nombre.localeCompare(a.nombre));
    return arr;
  }
  const cultivosFiltrados = sortCultivos(ganttMode==="activos" ? cultivos.filter(c=>c.activo) : cultivos);
  const cultivosLibro = sortCultivos(libroMode==="activos" ? cultivos.filter(c=>c.activo) : cultivos);

  function monthX(i) { return LABEL_W + i*COL_W; }
  function taskX(fecha) {
    if (!fecha) return LABEL_W;
    const m = parseInt(fecha.slice(5,7),10)-1;
    return monthX(m) + COL_W/2;
  }
  function tareasDe(cId) {
    return tareas.filter(t=>t.cultivoId===cId && t.fecha?.startsWith(String(year)));
  }

  const svgW = LABEL_W+COL_W*12+2;
  const svgH = HEADER_H+ROW_H*Math.max(1,cultivosFiltrados.length)+2;
  const todayX = (() => {
    const t = new Date();
    const mm = String(t.getMonth()+1).padStart(2,"0");
    return t.getFullYear()===year ? taskX(`${year}-${mm}`) : null;
  })();

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex",
      alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:48 }}>🌱</div>
      <div style={{ fontSize:16, color:C.textSub, fontFamily:"Georgia,serif" }}>
        Cargando tu huerta...
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg,
      fontFamily:"'Georgia','Palatino Linotype',serif", color:C.textMain }}>

      {/* HEADER */}
      <header style={{ background:C.bgHeader, borderBottom:`3px solid ${C.borderDark}`,
        padding:"0 28px", display:"flex", alignItems:"center",
        justifyContent:"space-between", height:64,
        boxShadow:"0 3px 12px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:30 }}>🌿</span>
          <div>
            <div style={{ fontSize:20, fontWeight:"bold", color:C.textHead,
              letterSpacing:"0.5px" }}>Libro de Huerta</div>
            <div style={{ fontSize:10, color:"#C9C2E0", letterSpacing:"3px",
              textTransform:"uppercase", fontFamily:"Arial,sans-serif" }}>
              Planificador Anual
            </div>
          </div>
        </div>
        <nav style={{ display:"flex", gap:8 }}>
          {[["gantt","📊 Gantt"],["libro","📖 Cultivos"]].map(([v,lbl])=>(
            <button key={v} onClick={()=>setView(v)} style={{
              padding:"8px 22px", borderRadius:6,
              border:view===v?"none":`1px solid ${C.borderDark}`,
              background:view===v?"#9B8FBB":"transparent",
              color:view===v?C.bgHeader:C.textHead,
              cursor:"pointer", fontSize:13, fontWeight:"bold",
              fontFamily:"Georgia,serif",
            }}>{lbl}</button>
          ))}
        </nav>
      </header>

      <main style={{ padding:"22px 28px" }}>

        {/* ════ GANTT ════ */}
        {view==="gantt" && (
          <div>
            <div style={{ display:"flex", alignItems:"center",
              justifyContent:"space-between", marginBottom:16,
              flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ display:"flex", background:C.bgCard,
                  border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" }}>
                  {["activos","todos"].map(m=>(
                    <button key={m} onClick={()=>setGanttMode(m)} style={{
                      padding:"7px 16px", border:"none",
                      background:ganttMode===m?C.bgHeader:"transparent",
                      color:ganttMode===m?C.textHead:C.textSub,
                      cursor:"pointer", fontSize:12,
                      fontWeight:ganttMode===m?"bold":"normal",
                      fontFamily:"Georgia,serif",
                    }}>{m==="activos"?"Solo activos":"Todos"}</button>
                  ))}
                </div>
                <div style={{ display:"flex", background:C.bgCard,
                  border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" }}>
                  {[["none","A·Z"],["az","A→Z"],["za","Z→A"]].map(([val,lbl])=>(
                    <button key={val} onClick={()=>setSortOrder(val)} style={{
                      padding:"7px 12px", border:"none",
                      background:sortOrder===val?C.bgHeader:"transparent",
                      color:sortOrder===val?C.textHead:C.textSub,
                      cursor:"pointer", fontSize:11,
                      fontWeight:sortOrder===val?"bold":"normal",
                      fontFamily:"Arial,sans-serif",
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>
              <button onClick={()=>setShowAddTask(true)} style={btnPrimary}>
                + Nueva Tarea
              </button>
            </div>

            {/* Leyenda */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
              {todosLosTipos.map(t=>{
                const colorActual = coloresCustom[t.id] || t.color;
                return (
                  <div key={t.id} style={{
                    display:"flex", alignItems:"center", gap:0,
                    background:colorActual, border:`1px solid ${colorActual}`,
                    borderRadius:20, overflow:"hidden" }}>
                    <span style={{ fontSize:11, color:"white", fontWeight:"bold",
                      fontFamily:"Arial,sans-serif", padding:"3px 8px 3px 10px" }}>{t.label}</span>
                    <label title="Cambiar color" style={{
                      display:"flex", alignItems:"center", justifyContent:"center",
                      padding:"0 6px 0 2px", cursor:"pointer", opacity:0.85,
                      fontSize:13, color:"white", letterSpacing:1 }}>
                      ···
                      <input type="color" value={colorActual}
                        onChange={e=>cambiarColor(t.id,e.target.value)}
                        style={{ width:0, height:0, padding:0, border:"none",
                          opacity:0, position:"absolute" }} />
                    </label>
                  </div>
                );
              })}
            </div>

            {/* SVG Gantt — cabecera muestra solo mes, sin año */}
            <div style={{ borderRadius:8, border:`2px solid ${C.borderDark}`,
              overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.12)",
              overflowX:"auto", background:C.bgGantt }}>
              <svg width={svgW} height={svgH} style={{ display:"block" }}>
                <rect width={svgW} height={svgH} fill={C.bgGantt} />
                {MONTHS.map((_,i)=>(
                  <rect key={i} x={monthX(i)} y={0} width={COL_W} height={svgH}
                    fill={i%2===0?C.bgRow1:"#EAE5F5"} />
                ))}
                <rect x={0} y={0} width={LABEL_W} height={svgH} fill={C.bgLabel1} />
                <line x1={LABEL_W-.5} y1={0} x2={LABEL_W-.5} y2={svgH}
                  stroke={C.borderDark} strokeWidth={2} />
                <rect x={0} y={0} width={svgW} height={HEADER_H} fill={C.bgMonthH} />
                <rect x={0} y={0} width={LABEL_W} height={HEADER_H} fill={C.bgMonthH} />
                <line x1={0} y1={HEADER_H} x2={svgW} y2={HEADER_H}
                  stroke={C.borderDark} strokeWidth={2} />
                {MONTHS.map((m,i)=>(
                  <g key={i}>
                    <line x1={monthX(i)} y1={0} x2={monthX(i)} y2={svgH}
                      stroke={C.border} strokeWidth={1} />
                    {/* Solo mes, sin año */}
                    <text x={monthX(i)+COL_W/2} y={HEADER_H/2+6}
                      textAnchor="middle" fill={C.monthText}
                      fontSize={Math.round(13*sc)} fontWeight="bold" fontFamily="Georgia,serif">{m}</text>
                  </g>
                ))}
                <line x1={monthX(12)} y1={0} x2={monthX(12)} y2={svgH}
                  stroke={C.border} strokeWidth={1} />

                {cultivosFiltrados.map((c,rowIdx)=>{
                  const y0=HEADER_H+rowIdx*ROW_H;
                  const isEven=rowIdx%2===0;
                  return (
                    <g key={c.id}>
                      <rect x={LABEL_W} y={y0} width={svgW-LABEL_W} height={ROW_H}
                        fill={isEven?C.bgRow1:C.bgRow2} />
                      <rect x={0} y={y0} width={LABEL_W} height={ROW_H}
                        fill={isEven?C.bgLabel1:C.bgLabel2} />
                      <line x1={0} y1={y0+ROW_H} x2={svgW} y2={y0+ROW_H}
                        stroke={C.border} strokeWidth={1} />
                      <rect x={0} y={y0+6} width={3} height={ROW_H-12} rx={1.5}
                        fill={c.activo?C.accent:C.textMuted} />
                      <text x={10} y={y0+ROW_H/2+5}
                        fill={c.activo?C.textMain:C.textMuted}
                        fontSize={Math.round(12*sc)} fontWeight="bold" fontFamily="Georgia,serif"
                        fontStyle={c.activo?"normal":"italic"}>{c.nombre}</text>

                      {/* AGRUPADO POR MES - barras divididas */}
                      {(()=>{
                        // ── Lógica de barras: fusión + apilado vertical ──
                        const todasTareas = tareasDe(c.id);

                        // 1. Agrupar por tipo para detectar meses consecutivos
                        const porTipo = {};
                        todasTareas.forEach(t => {
                          const m = parseInt(t.fecha?.slice(5,7)||"1",10)-1;
                          if (!porTipo[t.tipo]) porTipo[t.tipo] = [];
                          porTipo[t.tipo].push({ ...t, m });
                        });

                        // 2. Para cada tipo, encontrar grupos de meses consecutivos
                        const segmentos = []; // { tipo, label, meses:[{m,tarea}], mInicio, mFin }
                        Object.entries(porTipo).forEach(([tipo, items]) => {
                          const sorted = [...items].sort((a,b)=>a.m-b.m);
                          let grupo = [sorted[0]];
                          for (let i=1; i<sorted.length; i++) {
                            if (sorted[i].m === grupo[grupo.length-1].m+1) {
                              grupo.push(sorted[i]);
                            } else {
                              segmentos.push({ tipo, meses:grupo, mInicio:grupo[0].m, mFin:grupo[grupo.length-1].m });
                              grupo = [sorted[i]];
                            }
                          }
                          segmentos.push({ tipo, meses:grupo, mInicio:grupo[0].m, mFin:grupo[grupo.length-1].m });
                        });

                        // 3. Para cada mes, contar cuántos segmentos distintos pasan por él
                        // (para calcular el alto de cada barra apilada)
                        const segPorMes = {}; // mes -> [segmentos]
                        segmentos.forEach(seg => {
                          for (let m=seg.mInicio; m<=seg.mFin; m++) {
                            if (!segPorMes[m]) segPorMes[m] = [];
                            segPorMes[m].push(seg);
                          }
                        });

                        // 4. Dibujar cada segmento
                        const barHBase = Math.round(ROW_H*0.55);
                        const cy = y0+ROW_H/2;
                        const R = 3;

                        return segmentos.map((seg, segIdx) => {
                          const info = getTipoInfo(seg.tipo, seg.meses[0].label, tareasCustom, coloresCustom);
                          // La barra arranca en el inicio del mes mInicio y termina al final del mFin
                          const barX = monthX(seg.mInicio)+4;
                          const barW = (seg.mFin - seg.mInicio + 1) * COL_W - 8;

                          // Calcular posición vertical: ¿cuántas barras hay en cada mes de este segmento?
                          // Usamos el máximo de barras en cualquier mes del segmento para decidir altura
                          let maxStack = 1;
                          let stackIdx = 0;
                          for (let m=seg.mInicio; m<=seg.mFin; m++) {
                            const segsEnMes = segPorMes[m] || [];
                            maxStack = Math.max(maxStack, segsEnMes.length);
                            // El índice de este segmento en el mes mInicio define su posición vertical
                            if (m === seg.mInicio) {
                              stackIdx = segsEnMes.indexOf(seg);
                            }
                          }

                          // Altura de barra según cuántas se apilan
                          const barH = maxStack > 1 ? Math.round(barHBase / maxStack * 0.9) : barHBase;
                          const gap = maxStack > 1 ? 2 : 0;
                          const totalH = maxStack * barH + (maxStack-1) * gap;
                          const barY = cy - totalH/2 + stackIdx*(barH+gap);

                          // Clippath único por segmento
                          const clipId = `cl-${c.id}-${segIdx}`;
                          // Tarea representativa (primera del segmento, para tooltip y click)
                          const tareaRep = seg.meses[0];
                          const isHov = hoveredTask === `seg-${c.id}-${segIdx}`;
                          const txSec = barX + barW/2;

                          return (
                            <g key={`seg${segIdx}`}>
                              <defs><clipPath id={clipId}><rect x={barX} y={barY} width={barW} height={barH} rx={R}/></clipPath></defs>
                              <rect x={barX+1} y={barY+2} width={barW} height={barH} rx={R} fill="rgba(0,0,0,0.08)"/>
                              <rect x={barX} y={barY} width={barW} height={barH} rx={R}
                                fill={info.color} opacity={isHov?1:0.88}/>
                              {tareaRep.comentario&&<g>
                                <polygon points={`${barX+barW-10},${barY} ${barX+barW},${barY} ${barX+barW},${barY+10}`} fill="#e67e22"/>
                                <polygon points={`${barX+barW-10},${barY} ${barX+barW},${barY+10} ${barX+barW-10},${barY+10}`} fill="rgba(0,0,0,0.15)"/>
                                <line x1={barX+barW-10} y1={barY} x2={barX+barW} y2={barY+10} stroke="white" strokeWidth={0.8} opacity={0.6}/>
                              </g>}
                              <rect x={barX} y={barY} width={barW} height={barH} fill="transparent"
                                style={{cursor:"pointer"}}
                                onMouseEnter={()=>setHoveredTask(`seg-${c.id}-${segIdx}`)}
                                onMouseLeave={()=>setHoveredTask(null)}
                                onClick={()=>setEditTask({...tareaRep})}/>
                              {isHov&&(()=>{
                                const tipW=200,tipH=58;
                                const tipX=Math.min(Math.max(txSec-tipW/2,LABEL_W+4),svgW-tipW-6);
                                const tipY=Math.max(6,barY-tipH-14);
                                const tailX=Math.min(Math.max(txSec,tipX+20),tipX+tipW-20);
                                // Label de rango si hay varios meses
                                const rangoLabel = seg.meses.length > 1
                                  ? `${mesLabel(seg.meses[0].fecha)} – ${mesLabel(seg.meses[seg.meses.length-1].fecha)}`
                                  : mesLabel(tareaRep.fecha);
                                return (
                                  <g style={{pointerEvents:"none"}}>
                                    <rect x={tipX+3} y={tipY+3} width={tipW} height={tipH} rx={14} fill="rgba(0,0,0,0.10)"/>
                                    <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={14} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5}/>
                                    <circle cx={tipX+22} cy={tipY} r={9} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5}/>
                                    <circle cx={tipX+44} cy={tipY-6} r={11} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5}/>
                                    <circle cx={tipX+68} cy={tipY-9} r={12} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5}/>
                                    <circle cx={tipX+94} cy={tipY-7} r={11} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5}/>
                                    <circle cx={tipX+118} cy={tipY-4} r={10} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5}/>
                                    <rect x={tipX+1} y={tipY+1} width={tipW-2} height={16} fill="#FAF8FE"/>
                                    <polygon points={`${tailX-8},${tipY+tipH} ${tailX+8},${tipY+tipH} ${tailX},${tipY+tipH+12}`} fill="#FAF8FE" stroke={info.color} strokeWidth={1.5} strokeLinejoin="round"/>
                                    <rect x={tailX-7} y={tipY+tipH-2} width={14} height={5} fill="#FAF8FE"/>
                                    <rect x={tipX+1} y={tipY+1} width={tipW-2} height={8} rx={13} fill={info.color} opacity={0.15}/>
                                    <text x={tipX+12} y={tipY+20} fill={info.color} fontSize={11} fontWeight="bold" fontFamily="Georgia,serif">{tareaRep.label||info.label}</text>
                                    <text x={tipX+tipW-12} y={tipY+20} fill={C.textSub} fontSize={10} fontFamily="Arial,sans-serif" textAnchor="end">{rangoLabel}</text>
                                    <line x1={tipX+10} y1={tipY+28} x2={tipX+tipW-10} y2={tipY+28} stroke={C.border} strokeWidth={1}/>
                                    <text x={tipX+12} y={tipY+44} fill={tareaRep.comentario?C.textSub:C.textMuted} fontSize={10} fontFamily="Arial,sans-serif" fontStyle={tareaRep.comentario?"normal":"italic"}>
                                      {tareaRep.comentario?tareaRep.comentario.slice(0,34)+(tareaRep.comentario.length>34?"…":""):"Sin comentario · clic para editar"}
                                    </text>
                                  </g>
                                );
                              })()}
                            </g>
                          );
                        });
                      })()}

                    </g>
                  );
                })}

                {todayX&&(
                  <g style={{ pointerEvents:"none" }}>
                    <line x1={todayX} y1={HEADER_H} x2={todayX} y2={svgH}
                      stroke={C.today} strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />
                    <rect x={todayX-20} y={svgH-22} width={40} height={20} rx={4} fill={C.today} />
                    <text x={todayX} y={svgH-8} textAnchor="middle"
                      fill="white" fontSize={9} fontWeight="bold"
                      fontFamily="Arial,sans-serif">HOY</text>
                  </g>
                )}
              </svg>
            </div>

            {cultivosFiltrados.length===0&&(
              <div style={{ textAlign:"center", padding:52, color:C.textMuted,
                fontSize:15, fontStyle:"italic" }}>
                No hay cultivos para mostrar.<br/>
                <span style={{ color:C.accent, fontStyle:"normal", fontWeight:"bold" }}>
                  📖 Ve a Cultivos
                </span> y agrega uno.
              </div>
            )}
          </div>
        )}

        {/* ════ LIBRO ════ */}
        {view==="libro"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <h2 style={{ margin:0, color:C.textMain, fontSize:20, fontWeight:"bold" }}>
                  📖 Mis Cultivos
                </h2>
                <div style={{ display:"flex", background:C.bgCard,
                  border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" }}>
                  {["activos","todos"].map(m=>(
                    <button key={m} onClick={()=>setLibroMode(m)} style={{
                      padding:"6px 14px", border:"none",
                      background:libroMode===m?C.bgHeader:"transparent",
                      color:libroMode===m?C.textHead:C.textSub,
                      cursor:"pointer", fontSize:12,
                      fontWeight:libroMode===m?"bold":"normal",
                      fontFamily:"Georgia,serif",
                    }}>{m==="activos"?"Solo activos":"Todos"}</button>
                  ))}
                </div>
                <div style={{ display:"flex", background:C.bgCard,
                  border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" }}>
                  {[["none","A·Z"],["az","A→Z"],["za","Z→A"]].map(([val,lbl])=>(
                    <button key={val} onClick={()=>setSortOrder(val)} style={{
                      padding:"6px 10px", border:"none",
                      background:sortOrder===val?C.bgHeader:"transparent",
                      color:sortOrder===val?C.textHead:C.textSub,
                      cursor:"pointer", fontSize:11,
                      fontWeight:sortOrder===val?"bold":"normal",
                      fontFamily:"Arial,sans-serif",
                    }}>{lbl}</button>
                  ))}
                </div>
              </div>
              <button onClick={()=>setShowAddCultivo(true)} style={btnPrimary}>
                + Nuevo Cultivo
              </button>
            </div>
            <div style={{ display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
              {cultivosLibro.map(c=>{
                const tareasC=tareas.filter(t=>t.cultivoId===c.id);
                return (
                  <div key={c.id} style={{ background:C.bgCard,
                    border:`1px solid ${C.border}`,
                    borderLeft:`4px solid ${c.activo?C.accent:C.textMuted}`,
                    borderRadius:8, padding:20,
                    opacity:c.activo?1:0.7,
                    boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between",
                      alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontSize:17, fontWeight:"bold", color:C.textMain }}>
                          {c.nombre}
                        </div>
                        {c.ubicacion&&(
                          <div style={{ fontSize:12, color:C.textSub, marginTop:3,
                            fontFamily:"Arial,sans-serif" }}>
                            📍 {c.ubicacion}
                          </div>
                        )}
                      </div>
                      <button onClick={()=>toggleActivo(c.id,c.activo)} style={{
                        padding:"4px 12px", borderRadius:20,
                        border:`1.5px solid ${c.activo?C.accent:C.border}`,
                        background:c.activo?"#e8f5e2":"transparent",
                        color:c.activo?C.accent:C.textMuted,
                        cursor:"pointer", fontSize:11, fontWeight:"bold",
                        fontFamily:"Arial,sans-serif" }}>
                        {c.activo?"✓ Activo":"Inactivo"}
                      </button>
                    </div>

                    {/* Antecedentes */}
                    {(c.sol||c.riego||c.texturaSuelo||c.profundidadSuelo)&&(
                      <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:5 }}>
                        {c.sol&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                          background:"#fef9c3", color:"#92660a", fontFamily:"Arial,sans-serif",
                          border:"1px solid #fde68a" }}>☀️ {c.sol}</span>}
                        {c.riego&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                          background:"#eff6ff", color:"#1d4ed8", fontFamily:"Arial,sans-serif",
                          border:"1px solid #bfdbfe" }}>💧 {c.riego}</span>}
                        {c.texturaSuelo&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                          background:"#f5f0e8", color:"#7c5c2e", fontFamily:"Arial,sans-serif",
                          border:"1px solid #e5d5b5" }}>🪨 {c.texturaSuelo}</span>}
                        {c.profundidadSuelo&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
                          background:"#f0fdf4", color:"#15803d", fontFamily:"Arial,sans-serif",
                          border:"1px solid #bbf7d0" }}>📏 {c.profundidadSuelo}</span>}
                      </div>
                    )}

                    <div style={{ marginTop:14, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
                      {tareasC.length===0
                        ? <div style={{ fontSize:12, color:C.textMuted, fontStyle:"italic", fontFamily:"Arial,sans-serif" }}>Sin tareas registradas</div>
                        : (()=>{
                            const grupos={};
                            tareasC.forEach(t=>{
                              const info=getTipoInfo(t.tipo,t.label,tareasCustom,coloresCustom);
                              const key=t.tipo+"|"+(t.label||info.label);
                              if(!grupos[key]) grupos[key]={ info, label:t.label||info.label, tareas:[] };
                              grupos[key].tareas.push(t);
                            });
                            return Object.values(grupos).map((g,gi)=>{
                              // Ordenar tareas por mes
                              const tareasOrdenadas=[...g.tareas].sort((a,b)=>{
                                const ma=parseInt(a.fecha?.slice(5,7)||"1",10);
                                const mb=parseInt(b.fecha?.slice(5,7)||"1",10);
                                return ma-mb;
                              });
                              // Comentarios únicos (no vacíos)
                              const comentarios=tareasOrdenadas
                                .filter(t=>t.comentario)
                                .map(t=>({ mes:mesLabel(t.fecha), texto:t.comentario }));
                              return (
                                <div key={gi} style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
                                  <div style={{ width:10, height:10, borderRadius:"50%", background:g.info.color, flexShrink:0, marginTop:4 }}/>
                                  <div style={{ flex:1 }}>
                                    <span style={{ fontSize:13, fontWeight:"bold", color:g.info.color, fontFamily:"Georgia,serif" }}>
                                      {g.label}
                                    </span>
                                    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:4 }}>
                                      {tareasOrdenadas.map((t,mi)=>(
                                        <span key={mi} onClick={()=>setEditTask({...t})}
                                          style={{ fontSize:11, padding:"2px 9px", borderRadius:12,
                                            background:g.info.color+"18", color:g.info.color,
                                            border:`1px solid ${g.info.color}44`,
                                            cursor:"pointer", fontFamily:"Arial,sans-serif", fontWeight:"bold" }}>
                                          {mesLabel(t.fecha)}
                                        </span>
                                      ))}
                                    </div>
                                    {comentarios.length>0&&(
                                      <div style={{ marginTop:5, display:"flex", flexDirection:"column", gap:2 }}>
                                        {comentarios.map((c,ci)=>(
                                          <div key={ci} style={{ fontSize:11, color:g.info.color,
                                            fontFamily:"Arial,sans-serif", fontStyle:"italic",
                                            opacity:0.85 }}>
                                            <span style={{ fontWeight:"bold", fontStyle:"normal" }}>{c.mes}:</span> {c.texto}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()
                      }
                    </div>
                    <button onClick={()=>{
                      setNewTask(t=>({...t,cultivoId:c.id}));
                      setShowAddTask(true);
                    }} style={{ marginTop:14, width:"100%", padding:"8px",
                      borderRadius:6, border:`1px dashed ${C.border}`,
                      background:"transparent", color:C.textSub,
                      cursor:"pointer", fontSize:12, fontFamily:"Arial,sans-serif" }}>
                      + Agregar tarea
                    </button>
                    <button onClick={()=>deleteCultivo(c.id)} style={{
                      marginTop:6, width:"100%", padding:"7px",
                      borderRadius:6, border:`1px solid #b91c1c33`,
                      background:"transparent", color:"#b91c1c",
                      cursor:"pointer", fontSize:11, fontFamily:"Arial,sans-serif" }}>
                      🗑 Eliminar cultivo
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ════ MODALES ════ */}
      {editTask&&(
        <Modal title="✏️  Editar Tarea" onClose={()=>setEditTask(null)}>
          <Campo label="Tipo de tarea">
            <select value={editTask.tipo}
              onChange={e=>{
                const info=todosLosTipos.find(t=>t.id===e.target.value);
                setEditTask({...editTask,tipo:e.target.value,label:info?.label||editTask.label});
              }} style={sel}>
              {todosLosTipos.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Campo>
          <Campo label="Mes">
            <select value={editTask.fecha}
              onChange={e=>setEditTask({...editTask,fecha:e.target.value})} style={sel}>
              <option value="">— Selecciona un mes —</option>
              {MONTHS_FULL.map((m,i)=>{
                const mm=String(i+1).padStart(2,"0");
                const añoTarea=editTask.fecha?.slice(0,4)||String(year);
                const val=`${añoTarea}-${mm}`;
                return <option key={i} value={val}>{m}</option>;
              })}
            </select>
          </Campo>
          <Campo label="Comentario / Observación">
            <textarea value={editTask.comentario}
              onChange={e=>setEditTask({...editTask,comentario:e.target.value})}
              style={{...inp,height:85,resize:"vertical"}}
              placeholder="Ej: Aparecieron pulgones, lluvia abundante..." />
          </Campo>
          <div style={{ display:"flex", gap:8, justifyContent:"space-between" }}>
            <button onClick={()=>deleteTarea(editTask.id)} style={btnDanger}>🗑 Eliminar</button>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setEditTask(null)} style={btnCancel}>Cancelar</button>
              <button onClick={saveTarea} style={btnPrimary}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {showAddTask&&(()=>{
        const cultivoActual = cultivos.find(c=>c.id===newTask.cultivoId);
        const tareasDelCultivo = newTask.cultivoId
          ? tareas.filter(t=>t.cultivoId===newTask.cultivoId)
              .sort((a,b)=>a.fecha>b.fecha?1:-1)
          : [];
        const tituloModal = cultivoActual
          ? `🌱 Nueva Tarea · ${cultivoActual.nombre}`
          : "🌱 Nueva Tarea";
        return (
          <Modal title={tituloModal} onClose={()=>{
            setShowAddTask(false); setRecurrente(null); setFechasExtra([""]);
          }}>
            <Campo label="Cultivo">
              <select value={newTask.cultivoId}
                onChange={e=>{ setNewTask({...newTask,cultivoId:e.target.value}); setRecurrente(null); setFechasExtra([""]); }} style={sel}>
                <option value="">— Selecciona un cultivo —</option>
                {cultivos.map(c=><option key={c.id} value={c.id}>{c.nombre} ({c.año})</option>)}
              </select>
            </Campo>

            {tareasDelCultivo.length>0&&(
              <div style={{ marginBottom:14, background:"#EDE9F5",
                border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:C.textMuted, fontWeight:"bold",
                  letterSpacing:"1px", textTransform:"uppercase",
                  fontFamily:"Arial,sans-serif", marginBottom:8 }}>
                  Tareas ya programadas para este cultivo
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:130, overflowY:"auto" }}>
                  {tareasDelCultivo.map(t=>{
                    const info=getTipoInfo(t.tipo,t.label,tareasCustom,coloresCustom);
                    return (
                      <div key={t.id} style={{ display:"flex", alignItems:"center",
                        gap:8, fontSize:12, fontFamily:"Arial,sans-serif" }}>
                        <div style={{ width:8, height:8, borderRadius:"50%",
                          background:info.color, flexShrink:0 }} />
                        <span style={{ color:info.color, fontWeight:"bold", minWidth:80 }}>
                          {t.label||info.label}
                        </span>
                        <span style={{ color:C.textMuted }}>
                          {mesLabel(t.fecha)}
                        </span>
                        {t.comentario&&<span style={{ color:C.textMuted, fontStyle:"italic",
                          fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          — {t.comentario}
                        </span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Campo label="Tipo de tarea">
              <select value={newTask.tipo} onChange={e=>handleTipoChange(e.target.value)} style={sel}>
                {todosLosTipos.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                <option value="otro">➕ Otra tarea (nueva)...</option>
              </select>
            </Campo>
            {newTask.tipo==="otro"&&(
              <Campo label="Nombre de la nueva tarea">
                <input value={newTask.nombreCustom}
                  onChange={e=>setNewTask({...newTask,nombreCustom:e.target.value})}
                  style={{...inp,borderColor:"#7B5EA7",borderWidth:2}}
                  placeholder="Ej: Preparar compost, Instalar riego..." />
                <span style={{ fontSize:11, color:C.textSub, fontFamily:"Arial,sans-serif", marginTop:3 }}>
                  💡 Quedará guardada en tu lista para usarla de nuevo
                </span>
              </Campo>
            )}

            <Campo label="Mes">
              <select value={newTask.fecha}
                onChange={e=>{ setNewTask({...newTask,fecha:e.target.value}); setRecurrente(null); setFechasExtra([""]); }} style={sel}>
                <option value="">— Selecciona un mes —</option>
                {MONTHS_FULL.map((m,i)=>{
                  const mm = String(i+1).padStart(2,"0");
                  const val = `${year}-${mm}`;
                  return <option key={i} value={val}>{m}</option>;
                })}
              </select>
            </Campo>

            <Campo label="Comentario (opcional)">
              <textarea value={newTask.comentario}
                onChange={e=>setNewTask({...newTask,comentario:e.target.value})}
                style={{...inp,height:60,resize:"vertical"}}
                placeholder="Notas sobre esta tarea..." />
            </Campo>

            {newTask.fecha&&(
              <div style={{ background:"#EDE9F5", border:`1px solid ${C.border}`,
                borderRadius:8, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:13, color:C.textMain, fontWeight:"bold",
                  fontFamily:"Georgia,serif", marginBottom:10 }}>
                  ¿Es una tarea recurrente?
                </div>
                <div style={{ display:"flex", gap:8, marginBottom: recurrente===true ? 12 : 0 }}>
                  {[["no",false,"No, solo esta vez"],["si",true,"Sí, se repite"]].map(([k,val,lbl])=>(
                    <button key={k} onClick={()=>{ setRecurrente(val); if(!val) setFechasExtra([""]); }}
                      style={{ flex:1, padding:"8px", borderRadius:6,
                        border:`1.5px solid ${recurrente===val ? C.borderDark : C.border}`,
                        background: recurrente===val ? C.bgHeader : "white",
                        color: recurrente===val ? C.textHead : C.textSub,
                        cursor:"pointer", fontSize:12, fontWeight:"bold",
                        fontFamily:"Arial,sans-serif" }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {recurrente===true&&(
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:4 }}>
                    <div style={{ fontSize:11, color:C.textMuted, fontFamily:"Arial,sans-serif" }}>
                      Agrega las fechas en que se repite:
                    </div>
                    {fechasExtra.map((f,i)=>(
                      <div key={i} style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <select value={f}
                          onChange={e=>{
                            const arr=[...fechasExtra];
                            arr[i]=e.target.value;
                            setFechasExtra(arr);
                          }} style={{...sel, marginBottom:0, flex:1}}>
                          <option value="">— Mes —</option>
                          {MONTHS_FULL.map((m,j)=>{
                            const mm=String(j+1).padStart(2,"0");
                            const val=`${year}-${mm}`;
                            return <option key={j} value={val}>{m}</option>;
                          })}
                        </select>
                        {fechasExtra.length>1&&(
                          <button onClick={()=>setFechasExtra(fechasExtra.filter((_,j)=>j!==i))}
                            style={{ padding:"6px 10px", borderRadius:6,
                              border:`1px solid #b91c1c33`, background:"#fee2e2",
                              color:"#b91c1c", cursor:"pointer", fontSize:13 }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={()=>setFechasExtra([...fechasExtra,""])}
                      style={{ alignSelf:"flex-start", padding:"6px 16px",
                        borderRadius:6, border:`1.5px dashed ${C.borderDark}`,
                        background:"transparent", color:C.textSub,
                        cursor:"pointer", fontSize:13, fontWeight:"bold",
                        fontFamily:"Georgia,serif" }}>
                      + Agregar otra fecha
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>{ setShowAddTask(false); setRecurrente(null); setFechasExtra([""]); }}
                style={btnCancel}>Cancelar</button>
              <button onClick={addTarea}
                disabled={!newTask.fecha || !newTask.cultivoId || recurrente===null}
                style={{...btnPrimary,
                  opacity:(!newTask.fecha||!newTask.cultivoId||recurrente===null)?0.45:1,
                  cursor:(!newTask.fecha||!newTask.cultivoId||recurrente===null)?"not-allowed":"pointer"
                }}>
                Grabar Tarea{recurrente===true&&fechasExtra.filter(f=>f).length>0
                  ? ` (${1+fechasExtra.filter(f=>f).length})`
                  : ""}
              </button>
            </div>
          </Modal>
        );
      })()}

      {showAddCultivo&&(
        <Modal title="🪴  Nuevo Cultivo" onClose={()=>setShowAddCultivo(false)}>
          <Campo label="Nombre del cultivo">
            <input value={newCult.nombre}
              onChange={e=>setNewCult({...newCult,nombre:e.target.value})}
              style={inp} placeholder="Ej: Tomates, Arvejas..." />
          </Campo>
          <Campo label="Ubicación (opcional)">
            <input value={newCult.ubicacion}
              onChange={e=>setNewCult({...newCult,ubicacion:e.target.value})}
              style={inp} placeholder="Ej: Cama Norte, Macetero..." />
          </Campo>
          <Campo label="☀️  Exposición al sol">
            <input value={newCult.sol||""} onChange={e=>setNewCult({...newCult,sol:e.target.value})}
              style={inp} placeholder="Ej: Pleno sol, media sombra..." />
          </Campo>
          <Campo label="💧  Frecuencia de riego">
            <input value={newCult.riego||""} onChange={e=>setNewCult({...newCult,riego:e.target.value})}
              style={inp} placeholder="Ej: Cada 2 días, semanal..." />
          </Campo>
          <Campo label="🪨  Textura del suelo">
            <input value={newCult.texturaSuelo||""} onChange={e=>setNewCult({...newCult,texturaSuelo:e.target.value})}
              style={inp} placeholder="Ej: Franco arenoso, arcilloso..." />
          </Campo>
          <Campo label="📏  Profundidad del suelo">
            <input value={newCult.profundidadSuelo||""} onChange={e=>setNewCult({...newCult,profundidadSuelo:e.target.value})}
              style={inp} placeholder="Ej: 30 cm, más de 50 cm..." />
          </Campo>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <input type="checkbox" checked={newCult.activo}
              onChange={e=>setNewCult({...newCult,activo:e.target.checked})}
              id="activo-chk" style={{ width:16, height:16, accentColor:C.accent }} />
            <label htmlFor="activo-chk" style={{ fontSize:13, color:C.textSub,
              fontFamily:"Arial,sans-serif" }}>Cultivo activo</label>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button onClick={()=>setShowAddCultivo(false)} style={btnCancel}>Cancelar</button>
            <button onClick={addCultivo} style={btnPrimary}>Crear Cultivo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── TareaChip con nube ──
function TareaChip({ tarea, info, onClick }) {
  const [hov, setHov] = useState(false);
  const fecha = tarea.fecha ? mesLabel(tarea.fecha) : "";
  return (
    <div style={{ position:"relative", display:"inline-block" }}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div onClick={onClick} style={{
        display:"flex", alignItems:"center", gap:4,
        padding:"5px 11px", borderRadius:20,
        background:info.light, border:`1.5px solid ${hov?info.color:info.color+"99"}`,
        cursor:"pointer", fontSize:11, color:info.color, fontWeight:"bold",
        fontFamily:"Arial,sans-serif",
        boxShadow:hov?`0 2px 8px ${info.color}33`:"0 1px 3px rgba(0,0,0,0.08)",
        transition:"all .15s", userSelect:"none",
      }}>
        <span style={{ fontWeight:"bold", letterSpacing:".5px" }}>
          {info.abrev||(tarea.label||"").slice(0,3).toUpperCase()}
        </span>
        <span style={{ color:info.color+"cc", fontWeight:"normal" }}>{fecha}</span>
        {tarea.comentario&&(
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#e67e22",
            display:"inline-block", marginLeft:1, border:"1.5px solid white" }} />
        )}
      </div>
      {hov&&(
        <div style={{ position:"absolute", bottom:"calc(100% + 14px)", left:"50%",
          transform:"translateX(-50%)", zIndex:200, pointerEvents:"none",
          minWidth:180, maxWidth:240,
          filter:"drop-shadow(0 3px 8px rgba(0,0,0,0.18))" }}>
          <svg width="220" height="80" viewBox="0 0 220 80"
            xmlns="http://www.w3.org/2000/svg" style={{ overflow:"visible", display:"block" }}>
            <rect x="4" y="18" width="212" height="54" rx="14"
              fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <circle cx="30"  cy="18" r="10" fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <circle cx="54"  cy="10" r="13" fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <circle cx="82"  cy="6"  r="15" fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <circle cx="112" cy="8"  r="13" fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <circle cx="138" cy="12" r="11" fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <circle cx="162" cy="16" r="9"  fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" />
            <rect x="5" y="19" width="210" height="14" fill="#FAF8FE" />
            <polygon points="102,72 118,72 110,82"
              fill="#FAF8FE" stroke={info.color} strokeWidth="1.5" strokeLinejoin="round" />
            <rect x="103" y="70" width="14" height="5" fill="#FAF8FE" />
            <rect x="5" y="19" width="210" height="10" rx="12" fill={info.color} opacity="0.12" />
            <text x="14" y="38" fill={info.color} fontSize="12" fontWeight="bold" fontFamily="Georgia,serif">
              {tarea.label||info.label}
            </text>
            <text x="206" y="38" fill="#7B6FA0" fontSize="10" fontFamily="Arial,sans-serif" textAnchor="end">
              {mesLabel(tarea.fecha)}
            </text>
            <line x1="14" y1="46" x2="206" y2="46" stroke="#C9C2E0" strokeWidth="1" />
            <text x="14" y="62"
              fill={tarea.comentario?"#7B6FA0":"#A99DC8"}
              fontSize="10" fontFamily="Arial,sans-serif"
              fontStyle={tarea.comentario?"normal":"italic"}>
              {tarea.comentario
                ?tarea.comentario.slice(0,32)+(tarea.comentario.length>32?"…":"")
                :"Sin comentario"}
            </text>
          </svg>
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(30,20,60,0.55)",
      backdropFilter:"blur(3px)", display:"flex", alignItems:"center",
      justifyContent:"center", zIndex:1000, padding:20 }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#FAF8FE", border:`1.5px solid #C9C2E0`,
        borderRadius:10, padding:28, width:"100%", maxWidth:430,
        maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 8px 40px rgba(0,0,0,0.25)", fontFamily:"Georgia,serif" }}>
        <h3 style={{ margin:"0 0 20px", color:"#2E2248", fontSize:17, fontWeight:"bold" }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:15 }}>
      <span style={{ fontSize:11, color:"#7B6FA0", textTransform:"uppercase",
        letterSpacing:"1px", fontWeight:"bold", fontFamily:"Arial,sans-serif" }}>{label}</span>
      {children}
    </div>
  );
}

const btnNav     = { width:30, height:30, borderRadius:"50%", border:"none",
  background:"transparent", color:"#2E2248", cursor:"pointer", fontSize:13, fontWeight:"bold" };
const btnPrimary = { padding:"9px 22px", borderRadius:6, border:"none",
  background:"#4A3D6B", color:"#F0EDF8", cursor:"pointer", fontSize:13,
  fontWeight:"bold", fontFamily:"Georgia,serif",
  boxShadow:"0 2px 6px rgba(0,0,0,0.2)" };
const btnCancel  = { padding:"9px 16px", borderRadius:6, border:"1px solid #C9C2E0",
  background:"transparent", color:"#7B6FA0", cursor:"pointer", fontSize:13,
  fontFamily:"Arial,sans-serif" };
const btnDanger  = { padding:"9px 16px", borderRadius:6, border:"1.5px solid #b91c1c",
  background:"#fee2e2", color:"#b91c1c", cursor:"pointer", fontSize:13,
  fontWeight:"bold", fontFamily:"Arial,sans-serif" };
const inp = { background:"#FAF8FE", border:"1.5px solid #C9C2E0", borderRadius:6,
  padding:"9px 11px", color:"#2E2248", fontSize:14,
  fontFamily:"Georgia,serif", width:"100%", boxSizing:"border-box" };
const sel = { ...inp, cursor:"pointer" };
