// responsabile.html — caricamento dei dati (fasi, ordini, operatori, notifiche, configurazioni).
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

async function caricaNomiFasiExtraStoria() {
  const { data } = await sb.from('fasi_ordine_extra')
    .select('nome')
    .not('nome', 'is', null)
    .order('nome');
  if (!data) return;
  // Conta frequenza e ordina per numero utilizzi (più usati prima)
  const freq = {};
  data.forEach(r => { if (r.nome) freq[r.nome] = (freq[r.nome] || 0) + 1; });
  const ordinati = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const dl = document.getElementById('nomi-fasi-extra-storia');
  if (dl) dl.innerHTML = ordinati.map(n => `<option value="${escapeHtml(n)}">`).join('');
}

async function loadFasi() {
  const [{ data: fasiData }, { data: tipiCriteri }, { data: materCriteri }, { data: strutCriteri }, { data: competenzeData }, { data: dipData }, { data: modiData }, { data: attrCriteri }] = await Promise.all([
    sb.from('fasi').select('*, tipo_gestione').order('posizione').order('id'),
    sb.from('fase_tipi_prodotto').select('fase_id, tipo_prodotto_id'),
    sb.from('fase_materiali').select('fase_id, materiale_valore'),
    sb.from('fase_strutture').select('fase_id, struttura_valore'),
    sb.from('competenze_operatore_fase').select('fase_id, operatore_id, priorita').order('priorita'),
    sb.from('fase_dipendenze').select('fase_id, dipende_da_fase_id'),
    sb.from('fase_criteri_modo').select('fase_id, attributo_chiave, modo'),
    sb.from('fase_criteri_attributi').select('fase_id, attributo_chiave, valore'),
  ]);
  const modoDi = (faseId, chiave) => (modiData || []).find(r => r.fase_id === faseId && r.attributo_chiave === chiave)?.modo || 'solo';
  fasi = (fasiData || []).map(f => ({
    ...f,
    attiva:            f.attiva !== false,
    modo_tipi:         modoDi(f.id, 'tipo_prodotto'),
    modo_materiali:    modoDi(f.id, 'materiale'),
    modo_strutture:    modoDi(f.id, 'struttura'),
    criteri_attributi: (attrCriteri || []).filter(r => r.fase_id === f.id).reduce((m, r) => { (m[r.attributo_chiave] ||= []).push(r.valore); return m; }, {}),
    modi_attr:         Object.fromEntries((modiData || []).filter(r => r.fase_id === f.id && !['tipo_prodotto', 'materiale', 'struttura'].includes(r.attributo_chiave)).map(r => [r.attributo_chiave, r.modo])),
    criteri_tipi:      (tipiCriteri  || []).filter(r => r.fase_id === f.id).map(r => r.tipo_prodotto_id),
    criteri_materiali: (materCriteri || []).filter(r => r.fase_id === f.id).map(r => r.materiale_valore),
    criteri_strutture: (strutCriteri || []).filter(r => r.fase_id === f.id).map(r => r.struttura_valore),
    competenze:        (competenzeData || []).filter(r => r.fase_id === f.id).sort((a,b) => a.priorita - b.priorita).map(r => r.operatore_id),
    dipendenze:        (dipData || []).filter(r => r.fase_id === f.id).map(r => r.dipende_da_fase_id),
  }));
  renderFasiOpzionaliForm();
}

// Fasi attive (le disattivate restano in `fasi` solo per risolvere i nomi dello storico)
function fasiAttive() { return fasi.filter(f => f.attiva !== false); }

// Il responsabile legge le tabelle di configurazione; il modulo condiviso Etichette ne riceve una copia
function sincronizzaEtichette() {
  Etichette.imposta({ tipi_prodotto: tipiProdotto, attributi: attributiConfig, priorita: prioritaConfig, lati: typeof latiConfig !== 'undefined' ? latiConfig : [] });
}

async function loadPrioritaConfig() {
  const { data } = await sb.from('priorita_ordine_config').select('*').order('posizione');
  prioritaConfig = data || [];
  sincronizzaEtichette();
  popolaPrioritaSelects();
}

async function loadAttributiConfig() {
  const [{ data }, { data: opz }] = await Promise.all([
    sb.from('attributi_prodotto_config').select('*').order('posizione'),
    sb.from('attributo_opzioni').select('attributo_chiave, valore, etichetta, posizione, attivo').order('posizione'),
  ]);
  attributiConfig = (data || []).map(a => ({
    ...a,
    opzioni: (opz || []).filter(o => o.attributo_chiave === a.chiave).sort((x, y) => (x.posizione || 0) - (y.posizione || 0)),
  }));
  sincronizzaEtichette();
  popolaAttributiSelects();
}

function popolaPrioritaSelects() {
  const opts = prioritaConfig.filter(p => p.attivo).map(p =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.etichetta)}</option>`
  ).join('');
  const allOpts = `<option value="">Tutte le priorità</option>` + opts;
  ['ord-prio', 'mod-prio'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
  const fltEl = document.getElementById('ord-priorita');
  if (fltEl) fltEl.innerHTML = allOpts;
}

function popolaAttributiSelects() {
  attributiConfig.forEach(attr => {
    const sorted = [...(attr.opzioni || [])].filter(o => o.attivo !== false).sort((a, b) => (a.posizione||0) - (b.posizione||0));
    const opts = sorted.map(o =>
      `<option value="${escapeHtml(o.valore)}">${escapeHtml(o.etichetta)}</option>`
    ).join('');
    if (attr.chiave === 'struttura') {
      ['ord-struttura', 'mod-struttura'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
      });
      const fltEl = document.getElementById('flt-struttura');
      if (fltEl) fltEl.innerHTML = `<option value="">Tutte le strutture</option>` + opts;
    }
  });
}

function renderFasiOpzionaliForm() {
  const container = document.getElementById('std-fasi-opzionali-container');
  if (!container) return;
  const fasiOp = fasiAttive().filter(f => f.opzionale);
  if (!fasiOp.length) { container.style.display = 'none'; return; }
  container.innerHTML = fasiOp.map(f => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;font-weight:600;margin-bottom:4px">
      <input type="checkbox" id="ord-fase-opz-${f.id}">
      ${escapeHtml(f.nome)}
    </label>
  `).join('');
  container.style.display = '';
}

async function loadTipiProdotto() {
  const { data } = await sb.from('tipi_prodotto').select('*').order('posizione').order('id');
  tipiProdotto = data || [];
  sincronizzaEtichette();
  popolaTipiProdottoSelects();
}

function popolaTipiProdottoSelects() {
  const opts = tipiProdotto.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  const optsConTutti = `<option value="">Tutti i tipi</option>` + opts;
  const flt = document.getElementById('flt-tipo-prodotto');
  const crea = document.getElementById('ord-tipo-prodotto');
  const mod = document.getElementById('mod-tipo-prodotto');
  if (flt) flt.innerHTML = optsConTutti;
  if (crea) crea.innerHTML = opts;
  if (mod) mod.innerHTML = opts;
}

async function loadOrdini() {
  const { data } = await sb.from('ordini')
    .select('*, creato_da_user:users!creato_da(nome, cognome)')
    .in('stato', ['aperto', 'sospeso', 'attesa_spedizione'])
    .neq('eliminato', true);
  const prioWeights = Object.fromEntries(prioritaConfig.map(p => [p.id, p.peso]));
  ordiniCache = (data || []).sort((a, b) => {
    const as = a.stato === 'attesa_spedizione' ? 0 : 1;
    const bs = b.stato === 'attesa_spedizione' ? 0 : 1;
    if (as !== bs) return as - bs;
    const pd = (prioWeights[b.priorita] ?? 0) - (prioWeights[a.priorita] ?? 0);
    if (pd !== 0) return pd;
    if (a.scadenza && b.scadenza) return new Date(a.scadenza) - new Date(b.scadenza);
    if (a.scadenza) return -1;
    if (b.scadenza) return 1;
    return new Date(b.creato_il) - new Date(a.creato_il);
  });

  if (ordiniCache.some(o => o.gruppo_spedizione_id)) {
    const { data: gj } = await sb.rpc('gruppi_spedizione_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null });
    gruppiSpedizioneCache = Object.fromEntries((gj?.gruppi || []).map(g => [g.id, g]));
  } else gruppiSpedizioneCache = {};

  // gruppi con le fasi di spedizione unica chiuse ma altri ordini ancora da finire (stesso momento del ricaricamento degli ordini)
  spedizioniNonProntePerGruppo = {};
  if (ordiniCache.some(o => o.gruppo_spedizione_id)) {
    try {
      const { data: np } = await sb.rpc('spedizioni_non_pronte', { p_responsabile_id: currentUserRow.id, p_session_token: null });
      (np?.gruppi || []).forEach(g => { spedizioniNonProntePerGruppo[g.gruppo_id] = g.membri || []; });
    } catch (e) { console.warn('spedizioni_non_pronte', e); }
  }

  // segno «note riservate» nella lista: un'unica chiamata leggera per tutti gli ordini
  try {
    const { data: nc } = await sb.rpc('note_riservate_conteggi', { p_responsabile_id: currentUserRow.id, p_session_token: null });
    noteRiservateConteggi = Object.fromEntries((nc?.ordini || []).map(x => [x.ordine_id, x.n]));
  } catch (e) { console.warn('note_riservate_conteggi', e); }

  const trenta30 = new Date(); trenta30.setDate(trenta30.getDate() - 30);
  const [{ data: spediti }, { count: cnt30 }] = await Promise.all([
    sb.from('ordini').select('*').eq('stato', 'spedito').neq('eliminato', true).order('spedito_il', { ascending: false }),
    sb.from('ordini').select('id', { count: 'exact', head: true }).eq('stato', 'spedito').gte('spedito_il', trenta30.toISOString()),
  ]);
  ordiniSpeditiCache = spediti || [];
  _spediti30Count = cnt30 ?? 0;
  // Carica statistiche lavoro per tutti gli ordini spediti in batch
  if (ordiniSpeditiCache.length) {
    const ids = ordiniSpeditiCache.map(o => o.id);
    const { data: stats } = await sb.rpc('statistiche_lavoro_ordini', { p_ordine_ids: ids });
    lavoroStatsCache = {};
    (stats || []).forEach(s => { lavoroStatsCache[s.ordine_id] = s; });
  }
}

async function loadOperatori() {
  const { data } = await sb.from('users')
    .select('id, nome, cognome, ruolo, attivo, ore_default, escluso_pianificazione, pin_da_cambiare, pin_da_reimpostare, pin_scelta_scadenza, puo_registrare_avvisi')
    .in('ruolo', ['operatore', 'sola_lettura'])
    .neq('eliminato', true)
    .order('cognome');
  operatoriCache = data || [];
}

async function loadNotifiche() {
  const [{ data }, { count }] = await Promise.all([
    sb.from('notifiche')
      .select('*, ordini(codice)')
      .eq('destinatario_id', currentUserRow?.id)
      .order('creata_il', { ascending: false })
      .limit(50),
    // Conteggio reale delle non lette — il badge non può derivare da notificheCache,
    // che è troncata a 50 righe: con più di 50 non lette il badge sottostimerebbe.
    sb.from('notifiche')
      .select('id', { count: 'exact', head: true })
      .eq('destinatario_id', currentUserRow?.id).eq('letta', false),
  ]);

  notificheCache = data || [];
  const unread = count || 0;
  const badge = document.getElementById('notif-badge');
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
  const bb = document.getElementById('barra-conta-notif');
  if (bb) { bb.textContent = String(unread); bb.hidden = !unread; }
}
