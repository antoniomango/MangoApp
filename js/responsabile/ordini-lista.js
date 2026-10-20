// responsabile.html — Dashboard, tabella ordini, spedizione unica e multipla, storico spediti.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// Fase attuale di un ordine (solo sul telefono, nella card): la prima in corso, altrimenti la prima disponibile
function _faseAttualeHtml(s) {
  const r = (s.fasiRim || []).find(x => x.inCorso) || (s.fasiRim || [])[0];
  if (!r) return '';
  const f = (typeof fasi !== 'undefined' ? fasi : []).find(x => String(x.id) === String(r.fase_id));
  const nome = r.nome || f?.nome;
  return nome ? `<div class="solo-mobile prog-fase">${r.inCorso ? 'In corso' : 'Prossima'}: ${escapeHtml(nome)}</div>` : '';
}


// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function renderDashboard() {
  const oggi = Calendario.oggiIso();
  const aperti = ordiniCache.filter(o => o.stato === 'aperto').length;
  const ritardo = ordiniCache.filter(o => o.stato === 'aperto' && o.scadenza && o.scadenza < oggi).length;
  const attesa = ordiniCache.filter(o => o.stato === 'attesa_spedizione').length;
  const spediti30 = _spediti30Count;

  document.getElementById('kpi-aperti').textContent = aperti;
  document.getElementById('kpi-ritardo').textContent = ritardo;
  document.getElementById('kpi-attesa').textContent = attesa;
  document.getElementById('kpi-spediti').textContent = spediti30;
  document.getElementById('dash-subtitle').textContent =
    `${new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}`;

  renderOrdiniTable();
}

// ═══════════════════════════════════════════════
// SPEDIZIONE UNICA — raggruppamento ordini (clienti diversi solo se tutti da spedire)
// ═══════════════════════════════════════════════
let modalitaRaggruppamento = false;
let selezioneRaggruppamento = new Set();

// Le due modalità di selezione (raggruppamento e spedizione multipla) sono mutuamente
// esclusive — la stessa riga/checkbox nella tabella non può servire a due scopi insieme.
// Disattiva SOLO l'altra modalità (mai la propria: nessuna ricorsione fra i due toggle).
function disattivaModalitaSpedizioneMultipla() {
  if (!modalitaSpedizioneMultipla) return;
  modalitaSpedizioneMultipla = false;
  selezioneSpedizioneMultipla.clear();
  const toolbar = document.getElementById('sped-multi-toolbar');
  const btn = document.getElementById('btn-tog-sped-multi');
  if (toolbar) toolbar.style.display = 'none';
  if (btn) btn.innerHTML = '<i data-ic="camion"></i> Spedisci multipli';
}

function toggleModalitaRaggruppamento() {
  modalitaRaggruppamento = !modalitaRaggruppamento;
  selezioneRaggruppamento.clear();
  if (modalitaRaggruppamento) disattivaModalitaSpedizioneMultipla();
  const toolbar = document.getElementById('raggruppa-toolbar');
  const btn = document.getElementById('btn-tog-raggruppa');
  if (toolbar) toolbar.style.display = modalitaRaggruppamento ? 'flex' : 'none';
  if (btn) btn.innerHTML = modalitaRaggruppamento ? '✕ Annulla raggruppamento' : '<i data-ic="pacco"></i> Raggruppa per spedizione';
  aggiornaContatoreRaggruppamento();
  renderOrdiniTable();
}

function toggleSelezioneOrdine(id) {
  if (selezioneRaggruppamento.has(id)) selezioneRaggruppamento.delete(id);
  else selezioneRaggruppamento.add(id);
  aggiornaContatoreRaggruppamento();
  renderOrdiniTable();
}

function aggiornaContatoreRaggruppamento() {
  const el = document.getElementById('raggruppa-count');
  if (!el) return;
  const n = selezioneRaggruppamento.size;
  el.textContent = `${n} ${n === 1 ? 'ordine selezionato' : 'ordini selezionati'}`;
  const t = document.getElementById('raggruppa-testo'); if (t) t.textContent = Etichette.spedizioneUnica.selezione;
}

// Codici degli altri ordini nello stesso gruppo — ricavati dalla lista ordini già in cache,
// nessuna query aggiuntiva (ordiniCache copre già aperto/sospeso/attesa_spedizione).
// Gruppo per l'etichetta (Etichette.spedizioneUnica): nome dalla cache, clienti dagli ordini aperti in cache
function gruppoSpedizioneInfo(gruppoId) {
  const membri = ordiniCache.filter(o => o.gruppo_spedizione_id === gruppoId);
  return { id: gruppoId, nome: gruppiSpedizioneCache[gruppoId]?.nome || null, ordini: membri.map(o => ({ id: o.id, codice: o.codice, cliente: o.cliente })) };
}

async function eseguiRaggruppamentoSpedizione() {
  const ids = [...selezioneRaggruppamento];
  if (ids.length < 2) { toast('Seleziona almeno 2 ordini da raggruppare', 'err'); return; }

  // Se una parte della selezione appartiene già a una spedizione unica, riusa quel gruppo
  // (chiamando la stessa RPC con p_gruppo_id valorizzato) invece di crearne uno nuovo che
  // lascerebbe orfano il gruppo precedente.
  const selObj = ids.map(id => ordiniCache.find(o => o.id === id)).filter(Boolean);
  const gruppiEsistenti = [...new Set(selObj.map(o => o.gruppo_spedizione_id).filter(Boolean))];
  if (gruppiEsistenti.length > 1) {
    toast('Gli ordini selezionati appartengono già a spedizioni diverse: rimuovili da un gruppo prima di unirli', 'err');
    return;
  }

  const { data, error } = await sb.rpc('crea_o_aggiorna_gruppo_spedizione', {
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
    p_ordine_ids: ids,
    p_gruppo_id: gruppiEsistenti[0] || null
  });
  if (error || !data?.ok) {
    toast(Etichette.spedizioneUnica.errori[data?.errore] || ('Errore: ' + (data?.errore || error?.message || 'sconosciuto')), 'err');
    return;
  }
  toast(`Spedizione unica aggiornata: ${data.ordini.map(x => x.codice).join(', ')}`, 'ok');
  toggleModalitaRaggruppamento();
  await loadOrdini();
  renderOrdiniTable();
}

// ═══════════════════════════════════════════════
// SPEDIZIONE MULTIPLA — seleziona più ordini "in attesa corriere" e segnali spediti in blocco
// ═══════════════════════════════════════════════
// Nessuna RPC nuova: chiama segna_spedito() (già usata dal pulsante singolo) in sequenza per
// ogni ordine selezionato — non in parallelo, così un errore su un ordine (es. qualcuno lo
// sospende mentre si sta selezionando) è attribuibile a quello specifico ordine, non confuso
// con gli altri. Modalità separata da "Raggruppa per spedizione" sopra: scopo diverso
// (raggruppare più ordini in UNA spedizione fisica vs. segnare più ordini spediti in blocco),
// mutuamente esclusiva con quella per non sovraccaricare lo stesso checkbox di riga.
let modalitaSpedizioneMultipla = false;
let selezioneSpedizioneMultipla = new Set();

function disattivaModalitaRaggruppamento() {
  if (!modalitaRaggruppamento) return;
  modalitaRaggruppamento = false;
  selezioneRaggruppamento.clear();
  const toolbar = document.getElementById('raggruppa-toolbar');
  const btn = document.getElementById('btn-tog-raggruppa');
  if (toolbar) toolbar.style.display = 'none';
  if (btn) btn.innerHTML = '<i data-ic="pacco"></i> Raggruppa per spedizione';
}

function toggleModalitaSpedizioneMultipla() {
  modalitaSpedizioneMultipla = !modalitaSpedizioneMultipla;
  selezioneSpedizioneMultipla.clear();
  if (modalitaSpedizioneMultipla) disattivaModalitaRaggruppamento();
  const toolbar = document.getElementById('sped-multi-toolbar');
  const btn = document.getElementById('btn-tog-sped-multi');
  if (toolbar) toolbar.style.display = modalitaSpedizioneMultipla ? 'flex' : 'none';
  if (btn) btn.innerHTML = modalitaSpedizioneMultipla ? '✕ Annulla selezione' : '<i data-ic="camion"></i> Spedisci multipli';
  aggiornaContatoreSpedizioneMultipla();
  renderOrdiniTable();
}

function toggleSelezioneSpedizioneMultipla(id) {
  if (selezioneSpedizioneMultipla.has(id)) selezioneSpedizioneMultipla.delete(id);
  else selezioneSpedizioneMultipla.add(id);
  aggiornaContatoreSpedizioneMultipla();
  renderOrdiniTable();
}

function aggiornaContatoreSpedizioneMultipla() {
  const el = document.getElementById('sped-multi-count');
  if (!el) return;
  const n = selezioneSpedizioneMultipla.size;
  el.textContent = `${n} ${n === 1 ? 'ordine selezionato' : 'ordini selezionati'}`;
}

async function eseguiSpedizioneMultipla() {
  const ids = [...selezioneSpedizioneMultipla];
  if (!ids.length) { toast('Seleziona almeno un ordine da spedire', 'err'); return; }
  if (!confirm(`Segnare come spediti ${ids.length} ${ids.length === 1 ? 'ordine' : 'ordini'}? L'azione è irreversibile.`)) return;

  let successi = 0;
  const errori = [];
  // Sequenziale, non Promise.all: se un ordine fallisce (es. qualcuno lo sospende mentre lo si
  // seleziona) l'errore resta attribuibile a quello specifico ordine, e non rischia di far
  // fallire in modo indistinto anche le chiamate sugli altri ordini della selezione.
  for (const id of ids) {
    const codice = ordiniCache.find(o => o.id === id)?.codice || id;
    const { data, error } = await sb.rpc('segna_spedito', { p_ordine_id: id, p_utente_id: currentUserRow.id });
    if (error || !data?.ok) {
      errori.push(`${codice}: ${data?.errore || error?.message || 'errore sconosciuto'}`);
    } else {
      successi++;
    }
  }

  if (errori.length) {
    toast(`${successi} ${successi === 1 ? 'ordine spedito' : 'ordini spediti'}, ${errori.length} error${errori.length === 1 ? 'e' : 'i'}: ${errori.join(' — ')}`, 'err');
  } else {
    toast(`${successi} ${successi === 1 ? 'ordine spedito' : 'ordini spediti'}, 0 errori`, 'ok');
  }

  toggleModalitaSpedizioneMultipla();
  await loadOrdini();
  renderDashboard();
  renderOrdiniTable();
}

function apriPannelloGruppoSpedizione(gruppoId) {
  const membri = ordiniCache.filter(o => o.gruppo_spedizione_id === gruppoId);
  const body = document.getElementById('modal-gruppo-spedizione-body');
  if (!body) return;
  const g = gruppoSpedizioneInfo(gruppoId);
  const cons = membri[0]?.modalita_consegna;
  const candidati = cons === 'da_spedire'
    ? ordiniCache.filter(o => !o.gruppo_spedizione_id && o.modalita_consegna === 'da_spedire' && !o.risposta_cliente_consegna)
        .sort((a, b) => String(a.cliente || '').localeCompare(String(b.cliente || ''), 'it') || String(a.codice || '').localeCompare(String(b.codice || ''), 'it'))
    : [];
  const T = Etichette.spedizioneUnica;
  const intestazione = membri.length ? `
    <div style="font-weight:600;margin-bottom:4px">${escapeHtml(T.etichetta(g))}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${T.clientiDelGruppo}: ${escapeHtml(T.clienti(g).join(', '))}</div>
    <label style="font-size:12px;color:var(--muted)">${T.nomeEtichetta}</label>
    <div style="display:flex;gap:8px;margin:4px 0 12px">
      <input type="text" id="gs-nome" maxlength="60" value="${escapeHtml(g.nome || '')}" placeholder="${escapeHtml(T.nomeSegnaposto)}">
      <button class="btn btn-secondary" style="width:auto;padding:6px 12px;font-size:12px" onclick="salvaNomeGruppoSpedizione('${gruppoId}')">Salva</button>
    </div>` : '';
  const aggiungi = membri.length && cons === 'da_spedire' ? (candidati.length ? `
    <div style="margin-top:14px"><label style="font-size:12px;color:var(--muted)">${T.aggiungi}</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <select id="gs-aggiungi"><option value="">${T.aggiungiScegli}</option>${candidati.map(o => `<option value="${o.id}">${escapeHtml(o.cliente || '')} — ${escapeHtml(o.codice || '—')}</option>`).join('')}</select>
        <button class="btn btn-primary" style="width:auto;padding:6px 12px;font-size:12px" onclick="aggiungiAlGruppoSpedizione('${gruppoId}')">${T.aggiungiBottone}</button>
      </div></div>` : `<p style="color:var(--muted);font-size:12px;margin-top:14px">${T.nessunoDaAggiungere}</p>`) : '';
  body.innerHTML = intestazione + (membri.length
    ? membri.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-weight:600">${escapeHtml(o.cliente)}</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--muted)">${escapeHtml(o.codice || '—')}</div></div>
        <button class="btn btn-alert" style="width:auto;padding:6px 12px;font-size:12px" onclick="rimuoviDalGruppoSpedizione('${o.id}','${escapeJsAttr(o.codice || '')}')">Rimuovi dal gruppo</button>
      </div>`).join('')
    : '<p style="color:var(--muted)">Nessun ordine in questo gruppo.</p>') + aggiungi;
  document.getElementById('modal-gruppo-spedizione').classList.add('open');
}

async function salvaNomeGruppoSpedizione(gruppoId) {
  const nome = document.getElementById('gs-nome')?.value ?? '';
  const { data, error } = await sb.rpc('imposta_nome_gruppo_spedizione', { p_gruppo_id: gruppoId, p_nome: nome, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(Etichette.spedizioneUnica.errori[data?.errore] || ('Errore: ' + (data?.errore || error?.message || 'sconosciuto')), 'err'); return; }
  toast(Etichette.spedizioneUnica.nomeSalvato, 'ok');
  await loadOrdini();
  apriPannelloGruppoSpedizione(gruppoId);
  renderOrdiniTable();
}

async function aggiungiAlGruppoSpedizione(gruppoId) {
  const ordineId = document.getElementById('gs-aggiungi')?.value;
  if (!ordineId) { toast(Etichette.spedizioneUnica.aggiungiScegli, 'err'); return; }
  const { data, error } = await sb.rpc('crea_o_aggiorna_gruppo_spedizione', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_ordine_ids: [ordineId], p_gruppo_id: gruppoId });
  if (error || !data?.ok) { toast(Etichette.spedizioneUnica.errori[data?.errore] || ('Errore: ' + (data?.errore || error?.message || 'sconosciuto')), 'err'); return; }
  await loadOrdini();
  apriPannelloGruppoSpedizione(gruppoId);
  renderOrdiniTable();
}

async function rimuoviDalGruppoSpedizione(ordineId, codice) {
  if (!confirm(`Rimuovere l'ordine ${codice || ''} dalla spedizione unica?`)) return;
  const { data, error } = await sb.rpc('rimuovi_ordine_da_gruppo_spedizione', {
    p_responsabile_id: currentUserRow.id,
    p_session_token: null,
    p_ordine_id: ordineId
  });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || 'sconosciuto'), 'err'); return; }
  toast(data.gruppo_sciolto ? 'Ordine rimosso — la spedizione unica è stata sciolta' : 'Ordine rimosso dalla spedizione unica', 'ok');
  await loadOrdini();
  closeModal('modal-gruppo-spedizione');
  renderOrdiniTable();
}

function ordineRow(o, mini = false) {
  const scad = o.scadenza ? formatDate(o.scadenza) : '—';
  const isLate = o.scadenza && o.scadenza < Calendario.oggiIso() && o.stato === 'aperto';
  const isAttesa = o.stato === 'attesa_spedizione';
  const isSosp = o.stato === 'sospeso';
  const rowClass = isAttesa ? 'style="background:var(--ok-bg)"' : isSosp ? 'style="background:var(--warn-bg);opacity:0.85"' : '';
  const inSelModeRagg = modalitaRaggruppamento && !mini;
  // Nel modo "spedisci multipli" solo le righe già "in attesa corriere" sono selezionabili —
  // le altre restano cliccabili come sempre (apre il dettaglio), non hanno una checkbox.
  const inSelModeSpedRiga = modalitaSpedizioneMultipla && !mini && isAttesa;
  const nascondiAzioni = inSelModeRagg || (modalitaSpedizioneMultipla && !mini);
  const rowOnclick = inSelModeRagg ? `toggleSelezioneOrdine('${o.id}')`
    : inSelModeSpedRiga ? `toggleSelezioneSpedizioneMultipla('${o.id}')`
    : `openDettaglioOrdine('${o.id}')`;
  const checkbox = inSelModeRagg
    ? `<input type="checkbox" ${selezioneRaggruppamento.has(o.id) ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:2px" onclick="event.stopPropagation()" onchange="toggleSelezioneOrdine('${o.id}')">`
    : inSelModeSpedRiga
      ? `<input type="checkbox" ${selezioneSpedizioneMultipla.has(o.id) ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;flex-shrink:0;margin-top:2px" onclick="event.stopPropagation()" onchange="toggleSelezioneSpedizioneMultipla('${o.id}')">`
      : '';
  const fratelli = !mini ? codiciFratelliGruppo(o, ordiniCache) : [];
  const gInfo = fratelli.length ? gruppoSpedizioneInfo(o.gruppo_spedizione_id) : null;
  const testoGruppo = !gInfo ? '' : Etichette.spedizioneUnica.distintiva(gInfo)
    ? Etichette.spedizioneUnica.riga(gInfo, gInfo.ordini.map(x => x.codice || '—'))
    : 'Spedizione unica con ' + fratelli.join(', ');
  const badgeGruppoSolo = fratelli.length
    ? `<div style="margin-top:4px;font-size:11px;color:var(--accent);cursor:pointer;text-decoration:underline;text-underline-offset:2px" onclick="event.stopPropagation();apriPannelloGruppoSpedizione('${o.gruppo_spedizione_id}')"><i data-ic="pacco"></i> ${escapeHtml(testoGruppo)}</div>`
    : '';
  const nonProntiGruppo = !mini && o.gruppo_spedizione_id ? (spedizioniNonProntePerGruppo[o.gruppo_spedizione_id] || []) : [];
  const badgeNonPronta = nonProntiGruppo.map(m => `<div style="margin-top:4px;font-size:11px;font-weight:600;color:var(--warn)"><i data-ic="avviso"></i> ${escapeHtml(Etichette.spedizioneUnica.nonProntaRiga(m.codice || '—', m.fasi))}</div>`).join('');
  const badgeGruppo = badgeGruppoSolo + badgeNonPronta + badgeConsegnaHtml(o);
  return `<tr class="clickable ${isSosp ? '' : scadenzaClass(o.scadenza)}" data-scad="${isSosp ? '' : scadenzaClass(o.scadenza)}" ${rowClass} onclick="${rowOnclick}">
    <td class="c-cliente"><div style="display:flex;align-items:flex-start;gap:8px">${checkbox}<div><div style="font-weight:600">${escapeHtml(o.cliente)}</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${escapeHtml(o.codice||'—')}</div>${badgeGruppo}</div></div></td>
    <td class="c-tipo">${o.tipo === 'extra' ? '<span style="font-weight:600;color:var(--accent)">Ordine Extra</span>' : `${strutturaLabel(o.struttura)} / ${tipoProdLabel(o.tipo_prodotto)}`}</td>
    <td class="c-prio">${Etichette.badgePriorita(o.priorita)}</td>
    <td class="c-qta" style="text-align:center;font-weight:600">${o.quantita || 1}</td>
    <td class="c-scad"><div style="color:${isLate ? 'var(--alert-strong)' : 'inherit'};font-weight:${isLate ? '700' : 'normal'}">${scad}${isLate ? ' <i data-ic="avviso"></i>' : ''}</div><div id="scad-stima-${o.id}" style="font-size:10px;margin-top:2px"></div></td>
    <td class="c-stato"><span class="badge badge-${o.stato}">${statoLabel(o.stato, o)}</span></td>
    <td class="c-avanz" id="prog-${o.id}" style="min-width:120px">—</td>
    <td class="c-azioni">${nascondiAzioni ? '' : (o.stato === 'aperto'
        ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();sospendi('${o.id}')">Sospendi</button>`
        : o.stato === 'attesa_spedizione'
          ? `<button class="btn btn-ok" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();segnaSpedito('${o.id}')"><i data-ic="pacco"></i> ${Etichette.ritiraOrdine(o) ? 'Ritirato' : 'Spedisci'}</button>`
          : `<button class="btn btn-ok" style="padding:4px 10px;font-size:12px" onclick="event.stopPropagation();riattiva('${o.id}')">Riattiva</button>`)}</td>
  </tr>`;
}

// Ricalcola stime per tutti gli ordini attivi (chiamato da realtime e fine turno)
async function refreshStime() {
  const ids = ordiniCache.filter(o => o.stato === 'aperto').map(o => o.id);
  if (ids.length) await loadAvanzamenti(ids);
  // Se la pianificazione è visibile, ricarica anche quella (ha la sua fetch dei dati aggiornati)
  if (document.getElementById('sec-pianificazione')?.classList.contains('active')) {
    await caricaDisponibilitaPanel();
    if (!_pianoDataSel) await renderPianificazione();
  }
}

// Schedula ricalcolo automatico a fine turno (quando il giorno lavorativo scorre avanti)
function scheduleEndOfShiftRefresh() {
  if (!orarioConfig?.ora_fine) return;
  const [h, m] = orarioConfig.ora_fine.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // già passato oggi → domani
  const ms = target - now;
  setTimeout(async () => {
    await refreshStime();
    scheduleEndOfShiftRefresh(); // ripianifica per il giorno dopo
  }, ms);
}

// Carica avanzamento fasi per tutti gli ordini visibili
async function loadAvanzamenti(ids) {
  if (!ids.length) return;

  // Separa ordini standard da extra
  const extraIds = ids.filter(id => ordiniCache.concat(ordiniSpeditiCache).find(o => o.id === id)?.tipo === 'extra');
  const stdIds   = ids.filter(id => !extraIds.includes(id));

  const map = {};

  // Ordini standard → ordine_fasi
  if (stdIds.length) {
    const { data } = await sb.from('ordine_fasi').select('ordine_id, stato, fase_id').in('ordine_id', stdIds);
    (data || []).forEach(f => {
      if (!map[f.ordine_id]) map[f.ordine_id] = { tot: 0, done: 0, inCorso: 0, fasiRim: [] };
      if (f.stato === 'non_applicabile') return;
      const isEsterna = faseEsternaSet.has(parseInt(f.fase_id));
      map[f.ordine_id].tot++;
      if (f.stato === 'completata') map[f.ordine_id].done++;
      if (f.stato === 'in_corso') map[f.ordine_id].inCorso++;
      if (f.stato === 'disponibile' || f.stato === 'in_corso') {
        map[f.ordine_id].fasiRim.push({ fase_id: f.fase_id, inCorso: f.stato === 'in_corso', esterna: isEsterna });
      } else if (f.stato === 'in_attesa' && isEsterna) {
        // Fase esterna già inviata al fornitore: contribuisce al tempo cliente (0.5x = circa a metà)
        map[f.ordine_id].fasiRim.push({ fase_id: f.fase_id, inCorso: true, esterna: true });
      }
    });
  }

  // Ordini extra → fasi_ordine_extra
  if (extraIds.length) {
    const { data } = await sb.from('fasi_ordine_extra')
      .select('ordine_id, nome, stato, e_attesa_esterna')
      .in('ordine_id', extraIds);
    (data || []).forEach(f => {
      if (!map[f.ordine_id]) map[f.ordine_id] = { tot: 0, done: 0, inCorso: 0, fasiRim: [] };
      map[f.ordine_id].tot++;
      if (f.stato === 'completata') map[f.ordine_id].done++;
      if (f.stato === 'in_corso') map[f.ordine_id].inCorso++;
    });
    // ETA per ordini extra (mediana per nome, fallback globale, poi kpi_config default=30)
    const allExtraVals = Object.values(faseExtraMediaMinutiMap).filter(v => v > 0);
    allExtraVals.sort((a, b) => a - b);
    const extraFallback = allExtraVals.length ? allExtraVals[Math.floor(allExtraVals.length / 2)] : 30;
    (data || []).filter(f => f.stato !== 'completata' && !f.e_attesa_esterna).forEach(f => {
      const med = faseExtraMediaMinutiMap[f.nome?.toLowerCase()] ?? extraFallback;
      const contrib = f.stato === 'in_corso' ? med * Calendario.costante('fattore_fase_in_corso') : med;
      _etaMinutiCache[f.ordine_id] = (_etaMinutiCache[f.ordine_id] || 0) + contrib;
    });
  }

  const minutiGiorno = Calendario.minutiGiorno();   // giornata tipo dal calendario unico (server)

  // Costruisce fasiMap nel formato atteso da buildEtaFromFasi (con flag esterna)
  const fasiMap = {};
  ids.forEach(id => {
    const s = map[id];
    fasiMap[id] = (s?.fasiRim || []).map(f => ({
      fase_id: f.fase_id,
      stato: f.inCorso ? 'in_corso' : 'disponibile',
      esterna: f.esterna || false,
    }));
  });
  const stdOrdini = ids.map(id => ordiniCache.find(o => o.id === id)).filter(Boolean);
  const etaMinutiPerOrdine = buildEtaFromFasi(stdOrdini, fasiMap);

  // Ordina per scadenza per render
  const idsSorted = [...ids].sort((a, b) => {
    const oa = ordiniCache.find(o => o.id === a);
    const ob = ordiniCache.find(o => o.id === b);
    if (!oa?.scadenza && !ob?.scadenza) return 0;
    if (!oa?.scadenza) return 1;
    if (!ob?.scadenza) return -1;
    return oa.scadenza.localeCompare(ob.scadenza);
  });

  idsSorted.forEach(id => {
    const el = document.getElementById('prog-' + id);
    if (!el) return;
    const s = map[id] || { tot: 0, done: 0, inCorso: 0, fasiRim: [] };
    const pct = s.tot > 0 ? Math.round((s.done / s.tot) * 100) : 0;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;background:var(--border);border-radius:4px;height:6px">
          <div style="width:${pct}%;background:var(--ok);border-radius:4px;height:100%"></div>
        </div>
        <span style="font-size:11px;color:var(--muted);font-family:var(--font-mono);white-space:nowrap">${s.done}/${s.tot}${s.inCorso > 0 ? ` (${s.inCorso} <i data-ic="play"></i>)` : ''}</span>
      </div>${_faseAttualeHtml(s)}`;

    const tr = el.closest('tr');
    if (!tr) return;

    const scadCls = tr.dataset.scad || '';
    tr.classList.remove('riga-in-corso', 'riga-in-corso-danger', 'riga-in-corso-warning', 'scad-danger', 'scad-warning');
    if (s.inCorso > 0) {
      if (scadCls === 'scad-danger')       tr.classList.add('riga-in-corso-danger');
      else if (scadCls === 'scad-warning') tr.classList.add('riga-in-corso-warning');
      else                                 tr.classList.add('riga-in-corso');
    } else {
      if (scadCls) tr.classList.add(scadCls);
    }

    const ordine = ordiniCache.find(o => o.id === id);
    const stimaEl = document.getElementById('scad-stima-' + id);
    tr.classList.remove('scad-rischio');
    if (stimaEl) stimaEl.innerHTML = '';

    const minTotale = etaMinutiPerOrdine[id];
    if (minTotale > 0) {
      const giorniRimanenti = Math.ceil(minTotale / minutiGiorno);
      const dataStimata = Calendario.aggiungiGiorniLavorativi(Calendario.oggiIso(), giorniRimanenti);
      const dataStimataStr = dataStimata.toISOString().split('T')[0];
      const isRischio = ordine?.scadenza && dataStimataStr > ordine.scadenza;
      if (isRischio) tr.classList.add('scad-rischio');
      if (stimaEl) {
        const stimaFmt = dataStimata.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit' });
        const color = isRischio ? 'var(--warn-ink-2)' : 'var(--muted)';
        const icon = isRischio ? '<i data-ic="avviso"></i>' : '<i data-ic="previsione"></i>';
        stimaEl.innerHTML = `<span style="color:${color}">${icon} stima: ${stimaFmt}</span>`;
      }
    }
  });
}

// Render ordini e carica avanzamenti
function renderOrdiniTable() {
  const search = document.getElementById('ord-search')?.value.toLowerCase() || '';
  const stato = document.getElementById('ord-stato')?.value || '';
  const prio = document.getElementById('ord-priorita')?.value || '';
  const struttura = document.getElementById('flt-struttura')?.value || '';
  const tipoProd = document.getElementById('flt-tipo-prodotto')?.value || '';

  let filtered = ordiniCache.filter(o => {
    if (stato && o.stato !== stato) return false;
    if (prio && o.priorita !== prio) return false;
    if (struttura && o.struttura !== struttura) return false;
    if (tipoProd && o.tipo_prodotto !== tipoProd) return false;
    if (search && !(o.cliente || '').toLowerCase().includes(search) && !(o.codice || '').toLowerCase().includes(search)) return false;
    return true;
  });

  const tbody = document.getElementById('ordini-tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon"><i data-ic="appunti"></i></div><p>Nessun ordine trovato</p></div></td></tr>';
    return;
  }
  // attesa_spedizione → gruppo '0000-00' (in cima), poi per mese di scadenza
  const meseKey = (o) => o.stato === 'attesa_spedizione' ? '0000-00' : (o.scadenza ? o.scadenza.substring(0, 7) : '9999-99');
  let meseCorrente = null;
  tbody.innerHTML = filtered.map(o => {
    const meseDato = meseKey(o);
    let sep = '';
    if (meseDato !== meseCorrente) {
      meseCorrente = meseDato;
      const label = meseDato === '0000-00'
        ? '<i data-ic="pacco"></i> In attesa corriere'
        : meseDato === '9999-99'
          ? 'Senza scadenza'
          : new Date(meseDato + '-02').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
      sep = `<tr><td colspan="8" style="padding:6px 12px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;background:var(--bg);border-top:2px solid var(--border)"><i data-ic="calendario"></i> ${label}</td></tr>`;
    }
    return sep + ordineRow(o);
  }).join('');
  loadAvanzamenti(filtered.map(o => o.id));
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════
// ─── Rispetto Scadenze — Completamento Produzione ────────────────────────────
function openModalStoricoSpediti(filtroMese) {
  // Dataset: ordini con completato_il valorizzato da entrambe le cache
  // - ordiniSpeditiCache: stato='spedito' (include archiviati)
  // - ordiniCache filtrata per attesa_spedizione: produzione finita ma non ancora ritirata
  const ordini = [
    ...ordiniSpeditiCache,
    ...ordiniCache.filter(o => o.stato === 'attesa_spedizione'),
  ].filter(o => o.completato_il);

  // Partizione per scadenza (base: completato_il vs scadenza)
  const conScadenza   = ordini.filter(o => o.scadenza);
  const senzaScadenza = ordini.filter(o => !o.scadenza);

  const inTempo = conScadenza.filter(o => o.completato_il.split('T')[0] <= o.scadenza);
  const fuori   = conScadenza.filter(o => o.completato_il.split('T')[0] >  o.scadenza)
    .map(o => {
      const ritardoMs = new Date(o.completato_il.split('T')[0]) - new Date(o.scadenza);
      return { ...o, ritardoGiorni: Math.round(ritardoMs / 86400000) };
    })
    .sort((a, b) => b.ritardoGiorni - a.ritardoGiorni);

  const totConScad = conScadenza.length;
  const pctTempo   = totConScad ? Math.round(inTempo.length / totConScad * 100) : null;
  const pctFuori   = totConScad ? 100 - pctTempo : null;

  // Raggruppa per mese di completato_il
  const mesiMap = {};
  for (const o of ordini) {
    const mese = o.completato_il.slice(0, 7); // 'YYYY-MM'
    if (!mesiMap[mese]) mesiMap[mese] = { totale: 0, spediti: 0, inAttesa: 0, conScad: 0, inTempo: 0, fuori: [] };
    mesiMap[mese].totale++;
    if (o.stato === 'spedito') mesiMap[mese].spediti++;
    else                       mesiMap[mese].inAttesa++;
    if (o.scadenza) {
      mesiMap[mese].conScad++;
      const cDate = o.completato_il.split('T')[0];
      if (cDate <= o.scadenza) {
        mesiMap[mese].inTempo++;
      } else {
        const ritardoMs = new Date(cDate) - new Date(o.scadenza);
        mesiMap[mese].fuori.push({ ...o, ritardoGiorni: Math.round(ritardoMs / 86400000) });
      }
    }
  }
  const mesiOrd = Object.keys(mesiMap).sort((a, b) => b.localeCompare(a));

  const fmtMese = (ym) => {
    const [y, m] = ym.split('-');
    const nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    return `${nomi[parseInt(m) - 1]} ${y}`;
  };

  // ── Riquadro riepilogo generale ──
  let html = '<div style="margin-bottom:20px">';
  html += `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">Base: data completamento produzione (non spedizione)</div>`;
  if (pctTempo !== null) {
    html += `
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:22px;font-weight:700;color:var(--ok)">${pctTempo}% nei tempi</span>
        <span style="font-size:15px;color:var(--alert);font-weight:600">${pctFuori}% fuori scadenza</span>
        <span style="font-size:13px;color:var(--muted)">(su ${totConScad} ordini con scadenza)</span>
      </div>
      <div style="height:10px;border-radius:5px;overflow:hidden;background:var(--border);margin-bottom:8px">
        <div style="height:100%;width:${pctTempo}%;background:var(--ok);display:inline-block;border-radius:5px 0 0 5px"></div>
        <div style="height:100%;width:${pctFuori}%;background:var(--alert);display:inline-block;border-radius:${pctTempo===0?'5px':'0'} 5px 5px ${pctTempo===0?'5px':'0'}"></div>
      </div>`;
  } else {
    html += `<p style="color:var(--muted);font-style:italic">Nessun ordine con scadenza nel periodo.</p>`;
  }
  if (senzaScadenza.length) {
    html += `<div style="font-size:12px;color:var(--muted);margin-top:4px">${senzaScadenza.length} ordini senza scadenza impostata (esclusi dal calcolo %)</div>`;
  }
  html += '</div>';

  // ── Modalità mese singolo ──
  if (filtroMese) {
    const m = mesiMap[filtroMese];
    const righe = (m?.fuori || []).sort((a, b) => b.ritardoGiorni - a.ritardoGiorni);
    html += `<div style="margin-bottom:12px">
      <button class="btn btn-secondary" style="font-size:12px;padding:4px 10px" onclick="openModalStoricoSpediti(null)">← Tutti i mesi</button>
      <span style="font-size:14px;font-weight:600;margin-left:10px">Fuori scadenza — ${fmtMese(filtroMese)}</span>
    </div>`;
    if (!righe.length) {
      html += `<p style="color:var(--ok);font-style:italic">Nessun ordine fuori scadenza in questo mese.</p>`;
    } else {
      html += _htmlTabFuori(righe);
    }
    document.getElementById('modal-spediti-body').innerHTML = html;
    document.getElementById('modal-spediti').classList.add('open');
    return;
  }

  // ── Lista mensile ──
  if (mesiOrd.length) {
    html += `<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">`;
    for (const ym of mesiOrd) {
      const m = mesiMap[ym];
      const pM   = m.conScad ? Math.round(m.inTempo / m.conScad * 100) : null;
      const pMko = pM !== null ? 100 - pM : null;
      const hasFuori = m.fuori.length > 0;
      // Etichetta spediti vs in attesa
      const statoLabel = m.inAttesa > 0
        ? `${m.spediti} spediti, ${m.inAttesa} in attesa corriere`
        : `${m.spediti} spediti`;
      html += `
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-weight:600;min-width:64px">${fmtMese(ym)}</span>
            <span style="font-size:13px;color:var(--muted)">${m.totale} completati — ${statoLabel}</span>
            ${pM !== null
              ? `<span style="font-size:13px;color:var(--ok)">${pM}% nei tempi</span>
                 ${hasFuori ? `<span style="font-size:13px;color:var(--alert)">${m.fuori.length} fuori scadenza</span>` : ''}`
              : `<span style="font-size:12px;color:var(--muted);font-style:italic">nessuna scadenza impostata</span>`}
            ${hasFuori
              ? `<button class="btn btn-secondary" style="font-size:11px;padding:3px 8px;margin-left:auto" onclick="openModalStoricoSpediti('${ym}')">Dettaglio ritardi</button>`
              : ''}
          </div>
          ${pM !== null ? `
          <div style="height:6px;border-radius:3px;overflow:hidden;background:var(--border);margin-top:8px">
            <div style="height:100%;width:${pM}%;background:var(--ok);display:inline-block;border-radius:3px 0 0 3px"></div>
            <div style="height:100%;width:${pMko}%;background:var(--alert);display:inline-block;border-radius:${pM===0?'3px':'0'} 3px 3px ${pM===0?'3px':'0'}"></div>
          </div>` : ''}
        </div>`;
    }
    html += `</div>`;
  } else {
    html += `<p style="color:var(--muted);font-style:italic">Nessun ordine completato trovato.</p>`;
  }

  // ── Elenco globale fuori scadenza ──
  if (fuori.length) {
    html += `
      <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--alert)">
          Tutti gli ordini fuori scadenza (${fuori.length})
        </div>
        ${_htmlTabFuori(fuori)}
      </div>`;
  }

  document.getElementById('modal-spediti-body').innerHTML = html;
  document.getElementById('modal-spediti').classList.add('open');
}

function _htmlTabFuori(righe) {
  return `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid var(--border);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em">
            <th style="text-align:left;padding:6px 8px">Codice</th>
            <th style="text-align:left;padding:6px 8px">Cliente</th>
            <th style="text-align:left;padding:6px 8px">Scadenza</th>
            <th style="text-align:left;padding:6px 8px">Completato il</th>
            <th style="text-align:left;padding:6px 8px">Stato</th>
            <th style="text-align:right;padding:6px 8px;color:var(--alert)">Ritardo prod.</th>
          </tr>
        </thead>
        <tbody>
          ${righe.map(o => `
            <tr style="border-bottom:1px solid var(--border)" class="clickable" onclick="openDettaglioOrdine('${o.id}');closeModal('modal-spediti')">
              <td style="padding:7px 8px;font-family:var(--font-mono);font-size:12px">${escapeHtml(o.codice || '—')}</td>
              <td style="padding:7px 8px;font-weight:500">${escapeHtml(o.cliente)}</td>
              <td style="padding:7px 8px">${o.scadenza}</td>
              <td style="padding:7px 8px">${o.completato_il.split('T')[0]}</td>
              <td style="padding:7px 8px">
                ${o.stato === 'spedito'
                  ? '<span style="color:var(--ok);font-size:12px">✓ Spedito</span>'
                  : '<span style="color:var(--warn);font-size:12px"><i data-ic="clessidra"></i> Attesa corriere</span>'}
              </td>
              <td style="padding:7px 8px;text-align:right;font-weight:700;color:var(--alert)">+${o.ritardoGiorni}gg</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}





// Etichette e colori da configurazione / stati di sistema: tutte in js/etichette.js
const prioLabel = (p) => Etichette.prioritaEtichetta(p);
const statoLabel = (s, o) => Etichette.statoOrdine(s, o);
const nomeUtenteOperatore = id => { const u = operatoriCache.find(x => x.id === id); return u ? [u.nome, u.cognome].filter(Boolean).join(' ') : ''; };

// Consegna e avviso al cliente, in forma breve per elenchi e schede (solo per chi non è "da spedire")
function badgeConsegnaHtml(o) {
  if (!o || !o.modalita_consegna || o.modalita_consegna === 'da_spedire') return '';
  const avv = Etichette.statoAvviso(o);
  return `<div style="margin-top:4px;font-size:11px;color:var(--info-ink)"><i data-ic="camion"></i> ${escapeHtml(Etichette.modalitaConsegna(o.modalita_consegna))}${avv ? ' · ' + escapeHtml(avv) : ''}</div>`;
}
const statoFaseLabel = (s) => Etichette.statoFase(s);

function logIcon(a) {
  const m = { 'fase_iniziata': '<i data-ic="play"></i>', 'fase_completata': '✓', 'fase_riassegnata': '↔', 'fase_messa_in_attesa': '<i data-ic="pausa"></i>', 'fase_ripresa': '↩', 'ordine_sospeso': '<i data-ic="pausa"></i>', 'ordine_riattivato': '<i data-ic="play"></i>', 'ordine_spedito': '<i data-ic="pacco"></i>', 'ordine_creato': '✚' };
  return m[a] || '●';
}

function logLabel(a) {
  const m = { 'fase_iniziata': 'Fase iniziata', 'fase_completata': 'Fase completata', 'fase_riassegnata': 'Fase riassegnata', 'fase_messa_in_attesa': 'Fase messa in attesa', 'fase_ripresa': 'Fase ripresa', 'ordine_sospeso': 'Ordine sospeso', 'ordine_riattivato': 'Ordine riattivato', 'ordine_spedito': 'Ordine spedito', 'ordine_creato': 'Ordine creato' };
  return m[a] || a;
}

