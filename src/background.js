// Service worker: all network access to the zone FeatureServer lives here.
// Trade Me's CSP blocks page-context fetches to arcgis.com; extension
// fetches with host_permissions are not subject to it.

const LAYER =
  "https://services.arcgis.com/XTtANUDT8Va4DLwI/arcgis/rest/services/NZ_School_Zone_boundaries/FeatureServer/0";
const SCHOOLS_TTL_MS = 7 * 24 * 3600 * 1000;
const zoneCache = new Map(); // OBJECTID -> GeoJSON Feature (per worker lifetime)

const qs = (params) => new URLSearchParams({ f: "json", ...params }).toString();

async function query(params) {
  const res = await fetch(`${LAYER}/query?${qs(params)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "ArcGIS error");
  return body;
}

function toSchool(a) {
  return {
    oid: a.OBJECTID,
    id: a.School_ID,
    name: a.School_name,
    type: a.Institution_type || "",
    effective: a.Effective_date || null,
  };
}

async function listSchools() {
  const { schoolsCache } = await chrome.storage.local.get("schoolsCache");
  if (schoolsCache && Date.now() - schoolsCache.at < SCHOOLS_TTL_MS) return schoolsCache.schools;

  // Layer has ~1.3k features, maxRecordCount 2000 — page defensively anyway.
  const schools = [];
  for (let offset = 0; ; offset += 1000) {
    const body = await query({
      where: "1=1",
      outFields: "OBJECTID,School_ID,School_name,Institution_type,Effective_date",
      returnGeometry: "false",
      orderByFields: "School_name",
      resultOffset: offset,
      resultRecordCount: 1000,
    });
    schools.push(...body.features.map((f) => toSchool(f.attributes)));
    if (!body.exceededTransferLimit) break;
  }
  await chrome.storage.local.set({ schoolsCache: { at: Date.now(), schools } });
  return schools;
}

async function getZone(oid) {
  if (zoneCache.has(oid)) return zoneCache.get(oid);
  const res = await fetch(
    `${LAYER}/query?${new URLSearchParams({
      objectIds: String(oid),
      outFields: "OBJECTID,School_ID,School_name",
      outSR: "4326",
      geometryPrecision: "6",
      f: "geojson",
    })}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fc = await res.json();
  const feature = fc.features?.[0];
  if (!feature) throw new Error(`No zone for OBJECTID ${oid}`);
  zoneCache.set(oid, feature);
  return feature;
}

async function zonesAt({ lat, lng }) {
  const body = await query({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,School_ID,School_name,Institution_type,Effective_date",
    returnGeometry: "false",
  });
  return body.features.map((f) => toSchool(f.attributes));
}

const handlers = { listSchools, getZone: ({ oid }) => getZone(oid), zonesAt };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  Promise.resolve(fn(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true; // async response
});

// Toolbar icon: toggle the panel on Trade Me, otherwise open a property search.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.startsWith("https://www.trademe.co.nz/")) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "togglePanel" });
      return;
    } catch {
      // Content script not injected (tab opened before install) — reload it.
      await chrome.tabs.reload(tab.id);
      return;
    }
  }
  chrome.tabs.create({ url: "https://www.trademe.co.nz/a/property/residential/sale/search" });
});
