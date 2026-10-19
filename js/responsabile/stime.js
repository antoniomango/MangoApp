// responsabile.html — stime di consegna e tempi di un ordine.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

async function calcolaStimaSingoloOrdine(id) {
  const el = document.getElementById('det-stima-consegna');
  if (!el) return;
  const ordine = ordiniCache.find(o => o.id === id);
  if (!ordine) { el.textContent = '—'; return; }

  const minTotale = _etaMinutiCache[id];
  if (!minTotale) { el.textContent = 'Dati insufficienti'; el.style.color = 'var(--muted)'; return; }

  const minutiGiorno = Calendario.minutiGiorno();
  if (!minutiGiorno) { el.textContent = 'Dati insufficienti'; el.style.color = 'var(--muted)'; return; }

  const giorni = Math.ceil(minTotale / minutiGiorno);

  // Usa la RPC DB (include chiusure aziendali, sabato_lavorativo) per la data autorevole
  let dataStimataStr;
  try {
    const { data: dataDB } = await sb.rpc('data_consegna_stimata', { p_giorni_lavorativi_necessari: giorni });
    dataStimataStr = dataDB;
  } catch (_) {
    dataStimataStr = Calendario.aggiungiGiorniLavorativi(Calendario.oggiIso(), giorni).toISOString().split('T')[0];
  }

  const isRischio = ordine.scadenza && dataStimataStr > ordine.scadenza;
  el.textContent = formatDate(dataStimataStr) + (isRischio ? ' ⚠️' : ' ✓');
  el.style.color = isRischio ? 'var(--alert)' : 'var(--ok)';
}

// Calcola ETA per lista ordini usando coda per fase_id (critical path).
// fasiMap: { ordine_id -> [{fase_id, stato}] }
// Ritorna { ordine_id -> minuti_eta } e aggiorna _etaMinutiCache.
// Calcola ETA per lista ordini.
// Fasi INTERNE: modello coda per fase (critical path con altri ordini in attesa).
// Fasi ESTERNE: aggiunte direttamente all'ETA come giorni-calendario-equivalenti
//   (il fornitore lavora in parallelo, non fa coda con gli operatori interni).
// Il valore in _etaMinutiCache è in "minuti-lavorativi-equivalenti":
//   diviso per minutiGiornoGlobale dà i giorni totali stimati per il cliente.
function buildEtaFromFasi(ordiniList, fasiMap) {
  const minGiorno = Calendario.minutiGiorno() || Infinity;   // senza calendario caricato nessuna stima in giorni (mai un valore inventato)

  // Coda per fasi INTERNE (seriali per fase, condivise tra ordini)
  const faseQueue = {};
  ordiniList.forEach(o => {
    const q = o.quantita || 1;
    const scad = o.scadenza || '9999-12-31';
    (fasiMap[o.id] || [])
      .filter(f => !f.esterna && (f.stato === 'disponibile' || f.stato === 'in_corso'))
      .forEach(f => {
        const fid = parseInt(f.fase_id);
        const media = faseMediaMinutiMap[fid];
        if (!media) return;
        const minuti = (f.stato === 'in_corso' ? media * Calendario.costante('fattore_fase_in_corso') : media) * q;
        if (!faseQueue[fid]) faseQueue[fid] = [];
        faseQueue[fid].push({ ordine_id: o.id, minuti, scad });
      });
  });
  Object.values(faseQueue).forEach(q => q.sort((a, b) => a.scad.localeCompare(b.scad)));

  const eta = {};

  // Mappa fase_id -> dipendenze reali (fase_dipendenze, caricate in loadFasi() dentro `fasi`)
  const dipendenzeMap = {};
  fasi.forEach(f => { dipendenzeMap[f.id] = f.dipendenze || []; });

  // Critical path interno: somma (attesa in coda + durata) lungo le dipendenze reali tra le
  // fasi rimanenti dello stesso ordine — non un massimo globale su tutte le fasi (un pezzo
  // deve passarle in sequenza se dipendono l'una dall'altra). Fasi senza una dipendenza reale
  // tra loro restano parallele: l'ETA finale è il massimo tra i "rami" che confluiscono,
  // esattamente come nel ramo bloccante più lungo, non un massimo su tutte le 17 fasi.
  ordiniList.forEach(o => {
    const fasiRimanenti = (fasiMap[o.id] || [])
      .filter(f => !f.esterna && (f.stato === 'disponibile' || f.stato === 'in_corso'));
    const idsRimanenti = new Set(fasiRimanenti.map(f => parseInt(f.fase_id)));

    // Costo proprio di ciascuna fase (attesa in coda + durata) — logica invariata rispetto a prima.
    const costo = {};
    fasiRimanenti.forEach(f => {
      const fid = parseInt(f.fase_id);
      const queue = faseQueue[fid];
      if (!queue) return;
      const pos = queue.findIndex(i => i.ordine_id === o.id);
      if (pos < 0) return;
      const attesa = queue.slice(0, pos).reduce((s, i) => s + i.minuti, 0);
      costo[fid] = attesa + queue[pos].minuti;
    });

    // Finish-time per fase = costo proprio + il massimo tra le dipendenze dirette ancora
    // rimanenti (0 se una dipendenza non è tra le fasi rimanenti: già completata/non applicabile,
    // quindi non contribuisce altra attesa). Guardia anti-ciclo difensiva: fase_dipendenze è
    // dati editabili da UI, un ciclo non dovrebbe esistere ma non deve mai appendere il browser.
    const finish = {};
    const inCorsoCalcolo = new Set();
    function calcolaFinish(fid) {
      if (finish[fid] !== undefined) return finish[fid];
      if (!(fid in costo)) return 0;
      if (inCorsoCalcolo.has(fid)) return 0; // ciclo rilevato, tronca invece di appendere
      inCorsoCalcolo.add(fid);
      const preds = (dipendenzeMap[fid] || []).filter(d => idsRimanenti.has(d));
      const maxPred = preds.reduce((m, d) => Math.max(m, calcolaFinish(d)), 0);
      inCorsoCalcolo.delete(fid);
      finish[fid] = maxPred + costo[fid];
      return finish[fid];
    }

    let maxMin = 0;
    fasiRimanenti.forEach(f => {
      maxMin = Math.max(maxMin, calcolaFinish(parseInt(f.fase_id)));
    });
    if (maxMin > 0) eta[o.id] = maxMin;
  });

  // Fasi ESTERNE: aggiunta diretta come minuti-calendario scalati
  // Scaling: min_cal * (minGiorno/1440) → quando diviso per minGiorno = giorni calendario
  ordiniList.forEach(o => {
    let extEquiv = 0;
    (fasiMap[o.id] || [])
      .filter(f => f.esterna)
      .forEach(f => {
        const fid = parseInt(f.fase_id);
        const media = faseMediaMinutiMap[fid];
        if (!media) return;
        const minCal = f.inCorso ? media * Calendario.costante('fattore_fase_in_corso') : media; // in_corso/in_attesa = quota restante (kpi_config)
        extEquiv += minCal * (minGiorno / 1440);
      });
    if (extEquiv > 0) eta[o.id] = (eta[o.id] || 0) + extEquiv;
  });

  Object.assign(_etaMinutiCache, eta);
  return eta;
}

function minutiToOreMinuti(m) {
  if (!m && m !== 0) return '—';
  const tot = Math.round(Number(m));
  if (tot <= 0) return '0m';
  const h = Math.floor(tot / 60);
  const min = tot % 60;
  return h > 0 ? `${h}h ${min > 0 ? min + 'm' : ''}`.trim() : `${min}m`;
}
