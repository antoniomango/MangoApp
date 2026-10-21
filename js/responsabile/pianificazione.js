// responsabile.html — pianificazione, disponibilità degli operatori, parametri del piano.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ── pagina "Piano del giorno": parametri ──
let pianoCfg = null;          // risposta di piano_parametri_elenco
let pianoBozza = {};          // chiave -> valore numerico in modifica (tenuto in memoria a ogni cambio, mai letto dal DOM al salvataggio)
let pianoSimulazione = null;
let pianoCatene = null;       // risposta di piano_catene_elenco (null = non disponibile)
let pianoFuoriPiano = null;   // risposta di piano_fuori_piano_statistiche (null = non ancora caricata o non disponibile)
const _GIORNI_SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const _PIANO_ERRORI = {
  tetto_minimo_maggiore_del_massimo: 'Il tetto minimo non può superare il massimo.',
  tetto_attuale_fuori_da_minimo_e_massimo: 'Il tetto in uso deve restare fra il minimo e il massimo.',
  giorni_minimi_maggiori_della_finestra: 'I giorni che devono dare lo stesso segnale non possono superare i giorni considerati.',
  soglia_scarsa_non_minore_della_piena: 'La soglia "lista troppo lunga" deve essere più bassa della soglia "lista troppo corta".',
};
function _pianoErrore(d, e) {
  if (d?.errore === 'valore_fuori_intervallo') return `«${d.etichetta}»: valore fuori dai limiti (${d.min}–${d.max}).`;
  if (d?.errore === 'valore_non_multiplo_del_passo') return `«${d.etichetta}»: il valore deve essere un multiplo di ${d.passo}.`;
  if (d?.errore === 'valore_mancante' || d?.errore === 'valore_non_numerico') return `«${d.etichetta || d.chiave}»: inserisci un numero.`;
  return _PIANO_ERRORI[d?.errore] || d?.errore || e?.message || 'errore';
}

async function loadPianoConfig() {
  const { data, error } = await sb.rpc('piano_parametri_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { document.getElementById('piano-cfg-corpo').innerHTML = `<div class="empty-state"><p>Parametri non disponibili: ${escapeHtml(data?.errore || error?.message || '')}</p></div>`; return; }
  pianoCfg = data; pianoBozza = {}; pianoSimulazione = null;
  renderPianoConfig();
  // statistiche in sola lettura: se non arrivano la pagina resta com'è
  const st = await sb.rpc('piano_fuori_piano_statistiche', { p_responsabile_id: currentUserRow.id, p_session_token: null, p_settimane: 4 });
  pianoFuoriPiano = (!st.error && st.data?.ok) ? st.data : null;
  const ca = await sb.rpc('piano_catene_elenco', { p_responsabile_id: currentUserRow.id, p_session_token: null });
  pianoCatene = (!ca.error && ca.data?.ok) ? ca.data : null;
  renderPianoConfig();
}

const _pVal = (p) => (p.chiave in pianoBozza ? pianoBozza[p.chiave] : Number(p.valore));
const _pNum = (n) => String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');

function renderPianoConfig() {
  const el = document.getElementById('piano-cfg-corpo');
  if (!el || !pianoCfg) return;
  const st = pianoCfg.stato || {};
  const ur = st.ultima_regolazione, um = st.ultima_modifica_tetto, po = st.piano_oggi;
  const fmtData = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const statoRiga = [
    `<strong>Tetto in uso:</strong> ${_fmtOre(st.tetto_in_uso)} di lavorazioni per persona presente`,
    ur ? `<strong>Ultima regolazione:</strong> ${fmtData(ur.data + 'T12:00:00')} — ${escapeHtml(ur.motivo)}` : '<strong>Ultima regolazione:</strong> nessuna ancora (la prima avviene nel giorno impostato, se ci sono abbastanza giorni con un piano)',
    um ? `<strong>Ultima modifica del tetto:</strong> ${fmtData(um.data)} da ${_pNum(um.da)} a ${_pNum(um.a)} h — ${escapeHtml(um.motivo)}` : '',
    po ? `<strong>Piano di oggi:</strong> generato (${_fmtMin(po.minuti_capacita)} di capacità, ${po.n_persone} persone, ${po.n_riempimenti} riempimenti)` : (st.oggi_lavorativo ? '<strong>Piano di oggi:</strong> non ancora generato' : '<strong>Piano di oggi:</strong> giorno non lavorativo'),
  ].filter(Boolean).map(x => `<li style="margin-bottom:4px">${x}</li>`).join('');
  const senzaTempo = (pianoCfg.fasi_senza_tempo || []);
  let html = renderPianoFuoriPiano() + renderPianoCatene() + `<div class="card" style="padding:18px 22px">
      <h3 style="font-size:15px;margin-bottom:8px">Come funziona</h3>
      <ol style="padding-left:20px;font-size:13px;line-height:1.55;margin-bottom:12px">
        <li><strong>Piano iniziale.</strong> All'inizio di ogni turno il sistema costruisce la lista delle attività del giorno: prende le fasi aperte nell'ordine di priorità degli ordini (scadenza e urgenza), rispetta le dipendenze fra le fasi e si ferma quando la somma delle stime raggiunge la capacità, cioè le ore di lavorazioni per persona presente (il tetto) moltiplicate per le persone presenti. Le ore di lavorazioni sono la somma dei tempi di riferimento delle fasi: il tempo di una fase fatta in due conta una volta sola, il tetto lo assorbe. Esempio: 4 persone e tetto 3,5 = 14 ore di lavorazioni. Una macchina è un posto di lavoro e non può superare le ore di una persona.</li>
        <li><strong>Riempimento in giornata.</strong> Se la squadra completa gran parte della lista prima del previsto, la lista si allunga da sola con altre attività. Gli ordini nuovi o urgenti entrano al riempimento successivo, o subito se li aggiungi tu dalla pagina Oggi.</li>
        <li><strong>Regolazione del tetto, una volta a settimana.</strong> Il sistema guarda le ultime giornate: se la lista era spesso troppo corta alza il tetto di un passo, se era spesso troppo lunga lo abbassa. Sempre dentro il minimo e il massimo che imposti tu. È l'unica regolazione automatica: non si correggono più i tempi delle singole fasi.</li>
      </ol>
      <ul style="list-style:none;padding:12px 14px;background:var(--phase-bg);border-radius:8px;font-size:13px;margin:0">${statoRiga}</ul>
    </div>`;
  if (senzaTempo.length) {
    html += `<div class="card" style="padding:14px 20px;border-color:var(--warn-line);background:var(--warn-bg)"><div style="font-size:13px"><strong><i data-ic="avviso"></i> ${senzaTempo.length} fasi senza tempo di riferimento</strong> — nel piano pesano quanto "Stima per fasi senza tempo": ${senzaTempo.map(f => escapeHtml(f.nome)).join(', ')}. Dai loro un tempo in <a href="#" onclick="showSection('tempi-rif-config');return false">Tempi di riferimento</a>.</div></div>`;
  }
  let gruppo = null;
  (pianoCfg.parametri || []).forEach(p => {
    if (p.gruppo !== gruppo) {
      gruppo = p.gruppo;
      html += `<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:20px 0 10px">${escapeHtml(gruppo)}</div>`;
    }
    const v = _pVal(p);
    let campo;
    if (p.tipo === 'si_no') campo = `<select onchange="pianoImposta('${escapeJsAttr(p.chiave)}', Number(this.value))" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--ink)"><option value="1" ${v >= 1 ? 'selected' : ''}>Sì</option><option value="0" ${v < 1 ? 'selected' : ''}>No</option></select>`;
    else if (p.tipo === 'giorno_settimana') campo = `<select onchange="pianoImposta('${escapeJsAttr(p.chiave)}', Number(this.value))" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--ink)">${_GIORNI_SETT.map((n, i) => `<option value="${i}" ${Number(v) === i ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    else campo = `<input type="number" value="${escapeHtml(String(v))}" min="${p.min_valore}" max="${p.max_valore}" step="${p.step}" oninput="pianoImposta('${escapeJsAttr(p.chiave)}', this.value === '' ? NaN : Number(this.value))"
        style="width:96px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--ink)">`;
    const limiti = p.tipo === 'numero' ? `Limiti: ${_pNum(p.min_valore)}–${_pNum(p.max_valore)}${p.unita ? ' ' + escapeHtml(p.unita) : ''} · predefinito ${_pNum(p.default_valore)}` : `Predefinito: ${p.tipo === 'si_no' ? (p.default_valore >= 1 ? 'Sì' : 'No') : _GIORNI_SETT[p.default_valore]}`;
    const riga = (etichetta, testo) => testo ? `<div style="font-size:12px;margin-top:4px"><strong style="color:var(--ink-2)">${etichetta}</strong> ${escapeHtml(testo)}</div>` : '';
    html += `<div class="card" style="padding:16px 20px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:6px">
        <div style="flex:1;min-width:220px"><div style="font-size:14px;font-weight:600">${escapeHtml(p.etichetta)}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${limiti}</div></div>
        <div>${campo}${p.unita && p.tipo === 'numero' ? ` <span style="font-size:12px;color:var(--muted)">${escapeHtml(p.unita)}</span>` : ''}</div>
      </div>
      <div style="font-size:12px;color:var(--ink-2);line-height:1.5">${escapeHtml(p.cosa_fa)}</div>
      ${riga('Se lo alzi:', p.se_alzi)}${riga('Se lo abbassi:', p.se_abbassi)}
      <div style="font-size:12px;color:var(--muted);margin-top:6px;font-style:italic">Esempio: ${escapeHtml(p.esempio || '')}</div>
    </div>`;
  });
  html += `<div id="piano-simulazione">${renderPianoSimulazione()}</div>`;
  el.innerHTML = html;
}

// Tabella in sola lettura: per ogni fase, quante attività completate erano nel piano del giorno e quante no. Mai per persona.
function renderPianoFuoriPiano() {
  const st = pianoFuoriPiano;
  if (!st) return '';
  const righe = (st.per_fase || []).filter(f => (f.nel_piano || 0) + (f.fuori_piano || 0) > 0);
  const corpo = righe.length ? righe.map(f => `<tr><td>${escapeHtml(f.fase_nome)}</td><td style="text-align:right">${f.nel_piano}</td><td style="text-align:right">${f.fuori_piano}</td><td style="text-align:right;font-weight:600">${f.percentuale == null ? '–' : _pNum(f.percentuale) + '%'}</td></tr>`).join('')
    : '<tr><td colspan="4" style="color:var(--muted)">Nessuna attività completata nel periodo.</td></tr>';
  return `<div class="card" style="padding:16px 20px">
      <h3 style="font-size:15px;margin-bottom:6px">Fuori piano, ultime ${st.settimane} settimane</h3>
      <div style="font-size:12px;color:var(--ink-2);line-height:1.5;margin-bottom:10px">Attività completate in un giorno in cui non erano nella lista del giorno. Contano come lavoro fatto nell'avanzamento e nella regolazione del tetto. Una percentuale alta indica fasi che la squadra fa di seguito, prima che il piano le proponga.</div>
      <table class="table" style="width:100%;font-size:13px"><thead><tr><th>Fase</th><th style="text-align:right">Nel piano</th><th style="text-align:right">Fuori piano</th><th style="text-align:right">Fuori piano %</th></tr></thead><tbody>${corpo}</tbody></table>
    </div>`;
}

// Coppie di fasi che la squadra fa di solito lo stesso giorno, imparate dallo storico. In sola lettura: le soglie si cambiano nei parametri «Catena in giornata».
function renderPianoCatene() {
  const st = pianoCatene;
  if (!st) return '';
  const fmtD = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '–';
  const righe = (st.coppie || []).map(c => `<tr><td>${escapeHtml(c.fase_prima)} → ${escapeHtml(c.fase_dopo)}</td><td style="text-align:right">${_pNum(c.percentuale)}%</td><td style="text-align:right">${c.campioni}</td>
      <td>${c.attiva ? '<span class="badge" style="background:var(--ok-soft);color:var(--ok-ink)">attiva</span>' : '<span style="color:var(--muted)">non attiva</span>'}</td><td>${c.attiva ? 'dal ' + fmtD(c.attiva_dal) : ''}</td></tr>`).join('');
  const corpo = righe || '<tr><td colspan="5" style="color:var(--muted)">Nessuna coppia di fasi con storico nel periodo.</td></tr>';
  return `<div class="card" style="padding:16px 20px">
      <h3 style="font-size:15px;margin-bottom:6px">Fasi in catena</h3>
      <div style="font-size:12px;color:var(--ink-2);line-height:1.5;margin-bottom:10px">Coppie di fasi in sequenza che negli ultimi ${st.finestra_giorni} giorni la squadra ha fatto spesso lo stesso giorno. Una coppia è attiva da ${_pNum(st.soglia_ingresso)}% (con almeno ${st.campioni_minimi} casi) e lo resta finché non scende sotto ${_pNum(st.soglia_uscita)}%. Quando la prima fase di una coppia attiva viene completata, la successiva entra da sola nella lista di oggi${st.regola_attiva ? '' : ' (regola ora spenta: tetto a zero)'}. Si aggiorna ogni mattina.</div>
      <table class="table" style="width:100%;font-size:13px"><thead><tr><th>Coppia</th><th style="text-align:right">Lo stesso giorno</th><th style="text-align:right">Casi</th><th>Stato</th><th>Da quando</th></tr></thead><tbody>${corpo}</tbody></table>
    </div>`;
}

function pianoImposta(chiave, valore) {
  const p = (pianoCfg?.parametri || []).find(x => x.chiave === chiave);
  if (p && Number(p.valore) === valore) delete pianoBozza[chiave]; else pianoBozza[chiave] = valore;
}

function _pianoValoriDaInviare() {
  const out = {};
  for (const [k, v] of Object.entries(pianoBozza)) {
    if (!Number.isFinite(v)) return { errore: `Inserisci un numero valido in «${(pianoCfg.parametri.find(p => p.chiave === k) || {}).etichetta || k}».` };
    out[k] = v;
  }
  return { valori: out };
}

async function salvaPianoParametri() {
  const r = _pianoValoriDaInviare();
  if (r.errore) { toast(r.errore, 'err'); return; }
  if (!Object.keys(r.valori).length) { toast('Nessuna modifica da salvare', 'ok'); return; }
  const { data, error } = await sb.rpc('piano_parametri_salva', { p_valori: r.valori, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Salvataggio NON riuscito: ' + _pianoErrore(data, error), 'err'); return; }
  await loadPianoConfig();
  toast('Piano del giorno: parametri salvati', 'ok');
}

async function simulaPiano() {
  const r = _pianoValoriDaInviare();
  if (r.errore) { toast(r.errore, 'err'); return; }
  const { data, error } = await sb.rpc('piano_simula', { p_valori: r.valori, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Simulazione non riuscita: ' + _pianoErrore(data, error), 'err'); return; }
  pianoSimulazione = data;
  const box = document.getElementById('piano-simulazione');
  if (box) { box.innerHTML = renderPianoSimulazione(); box.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

function renderPianoSimulazione() {
  const s = pianoSimulazione;
  if (!s) return `<div class="card" style="padding:16px 20px;margin-top:8px"><div style="font-size:13px;color:var(--muted)"><strong style="color:var(--ink)">Simula</strong> — cambia i valori qui sopra e premi "Simula": vedrai cosa sarebbe successo negli ultimi giorni registrati (tetto risultante, giorni "lista troppo corta" e "troppo lunga") senza salvare nulla.</div></div>`;
  const classe = { corta: 'lista troppo corta', lunga: 'lista troppo lunga', giusta: 'lista giusta', vuoto: 'nessuna attività' };
  const colore = { corta: 'var(--info-ink)', lunga: 'var(--warn-ink)', giusta: 'var(--ok-ink)', vuoto: 'var(--muted)' };
  const riga = (g) => `<tr><td>${new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${g.completato_pct == null ? '—' : String(g.completato_pct).replace('.', ',') + '%'}</td><td>${g.riempimenti || 0}</td><td style="color:${colore[g.classe]};font-weight:600">${classe[g.classe]}</td></tr>`;
  const cambia = Number(s.tetto_dopo) !== Number(s.tetto_prima);
  return `<div class="card" style="padding:16px 20px;margin-top:8px;border-color:var(--accent)">
    <h3 style="font-size:15px;margin-bottom:6px">Simulazione (non salvata)</h3>
    <div style="font-size:13px;margin-bottom:6px">Con questi valori la regolazione di oggi darebbe: <strong>${s.esito === 'alzato' ? 'tetto in aumento' : s.esito === 'abbassato' ? 'tetto in diminuzione' : s.esito === 'dati_insufficienti' ? 'nessun cambiamento (giorni insufficienti)' : 'tetto invariato'}</strong>
      — da ${_pNum(s.tetto_prima)} h a <strong>${_pNum(s.tetto_dopo)} h</strong>${cambia ? '' : ' (stesso valore)'}.</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${escapeHtml(s.motivo)} ${s.automatica_attiva ? '' : 'La regolazione automatica è disattivata: il tetto cambierebbe solo a mano.'}</div>
    <div style="font-size:13px;margin-bottom:8px"><strong>${s.n_giorni}</strong> giorni registrati considerati: <strong>${s.n_corti}</strong> "lista troppo corta", <strong>${s.n_lunghi}</strong> "lista troppo lunga".</div>
    ${(s.giorni || []).length ? `<div style="overflow-x:auto"><table><thead><tr><th>Giorno</th><th>Completato del piano iniziale</th><th>Riempimenti</th><th>Esito</th></tr></thead><tbody>${s.giorni.map(riga).join('')}</tbody></table></div>` : '<div style="font-size:12px;color:var(--muted)">Nessun giorno registrato: la simulazione diventa utile dopo qualche giornata con il piano attivo.</div>'}
  </div>`;
}

// ═══════════════════════════════════════════════
// PIANIFICAZIONE
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// DISPONIBILITÀ OPERATORI
// ═══════════════════════════════════════════════

// Stato locale: data selezionata nel pannello (null = oggi)
let _pianoDataSel = null;

function aggiornaDataPiano() {
  const sel = document.getElementById('piano-data-sel');
  const val = sel?.value; // yyyy-mm-dd o ''
  const oggi = Calendario.oggiIso();
  _pianoDataSel = (val && val !== oggi) ? val : null;
  const btn = document.getElementById('piano-anteprima-btn');
  if (btn) btn.style.display = _pianoDataSel ? '' : 'none';
  caricaDisponibilitaPanel();
}

async function caricaDisponibilitaPanel() {
  const data = _pianoDataSel || Calendario.oggiIso();
  const operatori = operatoriCache.filter(o => o.ruolo === 'operatore' && o.attivo);

  const { data: eccezioni } = await sb.from('disponibilita_giornaliera')
    .select('operatore_id, data, ore')
    .gte('data', Calendario.oggiIso())
    .lte('data', (() => { const d = new Date(); d.setDate(d.getDate()+14); return d.toISOString().split('T')[0]; })())
    .order('data');

  const eccezioniMap = {};
  (eccezioni || []).forEach(e => {
    if (!eccezioniMap[e.data]) eccezioniMap[e.data] = {};
    eccezioniMap[e.data][e.operatore_id] = e.ore;
  });

  // Pannello per la data selezionata
  const oreOggi = eccezioniMap[data] || {};
  const panel = document.getElementById('piano-disp-panel');
  if (panel) {
    panel.innerHTML = operatori.map(op => {
      const oreDefault = op.ore_default ?? oreGiornoDefault();
      const oreRiga = oreOggi[op.id];
      // Tratta come "nessuna eccezione" sia l'assenza di riga che una riga con ore = default
      const isEccezione = oreRiga !== undefined && Number(oreRiga) !== oreDefault;
      const oreEff = isEccezione ? Number(oreRiga) : oreDefault;
      const statoLabel = isEccezione
        ? (oreEff === 0 ? 'Assente (0h)' : `${oreEff}h — eccezione`)
        : `Giornata piena (${oreDefault}h)`;
      const statoColor = isEccezione
        ? (oreEff === 0 ? 'var(--alert-ink-2)' : 'var(--warn-ink)')
        : 'var(--ok-ink)';
      const borderColor = isEccezione ? 'var(--ext-line)' : 'var(--border)';
      const bgColor = isEccezione ? 'var(--ext-bg)' : 'var(--bg)';
      return `<div style="border:1px solid ${borderColor};border-radius:8px;padding:8px 10px;background:${bgColor}">
        <div style="font-size:12px;font-weight:600;margin-bottom:3px">${escapeHtml(op.nome)} ${escapeHtml(op.cognome)}</div>
        <div style="font-size:11px;color:${statoColor};font-weight:600;margin-bottom:6px">${statoLabel}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          ${isEccezione
            ? `<button onclick="impostaDisponibilita('${op.id}',${oreDefault})" style="font-size:11px;border:1px solid var(--ext);border-radius:4px;padding:2px 8px;background:var(--ext-bg);color:var(--ext);cursor:pointer;font-weight:600">↩ Giornata piena</button>`
            : ''
          }
          <button onclick="impostaDisponibilita('${op.id}',4)" style="font-size:11px;border:1px solid var(--border);border-radius:4px;padding:2px 7px;background:var(--surface);cursor:pointer">½ giornata</button>
          <button onclick="impostaDisponibilita('${op.id}',0)" style="font-size:11px;border:1px solid var(--alert-line);border-radius:4px;padding:2px 7px;background:var(--alert-bg);color:var(--alert-ink-2);cursor:pointer">Assente</button>
          <span style="font-size:10px;color:var(--muted)">ore disp.:</span>
          <input type="number" id="ore-custom-${op.id}" min="0" max="24" step="0.5" placeholder="0–24"
            title="Ore disponibili quel giorno (0 = assente tutto il giorno)"
            style="width:46px;font-size:11px;border:1px solid var(--border);border-radius:4px;padding:2px 4px;text-align:center"
            onkeydown="if(event.key==='Enter')impostaDisponibilitaCustom('${op.id}')">
        </div>
      </div>`;
    }).join('');
  }

  // Lista eccezioni prossimi 14 giorni — esclude righe con ore = ore_default (non sono eccezioni reali)
  const oggiStr = Calendario.oggiIso();
  const eccezioniList = document.getElementById('piano-eccezioni-list');
  if (eccezioniList) {
    const future = (eccezioni || []).filter(e => {
      if (e.data < oggiStr) return false;
      const op = operatoriCache.find(o => o.id === e.operatore_id);
      if (!op) return false;
      return Number(e.ore) !== (op.ore_default ?? oreGiornoDefault());
    });
    if (future.length) {
      eccezioniList.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em">Eccezioni programmati — prossimi 14 giorni</div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${future.map(e => {
            const op = operatoriCache.find(o => o.id === e.operatore_id);
            const oreDefault = op.ore_default ?? oreGiornoDefault();
            const ore = Number(e.ore);
            const label = ore === 0 ? 'Assente' : `${ore}h`;
            const color = ore === 0 ? 'var(--alert-ink-2)' : 'var(--warn-ink)';
            return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;border-top:1px solid var(--border)">
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted);min-width:75px">${formatDate(e.data)}</span>
              <span style="flex:1">${escapeHtml(op.nome)} ${escapeHtml(op.cognome)}</span>
              <span style="color:${color};font-size:11px;font-weight:600">${label}</span>
              <button onclick="impostaDisponibilita('${e.operatore_id}',${oreDefault},'${e.data}')" title="Rimuovi eccezione — ripristina giornata piena" style="border:none;background:none;cursor:pointer;color:var(--alert);font-size:12px;padding:0 2px" aria-label="Rimuovi eccezione">✕</button>
            </div>`;
          }).join('')}
        </div>`;
    } else {
      eccezioniList.innerHTML = '';
    }
  }
}

async function impostaDisponibilita(operatoreId, ore, dataOverride) {
  const data = dataOverride || _pianoDataSel || Calendario.oggiIso();
  const { data: res } = await sb.rpc('imposta_disponibilita_giornaliera', {
    p_operatore_id:    operatoreId,
    p_data:            data,
    p_ore:             ore,
    p_responsabile_id: currentUserRow.id,
  });
  if (!res?.ok) { toast(res?.errore || 'Errore', 'err'); return; }
  await caricaDisponibilitaPanel();
  if (!_pianoDataSel) renderPianificazione();
}

function impostaDisponibilitaCustom(operatoreId) {
  const inp = document.getElementById(`ore-custom-${operatoreId}`);
  const ore = parseFloat(inp?.value);
  if (isNaN(ore) || ore < 0 || ore > 24) { toast('Inserisci un valore tra 0 e 24', 'err'); return; }
  impostaDisponibilita(operatoreId, ore);
}

async function anteprimaPianoPer() {
  if (!_pianoDataSel) return;
  const el = document.getElementById('piano-content');
  el.innerHTML = `<div style="background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:8px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:var(--warn-ink);font-weight:600">Anteprima piano per ${formatDate(_pianoDataSel)} — sola lettura, non sostituisce il piano odierno</div>`;
  await renderPianificazione(_pianoDataSel);
}

// ═══════════════════════════════════════════════
// Stato locale per riassegnazioni manuali (non persistito) nella pianificazione
const _pianoRiassegnazioni = {};

async function renderPianificazione(p_data_override) {
  const el = document.getElementById('piano-content');
  el.innerHTML = '<div class="empty-state"><div class="icon"><i data-ic="clessidra"></i></div><p>Calcolo piano giornaliero...</p></div>';

  const rpcParams = { p_responsabile_id: currentUserRow.id };
  if (p_data_override) rpcParams.p_data = p_data_override;
  const { data: piano, error } = await sb.rpc('piano_giornaliero_raggruppato', rpcParams);

  if (error || !piano?.ok) {
    el.innerHTML = `<div class="empty-state"><div class="icon"><i data-ic="avviso"></i></div><p>Errore caricamento piano: ${escapeHtml(error?.message || piano?.errore || 'sconosciuto')}</p></div>`;
    return;
  }

  if (piano.chiuso) {
    const descr = piano.descrizione_chiusura ? ` — ${escapeHtml(piano.descrizione_chiusura)}` : '';
    el.innerHTML = `<div style="background:var(--warn-soft);border:1px solid var(--warn-line);border-radius:10px;padding:16px 20px;display:flex;align-items:center;gap:12px">
      <span style="font-size:24px"><i data-ic="lucchetto"></i></span>
      <div><div style="font-weight:700;font-size:14px;color:var(--warn-ink)">Giornata di chiusura aziendale${descr}</div>
      <div style="font-size:12px;color:var(--warn-ink-2);margin-top:2px">Nessun piano generato per questa data</div></div>
    </div>`;
    return;
  }

  const clusters = piano.clusters || [];
  const clustersExtra = piano.clusters_extra || [];
  const attese = piano.attese_esterne || [];
  { const { data: rz } = await sb.rpc('ricezioni_in_attesa', { p_operatore_id: currentUserRow.id, p_session_token: null }); if (rz?.ok) ricezioniR = rz; }
  const atteseSblocco = piano.attese_sblocco || [];
  const conflitti = piano.conflitti || [];
  const oreOp = piano.ore_per_operatore || {};

  if (!clusters.length && !clustersExtra.length && !attese.length && !atteseSblocco.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon"><i data-ic="calendario"></i></div><p>Nessun ordine attivo da pianificare</p></div>';
    return;
  }

  let html = '';

  // ── Banner conflitti bloccanti ──
  if (conflitti.length) {
    html += `<div style="background:var(--alert-bg);border:1px solid var(--alert-line);border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--alert-ink-2);margin-bottom:6px"><i data-ic="divieto"></i> ${conflitti.length} ordine${conflitti.length > 1 ? 'i' : ''} non assegnabile${conflitti.length > 1 ? 'i' : ''}</div>
      ${conflitti.map(c => {
        const opzioniOp = (fasi.find(f => f.id === c.fase_id)?.competenze || [])
          .map(opId => operatoriCache.find(o => o.id === opId)).filter(Boolean);
        const selectId = `riass-${c.ordine_id}`;
        return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 0;border-top:1px solid var(--alert-line);margin-top:4px">
          <span style="font-family:var(--font-mono);font-size:12px;font-weight:600">${escapeHtml(c.codice)}</span>
          <span style="font-size:12px;color:var(--ink)">${escapeHtml(c.cliente)}</span>
          <span style="font-size:11px;color:var(--alert-ink-2);flex:1">${escapeHtml(c.motivazione)}</span>
          ${opzioniOp.length ? `
            <select id="${selectId}" style="font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:4px">
              <option value="">— forza operatore —</option>
              ${opzioniOp.map(o => `<option value="${o.id}">${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</option>`).join('')}
            </select>
            <button onclick="_forzaRiassegna('${c.ordine_id}','${c.fase_id}',document.getElementById('${selectId}').value)" style="border:1px solid var(--alert-ink-2);background:var(--alert-ink-2);color:var(--on-alert);border-radius:4px;padding:2px 10px;font-size:12px;cursor:pointer">Forza</button>
          ` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  // ── Barre capacità operatori ──
  const opIds = Object.keys(oreOp);
  if (opIds.length) {
    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">Carico operatori oggi</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
        ${opIds.map(opId => {
          const info = oreOp[opId];
          const op = operatoriCache.find(o => o.id === opId);
          const nome = op ? `${op.nome} ${op.cognome}` : info.nome || opId;
          const pct = Math.min(100, info.ore_disponibili > 0 ? Math.round(info.ore_assegnate / info.ore_disponibili * 100) : 0);
          const barColor = pct >= 100 ? 'var(--alert-strong)' : pct >= 80 ? 'var(--warn-strong)' : 'var(--ok-strong)';
          return `<div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
              <span>${escapeHtml(nome)}</span>
              <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">${info.ore_assegnate.toFixed(1)}/${info.ore_disponibili.toFixed(1)}h</span>
            </div>
            <div style="background:var(--border);border-radius:4px;height:6px">
              <div style="width:${pct}%;background:${barColor};border-radius:4px;height:100%;transition:width 0.3s"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── Nota da ieri ──
  if (piano.nota_da_ieri) {
    html += `<div style="font-size:11px;color:var(--muted);font-style:italic;margin-bottom:12px;padding:6px 10px;background:var(--warn-bg);border-radius:4px;border:1px solid var(--warn-line)"><i data-ic="avviso"></i> ${escapeHtml(piano.nota_da_ieri)}</div>`;
  }

  // ── Cluster per fase ──
  clusters.forEach(cluster => {
    const opPropNome = (() => {
      if (!cluster.ordini?.length) return null;
      const op = cluster.ordini[0]?.operatore_proposto;
      return op ? `${op.nome}` : null;
    })();

    html += `<div style="margin-bottom:20px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
      <div style="background:var(--phase-bg);padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:700;color:var(--accent)">${escapeHtml(cluster.fase_nome)}</span>
        <span style="font-size:11px;color:var(--muted)">(${cluster.ordini?.length || 0} ordini)</span>
        ${opPropNome ? `<span style="font-size:11px;color:var(--muted);margin-left:auto">→ ${escapeHtml(opPropNome)}</span>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--surface);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em">
            <th style="padding:6px 10px;text-align:left;font-weight:600">Ordine</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Cliente</th>
            <th style="padding:6px 10px;text-align:center;font-weight:600">Scadenza</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Operatore</th>
            <th style="padding:6px 10px;text-align:right;font-weight:600">Stima</th>
          </tr>
        </thead>
        <tbody>
          ${(cluster.ordini || []).map(ord => {
            const hasConflitto = !!ord.conflitto;
            const bg = hasConflitto ? 'var(--alert-bg)' : '';
            const riassId = `riass-cl-${ord.ordine_id}`;
            const opzioniCl = (fasi.find(f => f.id === cluster.fase_id)?.competenze || [])
              .map(opId => operatoriCache.find(o => o.id === opId)).filter(Boolean);
            const opNome = _pianoRiassegnazioni[ord.ordine_id]
              ? (() => { const o = operatoriCache.find(op => op.id === _pianoRiassegnazioni[ord.ordine_id]); return o ? `${o.nome} ${o.cognome}` : '—'; })()
              : ord.operatore_proposto ? `${ord.operatore_proposto.nome}` : '—';
            return `<tr style="border-bottom:1px solid var(--border);background:${bg};cursor:pointer" onclick="openDettaglioOrdine('${ord.ordine_id}')">
              <td style="padding:8px 10px;font-weight:600;font-family:var(--font-mono)">
                ${escapeHtml(ord.codice || '—')}
                ${ord.da_ieri ? `<span style="font-size:10px;background:var(--warn-soft);color:var(--warn-ink);padding:1px 5px;border-radius:3px;margin-left:4px;vertical-align:middle">DA IERI</span>` : ''}
              </td>
              <td style="padding:8px 10px">${escapeHtml(ord.cliente || '')}</td>
              <td style="padding:8px 10px;text-align:center;color:${ord.scadenza && Calendario.oggiIso() > ord.scadenza ? 'var(--alert-strong)' : 'inherit'}">${ord.scadenza ? formatDate(ord.scadenza) : '—'}</td>
              <td style="padding:8px 10px" onclick="event.stopPropagation()">
                ${hasConflitto && opzioniCl.length
                  ? `<div style="display:flex;gap:4px;align-items:center">
                      <select id="${riassId}" style="font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--alert-bg)">
                        <option value="">— operatore —</option>
                        ${opzioniCl.map(o => `<option value="${o.id}">${escapeHtml(o.nome)} ${escapeHtml(o.cognome)}</option>`).join('')}
                      </select>
                      <button onclick="_forzaRiassegna('${ord.ordine_id}','${cluster.fase_id}',document.getElementById('${riassId}').value)" style="border:1px solid var(--alert-ink-2);background:var(--alert-ink-2);color:var(--on-alert);border-radius:3px;padding:1px 7px;font-size:11px;cursor:pointer">Forza</button>
                    </div>`
                  : `<span style="color:${hasConflitto ? 'var(--alert-ink-2)' : 'var(--ink)'}">${escapeHtml(opNome)}</span>`
                }
                ${hasConflitto ? `<div style="font-size:10px;color:var(--alert-ink-2);margin-top:2px">${escapeHtml(ord.motivazione || '')}</div>` : ''}
                ${!hasConflitto && ord.motivazione ? `<div style="font-size:10px;color:var(--muted);margin-top:1px">${escapeHtml(ord.motivazione)}</div>` : ''}
                ${ord.macchina_proposta ? `<div style="font-size:10px;color:var(--violet-ink);margin-top:1px"><i data-ic="chiave"></i> ${escapeHtml(ord.macchina_proposta.nome)}</div>` : ''}
              </td>
              <td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-size:12px;color:var(--muted)">${ord.stima_min != null ? Math.round(ord.stima_min) + ' min' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  });

  // ── Cluster per fasi extra ──
  if (clustersExtra.length) {
    html += `<div style="margin-bottom:8px;padding:4px 0">
      <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Lavorazioni extra</span>
    </div>`;
    clustersExtra.forEach(cluster => {
      const opPropNome = (() => {
        if (!cluster.ordini?.length) return null;
        const op = cluster.ordini[0]?.operatore_proposto;
        return op ? op.nome : null;
      })();
      html += `<div style="margin-bottom:20px;border:1px solid var(--indigo-line);border-radius:8px;overflow:hidden">
        <div style="background:var(--indigo-bg);padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--indigo-line)">
          <span style="font-size:13px;font-weight:700;color:var(--indigo-ink)"><i data-ic="matita"></i> ${escapeHtml(cluster.fase_nome)}</span>
          <span style="font-size:11px;color:var(--muted)">(${cluster.ordini?.length || 0} ordini)</span>
          ${opPropNome ? `<span style="font-size:11px;color:var(--muted);margin-left:auto">→ ${escapeHtml(opPropNome)}</span>` : ''}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--indigo-bg);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em">
              <th style="padding:6px 10px;text-align:left;font-weight:600">Ordine</th>
              <th style="padding:6px 10px;text-align:left;font-weight:600">Cliente</th>
              <th style="padding:6px 10px;text-align:center;font-weight:600">Scadenza</th>
              <th style="padding:6px 10px;text-align:left;font-weight:600">Operatore</th>
              <th style="padding:6px 10px;text-align:right;font-weight:600">Stima</th>
            </tr>
          </thead>
          <tbody>
            ${(cluster.ordini || []).map(ord => {
              const hasConflitto = !!ord.conflitto;
              const bg = hasConflitto ? 'var(--alert-bg)' : '';
              const opNome = ord.operatore_proposto ? ord.operatore_proposto.nome : '—';
              return `<tr style="border-bottom:1px solid var(--indigo-line);background:${bg};cursor:pointer" onclick="openDettaglioOrdine('${ord.ordine_id}')">
                <td style="padding:8px 10px;font-weight:600;font-family:var(--font-mono)">
                  ${escapeHtml(ord.codice || '—')}
                  ${ord.da_ieri ? `<span style="font-size:10px;background:var(--warn-soft);color:var(--warn-ink);padding:1px 5px;border-radius:3px;margin-left:4px;vertical-align:middle">DA IERI</span>` : ''}
                </td>
                <td style="padding:8px 10px">${escapeHtml(ord.cliente || '')}</td>
                <td style="padding:8px 10px;text-align:center;color:${ord.scadenza && Calendario.oggiIso() > ord.scadenza ? 'var(--alert-strong)' : 'inherit'}">${ord.scadenza ? formatDate(ord.scadenza) : '—'}</td>
                <td style="padding:8px 10px">
                  <span style="color:${hasConflitto ? 'var(--alert-ink-2)' : 'var(--ink)'}">${escapeHtml(opNome)}</span>
                  ${hasConflitto ? `<div style="font-size:10px;color:var(--alert-ink-2);margin-top:2px">${escapeHtml(ord.motivazione || '')}</div>` : ''}
                  ${!hasConflitto && ord.motivazione ? `<div style="font-size:10px;color:var(--muted);margin-top:1px">${escapeHtml(ord.motivazione)}</div>` : ''}
                  ${ord.macchina_proposta ? `<div style="font-size:10px;color:var(--violet-ink);margin-top:1px"><i data-ic="chiave"></i> ${escapeHtml(ord.macchina_proposta.nome)}</div>` : ''}
                </td>
                <td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-size:12px;color:var(--muted)">${ord.stima_min != null ? Math.round(ord.stima_min) + ' min' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    });
  }

  // ── Attese esterne: lo stesso riquadro della pagina Oggi (dati di ricezioni_in_attesa) ──
  html += riquadroFornitori();

  // ── Attese sblocco dipendenze ──
  if (atteseSblocco.length) {
    html += `<div style="margin-bottom:20px;border:1px solid var(--violet-line);border-radius:8px;overflow:hidden;opacity:0.9">
      <div style="background:var(--violet-bg);padding:8px 14px;border-bottom:1px solid var(--violet-line)">
        <span style="font-size:13px;font-weight:700;color:var(--violet)"><i data-ic="lucchetto"></i> In attesa di sblocco (${atteseSblocco.length})</span>
        <span style="font-size:11px;color:var(--muted);margin-left:8px">fasi bloccate da dipendenze non soddisfatte</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--violet-bg);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em">
            <th style="padding:6px 10px;text-align:left;font-weight:600">Ordine</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Cliente</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Fase bloccata</th>
            <th style="padding:6px 10px;text-align:left;font-weight:600">Attende completamento</th>
            <th style="padding:6px 10px;text-align:center;font-weight:600">Scadenza</th>
          </tr>
        </thead>
        <tbody>
          ${atteseSblocco.map(a => {
            const depNomi = (a.dipendenze || []).map(d => escapeHtml(d.nome)).join(', ');
            return `<tr style="border-bottom:1px solid var(--violet-line);cursor:pointer" onclick="openDettaglioOrdine('${a.ordine_id}')">
              <td style="padding:8px 10px;font-weight:600;font-family:var(--font-mono)">${escapeHtml(a.codice || '—')}</td>
              <td style="padding:8px 10px">${escapeHtml(a.cliente || '')}</td>
              <td style="padding:8px 10px;color:var(--muted)">${escapeHtml(a.fase_nome || '')}</td>
              <td style="padding:8px 10px;font-size:12px;color:var(--violet)">${depNomi || '—'}</td>
              <td style="padding:8px 10px;text-align:center">${a.scadenza ? formatDate(a.scadenza) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  el.innerHTML = html;
}

function _forzaRiassegna(ordineId, faseId, opId) {
  if (!opId) { toast('Seleziona un operatore', 'err'); return; }
  _pianoRiassegnazioni[ordineId] = opId;
  toast('Riassegnazione locale applicata (non salvata su DB)', 'ok');
  renderPianificazione();
}
