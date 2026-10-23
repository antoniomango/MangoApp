// responsabile.html — stato condiviso della pagina Responsabile: client Supabase, variabili di STATE, etichette, finestre.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// SUPABASE_URL / SUPABASE_ANON arrivano da js/config.js (ambiente produzione/test)
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = null;
let currentUserRow = null;

// Contratto richiesto dal componente foto condiviso (js/config.js): session_token è sempre
// null qui — il responsabile è autenticato via Supabase Auth (auth.uid()), non PIN/session_token.
function _identitaCorrente() {
  return { userId: currentUserRow?.id || null, sessionToken: null, soloLettura: false };
}
let fasi = []; // [{id, nome, descrizione, posizione, trigger_tipo_prodotto}]
let tipiProdotto = []; // [{id, label, posizione}]
let ordiniCache = [];
let noteRiservateConteggi = {};   // ordine_id → numero di note riservate (RPC note_riservate_conteggi), per il segno nella lista
let noteRiservateOrdine = [];   // note dell'ordine aperto nel dettaglio, più recenti in alto
let notaRiservataInModifica = null;   // { id, testo } della nota in modifica, null se nessuna
let notaRiservataBozza = '';   // testo della nuova nota in scrittura
let spedizioniNonProntePerGruppo = {};   // gruppo_id → [{ ordine_id, codice, fasi }]
let gruppiSpedizioneCache = {};   // id gruppo → { id, nome, clienti, consegna } (RPC gruppi_spedizione_elenco)
let ordiniSpeditiCache = [];
let lavoroStatsCache = {}; // ordine_id → {minuti_lavoro, minuti_attesa_esterna, n_operatori}
let _spediti30Count = 0; // contatore spediti 30gg inclusi archiviati
let operatoriCache = [];
let notificheCache = [];
let currentOrdineId = null;
let _realtimeChannel = null; // canale Realtime attivo (evita doppia sottoscrizione al ritorno dalla background)
let faseMediaMinutiMap = {}; // fase_id -> avg minuti per pezzo
let faseEsternaSet = new Set(); // fase_id (int) delle fasi con e_attesa_esterna=true
let faseExtraMediaMinutiMap = {}; // nome_lower -> mediana minuti per unità (fasi_ordine_extra)
let catalogoFasiExtra = []; // catalogo_fasi_extra in memoria
let _etaMinutiCache = {}; // ordine_id -> minuti ETA equivalenti (critico interno + calendario esterno scalato)
let prioritaConfig = []; // [{id, etichetta, peso, posizione, attivo}] da priorita_ordine_config
let attributiConfig = []; // [{chiave, etichetta, opzioni:[{valore,etichetta,posizione,attivo}]}] da attributi_prodotto_config + attributo_opzioni
let riassegnaOrdFaseId = null;

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'modal-operatore') { aggiornaStatoAssenze(); }
}

// Blocco "Tempo di presa" di una coppia fase–macchina (stesso aspetto nella sezione Fasi e nella sezione Macchine)
function presaBloccoHtml(attiva, minuti, ordini, fnToggle, fnCampo, idArg) {
  const C = Etichette.presa.config;
  const val = v => (v === null || v === undefined || Number.isNaN(v)) ? '' : v;
  return `<label style="cursor:pointer"><input type="checkbox" ${attiva ? 'checked' : ''} onchange="${fnToggle}(${idArg}, this.checked)"> ${escapeHtml(C.titolo)}</label>` + (attiva ? `
    <label>${escapeHtml(C.minuti)} <input type="number" min="1" max="1440" step="1" inputmode="numeric" value="${val(minuti)}" oninput="${fnCampo}(${idArg}, 'presa_minuti', this.value)"></label>
    <label>${escapeHtml(C.ordini)} <input type="number" min="1" max="50" step="1" inputmode="numeric" value="${val(ordini)}" oninput="${fnCampo}(${idArg}, 'ante_per_pressata', this.value)"></label>
    <span class="presa-nota">${escapeHtml(Etichette.presa.config.spiega)} ${escapeHtml(C.moltiplicatore)}${minuti > 0 && ordini > 0 ? ' ' + escapeHtml(C.occupa(minuti, ordini)) + '.' : ''}</span>` : '');
}
const presaNumero = v => (v === '' || v === null || v === undefined) ? null : Number(v);
const presaValida = (minuti, ordini) => Number.isInteger(minuti) && minuti >= 1 && minuti <= 1440 && Number.isInteger(ordini) && ordini >= 1 && ordini <= 50;

const strutturaLabel = (s) => Etichette.struttura(s);
const materialeLabel = (m) => Etichette.materiale(m);
const tipoProdLabel = (t) => Etichette.tipoProdotto(t);
const tipoLabel = (t) => strutturaLabel(t);
// Proprietà di fase lette dalla configurazione (fasi.e_cnc, fasi.e_attesa_esterna, fasi.gruppo_spedizione)
const isCNC = (id) => fasi.find(f => f.id === id)?.e_cnc === true;
const isEsterna = (id) => fasi.find(f => f.id === id)?.e_attesa_esterna === true;
const fasePiuPressate = (id) => fasi.find(f => f.id === id)?.piu_pressate === true;
const fasePressatePreviste = (id) => fasi.find(f => f.id === id)?.pressate_previste ?? null;
// numero di pressate previste accanto alla casella "più pressate": compare solo con la casella spuntata
const pressateNumeroHtml = (cls, valore, visibile, extra = '', idLabel = '') => `<label ${idLabel ? `id="${idLabel}" ` : ''}class="pp-num" style="display:${visibile ? 'inline-flex' : 'none'};align-items:center;gap:6px;font-size:12px;color:var(--muted);white-space:nowrap" title="${escapeHtml(Etichette.pressate.config.previsteSpiega)}">${escapeHtml(Etichette.pressate.config.previste)}
  <input type="number" class="${cls}" min="1" max="20" step="1" inputmode="numeric" value="${valore ?? 1}" style="width:60px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--ink);font-size:13px" ${extra}></label>`;
const pressateNumeroValido = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null; };
