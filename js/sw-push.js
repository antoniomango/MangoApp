// js/sw-push.js — importato dai service worker dell'app (sw.js e OneSignalSDKWorker.js) PRIMA del
// codice OneSignal. Il clic su una notifica push apre solo pagine dell'app: stessa origine e dentro
// lo scope del service worker (es. /MangoApp/responsabile.html?sezione=richieste, /MangoApp/ufficio.html).
// L'URL arriva dal trigger trigger_push_notifica (app_base_url + push_url_notifica) oppure dalla edge
// function send-push; qualunque altro indirizzo viene ignorato e si apre la home dell'app.
// Registrato per primo, questo gestore ferma l'evento prima che arrivi a OneSignal
// (stopImmediatePropagation); per gli URL ammessi non fa nulla e OneSignal apre o mette a fuoco la pagina.

function urlPushAmmesso(u) {
  try {
    const x = new URL(u, self.registration.scope);
    return x.origin === self.location.origin && x.href.startsWith(self.registration.scope);
  } catch (e) {
    return false;
  }
}

self.addEventListener('notificationclick', e => {
  const d = (e.notification && e.notification.data) || {};
  const urls = [d.launchURL].concat((d.actionButtons || []).map(b => b && b.launchURL)).filter(Boolean);
  if (urls.length && urls.every(urlPushAmmesso)) return;
  e.stopImmediatePropagation();
  e.notification.close();
  e.waitUntil(self.clients.openWindow(self.registration.scope));
});
