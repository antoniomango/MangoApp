// js/etichette.js — fonte unica delle etichette, condivisa da responsabile.html, operatore.html e ufficio.html.
//
// 1) Etichette di CONFIGURAZIONE (tipi prodotto, attributi con le loro opzioni, priorità con colore e peso):
//    lette dal database (RPC config_catalogo) e mai scritte nel codice. Un valore sconosciuto/storico
//    si mostra così com'è, mai un testo inventato.
// 2) Etichette degli STATI DI SISTEMA (stato ordine / fase / richiesta, azioni del registro): enumerazioni
//    chiuse del database, tutte qui, con testi coerenti fra le tre app.
//
// Script classico (come js/config.js): espone l'oggetto globale `Etichette`.
const Etichette = (() => {
  // Palette semantica dei colori di priorità: la configurazione salva solo la chiave,
  // il tema (chiaro/scuro) risolve i token CSS.
  const PALETTE = {
    neutro:  { etichetta: 'Neutro',   bg: 'var(--fill)',         ink: 'var(--ink-2)' },
    verde:   { etichetta: 'Verde',    bg: 'var(--ok-soft)',      ink: 'var(--ok-ink)' },
    azzurro: { etichetta: 'Azzurro',  bg: 'var(--info-soft)',    ink: 'var(--info-ink)' },
    arancio: { etichetta: 'Arancio',  bg: 'var(--urgente-bg)',   ink: 'var(--urgente-ink)' },
    giallo:  { etichetta: 'Giallo',   bg: 'var(--warn-soft)',    ink: 'var(--warn-ink)' },
    rosso:   { etichetta: 'Rosso',    bg: 'var(--alert-soft)',   ink: 'var(--alert-ink)' },
    viola:   { etichetta: 'Viola',    bg: 'var(--violet-soft)',  ink: 'var(--violet-ink)' },
    indaco:  { etichetta: 'Indaco',   bg: 'var(--indigo-soft)',  ink: 'var(--indigo-ink)' },
  };

  const STATI_ORDINE = { aperto: 'Aperto', sospeso: 'Sospeso', spedito: 'Spedito', attesa_spedizione: 'In attesa corriere' };
  const STATI_FASE = { disponibile: 'Disponibile', in_corso: 'In corso', in_attesa: 'In attesa', completata: 'Completata',
                       non_applicabile: 'Non applicabile', bloccata: 'Bloccata', assente: 'Assente' };
  // Piano del giorno: motivi per cui una voce esce dal piano e origine delle voci (enumerazioni chiuse del database)
  const MOTIVI_USCITA_PIANO = { responsabile: 'Tolta da te', non_piu_applicabile: 'Non più applicabile', ordine_non_attivo: 'Ordine non più attivo',
                                macchina_non_disponibile: 'Macchina non disponibile', dipendenza_non_soddisfatta: 'In attesa di una fase precedente' };
  const ORIGINI_VOCE_PIANO = { riempimento: 'riempimento', ricalcolo: 'aggiunta in giornata', responsabile: 'aggiunta a mano' };
  // Tipo di fase (valori del database: standard / conferma_ricezione / spedizione_esterna): [valore, etichetta, spiegazione]
  const TIPI_GESTIONE_FASE = [
    ['standard', 'Interna', 'Lavorata in officina. Usa tempo e macchine.'],
    ['conferma_ricezione', 'Arrivo da fuori', 'Si chiude confermando che il materiale è arrivato.'],
    ['spedizione_esterna', 'Lavorazione esterna', 'Si spedisce e si conferma il rientro. Non usa tempo interno.'],
  ];
  // Macchine: stati (valori del database) e tempo macchina per fase (quanto la macchina resta occupata rispetto al tempo di riferimento).
  // I valori offerti sono qui; un valore salvato diverso si mostra comunque (`fattoreTempoEtichetta`).
  const STATI_MACCHINA = [['attiva', 'Attiva'], ['manutenzione', 'In manutenzione'], ['fuori_uso', 'Fuori uso']];
  const FATTORI_TEMPO_MACCHINA = [[1, 'tempo normale'], [1.5, 'pressa ×1,5'], [2, 'pressa ×2'], [3, 'pressa ×3']];
  const fattoreTempoEtichetta = f => (FATTORI_TEMPO_MACCHINA.find(x => x[0] === Number(f)) || [0, '×' + String(Number(f)).replace('.', ',')])[1];
  const STATI_RICHIESTA = { in_attesa: 'In attesa', approvata: 'Approvata', rifiutata: 'Non approvata', annullata: 'Annullata' };
  const AZIONI_LOG = {
    ordine_creato: 'Ordine creato', ordine_modificato: 'Ordine modificato', ordine_sospeso: 'Ordine sospeso',
    ordine_riattivato: 'Ordine riattivato', ordine_spedito: 'Ordine spedito', ordine_archiviato: 'Ordine archiviato',
    fase_iniziata: 'Fase iniziata', fase_completata: 'Fase completata', fase_riassegnata: 'Fase riassegnata',
    fase_messa_in_attesa: 'Fase messa in attesa', fase_ripresa: 'Fase ripresa', fase_confermata_ricezione: 'Ricezione confermata',
    fase_annullata: 'Fase annullata', fase_riaperta: 'Fase riaperta', fase_eliminata: 'Fase eliminata',
    fase_pausa_automatica: 'Pausa automatica a fine turno', nc_segnalata: 'Non conformità segnalata', nc_chiusa: 'Non conformità chiusa',
  };

  let tipi = [];        // [{id, label, posizione}]
  let attributi = [];   // [{chiave, etichetta, tipo, opzioni:[{valore, etichetta, posizione, attivo}], ...}]
  let priorita = [];    // [{id, etichetta, peso, posizione, attivo, colore}]
  let lati = [];        // [{codice, etichetta, posizione, attivo}] lati dell'anta (etichette configurabili)

  function imposta(cat) {
    tipi = cat?.tipi_prodotto || [];
    attributi = cat?.attributi || [];
    priorita = cat?.priorita || [];
    lati = cat?.lati || [];
  }
  const esporta = () => ({ tipi_prodotto: tipi, attributi, priorita, lati });

  // Carica dal database: RPC config_catalogo (sessione PIN per operatore/ufficio, Supabase Auth per il responsabile).
  async function carica(sb, utenteId, sessionToken) {
    const { data } = await sb.rpc('config_catalogo', { p_utente_id: utenteId || null, p_session_token: sessionToken || null });
    if (data?.ok) { imposta(data); return true; }
    return false;
  }

  const vuoto = v => (v === null || v === undefined || v === '') ? '—' : v;

  function tipoProdotto(id) { const t = tipi.find(x => x.id === id); return t ? t.label : vuoto(id); }
  function attributo(chiave) { return attributi.find(a => a.chiave === chiave) || null; }
  function opzione(chiave, valore) {
    const o = attributo(chiave)?.opzioni.find(x => x.valore === valore);
    return o ? o.etichetta : vuoto(valore);
  }
  const struttura = v => opzione('struttura', v);
  const materiale = v => opzione('materiale', v);

  // Attributi d'ordine aggiuntivi (non colonne di ordini): configurabili dal responsabile, salvati in ordini.attributi
  const attributiCustom = () => attributi.filter(a => !a.su_colonna && a.ambito !== 'lato');
  const attributiLato = () => attributi.filter(a => a.ambito === 'lato');
  const latoEtichetta = codice => lati.find(l => l.codice === codice)?.etichetta || vuoto(codice);
  const latiAttivi = () => lati.filter(l => l.attivo);
  function valoreAttributoCustom(a, valore) {
    if (valore === null || valore === undefined || valore === '') return a.tipo === 'numero' && a.numero_default != null ? String(a.numero_default) : '—';
    return a.tipo === 'numero' ? String(valore) : opzione(a.chiave, String(valore));
  }
  // Elenco {etichetta, valore} degli attributi custom di un ordine, per le schermate di dettaglio
  function attributiOrdine(o) {
    return attributiCustom().filter(a => a.attivo || (o?.attributi || {})[a.chiave] != null)
      .map(a => ({ chiave: a.chiave, etichetta: a.etichetta, valore: valoreAttributoCustom(a, (o?.attributi || {})[a.chiave]) }));
  }

  // Valori per lato di un ordine: attributi_lato [{lato, lato_etichetta, chiave, valore}] (ordini nuovi e migrati), con fallback
  // alla colonna storica. Restituisce [{chiave, etichetta, valori:[{lato, lato_etichetta, valore, testo}]}].
  function valoriLatoOrdine(o) {
    const righe = o?.attributi_lato || [];
    return attributiLato().filter(a => a.attivo || righe.some(r => r.chiave === a.chiave) || (a.su_colonna && o?.[a.chiave]))
      .map(a => {
        let valori = righe.filter(r => r.chiave === a.chiave).map(r => ({ lato: r.lato, lato_etichetta: latoEtichetta(r.lato), valore: r.valore }));
        if (!valori.length && a.su_colonna && o?.[a.chiave]) valori = [{ lato: null, lato_etichetta: null, valore: o[a.chiave] }];
        return { chiave: a.chiave, etichetta: a.etichetta,
          valori: valori.map(v => ({ ...v, testo: a.tipo === 'numero' ? String(v.valore) : opzione(a.chiave, v.valore) })) };
      }).filter(x => x.valori.length);
  }
  // Testo breve per elenchi/export: "HDF" se uguale su tutti i lati, altrimenti "Lato interno: HDF · Lato esterno: Placcato"
  function riepilogoLato(o, chiave) {
    const x = valoriLatoOrdine(o).find(y => y.chiave === chiave);
    if (!x) return '—';
    const tutti = new Set(x.valori.map(v => v.testo));
    return (tutti.size === 1 || x.valori.every(v => !v.lato)) ? x.valori[0].testo : x.valori.map(v => v.lato_etichetta + ': ' + v.testo).join(' · ');
  }
  // Lavorazioni CNC dell'ordine: [{nome, ambito, lati, testo}] ("Doghe — Lato esterno"); per gli ordini vecchi la lavorazione combinata storica
  function lavorazioniCncOrdine(o, nomeStorica) {
    const v = (o?.lavorazioni_cnc || []).map(l => ({ nome: l.nome, ambito: l.ambito, lati: l.lati_etichette || [], testo: l.ambito === 'lato' ? l.nome + ' — ' + (l.lati_etichette || []).join(' + ') : l.nome }));
    if (!v.length && o?.lavorazione_cnc_id && nomeStorica) v.push({ nome: nomeStorica, ambito: 'anta', lati: [], testo: nomeStorica });
    return v;
  }

  function prio(id) { return priorita.find(p => p.id === id) || null; }
  const prioritaEtichetta = id => prio(id)?.etichetta || vuoto(id);
  const prioritaPeso = id => prio(id)?.peso ?? 0;
  // Ordinamento: priorità più alta (peso maggiore) per prima
  const confrontaPriorita = (a, b) => prioritaPeso(b) - prioritaPeso(a);
  const colorePriorita = id => PALETTE[prio(id)?.colore] || PALETTE.neutro;
  function badgePriorita(id) {
    const c = colorePriorita(id);
    const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    return `<span class="badge" style="background:${c.bg};color:${c.ink}">${esc(prioritaEtichetta(id))}</span>`;
  }

  // Ricezioni, data limite di arrivo e badge "Urgente": tutti i testi stanno qui (app operatore e pagina responsabile)
  const ATTESA_ESTERNA = {
    titolo: 'In attesa esterna', urgente: 'Urgente', nonStimabile: 'Non stimabile', senzaScadenza: '—',
    motivi: { oltre_orizzonte: "il lavoro non finisce entro l'orizzonte della simulazione" },
  };
  const _GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const dataBreve = iso => { if (!iso) return '—'; const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return _GIORNI_BREVI[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
  const minutiTesto = m => { const n = Math.round(Number(m) || 0); return n >= 90 ? Math.floor(n / 60) + ' h ' + String(n % 60).padStart(2, '0') : n + ' min'; };
  const _elencoMacchine = ip => ip.length === 1 ? ip[0] : ip.slice(0, -1).join(', ') + ' e ' + ip[ip.length - 1];
  const _avvisoMacchine = ip => '⚠ Stima fatta come se ' + _elencoMacchine(ip) + (ip.length === 1 ? ' funzionasse' : ' funzionassero') + ': se restano ferme, la data va anticipata';

  // ── App operatore: pannello "Ricevi materiale" ──
  const RICEZIONE = {
    gruppoUrgenti: 'Serve per lavorare', gruppoAltro: 'Altro in arrivo',
    materiale: r => r.materiale || r.fase_nome || '',
    sotto: r => 'per ' + (r.codice || '') + ' — ' + (r.cliente || ''),
    quandoArriva: r => (r.urgente && (r.sblocca || []).length) ? 'Quando arriva si potrà fare: ' + r.sblocca.join(', ') : '',
    pulsante: r => '✓ ' + (r.tipo === 'rientro' ? 'Conferma rientro ' + (r.materiale || r.fase_nome || '') : 'Conferma arrivo ' + String(r.materiale || r.fase_nome || '').toLowerCase()),
    conferma: r => 'Confermi che è ' + (r.tipo === 'rientro' ? 'rientrato' : 'arrivato') + ' il materiale «' + (r.materiale || r.fase_nome || '') + '» per ' + (r.codice || '') + ' (' + (r.cliente || '') + ')?',
    toast: r => (r.tipo === 'rientro' ? 'Rientro' : 'Arrivo') + ' di «' + (r.materiale || r.fase_nome || '') + '» confermato per ' + (r.codice || ''),
    cercabile: r => [r.cliente, r.codice, r.materiale, r.fase_nome].filter(Boolean).join(' ').toLowerCase(),
  };

  // ── Pagina responsabile: riquadro "In attesa esterna" ──
  // Verdetto (cosa fare) → perché → avvertenze. oggiIso = giorno di oggi (yyyy-mm-dd).
  function limiteArrivoTesti(r, oggiIso) {
    const mat = r.materiale || r.fase_nome || '';
    const dl = String(r.data_limite || '').slice(0, 10);
    const ms = new Date(oggiIso + 'T12:00:00').getTime() + 86400000; const dd = new Date(ms);
    const domani = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0');
    const entro = dl === oggiIso ? 'oggi' : dl === domani ? 'domani' : dataBreve(dl);
    const t = { stato: r.stato_limite, tono: 'neutro', badge: '—', principale: '', esito: '', perche: '', avvertenze: [] };
    const ip = r.macchine_ipotizzate_attive || [];
    if (r.stato_limite === 'in_ritardo') {
      t.tono = 'alert'; t.badge = 'In ritardo di ' + Math.abs(r.giorni_lavorativi_mancanti || 0) + ' g';
      t.principale = 'Sollecita subito: ' + mat + ' doveva arrivare entro ' + dataBreve(dl);
      if (r.fine_prevista_se_arriva_oggi) {
        t.esito = 'Anche arrivando oggi, ' + (r.codice || "l'ordine") + ' sarebbe pronto ' + dataBreve(r.fine_prevista_se_arriva_oggi)
          + (r.esito_spedizione === 'dopo_spedizione' ? ', dopo la spedizione del ' + dataBreve(r.scadenza)
             : r.esito_spedizione === 'appena_in_tempo' ? ', appena in tempo per la spedizione del ' + dataBreve(r.scadenza)
             : r.esito_spedizione === 'in_tempo' ? ', in tempo per la spedizione del ' + dataBreve(r.scadenza) : '');
      }
    } else if (r.stato_limite === 'in_scadenza' || r.stato_limite === 'ok') {
      const sc = r.stato_limite === 'in_scadenza';
      t.tono = sc ? 'warn' : 'neutro'; t.badge = sc ? 'Da sollecitare' : 'Nessun sollecito';
      t.principale = (sc ? 'Sollecita il fornitore: ' + mat + ' deve arrivare entro ' + entro : 'Nessun sollecito per ora: ' + mat + ' deve arrivare entro ' + dataBreve(dl));
      t.esito = 'Se arriva entro ' + dataBreve(dl) + ', ' + (r.codice || "l'ordine") + ' è pronto per la spedizione di ' + dataBreve(r.scadenza);
    } else if (r.stato_limite === 'non_stimabile') {
      t.badge = ATTESA_ESTERNA.nonStimabile; t.principale = 'Impossibile stimare: ' + (ATTESA_ESTERNA.motivi[r.motivo] || 'dati insufficienti');
    } else {
      t.badge = ATTESA_ESTERNA.senzaScadenza; t.principale = 'Ordine senza data di spedizione: impossibile calcolare';
    }
    if ('fasi_dopo' in r && r.stato_limite !== 'non_stimabile' && r.stato_limite !== 'senza_scadenza') {
      const n = r.fasi_dopo || 0, g = r.giorni_necessari || 0, m = r.margine_giorni || 0;
      t.perche = n ? "Perché: dopo l'arrivo " + (n === 1 ? 'resta 1 fase' : 'restano ' + n + ' fasi') + ' (' + minutiTesto(r.minuti_dopo) + ' di lavoro); con gli altri ordini in coda '
                     + (g === 1 ? 'serve 1 giorno lavorativo' : 'servono ' + g + ' giorni lavorativi') + (m > 0 ? ', più ' + m + (m === 1 ? ' giorno' : ' giorni') + ' di margine' : '')
                 : "Perché: dopo l'arrivo non restano fasi interne da fare" + (m > 0 ? ', più ' + m + (m === 1 ? ' giorno' : ' giorni') + ' di margine' : '');
    }
    if (ip.length) t.avvertenze.push(_avvisoMacchine(ip));
    if (r.rientro_ipotizzato) t.avvertenze.push('⚠ Si è ipotizzato che la lavorazione esterna rientri il giorno dopo la spedizione');
    return t;
  }
  // Riepilogo in cima al riquadro: "Da sollecitare: 3 (di cui 1 in ritardo)"
  function riepilogoSolleciti(lista) {
    const rit = lista.filter(r => r.stato_limite === 'in_ritardo').length, sc = lista.filter(r => r.stato_limite === 'in_scadenza').length;
    return rit + sc ? 'Da sollecitare: ' + (rit + sc) + (rit ? ' (di cui ' + rit + ' in ritardo)' : '') : '';
  }
  // Motivo per cui un ordine è "a rischio" (da rischio_ordini): prima l'esito, poi le avvertenze sulle macchine ipotizzate
  function rischioTesto(r, scadenzaIso) {
    if (!r) return '';
    const sc = scadenzaIso ? dataBreve(scadenzaIso) : '';
    let t = r.motivo === 'scadenza_passata' ? 'Rischia di non essere pronto' + (sc ? ': la spedizione era prevista ' + sc : '') + ' e c’è ancora lavoro da fare'
          : r.motivo === 'oltre_orizzonte' ? 'Rischia di non essere pronto' + (sc ? ' per la spedizione di ' + sc : '') + ": il lavoro non finisce entro l'orizzonte della simulazione"
          : 'Rischia di non essere pronto' + (sc ? ' per la spedizione di ' + sc : '') + ': finirebbe ' + dataBreve(r.fine_prevista);
    const ip = r.macchine_ipotizzate || [];
    if (ip.length) t += ' · ' + _avvisoMacchine(ip);
    return t;
  }

  return {
    attesaEsterna: ATTESA_ESTERNA, ricezione: RICEZIONE, limiteArrivoTesti, riepilogoSolleciti, rischioTesto, dataBreve, minutiTesto,
    PALETTE, imposta, esporta, carica,
    tipoProdotto, attributo, opzione, struttura, materiale, attributiCustom, attributiLato, latoEtichetta, latiAttivi, valoriLatoOrdine, riepilogoLato, lavorazioniCncOrdine, valoreAttributoCustom, attributiOrdine,
    priorita: () => priorita, lati: () => lati, tipi: () => tipi, attributi: () => attributi,
    prioritaEtichetta, prioritaPeso, confrontaPriorita, colorePriorita, badgePriorita,
    statoOrdine: s => STATI_ORDINE[s] || vuoto(s),
    statoFase: s => STATI_FASE[s] || vuoto(s),
    statoRichiesta: s => STATI_RICHIESTA[s] || vuoto(s),
    azioneLog: a => AZIONI_LOG[a] || a,
    tipiGestioneFase: () => TIPI_GESTIONE_FASE,
    statiMacchina: () => STATI_MACCHINA,
    statoMacchina: s => (STATI_MACCHINA.find(x => x[0] === s) || [s, s])[1],
    fattoriTempoMacchina: () => FATTORI_TEMPO_MACCHINA,
    fattoreTempoEtichetta,
    motivoUscitaPiano: m => MOTIVI_USCITA_PIANO[m] || vuoto(m),
    origineVocePiano: o => ORIGINI_VOCE_PIANO[o] || '',
    STATI_RICHIESTA,
  };
})();
