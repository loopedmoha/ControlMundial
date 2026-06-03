// common.js - utilidades compartidas entre la cuadricula y la escaleta.

// Las tres pantallas del Mundial.
const SCREENS = ["Arco", "Larga", "Mesa"];
const SCREEN_CLASS = { Arco: "arco", Larga: "larga", Mesa: "mesa" };

// Canal para sincronizar en vivo la ventana principal y la de la escaleta.
const bus = new BroadcastChannel("control-mundial");

// ---- API ----
async function apiList(dir) {
  const r = await fetch("/api/list?dir=" + encodeURIComponent(dir));
  return r.json();
}
async function apiDirs(dir) {
  const r = await fetch("/api/dirs?dir=" + encodeURIComponent(dir || ""));
  return r.json();
}
async function apiGetEscaleta() {
  const r = await fetch("/api/escaleta", { cache: "no-store" });
  try { return await r.json(); } catch (e) { return []; }
}
async function apiSaveEscaleta(list) {
  await fetch("/api/escaleta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(list),
  });
}

// Notifica al resto de ventanas que la escaleta cambio (con la lista nueva).
function broadcastEscaleta(list) {
  bus.postMessage({ type: "escaleta", list });
}

// ---- Util ----
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n < 10 && i > 0 ? 1 : 0) + " " + u[i];
}

// ---- Cache de miniaturas de video (dataURL en localStorage) ----
const THUMB_PREFIX = "cm.thumb.";
function thumbKey(item) {
  return THUMB_PREFIX + item.path + "|" + item.size + "|" + item.mtime;
}
function getCachedThumb(item) {
  try { return localStorage.getItem(thumbKey(item)); } catch (e) { return null; }
}
function setCachedThumb(item, dataUrl) {
  try { localStorage.setItem(thumbKey(item), dataUrl); } catch (e) { /* cuota llena: ignorar */ }
}

// Genera una miniatura de un video capturando un fotograma con canvas.
function generateVideoThumb(item) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.crossOrigin = "anonymous";
    v.src = item.url;
    let done = false;
    const cleanup = () => { v.removeAttribute("src"); v.load(); };
    const fail = (e) => { if (done) return; done = true; cleanup(); reject(e); };

    v.addEventListener("loadedmetadata", () => {
      // Buscar un fotograma representativo (~1s o 10% de la duracion).
      const t = Math.min(1, (v.duration || 2) * 0.1);
      try { v.currentTime = isFinite(t) ? t : 0; } catch (e) { v.currentTime = 0; }
    });
    v.addEventListener("seeked", () => {
      if (done) return;
      done = true;
      try {
        const w = 320;
        const ratio = (v.videoHeight && v.videoWidth) ? v.videoHeight / v.videoWidth : 0.5625;
        const h = Math.round(w * ratio);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(v, 0, 0, w, h);
        const data = c.toDataURL("image/jpeg", 0.7);
        cleanup();
        resolve({ dataUrl: data, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      } catch (e) { cleanup(); reject(e); }
    });
    v.addEventListener("error", () => fail(new Error("No se pudo cargar el video")));
    setTimeout(() => fail(new Error("timeout")), 20000);
  });
}

// Cola con concurrencia limitada (para no saturar el servidor de un hilo).
function makeQueue(concurrency) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= concurrency || q.length === 0) return;
    active++;
    const { fn, resolve, reject } = q.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); next(); });
}
