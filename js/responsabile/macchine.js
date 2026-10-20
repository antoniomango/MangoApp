// responsabile.html — Macchine (elenco e dettaglio), catalogo fasi extra.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// CATALOGO FASI EXTRA
// ═══════════════════════════════════════════════
async function loadCatalogoFasiExtra() {
  const [{ data: catalogo }, { data: macchineAssoc }, { data: competenzeAssoc }] = await Promise.all([
    sb.from('catalogo_fasi_extra').select('*').order('nome'),
    sb.from('catalogo_fase_extra_macchine').select('catalogo_fase_extra_id, macchina_id'),
    sb.from('competenze_operatore_fase_extra').select('catalogo_fase_extra_id, operatore_id, priorita').order('priorita')
  ]);
  catalogoFasiExtra = (catalogo || []).map(c => ({
    ...c,
    macchine_ids: (macchineAssoc || []).filter(m => m.catalogo_fase_extra_id === c.id).map(m => m.macchina_id),
    competenze_ids: (competenzeAssoc || []).filter(k => k.catalogo_fase_extra_id === c.id).sort((a,b) => a.priorita - b.priorita).map(k => k.operatore_id)
  }));
  renderCatalogoFasiExtraSection();
}

function renderCatalogoFasiExtraSection() {
  const el = document.getElementById('catalogo-fasi-extra-list');
  if (!el) return;
  if (!catalogoFasiExtra.length) {
    el.innerHTML = '<div style="color:var(--muted);padding:16px 0;font-size:13px">Nessuna voce nel catalogo. Aggiungi la prima con il pulsante in alto.</div>';
    return;
  }
  el.innerHTML = `<div class="card" style="padding:4px 0">
    ${catalogoFasiExtra.map(c => {
      const macNomi = (macchineList || []).filter(m => c.macchine_ids.includes(m.id)).map(m => m.nome).join(', ');
      const tipoLabel = c.tipo_gestione === 'spedizione_esterna' ? 'Spedizione esterna' : 'Standard';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px">${escapeHtml(c.nome)}
            ${!c.attiva ? '<span style="font-size:10px;background:var(--neutral-soft);padding:1px 6px;border-radius:4px;margin-left:6px;color:var(--neutral)">INATTIVA</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${tipoLabel}${c.e_attesa_esterna ? ' · Attesa esterna' : ''}${c.piu_pressate ? ' · ' + Etichette.pressate.config.previste.toLowerCase() + ': ' + c.pressate_previste : ''}${macNomi ? ' · <i data-ic="chiave"></i> ' + escapeHtml(macNomi) : ''}</div>
          ${c.descrizione ? `<div style="font-size:12px;color:var(--muted);margin-top:1px">${escapeHtml(c.descrizione)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="apriDettaglioCFE('${c.id}')">Configura</button>
          <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px" onclick="apriFormCatalogoFaseExtra('${c.id}')">Modifica</button>
          <button class="btn btn-alert" style="padding:5px 10px;font-size:12px" onclick="eliminaCatalogoFaseExtra('${c.id}','${escapeJsAttr(c.nome)}')" aria-label="Elimina">✕</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// stato del form del catalogo tenuto in memoria (mai letto dal DOM al clic)
const CFE_FORM = { macchine: new Set() };
function cfeRenderMacchineForm() {
  const el = document.getElementById('cfe-macchine-form'); if (!el) return;
  el.innerHTML = (macchineList || []).length
    ? macchineList.map(m => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;text-transform:none;letter-spacing:0"><input type="checkbox" ${CFE_FORM.macchine.has(m.id) ? 'checked' : ''} onchange="cfeToggleMacchina('${escapeJsAttr(m.id)}', this.checked)"> ${escapeHtml(m.nome)}</label>`).join('')
    : '<span style="font-size:12px;color:var(--muted)">Nessuna macchina configurata.</span>';
}
function cfeToggleMacchina(id, on) { if (on) CFE_FORM.macchine.add(id); else CFE_FORM.macchine.delete(id); cfeMostraMateriale(); }

// il campo "Cosa si riceve" compare solo per le voci esterne
function cfeMostraMateriale() {
  const esterna = document.getElementById('cfe-tipo-gestione').value !== 'standard';
  const riga = document.getElementById('cfe-materiale-row'); if (riga) riga.style.display = esterna ? '' : 'none';
  // tempo, macchine e pressate previste valgono solo per le voci standard
  const tr = document.getElementById('cfe-tempo-row'); if (tr) tr.style.display = esterna ? 'none' : '';
  const mr = document.getElementById('cfe-macchine-form-row'); if (mr) mr.style.display = esterna ? 'none' : '';
  const conMacchine = CFE_FORM.macchine.size > 0, spunta = document.getElementById('cfe-piu-pressate').checked;
  const pr = document.getElementById('cfe-pressate-row'); if (pr) pr.style.display = !esterna && spunta && conMacchine ? '' : 'none';
  const pw = document.getElementById('cfe-piu-pressate-w'); if (pw) { pw.textContent = spunta && !conMacchine ? Etichette.pressate.config.serveMacchina : ''; pw.style.display = spunta && !conMacchine ? 'block' : 'none'; }
  const lp = document.getElementById('cfe-tempo-pp'); if (lp) lp.textContent = document.getElementById('cfe-piu-pressate').checked ? '(' + Etichette.pressate.config.tempoPerPressata + ')' : '';
  // la domanda "È l'ultima pressata?" non ha senso per le fasi di ricezione / spedizione esterna
  const pp = document.getElementById('cfe-piu-pressate-row'); if (pp) pp.style.display = esterna || !(conMacchine || spunta) ? 'none' : '';
  if (esterna) document.getElementById('cfe-piu-pressate').checked = false;
}

async function apriFormCatalogoFaseExtra(id) {
  if (!(macchineList || []).length) { try { await loadMacchine(); } catch (e) { /* si apre comunque, senza elenco macchine */ } }
  const form = document.getElementById('form-catalogo-fase-extra');
  const c = id ? catalogoFasiExtra.find(x => x.id === id) : null;
  document.getElementById('cfe-id').value = c?.id || '';
  document.getElementById('cfe-nome').value = c?.nome || '';
  document.getElementById('cfe-descrizione').value = c?.descrizione || '';
  document.getElementById('cfe-tipo-gestione').value = c?.tipo_gestione || 'standard';
  document.getElementById('cfe-attiva').checked = c?.attiva !== false;
  document.getElementById('cfe-materiale').value = c?.materiale_ricezione || '';
  document.getElementById('cfe-piu-pressate-t').textContent = Etichette.pressate.config.casella;
  document.getElementById('cfe-piu-pressate-s').textContent = Etichette.pressate.config.spiega;
  document.getElementById('cfe-piu-pressate').checked = !!c?.piu_pressate;
  document.getElementById('cfe-pressate-t').textContent = Etichette.pressate.config.previste;
  document.getElementById('cfe-pressate-s').textContent = Etichette.pressate.config.previsteSpiega;
  document.getElementById('cfe-pressate-previste').value = c?.pressate_previste ?? 1;
  document.getElementById('cfe-tempo').value = c?.tempo_per_pezzo_minuti ?? '';
  CFE_FORM.macchine = new Set(c?.macchine_ids || []);
  cfeRenderMacchineForm();
  cfeMostraMateriale();
  form.style.display = '';
  document.getElementById('cfe-nome').focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function salvaCatalogoFaseExtra() {
  const id = document.getElementById('cfe-id').value || null;
  const nome = document.getElementById('cfe-nome').value.trim();
  const descrizione = document.getElementById('cfe-descrizione').value.trim() || null;
  const tipoGestione = document.getElementById('cfe-tipo-gestione').value;
  const eAttesaEsterna = tipoGestione !== 'standard';   // derivata dal tipo, mai scelta a parte
  const attiva = document.getElementById('cfe-attiva').checked;
  if (!nome) { toast('Il nome è obbligatorio', 'err'); return; }
  const standard = tipoGestione === 'standard' && !eAttesaEsterna;
  const piu = standard && document.getElementById('cfe-piu-pressate').checked;
  if (piu && !CFE_FORM.macchine.size) { toast(Etichette.pressate.config.serveMacchina, 'err'); return; }
  const previste = piu ? pressateNumeroValido(document.getElementById('cfe-pressate-previste').value) : null;
  if (piu && previste == null) { toast(Etichette.pressate.config.errori.pressate_previste_non_valide, 'err'); return; }
  const tempoTxt = document.getElementById('cfe-tempo').value.trim();
  const tempo = standard && tempoTxt !== '' ? Number(tempoTxt) : null;
  if (tempo !== null && !(tempo > 0 && tempo <= 1440)) { toast(Etichette.pressate.config.errori.minuti_non_validi, 'err'); return; }
  const { data, error } = await sb.rpc('imposta_catalogo_fase_extra', {
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
    p_id: id,
    p_nome: nome,
    p_descrizione: descrizione,
    p_tipo_gestione: tipoGestione,
    p_e_attesa_esterna: eAttesaEsterna,
    p_attiva: attiva,
    p_materiale_ricezione: tipoGestione !== 'standard' ? document.getElementById('cfe-materiale').value.trim() : '',
    p_piu_pressate: piu,
    ...(piu ? { p_pressate_previste: previste } : {}),
    ...(tempo !== null ? { p_tempo_per_pezzo: tempo } : {}),
    ...(standard ? { p_macchine_ids: [...CFE_FORM.macchine] } : {})
  });
  if (error || !data?.ok) { toast('Errore: ' + (Etichette.pressate.config.errori[data?.errore] || error?.message || data?.errore || ''), 'err'); return; }
  toast(id ? 'Voce aggiornata' : 'Voce aggiunta', 'ok');
  document.getElementById('form-catalogo-fase-extra').style.display = 'none';
  await loadCatalogoFasiExtra();
}

async function eliminaCatalogoFaseExtra(id, nome) {
  if (!confirm(`Eliminare "${nome}" dal catalogo? Le fasi ordine collegate non vengono modificate.`)) return;
  const { data, error } = await sb.rpc('elimina_catalogo_fase_extra', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast(data.esito === 'disattivata' ? 'Voce già usata da ordini: disattivata' : 'Voce eliminata', 'ok');
  await loadCatalogoFasiExtra();
}

// ─── Pannello dettaglio voce catalogo (competenze + macchine) ─────────────────

let _cfeDettaglioId = null; // voce catalogo attualmente aperta nel pannello

function apriDettaglioCFE(cfeId) {
  _cfeDettaglioId = cfeId;
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  document.getElementById('cfe-detail-title').textContent = c.nome;
  document.getElementById('form-catalogo-fase-extra').style.display = 'none';
  renderCompetenzeCFE(c);
  renderMacchineCFE(c);
  const panel = document.getElementById('cfe-detail-panel');
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function chiudiDettaglioCFE() {
  _cfeDettaglioId = null;
  document.getElementById('cfe-detail-panel').style.display = 'none';
}

function renderCompetenzeCFE(c) {
  const el = document.getElementById('cfe-competenze-list');
  if (!el) return;
  const arr = c.competenze_ids || [];
  if (!arr.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);font-style:italic;padding:4px 0">Nessuna competenza — chiunque è candidato</div>';
  } else {
    el.innerHTML = arr.map((opId, i) => {
      const op = operatoriCache.find(o => o.id === opId);
      const nome = op ? `${op.nome} ${op.cognome}` : opId;
      return `<div style="display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;color:var(--muted);min-width:18px;text-align:center">${i+1}.</span>
        <span style="flex:1;font-size:13px">${escapeHtml(nome)}</span>
        <button onclick="spostaCompetenzaCFE('${c.id}','${opId}',-1)" ${i===0?'disabled':''} style="border:1px solid var(--border);background:var(--surface);border-radius:3px;padding:1px 6px;font-size:11px;cursor:pointer;color:var(--ink)">↑</button>
        <button onclick="spostaCompetenzaCFE('${c.id}','${opId}',1)" ${i===arr.length-1?'disabled':''} style="border:1px solid var(--border);background:var(--surface);border-radius:3px;padding:1px 6px;font-size:11px;cursor:pointer;color:var(--ink)">↓</button>
        <button onclick="rimuoviCompetenzaCFE('${c.id}','${opId}')" style="border:none;background:none;color:var(--alert-strong);font-size:14px;cursor:pointer;padding:0 2px;line-height:1" aria-label="Rimuovi">✕</button>
      </div>`;
    }).join('');
  }
  // Popola select aggiunta
  const sel = document.getElementById('cfe-comp-add-sel');
  if (sel) {
    const gia = new Set(arr);
    const disponibili = operatoriCache.filter(o => o.ruolo === 'operatore' && o.attivo && !gia.has(o.id));
    sel.innerHTML = '<option value="">— aggiungi operatore —</option>' +
      disponibili.map(o => `<option value="${o.id}">${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</option>`).join('');
  }
}

function renderMacchineCFE(c) {
  const el = document.getElementById('cfe-macchine-list');
  if (!el) return;
  const macchine = macchineList || [];
  if (!macchine.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);font-style:italic">Nessuna macchina configurata</div>';
    return;
  }
  el.innerHTML = macchine.map(m => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:3px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${(c.macchine_ids||[]).includes(m.id)?'checked':''}
        onchange="toggleMacchinaCFE('${c.id}','${m.id}',this.checked)"
        style="accent-color:var(--accent);width:13px;height:13px">
      ${escapeHtml(m.nome)}
    </label>`).join('');
}

function spostaCompetenzaCFE(cfeId, opId, dir) {
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  const arr = [...(c.competenze_ids || [])];
  const idx = arr.indexOf(opId);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= arr.length) return;
  [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
  c.competenze_ids = arr;
  renderCompetenzeCFE(c);
}

function aggiungiCompetenzaCFE() {
  const cfeId = _cfeDettaglioId;
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  const sel = document.getElementById('cfe-comp-add-sel');
  const opId = sel?.value;
  if (!opId) return;
  c.competenze_ids = [...(c.competenze_ids || []), opId];
  renderCompetenzeCFE(c);
}

function rimuoviCompetenzaCFE(cfeId, opId) {
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  c.competenze_ids = (c.competenze_ids || []).filter(id => id !== opId);
  renderCompetenzeCFE(c);
}

async function salvaCompetenzeCFE() {
  const cfeId = _cfeDettaglioId;
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  const { data, error } = await sb.rpc('imposta_competenze_per_catalogo_fase_extra', {
    p_responsabile_id: currentUserRow.id,
    p_catalogo_fase_extra_id: cfeId,
    p_operatori_ordinati: c.competenze_ids || [],
    p_session_token: null
  });
  if (error || !data?.ok) { toast('Errore: ' + (error?.message || data?.errore || ''), 'err'); return; }
  toast('Competenze salvate', 'ok');
}

function toggleMacchinaCFE(cfeId, macId, checked) {
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  if (checked) { if (!c.macchine_ids.includes(macId)) c.macchine_ids.push(macId); }
  else { c.macchine_ids = c.macchine_ids.filter(id => id !== macId); }
}

async function salvaMacchineCFE() {
  const cfeId = _cfeDettaglioId;
  const c = catalogoFasiExtra.find(x => x.id === cfeId);
  if (!c) return;
  const { data, error } = await sb.rpc('imposta_macchine_fase_extra', {
    p_responsabile_id: currentUserRow.id,
    p_catalogo_fase_extra_id: cfeId,
    p_macchine_ids: c.macchine_ids || [],
    p_session_token: null
  });
  if (error || !data?.ok) { toast('Errore: ' + (error?.message || data?.errore || ''), 'err'); return; }
  toast('Macchine salvate', 'ok');
}

// ═══════════════════════════════════════════════
// MACCHINE CONFIG — elenco + dettaglio di una macchina (mango-v56)
// ═══════════════════════════════════════════════
// Stesso schema della sezione Fasi: bozza in memoria (FM.draft) aggiornata a ogni modifica, mai letta dal DOM al clic; un solo Salva (RPC salva_macchina).
// Le manutenzioni programmate si salvano subito (RPC dedicate). Nessun valore di configurazione nel codice: macchine, fasi, fattori, ore dell'orario,
// competenze e carico di oggi vengono dal database; le etichette (stati, fattori) sono in js/etichette.js.
let macchineList = [];   // [{id, nome, stato, ore_default, fase_ids, fattori:{faseId:fattore}, competenze, manutenzioni}]
const FM = { sel: null, draft: null, cerca: '', filtro: 'tutte', guard: null, mobileDettaglio: false, carico: {}, extra: {}, confermaElimina: false, salvando: false, compAperto: false };

async function loadMacchine() {
  const [{ data: macchine }, { data: faseMac }, { data: compMac }, { data: manut }] = await Promise.all([
    sb.from('macchine').select('*').order('nome'),
    sb.from('fase_macchine').select('fase_id, macchina_id, fattore_tempo, presa_minuti, ante_per_pressata'),
    sb.from('competenze_operatore_macchina').select('operatore_id, macchina_id, priorita').order('priorita'),
    sb.from('manutenzioni_macchina').select('*').order('data_inizio'),
  ]);
  macchineList = (macchine || []).map(m => ({
    ...m,
    fase_ids:     (faseMac || []).filter(r => r.macchina_id === m.id).map(r => r.fase_id),
    fattori:      Object.fromEntries((faseMac || []).filter(r => r.macchina_id === m.id).map(r => [r.fase_id, Number(r.fattore_tempo)])),
    prese:        Object.fromEntries((faseMac || []).filter(r => r.macchina_id === m.id && r.presa_minuti != null).map(r => [r.fase_id, { minuti: Number(r.presa_minuti), ordini: Number(r.ante_per_pressata) }])),
    competenze:   (compMac || []).filter(r => r.macchina_id === m.id).sort((a, b) => a.priorita - b.priorita).map(r => r.operatore_id),
    manutenzioni: (manut || []).filter(r => r.macchina_id === m.id),
  }));
}

const fmFasiInterne = () => fasiAttive().filter(f => (f.tipo_gestione || 'standard') === 'standard' && !f.e_attesa_esterna);
const fmFaseNome = id => fasi.find(f => f.id === id)?.nome || ('Fase ' + id);
const fmFaseNum = id => fsIdx(id) + 1;
const fmInManutOggi = m => (m.manutenzioni || []).some(x => x.data_inizio <= Calendario.oggiIso() && Calendario.oggiIso() <= x.data_fine);
const fmOreOggi = m => m.ore_default != null ? Number(m.ore_default) : Calendario.minutiGiorno(Calendario.oggiIso()) / 60;
const fmOreOrario = () => Calendario.minutiGiorno(Calendario.oggiIso()) / 60;
const fmFmtMin = (min) => { const h = Math.floor(min / 60), r = Math.round(min % 60); return h ? `${h} h${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} min`; };
const fmFmtOre = (h) => String(Math.round(Number(h) * 100) / 100).replace('.', ',');

// modello (bozza) di una macchina
function fmModello(m) {
  return {
    id: m.id, nome: m.nome || '', stato: m.stato || 'attiva', ore: m.ore_default != null ? Number(m.ore_default) : null,
    fasi: (m.fase_ids || []).map(fid => ({ fase_id: fid, fattore: Number((m.fattori || {})[fid] ?? 1), presa_attiva: !!(m.prese || {})[fid], presa_minuti: (m.prese || {})[fid]?.minuti ?? null, ante_per_pressata: (m.prese || {})[fid]?.ordini ?? null })).sort((a, b) => fmFaseNum(a.fase_id) - fmFaseNum(b.fase_id)),
    comp: [...(m.competenze || [])],
    manutenzioni: m.manutenzioni || [],
  };
}
const fmOrig = id => { const m = macchineList.find(x => x.id === id); return m ? fmModello(m) : null; };
const fmNuovoModello = () => ({ id: null, nome: '', stato: 'attiva', ore: null, fasi: [], comp: [], manutenzioni: [] });
const fmPulito = m => ({ nome: m.nome.trim(), stato: m.stato, ore: m.ore, fasi: m.fasi, comp: m.comp });
const fmSporca = () => {
  if (!FM.draft) return false;
  if (FM.draft.id === null) return FM.draft.nome.trim() !== '' || FM.draft.fasi.length > 0 || FM.draft.comp.length > 0 || FM.draft.stato !== 'attiva' || FM.draft.ore !== null;
  const o = fmOrig(FM.draft.id);
  return !!o && JSON.stringify(fmPulito(FM.draft)) !== JSON.stringify(fmPulito(o));
};
// macchina come "vista" per le regole condivise (stato della bozza + manutenzioni salvate)
const fmCorrente = m => (FM.draft && FM.draft.id === m.id) ? { ...m, stato: FM.draft.stato, fase_ids: FM.draft.fasi.map(f => f.fase_id), fattori: Object.fromEntries(FM.draft.fasi.map(f => [f.fase_id, f.fattore])) } : m;
const fmElencoCorrente = () => macchineList.map(fmCorrente);
const fmUtilizzabile = m => fsMacchinaOk(m);
function fmAltreMacchine(faseId, escludiId) { return fmElencoCorrente().filter(x => x.id !== escludiId && (x.fase_ids || []).includes(faseId)); }
function fmFasiBloccate(m) {   // fasi che restano senza nessuna macchina utilizzabile se questa non lo è
  if (fmUtilizzabile(m)) return [];
  return fmFasiInterne().filter(f => (m.fase_ids || []).includes(f.id) && faseSenzaMacchinaUtilizzabile([m, ...fmAltreMacchine(f.id, m.id)])).map(f => f.id);
}
const fmFaseBloccataGlobale = fid => faseSenzaMacchinaUtilizzabile(fmElencoCorrente().filter(x => (x.fase_ids || []).includes(fid)));

async function fmCaricaDati() {
  await Promise.all([loadFasi(), loadMacchine(), loadCatalogoFasiExtra()]);
  fsRicostruisciModelli();
  const oggi = Calendario.oggiIso();
  const { data } = await sb.from('piano_giorno_voci').select('macchina_id, minuti_macchina, minuti_stimati').eq('data', oggi).is('uscita_il', null).not('macchina_id', 'is', null);
  FM.carico = {};
  (data || []).forEach(v => { FM.carico[v.macchina_id] = (FM.carico[v.macchina_id] || 0) + Number(v.minuti_macchina ?? v.minuti_stimati ?? 0); });
  FM.extra = {};
  (catalogoFasiExtra || []).forEach(c => (c.macchine_ids || []).forEach(mid => { (FM.extra[mid] ||= []).push(c.nome); }));
  const bozza = fmSporca() ? FM.draft : null;
  if (FM.draft && FM.draft.id !== null && !fmOrig(FM.draft.id)) FM.draft = null;
  if (!bozza && FM.draft && FM.draft.id !== null) FM.draft = fmOrig(FM.draft.id);
}
async function fmApriSezione() { await fmCaricaDati(); fmRender(); }

function fmRender() {
  if (!FM.draft || (FM.draft.id !== null && !fmOrig(FM.draft.id))) {
    const prima = macchineList[0];
    FM.sel = prima ? prima.id : null; FM.draft = prima ? fmModello(prima) : null;
  }
  document.getElementById('fm-grid').classList.toggle('fs-mostra-dettaglio', FM.mobileDettaglio);
  fmRenderRiepilogo(); fmRenderLista();
  if (FM.draft) fmRenderDettaglio(); else document.getElementById('fm-dettaglio').innerHTML = '<div class="empty-state"><p>Nessuna macchina configurata. Usa "+ Nuova macchina".</p></div>';
}

// ── riepilogo + elenco ───────────────────────────────────────────────────────────────────────────────────
function fmRenderRiepilogo() {
  const ferme = fmElencoCorrente().filter(m => !fmUtilizzabile(m));
  const bloccate = fmFasiInterne().filter(f => fmFaseBloccataGlobale(f.id));
  document.getElementById('fm-riepilogo').innerHTML = ferme.length ? `<div class="fm-riepilogo" role="status"><span>●</span>
    <span><b>${ferme.length} ${ferme.length === 1 ? 'macchina ferma' : 'macchine ferme'}</b> (${ferme.map(m => escapeHtml(m.nome)).join(', ')}): <b>${bloccate.length} ${bloccate.length === 1 ? 'fase' : 'fasi'}</b> non ${bloccate.length === 1 ? 'entra' : 'entrano'} nel piano di oggi.</span>
    <button class="btn btn-secondary" onclick="FM.filtro='ferme';fmRenderLista()">Mostra</button></div>` : '';
}
const FM_FILTRI = [['tutte', 'Tutte', () => true], ['ferme', 'Ferme', m => !fmUtilizzabile(m)], ['attive', 'Attive', m => fmUtilizzabile(m)]];
function fmDotClass(m) { return fmInManutOggi(m) && m.stato === 'attiva' ? 'manutenzione' : m.stato; }
function fmRenderLista() {
  const elenco = fmElencoCorrente();
  document.getElementById('fm-filtri').innerHTML = FM_FILTRI.map(([k, t, fn]) =>
    `<button class="fs-filtro ${FM.filtro === k ? 'on' : ''}" onclick="FM.filtro='${k}';fmRenderLista()">${t}<span class="n">${elenco.filter(fn).length}</span></button>`).join('');
  const q = FM.cerca.trim().toLowerCase();
  const fn = FM_FILTRI.find(x => x[0] === FM.filtro)[2];
  const righe = elenco.filter(m => fn(m) && (!q || m.nome.toLowerCase().includes(q) || (m.fase_ids || []).some(fid => fmFaseNome(fid).toLowerCase().includes(q))));
  const nuova = FM.draft && FM.draft.id === null
    ? `<button class="fs-riga on" style="grid-template-columns:14px minmax(0,1fr) auto"><span style="padding-top:5px"><span class="fm-dot attiva"></span></span><span style="min-width:0"><span class="nome">${escapeHtml(FM.draft.nome || 'Nuova macchina')}<span class="fs-mod-dot" title="Non ancora salvata"></span></span><span class="meta">non ancora salvata</span></span><span></span></button>` : '';
  document.getElementById('fm-righe').innerHTML = nuova + (righe.length ? righe.map(m => {
    const ok = fmUtilizzabile(m), cap = fmOreOggi(m) * 60, pm = FM.carico[m.id] || 0;
    const destra = ok
      ? `<span class="fm-carico" title="In lista oggi: ${fmFmtMin(pm)} su ${fmFmtOre(fmOreOggi(m))} h"><span class="v">${pm ? fmFmtMin(pm) : '—'}</span><span class="fm-barra"><span style="width:${Math.min(100, pm / cap * 100)}%"></span></span></span>`
      : `<span class="fs-tag ${m.stato === 'fuori_uso' ? 'fm-tag-ko' : 'fm-tag-man'}">${fmInManutOggi(m) && m.stato === 'attiva' ? 'Manutenzione oggi' : Etichette.statoMacchina(m.stato)}</span>`;
    const meta = [`${(m.fase_ids || []).length} ${(m.fase_ids || []).length === 1 ? 'fase' : 'fasi'}`];
    if ((FM.extra[m.id] || []).length) meta.push(`${FM.extra[m.id].length} extra`);
    meta.push(m.ore_default == null ? `${fmFmtOre(fmOreOrario())} h (orario)` : `${fmFmtOre(m.ore_default)} h/giorno`);
    if (Object.values(m.fattori || {}).some(f => f !== 1)) meta.push('tempo più lungo per alcune fasi');
    const sporca = FM.draft && FM.draft.id === m.id && fmSporca();
    return `<button class="fs-riga ${m.id === FM.sel && FM.draft && FM.draft.id === m.id ? 'on' : ''}" onclick="fmSeleziona('${escapeJsAttr(m.id)}')" style="grid-template-columns:14px minmax(0,1fr) auto">
      <span style="padding-top:5px"><span class="fm-dot ${fmDotClass(m)}"></span></span>
      <span style="min-width:0"><span class="nome">${escapeHtml(m.nome)}${sporca ? '<span class="fs-mod-dot" title="Modifiche non salvate"></span>' : ''}</span>
        <span class="meta">${meta.map(escapeHtml).join('<span aria-hidden="true">·</span>')}</span></span>
      ${destra}
    </button>`;
  }).join('') : (nuova ? '' : '<div style="padding:20px;color:var(--muted);font-size:13px">Nessuna macchina trovata.</div>'));
}

function fmSeleziona(id) {
  if (FM.draft && FM.draft.id === id) { if (window.innerWidth <= 760) { FM.mobileDettaglio = true; fmRender(); } return; }
  if (fmSporca()) { FM.guard = { tipo: 'macchina', id }; fmRenderDettaglio(); fmVaiInAlto(); return; }
  fmApri(id);
}
function fmApri(id) {
  const m = fmOrig(id); if (!m) return;
  FM.sel = id; FM.draft = m; FM.guard = null; FM.confermaElimina = false;
  if (window.innerWidth <= 760) FM.mobileDettaglio = true;
  fmRender();
  document.querySelector('#fm-righe .fs-riga.on')?.scrollIntoView({ block: 'nearest' });
}
function fmVaiInAlto() { document.getElementById('fm-dettaglio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function fmTornaElenco() { FM.mobileDettaglio = false; fmRender(); }
function fmNuova() {
  if (fmSporca()) { FM.guard = { tipo: 'nuova' }; fmRenderDettaglio(); fmVaiInAlto(); return; }
  fmApriNuova();
}
function fmApriNuova() { FM.draft = fmNuovoModello(); FM.sel = null; FM.guard = null; FM.confermaElimina = false; if (window.innerWidth <= 760) FM.mobileDettaglio = true; fmRender(); document.getElementById('fm-g-nome')?.focus(); }

// ── modifiche alla bozza ─────────────────────────────────────────────────────────────────────────────────
function fmAggiornaStato(rerender = false) {
  const d = fmSporca();
  const el = document.getElementById('fm-stato-mod'); if (el) el.hidden = !d;
  document.querySelectorAll('[data-fm-salva]').forEach(b => { b.disabled = !d || FM.salvando; });
  fmRenderRiepilogo(); fmRenderLista();
  if (rerender) fmRenderDettaglio();
}
function fmSet(campo, v) { FM.draft[campo] = v; fmAggiornaStato(true); }
function fmSetNome(v) { FM.draft.nome = v; const h = document.querySelector('.fs-det-title h2'); if (h) h.textContent = v || (FM.draft.id === null ? 'Nuova macchina' : 'Senza nome'); fmAggiornaStato(); }
function fmSetOreModo(modo) { FM.draft.ore = modo === 'orario' ? null : (FM.draft.ore ?? (fmOrig(FM.draft.id)?.ore ?? Math.round(fmOreOrario() * 2) / 2)); fmAggiornaStato(true); }
function fmSetOre(v) { FM.draft.ore = v === '' ? null : Number(v); fmAggiornaStato(); }
function fmAggiungiFase(v) {
  const id = Number(v); if (!id || FM.draft.fasi.some(f => f.fase_id === id)) return;
  FM.draft.fasi.push({ fase_id: id, fattore: 1, presa_attiva: false, presa_minuti: null, ante_per_pressata: null }); FM.draft.fasi.sort((a, b) => fmFaseNum(a.fase_id) - fmFaseNum(b.fase_id)); fmAggiornaStato(true);
}
function fmTogliFase(id) { FM.draft.fasi = FM.draft.fasi.filter(f => f.fase_id !== id); fmAggiornaStato(true); }
function fmSetPresa(id, on) { const f = FM.draft.fasi.find(x => x.fase_id === id); if (!f) return; f.presa_attiva = !!on; if (on) f.fattore = 1; else { f.presa_minuti = null; f.ante_per_pressata = null; } fmAggiornaStato(true); }
function fmPresaCampo(id, campo, v) { const f = FM.draft.fasi.find(x => x.fase_id === id); if (!f) return; f[campo] = presaNumero(v); fmAggiornaStato(); }
function fmSetFattore(id, v) { const f = FM.draft.fasi.find(x => x.fase_id === id); if (f) f.fattore = Number(v); fmAggiornaStato(true); }
function fmCompSposta(i, dir) { const a = FM.draft.comp; [a[i], a[i + dir]] = [a[i + dir], a[i]]; fmAggiornaStato(true); }
function fmCompTogli(i) { FM.draft.comp.splice(i, 1); fmAggiornaStato(true); }
function fmCompAggiungi(id) { if (!id || FM.draft.comp.includes(id)) return; FM.draft.comp.push(id); fmAggiornaStato(true); }
function fmAnnulla() { FM.draft = FM.draft.id === null ? fmNuovoModello() : fmOrig(FM.draft.id); FM.guard = null; fmRender(); }

// ── salvataggio ──────────────────────────────────────────────────────────────────────────────────────────
const FM_ERRORI = { presa_non_valida: Etichette.presa.config.errore, nome_obbligatorio: 'Il nome è obbligatorio.', nome_gia_esistente: 'Esiste già una macchina con questo nome.', stato_non_valido: 'Stato non valido.', ore_non_valide: 'Le ore devono stare tra 0,5 e 24.',
  fase_non_trovata: 'Una fase scelta non esiste più.', fattore_non_valido: 'Il tempo macchina non è valido.', operatore_non_trovato: 'Un operatore scelto non è più disponibile.', competenze_duplicate: 'Operatore ripetuto.',
  macchina_in_uso: 'È usata da un ordine aperto: mettila Fuori uso invece di eliminarla.', macchina_non_trovata: 'Macchina non trovata.' };
function fmPayload() {
  const d = FM.draft, nuova = d.id === null, o = nuova ? null : fmOrig(d.id), p = {};
  if (nuova || d.nome.trim() !== o.nome) p.nome = d.nome.trim();
  if (nuova || d.stato !== o.stato) p.stato = d.stato;
  if (nuova || d.ore !== o.ore) p.ore_default = d.ore;
  if (nuova || JSON.stringify(d.fasi) !== JSON.stringify(o.fasi)) p.fasi = d.fasi.map(f => f.presa_attiva ? ({ fase_id: f.fase_id, fattore_tempo: 1, presa_minuti: f.presa_minuti, ante_per_pressata: f.ante_per_pressata }) : ({ fase_id: f.fase_id, fattore_tempo: f.fattore }));
  if (nuova || JSON.stringify(d.comp) !== JSON.stringify(o.comp)) p.competenze = d.comp;
  return p;
}
async function fmSalva(poi) {
  if (FM.salvando || !fmSporca()) return;
  const d = FM.draft;
  if (!d.nome.trim()) { toast('Inserisci il nome della macchina.', 'err'); return; }
  if (d.ore !== null && (!(d.ore >= 0.5) || d.ore > 24)) { toast('Le ore devono stare tra 0,5 e 24.', 'err'); return; }
  if (d.fasi.some(f => f.presa_attiva && !presaValida(f.presa_minuti, f.ante_per_pressata))) { toast(Etichette.presa.config.errore, 'err'); return; }
  const prima = d.id === null ? null : macchineList.find(x => x.id === d.id);
  const bloccavaPrima = prima ? new Set(fmFasiBloccate(prima)) : new Set();
  FM.salvando = true; fmAggiornaStato();
  const { data, error } = await sb.rpc('salva_macchina', { p_id: d.id, p_dati: fmPayload(), p_responsabile_id: currentUserRow.id, p_session_token: null });
  FM.salvando = false;
  if (error || !data?.ok) { fmAggiornaStato(); toast('Salvataggio NON riuscito: ' + (FM_ERRORI[data?.errore] || data?.errore || error?.message || 'errore sconosciuto'), 'err'); return; }
  const id = data.id;
  FM.draft = null;
  await fmCaricaDati();
  FM.draft = fmOrig(id); FM.sel = id; FM.guard = null;
  const ora = macchineList.find(x => x.id === id);
  const bloccaOra = ora ? fmFasiBloccate(ora) : [];
  const nuove = bloccaOra.filter(x => !bloccavaPrima.has(x)).length, liberate = [...bloccavaPrima].filter(x => !bloccaOra.includes(x)).length;
  toast(`Macchina salvata. Il piano di oggi si aggiorna da solo${nuove ? ` (${nuove} fasi escono)` : liberate ? ` (${liberate} fasi possono rientrare)` : ''}.`, 'ok');
  if (poi) poi(); else fmRender();
}
function fmGuardSalva() { const g = FM.guard; if (g) fmSalva(() => fmVaiA(g)); }
function fmGuardScarta() { const g = FM.guard; if (!g) return; FM.draft = FM.draft.id === null ? null : fmOrig(FM.draft.id); fmVaiA(g); }
function fmGuardResta() { FM.guard = null; fmRenderDettaglio(); }
function fmVaiA(g) {
  FM.guard = null;
  if (g.tipo === 'macchina') fmApri(g.id);
  else if (g.tipo === 'nuova') fmApriNuova();
  else if (g.tipo === 'sezione') { FM.draft = FM.draft && FM.draft.id !== null ? fmOrig(FM.draft.id) : null; showSection(g.nome); }
}
function fmPuoUscire(nome) {
  if (nome === 'macchine-config' || !fmSporca() || !document.getElementById('sec-macchine-config')?.classList.contains('active')) return true;
  FM.guard = { tipo: 'sezione', nome }; fmRender(); fmVaiInAlto();
  return false;
}
async function fmElimina() {
  const id = FM.draft?.id; if (!id) return;
  const { data, error } = await sb.rpc('elimina_macchina', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { FM.confermaElimina = false; fmRenderDettaglio(); toast('Non eliminata: ' + (FM_ERRORI[data?.errore] || data?.errore || error?.message || ''), 'err'); return; }
  FM.draft = null; FM.sel = null; FM.confermaElimina = false; FM.mobileDettaglio = false;
  await fmCaricaDati(); fmRender();
  toast('Macchina eliminata', 'ok');
}

// ── manutenzioni programmate (salvataggio immediato) ─────────────────────────────────────────────────────
function fmDataIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmManutRapida(k) {
  const base = new Date(Calendario.oggiIso() + 'T12:00:00'); const add = n => { const x = new Date(base); x.setDate(x.getDate() + n); return fmDataIso(x); };
  const dow = (base.getDay() + 6) % 7;   // lunedì = 0
  const [dal, al] = k === 'oggi' ? [add(0), add(0)] : k === 'domani' ? [add(1), add(1)] : [add(7 - dow), add(11 - dow)];
  document.getElementById('fm-mn-dal').value = dal; document.getElementById('fm-mn-al').value = al;
}
async function fmAggiungiManut() {
  const id = FM.draft?.id; if (!id) return;
  const dal = document.getElementById('fm-mn-dal').value, al = document.getElementById('fm-mn-al').value, desc = document.getElementById('fm-mn-desc').value.trim() || null;
  if (!dal || !al) { toast('Indica le date Dal e Al.', 'err'); return; }
  if (al < dal) { toast('La data Al non può essere prima di Dal.', 'err'); return; }
  const { data, error } = await sb.rpc('imposta_manutenzione_macchina', { p_macchina_id: id, p_data_inizio: dal, p_data_fine: al, p_descrizione: desc, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(data?.errore === 'data_fine_precedente_inizio' ? 'La data Al non può essere prima di Dal.' : ('Errore: ' + (data?.errore || error?.message || '')), 'err'); return; }
  await fmDopoManutenzione(id); toast('Manutenzione aggiunta. Il piano dei giorni interessati si aggiorna da solo.', 'ok');
}
async function fmTogliManut(mid) {
  const id = FM.draft?.id; if (!id) return;
  const { data, error } = await sb.rpc('elimina_manutenzione_macchina', { p_id: mid, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await fmDopoManutenzione(id); toast('Manutenzione eliminata.', 'ok');
}
async function fmDopoManutenzione(id) {   // ricarica le manutenzioni senza toccare le altre modifiche in bozza
  const bozza = FM.draft;
  await loadMacchine();
  const m = macchineList.find(x => x.id === id);
  if (m) bozza.manutenzioni = m.manutenzioni;
  FM.draft = bozza;
  fmRender();
}

// ── dettaglio ────────────────────────────────────────────────────────────────────────────────────────────
function fmRenderDettaglio() {
  const d = FM.draft; if (!d) return;
  const nuova = d.id === null;
  const orig = nuova ? null : macchineList.find(x => x.id === d.id);
  const m = { ...(orig || { id: null, manutenzioni: [], fattori: {}, fase_ids: [], ore_default: null }), nome: d.nome, stato: d.stato, ore_default: d.ore, fase_ids: d.fasi.map(f => f.fase_id), manutenzioni: d.manutenzioni };
  const ok = fmUtilizzabile(m), sporca = fmSporca(), oggi = Calendario.oggiIso();
  const cap = fmOreOggi(m) * 60, pm = nuova ? 0 : (FM.carico[d.id] || 0);
  const bloccate = fmFasiBloccate({ ...m, id: nuova ? '__nuova__' : m.id });
  const cambioStato = !nuova && d.stato !== orig.stato;
  const g = FM.guard;
  const nomeDest = g ? (g.tipo === 'macchina' ? `«${escapeHtml(macchineList.find(x => x.id === g.id)?.nome || '')}»` : g.tipo === 'nuova' ? 'una nuova macchina' : 'un\'altra sezione') : '';
  const guard = g ? `<div class="fs-guard" role="alert"><span>Hai modifiche non salvate su «${escapeHtml(d.nome || 'Nuova macchina')}». Cosa vuoi fare prima di aprire ${nomeDest}?</span>
      <button class="btn btn-primary" onclick="fmGuardSalva()">Salva e apri</button><button class="btn btn-secondary" onclick="fmGuardScarta()">Scarta</button><button class="fs-btn-ghost" onclick="fmGuardResta()">Resta qui</button></div>` : '';
  let avvisi = '';
  const av = (cls, ico, txt) => `<div class="fs-avviso ${cls}">${ico}<span>${txt}</span></div>`;
  if (!ok && bloccate.length) avvisi += av('alert', '●', `${cambioStato ? 'Salvando, queste fasi escono dal piano di oggi' : 'Queste fasi non entrano nel piano finché la macchina non torna attiva'}: <b>${bloccate.map(f => escapeHtml(fmFaseNome(f))).join(', ')}</b>.`);
  else if (!ok && d.fasi.length) avvisi += av('info', 'i', 'La macchina è ferma ma nessuna fase dipende solo da lei: il piano usa le altre macchine.');
  else if (ok && cambioStato && d.fasi.length) avvisi += av('info', 'i', 'Salvando, le fasi di questa macchina possono rientrare nel piano di oggi se c\'è spazio.');
  if (ok && !d.fasi.length && !(FM.extra[d.id] || []).length && !nuova) avvisi += av('info', 'i', 'Nessuna fase usa questa macchina: per il piano è come se non ci fosse.');

  const aggiungibili = fmFasiInterne().filter(f => !d.fasi.some(x => x.fase_id === f.id));
  const fmtF = f => Etichette.fattoreTempoEtichetta(f);
  const chipFase = (f) => {
    const alt = fmAltreMacchine(f.fase_id, d.id);
    const opz = Etichette.fattoriTempoMacchina().map(x => x[0]);
    const opzioni = (opz.includes(f.fattore) ? opz : [...opz, f.fattore].sort((a, b) => a - b)).map(v => `<option value="${v}" ${v === f.fattore ? 'selected' : ''}>${escapeHtml(fmtF(v))}</option>`).join('');
    return `<span class="fs-chip link fm-chipfase"><span>${fmFaseNum(f.fase_id)}. ${escapeHtml(fmFaseNome(f.fase_id))}</span>
      ${f.presa_attiva ? '' : `<select class="fm-fatt" aria-label="Tempo macchina per ${escapeHtml(fmFaseNome(f.fase_id))}" onchange="fmSetFattore(${f.fase_id}, this.value)">${opzioni}</select>`}
      <span class="presa-box" style="flex:1 1 100%">${presaBloccoHtml(f.presa_attiva, f.presa_minuti, f.ante_per_pressata, 'fmSetPresa', 'fmPresaCampo', f.fase_id)}</span>
      ${alt.length ? `<span class="alt">anche ${escapeHtml(alt.map(x => x.nome + (Number(x.fattori?.[f.fase_id] ?? 1) !== 1 ? ' (' + fmtF(Number(x.fattori[f.fase_id])) + ')' : '')).join(', '))}</span>` : '<span class="unica" title="Nessun\'altra macchina fa questa fase">unica</span>'}
      <button class="fs-chip-x" aria-label="Togli ${escapeHtml(fmFaseNome(f.fase_id))}" onclick="fmTogliFase(${f.fase_id})">×</button></span>`;
  };
  const extra = FM.extra[d.id] || [];
  const manut = (d.manutenzioni || []).filter(x => x.data_fine >= fmDataIso(new Date(new Date(oggi + 'T12:00:00').getTime() - 30 * 86400000))).sort((a, b) => a.data_inizio.localeCompare(b.data_inizio));
  const dataIt = s => new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const opsDisp = operatoriCache.filter(o => o.ruolo === 'operatore' && o.attivo && !d.comp.includes(o.id));
  const nomeOp = id => { const o = operatoriCache.find(x => x.id === id); return o ? `${o.nome} ${o.cognome}` : ''; };
  const eliminaBox = nuova ? '' : (FM.confermaElimina
    ? `<div class="fs-guard" role="alert" style="margin:0"><span>Eliminare «${escapeHtml(d.nome)}»? Non si può annullare.</span><button class="fs-btn-danger-ghost" onclick="fmElimina()">Elimina</button><button class="fs-btn-ghost" onclick="FM.confermaElimina=false;fmRenderDettaglio()">Annulla</button></div>`
    : `<span class="fs-desc" style="margin:0">Si può eliminare solo se nessun ordine aperto la usa; altrimenti mettila Fuori uso.</span><button class="fs-btn-danger-ghost" onclick="FM.confermaElimina=true;fmRenderDettaglio()">Elimina macchina</button>`);

  document.getElementById('fm-dettaglio').innerHTML = `
    <div class="fs-det-hdr">
      <div class="fs-det-hdr-row">
        <div class="fs-det-title"><button class="fs-btn-ghost fs-back" onclick="fmTornaElenco()">← Macchine</button><span class="fm-dot ${fmDotClass(m)}" style="align-self:center"></span><h2>${escapeHtml(d.nome || (nuova ? 'Nuova macchina' : 'Senza nome'))}</h2></div>
        <div class="fs-hdr-actions">
          <span class="fs-stato-mod" id="fm-stato-mod" ${sporca ? '' : 'hidden'}>Modifiche non salvate</span>
          <button class="btn btn-secondary" data-fm-salva onclick="fmAnnulla()" ${sporca ? '' : 'disabled'}>Annulla</button>
          <button class="btn btn-primary" data-fm-salva onclick="fmSalva()" ${sporca && !FM.salvando ? '' : 'disabled'}>Salva</button>
        </div>
      </div>
      <div class="fs-det-sub">${escapeHtml(Etichette.statoMacchina(d.stato))}${fmInManutOggi(m) ? ' · manutenzione programmata oggi' : ''} · ${d.fasi.length} ${d.fasi.length === 1 ? 'fase' : 'fasi'}${extra.length ? ' · ' + extra.length + (extra.length === 1 ? ' fase extra' : ' fasi extra') : ''}</div>
      ${guard}
    </div>
    ${avvisi ? `<div class="fs-avvisi">${avvisi}</div>` : ''}

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Stato</h3><span class="hint">Il cambio vale subito per il piano di oggi</span></div>
      <div class="fs-card"><div class="fs-row">
        <div class="fs-seg" style="flex-wrap:wrap">${Etichette.statiMacchina().map(([k, t]) => `<button class="${d.stato === k ? 'on' : ''}" onclick="fmSet('stato','${k}')">${escapeHtml(t)}</button>`).join('')}</div>
        <div class="fs-desc">"In manutenzione" e "Fuori uso" hanno lo stesso effetto: la macchina non viene usata finché non torna Attiva. Per un fermo con date precise usa le Manutenzioni programmate qui sotto: alla fine torna disponibile da sola.</div>
      </div></div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Capacità</h3><span class="hint">Quante ore al giorno il piano può caricarla</span></div>
      <div class="fs-card"><div class="fs-row fs-two">
        <div><span class="fs-lbl">Ore al giorno</span>
          <div class="fs-seg"><button class="${d.ore === null ? 'on' : ''}" onclick="fmSetOreModo('orario')">Come l'orario</button><button class="${d.ore !== null ? 'on' : ''}" onclick="fmSetOreModo('fisse')">Ore fisse</button></div>
          ${d.ore !== null ? `<div class="fs-add" style="margin-top:10px"><input class="fs-inp num" id="fm-g-ore" type="number" min="0.5" max="24" step="0.5" value="${d.ore}" oninput="fmSetOre(this.value)" aria-label="Ore al giorno"><span class="fs-desc" style="margin:0">ore</span></div>` : ''}
          <div class="fs-desc">${d.ore === null ? `Segue l'orario di lavoro: oggi ${fmFmtOre(fmOreOrario())} h.` : 'Utile se la macchina lavora meno del turno (es. una macchina che deve scaldare).'}</div></div>
        <div><span class="fs-lbl">In lista oggi</span>
          ${nuova ? '<div class="fs-desc" style="margin:0">Dopo il salvataggio.</div>' : ok ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>${pm ? fmFmtMin(pm) : 'Niente'}</span><span class="fs-desc" style="margin:0">su ${fmFmtOre(fmOreOggi(m))} h</span></div>
          <span class="fm-barra grande"><span style="width:${Math.min(100, pm / cap * 100)}%"></span></span>
          <div class="fs-desc">Somma dei tempi di occupazione delle voci di oggi assegnate a questa macchina.</div>` : '<div class="fs-desc" style="margin:0">Ferma: oggi il piano non le assegna lavoro.</div>'}</div>
      </div></div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Fasi che la usano</h3><span class="hint">Se una fase ha più macchine, il piano usa prima la più veloce</span></div>
      <div class="fs-card"><div class="fs-row">
        <div class="fs-chips">${d.fasi.length ? d.fasi.map(chipFase).join('') : '<span class="fs-desc" style="margin:0">Nessuna fase.</span>'}</div>
        <div class="fs-add" style="margin-top:10px"><select class="fs-inp" id="fm-add-fase" onchange="fmAggiungiFase(this.value)"><option value="">+ Aggiungi fase…</option>${aggiungibili.map(f => `<option value="${f.id}">${fmFaseNum(f.id)}. ${escapeHtml(f.nome)}</option>`).join('')}</select></div>
        <div class="fs-desc">Il tempo macchina dice quanto questa macchina resta occupata rispetto al tempo di riferimento della fase (es. una macchina più lenta: tempo ×2); la squadra conta sempre il tempo di riferimento. Il piano sceglie prima la macchina dove la fase è più veloce e passa all'altra solo se la prima è piena o ferma. «Unica» vuol dire che nessun'altra macchina fa quella fase: se questa si ferma, la fase si blocca. È lo stesso dato del blocco Macchine nella sezione Fasi.</div>
      </div>
      ${extra.length ? `<div class="fs-row"><span class="fs-lbl">Fasi extra</span><div class="fs-chips">${extra.map(x => `<span class="fs-chip">${escapeHtml(x)}</span>`).join('')}</div><div class="fs-desc">Si cambiano nella sezione Fasi extra.</div></div>` : ''}
      </div>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Manutenzioni programmate</h3><span class="hint">Si salvano subito</span></div>
      <div class="fs-card">${nuova ? '<div class="fs-row"><span class="fs-desc" style="margin:0">Salva la macchina per aggiungere le manutenzioni.</span></div>' : `
        <div class="fs-row">${manut.length ? manut.map(x => `<div class="fm-manut ${x.data_fine < oggi ? 'passata' : ''}"><span class="d">${dataIt(x.data_inizio)}</span><span class="d al">→ ${dataIt(x.data_fine)}</span><span>${escapeHtml(x.descrizione || '—')}${x.data_inizio <= oggi && oggi <= x.data_fine ? ' <span class="fs-tag fm-tag-man">in corso</span>' : ''}</span><button class="fs-mini" aria-label="Elimina" onclick="fmTogliManut('${escapeJsAttr(x.id)}')">×</button></div>`).join('') : '<span class="fs-desc" style="margin:0">Nessuna manutenzione programmata.</span>'}</div>
        <div class="fs-row">
          <div class="fs-chips" style="margin-bottom:10px"><button class="fs-chip" onclick="fmManutRapida('oggi')">Oggi</button><button class="fs-chip" onclick="fmManutRapida('domani')">Domani</button><button class="fs-chip" onclick="fmManutRapida('settimana')">Settimana prossima</button></div>
          <div class="fm-date-row">
            <div><label class="fs-lbl" for="fm-mn-dal">Dal</label><input class="fs-inp" style="width:auto" type="date" id="fm-mn-dal"></div>
            <div><label class="fs-lbl" for="fm-mn-al">Al</label><input class="fs-inp" style="width:auto" type="date" id="fm-mn-al"></div>
            <div style="flex:1;min-width:160px"><label class="fs-lbl" for="fm-mn-desc">Descrizione</label><input class="fs-inp" id="fm-mn-desc" placeholder="Facoltativa, es. cambio cinghie"></div>
            <button class="btn btn-primary" onclick="fmAggiungiManut()">+ Aggiungi</button>
          </div>
          <div class="fs-desc">Nei giorni indicati la macchina non entra nel piano; finita la manutenzione torna disponibile senza toccare lo stato.</div>
        </div>`}
      </div>
    </div>

    <div class="fs-blocco">
      <details class="fs-card" ${FM.compAperto ? 'open' : ''} ontoggle="FM.compAperto=this.open">
        <summary><span><span class="fs-crit-t">Chi la sa usare</span> <span class="fs-desc" style="display:inline;margin-left:6px">${d.comp.length ? escapeHtml(d.comp.map(nomeOp).filter(Boolean).join(', ')) : 'tutti'}</span></span><span class="fs-desc" style="margin:0">${FM.compAperto ? 'nascondi' : 'mostra'}</span></summary>
        <div class="fs-row">
          <div class="fs-ops">${d.comp.length ? d.comp.map((id, k) => `<div class="fs-op"><span class="i">${k + 1}.</span><span class="nm">${escapeHtml(nomeOp(id))}</span>
            <button class="fs-mini" onclick="fmCompSposta(${k},-1)" ${k === 0 ? 'disabled' : ''} aria-label="Su">▲</button><button class="fs-mini" onclick="fmCompSposta(${k},1)" ${k === d.comp.length - 1 ? 'disabled' : ''} aria-label="Giù">▼</button><button class="fs-mini" onclick="fmCompTogli(${k})" aria-label="Togli">×</button></div>`).join('') : '<span class="fs-desc" style="margin:0">Nessuno indicato: vanno bene tutti.</span>'}</div>
          <div class="fs-add" style="margin-top:10px"><select class="fs-inp" id="fm-add-op" onchange="fmCompAggiungi(this.value)"><option value="">+ Aggiungi operatore…</option>${opsDisp.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</option>`).join('')}</select></div>
        </div>
      </details>
    </div>

    <div class="fs-blocco">
      <div class="fs-blocco-h"><h3>Generale</h3></div>
      <div class="fs-card"><div class="fs-row"><label class="fs-lbl" for="fm-g-nome">Nome</label><input class="fs-inp" id="fm-g-nome" value="${escapeHtml(d.nome)}" placeholder="es. Pressa a caldo" oninput="fmSetNome(this.value)"></div></div>
    </div>

    ${eliminaBox ? `<div class="fs-blocco" style="display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-wrap:wrap">${eliminaBox}</div>` : ''}`;
}
