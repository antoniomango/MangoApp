// responsabile.html — Oggi e piano del giorno, avvisi e ricezioni, schermo di reparto.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// OGGI + PIANO DEL GIORNO (mango-v45)
// ═══════════════════════════════════════════════
// Piano generato dal server a inizio turno (tetto giornaliero per persona, priorità, dipendenze, macchine), allungato in giornata se la squadra
// va più veloce, con il tetto regolato ogni settimana. Qui: la vista "Oggi" con minuti e capacità, i comandi (rigenera / aggiungi / togli) e la
// pagina dei parametri con spiegazioni e simulazione. Tutto via RPC con registro; nessun valore di configurazione scritto nel codice.
let oggiR = null;            // risposta di piano_oggi_responsabile
let ricezioniR = null;       // risposta di ricezioni_in_attesa (con i giorni di attesa, visibili solo al responsabile)
let _prodDebounce = null;

const _fmtMin = (m) => {
  const n = Math.round(Number(m) || 0);
  return n >= 90 ? `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')} min` : `${n} min`;
};
const _fmtOre = (h) => `${String(Math.round(Number(h) * 100) / 100).replace('.', ',')} h`;

async function loadOggiResp() {
  const { data, error } = await sb.rpc('piano_oggi_responsabile', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_data: null });
  if (error || !data?.ok) { document.getElementById('oggi-r-corpo').innerHTML = `<div class="empty-state"><p>Piano non disponibile: ${escapeHtml(data?.errore || error?.message || '')}</p></div>`; return; }
  oggiR = data;
  renderOggiResp();
  loadRicezioniResp();
  loadAvvisiResp();
}
// riquadro "Clienti da avvisare": ordini con consegna «Da avvisare» pronti (una riga per spedizione unica) e risposte ancora correggibili
let avvisiR = null, _avvisiInCorso = false;
async function loadAvvisiResp() {
  const { data, error } = await sb.rpc('clienti_da_avvisare', { p_utente_id: currentUserRow.id, p_session_token: null });
  avvisiR = (!error && data?.ok) ? data : null;
  renderOggiResp();
}
function riquadroAvvisi() {
  if (!avvisiR) return '';
  const A = Etichette.avvisi, da = avvisiR.da_avvisare || [], ris = avvisiR.risposte || [];
  if (!da.length && !ris.length) return '';
  const bottone = (id, esito, primario) => `<button class="btn ${primario ? 'btn-primary' : 'btn-secondary'}" style="padding:4px 10px;font-size:12px" ${_avvisiInCorso ? 'disabled' : ''} onclick="registraAvvisoResp('${escapeJsAttr(id)}','${esito}')">${escapeHtml(A.azioni[esito])}</button>`;
  const codici = x => (x.ordini || []).map(o => escapeHtml(o.codice || '—')).join(', ');
  const rigaDa = x => `<tr><td><div style="font-weight:600">${escapeHtml(x.cliente)}</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${codici(x)}</div></td>
    <td style="white-space:nowrap">${x.scadenza ? formatDate(x.scadenza) : '—'}</td>
    <td>${escapeHtml(A.riga(x))}</td>
    <td><div class="avviso-r-azioni">${bottone(x.ordine_id, 'con_pedana', true)}${bottone(x.ordine_id, 'senza_pedana', false)}${x.stato_avviso === 'avvisato' ? '' : bottone(x.ordine_id, 'avvisato', false)}</div></td></tr>`;
  const rigaRis = x => `<tr><td><div style="font-weight:600">${escapeHtml(x.cliente)}</div><div style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${codici(x)}</div></td>
    <td style="white-space:nowrap">${x.scadenza ? formatDate(x.scadenza) : '—'}</td>
    <td>${escapeHtml(A.azioni[x.risposta] || '')}${x.avvisato_da ? ' · ' + escapeHtml(x.avvisato_da) : ''}</td>
    <td><div class="avviso-r-azioni">${x.risposta === 'con_pedana' ? bottone(x.ordine_id, 'senza_pedana', false) : bottone(x.ordine_id, 'con_pedana', false)}</div></td></tr>`;
  return `<div class="card"><div class="card-hdr"><h3>${escapeHtml(A.titolo)}</h3><span style="font-size:12px;color:var(--muted)">${da.length} ${da.length === 1 ? 'cliente' : 'clienti'}</span></div>
    ${da.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Spedizione</th><th>Stato</th><th></th></tr></thead><tbody>${da.map(rigaDa).join('')}</tbody></table></div>` : `<div style="color:var(--muted);font-size:13px">${escapeHtml(A.vuoto)}</div>`}
    ${ris.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600;font-size:13px">${escapeHtml(A.risposteTitolo)} (${ris.length})</summary><div style="overflow-x:auto;margin-top:8px"><table><thead><tr><th>Cliente</th><th>Spedizione</th><th>Risposta</th><th></th></tr></thead><tbody>${ris.map(rigaRis).join('')}</tbody></table></div></details>` : ''}</div>`;
}
async function registraAvvisoResp(ordineId, esito) {
  if (_avvisiInCorso) return;
  _avvisiInCorso = true; renderOggiResp();
  try {
    const { data, error } = await sb.rpc('registra_avviso_cliente', { p_ordine_id: ordineId, p_esito: esito, p_operatore_id: currentUserRow.id, p_session_token: null });
    if (error || !data?.ok) toast(Etichette.avvisi.errori[data?.errore] || ('Non registrato: ' + (data?.errore || error?.message || '')), 'err');
    else toast(Etichette.avvisi.ok[esito] + ' (' + (data.ordini || []).join(', ') + ')', 'ok');
  } catch (e) { toast('Operazione non riuscita: controlla la connessione e riprova.', 'err'); }
  finally { _avvisiInCorso = false; }
  await Promise.all([loadAvvisiResp(), loadOrdini().then(() => { try { renderOrdiniTable(); } catch (e) {} })]);
  loadOggiResp();
}
async function loadRicezioniResp() {
  const { data, error } = await sb.rpc('ricezioni_in_attesa', { p_operatore_id: currentUserRow.id, p_session_token: null });
  ricezioniR = (!error && data?.ok) ? data : null;
  renderOggiResp();
}
// riquadro "In attesa dai fornitori": arrivi di materiale e rientri da lavorazione esterna, con i giorni di attesa e cosa bloccano
function riquadroFornitori() {
  if (!ricezioniR) return '';
  const lista = ricezioniR.ricezioni || [];
  const giorni = (n) => n === 1 ? '1 giorno' : n + ' giorni';
  const oggiIso = oggiR?.data || new Date().toISOString().slice(0, 10);
  const riga = (r) => {
    const k = r.ordine_fase_id || r.fase_extra_id;
    const t = Etichette.limiteArrivoTesti(r, oggiIso);
    const stile = t.tono === 'alert' ? 'background:var(--alert-soft);color:var(--alert-ink)' : t.tono === 'warn' ? 'background:var(--warn-soft);color:var(--warn-ink)' : 'background:var(--phase-bg);color:var(--ink-2)';
    const piccolo = 'font-size:11px;color:var(--muted);margin-top:3px;max-width:420px';
    return `<tr style="${r.urgente ? 'background:var(--warn-bg)' : ''}">
      <td><div style="font-weight:600">${escapeHtml(r.cliente || '')} — ${escapeHtml(r.codice || '')}</div>
        ${r.urgente && (r.sblocca || []).length ? `<div style="font-size:12px;font-weight:700;color:var(--warn-ink)">blocca: ${escapeHtml(r.sblocca.join(', '))}</div>` : ''}</td>
      <td><div style="font-weight:600">${escapeHtml(r.materiale || r.fase_nome || '')}</div><div style="font-size:11px;color:var(--muted)">${r.tipo === 'rientro' ? 'rientro da lavorazione esterna' : 'arrivo di materiale'}${r.materiale && r.fase_nome && r.materiale !== r.fase_nome ? ' · fase «' + escapeHtml(r.fase_nome) + '»' : ''}</div></td>
      <td style="white-space:nowrap">${giorni(r.giorni_attesa || 0)}</td>
      <td style="min-width:260px"><span class="badge" style="${stile};white-space:nowrap">${escapeHtml(t.badge)}</span>
        <div style="font-size:13px;font-weight:600;margin-top:4px;max-width:420px">${escapeHtml(t.principale)}</div>
        ${t.esito ? `<div style="font-size:12px;margin-top:2px;max-width:420px">${escapeHtml(t.esito)}</div>` : ''}
        ${t.perche ? `<div style="${piccolo}">${escapeHtml(t.perche)}</div>` : ''}
        ${t.avvertenze.map(a => `<div style="${piccolo};color:var(--warn-ink)">${escapeHtml(a)}</div>`).join('')}</td>
      <td style="text-align:right"><button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="confermaRicezioneResp('${escapeJsAttr(k)}')">${r.tipo === 'rientro' ? 'Conferma rientro' : 'Conferma arrivo'}</button></td>
    </tr>`;
  };
  const urgenti = lista.filter(r => r.urgente).length;
  const riassunto = Etichette.riepilogoSolleciti(lista);
  const nRitardo = lista.filter(r => r.stato_limite === 'in_ritardo').length;
  return `<div class="card"><div class="card-hdr"><h3>${Etichette.attesaEsterna.titolo}</h3><span style="font-size:12px;color:var(--muted)">${lista.length ? lista.length + (lista.length === 1 ? ' ricezione' : ' ricezioni') + (urgenti ? ' · ' + urgenti + (urgenti === 1 ? ' blocca lavoro' : ' bloccano lavoro') : '') : ''}</span></div>
    ${riassunto ? `<div style="font-size:13px;font-weight:700;color:var(--${nRitardo ? 'alert' : 'warn'}-ink);margin:2px 0 8px">${escapeHtml(riassunto)}</div>` : ''}
    ${lista.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Ordine</th><th>Cosa si aspetta</th><th>Attesa</th><th>Cosa fare</th><th></th></tr></thead><tbody>${lista.map(riga).join('')}</tbody></table></div>` : '<div style="color:var(--muted);font-size:13px;padding:8px 0">Nessuna ricezione in attesa.</div>'}</div>`;
}
async function confermaRicezioneResp(chiave) {
  const r = (ricezioniR?.ricezioni || []).find(x => (x.ordine_fase_id || x.fase_extra_id) === chiave); if (!r) return;
  if (!confirm(Etichette.ricezione.conferma(r))) return;
  const x = r.fase_extra_id
    ? await sb.rpc('conferma_ricezione_extra', { p_fase_extra_id: r.fase_extra_id, p_operatore_id: currentUserRow.id, p_session_token: null })
    : await sb.rpc('conferma_ricezione_fase', { p_ordine_fase_id: r.ordine_fase_id, p_operatore_id: currentUserRow.id, p_session_token: null });
  const giaFatta = x.data?.errore === 'stato_non_in_attesa';
  if (x.error || (!x.data?.ok && !giaFatta)) { toast('Non confermata: ' + (x.error?.message || x.data?.messaggio || x.data?.errore || ''), 'err'); return; }
  toast(giaFatta ? (x.data?.messaggio || 'Già confermata') : Etichette.ricezione.toast(r), giaFatta ? 'err' : 'ok');
  await loadOggiResp();
  if (document.getElementById('sec-pianificazione')?.classList.contains('active')) renderPianificazione();
}


// ── Modalità schermo: flusso di produzione live a tutto schermo (js/flusso-schermo.js). Solo lettura: una RPC aggregata, nessuna tabella. ──
let _flussoCtl = null, _flussoTemaPrima = null, _flussoPieno = false;
async function caricaFlussoResponsabile() {
  try { await sb.auth.getSession(); } catch (e) { /* il rinnovo del token è best effort: la RPC dirà se la sessione è caduta */ }
  const { data, error } = await sb.rpc('flusso_produzione', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (data?.ok) return { ok: true, dati: data };
  if (data?.errore === 'sessione_non_valida' || data?.errore === 'non_autorizzato') return { ok: false, errore: 'sessione' };
  if (error && (error.status === 401 || error.code === 'PGRST301' || /jwt/i.test(error.message || ''))) return { ok: false, errore: 'sessione' };
  return { ok: false, errore: 'rete' };
}
function apriModalitaSchermo() {
  if (_flussoCtl || !currentUserRow) return;
  const radice = document.createElement('div'); radice.id = 'flusso-schermo-radice'; document.body.appendChild(radice);
  _flussoTemaPrima = document.documentElement.getAttribute('data-theme'); document.documentElement.setAttribute('data-theme', 'dark');   // tema scuro solo mentre lo schermo è acceso
  _flussoCtl = FlussoSchermo.avvia(radice, {
    carica: caricaFlussoResponsabile, esci: chiudiModalitaSchermo, pienoSchermo: true,
    accediDiNuovo: () => { chiudiModalitaSchermo(); doLogout(); },
  });
  _flussoPieno = !!document.fullscreenElement;
  document.addEventListener('keydown', _flussoEsc);
  document.addEventListener('fullscreenchange', _flussoPienoCambiato);
}
function chiudiModalitaSchermo() {
  if (!_flussoCtl) return;
  const c = _flussoCtl; _flussoCtl = null;
  document.removeEventListener('keydown', _flussoEsc); document.removeEventListener('fullscreenchange', _flussoPienoCambiato);
  c.ferma();
  document.getElementById('flusso-schermo-radice')?.remove();
  if (_flussoTemaPrima == null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', _flussoTemaPrima);
  if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen().catch(() => {}); } catch (e) { /* già uscito */ } }
}
const _flussoEsc = e => { if (e.key === 'Escape') chiudiModalitaSchermo(); };
function _flussoPienoCambiato() {   // il browser consuma Esc per uscire dal pieno schermo: si esce anche dalla modalità
  if (document.fullscreenElement) { _flussoPieno = true; return; }
  if (_flussoPieno && _flussoCtl) chiudiModalitaSchermo();
}
function apriPaginaSchermo() {
  document.getElementById('pagina-schermo-titolo').textContent = Etichette.flusso.paginaTitolo;
  document.getElementById('pagina-schermo-spiega').textContent = Etichette.flusso.paginaSpiega;
  document.getElementById('pagina-schermo-url').value = new URL('schermo.html', location.href).href;   // nessun dato riservato nell'indirizzo
  document.getElementById('pagina-schermo-copia').textContent = Etichette.flusso.paginaCopia;
  document.getElementById('modal-pagina-schermo').classList.add('open');
}
async function copiaIndirizzoPaginaSchermo() {
  const inp = document.getElementById('pagina-schermo-url');
  try { await navigator.clipboard.writeText(inp.value); toast(Etichette.flusso.paginaCopiato, 'ok'); } catch (e) { inp.select(); document.execCommand && document.execCommand('copy'); toast(Etichette.flusso.paginaCopiato, 'ok'); }
}

// ridisegno ritardato: Realtime e aggiornamento periodico possono arrivare a raffica
function produzioneCambiata() {
  clearTimeout(_prodDebounce);
  _prodDebounce = setTimeout(() => {
    if (document.getElementById('sec-oggi')?.classList.contains('active')) loadOggiResp();
    if (document.getElementById('sec-pianificazione')?.classList.contains('active')) renderPianificazione();
  }, 700);
}
// rete di sicurezza se Realtime non fosse connesso: aggiornamento leggero mentre una di queste due viste è aperta
setInterval(() => {
  if (document.hidden || typeof currentUserRow === 'undefined' || !currentUserRow) return;
  if (document.getElementById('sec-oggi')?.classList.contains('active') || document.getElementById('sec-pianificazione')?.classList.contains('active')) produzioneCambiata();
}, 30000);

function renderOggiResp() {
  const riep = document.getElementById('oggi-r-riepilogo'), corpo = document.getElementById('oggi-r-corpo'), sub = document.getElementById('oggi-r-sub');
  if (!riep || !corpo || !oggiR) return;
  const d = oggiR;
  const dataTesto = new Date(d.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  sub.textContent = dataTesto.charAt(0).toUpperCase() + dataTesto.slice(1);
  if (!d.piano_presente) {
    const a0 = document.getElementById('oggi-r-aggiornato'); if (a0) a0.textContent = '';
    riep.innerHTML = '';
    corpo.innerHTML = riquadroAvvisi() + riquadroFornitori() + `<div class="empty-state"><div class="icon"><i data-ic="calendario"></i></div>
      <p>${d.lavorativo ? 'Il piano di oggi non è ancora stato generato: nasce all\'inizio del turno. Puoi crearlo subito con "Rigenera piano di oggi".' : 'Oggi non è un giorno lavorativo: nessun piano.'}</p></div>`;
    return;
  }
  const p = d.piano || {};
  // stato dell'ultimo aggiornamento automatico del piano
  const agg = document.getElementById('oggi-r-aggiornato');
  if (agg) {
    const n = (x, s, pl) => (x || 0) + ' ' + (x === 1 ? s : pl);
    if (String(p.ultimo_ricalcolo_motivo || '').startsWith('errore')) { agg.style.color = 'var(--warn-ink)'; agg.textContent = 'Ultimo aggiornamento non riuscito: premi Rigenera'; }
    else if (p.ultimo_ricalcolo_il) { agg.style.color = ''; agg.textContent = 'Aggiornato alle ' + new Date(p.ultimo_ricalcolo_il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + ' · ' + n(p.ultimo_ricalcolo_aggiunte, 'aggiunta', 'aggiunte') + ', ' + n(p.ultimo_ricalcolo_uscite, 'uscita', 'uscite') + (p.ultimo_ricalcolo_oltre > 0 ? ' (di cui ' + n(p.ultimo_ricalcolo_oltre, 'urgente', 'urgenti') + ' oltre la capacità)' : ''); }
    else { agg.style.color = ''; agg.textContent = ''; }
  }
  const av = d.avanzamento || { fatte: 0, totali: 0 };
  const pctMin = p.minuti_pianificati ? Math.round(p.minuti_fatti / p.minuti_pianificati * 100) : 0;
  const cella = (titolo, valore, nota) => `<div class="card" style="padding:14px 16px;margin-bottom:0"><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${titolo}</div><div style="font-size:20px;font-weight:700;margin-top:4px">${valore}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${nota || ''}</div></div>`;
  riep.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px">
      ${cella('Attività', `${av.fatte} di ${av.totali}`, av.fuori_piano ? `fatte / totali · di cui ${av.fuori_piano} fuori piano` : 'fatte / totali')}
      ${cella('Minuti stimati', `${_fmtMin(p.minuti_fatti)} <span style="font-size:13px;font-weight:600;color:var(--muted)">/ ${_fmtMin(p.minuti_pianificati)}</span>`, `${pctMin}% del piano`)}
      ${cella('Capacità del giorno', _fmtMin(p.minuti_capacita), `${p.n_persone} persone presenti · ${_fmtOre(p.ore_persone_presenti)}`)}
      ${cella('Tetto in uso', `${_fmtOre(p.tetto_ore)} <span style="font-size:13px;font-weight:600;color:var(--muted)">di lavorazioni per persona presente</span>`, 'regolato ogni settimana')}
      ${cella('Riempimenti', String(p.n_riempimenti || 0), p.n_riempimenti ? 'attività aggiunte in giornata' : 'nessuna aggiunta finora')}
      ${cella('Generato', p.generato_da === 'responsabile' ? 'a mano' : 'automatico', new Date(p.generato_il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))}
    </div>`;
  const tag = (v) => v.origine === 'responsabile' ? `<span class="badge" style="background:var(--warn-soft);color:var(--warn-ink)">${Etichette.origineVocePiano(v.origine)}</span>`
    : Etichette.origineVocePiano(v.origine) ? `<span class="badge" style="background:var(--info-soft);color:var(--info-ink)">${Etichette.origineVocePiano(v.origine)}</span>` : '';
  // fasi abbinate: le due voci dello stesso ordine sono un blocco (stesso giorno e stessa macchina)
  const chiaviVoci = new Set((d.gruppi || []).flatMap(g => g.voci.map(v => v.ordine_id + '|' + v.fase_id)));
  const tagAbbinata = (v) => { const pa = v.fase_id != null ? faseAbbinataId(v.fase_id) : null; const pf = pa != null && chiaviVoci.has(v.ordine_id + '|' + pa) ? fasi.find(x => x.id === pa) : null; return pf ? `<div style="font-size:11px;color:var(--info-ink);margin-top:3px"><i data-ic="strati"></i> ${escapeHtml(Etichette.fasiAbbinate.tagPiano(pf.nome))}</div>` : ''; };
  // nel riquadro «Da chiudere oggi» le voci sono di fasi diverse: sotto l'ordine si mostrano la fase e, se non lo dice già il rischio, il motivo
  const rigaFase = (v) => { const m = v.urgente && v.rischio ? '' : Etichette.daChiudere.motivo(v.da_chiudere, d.data); return `<div style="font-size:11px;color:var(--ink-2)"><strong>${escapeHtml(Etichette.daChiudere.fase(v.fase_nome))}</strong>${m ? ' · ' + escapeHtml(m) : ''}</div>`; };
  const riga = (v, conFase) => {
    const o = v.ordine || {};
    const bl = v.bloccata_da && v.bloccata_da.length ? `<div style="font-size:11px;color:var(--violet)">dopo: ${escapeHtml(v.bloccata_da.join(', '))}</div>` : '';
    return `<tr style="${v.fatta ? 'background:var(--ok-bg)' : ''}">
      <td><div style="font-weight:600">${v.spedizione_unica ? '<i data-ic="pacco"></i> ' + escapeHtml(Etichette.spedizioneUnica.riga(v.spedizione_unica, v.spedizione_unica.ordini.map(x => x.codice))) : escapeHtml(o.cliente || '') + ' — ' + escapeHtml(o.codice || '')}${v.urgente && !v.fatta ? ` <span class="badge" style="background:var(--urgente-bg);color:var(--urgente-ink)" title="${escapeHtml(Etichette.rischioTesto(v.rischio, o.scadenza))}">${Etichette.attesaEsterna.urgente}</span>` : ''}</div>${v.urgente && !v.fatta && v.rischio ? `<div style="font-size:11px;color:var(--urgente-ink)">${escapeHtml(Etichette.rischioTesto(v.rischio, o.scadenza))}</div>` : ''}<div style="font-size:11px;color:var(--muted)">${v.spedizione_unica ? 'un solo passaggio per ' + v.spedizione_unica.ordini.length + ' ordini' : (o.quantita > 1 ? o.quantita + ' pezzi' : '1 pezzo')}${v.macchina ? ' · ' + escapeHtml(v.macchina) + (v.minuti_macchina != null && Math.round(v.minuti_macchina) !== Math.round(v.minuti_stimati) ? ' (occupa ' + _fmtMin(v.minuti_macchina) + ')' : '') : ''}</div>${conFase ? rigaFase(v) : ''}${bl}</td>
      <td style="white-space:nowrap">${v.esterna ? '—' : _fmtMin(v.minuti_stimati)}</td>
      <td style="white-space:nowrap">${v.pezzi ? `${v.pezzi.fatti} di ${v.pezzi.totali}` : ''}</td>
      <td>${v.fatta ? '<span class="badge" style="background:var(--ok-soft);color:var(--ok-ink)">✓ fatta</span>' : '<span style="color:var(--muted)">da fare</span>'} ${tag(v)}${tagAbbinata(v)}${v.stessa_fase ? `<div style="font-size:11px;color:var(--info-ink);margin-top:3px">${escapeHtml(Etichette.motivoIngressoPiano('stessa_fase'))}</div>` : ''}${v.piu_pressate ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${escapeHtml(Etichette.pressate.fatteResp(v.pressate_fatte || 0))}</div>` : ''}</td>
      <td style="text-align:right">${v.fatta ? '' : `<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="togliDalPiano('${escapeJsAttr(v.voce_id)}')">Togli dal piano</button>`}</td>
    </tr>`;
  };
  const tabella = (voci, conFase) => `<div style="overflow-x:auto"><table><thead><tr><th>Ordine</th><th>Stima</th><th>Pezzi</th><th>Stato</th><th></th></tr></thead><tbody>${voci.map(v => riga(v, conFase)).join('')}</tbody></table></div>`;
  // eseguibili adesso / in arrivo (ancora bloccate da una fase precedente), per fase
  const blocc = (v) => !v.fatta && v.bloccata_da && v.bloccata_da.length;
  const principali = [], inArrivo = [];
  (d.gruppi || []).forEach(g => {
    const ok = g.voci.filter(v => !blocc(v)), bl = g.voci.filter(blocc);
    if (ok.length) principali.push({ ...g, voci: ok, fatte: ok.filter(v => v.fatta).length, totali: ok.length });
    if (bl.length) inArrivo.push({ ...g, voci: bl, fatte: 0, totali: bl.length });
  });
  // «Da chiudere oggi»: scorciatoia in cima, stesse voci e stessa tabella dei blocchi (non le sposta); assente se la lista è vuota o il parametro è spento
  const daChiudere = Array.isArray(d.da_chiudere) ? d.da_chiudere : [];
  const riquadroDaChiudere = daChiudere.length ? `<div class="card" style="border-left:4px solid var(--urgente-ink)"><div class="card-hdr"><h3>${escapeHtml(Etichette.daChiudere.titolo)}</h3><span style="font-family:var(--font-mono);font-size:13px;color:var(--muted)">${escapeHtml(Etichette.daChiudere.conteggio(daChiudere.length))}</span></div><div style="font-size:12px;color:var(--muted);margin:0 0 8px">${escapeHtml(Etichette.daChiudere.spiega)}</div>${tabella(daChiudere, true)}</div>` : '';
  let html = riquadroAvvisi() + riquadroFornitori() + riquadroDaChiudere + principali.map(g => `<div class="card"><div class="card-hdr"><h3>${escapeHtml(g.fase_nome)}${g.voci.some(v => v.urgente && !v.fatta) ? ` <span class="badge" style="background:var(--urgente-bg);color:var(--urgente-ink);font-size:10px">${Etichette.attesaEsterna.urgente}</span>` : ''}</h3><span style="font-family:var(--font-mono);font-size:13px;color:var(--muted)">${g.fatte} di ${g.totali}</span></div>${tabella(g.voci)}</div>`).join('');
  if (!principali.length) html += '<div class="empty-state"><p>Nessuna attività eseguibile adesso.</p></div>';
  if (inArrivo.length) {
    const minArrivo = inArrivo.reduce((t, g) => t + g.voci.reduce((u, v) => u + (Number(v.minuti_stimati) || 0), 0), 0);
    html += `<div role="separator" style="display:flex;align-items:center;gap:10px;margin:22px 0 12px;color:var(--ink-2);font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase"><span style="flex:1;height:2px;background:var(--border-strong)"></span><span>In arrivo · ${_fmtMin(minArrivo)}</span><span style="flex:1;height:2px;background:var(--border-strong)"></span></div>`;
    html += inArrivo.map(g => `<div class="card" style="background:var(--phase-bg)"><div class="card-hdr"><h3>${escapeHtml(g.fase_nome)}</h3><span style="font-family:var(--font-mono);font-size:13px;color:var(--muted)">${g.totali} in attesa</span></div>${tabella(g.voci)}</div>`).join('');
  }
  if (!(d.gruppi || []).length) html += '<div class="empty-state"><p>Nessuna attività nel piano di oggi.</p></div>';
  if ((d.esterne || []).length) {
    html += `<div class="card"><div class="card-hdr"><h3>Ricezioni aggiunte a mano</h3><span style="font-size:12px;color:var(--muted)">non consumano capacità</span></div>${tabella(d.esterne.map(v => ({ ...v, minuti_stimati: 0 })))}</div>`;
  }
  // uscite dal piano, con il motivo leggibile
  if ((d.uscite || []).length) {
    html += `<details class="card"><summary style="cursor:pointer;font-weight:600">Uscite dal piano (${d.uscite.length})</summary><div style="overflow-x:auto;margin-top:10px"><table><thead><tr><th>Ordine</th><th>Fase</th><th>Motivo</th></tr></thead><tbody>${d.uscite.map(u => `<tr><td>${escapeHtml(u.cliente || '')} — ${escapeHtml(u.ordine_codice || '')}</td><td>${escapeHtml(u.fase_nome || '')}</td><td>${escapeHtml(Etichette.motivoUscitaPiano(u.motivo))}${(u.manca || []).length ? `<div style="font-size:11px;color:var(--muted)">manca: ${u.manca.map(m => escapeHtml(m.nome) + (m.macchina_ferma ? ' (macchina fuori uso)' : '')).join(', ')}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  corpo.innerHTML = html;
}

async function rigeneraPianoOggi() {
  if (!confirm('Rigenerare il piano di oggi?\n\nIl piano si aggiorna già da solo a ogni modifica. Rigenera rifà da capo la parte automatica non ancora iniziata con le priorità di adesso; restano le attività completate o già iniziate e le tue scelte (aggiunte e tolte a mano).')) return;
  const { data, error } = await sb.rpc('piano_rigenera_oggi', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Piano non rigenerato: ' + (data?.errore || error?.message || ''), 'err'); return; }
  oggiR = data; renderOggiResp();
  toast('Piano di oggi rigenerato', 'ok');
}

async function togliDalPiano(voceId) {
  if (!confirm('Togliere questa attività dal piano di oggi?')) return;
  const { data, error } = await sb.rpc('piano_togli_voce', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_voce_id: voceId });
  if (error || !data?.ok) { toast('Non riuscito: ' + (data?.errore || error?.message || ''), 'err'); return; }
  await loadOggiResp();
  toast('Attività tolta dal piano', 'ok');
}

let _candidatiPiano = [];
async function apriAggiungiAlPiano() {
  const { data, error } = await sb.rpc('piano_candidati_aggiunta', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Elenco non disponibile: ' + (data?.errore || error?.message || ''), 'err'); return; }
  _candidatiPiano = data.candidati || [];
  document.getElementById('agg-piano-cerca').value = '';
  renderAggiungiAlPiano();
  document.getElementById('modal-aggiungi-piano').classList.add('open');
}
function renderAggiungiAlPiano() {
  const q = (document.getElementById('agg-piano-cerca')?.value || '').toLowerCase().trim();
  const el = document.getElementById('agg-piano-lista');
  const lista = _candidatiPiano.filter(c => !q || `${c.cliente} ${c.codice} ${c.fase_nome}`.toLowerCase().includes(q)).slice(0, 200);
  el.innerHTML = lista.length ? lista.map(c => `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">${escapeHtml(c.cliente || '')} — ${escapeHtml(c.codice || '')}</div><div style="font-size:12px;color:var(--muted)">${escapeHtml(c.fase_nome || '')}${c.esterna ? ' · esterna' : ''}</div></div>
      <button class="btn btn-primary" style="padding:5px 12px;font-size:12px" onclick="aggiungiAlPiano('${escapeJsAttr(c.ordine_fase_id || '')}','${escapeJsAttr(c.fase_extra_id || '')}')">Aggiungi</button>
    </div>`).join('') : '<div style="color:var(--muted);font-size:13px;padding:12px 4px">Nessuna fase da aggiungere.</div>';
}
async function aggiungiAlPiano(ordineFaseId, faseExtraId) {
  const { data, error } = await sb.rpc('piano_aggiungi_voce', { p_responsabile_id: currentUserRow.id, p_session_token: null,
    p_ordine_fase_id: ordineFaseId || null, p_fase_extra_id: faseExtraId || null });
  if (error || !data?.ok) { toast('Non aggiunta: ' + (data?.errore || error?.message || ''), 'err'); return; }
  closeModal('modal-aggiungi-piano');
  await loadOggiResp();
  toast(data.voci_aggiunte > 1 ? Etichette.fasiAbbinate.aggiuntaInsieme(data.voci_aggiunte) : 'Attività aggiunta al piano', 'ok');
}
