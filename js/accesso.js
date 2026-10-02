// js/accesso.js — telefono autorizzato, scelta del PIN e cambio PIN obbligatorio (operatore.html, ufficio.html).
//
// Script classico, nessuna libreria; DOM costruito solo con createElement + textContent.
// Ogni telefono (o PC) ha un segreto casuale salvato in localStorage; il server ne conserva solo l'impronta.
// Finché il responsabile non ha approvato il dispositivo non si vede l'elenco dei nomi e non si può tentare nessun PIN.
// I PIN digitati non restano in nessuna variabile oltre la chiamata al server.
(function () {
  'use strict';

  var CHIAVE = 'mango-dispositivo';
  var _timer = null;

  function leggi() { try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { return null; } }
  function salva(d) { try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch (e) { /* storage non disponibile: si riprova al prossimo avvio */ } }
  function segreto64() {
    var a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function el(tag, classe, testo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo !== undefined) e.textContent = testo;
    return e;
  }

  // parametri da passare alle RPC di accesso
  function parametri() {
    var d = leggi();
    return { p_dispositivo_id: (d && d.id) || null, p_dispositivo_segreto: (d && d.segreto) || null };
  }

  // registra il dispositivo se serve e ne legge lo stato: { stato: 'approvato' | 'in_attesa' | 'revocato' | 'errore', codice, scelta_pin }
  async function assicura(sb) {
    var d = leggi() || {};
    if (!d.segreto) d.segreto = segreto64();
    try {
      if (d.id) {
        var r = await sb.rpc('stato_dispositivo', { p_id: d.id, p_segreto: d.segreto });
        if (r.error) throw r.error;
        if (r.data && r.data.stato && r.data.stato !== 'sconosciuto') { salva(d); return { stato: r.data.stato, codice: r.data.codice || null, scelta_pin: r.data.scelta_pin || null }; }
        d.id = null;   // il server non lo conosce più (richiesta scaduta o eliminata): si registra di nuovo
      }
      var g = await sb.rpc('registra_dispositivo', { p_segreto: d.segreto });
      if (g.error || !g.data || !g.data.ok) throw (g.error || new Error('registrazione non riuscita'));
      d.id = g.data.id;
      salva(d);
      return { stato: g.data.stato, codice: g.data.codice || null, scelta_pin: null };
    } catch (e) {
      salva(d);
      return { stato: 'errore', codice: null, scelta_pin: null };
    }
  }

  function disegnaPannello(pannello, info, ricontrolla) {
    pannello.textContent = '';
    if (info.stato === 'in_attesa') {
      pannello.appendChild(el('h2', null, 'Telefono da autorizzare'));
      pannello.appendChild(el('p', null, 'Questo telefono non è ancora stato approvato dal responsabile. Comunicagli questo codice:'));
      pannello.appendChild(el('div', 'codice-disp', info.codice || '——'));
      pannello.appendChild(el('p', null, 'Appena il responsabile lo approva potrai accedere.'));
    } else if (info.stato === 'revocato') {
      pannello.appendChild(el('h2', null, 'Telefono non più autorizzato'));
      pannello.appendChild(el('p', null, 'Questo telefono non può più accedere. Rivolgiti al responsabile.'));
    } else {
      pannello.appendChild(el('h2', null, 'Verifica non riuscita'));
      pannello.appendChild(el('p', null, 'Non riesco a controllare questo telefono. Controlla la connessione e riprova.'));
    }
    var b = el('button', 'btn btn-secondary', 'Ricontrolla');
    b.type = 'button';
    b.addEventListener('click', ricontrolla);
    pannello.appendChild(b);
  }

  // Prepara la schermata di accesso. opz: { sb, pannello, nascondi: [elementi], suApprovato: async fn, suSceltaPin: async fn(esito) }
  async function preparaLogin(opz) {
    clearInterval(_timer);
    var mostra = function (si) { (opz.nascondi || []).forEach(function (e) { if (e) e.style.display = si ? '' : 'none'; }); };
    async function controlla() {
      var info = await assicura(opz.sb);
      if (info.stato === 'approvato') {
        clearInterval(_timer);
        opz.pannello.style.display = 'none';
        mostra(true);
        // la persona a cui è assegnato questo telefono può scegliersi subito il PIN (finestra aperta dal responsabile)
        if (info.scelta_pin && opz.suSceltaPin) {
          mostra(false);
          var esito = await scegliPin(opz.sb, info.scelta_pin);
          mostra(true);
          if (esito && esito.data && esito.data.ok) { await opz.suSceltaPin(esito); return; }
        }
        if (opz.suApprovato) await opz.suApprovato();
        return;
      }
      mostra(false);
      opz.pannello.style.display = 'flex';
      disegnaPannello(opz.pannello, info, controlla);
    }
    await controlla();
    // finché non è approvato, ricontrolla da solo
    if (opz.pannello.style.display === 'flex') _timer = setInterval(function () { if (!document.hidden) controlla(); }, 8000);
  }

  function messaggio(data) {
    var codici = {
      pin_errato: 'PIN errato', utente_non_trovato: 'Utente non trovato', troppi_tentativi: 'Troppi tentativi errati',
      dispositivo_non_approvato: 'Questo telefono non è ancora autorizzato', annullato: '',
      scelta_non_consentita: 'La scelta del PIN non è più disponibile: rivolgiti al responsabile',
      pin_nuovo_uguale: 'Il nuovo PIN deve essere diverso dal vecchio'
    };
    var msg = (data && window.MangoRegolePin && window.MangoRegolePin.messaggio(data)) || (data && data.messaggio) || codici[data && data.errore] || (data && data.errore) || 'PIN errato';
    if (data && data.bloccato_fino) {
      var ora = new Date(data.bloccato_fino).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      msg += ' — riprova dopo le ' + ora;
    }
    return msg;
  }

  // ── schermata "scegli il PIN" (due inserimenti): usata per il cambio obbligatorio e per la scelta iniziale ──
  // invia(nuovoPin) restituisce { fine: true, esito } oppure { messaggio, bloccatoFino } oppure { annulla: true, esito }
  function creaSchermata() {
    var ov = el('div', 'accesso-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    var box = el('div', 'box');
    var titolo = el('h2', null, '');
    var regole = el('div', null);
    window.MangoRegolePin.rendi(regole);
    var padEl = el('div', null);
    var err = el('div', 'err');
    err.setAttribute('aria-live', 'assertive');
    var ann = el('button', 'btn btn-secondary', 'Annulla');
    ann.type = 'button';
    box.appendChild(titolo);
    box.appendChild(regole);
    box.appendChild(padEl);
    box.appendChild(ann);
    ov.appendChild(box);
    document.body.appendChild(ov);
    var ctx = null;
    var pad = null;

    function chiudi(esito) {
      if (!ctx) return;
      var c = ctx;
      ctx = null;
      ov.classList.remove('open');
      if (pad) pad.fermaTastiera();
      if (window.pinPad) window.pinPad.azzera();   // torna al tastierino della pagina
      c.risolvi(esito);
    }
    ann.addEventListener('click', function () { chiudi({ annullato: true, data: { errore: 'annullato' } }); });

    async function inviaPin(pin) {
      var c = ctx;
      if (!c) return { ok: false };
      err.textContent = '';
      if (c.passo === 0) { c.nuovo = pin; c.passo = 1; pad.impostaTitolo('Ripeti il PIN'); return { ok: true, continua: true }; }
      if (pin !== c.nuovo) { c.passo = 0; c.nuovo = null; pad.impostaTitolo('Nuovo PIN (6 cifre)'); err.textContent = 'I due PIN non coincidono, riprova'; return { ok: false }; }
      var nuovo = c.nuovo;
      var r = await c.invia(nuovo);
      c.nuovo = null; c.passo = 0;
      if (r.fine) { chiudi(r.esito); return { ok: true }; }
      if (r.annulla) { chiudi(r.esito); return { ok: false }; }
      pad.impostaTitolo('Nuovo PIN (6 cifre)');
      err.textContent = r.messaggio || '';
      return { ok: false, bloccatoFino: r.bloccatoFino || null };
    }
    pad = window.MangoPinPad.monta({
      contenitore: padEl, messaggio: err, titolo: 'Nuovo PIN (6 cifre)', lunghezza: 6,
      nomeSelezionato: function () { return true; },
      mostraErrore: function (t) { err.textContent = t; },
      visibile: function () { return ov.classList.contains('open'); },
      invia: inviaPin
    });

    return {
      apri: function (testoTitolo, invia) {
        return new Promise(function (risolvi) {
          ctx = { passo: 0, nuovo: null, invia: invia, risolvi: risolvi };
          titolo.textContent = testoTitolo;
          err.textContent = '';
          pad.impostaTitolo('Nuovo PIN (6 cifre)');
          if (window.pinPad) window.pinPad.fermaTastiera();   // la tastiera fisica è solo del tastierino in primo piano
          pad.azzera();
          ov.classList.add('open');
        });
      }
    };
  }

  var _schCambio = null, _schScelta = null;

  // cambio obbligatorio: PIN a 4 cifre ancora da sostituire
  function cambioObbligatorio(sb, userId, pinAttuale) {
    if (!_schCambio) _schCambio = creaSchermata();
    return _schCambio.apri('Scegli il tuo nuovo PIN', async function (nuovo) {
      var r = await sb.rpc('cambia_pin_primo_accesso', Object.assign({ p_user_id: userId, p_pin_attuale: pinAttuale, p_pin_nuovo: nuovo }, parametri()));
      var data = r.data;
      if (data && data.ok) return { fine: true, esito: { data: data, pinNuovo: nuovo } };
      if (data && (data.errore === 'dispositivo_non_approvato' || data.errore === 'pin_da_reimpostare' || data.errore === 'utente_non_trovato')) return { annulla: true, esito: { annullato: true, data: data } };
      return { messaggio: messaggio(data), bloccatoFino: (data && data.bloccato_fino) || null };
    });
  }

  // scelta iniziale: il responsabile ha approvato il telefono e aperto la finestra per questa persona
  function scegliPin(sb, persona) {
    if (!_schScelta) _schScelta = creaSchermata();
    return _schScelta.apri('Ciao ' + persona.nome + ', scegli il tuo PIN', async function (nuovo) {
      var r = await sb.rpc('scegli_pin_iniziale', Object.assign({ p_user_id: persona.user_id, p_pin_nuovo: nuovo }, parametri()));
      var data = r.data;
      if (data && data.ok) return { fine: true, esito: { data: data, pin: nuovo } };
      if (!data || data.errore === 'scelta_non_consentita' || data.errore === 'dispositivo_non_approvato') return { annulla: true, esito: { annullato: true, data: data || { errore: 'scelta_non_consentita' } } };
      return { messaggio: messaggio(data) };
    });
  }

  // Accesso con PIN: { ok, data, pin } — pin è quello effettivo (il nuovo, se è stato appena cambiato)
  async function accedi(sb, userId, pin) {
    var r = await sb.rpc('verifica_pin', Object.assign({ p_user_id: userId, p_pin: pin }, parametri()));
    var data = r.data;
    if (data && data.errore === 'cambio_pin_obbligatorio') {
      var c = await cambioObbligatorio(sb, userId, pin);
      if (!c || c.annullato) return { ok: false, data: (c && c.data) || { errore: 'annullato' } };
      return { ok: true, data: c.data, pin: c.pinNuovo };
    }
    if (data && data.ok) return { ok: true, data: data, pin: pin };
    return { ok: false, data: data || { errore: 'pin_errato' } };
  }

  window.MangoAccesso = { parametri: parametri, assicura: assicura, preparaLogin: preparaLogin, accedi: accedi, messaggio: messaggio };
})();
