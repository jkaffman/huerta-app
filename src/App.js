import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc
} from "firebase/firestore";

const TAREAS_SISTEMA = [
  { id:"sembrar",     label:"Sembrar",      color:"#2d7a3a", light:"#e8f5e2", abrev:"SEM" },
  { id:"trasplantar", label:"Trasplantar",  color:"#0369a1", light:"#dbeafe", abrev:"TRA" },
  { id:"regar",       label:"Regar",        color:"#1d4ed8", light:"#eff6ff", abrev:"REG" },
  { id:"fertilizar",  label:"Fertilizar",   color:"#92660a", light:"#fef3c7", abrev:"FER" },
  { id:"plagas",      label:"Ctrl. plagas", color:"#b91c1c", light:"#fee2e2", abrev:"PLA" },
  { id:"malezas",     label:"Malezas",      color:"#6b21a8", light:"#f3e8ff", abrev:"MAL" },
  { id:"podar",       label:"Podar",        color:"#c2410c", light:"#ffedd5", abrev:"POD" },
  { id:"cosechar",    label:"Cosechar",     color:"#b45309", light:"#fef3c7", abrev:"COS" },
];

const MONTHS   = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COL_W    = 90;
const ROW_H    = 58;
const LABEL_W  = 170;
const HEADER_H = 42;
const TASK_R   = 16;

const C = {
  bg:"#f5f0e8", bgCard:"#fffdf7", bgHeader:"#3b2f1e",
  bgGantt:"#fdfaf3", bgRow1:"#fdfaf3", bgRow2:"#f7f2e8",
  bgLabel1:"#f0ebe0", bgLabel2:"#e8e3d8", bgMonthH:"#3b2f1e",
  border:"#c8b89a", borderDark:"#8a7055",
  textMain:"#2c1f0e", textSub:"#7a6248", textMuted:"#a89070",
  textHead:"#f5ead8", monthText:"#f5ead8",
  today:"#c2410c", accent:"#5c8a3c",
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

function getTipoInfo(tipo, label, tareasCustom) {
  const sistema = TAREAS_SISTEMA.find(t => t.id === tipo);
  if (sistema) return sistema;
  const custom = tareasCustom.find(t => t.id === tipo);
  if (custom) return custom;
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
  const [recurrente,    setRecurrente]    = useState(null); // null=sin respuesta, false=no, true=si
  const [fechasExtra,   setFechasExtra]   = useState([""]);  // fechas adicionales si es recurrente
  const [newCult, setNewCult] = useState({ nombre:"", año:new Date().getFullYear(), ubicacion:"", activo:true });

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
    return () => { u1(); u2(); u3(); };
  }, []);

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
    await addDoc(collection(db,"cultivos"), { ...newCult, año:Number(newCult.año) });
    setNewCult({ nombre:"", año:new Date().getFullYear(), ubicacion:"", activo:true });
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
    // Guardar fecha principal
    const todasLasFechas = [newTask.fecha];
    // Si es recurrente, agregar fechas extra válidas
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

  const cultivosFiltrados = ganttMode==="activos" ? cultivos.filter(c=>c.activo) : cultivos;
  const cultivosLibro = libroMode==="activos" ? cultivos.filter(c=>c.activo) : cultivos;

  function monthX(i) { return LABEL_W + i*COL_W; }
  function taskX(fecha) {
    const d = new Date(fecha+"T12:00:00");
    const m = d.getMonth(), day = d.getDate();
    const days = new Date(d.getFullYear(),m+1,0).getDate();
    return monthX(m)+(day/days)*COL_W;
  }
  function tareasDe(cId) {
    return tareas.filter(t=>t.cultivoId===cId && t.fecha?.startsWith(String(year)));
  }

  const svgW = LABEL_W+COL_W*12+2;
  const svgH = HEADER_H+ROW_H*Math.max(1,cultivosFiltrados.length)+2;
  const todayX = (() => {
    const t = new Date();
    return t.getFullYear()===year ? taskX(t.toISOString().slice(0,10)) : null;
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
            <div style={{ fontSize:10, color:"#a89070", letterSpacing:"3px",
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
              background:view===v?"#c8a96e":"transparent",
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
                <div style={{ display:"flex", alignItems:"center", gap:2,
                  background:C.bgCard, border:`1px solid ${C.border}`,
                  borderRadius:6, padding:"4px 10px" }}>
                  <button onClick={()=>setYear(y=>y-1)} style={btnNav}>◀</button>
                  <span style={{ fontSize:20, fontWeight:"bold", color:C.textMain,
                    minWidth:56, textAlign:"center" }}>{year}</span>
                  <button onClick={()=>setYear(y=>y+1)} style={btnNav}>▶</button>
                </div>
                <div style={{ display:"flex", background:C.bgCard,
                  border:`1px solid ${C.border}`, borderRadius:6, overflow:"hidden" }}>
                  {["activos","todos"].map(m=>(
                    <button key={m} onClick={()=>setGanttMode(m)} style={{
                      padding:"7px 16px", border:"none",
                      background:ganttMode===m?"#3b2f1e":"transparent",
                      color:ganttMode===m?"#f5ead8":C.textSub,
                      cursor:"pointer", fontSize:12,
                      fontWeight:ganttMode===m?"bold":"normal",
                      fontFamily:"Georgia,serif",
                    }}>{m==="activos"?"Solo activos":"Todos"}</button>
                  ))}
                </div>
              </div>
              <button onClick={()=>setShowAddTask(true)} style={btnPrimary}>
                + Nueva Tarea
              </button>
            </div>

            {/* Leyenda */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:16 }}>
              {todosLosTipos.map(t=>(
                <div key={t.id} style={{
                  display:"flex", alignItems:"center", gap:5,
                  background:t.light, border:`1px solid ${t.color}55`,
                  borderRadius:20, padding:"3px 10px" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:t.color }} />
                  <span style={{ fontSize:11, color:t.color,
                    fontWeight:"bold", fontFamily:"Arial,sans-serif" }}>{t.label}</span>
                </div>
              ))}
            </div>

            {/* SVG Gantt */}
            <div style={{ borderRadius:8, border:`2px solid ${C.borderDark}`,
              overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.12)",
              overflowX:"auto", background:C.bgGantt }}>
              <svg width={svgW} height={svgH} style={{ display:"block" }}>
                <rect width={svgW} height={svgH} fill={C.bgGantt} />
                {MONTHS.map((_,i)=>(
                  <rect key={i} x={monthX(i)} y={0} width={COL_W} height={svgH}
                    fill={i%2===0?C.bgRow1:"#f2ede3"} />
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
                    <text x={monthX(i)+COL_W/2} y={HEADER_H/2+6}
                      textAnchor="middle" fill={C.monthText}
                      fontSize={13} fontWeight="bold" fontFamily="Georgia,serif">{m}</text>
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
                      <rect x={0} y={y0+8} width={4} height={ROW_H-16} rx={2}
                        fill={c.activo?C.accent:C.textMuted} />
                      <text x={14} y={y0+ROW_H/2-4}
                        fill={c.activo?C.textMain:C.textMuted}
                        fontSize={14} fontWeight="bold" fontFamily="Georgia,serif"
                        fontStyle={c.activo?"normal":"italic"}>{c.nombre}</text>
                      <text x={14} y={y0+ROW_H/2+13} fill={C.textSub}
                        fontSize={10} fontFamily="Arial,sans-serif">
                        {c.año}{c.ubicacion?`  ·  ${c.ubicacion}`:""}
                        {!c.activo?"  ·  inactivo":""}
                      </text>

                      {tareasDe(c.id).map(tarea=>{
                        const info=getTipoInfo(tarea.tipo,tarea.label,tareasCustom);
                        const tx=taskX(tarea.fecha);
                        const cy=y0+ROW_H/2;
                        const isHov=hoveredTask===tarea.id;
                        const abrev=info.abrev||(tarea.label||"").slice(0,3).toUpperCase();
                        return (
                          <g key={tarea.id} style={{ cursor:"pointer" }}
                            onMouseEnter={()=>setHoveredTask(tarea.id)}
                            onMouseLeave={()=>setHoveredTask(null)}
                            onClick={()=>setEditTask({...tarea})}>
                            <circle cx={tx+1} cy={cy+2} r={TASK_R}
                              fill="rgba(0,0,0,0.13)" />
                            <circle cx={tx} cy={cy} r={isHov?TASK_R+2:TASK_R}
                              fill={info.light} stroke={info.color}
                              strokeWidth={isHov?3:2} />
                            <text x={tx} y={cy+5} textAnchor="middle"
                              fontSize={10} fontWeight="bold"
                              fontFamily="Arial,sans-serif"
                              fill={info.color}>{abrev}</text>
                            {tarea.comentario&&(
                              <circle cx={tx+13} cy={cy-13} r={5}
                                fill="#e67e22" stroke="white" strokeWidth={1.5} />
                            )}
                            {/* Nube tooltip Gantt */}
                            {isHov&&(()=>{
                              const tipW=200, tipH=58;
                              const tipX=Math.min(Math.max(tx-tipW/2,LABEL_W+4),svgW-tipW-6);
                              const tipY=Math.max(6,cy-TASK_R-tipH-14);
                              const tailX=Math.min(Math.max(tx,tipX+20),tipX+tipW-20);
                              return (
                                <g style={{ pointerEvents:"none" }}>
                                  <rect x={tipX+3} y={tipY+3} width={tipW} height={tipH}
                                    rx={14} fill="rgba(0,0,0,0.12)" />
                                  <rect x={tipX} y={tipY} width={tipW} height={tipH}
                                    rx={14} fill="#fffdf7"
                                    stroke={info.color} strokeWidth={1.5} />
                                  <circle cx={tipX+22} cy={tipY} r={9} fill="#fffdf7" stroke={info.color} strokeWidth={1.5} />
                                  <circle cx={tipX+44} cy={tipY-6} r={11} fill="#fffdf7" stroke={info.color} strokeWidth={1.5} />
                                  <circle cx={tipX+68} cy={tipY-9} r={12} fill="#fffdf7" stroke={info.color} strokeWidth={1.5} />
                                  <circle cx={tipX+94} cy={tipY-7} r={11} fill="#fffdf7" stroke={info.color} strokeWidth={1.5} />
                                  <circle cx={tipX+118} cy={tipY-4} r={10} fill="#fffdf7" stroke={info.color} strokeWidth={1.5} />
                                  <rect x={tipX+1} y={tipY+1} width={tipW-2} height={16} fill="#fffdf7" />
                                  <polygon points={`${tailX-8},${tipY+tipH} ${tailX+8},${tipY+tipH} ${tailX},${tipY+tipH+12}`}
                                    fill="#fffdf7" stroke={info.color} strokeWidth={1.5} strokeLinejoin="round" />
                                  <rect x={tailX-7} y={tipY+tipH-2} width={14} height={5} fill="#fffdf7" />
                                  <rect x={tipX+1} y={tipY+1} width={tipW-2} height={8} rx={13} fill={info.color} opacity={0.15} />
                                  <text x={tipX+12} y={tipY+20} fill={info.color} fontSize={11} fontWeight="bold" fontFamily="Georgia,serif">
                                    {tarea.label||info.label}
                                  </text>
                                  <text x={tipX+tipW-12} y={tipY+20} fill={C.textSub} fontSize={10} fontFamily="Arial,sans-serif" textAnchor="end">
                                    {tarea.fecha?.slice(8)}/{tarea.fecha?.slice(5,7)}
                                  </text>
                                  <line x1={tipX+10} y1={tipY+28} x2={tipX+tipW-10} y2={tipY+28} stroke={C.border} strokeWidth={1} />
                                  <text x={tipX+12} y={tipY+44}
                                    fill={tarea.comentario?C.textSub:C.textMuted}
                                    fontSize={10} fontFamily="Arial,sans-serif"
                                    fontStyle={tarea.comentario?"normal":"italic"}>
                                    {tarea.comentario
                                      ?tarea.comentario.slice(0,34)+(tarea.comentario.length>34?"…":"")
                                      :"Sin comentario · clic para editar"}
                                  </text>
                                </g>
                              );
                            })()}
                          </g>
                        );
                      })}
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
                      background:libroMode===m?"#3b2f1e":"transparent",
                      color:libroMode===m?"#f5ead8":C.textSub,
                      cursor:"pointer", fontSize:12,
                      fontWeight:libroMode===m?"bold":"normal",
                      fontFamily:"Georgia,serif",
                    }}>{m==="activos"?"Solo activos":"Todos"}</button>
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
                        <div style={{ fontSize:12, color:C.textSub, marginTop:3,
                          fontFamily:"Arial,sans-serif" }}>
                          {c.año}{c.ubicacion&&`  ·  ${c.ubicacion}`}
                        </div>
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
                    <div style={{ marginTop:14, borderTop:`1px solid ${C.border}`,
                      paddingTop:12 }}>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:8,
                        fontFamily:"Arial,sans-serif" }}>
                        {tareasC.length} tarea{tareasC.length!==1?"s":""} registradas
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {tareasC.slice(0,8).map(t=>{
                          const info=getTipoInfo(t.tipo,t.label,tareasCustom);
                          return (
                            <TareaChip key={t.id} tarea={t} info={info}
                              onClick={()=>setEditTask({...t})} />
                          );
                        })}
                      </div>
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
          <Campo label="Fecha">
            <input type="date" value={editTask.fecha}
              onChange={e=>setEditTask({...editTask,fecha:e.target.value})} style={inp} />
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
            {/* Selector de cultivo */}
            <Campo label="Cultivo">
              <select value={newTask.cultivoId}
                onChange={e=>{ setNewTask({...newTask,cultivoId:e.target.value}); setRecurrente(null); setFechasExtra([""]); }} style={sel}>
                <option value="">— Selecciona un cultivo —</option>
                {cultivos.map(c=><option key={c.id} value={c.id}>{c.nombre} ({c.año})</option>)}
              </select>
            </Campo>

            {/* Listado de tareas existentes del cultivo */}
            {tareasDelCultivo.length>0&&(
              <div style={{ marginBottom:14, background:"#f7f2e8",
                border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px" }}>
                <div style={{ fontSize:10, color:C.textMuted, fontWeight:"bold",
                  letterSpacing:"1px", textTransform:"uppercase",
                  fontFamily:"Arial,sans-serif", marginBottom:8 }}>
                  Tareas ya programadas para este cultivo
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:5, maxHeight:130, overflowY:"auto" }}>
                  {tareasDelCultivo.map(t=>{
                    const info=getTipoInfo(t.tipo,t.label,tareasCustom);
                    return (
                      <div key={t.id} style={{ display:"flex", alignItems:"center",
                        gap:8, fontSize:12, fontFamily:"Arial,sans-serif" }}>
                        <div style={{ width:8, height:8, borderRadius:"50%",
                          background:info.color, flexShrink:0 }} />
                        <span style={{ color:info.color, fontWeight:"bold", minWidth:80 }}>
                          {t.label||info.label}
                        </span>
                        <span style={{ color:C.textMuted }}>
                          {t.fecha?.slice(8)}/{t.fecha?.slice(5,7)}/{t.fecha?.slice(0,4)}
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

            {/* Tipo de tarea */}
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
                  style={{...inp,borderColor:"#92660a",borderWidth:2}}
                  placeholder="Ej: Preparar compost, Instalar riego..." />
                <span style={{ fontSize:11, color:C.textSub, fontFamily:"Arial,sans-serif", marginTop:3 }}>
                  💡 Quedará guardada en tu lista para usarla de nuevo
                </span>
              </Campo>
            )}

            {/* Fecha principal */}
            <Campo label="Fecha">
              <input type="date" value={newTask.fecha}
                onChange={e=>{ setNewTask({...newTask,fecha:e.target.value}); setRecurrente(null); setFechasExtra([""]); }} style={inp} />
            </Campo>

            {/* Comentario */}
            <Campo label="Comentario (opcional)">
              <textarea value={newTask.comentario}
                onChange={e=>setNewTask({...newTask,comentario:e.target.value})}
                style={{...inp,height:60,resize:"vertical"}}
                placeholder="Notas sobre esta tarea..." />
            </Campo>

            {/* Pregunta recurrente — solo aparece si hay fecha */}
            {newTask.fecha&&(
              <div style={{ background:"#f0ebe0", border:`1px solid ${C.border}`,
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
                        background: recurrente===val ? "#3b2f1e" : "white",
                        color: recurrente===val ? "#f5ead8" : C.textSub,
                        cursor:"pointer", fontSize:12, fontWeight:"bold",
                        fontFamily:"Arial,sans-serif" }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Fechas extra si es recurrente */}
                {recurrente===true&&(
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:4 }}>
                    <div style={{ fontSize:11, color:C.textMuted, fontFamily:"Arial,sans-serif" }}>
                      Agrega las fechas en que se repite:
                    </div>
                    {fechasExtra.map((f,i)=>(
                      <div key={i} style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <input type="date" value={f}
                          onChange={e=>{
                            const arr=[...fechasExtra];
                            arr[i]=e.target.value;
                            setFechasExtra(arr);
                          }} style={{...inp, marginBottom:0, flex:1}} />
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

            {/* Botones finales */}
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
          <Campo label="Año">
            <input type="number" value={newCult.año}
              onChange={e=>setNewCult({...newCult,año:e.target.value})} style={inp} />
          </Campo>
          <Campo label="Ubicación (opcional)">
            <input value={newCult.ubicacion}
              onChange={e=>setNewCult({...newCult,ubicacion:e.target.value})}
              style={inp} placeholder="Ej: Cama Norte, Macetero..." />
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
  const fecha = tarea.fecha ? `${tarea.fecha.slice(8)}/${tarea.fecha.slice(5,7)}` : "";
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
              fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <circle cx="30"  cy="18" r="10" fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <circle cx="54"  cy="10" r="13" fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <circle cx="82"  cy="6"  r="15" fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <circle cx="112" cy="8"  r="13" fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <circle cx="138" cy="12" r="11" fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <circle cx="162" cy="16" r="9"  fill="#fffdf7" stroke={info.color} strokeWidth="1.5" />
            <rect x="5" y="19" width="210" height="14" fill="#fffdf7" />
            <polygon points="102,72 118,72 110,82"
              fill="#fffdf7" stroke={info.color} strokeWidth="1.5" strokeLinejoin="round" />
            <rect x="103" y="70" width="14" height="5" fill="#fffdf7" />
            <rect x="5" y="19" width="210" height="10" rx="12" fill={info.color} opacity="0.12" />
            <text x="14" y="38" fill={info.color} fontSize="12" fontWeight="bold" fontFamily="Georgia,serif">
              {tarea.label||info.label}
            </text>
            <text x="206" y="38" fill="#7a6248" fontSize="10" fontFamily="Arial,sans-serif" textAnchor="end">
              {fecha}
            </text>
            <line x1="14" y1="46" x2="206" y2="46" stroke="#c8b89a" strokeWidth="1" />
            <text x="14" y="62"
              fill={tarea.comentario?"#7a6248":"#a89070"}
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
    <div style={{ position:"fixed", inset:0, background:"rgba(40,25,10,0.55)",
      backdropFilter:"blur(3px)", display:"flex", alignItems:"center",
      justifyContent:"center", zIndex:1000, padding:20 }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#fffdf7", border:`1.5px solid #c8b89a`,
        borderRadius:10, padding:28, width:"100%", maxWidth:430,
        maxHeight:"90vh", overflowY:"auto",
        boxShadow:"0 8px 40px rgba(0,0,0,0.25)", fontFamily:"Georgia,serif" }}>
        <h3 style={{ margin:"0 0 20px", color:"#2c1f0e", fontSize:17, fontWeight:"bold" }}>
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
      <span style={{ fontSize:11, color:"#7a6248", textTransform:"uppercase",
        letterSpacing:"1px", fontWeight:"bold", fontFamily:"Arial,sans-serif" }}>{label}</span>
      {children}
    </div>
  );
}

const btnNav     = { width:30, height:30, borderRadius:"50%", border:"none",
  background:"transparent", color:"#2c1f0e", cursor:"pointer", fontSize:13, fontWeight:"bold" };
const btnPrimary = { padding:"9px 22px", borderRadius:6, border:"none",
  background:"#3b2f1e", color:"#f5ead8", cursor:"pointer", fontSize:13,
  fontWeight:"bold", fontFamily:"Georgia,serif",
  boxShadow:"0 2px 6px rgba(0,0,0,0.2)" };
const btnCancel  = { padding:"9px 16px", borderRadius:6, border:"1px solid #c8b89a",
  background:"transparent", color:"#7a6248", cursor:"pointer", fontSize:13,
  fontFamily:"Arial,sans-serif" };
const btnDanger  = { padding:"9px 16px", borderRadius:6, border:"1.5px solid #b91c1c",
  background:"#fee2e2", color:"#b91c1c", cursor:"pointer", fontSize:13,
  fontWeight:"bold", fontFamily:"Arial,sans-serif" };
const inp = { background:"#fffdf7", border:"1.5px solid #c8b89a", borderRadius:6,
  padding:"9px 11px", color:"#2c1f0e", fontSize:14,
  fontFamily:"Georgia,serif", width:"100%", boxSizing:"border-box" };
const sel = { ...inp, cursor:"pointer" };
