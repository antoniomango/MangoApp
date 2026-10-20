// responsabile.html — Configurazione fasi (Elenco e Flusso), macro fasi, vista ufficio.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// MACRO FASI
// ═══════════════════════════════════════════════
let macroFasiCache = []; // [{id, nome, posizione, colore, fasi:[id,...]}]

async function loadMacroFasi() {
  const [{ data: macro }, { data: fasiConMacro }] = await Promise.all([
    sb.from('macro_fasi').select('*').order('posizione').order('id'),
    sb.from('fasi').select('id, macro_fase_id').order('posizione').order('id')
  ]);
  macroFasiCache = (macro || []).map(m => ({
    ...m,
    fasi: (fasiConMacro || []).filter(f => f.macro_fase_id === m.id).map(f => f.id)
  }));
}

function renderMacroConfig() {
  const el = document.getElementById('macro-fasi-list');
  if (!macroFasiCache.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon"><i data-ic="grafico"></i></div><p>Nessun gruppo macro — premi "+ Nuovo gruppo" per iniziare</p></div>`;
    return;
  }
  el.innerHTML = macroFasiCache.map((m, idx) => {
    const checklist = fasiAttive().map(f => `
      <label>
        <input type="checkbox" ${m.fasi.includes(f.id) ? 'checked' : ''} onchange="macroToggleFase(${m.id}, ${f.id}, this.checked)">
        ${escapeHtml(f.nome)}
      </label>`).join('');
    return `
    <div class="macro-cfg-card" id="macro-card-${m.id}">
      <div class="macro-cfg-hdr">
        <input type="color" value="${m.colore || '#6B7280'}" id="macro-col-${m.id}" onchange="macroSet(${m.id}, 'colore', this.value)"
          style="width:32px;height:32px;border:none;border-radius:8px;cursor:pointer;padding:0">
        <input type="text" value="${escapeHtml(m.nome)}" id="macro-nome-${m.id}" oninput="macroSet(${m.id}, 'nome', this.value)"
          style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;background:var(--bg);color:var(--ink)">
        <div style="display:flex;gap:6px">
          ${idx > 0 ? `<button class="btn btn-secondary" style="padding:5px 10px" onclick="spostaM(${m.id},-1)">▲</button>` : ''}
          ${idx < macroFasiCache.length-1 ? `<button class="btn btn-secondary" style="padding:5px 10px" onclick="spostaM(${m.id},1)">▼</button>` : ''}
          <button class="btn" style="padding:5px 10px;background:var(--alert);color:var(--on-alert)" onclick="eliminaMacro(${m.id},'${escapeJsAttr(m.nome)}')" aria-label="Elimina gruppo macro"><i data-ic="cestino"></i></button>
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px">Fasi incluse in questo gruppo</div>
      <div class="macro-fasi-check">${checklist}</div>
    </div>`;
  }).join('');
}

async function aggiungiMacroFase() {
  const nome = prompt('Nome del nuovo gruppo macro (es. "Lavorazione"):');
  if (!nome?.trim()) return;
  const { data, error } = await sb.rpc('salva_macro_fase', { p_id: null, p_nome: nome.trim(), p_colore: '#6B7280', p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadMacroFasi();
  renderMacroConfig();
}

async function spostaM(id, dir) {
  const idx = macroFasiCache.findIndex(m => m.id === id);
  if (!macroFasiCache[idx + dir]) return;
  const ids = macroFasiCache.map(m => String(m.id));
  [ids[idx], ids[idx + dir]] = [ids[idx + dir], ids[idx]];
  const { data, error } = await sb.rpc('riordina_config', { p_tabella: 'macro_fasi', p_ids_in_ordine: ids, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore riordino: ' + (data?.errore || error?.message || ''), 'err'); return; }
  const bozze = macroFasiCache.map(m => ({ id: m.id, nome: m.nome, colore: m.colore, fasi: [...m.fasi] }));
  await loadMacroFasi();
  macroFasiCache.forEach(m => { const b = bozze.find(x => x.id === m.id); if (b) { m.nome = b.nome; m.colore = b.colore; m.fasi = b.fasi; } });   // modifiche non ancora salvate
  renderMacroConfig();
}

async function eliminaMacro(id, nome) {
  if (!confirm(`Eliminare il gruppo "${nome}"?\nLe fasi al suo interno non vengono eliminate.`)) return;
  const { data, error } = await sb.rpc('elimina_macro_fase', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadMacroFasi();
  renderMacroConfig();
  toast('Gruppo eliminato', 'ok');
}

// Stato in memoria (aggiornato a ogni interazione): il salvataggio non rilegge mai il DOM
function macroSet(id, campo, valore) {
  const m = macroFasiCache.find(x => x.id === id);
  if (m) m[campo] = valore;
}
function macroToggleFase(macroId, faseId, on) {
  macroFasiCache.forEach(m => { m.fasi = m.fasi.filter(f => f !== faseId); });   // una fase appartiene a un solo gruppo
  if (on) macroFasiCache.find(m => m.id === macroId)?.fasi.push(faseId);
  renderMacroConfig();
}

async function salvaMacroFasi() {
  for (const m of macroFasiCache) {
    const nome = (m.nome || '').trim();
    if (!nome) { toast('Ogni gruppo deve avere un nome', 'err'); return; }
    const { data, error } = await sb.rpc('salva_macro_fase', { p_id: m.id, p_nome: nome, p_colore: m.colore, p_responsabile_id: currentUserRow.id, p_session_token: null });
    if (error || !data?.ok) { toast('Errore su "' + nome + '": ' + (data?.errore || error?.message || ''), 'err'); return; }
  }
  const assegnazioni = {};
  macroFasiCache.forEach(m => { assegnazioni[m.id] = m.fasi; });
  const { data, error } = await sb.rpc('imposta_macro_fase_assegnazioni', { p_assegnazioni: assegnazioni, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Salvataggio assegnazioni NON riuscito: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadMacroFasi();
  renderMacroConfig();
  toast('Macro fasi salvate', 'ok');
}

// ── VISTA UFFICIO ──
async function loadUfficio() {
  if (!macroFasiCache.length) await loadMacroFasi();
  const { data: ordini } = await sb.from('ordini')
    .select('id, codice, cliente, scadenza, stato, priorita')
    .in('stato', ['aperto', 'attesa_spedizione', 'sospeso'])
    .neq('eliminato', true)
    .order('scadenza', { ascending: true, nullsFirst: false });

  const ordiniAttivi = ordini || [];
  const idsAttivi = ordiniAttivi.map(o => o.id);
  if (!idsAttivi.length) { renderUfficio(ordiniAttivi, []); return; }

  // Come per ufficio.html: mai leggere ordine_fasi senza filtro su ordine_id.
  // Il filtro .in('stato', [...]) qui sotto copriva di fatto TUTTI gli stati possibili,
  // quindi equivaleva a leggere l'intera tabella — Supabase/PostgREST tronca in silenzio
  // oltre il limite "Max Rows" del progetto una volta che la tabella cresce abbastanza.
  const { data: ordFasi, count: nOrdFasi } = await sb.from('ordine_fasi')
    .select('ordine_id, fase_id, stato', { count: 'exact' })
    .in('ordine_id', idsAttivi);

  const risultato = ordFasi || [];
  if (typeof nOrdFasi === 'number' && nOrdFasi !== risultato.length) {
    console.error(`[responsabile/ufficio] ordine_fasi troncato: ricevute ${risultato.length} righe su ${nOrdFasi} attese.`);
  }

  renderUfficio(ordiniAttivi, risultato);
}

function renderUfficio(ordini, ordFasi) {
  const el = document.getElementById('ufficio-ordini');
  if (!ordini.length) { el.innerHTML = '<div class="empty-state"><div class="icon"><i data-ic="appunti"></i></div><p>Nessun ordine attivo</p></div>'; return; }

  // Raggruppa fasi per ordine
  const fasiPerOrdine = {};
  ordFasi.forEach(f => {
    if (!fasiPerOrdine[f.ordine_id]) fasiPerOrdine[f.ordine_id] = [];
    fasiPerOrdine[f.ordine_id].push(f);
  });

  // Mappa fase_id → macro_fase_id
  const faseMacro = {};
  macroFasiCache.forEach(m => m.fasi.forEach(fid => { faseMacro[fid] = m.id; }));

  el.innerHTML = ordini.map(o => {
    const fasi = fasiPerOrdine[o.id] || [];
    const applicabili = fasi.filter(f => f.stato !== 'non_applicabile');
    const completate = applicabili.filter(f => f.stato === 'completata').length;
    const totale = applicabili.length || 1;
    const pctTot = Math.round(completate / totale * 100);

    const isAttesa = o.stato === 'attesa_spedizione';
    const isSosp = o.stato === 'sospeso';
    const oggi = Calendario.oggiIso();
    const inRitardo = o.scadenza && o.scadenza < oggi && !isAttesa;

    // Progresso per macro
    const macroBars = macroFasiCache.map(m => {
      const faseMacroSet = new Set(m.fasi);
      const mFasi = applicabili.filter(f => f.fase_id && faseMacroSet.has(f.fase_id));
      const mComp = mFasi.filter(f => f.stato === 'completata').length;
      const mTot = mFasi.length;
      if (mTot === 0) return '';
      const pct = Math.round(mComp / mTot * 100);
      return `
        <div class="ufficio-macro-row">
          <div class="ufficio-macro-label">
            <span style="color:${escapeHtml(m.colore)}">${escapeHtml(m.nome)}</span>
            <span style="color:var(--muted)">${mComp}/${mTot} — ${pct}%</span>
          </div>
          <div class="ufficio-macro-track">
            <div class="ufficio-macro-fill" style="width:${pct}%;background:${escapeHtml(m.colore)}"></div>
          </div>
        </div>`;
    }).join('');

    const scadenzaHtml = o.scadenza
      ? `<div style="font-size:12px;${inRitardo ? 'color:var(--alert);font-weight:700' : 'color:var(--muted)'}">
           ${inRitardo ? '<i data-ic="avviso"></i> Scad.' : '<i data-ic="calendario"></i>'} ${formatDate(o.scadenza)}${inRitardo ? ' (in ritardo)' : ''}
         </div>`
      : '';

    const statoBadge = isAttesa
      ? `<span class="badge badge-attesa_spedizione">✓ Pronto per spedizione</span>`
      : isSosp
      ? `<span class="badge badge-sospeso"><i data-ic="pausa"></i> Sospeso</span>`
      : `<span class="badge badge-aperto">In produzione</span>`;

    return `
      <div class="ufficio-card" style="${isAttesa ? 'border-color:var(--ok-strong);background:var(--ok-bg)' : inRitardo ? 'border-color:var(--alert)' : ''}">
        <div class="ufficio-card-hdr">
          <div>
            <div class="ufficio-card-title">${escapeHtml(o.cliente)} <span style="font-family:var(--font-mono);font-size:12px;color:var(--muted);font-weight:400">${escapeHtml(o.codice||'')}</span></div>
            <div style="margin-top:4px;display:flex;gap:8px;align-items:center">${statoBadge}${scadenzaHtml}</div>
          </div>
          <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:${pctTot===100?'var(--ok)':'var(--ink)'}">${pctTot}%</div>
        </div>
        ${macroBars || '<div style="font-size:12px;color:var(--muted)">Nessuna macro fase configurata</div>'}
        <div class="ufficio-totale-track">
          <div class="ufficio-totale-fill" style="width:${pctTot}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════
// CONFIGURAZIONE FASI — elenco + dettaglio di una fase, vista Flusso (mango-v53)
// ═══════════════════════════════════════════════
// Una fase alla volta: la bozza vive in memoria (FS.draft), aggiornata a ogni modifica, mai letta dal DOM al clic.
// Un solo Salva per fase, atomico (RPC salva_fase: campi, criteri, dipendenze, macchine, tempo, competenze).
// Nessun valore di configurazione nel codice: fasi, macro fasi, macchine, tempi, criteri e operatori vengono dal database.
const FASI_CAMPO_ORIG = { tipi: 'criteri_tipi', materiali: 'criteri_materiali', strutture: 'criteri_strutture' };
const FS = { nuova: false, mod0: null, vista: 'elenco', sel: null, draft: null, mod: {}, cerca: '', filtro: 'tutte', guard: null, depErr: '', flussoSel: null,
             tempi: [], soglia: null, mobileDettaglio: false, critAperto: {}, compAperto: false, salvando: false };

// Criteri di applicabilità: tipo prodotto + attributi a opzioni (materiale, struttura, ...), tutti da configurazione.
function fasiCriteriDef() {
  const def = [{ campo: 'tipi', modo: 'modo_tipi', titolo: 'Tipi prodotto', tutti: 'tutti i tipi prodotto',
                 opzioni: tipiProdotto.map(t => ({ valore: t.id, etichetta: t.label, attivo: true })) }];
  const per = { materiale: ['materiali', 'modo_materiali'], struttura: ['strutture', 'modo_strutture'] };
  attributiConfig.forEach(a => {
    if (per[a.chiave]) {
      def.push({ campo: per[a.chiave][0], modo: per[a.chiave][1], titolo: a.etichetta, tutti: `tutti i valori di ${a.etichetta.toLowerCase()}`, opzioni: a.opzioni || [] });
    } else if (!a.su_colonna && a.attivo) {
      // attributo d'ordine aggiuntivo: select (opzioni) o numero intero (un valore per ogni numero dell'intervallo)
      const opzioni = a.tipo === 'numero'
        ? Array.from({ length: Math.max(0, a.numero_max - a.numero_min + 1) }, (_, i) => ({ valore: String(a.numero_min + i), etichetta: String(a.numero_min + i), attivo: true }))
        : (a.opzioni || []);
      def.push({ campo: 'attr_' + a.chiave, modo: 'modo_attr_' + a.chiave, titolo: a.etichetta, tutti: `tutti i valori di ${a.etichetta.toLowerCase()}`, opzioni });
    }
  });
  return def;
}

// Valore salvato di un campo della fase (i criteri sugli attributi aggiuntivi vivono in f.criteri_attributi / f.modi_attr)
function fasiOrig(f, campo) {
  if (campo.startsWith('modo_attr_')) return (f.modi_attr || {})[campo.slice(10)] || 'solo';
  if (campo.startsWith('attr_')) return (f.criteri_attributi || {})[campo.slice(5)] || [];
  return f[FASI_CAMPO_ORIG[campo] || campo];
}

// ── modello della fase (stato salvato) e bozza ───────────────────────────────────────────────────────────
const fsClone = o => JSON.parse(JSON.stringify(o));
const fsEster = m => (m.tipo_gestione || 'standard') !== 'standard' || !!m.e_attesa_esterna;
const fsRigheTempo = faseId => FS.tempi.filter(t => t.fase_id === faseId);
// Fase abbinata: il legame è salvato una volta sola (sulla fase con id maggiore), ma si legge e si imposta da entrambe le schede
const faseAbbinataId = (id) => { const f = fasi.find(x => x.id === id); if (!f) return null; if (f.abbinata_a_fase_id != null) return f.abbinata_a_fase_id; return fasi.find(x => x.abbinata_a_fase_id === id)?.id ?? null; };
function fsAbbinabili(m) {
  const mie = new Set((m.macchine || []).map(x => x.id));
  return fasiAttive().filter(f => f.id !== m.id && (f.tipo_gestione || 'standard') === 'standard' && !f.e_attesa_esterna && !f.piu_pressate && !f.gruppo_spedizione
    && (faseAbbinataId(f.id) == null || faseAbbinataId(f.id) === m.id)
    && (() => { const sue = macchineList.filter(x => (x.fase_ids || []).includes(f.id)).map(x => x.id); return (!mie.size && !sue.length) || sue.some(id => mie.has(id)); })());
}
function fsAbbinataHtml(m) {
  const E = Etichette.fasiAbbinate;
  if (m.piu_pressate || m.gruppo_spedizione || fsEster(m)) return m.abbinata_a_fase_id != null ? `<div class="fs-row"><div class="fs-lbl">${escapeHtml(E.titolo)}</div><div class="fs-desc" style="color:var(--alert-ink)">${escapeHtml(E.nonCompatibile)}</div></div>` : '';
  const corrente = m.abbinata_a_fase_id != null ? fasi.find(x => x.id === m.abbinata_a_fase_id) : null;
  const elenco = fsAbbinabili(m);
  if (corrente && !elenco.some(f => f.id === corrente.id)) elenco.unshift(corrente);
  return `<div class="fs-row"><label class="fs-lbl" for="fs-g-ab">${escapeHtml(E.titolo)}</label>
    <select class="fs-inp" id="fs-g-ab" onchange="fsSetAbbinata(this.value)" style="max-width:340px"><option value="">${escapeHtml(E.nessuna)}</option>${elenco.map(f => `<option value="${Number(f.id)}"${corrente && corrente.id === f.id ? ' selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}</select>
    <div class="fs-desc">${corrente ? escapeHtml(E.legame(corrente.nome)) + '. ' : ''}${escapeHtml(E.spiega)}</div><div class="fs-desc">${escapeHtml(E.spiegaRegole)}</div></div>`;
}
function fsSetAbbinata(v) { fsSet('abbinata_a_fase_id', v === '' ? null : Number(v)); }

const fsRigaBase = faseId => fsRigheTempo(faseId).find(t => t.tipo_prodotto == null && t.lavorazione_cnc_id == null) || null;

function fsModello(f) {
  const base = fsRigaBase(f.id);
  const m = {
    id: f.id, nome: f.nome || '', descrizione: f.descrizione || '', macro_fase_id: f.macro_fase_id ?? null,
    tipo_gestione: f.tipo_gestione || 'standard', e_attesa_esterna: !!f.e_attesa_esterna, avvio_automatico: !!f.avvio_automatico,
    e_cnc: !!f.e_cnc, opzionale: !!f.opzionale, gruppo_spedizione: !!f.gruppo_spedizione, piu_pressate: !!f.piu_pressate, pressate_previste: f.pressate_previste ?? null, abbinata_a_fase_id: faseAbbinataId(f.id), ambito_tempo: f.ambito_tempo || 'anta',
    tempo_da_lavorazioni_cnc: !!f.tempo_da_lavorazioni_cnc, materiale_ricezione: f.materiale_ricezione || '',
    solo_per_consegna: f.solo_per_consegna ? [...f.solo_per_consegna].sort() : null,   // null = sempre
    dipendenze: [...(f.dipendenze || [])].sort((a, b) => a - b),
    macchine: macchineList.filter(x => (x.fase_ids || []).includes(f.id)).map(x => ({ id: x.id, fattore: Number((x.fattori || {})[f.id] ?? 1), presa_attiva: !!(x.prese || {})[f.id], presa_minuti: (x.prese || {})[f.id]?.minuti ?? null, ante_per_pressata: (x.prese || {})[f.id]?.ordini ?? null })).sort((a, b) => a.id < b.id ? -1 : 1),
    competenze: [...(f.competenze || [])],
    tempo: base ? { tipico: String(base.minuti_tipici), massimo: String(base.minuti_max) } : { tipico: '', massimo: '' },
  };
  fasiCriteriDef().forEach(def => {
    m[def.campo] = [...(fasiOrig(f, def.campo) || [])].sort();
    m[def.modo] = fasiOrig(f, def.modo) || 'solo';
  });
  return m;
}
function fsRicostruisciModelli() {
  FS.mod = {};
  fasiAttive().forEach(f => { FS.mod[f.id] = fsModello(f); });
  if (FS.nuova && FS.mod0) FS.mod[0] = FS.mod0;   // la scheda "nuova" ha id 0 e come stato salvato un modello vuoto
  if (FS.draft && !FS.mod[FS.draft.id]) FS.draft = null;
}
const fsMod = id => (FS.draft && FS.draft.id === id) ? FS.draft : FS.mod[id];
const fsLista = () => fasiAttive();
// Fase nuova: stessa scheda della modifica, con id 0 e un modello salvato vuoto (la bozza si confronta con quello: parte "pulita")
function fsModelloVuoto() {
  const lista = fasiAttive();
  const m = { id: 0, nome: '', descrizione: '', macro_fase_id: null, tipo_gestione: 'standard', e_attesa_esterna: false, avvio_automatico: false, e_cnc: false, opzionale: false,
    gruppo_spedizione: false, piu_pressate: false, pressate_previste: null, abbinata_a_fase_id: null, ambito_tempo: 'anta', tempo_da_lavorazioni_cnc: false, materiale_ricezione: '', solo_per_consegna: null,
    dipendenze: [], dipendenti: [], dopo: lista.length ? String(lista[lista.length - 1].id) : 'top', macchine: [], competenze: [], tempo: { tipico: '', massimo: '' } };
  fasiCriteriDef().forEach(def => { m[def.campo] = []; m[def.modo] = 'solo'; });
  return m;
}
function fsNuova() {
  if (fsSporca()) { FS.guard = { tipo: 'nuova' }; fsRenderDettaglio(); fsVaiInAlto(); return; }
  fsAvviaNuova();
}
function fsAvviaNuova() {
  FS.mod0 = fsModelloVuoto(); FS.mod[0] = FS.mod0; FS.nuova = true; FS.draft = fsClone(FS.mod0); FS.sel = 0;
  FS.guard = null; FS.depErr = ''; FS.critAperto = {}; FS.vista = 'elenco'; FS.mobileDettaglio = true;
  fsRender(); fsVaiInAlto(); document.getElementById('fs-g-nome')?.focus();
}
function fsRigaNuova() {
  if (!FS.nuova || !FS.draft) return '';
  return `<button class="fs-riga on" onclick="fsVaiInAlto()"><span class="num">+</span><span style="min-width:0"><span class="nome">${escapeHtml(FS.draft.nome || 'Nuova fase')}<span class="fs-mod-dot" title="Non ancora salvata"></span></span><span class="meta">Non ancora salvata</span></span><span></span></button>`;
}
const fsIdx = id => fsLista().findIndex(f => f.id === id);
const fsSporca = () => !!FS.draft && !!FS.mod[FS.draft.id] && JSON.stringify(FS.draft) !== JSON.stringify(FS.mod[FS.draft.id]);
const fsMacro = id => macroFasiCache.find(x => x.id === id) || null;
const fsMacchina = id => macchineList.find(x => x.id === id) || null;
function fsMacchinaOk(m) {   // attiva e non in manutenzione oggi
  const oggi = Calendario.oggiIso();
  return !!m && m.stato === 'attiva' && !(m.manutenzioni || []).some(x => x.data_inizio <= oggi && oggi <= x.data_fine);
}
// Una sola regola per "fase bloccata oggi" (sezioni Fasi e Macchine): fase con macchine assegnate, nessuna utilizzabile oggi.
const faseSenzaMacchinaUtilizzabile = (macchineAssegnate) => macchineAssegnate.length > 0 && macchineAssegnate.every(x => !fsMacchinaOk(x));
function fsSuccessori(id) { return fsLista().filter(g => (fsMod(g.id)?.dipendenze || []).includes(id)).map(g => g.id); }
function fsDipendeDa(a, b, visti = new Set()) {   // a aspetta (anche indirettamente) b?
  if (visti.has(a)) return false; visti.add(a);
  const m = fsMod(a); if (!m) return false;
  return m.dipendenze.some(d => d === b || fsDipendeDa(d, b, visti));
}
function fsHaCriteriLato(m) {
  return fasiCriteriDef().some(def => {
    const chiave = def.campo === 'materiali' ? 'materiale' : def.campo === 'strutture' ? 'struttura' : def.campo.startsWith('attr_') ? def.campo.slice(5) : null;
    return chiave && attributiConfig.find(a => a.chiave === chiave)?.ambito === 'lato' && (m[def.campo] || []).length > 0;
  });
}
function fsFineFlusso(m) { return !fsSuccessori(m.id).length && !fsEster(m) && !m.opzionale && m.dipendenze.length > 0; }

function fsAvvisi(m) {
  const out = [];
  if (!fsEster(m)) {
    const mac = m.macchine.map(x => fsMacchina(x.id)).filter(Boolean);
    if (faseSenzaMacchinaUtilizzabile(mac)) out.push(['alert', `${mac.map(x => x.nome).join(', ')} fuori uso: la fase non entra nel piano finché la macchina non torna attiva.`]);
    if (!mac.length) out.push(['info', 'Nessuna macchina: il piano non ne limita il carico.']);
    const haTempo = m.tempo_da_lavorazioni_cnc || (m.tempo.tipico !== '' && m.tempo.massimo !== '') || fsRigheTempo(m.id).length > 0;
    if (!haTempo) out.push(['warn', 'Manca il tempo di riferimento: il piano usa il valore predefinito.']);
  }
  if (m.macro_fase_id == null) out.push(['info', 'Non appartiene a nessuna macro fase.']);
  return out;
}
const fsLivello = m => { const a = fsAvvisi(m).map(x => x[0]); return a.includes('alert') ? 'alert' : a.includes('warn') ? 'warn' : a.length ? 'info' : null; };
function fsTagEsterna(m) { return fsEster(m) ? `<span class="fs-tag fs-tag-ext">${m.tipo_gestione === 'conferma_ricezione' ? 'Arrivo da fuori' : 'Esterna'}</span>` : ''; }

// ── caricamento ────────────────────────────────────────────────────────────────────────────────────────────
async function fsCaricaDati() {
  const [, , , tRes, kRes] = await Promise.all([
    loadFasi(), loadMacroFasi(), loadMacchine(),
    sb.from('tempi_riferimento').select('id, fase_id, tipo_prodotto, lavorazione_cnc_id, minuti_tipici, minuti_max, da_confermare, note'),
    sb.from('kpi_config').select('valore, default_valore').eq('chiave', 'soglia_quantita_svincolo_dipendenze').maybeSingle(),
  ]);
  FS.tempi = tRes.data || [];
  FS.soglia = kRes.data ? Number(kRes.data.valore ?? kRes.data.default_valore) : null;
  const bozzaSporca = fsSporca();
  const bozza = bozzaSporca ? FS.draft : null;
  fsRicostruisciModelli();
  if (bozza && FS.mod[bozza.id]) FS.draft = bozza;
  else if (FS.draft && !fsSporca()) FS.draft = FS.mod[FS.draft.id] ? fsClone(FS.mod[FS.draft.id]) : null;
}
async function fsApriSezione() {
  FS.nuova = false; if (FS.draft && FS.draft.id === 0) FS.draft = null;
  await fsCaricaDati();
  fsRender();
}
function renderFasiConfig() {   // usata da altre pagine dopo modifiche a tipi prodotto, macro fasi...
  if (!document.getElementById('sec-fasi-config')?.classList.contains('active')) return;
  fsCaricaDati().then(fsRender);
}

function fsRender() {
  const lista = fsLista();
  if (!lista.length && !FS.nuova) { document.getElementById('fs-righe').innerHTML = ''; document.getElementById('fs-dettaglio').innerHTML = '<div class="empty-state"><p>Nessuna fase configurata.</p></div>'; fsRenderDisattivate(); return; }
  if (!FS.nuova && (!FS.sel || !FS.mod[FS.sel])) FS.sel = lista[0].id;
  if (!FS.draft || FS.draft.id !== FS.sel) FS.draft = fsClone(FS.mod[FS.sel]);
  document.getElementById('fs-v-elenco').classList.toggle('on', FS.vista === 'elenco');
  document.getElementById('fs-v-flusso').classList.toggle('on', FS.vista === 'flusso');
  document.getElementById('fs-vista-elenco').hidden = FS.vista !== 'elenco';
  document.getElementById('fs-vista-flusso').hidden = FS.vista !== 'flusso';
  document.getElementById('fs-vista-elenco').classList.toggle('fs-mostra-dettaglio', FS.mobileDettaglio);
  if (FS.vista === 'flusso') fsRenderFlusso(); else { fsRenderLista(); fsRenderDettaglio(); }
  fsRenderDisattivate();
}

// ── elenco ───────────────────────────────────────────────────────────────────────────────────────────────
const FS_FILTRI = [
  ['tutte', 'Tutte', () => true],
  ['avvisi', 'Da controllare', m => ['alert', 'warn'].includes(fsLivello(m))],
  ['esterne', 'Esterne', m => fsEster(m)],
  ['cnc', 'CNC', m => m.e_cnc],
];
function fsRenderLista() {
  const lista = fsLista();
  document.getElementById('fs-filtri').innerHTML = FS_FILTRI.map(([k, t, fn]) =>
    `<button class="fs-filtro ${FS.filtro === k ? 'on' : ''}" onclick="FS.filtro='${k}';fsRenderLista()">${t}<span class="n">${lista.filter(f => fn(fsMod(f.id))).length}</span></button>`).join('');
  const q = FS.cerca.trim().toLowerCase();
  const fn = FS_FILTRI.find(x => x[0] === FS.filtro)[2];
  const righe = lista.map((f, i) => [fsMod(f.id), i]).filter(([m]) => fn(m) &&
    (!q || m.nome.toLowerCase().includes(q) || m.macchine.some(x => (fsMacchina(x.id)?.nome || '').toLowerCase().includes(q))));
  document.getElementById('fs-righe').innerHTML = fsRigaNuova() + (righe.length ? righe.map(([m, i]) => {
    const lv = fsLivello(m), mac = fsMacro(m.macro_fase_id);
    const meta = [];
    if (fsEster(m)) meta.push(fsTagEsterna(m));
    if (m.e_cnc) meta.push('<span class="fs-tag fs-tag-cnc">CNC</span>');
    if (m.opzionale) meta.push('<span class="fs-tag fs-tag-opz">Opzionale</span>');
    if (m.macchine.length) meta.push(escapeHtml(m.macchine.map(x => fsMacchina(x.id)?.nome || '').filter(Boolean).join(', ')));
    meta.push(m.dipendenze.length ? `dopo ${m.dipendenze.length} ${m.dipendenze.length === 1 ? 'fase' : 'fasi'}` : 'parte subito');
    const ico = lv === 'alert' ? '●' : lv === 'warn' ? '▲' : '';
    const sporca = fsSporca() && FS.draft.id === m.id;
    return `<button class="fs-riga ${m.id === FS.sel ? 'on' : ''}" onclick="fsSeleziona(${m.id})">
      <span class="num">${i + 1}</span>
      <span style="min-width:0">
        <span class="nome"><span class="fs-mdot ${mac ? '' : 'vuoto'}" style="${mac ? `background:${escapeHtml(mac.colore || '')}` : ''}" title="${escapeHtml(mac ? mac.nome : 'Nessuna macro fase')}"></span>${escapeHtml(m.nome)}${sporca ? '<span class="fs-mod-dot" title="Modifiche non salvate"></span>' : ''}</span>
        <span class="meta">${meta.join('<span aria-hidden="true">·</span>')}</span>
      </span>
      ${ico ? `<span class="fs-avv ${lv}" title="${escapeHtml(fsAvvisi(m).map(a => a[1]).join(' '))}">${ico}</span>` : '<span></span>'}
    </button>`;
  }).join('') : (FS.nuova ? '' : '<div style="padding:20px;color:var(--muted);font-size:13px">Nessuna fase trovata.</div>'));
}

function fsSeleziona(id) {
  if (id === FS.sel) { if (window.innerWidth <= 760) { FS.mobileDettaglio = true; fsRender(); } return; }
  if (fsSporca()) { FS.guard = { tipo: 'fase', id }; fsRenderDettaglio(); fsVaiInAlto(); return; }
  fsApri(id);
}
function fsApri(id) {
  if (!FS.mod[id]) return;
  FS.nuova = false; FS.mod0 = null; delete FS.mod[0];
  FS.sel = id; FS.draft = fsClone(FS.mod[id]); FS.guard = null; FS.depErr = ''; FS.critAperto = {};
  if (window.innerWidth <= 760) FS.mobileDettaglio = true;
  if (FS.vista !== 'elenco') FS.vista = 'elenco';
  fsRender();
  document.querySelector('.fs-riga.on')?.scrollIntoView({ block: 'nearest' });
  if (window.innerWidth <= 960 && window.innerWidth > 760) document.getElementById('fs-dettaglio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function fsVaiInAlto() { document.getElementById('fs-dettaglio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function fsTornaElenco() { FS.mobileDettaglio = false; fsRender(); }

function fsVista(v) {
  if (v === 'flusso' && fsSporca()) { toast('Salva o annulla le modifiche prima di passare al Flusso.', 'err'); return; }
  FS.vista = v; FS.flussoSel = null; fsRender();
}

// ── modifiche alla bozza ─────────────────────────────────────────────────────────────────────────────────
function fsAggiornaStato() {
  const d = fsSporca();
  const el = document.getElementById('fs-stato-mod'); if (el) el.hidden = !d;
  document.querySelectorAll('[data-fs-salva]').forEach(b => { b.disabled = !d || FS.salvando; });
  document.querySelectorAll('[data-fs-annulla]').forEach(b => { b.disabled = FS.nuova ? false : !d; });
  fsRenderLista();
}
function fsSet(campo, valore, rerender = true) {
  FS.draft[campo] = valore;
  if (campo === 'tipo_gestione') {
    FS.draft.e_attesa_esterna = valore !== 'standard';   // impostata dal tipo di fase
    if (valore !== 'standard') { FS.draft.piu_pressate = false; FS.draft.pressate_previste = null; }   // la domanda sulle pressate non vale per le fasi esterne
  }
  if (campo === 'piu_pressate') FS.draft.pressate_previste = valore ? (FS.draft.pressate_previste ?? 1) : null;
  if (campo === 'tempo_da_lavorazioni_cnc' && valore) FS.draft.ambito_tempo = 'anta';
  fsAggiornaStato(); if (rerender) fsRenderDettaglio();
}
// "Quando si fa": tre caselle; tutte spuntate = sempre (null). Almeno un caso resta sempre spuntato.
function quandoSiFaInsieme(arr) { return new Set(arr && arr.length ? arr : Etichette.quandoSiFa().map(x => x[0])); }
function quandoSiFaAgg(arr, caso, on) {
  const ins = quandoSiFaInsieme(arr);
  if (on) ins.add(caso); else ins.delete(caso);
  if (!ins.size) return { arr, errore: true };
  return { arr: ins.size === Etichette.quandoSiFa().length ? null : [...ins].sort(), errore: false };
}
function fsSetQuando(caso, on) {
  const r = quandoSiFaAgg(FS.draft.solo_per_consegna, caso, on);
  if (r.errore) { toast(Etichette.quandoSiFaTesti.almenoUno, 'err'); fsRenderDettaglio(); return; }
  fsSet('solo_per_consegna', r.arr);
}
function quandoSiFaHtml(arr, fnNome) {
  const ins = quandoSiFaInsieme(arr), T = Etichette.quandoSiFaTesti;
  return `<div class="fs-row"><div class="fs-crit-t">${escapeHtml(T.titolo)}</div><div class="fs-desc">${escapeHtml(T.spiega)}</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${Etichette.quandoSiFa().map(([v, t]) =>
      `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px"><input type="checkbox" ${ins.has(v) ? 'checked' : ''} onchange="${fnNome}('${v}', this.checked)"> ${escapeHtml(t)}</label>`).join('')}</div></div>`;
}
function fsSetTesto(campo, valore) {
  FS.draft[campo] = valore; fsAggiornaStato();
  if (campo === 'nome') { const h = document.querySelector('.fs-det-title h2'); if (h) h.textContent = valore || 'Senza nome'; }
}
function fsSetTempo(campo, valore) { FS.draft.tempo[campo] = valore; fsAggiornaStato(); }
function fsSetPrevisteNum(v) { FS.draft.pressate_previste = v === '' ? null : Number(v); fsAggiornaStato(); }
function fsAggiungiDipendente(v) { const id = Number(v); if (!id || FS.draft.dipendenti.includes(id)) return; FS.draft.dipendenti.push(id); FS.draft.dipendenti.sort((a, b) => a - b); fsAggiornaStato(); fsRenderDettaglio(); }
function fsTogliDipendente(id) { FS.draft.dipendenti = FS.draft.dipendenti.filter(x => x !== id); fsAggiornaStato(); fsRenderDettaglio(); }
function fsSetModo(def, modo) {
  const campo = def.campo;
  if (modo === 'tutti') { FS.draft[campo] = []; FS.draft[def.modo] = 'solo'; delete FS.critAperto[campo]; }
  else { FS.draft[def.modo] = modo === 'tranne' ? 'tutti_tranne' : 'solo'; if (!FS.draft[campo].length) FS.critAperto[campo] = modo; else delete FS.critAperto[campo]; }
  fsAggiornaStato(); fsRenderDettaglio();
}
function fsToggleCriterio(campo, valore) {
  const a = FS.draft[campo]; const i = a.indexOf(valore);
  if (i < 0) a.push(valore); else a.splice(i, 1);
  a.sort(); delete FS.critAperto[campo];
  fsAggiornaStato(); fsRenderDettaglio();
}
function fsAggiungiDip(v) {
  const id = Number(v); if (!id) return;
  if (id === FS.draft.id || fsDipendeDa(id, FS.draft.id)) {
    FS.depErr = `Non si può: «${fsMod(id)?.nome || ''}» aspetta già questa fase, si creerebbe un giro chiuso.`;
  } else { FS.draft.dipendenze.push(id); FS.draft.dipendenze.sort((a, b) => a - b); FS.depErr = ''; }
  fsAggiornaStato(); fsRenderDettaglio();
}
function fsTogliDip(id) { FS.draft.dipendenze = FS.draft.dipendenze.filter(x => x !== id); FS.depErr = ''; fsAggiornaStato(); fsRenderDettaglio(); }
function fsAggiungiMacchina(id) { if (!id || FS.draft.macchine.some(x => x.id === id)) return; FS.draft.macchine.push({ id, fattore: 1, presa_attiva: false, presa_minuti: null, ante_per_pressata: null }); FS.draft.macchine.sort((a, b) => a.id < b.id ? -1 : 1); fsAggiornaStato(); fsRenderDettaglio(); }
function fsTogliMacchina(id) { FS.draft.macchine = FS.draft.macchine.filter(x => x.id !== id); fsAggiornaStato(); fsRenderDettaglio(); }
function fsSetPresaMacchina(id, on) { const x = FS.draft.macchine.find(y => y.id === id); if (!x) return; x.presa_attiva = !!on; if (on) x.fattore = 1; else { x.presa_minuti = null; x.ante_per_pressata = null; } fsAggiornaStato(); fsRenderDettaglio(); }
function fsPresaCampoMacchina(id, campo, v) { const x = FS.draft.macchine.find(y => y.id === id); if (!x) return; x[campo] = presaNumero(v); fsAggiornaStato(); }
function fsSetFattoreMacchina(id, v) { const x = FS.draft.macchine.find(y => y.id === id); if (x) x.fattore = Number(v); fsAggiornaStato(); fsRenderDettaglio(); }
function fsCompSposta(i, dir) { const a = FS.draft.competenze; [a[i], a[i + dir]] = [a[i + dir], a[i]]; fsAggiornaStato(); fsRenderDettaglio(); }
function fsCompTogli(i) { FS.draft.competenze.splice(i, 1); fsAggiornaStato(); fsRenderDettaglio(); }
function fsCompAggiungi(id) { if (!id || FS.draft.competenze.includes(id)) return; FS.draft.competenze.push(id); fsAggiornaStato(); fsRenderDettaglio(); }
function fsAnnulla() {
  if (FS.nuova) { FS.nuova = false; FS.mod0 = null; delete FS.mod[0]; FS.draft = null; FS.sel = fsLista()[0]?.id ?? null; FS.depErr = ''; FS.critAperto = {}; fsRender(); return; }
  FS.draft = fsClone(FS.mod[FS.sel]); FS.depErr = ''; FS.critAperto = {}; fsRender();
}

// riordino: salvataggio immediato come prima (riordina_fasi); la bozza della fase aperta resta
async function fsSposta(dir) {
  const lista = fsLista(); const i = fsIdx(FS.sel), j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return;
  const ordine = lista.map(f => f.id); [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  const { data, error } = await sb.rpc('riordina_fasi', { p_ids_in_ordine: ordine, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore riordino fasi: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await fsCaricaDati(); fsRender();
  toast(`Ora è la fase ${j + 1} di ${lista.length}.`, 'ok');
}

// ── salvataggio ──────────────────────────────────────────────────────────────────────────────────────────
function fsTempoModificabile(id) {
  const righe = fsRigheTempo(id);
  return !fsMod(id).tempo_da_lavorazioni_cnc && !fsEster(fsMod(id)) && righe.every(t => t.tipo_prodotto == null && t.lavorazione_cnc_id == null) && righe.length <= 1;
}
function fsPayload() {
  const d = FS.draft, o = FS.mod[d.id], p = {};
  ['nome', 'descrizione', 'macro_fase_id', 'tipo_gestione', 'e_attesa_esterna', 'avvio_automatico', 'e_cnc', 'opzionale', 'gruppo_spedizione', 'piu_pressate', 'pressate_previste', 'abbinata_a_fase_id', 'ambito_tempo', 'tempo_da_lavorazioni_cnc', 'materiale_ricezione', 'solo_per_consegna'].forEach(k => {
    if (JSON.stringify(d[k]) !== JSON.stringify(o[k])) p[k] = k === 'nome' ? d.nome.trim() : k === 'materiale_ricezione' ? String(d[k] || '').trim() : d[k];
  });
  const crit = {};
  fasiCriteriDef().forEach(def => [def.campo, def.modo].forEach(k => { if (JSON.stringify(d[k]) !== JSON.stringify(o[k])) crit[k] = d[k]; }));
  Object.assign(p, _raccogliAttributiBozza(crit));
  if (JSON.stringify(d.dipendenze) !== JSON.stringify(o.dipendenze)) p.dipendenze = d.dipendenze;
  if (JSON.stringify(d.macchine) !== JSON.stringify(o.macchine)) p.macchine = d.macchine.map(x => x.presa_attiva ? ({ macchina_id: x.id, fattore_tempo: 1, presa_minuti: x.presa_minuti, ante_per_pressata: x.ante_per_pressata }) : ({ macchina_id: x.id, fattore_tempo: x.fattore }));
  if (JSON.stringify(d.competenze) !== JSON.stringify(o.competenze)) p.competenze = d.competenze;
  if (JSON.stringify(d.tempo) !== JSON.stringify(o.tempo) && fsTempoModificabile(d.id)) {
    const riga = fsRigaBase(d.id);
    p.tempo = { minuti_tipici: Number(d.tempo.tipico), minuti_max: Number(d.tempo.massimo), da_confermare: !!riga?.da_confermare, note: riga?.note || '' };
  }
  if (FS.nuova) {   // solo in creazione: posizione nell'elenco e fasi che dovranno aspettare questa
    p.dopo_fase_id = d.dopo === 'top' ? null : Number(d.dopo);
    if (d.dipendenti.length) p.dipendenti = d.dipendenti;
  }
  return p;
}
function fsValida() {
  const d = FS.draft;
  if (!d.nome.trim()) return 'Inserisci il nome della fase.';
  if (d.piu_pressate && !fsEster(d) && !d.macchine.length) return Etichette.pressate.config.serveMacchina;
  if (d.piu_pressate && !fsEster(d) && pressateNumeroValido(d.pressate_previste) == null) return Etichette.pressate.config.errori.pressate_previste_non_valide;
  if (fsTempoModificabile(d.id)) {
    const t = d.tempo, a = Number(t.tipico), b = Number(t.massimo), haOrig = FS.mod[d.id].tempo.tipico !== '';
    if (t.tipico === '' && t.massimo === '') { if (haOrig) return 'Il tempo di riferimento non si può togliere: modifica i minuti.'; }
    else if (!(a > 0) || !(b > 0)) return 'Il tempo di riferimento deve avere i minuti (tipico e massimo) maggiori di zero.';
    else if (b < a) return 'Il massimo non può essere minore del tipico.';
  }
  if (d.macchine.some(x => x.presa_attiva && !presaValida(x.presa_minuti, x.ante_per_pressata))) return Etichette.presa.config.errore;
  if (d.ambito_tempo === 'lato' && d.tempo_da_lavorazioni_cnc) return 'Il tempo vale «ogni lato» solo per le fasi che non sommano le lavorazioni CNC.';
  if (d.abbinata_a_fase_id != null && (d.piu_pressate || d.gruppo_spedizione || fsEster(d))) return Etichette.fasiAbbinate.nonCompatibile;
  return null;
}
const FS_ERRORI = { ...Etichette.pressate.config.errori, ...Etichette.fasiAbbinate.errori, presa_non_valida: Etichette.presa.config.errore, dipendenza_circolare: 'La sequenza crea un giro chiuso tra le fasi.', nome_obbligatorio: 'Il nome è obbligatorio.', minuti_non_validi: 'Minuti del tempo non validi.',
  fase_tempo_da_lavorazioni_cnc: 'Il tempo di questa fase è la somma delle lavorazioni CNC: si imposta nel Catalogo lavorazioni CNC.', macchina_non_trovata: 'Una macchina scelta non esiste più.',
  operatore_non_trovato: 'Un operatore scelto non esiste più.', ambito_tempo_incompatibile: 'Il tempo «ogni lato» non vale per le fasi che sommano le lavorazioni CNC.' };

async function fsSalva(poi) {
  if (FS.salvando || !fsSporca()) return;
  const err = fsValida(); if (err) { toast(err, 'err'); return; }
  const payload = fsPayload();
  if (!Object.keys(payload).length) { toast('Nessuna modifica da salvare', 'ok'); return; }
  if (FS.nuova) { await fsSalvaNuova(payload, poi); return; }
  FS.salvando = true; fsAggiornaStato();
  const faseId = FS.draft.id;
  const { data, error } = await sb.rpc('salva_fase', { p_fase_id: faseId, p_dati: payload, p_solo_anteprima: true, p_responsabile_id: currentUserRow.id, p_session_token: null });
  FS.salvando = false; fsAggiornaStato();
  if (error || !data?.ok) { toast('Errore: ' + (FS_ERRORI[data?.errore] || data?.errore || error?.message || ''), 'err'); return; }
  if (data.n_cambi) { mostraAnteprimaFasi('Questa modifica', data, () => fsConferma(faseId, payload, poi)); return; }
  await fsConferma(faseId, payload, poi);
}
// Creazione: la stessa scheda, un'unica operazione atomica sul server (crea_fase), con anteprima degli effetti sugli ordini aperti
async function fsSalvaNuova(payload, poi) {
  if (!FS.draft.dipendenze.length &&
      !confirm('Questa fase non ha dipendenze: potrà essere avviata subito, senza attendere nessuna altra fase.\n\nProcedere comunque?')) return;
  FS.salvando = true; fsAggiornaStato();
  const { data: ant, error: errAnt } = await sb.rpc('crea_fase', { p_dati: { ...payload, _anteprima: true }, p_responsabile_id: currentUserRow.id, p_session_token: null });
  FS.salvando = false; fsAggiornaStato();
  if (errAnt || !ant?.ok) { toast('Errore: ' + (FS_ERRORI[ant?.errore] || ant?.errore || errAnt?.message || ''), 'err'); return; }
  if (ant.n_cambi) { mostraAnteprimaFasi('Questa nuova fase', ant, () => fsConfermaNuova(payload, poi)); return; }
  await fsConfermaNuova(payload, poi);
}
async function fsConfermaNuova(payload, poi) {
  FS.salvando = true; fsAggiornaStato();
  const { data, error } = await sb.rpc('crea_fase', { p_dati: payload, p_responsabile_id: currentUserRow.id, p_session_token: null });
  FS.salvando = false;
  closeModal('modal-anteprima-fasi');
  if (error || !data?.ok) { fsAggiornaStato(); toast('Creazione NON riuscita: ' + (FS_ERRORI[data?.errore] || data?.errore || error?.message || 'errore sconosciuto'), 'err'); return; }
  FS.nuova = false; FS.mod0 = null; delete FS.mod[0]; FS.draft = null;
  await fsCaricaDati();
  toast(`Fase creata e applicata a ${data.ordini_popolati || 0} ordini aperti`, 'ok');
  if (poi) poi(); else fsApri(data.fase_id);
}
async function fsConferma(faseId, payload, poi) {
  FS.salvando = true; fsAggiornaStato();
  const { data, error } = await sb.rpc('salva_fase', { p_fase_id: faseId, p_dati: payload, p_solo_anteprima: false, p_responsabile_id: currentUserRow.id, p_session_token: null });
  FS.salvando = false;
  closeModal('modal-anteprima-fasi');
  if (error || !data?.ok) { fsAggiornaStato(); toast('Salvataggio NON riuscito: ' + (FS_ERRORI[data?.errore] || data?.errore || error?.message || 'errore sconosciuto'), 'err'); return; }
  FS.draft = null;
  await fsCaricaDati();
  FS.draft = FS.mod[faseId] ? fsClone(FS.mod[faseId]) : null;
  toast(data.n_cambi ? `Fase salvata: ${data.n_cambi} fasi aggiornate su ${data.n_ordini} ordini. Il piano di oggi si aggiorna da solo.` : 'Fase salvata. Il piano di oggi si aggiorna da solo.', 'ok');
  if (poi) poi(); else fsRender();
}
function fsGuardSalva() {
  const g = FS.guard; if (!g) return;
  fsSalva(() => fsVaiA(g));
}
function fsGuardScarta() { const g = FS.guard; if (!g) return; FS.draft = fsClone(FS.mod[FS.sel]); fsVaiA(g); }
function fsGuardResta() { FS.guard = null; fsRenderDettaglio(); }
function fsVaiA(g) {
  FS.guard = null;
  if (g.tipo === 'fase') fsApri(g.id);
  else if (g.tipo === 'nuova') fsAvviaNuova();
  else if (g.tipo === 'sezione') { FS.draft = FS.mod[FS.sel] ? fsClone(FS.mod[FS.sel]) : null; showSection(g.nome); }
}
// uscita dalla sezione con modifiche aperte: la barra compare nell'intestazione del dettaglio
function fsPuoUscire(nome) {
  if (nome === 'fasi-config' || !fsSporca() || !document.getElementById('sec-fasi-config')?.classList.contains('active')) return true;
  FS.guard = { tipo: 'sezione', nome }; FS.vista = 'elenco'; fsRender(); fsVaiInAlto();
  return false;
}

// ── dettaglio ────────────────────────────────────────────────────────────────────────────────────────────
function fsSwitch(id, checked, onchange, disabled) {
  return `<label class="fs-sw"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="${onchange}"><span></span></label>`;
}
function fsRiassuntoCriteri(m) {
  const parti = fasiCriteriDef().map(def => {
    const sel = m[def.campo] || [];
    if (!sel.length) return escapeHtml(def.tutti);
    const nomi = sel.map(v => `<b>${escapeHtml(def.opzioni.find(o => o.valore === v)?.etichetta || v)}</b>`).join(', ');
    return m[def.modo] === 'tutti_tranne' ? `tutti tranne ${nomi}` : nomi;
  });
  return `Si applica agli ordini con ${parti.join(' · ')}.`;
}

function fsRenderDettaglio() {
  const m = FS.draft; if (!m) return;
  const lista = fsLista(); const i = fsIdx(m.id); const mac = fsMacro(m.macro_fase_id);
  const succ = fsSuccessori(m.id), d = fsSporca(), est = fsEster(m);
  const g = FS.guard;
  const nomeDest = g ? (g.tipo === 'fase' ? `«${escapeHtml(FS.mod[g.id]?.nome || '')}»` : g.tipo === 'nuova' ? 'una nuova fase' : 'un\'altra sezione') : '';
  const guard = g ? `<div class="fs-guard" role="alert"><span>Hai modifiche non salvate su «${escapeHtml(m.nome || 'la nuova fase')}». Cosa vuoi fare prima di aprire ${nomeDest}?</span>
      <button class="btn btn-primary" onclick="fsGuardSalva()">Salva e apri</button>
      <button class="btn btn-secondary" onclick="fsGuardScarta()">Scarta</button>
      <button class="fs-btn-ghost" onclick="fsGuardResta()">Resta qui</button></div>` : '';

  const altre = lista.filter(x => x.id !== m.id && !m.dipendenze.includes(x.id));
  const opzDip = altre.map(x => { const ciclo = fsDipendeDa(x.id, m.id);
    return `<option value="${x.id}" ${ciclo ? 'disabled' : ''}>${fsIdx(x.id) + 1}. ${escapeHtml(x.nome)}${ciclo ? ' (la aspetta già)' : ''}</option>`; }).join('');

  // tempo
  let tempo;
  const righe = fsRigheTempo(m.id);
  if (est) {
    tempo = `<div class="fs-row"><div class="fs-desc" style="margin:0">Fase esterna: non occupa tempo in officina e non conta nella capacità del giorno.</div></div>`;
  } else if (m.tempo_da_lavorazioni_cnc) {
    const base = righe.filter(t => t.lavorazione_cnc_id == null && t.tipo_prodotto != null);
    tempo = `<div class="fs-row inline"><div><div class="fs-crit-t">Il tempo è la somma delle lavorazioni CNC dell'ordine</div>
        <div class="fs-desc">Le lavorazioni e i loro tempi sono nel <a href="#" onclick="showSection('lavorazioni-cnc-config');return false" style="color:inherit;font-weight:600">Catalogo lavorazioni CNC</a>. Se l'ordine non ne ha, vale il tempo base per tipo di prodotto${base.length ? ':' : '.'}</div></div>
        ${fsSwitch('fs-t-cnc', true, "fsSet('tempo_da_lavorazioni_cnc',this.checked)")}</div>
      ${base.length ? `<div class="fs-row"><table class="fs-tempi-tab">${base.map(t => `<tr><td>${escapeHtml(tipiProdotto.find(x => x.id === t.tipo_prodotto)?.label || t.tipo_prodotto)}</td><td class="v">${fmtMinuti(t.minuti_tipici)}–${fmtMinuti(t.minuti_max)} min</td></tr>`).join('')}</table></div>` : ''}`;
  } else {
    const modificabile = fsTempoModificabile(m.id);
    tempo = (modificabile ? `<div class="fs-row fs-two">
         <div><span class="fs-lbl">Minuti per pezzo${m.piu_pressate ? ' · ' + Etichette.pressate.config.tempoPerPressata : ''}</span>
           <div class="fs-add"><input class="fs-inp num" id="fs-t-min" type="number" min="0" step="any" value="${escapeHtml(m.tempo.tipico)}" oninput="fsSetTempo('tipico',this.value)" aria-label="Minuti tipici"> <span class="fs-desc" style="margin:0">tipico</span>
           <input class="fs-inp num" id="fs-t-max" type="number" min="0" step="any" value="${escapeHtml(m.tempo.massimo)}" oninput="fsSetTempo('massimo',this.value)" aria-label="Minuti massimi"> <span class="fs-desc" style="margin:0">massimo</span></div>
           <div class="fs-desc">Stesso valore della pagina Tempi di riferimento: cambiarlo qui lo cambia anche lì.</div></div>
         <div><span class="fs-lbl">Il tempo vale per</span>
           <div class="fs-seg"><button class="${m.ambito_tempo !== 'lato' ? 'on' : ''}" onclick="fsSet('ambito_tempo','anta')">Anta intera</button><button class="${m.ambito_tempo === 'lato' ? 'on' : ''}" onclick="fsSet('ambito_tempo','lato')">Ogni lato</button></div>
           <div class="fs-desc">${m.ambito_tempo === 'lato' ? 'Il tempo si moltiplica per i lati dell\'anta che rispettano i criteri della fase.' : 'Il tempo vale una volta per ogni pezzo.'}</div>
           ${m.ambito_tempo === 'lato' && !fsHaCriteriLato(m) ? '<div class="fs-desc" style="color:var(--warn-ink)">⚠ Nessun criterio sugli attributi per lato: il tempo varrà per tutti i lati (moltiplicato per il numero di lati).</div>' : ''}</div>
       </div>`
      : `<div class="fs-row"><span class="fs-lbl">Tempi di riferimento</span>
           <table class="fs-tempi-tab">${righe.map(t => `<tr><td>${escapeHtml(t.tipo_prodotto ? (tipiProdotto.find(x => x.id === t.tipo_prodotto)?.label || t.tipo_prodotto) : 'Tutti i prodotti')}</td><td class="v">${fmtMinuti(t.minuti_tipici)}–${fmtMinuti(t.minuti_max)} min</td></tr>`).join('')}</table>
           <div class="fs-desc">Questa fase ha più righe di tempo: sono in sola lettura qui. Si gestiscono nella pagina <a href="#" onclick="showSection('tempi-rif-config');return false" style="color:inherit;font-weight:600">Tempi di riferimento</a>.</div></div>`)
      + `<div class="fs-row inline"><div><div class="fs-crit-t">Il tempo è la somma delle lavorazioni CNC</div><div class="fs-desc">Da attivare solo per le fasi CNC che dipendono dalle lavorazioni scelte sull'ordine.</div></div>${fsSwitch('fs-t-cnc', false, "fsSet('tempo_da_lavorazioni_cnc',this.checked)")}</div>`;
  }

  const av = fsAvvisi(m);
  const soglia = FS.soglia != null && !Number.isNaN(FS.soglia)
    ? ` Per gli ordini con più di ${FS.soglia} pezzi può partire prima, appena le fasi precedenti hanno iniziato a chiudere pezzi.` : '';
  const ops = operatoriCache.filter(o => o.ruolo === 'operatore' && o.attivo);
  const nomeOp = id => { const o = operatoriCache.find(x => x.id === id); return o ? `${o.nome} ${o.cognome}` : ''; };
  const defs = fasiCriteriDef();
  const mobHdr = `<button class="fs-btn-ghost fs-back" onclick="fsTornaElenco()">← Fasi</button>`;
  // Solo in creazione: quali fasi dovranno aspettare questa, e dove sta nell'elenco
  const poiNuovaHtml = FS.nuova ? `<div class="fs-chips">${(m.dipendenti || []).length ? m.dipendenti.map(id => `<span class="fs-chip"><span>${fsIdx(id) + 1}. ${escapeHtml(fsMod(id)?.nome || '')}</span><button class="fs-chip-x" title="Togli" aria-label="Togli ${escapeHtml(fsMod(id)?.nome || '')}" onclick="fsTogliDipendente(${id})">×</button></span>`).join('') : '<span class="fs-desc" style="margin:0">Nessuna.</span>'}</div>
      <div class="fs-add"><select class="fs-inp" id="fs-add-dipendente" onchange="fsAggiungiDipendente(this.value)" style="min-width:0;width:100%"><option value="">+ Aggiungi fase…</option>${lista.filter(x => !(m.dipendenti || []).includes(x.id)).map(x => `<option value="${x.id}">${fsIdx(x.id) + 1}. ${escapeHtml(x.nome)}</option>`).join('')}</select></div>
      <div class="fs-desc" style="margin:0">Le fasi che devono aspettare questa. Se una è già completata su un ordine, la nuova fase viene saltata su quell'ordine.</div>` : '';
  const posNuovaHtml = FS.nuova ? `<div><label class="fs-lbl" for="fs-g-dopo">Inserisci dopo la fase</label>
      <select class="fs-inp" id="fs-g-dopo" onchange="fsSet('dopo', this.value, false)"><option value="top" ${m.dopo === 'top' ? 'selected' : ''}>— In cima alla lista</option>${lista.map((x, k) => `<option value="${x.id}" ${String(x.id) === String(m.dopo) ? 'selected' : ''}>${k + 1}. ${escapeHtml(x.nome)}</option>`).join('')}</select>
      <div class="fs-desc">Decide l'ordine di lettura. Cosa parte prima lo decide la Sequenza.</div></div>` : '';

  document.getElementById('fs-dettaglio').innerHTML = `
    <div class="fs-det-hdr">
      <div class="fs-det-hdr-row">
        <div class="fs-det-title">${mobHdr}<span class="n">${FS.nuova ? 'Nuova' : (i + 1) + ' / ' + lista.length}</span><h2>${escapeHtml(m.nome || (FS.nuova ? 'Nuova fase' : 'Senza nome'))}</h2></div>
        <div class="fs-hdr-actions">
          <span class="fs-stato-mod" id="fs-stato-mod" ${d ? '' : 'hidden'}>Modifiche non salvate</span>
          <button class="btn btn-secondary" data-fs-annulla onclick="fsAnnulla()" ${d || FS.nuova ? '' : 'disabled'}>Annulla</button>
          <button class="btn btn-primary" data-fs-salva onclick="fsSalva()" ${d && !FS.salvando ? '' : 'disabled'}>${FS.nuova ? 'Crea fase' : 'Salva'}</button>
        </div>
      </div>
      <div class="fs-det-sub">
        <span class="fs-mdot ${mac ? '' : 'vuoto'}" style="${mac ? `background:${escapeHtml(mac.colore || '')}` : ''}"></span>${escapeHtml(mac ? mac.nome : 'Nessuna macro fase')}
        ${fsTagEsterna(m)}${m.e_cnc ? '<span class="fs-tag fs-tag-cnc">CNC</span>' : ''}${m.opzionale ? '<span class="fs-tag fs-tag-opz">Opzionale</span>' : ''}
        ${fsFineFlusso(m) ? '<span class="fs-tag fs-tag-fine">Fine del flusso</span>' : ''}
      </div>
      ${guard}
    </div>

    ${av.length ? `<div class="fs-avvisi">${av.map(a => `<div class="fs-avviso ${a[0]}">${a[0] === 'alert' ? '●' : a[0] === 'warn' ? '▲' : 'i'}<span>${escapeHtml(a[1])}</span></div>`).join('')}</div>` : ''}

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Sequenza</h3><span class="hint">Quando entra nel piano</span></div>
      <div class="fs-card">
        <div class="fs-seq">
          <div class="fs-seq-col">
            <span class="fs-lbl">Parte dopo</span>
            <div class="fs-chips">${m.dipendenze.length ? m.dipendenze.map(id => `<span class="fs-chip link"><span onclick="fsSeleziona(${id})" style="cursor:pointer">${fsIdx(id) + 1}. ${escapeHtml(fsMod(id)?.nome || '')}</span><button class="fs-chip-x" title="Togli" aria-label="Togli ${escapeHtml(fsMod(id)?.nome || '')}" onclick="fsTogliDip(${id})">×</button></span>`).join('') : '<span class="fs-desc" style="margin:0">Nessuna: può partire appena c\'è l\'ordine.</span>'}</div>
            <div class="fs-add"><select class="fs-inp" id="fs-add-dip" onchange="fsAggiungiDip(this.value)" style="min-width:0;width:100%"><option value="">+ Aggiungi fase…</option>${opzDip}</select></div>
            ${FS.depErr ? `<div class="fs-err">${escapeHtml(FS.depErr)}</div>` : ''}
          </div>
          <div class="fs-seq-mid"><span class="fs-freccia">→</span><div class="fs-qui">${escapeHtml(m.nome)}</div><span class="fs-freccia">→</span></div>
          <div class="fs-seq-col">
            <span class="fs-lbl">Poi si sbloccano</span>
            ${poiNuovaHtml}<div class="fs-chips" ${FS.nuova ? 'hidden' : ''}>${succ.length ? succ.map(id => `<button class="fs-chip link" onclick="fsSeleziona(${id})">${fsIdx(id) + 1}. ${escapeHtml(fsMod(id)?.nome || '')}</button>`).join('') : `<span class="fs-desc" style="margin:0">${fsFineFlusso(m) ? 'Nessuna: è l\'ultima fase dell\'ordine.' : 'Nessuna fase aspetta questa.'}</span>`}</div>
            <div class="fs-desc" style="margin:0" ${FS.nuova ? 'hidden' : ''}>Per cambiarle apri quella fase e modifica «Parte dopo».</div>
          </div>
        </div>
        <div class="fs-seq-note">La fase entra nel piano di oggi solo quando tutte quelle a sinistra sono completate.${escapeHtml(soglia)}</div>
      </div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Quando si applica</h3><span class="hint">Se non vale, la fase non viene creata sull'ordine</span></div>
      <div class="fs-card">
        <div class="fs-riassunto">${fsRiassuntoCriteri(m)}</div>
        ${defs.map(def => {
          const sel = m[def.campo] || [];
          const seg = sel.length ? (m[def.modo] === 'tutti_tranne' ? 'tranne' : 'solo') : (FS.critAperto[def.campo] || 'tutti');
          const opzioni = def.opzioni.filter(o => o.attivo !== false || sel.includes(o.valore));
          return `<div class="fs-row fs-crit">
            <span class="fs-crit-t">${escapeHtml(def.titolo)}</span>
            <div class="fs-seg">${[['tutti', 'Tutti'], ['solo', 'Solo'], ['tranne', 'Tutti tranne']].map(([k, t]) => `<button class="${seg === k ? 'on' : ''}" onclick="fsSetModo(fasiCriteriDef().find(x => x.campo === '${escapeJsAttr(def.campo)}'), '${k}')">${t}</button>`).join('')}</div>
            <div class="fs-chips">${seg === 'tutti' ? '' : opzioni.map(o => `<button class="fs-chip ${sel.includes(o.valore) ? 'on' : ''}" onclick="fsToggleCriterio('${escapeJsAttr(def.campo)}','${escapeJsAttr(o.valore)}')">${escapeHtml(o.etichetta)}${o.attivo === false ? ' (disattivata)' : ''}</button>`).join('')}</div>
          </div>`; }).join('')}
      </div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Macchine</h3><span class="hint">Il piano usa prima quella dove la fase è più veloce</span></div>
      <div class="fs-card"><div class="fs-row">
        <div class="fs-chips">${est ? '<span class="fs-desc" style="margin:0">Fase esterna: nessuna macchina.</span>' : (m.macchine.length ? m.macchine.map(x => { const mm = fsMacchina(x.id); if (!mm) return ''; const ok = fsMacchinaOk(mm); const opz = Etichette.fattoriTempoMacchina().map(y => y[0]); const opzioni = (opz.includes(x.fattore) ? opz : [...opz, x.fattore].sort((p, q) => p - q)).map(v => `<option value="${v}" ${v === x.fattore ? 'selected' : ''}>${escapeHtml(Etichette.fattoreTempoEtichetta(v))}</option>`).join('');
          return `<span class="fs-chip" style="flex-wrap:wrap"><span class="${ok ? 'ok' : 'ko'}"></span>${escapeHtml(mm.nome)}${ok ? '' : '<span class="stato">fuori uso</span>'}${x.presa_attiva ? '' : `<select class="fm-fatt" aria-label="Tempo macchina su ${escapeHtml(mm.nome)}" onchange="fsSetFattoreMacchina('${escapeJsAttr(x.id)}', this.value)">${opzioni}</select>`}<button class="fs-chip-x" aria-label="Togli ${escapeHtml(mm.nome)}" onclick="fsTogliMacchina('${escapeJsAttr(x.id)}')">×</button>
          <div class="presa-box" style="flex:1 1 100%">${presaBloccoHtml(x.presa_attiva, x.presa_minuti, x.ante_per_pressata, 'fsSetPresaMacchina', 'fsPresaCampoMacchina', "'" + escapeJsAttr(x.id) + "'")}</div></span>`; }).join('') : '<span class="fs-desc" style="margin:0">Nessuna macchina assegnata.</span>')}</div>
        ${est ? '' : `<div class="fs-add" style="margin-top:10px"><select class="fs-inp" id="fs-add-mac" onchange="fsAggiungiMacchina(this.value)"><option value="">+ Aggiungi macchina…</option>${macchineList.filter(x => !m.macchine.some(y => y.id === x.id)).map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.nome)}${fsMacchinaOk(x) ? '' : ' (fuori uso)'}</option>`).join('')}</select></div>`}
      </div></div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Tempo</h3></div>
      <div class="fs-card">${tempo}</div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Tipo di fase</h3></div>
      <div class="fs-card">
        <div class="fs-row">
          <div class="fs-seg" style="flex-wrap:wrap">${Etichette.tipiGestioneFase().map(x => `<button class="${m.tipo_gestione === x[0] ? 'on' : ''}" onclick="fsSet('tipo_gestione','${x[0]}')">${escapeHtml(x[1])}</button>`).join('')}</div>
          <div class="fs-desc">${escapeHtml((Etichette.tipiGestioneFase().find(x => x[0] === m.tipo_gestione) || [])[2] || '')}</div>
        </div>
        ${m.tipo_gestione !== 'standard' ? `<div class="fs-row"><label class="fs-lbl" for="fs-g-mat">Cosa si riceve</label><input class="fs-inp" id="fs-g-mat" maxlength="40" value="${escapeHtml(m.materiale_ricezione)}" placeholder="es. Struttura" oninput="fsSetTesto('materiale_ricezione', this.value)"><div class="fs-desc">Nome breve di cosa arriva o rientra: lo leggono gli operatori nel pannello «Ricevi materiale». Se lo lasci vuoto si usa il nome della fase.</div></div>` : ''}
        <div class="fs-row inline"><div><div class="fs-crit-t">Parte da sola alla creazione dell'ordine</div><div class="fs-desc">Utile per le attese di materiale da fuori.</div></div>${fsSwitch('fs-o-auto', m.avvio_automatico, "fsSet('avvio_automatico',this.checked,false)")}</div>
        <div class="fs-row inline"><div><div class="fs-crit-t">Fase CNC</div><div class="fs-desc">Mostra il badge CNC sull'ordine e nell'app.</div></div>${fsSwitch('fs-o-cnc', m.e_cnc, "fsSet('e_cnc',this.checked)")}</div>
        <div class="fs-row inline"><div><div class="fs-crit-t">Opzionale</div><div class="fs-desc">Non si crea da sola: la abiliti tu dall'ordine.</div></div>${fsSwitch('fs-o-opz', m.opzionale, "fsSet('opzionale',this.checked)")}</div>
        <div class="fs-row inline"><div><div class="fs-crit-t">Spedizione unica</div><div class="fs-desc">Per gli ordini della stessa spedizione la fase è una sola: compare una volta nel piano (con il tempo di un ordine) e, quando la si completa, si chiude per tutti.</div></div>${fsSwitch('fs-o-gs', m.gruppo_spedizione, "fsSet('gruppo_spedizione',this.checked,false)")}</div>
        ${fsEster(m) || !(m.macchine.length || m.piu_pressate) ? '' : `<div class="fs-row inline"><div><div class="fs-crit-t">${escapeHtml(Etichette.pressate.config.casella)}</div><div class="fs-desc">${escapeHtml(Etichette.pressate.config.spiega)}</div>${m.macchine.length ? '' : `<div class="fs-desc" style="color:var(--alert-ink)">${escapeHtml(Etichette.pressate.config.serveMacchina)}</div>`}</div>${fsSwitch('fs-o-pp', m.piu_pressate, "fsSet('piu_pressate',this.checked)")}</div>`}
        ${!fsEster(m) && m.piu_pressate && m.macchine.length ? `<div class="fs-row"><label class="fs-lbl" for="fs-g-pv">${escapeHtml(Etichette.pressate.config.previste)}</label><input class="fs-inp num" id="fs-g-pv" type="number" min="1" max="20" step="1" inputmode="numeric" value="${m.pressate_previste ?? ''}" oninput="fsSetPrevisteNum(this.value)" style="width:100px"><div class="fs-desc">${escapeHtml(Etichette.pressate.config.previsteSpiega)}</div></div>` : ''}
        ${fsAbbinataHtml(m)}
        ${quandoSiFaHtml(m.solo_per_consegna, 'fsSetQuando')}
      </div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Generale</h3></div>
      <div class="fs-card">
        <div class="fs-row"><label class="fs-lbl" for="fs-g-nome">Nome</label><input class="fs-inp" id="fs-g-nome" value="${escapeHtml(m.nome)}" oninput="fsSetTesto('nome', this.value)"></div>
        <div class="fs-row"><label class="fs-lbl" for="fs-g-desc">Descrizione</label><input class="fs-inp" id="fs-g-desc" value="${escapeHtml(m.descrizione)}" placeholder="Facoltativa" oninput="fsSetTesto('descrizione', this.value)"></div>
        <div class="fs-row fs-two">
          <div><label class="fs-lbl" for="fs-g-macro">Macro fase</label>
            <select class="fs-inp" id="fs-g-macro" onchange="fsSet('macro_fase_id', this.value ? Number(this.value) : null)"><option value="">Nessuna</option>${macroFasiCache.map(x => `<option value="${x.id}" ${x.id === m.macro_fase_id ? 'selected' : ''}>${escapeHtml(x.nome)}</option>`).join('')}</select></div>
          ${posNuovaHtml}<div ${FS.nuova ? 'hidden' : ''}><span class="fs-lbl">Posizione nell'elenco</span>
            <div class="fs-add"><button class="btn btn-secondary" onclick="fsSposta(-1)" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">▲ Su</button><button class="btn btn-secondary" onclick="fsSposta(1)" ${i === lista.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">▼ Giù</button><span class="fs-desc" style="margin:0">Fase ${i + 1} di ${lista.length}</span></div>
            <div class="fs-desc">Decide l'ordine di lettura. Cosa parte prima lo decide la Sequenza.</div></div>
        </div>
      </div>
    </div>

    <div class="fs-blocco">
      <details class="fs-card" ${FS.compAperto ? 'open' : ''} ontoggle="FS.compAperto=this.open">
        <summary><span><span class="fs-crit-t">Operatori competenti</span> <span class="fs-desc" style="display:inline;margin-left:6px">${m.competenze.length ? escapeHtml(m.competenze.map(nomeOp).filter(Boolean).join(', ')) : 'nessuno'}</span></span><span class="fs-desc" style="margin:0">${FS.compAperto ? 'nascondi' : 'mostra'}</span></summary>
        <div class="fs-row">
          <div class="fs-ops">${m.competenze.length ? m.competenze.map((id, k) => `<div class="fs-op"><span class="i">${k + 1}.</span><span class="nm">${escapeHtml(nomeOp(id))}</span>
            <button class="fs-mini" onclick="fsCompSposta(${k},-1)" ${k === 0 ? 'disabled' : ''} aria-label="Su">▲</button><button class="fs-mini" onclick="fsCompSposta(${k},1)" ${k === m.competenze.length - 1 ? 'disabled' : ''} aria-label="Giù">▼</button><button class="fs-mini" onclick="fsCompTogli(${k})" aria-label="Togli">×</button></div>`).join('') : '<span class="fs-desc" style="margin:0">Nessuno: vanno bene tutti.</span>'}</div>
          <div class="fs-add" style="margin-top:10px"><select class="fs-inp" id="fs-add-op" onchange="fsCompAggiungi(this.value)"><option value="">+ Aggiungi operatore…</option>${ops.filter(o => !m.competenze.includes(o.id)).map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</option>`).join('')}</select></div>
          <div class="fs-desc">L'ordine è la priorità di assegnazione.</div>
        </div>
      </details>
    </div>

    ${FS.nuova ? '' : `<div class="fs-blocco" style="display:flex;justify-content:flex-end"><button class="fs-btn-danger-ghost" onclick="eliminaFase(${m.id})">Disattiva fase</button></div>`}`;
}

// ── flusso ───────────────────────────────────────────────────────────────────────────────────────────────
function fsRenderFlusso() {
  const lista = fsLista();
  const ids = new Set(lista.map(f => f.id));
  const dipDi = id => (fsMod(id)?.dipendenze || []).filter(x => ids.has(x));
  const { cols } = FlussoSchermo.colonne(lista, id => fsMod(id)?.dipendenze || []);   // layout condiviso con la Modalità schermo
  const sel = FS.flussoSel;
  const vicini = sel ? new Set([sel, ...dipDi(sel), ...fsSuccessori(sel)]) : null;
  document.getElementById('fs-vista-flusso').innerHTML = `
    <div class="fs-flusso-card">
      <div class="fs-flusso-top">
        <span>Da sinistra a destra: una fase si sblocca quando sono completate quelle collegate da sinistra. Clic su una fase per evidenziare cosa la sblocca e cosa sblocca; doppio clic per modificarla.</span>
        <span class="fs-legenda">${macroFasiCache.map(x => `<span><span class="fs-mdot" style="background:${escapeHtml(x.colore || '')}"></span>${escapeHtml(x.nome)}</span>`).join('')}<span><span class="fs-mdot vuoto"></span>Nessuna</span></span>
      </div>
      <div class="fs-flusso"><div class="fs-flusso-in" id="fs-flusso-in">
        <svg class="fs-archi" id="fs-archi"></svg>
        ${cols.map((c, k) => `<div class="fs-fcol"><div class="fs-fcol-h">${k === 0 ? 'Partono subito' : 'Passo ' + (k + 1)}</div>
          ${c.map(f => { const m = fsMod(f.id); const mc = fsMacro(m.macro_fase_id);
            const mm = m.macchine.map(x => fsMacchina(x.id)).filter(Boolean);
            const ko = !fsEster(m) && mm.length && mm.every(x => !fsMacchinaOk(x));
            return `<button class="fs-fnodo ${fsEster(m) ? 'ext' : ''} ${f.id === sel ? 'sel' : ''} ${!vicini || vicini.has(f.id) ? '' : 'dim'}" data-id="${f.id}" onclick="fsEvidenzia(${f.id})" ondblclick="fsApri(${f.id})">
              <span class="t"><span class="fs-mdot ${mc ? '' : 'vuoto'}" style="${mc ? `background:${escapeHtml(mc.colore || '')}` : ''}"></span><span>${fsIdx(f.id) + 1}. ${escapeHtml(m.nome)}</span></span>
              <span class="m ${ko ? 'ko' : ''}">${fsEster(m) ? Etichette.flusso.esterna(m.tipo_gestione, m.opzionale) : (mm.length ? escapeHtml(mm.map(x => x.nome).join(', ')) + (ko ? ' · fuori uso' : '') : 'Nessuna macchina')}</span>
            </button>`; }).join('')}</div>`).join('')}
      </div></div>
    </div>`;
  requestAnimationFrame(fsDisegnaArchi);
}
function fsEvidenzia(id) {
  FS.flussoSel = FS.flussoSel === id ? null : id;
  const sel = FS.flussoSel;
  const ids = new Set(fsLista().map(f => f.id));
  const vicini = sel ? new Set([sel, ...(fsMod(sel)?.dipendenze || []).filter(x => ids.has(x)), ...fsSuccessori(sel)]) : null;
  document.querySelectorAll('.fs-fnodo').forEach(n => { const i = Number(n.dataset.id);
    n.classList.toggle('sel', i === sel); n.classList.toggle('dim', !!vicini && !vicini.has(i)); });
  fsDisegnaArchi();
}
function fsDisegnaArchi() {
  const box = document.getElementById('fs-flusso-in'), svg = document.getElementById('fs-archi'); if (!box || !svg) return;
  svg.setAttribute('width', box.scrollWidth); svg.setAttribute('height', box.scrollHeight);
  const sel = FS.flussoSel;
  svg.innerHTML = FlussoSchermo.geometriaArchi(box, '.fs-fnodo', fsLista(), id => fsMod(id)?.dipendenze || []).map(x => {
    const hot = sel && (x.a === sel || x.da === sel);
    return `<path class="${hot ? 'hot' : sel ? 'dim' : ''}" d="${x.d}"/>`;
  }).join('');
}
window.addEventListener('resize', () => { if (FS.vista === 'flusso') fsDisegnaArchi(); });
// la larghezza del contenuto cambia anche quando la barra laterale si chiude o si apre: gli archi si ridisegnano con lei
(() => { let raf = 0; const mn = document.querySelector('main'); if (mn && window.ResizeObserver) new ResizeObserver(() => { if (FS.vista !== 'flusso' || raf) return; raf = requestAnimationFrame(() => { raf = 0; fsDisegnaArchi(); }); }).observe(mn); })();

// Fasi disattivate (storico conservato): si possono riattivare
function fsRenderDisattivate() {
  const disattivate = fasi.filter(f => f.attiva === false);
  const box = document.getElementById('fasi-disattivate');
  if (!box) return;
  box.innerHTML = disattivate.length ? `
    <details style="margin-top:16px"><summary style="cursor:pointer;font-size:13px;font-weight:600">Fasi disattivate (${disattivate.length})</summary>
      <div style="margin-top:8px;font-size:12px;color:var(--muted)">Escluse da nuovi ordini, dall'app operatore e dai ricalcoli; lo storico degli ordini già eseguiti è conservato.</div>
      ${disattivate.map(f => `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="flex:1;font-size:13px">${escapeHtml(f.nome)}</span>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="riattivaFase(${f.id})">Riattiva</button>
      </div>`).join('')}
    </details>` : '';
}

async function eliminaFase(id) {
  const nomeFase = fasi.find(f => f.id === id)?.nome || `Fase ${id}`;
  if (!confirm(`Eliminare "${nomeFase}"?\n\nSe la fase ha già uno storico (ordini spediti o lavorazioni eseguite) viene solo DISATTIVATA: esce da nuovi ordini, app operatore e ricalcoli, ma lo storico resta intatto. Se non è mai stata usata viene cancellata.`)) return;
  const { data, error } = await sb.rpc('elimina_fase', { p_fase_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  FS.draft = null; if (FS.sel === id) FS.sel = null;
  await fsCaricaDati();
  fsRender();
  toast(data.esito === 'disattivata' ? `"${nomeFase}" disattivata (storico conservato)` : `"${nomeFase}" eliminata`, 'ok');
}

async function riattivaFase(id) {
  const { data, error } = await sb.rpc('imposta_fase_attiva', { p_fase_id: id, p_attiva: true, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await fsCaricaDati();
  fsRender();
  toast('Fase riattivata', 'ok');
}

// ─── Salvataggio configurazione fasi: solo le fasi modificate, con anteprima dei cambi sugli ordini aperti ───
// Le bozze dei criteri sugli attributi aggiuntivi (attr_x / modo_attr_x) diventano {attributi:{x:[...]}, modi_attributi:{x:modo}} per il server
function _raccogliAttributiBozza(src) {
  const out = {};
  Object.entries(src).forEach(([k, v]) => {
    if (k.startsWith('modo_attr_')) (out.modi_attributi ||= {})[k.slice(10)] = v;
    else if (k.startsWith('attr_')) (out.attributi ||= {})[k.slice(5)] = v;
    else out[k] = v;
  });
  return out;
}

// Anteprima dei cambi sugli ordini aperti: distingue fasi attivate, saltate (fasi successive già completate) e disattivate, con i codici ordine.
// "conferma" è la funzione che scrive davvero (salvataggio configurazione o creazione fase).
let _anteprimaFasiConferma = null;
function mostraAnteprimaFasi(soggetto, data, conferma) {
  const cambi = data.cambi || [];
  const gruppi = [
    { titolo: 'Attivata', nota: '', sel: c => c.a !== 'non_applicabile' },
    { titolo: 'Saltata', nota: ' (fasi successive già completate)', sel: c => c.motivo === 'fasi_successive_completate' },
    { titolo: 'Disattivata', nota: '', sel: c => c.a === 'non_applicabile' && !c.motivo },
  ].map(g => {
    const codici = [...new Set(cambi.filter(g.sel).map(c => c.codice || ''))];
    return codici.length ? `<li><b>${g.titolo}</b>${g.nota} su <b>${codici.length}</b> ${codici.length === 1 ? 'ordine' : 'ordini'}: ${codici.map(escapeHtml).join(', ')}</li>` : '';
  }).join('');
  const righe = cambi.map(c => `<tr><td>${escapeHtml(c.codice || '')}</td><td>${escapeHtml(c.fase_nome || '')}</td>
    <td>${escapeHtml(etichettaStatoFase(c.da))} → <b>${escapeHtml(etichettaStatoFase(c.a))}</b>${c.motivo ? ' <em>(saltata)</em>' : ''}</td></tr>`).join('');
  document.getElementById('anteprima-fasi-body').innerHTML = `
    <p style="font-size:14px;margin-bottom:6px">${escapeHtml(soggetto)} cambia <b>${data.n_cambi}</b> ${data.n_cambi === 1 ? 'fase' : 'fasi'} su <b>${data.n_ordini}</b> ${data.n_ordini === 1 ? 'ordine aperto' : 'ordini aperti'}.
    Le fasi già iniziate o completate e gli ordini spediti non vengono toccati.</p>
    <ul style="font-size:13px;margin:0 0 10px 18px;line-height:1.5">${gruppi}</ul>
    <div style="max-height:320px;overflow:auto"><table class="tbl" style="width:100%;font-size:12px"><thead><tr><th>Ordine</th><th>Fase</th><th>Stato</th></tr></thead><tbody>${righe}</tbody></table></div>`;
  _anteprimaFasiConferma = conferma;
  document.getElementById('modal-anteprima-fasi').classList.add('open');
}

async function confermaAnteprimaFasi() {
  const fn = _anteprimaFasiConferma;
  _anteprimaFasiConferma = null;
  if (fn) await fn(); else closeModal('modal-anteprima-fasi');
}

function etichettaStatoFase(s) {
  return Etichette.statoFase(s);
}
