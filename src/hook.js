// Runs in the page's MAIN world at document_start so it can reach Trade Me's
// google.maps.Map instance. Talks to the isolated content script via
// window.postMessage (namespace "tmsz").
(() => {
  const NS = "tmsz";
  const maps = new Set();      // every google.maps.Map we've seen
  let active = null;           // map currently used for drawing
  let layer = null;            // google.maps.Data bound to `active`
  let zones = [];              // [{oid, name, color, visible, feature}]

  const post = (msg) => window.postMessage({ ns: NS, dir: "toContent", ...msg }, location.origin);

  // ---- map capture -------------------------------------------------------

  function pickActive() {
    for (const m of maps) if (!m.getDiv()?.isConnected) maps.delete(m);
    // Prefer the largest visible map (search results map over thumbnails).
    let best = null, bestArea = 0;
    for (const m of maps) {
      const r = m.getDiv().getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = m; bestArea = area; }
    }
    if (best !== active) {
      layer?.setMap(null);
      active = best;
      layer = null;
      if (active) render();
      post({ type: "mapState", present: !!active });
    }
  }

  function capture(map) {
    if (!map || maps.has(map)) return;
    maps.add(map);
    // Defer: the div may not be laid out yet at construction time.
    setTimeout(pickActive, 0);
  }

  function install(gm) {
    if (gm.__tmszInstalled) return;
    gm.__tmszInstalled = true;

    // 1) Constructor proxy: catches maps created after we install.
    const Orig = gm.Map;
    gm.Map = new Proxy(Orig, {
      construct(target, args, newTarget) {
        const m = Reflect.construct(target, args, newTarget);
        capture(m);
        return m;
      },
    });

    // 2) Prototype taps: catch maps created before we installed (the API can
    //    load and construct before our poll fires). Trade Me calls these on
    //    every idle/pan, so a capture happens on first interaction.
    const P = Orig.prototype;
    for (const name of ["getBounds", "getCenter", "getZoom", "getProjection"]) {
      const fn = P[name];
      if (typeof fn !== "function") continue;
      P[name] = function (...a) {
        if (this instanceof Orig) capture(this);
        return fn.apply(this, a);
      };
    }
  }

  // google.maps is loaded lazily by the SPA; poll until it exists.
  const poll = setInterval(() => {
    const gm = window.google?.maps;
    if (gm?.Map && gm?.Data) { clearInterval(poll); install(gm); }
  }, 50);

  // Periodically re-evaluate (SPA route changes destroy/recreate the map).
  setInterval(pickActive, 1500);

  // ---- rendering ---------------------------------------------------------

  function render() {
    if (!active) return;
    const gm = window.google.maps;
    if (!layer) {
      layer = new gm.Data({ map: active });
      layer.setStyle((f) => {
        const c = f.getProperty("tmszColor");
        return {
          fillColor: c, fillOpacity: 0.12,
          strokeColor: c, strokeOpacity: 0.9, strokeWeight: 2,
          clickable: false, zIndex: 0,
        };
      });
    }
    const old = [];
    layer.forEach((f) => old.push(f));
    old.forEach((f) => layer.remove(f));
    for (const z of zones) {
      if (!z.visible || !z.feature) continue;
      const feature = {
        ...z.feature,
        id: `tmsz-${z.oid}`,
        properties: { ...z.feature.properties, tmszColor: z.color },
      };
      layer.addGeoJson(feature);
    }
  }

  function boundsOf(feature) {
    const b = new window.google.maps.LatLngBounds();
    const walk = (c) => (typeof c[0] === "number" ? b.extend({ lat: c[1], lng: c[0] }) : c.forEach(walk));
    walk(feature.geometry.coordinates);
    return b;
  }

  // ---- messaging ---------------------------------------------------------

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.ns !== NS || e.data.dir !== "toHook") return;
    const msg = e.data;
    switch (msg.type) {
      case "setZones":
        zones = Array.isArray(msg.zones) ? msg.zones : [];
        render();
        break;
      case "fit": {
        const z = zones.find((z) => z.oid === msg.oid);
        if (active && z?.feature) active.fitBounds(boundsOf(z.feature), 40);
        break;
      }
      case "getCenter": {
        const c = active?.getCenter();
        post({ type: "center", reqId: msg.reqId, lat: c?.lat(), lng: c?.lng() });
        break;
      }
      case "ping":
        pickActive();
        post({ type: "mapState", present: !!active });
        break;
    }
  });
})();
