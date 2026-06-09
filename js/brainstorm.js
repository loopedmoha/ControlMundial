// brainstorm.js - configuracion y ordenes de Brainstorm (compartido).
//
// Brainstorm se controla por socket TCP. El navegador no puede abrir sockets,
// asi que las ordenes se envian al backend (/api/brainstorm) y este las manda
// por TCP a la IP y puerto configurados.

const BS_KEY = "cm.brainstorm";
const BS_DEFAULT = { ip: "127.0.0.1", port: 5123, db: "dbs1" };

function getBSConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(BS_KEY) || "{}"); } catch (e) {}
  return Object.assign({}, BS_DEFAULT, saved);
}
function setBSConfig(cfg) {
  const c = Object.assign({}, getBSConfig(), cfg);
  localStorage.setItem(BS_KEY, JSON.stringify(c));
  bus.postMessage({ type: "bsconfig", cfg: c });
  return c;
}

// ---- Constructores de ordenes ----
// Mapa de pantalla -> identificador de primitiva en Brainstorm:
//   Larga -> P1,  Arco -> P2,  Mesa -> P3
const SCREEN_P = { Larga: "P1", Arco: "P2", Mesa: "P3" };

// ENTRADA de primitiva: <db>P{1|2|3}/SUBE{1|2}.  Lleva prefijo <db>.
function cmdEntraPantalla(db, screen, n) {
  return `itemgo("<${db}>${SCREEN_P[screen]}/SUBE${n}", "EVENT_RUN",0, 1)`;
}
// SALIDA de primitiva: <db>P{1|2|3}/SALE.  Lleva prefijo <db>.
// Devuelve un array (se envía directamente, igual que cmdVideoIn / cmdLogo).
function cmdSalePantalla(db, screen) {
  return [`itemgo("<${db}>${SCREEN_P[screen]}/SALE", "EVENT_RUN",0, 1)`];
}
// ENTRA TODO: una sola orden que mete las tres pantallas a la vez.
function cmdEntraTodo(db) {
  return [`itemgo("<${db}>ENTRATODO", "EVENT_RUN",0, 1)`];
}
// Cambio de tipo de textura (TexMedia/TexFile) sobre {pantalla}/Fondo{n}. Sin prefijo <db>.
function cmdTexType(screen, n, type) {
  const tex = type === "video" ? "TexMedia" : "TexFile";
  return `itemset("${SCREEN_P[screen]}/Fondo${n}", "TEX_TYPE", "${tex}")`;
}
// Las rutas van entre comillas simples y con las barras invertidas dobladas,
// tal cual las espera Brainstorm:  'C:\\TrabajosIPF\\...\\fichero.png'
function bsPath(path) {
  return "'" + String(path).replace(/\\/g, "\\\\") + "'";
}
// IMAGEN: fija el fichero de textura sobre {pantalla}/Fondo{n}.
function cmdTexFile(screen, n, path) {
  return `itemset("${SCREEN_P[screen]}/Fondo${n}", "TEX_FILE", ${bsPath(path)})`;
}
// VIDEO: el media-in vive en el propio objeto {pantalla}/Fondo{n}.
function cmdsVideo(screen, n, path) {
  const obj = `${SCREEN_P[screen]}/Fondo${n}`;
  return [
    `itemset("${obj}", "TEX_MEDIA", "${obj}")`,
    `itemset("${obj}", "MEDIAIN_PATH", ${bsPath(path)})`,
    `itemgo("${obj}", "MEDIAIN_PLAYER/PLAY_FORWARD",0,0.2)`,
  ];
}
// Construye la secuencia completa de ENTRA para un elemento.
// SIN cruce: los datos (TEX_TYPE / TEX_FILE / TEX_MEDIA / MEDIAIN_PATH) se cargan
// en Fondo`dataN` y el SUBE dispara con el MISMO número (`subeN` == `dataN`).
// Ejemplo: SUBE1 cambia Fondo1.
function buildEntraCommands(db, screen, dataN, subeN, type, path) {
  const cmds = [cmdTexType(screen, dataN, type)];
  if (type === "video") {
    cmds.push(...cmdsVideo(screen, dataN, path));
  } else {
    cmds.push(cmdTexFile(screen, dataN, path));
  }
  cmds.push(cmdEntraPantalla(db, screen, subeN));
  return cmds;
}
function cmdVideoIn(db, which, action) {
  // which: "P1_PEQUENO" | "P1_LARGO" | "P1_TOTAL" | "P2"   action: "ENTRA" | "SALE"
  return [
    `itemset("<${db}>VIDEO_IN/${which}/${action}", "EVENT_RUN")`,
  ];
}
function cmdLogo(action) {
  // action: "ENTRA" | "SALE"  (va sin prefijo de base de datos)
  return [
    `itemset("LOGO/${action}", "EVENT_RUN")`,
  ];
}

// ---- Envio al backend ----
async function sendBrainstorm(commands) {
  const c = getBSConfig();
  try {
    const r = await fetch("/api/brainstorm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: c.ip, port: Number(c.port) || 5123, commands }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: "Sin conexión con el backend" };
  }
}
// Prueba de conexion: conecta y cierra sin enviar ordenes.
async function testBrainstorm() {
  return sendBrainstorm([]);
}

// ---- Conexion persistente ----
// Abre una conexion que el backend mantiene abierta hasta desconectar.
async function connectBrainstorm() {
  const c = getBSConfig();
  try {
    const r = await fetch("/api/brainstorm/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: c.ip, port: Number(c.port) || 5123 }),
    });
    return await r.json();
  } catch (e) { return { ok: false, connected: false, error: "Sin conexión con el backend" }; }
}
async function disconnectBrainstorm() {
  try { return await (await fetch("/api/brainstorm/disconnect", { method: "POST" })).json(); }
  catch (e) { return { ok: false, connected: false, error: "Sin conexión con el backend" }; }
}
async function bsStatus() {
  try { return await (await fetch("/api/brainstorm/status", { cache: "no-store" })).json(); }
  catch (e) { return { ok: false, connected: false }; }
}
