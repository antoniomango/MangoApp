// responsabile.html — Dettaglio ordine, azioni sulla fase, riassegna, fasi extra dell'ordine.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// DETTAGLIO ORDINE
// ═══════════════════════════════════════════════
async function openDettaglioOrdine(id) {
  currentOrdineId = id;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-dettaglio').classList.add('active');
  document.getElementById('nav-dashboard').classList.add('active');
  await renderDettaglioOrdine(id);
}

// ─── Note riservate dell'ordine: elenco datato, scrive solo il responsabile ───
const NOTE_RISERVATE_ERRORI = { testo_vuoto: 'scrivi il testo della nota', testo_troppo_lungo: 'massimo 2000 caratteri', nota_non_trovata: "nota non trovata (forse cancellata da un'altra scheda)", ordine_non_trovato: 'ordine non trovato' };
function _erroreNoteRiservate(data, error) { return NOTE_RISERVATE_ERRORI[data?.errore] || data?.errore || error?.message || 'sconosciuto'; }

async function caricaNoteRiservate(ordineId) {
  notaRiservataInModifica = null; notaRiservataBozza = '';
  const { data, error } = await sb.rpc('note_riservate_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_ordine_ids: [ordineId] });
  if (ordineId !== currentOrdineId) return;
  if (error || !data?.ok) { noteRiservateOrdine = []; renderNoteRiservate(ordineId, 'Note riservate non disponibili: ' + _erroreNoteRiservate(data, error)); return; }
  noteRiservateOrdine = data.note || [];
  noteRiservateConteggi[ordineId] = noteRiservateOrdine.length;
  renderNoteRiservate(ordineId);
}

function renderNoteRiservate(ordineId, errore) {
  const el = document.getElementById('det-note-riservate-body');
  if (!el) return;
  const righe = noteRiservateOrdine.map(n => {
    if (notaRiservataInModifica && notaRiservataInModifica.id === n.id) {
      return `<div class="nota-riservata" style="margin-bottom:12px">
        <textarea rows="3" maxlength="2000" style="width:100%;resize:vertical" oninput="notaRiservataInModifica.testo=this.value">${escapeHtml(notaRiservataInModifica.testo)}</textarea>
        <div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-ok" onclick="salvaNotaRiservata('${ordineId}')">Salva</button><button class="btn btn-secondary" onclick="annullaModificaNotaRiservata('${ordineId}')">Annulla</button></div>
      </div>`;
    }
    return `<div class="nota-riservata" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;color:var(--muted)">${escapeHtml(formatDateTime(n.creata_il))}${n.autore ? ' · ' + escapeHtml(n.autore) : ''}${n.modificata_il ? ' · modificata ' + escapeHtml(formatDateTime(n.modificata_il)) : ''}</div>
      <div style="white-space:pre-wrap;margin:4px 0">${escapeHtml(n.testo)}</div>
      <div style="display:flex;gap:8px"><button class="btn btn-secondary" style="padding:3px 10px;font-size:12px" onclick="iniziaModificaNotaRiservata('${ordineId}','${n.id}')">Modifica</button><button class="btn btn-secondary" style="padding:3px 10px;font-size:12px" onclick="eliminaNotaRiservata('${ordineId}','${n.id}')">Elimina</button></div>
    </div>`;
  }).join('');
  el.innerHTML = `${errore ? `<div style="color:var(--alert);margin-bottom:8px">${escapeHtml(errore)}</div>` : ''}
    <div style="margin-bottom:14px">
      <textarea id="nota-riservata-nuova" rows="2" maxlength="2000" placeholder="Nuova nota riservata…" style="width:100%;resize:vertical" oninput="notaRiservataBozza=this.value">${escapeHtml(notaRiservataBozza)}</textarea>
      <button class="btn btn-secondary" style="margin-top:6px" onclick="aggiungiNotaRiservata('${ordineId}')">Aggiungi nota</button>
    </div>
    ${righe || (errore ? '' : '<div style="color:var(--muted)">Nessuna nota riservata.</div>')}`;
}

async function aggiungiNotaRiservata(ordineId) {
  const testo = (notaRiservataBozza || '').trim();
  if (!testo) { toast('Scrivi il testo della nota', 'err'); return; }
  const { data, error } = await sb.rpc('note_riservata_aggiungi', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_ordine_id: ordineId, p_testo: testo });
  if (error || !data?.ok) { toast('Errore: ' + _erroreNoteRiservate(data, error), 'err'); return; }
  notaRiservataBozza = '';
  await caricaNoteRiservate(ordineId);
}

function iniziaModificaNotaRiservata(ordineId, notaId) {
  const n = noteRiservateOrdine.find(x => x.id === notaId);
  if (!n) return;
  notaRiservataInModifica = { id: notaId, testo: n.testo };
  renderNoteRiservate(ordineId);
}
function annullaModificaNotaRiservata(ordineId) { notaRiservataInModifica = null; renderNoteRiservate(ordineId); }

async function salvaNotaRiservata(ordineId) {
  if (!notaRiservataInModifica) return;
  const { data, error } = await sb.rpc('note_riservata_modifica', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_nota_id: notaRiservataInModifica.id, p_testo: notaRiservataInModifica.testo });
  if (error || !data?.ok) {
    toast('Errore: ' + _erroreNoteRiservate(data, error), 'err');
    if (data?.errore === 'nota_non_trovata') await caricaNoteRiservate(ordineId);
    return;
  }
  await caricaNoteRiservate(ordineId);
}

async function eliminaNotaRiservata(ordineId, notaId) {
  if (!confirm("Eliminare questa nota riservata? L'operazione non può essere annullata.")) return;
  const { data, error } = await sb.rpc('note_riservata_elimina', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_nota_id: notaId });
  if (error || !data?.ok) toast('Errore: ' + _erroreNoteRiservate(data, error), 'err');
  await caricaNoteRiservate(ordineId);
}

async function renderDettaglioOrdine(id) {
  const ordine = [...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === id);
  if (!ordine) { showSection('dashboard'); return; }
  await arricchisciOrdini([ordine]);

  document.getElementById('det-title').textContent = `${ordine.cliente} — ${ordine.codice || ''}`;

  // Info
  const oggi = Calendario.oggiIso();
  const isLate = ordine.scadenza && ordine.scadenza < oggi && ordine.stato === 'aperto';
  document.getElementById('det-info').innerHTML = `
    <div class="detail-field"><label>Cliente</label><span>${escapeHtml(ordine.cliente)}</span></div>
    <div class="detail-field"><label>N° Ordine</label><span style="font-family:var(--font-mono)">${escapeHtml(ordine.codice||'—')}</span></div>
    ${ordine.tipo === 'extra'
      ? `<div class="detail-field"><label>Tipo</label><span style="color:var(--extra);font-weight:600">Ordine Extra</span></div>`
      : `<div class="detail-field"><label>Struttura</label><span>${strutturaLabel(ordine.struttura)}</span></div>
    <div class="detail-field"><label>Tipo Prodotto</label><span>${tipoProdLabel(ordine.tipo_prodotto)}</span></div>
    ${ordine.tipo === 'extra' ? '' : Etichette.attributiOrdine(ordine).map(a => `<div class="detail-field"><label>${escapeHtml(a.etichetta)}</label><span>${escapeHtml(a.valore)}</span></div>`).join('')}
    ${latiLavorazioniDettaglioHtml(ordine)}`}
    <div class="detail-field"><label>Priorità</label>${Etichette.badgePriorita(ordine.priorita)}</div>
    <div class="detail-field"><label>Stato</label><span class="badge badge-${ordine.stato}">${statoLabel(ordine.stato, ordine)}</span></div>
    <div class="detail-field"><label>Consegna</label><span>${escapeHtml(Etichette.modalitaConsegna(ordine.modalita_consegna || 'da_spedire'))}${ordine.modalita_consegna === 'da_avvisare' ? `<div class="consegna-avviso">${escapeHtml(Etichette.statoAvviso(ordine, nomeUtenteOperatore(ordine.avvisato_da)))}</div>` : ''}</span></div>
    <div class="detail-field"><label>Scadenza</label><span style="color:${isLate ? 'var(--alert)' : 'inherit'}">${ordine.scadenza ? formatDate(ordine.scadenza) : '—'}${ordine.scadenza ? ` · Settimana ${settimanaIsoDaData(ordine.scadenza)}` : ''}${isLate ? ' <i data-ic="avviso"></i> In ritardo' : ''}</span></div>
    <div class="detail-field"><label>Consegna stimata</label><span id="det-stima-consegna" style="color:var(--muted)">Calcolo…</span></div>
    <div class="detail-field"><label>Quantità</label><span>${ordine.quantita || 1}</span></div>
    <div class="detail-field"><label>Creato il</label><span>${formatDateTime(ordine.creato_il)}</span></div>
  `;

  // Note ordine (ordini.note_generali) — card dedicata sopra la galleria foto/fasi, richiesta
  // esplicita del proprietario ("in alto come le foto"), non più il piccolo campo in fondo alla
  // griglia info qui sopra. Stessa eccezione dell'operatore al principio dei tre stati
  // espliciti: nota vuota, card nascosta — non un riquadro vuoto.
  const noteCard = document.getElementById('det-note-card');
  const noteBody = document.getElementById('det-note-body');
  const testoNota = (ordine.note_generali || '').trim();
  if (testoNota) {
    const lunga = testoNota.length > 300;
    const contenuto = escapeHtml(testoNota).replace(/\n/g, '<br>');
    noteBody.innerHTML = `<div${lunga ? ' id="det-note-testo" class="nota-ordine-clamp"' : ''}>${contenuto}</div>
      ${lunga ? `<button type="button" class="nota-ordine-toggle" onclick="(function(b){var el=document.getElementById('det-note-testo');var esp=el.classList.toggle('espansa');b.textContent=esp?'Mostra meno':'Mostra tutto';})(this)">Mostra tutto</button>` : ''}`;
    noteCard.style.display = '';
  } else {
    noteCard.style.display = 'none';
    noteBody.innerHTML = '';
  }

  // Note riservate (tabella a parte, mai visibili agli operatori)
  caricaNoteRiservate(id);

  // Calcola stima consegna per questo ordine (con coda)
  calcolaStimaSingoloOrdine(id);

  // Actions
  const actEl = document.getElementById('det-actions');
  if (ordine.stato === 'aperto') {
    actEl.innerHTML = `
      <button class="btn btn-secondary" onclick="sospendi('${id}')"><i data-ic="pausa"></i> Sospendi</button>
      <button class="btn btn-ok" onclick="segnaSpedito('${id}')">✓ Segna ${Etichette.ritiraOrdine(ordine) ? 'Ritirato' : 'Spedito'}</button>
    `;
  } else if (ordine.stato === 'sospeso') {
    actEl.innerHTML = `<button class="btn btn-ok" onclick="riattiva('${id}')"><i data-ic="play"></i> Riattiva</button>`;
  } else {
    actEl.innerHTML = `<span class="badge badge-spedito">${Etichette.azioneSpedito(ordine)} ${ordine.spedito_il ? formatDate(ordine.spedito_il) : ''}</span>`;
  }
  actEl.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary" onclick="anteprimaPDFOrdine('${id}')"><i data-ic="appunti"></i> Anteprima PDF</button>`);
  // Pulsante modifica e elimina: solo su ordini non ancora spediti
  if (ordine.stato !== 'spedito') {
    actEl.innerHTML += `<button class="btn btn-secondary" onclick="openModificaOrdine('${id}')"><i data-ic="matita"></i> Modifica</button>`;
    actEl.innerHTML += `<button class="btn" style="background:var(--alert);color:var(--on-alert);margin-left:auto" onclick="eliminaOrdine('${id}')"><i data-ic="cestino"></i> Elimina ordine</button>`;
  }

  // Fasi — standard o extra
  const fasiEl = document.getElementById('det-fasi');
  const readonly = ordine.stato === 'sospeso' || ordine.stato === 'spedito';
  // Nome fase per ordine_fase_id, per etichettare le miniature della galleria aggregata sotto —
  // senza questa mappa una striscia di foto senza contesto non direbbe dove si è verificato un
  // problema. Popolata da entrambi i rami (standard/extra), anche se oggi solo il primo ha foto
  // aggregabili (vedi nota nella galleria).
  const mappaNomiFasi = new Map();

  if (ordine.tipo === 'extra') {
    const { data: fasiExt } = await sb.from('fasi_ordine_extra')
      .select('*, users!operatore_id(nome, cognome)')
      .eq('ordine_id', id)
      .order('numero');
    (fasiExt || []).forEach(f => mappaNomiFasi.set(f.id, f.nome));
    fasiEl.innerHTML = (fasiExt || []).map(f => {
      const opNome = f['users'] ? `${escapeHtml(f['users'].nome)} ${escapeHtml(f['users'].cognome)}` : '';
      return `<div class="fase-card ${f.stato}" onclick="openFaseExtraDetail('${f.id}', '${id}', ${readonly})">
        <div class="fase-num">${f.numero}. ${f.stato === 'completata' ? '✓' : f.stato === 'in_corso' ? '<i data-ic="play"></i>' : '○'}</div>
        <div class="fase-nome">${escapeHtml(f.nome)}</div>
        <div class="fase-op">${opNome || (f.stato === 'disponibile' ? 'Disponibile' : '')}</div>
        ${f.piu_pressate ? `<div class="fase-op" style="margin-top:4px">${escapeHtml(Etichette.pressate.fatteResp(f.pressate_fatte || 0, f.pressate_previste))}</div>` : ''}
        ${f.completata_il ? `<div class="fase-op" style="margin-top:4px;font-size:10px">${formatDateTime(f.completata_il)}</div>` : ''}
      </div>`;
    }).join('');
  } else {
    const { data: ordFasiRaw } = await sb.from('ordine_fasi')
      .select('*, users!operatore_id(nome, cognome)')
      .eq('ordine_id', id);
    // le fasi non attive sull'ordine (non_applicabile) non si mostrano: si gestiscono solo dalla modifica ordine
    const ordFasi = (ordFasiRaw || []).filter(f => f.stato !== 'non_applicabile').sort((a, b) => {
      const posA = a.fase_id ? (fasi.find(f => f.id === a.fase_id)?.posizione ?? 9999) : 99999;
      const posB = b.fase_id ? (fasi.find(f => f.id === b.fase_id)?.posizione ?? 9999) : 99999;
      return posA - posB;
    });
    fasiEl.innerHTML = (ordFasi || []).map(f => {
      const isCustom = !f.fase_id;
      const nomeFaseRaw = isCustom ? (f.nome_custom || 'Fase extra') : getFaseNome(f.fase_id, fasi);
      mappaNomiFasi.set(f.id, nomeFaseRaw);
      const nomeFase = escapeHtml(nomeFaseRaw);
      const opNome = f['users'] ? `${escapeHtml(f['users'].nome)} ${escapeHtml(f['users'].cognome)}` : '';
      const cnc = !isCustom && isCNC(f.fase_id);
      const est = !isCustom && isEsterna(f.fase_id);
      const icon = f.stato === 'completata' ? '✓' : f.stato === 'in_corso' ? '<i data-ic="play"></i>' : f.stato === 'in_attesa' ? '<i data-ic="pausa"></i>' : '○';
      const numLabel = isCustom ? '★' : f.fase_id;
      return `<div class="fase-card ${f.stato}" onclick="openFaseDetail('${f.id}', '${id}', ${readonly})">
        <div class="fase-num">${numLabel}. ${icon}</div>
        <div class="fase-nome">${nomeFase}${cnc ? '<span class="badge-cnc">CNC</span>' : ''}${est ? '<span class="badge-esterna">EXT</span>' : ''}${isCustom ? '<span class="badge-cnc" style="background:var(--violet)">EXTRA</span>' : ''}</div>
        <div class="fase-op">${opNome || (f.stato === 'disponibile' ? 'Disponibile' : '')}</div>
        ${!isCustom && fasePiuPressate(f.fase_id) ? `<div class="fase-op" style="margin-top:4px">${escapeHtml(Etichette.pressate.fatteResp(f.pressate_fatte || 0, fasePressatePreviste(f.fase_id)))}</div>` : ''}
        ${f.completata_il ? `<div class="fase-op" style="margin-top:4px;font-size:10px">${formatDateTime(f.completata_il)}</div>` : ''}
      </div>`;
    }).join('');
  }

  // Galleria foto aggregate di tutte le fasi dell'ordine, sopra l'elenco fasi (richiesta del
  // proprietario). Nota: oggi copre solo gli ordini standard — le foto di fase per gli ordini
  // extra (fasi_ordine_extra) non risultano mai in questa aggregazione, limite preesistente
  // non introdotto qui (segnalato, non risolto: vedi nota vault).
  // Allegare foto all'ordine (stesso componente dell'app operatore, js/config.js): finché l'ordine non è spedito.
  renderSezioneFotoOrdine('det-foto-allega', id, {
    spedito: ordine.stato === 'spedito' || !!ordine.spedito_il,
    onCaricate: () => caricaGalleriaOrdineDettaglio(id, mappaNomiFasi)
  });
  await caricaGalleriaOrdineDettaglio(id, mappaNomiFasi);

  // Log
  const { data: log } = await sb.from('archivio_log')
    .select('*, users!utente_id(nome, cognome), fasi(nome)')
    .eq('ordine_id', id)
    .order('timestamp', { ascending: false })
    .limit(30);

  const logEl = document.getElementById('det-log');
  if (!log?.length) {
    logEl.innerHTML = '<li style="color:var(--muted);font-size:13px;padding:12px 0">Nessuna attività registrata</li>';
  } else {
    logEl.innerHTML = log.map(l => {
      const u = l['users'] ? `${escapeHtml(l['users'].nome)} ${escapeHtml(l['users'].cognome)}` : 'Sistema';
      const fase = l['fasi'] ? escapeHtml(l['fasi'].nome) : '';
      return `<li class="log-item">
        <div class="log-icon">${logIcon(l.azione)}</div>
        <div class="log-content">
          <div class="action">${logLabel(l.azione)}${fase ? ` — ${fase}` : ''}${l.dettaglio?.fase_scelta ? ` · ${escapeHtml(_testoSceltaFaseLog(l.dettaglio))}` : ''}</div>
          <div class="meta">${u} · ${formatDateTime(l.timestamp)}</div>
        </div>
      </li>`;
    }).join('');
  }
}

// Galleria aggregata di tutte le foto di un ordine, sopra l'elenco fasi (richiesta del
// proprietario: "vederle sia dentro le fasi sia in alto quando apro l'ordine"). Convive con la
// vista per-fase (dentro openFaseDetail), non la sostituisce.
// Fino al 2026-09-09 leggeva `allegati` e firmava gli URL direttamente da qui, appoggiandosi
// alle policy storage.objects a livello di bucket intero (V-29 — nessuno scoping per ordine,
// qualunque authenticated poteva leggere/cancellare qualunque file). Passa ora dall'edge
// function allegati-ordine-url, che chiama prima la RPC elenco_foto_ordine_responsabile
// (verifica sessione + che l'ordine esista) e firma con la service role solo dopo — stesso
// schema già in uso per allegato-url lato operatore, una sola chiamata per l'intero ordine
// invece di N per fase.
async function caricaGalleriaOrdineDettaglio(ordineId, mappaNomiFasi) {
  const el = document.getElementById('det-foto-galleria');
  if (!el) return;

  if (!navigator.onLine) {
    el.innerHTML = '<div class="note-box" style="border-color:var(--warn)"><i data-ic="offline"></i> Foto non consultabili senza connessione.</div>';
    return;
  }

  const { data: esito, error: eEdge } = await sb.functions.invoke('allegati-ordine-url', {
    headers: await _headerAutorizzazione(),
    body: { p_responsabile_id: currentUserRow.id, p_ordine_id: ordineId }
  });

  if (eEdge || !esito?.ok) {
    console.error('Galleria ordine:', eEdge || esito?.errore);
    el.innerHTML = '<div class="note-box" style="border-color:var(--alert)"><i data-ic="avviso"></i> Impossibile caricare la galleria — riprova.</div>';
    return;
  }
  const tutteAllegati = esito.allegati || [];
  if (!tutteAllegati.length) {
    el.innerHTML = '<div class="note-box" style="color:var(--muted)">Nessuna foto allegata a questo ordine.</div>';
    return;
  }

  const items = tutteAllegati.map(a => ({
    id: a.id,
    caricato_da: a.caricato_da,
    ordine_fase_id: a.ordine_fase_id,
    nomeFase: a.ordine_fase_id ? (mappaNomiFasi.get(a.ordine_fase_id) || 'Fase') : 'Ordine',
    nomeFile: a.url_file,
    signedUrl: a.signedUrl
  })).filter(x => x.signedUrl);

  if (!items.length) {
    el.innerHTML = '<div class="note-box" style="border-color:var(--alert)"><i data-ic="avviso"></i> Righe presenti ma nessun file leggibile dallo storage — segnalalo.</div>';
    return;
  }

  window._fotoGalleriaOrdineCorrente = items;
  const ricarica = () => caricaGalleriaOrdineDettaglio(ordineId, mappaNomiFasi);
  window._ricaricaGalleriaOrdineCorrente = ricarica;
  el.innerHTML = `<div class="foto-grid">${items.map((x, i) => `
    <div class="foto-thumb-wrap">
      <img src="${x.signedUrl}" class="foto-thumb" onerror="this.style.display='none'"
        onclick="apriVisualizzatoreDaLista(window._fotoGalleriaOrdineCorrente, ${i}, window._ricaricaGalleriaOrdineCorrente)"
        title="${escapeHtml(x.nomeFase)} — ${escapeHtml(x.nomeFile.split('/').pop())}">
      <div class="foto-thumb-fase" title="${escapeHtml(x.nomeFase)}">${escapeHtml(x.nomeFase)}</div>
    </div>`).join('')}</div>`;
}

async function openFaseDetail(ordFaseId, ordineId, readonly) {
  const [{ data: f }, { data: opMulti }] = await Promise.all([
    sb.from('ordine_fasi').select('*, users!operatore_id(nome, cognome)').eq('id', ordFaseId).single(),
    sb.from('ordine_fasi_operatori').select('operatore_id, users(nome, cognome)').eq('ordine_fase_id', ordFaseId),
  ]);
  if (!f) return;
  if (f.stato === 'non_applicabile') return; // N/A — non aprire modal
  const ordine = [...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === ordineId);
  const isCustom = !f.fase_id;
  const nomeFase = isCustom ? (f.nome_custom || 'Fase extra') : getFaseNome(f.fase_id, fasi);
  const numLabel = isCustom ? '★' : f.fase_id;

  document.getElementById('modal-fase-title').textContent = `${numLabel}. ${nomeFase}`;

  // Operatori multipli
  const opList = (opMulti || []);
  const opNomiHtml = opList.length
    ? opList.map(o => `<span style="display:inline-block;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-size:12px;margin:2px">${escapeHtml(o.users?.nome || '')} ${escapeHtml(o.users?.cognome || '')}</span>`).join('')
    : (f['users'] ? `<span>${escapeHtml(f['users'].nome)} ${escapeHtml(f['users'].cognome)}</span>` : '<span style="color:var(--muted)">—</span>');

  document.getElementById('modal-fase-body').innerHTML = `
    <div class="fase-detail">
      <span class="badge badge-${f.stato}">${statoFaseLabel(f.stato)}</span>
      ${f.note_responsabile ? `<div class="note-box"><strong>Note Responsabile</strong>${escapeHtml(f.note_responsabile)}</div>` : ''}
      ${f.note_operatore ? `<div class="note-box"><strong>Note Operatore</strong>${escapeHtml(f.note_operatore)}</div>` : ''}
      <div style="margin-bottom:12px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Operatori</div>
        <div>${opNomiHtml}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        ${f.iniziata_il ? `<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Iniziata</div><div>${formatDateTime(f.iniziata_il)}</div></div>` : ''}
        ${f.completata_il ? `<div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Completata</div><div>${formatDateTime(f.completata_il)}</div></div>` : ''}
      </div>
      <div id="resp-foto-fase-container"></div>
      ${!readonly ? `
      <div class="form-group" style="margin-top:16px">
        <label>Note Responsabile (modifica)</label>
        <textarea id="note-resp-edit" rows="3" style="resize:vertical">${escapeHtml(f.note_responsabile || '')}</textarea>
      </div>` : ''}
    </div>
  `;
  // Componente condiviso con operatore.html (js/config.js) — legge via edge function
  // allegato-url, non più storage.createSignedUrl diretto (vedi nota vault sul perché).
  caricaERenderizzaFoto('resp-foto-fase-container', ordFaseId);

  const footerEl = document.getElementById('modal-fase-footer');
  if (readonly) {
    footerEl.innerHTML = `<button class="btn btn-secondary" onclick="closeModal('modal-fase')">Chiudi</button>`;
  } else {
    const puoCompletare = ['disponibile','in_corso','in_attesa'].includes(f.stato);
    const puoRiaprire  = f.stato === 'completata';
    const puoRimuovere = isCustom && f.stato !== 'completata';
    footerEl.innerHTML = `
      <button class="btn btn-secondary" onclick="closeModal('modal-fase')">Annulla</button>
      ${puoRimuovere ? `<button class="btn btn-alert" onclick="eliminaFaseCustomOrdine('${ordFaseId}','${ordineId}','${escapeJsAttr(nomeFase)}')"><i data-ic="cestino"></i> Rimuovi fase</button>` : ''}
      ${f.stato === 'in_corso' ? `<button class="btn btn-secondary" onclick="openRiassegnaModal('${ordFaseId}')">Riassegna</button>` : ''}
      ${puoCompletare ? `<button class="btn btn-ok" onclick="apriCompletaFase('${ordFaseId}','${ordineId}')">✓ Segna completata</button>` : ''}
      ${puoRiaprire   ? `<button class="btn btn-secondary" onclick="riaprieFaseResp('${ordFaseId}','${ordineId}')">↩ Riapri fase</button>` : ''}
      ${!puoRimuovere ? `<button class="btn btn-primary" onclick="salvaNoteResp('${ordFaseId}', '${ordineId}')">Salva Note</button>` : ''}
    `;
  }

  const modalFase = document.getElementById('modal-fase');
  modalFase.dataset.operatoreId = f.operatore_id || '';
  modalFase.classList.add('open');
}

async function eliminaFaseCustomOrdine(ordFaseId, ordineId, nomeFase) {
  if (!confirm(`Rimuovere la fase "${nomeFase}"? Questa azione non può essere annullata.`)) return;
  const { data, error } = await sb.rpc('elimina_fase_custom_ordine', {
    p_ordine_fase_id: ordFaseId,
    p_responsabile_id: currentUserRow.id,
  });
  if (error || !data?.ok) {
    toast('Errore: ' + (data?.errore || error?.message || 'sconosciuto'), 'err');
    return;
  }
  closeModal('modal-fase');
  toast(`Fase "${nomeFase}" rimossa`, 'ok');
  await openDettaglioOrdine(ordineId);
}

async function apriCompletaFase(ordFaseId, ordineId) {
  const m = document.getElementById('modal-completa-fase');
  m.dataset.ordFaseId = ordFaseId;
  m.dataset.ordineId  = ordineId;

  // Operatori già nella junction table
  const { data: giàAssegnati } = await sb.from('ordine_fasi_operatori')
    .select('operatore_id').eq('ordine_fase_id', ordFaseId);
  const preSelezionati = new Set((giàAssegnati || []).map(r => r.operatore_id));

  // Fallback: operatore singolo dal campo principale
  const opIdPrincipale = document.getElementById('modal-fase').dataset.operatoreId || '';
  if (opIdPrincipale) preSelezionati.add(opIdPrincipale);

  document.getElementById('cf-operatori-list').innerHTML = operatoriCache.map(o => `
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 0">
      <input type="checkbox" value="${o.id}" ${preSelezionati.has(o.id) ? 'checked' : ''}
        style="width:16px;height:16px;cursor:pointer">
      <span>${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</span>
    </label>
  `).join('');

  document.getElementById('cf-note').value = '';
  m.classList.add('open');
}

async function confermaConclusioneFase() {
  const m = document.getElementById('modal-completa-fase');
  const ordFaseId = m.dataset.ordFaseId;
  const ordineId  = m.dataset.ordineId;
  const note = document.getElementById('cf-note').value.trim() || null;

  const selezionati = [...document.querySelectorAll('#cf-operatori-list input[type=checkbox]:checked')]
    .map(cb => cb.value);

  if (!selezionati.length) { toast('Seleziona almeno un operatore', 'err'); return; }

  // operatore principale = primo selezionato; stato, tempi e registro nella stessa RPC
  const { data: esCompl, error } = await sb.rpc('forza_completa_fase', { p_ordine_fase_id: ordFaseId, p_operatori: selezionati, p_note: note, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !esCompl?.ok) { toast('Errore: ' + (esCompl?.errore || error?.message || ''), 'err'); return; }

  closeModal('modal-completa-fase');
  closeModal('modal-fase');
  toast('Fase segnata come completata', 'ok');
  renderDettaglioOrdine(ordineId);
}


async function riaprieFaseResp(ordFaseId, ordineId) {
  if (!confirm('Riaprire questa fase impostandola su "disponibile"?')) return;
  const { data: esRiap, error } = await sb.rpc('riapri_fase_resp', { p_ordine_fase_id: ordFaseId, p_responsabile_id: currentUserRow.id, p_session_token: null });   // tempo accumulato mantenuto
  if (error || !esRiap?.ok) { toast('Errore: ' + (esRiap?.errore || error?.message || ''), 'err'); return; }
  closeModal('modal-fase');
  toast('Fase riaperta', 'ok');
  renderDettaglioOrdine(ordineId);
}

async function salvaNoteResp(ordFaseId, ordineId) {
  const note = document.getElementById('note-resp-edit').value;
  const { data: esNota, error: errNota } = await sb.rpc('salva_nota_fase_resp', { p_ordine_fase_id: ordFaseId, p_note: note, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (errNota || !esNota?.ok) { toast('Errore: ' + (esNota?.errore || errNota?.message || ''), 'err'); return; }
  closeModal('modal-fase');
  toast('Note aggiornate', 'ok');
  renderDettaglioOrdine(ordineId);
}

// ═══════════════════════════════════════════════
// RIASSEGNA FASE
// ═══════════════════════════════════════════════
function openRiassegnaModal(ordFaseId) {
  riassegnaOrdFaseId = ordFaseId;
  const sel = document.getElementById('riassegna-op-select');
  sel.innerHTML = operatoriCache
    .filter(o => o.ruolo === 'operatore' && o.attivo)
    .map(o => `<option value="${o.id}">${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</option>`)
    .join('');
  closeModal('modal-fase');
  document.getElementById('modal-riassegna').classList.add('open');
}

async function confermRiassegna() {
  const nuovoOp = document.getElementById('riassegna-op-select').value;
  const { data } = await sb.rpc('riassegna_fase', {
    p_ordine_fase_id: riassegnaOrdFaseId,
    p_nuovo_operatore: nuovoOp,
    p_responsabile_id: currentUserRow.id
  });
  if (data?.ok) {
    toast('Fase riassegnata', 'ok');
    closeModal('modal-riassegna');
    if (currentOrdineId) renderDettaglioOrdine(currentOrdineId);
  } else {
    toast(data?.errore || 'Errore', 'err');
  }
}

// ═══════════════════════════════════════════════
// NON CONFORMITÀ
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// ORARIO LAVORO
// ═══════════════════════════════════════════════


async function loadFaseMediaMinuti() {
  const [{ data }, { data: fasiCatalogo }] = await Promise.all([
    sb.from('ordine_fasi')
      .select('fase_id, tempo_accumulato_minuti, n_ordini_batch, ordini(quantita)')
      .eq('stato', 'completata')
      .gt('tempo_accumulato_minuti', 0)
      .lt('tempo_accumulato_minuti', Calendario.costante('outlier_max_minuti') ?? 20000)
      .not('fase_id', 'is', null),
    sb.from('fasi').select('id, e_attesa_esterna'),
  ]);
  // Costruisce il set di fase_id con attesa esterna
  faseEsternaSet = new Set((fasiCatalogo || []).filter(f => f.e_attesa_esterna).map(f => f.id));
  if (!data) return;
  const map = {};
  data.forEach(f => {
    const q = f.ordini?.quantita || 1;
    const minPerPezzo = f.tempo_accumulato_minuti / (f.n_ordini_batch || 1) / q;
    if (!map[f.fase_id]) map[f.fase_id] = [];
    map[f.fase_id].push(minPerPezzo);
  });
  faseMediaMinutiMap = {};
  Object.entries(map).forEach(([id, vals]) => {
    faseMediaMinutiMap[parseInt(id)] = vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  // mango-v45: i tempi per fase non si registrano più. Le stime (ETA di dashboard e ordini) usano gli stessi tempi di riferimento del piano del giorno;
  // la mediana storica resta solo per le fasi senza tempo di riferimento.
  const { data: rif } = await sb.rpc('stime_fasi_riferimento', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (rif?.ok) {
    Object.entries(rif.fasi || {}).forEach(([id, v]) => {
      if (!v.senza_tempo || !faseMediaMinutiMap[parseInt(id)]) faseMediaMinutiMap[parseInt(id)] = Number(v.minuti_pezzo);
    });
  }
}

async function loadFaseExtraMediaMinuti() {
  const { data } = await sb.from('fasi_ordine_extra')
    .select('nome, tempo_accumulato_minuti, n_ordini_batch')
    .eq('stato', 'completata')
    .gt('tempo_accumulato_minuti', 0);
  if (!data) return;
  const map = {};
  data.forEach(r => {
    const key = r.nome.toLowerCase();
    if (!map[key]) map[key] = [];
    map[key].push(r.tempo_accumulato_minuti / Math.max(r.n_ordini_batch || 1, 1));
  });
  faseExtraMediaMinutiMap = {};
  Object.entries(map).forEach(([name, vals]) => {
    vals.sort((a, b) => a - b);
    faseExtraMediaMinutiMap[name] = vals[Math.floor(vals.length / 2)];
  });
}
























// ═══════════════════════════════════════════════
// DETTAGLIO FASE EXTRA (ordini custom)
// ═══════════════════════════════════════════════
async function openFaseExtraDetail(faseExtraId, ordineId, readonly) {
  const { data: f } = await sb.from('fasi_ordine_extra')
    .select('*, users!operatore_id(nome, cognome)')
    .eq('id', faseExtraId).single();
  if (!f) return;
  const ordine = [...ordiniCache, ...ordiniSpeditiCache].find(o => o.id === ordineId);

  document.getElementById('modal-fase-title').textContent = `${f.numero}. ${f.nome}`;
  const opNome = f['users'] ? `${escapeHtml(f['users'].nome)} ${escapeHtml(f['users'].cognome)}` : '';

  let body = `<span class="badge badge-${f.stato}" style="margin-bottom:12px;display:inline-flex">${f.stato}</span>`;
  if (opNome) body += `<div class="detail-field" style="margin-bottom:8px"><label>Operatore</label><span>${opNome}</span></div>`;
  if (f.iniziata_il) body += `<div class="detail-field" style="margin-bottom:8px"><label>Iniziata</label><span>${formatDateTime(f.iniziata_il)}</span></div>`;
  if (f.completata_il) body += `<div class="detail-field" style="margin-bottom:8px"><label>Completata</label><span>${formatDateTime(f.completata_il)}</span></div>`;

  if (!readonly) {
    body += `<div class="form-group" style="margin-top:12px">
      <label>Note Responsabile</label>
      <textarea id="note-resp-extra" rows="3">${escapeHtml(f.note_responsabile || '')}</textarea>
    </div>`;
    if (f.note_operatore) {
      body += `<div class="form-group"><label>Note Operatore</label><div style="background:var(--phase-bg);padding:10px;border-radius:6px;font-size:13px">${escapeHtml(f.note_operatore)}</div></div>`;
    }
  } else {
    if (f.note_responsabile) body += `<div class="form-group"><label>Note Responsabile</label><div style="background:var(--phase-bg);padding:10px;border-radius:6px;font-size:13px">${escapeHtml(f.note_responsabile)}</div></div>`;
    if (f.note_operatore) body += `<div class="form-group"><label>Note Operatore</label><div style="background:var(--phase-bg);padding:10px;border-radius:6px;font-size:13px">${escapeHtml(f.note_operatore)}</div></div>`;
  }

  document.getElementById('modal-fase-body').innerHTML = body;
  const footer = document.getElementById('modal-fase-footer');
  footer.innerHTML = '';
  if (!readonly) {
    const puoCompletare = ['disponibile', 'in_corso', 'in_attesa'].includes(f.stato);
    const puoRiaprire   = f.stato === 'completata';
    footer.innerHTML = `<button class="btn btn-secondary" onclick="closeModal('modal-fase')">Annulla</button>
      ${f.stato === 'in_corso' && f.operatore_id ? `<button class="btn btn-secondary" onclick="riassegnaFaseExtra('${faseExtraId}','${ordineId}')">Riassegna</button>` : ''}
      ${puoCompletare ? `<button class="btn btn-ok" onclick="completaFaseExtraResp('${faseExtraId}','${ordineId}')">✓ Segna completata</button>` : ''}
      ${puoRiaprire   ? `<button class="btn btn-secondary" onclick="riaprieFaseExtraResp('${faseExtraId}','${ordineId}')">↩ Riapri fase</button>` : ''}
      <button class="btn btn-primary" onclick="salvaNotaFaseExtra('${faseExtraId}','${ordineId}')">Salva note</button>`;
  } else {
    footer.innerHTML = `<button class="btn btn-secondary" onclick="closeModal('modal-fase')">Chiudi</button>`;
  }
  document.getElementById('modal-fase').classList.add('open');
}

async function salvaNotaFaseExtra(faseExtraId, ordineId) {
  const note = document.getElementById('note-resp-extra')?.value || '';
  const { data } = await sb.rpc('salva_nota_fase_extra', { p_fase_extra_id: faseExtraId, p_note: note, p_responsabile_id: currentUserRow.id });
  if (!data?.ok) { toast('Errore aggiornamento note', 'err'); return; }
  closeModal('modal-fase');
  toast('Note aggiornate', 'ok');
  renderDettaglioOrdine(ordineId);
}

async function completaFaseExtraResp(faseExtraId, ordineId) {
  if (!confirm('Segnare questa fase come completata?')) return;
  const { data } = await sb.rpc('forza_completa_fase_extra', {
    p_fase_extra_id: faseExtraId,
    p_responsabile_id: currentUserRow.id,
    p_session_token: null
  });
  if (!data?.ok) { toast('Errore: ' + (data?.errore || ''), 'err'); return; }
  closeModal('modal-fase');
  toast('Fase segnata come completata', 'ok');
  renderDettaglioOrdine(ordineId);
}

async function riaprieFaseExtraResp(faseExtraId, ordineId) {
  if (!confirm('Riaprire questa fase impostandola su "disponibile"?')) return;
  const { data } = await sb.rpc('riapri_fase_extra_resp', {
    p_fase_extra_id: faseExtraId,
    p_responsabile_id: currentUserRow.id,
    p_session_token: null
  });
  if (!data?.ok) { toast('Errore: ' + (data?.errore || ''), 'err'); return; }
  closeModal('modal-fase');
  toast('Fase riaperta', 'ok');
  renderDettaglioOrdine(ordineId);
}



async function riassegnaFaseExtra(faseExtraId, ordineId) {
  const opId = document.getElementById('riassegna-op-select')?.value;
  if (!opId) { toast('Seleziona un operatore', 'err'); return; }
  const { data } = await sb.rpc('riassegna_fase_extra', { p_fase_extra_id: faseExtraId, p_nuovo_op: opId, p_responsabile_id: currentUserRow.id });
  if (!data?.ok) { toast('Errore riassegnazione', 'err'); return; }
  closeModal('modal-riassegna');
  toast('Fase riassegnata', 'ok');
  renderDettaglioOrdine(ordineId);
}

