// Service worker: permite instalar la web como app y abrirla rápido aunque haya poca señal.
// - Archivos de la web: se sirven de la copia guardada al instante y se actualizan por detrás.
//   La página principal se pide a la red primero, pero si tarda más de 4 s se usa la guardada.
// - Mapas de fondo: cada pedazo de mapa que se ve queda guardado (hasta unos 3000).
// - Los datos de Neon no pasan por acá: los guarda la propia web en el dispositivo.
const V = "2026-11-26-16";
const CACHE = "obras-oici-" + V;
const MAPAS = "obras-oici-mapas-v1";
const MAX_TESELAS = 3000;
const BASICOS = ["./", `styles.css?v=${V}`, `app.js?v=${V}`, `api.js?v=${V}`, "config.js", "vendor/neon.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "datos/departamentos.geojson", "manifest.webmanifest",
  "iconos/icono-192.png", "plantillas/verticalidad-monopolo.xlsx", "plantillas/mastil-riendas.xlsx", "plantillas/mastil-verticalidad.xlsx", "plantillas/mastil-esquema.png", "vendor/xlsx/xlsx-estilos.min.js"];
const ES_MAPA = /(^|\.)tile\.openstreetmap\.org$|(^|\.)arcgisonline\.com$/;

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== MAPAS) await caches.delete(k);
    await self.clients.claim();
  })());
});

let guardadas = 0;
async function recortarMapas() {
  const c = await caches.open(MAPAS), claves = await c.keys();
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_TESELAS))) await c.delete(k);
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Mapas de fondo: primero lo guardado
  if (ES_MAPA.test(url.hostname)) {
    ev.respondWith((async () => {
      const c = await caches.open(MAPAS);
      const guardada = await c.match(req);
      if (guardada) return guardada;
      const r = await fetch(req);
      if (r.ok && r.type === "cors") {
        c.put(req, r.clone());
        if (++guardadas % 100 === 0) recortarMapas();
      }
      return r;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Página principal: red con 4 s de espera como máximo
  if (req.mode === "navigate") {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const red = fetch(req, { cache: "no-cache" }).then((r) => { if (r.ok) c.put("./", r.clone()); return r; });
      const guardada = await c.match("./");
      if (!guardada) return red;
      return Promise.race([red.catch(() => guardada), new Promise((ok) => setTimeout(() => ok(guardada), 4000))]);
    })());
    return;
  }

  // Resto de los archivos: lo guardado al instante y se actualiza por detrás
  ev.respondWith((async () => {
    const c = await caches.open(CACHE);
    const guardada = await c.match(req);
    const red = fetch(req, { cache: "no-cache" }).then((r) => { if (r.ok) c.put(req, r.clone()); return r; });
    if (guardada) { ev.waitUntil(red.catch(() => {})); return guardada; }
    return red;
  })());
});
