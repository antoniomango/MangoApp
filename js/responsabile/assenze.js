// responsabile.html — Ferie, assenze, richieste di permesso, segnala assenza, tipi di richiesta e contatori.
// Script classico: stesso ambito globale della pagina; caricato prima dello script principale (ordine in strumenti/moduli-responsabile.txt).

// ═══════════════════════════════════════════════
// FERIE E PERMESSI OPERATORE
// ═══════════════════════════════════════════════

function raggruppaInIntervalli(eccezioni) {
  const gruppi = [];
  let cur = null;
  for (const r of eccezioni) {
    if (cur && String(r.ore) === String(cur.ore) && r.motivo === cur.motivo) {
      const diff = (new Date(r.data) - new Date(cur.fine)) / 86400000;
      if (diff === 1) { cur.fine = r.data; cur.ids.push(r.id); continue; }
    }
    cur = { inizio: r.data, fine: r.data, ore: r.ore, motivo: r.motivo, ids: [r.id] };
    gruppi.push(cur);
  }
  return gruppi;
}

// Elenco in sola lettura delle assenze in programma di un operatore (prossime 4 settimane, come la scheda Assenze).
// Le voci "Inserito a mano" (vecchio sistema) restano eliminabili con ✕ per poterle ripulire; non se ne creano di nuove da qui.
async function caricaAssenzeOperatore(operatoreId) {
  const el = document.getElementById('op-ferie-list');
  if (!el) return;
  const op = operatoriCache.find(o => o.id === operatoreId);
  if (op && op.ruolo !== 'operatore') {
    el.innerHTML = '<span style="font-size:12px;color:var(--muted);font-style:italic">Le assenze si segnalano per gli operatori di produzione.</span>';
    return;
  }
  await _caricaAssenze();
  const el2 = document.getElementById('op-ferie-list');
  if (!el2) return;
  if (!_assDati || _assDati.errore) { el2.textContent = 'Impossibile caricare le assenze'; return; }
  const voci = _assDati.voci.filter(v => v.opId === operatoreId);
  if (!voci.length) {
    el2.innerHTML = '<span style="font-size:12px;color:var(--muted);font-style:italic">Nessuna assenza in programma nelle prossime 4 settimane</span>';
    return;
  }
  el2.innerHTML = voci.map(v => {
    const range = v.dal === v.al ? _dIt(v.dal) : `dal ${_dIt(v.dal)} al ${_dIt(v.al)}`;
    const dett = v.fonte === 'richiesta'
      ? [v.tipo, v.oraI ? `dalle ${v.oraI} alle ${v.oraF}` : 'tutto il giorno'].filter(Boolean).join(' · ')
      : [v.motivo, v.ore === 0 ? 'assente' : `${_oreTxt(v.ore)} h in servizio`].filter(Boolean).join(' · ');
    const rimuovi = v.fonte === 'mano'
      ? `<button type="button" style="background:none;border:none;cursor:pointer;color:var(--alert);font-size:13px;padding:0 2px" onclick="rimuoviPermessoPeriodo('${escapeJsAttr(operatoreId)}','${v.dal}','${v.al}')" title="Rimuovi" aria-label="Rimuovi">✕</button>`
      : '';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--ink);font-style:normal">
      <span style="flex:1">${escapeHtml(range)}${dett ? ' · ' + escapeHtml(dett) : ''}</span>
      <span class="ass-fonte${v.fonte === 'mano' ? ' mano' : ''}">${_etichettaFonteAssenza(v)}</span>${rimuovi}
    </div>`;
  }).join('');
}

// Dalla scheda operatore: apre "Segnala assenza" già compilato con quell'operatore (la scheda resta aperta, l'elenco si aggiorna alla conferma)
function segnalaAssenzaDaOperatore(operatoreId) { apriSegnalaAssenza(operatoreId); }

async function rimuoviPermessoPeriodo(operatoreId, dal, al) {
  const op = operatoriCache.find(o => o.id === operatoreId);
  const oreDefault = op?.ore_default ?? oreGiornoDefault();
  const { data, error } = await sb.rpc('imposta_permesso_periodo', {
    p_operatore_id:    operatoreId,
    p_data_inizio:     dal,
    p_data_fine:       al,
    p_ore:             oreDefault,
    p_motivo:          null,
    p_responsabile_id: currentUserRow.id,
  });
  if (error || !data?.ok) { toast(data?.errore || error?.message || 'Errore', 'err'); return; }
  toast('Periodo rimosso', 'ok');
  caricaAssenzeOperatore(operatoreId);
  caricaDisponibilitaPanel();
  aggiornaStatoAssenze();
}

function apriRichiesteInAttesa() { _ricVista = 'attesa'; showSection('richieste'); }
function apriAssenzeOperatore(id) { _assFiltroOp = id; showSection('assenze'); }

// ── Dati assenze (prossime 4 settimane) ──
// Fonti, senza doppioni:
//  1. richieste_assenza approvate (origine operatore = "Richiesta", responsabile = "Segnalata");
//  2. righe di disponibilita_giornaliera con motivo e ore ridotte inserite a mano, ESCLUSE le date
//     che una richiesta approvata dello stesso operatore ha già scritto (richieste_disponibilita).
let _assDati = null;
let _assSeq = 0;
let _assRaggruppa = 'giorno';
let _assFiltroOp = '';

// Giorno lavorativo secondo il calendario unico del server (orario, sabato/domenica, chiusure, straordinari)
function _assGiornoLavorativo(iso) {
  return Calendario.giorni().includes(iso);
}
function _assGiorni(dal, al) {
  const out = [];
  const d = new Date(dal + 'T12:00:00');
  for (let k = 0; k < 400; k++) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > al) break;
    out.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const _dm = iso => { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${Number(d)}/${Number(m)}`; };
function _rangeBreve(dal, al) {
  if (dal === al) return _dm(dal);
  if (dal.slice(0, 7) === al.slice(0, 7)) return `${Number(dal.slice(8, 10))}–${_dm(al)}`;
  return `${_dm(dal)}–${_dm(al)}`;
}
const _oreTxt = n => String(Number(n)).replace('.', ',');

async function _caricaAssenze() {
  const seq = ++_assSeq;
  const oggi = _isoOggi(), fine = _isoSpost(27);
  // Tutte le query sono limitate al periodo (tabelle che crescono), ordinate su colonna univoca, con conteggio.
  const [ra, att, dg, ch, cfg] = await Promise.all([
    sb.from('richieste_assenza').select('id, operatore_id, data_inizio, data_fine, ora_inizio, ora_fine, origine, tipo:tipi_richiesta(nome)', { count: 'exact' })
      .eq('stato', 'approvata').gte('data_fine', oggi).lte('data_inizio', fine).order('data_inizio').order('id').range(0, 999),
    sb.from('richieste_assenza').select('id, operatore_id', { count: 'exact' })
      .eq('stato', 'in_attesa').order('id').range(0, 999),
    sb.from('disponibilita_giornaliera').select('id, operatore_id, data, ore, motivo', { count: 'exact' })
      .gte('data', oggi).lte('data', fine).order('data').order('id').range(0, 4999),
    sb.from('chiusure_aziendali').select('id, data_inizio, data_fine, descrizione')
      .gte('data_fine', oggi).lte('data_inizio', fine).order('data_inizio').order('id').limit(200),
    sb.from('kpi_config').select('valore').eq('chiave', 'richieste_max_assenti_contemporanei').maybeSingle(),
  ]);
  const errore = ra.error || att.error || dg.error || ch.error;
  if (errore) { if (seq === _assSeq) _assDati = { errore: errore.message }; return _assDati; }

  const richieste = ra.data || [];
  const ids = richieste.map(r => r.id);
  const coperti = new Set();   // "operatore|data" già scritti da una richiesta approvata
  let troncato = (ra.count ?? 0) > richieste.length || (att.count ?? 0) > (att.data || []).length || (dg.count ?? 0) > (dg.data || []).length;
  const opDiRichiesta = Object.fromEntries(richieste.map(r => [r.id, r.operatore_id]));
  for (let k = 0; k < ids.length; k += 100) {
    const { data: rd, error: eRd } = await sb.from('richieste_disponibilita').select('richiesta_id, data')
      .in('richiesta_id', ids.slice(k, k + 100)).gte('data', oggi).lte('data', fine)
      .order('richiesta_id').order('data').range(0, 4999);
    if (eRd) { if (seq === _assSeq) _assDati = { errore: eRd.message }; return _assDati; }
    (rd || []).forEach(x => coperti.add(opDiRichiesta[x.richiesta_id] + '|' + x.data));
  }
  if (seq !== _assSeq) return _assDati;   // nel frattempo è partito un caricamento più recente

  const produzione = new Map(operatoriCache.filter(o => o.ruolo === 'operatore' && o.attivo).map(o => [o.id, o]));
  const voci = [];
  richieste.forEach(r => {
    if (!produzione.has(r.operatore_id)) return;
    voci.push({ fonte: 'richiesta', id: r.id, opId: r.operatore_id, dal: r.data_inizio, al: r.data_fine,
      oraI: _oraHm(r.ora_inizio), oraF: _oraHm(r.ora_fine), tipo: r.tipo?.nome || '', origine: r.origine });
  });
  const perOp = {};
  (dg.data || []).forEach(x => {
    const op = produzione.get(x.operatore_id);
    if (!op || !x.motivo || !String(x.motivo).trim()) return;
    if (Number(x.ore) >= Number(op.ore_default ?? oreGiornoDefault())) return;      // non è un'assenza (es. straordinario)
    if (coperti.has(x.operatore_id + '|' + x.data)) return;          // già mostrato come richiesta
    (perOp[x.operatore_id] = perOp[x.operatore_id] || []).push(x);
  });
  const chiusure = ch.data || [];
  Object.entries(perOp).forEach(([opId, righe]) => {
    // Unisce anche i periodi separati solo da giorni non lavorativi (es. venerdì + lunedì)
    const gruppi = [];
    raggruppaInIntervalli(righe).forEach(g => {
      const prec = gruppi[gruppi.length - 1];
      const inMezzo = prec ? _assGiorni(prec.fine, g.inizio).slice(1, -1) : [];
      if (prec && String(prec.ore) === String(g.ore) && prec.motivo === g.motivo && inMezzo.length <= 7 && inMezzo.every(d => !_assGiornoLavorativo(d, chiusure))) prec.fine = g.fine;
      else gruppi.push({ ...g });
    });
    gruppi.forEach(g => voci.push({ fonte: 'mano', opId, dal: g.inizio, al: g.fine, ore: Number(g.ore), motivo: g.motivo }));
  });
  voci.sort((a, b) => a.dal.localeCompare(b.dal) || _nomeOp(a.opId).localeCompare(_nomeOp(b.opId)));

  const inAttesa = {};
  (att.data || []).forEach(r => { inAttesa[r.operatore_id] = (inAttesa[r.operatore_id] || 0) + 1; });

  _assDati = { oggi, fine, voci, inAttesa, chiusure: ch.data || [], troncato,
    massimo: Number(cfg.data?.valore ?? 2) };
  return _assDati;
}

function _nomeOpVisibile(id) { const o = operatoriCache.find(x => x.id === id); return o ? `${o.nome} ${o.cognome}` : ''; }
const _vocePiena = v => v.fonte === 'richiesta' ? !v.oraI : v.ore === 0;

async function aggiornaStatoAssenze() {
  await _caricaAssenze();
  const attiva = document.getElementById('sec-operatori')?.classList.contains('active');
  if (!attiva) return;
  if (_opsScheda === 'produzione') renderOperatori();
  else if (_opsScheda === 'assenze') renderAssenze();
}

// Etichetta per la card: assenza che copre oggi, altrimenti la prossima entro 14 giorni.
function _assStatoOperatore(opId) {
  if (!_assDati || _assDati.errore) return {};
  const { oggi } = _assDati;
  const limite = _isoSpost(14);
  const mie = _assDati.voci.filter(v => v.opId === opId);
  let assenza = '';
  const ora = mie.find(v => v.dal <= oggi && v.al >= oggi);
  if (ora) {
    if (ora.fonte === 'richiesta' && ora.oraI) assenza = `Permesso oggi ${ora.oraI}–${ora.oraF}`;
    else if (ora.fonte === 'mano' && ora.ore > 0) assenza = `Permesso oggi (${_oreTxt(ora.ore)} h in servizio)`;
    else assenza = 'Assente oggi';
  } else {
    const pross = mie.find(v => v.dal > oggi && v.dal <= limite);
    if (pross) {
      if (pross.fonte === 'richiesta' && pross.oraI) assenza = `Permesso ${_dm(pross.dal)} ${pross.oraI}–${pross.oraF}`;
      else if (pross.fonte === 'mano' && pross.ore > 0) assenza = `Permesso ${_rangeBreve(pross.dal, pross.al)} (${_oreTxt(pross.ore)} h in servizio)`;
      else assenza = `Assente ${_rangeBreve(pross.dal, pross.al)}`;
    }
  }
  return { assenza, inAttesa: _assDati.inAttesa[opId] || 0 };
}

function assenzeRaggruppa(v) { _assRaggruppa = v === 'operatore' ? 'operatore' : 'giorno'; renderAssenze(); }
function assenzeFiltroOperatore(id) { _assFiltroOp = id || ''; renderAssenze(); }

const _etichettaFonteAssenza = v => v.fonte === 'mano' ? 'Inserito a mano' : v.origine === 'responsabile' ? 'Segnalata' : 'Richiesta';

function _voceAssenzaHtml(v, perGiorno, giorno) {
  const etichetta = _etichettaFonteAssenza(v);
  let dett;
  if (v.fonte === 'richiesta') {
    const quando = v.oraI ? `dalle ${v.oraI} alle ${v.oraF}${perGiorno ? '' : ' del ' + _dIt(v.dal)}`
      : perGiorno ? (v.dal === v.al ? 'tutto il giorno' : giorno === v.al ? `ultimo giorno (dal ${_dIt(v.dal)})` : `fino al ${_dIt(v.al)}`)
      : (v.dal === v.al ? _dIt(v.dal) : `dal ${_dIt(v.dal)} al ${_dIt(v.al)}`);
    dett = [v.tipo, quando].filter(Boolean).join(' · ');
  } else {
    const periodo = perGiorno ? '' : (v.dal === v.al ? _dIt(v.dal) : `dal ${_dIt(v.dal)} al ${_dIt(v.al)}`);
    dett = [v.motivo, periodo, v.ore === 0 ? 'assente' : `${_oreTxt(v.ore)} h in servizio`].filter(Boolean).join(' · ');
  }
  const azione = v.fonte === 'richiesta' ? `apriRichiestaStorico('${escapeJsAttr(v.id)}')` : `openModalModificaOperatore('${escapeJsAttr(v.opId)}')`;
  const titolo = v.fonte === 'richiesta' ? 'Apri la richiesta nello storico' : 'Apri la scheda dell\'operatore';
  return `<button type="button" class="ass-voce" title="${titolo}" onclick="${azione}">
    <strong>${escapeHtml(_nomeOpVisibile(v.opId))}</strong>
    <span class="ass-fonte${v.fonte === 'mano' ? ' mano' : ''}">${etichetta}</span>
    <span class="ass-dett">${escapeHtml(dett)}</span>
  </button>`;
}

function renderAssenze() {
  const corpo = document.getElementById('ass-corpo');
  const sotto = document.getElementById('ass-sotto');
  const sel = document.getElementById('ass-f-operatore');
  if (!corpo) return;
  _selezionaTab(['giorno', 'operatore'], _assRaggruppa, x => 'ass-tab-' + x);
  const produzione = operatoriCache.filter(o => o.ruolo === 'operatore' && o.attivo)
    .sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`));
  if (_assFiltroOp && !produzione.some(o => o.id === _assFiltroOp)) _assFiltroOp = '';
  sel.innerHTML = '<option value="">Tutti gli operatori</option>' + produzione
    .map(o => `<option value="${escapeHtml(o.id)}"${o.id === _assFiltroOp ? ' selected' : ''}>${escapeHtml(o.cognome)} ${escapeHtml(o.nome)}</option>`).join('');

  if (!_assDati) { corpo.innerHTML = '<div style="color:var(--muted);padding:14px">Caricamento…</div>'; sotto.textContent = ''; return; }
  if (_assDati.errore) { corpo.innerHTML = `<div class="ric-err" style="padding:14px">${escapeHtml(_assDati.errore)}</div>`; sotto.textContent = ''; return; }

  const { oggi, fine, chiusure, massimo } = _assDati;
  sotto.textContent = `Dal ${_dIt(oggi)} al ${_dIt(fine)} · massimo assenti nello stesso giorno: ${massimo}` +
    (_assDati.troncato ? ' · Attenzione: elenco incompleto, troppi dati nel periodo' : '');
  const voci = _assDati.voci.filter(v => !_assFiltroOp || v.opId === _assFiltroOp);
  let html = '';

  if (_assRaggruppa === 'giorno') {
    _assGiorni(oggi, fine).forEach(g => {
      const chiusura = chiusure.find(c => g >= c.data_inizio && g <= c.data_fine);
      const lavorativo = _assGiornoLavorativo(g, chiusure);
      // Solo giorni lavorativi (come richiesta_applica_disponibilita); un periodo a mano che cade
      // interamente in giorni non lavorativi resta comunque visibile nei suoi giorni.
      const delGiorno = voci.filter(v => v.dal <= g && v.al >= g && (lavorativo || (v.fonte === 'mano' && !_assGiorni(v.dal, v.al).some(d => _assGiornoLavorativo(d, chiusure)))));
      if (!delGiorno.length && !chiusura) return;
      // Assenti a giornata intera fra tutti gli operatori di produzione (indipendente dal filtro)
      const assenti = lavorativo ? new Set(_assDati.voci.filter(v => v.dal <= g && v.al >= g && _vocePiena(v)).map(v => v.opId)).size : 0;
      const oltre = assenti > massimo;
      const data = new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
      html += `<div class="ass-giorno${oltre ? ' oltre' : ''}">${escapeHtml(data)}${assenti ? `<span class="ass-conta">· ${assenti} assent${assenti === 1 ? 'e' : 'i'}${oltre ? ` (oltre il massimo di ${massimo})` : ''}</span>` : ''}</div>`;
      if (chiusura) html += `<div class="ass-chiusura">Chiusura aziendale${chiusura.descrizione ? ' — ' + escapeHtml(chiusura.descrizione) : ''}</div>`;
      html += delGiorno.map(v => _voceAssenzaHtml(v, true, g)).join('');
    });
  } else {
    if (chiusure.length) {
      html += '<div class="ass-giorno" style="text-transform:none">Chiusura aziendale</div>' + chiusure.map(c =>
        `<div class="ass-chiusura">${escapeHtml(c.data_inizio === c.data_fine ? _dIt(c.data_inizio) : `dal ${_dIt(c.data_inizio)} al ${_dIt(c.data_fine)}`)}${c.descrizione ? ' — ' + escapeHtml(c.descrizione) : ''}</div>`).join('');
    }
    produzione.forEach(o => {
      const sue = voci.filter(v => v.opId === o.id);
      if (!sue.length) return;
      html += `<div class="ass-giorno" style="text-transform:none">${escapeHtml(o.cognome)} ${escapeHtml(o.nome)}</div>` + sue.map(v => _voceAssenzaHtml(v, false)).join('');
    });
  }
  corpo.innerHTML = html || `<div class="empty-state"><p>${_assFiltroOp ? 'Nessuna assenza per questo operatore' : 'Nessuna assenza'} nelle prossime 4 settimane</p></div>`;
}

// Dalla scheda Assenze allo Storico delle richieste, con la riga evidenziata.
let _ricEvidenzia = null;
function apriRichiestaStorico(id) {
  const v = _assDati?.voci?.find(x => x.id === id);
  const dal = _isoSpost(-90), al = _isoSpost(90);
  _ricFiltri = { stato: '', operatore: v?.opId || '', dal: v && v.dal < dal ? v.dal : dal, al: v && v.dal > al ? v.dal : al };
  _ricEvidenzia = id;
  _ricVista = 'storico';
  showSection('richieste');
}

// ═══════════════════════════════════════════════════════════════════════════
// RICHIESTE DI PERMESSO E ASSENZE · PROFILO OPERATORI · TAGLIE · CONFIGURAZIONE
// ═══════════════════════════════════════════════════════════════════════════
// Letture: richieste_assenza/campi_profilo/tipi_richiesta via tabella (RLS e_responsabile()),
// sempre filtrate e ordinate su una colonna univoca; scritture su richieste e valori del
// profilo SOLO via RPC (approvazione e disponibilità nella stessa transazione). Stato dei
// moduli in memoria, aggiornato a ogni input. Valori dal database solo via escapeHtml.
const RIC_ERRORI = {
  non_autorizzato: 'Operazione non consentita', richiesta_non_in_attesa: 'La richiesta non è più in attesa',
  richiesta_non_approvata: 'La richiesta non è approvata', richiesta_non_trovata: 'Richiesta non trovata',
  nota_troppo_lunga: 'Nota troppo lunga (massimo 300 caratteri)', sovrapposizione: 'Si sovrappone a un\'altra assenza o richiesta dell\'operatore',
  date_mancanti: 'Indica le date', data_fine_precedente_inizio: 'La data di fine è prima di quella di inizio',
  periodo_troppo_lungo: 'Massimo 30 giorni', permesso_ore_un_solo_giorno: 'Le ore valgono per un solo giorno',
  ora_fine_precedente_inizio: 'L\'ora di fine deve essere dopo quella di inizio', giorno_non_lavorativo: 'Giorno non lavorativo',
  fuori_orario_lavoro: 'Fuori dall\'orario di lavoro', nessun_giorno_lavorativo: 'Nessun giorno lavorativo nel periodo',
  orario_incompleto: 'Indica l\'ora di inizio e di fine', operatore_non_trovato: 'Operatore non trovato',
  tipo_segnalazioni_mancante: 'Manca il tipo di richiesta per le segnalazioni (Altro)',
  telefono_non_valido: 'usa solo cifre, spazi, + e - (massimo 20)', testo_troppo_lungo: 'massimo 100 caratteri',
  scelta_non_valida: 'scegli un valore dall\'elenco', numero_non_valido: 'inserisci un numero valido', numero_fuori_limiti: 'numero fuori dai limiti',
  campo_non_trovato: 'Campo non più disponibile',
};
const ricErrore = c => RIC_ERRORI[c] || c || 'Operazione non riuscita';
const RIC_STATI = Etichette.STATI_RICHIESTA;
const _isoOggi = () => Calendario.oggiIso();   // "oggi" nel fuso aziendale, non quello del dispositivo
const _isoSpost = (giorni) => { const d = new Date(_isoOggi() + 'T12:00:00'); d.setDate(d.getDate() + giorni); return d.toISOString().slice(0, 10); };
const _dIt = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const _oraHm = t => t ? String(t).slice(0, 5) : '';
function _periodoRic(r) {
  if (r.ora_inizio) return `${_dIt(r.data_inizio)} dalle ${_oraHm(r.ora_inizio)} alle ${_oraHm(r.ora_fine)}`;
  if (r.data_inizio === r.data_fine) return _dIt(r.data_inizio);
  return `dal ${_dIt(r.data_inizio)} al ${_dIt(r.data_fine)}`;
}
const RIC_SELECT = 'id, operatore_id, data_inizio, data_fine, ora_inizio, ora_fine, nota_operatore, stato, origine, nota_responsabile, deciso_il, creato_il, operatore:users!operatore_id(nome, cognome), decisore:users!deciso_da(nome, cognome), tipo:tipi_richiesta(nome, unita)';

let _ricVista = 'attesa';
let _ricAttesa = [];
let _ricStorico = [];
let _ricNote = {};   // richiesta_id → nota del responsabile in scrittura
let _ricFiltri = { stato: '', operatore: '', dal: '', al: '' };
let _ricOccupato = false;

async function aggiornaBadgeRichieste() {
  const { count, error } = await sb.from('richieste_assenza').select('id', { count: 'exact', head: true }).eq('stato', 'in_attesa');
  if (error) return;
  // Contatore sulla voce di menu Operatori e sulla scheda Richieste (nascosti se 0)
  ['richieste-badge', 'richieste-badge-gruppo', 'ops-tab-ric-conta', 'barra-conta-ric'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = String(count || 0);
    b.hidden = !count;
  });
  // Riquadro in cima alla Panoramica (nascosto se 0)
  const box = document.getElementById('avviso-richieste-dash');
  if (box) {
    box.hidden = !count;
    document.getElementById('avviso-richieste-testo').textContent =
      count === 1 ? '1 richiesta di permesso in attesa' : `${count || 0} richieste di permesso in attesa`;
  }
  _numeroSullIcona(count || 0);
}

// Numero sull'icona dell'app installata (Badging API); dove non c'è o manca il permesso, niente.
function _numeroSullIcona(n) {
  try {
    if (n > 0 && typeof navigator.setAppBadge === 'function') Promise.resolve(navigator.setAppBadge(n)).catch(() => {});
    else if (n === 0 && typeof navigator.clearAppBadge === 'function') Promise.resolve(navigator.clearAppBadge()).catch(() => {});
  } catch (e) { /* non supportato */ }
}

// ── Contatore sempre aggiornato (il canale principale per le richieste; le push sono un aiuto in più) ──
// Oltre al realtime: al ritorno in primo piano, ogni 2 minuti a pagina visibile, alla riconnessione
// del canale realtime. Al massimo un aggiornamento ogni 10 secondi.
const _CONTATORE_OGNI_MS = 120000;
const _CONTATORE_MINIMO_MS = 10000;
let _contatoreUltimo = 0;
let _contatoreTimer = null;
function _aggiornaContatori() {
  if (currentUserRow?.ruolo !== 'responsabile' || !currentUser) return;
  const ora = Date.now();
  if (ora - _contatoreUltimo < _CONTATORE_MINIMO_MS) return;
  _contatoreUltimo = ora;
  aggiornaBadgeRichieste();
  aggiornaBadgeDispositivi();
  loadNotifiche().then(() => {
    if (document.getElementById('sec-notifiche')?.classList.contains('active')) renderNotifiche();
  }).catch(() => {});
}
function _avviaTimerContatori() {
  _fermaTimerContatori();
  if (document.visibilityState !== 'visible') return;
  _contatoreTimer = setInterval(_aggiornaContatori, _CONTATORE_OGNI_MS);
}
function _fermaTimerContatori() { if (_contatoreTimer) { clearInterval(_contatoreTimer); _contatoreTimer = null; } }
function avviaContatoriRichieste() {
  _contatoreUltimo = Date.now();   // l'accesso ha appena caricato tutto
  _avviaTimerContatori();
}
function fermaContatoriRichieste() { _fermaTimerContatori(); _numeroSullIcona(0); }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { _aggiornaContatori(); if (currentUser) _avviaTimerContatori(); }
  else _fermaTimerContatori();
});
window.addEventListener('pageshow', e => { if (e.persisted) { _aggiornaContatori(); if (currentUser) _avviaTimerContatori(); } });
// Canale realtime: dopo un'interruzione, alla nuova sottoscrizione riallinea i contatori
let _realtimeInterrotto = false;
function _statoRealtime(stato) {
  if (stato === 'CHANNEL_ERROR' || stato === 'TIMED_OUT' || stato === 'CLOSED') _realtimeInterrotto = true;
  else if (stato === 'SUBSCRIBED' && _realtimeInterrotto) { _realtimeInterrotto = false; _aggiornaContatori(); }
}

function richiesteVista(v) {
  if (v === 'assenze') { showSection('assenze'); return; }   // ex vista "Assenze squadra": ora scheda Assenze
  if (v !== 'attesa' && v !== 'storico') v = 'attesa';
  _ricVista = v;
  _selezionaTab(['attesa', 'storico'], v, x => 'ric-tab-' + x, x => 'ric-vista-' + x);
  if (v === 'attesa') loadRichiesteAttesa();
  else { _initFiltriStorico(); loadRichiesteStorico(); }
}

async function loadRichiesteAttesa() {
  const el = document.getElementById('ric-vista-attesa');
  el.innerHTML = '<div style="color:var(--muted);padding:12px">Caricamento…</div>';
  // Le richieste in attesa sono poche per natura; limite + conteggio come rete di sicurezza.
  const { data, error, count } = await sb.from('richieste_assenza').select(RIC_SELECT, { count: 'exact' })
    .eq('stato', 'in_attesa').order('data_inizio').order('id').limit(200);
  if (error) { el.innerHTML = `<div class="ric-err">${escapeHtml(error.message)}</div>`; return; }
  _ricAttesa = data || [];
  aggiornaBadgeRichieste();
  if (!_ricAttesa.length) { el.innerHTML = '<div class="empty-state"><div class="icon"><i data-ic="spunta"></i></div><p>Nessuna richiesta in attesa</p></div>'; return; }
  el.innerHTML = (count > _ricAttesa.length ? `<div class="ric-err">Mostrate ${_ricAttesa.length} richieste su ${count}.</div>` : '') +
    _ricAttesa.map(r => `
    <div class="ric-card" id="ric-${escapeHtml(r.id)}">
      <div class="ric-card-testa">
        <div>
          <div class="ric-nome">${escapeHtml(r.operatore?.nome)} ${escapeHtml(r.operatore?.cognome)}</div>
          <div class="ric-meta"><strong>${escapeHtml(r.tipo?.nome)}</strong> · ${escapeHtml(_periodoRic(r))}</div>
          <div class="ric-meta" style="color:var(--muted);font-size:12px">Inviata il ${escapeHtml(formatDateTime(r.creato_il))}</div>
        </div>
        <span class="badge badge-in_attesa">In attesa</span>
      </div>
      ${r.nota_operatore ? `<div class="ric-nota-op">${escapeHtml(r.nota_operatore)}</div>` : ''}
      <div class="impatto" id="imp-${escapeHtml(r.id)}"><div class="impatto-titolo">Impatto</div><div style="padding:8px 12px;font-size:13px;color:var(--muted)">Calcolo…</div></div>
      <div class="ric-azioni">
        <input type="text" maxlength="300" placeholder="Nota per l'operatore (facoltativa)" value="${escapeHtml(_ricNote[r.id] || '')}" oninput="_ricNote['${escapeJsAttr(r.id)}'] = this.value">
        <button class="btn btn-ok" onclick="decidiRichiesta('${escapeJsAttr(r.id)}', 'approva')"><i data-ic="spunta"></i> Approva</button>
        <button class="btn btn-danger" onclick="decidiRichiesta('${escapeJsAttr(r.id)}', 'rifiuta')">Rifiuta</button>
      </div>
    </div>`).join('');
  _ricAttesa.forEach(r => caricaImpatto(r.id));
}

async function caricaImpatto(id) {
  const box = document.getElementById('imp-' + id);
  const { data, error } = await sb.rpc('richiesta_impatto', { p_richiesta_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (!box) return;
  if (error || !data?.ok) { box.innerHTML = `<div class="impatto-titolo">Impatto</div><div class="ric-err" style="padding:8px 12px">${escapeHtml(ricErrore(data?.errore || error?.message))}</div>`; return; }
  const lista = (arr) => arr.map(x => escapeHtml(x)).join(', ');
  box.innerHTML = `<div class="impatto-titolo">Impatto${data.parziale ? ' — permesso a ore: presente il resto della giornata' : ''}</div>` +
    (data.giorni.length ? data.giorni.map(g => {
      const righe = [];
      if (g.altri_assenti > 0) righe.push(`<div class="${g.supera_massimo ? 'rischio' : 'attenzione'}">Già assenti: ${g.altri_assenti} (${lista(g.nomi_assenti)})</div>`);
      if (g.supera_massimo) righe.push(`<div class="rischio">Oltre il massimo di ${escapeHtml(data.massimo_assenti)} assenti nello stesso giorno</div>`);
      if (g.fasi_scoperte.length) righe.push(`<div class="rischio">Fasi senza altri operatori competenti: ${lista(g.fasi_scoperte)}</div>`);
      if (g.macchine_scoperte.length) righe.push(`<div class="rischio">Macchine senza altri operatori abilitati: ${lista(g.macchine_scoperte)}</div>`);
      if (g.fasi_senza_macchina.length) righe.push(`<div class="attenzione">Fasi che resterebbero senza nessuna macchina utilizzabile: ${lista(g.fasi_senza_macchina)}</div>`);
      if (!righe.length) righe.push('<div class="ok">Coperto: nessuna fase o macchina scoperta</div>');
      const d = new Date(g.data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return `<div class="impatto-giorno"><div><strong>${escapeHtml(d)}</strong></div><div>${righe.join('')}</div></div>`;
    }).join('') : '<div class="impatto-giorno"><div></div><div class="ok">Nessun giorno lavorativo coinvolto</div></div>');
}

async function decidiRichiesta(id, azione) {
  if (_ricOccupato) return;
  const r = _ricAttesa.find(x => x.id === id);
  const nome = r ? `${r.operatore?.nome} ${r.operatore?.cognome}` : '';
  if (!confirm(`${azione === 'approva' ? 'Approvare' : 'Rifiutare'} la richiesta di ${nome}?`)) return;
  _ricOccupato = true;
  const { data, error } = await sb.rpc(azione === 'approva' ? 'richiesta_approva' : 'richiesta_rifiuta', {
    p_richiesta_id: id, p_nota: (_ricNote[id] || '').trim() || null, p_responsabile_id: currentUserRow.id, p_session_token: null,
  });
  _ricOccupato = false;
  if (error || !data?.ok) { toast(ricErrore(data?.errore || error?.message), 'err'); return; }
  delete _ricNote[id];
  toast(azione === 'approva' ? `Richiesta approvata: disponibilità aggiornata (${data.giorni_aggiornati} giorn${data.giorni_aggiornati === 1 ? 'o' : 'i'})` : 'Richiesta rifiutata', 'ok');
  await loadRichiesteAttesa();
  aggiornaStatoAssenze();
}

function _initFiltriStorico() {
  if (!_ricFiltri.dal) { _ricFiltri.dal = _isoSpost(-90); _ricFiltri.al = _isoSpost(90); }
  document.getElementById('ric-f-dal').value = _ricFiltri.dal;
  document.getElementById('ric-f-al').value = _ricFiltri.al;
  document.getElementById('ric-f-stato').value = _ricFiltri.stato;
  const sel = document.getElementById('ric-f-operatore');
  sel.innerHTML = '<option value="">Tutti gli operatori</option>' + operatoriCache
    .filter(o => o.ruolo === 'operatore').sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''))
    .map(o => `<option value="${escapeHtml(o.id)}"${o.id === _ricFiltri.operatore ? ' selected' : ''}>${escapeHtml(o.cognome)} ${escapeHtml(o.nome)}</option>`).join('');
}

function ricFiltro(chiave, valore) { _ricFiltri[chiave] = valore; loadRichiesteStorico(); }

async function loadRichiesteStorico() {
  const el = document.getElementById('ric-storico-corpo');
  if (!_ricFiltri.dal || !_ricFiltri.al) { el.innerHTML = '<div class="ric-err" style="padding:14px">Indica il periodo (dal/al)</div>'; return; }
  el.innerHTML = '<div style="color:var(--muted);padding:14px">Caricamento…</div>';
  // Tabella che cresce: sempre filtrata per periodo, ordinata su colonna univoca, con limite e conteggio.
  let q = sb.from('richieste_assenza').select(RIC_SELECT, { count: 'exact' })
    .gte('data_inizio', _ricFiltri.dal).lte('data_inizio', _ricFiltri.al);
  if (_ricFiltri.stato) q = q.eq('stato', _ricFiltri.stato);
  if (_ricFiltri.operatore) q = q.eq('operatore_id', _ricFiltri.operatore);
  const { data, error, count } = await q.order('data_inizio', { ascending: false }).order('id').range(0, 499);
  if (error) { el.innerHTML = `<div class="ric-err" style="padding:14px">${escapeHtml(error.message)}</div>`; return; }
  _ricStorico = data || [];
  if (!_ricStorico.length) { el.innerHTML = '<div class="empty-state"><p>Nessuna richiesta nel periodo</p></div>'; return; }
  el.innerHTML = (count > _ricStorico.length ? `<div class="ric-err" style="padding:10px 14px">Mostrate ${_ricStorico.length} richieste su ${count}: restringi il periodo.</div>` : '') + `
    <table><thead><tr><th>Operatore</th><th>Tipo</th><th>Periodo</th><th>Stato</th><th>Deciso da</th><th>Note</th><th></th></tr></thead><tbody>
    ${_ricStorico.map(r => `<tr id="ric-st-${escapeHtml(r.id)}"${r.id === _ricEvidenzia ? ' class="ric-evidenza"' : ''}>
      <td>${escapeHtml(r.operatore?.nome)} ${escapeHtml(r.operatore?.cognome)}</td>
      <td>${r.origine === 'responsabile' ? 'Assenza segnalata' : escapeHtml(r.tipo?.nome)}</td>
      <td style="white-space:nowrap">${escapeHtml(_periodoRic(r))}</td>
      <td><span class="badge badge-${escapeHtml(r.stato)}">${escapeHtml(RIC_STATI[r.stato] || r.stato)}</span></td>
      <td style="font-size:12px">${r.decisore ? `${escapeHtml(r.decisore.nome)} ${escapeHtml(r.decisore.cognome)}<br><span style="color:var(--muted)">${escapeHtml(formatDateTime(r.deciso_il))}</span>` : '—'}</td>
      <td style="font-size:12px;max-width:260px;overflow-wrap:anywhere">${r.nota_operatore ? `<div>Op.: ${escapeHtml(r.nota_operatore)}</div>` : ''}${r.nota_responsabile ? `<div style="color:var(--muted)">Resp.: ${escapeHtml(r.nota_responsabile)}</div>` : ''}</td>
      <td>${r.stato === 'approvata' ? `<button class="btn btn-secondary" style="padding:5px 10px;font-size:12px;white-space:nowrap" onclick="annullaApprovazione('${escapeJsAttr(r.id)}')">Annulla approvazione</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
  if (_ricEvidenzia) { document.getElementById('ric-st-' + _ricEvidenzia)?.scrollIntoView({ block: 'center' }); _ricEvidenzia = null; }
}

async function annullaApprovazione(id) {
  const r = _ricStorico.find(x => x.id === id);
  if (!confirm(`Annullare l'assenza approvata di ${r?.operatore?.nome || ''} ${r?.operatore?.cognome || ''} (${r ? _periodoRic(r) : ''})?\nLa disponibilità torna esattamente com'era prima dell'approvazione.`)) return;
  const { data, error } = await sb.rpc('richiesta_annulla_approvazione', { p_richiesta_id: id, p_nota: null, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(ricErrore(data?.errore || error?.message), 'err'); return; }
  toast(`Approvazione annullata: ${data.giorni_ripristinati} giorn${data.giorni_ripristinati === 1 ? 'o' : 'i'} ripristinat${data.giorni_ripristinati === 1 ? 'o' : 'i'}`, 'ok');
  await loadRichiesteStorico();
  aggiornaStatoAssenze();
}

// ── Segnala assenza (assenza non richiesta: nessun motivo) ──
let _saForm = { operatore: '', dal: '', al: '', ore: false, oi: '', of: '' };
// Scorciatoie per Dal/Al: compilano solo le due date, che restano modificabili. Calcolate con il calendario aziendale (giorni lavorativi e chiusure).
function _saScorciatoie() {
  const oggi = _isoOggi(), giorni = Calendario.giorni();
  const prossimo = giorni.find(g => g > oggi);
  const d = new Date(oggi + 'T12:00:00');
  d.setDate(d.getDate() + (6 - ((d.getDay() + 6) % 7)));            // domenica della settimana corrente
  const domenica = d.toISOString().slice(0, 10);
  const restoSettimana = giorni.filter(g => g >= oggi && g <= domenica);
  const dal = restoSettimana[0] || oggi, al = restoSettimana[restoSettimana.length - 1] || oggi;
  const etich = iso => { const t = new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/\./g, '');
    return t.charAt(0).toUpperCase() + t.slice(1); };
  const voci = [{ testo: 'Oggi', dal: oggi, al: oggi }];
  if (prossimo) voci.push({ testo: `Prossimo giorno lavorativo (${etich(prossimo)})`, dal: prossimo, al: prossimo });
  voci.push({ testo: 'Fino a fine settimana', dal, al });
  return voci;
}
function _saApplicaScorciatoia(i) {
  const v = _saScorciatoie()[i];
  if (!v) return;
  _saSet('dal', v.dal);
  _saSet('al', v.al);
  document.getElementById('sa-dal').value = _saForm.dal;
  document.getElementById('sa-al').value = _saForm.al;
}

// operatoreId opzionale: precompila l'operatore (dalla scheda operatore o dal filtro della scheda Assenze)
function apriSegnalaAssenza(operatoreId) {
  _saForm = { operatore: '', dal: _isoOggi(), al: _isoOggi(), ore: false, oi: '', of: '' };
  document.getElementById('sa-scorciatoie').innerHTML = _saScorciatoie().map((v, i) =>
    `<button type="button" class="btn btn-secondary sa-sc" onclick="_saApplicaScorciatoia(${i})">${escapeHtml(v.testo)}</button>`).join('');
  const sel = document.getElementById('sa-operatore');
  sel.innerHTML = '<option value="">— Scegli —</option>' + operatoriCache
    .filter(o => o.ruolo === 'operatore' && o.attivo && !o.eliminato).sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''))
    .map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.cognome)} ${escapeHtml(o.nome)}</option>`).join('');
  if (typeof operatoreId === 'string' && operatoreId && [...sel.options].some(o => o.value === operatoreId)) { sel.value = operatoreId; _saForm.operatore = operatoreId; }
  document.getElementById('sa-dal').value = _saForm.dal;
  document.getElementById('sa-al').value = _saForm.al;
  document.getElementById('sa-ore').checked = false;
  document.getElementById('sa-ore-riga').hidden = true;
  document.getElementById('sa-oi').value = '';
  document.getElementById('sa-of').value = '';
  document.getElementById('sa-err').textContent = '';
  document.getElementById('modal-segnala-assenza').classList.add('open');
}
function _saSet(campo, valore) {
  _saForm[campo] = valore;
  if (campo === 'ore') {
    document.getElementById('sa-ore-riga').hidden = !valore;
    if (valore) { _saForm.al = _saForm.dal; document.getElementById('sa-al').value = _saForm.dal; }
  }
  if (campo === 'dal' && (_saForm.ore || !_saForm.al || _saForm.al < valore)) { _saForm.al = valore; document.getElementById('sa-al').value = valore; }
}
async function confermaSegnalaAssenza() {
  const err = document.getElementById('sa-err');
  const f = _saForm;
  err.textContent = '';
  if (!f.operatore) { err.textContent = 'Scegli l\'operatore'; return; }
  if (!f.dal || !f.al) { err.textContent = ricErrore('date_mancanti'); return; }
  if (f.ore && (!f.oi || !f.of)) { err.textContent = ricErrore('orario_incompleto'); return; }
  const btn = document.getElementById('sa-conferma');
  btn.disabled = true;
  const { data, error } = await sb.rpc('assenza_segnala', {
    p_operatore_id: f.operatore, p_data_inizio: f.dal, p_data_fine: f.ore ? f.dal : f.al,
    p_ora_inizio: f.ore ? f.oi : null, p_ora_fine: f.ore ? f.of : null,
    p_responsabile_id: currentUserRow.id, p_session_token: null,
  });
  btn.disabled = false;
  if (error || !data?.ok) { err.textContent = ricErrore(data?.errore || error?.message); return; }
  closeModal('modal-segnala-assenza');
  toast(`Assenza registrata: disponibilità aggiornata (${data.giorni_aggiornati} giorn${data.giorni_aggiornati === 1 ? 'o' : 'i'})`, 'ok');
  if (_opsScheda === 'richieste') richiesteVista(_ricVista);
  aggiornaStatoAssenze().then(() => { if (document.getElementById('modal-operatore')?.classList.contains('open')) caricaAssenzeOperatore(f.operatore); });
}

// ── Impostazioni: Tipi di richiesta ──
let _tipiRichiesta = [];
async function loadTipiRichiesta() {
  const { data, error } = await sb.from('tipi_richiesta').select('*').order('posizione').order('id').limit(200);
  const el = document.getElementById('tipi-richiesta-body');
  if (error) { el.innerHTML = `<div class="ric-err">${escapeHtml(error.message)}</div>`; return; }
  _tipiRichiesta = data || [];
  el.innerHTML = _tipiRichiesta.map((t, i) => {
    const id = escapeJsAttr(t.id);
    return `<div class="cfg-riga tipo-ric ${t.attivo ? '' : 'disattivo'}">
      <input type="text" maxlength="40" aria-label="Nome" value="${escapeHtml(t.nome)}" onchange="aggiornaTipoRichiesta('${id}', { nome: this.value.trim() })">
      <select aria-label="Unità" onchange="aggiornaTipoRichiesta('${id}', { unita: this.value })">
        <option value="giorni"${t.unita === 'giorni' ? ' selected' : ''}>A giorni</option>
        <option value="ore"${t.unita === 'ore' ? ' selected' : ''}>A ore</option>
      </select>
      <div class="cfg-azioni">
        <button class="btn btn-secondary" aria-label="Sposta su" ${i === 0 ? 'disabled' : ''} onclick="spostaTipoRichiesta('${id}', -1)">↑</button>
        <button class="btn btn-secondary" aria-label="Sposta giù" ${i === _tipiRichiesta.length - 1 ? 'disabled' : ''} onclick="spostaTipoRichiesta('${id}', 1)">↓</button>
        <button class="btn ${t.attivo ? 'btn-secondary' : 'btn-ok'}" onclick="aggiornaTipoRichiesta('${id}', { attivo: ${!t.attivo} })">${t.attivo ? 'Disattiva' : 'Attiva'}</button>
        <button class="btn btn-danger" aria-label="Elimina" onclick="eliminaTipoRichiesta('${id}')"><i data-ic="cestino"></i></button>
      </div>
      ${t.per_segnalazioni ? '<div class="cfg-opzioni" style="font-size:12px;color:var(--muted)">Usato anche per le assenze segnalate dal responsabile</div>' : ''}
    </div>`;
  }).join('') || '<p style="color:var(--muted)">Nessun tipo.</p>';
}
async function aggiornaTipoRichiesta(id, modifiche) {
  if ('nome' in modifiche && !modifiche.nome) { toast('Il nome non può essere vuoto', 'err'); return loadTipiRichiesta(); }
  const { data, error } = await sb.rpc('salva_tipo_richiesta', { p_id: id, p_dati: modifiche, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast(/duplicate|unique|nome_key/i.test(data?.errore || '') ? 'Esiste già un tipo con questo nome' : 'Errore: ' + (data?.errore || error?.message || ''), 'err');
  else toast('Tipo aggiornato', 'ok');
  await loadTipiRichiesta();
}
async function spostaTipoRichiesta(id, delta) {
  const i = _tipiRichiesta.findIndex(t => t.id === id), j = i + delta;
  if (j < 0 || j >= _tipiRichiesta.length) return;
  const ordine = _tipiRichiesta.slice(); [ordine[i], ordine[j]] = [ordine[j], ordine[i]];
  const { data, error } = await sb.rpc('riordina_config', { p_tabella: 'tipi_richiesta', p_ids_in_ordine: ordine.map(x => x.id), p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) toast('Errore: ' + (data?.errore || error?.message || ''), 'err');
  await loadTipiRichiesta();
}
async function eliminaTipoRichiesta(id) {
  const t = _tipiRichiesta.find(x => x.id === id);
  if (t?.per_segnalazioni) { toast('Questo tipo serve per le assenze segnalate: puoi rinominarlo, non eliminarlo', 'err'); return; }
  if (!confirm(`Eliminare il tipo "${t?.nome}"?`)) return;
  const { data, error } = await sb.rpc('elimina_tipo_richiesta', { p_id: id, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast('Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  toast(data.esito === 'disattivato' ? 'Tipo già usato da richieste: disattivato' : 'Tipo eliminato', 'ok');
  await loadTipiRichiesta();
}
async function aggiungiTipoRichiesta() {
  const nome = document.getElementById('nuovo-tipo-richiesta').value.trim();
  const unita = document.getElementById('nuovo-tipo-unita').value;
  if (!nome) { toast('Scrivi il nome del tipo', 'err'); return; }
  const posizione = Math.max(0, ..._tipiRichiesta.map(t => t.posizione || 0)) + 10;
  const { data, error } = await sb.rpc('salva_tipo_richiesta', { p_id: null, p_dati: { nome, unita, posizione }, p_responsabile_id: currentUserRow.id, p_session_token: null });
  if (error || !data?.ok) { toast(/duplicate|unique|nome_key/i.test(data?.errore || '') ? 'Esiste già un tipo con questo nome' : 'Errore: ' + (data?.errore || error?.message || ''), 'err'); return; }
  document.getElementById('nuovo-tipo-richiesta').value = '';
  toast('Tipo aggiunto', 'ok');
  await loadTipiRichiesta();
}