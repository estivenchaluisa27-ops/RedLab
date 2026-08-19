#!/usr/bin/env node
/**
 * scripts/build-app.js
 * Empaqueta los assets web del SPA (sin build step) al directorio `www/`
 * que Capacitor usa como `webDir` para generar el APK.
 *
 * RedLab es una SPA vanilla JS con ESM en src/ y paths server-relative (`/`)
 * en index.html. Capacitor WebView sirve webDir como https://localhost/, así
 * que esos paths absolutos funcionan sin cambios.
 *
 * Uso: node scripts/build-app.js   (o via npm run build:app)
 */
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "www");

const ASSETS = [
  "index.html",
  "404.html",
  "styles.css",
  "assets",
  "src",
];

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

for (const asset of ASSETS) {
  const src = join(root, asset);
  if (!existsSync(src)) {
    console.warn(`[build-app] skip missing: ${asset}`);
    continue;
  }
  const dest = join(outDir, asset);
  cpSync(src, dest, { recursive: true, dereference: true });
  const kind = statSync(src).isDirectory() ? "dir " : "file";
  console.log(`[build-app] ${kind} ${asset}`);
}

const summary = readdirSync(outDir);
console.log(`[build-app] www/ contains ${summary.length} entries: ${summary.join(", ")}`);
