/**
 * .github/scripts/push-notifications.mjs
 *
 * Envia push notifications FCM a estudiantes cuando un turno es aprobado o
 * rechazado, leyendo la coleccion `notifications` que ya escribe el cliente.
 *
 * Dispara desde .github/workflows/push-notifications.yml (cron cada 5 min).
 * Es stateless: el estado vive en Firestore, no en el repo.
 *
 * Variables de entorno requeridas:
 *   FIREBASE_SERVICE_ACCOUNT  - JSON del service account (o FIREBASE_SERVICE_ACCOUNT_B64)
 *   FIREBASE_PROJECT_ID       - id del proyecto (default: lab-redes-turnos)
 */
import admin from "firebase-admin";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "lab-redes-turnos";
const NOTIFICATIONS_COLLECTION = "notifications";
const DEVICE_TOKENS_COLLECTION = "device_tokens";

// Tipos que disparan push al estudiante.
const PUSHABLE_TYPES = ["aprobada", "rechazada"];

// Ventana de antiguedad maxima para enviar. Todo lo mas viejo se marca como
// procesado sin enviar, para no hacer blast de notificaciones historicas la
// primera vez que corre el workflow.
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 horas

// Tope por corrida.
const BATCH_LIMIT = 50;

// Codigos de FCM que indican que el token ya no sirve mas.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

// ==============================
// Init firebase-admin
// ==============================
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    return JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8")
    );
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  throw new Error("Falta FIREBASE_SERVICE_ACCOUNT o FIREBASE_SERVICE_ACCOUNT_B64");
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount()),
  projectId: PROJECT_ID,
});

const db = admin.firestore();
const messaging = admin.messaging();

// ==============================
// Mensajes
// ==============================
function buildMessage(notification) {
  const { type, date, hour, groupName } = notification;
  const slot = `${date} ${hour}:00`;
  const grupo = groupName ? ` (${groupName})` : "";

  if (type === "aprobada") {
    return {
      title: "Turno aprobado",
      body: `Tu solicitud del ${slot}${grupo} fue aprobada.`,
      data: { type: "reservation_approved", date: String(date), hour: String(hour) },
    };
  }

  return {
    title: "Turno rechazado",
    body: `Tu solicitud del ${slot}${grupo} no fue aprobada.`,
    data: { type: "reservation_rejected", date: String(date), hour: String(hour) },
  };
}

// ==============================
// Tokens
// ==============================
async function getTokensForUser(uid) {
  const snap = await db.collection(DEVICE_TOKENS_COLLECTION).doc(uid).get();
  if (!snap.exists) return [];
  return snap.data()?.tokens ?? [];
}

/** Quita tokens que FCM reporta como invalidos para no reintentar para siempre. */
async function pruneDeadTokens(uid, failedTokens) {
  const ref = db.collection(DEVICE_TOKENS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;

  const current = snap.data()?.tokens ?? [];
  const kept = current.filter((t) => !failedTokens.has(t));
  if (kept.length === current.length) return;

  if (kept.length === 0) {
    await ref.delete();
    console.log(`[tokens] doc ${uid} eliminado: sin tokens validos`);
  } else {
    await ref.update({ tokens: kept });
    console.log(`[tokens] ${uid}: ${current.length} -> ${kept.length} tokens`);
  }
}

// ==============================
// Envio
// ==============================
async function pushToUser(uid, message) {
  const tokens = await getTokensForUser(uid);
  if (tokens.length === 0) {
    console.log(`[push] uid ${uid} sin token registrado — nada que enviar`);
    return;
  }

  const response = await messaging.sendEachForMulticast({
    notification: { title: message.title, body: message.body },
    data: message.data,
    tokens,
    android: { priority: "high" },
  });

  const dead = new Set();
  response.responses.forEach((r, i) => {
    if (!r.success && DEAD_TOKEN_CODES.has(r.error?.code)) dead.add(tokens[i]);
  });
  if (dead.size > 0) await pruneDeadTokens(uid, dead);

  console.log(
    `[push] ${uid}: ${response.successCount} ok, ${response.failureCount} fallo` +
      (dead.size ? ` (${dead.size} token(s) muerto(s) purgado(s))` : "")
  );
}

// ==============================
// Main
// ==============================
/**
 * Consulta notificaciones pendientes de push.
 *
 * Usa solo un filtro de igualdad + un orderBy, que Firestore resuelve con
 * index merging de single-field indexes: no requiere indice compuesto.
 * Los documentos ya-enviados se filtran en JS para no depender de un indice
 * adicional ni del estado del indice en el momento del deploy.
 */
async function fetchPending() {
  const cutoff = Date.now() - MAX_AGE_MS;
  const byType = await Promise.all(
    PUSHABLE_TYPES.map(async (type) => {
      const snap = await db
        .collection(NOTIFICATIONS_COLLECTION)
        .where("type", "==", type)
        .orderBy("createdAt", "asc")
        .limit(BATCH_LIMIT)
        .get();
      return snap.docs;
    })
  );

  const docs = byType.flat();

  // createdAt es un serverTimestamp; hasta que se resuelve puede venir null.
  const isRecent = (d) => {
    const ts = d.data()?.createdAt;
    if (!ts || typeof ts.toMillis !== "function") return true; // recien escrito
    return ts.toMillis() >= cutoff;
  };

  return docs.filter((d) => !d.data()?.pushSentAt && isRecent(d));
}

async function main() {
  const docs = await fetchPending();
  console.log(`[run] ${docs.length} notificacion(es) pendiente(s) de push`);

  if (docs.length === 0) {
    console.log("[run] nada que enviar");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const doc of docs) {
    const data = doc.data();
    const { userId, type } = data;

    if (!userId || userId === "ADMIN") {
      await doc.ref.update({ pushSentAt: admin.firestore.FieldValue.serverTimestamp() });
      continue;
    }

    try {
      await pushToUser(userId, buildMessage(data));
      // Se marca DESPUES del envio: preferimos un duplicado improbable
      // antes que perder una notificacion de un turno ya resuelto.
      await doc.ref.update({ pushSentAt: admin.firestore.FieldValue.serverTimestamp() });
      sent += 1;
    } catch (err) {
      // No se marca: la proxima corrida reintenta.
      failed += 1;
      console.error(`[error] ${doc.id} (${type}) para ${userId}:`, err.message);
    }
  }

  console.log(`[run] enviado=${sent} fallido=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
  });