// js/config.js — unico punto di configurazione degli ambienti (produzione/test)
//
// Script classico (non ES module): i tre file HTML dichiarano funzioni e
// oltre 250 attributi onclick inline che si aspettano SUPABASE_URL/SUPABASE_ANON
// come identificatori globali di script classico, condivisi fra i vari <script>
// della stessa pagina. Un modulo ES ha uno scope proprio e non li esporrebbe
// come globali senza toccare ogni funzione richiamata da onclick — qui
// serve la forma meno invasiva possibile rispetto al codice esistente.

const AMBIENTI = {
  produzione: {
    url:  'https://mtpzfxnyfkzikzlkomwz.supabase.co',
    anon: 'sb_publishable_enADFCnzAdVajpilZyd_6Q_JIOZVW2u'
  },
  test: {
    url:  'https://kpdlynvmsoctagwtzrxr.supabase.co',
    anon: 'sb_publishable_SzV089R7GLT6oox2-ZWdXQ_sPzhWcC5'
  }
};

// Configurazione di deploy facoltativa (js/config.deploy.js → window.MANGO_CONFIG): sovrascrive o
// aggiunge ambienti senza modificare questo file. Senza di essa valgono i valori predefiniti sopra.
(function applicaConfigDeploy() {
  const d = (typeof window !== 'undefined' && window.MANGO_CONFIG) || {};
  Object.entries(d.ambienti || {}).forEach(([nome, a]) => {
    if (a && typeof a.url === 'string' && typeof a.anon === 'string') AMBIENTI[nome] = { url: a.url, anon: a.anon };
  });
})();

const AMBIENTE_DEFAULT = (window.MANGO_CONFIG && AMBIENTI[window.MANGO_CONFIG.ambienteDefault]) ? window.MANGO_CONFIG.ambienteDefault : 'produzione';

function rilevaAmbiente() {
  const daUrl = new URLSearchParams(location.search).get('env');
  if (daUrl) {
    if (AMBIENTI[daUrl]) {
      localStorage.setItem('mangoapp-env', daUrl);
      return daUrl;
    }
    // Parametro presente ma sconosciuto (es. errore di battitura): default
    // sicuro a produzione, e ripulisce lo stato salvato — un typo non deve
    // MAI lasciare l'app agganciata a un ambiente non-produzione per errore.
    localStorage.removeItem('mangoapp-env');
    return AMBIENTE_DEFAULT;
  }
  const salvato = localStorage.getItem('mangoapp-env');
  if (salvato && AMBIENTI[salvato]) return salvato;
  return AMBIENTE_DEFAULT;
}

const AMBIENTE      = rilevaAmbiente();
const SUPABASE_URL  = AMBIENTI[AMBIENTE].url;
const SUPABASE_ANON = AMBIENTI[AMBIENTE].anon;
const IS_PRODUZIONE = AMBIENTE === 'produzione';

// Configurazione pubblica del server (RPC config_pubblica, leggibile anche prima del login; es. l'ID app delle
// notifiche push). Risposta in cache per la sessione della pagina; null se non raggiungibile.
let _configPubblicaCache = null;
async function leggiConfigPubblica(client) {
  if (_configPubblicaCache) return _configPubblicaCache;
  try {
    const { data, error } = await client.rpc('config_pubblica');
    if (!error && data) _configPubblicaCache = data;
  } catch (e) { /* offline: nessuna configurazione pubblica */ }
  return _configPubblicaCache;
}

// Versione del client — da incrementare SEMPRE insieme a CACHE in sw.js (stesso valore,
// stesso commit). Letta da responsabile.html per la guardia di versione sulle operazioni
// distruttive (esportazione/archiviazione) — vedi Checklist-Sicurezza.md nel vault.
const APP_VERSION = 'mango-v72';

// Guardia di versione per operatore.html e ufficio.html: se la versione minima richiesta dal server (config_pubblica) è
// maggiore di questa, un client rimasto in cache non resta in uso. Prima prova da solo ad aggiornarsi (cancella cache e
// service worker e ricarica, una volta sola per versione richiesta); se resta obsoleto mostra "Aggiorna l'app" a tutto schermo.
// Se la verifica non riesce (offline, formato non riconosciuto) non blocca nulla.
function _numVersione(v) { const m = /^mango-v(\d+)$/.exec(v || ''); return m ? parseInt(m[1], 10) : null; }
async function controllaVersioneMinima(client) {
  try {
    const minima = (await leggiConfigPubblica(client))?.versione_minima_client;
    const n = _numVersione(minima), mia = _numVersione(APP_VERSION);
    if (n === null || mia === null || mia >= n) return true;
    const aggiorna = async () => {
      try { (await navigator.serviceWorker?.getRegistrations?.() || []).forEach(r => r.unregister()); } catch (e) {}
      try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
      location.reload();
    };
    let tentato = null;
    try { tentato = sessionStorage.getItem('mango-agg-tentato'); } catch (e) {}
    if (tentato !== minima) {
      try { sessionStorage.setItem('mango-agg-tentato', minima); } catch (e) {}
      aggiorna();
      return false;
    }
    const velo = document.createElement('div');
    velo.id = 'mango-aggiorna-app';
    velo.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:var(--bg,#fff);color:var(--text,#111);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-family:system-ui,sans-serif';
    velo.innerHTML = '<div style="font-size:22px;font-weight:700">Aggiorna l&rsquo;app</div><div style="max-width:320px;line-height:1.4">Questa versione non è più supportata. Tocca il pulsante per caricare quella nuova.</div>';
    const b = document.createElement('button');
    b.textContent = 'Aggiorna ora';
    b.style.cssText = 'padding:14px 28px;font-size:17px;font-weight:600;border:0;border-radius:12px;background:#f59e0b;color:#111;cursor:pointer';
    b.onclick = aggiorna;
    velo.appendChild(b);
    document.body.appendChild(velo);
    return false;
  } catch (e) { return true; }
}

// ═══════════════════════════════════════════════
// SETTIMANA ISO 8601 — usata nel dettaglio ordine (operatore.html + responsabile.html)
// ═══════════════════════════════════════════════
// Numero di settimana ISO 8601 da una data 'YYYY-MM-DD': settimana che inizia di lunedì,
// la settimana 1 dell'anno è quella che contiene il primo giovedì. Ritorna un intero, o
// null se la data è assente/non valida (nessun placeholder da mostrare). Calcolo in UTC
// per non dipendere dal fuso locale. Nessun campo nuovo nel DB: si calcola al volo.
function settimanaIsoDaData(scadenza) {
  if (!scadenza) return null;
  const [y, m, d] = String(scadenza).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const giornoLun0 = (dt.getUTCDay() + 6) % 7;       // lun=0 … dom=6
  dt.setUTCDate(dt.getUTCDate() - giornoLun0 + 3);    // porta al giovedì della stessa settimana
  const primoGiovedi = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const pgLun0 = (primoGiovedi.getUTCDay() + 6) % 7;
  primoGiovedi.setUTCDate(primoGiovedi.getUTCDate() - pgLun0 + 3);
  return 1 + Math.round((dt - primoGiovedi) / (7 * 24 * 3600 * 1000));
}

// ═══════════════════════════════════════════════
// INDICATORE VISIVO — banda fissa quando non produzione
// ═══════════════════════════════════════════════
function mostraBandaAmbienteTest() {
  if (IS_PRODUZIONE) return;
  const banda = document.createElement('div');
  banda.id = 'mango-banda-ambiente';
  banda.textContent = `⚠ AMBIENTE DI ${AMBIENTE.toUpperCase()} — NON È PRODUZIONE ⚠`;
  banda.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:999999',
    'background:#B03A2E', 'color:#fff', 'font-family:sans-serif',
    'font-weight:700', 'font-size:13px', 'letter-spacing:0.5px',
    'text-align:center', 'padding:6px 8px', 'box-shadow:0 2px 6px rgba(0,0,0,0.3)'
  ].join(';');
  document.body.prepend(banda);
  // Spinge il contenuto sotto la banda invece di sovrapporlo.
  document.body.style.paddingTop = '32px';
  // Altezza della banda per gli elementi fissi a tutto schermo (layout telefono di responsabile.html)
  document.documentElement.style.setProperty('--banda-ambiente', '32px');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mostraBandaAmbienteTest);
} else {
  mostraBandaAmbienteTest();
}

// ═══════════════════════════════════════════════════════════════════════════
// FOTO ALLEGATE — componente condiviso (operatore.html + responsabile.html)
// ═══════════════════════════════════════════════════════════════════════════
// Un solo posto per: lettura (via edge function allegato-url, mai storage diretto —
// vedi sotto il perché), visualizzatore a schermo intero con zoom, eliminazione.
// Ogni pagina deve definire PRIMA di usare queste funzioni:
//   function _identitaCorrente() { return { userId, sessionToken, soloLettura }; }
// (session_token è null per il responsabile, che valida via Supabase Auth — stesso
// pattern già usato in tutte le RPC di responsabile.html).
//
// PERCHÉ non storage.createSignedUrl() diretto dal client (come faceva prima
// operatore.html): storage.objects ha SELECT solo per `authenticated`. L'operatore
// (PIN + session_token) gira sempre come `anon` — la lettura falliva SEMPRE, in
// silenzio (la riga in `allegati` si legge, il file mai). Non risolto allargando la
// policy ad anon: `allegati` ha già lettura anonima libera sulle righe, quindi
// chiunque avesse la chiave anon (pubblica, nel repository) avrebbe potuto elencare
// ed esfiltrare ogni foto di produzione. Risolto con una edge function dedicata che
// valida la sessione (riusa valida_sessione, non reimplementata) e restituisce URL
// firmati a scadenza breve — stesso schema di allegato-upload/allegato-elimina.
// Vedi nota vault 2026-09-01-foto-lettura-operatori-visualizzatore.

let _fotoViewerState = { items: [], idx: 0, ordineFaseId: null, containerId: null, selezione: new Set(), modoSelezione: false, onRicarica: null };

// Le edge function allegato-* girano internamente con la service role per operare sullo
// storage, ma quando devono decidere CHI sta chiamando (valida_sessione, elimina_allegati,
// salva_allegato) hanno bisogno del JWT vero del chiamante — la service role non ne ha uno,
// quindi auth.uid() risulterebbe sempre NULL e il ramo "responsabile" di valida_sessione
// (che confronta auth.uid() = p_user_id) fallirebbe sempre, anche per un responsabile
// autenticato. sb.functions.invoke() NON inoltra automaticamente il JWT della sessione Auth
// corrente (stesso motivo per cui inviaNotificaPush() in responsabile.html usa già un fetch
// manuale con Authorization esplicito per send-push, invece di functions.invoke()) — va
// allegato qui esplicitamente. Per un operatore (anon, PIN, nessuna sessione Supabase Auth)
// non c'è nulla da inoltrare: il fallback è la stessa anon key già usata implicitamente oggi,
// comportamento identico a prima.
async function _headerAutorizzazione() {
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token || sb.supabaseKey;
    return { Authorization: `Bearer ${token}` };
  } catch (e) {
    return { Authorization: `Bearer ${sb.supabaseKey}` };
  }
}

// Con ordineId (e ordineFaseId null) mostra TUTTE le foto dell'ordine (livello ordine + vecchie di fase), per data di caricamento.
async function caricaERenderizzaFoto(containerId, ordineFaseId, ordineId = null) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!navigator.onLine) {
    container.innerHTML = '<div class="note-box" style="border-color:#C27B00">📵 Foto non consultabili senza connessione — quelle già caricate sono al sicuro.</div>';
    return;
  }
  const identita = (typeof _identitaCorrente === 'function') ? _identitaCorrente() : null;
  if (!identita?.userId) return;

  let risposta;
  try {
    const r = await sb.functions.invoke('allegato-url', {
      headers: await _headerAutorizzazione(),
      body: ordineId
        ? { p_user_id: identita.userId, p_session_token: identita.sessionToken, p_ordine_id: ordineId }
        : { p_user_id: identita.userId, p_session_token: identita.sessionToken, p_ordine_fase_id: ordineFaseId }
    });
    risposta = r.data;
    if (r.error || !risposta?.ok) throw (r.error || new Error(risposta?.errore || 'errore'));
  } catch (e) {
    console.error('Elenco foto:', e);
    container.innerHTML = '<div class="note-box" style="border-color:#B03A2E">⚠ Impossibile caricare l\'elenco foto — riprova.</div>';
    return;
  }

  const items = risposta.allegati || [];
  _fotoViewerState = { items, idx: 0, ordineFaseId, containerId, selezione: new Set(), modoSelezione: false,
    onRicarica: () => caricaERenderizzaFoto(containerId, ordineFaseId, ordineId) };

  if (!items.length) {
    container.innerHTML = '<div class="note-box" style="color:var(--muted,#7A6E65)">Nessuna foto allegata.</div>';
    return;
  }
  _renderGrigliaFoto();
}

function _renderGrigliaFoto() {
  const st = _fotoViewerState;
  const container = document.getElementById(st.containerId);
  if (!container) return;
  const identita = _identitaCorrente();
  const puoEliminare = !identita?.soloLettura; // il server (elimina_allegati) decide davvero: qui è solo per mostrare il pulsante

  let html = '<div class="note-box" style="margin-bottom:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
    `<strong>Foto allegate (${st.items.length})</strong>`;
  if (puoEliminare) {
    if (st.modoSelezione) {
      const tutte = st.items.every(a => st.selezione.has(a.id));
      html += `<div style="display:flex;gap:6px">
        <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="_fotoSelezionaTutte(${!tutte})">${tutte ? 'Deseleziona tutte' : 'Seleziona tutte'}</button>
        <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="_fotoAnnullaSelezione()">Annulla</button>
      </div>`;
    } else {
      html += '<button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="_fotoAttivaSelezione()">Seleziona</button>';
    }
  }
  html += '</div><div style="display:flex;flex-wrap:wrap;gap:8px">';

  st.items.forEach((a, i) => {
    if (!st.modoSelezione) {
      html += `<img src="${a.signedUrl || ''}" class="foto-thumb" onclick="apriVisualizzatoreFoto(${i})">`;
    } else {
      const sel = st.selezione.has(a.id);
      html += `<div class="foto-sel-wrapper${sel ? ' selezionata' : ''}" onclick="_fotoToggleSel('${a.id}')">
        <img src="${a.signedUrl || ''}">
        <div class="foto-sel-check">${sel ? '✓' : ''}</div>
      </div>`;
    }
  });
  html += '</div>';
  if (st.modoSelezione && st.selezione.size > 0) {
    html += `<button type="button" class="btn-elimina-sel" onclick="_fotoEliminaSelezionate()">🗑 Elimina selezionate (${st.selezione.size})</button>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

function _fotoAttivaSelezione() { _fotoViewerState.modoSelezione = true; _renderGrigliaFoto(); }
function _fotoAnnullaSelezione() { _fotoViewerState.modoSelezione = false; _fotoViewerState.selezione.clear(); _renderGrigliaFoto(); }
function _fotoToggleSel(id) { const s = _fotoViewerState.selezione; s.has(id) ? s.delete(id) : s.add(id); _renderGrigliaFoto(); }
function _fotoSelezionaTutte(seleziona) {
  _fotoViewerState.items.forEach(a => seleziona ? _fotoViewerState.selezione.add(a.id) : _fotoViewerState.selezione.delete(a.id));
  _renderGrigliaFoto();
}

// Usata sia dalla selezione multipla in griglia sia dal pulsante elimina nel visualizzatore.
// L'eliminazione (RPC elimina_allegati + edge function allegato-elimina) non è toccata:
// solo l'interfaccia che la richiama.
async function _eliminaAllegatiConConferma(ids) {
  if (!ids.length) return false;
  const n = ids.length;
  if (!confirm(`Eliminare ${n} foto? L'operazione è irreversibile.`)) return false;
  const identita = _identitaCorrente();
  const { data, error } = await sb.functions.invoke('allegato-elimina', {
    headers: await _headerAutorizzazione(),
    body: { p_allegato_ids: ids, p_operatore_id: identita.userId, p_session_token: identita.sessionToken }
  });
  if (error || !data?.ok) { toast('Errore: ' + (error?.message || data?.errore || ''), 'err'); return false; }

  const nEliminate = data.eliminati?.length || 0;
  const nRifiutate = data.rifiutati?.length || 0;
  if (nRifiutate > 0) {
    toast(`${nEliminate} eliminat${nEliminate === 1 ? 'a' : 'e'}, ${nRifiutate} non eliminat${nRifiutate === 1 ? 'a' : 'e'}: puoi eliminare solo le foto che hai caricato tu o delle fasi su cui lavori`, 'err');
  } else {
    const cancellazioneParziale = (data.storage_eliminati ?? 0) < (data.storage_richiesti ?? 0) || (data.storage_errori?.length ?? 0) > 0;
    if (cancellazioneParziale) toast('Riga eliminata ma file non rimosso dallo storage — segnalalo al responsabile', 'err');
    else toast(`${nEliminate} foto eliminat${nEliminate === 1 ? 'a' : 'e'}`, 'ok');
  }
  return true;
}

async function _fotoEliminaSelezionate() {
  const ids = Array.from(_fotoViewerState.selezione);
  const fatto = await _eliminaAllegatiConConferma(ids);
  if (fatto) {
    // Non fidarsi dello stato locale filtrato: ricarica per davvero dal server.
    if (_fotoViewerState.onRicarica) await _fotoViewerState.onRicarica();
  }
}

// ── Foto dell'ORDINE (mango-v47): allegare, da operatore e responsabile, finché l'ordine non è spedito ──
// Una sola sezione per ordine: pulsante "Allega foto a questo ordine" (Scatta foto / Allega da galleria, anteprima, caricamento con avanzamento)
// e sotto le miniature di tutte le foto dell'ordine. Chi può caricare lo decide il server (autorizza_upload_allegato + salva_allegato);
// qui si nasconde solo il pulsante. Nessuna coda offline: senza connessione si avvisa e basta.
const _fotoOrdineStato = {};   // containerId -> { ordineId, files: [], urls: [], invio: false }
const FOTO_ORDINE_TIPI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const FOTO_ORDINE_ERRORI = {
  ordine_spedito: 'Ordine già spedito: non si possono più allegare foto',
  ordine_non_modificabile: 'Questo ordine non è più modificabile',
  ordine_non_trovato: 'Ordine non trovato',
  sessione_non_valida: 'Sessione scaduta, effettua di nuovo l\'accesso',
  non_autorizzato: 'Non puoi allegare foto a questo ordine',
  accesso_sola_lettura: 'Account in sola lettura: non puoi allegare foto',
  estensione_non_consentita: 'Formato foto non supportato',
};

function _fotoOrdineOnline() { return (typeof isOnline !== 'undefined') ? !!isOnline : navigator.onLine; }
function _estensioneFoto(file) { return FOTO_ORDINE_TIPI[file.type] || ((file.name || '').split('.').pop() || 'jpg').toLowerCase(); }
async function _corpoErroreEdge(error, data) {
  if (data && typeof data === 'object' && data.errore) return data;
  try { return await error?.context?.json(); } catch (e) { return null; }
}
function fotoOrdineMessaggio(r) { return r?.messaggio || FOTO_ORDINE_ERRORI[r?.errore] || 'Foto non caricata: riprova'; }

// Carica UNA foto all'ordine (firma di upload, upload su storage, registrazione): { ok, errore, messaggio }
async function fotoOrdineCarica(file, ordineId, idx) {
  const identita = _identitaCorrente();
  try {
    const { data: firma, error: eFirma } = await sb.functions.invoke('allegato-upload', {
      headers: await _headerAutorizzazione(),
      body: { p_user_id: identita.userId, p_session_token: identita.sessionToken, tipo: 'ordine', ordine_id: ordineId, estensione: _estensioneFoto(file), indice: idx }
    });
    if (eFirma || !firma?.ok) { const b = await _corpoErroreEdge(eFirma, firma); return { ok: false, errore: b?.errore, messaggio: b?.messaggio }; }
    const { error: upErr } = await sb.storage.from('allegati-fasi').uploadToSignedUrl(firma.path, firma.token, file);
    if (upErr) { console.error('Upload foto:', upErr); return { ok: false, errore: 'upload_fallito' }; }
    const { data: ins, error: eIns } = await sb.rpc('salva_allegato', { p_url_file: firma.path, p_operatore_id: identita.userId, p_session_token: identita.sessionToken, p_ordine_id: ordineId });
    if (eIns || !ins?.ok) return { ok: false, errore: ins?.errore, messaggio: ins?.messaggio };
    return { ok: true };
  } catch (e) {
    console.error('Caricamento foto ordine:', e);
    return { ok: false, errore: 'rete' };
  }
}

function renderSezioneFotoOrdine(containerId, ordineId, opzioni = {}) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const vecchio = _fotoOrdineStato[containerId];
  if (vecchio) vecchio.urls.forEach(u => URL.revokeObjectURL(u));
  _fotoOrdineStato[containerId] = { ordineId, files: [], urls: [], invio: false, onCaricate: opzioni.onCaricate || null };
  const identita = _identitaCorrente();
  const puoAllegare = !opzioni.spedito && !identita?.soloLettura;
  c.innerHTML = (puoAllegare ? `
    <button type="button" class="btn btn-primary foto-ord-btn" id="${containerId}-apri" onclick="fotoOrdineApri('${containerId}')"><i data-ic="fotocamera"></i> Allega foto a questo ordine</button>
    <div class="foto-ord-pannello" id="${containerId}-pannello" style="display:none">
      <div class="foto-ord-azioni">
        <button type="button" class="btn btn-secondary" onclick="fotoOrdineScatta('${containerId}')"><i data-ic="fotocamera"></i> Scatta foto</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('${containerId}-gal').click()"><i data-ic="immagine"></i> Allega da galleria</button>
      </div>
      <input type="file" id="${containerId}-gal" accept="image/*" multiple style="display:none" onchange="fotoOrdineAggiungi('${containerId}', this)">
      <input type="file" id="${containerId}-cam" accept="image/*" capture="environment" style="display:none" onchange="fotoOrdineAggiungi('${containerId}', this)">
      <div class="foto-ord-anteprima" id="${containerId}-anteprima"></div>
      <button type="button" class="btn btn-ok" id="${containerId}-carica" disabled onclick="fotoOrdineInvia('${containerId}')">Carica foto</button>
      <div class="foto-ord-barra" id="${containerId}-barra" style="display:none"><div id="${containerId}-barra-i"></div></div>
      <div class="foto-ord-stato" id="${containerId}-stato" aria-live="polite"></div>
    </div>` : "") + (opzioni.onCaricate ? "" : `<div id="${containerId}-griglia"></div>`);
  if (!opzioni.onCaricate) caricaERenderizzaFoto(containerId + "-griglia", null, ordineId);
}

function fotoOrdineApri(containerId) {
  if (!_fotoOrdineOnline()) { toast('Per allegare foto serve la connessione', 'err'); return; }
  const p = document.getElementById(containerId + '-pannello');
  if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
}

function fotoOrdineScatta(containerId) {
  if (!_fotoOrdineOnline()) { toast('Per allegare foto serve la connessione', 'err'); return; }
  const st = _fotoOrdineStato[containerId];
  // operatore.html ha la fotocamera interna (più scatti, mai la galleria di sistema); altrove si usa il selettore con fotocamera
  if (typeof apriFotocameraInterna === 'function') apriFotocameraInterna(st.ordineId);
  else document.getElementById(containerId + '-cam')?.click();
}

function fotoOrdineAggiungi(containerId, input) {
  const st = _fotoOrdineStato[containerId];
  if (!st) return;
  [...input.files].forEach(f => { st.files.push(f); st.urls.push(URL.createObjectURL(f)); });
  input.value = '';
  _fotoOrdineDisegnaAnteprima(containerId);
}

function fotoOrdineTogli(containerId, i) {
  const st = _fotoOrdineStato[containerId];
  if (!st || st.invio) return;
  URL.revokeObjectURL(st.urls[i]); st.files.splice(i, 1); st.urls.splice(i, 1);
  _fotoOrdineDisegnaAnteprima(containerId);
}

function _fotoOrdineDisegnaAnteprima(containerId) {
  const st = _fotoOrdineStato[containerId];
  const el = document.getElementById(containerId + '-anteprima');
  if (!st || !el) return;
  el.innerHTML = st.files.map((_, i) => `<div class="foto-ord-item"><img class="foto-thumb" src="${st.urls[i]}" alt="Foto ${i + 1}"><button type="button" aria-label="Togli foto" onclick="fotoOrdineTogli('${containerId}', ${i})">✕</button></div>`).join('');
  const b = document.getElementById(containerId + '-carica');
  if (b) { b.disabled = st.invio || !st.files.length; b.textContent = st.files.length ? `Carica ${st.files.length} ${st.files.length === 1 ? 'foto' : 'foto'}` : 'Carica foto'; }
}

async function fotoOrdineInvia(containerId) {
  const st = _fotoOrdineStato[containerId];
  if (!st || st.invio || !st.files.length) return;
  if (!_fotoOrdineOnline()) { toast('Per allegare foto serve la connessione', 'err'); return; }
  st.invio = true;
  const btn = document.getElementById(containerId + '-carica');
  const barra = document.getElementById(containerId + '-barra'), barraI = document.getElementById(containerId + '-barra-i');
  const stato = document.getElementById(containerId + '-stato');
  if (btn) btn.disabled = true;
  if (barra) barra.style.display = '';
  const totale = st.files.length;
  const rimaste = [], urlRimaste = [];
  let riuscite = 0, ultimoErrore = null;
  for (let i = 0; i < totale; i++) {
    if (stato) stato.textContent = `Caricamento foto ${i + 1} di ${totale}…`;
    if (barraI) barraI.style.width = Math.round((i / totale) * 100) + '%';
    const r = await fotoOrdineCarica(st.files[i], st.ordineId, i + 1);
    if (r.ok) { riuscite++; URL.revokeObjectURL(st.urls[i]); }
    else {
      ultimoErrore = r; rimaste.push(st.files[i]); urlRimaste.push(st.urls[i]);
      if (r.errore === 'ordine_spedito') {   // spedito nel frattempo: le foto che restano non si possono più allegare
        for (let j = i + 1; j < totale; j++) { rimaste.push(st.files[j]); urlRimaste.push(st.urls[j]); }
        break;
      }
    }
  }
  st.files = rimaste; st.urls = urlRimaste; st.invio = false;
  if (barraI) barraI.style.width = '100%';
  if (ultimoErrore?.errore === 'ordine_spedito') {
    toast(fotoOrdineMessaggio(ultimoErrore), 'err');
    renderSezioneFotoOrdine(containerId, st.ordineId, { spedito: true, onCaricate: st.onCaricate });
    return;
  }
  if (barra) barra.style.display = 'none';
  if (barraI) barraI.style.width = '0';
  _fotoOrdineDisegnaAnteprima(containerId);
  if (ultimoErrore) {
    if (stato) stato.textContent = `${riuscite} caricate, ${rimaste.length} no: premi di nuovo "Carica" per riprovare`;
    toast(`${fotoOrdineMessaggio(ultimoErrore)} (${riuscite}/${totale} caricate)`, 'err');
  } else {
    if (stato) stato.textContent = '';
    toast(`${riuscite} ${riuscite === 1 ? 'foto caricata' : 'foto caricate'}`, 'ok');
    const p = document.getElementById(containerId + '-pannello'); if (p) p.style.display = 'none';
  }
  if (riuscite) { if (st.onCaricate) st.onCaricate(); else caricaERenderizzaFoto(containerId + "-griglia", null, st.ordineId); }
}

// dopo uno scatto con la fotocamera interna (operatore.html): rilegge le miniature di quell'ordine
function fotoOrdineRicarica(ordineId) {
  Object.keys(_fotoOrdineStato).forEach(cid => {
    if (_fotoOrdineStato[cid].ordineId === ordineId && document.getElementById(cid + '-griglia')) caricaERenderizzaFoto(cid + '-griglia', null, ordineId);
  });
}

// ── Visualizzatore a schermo intero: zoom (pinch + doppio tocco), navigazione,
//    tasto indietro del telefono, eliminazione della singola foto ──
let _visEl = null;
let _visResetZoom = () => {};

function _creaVisualizzatoreDom() {
  if (_visEl) return _visEl;
  const el = document.createElement('div');
  el.id = 'vis-foto-overlay';
  el.innerHTML =
    '<div id="vis-foto-bar">' +
      '<button type="button" id="vis-foto-chiudi" aria-label="Chiudi">✕</button>' +
      '<span id="vis-foto-counter"></span>' +
      '<button type="button" id="vis-foto-elimina" aria-label="Elimina">🗑</button>' +
    '</div>' +
    '<div id="vis-foto-stage"><img id="vis-foto-img" draggable="false"></div>' +
    '<button type="button" id="vis-foto-prev" aria-label="Foto precedente">‹</button>' +
    '<button type="button" id="vis-foto-next" aria-label="Foto successiva">›</button>';
  document.body.appendChild(el);
  _visEl = el;

  el.querySelector('#vis-foto-chiudi').onclick = () => history.back();
  el.querySelector('#vis-foto-prev').onclick = () => _visMuovi(-1);
  el.querySelector('#vis-foto-next').onclick = () => _visMuovi(1);
  el.querySelector('#vis-foto-elimina').onclick = async () => {
    const st = _fotoViewerState;
    const a = st.items[st.idx];
    if (!a) return;
    const fatto = await _eliminaAllegatiConConferma([a.id]);
    if (fatto) {
      history.back(); // chiude il visualizzatore consumando lo stato pushato all'apertura
      // Mai fidarsi dello stato locale filtrato: chi ha aperto il visualizzatore decide come
      // ricaricare (griglia di una fase, o galleria aggregata di un intero ordine).
      if (st.onRicarica) await st.onRicarica();
    }
  };

  _visInstallaGestiZoom(el.querySelector('#vis-foto-stage'), el.querySelector('#vis-foto-img'));
  return el;
}

// Variante per una galleria non legata a una singola fase (es. vista aggregata di un intero
// ordine in responsabile.html): stesso visualizzatore condiviso (zoom/navigazione/eliminazione),
// senza un containerId/ordineFaseId — chi chiama passa invece onRicarica, la propria funzione
// per ridisegnare la vista dopo un'eliminazione da qui. Se omesso, dopo un'eliminazione la vista
// resta quella di prima finché non viene riaperta manualmente.
function apriVisualizzatoreDaLista(items, idx, onRicarica = null) {
  _fotoViewerState = { items, idx: 0, ordineFaseId: null, containerId: null, selezione: new Set(), modoSelezione: false, onRicarica };
  apriVisualizzatoreFoto(idx);
}

function apriVisualizzatoreFoto(idx) {
  const st = _fotoViewerState;
  if (!st.items.length) return;
  st.idx = idx;
  _creaVisualizzatoreDom();
  _visMostra();
  _visEl.classList.add('open');
  // Il tasto indietro del telefono deve chiudere il visualizzatore, non la pagina/app sotto.
  history.pushState({ visualizzatoreFoto: true }, '');
}

function chiudiVisualizzatoreFoto() {
  if (_visEl) _visEl.classList.remove('open');
}

window.addEventListener('popstate', () => {
  if (_visEl && _visEl.classList.contains('open')) chiudiVisualizzatoreFoto();
});

// Tastiera (desktop/collaudo): stesse scorciatoie del vecchio lightbox.
document.addEventListener('keydown', (e) => {
  if (!_visEl || !_visEl.classList.contains('open')) return;
  if (e.key === 'Escape') history.back();
  else if (e.key === 'ArrowLeft') _visMuovi(-1);
  else if (e.key === 'ArrowRight') _visMuovi(1);
});

function _visMuovi(delta) {
  const st = _fotoViewerState;
  st.idx = (st.idx + delta + st.items.length) % st.items.length;
  _visMostra();
}

function _visMostra() {
  const st = _fotoViewerState;
  const a = st.items[st.idx];
  const img = _visEl.querySelector('#vis-foto-img');
  img.src = a?.signedUrl || '';
  _visResetZoom();
  _visEl.querySelector('#vis-foto-counter').textContent = `${st.idx + 1} di ${st.items.length}`;
  const multi = st.items.length > 1;
  _visEl.querySelector('#vis-foto-prev').style.display = multi ? '' : 'none';
  _visEl.querySelector('#vis-foto-next').style.display = multi ? '' : 'none';
}

// Pinch a due dita + doppio tocco per zoomare, trascinamento per spostarsi a zoom attivo.
// Pointer Events (non Touch Events): un solo percorso per touch e mouse, supportato da
// Safari iOS e Chrome Android — nessuna libreria esterna.
function _visInstallaGestiZoom(stage, img) {
  let scale = 1, tx = 0, ty = 0;
  let startDist = 0, startScale = 1;
  let startX = 0, startY = 0, startTx = 0, startTy = 0;
  const pointers = new Map();
  let ultimoTap = 0;

  function applica() { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; }
  _visResetZoom = () => { scale = 1; tx = 0; ty = 0; applica(); };

  function distanza(pts) { const [a, b] = pts; return Math.hypot(a.x - b.x, a.y - b.y); }

  stage.addEventListener('pointerdown', (e) => {
    // setPointerCapture può fallire su un pointerId che il browser non considera attivo
    // (capita con eventi sintetici, e in teoria in casi limite di multi-touch reale) — non
    // deve mai interrompere il resto della gestione del gesto.
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* non fatale */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty; }
    else if (pointers.size === 2) { startDist = distanza([...pointers.values()]); startScale = scale; }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const nuovaDist = distanza([...pointers.values()]);
      if (startDist > 0) { scale = Math.min(6, Math.max(1, startScale * (nuovaDist / startDist))); applica(); }
    } else if (pointers.size === 1 && scale > 1) {
      tx = startTx + (e.clientX - startX);
      ty = startTy + (e.clientY - startY);
      applica();
    }
  });

  function fine(e) {
    const eraUnDito = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) startDist = 0;
    if (eraUnDito && pointers.size === 0) {
      const ora = Date.now();
      if (ora - ultimoTap < 300) {
        if (scale > 1) { scale = 1; tx = 0; ty = 0; } else { scale = 2.5; }
        applica();
        ultimoTap = 0;
      } else {
        ultimoTap = ora;
      }
    }
  }
  stage.addEventListener('pointerup', fine);
  stage.addEventListener('pointercancel', fine);

  // Doppio click (desktop/trackpad): stesso comportamento del doppio tocco.
  stage.addEventListener('dblclick', () => {
    if (scale > 1) { scale = 1; tx = 0; ty = 0; } else { scale = 2.5; }
    applica();
  });
}

// CSS del visualizzatore, iniettato una sola volta — un solo posto anche per lo stile,
// non due fogli che possono disallinearsi fra le pagine.
(function iniettaCssVisualizzatoreFoto() {
  const css = `
#vis-foto-overlay { display:none; position:fixed; inset:0; z-index:10001; background:#000; flex-direction:column; }
#vis-foto-overlay.open { display:flex; }
#vis-foto-bar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:rgba(0,0,0,.6); position:relative; z-index:2; flex:0 0 auto; }
#vis-foto-bar button { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; padding:6px 10px; line-height:1; }
#vis-foto-counter { color:#fff; font-size:13px; }
#vis-foto-stage { flex:1 1 auto; min-height:0; position:relative; overflow:hidden; touch-action:none; display:flex; align-items:center; justify-content:center; }
#vis-foto-img { max-width:100%; max-height:100%; object-fit:contain; will-change:transform; user-select:none; -webkit-user-drag:none; touch-action:none; }
#vis-foto-prev, #vis-foto-next { position:absolute; top:50%; transform:translateY(-50%); background:rgba(0,0,0,.35); border:none; color:#fff; font-size:32px; width:48px; height:64px; cursor:pointer; z-index:2; }
#vis-foto-prev { left:0; }
#vis-foto-next { right:0; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();
