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
// Prefijo de base de datos: <db>. Solo lo llevan SubePantalla* y VIDEOIN*.
// PrimitivaPantalla* va sin prefijo (tal cual el listado de Brainstorm).
function cmdEntraPantalla(db, screen, n) {
  return `itemgo("<${db}>SubePantalla${screen}${n}/ENTRA", "EVENT_RUN",0, 1)`;
}
function cmdTexType(screen, n, type) {
  const tex = type === "video" ? "TexMedia" : "TexFile";
  return `itemset("PrimitivaPantalla${screen}${n}", "TEX_TYPE", "${tex}")`;
}
// Las rutas van entre comillas simples y con las barras invertidas dobladas,
// tal cual las espera Brainstorm:  'C:\\TrabajosIPF\\...\\fichero.png'
function bsPath(path) {
  return "'" + String(path).replace(/\\/g, "\\\\") + "'";
}
// IMAGEN: fija el fichero de textura de la primitiva.
function cmdTexFile(screen, n, path) {
  return `itemset("PrimitivaPantalla${screen}${n}", "TEX_FILE", ${bsPath(path)})`;
}
// VIDEO: asocia el objeto de media, fija su ruta y lo arranca.
function cmdsVideo(screen, n, path) {
  return [
    `itemset("PrimitivaPantalla${screen}${n}", "TEX_MEDIA", "VideoPantalla${screen}${n}")`,
    `itemset("VideoPantalla${screen}${n}", "MEDIAIN_PATH", ${bsPath(path)})`,
    `itemgo("VideoPantalla${screen}${n}", "MEDIAIN_PLAYER/PLAY_FORWARD",0,0.2)`,
  ];
}
// Construye la secuencia completa de ENTRA para un elemento.
// OJO al cruce: los datos (TEX_TYPE / TEX_FILE / TEX_MEDIA / MEDIAIN_PATH) se cargan
// en la primitiva `dataN`, pero el ENTRA dispara SubePantalla con el número CONTRARIO
// (`subeN`). Ejemplo: datos en la 2 -> se ejecuta SubePantalla1.
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
  // which: "CORTO" | "LARGO" | "ARCO"   action: "ENTRA" | "SALE"
  return [
    `itemset("<${db}>VIDEOIN${which}/${action}", "EVENT_RUN")`,
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
