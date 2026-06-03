// app.js - cuadricula de fondos, seleccion de pantalla y envio a la escaleta.

const $ = (s) => document.querySelector(s);
const dirInput = $("#dirInput");
const grid = $("#grid");
const statusEl = $("#status");
const emptyState = $("#emptyState");
const actionbar = $("#actionbar");
const selCountEl = $("#selCount");
const toastEl = $("#toast");

let items = [];                  // ficheros cargados de la carpeta
const selected = new Map();      // path -> screen elegida ("Arco"|"Larga"|"Mesa")
const thumbQueue = makeQueue(2); // generacion de miniaturas de video en serie (max 2)

const LAST_DIR_KEY = "cm.lastDir";

// ---- Carga de la carpeta ----
async function loadDir(dir) {
  dir = (dir || "").trim();
  if (!dir) { statusEl.textContent = "Indica una ruta de carpeta."; return; }
  localStorage.setItem(LAST_DIR_KEY, dir);
  statusEl.textContent = "Cargando…";
  grid.innerHTML = "";
  emptyState.style.display = "none";
  selected.clear();
  updateActionbar();

  let res;
  try { res = await apiList(dir); }
  catch (e) { statusEl.textContent = "Error de conexión con el servidor."; return; }

  if (!res.ok) { statusEl.textContent = "⚠️ " + (res.error || "No se pudo leer la carpeta."); return; }

  items = res.items || [];
  if (items.length === 0) {
    statusEl.textContent = res.dir;
    emptyState.style.display = "block";
    return;
  }
  const nImg = items.filter(i => i.type === "image").length;
  const nVid = items.filter(i => i.type === "video").length;
  statusEl.innerHTML = `<b>${items.length}</b> elementos · ${nImg} imágenes · ${nVid} vídeos · <span style="color:var(--muted)">${res.dir}</span>`;
  renderGrid();
}

function renderGrid() {
  grid.innerHTML = "";
  for (const item of items) grid.appendChild(makeCard(item));
}

function makeCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.path = item.path;

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  thumb.title = "Clic para previsualizar";

  const typeBadge = document.createElement("div");
  typeBadge.className = "badge-type";
  typeBadge.textContent = item.type === "video" ? "▶ vídeo" : "🖼 imagen";

  const check = document.createElement("div");
  check.className = "check";
  check.textContent = "✓";

  thumb.appendChild(typeBadge);
  thumb.appendChild(check);

  if (item.type === "image") {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = item.url;
    img.alt = item.name;
    thumb.appendChild(img);
  } else {
    const cached = getCachedThumb(item);
    if (cached) {
      const img = document.createElement("img");
      img.src = cached;
      thumb.appendChild(img);
    } else {
      const sp = document.createElement("div");
      sp.className = "spinner";
      thumb.appendChild(sp);
      thumbQueue(() => generateVideoThumb(item)).then(({ dataUrl, duration }) => {
        setCachedThumb(item, dataUrl);
        item._duration = duration;
        sp.remove();
        const img = document.createElement("img");
        img.src = dataUrl;
        thumb.appendChild(img);
        if (duration) addDuration(thumb, duration);
      }).catch(() => {
        sp.remove();
        const ph = document.createElement("div");
        ph.className = "placeholder";
        ph.textContent = "Sin miniatura\n(" + item.ext + ")";
        thumb.appendChild(ph);
      });
    }
  }

  // Clic en la miniatura -> previsualizar en ventana nueva
  thumb.addEventListener("click", () => previewItem(item));

  const body = document.createElement("div");
  body.className = "card-body";
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = item.name;
  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.textContent = fmtSize(item.size);
  body.appendChild(name);
  body.appendChild(meta);

  // Selector de pantalla
  const pick = document.createElement("div");
  pick.className = "screen-pick";
  for (const s of SCREENS) {
    const b = document.createElement("button");
    b.textContent = s;
    b.dataset.screen = s;
    b.className = SCREEN_CLASS[s];
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const cur = selected.get(item.path);
      if (cur === s) {
        selected.delete(item.path); // volver a pulsar la misma = deseleccionar
      } else {
        selected.set(item.path, s);
      }
      syncCard(card, item);
      updateActionbar();
    });
    pick.appendChild(b);
  }
  body.appendChild(pick);

  card.appendChild(thumb);
  card.appendChild(body);
  syncCard(card, item);
  return card;
}

function addDuration(thumb, dur) {
  const d = document.createElement("div");
  d.className = "badge-dur";
  const m = Math.floor(dur / 60), s = Math.floor(dur % 60);
  d.textContent = m + ":" + String(s).padStart(2, "0");
  thumb.appendChild(d);
}

function syncCard(card, item) {
  const screen = selected.get(item.path);
  card.classList.toggle("selected", !!screen);
  card.querySelectorAll(".screen-pick button").forEach(b => {
    b.classList.toggle("on", b.dataset.screen === screen);
  });
}

function updateActionbar() {
  const n = selected.size;
  selCountEl.textContent = n + (n === 1 ? " seleccionado" : " seleccionados");
  actionbar.classList.toggle("show", n > 0);
}

// ---- Acciones masivas ----
function applyBulkScreen(screen) {
  // Asigna una pantalla a todo lo seleccionado; si no hay nada, a todo lo visible.
  if (selected.size === 0) {
    for (const it of items) selected.set(it.path, screen);
  } else {
    for (const p of selected.keys()) selected.set(p, screen);
  }
  document.querySelectorAll(".card").forEach(card => {
    const it = items.find(i => i.path === card.dataset.path);
    if (it) syncCard(card, it);
  });
  updateActionbar();
}

async function addSelectedToEscaleta() {
  if (selected.size === 0) return;
  const current = await apiGetEscaleta();
  const list = Array.isArray(current) ? current : [];
  let added = 0;
  for (const item of items) {
    const screen = selected.get(item.path);
    if (!screen) continue;
    list.push({
      id: uid(),
      name: item.name,
      path: item.path,
      url: item.url,
      type: item.type,
      ext: item.ext,
      size: item.size,
      mtime: item.mtime,
      thumb: item.type === "video" ? getCachedThumb(item) : item.url,
      screen,
      addedAt: Date.now(),
    });
    added++;
  }
  await apiSaveEscaleta(list);
  broadcastEscaleta(list);
  selected.clear();
  document.querySelectorAll(".card").forEach(card => {
    const it = items.find(i => i.path === card.dataset.path);
    if (it) syncCard(card, it);
  });
  updateActionbar();
  showToast(`✓ ${added} ${added === 1 ? "elemento añadido" : "elementos añadidos"} a la escaleta`);
}

// ---- Previsualizacion en ventana nueva ----
function previewItem(item) {
  const w = window.open("", "preview_" + item.name, "width=960,height=600");
  if (!w) return;
  const media = item.type === "video"
    ? `<video src="${item.url}" controls autoplay style="max-width:100%;max-height:100vh"></video>`
    : `<img src="${item.url}" style="max-width:100%;max-height:100vh" />`;
  w.document.write(`<title>${item.name}</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh">${media}</body>`);
  w.document.close();
}

// ---- Escaleta en ventana aparte ----
function openEscaletaWindow() {
  window.open("escaleta.html", "escaleta_mundial", "width=1100,height=760");
}

// ---- Explorador de carpetas ----
const modal = $("#modal");
const modalDirs = $("#modalDirs");
const modalCur = $("#modalCur");
let modalCurrent = "";

async function openBrowser(startDir) {
  modal.classList.add("show");
  await navigateDirs(startDir || dirInput.value.trim() || "");
}
async function navigateDirs(dir) {
  let res;
  try { res = await apiDirs(dir); }
  catch (e) { modalDirs.innerHTML = "<div style='padding:16px;color:var(--muted)'>Error de conexión.</div>"; return; }
  if (!res.ok) { res = await apiDirs(""); } // si falla, volver a las unidades
  modalCurrent = res.current || "";
  modalCur.textContent = modalCurrent || "Equipo (unidades)";
  modalDirs.innerHTML = "";

  if (res.parent || res.current) {
    const up = dirItem("⬆️", res.parent ? ".. (subir)" : ".. (unidades)", () => navigateDirs(res.parent || ""));
    modalDirs.appendChild(up);
  }
  for (const d of (res.dirs || [])) {
    modalDirs.appendChild(dirItem("📁", d.name, () => navigateDirs(d.path)));
  }
  if ((res.dirs || []).length === 0) {
    const none = document.createElement("div");
    none.style.cssText = "padding:14px;color:var(--muted)";
    none.textContent = "(sin subcarpetas)";
    modalDirs.appendChild(none);
  }
}
function dirItem(ic, label, onClick) {
  const b = document.createElement("button");
  b.className = "dir-item";
  b.innerHTML = `<span class="ic">${ic}</span><span></span>`;
  b.querySelector("span:last-child").textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// ---- Toast ----
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

// ---- Eventos ----
$("#loadBtn").addEventListener("click", () => loadDir(dirInput.value));
dirInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loadDir(dirInput.value); });
$("#browseBtn").addEventListener("click", () => openBrowser());
$("#openEscaleta").addEventListener("click", openEscaletaWindow);
$("#clearSel").addEventListener("click", () => {
  selected.clear();
  document.querySelectorAll(".card").forEach(card => {
    const it = items.find(i => i.path === card.dataset.path);
    if (it) syncCard(card, it);
  });
  updateActionbar();
});
$("#addBtn").addEventListener("click", addSelectedToEscaleta);
document.querySelectorAll(".bulk button").forEach(b => {
  b.addEventListener("click", () => applyBulkScreen(b.dataset.screen));
});
$("#modalCancel").addEventListener("click", () => modal.classList.remove("show"));
$("#modalUse").addEventListener("click", () => {
  if (modalCurrent) { dirInput.value = modalCurrent; modal.classList.remove("show"); loadDir(modalCurrent); }
});
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });

// ---- Inicio ----
const last = localStorage.getItem(LAST_DIR_KEY);
if (last) { dirInput.value = last; loadDir(last); }
