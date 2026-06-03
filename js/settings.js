// settings.js - modal de configuracion de Brainstorm (compartido por las 2 ventanas).
// Requiere que exista en el HTML un boton #bsGear y el contenedor del modal (lo crea solo).

(function () {
  // Crear el modal una vez.
  const html = `
  <div class="modal-backdrop" id="bsModal">
    <div class="modal">
      <header><h2>⚙️ Conexión con Brainstorm</h2></header>
      <div style="padding:16px 18px; display:flex; flex-direction:column; gap:14px">
        <label class="fld"><span>IP</span>
          <input type="text" id="bsIp" placeholder="127.0.0.1" />
          <small>IP del equipo donde corre Brainstorm.</small>
        </label>
        <label class="fld"><span>Puerto</span>
          <input type="number" id="bsPort" />
          <small>Por defecto 5123.</small>
        </label>
        <label class="fld"><span>DB</span>
          <input type="text" id="bsDb" placeholder="dbs1" />
          <small>Base de datos. Se usa como prefijo &lt;db&gt; en las órdenes.</small>
        </label>
        <div class="bs-conn" style="margin-top:2px">
          <span class="dot" id="bsModalDot"></span>
          <span id="bsModalState">—</span>
        </div>
        <div id="bsTestStatus" class="bs-test"></div>
      </div>
      <footer>
        <button class="btn" id="bsConnectM">🔌 Conectar</button>
        <button class="btn ghost" id="bsDisconnectM">⛔ Cerrar</button>
        <div style="flex:1"></div>
        <button class="btn ghost" id="bsCancel">Cancelar</button>
        <button class="btn primary" id="bsSave">Guardar</button>
      </footer>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);

  const modal = document.getElementById("bsModal");
  const ip = document.getElementById("bsIp");
  const port = document.getElementById("bsPort");
  const db = document.getElementById("bsDb");
  const status = document.getElementById("bsTestStatus");
  const mDot = document.getElementById("bsModalDot");
  const mState = document.getElementById("bsModalState");

  function fill() {
    const c = getBSConfig();
    ip.value = c.ip; port.value = c.port; db.value = c.db;
    status.textContent = ""; status.className = "bs-test";
  }
  async function refreshModalConn() {
    const s = await bsStatus();
    if (s.connected) { mDot.className = "dot ok"; mState.textContent = "Conectado a " + (s.addr || ""); }
    else { mDot.className = "dot"; mState.textContent = "Desconectado"; }
  }
  function open() { fill(); refreshModalConn(); modal.classList.add("show"); }
  function close() { modal.classList.remove("show"); }

  function currentForm() {
    return { ip: ip.value.trim() || "127.0.0.1", port: Number(port.value) || 5123, db: db.value.trim() || "dbs1" };
  }

  document.getElementById("bsSave").addEventListener("click", () => {
    setBSConfig(currentForm());
    close();
    if (typeof onBSConfigSaved === "function") onBSConfigSaved(getBSConfig());
  });
  document.getElementById("bsCancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  document.getElementById("bsConnectM").addEventListener("click", async () => {
    setBSConfig(currentForm());      // conectar con lo que haya en el formulario
    status.textContent = "Conectando…"; status.className = "bs-test";
    const r = await connectBrainstorm();
    if (r.ok && r.connected) { status.textContent = "✓ Conectado"; status.className = "bs-test ok"; }
    else { status.textContent = "✗ " + (r.error || "No se pudo conectar"); status.className = "bs-test err"; }
    refreshModalConn();
    bus.postMessage({ type: "bsconn" });
  });
  document.getElementById("bsDisconnectM").addEventListener("click", async () => {
    await disconnectBrainstorm();
    status.textContent = "Conexión cerrada"; status.className = "bs-test";
    refreshModalConn();
    bus.postMessage({ type: "bsconn" });
  });

  const gear = document.getElementById("bsGear");
  if (gear) gear.addEventListener("click", open);

  // Exponer por si hace falta abrirlo desde otro sitio.
  window.openBSSettings = open;
})();
