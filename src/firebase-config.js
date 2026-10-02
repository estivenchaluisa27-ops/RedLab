/**
 * src/firebase-config.js — Inicialización de Firebase
 *
 * Único punto donde se fija la versión del SDK (11.6.1). Todos los módulos
 * importan los símbolos de Firebase desde aquí para que subir de versión
 * sea un cambio en un solo archivo.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  sendPasswordResetEmail, updatePassword, createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, collection, query, where, orderBy, limit,
  getDoc, getDocs, doc, writeBatch, onSnapshot, setDoc, updateDoc, deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export {
  initializeApp,
  getAuth, setPersistence, browserLocalPersistence,
  getFirestore, collection, query, where, orderBy, limit,
  getDoc, getDocs, doc, writeBatch, onSnapshot, setDoc, updateDoc, deleteDoc,
  serverTimestamp,
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  sendPasswordResetEmail, updatePassword, createUserWithEmailAndPassword,
};

export const firebaseConfig = {
  apiKey: "AIzaSyCR4Kk7kIBpSW3cF02b8zUHegvV4WQNuyI",
  authDomain: "lab-redes-turnos.firebaseapp.com",
  projectId: "lab-redes-turnos",
  storageBucket: "lab-redes-turnos.firebasestorage.app",
  messagingSenderId: "592544790067",
  appId: "1:592544790067:web:00bde37b50d3edf9f59546"
};

export const RESERVATIONS_COLLECTION = "reservations";

let db = null;
let auth = null;

export async function initFirebase() {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("[firebase] no se pudo fijar persistencia LOCAL:", e?.message || e);
  }
  db = getFirestore(app);
  return { db, auth };
}

export function getDb() { return db; }
export function getAuthInstance() { return auth; }
