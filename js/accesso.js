// js/accesso.js — telefono autorizzato e cambio PIN obbligatorio (operatore.html, ufficio.html).
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

  // registra il dispositivo se serve e ne legge lo stato: { stato: 'approvato' | 'in_attesa' | 'revocato' | 'errore', codice }
  async function assicura(sb) {
    var d = leggi() || {};
    if (!d.segreto) d.segreto = segreto64();
    try {
      if (d.id) {
        var r = await sb.rpc('stato_dispositivo', { p_id: d.id, p_segreto: d.segreto });
        if (r.error) throw r.error;
        if (r.data && r.data.stato && r.data.stato !== 'sconosciuto') { salva(d); return { stato: r.data.stato, codice: r.data.codice || null }; }
        d.id = null;   // il server non lo conosce più (richiesta scaduta o eliminata): si registra di nuovo
      }
      var g = await sb.rpc('registra_dispositivo', { p_segreto: d.segreto });
      if (g.error || !g.data || !g.data.ok) throw (g.error || new Error('registrazione non riuscita'));
      d.id = g.data.id;
      salva(d);
      return { stato: g.data.stato, codice: g.data.codice || null };
    } catch (e) {
      salva(d);
      return { stato: 'errore', codice: null };
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

  // Prepara la schermata di accesso. opz: { sb, pannello, nascondi: [elementi], suApprovato: async fn }
  async function preparaLogin(opz) {
    clearInterval(_timer);
    var mostra = function (si) { (opz.nascondi || []).forEach(function (e) { if (e) e.style.display = si ? '' : 'none'; }); };
    async function controlla() {
      var info = await assicura(opz.sb);
      if (info.stato === 'approvato') {
        clearInterval(_timer);
        opz.pannello.style.display = 'none';
        mostra(true);
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
      pin_nuovo_troppo_semplice: 'PIN troppo facile (cifre uguali, sequenze, date, ripetizioni): scegline un altro',
      pin_nuovo_non_valido: 'Il PIN deve avere 6 cifre', pin_nuovo_uguale: 'Il nuovo PIN deve essere diverso dal vecchio'
    };
    var msg = (data && data.messaggio) || codici[data && data.errore] || (data && data.errore) || 'PIN errato';
    if (data && data.bloccato_fino) {
      var ora = new Date(data.bloccato_fino).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      msg += ' — riprova dopo le ' + ora;
    }
    return msg;
  }

  // ── cambio PIN obbligatorio (PIN a 4 cifre ancora da sostituire) ──
  var _ov = null, _pad = null, _ctx = null;

  function costruisciOverlay() {
    if (_ov) return;
    _ov = el('div', 'accesso-overlay');
    _ov.setAttribute('role', 'dialog');
    _ov.setAttribute('aria-modal', 'true');
    var box = el('div', 'box');
    box.appendChild(el('h2', null, 'Scegli il tuo nuovo PIN'));
    box.appendChild(el('p', null, 'Da ora il PIN ha 6 cifre. Scegline uno che non sia una data, una sequenza o cifre ripetute.'));
    var padEl = el('div', null);
    var err = el('div', 'err');
    err.setAttribute('aria-live', 'assertive');
    var ann = el('button', 'btn btn-secondary', 'Annulla');
    ann.type = 'button';
    ann.addEventListener('click', function () { chiudi({ annullato: true, data: { errore: 'annullato' } }); });
    box.appendChild(padEl);
    box.appendChild(ann);
    _ov.appendChild(box);
    document.body.appendChild(_ov);
    _pad = window.MangoPinPad.monta({
      contenitore: padEl,
      messaggio: err,
      titolo: 'Nuovo PIN (6 cifre)',
      lunghezza: 6,
      nomeSelezionato: function () { return true; },
      mostraErrore: function (t) { err.textContent = t; },
      visibile: function () { return _ov.classList.contains('open'); },
      invia: inviaCambio
    });
  }

  function chiudi(esito) {
    if (!_ctx) return;
    var c = _ctx;
    _ctx = null;
    _ov.classList.remove('open');
    if (_pad) _pad.fermaTastiera();
    if (window.pinPad) window.pinPad.azzera();   // torna al tastierino della pagina
    c.risolvi(esito);
  }

  async function inviaCambio(pin) {
    var c = _ctx;
    if (!c) return { ok: false };
    var err = _ov.querySelector('.err');
    err.textContent = '';
    if (c.passo === 0) { c.nuovo = pin; c.passo = 1; _pad.impostaTitolo('Ripeti il nuovo PIN'); return { ok: true, continua: true }; }
    if (pin !== c.nuovo) { c.passo = 0; c.nuovo = null; _pad.impostaTitolo('Nuovo PIN (6 cifre)'); err.textContent = 'I due PIN non coincidono: ricomincia'; return { ok: false }; }
    var r = await c.sb.rpc('cambia_pin_primo_accesso', Object.assign({ p_user_id: c.userId, p_pin_attuale: c.attuale, p_pin_nuovo: c.nuovo }, parametri()));
    var data = r.data;
    if (data && data.ok) { chiudi({ data: data, pinNuovo: c.nuovo }); return { ok: true }; }
    c.passo = 0; c.nuovo = null; _pad.impostaTitolo('Nuovo PIN (6 cifre)');
    if (data && (data.errore === 'dispositivo_non_approvato' || data.errore === 'pin_da_reimpostare' || data.errore === 'utente_non_trovato')) { chiudi({ annullato: true, data: data }); return { ok: false }; }
    err.textContent = messaggio(data);
    return { ok: false, bloccatoFino: (data && data.bloccato_fino) || null };
  }

  function cambioObbligatorio(sb, userId, pinAttuale) {
    return new Promise(function (risolvi) {
      costruisciOverlay();
      _ctx = { sb: sb, userId: userId, attuale: pinAttuale, nuovo: null, passo: 0, risolvi: risolvi };
      _ov.querySelector('.err').textContent = '';
      _pad.impostaTitolo('Nuovo PIN (6 cifre)');
      if (window.pinPad) window.pinPad.fermaTastiera();   // la tastiera fisica è solo del tastierino in primo piano
      _pad.azzera();
      _ov.classList.add('open');
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
