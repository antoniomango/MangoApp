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
  const STATI_RICHIESTA = { in_attesa: 'In attesa', approvata: 'Approvata', rifiutata: 'Non approvata', annullata: 'Annullata' };
  const AZIONI_LOG = {
    ordine_creato: 'Ordine creato', ordine_modificato: 'Ordine modificato', ordine_sospeso: 'Ordine sospeso',
    ordine_riattivato: 'Ordine riattivato', ordine_spedito: 'Ordine spedito',
    fase_iniziata: 'Fase iniziata', fase_completata: 'Fase completata', fase_riassegnata: 'Fase riassegnata',
    fase_messa_in_attesa: 'Fase messa in attesa', fase_ripresa: 'Fase ripresa', fase_confermata_ricezione: 'Ricezione confermata',
    fase_annullata: 'Fase annullata', fase_riaperta: 'Fase riaperta', fase_eliminata: 'Fase eliminata',
    fase_pausa_automatica: 'Pausa automatica a fine turno', nc_segnalata: 'Non conformità segnalata', nc_chiusa: 'Non conformità chiusa',
  };

  let tipi = [];        // [{id, label, posizione}]
  let attributi = [];   // [{chiave, etichetta, tipo, opzioni:[{valore, etichetta, posizione, attivo}], ...}]
  let priorita = [];    // [{id, etichetta, peso, posizione, attivo, colore}]

  function imposta(cat) {
    tipi = cat?.tipi_prodotto || [];
    attributi = cat?.attributi || [];
    priorita = cat?.priorita || [];
  }
  const esporta = () => ({ tipi_prodotto: tipi, attributi, priorita });

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

  return {
    PALETTE, imposta, esporta, carica,
    tipoProdotto, attributo, opzione, struttura, materiale,
    priorita: () => priorita, tipi: () => tipi, attributi: () => attributi,
    prioritaEtichetta, prioritaPeso, confrontaPriorita, colorePriorita, badgePriorita,
    statoOrdine: s => STATI_ORDINE[s] || vuoto(s),
    statoFase: s => STATI_FASE[s] || vuoto(s),
    statoRichiesta: s => STATI_RICHIESTA[s] || vuoto(s),
    azioneLog: a => AZIONI_LOG[a] || a,
    STATI_RICHIESTA,
  };
})();
