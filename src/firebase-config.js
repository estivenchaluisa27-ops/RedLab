/**
 * src/firebase-config.js — Inicialización de Firebase
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
  // Idempotente: initializeApp e initializeFirestore lanzan si se repiten, y la
  // app ya inicializada es la unica valida (con su cache ya construida).
  if (db && auth) return { db, auth };

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("[firebase] no se pudo fijar persistencia LOCAL:", e?.message || e);
  }

  // Persistencia offline via la API actual (FirestoreSettings.localCache).
  // Sustituye a enableIndexedDbPersistence(), que esta deprecado en 11.6.1 y
  // avisa por consola. persistentMultipleTabManager() hace que varias pestanas
  // compartan la cache en vez de pelear por ella: con la API vieja, la segunda
  // pestana fallaba y se quedaba SIN persistencia.
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (e) {
    // Si la cache local no puede configurarse, la app sigue funcionando con
    // Firestore en memoria: pierde el modo offline, pero no se rompe el login.
    console.warn("[firebase] cache local no disponible, se usa Firestore en memoria:", e?.message || e);
    db = getFirestore(app);
  }

  return { db, auth };
}

export function getDb() { return db; }
export function getAuthInstance() { return auth; }
