// js/tema.js — tema chiaro / scuro / automatico, preferenza salvata SOLO su questo dispositivo.
//
// Script classico e SINCRONO: va incluso nel <head> di ogni pagina dopo il meta CSP e PRIMA dei
// fogli di stile, così <html data-theme> è già impostato al primo disegno (nessun lampo di colore
// sbagliato all'apertura). Nessun dato nel database: ogni operatore usa il proprio telefono.
//
// Sicurezza: il valore letto da localStorage non viene MAI usato così com'è. Passa dalla whitelist
// PREFERENZE; qualunque altro valore (manomesso, vecchio, vuoto) vale 'auto'. In HTML/CSS finiscono
// solo le costanti 'light'/'dark' e le etichette fisse qui sotto (DOM API + textContent, niente
// innerHTML). Non tocca 'mangoapp-env' né altre chiavi.
(function () {
  'use strict';

  var CHIAVE = 'mangoapp-tema';
  // preferenza → tema forzato (null = segui il dispositivo)
  var PREFERENZE = { chiaro: 'light', scuro: 'dark', auto: null };
  var ETICHETTE = [['chiaro', 'Chiaro'], ['scuro', 'Scuro'], ['auto', 'Automatico']];
  // colore di --bg per tema, usato per <meta name="theme-color"> prima che il CSS sia caricato;
  // dopo il caricamento si rilegge il valore vero da getComputedStyle (fonte: css/tema.css).
  var BG_INIZIALE = { light: '#F2F2F7', dark: '#000000' };

  var mq = null;
  try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mq = null; }

  function valida(v) {
    return Object.prototype.hasOwnProperty.call(PREFERENZE, v) ? v : 'auto';
  }

  // ripiego se localStorage non è disponibile (modalità privata, blocco dei dati del sito)
  var inMemoria = 'auto';

  function leggiPreferenza() {
    try { return valida(window.localStorage.getItem(CHIAVE)); } catch (e) { return inMemoria; }
  }

  function temaEffettivo(pref) {
    var forzato = PREFERENZE[pref];
    if (forzato) return forzato;
    return mq && mq.matches ? 'dark' : 'light';
  }

  function aggiornaMetaThemeColor(tema) {
    var colore = BG_INIZIALE[tema];
    try {
      var letto = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      // accetta solo un colore esadecimale (il CSS potrebbe non essere ancora caricato)
      if (/^#[0-9a-fA-F]{6}$/.test(letto)) colore = letto;
    } catch (e) { /* CSS non ancora disponibile: resta il valore iniziale */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    if (meta) meta.setAttribute('content', colore);
  }

  var selettori = [];

  function aggiornaSelettori(pref) {
    selettori.forEach(function (gruppo) {
      Array.prototype.forEach.call(gruppo.querySelectorAll('button[data-tema]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-tema') === pref ? 'true' : 'false');
      });
    });
  }

  function applica() {
    var pref = leggiPreferenza();
    var tema = temaEffettivo(pref);
    document.documentElement.setAttribute('data-theme', tema);
    aggiornaMetaThemeColor(tema);
    aggiornaSelettori(pref);
  }

  function imposta(pref) {
    inMemoria = valida(pref);
    try { window.localStorage.setItem(CHIAVE, inMemoria); } catch (e) { /* vale solo per questa pagina */ }
    applica();
  }

  // Crea il controllo segmentato Chiaro / Scuro / Automatico dentro `contenitore` (elemento DOM).
  function montaSelettore(contenitore) {
    if (!contenitore) return;
    var gruppo = document.createElement('div');
    gruppo.className = 'tema-seg';
    gruppo.setAttribute('role', 'group');
    gruppo.setAttribute('aria-label', 'Aspetto');
    ETICHETTE.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-tema', e[0]);
      b.textContent = e[1];
      b.addEventListener('click', function () { imposta(e[0]); });
      gruppo.appendChild(b);
    });
    contenitore.appendChild(gruppo);
    selettori.push(gruppo);
    aggiornaSelettori(leggiPreferenza());
  }

  applica();

  // 'auto' segue il cambio del dispositivo in tempo reale
  if (mq) {
    var suCambio = function () { if (leggiPreferenza() === 'auto') applica(); };
    if (mq.addEventListener) mq.addEventListener('change', suCambio);
    else if (mq.addListener) mq.addListener(suCambio);
  }
  // scelta fatta in un'altra scheda della stessa app
  window.addEventListener('storage', function (ev) { if (ev.key === CHIAVE) applica(); });
  // a CSS caricato rilegge --bg vero per theme-color
  document.addEventListener('DOMContentLoaded', applica);
  window.addEventListener('load', applica);

  window.MangoTema = { imposta: imposta, preferenza: leggiPreferenza, montaSelettore: montaSelettore };
})();
