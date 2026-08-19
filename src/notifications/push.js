/* eslint-disable no-unused-vars */
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const RESERVATIONS_COLLECTION = "reservations";

export async function initPushNotifications() {
  const capacitor = typeof window !== "undefined" ? window.Capacitor : undefined;
  if (!capacitor || !capacitor.isNativePlatform()) {
    console.log("[push] Entorno web — push deshabilitado");
    return;
  }

  const { PushNotifications, LocalNotifications } = capacitor.Plugins;

  if (!PushNotifications) {
    console.warn("[push] Plugin PushNotifications no disponible");
    return;
  }

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      console.warn("[push] Permiso de notificaciones denegado");
      return;
    }

    PushNotifications.addListener("registration", async (token) => {
      console.log("[push] Token FCM recibido:", token.value.substring(0, 20) + "...");
      await saveFcmTokenToFirestore(token.value);
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("[push] Error en registro FCM:", err);
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("[push] Notificacion recibida (foreground):", notification.title);
      showLocalNotification(LocalNotifications, notification);
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      console.log("[push] Notificacion tapped:", action.notification.data);
      handleNotificationTap(action.notification.data);
    });

    await PushNotifications.register();
    console.log("[push] Registro FCM iniciado");
  } catch (err) {
    console.error("[push] Error inicializando push:", err);
  }
}

async function saveFcmTokenToFirestore(fcmToken) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    console.warn("[push] Sin usuario — token no guardado");
    return;
  }
  const uid = user.uid;
  const email = user.email || "";
  const db = getFirestore();
  const tokenRef = doc(db, "device_tokens", uid);

  await setDoc(
    tokenRef,
    {
      tokens: [fcmToken],
      platform: "android",
      email,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  console.log("[push] Token guardado para", email);
}

async function showLocalNotification(LocalNotifications, notification) {
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          title: notification.title || "RedLab",
          body: notification.body || "",
          id: Date.now(),
        },
      ],
    });
  } catch (e) {
    console.error("[push] LocalNotification error:", e);
  }
}

function handleNotificationTap(data) {
  if (!data) return;
  const type = data.type;
  // El estudiante no tiene rutas de hash: su vista se monta sola al arrancar
  // la app (setupStudentView), asi que el tap solo trae la app al frente.
  if (type === "reservation_approved" || type === "reservation_rejected" || type === "reservation_canceled") {
    console.log("[push] Notificacion de estudiante (sin navegacion por hash):", type);
    return;
  }
  if (type === "reservation_pending" || type === "reservation_blocked") {
    const hash = "#/admin/calendario";
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    console.log("[push] Navegado a calendario por notificacion:", type);
  }
}
