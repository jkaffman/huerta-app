import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKQJt2KN3aM-KUhaujzlXlqdlJO63IY",
  authDomain: "golf-scorecard-chile.firebaseapp.com",
  projectId: "golf-scorecard-chile",
  storageBucket: "golf-scorecard-chile.firebasestorage.app",
  messagingSenderId: "701604038578",
  appId: "1:701604038578:web:68321117711881265546ab"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);