import express from "express";
import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==============================
// Inicializar firebase-admin
// ==============================
// Prioridad: env var FIREBASE_SERVICE_ACCOUNT (Fly.io) > archivo service-account.json (local)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Desarrollo local: leer service-account.json del directorio del proyecto
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const localPath = path.resolve(__dirname, "service-account.json");
  if (fs.existsSync(localPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(localPath, "utf8"));
    console.log("[init] Service account cargado desde service-account.json (local)");
  } else {
    console.error("[FATAL] No se encontro FIREBASE_SERVICE_ACCOUNT ni service-account.json");
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || "lab-redes-turnos",
});

const db = admin.firestore();
const messaging = admin.messaging();

// ==============================
// Cache en memoria: {reservationId: lastStatus}
// Evita enviar push duplicados al reconectar el listener o recibir snapshots redundantes
// ==============================
const statusCache = new Map();

// ==============================
// Helper: obtener tokens FCM de un usuario
// ==============================
async function getTokensForUser(uid) {
  try {
    const docSnap = await db.collection("device_tokens").doc(uid).get();
    if (!docSnap.exists) return [];
    const data = docSnap.data();
    return data.tokens || [];
  } catch (err) {
    console.error(`[tokens] Error leyendo tokens de ${uid}:`, err.message);
    return [];
  }
}

// ==============================
// Helper: obtener tokens de todos los profesores de un curso
// ==============================
async function getTokensForCourseProfessors(courseId) {
  try {
    const courseDoc = await db.collection("courses").doc(courseId).get();
    if (!courseDoc.exists) return [];
    const profEmail = courseDoc.data().professorEmail;
    if (!profEmail) return [];
    // Buscar device_tokens donde email == profEmail
    const tokensSnap = await db.collection("device_tokens").where("email", "==", profEmail).get();
    const tokens = [];
    tokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data.tokens) tokens.push(...data.tokens);
    });
    return tokens;
  } catch (err) {
    console.error(`[tokens] Error leyendo profesor del curso ${courseId}:`, err.message);
    return [];
  }
}

// ==============================
// Helper: enviar FCM multicast
// ==============================
async function sendPush(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) {
    console.log("[fcm] Sin tokens — skip");
    return;
  }
  const message = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    tokens,
    android: { priority: "high" },
  };
  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`[fcm] Enviado: ${response.successCount} ok, ${response.failureCount} fallo`);
  } catch (err) {
    console.error("[fcm] Error enviando:", err.message);
  }
}

// ==============================
// Helper: construir mensaje segun el cambio de status
// ==============================
function buildNotification(status, reservationData) {
  const { date, hour, courseName, groupId } = reservationData;
  const slot = `${date} ${hour}:00`;

  switch (status) {
    case "pending":
      return {
        title: "Nueva solicitud de reserva",
        body: `Reserva para ${slot}${courseName ? " (" + courseName + ")" : ""}`,
        data: { type: "reservation_pending", date: String(date), hour: String(hour) },
        audience: "professor",
      };
    case "approved":
      return {
        title: "Reserva aprobada",
        body: `Tu reserva del ${slot} ha sido aprobada`,
        data: { type: "reservation_approved", date: String(date), hour: String(hour) },
        audience: "student",
      };
    case "blocked":
      return {
        title: "Slot bloqueado",
        body: `El slot ${slot} ha sido bloqueado por el administrador`,
        data: { type: "reservation_blocked", date: String(date), hour: String(hour) },
        audience: "all",
      };
    default:
      return null;
  }
}

// ==============================
// Listener persistente: onSnapshot en reservations
// ==============================
console.log("[init] Iniciando listener de Firestore en reservations...");
db.collection("reservations").onSnapshot(
  (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const doc = change.doc;
      const data = doc.data();
      const reservationId = doc.id;
      const newStatus = data.status;

      if (change.type === "added") {
        // Nueva reserva — notificar
        const cached = statusCache.get(reservationId);
        if (cached === newStatus) return; // idempotencia
        statusCache.set(reservationId, newStatus);
        await handleStatusChange(reservationId, data, null, newStatus);
      } else if (change.type === "modified") {
        // Status cambio — detectar transicion
        const oldStatus = statusCache.get(reservationId);
        if (oldStatus === newStatus) return; // sin cambio real
        statusCache.set(reservationId, newStatus);
        await handleStatusChange(reservationId, data, oldStatus, newStatus);
      } else if (change.type === "removed") {
        statusCache.delete(reservationId);
      }
    });
  },
  (err) => {
    console.error("[snapshot] Error en listener:", err.message);
    // El listener se reconecta solo automaticamente.
  }
);

async function handleStatusChange(reservationId, data, oldStatus, newStatus) {
  const notif = buildNotification(newStatus, data);
  if (!notif) return;

  console.log(`[change] ${reservationId}: ${oldStatus || "none"} -> ${newStatus} (${notif.title})`);

  // Determinar a quien enviar segun audience
  if (notif.audience === "student" && data.userId) {
    const tokens = await getTokensForUser(data.userId);
    await sendPush(tokens, notif.title, notif.body, notif.data);
  } else if (notif.audience === "professor" && data.courseId) {
    const tokens = await getTokensForCourseProfessors(data.courseId);
    await sendPush(tokens, notif.title, notif.body, notif.data);
  } else if (notif.audience === "all") {
    // Notificar a todos los usuarios con tokens registrados
    const snapshot = await db.collection("device_tokens").get();
    const allTokens = [];
    snapshot.forEach((doc) => {
      const tokens = doc.data().tokens || [];
      allTokens.push(...tokens);
    });
    await sendPush(allTokens, notif.title, notif.body, notif.data);
  }
}

// ==============================
// Health check endpoint (Fly.io)
// ==============================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    reservationsTracked: statusCache.size,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[server] RedLab push server escuchando en puerto ${PORT}`);
});
