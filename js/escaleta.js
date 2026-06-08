// escaleta.js - ventana de la escaleta (rundown) + control de Brainstorm.

const $ = (s) => document.querySelector(s);
const rowsEl = $("#rows");
const emptyEl = $("#empty");
const countEl = $("#count");
const stage = $("#stage");
const previewInfo = $("#previewInfo");
const toastEl = $("#toast");

let list = [];
let filter = "all";
let selectedId = null;   // id del elemento seleccionado (click en su fila)

// Elementos actualmente visibles segun el filtro, en orden de la escaleta.
function currentView() {
  return filter === "all" ? list : list.filter(i => i.screen === filter);
}

// Estado de primitivas: cual entra la PROXIMA vez en cada pantalla.
// Se PERSISTE en localStorage para que se mantenga entre sesiones (no se
// reinicia al cerrar/abrir la escaleta).
const nextPrim = { Arco: 1, Larga: 1, Mesa: 1 };
// Que elemento esta en aire en cada pantalla (id) y con que primitiva entro cada uno.
const onAir = { Arco: null, Larga: null, Mesa: null };
const enteredPrim = {}; // id -> 1|2

// Persistencia del estado de primitivas entre sesiones.
const PRIM_KEY = "cm.primstate";
function savePrimState() {
  try { localStorage.setItem(PRIM_KEY, JSON.stringify({ nextPrim, onAir, enteredPrim })); } catch (e) {}
}
function loadPrimState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(PRIM_KEY) || "{}"); } catch (e) { return; }
  if (s && s.nextPrim) Object.assign(nextPrim, s.nextPrim);
  if (s && s.onAir) Object.assign(onAir, s.onAir);
  if (s && s.enteredPrim) Object.assign(enteredPrim, s.enteredPrim);
}

// ---- Carga / persistencia de la escaleta ----
async function load() {
  const data = await apiGetEscaleta();
  list = Array.isArray(data) ? data : [];
  render();
}
async function persist() {
  await apiSaveEscaleta(list);
  broadcastEscaleta(list);
  render();
}

function render() {
  const view = currentView();
  countEl.textContent = list.length + (list.length === 1 ? " elemento" : " elementos");
  rowsEl.innerHTML = "";
  emptyEl.style.display = list.length === 0 ? "block" : "none";

  // Si el seleccionado ya no esta visible, descartar la seleccion.
  if (selectedId !== null && !view.some(i => i.id === selectedId)) selectedId = null;

  view.forEach((item) => {
    const realIdx = list.indexOf(item);
    const row = document.createElement("div");
    row.className = "esc-row " + (SCREEN_CLASS[item.screen] || "");
    if (onAir[item.screen] === item.id) row.classList.add("onair");
    if (selectedId === item.id) row.classList.add("selected");
    row.addEventListener("click", () => selectItem(item));

    const idx = document.createElement("div");
    idx.className = "esc-idx";
    idx.textContent = (realIdx + 1);

    let thumbEl;
    if (item.thumb) {
      thumbEl = document.createElement("img");
      thumbEl.className = "esc-thumb";
      thumbEl.src = item.thumb;
    } else {
      thumbEl = document.createElement("div");
      thumbEl.className = "esc-thumb esc-thumb-ph";
      thumbEl.textContent = item.type === "video" ? "▶" : "🖼";
    }
    thumbEl.title = "Previsualizar";
    thumbEl.addEventListener("click", (e) => { e.stopPropagation(); preview(item); });

    const info = document.createElement("div");
    info.className = "esc-info";
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = item.name;
    const mt = document.createElement("div");
    mt.className = "mt";
    const badge = `<span class="screen-badge ${SCREEN_CLASS[item.screen]}">${item.screen}</span>`;
    const primTag = enteredPrim[item.id] ? `<span class="prim-tag">entró Sube${enteredPrim[item.id]}</span>` : "";
    mt.innerHTML = `${badge} · ${item.type === "video" ? "vídeo" : "imagen"} · ${fmtSize(item.size)}${primTag}`;
    info.appendChild(nm);
    info.appendChild(mt);

    const actions = document.createElement("div");
    actions.className = "esc-actions";
    actions.addEventListener("click", (e) => e.stopPropagation());  // no seleccionar al usar los botones
    const entraBtn = document.createElement("button");
    entraBtn.className = "icon-btn entra";
    entraBtn.textContent = "ENTRA";
    const sN = nextPrim[item.screen];
    entraBtn.title = `Enviar a Brainstorm: SubePantalla${item.screen}${sN}/ENTRA (datos en primitiva ${sN === 1 ? 2 : 1})`;
    entraBtn.addEventListener("click", () => entrar(item));
    actions.appendChild(entraBtn);
    actions.appendChild(iconBtn("▲", "Subir", () => move(realIdx, -1)));
    actions.appendChild(iconBtn("▼", "Bajar", () => move(realIdx, 1)));
    actions.appendChild(iconBtn("✕", "Quitar", () => remove(realIdx), true));

    row.appendChild(idx);
    row.appendChild(thumbEl);
    row.appendChild(info);
    row.appendChild(actions);
    rowsEl.appendChild(row);
  });
}

function iconBtn(txt, title, onClick, danger) {
  const b = document.createElement("button");
  b.className = "icon-btn" + (danger ? " del" : "");
  b.textContent = txt;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function move(idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= list.length) return;
  const tmp = list[idx]; list[idx] = list[j]; list[j] = tmp;
  persist();
}
function remove(idx) {
  const it = list[idx];
  if (it && onAir[it.screen] === it.id) { onAir[it.screen] = null; savePrimState(); }
  list.splice(idx, 1);
  persist();
}

// ---- Seleccion de elemento (click en la fila) ----
function selectItem(item) {
  selectedId = item.id;
  render();
  preview(item);
}

// SIGUIENTE: ejecuta el ENTRA del elemento seleccionado y pasa la seleccion
// al siguiente elemento de la lista (en el orden visible segun el filtro).
async function siguiente() {
  const view = currentView();
  if (view.length === 0) return;
  const idx = view.findIndex(i => i.id === selectedId);
  if (idx === -1) {                 // nada seleccionado: selecciona el primero
    selectItem(view[0]);
    showToast("Selecciona y pulsa SIGUIENTE para lanzar el ENTRA");
    return;
  }
  await entrar(view[idx]);          // lanza el ENTRA del seleccionado
  const next = view[idx + 1];
  if (next) selectItem(next);       // y avanza al siguiente
  else showToast("Fin de la lista");
}

function preview(item) {
  stage.innerHTML = "";
  if (item.type === "video") {
    const v = document.createElement("video");
    v.src = item.url; v.controls = true; v.autoplay = true; v.muted = true;
    stage.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.src = item.url;
    stage.appendChild(img);
  }
  previewInfo.innerHTML = `<b>${item.name}</b> — <span class="screen-badge ${SCREEN_CLASS[item.screen]}">${item.screen}</span>`;
}

// ---- ENTRA: enviar la orden a Brainstorm con la primitiva que toca ----
async function entrar(item) {
  const screen = item.screen;            // Arco | Larga | Mesa
  const sube = nextPrim[screen];         // SubePantalla que se ejecuta (empieza en 1)
  const dataN = sube === 1 ? 2 : 1;      // los datos se cargan en la primitiva contraria
  const cfg = getBSConfig();
  // Secuencia completa: TEX_TYPE + ruta/media en la primitiva `dataN` + ENTRA de SubePantalla `sube`.
  const cmds = buildEntraCommands(cfg.db, screen, dataN, sube, item.type, item.path);
  const r = await sendBrainstorm(cmds);
  if (r.ok) {
    nextPrim[screen] = sube === 1 ? 2 : 1;            // solo ENTRA alterna
    onAir[screen] = item.id;
    enteredPrim[item.id] = sube;
    savePrimState();
    updatePrimUI();
    render();
    showToast(`▶ ENTRA ${screen} · Sube${sube} (datos P${dataN}) · ${item.name}`);
  } else {
    showToast("✗ " + (r.error || "No se pudo enviar"), true);
  }
  refreshBSLog();
  refreshConn();
}

async function videoIn(which, action) {
  const cfg = getBSConfig();
  const r = await sendBrainstorm(cmdVideoIn(cfg.db, which, action));
  if (r.ok) { showToast(`▶ VIDEO IN ${which} · ${action}`); }
  else { showToast("✗ " + (r.error || "Error"), true); }
  refreshBSLog();
  refreshConn();
}

async function logo(action) {
  const r = await sendBrainstorm(cmdLogo(action));
  if (r.ok) { showToast(`▶ LOGO · ${action}`); }
  else { showToast("✗ " + (r.error || "Error"), true); }
  refreshBSLog();
  refreshConn();
}

// ---- Registro de ordenes (log) ----
async function refreshBSLog() {
  let text = "";
  try { text = await (await fetch("/api/brainstorm/log", { cache: "no-store" })).text(); } catch (e) { return; }
  const cont = $("#bsLog");
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length === 0) {
    cont.innerHTML = '<div class="bs-log-empty">Sin órdenes todavía.</div>';
    return;
  }
  cont.innerHTML = "";
  for (const l of lines) {
    const div = document.createElement("div");
    let cls = "ln";
    if (/ERROR|NO ENVIADO/.test(l)) cls += " err";
    else if (/ENVIADO|CONEXION OK/.test(l)) cls += " ok";
    div.className = cls;
    div.textContent = l;
    cont.appendChild(div);
  }
  cont.scrollTop = cont.scrollHeight;
}
async function clearBSLog() {
  try { await fetch("/api/brainstorm/log?clear=1", { cache: "no-store" }); } catch (e) {}
  refreshBSLog();
}

// ---- Panel de Brainstorm ----
function updatePrimUI() {
  for (const s of ["Arco", "Larga", "Mesa"]) {
    const el = document.getElementById("prim" + s);
    el.textContent = nextPrim[s];
    el.className = "num " + (nextPrim[s] === 1 ? "p1" : "p2");
  }
}
function updateAddr() {
  const c = getBSConfig();
  $("#bsAddr").textContent = `${c.ip}:${c.port} · ${c.db}`;
}
let bsConnected = false;
function applyConnUI(connected, addr) {
  bsConnected = !!connected;
  const dot = $("#bsDot"), st = $("#bsState"), btn = $("#bsConnBtn");
  if (bsConnected) {
    dot.className = "dot ok"; st.textContent = "Conectado";
    btn.textContent = "⛔ Cerrar conexión"; btn.classList.add("danger-btn");
  } else {
    dot.className = "dot"; st.textContent = "Desconectado";
    btn.textContent = "🔌 Conectar"; btn.classList.remove("danger-btn");
  }
  updateAddr();
}
async function refreshConn() {
  const s = await bsStatus();
  applyConnUI(!!s.connected, s.addr);
}

// ---- Toast ----
let toastTimer;
function showToast(msg, isErr) {
  toastEl.textContent = msg;
  toastEl.style.background = isErr ? "#7f1d1d" : "#1f6f3a";
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

// ---- Sincronizacion en vivo entre ventanas ----
bus.addEventListener("message", (ev) => {
  if (!ev.data) return;
  if (ev.data.type === "escaleta") {
    list = Array.isArray(ev.data.list) ? ev.data.list : [];
    render();
  } else if (ev.data.type === "bsconfig") {
    updateAddr();
  } else if (ev.data.type === "bsconn") {
    refreshConn();   // otra ventana abrió/cerró la conexión
  }
});

// ---- Eventos ----
document.querySelectorAll(".chip").forEach(c => {
  c.addEventListener("click", () => {
    filter = c.dataset.f;
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("active", "arco", "larga", "mesa"));
    c.classList.add("active");
    if (filter !== "all") c.classList.add(SCREEN_CLASS[filter]);
    render();
  });
});
document.querySelectorAll(".vid-ins button").forEach(b => {
  b.addEventListener("click", () => videoIn(b.dataset.vin, b.dataset.act));
});
document.querySelectorAll(".logo-ins button").forEach(b => {
  b.addEventListener("click", () => logo(b.dataset.act));
});
$("#nextBtn").addEventListener("click", siguiente);
$("#reload").addEventListener("click", load);
$("#clearAll").addEventListener("click", () => {
  if (list.length === 0) return;
  if (confirm("¿Vaciar toda la escaleta?")) {
    list = [];
    onAir.Arco = onAir.Larga = onAir.Mesa = null;
    persist();
  }
});
$("#bsConnBtn").addEventListener("click", async () => {
  if (bsConnected) {
    await disconnectBrainstorm();
    applyConnUI(false);
    showToast("⛔ Conexión cerrada");
  } else {
    $("#bsState").textContent = "Conectando…";
    const r = await connectBrainstorm();
    if (r.ok && r.connected) { applyConnUI(true, r.addr); showToast("✓ Conectado a Brainstorm"); }
    else { applyConnUI(false); showToast("✗ " + (r.error || "No conecta"), true); }
  }
  bus.postMessage({ type: "bsconn" });   // avisar a la otra ventana
  refreshBSLog();
});
$("#bsLogRefresh").addEventListener("click", refreshBSLog);
$("#bsLogClear").addEventListener("click", clearBSLog);
$("#resetPrims").addEventListener("click", () => {
  nextPrim.Arco = nextPrim.Larga = nextPrim.Mesa = 1;
  onAir.Arco = onAir.Larga = onAir.Mesa = null;
  for (const k in enteredPrim) delete enteredPrim[k];
  savePrimState();
  updatePrimUI();
  render();
  showToast("↺ Primitivas reiniciadas a 1");
});

// ---- Modo desarrollador ----
// Oculta/muestra las herramientas marcadas con .dev-only (primitivas, reinicio y log).
const DEV_KEY = "cm.devmode";
function applyDevMode(on) {
  document.body.classList.toggle("dev-mode", on);
  $("#devToggle").classList.toggle("active", on);
}
$("#devToggle").addEventListener("click", () => {
  const on = !document.body.classList.contains("dev-mode");
  localStorage.setItem(DEV_KEY, on ? "1" : "0");
  applyDevMode(on);
  showToast(on ? "🛠️ Modo dev activado" : "Modo dev desactivado");
});
applyDevMode(localStorage.getItem(DEV_KEY) === "1");

// Llamado por settings.js al guardar configuracion.
function onBSConfigSaved() { updateAddr(); }

// ---- Inicio ----
loadPrimState();   // recupera el estado de primitivas de la sesion anterior
updatePrimUI();
refreshConn();   // refleja si ya habia una conexion persistente abierta
refreshBSLog();
load();
