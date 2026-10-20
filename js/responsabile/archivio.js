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

// ─── Resa leggibile del log (cronologia PDF) ──────────────────────────────────
const _statoFaseMinuscolo = (s) => Etichette.statoFase(s).toLowerCase();
function _nomeOp(id) {
  if (!id) return null;
  const op = operatoriCache.find(o => o.id === id);
  return op ? `${op.nome} ${op.cognome}` : null;
}
// Converte una riga di archivio_log in { titolo, dettagli[] } in italiano leggibile.
// Testo del registro per le scelte manuali sulle fasi di un ordine (imposta_fase_ordine / ripristina_fase_ordine_automatica)
function _testoSceltaFaseLog(d) {
  const base = d.fase_scelta === 'torna_automatico' ? 'Fase tornata automatica'
    : (d.fase_scelta === 'attivata' ? 'Fase attivata dal responsabile' : 'Fase disattivata dal responsabile');
  return base + (d.segue_regole ? ' (come le regole automatiche)' : ' (scelta manuale: resta finché non la cambi)');
}

function _leggiLogRiga(azione, dettaglio, fasiOrd) {
  const d = dettaglio || {};
  const ofase = d.ordine_fase_id ? fasiOrd.find(f => f.id === d.ordine_fase_id) : null;
  const faseNome = ofase ? (ofase.nome_custom || fasi.find(x => x.id === ofase.fase_id)?.nome) : null;

  // Due "fase_iniziata" per la stessa fase = aggiunta di un collega, non un nuovo inizio
  if (azione === 'fase_iniziata' && d.aggiunto_da && d.operatore_id) {
    const nome = _nomeOp(d.operatore_id) || d.operatore_id;
    return { titolo: `Collega aggiunto: ${nome}${faseNome ? ` — ${faseNome}` : ''}`, dettagli: [] };
  }

  let titolo = Etichette.azioneLog(azione);
  if (faseNome) titolo += ` — ${faseNome}`;

  const dettagli = [];
  if (d.manuale_responsabile) dettagli.push('Completata manualmente dal responsabile');
  if (d.riapertura_responsabile) dettagli.push('Riaperta dal responsabile');
  if (d.unione) dettagli.push('Fasi unite in un unico avanzamento');
  if (d.durata_min != null) dettagli.push(`Durata: ${Number(d.durata_min).toFixed(0)} min`);
  if (d.concluso_da) dettagli.push(`Conclusa da: ${_nomeOp(d.concluso_da) || d.concluso_da}`);
  if (d.preso_in_carico_da) dettagli.push(`Presa in carico da: ${_nomeOp(d.preso_in_carico_da) || d.preso_in_carico_da}`);
  if (d.rimosso_da) dettagli.push(`Rimosso da: ${_nomeOp(d.rimosso_da) || d.rimosso_da}`);
  if (Array.isArray(d.operatori) && d.operatori.length) {
    dettagli.push(`Operatori: ${d.operatori.map(id => _nomeOp(id) || id).join(', ')}`);
  }
  if (azione === 'fase_riassegnata') {
    const vecchio = d.vecchio_operatore ? (_nomeOp(d.vecchio_operatore) || d.vecchio_operatore) : '—';
    const nuovo = d.nuovo_operatore ? (_nomeOp(d.nuovo_operatore) || d.nuovo_operatore) : '—';
    dettagli.push(`Da ${vecchio} a ${nuovo}`);
  } else if (d.vecchio_operatore) {
    dettagli.push(`Operatore precedente: ${_nomeOp(d.vecchio_operatore) || d.vecchio_operatore}`);
  }
  if (d.stato_precedente) dettagli.push(`Stato precedente: ${_statoFaseMinuscolo(d.stato_precedente)}`);
  if (d.modifica) dettagli.push('Ordine modificato dopo la creazione');
  if (d.fase_scelta) dettagli.push(_testoSceltaFaseLog(d));
  // Campi non riconosciuti: omessi deliberatamente (non mostrare JSON grezzo)

  return { titolo, dettagli };
}

// ─── Genera PDF scheda ordine con jsPDF ───────────────────────────────────────
function generaPDFOrdine(ordine, fasiOrd, fasiExtra, logOrd, allegati, opzioni = {}) {
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

  const kv = (label, value) => {
    checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
    doc.text(label + ':', L, y);
    // Colonna valore mai fissa a 44mm: per etichette lunghe (sezione Totali) etichetta e
    // valore si sovrappongono. Si misura l'etichetta e si allarga solo se serve — le
    // etichette corte (Dati Ordine) restano sui 44mm di sempre.
    const colValore = Math.max(44, doc.getTextWidth(label + ':') + 6);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(String(value ?? '—'), L + colValore, y); y += lineH;
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('it-IT') : '—';
  const fmtDT = (d) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  // Ordina le fasi per posizione di produzione (fasiOrd non ha un ordine garantito dalla query)
  const fasiOrdinate = [...(fasiOrd || [])].sort((a, b) => {
    const posA = fasi.find(x => x.id === a.fase_id)?.posizione ?? 9999;
    const posB = fasi.find(x => x.id === b.fase_id)?.posizione ?? 9999;
    return posA - posB;
  });

  // Header
  doc.setFillColor(245, 245, 245); doc.rect(L - 2, y - 6, W + 4, 14, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
  doc.text(`Scheda Ordine — ${ordine.codice || ordine.id}`, L, y); y += 7;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text(`Esportato il ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}`, L, y); y += 9;

  // Dati ordine
  section('Dati Ordine');
  kv('Cliente', ordine.cliente);
  kv('Codice', ordine.codice);
  kv('Tipo', ordine.tipo === 'extra' ? 'Ordine Extra' : 'Standard');
  if (ordine.tipo !== 'extra') {
    kv('Struttura', ordine.struttura);
    kv('Tipo Prodotto', ordine.tipo_prodotto);
    Etichette.valoriLatoOrdine(ordine).forEach(a => a.valori.forEach(v => kv(v.lato_etichetta ? v.lato_etichetta + ': ' + a.etichetta : a.etichetta, v.testo)));
    const lavPdf = Etichette.lavorazioniCncOrdine(ordine, lavorazioneCncNome(ordine.lavorazione_cnc_id));
    if (lavPdf.length) kv('Lavorazioni CNC', lavPdf.map(l => l.testo).join('; '));
  }
  kv('Quantità', ordine.quantita);
  kv('Priorità', ordine.priorita);
  kv('Creato il', fmtDate(ordine.creato_il));
  kv('Scadenza', fmtDate(ordine.scadenza));
  kv('Spedito il', fmtDate(ordine.spedito_il));
  kv('Completato il', fmtDate(ordine.completato_il));
  if (ordine.note_generali) {
    checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
    doc.text('Note:', L, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    const noteLines = doc.splitTextToSize(ordine.note_generali, W - 46);
    noteLines.forEach((line, i) => { if (i > 0) checkPage(); doc.text(line, L + 44, y); y += lineH; });
  }

  // ─── Dal giorno configurato (config_sistema.tempi_non_registrati_dal) la fase completata non registra più operatore, inizio e tempo ───
  // `dal` arriva dalla configurazione ('AAAA-MM-GG', o null se non impostata): niente data scritta nel codice.
  const dal = opzioni.tempiNonRegistratiDal || null;
  const giornoLocale = (d) => new Date(d).toLocaleDateString('sv-SE');          // AAAA-MM-GG nel fuso del browser
  const conDatiRegistrati = (f) => f.stato === 'completata' && !!f.completata_il && (!dal || giornoLocale(f.completata_il) < dal);
  const macchineElenco = opzioni.macchine || [];

  const fasiEseguibili = fasiOrdinate.filter(f => f.stato !== 'non_applicabile');
  const extraEseguibili = (fasiExtra || []).filter(f => f.stato !== 'non_applicabile');
  const tutteLeFasi = [...fasiEseguibili, ...extraEseguibili];
  const fasiCompletate = tutteLeFasi.filter(f => f.stato === 'completata').length;
  const tuttePrimaDellaData = tutteLeFasi.length > 0 && tutteLeFasi.every(conDatiRegistrati);   // totali ore solo se TUTTE le fasi hanno dati registrati
  const mostraDatiRegistrati = tutteLeFasi.some(conDatiRegistrati);                             // colonne operatore/tempo/inizio solo se almeno una fase li ha
  const fasiSaltate = fasiOrdinate.filter(f => f.scelta_motivo === 'fasi_successive_completate');

  // ─── Sintesi ───
  section('Sintesi');
  kv('Creato il', fmtDT(ordine.creato_il));
  kv('Completato il', fmtDT(ordine.completato_il));
  kv('Spedito il', fmtDT(ordine.spedito_il));
  const giorni = (ordine.creato_il && ordine.spedito_il) ? Math.round((new Date(ordine.spedito_il) - new Date(ordine.creato_il)) / 86400000) : null;
  kv('Giorni dalla creazione alla spedizione', giorni === null ? '—' : giorni);
  const entroScadenza = (ordine.scadenza && ordine.spedito_il) ? (giornoLocale(ordine.spedito_il) <= String(ordine.scadenza).slice(0, 10) ? 'Sì' : 'No') : '—';
  kv('Spedito entro la scadenza', entroScadenza);
  kv('Fasi eseguite', `${fasiCompletate} su ${tutteLeFasi.length}`);
  if (fasiSaltate.length) {
    checkPage();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
    doc.text('Fasi saltate:', L, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    const nomiSaltate = fasiSaltate.map(f => f.nome_custom || fasi.find(x => x.id === f.fase_id)?.nome || `#${f.fase_id}`).join(', ');
    doc.splitTextToSize(nomiSaltate, W - 46).forEach((line, i) => { if (i > 0) checkPage(); doc.text(line, L + 44, y); y += lineH; });
  }
  if (tuttePrimaDellaData) {
    // Tempo di lavorazione vs tempo di attesa esterna: il campo che distingue i due è e_attesa_esterna (su ordine_fasi si risale al catalogo `fasi`;
    // su fasi_ordine_extra è diretto sulla riga). Mostrati solo se tutte le fasi hanno i tempi registrati: mai "0h 00m" né totali parziali.
    const eAttesaEsterna = (f) => fasi.find(x => x.id === f.fase_id)?.e_attesa_esterna === true;
    const minutiExtra = (f) => Number(f.tempo_accumulato_minuti ?? (Number(f.ore_stimate_manuali) || 0) * 60) || 0;
    const minutiLavorazione = fasiEseguibili.reduce((s, f) => s + (eAttesaEsterna(f) ? 0 : (Number(f.tempo_accumulato_minuti) || 0)), 0)
      + extraEseguibili.reduce((s, f) => s + (f.e_attesa_esterna ? 0 : minutiExtra(f)), 0);
    const minutiAttesa = fasiEseguibili.reduce((s, f) => s + (eAttesaEsterna(f) ? (Number(f.tempo_accumulato_minuti) || 0) : 0), 0)
      + extraEseguibili.reduce((s, f) => s + (f.e_attesa_esterna ? minutiExtra(f) : 0), 0);
    const fmtOre = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min) % 60).padStart(2, '0')}m`;
    kv('Tempo di lavorazione', fmtOre(minutiLavorazione));
    kv('Tempo di attesa esterna', fmtOre(minutiAttesa));
    kv('Tempo complessivo (lavorazione + attesa)', fmtOre(Math.round(minutiLavorazione + minutiAttesa)));
  }

  // Tabella generica: colonne con peso di larghezza, righe di celle {t: testo, s: 'attenzione' per il corsivo arancione}; il testo va a capo nella cella
  const tabella = (colonne, righe) => {
    const gap = 2, pesoTot = colonne.reduce((s, c) => s + c.peso, 0), util = W - gap * (colonne.length - 1);
    let x = L;
    const pos = colonne.map(c => { const w = util * c.peso / pesoTot; const p = { x, w }; x += w + gap; return p; });
    const intestazione = () => {
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
      colonne.forEach((c, i) => doc.text(c.t, pos[i].x, y));
      y += lineH * 0.85; hr(220, 220, 220);
    };
    intestazione();
    for (const riga of righe) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      const celle = riga.map((c, i) => doc.splitTextToSize(String(c.t ?? ''), pos[i].w));
      const alt = Math.max(...celle.map(l => l.length), 1) * 3.6;
      if (y + alt > 272) { doc.addPage(); y = 15; intestazione(); }
      celle.forEach((linee, i) => {
        const attenzione = riga[i].s === 'attenzione';
        doc.setFont('helvetica', attenzione ? 'italic' : 'normal');
        if (attenzione) doc.setTextColor(200, 120, 40); else doc.setTextColor(30, 30, 30);
        linee.forEach((linea, k) => doc.text(linea, pos[i].x, y + k * 3.6));
      });
      y += Math.max(alt, lineH);
    }
  };
  const nomeOperatore = (f) => { const op = operatoriCache.find(x => x.id === f.operatore_id); return op ? `${op.nome} ${op.cognome}` : (f.operatore_id ? '?' : '—'); };

  // Fasi standard — omesse per ordini di tipo extra (non hanno un catalogo fasi standard)
  if (ordine.tipo !== 'extra' && fasiEseguibili.length) {
    if (y > 235) { doc.addPage(); y = 15; }   // titolo, intestazione e almeno una riga stanno insieme
    section('Fasi di Produzione');
    const piuPezzi = Number(ordine.quantita) > 1;
    const colonne = [{ t: 'Fase', peso: 3 }, { t: 'Completata il', peso: 2 }];
    if (piuPezzi) colonne.push({ t: 'Pezzi', peso: 1 });
    if (mostraDatiRegistrati) colonne.push({ t: 'Operatore', peso: 2 }, { t: 'Tempo (min)', peso: 1.6 }, { t: 'Inizio', peso: 1.4 });
    colonne.push({ t: 'Note', peso: 3 });
    tabella(colonne, fasiEseguibili.map(f => {
      const faseName = f.nome_custom || fasi.find(x => x.id === f.fase_id)?.nome || `#${f.fase_id}`;
      const registrati = conDatiRegistrati(f);
      const riga = [{ t: faseName }, f.stato === 'completata' ? { t: fmtDT(f.completata_il) } : { t: 'non eseguita', s: 'attenzione' }];
      // una fase completata ha fatto tutti i pezzi (chiudendola il contatore si azzera); per le altre si mostra l'avanzamento, se c'è
      if (piuPezzi) riga.push({ t: f.stato === 'completata' ? `${ordine.quantita} su ${ordine.quantita}` : (Number(f.pezzi_completati) > 0 ? `${f.pezzi_completati} su ${ordine.quantita}` : '—') });
      if (mostraDatiRegistrati) riga.push({ t: registrati ? nomeOperatore(f) : '' }, { t: registrati ? (f.tempo_accumulato_minuti != null ? Number(f.tempo_accumulato_minuti).toFixed(1) : '—') : '' }, { t: registrati ? fmtDate(f.iniziata_il) : '' });
      riga.push({ t: f.note_operatore || '' });
      return riga;
    }));
    if (dal && mostraDatiRegistrati) {
      checkPage();
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
      doc.text(`Dal ${new Date(dal + 'T12:00:00').toLocaleDateString('it-IT')} operatore e tempi non vengono più registrati alla fase.`, L, y + 2); y += 5;
    }
  }

  // Fasi extra — sezione sempre presente: chi legge deve sapere che è stata controllata, non restare nel dubbio se manchi o non sia stata cercata.
  if (y > 235) { doc.addPage(); y = 15; }
  section('Fasi Extra');
  if (!fasiExtra || !fasiExtra.length) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(140, 140, 140);
    doc.text('Nessuna', L, y); y += lineH;
  } else {
    const colonne = [{ t: 'Nome', peso: 3 }, { t: 'Macchina', peso: 2 }, { t: 'Stato', peso: 1.6 }, { t: 'Completata il', peso: 2 }];
    if (mostraDatiRegistrati) colonne.push({ t: 'Operatore', peso: 2 });
    colonne.push({ t: 'Note', peso: 3 });
    tabella(colonne, fasiExtra.map(f => {
      const registrati = conDatiRegistrati(f);
      const riga = [{ t: f.nome || '—' }, { t: macchineElenco.find(m => m.id === f.macchina_id)?.nome || '—' }, { t: f.stato ? _statoFaseMinuscolo(f.stato) : '—' },
                    { t: f.completata_il ? fmtDT(f.completata_il) : '—' }];
      if (mostraDatiRegistrati) riga.push({ t: registrati ? nomeOperatore(f) : '' });
      riga.push({ t: f.note_operatore || '' });
      return riga;
    }));
  }

  // Elenco foto — nome file + fase di appartenenza (le foto stanno nella cartella accanto al PDF)
  if (allegati && allegati.length) {
    section('Foto Allegate');
    doc.setFontSize(8.5);
    for (const a of allegati) {
      checkPage();
      const ofase = fasiOrdinate.find(f => f.id === a.ordine_fase_id);
      const faseNome = ofase ? (ofase.nome_custom || fasi.find(x => x.id === ofase.fase_id)?.nome) : null;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      doc.text(a.url_file.split('/').pop(), L, y);
      doc.setTextColor(120, 120, 120);
      doc.text(faseNome || (a.ordine_fase_id ? '—' : 'Ordine'), L + 100, y);
      y += lineH * 0.85;
    }
  }

  // Cronologia completa
  if (logOrd && logOrd.length) {
    section('Cronologia Completa');
    for (const l of logOrd) {
      const u = l.users ? `${l.users.nome} ${l.users.cognome}` : '—';
      const { titolo, dettagli } = _leggiLogRiga(l.azione, l.dettaglio, fasiOrdinate);
      // Il titolo può andare a capo (nomi fase lunghi) — misurato PRIMA di disegnare,
      // altrimenti l'avanzamento verticale fisso di sotto non tiene conto delle righe in
      // più e la seconda riga del titolo finisce sopra la voce di cronologia successiva.
      // Il font va fissato esplicitamente PRIMA di ogni splitTextToSize: lo stato lasciato
      // dall'iterazione precedente (7.5, dettagli) non è quello con cui il titolo verrà
      // disegnato (8.5) — misurare con la dimensione sbagliata fa calcolare un a-capo più
      // permissivo di quanto poi la riga occupi davvero, riproducendo la stessa sovrapposizione.
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      const titoloLines = doc.splitTextToSize(titolo, 78);
      doc.setFontSize(7.5);
      const dettagliLines = dettagli.flatMap(riga => doc.splitTextToSize(riga, W - 14));
      const altezzaTitolo = Math.max(titoloLines.length * 3.6, lineH * 0.85);
      const altezzaBlocco = altezzaTitolo + dettagliLines.length * 3.5;
      // L'intero blocco (titolo + dettagli) si valuta per il salto pagina in un colpo solo,
      // non riga per riga: altrimenti una voce può iniziare in fondo a una pagina e
      // continuare nella successiva, spezzata a metà.
      if (y + altezzaBlocco > 272) { doc.addPage(); y = 15; }

      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 80, 120);
      doc.text(`${fmtDT(l.timestamp)}`, L, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      titoloLines.forEach((line, i) => doc.text(line, L + 42, y + i * 3.6));
      doc.setTextColor(100, 100, 100);
      doc.text(u, L + 122, y);
      y += altezzaTitolo;
      doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
      dettagliLines.forEach(line => { doc.text(line, L + 6, y); y += 3.5; });
    }
  }

  // Footer su ogni pagina
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 160);
    doc.text(`MangoApp — ${ordine.codice || ordine.id} — Pagina ${p}/${totalPages}`, L, 292);
  }

  return doc.output('blob');
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

  // da questa data la fase completata non registra più operatore, inizio e tempo: la scheda PDF li omette (data da config_sistema)
  const { data: cfgTempi } = await sb.from('config_sistema').select('valore').eq('chiave', 'tempi_non_registrati_dal').maybeSingle();
  const tempiNonRegistratiDal = cfgTempi?.valore || null;
  if (!macchineList.length) await loadMacchine();
  if (!operatoriCache.length && typeof loadOperatori === 'function') { try { await loadOperatori(); } catch (e) { /* i nomi restano "?" */ } }

  const totale = ordini.length;
  const falliti = [];
  const archiviati = [];

  for (let i = 0; i < totale; i++) {
    const o = ordini[i];
    toast(`Elaborazione ${i + 1}/${totale}: ${o.codice || o.cliente}…`, 'ok');
    try {
      const [
        { data: fasiOrd },
        { data: logOrd },
        { data: fasiExtra },
      ] = await Promise.all([
        sb.from('ordine_fasi')
          .select('id, fase_id, nome_custom, stato, operatore_id, tempo_accumulato_minuti, n_ordini_batch, iniziata_il, completata_il, note_operatore, pezzi_completati, scelta_manuale, scelta_motivo')
          .eq('ordine_id', o.id).order('id'),
        sb.from('archivio_log')
          .select('azione, utente_id, timestamp, dettaglio, users!utente_id(nome,cognome)')
          .eq('ordine_id', o.id).order('timestamp'),
        sb.from('fasi_ordine_extra')
          .select('id, nome, stato, operatore_id, ore_stimate_manuali, completata_il, note_operatore, iniziata_il, e_attesa_esterna, macchina_id, tempo_accumulato_minuti')
          .eq('ordine_id', o.id).order('creato_il'),
      ]);

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
        const pdfBlob = generaPDFOrdine(o, fasiOrd, fasiExtra, logOrd, allegati, { tempiNonRegistratiDal, macchine: macchineList });
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
