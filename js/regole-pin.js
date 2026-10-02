// js/regole-pin.js — le regole del PIN e i motivi di rifiuto: un solo posto, usato da tutte le pagine
// (scelta del PIN, cambio PIN, profilo, pagina responsabile, guida). Il server decide cosa è accettato:
// qui c'è solo il testo da mostrare. DOM costruito con createElement + textContent.
(function () {
  'use strict';

  var INTRO = 'Il tuo PIN deve avere 6 cifre.';
  var TITOLO_ELENCO = 'Non sono accettati:';
  var NON_ACCETTATI = [
    'tutte le cifre uguali (es. 111111)',
    'sequenze (es. 123456, 654321, 147258)',
    'ripetizioni (es. 121212, 123123, 112233)',
    'PIN uguali letti al contrario (es. 123321)',
    'un anno all\'inizio (es. 1985…, 2024…)',
    'date: le prime 4 cifre non devono formare giorno e mese (es. 2507…), e le cifre dalla 3ª alla 6ª non devono formare mese e giorno (es. …0725)'
  ];
  var CONSIGLIO = 'Consiglio: scegli la 1ª cifra tra 4 e 9 e la 3ª tra 2 e 9: così non sarà mai una data o un anno.';
  var AVVERTENZA = 'Non usare il PIN di altri, del telefono o della banca. Non dirlo a nessuno.';

  var MOTIVI = {
    data: 'Questo PIN sembra una data, scegline un altro',
    anno: 'Questo PIN inizia con un anno',
    sequenza: 'Questo PIN è una sequenza troppo facile',
    ripetizione: 'Questo PIN ripete gli stessi numeri',
    speculare: 'Questo PIN è uguale letto al contrario',
    cifre_uguali: 'Le cifre sono tutte uguali',
    lunghezza: 'Il PIN deve avere 6 cifre'
  };

  function el(tag, testo) {
    var e = document.createElement(tag);
    if (testo !== undefined) e.textContent = testo;
    return e;
  }

  // riempie il contenitore con il testo delle regole (sempre visibile sopra il tastierino)
  function rendi(contenitore) {
    if (!contenitore) return;
    contenitore.textContent = '';
    contenitore.classList.add('regole-pin');
    contenitore.appendChild(el('p', INTRO));
    contenitore.appendChild(el('p', TITOLO_ELENCO));
    var ul = el('ul');
    NON_ACCETTATI.forEach(function (r) { ul.appendChild(el('li', r)); });
    contenitore.appendChild(ul);
    contenitore.appendChild(el('p', CONSIGLIO));
    contenitore.appendChild(el('p', AVVERTENZA));
  }

  // testo semplice per il motivo restituito dal server (o per il codice di errore generico)
  function messaggio(data) {
    if (!data) return '';
    if (data.motivo && MOTIVI[data.motivo]) return MOTIVI[data.motivo];
    if (data.errore === 'pin_nuovo_troppo_semplice' || data.errore === 'pin_troppo_semplice') return 'Questo PIN è troppo facile, scegline un altro';
    if (data.errore === 'pin_nuovo_non_valido' || data.errore === 'pin_non_valido') return MOTIVI.lunghezza;
    return '';
  }

  window.MangoRegolePin = { rendi: rendi, messaggio: messaggio, MOTIVI: MOTIVI };
})();
