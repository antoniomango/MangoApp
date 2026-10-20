// responsabile.html — Avvio e accesso: init, versione client, login/MFA/logout, realtime; ultimo modulo caricato, termina con init()
// Script classico: stesso ambito globale della pagina; caricato per ultimo (dopo navigazione.js e tutti gli altri moduli)



// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
MangoTema.montaSelettore(document.getElementById('tema-selettore-resp'));

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    if (await mfaDaCompletare()) mostraMfaLogin(); else await postLogin();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      if (await mfaDaCompletare()) mostraMfaLogin(); else await postLogin();
    } else if (event === 'SIGNED_OUT') {
      ripristinaLoginCredenziali();
      fermaContatoriRichieste();
      // Il dispositivo non riceve più le push del responsabile uscito (alias external_id)
      _pushAliasResp = null;
      if (window.OneSignalDeferred) window.OneSignalDeferred.push(async function(OneSignal) { try { await OneSignal.logout(); } catch (e) { console.warn('OneSignal logout:', e); } });
      currentUser = null;
      _aggiornaAvvisoNotifiche();
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-screen').style.display = 'none';
    }
  });
}

// ═══════════════════════════════════════════════
// GUARDIA DI VERSIONE — blocca solo le operazioni distruttive (esportazione/
// archiviazione) su un client con Service Worker obsoleto in cache. La sola
// consultazione resta sempre possibile. Se la verifica stessa fallisce (rete
// assente, chiave mancante), NON blocca — fallisce in modo sicuro, solo un
// avviso in console. Vedi Checklist-Sicurezza.md e la nota d'incidente nel vault.
// ═══════════════════════════════════════════════
let clientObsoleto = false;

function _numeroVersione(v) {
  const m = /^mango-v(\d+)$/.exec(v || '');
  return m ? parseInt(m[1], 10) : null;
}

async function verificaVersioneClient() {
  const label = document.getElementById('app-version-label');
  if (label) { label.textContent = APP_VERSION; label.style.color = ''; }
  try {
    const { data, error } = await sb.from('config_sistema').select('valore').eq('chiave', 'versione_minima_client').maybeSingle();
    if (error || !data?.valore) {
      console.warn('verificaVersioneClient: versione_minima_client non disponibile, nessun blocco applicato', error?.message);
      clientObsoleto = false;
      return;
    }
    const minima = _numeroVersione(data.valore);
    const attuale = _numeroVersione(APP_VERSION);
    if (minima === null || attuale === null) {
      console.warn('verificaVersioneClient: formato versione non riconosciuto, nessun blocco applicato', data.valore, APP_VERSION);
      clientObsoleto = false;
      return;
    }
    clientObsoleto = attuale < minima;
    if (clientObsoleto) {
      console.warn(`Client obsoleto: ${APP_VERSION} < ${data.valore} richiesta. Esportazione/archiviazione bloccate.`);
      if (label) label.style.color = 'var(--alert)';
    }
  } catch (e) {
    console.warn('verificaVersioneClient: verifica fallita, nessun blocco applicato', e.message);
    clientObsoleto = false;
  }
}

function _bloccaSeClientObsoleto() {
  if (!clientObsoleto) return false;
  alert('Versione dell\'app non aggiornata. Ricarica la pagina con Ctrl+Shift+R prima di esportare.');
  return true;
}

async function postLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  // Fetch user row
  // Solo le colonne che authenticated può leggere su users (privilegi per colonna, 20260929_users_privilegi_colonna):
  // mai forzato_logout, onesignal_id, creato_il né i campi di sicurezza, che la pagina non usa.
  const { data } = await sb.from('users').select('id, nome, cognome, email, ruolo, attivo, eliminato').eq('email', currentUser.email).single();
  currentUserRow = data;
  navAssociaUtente(data?.id);
  document.getElementById('user-label').textContent = data ? `${data.nome} ${data.cognome}` : currentUser.email;
  const um = document.getElementById('nav-mobile-utente');
  if (um) um.textContent = (data ? `${data.nome} ${data.cognome}` : currentUser.email) + (typeof APP_VERSION !== 'undefined' ? ' · ' + APP_VERSION : '');
  document.getElementById('header-date').textContent = new Date().toLocaleDateString('it-IT', { weekday:'short', day:'numeric', month:'short' });
  verificaVersioneClient(); // non bloccante: le operazioni distruttive controllano clientObsoleto al click
  // Load fasi e tipi prodotto (devono precedere il resto)
  await Promise.all([loadFasi(), loadTipiProdotto(), loadPrioritaConfig(), loadAttributiConfig(), loadLatiConfig(), loadLavorazioniCnc(), Calendario.carica(sb, currentUserRow.id, null)]);
  // Load data
  await Promise.all([loadOrdini(), loadOperatori(), loadNotifiche(), loadOrarioConfig(), loadMacroFasi(), loadFaseMediaMinuti(), loadFaseExtraMediaMinuti(), caricaNomiFasiExtraStoria(), loadMacchine()]);
  // Check ordini in ritardo (solo responsabile)
  if (currentUserRow?.ruolo === 'responsabile') checkOrdiniInRitardo();
  // Realtime
  setupRealtime();
  scheduleEndOfShiftRefresh();
  initOneSignalResp();
  if (currentUserRow?.ruolo === 'responsabile') { aggiornaBadgeRichieste(); aggiornaBadgeDispositivi(); avviaContatoriRichieste(); }
  // Render in base al ruolo
  if (currentUserRow?.ruolo === 'sola_lettura') {
    // Nascondi nav e funzioni non pertinenti all'ufficio
    document.querySelector('nav').style.display = 'none';
    document.querySelector('.barra-mobile')?.style.setProperty('display', 'none', 'important');
    document.querySelector('.topbar').insertAdjacentHTML('afterbegin',
      `<div style="font-weight:700;font-size:14px;color:var(--accent);margin-right:auto"><i data-ic="grafico"></i> Vista Ufficio</div>`);
    showSection('ufficio');
    await loadUfficio();
  } else {
    const destinazione = _sezioneDaLink();
    if (destinazione) showSection(destinazione);
    else { showSection('dashboard'); renderDashboard(); }
  }
}

// Collegamento diretto (es. da una push): responsabile.html?sezione=richieste oppure #richieste.
// Solo valori in whitelist; il parametro viene poi tolto dall'indirizzo.
function _sezioneDaLink() {
  const AMMESSE = ['richieste', 'assenze', 'operatori'];
  let v = '';
  try { v = new URLSearchParams(location.search).get('sezione') || location.hash.replace(/^#/, ''); } catch (e) { return null; }
  if (!AMMESSE.includes(v)) return null;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
  return v;
}

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════
async function doLogin() {
  if (_mfaLoginAttivo) { await confermaMfaLogin(); return; }
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';

  const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
  if (error) {
    errEl.textContent = 'Credenziali non valide. Riprova.';
    errEl.style.display = 'block';
  }
}

document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-mfa-codice').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ── verifica a due fattori (codice dell'app di autenticazione) ──
let _mfaLoginAttivo = false;
async function mfaDaCompletare() {
  try {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch (e) { return false; }
}
function mostraMfaLogin() {
  _mfaLoginAttivo = true;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-credenziali').style.display = 'none';
  document.getElementById('login-mfa').style.display = 'block';
  document.getElementById('login-mfa-annulla').style.display = '';
  document.getElementById('login-btn').textContent = 'Conferma codice';
  document.getElementById('login-err').style.display = 'none';
  document.getElementById('login-mfa-codice').value = '';
  document.getElementById('login-mfa-codice').focus();
}
function ripristinaLoginCredenziali() {
  _mfaLoginAttivo = false;
  document.getElementById('login-credenziali').style.display = '';
  document.getElementById('login-mfa').style.display = 'none';
  document.getElementById('login-mfa-annulla').style.display = 'none';
  document.getElementById('login-btn').textContent = 'Accedi';
  document.getElementById('login-pwd').value = '';
}
async function confermaMfaLogin() {
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  const codice = document.getElementById('login-mfa-codice').value.replace(/\s/g, '');
  const { data: fattori } = await sb.auth.mfa.listFactors();
  const fattore = (fattori?.totp || []).find(f => f.status === 'verified');
  const { error } = fattore ? await sb.auth.mfa.challengeAndVerify({ factorId: fattore.id, code: codice }) : { error: new Error('nessun fattore') };
  if (error) { errEl.textContent = 'Codice non valido. Riprova.'; errEl.style.display = 'block'; return; }
  _mfaLoginAttivo = false;
  ripristinaLoginCredenziali();
  await postLogin();
}

async function doLogout() {
  await sb.auth.signOut();
}















// ═══════════════════════════════════════════════
// REALTIME
// ═══════════════════════════════════════════════
function setupRealtime() {
  // Evita doppia sottoscrizione: quando Supabase ri-spara SIGNED_IN al ritorno
  // dalla background (visibilityChangedCallback), postLogin() richiama setupRealtime()
  // su un canale già attivo — .on() su un canale già subscribe()-ato lancia un'eccezione
  // che interrompe postLogin() e impedisce renderDashboard(). Se il canale esiste già,
  // Supabase gestisce autonomamente la riconnessione: non serve ricreare niente.
  if (_realtimeChannel) return;

  _realtimeChannel = sb.channel('production')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ordini' }, async (payload) => {
      if (payload.new?.stato === 'attesa_spedizione' && payload.old?.stato !== 'attesa_spedizione') {
        await inviaNotificaAResponsabile('ordine_pronto_spedizione',
          `Ordine pronto per spedizione: ${payload.new.cliente} — ${payload.new.codice || ''}`,
          payload.new.id);
      }
      _flussoCtl?.richiedi();
      await loadOrdini();
      renderDashboard();
      renderOrdiniTable();
      renderArchivioTable();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ordini' }, async () => {
      _flussoCtl?.richiedi();
      await loadOrdini();
      renderDashboard();
      renderOrdiniTable();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ordine_fasi' }, async () => {
      _flussoCtl?.richiedi();
      await refreshStime();
      if (currentOrdineId) {
        calcolaStimaSingoloOrdine(currentOrdineId);
        renderDettaglioOrdine(currentOrdineId);
      }
      produzioneCambiata();      // Oggi e Pianificazione si aggiornano da sole quando cambia lo stato di una fase
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fasi_ordine_extra' }, () => _flussoCtl?.richiedi())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'piano_giorno_voci' }, () => produzioneCambiata())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'piano_giorno' }, () => produzioneCambiata())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifiche' }, async () => {
      await loadNotifiche();
      renderNotifiche();
      aggiornaBadgeRichieste();   // una nuova richiesta arriva sempre con una notifica al responsabile
      _contatoreUltimo = Date.now();
      if (document.getElementById('sec-operatori')?.classList.contains('active')) aggiornaStatoAssenze();
    })
    .subscribe(_statoRealtime);
}


init();
