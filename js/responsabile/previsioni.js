// responsabile.html — stima di consegna dal server (lista e dettaglio ordine) e riquadro «Affidabilità delle previsioni».
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).
// Una sola stima: quella della simulazione del server (RPC stime_consegna_ordini); il testo del rischio è Etichette.rischioTesto.

const PREVISIONI_TESTI = {
  listaDopoArrivo: n => 'stima: ' + n + ' g dopo l’arrivo',
  listaData: d => 'stima: ' + d,
  oltreOrizzonte: 'oltre l’orizzonte di calcolo',
  nessunaStima: '—',
  dettaglioDopoArrivo: n => 'Pronto ' + n + (n === 1 ? ' giorno lavorativo' : ' giorni lavorativi') + ' dopo l’arrivo del materiale (data limite di arrivo nel riquadro In attesa esterna)',
  titolo: 'Affidabilità delle previsioni',
  intro: 'Ogni giorno lavorativo, prima del turno, si salva la data di fine prevista di ogni ordine aperto. Qui le si confronta con la data in cui l’ordine è risultato pronto (non spedito). Le differenze sono in giorni lavorativi.',
  storicoDal: d => 'Previsioni salvate dal ' + d + '.',
  nessunoStorico: 'Non ci sono ancora previsioni salvate: la prima viene scritta alla prossima generazione del piano del giorno.',
  dal: 'Dal', al: 'al',
  senzaMateriale: 'Ordini senza materiale in arrivo',
  conMateriale: 'Ordini con materiale in attesa da fuori',
  materialeNota: 'Per questi ordini la previsione parte dal giorno in cui si suppone arrivato il materiale: si valutano separati perché il ritardo del fornitore non dipende dalla produzione.',
  fasce: { '1-2': '1–2 giorni prima', '3-5': '3–5 giorni prima', '6-10': '6–10 giorni prima', 'oltre10': 'oltre 10 giorni prima', 'tutte': 'Tutte' },
  colonne: { fascia: 'Previsione fatta', n: 'Previsioni', errore: 'Errore medio', scostamento: 'Scostamento', entro: 'Entro ±1 giorno', semplice: 'Stima semplice: errore' },
  insufficienti: 'Dati insufficienti',
  spiegazioni: [
    ['Previsione fatta', 'quanti giorni lavorativi prima della fine reale era stata calcolata la previsione.'],
    ['Previsioni', 'quanti confronti ci sono. Un ordine in spedizione unica con altri conta una volta sola.'],
    ['Errore medio', 'di quanti giorni lavorativi, in media, la data prevista ha sbagliato, in più o in meno.'],
    ['Scostamento', 'positivo: gli ordini sono finiti dopo la data prevista; negativo: prima. Dice se la previsione è ottimista o prudente.'],
    ['Entro ±1 giorno', 'quota di ordini finiti al massimo un giorno lavorativo prima o dopo la previsione.'],
    ['Stima semplice: errore', 'confronto: data di creazione più il tempo mediano degli ultimi due mesi. La simulazione serve solo se sbaglia meno di questa.']
  ],
  rischioTitolo: 'Ritardi e allarmi',
  rischioVoci: [
    ['ordini_con_scadenza', 'Ordini pronti con una scadenza', 'ordini considerati (una volta per ordine o gruppo).'],
    ['pronti_oltre_scadenza', 'Pronti dopo la scadenza', 'ordini finiti oltre la data richiesta.'],
    ['visti_in_anticipo', 'Ritardi visti in anticipo', 'di quelli in ritardo, quanti erano già segnati a rischio almeno 2 giorni lavorativi prima della scadenza.'],
    ['segnalati', 'Segnalati a rischio in anticipo', 'ordini segnati a rischio almeno 2 giorni lavorativi prima della scadenza.'],
    ['falsi_allarmi', 'Falsi allarmi', 'segnalati a rischio che poi sono stati pronti in tempo.']
  ],
  esclusiTitolo: 'Esclusi dal calcolo',
  esclusiVoci: [
    ['ordini_eliminati', 'ordini eliminati'],
    ['oltre_orizzonte', 'previsioni oltre l’orizzonte di calcolo (nessuna data)'],
    ['gruppo_date_diverse', 'gruppi di spedizione unica con membri pronti in giorni diversi'],
    ['riaperti_inclusi', 'ordini riaperti dopo essere stati pronti: inclusi, con l’ultima data di fine']
  ],
  mediana: (g, n) => 'Stima semplice: creazione + ' + g + (g === 1 ? ' giorno lavorativo' : ' giorni lavorativi') + ' (mediana di ' + n + ' ordini completati nelle 8 settimane prima dell’inizio).',
  medianaAssente: 'Stima semplice non disponibile: nessun ordine completato nelle 8 settimane prima dell’inizio.',
  errore: 'Errore: '
};

// ordine_id -> stima del server; aggiornata da caricaStimeServer()
let stimeServer = {};

async function caricaStimeServer() {
  if (!currentUserRow) return stimeServer;
  const { data, error } = await sb.rpc('stime_consegna_ordini', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { console.warn('stime_consegna_ordini', error?.message || data?.errore); return stimeServer; }
  stimeServer = {};
  (data.ordini || []).forEach(s => { stimeServer[s.ordine_id] = s; });
  return stimeServer;
}

// Dettaglio ordine: «Consegna stimata»
async function mostraStimaDettaglio(id) {
  const el = document.getElementById('det-stima-consegna');
  if (!el) return;
  const ordine = ordiniCache.find(o => o.id === id);
  if (!ordine) { el.textContent = PREVISIONI_TESTI.nessunaStima; return; }
  await caricaStimeServer();
  if (document.getElementById('det-stima-consegna') !== el) return;   // il dettaglio è stato ridisegnato nel frattempo
  const s = stimeServer[id];
  el.removeAttribute('title');
  if (!s) { el.textContent = PREVISIONI_TESTI.nessunaStima; el.style.color = 'var(--muted)'; return; }
  const colore = s.a_rischio ? 'var(--alert)' : 'var(--ok)';
  if (s.oltre_orizzonte) { el.textContent = PREVISIONI_TESTI.oltreOrizzonte; el.style.color = s.a_rischio ? 'var(--alert)' : 'var(--muted)'; }
  else if (s.materiale_in_attesa && s.giorni_dopo_arrivo) { el.textContent = PREVISIONI_TESTI.dettaglioDopoArrivo(s.giorni_dopo_arrivo); el.style.color = colore; }
  else if (s.fine_prevista) { el.textContent = formatDate(s.fine_prevista) + (s.a_rischio ? ' ⚠️' : ' ✓'); el.style.color = colore; }
  else { el.textContent = PREVISIONI_TESTI.nessunaStima; el.style.color = 'var(--muted)'; }
  if (s.a_rischio) el.title = Etichette.rischioTesto(s, ordine.scadenza);
}

// Lista ordini: testo e classe di rischio di una riga (usa la cache stimeServer)
function stimaListaOrdine(id, scadenza) {
  const s = stimeServer[id];
  if (!s) return null;
  let testo = '';
  if (s.oltre_orizzonte) testo = PREVISIONI_TESTI.oltreOrizzonte;
  else if (s.materiale_in_attesa && s.giorni_dopo_arrivo) testo = PREVISIONI_TESTI.listaDopoArrivo(s.giorni_dopo_arrivo);
  else if (s.fine_prevista) testo = PREVISIONI_TESTI.listaData(new Date(s.fine_prevista + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }));
  return { testo, rischio: !!s.a_rischio, titolo: s.a_rischio ? Etichette.rischioTesto(s, scadenza) : '' };
}

// ───────────────────────────────────────────────
// Riquadro «Affidabilità delle previsioni» (sezione KPI)
// ───────────────────────────────────────────────
function _affNum(v, segno) {
  if (v === null || v === undefined) return '—';
  const t = Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return segno && Number(v) > 0 ? '+' + t : t;
}

function _affRighe(res, mat) {
  const T = PREVISIONI_TESTI, ordine = ['1-2', '3-5', '6-10', 'oltre10', 'tutte'];
  return ordine.map(f => (res.celle || []).find(c => c.materiale_in_attesa === mat && c.fascia === f)).filter(Boolean).map(c => {
    const stile = 'padding:6px 8px;text-align:right;font-family:var(--font-mono)';
    const bordo = c.fascia === 'tutte' ? 'border-top:2px solid var(--border);font-weight:600' : 'border-top:1px solid var(--border)';
    if (c.dati_insufficienti) {
      return `<tr style="${bordo}"><td style="padding:6px 8px">${escapeHtml(T.fasce[c.fascia])}</td><td style="${stile}">${c.n}</td>
        <td colspan="4" style="padding:6px 8px;color:var(--muted)">${escapeHtml(T.insufficienti)}</td></tr>`;
    }
    const s = c.simulazione, b = c.semplice;
    return `<tr style="${bordo}"><td style="padding:6px 8px">${escapeHtml(T.fasce[c.fascia])}</td><td style="${stile}">${c.n}</td>
      <td style="${stile}">${_affNum(s.errore_medio)}</td><td style="${stile}">${_affNum(s.scostamento, true)}</td>
      <td style="${stile}">${_affNum(s.entro_un_giorno_pct)}%</td><td style="${stile};color:var(--muted)">${b ? _affNum(b.errore_medio) : '—'}</td></tr>`;
  }).join('');
}

function _affTabella(res, mat, titolo, nota) {
  const T = PREVISIONI_TESTI, c = T.colonne, th = (t, dx) => `<th style="padding:6px 8px;${dx ? 'text-align:right' : ''}">${escapeHtml(t)}</th>`;
  return `<div style="margin:14px 0 4px;font-weight:700;font-size:12px">${escapeHtml(titolo)}</div>
    ${nota ? `<div style="font-size:11px;color:var(--muted);margin-bottom:6px">${escapeHtml(nota)}</div>` : ''}
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em">
        ${th(c.fascia)}${th(c.n, 1)}${th(c.errore, 1)}${th(c.scostamento, 1)}${th(c.entro, 1)}${th(c.semplice, 1)}
      </tr></thead><tbody>${_affRighe(res, mat)}</tbody></table></div>`;
}

function renderAffidabilitaPrevisioni(res) {
  const T = PREVISIONI_TESTI;
  const storico = res.storico_dal ? T.storicoDal(formatDate(res.storico_dal)) : T.nessunoStorico;
  const mediana = res.mediana_semplice_giorni === null || res.mediana_semplice_giorni === undefined ? T.medianaAssente : T.mediana(res.mediana_semplice_giorni, res.mediana_semplice_ordini);
  const r = res.rischio || {}, x = res.esclusi || {};
  return `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${escapeHtml(storico)} ${escapeHtml(mediana)}</div>
    ${_affTabella(res, false, T.senzaMateriale)}
    ${_affTabella(res, true, T.conMateriale, T.materialeNota)}
    <div style="margin:18px 0 6px;font-weight:700;font-size:12px">${escapeHtml(T.rischioTitolo)}</div>
    <div style="font-size:12px;display:grid;grid-template-columns:auto 1fr;gap:4px 12px">${T.rischioVoci.map(([k, nome, spiega]) =>
      `<span style="font-family:var(--font-mono);font-weight:600;text-align:right">${Number(r[k] ?? 0)}</span><span>${escapeHtml(nome)} <span style="color:var(--muted);font-size:11px">— ${escapeHtml(spiega)}</span></span>`).join('')}</div>
    <div style="margin:18px 0 6px;font-weight:700;font-size:12px">${escapeHtml(T.esclusiTitolo)}</div>
    <ul style="margin:0;padding-left:18px;font-size:12px">${T.esclusiVoci.map(([k, nome]) => `<li><span style="font-family:var(--font-mono)">${Number(x[k] ?? 0)}</span> ${escapeHtml(nome)}</li>`).join('')}</ul>
    <div style="margin:18px 0 6px;font-weight:700;font-size:12px">Come leggere i numeri</div>
    <ul style="margin:0;padding-left:18px;font-size:11px;color:var(--muted)">${T.spiegazioni.map(([n, t]) => `<li><b>${escapeHtml(n)}</b>: ${escapeHtml(t)}</li>`).join('')}</ul>`;
}

async function loadAffidabilitaPrevisioni() {
  const el = document.getElementById('kpi-affidabilita');
  if (!el || !currentUserRow) return;
  const dalEl = document.getElementById('kpi-aff-dal'), alEl = document.getElementById('kpi-aff-al');
  if (dalEl && !dalEl.value) dalEl.value = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  if (alEl && !alEl.value) alEl.value = Calendario.oggiIso();
  const dal = dalEl?.value, al = alEl?.value;
  if (!dal || !al) return;
  el.innerHTML = '<div style="color:var(--muted);font-size:12px">Caricamento…</div>';
  const { data, error } = await sb.rpc('valutazione_previsioni', { p_da: dal, p_a: al, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { el.innerHTML = `<div style="color:var(--alert);font-size:12px">${escapeHtml(PREVISIONI_TESTI.errore + (error?.message || data?.errore || 'sconosciuto'))}</div>`; return; }
  el.innerHTML = renderAffidabilitaPrevisioni(data);
}
