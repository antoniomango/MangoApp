// responsabile.html — notifiche: destinatari, elenco, comunicazioni, invio, notifiche push del responsabile (OneSignal).
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// DESTINATARI NOTIFICHE CONFIG
// ═══════════════════════════════════════════════
let _notifEventi = [];        // eventi con destinatari configurabili, da tipi_evento_notifica
let _notifDestCache = [];     // righe da notifiche_destinatari_config
let _notifUtentiCache = [];   // tutti gli utenti attivi

async function loadNotifDestinatari() {
  const [{ data: dest }, { data: utenti }, { data: eventi }] = await Promise.all([
    sb.from('notifiche_destinatari_config').select('*'),
    sb.from('users').select('id, nome, cognome, ruolo').eq('attivo', true).order('cognome'),
    sb.from('tipi_evento_notifica').select('chiave, etichetta, descrizione, configurabile').eq('configurabile', true).order('posizione'),
  ]);
  _notifEventi = eventi || [];
  _notifDestCache  = dest    || [];
  _notifUtentiCache = (utenti || []).filter(u => u.ruolo !== 'sola_lettura' || true); // tutti
  renderNotifDestinatari();
}

function renderNotifDestinatari() {
  const el = document.getElementById('notif-config-body');
  if (!el) return;

  const roleBadge = r => {
    const map = { responsabile: 'var(--violet)', operatore: 'var(--info)', sola_lettura: 'var(--neutral)' };
    return `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${map[r]||'var(--neutral-solid)'};color:var(--on-neutral);margin-left:6px">${r}</span>`;
  };

  el.innerHTML = _notifEventi.map(ev => {
    const righe = _notifDestCache.filter(d => d.tipo_evento === ev.chiave);
    const idSet = new Map(righe.map(r => [r.utente_id, r]));

    const checkboxes = _notifUtentiCache.map(u => {
      const riga = idSet.get(u.id);
      const checked   = riga?.attivo  ? 'checked' : '';
      const inConfig  = !!riga;
      return `<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" ${checked}
          onchange="toggleNotifDest('${ev.chiave}','${u.id}',this.checked)"
          style="width:16px;height:16px;accent-color:var(--accent)">
        <span style="font-size:14px">${escapeHtml(u.nome)} ${escapeHtml(u.cognome)}</span>${roleBadge(u.ruolo)}
      </label>`;
    }).join('');

    return `<div class="card" style="margin-bottom:20px">
      <div style="margin-bottom:4px;font-weight:700;font-size:15px">${escapeHtml(ev.etichetta)}</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:14px">${escapeHtml(ev.descrizione || '')}</div>
      ${checkboxes || '<p style="color:var(--muted);font-size:13px">Nessun utente attivo</p>'}
    </div>`;
  }).join('');
}

async function toggleNotifDest(tipoEvento, utenteId, checked) {
  const { data, error } = await sb.rpc('imposta_destinatario_notifica', {
    p_tipo_evento: tipoEvento, p_utente_id: utenteId, p_attivo: checked, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore salvataggio: ' + (data?.errore || error?.message || ''), 'err'); await loadNotifDestinatari(); return; }
  const existing = _notifDestCache.find(d => d.tipo_evento === tipoEvento && d.utente_id === utenteId);
  if (existing) existing.attivo = checked;
  else _notifDestCache.push({ tipo_evento: tipoEvento, utente_id: utenteId, attivo: checked });
  toast(checked ? 'Destinatario aggiunto' : 'Destinatario rimosso', 'ok');
}

// ═══════════════════════════════════════════════
// NOTIFICHE
// ═══════════════════════════════════════════════
const NOTIF_ATTR_RICHIESTA = ' role="button" tabindex="0" title="Apri le richieste" onclick="apriRichiesteInAttesa()" onkeydown="tastoAttiva(event, apriRichiesteInAttesa)"';
function tastoAttiva(e, fn) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }

async function renderNotifiche() {
  await loadNotifiche();
  const el = document.getElementById('notif-list');
  if (!notificheCache.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon"><i data-ic="campana"></i></div><p>Nessuna notifica</p></div>';
    return;
  }
  // Le notifiche di nuova richiesta di permesso portano a Operatori → Richieste
  el.innerHTML = notificheCache.map(n => `
    <div class="notif-item ${n.letta ? '' : 'unread'}${n.tipo === 'richiesta_assenza' ? ' cliccabile' : ''}"${n.tipo === 'richiesta_assenza' ? NOTIF_ATTR_RICHIESTA : ''}>
      <div class="notif-dot ${n.letta ? 'read' : ''}"></div>
      <div class="notif-text">
        ${escapeHtml(n.testo)}
        ${n.ordini ? `<span style="font-size:11px;color:var(--muted);margin-left:6px">(${escapeHtml(n.ordini.codice)})</span>` : ''}
        <div class="notif-time">${formatDateTime(n.creata_il)}</div>
      </div>
    </div>
  `).join('');
}

async function markAllRead() {
  if (!currentUserRow) return;
  await sb.from('notifiche').update({ letta: true }).eq('destinatario_id', currentUserRow.id).eq('letta', false);
  toast('Tutte le notifiche segnate come lette', 'ok');
  await renderNotifiche();
}

async function notificaAggiornamento() {
  if (!confirm('Inviare notifica di aggiornamento a tutti gli operatori?')) return;
  await inviaNotificaATutti('comunicazione', '🔄 App aggiornata — chiudi e riapri l\'app per ricevere le ultime modifiche.');
  toast('Notifica aggiornamento inviata a tutti', 'ok');
}

async function inviaComunicazione() {
  const testo = document.getElementById('com-testo').value.trim();
  if (!testo) { toast('Scrivi un messaggio', 'err'); return; }
  const dest = document.getElementById('com-destinatario').value;
  let query = sb.from('users').select('id').eq('attivo', true).neq('eliminato', true);
  if (dest === 'operatori') query = query.eq('ruolo', 'operatore');
  const { data: utenti } = await query;
  if (!utenti?.length) { toast('Nessun destinatario trovato', 'err'); return; }
  await sb.from('notifiche').insert(utenti.map(u => ({
    destinatario_id: u.id, tipo: 'comunicazione',
    testo: `📢 ${testo}`, ordine_id: null
  })));
  document.getElementById('com-testo').value = '';
  toast('Comunicazione inviata', 'ok');
  await renderNotifiche();
}

// ═══════════════════════════════════════════════
// NOTIFICHE — HELPER
// ═══════════════════════════════════════════════
// ONESIGNAL
// ═══════════════════════════════════════════════
// L'ID app OneSignal non sta nel codice: arriva da config_sistema via config_pubblica (leggiConfigPubblica in js/config.js)
// REST key gestita da Supabase Edge Function (non nel codice client)

let _ultimaSottoscrizioneSalvata = null;   // evita di salvare due volte la stessa (listener + attesa)
async function _salvaOnesignalIdResp(subId) {
  if (!subId || subId === _ultimaSottoscrizioneSalvata) return;
  _ultimaSottoscrizioneSalvata = subId;
  const { data, error } = await sb.rpc('salva_onesignal_id', { p_user_id: currentUserRow.id, p_onesignal_id: subId, p_session_token: null });
  if (error || !data?.ok) { _ultimaSottoscrizioneSalvata = null; console.warn('Notifiche: salvataggio della sottoscrizione non riuscito'); }
}

// Alias push SEGRETO del responsabile (mai users.id): mio_push_alias restituisce solo il proprio
// (responsabile_sessione_ok: auth.uid() = id). Solo in memoria; mai in console, mai nel DOM.
let _pushAliasResp = null;
async function _aliasPushResp() {
  if (!currentUserRow) return null;
  try {
    const { data } = await sb.rpc('mio_push_alias', { p_responsabile_id: currentUserRow.id, p_session_token: null });
    if (data?.ok && data.push_alias) _pushAliasResp = data.push_alias;
  } catch (e) { /* resta quello già in memoria */ }
  return _pushAliasResp;
}
async function _oneSignalLoginResp(OneSignal) {
  const alias = await _aliasPushResp();
  if (alias && currentUserRow) { try { await OneSignal.login(alias); } catch (e) { console.warn('OneSignal login non riuscito'); } }
}

// ── Notifiche push del responsabile ──
// Fino a mango-v35 initOneSignalResp usciva subito ("if (!window.OneSignalDeferred) return"): la coda
// non era mai creata prima del login, quindi il responsabile non si è mai iscritto (né da PC né da
// iPhone). Ora la coda nasce in <head>, prima della libreria; all'accesso solo init + login con l'alias;
// il permesso si chiede SOLO dal pulsante "Attiva notifiche" (iOS lo concede solo dentro un gesto).
let _oneSignalAvviatoResp = false;
let _oneSignalResp = null;          // libreria pronta (dopo init)
let _attivazioneInCorso = false;
let _avvisoNotificheNascosto = false;
try { _avvisoNotificheNascosto = localStorage.getItem('mangoapp-avviso-notifiche') === 'nascosto'; } catch (e) { /* storage non disponibile */ }

function _eIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function _appInstallata() {
  try { return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; }
}
function _pushSupportate() { return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window; }

// Stato delle notifiche su QUESTO dispositivo
function _statoNotifiche() {
  if (_eIOS() && !_appInstallata()) return 'ios-safari';
  if (!_pushSupportate()) return 'non-supportate';
  if (_attivazioneInCorso) return 'in-corso';
  const p = Notification.permission;
  if (p === 'denied') return 'negato';
  // Avvio fallito o non completato entro _ATTESA_AVVIO_MS: mai "verifica in corso" senza fine
  if (_erroreOneSignal && !_oneSignalResp) return 'errore';
  if (p === 'granted') {
    const ps = _oneSignalResp?.User?.PushSubscription;
    if (!_oneSignalResp) return 'caricamento';
    if (_iscrizioneInCorso) return 'in-corso';
    return ps && ps.optedIn && ps.id ? 'attive' : 'da-attivare';
  }
  return 'da-attivare';
}

const _TESTI_NOTIFICHE = {
  'attive': 'Notifiche attive su questo dispositivo.',
  'da-attivare': 'Notifiche non attive su questo dispositivo: attivale per ricevere subito le richieste di permesso e gli avvisi.',
  'in-corso': 'Attivazione delle notifiche in corso…',
  'caricamento': 'Verifica delle notifiche in corso…',
  'errore': 'Notifiche non disponibili su questo dispositivo in questo momento.',
  'ios-safari': 'Per ricevere le notifiche apri Mango Resp dalla schermata Home (le notifiche funzionano solo nell\'app installata).',
  'non-supportate': 'Questo browser non supporta le notifiche push.',
};
function _testoNegato() {
  return _eIOS()
    ? 'Notifiche bloccate. Per riattivarle: Impostazioni dell\'iPhone → Notifiche → Mango Resp → Consenti notifiche.'
    : 'Notifiche bloccate nel browser. Per riattivarle: icona del lucchetto accanto all\'indirizzo → Notifiche → Consenti, poi ricarica la pagina.';
}

// Disegna i riquadri: Panoramica (se da fare), pannello "Altro" sul telefono, Impostazioni (sempre)
function _aggiornaAvvisoNotifiche() {
  const stato = currentUser && currentUserRow?.ruolo === 'responsabile' ? _statoNotifiche() : null;
  const testo = stato === 'negato' ? _testoNegato() : (_TESTI_NOTIFICHE[stato] || '');
  const conPulsante = stato === 'da-attivare' || stato === 'errore';
  const daMostrare = stato === 'da-attivare' || stato === 'negato' || stato === 'ios-safari' || stato === 'errore';
  const riempi = (el, conNonOra) => {
    if (!el) return;
    el.replaceChildren();
    const p = document.createElement('span');
    p.className = 'avviso-notifiche-testo';
    p.textContent = testo;
    el.appendChild(p);
    if (conPulsante || conNonOra) {
      const azioni = document.createElement('span');
      azioni.className = 'avviso-notifiche-azioni';
      if (conPulsante) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn btn-primary';
        b.textContent = stato === 'errore' ? 'Riprova' : 'Attiva notifiche';
        b.addEventListener('click', stato === 'errore' ? riprovaNotificheResp : attivaNotificheResp);
        azioni.appendChild(b);
      }
      if (conNonOra) {
        const n = document.createElement('button');
        n.type = 'button'; n.className = 'btn btn-secondary'; n.textContent = 'Non ora';
        n.addEventListener('click', () => { _avvisoNotificheNascosto = true; try { localStorage.setItem('mangoapp-avviso-notifiche', 'nascosto'); } catch (e) { /* ignora */ } _aggiornaAvvisoNotifiche(); });
        azioni.appendChild(n);
      }
      el.appendChild(azioni);
    }
  };
  const dash = document.getElementById('avviso-notifiche-dash');
  if (dash) { dash.hidden = !stato || !daMostrare || _avvisoNotificheNascosto; if (!dash.hidden) riempi(dash, true); }
  const altro = document.getElementById('avviso-notifiche-altro');
  if (altro) { altro.hidden = !stato || !daMostrare; if (!altro.hidden) riempi(altro, false); }
  const imp = document.getElementById('stato-notifiche-dispositivo');
  if (imp) {
    imp.hidden = !stato;
    if (stato) { riempi(imp, false); imp.dataset.stato = stato; }
  }
}

// Tocco su "Attiva notifiche": il permesso va chiesto SUBITO, nello stesso gesto (niente await prima).
function attivaNotificheResp() {
  if (_attivazioneInCorso) return;
  if (!_pushSupportate()) { _aggiornaAvvisoNotifiche(); return; }
  let richiesta;
  try {
    richiesta = _oneSignalResp?.Notifications?.requestPermission
      ? _oneSignalResp.Notifications.requestPermission()
      : Notification.requestPermission();        // libreria non ancora pronta: permesso nativo, OneSignal lo vedrà all'avvio
  } catch (e) { richiesta = Promise.reject(e); }
  _attivazioneInCorso = true;
  _aggiornaAvvisoNotifiche();
  Promise.resolve(richiesta).catch(() => null).then(async () => {
    if (Notification.permission === 'granted' && _oneSignalResp) {
      try { if (!_oneSignalResp.User.PushSubscription.optedIn) await _oneSignalResp.User.PushSubscription.optIn(); } catch (e) { /* riprova il listener */ }
      await _salvaSottoscrizioneResp(_oneSignalResp, 15);
    }
  }).finally(() => {
    _attivazioneInCorso = false;
    if (Notification.permission === 'granted') toast(_statoNotifiche() === 'attive' ? 'Notifiche attivate su questo dispositivo' : 'Permesso concesso: attivazione in corso', 'ok');
    _aggiornaAvvisoNotifiche();
  });
}

// La sottoscrizione arriva con qualche secondo di ritardo: attende l'id e lo salva (mai in console)
async function _salvaSottoscrizioneResp(OneSignal, secondi) {
  let subId = OneSignal.User.PushSubscription.id;
  for (let i = 0; i < secondi && !subId; i++) {
    await new Promise(r => setTimeout(r, 1000));
    subId = OneSignal.User.PushSubscription.id;
  }
  if (subId && OneSignal.User.PushSubscription.optedIn && currentUserRow) await _salvaOnesignalIdResp(subId);
  _aggiornaAvvisoNotifiche();
}

// Avvio che non si completa (libreria bloccata, rete, service worker rifiutato): dopo questo tempo
// si mostra "Notifiche non disponibili" con "Riprova", mai "verifica in corso" senza fine.
const _ATTESA_AVVIO_MS = 20000;
let _erroreOneSignal = false;
let _iscrizioneInCorso = false;

// "Riprova": ricarica la pagina, cioè rilancia l'avvio di OneSignal da zero (una seconda
// OneSignal.init sulla stessa pagina non è affidabile).
function riprovaNotificheResp() { location.reload(); }

async function initOneSignalResp() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  if (_oneSignalAvviatoResp) {
    // postLogin può ripartire (SIGNED_IN al ritorno in primo piano): solo il login dell'alias
    window.OneSignalDeferred.push(_oneSignalLoginResp);
    _aggiornaAvvisoNotifiche();
    return;
  }
  _oneSignalAvviatoResp = true;
  _erroreOneSignal = false;
  _aggiornaAvvisoNotifiche();
  // Anche se la libreria non arriva proprio (la coda non viene mai eseguita)
  const timerAvvio = setTimeout(() => {
    if (!_oneSignalResp) { _erroreOneSignal = true; console.warn('Notifiche: avvio non completato'); _aggiornaAvvisoNotifiche(); }
  }, _ATTESA_AVVIO_MS);
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      // scope esplicito: il service worker è /MangoApp/sw.js (lo stesso della cache, con il codice push
      // dalla v33) e non può controllare "/", lo scope predefinito di OneSignal: senza questo parametro
      // il browser rifiutava la registrazione e l'avvio non si completava mai.
      const appId = (await leggiConfigPubblica(sb))?.onesignal_app_id;
      if (!appId) throw new Error('onesignal_app_id non configurato');
      const base = new URL('./', location.href).pathname;   // cartella dell'app (anche fuori da /MangoApp/)
      await OneSignal.init({ appId, notifyButton: { enable: false }, serviceWorkerPath: base + 'sw.js', serviceWorkerParam: { scope: base } });
    } catch (e) {
      clearTimeout(timerAvvio);
      _erroreOneSignal = true;
      console.warn('Notifiche: avvio non riuscito');
      _aggiornaAvvisoNotifiche();
      return;
    }
    clearTimeout(timerAvvio);
    _oneSignalResp = OneSignal;
    _erroreOneSignal = false;
    try {
      // La sottoscrizione arriva dopo il permesso, anche con secondi di ritardo
      OneSignal.User.PushSubscription.addEventListener('change', async (event) => {
        const subId = event.current?.id;
        if (subId && event.current?.optedIn !== false && currentUserRow) await _salvaOnesignalIdResp(subId);
        _aggiornaAvvisoNotifiche();
      });
      OneSignal.Notifications.addEventListener('permissionChange', () => _aggiornaAvvisoNotifiche());
      await _oneSignalLoginResp(OneSignal);
      // Permesso già concesso (es. PC già abilitato): niente richiesta; se la sottoscrizione non è
      // attiva la si riattiva (optIn non richiede un gesto quando il permesso c'è già) e la si salva.
      if (Notification.permission === 'granted') {
        _iscrizioneInCorso = true;
        _aggiornaAvvisoNotifiche();
        try {
          if (!OneSignal.User.PushSubscription.optedIn) await OneSignal.User.PushSubscription.optIn();
        } catch (e) { console.warn('Notifiche: riattivazione non riuscita'); }
        try { await _salvaSottoscrizioneResp(OneSignal, 10); } finally { _iscrizioneInCorso = false; }
      }
    } catch (e) { _iscrizioneInCorso = false; console.warn('Notifiche: iscrizione non completata'); }
    _aggiornaAvvisoNotifiche();
  });
}

async function inviaNotificaATutti(tipo, testo, ordineId = null) {
  const { data: utenti } = await sb.from('users').select('id').eq('attivo', true).neq('eliminato', true);
  if (!utenti?.length) return;
  // Il trigger DB trg_push_notifica invia automaticamente la push per ogni INSERT: qui basta inserire la notifica
  await sb.from('notifiche').insert(utenti.map(u => ({ destinatario_id: u.id, tipo, testo, ordine_id: ordineId })));
}

async function inviaNotificaAResponsabile(tipo, testo, ordineId = null) {
  const { data: resp } = await sb.from('users').select('id').eq('ruolo', 'responsabile').eq('attivo', true);
  if (!resp?.length) return;
  await sb.from('notifiche').insert(resp.map(u => ({ destinatario_id: u.id, tipo, testo, ordine_id: ordineId })));
}

async function checkOrdiniInRitardo() {
  const oggi = Calendario.oggiIso();
  const inRitardo = ordiniCache.filter(o => o.stato === 'aperto' && o.scadenza && o.scadenza < oggi);
  for (const o of inRitardo) {
    // Controlla se già notificato oggi
    const { data: esistente } = await sb.from('notifiche')
      .select('id').eq('ordine_id', o.id).eq('tipo', 'ordine_in_ritardo')
      .gte('creata_il', oggi + 'T00:00:00Z').limit(1);
    if (!esistente?.length) {
      await inviaNotificaAResponsabile('ordine_in_ritardo',
        `Ordine in ritardo: ${o.cliente} — ${o.codice || ''} (scaduto il ${formatDate(o.scadenza)})`, o.id);
    }
  }
}
