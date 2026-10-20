const CACHE = 'mango-v88';
const ASSETS = [
  '/MangoApp/operatore.html',
  '/MangoApp/responsabile.html',
  '/MangoApp/ufficio.html',
  '/MangoApp/schermo.html',
  '/MangoApp/manifest.json',
  '/MangoApp/manifest-responsabile.json',
  '/MangoApp/manifest-ufficio.json',
  '/MangoApp/manifest-schermo.json',
  '/MangoApp/icon-192.png',
  '/MangoApp/icon-512.png',
  '/MangoApp/js/config.deploy.js',
  '/MangoApp/js/config.js',
  '/MangoApp/js/comune.js',
  '/MangoApp/js/etichette.js',
  '/MangoApp/js/calendario.js',
  '/MangoApp/js/flusso-schermo.js',
  '/MangoApp/js/tema.js',
  '/MangoApp/js/icone.js',
  '/MangoApp/js/pin-pad.js',
  '/MangoApp/js/accesso.js',
  '/MangoApp/js/regole-pin.js',
  '/MangoApp/css/tema.css',
  '/MangoApp/css/responsabile.css',
  '/MangoApp/js/responsabile/stato.js',
  '/MangoApp/js/responsabile/dati.js',
  '/MangoApp/js/responsabile/stime.js',
  '/MangoApp/js/responsabile/sistema.js',
  '/MangoApp/js/responsabile/orario.js',
  '/MangoApp/js/responsabile/anagrafiche.js',
  '/MangoApp/js/responsabile/lavorazioni.js',
  '/MangoApp/js/responsabile/notifiche.js',
  '/MangoApp/js/responsabile/archivio.js',
  '/MangoApp/js/responsabile/tempi-kpi.js',
  '/MangoApp/js/responsabile/oggi.js',
  '/MangoApp/js/responsabile/pianificazione.js',
  '/MangoApp/js/responsabile/assenze.js',
  '/MangoApp/js/responsabile/operatori.js',
  '/MangoApp/fonts/Geist-Variable.woff2',
  '/MangoApp/fonts/GeistMono-Variable.woff2',
  '/MangoApp/fonts/OFL-Geist.txt'
];

// Push: responsabile.html passa questo file a OneSignal come service worker, quindi deve contenere
// anche il codice push di OneSignal (come OneSignalSDKWorker.js per gli operatori). Prima il
// controllo dell'URL al clic (solo pagine dell'app), poi OneSignal. Se la CDN di OneSignal non
// risponde il service worker si installa lo stesso: la cache dell'app non dipende dalle push.
importScripts('js/sw-push.js');
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) {
  console.warn('SW: OneSignal non caricato, push non disponibili', e);
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // Genuine update only if an old-named cache exists (previous SW version).
    // First install or post-eviction reinstall: no old cache → no banner.
    const isUpdate = keys.some(k => k !== CACHE);
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    if (isUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
    }
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
