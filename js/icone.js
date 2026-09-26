// js/icone.js — icone SVG a tratto dell'interfaccia (al posto delle emoji).
//
// Uso: nell'HTML statico e nei template JS si scrive SOLO un segnaposto costante
//        <i data-ic="pacco"></i>
// e questo script lo riempie con l'SVG corrispondente, anche nell'HTML generato dopo (un
// MutationObserver gira prima del disegno: nessuno sfarfallio).
//
// Sicurezza: le SVG sono stringhe statiche costanti qui sotto, senza alcun dato interpolato. Il
// nome dell'icona letto dal DOM serve solo come chiave di ricerca nella mappa (whitelist): un
// nome sconosciuto non produce nulla. Ogni SVG viene analizzata UNA volta con DOMParser e poi
// solo clonata (cloneNode): nessun innerHTML con valori esterni.
//
// Stile: 24×24, stroke 1.8, currentColor (prende il colore del testo), aria-hidden. I pulsanti con
// sola icona devono avere un aria-label proprio. Alcuni tracciati sono derivati da Feather Icons
// (MIT, © Cole Bemis) e Lucide (ISC).
(function () {
  'use strict';

  var TRACCIATI = {
    casa:        '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    grafico:     '<path d="M3 21h18"/><path d="M6 17v-5"/><path d="M11 17V6"/><path d="M16 17v-8"/>',
    trend:       '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    campana:     '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    calendario:  '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    persone:     '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/><path d="M22 21v-1a6 6 0 0 0-4-5.6"/>',
    persona:     '<circle cx="12" cy="7" r="4"/><path d="M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1"/>',
    pacco:       '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/><path d="m7.5 5.5 9 5"/>',
    camion:      '<path d="M2 6h12v11H2z"/><path d="M14 9h4l3 3v5h-7"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    ingranaggio: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    etichetta:   '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    strati:      '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    tavola:      '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10c3 0 3 4 6 4s3-2 5-2"/>',
    fulmine:     '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    orologio:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    timer:       '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
    chiave:      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    matita:      '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
    tema:        '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
    appunti:     '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h5"/>',
    invio:       '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    database:    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    megafono:    '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/>',
    aggiorna:    '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    punto:       '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
    pausa:       '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    play:        '<path d="M7 4v16l13-8z"/>',
    clessidra:   '<path d="M6 2h12M6 22h12"/><path d="M7 2v3a5 5 0 0 0 10 0V2"/><path d="M7 22v-3a5 5 0 0 1 10 0v3"/>',
    divieto:     '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    avviso:      '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    lucchetto:   '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    salva:       '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    spunta:      '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    bersaglio:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    previsione:  '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8"/>',
    cestino:     '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    esci:        '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    offline:     '<path d="m2 2 20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.6"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
    segnale:     '<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
    cerca:       '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    fotocamera:  '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    immagine:    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    quadrato:    '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    chevron:     '<path d="m9 6 6 6-6 6"/>'
  };

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var modelli = {};   // nome → <svg> già analizzata, da clonare

  function modello(nome) {
    if (!Object.prototype.hasOwnProperty.call(TRACCIATI, nome)) return null;
    if (!modelli[nome]) {
      var doc = new DOMParser().parseFromString(
        '<svg xmlns="' + SVG_NS + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + TRACCIATI[nome] + '</svg>',
        'image/svg+xml');
      modelli[nome] = document.importNode(doc.documentElement, true);
    }
    return modelli[nome];
  }

  function riempi(el) {
    if (el.firstChild) return;                       // già riempito
    var m = modello(el.getAttribute('data-ic'));
    if (m) el.appendChild(m.cloneNode(true));
  }

  function riempiSotto(radice) {
    if (radice.nodeType !== 1) return;
    if (radice.hasAttribute('data-ic')) riempi(radice);
    Array.prototype.forEach.call(radice.querySelectorAll('i[data-ic]'), riempi);
  }

  function avvia() {
    riempiSotto(document.body);
    new MutationObserver(function (mutazioni) {
      mutazioni.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, riempiSotto); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();

  window.MangoIcone = { nomi: function () { return Object.keys(TRACCIATI); } };
})();
