/* Operaciones ION · service worker
   Permite abrir la app sin señal. Primero intenta la red (para recibir
   actualizaciones) y, si no responde en 4 segundos, usa la copia guardada.
   Si agrega archivos nuevos a la app, súmelos a ARCHIVOS y cambie VERSION. */
const VERSION = 'ops-v1.1.0';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/app.js',
  './js/forms/solicitud-materiales.js',
  './js/forms/avance-comun.js',
  './js/forms/reporte-diario.js',
  './js/forms/avance-oficina.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './img/logo-ion.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('ops-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos propios de la app. Los envíos a Google pasan directo a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(redPrimero(req));
});

async function redPrimero(req) {
  const cache = await caches.open(VERSION);
  const desdeRed = fetch(req).then((r) => {
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  });
  desdeRed.catch(() => { /* se maneja abajo */ });
  const tiempo = new Promise((res) => setTimeout(() => res(null), 4000));
  try {
    const r = await Promise.race([desdeRed, tiempo]);
    if (r) return r;
  } catch (err) { /* sin red */ }
  const guardado = await cache.match(req, { ignoreSearch: true });
  if (guardado) return guardado;
  return desdeRed; // sin copia guardada: esperar a la red
}
