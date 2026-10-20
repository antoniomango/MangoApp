// responsabile.html — tempi di riferimento, configurazione KPI, loadKpi, schede KPI, nota sui tempi registrati.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// nota sui KPI che usano i tempi registrati: da quel giorno i tempi non si registrano più
async function mostraNotaTempiKpi() {
  const el = document.getElementById('kpi-nota-tempi');
  if (!el) return;
  const { data } = await sb.from('config_sistema').select('valore').eq('chiave', 'tempi_non_registrati_dal').maybeSingle();
  if (!data?.valore) { el.hidden = true; return; }
  const dt = new Date(data.valore + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  el.innerHTML = `<i data-ic="avviso"></i> I KPI basati sui tempi registrati (tempi medi per fase, riferimento vs registrato) sono dati storici <strong>fino al ${dt}</strong>: da allora gli operatori segnano solo "Completata" e i tempi per fase non si registrano più.`;
  el.hidden = false;
}

// Soglie KPI: nomi, gruppi, limiti, passo e valore predefinito arrivano da kpi_config (una sola fonte).
// Le modifiche non salvate restano in memoria (kpiBozza), mai lette dal DOM al momento del click.
let kpiRighe = [];
let kpiBozza = {};   // { chiave: testo digitato }

async function loadKpiConfig() {
  const { data } = await sb.from('kpi_config')
    .select('chiave, valore, descrizione, default_valore, min_valore, max_valore, step, scala, gruppo, etichetta, ordine')
    .order('ordine').order('chiave');
  kpiRighe = (data || []).filter(r => r.etichetta);
  kpiBozza = {};
  renderKpiConfig();
  const nota = document.getElementById('kpi-schermo-nota');
  if (nota) nota.textContent = FlussoSchermo.wakeLockSupportato() ? Etichette.flusso.wakeLockSi : Etichette.flusso.wakeLockNo;
}

const _kpiVisualizza = (r, v) => String(Math.round(Number(v) * Number(r.scala || 1) * 1e6) / 1e6);

function renderKpiConfig() {
  const el = document.getElementById('kpi-config-form');
  if (!el) return;
  let gruppo = null, html = '';
  kpiRighe.forEach(r => {
    if (r.gruppo !== gruppo) {
      gruppo = r.gruppo;
      html += `<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:${html ? '20px' : '0'} 0 10px;border-bottom:1px solid var(--border);margin-bottom:16px">${escapeHtml(gruppo || '')}</div>`;
    }
    const k = Number(r.scala || 1);
    const val = r.chiave in kpiBozza ? kpiBozza[r.chiave] : _kpiVisualizza(r, r.valore);
    html += `<div class="form-group" style="margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <label style="font-size:13px;font-weight:600">${escapeHtml(r.etichetta)}</label>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">${escapeHtml(r.descrizione || '')}${r.default_valore != null ? ` <em>(predefinito: ${_kpiVisualizza(r, r.default_valore)})</em>` : ''}</div>
      </div>
      <input type="number" value="${escapeHtml(val)}" ${r.min_valore != null ? `min="${_kpiVisualizza(r, r.min_valore)}"` : ''} ${r.max_valore != null ? `max="${_kpiVisualizza(r, r.max_valore)}"` : ''} step="${r.step != null ? Math.round(Number(r.step) * k * 1e6) / 1e6 : 'any'}"
        oninput="kpiBozza['${escapeJsAttr(r.chiave)}'] = this.value"
        style="width:90px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;flex-shrink:0">
    </div>`;
  });
  el.innerHTML = html || '<span style="color:var(--muted)">Nessuna soglia configurabile.</span>';
}

async function salvaKpiConfig() {
  const valori = {}, errori = [];
  kpiRighe.forEach(r => {
    if (!(r.chiave in kpiBozza)) return;
    const raw = String(kpiBozza[r.chiave]).trim().replace(',', '.');
    const n = raw === '' ? NaN : Number(raw);      // 0 è un valore valido; vuoto o non numerico blocca il salvataggio
    const k = Number(r.scala || 1);
    if (!Number.isFinite(n) || (r.min_valore != null && n < r.min_valore * k - 1e-9) || (r.max_valore != null && n > r.max_valore * k + 1e-9)) {
      errori.push(r.etichetta);
    } else {
      valori[r.chiave] = Math.round(n / k * 1e9) / 1e9;
    }
  });
  if (errori.length) { toast('Valore mancante o fuori intervallo: ' + errori.join(', '), 'err'); return; }
  if (!Object.keys(valori).length) { toast('Nessuna modifica da salvare', 'ok'); return; }
  const { data, error } = await sb.rpc('imposta_kpi_config', { p_valori: valori, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Salvataggio NON riuscito: ' + (data?.etichetta || data?.errore || error?.message || ''), 'err'); return; }
  await loadKpiConfig();
  toast('Soglie KPI salvate', 'ok');
}

// ═══════════════════════════════════════════════
// TEMPI DI RIFERIMENTO: un tempo (minimo/massimo) per fase, valido per tutti i prodotti a cui la fase si applica.
// Prodotti e condizioni si decidono solo nella configurazione della fase (pagina Fasi). Elenco da elenco_tempi_per_fase.
// Solo dati di confronto: NON usati da pianificatore, stime o altri calcoli.
// ═══════════════════════════════════════════════
let tempiFasi = [];            // una riga per fase attiva a cui serve un tempo (+ bozze non salvate: campi _min/_max/_conf/_note)
let tempiRifStorico = [];      // righe storiche (fasi con tempo da catalogo): sola lettura
let tempiFasiCatalogo = [];    // fasi il cui tempo è la somma delle lavorazioni CNC

async function loadTempiRiferimento() {
  const { data, error } = await sb.rpc('elenco_tempi_per_fase', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore caricamento tempi: ' + (data?.errore || error?.message || ''), 'err'); return; }
  tempiFasi = (data.fasi || []).map(f => ({ ...f, _min: f.tempo?.minuti_tipici ?? '', _max: f.tempo?.minuti_max ?? '', _conf: !!f.tempo?.da_confermare, _note: f.tempo?.note || '' }));
  tempiFasiCatalogo = data.fasi_da_catalogo || [];
  tempiRifStorico = data.storico || [];
  await loadTempiRifExtra();
  renderTempiRiferimento();
}

function tempiRifSet(i, campo, valore) { const r = tempiFasi[i]; if (r) r[campo] = valore; }

const fmtMinuti = v => (v === null || v === undefined || v === '') ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 1 });

// Note per le fasi a tempo da catalogo e riquadro Storico (sola lettura, chiuso di default)
function renderTempiRifExtra() {
  const note = document.getElementById('tempi-rif-note');
  if (note) note.innerHTML = tempiFasiCatalogo.map(f =>
    `<div class="avviso-notifiche" style="margin-bottom:12px">Il tempo di <b>${escapeHtml(f.nome)}</b> è la somma delle lavorazioni scelte sull'ordine: si imposta nel <a href="#" onclick="showSection('lavorazioni-cnc-config'); return false" style="color:inherit;font-weight:600">Catalogo lavorazioni CNC</a>.</div>`).join('');
  const box = document.getElementById('tempi-rif-storico');
  if (!box) return;
  if (!tempiRifStorico.length) { box.innerHTML = ''; return; }
  const td = 'padding:6px 8px';
  box.innerHTML = `<details class="card" style="padding:12px 16px;margin-top:12px"><summary style="cursor:pointer;font-size:13px;font-weight:600">Storico (ordini inseriti prima del catalogo lavorazioni) — ${tempiRifStorico.length} ${tempiRifStorico.length === 1 ? 'riga' : 'righe'}, sola lettura</summary>
    <div style="font-size:12px;color:var(--muted);margin:8px 0">Restano in uso per gli ordini precedenti al catalogo e non si modificano.</div>
    <div style="overflow-x:auto"><table class="tempi-tab" style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">
      <th style="padding:8px">Fase</th><th style="padding:8px">Prodotto</th><th style="padding:8px">Lavorazione</th><th style="padding:8px">Minimo (min)</th><th style="padding:8px">Massimo (min)</th><th style="padding:8px">Note</th></tr></thead>
      <tbody>${tempiRifStorico.map(r => `<tr style="border-top:1px solid var(--border)">
        <td data-label="Fase" style="${td}">${escapeHtml(r.fase_nome || '—')}</td>
        <td data-label="Prodotto" style="${td}">${escapeHtml(r.tipo_label || 'Tutti')}</td>
        <td data-label="Lavorazione" style="${td}">${r.lavorazione_nome ? escapeHtml(r.lavorazione_nome) : '<span style="color:var(--muted)">—</span>'}</td>
        <td data-label="Minimo (min)" style="${td};font-family:var(--font-mono)">${fmtMinuti(r.minuti_tipici)}</td><td data-label="Massimo (min)" style="${td};font-family:var(--font-mono)">${fmtMinuti(r.minuti_max)}</td>
        <td data-label="Note" style="${td}">${escapeHtml(r.note || '')}</td></tr>`).join('')}</tbody></table></div></details>`;
}

// ── Fasi extra: tempo di riferimento per pezzo (catalogo), nella stessa pagina e con lo stesso stile delle fasi normali ──
let tempiExtra = [];            // voci del catalogo fasi extra a gestione standard (+ bozza: _min)
let tempiExtraDefault = null;   // durata predefinita delle fasi extra (kpi_config), usata quando manca ogni altro tempo

async function loadTempiRifExtra() {
  await loadCatalogoFasiExtra();
  tempiExtra = catalogoFasiExtra.filter(c => c.tipo_gestione === 'standard')
    .map(c => ({ id: c.id, nome: c.nome, attiva: c.attiva, tempo: c.tempo_per_pezzo_minuti, _min: c.tempo_per_pezzo_minuti ?? '' }));
  try {
    const { data } = await sb.from('kpi_config').select('valore').eq('chiave', 'durata_default_fase_extra_minuti').maybeSingle();
    tempiExtraDefault = data?.valore ?? null;
  } catch (e) { tempiExtraDefault = null; }
}

function tempiExtraSet(i, valore) { const r = tempiExtra[i]; if (r) r._min = valore; }

function renderTempiRifFasiExtra() {
  const box = document.getElementById('tempi-rif-extra');
  if (!box) return;
  if (!tempiExtra.length) { box.innerHTML = ''; return; }
  const cella = 'padding:6px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-ctl);font-size:13px;background:var(--bg);color:var(--ink)';
  const predef = tempiExtraDefault !== null ? `${fmtMinuti(tempiExtraDefault)} min` : 'quella impostata nelle Soglie KPI';
  box.innerHTML = `<div class="card" style="padding:12px 16px;margin-top:12px">
    <div style="font-size:13px;font-weight:600;margin-bottom:4px">Fasi extra</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Minuti per 1 pezzo, moltiplicati per la quantità dell'ordine. Le ore stimate sulla fase di un ordine hanno la precedenza; senza nessun tempo il piano "Oggi" usa la durata predefinita delle fasi extra (${escapeHtml(predef)}).</div>
    <div style="overflow-x:auto"><table class="tempi-tab" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">
        <th style="padding:8px">Fase extra</th><th style="padding:8px">Tempo per pezzo (min)</th><th></th></tr></thead>
      <tbody>${tempiExtra.map((r, i) => `
        <tr style="border-top:1px solid var(--border)">
          <td data-label="Fase extra" class="cella-fase" style="padding:6px 8px;font-weight:600">${escapeHtml(r.nome)}${r.attiva ? '' : ' <span style="font-size:11px;background:var(--neutral-soft);color:var(--neutral);border-radius:5px;padding:1px 7px;font-weight:600">Inattiva</span>'}${r.tempo === null || r.tempo === undefined ? ' <span style="font-size:11px;background:var(--warn-soft);color:var(--warn-ink);border-radius:5px;padding:1px 7px;font-weight:600;white-space:nowrap">Da impostare</span>' : ''}</td>
          <td data-label="Tempo per pezzo (min)" style="padding:6px 8px"><input type="number" min="0.1" max="1440" step="0.5" value="${escapeHtml(r._min)}" aria-label="Tempo per pezzo in minuti" style="${cella};width:104px" oninput="tempiExtraSet(${i},this.value)"></td>
          <td style="padding:6px 8px;white-space:nowrap">
            <button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="salvaTempoExtra(${i})"><i data-ic="salva"></i> Salva</button>
            ${r.tempo !== null && r.tempo !== undefined ? `<button class="btn btn-danger" style="padding:6px 10px;font-size:12px" onclick="salvaTempoExtra(${i}, true)" aria-label="Togli il tempo"><i data-ic="cestino"></i></button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
}

async function salvaTempoExtra(i, togli) {
  const r = tempiExtra[i]; if (!r) return;
  let minuti = null;
  if (!togli) {
    minuti = _numeroValido(r._min);
    if (minuti === null || minuti <= 0) { toast('Il tempo per pezzo deve essere un numero maggiore di 0', 'err'); return; }
  } else if (!confirm(`Togliere il tempo di "${r.nome}"? Il piano userà la durata predefinita delle fasi extra.`)) { return; }
  const { data, error } = await sb.rpc('imposta_tempo_catalogo_fase_extra', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_id: r.id, p_minuti: minuti });
  if (error || !data?.ok) { toast(data?.messaggio || 'Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadTempiRifExtra();
  renderTempiRifFasiExtra();
  toast(togli ? 'Tempo tolto' : 'Tempo di riferimento salvato', 'ok');
}

function renderTempiRiferimento() {
  renderTempiRifExtra();
  renderTempiRifFasiExtra();
  const el = document.getElementById('tempi-rif-body');
  if (!el) return;
  const daImpostare = tempiFasi.filter(f => !f.tempo).length;
  const sum = document.getElementById('tempi-rif-riepilogo');
  if (sum) sum.innerHTML = daImpostare
    ? `<span style="display:inline-block;background:var(--warn-soft);color:var(--warn-ink);border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">${daImpostare} ${daImpostare === 1 ? 'fase da impostare' : 'fasi da impostare'}</span>`
    : `<span style="display:inline-block;background:var(--ok-soft);color:var(--ok-ink);border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600">Tutte le fasi hanno un tempo</span>`;
  const cella = 'padding:6px 8px;border:1px solid var(--border-strong);border-radius:var(--radius-ctl);font-size:13px;background:var(--bg);color:var(--ink)';
  const AMB = { anta: 'Anta intera', lato: '1 lato' };
  el.innerHTML = tempiFasi.length ? `
    <div style="overflow-x:auto">
    <table class="tempi-tab" style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">
        <th style="padding:8px">Fase</th><th style="padding:8px">Prodotti</th>
        <th style="padding:8px" title="1 lato: il tempo vale per ogni lato su cui si fa la fase (entrambi i lati = ×2)">Vale per</th>
        <th style="padding:8px">Minimo (min)</th><th style="padding:8px">Massimo (min)</th><th style="padding:8px" title="Tempo non ancora validato con la squadra">Da confermare</th><th style="padding:8px">Note</th><th></th>
      </tr></thead>
      <tbody>${tempiFasi.map((r, i) => `
        <tr style="border-top:1px solid var(--border)">
          <td data-label="Fase" class="cella-fase" style="padding:6px 8px;font-weight:600">${escapeHtml(r.nome)}${r.tempo ? '' : ' <span style="font-size:11px;background:var(--warn-soft);color:var(--warn-ink);border-radius:5px;padding:1px 7px;font-weight:600;white-space:nowrap">Da impostare</span>'}</td>
          <td data-label="Prodotti" style="padding:6px 8px">${r.tutti ? 'Tutti' : escapeHtml((r.prodotti || []).join(', ') || '—')}${r.altre_condizioni ? `<div style="font-size:11px;color:var(--muted)">solo ${escapeHtml(r.altre_condizioni)}</div>` : ''}</td>
          <td data-label="Vale per" style="padding:6px 8px"><select style="${cella};min-width:110px" aria-label="Vale per" onchange="tempiAmbitoFase(${i}, this.value)">${Object.entries(AMB).map(([v, t]) => `<option value="${v}" ${r.ambito_tempo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
          <td data-label="Minimo (min)" style="padding:6px 8px"><input type="number" min="0.1" step="0.5" value="${escapeHtml(r._min)}" aria-label="Minimo" style="${cella};width:84px" oninput="tempiRifSet(${i},'_min',this.value)"></td>
          <td data-label="Massimo (min)" style="padding:6px 8px"><input type="number" min="0.1" step="0.5" value="${escapeHtml(r._max)}" aria-label="Massimo" style="${cella};width:84px" oninput="tempiRifSet(${i},'_max',this.value)"></td>
          <td data-label="Da confermare" style="padding:6px 8px;text-align:center"><input type="checkbox" ${r._conf ? 'checked' : ''} aria-label="Da confermare" onchange="tempiRifSet(${i},'_conf',this.checked)"></td>
          <td data-label="Note" style="padding:6px 8px"><input type="text" maxlength="200" value="${escapeHtml(r._note)}" aria-label="Note" style="${cella};width:100%;min-width:90px" oninput="tempiRifSet(${i},'_note',this.value)"></td>
          <td style="padding:6px 8px;white-space:nowrap">
            <button class="btn btn-secondary" style="padding:6px 10px;font-size:12px" onclick="salvaTempoFase(${i})"><i data-ic="salva"></i> Salva</button>
            ${r.tempo ? `<button class="btn btn-danger" style="padding:6px 10px;font-size:12px" onclick="eliminaTempoFase(${i})" aria-label="Elimina il tempo"><i data-ic="cestino"></i></button>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
    <div style="font-size:12px;color:var(--muted);margin-top:10px">1 lato: il tempo vale per ogni lato su cui si fa la fase (entrambi i lati = ×2). I prodotti e le altre condizioni si impostano nella pagina Fasi.</div>`
    : '<div style="padding:16px;color:var(--muted)">Nessuna fase a cui serve un tempo di riferimento.</div>';
}

function _numeroValido(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function salvaTempoFase(i) {
  const r = tempiFasi[i]; if (!r) return;
  const tip = _numeroValido(r._min), max = _numeroValido(r._max);
  if (tip === null || tip <= 0) { toast('Il tempo minimo deve essere un numero maggiore di 0', 'err'); return; }
  if (max === null || max <= 0) { toast('Il tempo massimo deve essere un numero maggiore di 0', 'err'); return; }
  if (max < tip) { toast('Il tempo massimo non può essere minore del minimo', 'err'); return; }
  const dati = { fase_id: r.fase_id, minuti_tipici: tip, minuti_max: max, da_confermare: !!r._conf, note: (r._note || '').trim() || null };
  if (r.tempo?.id) dati.id = r.tempo.id;
  const { data, error } = await sb.rpc('salva_tempo_riferimento', { p_dati: dati, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) {
    toast(data?.errore === 'minuti_non_validi' ? 'Valori non validi (minimo > 0, massimo ≥ minimo)' : (data?.messaggio || 'Errore: ' + (data?.errore || error?.message || '')), 'err'); return;
  }
  await loadTempiRiferimento();
  toast('Tempo di riferimento salvato', 'ok');
}

async function eliminaTempoFase(i) {
  const r = tempiFasi[i]; if (!r?.tempo?.id) return;
  if (!confirm(`Eliminare il tempo di riferimento di "${r.nome}"? La fase tornerà "da impostare".`)) return;
  const { data, error } = await sb.rpc('elimina_tempo_riferimento', { p_id: r.tempo.id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(data?.messaggio || 'Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadTempiRiferimento();
  toast('Tempo di riferimento eliminato', 'ok');
}

// "Vale per" (anta intera / 1 lato) è una proprietà della fase: si salva con la stessa RPC della pagina Fasi (salva_configurazione_fasi)
async function tempiAmbitoFase(i, valore) {
  const r = tempiFasi[i]; if (!r || r.ambito_tempo === valore) return;
  const { data, error } = await sb.rpc('salva_configurazione_fasi', {
    p_modifiche: [{ id: r.fase_id, ambito_tempo: valore }], p_solo_anteprima: false, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Salvataggio NON riuscito: ' + (data?.errore || error?.message || ''), 'err'); renderTempiRiferimento(); return; }
  r.ambito_tempo = valore;
  await loadFasi();
  toast(valore === 'lato' ? 'Il tempo ora vale per ogni lato' : 'Il tempo ora vale per l\'anta intera', 'ok');
}

// ── KPI: riferimento vs tempi registrati (RPC solo-responsabile, niente dati per operatore) ──
async function loadConfrontoTempiRiferimento() {
  const el = document.getElementById('kpi-tempi-rif');
  if (!el || !currentUserRow) return;
  const dal = document.getElementById('kpi-tempi-rif-dal')?.value || '2026-09-28';
  el.innerHTML = '<div style="color:var(--muted);font-size:12px">Caricamento…</div>';
  const { data, error } = await sb.rpc('confronto_tempi_riferimento', {
    p_responsabile_id: currentUserRow.id, p_session_token: null, p_dal: dal });
  if (error || !data?.ok) { el.innerHTML = `<div style="color:var(--alert);font-size:12px">Errore: ${escapeHtml(error?.message || data?.errore || 'sconosciuto')}</div>`; return; }
  const righe = data.righe || [];
  const fmt = v => (v === null || v === undefined) ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: 1 });
  const soglie = `Fuori scala: sotto il ${fmt(Number(data.soglia_sotto_tipico) * 100)}% del minimo o sopra ${fmt(data.soglia_sopra_massimo)}× il massimo · giornata ${fmt(data.giornata_minuti)} min`;
  if (!righe.length) { el.innerHTML = `<div style="color:var(--muted);font-size:12px">${escapeHtml(soglie)}<br>Nessun tempo di riferimento né fase registrata.</div>`; return; }
  let tipoCorrente = null;
  el.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:10px">${escapeHtml(soglie)}</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">
      <th style="padding:6px 8px">Fase</th><th style="padding:6px 8px">Lavorazione CNC</th>
      <th style="padding:6px 8px;text-align:right">Riferimento minimo / max</th>
      <th style="padding:6px 8px;text-align:right">Mediana</th><th style="padding:6px 8px;text-align:right">75° perc.</th>
      <th style="padding:6px 8px;text-align:right">Fasi</th><th style="padding:6px 8px;text-align:right">Fuori scala</th>
    </tr></thead><tbody>${righe.map(r => {
      let sep = '';
      if (r.tipo_prodotto !== tipoCorrente) {
        tipoCorrente = r.tipo_prodotto;
        sep = `<tr><td colspan="7" style="padding:10px 8px 4px;font-weight:700;font-size:12px;border-top:2px solid var(--border)">${escapeHtml(r.tipo_label)}</td></tr>`;
      }
      const rif = r.minuti_tipici === null ? '<span style="color:var(--muted)">non definito</span>' : `${fmt(r.minuti_tipici)} / ${fmt(r.minuti_max)}`;
      const fuori = Number(r.fuori_scala) > 0 ? `<span style="color:var(--alert);font-weight:600">${fmt(r.fuori_scala)}</span>` : fmt(r.fuori_scala);
      return sep + `<tr style="border-top:1px solid var(--border)">
        <td style="padding:6px 8px">${escapeHtml(r.fase_nome)}${r.note ? ` <span style="color:var(--muted);font-size:11px">(${escapeHtml(r.note)})</span>` : ''}</td>
        <td style="padding:6px 8px">${r.lavorazione_nome ? escapeHtml(r.lavorazione_nome) : '<span style="color:var(--muted)">—</span>'}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${rif}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${fmt(r.mediana)}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${fmt(r.p75)}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${fmt(r.n)}</td>
        <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${fuori}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// ═══════════════════════════════════════════════
// KPI
// ═══════════════════════════════════════════════
// Calcola ore lavorative effettive tra due timestamp, rispettando config_orario
// Ore lavorative tra due istanti: calcolate dal server (calendario unico) in una sola chiamata per tutte le coppie necessarie
async function oreLavorativeBatch(coppie) {
  if (!coppie.length) return [];
  const { data, error } = await sb.rpc('ore_lavorative_tra_batch', { p_coppie: coppie, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { console.warn('ore_lavorative_tra_batch:', error?.message || data?.errore); return coppie.map(() => 0); }
  return data.ore.map(Number);
}

// Legge TUTTE le righe che soddisfano una query, paginando con .range() finché una
// pagina torna più corta della page size. Da usare per qualunque lettura che debba
// coprire uno storico intero (KPI, export, ecc.): una select() singola senza .range()
// viene troncata in silenzio da Supabase/PostgREST oltre il limite "Max Rows" del
// progetto, e senza un .order() stabile l'ordine restituito non è nemmeno garantito.
// queryBuilderFn deve restituire una NUOVA query (senza .range()) ad ogni chiamata,
// e includere sempre un .order() su una colonna univoca (es. 'id') per paginare in modo stabile.
async function fetchAllRows(queryBuilderFn, pageSize = 1000) {
  let rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilderFn().range(from, from + pageSize - 1);
    if (error) { console.error('[fetchAllRows] errore di paginazione:', error); break; }
    const pagina = data || [];
    rows = rows.concat(pagina);
    if (pagina.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function loadKpi() {
  mostraNotaTempiKpi();
  loadConfrontoTempiRiferimento();   // indipendente dal periodo selezionato (ha la sua data)
  const giorni = parseInt(document.getElementById('kpi-periodo').value);
  const dal = giorni > 0 ? new Date(Date.now() - giorni * 86400000).toISOString() : null;

  // NB: qui non possiamo filtrare per ordine_id come nella vista ufficio — questi KPI
  // aggregano di proposito su TUTTO lo storico (o sull'intero periodo selezionato),
  // quindi usiamo fetchAllRows() per garantire che nessuna pagina venga persa anche
  // quando il numero di righe supera il limite di default di una singola risposta.
  const [
    ordFasiArr,
    tuttiOrdiniArr,
    fasiCfgArr,
    { count: speditiPeriodoCount }
  ] = await Promise.all([
    fetchAllRows(() => sb.from('ordine_fasi')
      .select('id, ordine_id, fase_id, operatore_id, iniziata_il, completata_il, tempo_accumulato_minuti, n_ordini_batch, ordini(codice, cliente, struttura, tipo_prodotto, priorita, scadenza, creato_il, spedito_il, completato_il, eliminato, quantita)')
      .not('completata_il', 'is', null)
      .gte('completata_il', dal || '2000-01-01')
      .order('id')),
    fetchAllRows(() => sb.from('ordini')
      .select('id, codice, cliente, stato, priorita, struttura, tipo_prodotto, scadenza, creato_il, spedito_il, completato_il, eliminato')
      .neq('eliminato', true)
      .order('id')),
    fetchAllRows(() => sb.from('fasi').select('id, nome').order('posizione').order('id')),
    // query dedicata: conta spediti nel periodo inclusi gli archiviati (eliminato=true)
    (() => { let q = sb.from('ordini').select('id', { count: 'exact', head: true }).eq('stato', 'spedito'); if (dal) q = q.gte('spedito_il', dal); return q; })(),
  ]);

  const tuttiOrdini = tuttiOrdiniArr;
  const fasiNomi = Object.fromEntries(fasiCfgArr.map(f => [f.id, f.nome]));
  const oggi = Calendario.oggiIso();

  // ── Raggruppa fasi per ordine ──
  const perOrdine = {};
  ordFasiArr.forEach(f => {
    if (!f.ordini || f.ordini.eliminato) return;
    const oid = f.ordine_id;
    if (!perOrdine[oid]) perOrdine[oid] = { minInizio: f.iniziata_il, maxFine: f.completata_il, ord: f.ordini };
    else {
      if (f.iniziata_il && (!perOrdine[oid].minInizio || f.iniziata_il < perOrdine[oid].minInizio)) perOrdine[oid].minInizio = f.iniziata_il;
      if (f.completata_il && f.completata_il > perOrdine[oid].maxFine) perOrdine[oid].maxFine = f.completata_il;
    }
  });

  // ── ore lavorative dal calendario unico del server: tutte le coppie (inizio, fine) in una sola chiamata ──
  const _coppie = [], _idxCoppie = new Map();
  const _servono = (a, b) => { if (a && b && !_idxCoppie.has(a + '|' + b)) { _idxCoppie.set(a + '|' + b, _coppie.length); _coppie.push([a, b]); } };
  Object.values(perOrdine).forEach(o => _servono(o.minInizio, o.maxFine));
  ordFasiArr.forEach(f => { if (f.fase_id && !(f.tempo_accumulato_minuti > 0)) _servono(f.iniziata_il, f.completata_il); });
  const _oreCoppie = await oreLavorativeBatch(_coppie);
  const calcolaOreEffettive = (a, b) => (a && b) ? (_oreCoppie[_idxCoppie.get(a + '|' + b)] ?? 0) : 0;

  // ── Tempo medio ciclo ordine (ore lavorative) ──
  const tempiCiclo = Object.values(perOrdine)
    .map(o => calcolaOreEffettive(o.minInizio, o.maxFine))
    .filter(h => h > 0);
  const tmCiclo = tempiCiclo.length ? tempiCiclo.reduce((a,b)=>a+b,0)/tempiCiclo.length : null;

  // ── CARDS ──
  const aperti = tuttiOrdini.filter(o => o.stato === 'aperto').length;
  const attesaCorr = tuttiOrdini.filter(o => o.stato === 'attesa_spedizione').length;
  const speditiPeriodo = speditiPeriodoCount ?? 0;
  const inRitardo = tuttiOrdini.filter(o => o.stato === 'aperto' && o.scadenza && o.scadenza < oggi).length;

  document.getElementById('kpi-cards').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">In produzione</div><div class="kpi-value">${aperti}</div><div class="kpi-sub">ordini aperti</div></div>
    <div class="kpi-card kpi-ok"><div class="kpi-label">Attesa corriere</div><div class="kpi-value">${attesaCorr}</div><div class="kpi-sub">pronti per spedizione</div></div>
    <div class="kpi-card kpi-ok"><div class="kpi-label">Spediti</div><div class="kpi-value">${speditiPeriodo}</div><div class="kpi-sub">nel periodo selezionato</div></div>
    <div class="kpi-card ${inRitardo > 0 ? 'kpi-alert' : ''}"><div class="kpi-label">In ritardo</div><div class="kpi-value">${inRitardo}</div><div class="kpi-sub">oltre la scadenza</div></div>
    <div class="kpi-card"><div class="kpi-label">Tempo ciclo medio</div><div class="kpi-value">${tmCiclo ? formatOre(tmCiclo) : '—'}</div><div class="kpi-sub">ore lavorative/ordine</div></div>
  `;

  // ── TEMPO MEDIO PER FASE — CORRETTO: usa n_ordini_batch, non approssimazione timestamp ──
  const faseTempo = {};
  ordFasiArr.forEach(f => {
    if (!f.fase_id) return;
    let hTotale;
    if (f.tempo_accumulato_minuti > 0) {
      // Divide per n_ordini_batch (dato esatto) poi per quantità
      hTotale = f.tempo_accumulato_minuti / (f.n_ordini_batch || 1) / 60;
    } else if (f.iniziata_il && f.completata_il) {
      hTotale = calcolaOreEffettive(f.iniziata_il, f.completata_il);
    } else return;
    if (hTotale <= 0 || hTotale > 500) return;
    const quantita = f.ordini?.quantita || 1;
    const h = hTotale / quantita;
    if (!faseTempo[f.fase_id]) faseTempo[f.fase_id] = [];
    faseTempo[f.fase_id].push(h);
  });
  const faseTempoArr = Object.entries(faseTempo)
    .map(([id, ore]) => ({ id: parseInt(id), nome: fasiNomi[parseInt(id)] || `Fase ${id}`, media: ore.reduce((a,b)=>a+b,0)/ore.length, count: ore.length }))
    .sort((a,b) => b.media - a.media);
  const maxOre = faseTempoArr[0]?.media || 1;
  const oreGiornoRef = (Calendario.minutiGiorno() || 0) / 60;   // giornata tipo dal calendario unico

  // Conta fasi in coda (disponibile/in_corso) per fase — per collo di bottiglia. JOIN a ordini
  // ed esclusione eliminato=true: senza, il badge contava anche fasi di ordini che non esistono
  // più — 238 righe fantasma trovate e corrette il 2026-09-03 (vedi vault). Filtro in JS dopo
  // il fetch, stesso pattern già usato sopra per perOrdine — difesa in profondità: la causa
  // radice (eliminaOrdine) è già corretta, questo protegge il punto che consuma il dato se in
  // futuro un altro percorso lasciasse fasi orfane.
  const { data: fasiInCoda } = await sb.from('ordine_fasi')
    .select('fase_id, ordini(eliminato)')
    .in('stato', ['disponibile', 'in_corso'])
    .not('fase_id', 'is', null);
  const codaPerFase = {};
  (fasiInCoda || []).forEach(f => {
    if (f.ordini?.eliminato) return;
    codaPerFase[f.fase_id] = (codaPerFase[f.fase_id] || 0) + 1;
  });

  document.getElementById('kpi-fasi-tempo').innerHTML = faseTempoArr.length ? faseTempoArr.slice(0, 15).map(f => {
    const color = f.media > oreGiornoRef ? 'var(--alert)' : f.media > oreGiornoRef/2 ? 'var(--warn)' : 'var(--ok)';
    const coda = codaPerFase[f.id] || 0;
    const codaBadge = coda > 0 ? `<span style="font-size:10px;color:var(--muted);margin-left:6px">${coda} in coda</span>` : '';
    return `<div class="kpi-bar-row">
      <div class="kpi-bar-label" title="${escapeHtml(f.nome)}">${escapeHtml(f.nome)}</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.round(f.media/maxOre*100)}%;background:${color}"></div></div>
      <div class="kpi-bar-val">${formatOre(f.media)}</div>
    </div><div style="font-size:10px;color:var(--muted);margin:-6px 0 8px 150px">${f.count} campioni${codaBadge}</div>`;
  }).join('') : '<div class="kpi-empty">Nessun dato nel periodo</div>';

  // ── TREND MENSILE ──
  const mesiMap = {};
  tuttiOrdini.filter(o => ['spedito','attesa_spedizione'].includes(o.stato) && (!dal || ((o.completato_il||o.spedito_il) >= dal))).forEach(o => {
    const dt = o.completato_il || o.spedito_il;
    if (!dt) return;
    const m = dt.substring(0, 7);
    mesiMap[m] = (mesiMap[m] || 0) + 1;
  });
  const mesiArr = Object.entries(mesiMap).sort((a,b) => a[0].localeCompare(b[0]));
  const maxM = Math.max(...mesiArr.map(m => m[1]), 1);
  document.getElementById('kpi-trend').innerHTML = mesiArr.length ? mesiArr.map(([m, v]) => {
    const [y, mo] = m.split('-');
    const label = new Date(y, mo-1).toLocaleString('it-IT', { month: 'short', year: '2-digit' });
    return `<div class="kpi-bar-row">
      <div class="kpi-bar-label">${label}</div>
      <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.round(v/maxM*100)}%"></div></div>
      <div class="kpi-bar-val">${v} ord.</div>
    </div>`;
  }).join('') : '<div class="kpi-empty">Nessun ordine completato nel periodo</div>';

  // ── TEMPO CICLO PER TIPOLOGIA ──
  const strMap = {};
  Object.values(perOrdine).forEach(o => {
    if (!o.ord || !o.minInizio || !o.maxFine) return;
    const s = o.ord.struttura || o.ord.tipo_prodotto || 'extra';
    const h = calcolaOreEffettive(o.minInizio, o.maxFine);
    if (h <= 0) return;
    if (!strMap[s]) strMap[s] = [];
    strMap[s].push(h);
  });
  const strArr = Object.entries(strMap)
    .map(([s, ore]) => ({ s, media: ore.reduce((a,b)=>a+b,0)/ore.length, count: ore.length }))
    .sort((a,b) => b.media - a.media);
  document.getElementById('kpi-struttura').innerHTML = strArr.length ?
    `<table class="kpi-table"><thead><tr><th>Tipologia</th><th>Ordini</th><th>Tempo medio</th><th>Vs. standard</th></tr></thead><tbody>` +
    strArr.map((r, i) => {
      const ref = strArr[strArr.length-1]?.media || r.media;
      const pct = Math.round((r.media / ref - 1) * 100);
      const badge = i === 0 ? '' : pct > 0 ? `<span style="color:var(--alert);font-size:10px">+${pct}%</span>` : `<span style="color:var(--ok);font-size:10px">${pct}%</span>`;
      return `<tr><td>${strutturaLabel(r.s)}</td><td style="text-align:center">${r.count}</td><td style="font-family:var(--font-mono)">${formatOre(r.media)}</td><td>${badge}</td></tr>`;
    }).join('') + `</tbody></table>` : '<div class="kpi-empty">Nessun dato</div>';

  // ── ORDINI IN RITARDO ──
  const ritardoList = tuttiOrdini
    .filter(o => o.stato === 'aperto' && o.scadenza && o.scadenza < oggi)
    .sort((a,b) => a.scadenza.localeCompare(b.scadenza));
  document.getElementById('kpi-ritardo-lista').innerHTML = ritardoList.length ?
    `<table class="kpi-table"><thead><tr><th>Cliente</th><th>Codice</th><th>Scadenza</th><th>Ritardo</th></tr></thead><tbody>` +
    ritardoList.map(o => {
      const gg = Math.floor((new Date(oggi) - new Date(o.scadenza)) / 86400000);
      return `<tr>
        <td>${escapeHtml(o.cliente)}</td>
        <td style="font-family:var(--font-mono);font-size:11px">${escapeHtml(o.codice||'')}</td>
        <td>${formatDate(o.scadenza)}</td>
        <td style="color:var(--alert);font-weight:700">+${gg}gg</td>
      </tr>`;
    }).join('') + `</tbody></table>`
    : '<div class="kpi-empty" style="color:var(--ok)">✓ Nessun ordine in ritardo</div>';

  // ── FASI IN ATTESA ──
  const { data: inAttesa } = await sb.from('ordine_fasi')
    .select('*, users!operatore_id(nome, cognome), ordini(codice, cliente), fasi(nome)')
    .eq('stato', 'in_attesa');
  document.getElementById('kpi-in-attesa').innerHTML = (inAttesa||[]).length ?
    `<table class="kpi-table"><thead><tr><th>Cliente</th><th>Fase</th><th>Operatore</th></tr></thead><tbody>` +
    inAttesa.map(f => `<tr>
      <td>${escapeHtml(f.ordini?.cliente||'')} <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${escapeHtml(f.ordini?.codice||'')}</span></td>
      <td>${escapeHtml(f.fasi?.nome || f.nome_custom || '—')}</td>
      <td>${f.users ? escapeHtml(f.users.nome+' '+f.users.cognome) : '—'}</td>
    </tr>`).join('') + `</tbody></table>`
    : '<div class="kpi-empty" style="color:var(--ok)">✓ Nessuna fase in attesa</div>';

  // ── DISTRIBUZIONE PRIORITÀ ──
  const prioCountMap = {};
  prioritaConfig.forEach(p => { prioCountMap[p.id] = 0; });
  tuttiOrdini.filter(o => ['aperto','attesa_spedizione'].includes(o.stato)).forEach(o => {
    if (prioCountMap[o.priorita] !== undefined) prioCountMap[o.priorita]++;
  });
  const totPrio = Object.values(prioCountMap).reduce((a,b)=>a+b,0) || 1;
  document.getElementById('kpi-priorita').innerHTML =
    prioritaConfig.map(p => {
      const v = prioCountMap[p.id] || 0;
      const color = Etichette.colorePriorita(p.id).ink;
      return `
        <div class="kpi-bar-row">
          <div class="kpi-bar-label">${escapeHtml(p.etichetta)}</div>
          <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${Math.round(v/totPrio*100)}%;background:${color}"></div></div>
          <div class="kpi-bar-val">${v} (${Math.round(v/totPrio*100)}%)</div>
        </div>`;
    }).join('') +
    `<div style="font-size:11px;color:var(--muted);margin-top:8px">Totale ordini attivi: ${totPrio}</div>`;

  // ── CAPACITÀ PRODUTTIVA (RPC) ──
  const { data: cap } = await sb.rpc('capacita_produttiva_stimata');
  if (cap) {
    const smalt = cap.settimane_smaltimento;
    const smaltColor = smalt == null ? 'var(--muted)'
      : smalt > 4 ? 'var(--alert)' : smalt > 2 ? 'var(--warn)' : 'var(--ok)';
    document.getElementById('kpi-capacita').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px">
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Backlog reale</div>
          <div style="font-size:28px;font-weight:700;font-family:var(--font-mono)">${cap.backlog_ore}h</div>
          <div style="font-size:11px;color:var(--muted)">ore di lavoro rimanenti</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Produttività media</div>
          <div style="font-size:28px;font-weight:700;font-family:var(--font-mono)">${cap.ore_per_settimana}h</div>
          <div style="font-size:11px;color:var(--muted)">ore/settimana (ultimi ${cap.settimane_storico} sett.)</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Stima smaltimento</div>
          <div style="font-size:28px;font-weight:700;font-family:var(--font-mono);color:${smaltColor}">${smalt != null ? smalt + ' sett.' : '—'}</div>
          <div style="font-size:11px;color:var(--muted)">al ritmo attuale</div>
        </div>
      </div>`;
  } else {
    document.getElementById('kpi-capacita').innerHTML = '<div class="kpi-empty">Dati insufficienti</div>';
  }

  // ── LISTA PRIORITÀ GIORNALIERA (RPC) ──
  const { data: priorita } = await sb.rpc('lista_priorita_giornaliera');
  const pEl = document.getElementById('kpi-lista-priorita');
  if (priorita?.length) {
    pEl.innerHTML = `<table class="kpi-table">
      <thead><tr><th>#</th><th>Cliente / Codice</th><th>Priorità</th><th>Scadenza</th><th>Ore int.</th><th>Stima cons.</th><th>Rapporto</th></tr></thead>
      <tbody>` +
      priorita.map((o, i) => {
        const isRitardo = o.giorni_scadenza < 0;
        const isOggi = o.giorni_scadenza === 0;
        const rowStyle = o.a_rischio ? 'background:var(--alert-bg)' : '';
        const rapportoStr = o.rapporto_critico >= 9990 ? (isRitardo ? '<i data-ic="avviso"></i> IN RITARDO' : '<i data-ic="avviso"></i> OGGI') : o.rapporto_critico.toFixed(2);
        const rapportoColor = o.rapporto_critico >= 9990 ? 'var(--alert)' : o.rapporto_critico > 1 ? 'var(--alert)' : o.rapporto_critico > 0.8 ? 'var(--warn)' : 'var(--ink)';
        const ggStr = isRitardo ? `<span style="color:var(--alert)">-${Math.abs(o.giorni_scadenza)}gg</span>` :
          isOggi ? `<span style="color:var(--alert)">oggi</span>` :
          `+${o.giorni_scadenza}gg`;
        const stimaColor = o.a_rischio ? 'var(--alert)' : 'var(--muted)';
        const motivoRischio = o.a_rischio ? Etichette.rischioTesto({ motivo: o.motivo_rischio, fine_prevista: o.fine_prevista, macchine_ipotizzate: o.macchine_ipotizzate }, o.scadenza) : '';
        return `<tr style="${rowStyle}" title="${escapeHtml(motivoRischio)}">
          <td style="color:var(--muted);font-size:11px">${i+1}</td>
          <td>${escapeHtml(o.cliente||'')} <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted)">${escapeHtml(o.codice||'')}</span>${motivoRischio ? `<div style="font-size:11px;color:var(--alert-ink)">A rischio: ${escapeHtml(motivoRischio)}</div>` : ''}</td>
          <td><span style="color:${Etichette.colorePriorita(o.priorita).ink};font-size:11px">${escapeHtml(prioLabel(o.priorita))}</span></td>
          <td>${formatDate(o.scadenza)} ${ggStr}</td>
          <td style="font-family:var(--font-mono)">${o.ore_rimaste}h</td>
          <td style="font-family:var(--font-mono);color:${stimaColor}">${o.giorni_stima_consegna != null ? o.giorni_stima_consegna + 'gg' : '—'}</td>
          <td style="font-weight:700;color:${rapportoColor}">${rapportoStr}</td>
        </tr>`;
      }).join('') + `</tbody></table>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">Ore int. = carico operatori (senza attese esterne). Stima cons. = stima cliente in giorni (interne + esterne). Rapporto = stima / giorni a scadenza — valori &gt;1 = a rischio.</div>`;
  } else {
    pEl.innerHTML = '<div class="kpi-empty" style="color:var(--ok)">✓ Nessun ordine con scadenza impostata</div>';
  }

  // ── CONFRONTO OPERATORI PER FASE (RPC) ──
  const { data: opData } = await sb.rpc('confronto_operatori_per_fase');
  const oEl = document.getElementById('kpi-operatori');
  if (opData?.length) {
    // Raggruppa per fase
    const perFase = {};
    opData.forEach(r => {
      if (!perFase[r.fase_nome]) perFase[r.fase_nome] = [];
      perFase[r.fase_nome].push(r);
    });
    let html = `<table class="kpi-table">
      <thead><tr><th>Fase</th><th>Operatore</th><th>Mediana</th><th>Campioni</th></tr></thead><tbody>`;
    let lastFase = null;
    opData.forEach(r => {
      const isNewFase = r.fase_nome !== lastFase;
      const scarso = r.campioni < (Calendario.costante('soglia_campioni_op') ?? 0) || r.mediana_min == null;
      const medianaStr = r.mediana_min != null ? `${r.mediana_min} min` : 'dati insuff.';
      html += `<tr>
        <td style="color:${isNewFase ? 'var(--ink)' : 'transparent'};font-weight:${isNewFase ? '600' : '400'}">${isNewFase ? escapeHtml(r.fase_nome) : '↳'}</td>
        <td>${escapeHtml(r.operatore_nome)}</td>
        <td style="font-family:var(--font-mono);color:${r.mediana_min == null ? 'var(--muted)' : 'inherit'};font-style:${r.mediana_min == null ? 'italic' : 'normal'}">${medianaStr}${scarso && r.mediana_min != null ? ' <span title="Dati scarsi — meno di 5 campioni" style="color:var(--warn)"><i data-ic="avviso"></i></span>' : ''}</td>
        <td style="color:var(--muted);font-size:11px">${r.campioni}</td>
      </tr>`;
      lastFase = r.fase_nome;
    });
    html += `</tbody></table>`;
    oEl.innerHTML = html;
  } else {
    oEl.innerHTML = '<div class="kpi-empty">Nessun dato — serve storico con almeno 2 completamenti per operatore per fase</div>';
  }

  // ── SCHEDE DI RIFERIMENTO ──
  await Promise.all([
    inizializzaFiltriSchede(),
    renderSchedeKpi(),
  ]);
}

// ═══════════════════════════════════════════════
// SCHEDE DI RIFERIMENTO
// ═══════════════════════════════════════════════

async function inizializzaFiltriSchede() {
  // Struttura: da attributi_prodotto_config, chiave='struttura', ordinate per posizione opzione
  const cfgStruttura = attributiConfig.find(a => a.chiave === 'struttura');
  const strutture = cfgStruttura
    ? [...(cfgStruttura.opzioni || [])].sort((a, b) => (a.posizione || 0) - (b.posizione || 0))
    : [];

  // Materiale: da attributi_prodotto_config, chiave='materiale', ordinate per posizione opzione
  const cfgMateriale = attributiConfig.find(a => a.chiave === 'materiale');
  const materiali = cfgMateriale
    ? [...(cfgMateriale.opzioni || [])].sort((a, b) => (a.posizione || 0) - (b.posizione || 0))
    : [];

  const elStruttura = document.getElementById('sch-struttura');
  if (elStruttura) {
    const selStruttura = Array.from(elStruttura.selectedOptions).map(o => o.value);
    elStruttura.innerHTML = strutture.map(o =>
      `<option value="${escapeHtml(o.valore)}">${escapeHtml(o.etichetta)}</option>`
    ).join('');
    selStruttura.forEach(v => { const opt = elStruttura.querySelector(`option[value="${v}"]`); if (opt) opt.selected = true; });
  }

  const elMateriale = document.getElementById('sch-materiale');
  if (elMateriale) {
    const selMateriale = Array.from(elMateriale.selectedOptions).map(o => o.value);
    elMateriale.innerHTML = materiali.map(o =>
      `<option value="${escapeHtml(o.valore)}">${escapeHtml(o.etichetta)}</option>`
    ).join('');
    selMateriale.forEach(v => { const opt = elMateriale.querySelector(`option[value="${v}"]`); if (opt) opt.selected = true; });
  }

  // Tipo prodotto: da tipiProdotto (già caricato al startup, ordinato per posizione)
  const elTipo = document.getElementById('sch-tipo');
  if (elTipo) {
    const selTipo = Array.from(elTipo.selectedOptions).map(o => o.value);
    elTipo.innerHTML = tipiProdotto.map(t =>
      `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`
    ).join('');
    selTipo.forEach(v => { const opt = elTipo.querySelector(`option[value="${v}"]`); if (opt) opt.selected = true; });
  }

  // Fasi opzionali dal catalogo
  const { data: fasiOpz } = await sb.from('fasi').select('id, nome').eq('opzionale', true).order('posizione');
  const cont = document.getElementById('sch-fasi-opz-container');
  if (cont && fasiOpz?.length) {
    cont.innerHTML = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">Fasi opzionali</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">` +
      fasiOpz.map(f => `
        <div style="display:flex;align-items:center;gap:4px;background:var(--border);border-radius:4px;padding:3px 8px">
          <span style="font-size:11px">${escapeHtml(f.nome)}</span>
          <select id="sch-fase-${f.id}" style="font-size:11px;border:none;background:transparent;padding:0">
            <option value="">indifferente</option>
            <option value="inclusa">deve essere presente</option>
            <option value="esclusa">deve essere assente</option>
          </select>
        </div>`).join('') +
      `</div>`;
  }
}

async function creaSchedaKpi() {
  const nome = document.getElementById('sch-nome')?.value?.trim();
  if (!nome) { toast('Inserisci un nome per la scheda', 'error'); return; }

  // Raccoglie i valori selezionati dai multi-select
  const getSelected = id => Array.from(document.getElementById(id)?.selectedOptions||[]).map(o=>o.value);
  const struttura    = getSelected('sch-struttura');
  const materiale    = getSelected('sch-materiale');
  const tipo_prodotto = getSelected('sch-tipo');

  // Raccoglie lo stato delle fasi opzionali
  const fasi_incluse = [], fasi_escluse = [];
  document.querySelectorAll('[id^="sch-fase-"]').forEach(sel => {
    const faseId = parseInt(sel.id.replace('sch-fase-',''));
    if (sel.value === 'inclusa') fasi_incluse.push(faseId);
    else if (sel.value === 'esclusa') fasi_escluse.push(faseId);
  });

  const criteri = {};
  if (struttura.length)    criteri.struttura     = struttura;
  if (materiale.length)    criteri.materiale     = materiale;
  if (tipo_prodotto.length) criteri.tipo_prodotto = tipo_prodotto;
  if (fasi_incluse.length) criteri.fasi_incluse  = fasi_incluse;
  if (fasi_escluse.length) criteri.fasi_escluse  = fasi_escluse;

  const btn = document.querySelector('[onclick="creaSchedaKpi()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Calcolo…'; }

  const { data, error } = await sb.rpc('crea_scheda_kpi', {
    p_nome: nome,
    p_criteri: criteri,
    p_responsabile_id: currentUserRow.id,
  });

  if (btn) { btn.disabled = false; btn.textContent = '+ Crea scheda'; }

  if (error || !data?.ok) {
    toast('Errore: ' + (data?.errore || error?.message || 'sconosciuto'), 'error');
    return;
  }
  const camp = data.n_campioni_iniziali;
  toast(`Scheda creata — ${camp} ordine${camp!==1?'i':''} nel campione`);
  document.getElementById('sch-nome').value = '';
  await renderSchedeKpi();
}

async function renderSchedeKpi() {
  const el = document.getElementById('kpi-schede');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);font-size:12px">Caricamento…</div>';

  const { data, error } = await sb.rpc('lista_schede_kpi');
  if (error) { el.innerHTML = '<div class="kpi-empty">Errore caricamento schede</div>'; return; }
  if (!data?.length) { el.innerHTML = '<div class="kpi-empty" style="color:var(--muted)">Nessuna scheda. Usa il form sopra per crearne una.</div>'; return; }

  const varHtml = (pct, label) => {
    if (pct == null) return `<span style="color:var(--muted)">—</span>`;
    const color = pct > 5 ? 'var(--alert)' : pct < -5 ? 'var(--ok)' : 'var(--muted)';
    const icon  = pct > 5 ? '▲' : pct < -5 ? '▼' : '≈';
    return `<span style="color:${color};font-weight:600">${icon} ${Math.abs(pct).toFixed(1)}%</span>
            <span style="color:var(--muted);font-size:10px"> ${pct > 0 ? 'peggiorato' : pct < 0 ? 'migliorato' : 'stabile'}</span>`;
  };

  const criteriHtml = c => {
    const parti = [];
    if (c.struttura?.length)    parti.push('Struttura: ' + c.struttura.map(strutturaLabel).join(', '));
    if (c.materiale?.length)    parti.push('Materiale: ' + c.materiale.map(materialeLabel).join(', '));
    if (c.tipo_prodotto?.length) parti.push('Tipo: ' + c.tipo_prodotto.map(tipoProdLabel).join(', '));
    if (c.fasi_incluse?.length)  parti.push('Con fasi: ' + c.fasi_incluse.join(', '));
    if (c.fasi_escluse?.length)  parti.push('Senza fasi: ' + c.fasi_escluse.join(', '));
    return parti.length ? parti.join(' · ') : '(tutti gli ordini)';
  };

  el.innerHTML = data.map(s => {
    const scarso = (s.n_campioni_correnti || 0) < (Calendario.costante('soglia_campioni_gen') ?? 0);
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:600">${escapeHtml(s.nome)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${escapeHtml(criteriHtml(s.criteri))}</div>
        </div>
        <button class="btn btn-secondary" style="padding:3px 10px;font-size:11px;color:var(--alert)"
          onclick="eliminaSchedaKpi('${s.id}','${escapeJsAttr(s.nome)}')">Elimina</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--bg);border-radius:6px;padding:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Ore lavorazione interna</div>
          <div style="display:flex;gap:16px;align-items:baseline">
            <span style="font-family:var(--font-mono);font-size:14px">${s.ore_interne_correnti != null ? s.ore_interne_correnti + 'h' : '—'}</span>
            <span style="font-size:11px;color:var(--muted)">era ${s.ore_interne_iniziali != null ? s.ore_interne_iniziali + 'h' : '—'}</span>
            ${varHtml(s.var_ore_pct, 'ore')}
          </div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:10px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Giorni calendario (creazione → spedizione)</div>
          <div style="display:flex;gap:16px;align-items:baseline">
            <span style="font-family:var(--font-mono);font-size:14px">${s.giorni_calendario_correnti != null ? s.giorni_calendario_correnti + 'gg' : '—'}</span>
            <span style="font-size:11px;color:var(--muted)">era ${s.giorni_calendario_iniziali != null ? s.giorni_calendario_iniziali + 'gg' : '—'}</span>
            ${varHtml(s.var_giorni_pct, 'giorni')}
          </div>
        </div>
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--muted)">
        Campioni correnti: <strong>${s.n_campioni_correnti ?? 0}</strong>
        ${scarso ? '<span style="color:var(--warn);margin-left:4px"><i data-ic="avviso"></i> Dati scarsi (&lt;3 ordini)</span>' : ''}
        · Creata il ${formatDate(s.creata_il)}
        · Campioni al momento della creazione: ${s.n_campioni_iniziali ?? 0}
      </div>
    </div>`;
  }).join('');
}

async function eliminaSchedaKpi(id, nome) {
  if (!confirm(`Eliminare la scheda "${nome}"?`)) return;
  const { data } = await sb.rpc('elimina_scheda_kpi', {
    p_id: id,
    p_responsabile_id: currentUserRow.id,
  });
  if (!data?.ok) { toast('Errore eliminazione: ' + (data?.errore||'sconosciuto'), 'error'); return; }
  toast('Scheda eliminata');
  await renderSchedeKpi();
}

function formatOre(h) {
  if (h < 1) return Math.round(h * 60) + 'm';
  if (h < 24) return h.toFixed(1).replace('.', ',') + 'h';
  const gg = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return gg + 'g ' + (rem > 0 ? rem + 'h' : '');
}
