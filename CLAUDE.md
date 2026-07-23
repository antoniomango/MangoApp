# MangoApp — Istruzioni permanenti per Claude Code

Questo file viene letto automaticamente da Claude Code all'inizio di ogni sessione avviata in questa repository. Non serve incollarlo nei prompt: le regole qui sotto si applicano sempre, a meno che il prompt specifico non dica esplicitamente il contrario.

## Autonomia

- Lavora nel modo più autonomo possibile: non fermarti a chiedere permesso per comandi terminale/PowerShell né per proseguire tra uno step e l'altro.
- Non assumere mai che un prompt precedente sia già stato eseguito, anche se sembra plausibile — verifica sempre lo stato attuale di codice e database prima di agire.

## Sicurezza — non negoziabile

- Non bypassare, indebolire o rimuovere nessuna misura di sicurezza esistente.
- **Pattern RPC responsabile**: `p_responsabile_id` (uuid) + `p_session_token` opzionale (default NULL) + `valida_sessione(p_responsabile_id, p_session_token)` (per ruolo `responsabile` ritorna sempre true, l'autenticazione reale è delegata al JWT Supabase Auth) + verifica esplicita `EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile')`.
- **Pattern RPC operatore**: `p_operatore_id` + `p_session_token` obbligatorio, validato realmente contro la sessione salvata (login PIN-based).
- **`safeupdate` è attivo** sul ruolo `authenticator`: blocca qualunque `DELETE`/`UPDATE` senza clausola `WHERE` esplicita, anche dentro funzioni `SECURITY DEFINER`. Usa sempre `TRUNCATE` per svuotare tabelle temporanee per intero, mai `DELETE FROM x;` senza `WHERE`.
- **Privilegi per colonna**: quando aggiungi una colonna a una tabella con privilegi per colonna già ristretti (es. `users`), concedi esplicitamente `GRANT SELECT` (e altri pertinenti) agli stessi ruoli delle colonne esistenti. Un bug reale ha rotto l'intera lista operatori per questo motivo.
- Non toccare le regole di business esistenti (es. dipendenze tra fasi, criteri fase_materiali/fase_strutture) senza che il prompt lo richieda esplicitamente.

## Test-first

- Testa ogni scenario sul progetto Supabase di **test** (`kpdlynvmsoctagwtzrxr`) prima di toccare **produzione** (`mtpzfxnyfkzikzlkomwz`). L'app è in uso quotidiano attivo, non deve mai essere interrotta.
- Dopo una sessione di test pesante, verifica gli advisor di sicurezza (RLS, policy) sul progetto di test e conferma che restino allineati alla produzione.
- Se lo schema del progetto di test diverge da quello di produzione, segnalalo esplicitamente invece di procedere come se fossero identici.

## Convenzioni tecniche del frontend

- Nessun framework: tre file HTML autonomi (`responsabile.html`, `operatore.html`, `ufficio.html`), Supabase JS v2 via CDN, DOM manipolato direttamente, variabili globali come cache.
- Convenzione di naming: `loadXxx()` per il fetch dati, `renderXxx()` per il disegno a schermo.
- **Pattern fragile da evitare**: non leggere lo stato di checkbox/form dal DOM al momento del click (`document.querySelectorAll(...):checked`) — se il DOM si ri-renderizza tra la selezione e il click, il salvataggio fallisce silenziosamente. Tieni sempre lo stato in memoria via `onchange`, aggiornato ad ogni interazione.

## Query Supabase su tabelle che crescono nel tempo — regola non derogabile

Bug reale (luglio 2026, produzione): `ufficio.html` e la "Vista Ufficio" interna di `responsabile.html`
(`loadUfficio()`) leggevano `sb.from('ordine_fasi').select(...)` senza filtro su `ordine_id` (in un caso
con un `.in('stato', [...])` che di fatto copriva tutti gli stati possibili, quindi equivaleva a nessun
filtro). Con `ordine_fasi` cresciuta oltre il limite di default "Max Rows" del progetto (Project Settings
→ API), Supabase/PostgREST ha troncato la risposta in silenzio, senza errore — e senza un `.order()`
esplicito il taglio avviene in un punto arbitrario, non alla fine. Risultato visibile: alcuni ordini (es.
ZANETTI L142) mostravano solo 2 fasi su 25 reali nella vista di sola lettura. `loadKpi()` aveva lo stesso
problema in forma più subdola: query storiche filtrate solo per data (`gte('completata_il', ...)`), quindi
a rischio identico ogni volta che il periodo selezionato è ampio ("Ultimo anno"/"Tutto") — con l'aggravante
che lì il dato troncato è una metrica di business, non un elenco visibile a colpo d'occhio.

Regole permanenti:
- Mai una `select()` su `ordine_fasi`, `fasi_ordine_extra`, `archivio_log`, `notifiche`, `allegati` (o
  qualunque tabella che cresce con ogni ordine/evento) senza scoping esplicito (`.eq('ordine_id', ...)`,
  `.in('ordine_id', ids)`, `.eq('operatore_id', ...)`, ecc.) oppure senza paginazione esplicita.
- Se una query DEVE leggere uno storico intero per aggregazioni cross-ordine (KPI, export, ecc.), usa
  `fetchAllRows()` (helper in `responsabile.html`, definito subito prima di `loadKpi()`) che pagina con
  `.range()` finché una pagina torna più corta della page size — mai una `select()` singola non paginata.
- Ogni query paginata con `.range()` richiede un `.order()` su una colonna univoca (es. `id`): senza,
  l'ordine restituito da Postgres non è garantito e la paginazione può saltare o duplicare righe.
- Prima di dichiarare "fatta" una nuova vista/report che legge una tabella storica, controlla quante righe
  ha oggi quella tabella (`select count(*)`) e proietta la crescita nei prossimi mesi — "con pochi dati
  funziona" non è una verifica sufficiente.
- Come rete di sicurezza aggiuntiva (non sostitutiva dello scoping): quando ha senso, passa
  `{ count: 'exact' }` alla `select()` e confronta `count` con `data.length` — se differiscono, la risposta
  è stata troncata e va segnalato (vedi `aggiornaUfficio()` in `ufficio.html` per un esempio).

## Portabilità self-hosting (non urgente, sempre da rispettare)

- Endpoint e configurazioni sempre da variabili d'ambiente, mai hardcoded.
- Evita funzionalità gestite cloud-only senza equivalente self-hosted.
- Autenticazione custom (PIN + session token) invariata, nessuna dipendenza dai meccanismi hosted-only di Supabase Auth.
- Migrazioni sempre pulite e ripetibili da zero.

## Vault Obsidian — obbligatorio ad ogni modifica rilevante

- Per ogni cambiamento rilevante (nuova feature, schema, fix di sicurezza, logica importante — non i fix di una riga), aggiorna le note corrispondenti in "MangoApp-Vault" (cartella sibling al repository, fuori da `docs/`).
- **Ogni nota creata o aggiornata deve includere anche i wikilink necessari** verso le note correlate esistenti (bidirezionali dove ha senso) — non basta scrivere il contenuto isolato. Questo è obbligatorio, non facoltativo: note orfane (senza collegamenti) sono considerate un difetto della modifica, non un dettaglio secondario.
- Rispetta le convenzioni di frontmatter e wikilink già in uso nel vault, non inventarne di nuove.
- Il `docs/` del repository pubblico resta solo per documentazione tecnica non sensibile.

## Job schedulati (pg_cron) e retention dei dati

I job notturni attivi in produzione (`mtpzfxnyfkzikzlkomwz`) al 2026-07-08:

| Job | Schedule | Retention |
|-----|----------|-----------|
| `pulizia-notifiche-lette` | `0 2 * * *` | Elimina notifiche lette > 30 giorni |
| `pulizia-notifiche-non-lette` | `1 2 * * *` | Elimina notifiche non lette > 120 giorni |
| `pulizia-pin-tentativi` | `2 2 * * *` | Elimina tentativi PIN > 24 ore |
| `pulizia-log-cron` | `3 2 * * *` | Elimina `cron.job_run_details` > 7 giorni |
| `alert-ordini-ritardo` | `30 5 * * *` | Invia alert ordini in ritardo |
| `notifica-fine-giornata` | `* * * * *` | Notifica fine turno agli operatori |
| `notifica-reminder-fasi` | `* * * * *` | Reminder fasi aperte > soglia |
| `pausa-automatica-fine-turno` | `* * * * *` | Al termine del turno, mette in pausa le fasi in_corso standard (accumula tempo, logga 'fase_pausa_automatica') |

**Regola non derogabile**: ogni nuovo job schedulato che scrive dati ripetutamente (log, storico, notifiche, audit trail) **deve prevedere fin dalla sua creazione una politica di retention esplicita** — un job di pulizia dedicato oppure una colonna `TTL`. Non farlo causa accumulo silenzioso: `cron.job_run_details` è arrivata a 137 MB in 14 giorni prima che venisse aggiunta la pulizia.

## Al termine di ogni sessione

- Report finale dettagliato di tutto ciò che è stato fatto, testato e verificato.
- Indicazione esplicita se serve un riavvio dell'app o del server.
- Conferma esplicita dell'aggiornamento del vault.
