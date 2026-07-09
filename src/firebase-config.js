/**
 * src/firebase-config.js — Inicialización de Firebase
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

export function initFirebase() {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  return { db, auth };
}

export function getDb() { return db; }
export function getAuthInstance() { return auth; }
