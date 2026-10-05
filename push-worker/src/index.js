/**
 * push-worker/src/index.js
 *
 * Envia push FCM a estudiantes cuando un turno se aprueba o rechaza, leyendo la
 * coleccion `notifications` que ya escribe el cliente. Misma logica que
 * .github/scripts/push-notifications.mjs, pero sobre la REST API de Firestore:
 * el Admin SDK no corre en Workers.
 *
 * Existe por una razon concreta: GitHub Actions garantiza 5 minutos como
 * MINIMO y no tiene SLA, asi que el cron de ahi no cumplia. Este Worker corre
 * cada minuto.
 *
 * Secret requerido (wrangler secret put FIREBASE_SERVICE_ACCOUNT):
 *   el JSON del service account, en una sola linea.
 */

const PROJECT_ID = "lab-redes-turnos";
const DB = "(default)";
const NOTIFICATIONS_COLLECTION = "notifications";
const DEVICE_TOKENS_COLLECTION = "device_tokens";

const PUSHABLE_TYPES = ["aprobada", "rechazada"];

// Ventana de antiguedad maxima. Todo lo mas viejo se marca como procesado sin
// enviar, para no hacer blast de notificaciones historicas al arrancar.
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const SCAN_LIMIT = 200;

// Equivalentes REST de DEAD_TOKEN_CODES del script Node: un token que FCM
// reporta UNREGISTERED / INVALID_ARGUMENT no volvera a funcionar, asi que se
// purga para no reintentarlo cada minuto.
const DEAD_TOKEN_STATUSES = new Set(["UNREGISTERED", "INVALID_ARGUMENT"]);

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB}/documents`;
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const SCOPE =
  "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging";

// ==============================
// Base64 / PEM
// ==============================
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64Url(input) {
  const arr = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncode(text) {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

// ==============================
// Access token
// ==============================
let cachedToken = null; // { value, expiresAt }

/**
 * Intercambia un JWT firmado por un access token OAuth2. Google exige el scope
 * `firebase.messaging` para enviar y `datastore` para leer Firestore; sin los
 * dos, el envio falla con 403 aunque las credenciales validas.
 *
 * Se cachea en scope de modulo: el cron corre cada minuto y el token dura una
 * hora, asi que sin esto se firmaria un JWT y haria un round-trip cada vez.
 */
async function getAccessToken(env) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;

  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Falta el secret FIREBASE_SERVICE_ACCOUNT");
  const sa = JSON.parse(raw);

  const pem = sa.private_key || "";
  const der = base64ToBytes(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, ""));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  const jwt = `${header}.${claims}.${bytesToBase64Url(signature)}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) throw new Error(`oauth2 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

// ==============================
// Firestore REST
// ==============================
function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}

function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromValue(v);
  return out;
}

async function firestoreFetch(env, path, init = {}) {
  const token = await getAccessToken(env);
  const res = await fetch(`${FIRESTORE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`firestore ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return {};
  return res.json();
}

/**
 * Notificaciones de los ultimos MAX_AGE_MS que aun no salieron.
 *
 * UN SOLO filtro de rango (createdAt >= cutoff) resuelto con el indice
 * single-field automatico: no requiere indice compuesto. El orden por createdAt
 * ASC usa el mismo campo, asi que tampoco lo requiere, y hace que el limite
 * sea determinista: primero los mas viejos, que son los que mas han esperado.
 *
 * El filtro por `type` y por `pushSentAt` se aplica en JS sobre un rango ya
 * acotado por tiempo. Acotar en la query es lo que evita que la primera corrida
 * dispare notificaciones historicas.
 */
async function fetchPending(env) {
  const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
  const rows = await firestoreFetch(env, ":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: NOTIFICATIONS_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: "createdAt" },
            op: "GREATER_THAN_OR_EQUAL",
            value: { timestampValue: cutoff },
          },
        },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
        limit: SCAN_LIMIT,
      },
    }),
  });

  const out = [];
  for (const row of rows || []) {
    if (!row.document) continue; // una fila de error, no un documento
    const data = fromFields(row.document.fields);
    if (!PUSHABLE_TYPES.includes(data.type)) continue;
    if (data.pushSentAt) continue;
    out.push({ id: String(row.document.name).split("/").pop(), data });
  }
  return out;
}

async function getDoc(env, collection, id) {
  try {
    const doc = await firestoreFetch(env, `/${collection}/${encodeURIComponent(id)}`);
    return { exists: true, data: fromFields(doc.fields) };
  } catch (err) {
    if (String(err.message).includes("firestore 404")) return { exists: false, data: null };
    throw err;
  }
}

/**
 * Actualiza campos de un documento via updateMask.
 *
 * pushSentAt se escribe con el reloj del Worker, no serverTimestamp(). Aqui es
 * una marca de "ya se proceso", no un dato que se muestre: la query filtra por
 * `createdAt` (lo escribe el cliente con server time) y solo mira la EXISTENCIA
 * de pushSentAt, asi que el reloj aqui no puede desalinear nada.
 */
async function patchDoc(env, collection, id, fields, fieldPaths) {
  const mask = fieldPaths
    .map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`)
    .join("&");
  return firestoreFetch(env, `/${collection}/${encodeURIComponent(id)}?${mask}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

const markProcessed = (env, id) =>
  patchDoc(
    env,
    NOTIFICATIONS_COLLECTION,
    id,
    { pushSentAt: { timestampValue: new Date().toISOString() } },
    ["pushSentAt"]
  );

// ==============================
// Tokens
// ==============================
async function getTokensForUser(env, uid) {
  const snap = await getDoc(env, DEVICE_TOKENS_COLLECTION, uid);
  if (!snap.exists) return [];
  const tokens = snap.data?.tokens;
  return Array.isArray(tokens) ? tokens : [];
}

/** Quita tokens que FCM reporta como invalidos para no reintentar cada minuto. */
async function pruneDeadTokens(env, uid, deadTokens) {
  const snap = await getDoc(env, DEVICE_TOKENS_COLLECTION, uid);
  if (!snap.exists) return;
  const current = snap.data?.tokens ?? [];
  const kept = current.filter((t) => !deadTokens.has(t));
  if (kept.length === current.length) return;

  if (kept.length === 0) {
    await firestoreFetch(env, `/${DEVICE_TOKENS_COLLECTION}/${encodeURIComponent(uid)}`, {
      method: "DELETE",
    });
    console.log(`[tokens] ${uid}: doc eliminado, sin tokens validos`);
  } else {
    await patchDoc(
      env,
      DEVICE_TOKENS_COLLECTION,
      uid,
      { tokens: { arrayValue: { values: kept.map((t) => ({ stringValue: t })) } } },
      ["tokens"]
    );
    console.log(`[tokens] ${uid}: ${current.length} -> ${kept.length}`);
  }
}

// ==============================
// FCM HTTP v1
// ==============================
/**
 * El body va vacio a proposito: para un estudiante la info util es solo el
 * estado del turno. Fecha, hora y grupo son datos de gestion y se quedan en
 * `data` por si el tap necesita abrirlos.
 */
function buildMessage(notification) {
  const { type, date, hour } = notification;
  const payload = {
    data: {
      date: String(date ?? ""),
      hour: String(hour ?? ""),
    },
  };
  if (type === "aprobada") {
    return { title: "Turno aprobado", ...payload, data: { type: "reservation_approved", ...payload.data } };
  }
  return { title: "Turno rechazado", ...payload, data: { type: "reservation_rejected", ...payload.data } };
}

/**
 * FCM HTTP v1 no tiene endpoint multicast (a diferencia de la API legacy): hay
 * que enviar un mensaje por token. Un estudiante tiene 1-3 tokens, asi que no
 * compensa la complejidad de agruparlos.
 * @returns {Promise<{ok: boolean, dead: boolean, error?: string}>}
 */
async function sendPush(env, token, message) {
  const accessToken = await getAccessToken(env);
  const res = await fetch(FCM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: message.title },
        data: message.data,
        android: { priority: "HIGH" },
      },
    }),
  });

  if (res.ok) return { ok: true, dead: false };

  const payload = await res.json().catch(() => ({}));
  const status = payload?.error?.status;
  const errorCode = (payload?.error?.details ?? []).find((d) => d.errorCode)?.errorCode;
  // INVALID_ARGUMENT tambien se dispara por un payload mal formado, no solo por
  // un token muerto. El token se purga igual: reintentarlo cada minuto no lo
  // arregla y cuesta lo mismo que un envio sano.
  return {
    ok: false,
    dead: DEAD_TOKEN_STATUSES.has(status) || DEAD_TOKEN_STATUSES.has(errorCode),
    error: payload?.error?.message ?? `HTTP ${res.status}`,
  };
}

async function pushToUser(env, uid, message) {
  const tokens = await getTokensForUser(env, uid);
  if (tokens.length === 0) {
    console.log(`[push] ${uid}: sin token registrado, nada que enviar`);
    return;
  }

  const dead = new Set();
  let ok = 0;
  let failed = 0;

  for (const token of tokens) {
    const r = await sendPush(env, token, message);
    if (r.ok) ok += 1;
    else {
      failed += 1;
      if (r.dead) dead.add(token);
    }
  }

  if (dead.size > 0) await pruneDeadTokens(env, uid, dead);
  console.log(
    `[push] ${uid}: ${ok} ok, ${failed} fallo${dead.size ? `, ${dead.size} purgado` : ""}`
  );
}

// ==============================
// Main
// ==============================
async function runOnce(env) {
  const docs = await fetchPending(env);
  console.log(`[run] ${docs.length} notificacion(es) pendiente(s)`);
  if (docs.length === 0) return { pending: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const { id, data } of docs) {
    const { userId, type } = data;

    if (!userId || userId === "ADMIN") {
      await markProcessed(env, id);
      continue;
    }

    try {
      await pushToUser(env, userId, buildMessage(data));
      // Se marca DESPUES del envio: preferimos un duplicado improbable a perder
      // la notificacion de un turno ya resuelto.
      await markProcessed(env, id);
      sent += 1;
    } catch (err) {
      // Sin marcar: la proxima corrida (en 60s) reintenta.
      failed += 1;
      console.error(`[error] ${id} (${type}) para ${userId}: ${err.message}`);
    }
  }

  console.log(`[run] enviado=${sent} fallido=${failed}`);
  return { pending: docs.length, sent, failed };
}

export default {
  // Cron: se ejecuta solo cada minuto, no necesita request entrante.
  //
  // La firma es (controller, env, ctx): `env` es el SEGUNDO parametro, no el
  // tercero. Ponerlo tercero hace que `env` reciba el ExecutionContext y
  // `env.FIREBASE_SERVICE_ACCOUNT` sea undefined: el handler lanza antes de
  // enviar nada y el cron no entrega nunca. Solo lo detecta el camino del cron,
  // porque fetch(request, env) tiene otra firma y si funciona.
  async scheduled(_controller, env, _ctx) {
    // FIREBASE_PROJECT_ID es una var, no un secret, asi que SIEMPRE esta presente.
    // Con la firma mal (env en 3er lugar) esto imprime "undefined", lo que hace
    // este log discriminante del fallo real.
    console.log(
      `[cron] project_id=${env.FIREBASE_PROJECT_ID} secret=${Boolean(env.FIREBASE_SERVICE_ACCOUNT)}`
    );
    try {
      await runOnce(env);
    } catch (err) {
      console.error("[fatal] cron:", err.message);
    }
  },

  // Ruta manual para depurar (`wrangler dev` o curl). Idempotente: pushSentAt
  // impide que una llamada manual reenvie lo ya enviado.
  async fetch(_request, env) {
    const result = await runOnce(env).catch((err) => ({ error: err.message }));
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  },
};