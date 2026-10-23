// responsabile.html — archivio: tabella, PDF della scheda ordine, esportazione/archiviazione sul PC, memoria database.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// ARCHIVIO
// ═══════════════════════════════════════════════
function renderArchivioTable() {
  const vista = document.getElementById('arch-vista')?.value || 'da_esportare';
  const search = document.getElementById('arch-search')?.value.toLowerCase() || '';
  const tipo = document.getElementById('arch-tipo')?.value || '';
  const dal = document.getElementById('arch-dal')?.value || '';
  const al = document.getElementById('arch-al')?.value || '';

  const isArchiviati = vista === 'archiviati';

  let filtered = ordiniSpeditiCache.filter(o => {
    if (isArchiviati ? !o.archiviato_il : o.archiviato_il) return false;
    if (tipo && o.tipo !== tipo) return false;
    if (search && !(o.cliente || '').toLowerCase().includes(search) && !(o.codice || '').toLowerCase().includes(search)) return false;
    if (dal && o.spedito_il && o.spedito_il.split('T')[0] < dal) return false;
    if (al && o.spedito_il && o.spedito_il.split('T')[0] > al) return false;
    return true;
  });

  // Aggiorna intestazione colonna finale
  const theadRow = document.getElementById('arch-thead-row');
  if (theadRow) {
    theadRow.cells[8].textContent = isArchiviati ? 'Esportato il' : 'Foto';
  }

  const tbody = document.getElementById('arch-tbody');
  if (!filtered.length) {
    const msg = isArchiviati ? 'Nessun ordine archiviato' : 'Nessun ordine da esportare';
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon"><i data-ic="pacco"></i></div><p>${msg}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(o => {
    const st = lavoroStatsCache[o.id];
    const oreL   = st ? minutiToOreMinuti(st.minuti_lavoro)         : '—';
    const oreA   = st ? minutiToOreMinuti(st.minuti_attesa_esterna) : '—';
    const nOp    = st ? (st.n_operatori > 0 ? st.n_operatori : '—') : '—';
    const attesaStyle = st && Number(st.minuti_attesa_esterna) > 0
      ? 'color:var(--warn);font-weight:600' : 'color:var(--muted)';
    const ultimaCol = isArchiviati
      ? `<td style="color:var(--muted);font-size:12px">${o.archiviato_il ? formatDate(o.archiviato_il) : '—'}</td>`
      : `<td onclick="event.stopPropagation()">
           <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="scaricaEliminaFoto('${o.id}','${escapeJsAttr(o.codice||o.id)}','${escapeJsAttr(o.cliente)}')"><i data-ic="pacco"></i> Esporta & rimuovi foto</button>
         </td>`;
    return `
    <tr class="clickable" onclick="openDettaglioOrdine('${o.id}')">
      <td><div style="font-weight:600">${escapeHtml(o.cliente)}</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${escapeHtml(o.codice||'—')}</div></td>
      <td>${o.tipo === 'extra' ? '<span style="color:var(--extra);font-weight:600">Ordine Extra</span>' : `${strutturaLabel(o.struttura)} / ${tipoProdLabel(o.tipo_prodotto)}`}</td>
      <td>${Etichette.badgePriorita(o.priorita)}</td>
      <td>${formatDate(o.creato_il)}</td>
      <td>${o.spedito_il ? formatDate(o.spedito_il) : '—'}</td>
      <td style="font-variant-numeric:tabular-nums">${oreL}</td>
      <td style="font-variant-numeric:tabular-nums;${attesaStyle}">${oreA}</td>
      <td style="text-align:center">${nOp}</td>
      ${ultimaCol}
    </tr>`;
  }).join('');
}

// ─── Nomi e testi del registro (usati anche dal dettaglio ordine) ─────────────
function _nomeOp(id) {
  if (!id) return null;
  const op = operatoriCache.find(o => o.id === id);
  return op ? `${op.nome} ${op.cognome}` : null;
}
// Testo del registro per le scelte manuali sulle fasi di un ordine (imposta_fase_ordine / ripristina_fase_ordine_automatica)
function _testoSceltaFaseLog(d) {
  const base = d.fase_scelta === 'torna_automatico' ? 'Fase tornata automatica'
    : (d.fase_scelta === 'attivata' ? 'Fase attivata dal responsabile' : 'Fase disattivata dal responsabile');
  return base + (d.segue_regole ? ' (come le regole automatiche)' : ' (scelta manuale: resta finché non la cambi)');
}

// ─── Genera PDF scheda ordine con jsPDF ───────────────────────────────────────
// Una pagina o poco più: dati dell'ordine, date chiave, fasi esterne, note riservate, numero di foto.
// Nessun operatore, nessun tempo, nessuna cronologia. `note` = note riservate dell'ordine, `nFoto` = foto nella cartella (null se non note).
function generaPDFOrdine(ordine, fasiOrd, fasiExtra, note, nFoto) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 190, L = 10;
  let y = 15;
  const lineH = 5.5;

  const checkPage = () => { if (y > 272) { doc.addPage(); y = 15; } };
  const hr = (r = 200, g = 200, b = 200) => { doc.setDrawColor(r, g, b); doc.line(L, y, L + W, y); y += 3; };

  const section = (title) => {
    checkPage();
    y += 3; hr(180, 180, 180);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
    doc.text(title, L, y); y += 6;
  };

  // etichetta e valore; il valore va a capo se lungo
  const kv = (label, value) => {
    checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
    doc.text(label + ':', L, y);
    const colValore = Math.max(44, doc.getTextWidth(label + ':') + 6);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    const righe = doc.splitTextToSize(String(value ?? '—'), W - colValore);
    righe.forEach((riga, i) => { if (i > 0) checkPage(); doc.text(riga, L + colValore, y); y += lineH; });
  };

  // riga di testo semplice (fasi esterne): a capo se lunga
  const riga = (testo) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.splitTextToSize(testo, W).forEach(r => { checkPage(); doc.text(r, L, y); y += lineH; });
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('it-IT') : '—';
  const giornoLocale = (d) => new Date(d).toLocaleDateString('sv-SE');          // AAAA-MM-GG nel fuso del browser
  const giornoIso = (d) => String(d).length <= 10 ? String(d) : giornoLocale(d);   // scadenza è una data, i timestamp si portano al giorno locale
  // giorni di calendario fra due date (b − a)
  const giorniTra = (a, b) => {
    const [ya, ma, da] = giornoIso(a).split('-').map(Number), [yb, mb, db] = giornoIso(b).split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  };
  const giorni = (n) => n === 1 ? '1 giorno' : n + ' giorni';

  // fasi in ordine di produzione (fasiOrd non ha un ordine garantito dalla query)
  const fasiOrdinate = [...(fasiOrd || [])].sort((a, b) => {
    const posA = fasi.find(x => x.id === a.fase_id)?.posizione ?? 9999;
    const posB = fasi.find(x => x.id === b.fase_id)?.posizione ?? 9999;
    return posA - posB;
  });

  // 1. Intestazione
  doc.setFillColor(245, 245, 245); doc.rect(L - 2, y - 6, W + 4, 14, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
  doc.text(`Scheda Ordine — ${ordine.codice || ordine.id}`, L, y); y += 7;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text(`${ordine.cliente || '—'} · Esportato il ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}`, L, y); y += 9;

  // 2. Ordine
  section('Ordine');
  kv('Tipo', ordine.tipo === 'extra' ? 'Ordine Extra' : 'Standard');
  if (ordine.tipo !== 'extra') {
    kv('Prodotto', [tipoProdLabel(ordine.tipo_prodotto), strutturaLabel(ordine.struttura)].filter(x => x && x !== '—').join(' · ') || '—');
    const attributi = [];
    Etichette.valoriLatoOrdine(ordine).forEach(a => a.valori.forEach(v => attributi.push((v.lato_etichetta ? v.lato_etichetta + ': ' : '') + a.etichetta + ': ' + v.testo)));
    if (attributi.length) kv('Attributi', attributi.join(' · '));
    const lavPdf = Etichette.lavorazioniCncOrdine(ordine, lavorazioneCncNome(ordine.lavorazione_cnc_id));
    if (lavPdf.length) kv('Lavorazioni CNC', lavPdf.map(l => l.testo).join('; '));
  }
  kv('Quantità', ordine.quantita);
  kv('Priorità', ordine.priorita);
  kv('Scadenza', fmtDate(ordine.scadenza));
  if (ordine.note_generali) kv('Note', ordine.note_generali);

  // 3. Date chiave
  section('Date chiave');
  kv('Creato il', fmtDate(ordine.creato_il));
  kv('Scadenza', fmtDate(ordine.scadenza));
  let pronto = fmtDate(ordine.completato_il);
  if (ordine.completato_il && ordine.scadenza) {
    const d = giorniTra(ordine.scadenza, ordine.completato_il);
    pronto += d <= 0 ? ' — in tempo' : ` — ${giorni(d)} dopo la scadenza`;
  }
  kv('Pronto per la spedizione il', pronto);
  let spedito = fmtDate(ordine.spedito_il);
  if (ordine.spedito_il) {
    const att = ordine.completato_il ? giorniTra(ordine.completato_il, ordine.spedito_il) : null;
    spedito += ` — attesa corriere/cliente: ${att === null || att < 0 ? '—' : giorni(att)}`;
  }
  kv('Spedito il', spedito);

  // 4. Fasi esterne (solo se l'ordine ne ha di applicabili)
  const tipoGestione = (f) => f.fase_id !== undefined ? (fasi.find(x => x.id === f.fase_id)?.tipo_gestione || 'standard') : (f.tipo_gestione || 'standard');
  const attesaEsterna = (f) => f.fase_id !== undefined ? !!fasi.find(x => x.id === f.fase_id)?.e_attesa_esterna : !!f.e_attesa_esterna;
  const nomeFase = (f) => f.fase_id !== undefined ? (f.nome_custom || fasi.find(x => x.id === f.fase_id)?.nome || '—') : (f.nome || '—');
  const applicabili = [...fasiOrdinate, ...(fasiExtra || [])].filter(f => f.stato !== 'non_applicabile');
  const fuori = applicabili.filter(f => tipoGestione(f) === 'spedizione_esterna' || (f.fase_id === undefined && f.spedita_il));
  const arrivi = applicabili.filter(f => !fuori.includes(f) && (tipoGestione(f) === 'conferma_ricezione' || attesaEsterna(f)));
  if (fuori.length || arrivi.length) {
    section('Fasi esterne');
    fuori.forEach(f => {
      const gg = (f.spedita_il && f.completata_il) ? giorniTra(f.spedita_il, f.completata_il) : null;
      riga(`${nomeFase(f)} — inviato il ${fmtDate(f.spedita_il)} · rientrato il ${fmtDate(f.completata_il)} · giorni fuori: ${gg === null || gg < 0 ? '—' : gg}`);
    });
    arrivi.forEach(f => riga(`${nomeFase(f)} — arrivato il ${fmtDate(f.completata_il)}`));
  }

  // 5. Note riservate (più recenti in alto), omesse se non ce ne sono
  const noteOrdinate = [...(note || [])].sort((a, b) => String(b.creata_il).localeCompare(String(a.creata_il)));
  if (noteOrdinate.length) {
    section('Note riservate');
    noteOrdinate.forEach(n => {
      checkPage();
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
      doc.text(fmtDate(n.creata_il), L, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      doc.splitTextToSize(String(n.testo || ''), W - 30).forEach(r => { checkPage(); doc.text(r, L + 30, y); y += lineH; });
      y += 1;
    });
  }

  // 6. Foto
  if (nFoto !== null && nFoto !== undefined) {
    y += 2; checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text(`${nFoto} foto nella cartella dell'ordine`, L, y); y += lineH;
  }

  // 7. Piè di pagina su ogni pagina
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 160);
    doc.text(`MangoApp — ${ordine.codice || ordine.id} — Pagina ${p}/${totalPages}`, L, 292);
  }

  return doc.output('blob');
}

// Dati e anteprima dello stesso PDF dell'archiviazione, senza archiviare né scrivere nulla (pulsante «Anteprima PDF» nel dettaglio ordine)
async function anteprimaPDFOrdine(ordineId) {
  const o = [...ordiniCache, ...ordiniSpeditiCache].find(x => x.id === ordineId);
  if (!o) return;
  // la scheda si apre in una scheda del browser: la finestra va aperta subito, nel gesto del clic
  const finestra = window.open('', '_blank');
  try {
    const [{ data: fasiOrd, error: e1 }, { data: fasiExtra, error: e2 }, { data: esitoNote }, { data: esitoFoto }] = await Promise.all([
      sb.from('ordine_fasi').select('id, fase_id, nome_custom, stato, completata_il, spedita_il').eq('ordine_id', o.id).order('id'),
      sb.from('fasi_ordine_extra').select('id, nome, stato, completata_il, spedita_il, e_attesa_esterna, tipo_gestione').eq('ordine_id', o.id).order('creato_il'),
      sb.rpc('note_riservate_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_ordine_ids: [o.id] }),
      sb.functions.invoke('allegati-ordine-url', { headers: await _headerAutorizzazione(), body: { p_responsabile_id: currentUserRow.id, p_ordine_id: o.id } }),
    ]);
    if (e1 || e2) throw new Error('fasi non disponibili');
    if (!esitoNote?.ok) throw new Error('note riservate non disponibili');
    await arricchisciOrdini([o]);
    const nFoto = esitoFoto?.ok ? (esitoFoto.allegati || []).length : null;
    const blob = generaPDFOrdine(o, fasiOrd, fasiExtra, esitoNote.note, nFoto);
    const url = URL.createObjectURL(blob);
    if (finestra) finestra.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = `scheda-ordine-${o.codice || o.id}.pdf`; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (e) {
    if (finestra) finestra.close();
    toast('Anteprima non disponibile: ' + e.message, 'err');
  }
}

// ─── Scrive un file nella sottocartella e RILEGGE DAL DISCO per verificare che sia
// stato scritto davvero — un createWritable()/close() che non solleva eccezioni non è
// prova sufficiente (è il principio dietro metà dei difetti di questo progetto: il
// codice che sembra aver funzionato). Ritorna true solo se la rilettura conferma
// dimensione > 0 (e coerente col blob originale, quando nota).
async function _scriviEVerifica(subDir, nomeFile, blob) {
  const fh = await subDir.getFileHandle(nomeFile, { create: true });
  const wr = await fh.createWritable();
  await wr.write(blob);
  await wr.close();
  const riletto = await fh.getFile();
  if (riletto.size === 0) return false;
  if (blob.size != null && riletto.size !== blob.size) return false;
  return true;
}

// ─── Archiviazione: solo da PC con Chrome o Edge ──────────────────────────────
// Dopo l'archiviazione le foto restano soltanto sul PC: la cancellazione dal cloud avviene solo dopo aver riletto ogni file dal disco, e questo
// si può fare solo con la selezione cartella (showDirectoryPicker). Su Safari, iPhone, Firefox non si archivia: niente zip, niente cancellazione senza verifica.
const MSG_SOLO_PC = "L'archiviazione si fa solo da PC con Chrome o Edge: le foto vengono cancellate dal cloud solo dopo aver verificato che siano salvate sul disco.";
function _archiviazioneDisponibile() {
  if (typeof window.showDirectoryPicker === 'function') return true;
  alert(MSG_SOLO_PC);
  return false;
}

const MSG_ERRORI_ARCHIVIAZIONE = {
  ordine_non_trovato: 'ordine non trovato', ordine_eliminato: "l'ordine è stato eliminato", ordine_non_spedito: "l'ordine non risulta spedito",
  ordine_gia_archiviato: "l'ordine è già archiviato", allegati_non_verificati: "l'ordine ha foto che non sono state verificate su disco",
  allegati_verificati_mancanti: 'richiesta incompleta: aggiorna la pagina', mfa_richiesta: 'serve la verifica a due fattori', sessione_non_valida: 'sessione non valida: accedi di nuovo',
  non_autorizzato: 'operazione non consentita'
};
function messaggioArchiviazione(codice) { return MSG_ERRORI_ARCHIVIAZIONE[codice] || codice || 'errore sconosciuto'; }

// ─── Esporta uno o più ordini: cartella per ordine, PDF + foto, poi archivia DB.
// Usata sia dal pulsante "Esporta Archivio" (tutti gli ordini da esportare) sia dal
// pulsante del singolo ordine — stessa funzione, stesso comportamento, per costruzione
// (non due implementazioni parallele che possono divergere).
//
// Ogni ordine è un'unità atomica: si scrive tutto, si rilegge dal disco per verificare,
// e SOLO se la verifica passa si archivia. Se anche un solo file fallisce, l'ordine viene
// saltato per intero — nessuna archiviazione, nessuna cancellazione, foto intatte in cloud —
// e si prosegue con gli altri.
//
// L'archiviazione è una sola chiamata (edge function archivia-ordine → RPC archivia_ordine):
// il database controlla stato dell'ordine e foto PRIMA di toccare qualunque cosa, cancella le
// righe e imposta archiviato_il solo se ogni foto dell'ordine è tra quelle verificate su disco;
// la funzione cancella poi dal bucket solo i percorsi restituiti dalla RPC.
async function _esportaOrdiniConVerifica(ordini) {
  if (!ordini.length) { toast('Nessun ordine da esportare', 'ok'); return; }
  if (!_archiviazioneDisponibile()) return;

  let dirHandle = null;
  try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (e) { return; }   // selezione annullata (o negata): nessuna archiviazione

  // note riservate di tutti gli ordini dell'esportazione, in una sola chiamata: se non si leggono, nessun PDF viene scritto (nessun ordine archiviato)
  const { data: esitoNote } = await sb.rpc('note_riservate_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_ordine_ids: ordini.map(x => x.id) });
  const notePerOrdine = esitoNote?.ok ? {} : null;
  (esitoNote?.note || []).forEach(n => { (notePerOrdine[n.ordine_id] = notePerOrdine[n.ordine_id] || []).push(n); });

  const totale = ordini.length;
  const falliti = [];
  const archiviati = [];

  for (let i = 0; i < totale; i++) {
    const o = ordini[i];
    toast(`Elaborazione ${i + 1}/${totale}: ${o.codice || o.cliente}…`, 'ok');
    try {
      const [
        { data: fasiOrd },
        { data: fasiExtra },
      ] = await Promise.all([
        sb.from('ordine_fasi')
          .select('id, fase_id, nome_custom, stato, completata_il, spedita_il')
          .eq('ordine_id', o.id).order('id'),
        sb.from('fasi_ordine_extra')
          .select('id, nome, stato, completata_il, spedita_il, e_attesa_esterna, tipo_gestione')
          .eq('ordine_id', o.id).order('creato_il'),
      ]);
      if (!notePerOrdine) throw new Error('note riservate non disponibili');

      // Path e URL firmati ottenuti insieme dalla stessa edge function della galleria (V-29:
      // niente più lettura diretta di storage.objects — vedi caricaGalleriaOrdineDettaglio).
      const { data: esitoFoto } = await sb.functions.invoke('allegati-ordine-url', {
        headers: await _headerAutorizzazione(),
        body: { p_responsabile_id: currentUserRow.id, p_ordine_id: o.id }
      });
      if (!esitoFoto?.ok) throw new Error(`elenco foto non disponibile (${esitoFoto?.errore || 'errore'})`);
      const allegati = esitoFoto.allegati || [];

      const speditoDate = o.spedito_il ? o.spedito_il.split('T')[0] : 'no-data';
      const folderName = `${o.cliente || 'cliente'}_${o.codice || o.id}_${speditoDate}`
        .replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);

      const attesi = allegati.length + 1; // foto + 1 PDF
      let scrittiVerificati = 0;
      const idsVerificati = [];
      let scritturaFallita = null;

      // Sottocartella dedicata — SEMPRE, mai file di ordini diversi mescolati
      const subDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

      for (const a of allegati) {
        if (!a.signedUrl) { scritturaFallita = `signed URL fallito: ${a.url_file}`; break; }
        const resp = await fetch(a.signedUrl);
        if (!resp.ok) { scritturaFallita = `download foto fallito (${resp.status}): ${a.url_file}`; break; }
        const blob = await resp.blob();
        const ok = await _scriviEVerifica(subDir, a.url_file.split('/').pop(), blob);
        if (!ok) { scritturaFallita = `verifica su disco fallita per foto: ${a.url_file}`; break; }
        scrittiVerificati++; idsVerificati.push(a.id);
      }

      if (!scritturaFallita) {
        await arricchisciOrdini([o]);
        const pdfBlob = generaPDFOrdine(o, fasiOrd, fasiExtra, notePerOrdine[o.id] || [], allegati.length);
        const okPdf = await _scriviEVerifica(subDir, 'scheda-ordine.pdf', pdfBlob);
        if (!okPdf) scritturaFallita = 'verifica su disco fallita per scheda-ordine.pdf';
        else scrittiVerificati++;
      }

      if (scritturaFallita || scrittiVerificati !== attesi) {
        falliti.push(`${o.codice || o.cliente} (${scritturaFallita || `${scrittiVerificati}/${attesi} file verificati`} — ordine NON archiviato, foto intatte)`);
        continue;
      }

      // Solo ora, con ogni file riletto dal disco: una sola chiamata archivia l'ordine e cancella le foto dal cloud.
      // Se il database rifiuta (ordine non spedito, già archiviato, eliminato, foto non verificate…) non viene toccato nulla.
      const { data: archEsito, error: archErr } = await sb.functions.invoke('archivia-ordine', {
        headers: await _headerAutorizzazione(),
        body: { p_ordine_id: o.id, p_responsabile_id: currentUserRow.id, p_allegati_verificati: idsVerificati }
      });
      if (archErr || !archEsito?.ok) {
        let codice = archEsito?.errore;
        if (!codice && archErr?.context && typeof archErr.context.json === 'function') { try { codice = (await archErr.context.json())?.errore; } catch (e) { /* risposta non leggibile */ } }
        falliti.push(`${o.codice || o.cliente} (archiviazione rifiutata: ${messaggioArchiviazione(codice || archErr?.message)} — ordine NON archiviato, foto intatte in cloud)`);
        continue;
      }
      if (archEsito.storage_errori?.length) {
        console.warn(`Archiviazione ${o.codice}: righe allegati cancellate ma cancellazione dal bucket fallita — file potenzialmente orfani:`, archEsito.storage_errori);
      }

      archiviati.push(o);

    } catch (e) {
      console.error('Errore esportazione ordine', o.codice, e);
      falliti.push(`${o.codice || o.id} (${e.message} — ordine NON archiviato, foto intatte)`);
    }
  }

  // CSV riepilogo alla radice della cartella scelta (solo per esportazioni multiple).
  // Niente ore/operatori: da quando non si registrano più sarebbero 0 o parziali; i tempi stanno, dove esistono, nella scheda di ogni ordine.
  if (archiviati.length > 1) {
    const headers = ['Codice', 'Cliente', 'Struttura', 'Tipo Prodotto', 'Materiale', 'Priorità', 'Stato', 'Creato il', 'Scadenza', 'Completato il', 'Spedito il'];
    await arricchisciOrdini(archiviati);
    const rows = archiviati.map(o => [
      o.codice, o.cliente, strutturaLabel(o.struttura), tipoProdLabel(o.tipo_prodotto), Etichette.attributiLato().map(a => Etichette.riepilogoLato(o, a.chiave)).join(' | '),
      o.priorita, o.stato,
      formatDate(o.creato_il),
      o.scadenza ? o.scadenza.split('T')[0] : '',
      o.completato_il ? formatDate(o.completato_il) : '',
      o.spedito_il ? formatDate(o.spedito_il) : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const csvBlob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const csvName = `riepilogo-archivio-${new Date().toISOString().split('T')[0]}.csv`;
    const csvFh = await dirHandle.getFileHandle(csvName, { create: true });
    const csvWr = await csvFh.createWritable(); await csvWr.write(csvBlob); await csvWr.close();
  }

  await loadOrdini();
  renderArchivioTable();

  if (falliti.length) {
    alert(`Esportazione completata: ${archiviati.length} ordini archiviati, ${falliti.length} saltati.\n\nSaltati (foto intatte, non archiviati):\n${falliti.join('\n')}`);
  } else {
    toast(`Esportazione completata: ${archiviati.length} ordin${archiviati.length === 1 ? 'e' : 'i'} archiviat${archiviati.length === 1 ? 'o' : 'i'}.`, 'ok');
  }
}

// ─── Esporta Archivio: tutti gli ordini spediti non ancora archiviati ─────────
async function esportaArchivio() {
  if (_bloccaSeClientObsoleto()) return;
  if (!_archiviazioneDisponibile()) return;
  const daEsportare = ordiniSpeditiCache.filter(o => !o.archiviato_il);
  if (!daEsportare.length) { toast('Nessun ordine da esportare', 'ok'); return; }
  await _esportaOrdiniConVerifica(daEsportare);
}

// ─── Esporta un singolo ordine — stessa funzione, stesso comportamento ────────
async function scaricaEliminaFoto(ordineId, codice, cliente) {
  if (_bloccaSeClientObsoleto()) return;
  if (!_archiviazioneDisponibile()) return;
  const ordine = ordiniSpeditiCache.find(o => o.id === ordineId);
  if (!ordine) { toast('Ordine non trovato', 'err'); return; }
  if (!confirm(`Esportare l'ordine ${codice} — ${cliente} (scheda PDF + foto) e archiviarlo?\n\nL'ordine sparirà da "Da esportare" e le foto verranno rimosse dal cloud dopo averle verificate sul disco.`)) return;
  await _esportaOrdiniConVerifica([ordine]);
}

// ═══════════════════════════════════════════════
// MEMORIA DATABASE

async function loadDimensioneDatabase() {
  const el = document.getElementById('db-memoria-content');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);font-size:13px;font-style:italic">Caricamento…</div>';

  const [{ data: dimData, error }, { data: cfgRows }] = await Promise.all([
    sb.rpc('dimensione_database', { p_responsabile_id: currentUserRow.id }),
    sb.from('config_sistema').select('valore').eq('chiave', 'limite_db_mb')
  ]);

  if (error) {
    el.innerHTML = `<div style="color:var(--alert);font-size:13px">Errore: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const limiteRaw = cfgRows?.[0]?.valore;
  const limiteMb = limiteRaw ? parseFloat(limiteRaw) : null;
  renderDimensioneDatabase(dimData, limiteMb);
}

function renderDimensioneDatabase(data, limiteMb) {
  const el = document.getElementById('db-memoria-content');
  if (!el || !data) return;

  const dbBytes = data.db_bytes;
  const dbMb = dbBytes / (1024 * 1024);
  const tabelle = data.tabelle || [];
  const maxTabBytes = tabelle.length ? tabelle[0].dim_bytes : 1;

  // Barra utilizzo totale
  let barraHtml = '';
  if (limiteMb) {
    const pct = Math.min(100, Math.round(dbMb / limiteMb * 100));
    const barColor = pct >= 90 ? 'var(--alert-strong)' : pct >= 70 ? 'var(--warn-strong)' : 'var(--accent)';
    const liberoMb = Math.max(0, limiteMb - dbMb);
    barraHtml = `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="font-weight:600">${data.db_leggibile} usati su ${limiteMb} MB</span>
          <span style="font-family:var(--font-mono);color:var(--muted)">${pct}% — ${liberoMb.toFixed(0)} MB liberi</span>
        </div>
        <div style="background:var(--border);border-radius:4px;height:8px">
          <div style="width:${pct}%;background:${barColor};border-radius:4px;height:100%;transition:width 0.4s"></div>
        </div>
      </div>`;
  } else {
    barraHtml = `
      <div style="margin-bottom:16px">
        <div style="font-size:22px;font-weight:700;font-family:var(--font-mono)">${data.db_leggibile}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Imposta il limite del piano per vedere la percentuale</div>
      </div>`;
  }

  // Breakdown tabelle
  const righeTabelleHtml = tabelle.map(t => {
    const pct = Math.round(t.dim_bytes / maxTabBytes * 100);
    const barColor = t.nome.startsWith('cron.') ? 'var(--warn-strong)' : 'var(--accent)';
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--ink)">${escapeHtml(t.nome)}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${escapeHtml(t.dim_leggibile)}</span>
      </div>
      <div style="background:var(--border);border-radius:4px;height:5px">
        <div style="width:${pct}%;background:${barColor};border-radius:4px;height:100%;transition:width 0.4s"></div>
      </div>
    </div>`;
  }).join('');

  // Campo limite configurabile
  const limiteAttualeVal = limiteMb ?? '';
  const limiteHtml = `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <label style="font-size:12px;color:var(--muted)">Limite piano (MB):</label>
      <input type="number" id="db-limite-input" value="${limiteAttualeVal}" placeholder="es. 500"
        style="width:90px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--bg);color:var(--ink)">
      <button class="btn btn-secondary" style="padding:5px 12px;font-size:12px" onclick="salvaLimiteDb()">Salva</button>
      ${!limiteMb ? '<span style="font-size:11px;color:var(--muted);font-style:italic">Imposta il limite per vedere la barra di utilizzo</span>' : ''}
    </div>`;

  el.innerHTML = `
    ${barraHtml}
    <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px">Tabelle più grandi</div>
    ${righeTabelleHtml}
    ${limiteHtml}`;
}

async function salvaLimiteDb() {
  const val = document.getElementById('db-limite-input')?.value.trim();
  const n = parseFloat(val);
  if (!val || isNaN(n) || n <= 0) { toast('Inserisci un valore valido in MB', 'err'); return; }
  const { data, error } = await sb.rpc('imposta_config_sistema', { p_chiave: 'limite_db_mb', p_valore: String(Math.round(n)), p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore salvataggio: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast('Limite salvato', 'ok');
  loadDimensioneDatabase();
}
