# redlab-push — Cloudflare Worker para push FCM

Envía push al estudiante cuando un turno se aprueba o rechaza. Corre **cada minuto**.

## Por qué existe

La primera versión usaba un cron de GitHub Actions. **No funcionaba**: en 50 minutos de
ventana de prueba no disparo ni una vez, solo los `workflow_dispatch` manuales. GitHub
documenta que los scheduled workflows se retrasan en periodos de alta carga (que incluyen
el inicio de cada hora), y los 5 minutos de `*/5` son un **mínimo**, no una garantía.
Sin SLA, no sirve para nada sensible a la latencia.

Cloudflare Workers permite cron de **1 minuto** en el plan gratuito.

## Diferencias con el script de Node

- El Admin SDK no corre en Workers: todo va por REST (Firestore `runQuery`/`PATCH`,
  FCM HTTP v1).
- El access token OAuth2 se firma con WebCrypto (RS256) y se cachea en scope de módulo
  para no firmarlo en cada invocación.
- FCM HTTP v1 **no tiene endpoint multicast** (la API legacy sí). Se envía un mensaje
  por token; un estudiante tiene 1-3 tokens, así que no compensa agruparlos.
- `pushSentAt` se escribe con el reloj del Worker, no `serverTimestamp()`. Da igual: es
  una marca de "ya se procesó" y la query solo mira su existencia.

## Despliegue

```powershell
cd push-worker
npm install

# 1. Autenticarse (abre el navegador, no hace falta token)
npx wrangler login

# 2. El service account como secret. Pega el JSON del service account en UNA SOLA LÍNEA.
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT

# 3. Desplegar
npm run deploy
```

## Depurar

```powershell
npm run tail     # logs en vivo del cron de 1 minuto
npm run dev      # local, con .dev.vars

# disparo manual (idempotente: pushSentAt impide duplicados)
curl https://redlab-push.<subdominio>.workers.dev
```

## Límites del plan gratuito

- 100.000 requests/día. Aquí se usa 1/min = 1.440/día.
- Los cron triggers no se ejecutan mientras el Worker está inactivo si no hay tráfico.
  Un cron de 1 minuto ya genera tráfico suficiente para mantenerlo despierto.

## Estado de la notificaciones

Mientras este Worker **no esté desplegado**, las notificaciones solo salen si alguien las
dispare a mano desde el workflow de GitHub Actions, que quedó como respaldo.