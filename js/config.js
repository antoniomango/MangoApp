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
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10cHpmeG55Zmt6aWt6bGtvbXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NzczNzEsImV4cCI6MjA5NzI1MzM3MX0.3JxpgQORCSUUdSgawmcizNgaJhpDnmQ_zT_c41WfJbs'
  },
  test: {
    url:  'https://kpdlynvmsoctagwtzrxr.supabase.co',
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZGx5bnZtc29jdGFnd3R6cnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjE3MzgsImV4cCI6MjA5Nzk5NzczOH0._2rKWXsJDFOI42IrN4lJiWFpbC5eievSRWsuFC1BURM'
  }
};

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
    return 'produzione';
  }
  const salvato = localStorage.getItem('mangoapp-env');
  if (salvato && AMBIENTI[salvato]) return salvato;
  return 'produzione';
}

const AMBIENTE      = rilevaAmbiente();
const SUPABASE_URL  = AMBIENTI[AMBIENTE].url;
const SUPABASE_ANON = AMBIENTI[AMBIENTE].anon;
const IS_PRODUZIONE = AMBIENTE === 'produzione';

// Versione del client — da incrementare SEMPRE insieme a CACHE in sw.js (stesso valore,
// stesso commit). Letta da responsabile.html per la guardia di versione sulle operazioni
// distruttive (esportazione/archiviazione) — vedi Checklist-Sicurezza.md nel vault.
const APP_VERSION = 'mango-v23';

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

async function caricaERenderizzaFoto(containerId, ordineFaseId) {
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
      body: { p_user_id: identita.userId, p_session_token: identita.sessionToken, p_ordine_fase_id: ordineFaseId }
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
    onRicarica: () => caricaERenderizzaFoto(containerId, ordineFaseId) };

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
    await caricaERenderizzaFoto(_fotoViewerState.containerId, _fotoViewerState.ordineFaseId);
  }
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
