// responsabile.html — anagrafiche: tipi prodotto, strutture e materiali, priorità, attributi d'ordine.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// TIPI PRODOTTO CRUD
// ═══════════════════════════════════════════════
function renderTipiProdottoConfig() {
  const el = document.getElementById('tipi-prodotto-list');
  if (!tipiProdotto.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:12px 0">Nessun tipo prodotto configurato.</p>';
    return;
  }
  el.innerHTML = tipiProdotto.map(t => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;font-weight:600;flex:1">${escapeHtml(t.label)}</span>
      <span style="font-size:11px;color:var(--muted);font-family:monospace">${escapeHtml(t.id)}</span>
      <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="openModalModificaTipoProdotto('${escapeHtml(t.id)}')">Modifica</button>
      <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="eliminaTipoProdotto('${escapeHtml(t.id)}')" aria-label="Elimina">✕</button>
    </div>
  `).join('');
}

function openModalNuovoTipoProdotto() {
  document.getElementById('modal-tipo-title').textContent = 'Nuovo Tipo Prodotto';
  document.getElementById('ntp-id').value = '';
  document.getElementById('ntp-id').disabled = false;
  document.getElementById('ntp-label').value = '';
  document.getElementById('ntp-edit-id').value = '';
  document.getElementById('modal-nuovo-tipo-prodotto').classList.add('open');
}

function openModalModificaTipoProdotto(id) {
  const t = tipiProdotto.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-tipo-title').textContent = 'Modifica Tipo Prodotto';
  document.getElementById('ntp-id').value = t.id;
  document.getElementById('ntp-id').disabled = true; // ID non modificabile
  document.getElementById('ntp-label').value = t.label;
  document.getElementById('ntp-edit-id').value = t.id;
  document.getElementById('modal-nuovo-tipo-prodotto').classList.add('open');
}

async function confermaTipoProdotto() {
  const editId = document.getElementById('ntp-edit-id').value;
  const id = document.getElementById('ntp-id').value.trim();
  const label = document.getElementById('ntp-label').value.trim();
  if (!label) { toast('Inserisci l\'etichetta', 'err'); return; }

  if (editId) {
    // Modifica
    const { data, error } = await sb.rpc('aggiorna_tipo_prodotto', {
      p_id: editId, p_label: label, p_posizione: tipiProdotto.find(t => t.id === editId)?.posizione ?? 0,
      p_responsabile_id: currentUserRow.id
    });
    if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message), 'err'); return; }
    toast('Tipo prodotto aggiornato', 'ok');
  } else {
    // Nuovo
    if (!id) { toast('Inserisci l\'ID interno', 'err'); return; }
    const posizione = (Math.max(...tipiProdotto.map(t => t.posizione), 0)) + 10;
    const { data, error } = await sb.rpc('aggiungi_tipo_prodotto', {
      p_id: id, p_label: label, p_posizione: posizione, p_responsabile_id: currentUserRow.id
    });
    if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message), 'err'); return; }
    toast('Tipo prodotto aggiunto', 'ok');
  }

  closeModal('modal-nuovo-tipo-prodotto');
  await loadTipiProdotto();
  renderTipiProdottoConfig();
  renderFasiConfig(); // aggiorna select trigger nelle fasi
}

async function eliminaTipoProdotto(id) {
  const t = tipiProdotto.find(x => x.id === id);
  const label = t?.label || id;
  if (!confirm(`Eliminare il tipo prodotto "${label}"?\nLe fasi collegate perderanno il vincolo di tipo.`)) return;
  const { data, error } = await sb.rpc('elimina_tipo_prodotto', {
    p_id: id, p_responsabile_id: currentUserRow.id
  });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message), 'err'); return; }
  toast(`"${label}" eliminato`, 'ok');
  await loadTipiProdotto();
  renderTipiProdottoConfig();
  renderFasiConfig();
}

// ═══════════════════════════════════════════════
// STRUTTURE / MATERIALI (attributi_prodotto_config)
// ═══════════════════════════════════════════════
function renderAttributoConfig(chiave) {
  const elId = chiave === 'struttura' ? 'strutture-config-list' : chiave === 'materiale' ? 'materiali-config-list' : 'attr-opz-' + chiave;
  const el = document.getElementById(elId);
  if (!el) return;
  const attr = attributiConfig.find(a => a.chiave === chiave);
  const opzioni = attr ? [...(attr.opzioni || [])].sort((a,b) => (a.posizione||0)-(b.posizione||0)) : [];
  el.innerHTML = (opzioni.length ? opzioni.map(o => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);${o.attivo === false ? 'opacity:.6' : ''}">
      <input type="text" value="${escapeHtml(o.etichetta)}" aria-label="Etichetta"
             onchange="rinominaOpzioneAttributo('${chiave}','${escapeJsAttr(o.valore)}',this.value)"
             style="flex:1;font-size:13px;font-weight:600;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface)">
      <span style="font-size:11px;color:var(--muted);font-family:monospace" title="Codice interno (non modificabile)">${escapeHtml(o.valore)}</span>
      <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ${o.attivo !== false ? 'checked' : ''}
             onchange="attivaOpzioneAttributo('${chiave}','${escapeJsAttr(o.valore)}',this.checked)"> attiva</label>
      <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="rimuoviOpzioneAttributo('${chiave}','${escapeJsAttr(o.valore)}')" aria-label="Rimuovi">✕</button>
    </div>
  `).join('') : '<p style="color:var(--muted);padding:12px 0">Nessuna opzione.</p>') + `
    <div style="display:flex;gap:8px;margin-top:14px;align-items:flex-end">
      <div class="form-group" style="margin:0;flex:1">
        <label style="font-size:12px">Etichetta della nuova opzione <span style="color:var(--muted);font-weight:400">(il codice interno viene generato e non cambia più)</span></label>
        <input type="text" id="new-opt-etichetta-${chiave}" placeholder="es. Verniciato" style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface)">
      </div>
      <button class="btn btn-primary" style="padding:7px 14px;font-size:13px;white-space:nowrap" onclick="aggiungiOpzioneAttributo('${chiave}')">+ Aggiungi</button>
    </div>`;
}

async function _opzioneAttributoRpc(nome, params, chiave, msgOk) {
  const { data, error } = await sb.rpc(nome, { ...params, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); await loadAttributiConfig(); renderAttributoConfig(chiave); return null; }
  await loadAttributiConfig();
  renderAttributoConfig(chiave);
  if (msgOk) toast(typeof msgOk === 'function' ? msgOk(data) : msgOk, 'ok');
  return data;
}

async function rimuoviOpzioneAttributo(chiave, valore) {
  const o = attributiConfig.find(a => a.chiave === chiave)?.opzioni.find(x => x.valore === valore);
  if (!confirm(`Rimuovere "${o?.etichetta || valore}"?\nSe è già usata da ordini o da criteri di fase viene solo disattivata (non selezionabile per nuovi ordini).`)) return;
  await _opzioneAttributoRpc('elimina_opzione_attributo', { p_chiave: chiave, p_valore: valore }, chiave,
    d => d.esito === 'disattivata' ? 'Opzione in uso: disattivata' : 'Opzione rimossa');
  await loadFasi(); // i criteri delle fasi possono essere cambiati
}

async function rinominaOpzioneAttributo(chiave, valore, etichetta) {
  if (!etichetta.trim()) { toast('L\'etichetta non può essere vuota', 'err'); renderAttributoConfig(chiave); return; }
  await _opzioneAttributoRpc('imposta_opzione_attributo', { p_chiave: chiave, p_valore: valore, p_etichetta: etichetta }, chiave, 'Etichetta aggiornata');
}

async function attivaOpzioneAttributo(chiave, valore, attivo) {
  await _opzioneAttributoRpc('imposta_opzione_attributo', { p_chiave: chiave, p_valore: valore, p_attivo: attivo }, chiave, attivo ? 'Opzione attivata' : 'Opzione disattivata');
}

async function aggiungiOpzioneAttributo(chiave) {
  const etichetta = document.getElementById(`new-opt-etichetta-${chiave}`)?.value.trim();
  if (!etichetta) { toast('Inserisci l\'etichetta', 'err'); return; }
  await _opzioneAttributoRpc('crea_opzione_attributo', { p_chiave: chiave, p_etichetta: etichetta }, chiave, 'Opzione aggiunta');
}

// ═══════════════════════════════════════════════
// PRIORITÀ (priorita_ordine_config)
// ═══════════════════════════════════════════════
let _editPrioritaId = null;

function renderPrioritaConfig() {
  const el = document.getElementById('priorita-config-list');
  if (!el) return;
  el.innerHTML = (!prioritaConfig.length ? '<p style="color:var(--muted);padding:12px 0">Nessuna priorità configurata.</p>' :
    prioritaConfig.map(p => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;${p.attivo ? '' : 'opacity:.6'}">
        <span style="display:flex;flex-direction:column;gap:2px">
          <button class="fase-move-btn" onclick="spostaPriorita('${escapeJsAttr(p.id)}',-1)" aria-label="Sposta su">▲</button>
          <button class="fase-move-btn" onclick="spostaPriorita('${escapeJsAttr(p.id)}',1)" aria-label="Sposta giù">▼</button>
        </span>
        <span style="font-size:13px;font-weight:600;flex:1">${Etichette.badgePriorita(p.id)}</span>
        <span style="font-size:11px;color:var(--muted);font-family:monospace">${escapeHtml(p.id)} · peso ${p.peso}</span>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ${p.attivo ? 'checked' : ''} onchange="attivaPriorita('${escapeJsAttr(p.id)}', this.checked)"> attiva</label>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="openModalPriorita('${escapeHtml(p.id)}')">Modifica</button>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="eliminaPriorita('${escapeJsAttr(p.id)}')" aria-label="Elimina">✕</button>
      </div>
    `).join('')) + `
    <div style="margin-top:14px">
      <button class="btn btn-primary" onclick="openModalPriorita(null)" style="font-size:13px">+ Nuova Priorità</button>
    </div>`;
}

function openModalPriorita(id) {
  _editPrioritaId = id;
  const p = id ? prioritaConfig.find(x => x.id === id) : null;
  document.getElementById('prn-title').textContent = id ? 'Modifica Priorità' : 'Nuova Priorità';
  document.getElementById('prn-id-row').style.display = id ? 'none' : '';
  document.getElementById('prn-id').value = '';
  document.getElementById('prn-etichetta').value = p?.etichetta || '';
  document.getElementById('prn-peso').value = p?.peso ?? 10;
  document.getElementById('prn-colore').innerHTML = Object.entries(Etichette.PALETTE).map(([k, c]) => `<option value="${k}">${escapeHtml(c.etichetta)}</option>`).join('');
  document.getElementById('prn-colore').value = p?.colore || 'neutro';
  document.getElementById('modal-priorita').classList.add('open');
}

async function salvaModalePriorita() {
  const et = document.getElementById('prn-etichetta').value.trim();
  const peso = numeroOLiteral(document.getElementById('prn-peso').value);   // 0 resta 0, vuoto = errore
  const colore = document.getElementById('prn-colore').value;
  if (!et) { toast('Inserisci etichetta', 'err'); return; }
  if (peso === null || peso < 0) { toast('Il peso deve essere un numero (0 o più)', 'err'); return; }
  const nuovo = !_editPrioritaId;
  const id = nuovo ? document.getElementById('prn-id').value.trim().toLowerCase().replace(/\s+/g, '_') : _editPrioritaId;
  if (!id) { toast('Inserisci ID', 'err'); return; }
  const { data, error } = await sb.rpc('salva_priorita', { p_id: id, p_nuovo: nuovo, p_etichetta: et, p_peso: Math.round(peso), p_colore: colore, p_attivo: null, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast(nuovo ? 'Priorità aggiunta' : 'Priorità aggiornata', 'ok');
  closeModal('modal-priorita');
  await loadPrioritaConfig();
  renderPrioritaConfig();
}

async function attivaPriorita(id, attivo) {
  const p = prioritaConfig.find(x => x.id === id); if (!p) return;
  const { data, error } = await sb.rpc('salva_priorita', { p_id: id, p_nuovo: false, p_etichetta: p.etichetta, p_peso: p.peso, p_colore: p.colore, p_attivo: attivo, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast(data?.errore === 'serve_almeno_una_priorita_attiva' ? 'Serve almeno una priorità attiva' : 'Errore: ' + (data?.errore || error?.message || ''), 'err');
  await loadPrioritaConfig(); renderPrioritaConfig();
}

async function eliminaPriorita(id) {
  const p = prioritaConfig.find(x => x.id === id);
  if (!confirm(`Eliminare la priorità "${p?.etichetta || id}"?\nSe è già usata da ordini viene solo disattivata.`)) return;
  const { data, error } = await sb.rpc('elimina_priorita', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(data?.errore === 'serve_almeno_una_priorita_attiva' ? 'Serve almeno una priorità attiva' : 'Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast(data.esito === 'disattivata' ? 'Priorità in uso: disattivata' : 'Priorità eliminata', 'ok');
  await loadPrioritaConfig(); renderPrioritaConfig();
}

async function spostaPriorita(id, dir) {
  const ids = prioritaConfig.map(p => p.id);
  const i = ids.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const { data, error } = await sb.rpc('riordina_config', { p_tabella: 'priorita_ordine_config', p_ids_in_ordine: ids, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast('Errore: ' + (data?.errore || error?.message || ''), 'err');
  await loadPrioritaConfig(); renderPrioritaConfig();
}

// ── Gestione attributi d'ordine (pagina Attributi ordine) ──
function renderAttributiConfig() {
  const el = document.getElementById('attributi-config-body');
  if (!el) return;
  const campoNum = (a, campo, titolo) => `<label style="font-size:11px;color:var(--muted)">${titolo} <input type="number" step="1" value="${a[campo]}" style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:6px" onchange="aggiornaAttributo('${escapeJsAttr(a.chiave)}', { ${campo}: numeroOLiteral(this.value) })"></label>`;
  el.innerHTML = attributiConfig.map(a => `
    <div class="card" style="padding:14px 18px;margin-bottom:12px;max-width:760px;${a.attivo ? '' : 'opacity:.65'}">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <input type="text" value="${escapeHtml(a.etichetta)}" aria-label="Nome" onchange="aggiornaAttributo('${escapeJsAttr(a.chiave)}', { etichetta: this.value })" style="flex:1;min-width:180px;font-weight:600;padding:6px 10px;border:1px solid var(--border);border-radius:8px">
        <span style="font-size:11px;color:var(--muted);font-family:monospace">${escapeHtml(a.chiave)}</span>
        <span style="font-size:11px;background:var(--fill);padding:2px 8px;border-radius:6px">${a.tipo === 'numero' ? 'Numero intero' : 'Scelta'}${a.su_colonna ? ' · di sistema' : ''}${a.ambito === 'lato' ? ' · per lato' : ''}</span>
        ${a.su_colonna ? '' : `
        <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" ${a.obbligatorio ? 'checked' : ''} onchange="aggiornaAttributo('${escapeJsAttr(a.chiave)}', { obbligatorio: this.checked })"> obbligatorio</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:4px"><input type="checkbox" ${a.attivo ? 'checked' : ''} onchange="aggiornaAttributo('${escapeJsAttr(a.chiave)}', { attivo: this.checked })"> attivo</label>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="eliminaAttributo('${escapeJsAttr(a.chiave)}')" aria-label="Elimina">✕</button>`}
      </div>
      ${a.tipo === 'numero' && !a.su_colonna ? `<div style="display:flex;gap:14px;margin-top:10px">${campoNum(a, 'numero_min', 'Minimo')}${campoNum(a, 'numero_max', 'Massimo')}${campoNum(a, 'numero_default', 'Predefinito')}</div>` : ''}
      ${a.tipo === 'select_singola' && !a.su_colonna ? `<div id="attr-opz-${escapeHtml(a.chiave)}" style="margin-top:10px"></div>` : ''}
      ${a.su_colonna ? `<div style="font-size:11px;color:var(--muted);margin-top:6px">Le opzioni si gestiscono nelle pagine ${a.chiave === 'materiale' ? 'Materiali' : 'Strutture'}.</div>` : ''}
    </div>`).join('') || '<p style="color:var(--muted)">Nessun attributo.</p>';
  attributiConfig.filter(a => a.tipo === 'select_singola' && !a.su_colonna).forEach(a => renderAttributoConfig(a.chiave));
}

async function aggiornaAttributo(chiave, dati) {
  const { data, error } = await sb.rpc('salva_attributo', { p_chiave: chiave, p_dati: dati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast('Errore: ' + ({ valori_esistenti_fuori_intervallo: 'Ci sono ordini con valori fuori dal nuovo intervallo', intervallo_non_valido: 'Intervallo non valido' }[data?.errore] || data?.errore || error?.message || ''), 'err');
  else toast('Attributo aggiornato', 'ok');
  await loadAttributiConfig(); renderAttributiConfig(); await loadFasi();
}

async function creaAttributo() {
  const dati = { etichetta: document.getElementById('na-etichetta').value.trim(), tipo: document.getElementById('na-tipo').value, ambito: document.getElementById('na-ambito').value, obbligatorio: document.getElementById('na-obbl').checked };
  if (!dati.etichetta) { toast('Indica il nome dell\'attributo', 'err'); return; }
  if (dati.tipo === 'numero') {
    dati.numero_min = numeroOLiteral(document.getElementById('na-min').value); dati.numero_max = numeroOLiteral(document.getElementById('na-max').value); dati.numero_default = numeroOLiteral(document.getElementById('na-def').value);
    if ([dati.numero_min, dati.numero_max, dati.numero_default].some(v => v === null)) { toast('Indica minimo, massimo e predefinito', 'err'); return; }
  }
  const { data, error } = await sb.rpc('salva_attributo', { p_chiave: null, p_dati: dati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  document.getElementById('na-etichetta').value = '';
  toast('Attributo creato', 'ok');
  await loadAttributiConfig(); renderAttributiConfig(); await loadFasi();
}

async function eliminaAttributo(chiave) {
  const a = attributiConfig.find(x => x.chiave === chiave);
  if (!confirm(`Eliminare l'attributo "${a?.etichetta || chiave}"?\nSe è già usato da ordini, criteri di fase o tempi viene solo disattivato.`)) return;
  const { data, error } = await sb.rpc('elimina_attributo', { p_chiave: chiave, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast(data.esito === 'disattivato' ? 'Attributo in uso: disattivato' : 'Attributo eliminato', 'ok');
  await loadAttributiConfig(); renderAttributiConfig(); await loadFasi();
}

// ── Attributi d'ordine aggiuntivi (configurabili, ordini.attributi) ──
function renderAttributiCustomForm(containerId, valori) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const attrs = attributiConfig.filter(a => !a.su_colonna && (a.attivo || (valori || {})[a.chiave] != null));
  el.innerHTML = attrs.map(a => {
    const v = (valori || {})[a.chiave];
    const req = a.obbligatorio && a.attivo;
    const k = escapeHtml(a.chiave);
    if (a.tipo === 'numero') {
      const val = v ?? a.numero_default ?? '';
      return `<div class="form-group"><label>${escapeHtml(a.etichetta)}${req ? ' *' : ''}</label><input type="number" data-attr="${k}" min="${a.numero_min}" max="${a.numero_max}" step="1" value="${escapeHtml(val)}"></div>`;
    }
    const opz = (a.opzioni || []).filter(o => o.attivo !== false || o.valore === v);
    return `<div class="form-group"><label>${escapeHtml(a.etichetta)}${req ? ' *' : ''}</label><select data-attr="${k}">${req ? '' : '<option value="">—</option>'}${opz.map(o => `<option value="${escapeHtml(o.valore)}" ${o.valore === v ? 'selected' : ''}>${escapeHtml(o.etichetta)}</option>`).join('')}</select></div>`;
  }).join('');
}

function leggiAttributiCustom(containerId) {
  const out = {};
  document.querySelectorAll(`#${containerId} [data-attr]`).forEach(e => { if (e.value !== '') out[e.dataset.attr] = e.type === 'number' ? Number(e.value) : e.value; });
  return out;
}

// Errori di validazione server degli attributi (attributo_obbligatorio: chiave, valore_non_valido: chiave = x)
function messaggioAttributo(err) {
  const m = /^(attributo_obbligatorio|valore_non_valido): ([a-z0-9_]+)(?: \(([a-z0-9_]+)\))?/.exec(err || '');
  if (m) {
    const etichetta = attributiConfig.find(a => a.chiave === m[2])?.etichetta || m[2];
    const lato = m[3] ? (latiConfig.find(l => l.codice === m[3])?.etichetta || m[3]) + ': ' : '';
    return m[1] === 'attributo_obbligatorio' ? `compila "${lato}${etichetta}"` : `valore non valido per "${etichetta}"`;
  }
  const c = /^(lavorazione_non_applicabile|lavorazione_storica|lavorazione_non_attiva|lavorazione_duplicata|lati_obbligatori|lati_non_ammessi|lato_non_valido): ?(.*)$/.exec(err || '');
  if (c) {
    const nome = c[2] || '';
    return { lavorazione_non_applicabile: `la lavorazione "${nome}" non è applicabile a questo tipo di prodotto`, lavorazione_storica: `la lavorazione "${nome}" è storica e non si può più scegliere`,
      lavorazione_non_attiva: `la lavorazione "${nome}" è disattivata`, lavorazione_duplicata: `la lavorazione "${nome}" è indicata due volte`,
      lati_obbligatori: `scegli il lato per "${nome}"`, lati_non_ammessi: `"${nome}" vale per l'anta intera: nessun lato`, lato_non_valido: 'lato non valido' }[c[1]];
  }
  return null;
}
