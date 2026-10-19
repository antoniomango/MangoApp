// responsabile.html — lati dell'anta, lavorazioni CNC, form lati e lavorazioni dell'ordine, anteprima CNC.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// LATI DELL'ANTA (etichette configurabili) e CATALOGO LAVORAZIONI CNC
// Tabelle lati_anta / lavorazioni_cnc / lavorazioni_cnc_tipi_prodotto: lettura solo responsabile, scritture solo via RPC con registro.
// Stato in memoria (aggiornato a ogni onchange): i salvataggi non rileggono mai il DOM.
// ═══════════════════════════════════════════════
let latiConfig = [];
let lavorazioniCnc = [];
let lavBozze = {};          // id (o 'nuova') -> campi modificati non ancora salvati

async function loadLatiConfig() {
  const { data, error } = await sb.from('lati_anta').select('codice, etichetta, posizione, attivo').order('posizione').order('codice');
  if (error) console.warn('loadLatiConfig:', error.message);
  latiConfig = (data || []).map(l => ({ ...l, _etichetta: l.etichetta }));
  sincronizzaEtichette();
}

function renderLatiConfig() {
  const el = document.getElementById('lati-config-body');
  if (!el) return;
  el.innerHTML = latiConfig.map((l, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <span style="font-size:11px;color:var(--muted);font-family:monospace;min-width:70px" title="Codice interno: non modificabile">${escapeHtml(l.codice)}</span>
      <input type="text" value="${escapeHtml(l._etichetta)}" maxlength="60" aria-label="Etichetta del lato" oninput="latiConfig[${i}]._etichetta=this.value"
        style="flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-ctl);font-size:13px;background:var(--bg);color:var(--ink)">
      <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="salvaLatoEtichetta(${i})"><i data-ic="salva"></i> Salva etichetta</button>
    </div>`).join('') || '<div class="empty-state"><p>Nessun lato configurato</p></div>';
}

async function salvaLatoEtichetta(i) {
  const l = latiConfig[i]; if (!l) return;
  const { data, error } = await sb.rpc('salva_lato_anta', { p_codice: l.codice, p_etichetta: l._etichetta, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadLatiConfig(); renderLatiConfig();
  toast('Etichetta salvata', 'ok');
}

async function loadLavorazioniCnc() {
  const [{ data, error }, { data: tp }] = await Promise.all([
    sb.from('lavorazioni_cnc').select('id, nome, posizione, attivo, ambito, minuti_min, minuti_max, storica').order('posizione').order('nome'),
    sb.from('lavorazioni_cnc_tipi_prodotto').select('lavorazione_id, tipo_prodotto_id'),
  ]);
  if (error) { console.warn('loadLavorazioniCnc:', error.message); lavorazioniCnc = []; return; }
  lavorazioniCnc = (data || []).map(l => ({ ...l, tipi: (tp || []).filter(r => r.lavorazione_id === l.id).map(r => r.tipo_prodotto_id) }));
}

function lavorazioneCncNome(id) {
  if (!id) return null;
  return lavorazioniCnc.find(l => l.id === id)?.nome || null;
}

const AMBITO_LAV_LABEL = { anta: 'Anta intera', lato: 'Per lato' };
const lavVal = (id, campo) => { const b = lavBozze[id]; if (b && campo in b) return b[campo]; if (id === 'nuova') return ({ nome: '', ambito: 'anta', minuti_min: '', minuti_max: '', attivo: true, tipi: [] })[campo]; return lavorazioniCnc.find(l => l.id === id)?.[campo]; };
function lavSet(id, campo, valore, rerender) {
  (lavBozze[id] = lavBozze[id] || {})[campo] = valore;
  if (rerender) renderLavorazioniCncConfig();
}
function lavToggleTipo(id, tipo, on) {
  const cur = [...(lavVal(id, 'tipi') || [])];
  const i = cur.indexOf(tipo);
  if (on && i < 0) cur.push(tipo);
  if (!on && i >= 0) cur.splice(i, 1);
  lavSet(id, 'tipi', cur, false);
}

function lavSchedaHtml(id) {
  const k = escapeJsAttr(id);
  const nuova = id === 'nuova';
  const tipi = lavVal(id, 'tipi') || [];
  const num = campo => `<input type="number" min="0" step="any" value="${escapeHtml(lavVal(id, campo) ?? '')}" oninput="lavSet('${k}','${campo}',this.value,false)" style="width:90px;padding:6px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-ctl);font-size:13px;background:var(--bg);color:var(--ink)">`;
  return `<div class="card" style="padding:14px 16px;margin-bottom:10px;${!nuova && !lavVal(id, 'attivo') ? 'opacity:.7' : ''}">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${nuova ? '' : `<div style="display:flex;flex-direction:column;gap:2px">
        <button class="fase-move-btn" onclick="spostaLavorazioneCnc('${k}',-1)" aria-label="Sposta su">▲</button>
        <button class="fase-move-btn" onclick="spostaLavorazioneCnc('${k}',1)" aria-label="Sposta giù">▼</button></div>`}
      <input type="text" value="${escapeHtml(lavVal(id, 'nome') || '')}" maxlength="80" placeholder="Nome (es. Squadratura)" oninput="lavSet('${k}','nome',this.value,false)"
        style="flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-ctl);font-size:13px;background:var(--bg);color:var(--ink)">
      <select onchange="lavSet('${k}','ambito',this.value,false)" aria-label="Ambito" style="padding:7px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-ctl);font-size:13px;background:var(--bg);color:var(--ink)">
        ${Object.entries(AMBITO_LAV_LABEL).map(([v, t]) => `<option value="${v}" ${lavVal(id, 'ambito') === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--muted)">
      <label>Minimo (min) ${num('minuti_min')}</label><label>Massimo (min) ${num('minuti_max')}</label>
      <span>Minuti per 1 pezzo; per le lavorazioni "Per lato" sono i minuti di UN lato.</span>
    </div>
    <div style="margin-top:10px"><div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px">Prodotti su cui è applicabile</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${tipiProdotto.map(t => `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer"><input type="checkbox" ${tipi.includes(t.id) ? 'checked' : ''} onchange="lavToggleTipo('${k}','${escapeJsAttr(t.id)}',this.checked)"> ${escapeHtml(t.label)}</label>`).join('') || '<span style="font-size:12px;color:var(--muted)">Nessun tipo prodotto configurato</span>'}</div></div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" ${lavVal(id, 'attivo') ? 'checked' : ''} onchange="lavSet('${k}','attivo',this.checked,false)"> Attiva</label>
      <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" onclick="salvaLavorazioneCnc('${k}')">${nuova ? '+ Aggiungi' : 'Salva'}</button>
      ${nuova ? '' : `<button class="btn btn-danger" style="padding:6px 10px;font-size:12px" onclick="eliminaLavorazioneCnc('${k}')" aria-label="Elimina"><i data-ic="cestino"></i></button>`}
    </div></div>`;
}

function renderLavorazioniCncConfig() {
  const el = document.getElementById('lavorazioni-cnc-body');
  if (!el) return;
  const correnti = lavorazioniCnc.filter(l => !l.storica);
  const storiche = lavorazioniCnc.filter(l => l.storica);
  el.innerHTML = lavSchedaHtml('nuova')
    + (correnti.length ? correnti.map(l => lavSchedaHtml(l.id)).join('') : '<div class="empty-state"><p>Nessuna lavorazione nel catalogo: creane una sopra.</p></div>')
    + (storiche.length ? `<details style="margin-top:16px"><summary style="cursor:pointer;font-size:13px;font-weight:600">Voci storiche (${storiche.length}) — sola lettura</summary>
        <div style="margin:8px 0;font-size:12px;color:var(--muted)">Lavorazioni combinate usate dagli ordini precedenti: restano collegate a quegli ordini ma non sono selezionabili per i nuovi.</div>
        ${storiche.map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">${escapeHtml(l.nome)}</div>`).join('')}</details>` : '');
}

const ERRORI_LAV = { nome_duplicato: 'Esiste già una lavorazione con questo nome', nome_obbligatorio: 'Inserisci il nome', minuti_non_validi: 'Minimo e massimo devono essere numeri ≥ 0',
  minimo_maggiore_del_massimo: 'Il minimo non può superare il massimo', ambito_non_modificabile_in_uso: 'L\'ambito non si cambia: la lavorazione è già usata da ordini', lavorazione_storica: 'Voce storica: sola lettura' };

async function salvaLavorazioneCnc(id) {
  const nuova = id === 'nuova';
  const dati = { nome: lavVal(id, 'nome'), ambito: lavVal(id, 'ambito'), minuti_min: lavVal(id, 'minuti_min'), minuti_max: lavVal(id, 'minuti_max'), attivo: !!lavVal(id, 'attivo'), tipi_prodotto: lavVal(id, 'tipi') || [] };
  if (!String(dati.nome || '').trim()) { toast('Inserisci il nome della lavorazione', 'err'); return; }
  if (dati.minuti_min === '' || dati.minuti_max === '' || dati.minuti_min == null || dati.minuti_max == null) { toast('Indica minimo e massimo', 'err'); return; }
  const { data, error } = await sb.rpc('salva_lavorazione_cnc', { p_id: nuova ? null : id, p_dati: dati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (ERRORI_LAV[data?.errore] || data?.errore || error?.message || ''), 'err'); return; }
  delete lavBozze[id];
  await loadLavorazioniCnc(); renderLavorazioniCncConfig();
  toast(nuova ? 'Lavorazione aggiunta' : 'Lavorazione salvata', 'ok');
}

async function spostaLavorazioneCnc(id, dir) {
  const correnti = lavorazioniCnc.filter(l => !l.storica);
  const i = correnti.findIndex(l => l.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= correnti.length) return;
  [correnti[i], correnti[j]] = [correnti[j], correnti[i]];
  const ids = [...correnti.map(l => l.id), ...lavorazioniCnc.filter(l => l.storica).map(l => l.id)];
  const { data, error: err } = await sb.rpc('riordina_config', { p_tabella: 'lavorazioni_cnc', p_ids_in_ordine: ids, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (err || !data?.ok) { toast('Errore: ' + (data?.errore || err?.message || ''), 'err'); return; }
  await loadLavorazioniCnc(); renderLavorazioniCncConfig();
}

async function eliminaLavorazioneCnc(id) {
  const l = lavorazioniCnc.find(x => x.id === id); if (!l) return;
  if (!confirm(`Eliminare la lavorazione "${l.nome}"?\nSe è già usata da ordini viene solo disattivata.`)) return;
  const { data, error } = await sb.rpc('elimina_lavorazione_cnc', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (ERRORI_LAV[data?.errore] || data?.errore || error?.message || ''), 'err'); return; }
  delete lavBozze[id];
  await loadLavorazioniCnc(); renderLavorazioniCncConfig();
  toast(data.esito === 'disattivata' ? 'Lavorazione in uso: disattivata' : 'Lavorazione eliminata', 'ok');
}

// ═══════════════════════════════════════════════
// ORDINE: attributi per lato + lavorazioni CNC (form nuovo ordine "ord" e modifica ordine "mod")
// Stato sempre in memoria (ordFormStato), mai riletto dal DOM al click di salvataggio.
// ═══════════════════════════════════════════════
const ordFormStato = { ord: { lati: {}, lav: [], ordineId: null }, mod: { lati: {}, lav: [], ordineId: null } };
const _antTimer = {}, _antSeq = {};

function latiAttiviCfg() { return latiConfig.filter(l => l.attivo); }
function attributiLatoCfg() { return attributiConfig.filter(a => a.ambito === 'lato' && a.attivo); }

// Valori iniziali: ordine nuovo = prima opzione attiva degli attributi per lato obbligatori (come faceva il menu Materiale); modifica = valori dell'ordine
function inizializzaLatiForm(prefix, ordine) {
  const st = ordFormStato[prefix]; st.lati = {};
  latiAttiviCfg().forEach(l => {
    st.lati[l.codice] = {};
    attributiLatoCfg().forEach(a => {
      let v = '';
      if (ordine) {
        const r = (ordine.attributi_lato || []).find(x => x.lato === l.codice && x.chiave === a.chiave);
        v = r ? r.valore : (!(ordine.attributi_lato || []).some(x => x.chiave === a.chiave) && a.su_colonna && ordine[a.chiave]) || '';
      } else if (a.obbligatorio) {
        v = a.tipo === 'numero' ? (a.numero_default ?? '') : ((a.opzioni || []).filter(o => o.attivo !== false).sort((x, y) => (x.posizione || 0) - (y.posizione || 0))[0]?.valore || '');
      } else if (a.tipo === 'numero') v = a.numero_default ?? '';
      st.lati[l.codice][a.chiave] = v;
    });
  });
}

function renderLatiForm(prefix) {
  const el = document.getElementById(prefix + '-attributi-lato');
  if (!el) return;
  const st = ordFormStato[prefix];
  const lati = latiAttiviCfg();
  el.innerHTML = attributiLatoCfg().map(a => `<div class="form-row">${lati.map(l => {
    const cur = st.lati[l.codice]?.[a.chiave] ?? '';
    const k = `'${prefix}','${escapeJsAttr(l.codice)}','${escapeJsAttr(a.chiave)}'`;
    const etic = `${escapeHtml(l.etichetta)}: ${escapeHtml(a.etichetta)}${a.obbligatorio ? ' *' : ''}`;
    if (a.tipo === 'numero') return `<div class="form-group"><label>${etic}</label><input type="number" min="${a.numero_min}" max="${a.numero_max}" step="1" value="${escapeHtml(cur)}" oninput="latoSet(${k},this.value)"></div>`;
    const opz = (a.opzioni || []).filter(o => o.attivo !== false || o.valore === cur).sort((x, y) => (x.posizione || 0) - (y.posizione || 0));
    return `<div class="form-group"><label>${etic}</label><select onchange="latoSet(${k},this.value)">${a.obbligatorio ? '' : '<option value="">—</option>'}${opz.map(o => `<option value="${escapeHtml(o.valore)}" ${o.valore === cur ? 'selected' : ''}>${escapeHtml(o.etichetta)}${o.attivo === false ? ' (non più disponibile)' : ''}</option>`).join('')}</select></div>`;
  }).join('')}</div>`).join('');
}

function latoSet(prefix, lato, chiave, valore) {
  (ordFormStato[prefix].lati[lato] = ordFormStato[prefix].lati[lato] || {})[chiave] = valore;
  anteprimaCnc(prefix);
}

function tipoProdottoForm(prefix) { return document.getElementById(prefix + '-tipo-prodotto')?.value || null; }

// Lavorazioni scegliibili: attive, non storiche, applicabili al tipo prodotto; la voce già scelta resta visibile (segnalata se non più valida)
function lavorazioniScegliibili(prefix, rigaIdx) {
  const tipo = tipoProdottoForm(prefix);
  const st = ordFormStato[prefix];
  const usate = st.lav.map((r, i) => i === rigaIdx ? null : r.lavorazione_id);
  const corrente = st.lav[rigaIdx]?.lavorazione_id;
  return lavorazioniCnc.filter(l => !usate.includes(l.id) && (l.id === corrente || (!l.storica && l.attivo && l.tipi.includes(tipo))));
}
const lavValida = (prefix, r) => { const l = lavorazioniCnc.find(x => x.id === r.lavorazione_id); return !!l && !l.storica && l.attivo && l.tipi.includes(tipoProdottoForm(prefix)); };

function renderLavorazioniForm(prefix) {
  const el = document.getElementById(prefix + '-lavorazioni');
  if (!el) return;
  const st = ordFormStato[prefix];
  const lati = latiAttiviCfg();
  const nonValide = [];
  const righe = st.lav.map((r, i) => {
    const l = lavorazioniCnc.find(x => x.id === r.lavorazione_id);
    const valida = !r.lavorazione_id || lavValida(prefix, r);
    if (!valida) nonValide.push(l?.nome || '?');
    let latoSel = '';
    if (l && l.ambito === 'lato') {
      const sel = !r.lati || !r.lati.length ? '' : (r.lati.length === lati.length && lati.length > 1 ? '__tutti__' : r.lati[0]);
      latoSel = `<select onchange="lavRigaLati(${i},'${prefix}',this.value)" aria-label="Lato">
        <option value="" ${sel === '' ? 'selected' : ''} disabled>Scegli il lato…</option>
        ${lati.map(x => `<option value="${escapeHtml(x.codice)}" ${sel === x.codice ? 'selected' : ''}>${escapeHtml(x.etichetta)}</option>`).join('')}
        ${lati.length > 1 ? `<option value="__tutti__" ${sel === '__tutti__' ? 'selected' : ''}>Entrambi i lati</option>` : ''}</select>`;
    }
    return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;${valida ? '' : 'border-left:3px solid var(--alert);padding-left:6px'}">
      <select onchange="lavRigaScelta(${i},'${prefix}',this.value)" aria-label="Lavorazione CNC" style="flex:1;min-width:180px">
        <option value="" ${r.lavorazione_id ? '' : 'selected'} disabled>Scegli la lavorazione…</option>
        ${lavorazioniScegliibili(prefix, i).map(x => `<option value="${escapeHtml(x.id)}" ${x.id === r.lavorazione_id ? 'selected' : ''}>${escapeHtml(x.nome)} (${escapeHtml(AMBITO_LAV_LABEL[x.ambito])})${x.storica ? ' — storica' : (!x.attivo ? ' — disattivata' : '')}</option>`).join('')}
      </select>
      ${latoSel}
      <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="lavRigaRimuovi(${i},'${prefix}')" aria-label="Rimuovi lavorazione">✕</button>
      ${valida ? '' : '<span style="font-size:11px;color:var(--alert);flex-basis:100%">Non più valida per questo tipo di prodotto: rimuovila o cambia tipo</span>'}
    </div>`;
  }).join('');
  const disponibili = lavorazioniCnc.filter(l => !l.storica && l.attivo && l.tipi.includes(tipoProdottoForm(prefix)) && !st.lav.some(r => r.lavorazione_id === l.id)).length;
  el.innerHTML = `<label style="font-weight:600;font-size:13px">Lavorazioni CNC</label>
    ${righe || '<div style="font-size:12px;color:var(--muted);margin:4px 0 8px">Nessuna lavorazione indicata.</div>'}
    <button type="button" class="btn btn-secondary" style="padding:4px 12px;font-size:12px" ${disponibili ? '' : 'disabled'} onclick="lavRigaAggiungi('${prefix}')">+ Aggiungi lavorazione</button>
    ${disponibili ? '' : '<span style="font-size:11px;color:var(--muted);margin-left:8px">Nessuna lavorazione disponibile per questo tipo di prodotto</span>'}`;
  return nonValide;
}

function lavRigaAggiungi(prefix) { ordFormStato[prefix].lav.push({ lavorazione_id: '', lati: null }); renderLavorazioniForm(prefix); }
function lavRigaRimuovi(i, prefix) { ordFormStato[prefix].lav.splice(i, 1); renderLavorazioniForm(prefix); anteprimaCnc(prefix); }
function lavRigaScelta(i, prefix, id) {
  const r = ordFormStato[prefix].lav[i]; r.lavorazione_id = id;
  const l = lavorazioniCnc.find(x => x.id === id);
  r.lati = l && l.ambito === 'lato' ? [] : null;
  renderLavorazioniForm(prefix); anteprimaCnc(prefix);
}
function lavRigaLati(i, prefix, v) {
  ordFormStato[prefix].lav[i].lati = v === '__tutti__' ? latiAttiviCfg().map(l => l.codice) : [v];
  renderLavorazioniForm(prefix); anteprimaCnc(prefix);
}

// Cambio tipo prodotto: la lista delle lavorazioni si aggiorna; quelle già scelte e non più valide vengono segnalate
function tipoProdottoOrdineCambiato(prefix) {
  const nonValide = renderLavorazioniForm(prefix);
  if (nonValide.length) toast('Attenzione: per questo tipo di prodotto non sono più valide: ' + nonValide.join(', '), 'err');
  anteprimaCnc(prefix);
}

function inizializzaFormLatiLavorazioni(prefix, ordine) {
  const st = ordFormStato[prefix];
  st.ordineId = ordine?.id || null;
  st.lav = (ordine?.lavorazioni_cnc || []).map(l => ({ lavorazione_id: l.lavorazione_id, lati: l.lati ? [...l.lati] : null }));
  inizializzaLatiForm(prefix, ordine);
  renderLatiForm(prefix);
  renderLavorazioniForm(prefix);
  const box = document.getElementById(prefix + '-anteprima-cnc'); if (box) box.innerHTML = '';
  anteprimaCnc(prefix);
}

// Payload completo "lati + lavorazioni" per crea_ordine / modifica_ordine
function datiLatiLavorazioni(prefix) {
  const st = ordFormStato[prefix];
  const attributi_lato = {};
  Object.entries(st.lati).forEach(([lato, vals]) => {
    attributi_lato[lato] = {};
    Object.entries(vals).forEach(([k, v]) => {
      const a = attributiConfig.find(x => x.chiave === k);
      attributi_lato[lato][k] = v === '' ? null : (a?.tipo === 'numero' ? Number(v) : v);
    });
  });
  const lavorazioni_cnc = st.lav.filter(r => r.lavorazione_id).map(r => ({ lavorazione_id: r.lavorazione_id, lati: r.lati }));
  return { attributi_lato, lavorazioni_cnc };
}

// Anteprima dei tempi di riferimento: sempre calcolata dal server (anteprima_tempi_ordine, nessuna scrittura)
function anteprimaCnc(prefix) {
  clearTimeout(_antTimer[prefix]);
  _antTimer[prefix] = setTimeout(() => eseguiAnteprimaCnc(prefix), 350);
}
async function eseguiAnteprimaCnc(prefix) {
  const box = document.getElementById(prefix + '-anteprima-cnc');
  if (!box) return;
  const seq = _antSeq[prefix] = (_antSeq[prefix] || 0) + 1;
  const st = ordFormStato[prefix];
  const struttura = document.getElementById(prefix + '-struttura')?.value;
  const dati = { ...datiLatiLavorazioni(prefix), tipo_prodotto: tipoProdottoForm(prefix), struttura,
    quantita: parseInt(document.getElementById(prefix + '-quantita')?.value) || 1,
    priorita: document.getElementById(prefix + '-prio')?.value };
  const custom = leggiAttributiCustom(prefix + '-attributi-custom');
  dati.attributi = custom;
  const { data } = await sb.rpc('anteprima_tempi_ordine', { p_dati: dati, p_ordine_id: st.ordineId, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (seq !== _antSeq[prefix]) return;   // risposta superata da una richiesta più recente
  if (!data?.ok) { box.innerHTML = `<div style="font-size:12px;color:var(--muted)">Tempo stimato non disponibile: ${escapeHtml(messaggioAttributo(data?.errore) || data?.errore || 'dati incompleti')}</div>`; return; }
  const fm = n => (Math.round(Number(n) * 10) / 10).toString().replace('.', ',');
  const righe = (data.fasi || []).filter(f => f.tempo_da_lavorazioni_cnc || f.ambito_tempo === 'lato').map(f => {
    const d = f.dettaglio || {};
    const voci = (d.voci || []).map(v => `${escapeHtml(v.nome)}${v.ambito === 'lato' ? ' — ' + escapeHtml((v.lati_etichette || []).join(' + ')) : ''}: ${fm(v.minuti_min)}–${fm(v.minuti_max)} min`).join(' · ');
    const nota = d.tipo === 'per_lato' ? `${d.n_lati} ${d.n_lati === 1 ? 'lato' : 'lati'} × ${fm(d.minuti_tipici_unitari)}–${fm(d.minuti_max_unitari)} min` : '';
    return `<div style="margin-top:3px"><b>${escapeHtml(f.fase_nome)}</b>: ${fm(f.minuti_tipici)}–${fm(f.minuti_max)} min${(d.quantita || 1) > 1 ? ` (quantità ${d.quantita})` : ''}${f.da_confermare ? ' <em>(da confermare)</em>' : ''}
      ${voci || nota ? `<div style="color:var(--muted)">${voci || nota}</div>` : ''}</div>`;
  }).join('');
  box.innerHTML = righe ? `<div style="font-size:12px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);margin:6px 0"><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Tempo stimato (calcolato dal server)</div>${righe}</div>` : '';
}

// Dettagli lati + lavorazioni degli ordini (lazy, a blocchi): gli ordini restano oggetti della cache
async function arricchisciOrdini(arr) {
  const da = (arr || []).filter(o => o && !o._extra && o.tipo !== 'extra');
  for (let i = 0; i < da.length; i += 400) {
    const blocco = da.slice(i, i + 400);
    const { data } = await sb.rpc('dettagli_lati_lavorazioni_ordini', { p_ordine_ids: blocco.map(o => o.id), p_responsabile_id: currentUserRow.id, p_session_token: null });
    if (!data?.ok) { console.warn('arricchisciOrdini:', data?.errore); continue; }
    blocco.forEach(o => { Object.assign(o, data.dati[o.id] || { attributi_lato: [], lavorazioni_cnc: [] }); o._extra = true; });
  }
}

// Campi di dettaglio (scheda ordine): materiale/attributi per lato e lavorazioni CNC con i lati
function latiLavorazioniDettaglioHtml(ordine) {
  const lati = Etichette.valoriLatoOrdine(ordine).map(a => a.valori.map(v =>
    `<div class="detail-field"><label>${escapeHtml(v.lato_etichetta ? v.lato_etichetta + ': ' + a.etichetta : a.etichetta)}</label><span>${escapeHtml(v.testo)}</span></div>`).join('')).join('');
  const lav = Etichette.lavorazioniCncOrdine(ordine, lavorazioneCncNome(ordine.lavorazione_cnc_id));
  return lati + `<div class="detail-field"><label>Lavorazioni CNC</label><span>${lav.length ? lav.map(l => escapeHtml(l.testo)).join('<br>') : '<span style="color:var(--muted)">Non indicate</span>'}</span></div>`;
}
