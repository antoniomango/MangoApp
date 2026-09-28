// js/pin-pad.js — schermata PIN in stile tastierino (operatore.html, ufficio.html).
//
// Script classico, nessuna libreria. Costruisce pallini e tastierino SOLO con DOM API
// (createElement + textContent), nessun innerHTML.
//
// Sicurezza del PIN:
// - vive SOLO nella variabile `pin` di questa chiusura: mai nel DOM (nessun input con il valore),
//   mai in localStorage/IndexedDB, mai in console;
// - viene azzerato prima di ogni tentativo (la copia passa solo alla funzione di accesso della
//   pagina), quando si cambia nome (azzera()) e quando si esce dalla schermata (fermaTastiera());
// - un solo tentativo alla volta: durante la richiesta il tastierino è disabilitato;
// - durante il blocco per troppi tentativi il tastierino resta disabilitato fino all'orario
//   restituito dal server (bloccato_fino).
//
// Uso:
//   const pad = MangoPinPad.monta({
//     contenitore, messaggio,          // elementi DOM: dove disegnare, elemento dei messaggi
//     nomeSelezionato: () => bool,     // senza nome il tastierino non invia nulla
//     mostraErrore: (testo) => {},     // testo semplice (textContent nella pagina)
//     visibile: () => bool,            // la tastiera fisica reagisce solo se la schermata è visibile
//     invia: async (pin) => ({ ok, bloccatoFino }),
//     suSblocco: () => {}              // opzionale, a fine blocco
//   });
//   pad.azzera(); pad.fermaTastiera();
(function () {
  'use strict';

  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo !== undefined) e.textContent = testo;
    return e;
  }

  function monta(opz) {
    var LUNG = 4;
    var pin = '';                 // unica copia del PIN in memoria
    var occupato = false;         // richiesta in corso
    var bloccato = false;         // blocco per troppi tentativi
    var timerBlocco = null;
    var tastieraAttiva = false;
    var pulsanti = [];

    var root = opz.contenitore;
    root.classList.add('pinpad');

    var titolo = el('div', 'pinpad-titolo', 'Inserisci il PIN');
    var dots = el('div', 'pinpad-dots');
    dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < LUNG; i++) dots.appendChild(el('span', 'pinpad-dot'));
    // annuncia quante cifre sono state inserite, mai quali
    var stato = el('div', 'sr-only');
    stato.setAttribute('role', 'status');
    stato.setAttribute('aria-live', 'polite');

    var tasti = el('div', 'pinpad-tasti');
    tasti.setAttribute('role', 'group');
    tasti.setAttribute('aria-label', 'Tastierino PIN');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'canc'].forEach(function (k) {
      if (k === '') { tasti.appendChild(el('span', 'pinpad-vuoto')); return; }
      var b = el('button', 'pinpad-tasto');
      b.type = 'button';
      if (k === 'canc') {
        b.classList.add('pinpad-cancella');
        b.setAttribute('aria-label', 'Cancella');
        var ic = document.createElement('i');
        ic.setAttribute('data-ic', 'cancella');
        b.appendChild(ic);
        b.addEventListener('click', cancella);
      } else {
        b.textContent = k;
        b.setAttribute('aria-label', k);
        b.addEventListener('click', function () { premi(k); });
      }
      pulsanti.push(b);
      tasti.appendChild(b);
    });

    root.appendChild(titolo);
    root.appendChild(dots);
    root.appendChild(stato);
    if (opz.messaggio) root.appendChild(opz.messaggio);   // nodo esistente della pagina, spostato qui
    root.appendChild(tasti);

    function mostraPallini(n) {
      Array.prototype.forEach.call(dots.children, function (d, idx) { d.classList.toggle('piena', idx < n); });
      stato.textContent = n === 0 ? '' : (n === 1 ? '1 cifra su ' + LUNG : n + ' cifre su ' + LUNG);
    }

    function abilita(si) {
      pulsanti.forEach(function (b) { b.disabled = !si; });
      root.classList.toggle('pinpad--disabilitato', !si);
    }

    function scuoti() {
      dots.classList.remove('pinpad-dots--errore');
      void dots.offsetWidth;                 // riavvia l'animazione
      dots.classList.add('pinpad-dots--errore');
      setTimeout(function () { dots.classList.remove('pinpad-dots--errore'); }, 450);
    }

    function premi(cifra) {
      if (occupato || bloccato) return;
      if (!opz.nomeSelezionato()) { opz.mostraErrore('Seleziona il tuo nome'); return; }
      if (pin.length >= LUNG) return;
      pin += cifra;
      mostraPallini(pin.length);
      if (pin.length === LUNG) invia();
    }

    function cancella() {
      if (occupato || bloccato) return;
      pin = pin.slice(0, -1);
      mostraPallini(pin.length);
    }

    function blocca(fino) {
      var ms = new Date(fino).getTime() - Date.now();
      if (!(ms > 0)) { abilita(true); return; }
      bloccato = true;
      abilita(false);
      clearTimeout(timerBlocco);
      timerBlocco = setTimeout(function () {
        bloccato = false;
        abilita(true);
        if (opz.suSblocco) opz.suSblocco();
      }, Math.min(ms + 500, 2147483000));
    }

    function invia() {
      if (occupato || bloccato) return;
      if (pin.length !== LUNG) { opz.mostraErrore('Inserisci il PIN completo (4 cifre)'); return; }
      occupato = true;
      abilita(false);
      var tentativo = pin;
      pin = '';                                 // azzerato prima della richiesta
      Promise.resolve()
        .then(function () { return opz.invia(tentativo); })
        .catch(function () { return { ok: false }; })
        .then(function (esito) {
          tentativo = null;
          occupato = false;
          if (esito && esito.ok) { mostraPallini(0); fermaTastiera(); return; }
          scuoti();
          mostraPallini(0);
          if (esito && esito.bloccatoFino) blocca(esito.bloccatoFino);
          else abilita(true);
        });
    }

    // Tastiera fisica (PC dell'ufficio): cifre, Backspace, Invio — solo con la schermata visibile.
    function suTasto(e) {
      if (!opz.visibile() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); premi(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); cancella(); }
      else if (e.key === 'Enter') { e.preventDefault(); invia(); }
    }
    function attivaTastiera() {
      if (tastieraAttiva) return;
      document.addEventListener('keydown', suTasto);
      tastieraAttiva = true;
    }
    function fermaTastiera() {
      pin = '';
      mostraPallini(0);
      if (!tastieraAttiva) return;
      document.removeEventListener('keydown', suTasto);
      tastieraAttiva = false;
    }
    // Nuovo nome o ritorno alla schermata di accesso: PIN azzerato, tastiera fisica riattivata.
    function azzera() {
      pin = '';
      mostraPallini(0);
      if (!occupato && !bloccato) abilita(true);
      attivaTastiera();
    }

    mostraPallini(0);
    attivaTastiera();
    return { azzera: azzera, fermaTastiera: fermaTastiera };
  }

  window.MangoPinPad = { monta: monta };
})();
