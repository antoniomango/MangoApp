// js/calendario.js — calendario lavorativo condiviso da responsabile.html, operatore.html e ufficio.html.
//
// Nessuna regola di calendario nel client: "oggi" (nel fuso configurato dall'azienda), la durata della
// giornata tipo e l'elenco dei giorni lavorativi (orario, sabato/domenica, chiusure aziendali, straordinari)
// arrivano dal database (RPC calendario_lavorativo). Il fuso del dispositivo non conta.
// Script classico (come js/config.js): espone l'oggetto globale `Calendario`.
const Calendario = (() => {
  let oggi = null;          // 'YYYY-MM-DD' secondo il fuso aziendale
  let minuti = null;        // minuti netti della giornata tipo (lun-ven)
  let giorni = [];          // ['YYYY-MM-DD', ...] giorni lavorativi da oggi in poi
  let costanti = {};        // costanti di calcolo delle stime (kpi_config): fattore_fase_in_corso, soglie campioni, ...

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function imposta(c) {
    oggi = c?.oggi || null;
    minuti = c?.minuti_giornata ?? null;
    giorni = (c?.giorni || []).map(g => g.data);
    costanti = c?.costanti || {};
  }
  const esporta = () => ({ oggi, minuti_giornata: minuti, giorni: giorni.map(data => ({ data })), costanti });

  // Carica dal database (RPC calendario_lavorativo: sessione PIN per operatore/ufficio, Supabase Auth per il responsabile)
  async function carica(sb, utenteId, sessionToken) {
    const { data } = await sb.rpc('calendario_lavorativo', { p_utente_id: utenteId || null, p_session_token: sessionToken || null, p_giorni: 400 });
    if (data?.ok) { imposta(data); return true; }
    return false;
  }

  // "Oggi" nel fuso aziendale; solo se il calendario non è ancora stato caricato (es. offline al primo avvio) si usa la data del dispositivo
  const oggiIso = () => oggi || iso(new Date());
  // Minuti netti di una giornata tipo; null finché non caricato (i chiamanti mostrano "dati insufficienti", nessun valore inventato)
  const minutiGiorno = () => minuti;

  // Costante di calcolo dalla configurazione (null finché non caricata: il chiamante non inventa valori)
  const costante = chiave => (costanti[chiave] ?? null);

  // N-esimo giorno lavorativo dopo la data indicata (Date o 'YYYY-MM-DD'); restituisce una Date a mezzogiorno
  // (toISOString().split('T')[0] resta sul giorno giusto in qualunque fuso)
  function aggiungiGiorniLavorativi(da, n) {
    const base = typeof da === 'string' ? da : iso(da);
    const d = new Date(base + 'T12:00:00');
    if (!(n > 0)) return d;
    n = Math.min(Math.ceil(n), 2000);   // nessun calendario caricato => giornata "infinita": data lontana, mai un errore
    const futuri = giorni.filter(g => g > base);
    if (futuri.length >= n) return new Date(futuri[n - 1] + 'T12:00:00');
    // oltre l'orizzonte caricato: si prosegue giorno per giorno dall'ultimo noto
    const ultimo = futuri.length ? new Date(futuri[futuri.length - 1] + 'T12:00:00') : d;
    ultimo.setDate(ultimo.getDate() + (n - futuri.length));
    return ultimo;
  }

  return { carica, imposta, esporta, oggiIso, minutiGiorno, costante, aggiungiGiorniLavorativi, giorni: () => giorni };
})();
