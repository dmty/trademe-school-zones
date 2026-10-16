// Isolated-world content script: owns the UI and persistence, asks the
// service worker for data, and pushes zones to the MAIN-world hook.
(() => {
  const NS = "tmsz";
  const COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080", "#f032e6", "#9a6324"];
  const MAX_RESULTS = 40;

  let schools = null;          // directory from the zone layer
  let selected = [];           // [{oid, id, name, type, color, visible}]
  const features = new Map();  // oid -> GeoJSON feature
  let mapPresent = false;

  // ---- plumbing ----------------------------------------------------------

  const bg = (msg) =>
    new Promise((resolve, reject) =>
      chrome.runtime.sendMessage(msg, (r) =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message))
          : r?.ok ? resolve(r.data) : reject(new Error(r?.error || "unknown error"))
      )
    );

  const toHook = (msg) => window.postMessage({ ns: NS, dir: "toHook", ...msg }, location.origin);

  const pending = new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.ns !== NS || e.data.dir !== "toContent") return;
    const msg = e.data;
    if (msg.type === "mapState") {
      mapPresent = msg.present;
      if (mapPresent) ui.$(".note").hidden = true;
      if (mapPresent || ui.$(".panel").hidden) ui.root.host.style.display = mapPresent ? "" : "none";
      if (mapPresent) syncHook();
    } else if (msg.reqId && pending.has(msg.reqId)) {
      pending.get(msg.reqId)(msg);
      pending.delete(msg.reqId);
    }
  });

  const askHook = (type) =>
    new Promise((resolve) => {
      const reqId = Math.random().toString(36).slice(2);
      pending.set(reqId, resolve);
      toHook({ type, reqId });
      setTimeout(() => pending.delete(reqId) && resolve(null), 2000);
    });

  // ---- state -------------------------------------------------------------

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  async function persist() {
    await chrome.storage.local.set({
      selected: selected.map(({ oid, id, name, type, color, visible }) => ({ oid, id, name, type, color, visible })),
    });
  }

  function syncHook() {
    toHook({
      type: "setZones",
      zones: selected.map((s) => ({ ...s, feature: features.get(s.oid) || null })),
    });
  }

  function nextColor() {
    const used = new Set(selected.map((s) => s.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[selected.length % COLORS.length];
  }

  async function ensureFeature(oid) {
    if (features.has(oid)) return;
    features.set(oid, await bg({ type: "getZone", oid }));
  }

  async function add(school, { fit = true } = {}) {
    if (selected.some((s) => s.oid === school.oid)) return;
    const entry = { ...school, color: nextColor(), visible: true, loading: true };
    selected.push(entry);
    renderSelected();
    try {
      await ensureFeature(school.oid);
      entry.loading = false;
      syncHook();
      if (fit) toHook({ type: "fit", oid: school.oid });
    } catch (e) {
      entry.loading = false;
      entry.error = e.message;
    }
    renderSelected();
    persist();
  }

  function remove(oid) {
    selected = selected.filter((s) => s.oid !== oid);
    renderSelected(); syncHook(); persist();
  }

  function toggle(oid) {
    const s = selected.find((s) => s.oid === oid);
    if (s) s.visible = !s.visible;
    renderSelected(); syncHook(); persist();
  }

  // ---- UI ----------------------------------------------------------------

  const ui = buildUI();

  function buildUI() {
    const host = document.createElement("div");
    host.style.display = "none";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
        .fab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; border: 0; border-radius: 999px;
               padding: 10px 14px; background: #1f2937; color: #fff; font-size: 13px; font-weight: 600;
               box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; }
        .panel { position: fixed; right: 16px; bottom: 64px; z-index: 2147483000; width: 320px; max-height: 70vh;
                 display: flex; flex-direction: column; background: #fff; color: #111827; border-radius: 12px;
                 box-shadow: 0 10px 30px rgba(0,0,0,.25); font-size: 13px; overflow: hidden; }
        .panel[hidden] { display: none; }
        header { padding: 12px 12px 8px; border-bottom: 1px solid #e5e7eb; }
        h2 { margin: 0 0 8px; font-size: 14px; }
        input { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; }
        input:focus { outline: 2px solid #4363d8; outline-offset: -1px; }
        .row { display: flex; gap: 6px; margin-top: 8px; }
        .btn { border: 1px solid #d1d5db; background: #f9fafb; border-radius: 8px; padding: 6px 8px; font-size: 12px; cursor: pointer; }
        .btn:hover { background: #f3f4f6; }
        .scroll { overflow: auto; }
        .section { padding: 6px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
        ul { list-style: none; margin: 0; padding: 0 6px 6px; }
        li { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 8px; }
        li.pick { cursor: pointer; }
        li.pick:hover { background: #f3f4f6; }
        .name { flex: 1; min-width: 0; }
        .name b { display: block; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .name small { color: #6b7280; }
        .sw { width: 12px; height: 12px; border-radius: 3px; flex: none; }
        .icon { border: 0; background: none; cursor: pointer; padding: 2px 4px; font-size: 14px; color: #4b5563; }
        .icon:hover { color: #111827; }
        .off { opacity: .45; }
        .note { padding: 8px 0 0; }
        .msg { padding: 8px 12px; color: #6b7280; }
        .err { color: #b91c1c; }
        footer { padding: 8px 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
      </style>
      <button class="fab" part="fab">School zones</button>
      <div class="panel" hidden>
        <header>
          <h2>School zones</h2>
          <input type="search" placeholder="Search schools…" autocomplete="off" />
          <div class="row"><button class="btn here">Zones at map centre</button><button class="btn clear">Clear all</button></div>
          <div class="note msg" hidden></div>
        </header>
        <div class="scroll">
          <div class="results"></div>
          <div class="section">On map</div>
          <ul class="selected"></ul>
        </div>
        <footer>Zone data: Ministry of Education (via Eagle Technology). Simplified boundaries — confirm with the school.</footer>
      </div>`;
    (document.body || document.documentElement).appendChild(host);

    const $ = (s) => root.querySelector(s);
    const panel = $(".panel");
    $(".fab").addEventListener("click", async () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { $("input").focus(); await loadSchools(); }
    });
    $("input").addEventListener("input", () => renderResults());
    $(".here").addEventListener("click", zonesHere);
    $(".clear").addEventListener("click", () => { selected = []; renderSelected(); syncHook(); persist(); });
    // Keep Trade Me's keyboard shortcuts from firing while typing.
    for (const ev of ["keydown", "keyup", "keypress"]) $("input").addEventListener(ev, (e) => e.stopPropagation());
    return { root, $ };
  }

  async function loadSchools() {
    if (schools) return;
    ui.$(".results").innerHTML = `<div class="msg">Loading schools…</div>`;
    try {
      schools = (await bg({ type: "listSchools" })).map((s) => ({ ...s, key: norm(s.name) }));
      renderResults();
    } catch (e) {
      ui.$(".results").innerHTML = `<div class="msg err">Couldn't load schools: ${esc(e.message)}</div>`;
    }
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  function schoolLi(s, { pick }) {
    const li = document.createElement("li");
    li.className = pick ? "pick" : "";
    li.innerHTML = `<div class="name"><b title="${esc(s.name)}">${esc(s.name)}</b><small>${esc(s.type || "—")} · #${esc(s.id)}</small></div>`;
    return li;
  }

  function renderList(container, list, emptyMsg, heading) {
    container.innerHTML = "";
    if (heading) container.insertAdjacentHTML("beforeend", `<div class="section">${esc(heading)}</div>`);
    if (!list.length) { container.insertAdjacentHTML("beforeend", `<div class="msg">${esc(emptyMsg)}</div>`); return; }
    const ul = document.createElement("ul");
    for (const s of list) {
      const li = schoolLi(s, { pick: true });
      if (selected.some((x) => x.oid === s.oid)) li.classList.add("off");
      li.addEventListener("click", () => add(s).then(renderResults));
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }

  function renderResults() {
    const q = norm(ui.$("input").value.trim());
    const box = ui.$(".results");
    if (!q) { box.innerHTML = ""; return; }
    if (!schools) return;
    const terms = q.split(/\s+/);
    const hits = schools.filter((s) => terms.every((t) => s.key.includes(t))).slice(0, MAX_RESULTS);
    renderList(box, hits, "No zoned schools match.", "Results");
  }

  async function zonesHere() {
    const box = ui.$(".results");
    const c = await askHook("getCenter");
    if (c?.lat == null) { box.innerHTML = `<div class="msg err">Map not found on this page.</div>`; return; }
    box.innerHTML = `<div class="msg">Looking up zones…</div>`;
    try {
      const list = await bg({ type: "zonesAt", lat: c.lat, lng: c.lng });
      renderList(box, list, "No enrolment zones cover the map centre.", "Zoned for map centre");
    } catch (e) {
      box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
    }
  }

  function renderSelected() {
    const ul = ui.$(".selected");
    ul.innerHTML = "";
    if (!selected.length) { ul.innerHTML = `<div class="msg">Nothing selected yet.</div>`; return; }
    for (const s of selected) {
      const li = schoolLi(s, { pick: false });
      if (!s.visible) li.classList.add("off");
      li.insertAdjacentHTML("afterbegin", `<span class="sw" style="background:${s.color}"></span>`);
      if (s.loading) li.querySelector("small").textContent = "Loading boundary…";
      if (s.error) li.querySelector("small").innerHTML = `<span class="err">${esc(s.error)}</span>`;
      const mk = (label, title, fn) => {
        const b = document.createElement("button");
        b.className = "icon"; b.textContent = label; b.title = title;
        b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
        li.appendChild(b);
      };
      mk("⌖", "Zoom to zone", () => toHook({ type: "fit", oid: s.oid }));
      mk(s.visible ? "◉" : "○", s.visible ? "Hide" : "Show", () => toggle(s.oid));
      mk("✕", "Remove", () => remove(s.oid));
      ul.appendChild(li);
    }
  }

  // Toolbar icon → toggle panel (shown even if no map was detected yet).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "togglePanel") return;
    ui.root.host.style.display = "";
    ui.$(".fab").click();
    if (!mapPresent) {
      ui.$(".note").hidden = false;
      ui.$(".note").innerHTML =
        `No map detected yet — switch to <b>Map view</b> on a property search. If you're already there, pan the map once.`;
    }
  });

  // ---- boot --------------------------------------------------------------

  (async () => {
    const { selected: saved } = await chrome.storage.local.get("selected");
    selected = Array.isArray(saved) ? saved : [];
    renderSelected();
    await Promise.allSettled(selected.map((s) => ensureFeature(s.oid)));
    syncHook();
    toHook({ type: "ping" });
  })();
})();
