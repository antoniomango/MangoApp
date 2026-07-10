# MangoApp — Analisi Frontend per Claude con accesso DB

> Documento generato il 2026-07-06.
> Scopo: fornire a un'istanza Claude con accesso al DB Supabase (ma senza codice frontend)
> il contesto tecnico necessario per ragionare su `responsabile.html`, `operatore.html`,
> `ufficio.html` e il loro rapporto con le tabelle e le RPC.

---

## 1. Architettura generale

### Framework e librerie

**Non esiste alcun framework frontend.** Niente Vue, niente React, niente Quasar, niente
build step. Ogni pagina è un singolo file `.html` autocontenuto che include:

- **Supabase JS v2** via CDN:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  ```
- Font Google via `@import`: `Inter` (testo corpo) + `DM Mono` (codici ordine, numeri, dati tabellari)
- Nessun altro framework UI, nessun bundler, nessun TypeScript

### File principali

| File | Ruolo | Righe (~) |
|------|-------|-----------|
| `responsabile.html` | Vista completa per il responsabile (Antonio) | 5205 |
| `operatore.html` | PWA per gli operatori in produzione | 2463 |
| `ufficio.html` | Vista sola-lettura per l'ufficio (Federico) | 736 |
| `sw.js` | Service Worker (network-first) — registrato da operatore + ufficio | — |
| `guida_operatori.html` | Guida statica per operatori | — |
| `stato_progetto.html` | Pagina di stato progetto | — |

`responsabile.html` **non è una PWA** e non registra nessun Service Worker.

### Design System CSS

Variabili `:root` condivise tra tutti i file:

```css
--bg:       #F2EDE6   /* sfondo pagina — avorio caldo */
--surface:  #FDFAF6   /* card, modal */
--border:   #D9CFC4
--wood:     #8B5E3C   /* brand principale — marrone legno */
--wood-lt:  #C4926A   /* variante chiara */
--ink:      #1C1714   /* testo principale */
--muted:    #7A6E65   /* testo secondario */
--ok:       #3A7D44   /* verde successo */
--warn:     #C27B00   /* giallo attenzione */
--alert:    #B03A2E   /* rosso errore */
--phase-bg: #EDE4D8   /* sfondo sezioni fasi */
--info:     #2563EB   /* blu informativo */
```

---

## 2. Layer Supabase — comunicazione con il DB

### Configurazione client

```js
const SUPABASE_URL  = 'https://mtpzfxnyfkzikzlkomwz.supabase.co';
const SUPABASE_ANON = '...'; // JWT anon key
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
```

Il client `sb` è globale e usato direttamente in tutte le funzioni. Non esiste un
layer di astrazione intermedio (niente service class, niente repository pattern).

### Pattern lettura dati

```js
// Lettura diretta con join implicito via foreign key
const { data } = await sb.from('ordine_fasi')
  .select('*, ordini(codice, cliente, stato), fasi(nome)')
  .eq('operatore_id', currentUser.id)
  .in('stato', ['in_corso', 'in_attesa']);
```

- `responsabile.html`: usa `sb.from(...).select(...)` liberamente per leggere tutte le tabelle
- `operatore.html`: idem per lettura, ma tutte le **scritture** avvengono via RPC
- `ufficio.html`: **solo** `sb.from(...).select(...)` + una singola RPC (`verifica_pin`). Zero scritture dirette

### Pattern scrittura (RPC)

Tutte le modifiche al DB che partono da `operatore.html` usano RPC SECURITY DEFINER:

```js
await sb.rpc('prendi_in_carico_fase', {
  p_ordine_fase_id: ordFaseId,
  p_operatore_id:   currentUser.id,
  p_session_token:  sessionToken      // UUID di sessione
});
```

Le RPC di scrittura da `responsabile.html` sono via JWT (ruolo `authenticated`):
```js
await sb.rpc('aggiorna_criteri_fase', {
  p_fase_id:        f.id,
  p_tipi_prodotto:  [...],
  p_materiali:      [...],
  p_strutture:      [...],
  p_responsabile_id: currentUserRow.id
  // p_session_token NON passato — auth via JWT
});
```

### Realtime

`responsabile.html` registra canali Supabase Realtime per ricevere aggiornamenti push
su `ordini`, `ordine_fasi`, `non_conformita`, `notifiche`. L'handler richiama
`loadOrdini()` / `renderDashboard()` al cambio.

---

## 3. Autenticazione e sessioni

### Ruolo `responsabile` (Antonio) — JWT

- Login: `sb.auth.signInWithPassword({ email, password })`
- Supabase emette un JWT con `role = 'authenticated'`
- `currentUserRow` viene caricato da `users` con `.eq('email', currentUser.email)`
- Le RPC di scrittura del responsabile ricevono `p_responsabile_id` (UUID)
- Il DB verifica: `valida_sessione(p_responsabile_id, p_session_token)` + `EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile')`

### Ruolo `operatore` e `sola_lettura` — PIN + session_token

- Login: `sb.rpc('verifica_pin', { p_user_id, p_pin })`
- La RPC restituisce `{ ok: true, user: {...}, session_token: UUID }`
- `sessionToken` viene salvato in `localStorage` via `cacheSet('current-session-token', ...)`
- `currentUser` = `{ id, nome, cognome, ruolo }` (non un oggetto Supabase Auth)
- Tutte le RPC di scrittura ricevono `p_session_token` che il DB valida con `valida_sessione()`
- `controlla_sessione(p_user_id)` viene chiamata al boot per verificare che la sessione non sia scaduta o revocata

### Deviazione `sola_lettura` al login

In `operatore.html`, dopo `verifica_pin`, se `ruolo === 'sola_lettura'`:
```js
localStorage.setItem('ufficio-user', JSON.stringify(currentUser));
// redirect a ufficio.html
```

`ufficio.html` legge `ufficio-user` da localStorage per recuperare l'identità senza
fare un nuovo login.

---

## 4. Convenzioni di denominazione

### Variabili globali in `responsabile.html`

| Nome | Tipo | Contenuto |
|------|------|-----------|
| `currentUser` | oggetto Supabase Auth | `{ email, id }` |
| `currentUserRow` | oggetto DB | `{ id, nome, cognome, email, ruolo, ... }` |
| `fasi` | array | `[{ id, nome, descrizione, posizione, tipo_gestione, e_attesa_esterna, criteri_tipi[], criteri_materiali[], criteri_strutture[] }]` |
| `tipiProdotto` | array | `[{ id, label, posizione }]` |
| `ordiniCache` | array | tutti gli ordini attivi + attesa spedizione + sospesi |
| `ordiniSpeditiCache` | array | ordini spediti (archivio) |
| `operatoriCache` | array | tutti gli utenti con ruolo operatore/sola_lettura |
| `ncCache` | array | non conformità |
| `prioritaConfig` | array | livelli di priorità da `priorita_ordine_config` |
| `attributiConfig` | array | opzioni struttura/materiale da `attributi_prodotto_config` |
| `faseMediaMinutiMap` | oggetto | `{ fase_id → avg_minuti_per_pezzo }` |
| `faseEsternaSet` | Set | IDs fase con `e_attesa_esterna = true` |
| `orarioConfig` | oggetto | `{ ora_inizio, ora_fine, ... }` da `config_orario` |

### Funzioni di load (prefisso `load`)

Fanno fetch dal DB e aggiornano la cache globale. Non renderizzano mai direttamente.

### Funzioni di render (prefisso `render`)

Leggono dalla cache globale e scrivono innerHTML nei DOM element target.

### Modali

Ogni modale è un `<div class="modal-overlay" id="modal-X">`. Si apre con:
```js
document.getElementById('modal-X').classList.add('open');
```
Si chiude con `closeModal('modal-X')` (rimuove la classe `open`).

---

## 5. Sezione "Pianificazione"

### Dove si trova

`<section class="section" id="sec-pianificazione">` — visibile nella nav con il bottone
`📅 Pianificazione`. Attivata da `showSection('pianificazione')`, che chiama internamente
`renderPianificazione()`.

### Funzione principale: `renderPianificazione()`

```js
async function renderPianificazione()
```

**Non ha una sua `loadXxx()` separata**: fa le proprie fetch ad ogni render.

**Dati caricati al momento del render:**

1. Filtra `ordiniCache` per `stato === 'aperto'` → array `attivi`
2. Fetch `ordine_fasi(ordine_id, stato, fase_id)` per tutti gli ID degli ordini attivi
3. Fetch `ordine_fasi(ordine_id, operatore_id, users(nome, cognome))` dove `stato = 'in_corso'` e `operatore_id IS NOT NULL` → per sapere chi sta lavorando su ogni ordine

**Calcolo della stima completamento:**

- `minutiGiorno` calcolato da `orarioConfig.ora_inizio / ora_fine` (default 480)
- `buildEtaFromFasi(attivi, fasiMapPiano)` → `etaPiano[ordine_id]` = minuti ETA residui
  - Usa `faseMediaMinutiMap` (media storica per fase) e `faseEsternaSet` (fasi di attesa esterna)
- `addGiorniLavorativi(new Date(), giorni)` → data stimata completamento (salta weekend)
- `isInRitardo` = oggi > `o.scadenza`
- `isRischio` = non in ritardo ma `stimaStr > o.scadenza`

**Ordinamento degli ordini:**

Quattro gruppi con score 0–3: In ritardo → A rischio → In tempo (con scadenza) → Senza scadenza.
Dentro ogni gruppo, ordinati per data scadenza crescente.

**Rendering:**

Tabella HTML inline (no framework table) con colonne:
`Ordine (codice) | Cliente | Avanz. (barra % + numero) | Scadenza | Stimata | Operatori attivi`

Colori:
- Scadenza in ritardo → `#EF4444` (rosso)
- Stima a rischio → `#B45309` (ambra)
- Stima in tempo → `#16A34A` (verde)

Legenda colorata fissa in cima alla sezione (4 pallini colorati).

**Aggiornamento automatico:**

`refreshStime()` viene chiamato:
- Dopo ogni aggiornamento realtime
- A fine turno lavorativo (`scheduleEndOfShiftRefresh()`) — si ripianifica ogni giorno

```js
if (document.getElementById('sec-pianificazione')?.classList.contains('active')) {
  await renderPianificazione();
}
```
Quindi la Pianificazione viene ricaricata solo se è la sezione visibile.

**Click su riga:**

`onclick="openDettaglioOrdine('${o.id}')"` apre la sezione `sec-dettaglio` con il dettaglio
dell'ordine (stessa funzione usata dalla dashboard).

---

## 6. Configuratore Fasi (`sec-fasi-config`)

### Dove si trova

`<section class="section" id="sec-fasi-config">` — nella nav come "🔧 Fasi".
Attivata da `showSection('fasi-config')`, che chiama `renderFasiConfig()`.

### Dati necessari (già in cache al render)

- `fasi[]` — caricata da `loadFasi()` al boot, include:
  - `id`, `nome`, `descrizione`, `posizione`
  - `tipo_gestione` (`'standard' | 'conferma_ricezione' | 'spedizione_esterna'`)
  - `e_attesa_esterna` (boolean)
  - `criteri_tipi[]` — array di `tipo_prodotto_id`
  - `criteri_materiali[]` — array di `materiale_valore`
  - `criteri_strutture[]` — array di `struttura_valore`
- `tipiProdotto[]` — per le checkbox
- `attributiConfig[]` — opzioni materiale e struttura

**`loadFasi()` esegue 4 query in parallelo:**
```js
sb.from('fasi').select('*, tipo_gestione').order('posizione').order('id')
sb.from('fase_tipi_prodotto').select('fase_id, tipo_prodotto_id')
sb.from('fase_materiali').select('fase_id, materiale_valore')
sb.from('fase_strutture').select('fase_id, struttura_valore')
```
Poi aggrega i criteri per `fase_id` nell'array `fasi`.

### Struttura di ogni riga nella lista

Ogni fase viene renderizzata come `<div class="fase-config-item" id="fase-cfg-row-{id}">`:

1. **Bottoni riordino** (▲ / ▼) — chiamano `spostaFase(id, dir)`
2. **Numero posizione** — `<span class="fase-config-num">` con il numero progressivo (non l'ID)
3. **Input nome** — `<input id="fase-nome-{id}">`
4. **Badge riepilogativo criteri** — "Tutti" (vuoto=tutti) oppure "Solo: Tipo1, Mat2, Stru3"
5. **Input descrizione** — `<input id="fase-desc-{id}">`
6. **Griglia 3 colonne (criteri)**:
   - Colonna 1 — checkbox per ogni `tipo_prodotto` (`data-fase`, `data-tipo`)
   - Colonna 2 — checkbox per ogni opzione materiale (`data-mat`)
   - Colonna 3 — checkbox per ogni opzione struttura (`data-stru`)
   - Semantica "vuoto = tutti": se nessuna checkbox è selezionata, la fase si applica a tutti
7. **Select tipo_gestione** — Standard / Conferma ricezione / Spedizione esterna
8. **Checkbox attesa esterna** — disabilitata automaticamente se `tipo_gestione` ≠ standard
9. **Bottone elimina** (✕) — `eliminaFase(id)`

### Salvataggio — `saveFasiConfig(silent = false)`

Chiamata dal bottone "Salva modifiche" in cima. Per ogni fase, esegue in parallelo:

```js
// 1. Aggiorna nome, descrizione, e_attesa_esterna, tipo_gestione direttamente su 'fasi'
sb.from('fasi').update({...}).eq('id', u.id)

// 2. RPC che gestisce criteri e ricalcolo retroattivo
sb.rpc('aggiorna_criteri_fase', {
  p_fase_id:         u.id,
  p_tipi_prodotto:   u.tipi,    // array di tipo_prodotto_id selezionati
  p_materiali:       u.mats,
  p_strutture:       u.struts,
  p_responsabile_id: currentUserRow.id
  // senza p_session_token — auth via JWT responsabile
})
```

`aggiorna_criteri_fase` (DB):
- Controlla `valida_sessione` + `ruolo = 'responsabile'`
- DELETE+INSERT su `fase_tipi_prodotto`, `fase_materiali`, `fase_strutture`
- Chiama internamente `ricalcola_fase_su_ordini_esistenti` → aggiorna `ordine_fasi.stato` su tutti gli ordini attivi

**Feedback dopo il salvataggio:**
- Toast "Vincoli aggiornati: X attivate, Y disattivate" se ci sono state modifiche retroattive
- Toast "Configurazione fasi salvata" se nessuna modifica ai criteri effettiva

### Riordino fasi — `spostaFase(id, dir)`

1. Chiama `saveFasiConfig(true)` (silent) per preservare i nomi correnti nel form
2. Scambia i valori `posizione` tra la fase corrente e quella adiacente con 2 update diretti su `fasi`
3. Ricarica `loadFasi()` e re-renderizza

### Aggiunta nuova fase — `aggiungiNuovaFase()` / `confermaNuovaFase()`

Modale `modal-nuova-fase` con: nome, descrizione, posizione (dopo quale fase inserire).

Al salvataggio:
- `normalizzaPosizioni()` — riassegna `posizione = 10, 20, 30...`
- Calcola `nuovaPosizione` come media delle due fasi adiacenti
- INSERT su `fasi` con `nextId = MAX(id) + 1` — **l'ID è assegnato lato client**
- Aggiunge la fase come `disponibile` a tutti gli ordini attivi non eliminati

**Attenzione**: i criteri si configurano **dopo** l'inserimento, nella lista principale.

### Eliminazione fase — `eliminaFase(id)`

- Verifica che nessun ordine abbia la fase in stato diverso da `disponibile`/`non_applicabile`
- Se ci sono fasi in lavorazione → blocca con toast di errore
- Altrimenti: delete da `ordine_fasi` (solo stati disponibile/non_applicabile) + delete da `fasi`

### Importazione da Excel

Bottone "📥 Importa da Excel" — `importaFasiDaExcel(input)`.
Formato atteso: colonna A = numero fase (1-20), colonna B = nome, colonna C = descrizione.
Intestazioni vengono ignorate. Aggiorna i campi del form senza salvare immediatamente.

---

## 7. Scheda Operatori (`sec-operatori`)

### Dove si trova

`<section class="section" id="sec-operatori">` — voce "👷 Operatori" nella nav.
Mostra una griglia di card (`<div class="ops-grid" id="ops-grid">`).

### Dati

`operatoriCache` — caricata da `loadOperatori()`:
```js
sb.from('users')
  .select('id, nome, cognome, ruolo, attivo, eliminato')
  .eq('eliminato', false)
  .in('ruolo', ['operatore', 'sola_lettura'])
  .order('nome')
```

### Struttura card operatore — `renderOperatori()`

Per ogni operatore:

```
[Nome Cognome]
[Operatore / Sola Lettura] · [Disattivo se !attivo]

[✏️ Modifica] [Disattiva / Attiva] [⏏ Esci] [🗑]
```

- **Modifica** → `openModalModificaOperatore(id)` → modale `modal-operatore`
- **Disattiva/Attiva** → `toggleOperatore(id, bool)` → `sb.from('users').update({ attivo })`
- **⏏ Esci (Forza logout)** → `forzaLogout(id)` → `sb.from('users').update({ forzato_logout: true })`
  - `operatore.html` al boot controlla `controlla_sessione()` e se `forzato_logout=true` fa logout forzato
- **🗑 Elimina** → `eliminaOperatore(id)` → `sb.from('users').update({ attivo: false, eliminato: true })`
  - È un soft-delete: il record rimane ma `eliminato=true`

### Creazione operatore — `salvaOperatore()`

Il modale `modal-operatore` è condiviso tra creazione e modifica (campo `op-edit-id` vuoto = nuovo).

**Creazione** (via RPC):
```js
sb.rpc('crea_operatore', {
  p_nome, p_cognome, p_pin, p_ruolo, p_responsabile_id: currentUserRow.id
})
```
Il PIN viene hashato nel DB dalla RPC.

**Modifica**:
- Se PIN nuovo: `sb.rpc('aggiorna_pin_operatore', { p_operatore_id, p_nuovo_pin, p_responsabile_id })`
- Dati anagrafici: `sb.from('users').update({ nome, cognome, ruolo })`
  - **Nota**: la colonna `ruolo` è aggiornabile direttamente da `responsabile.html` con ruolo `authenticated`

**Ruoli disponibili nel select:**
- `operatore` — accesso a `operatore.html`, può prendere in carico fasi
- `sola_lettura` — accesso a `ufficio.html` (read-only), oppure in `operatore.html` vede gli ordini senza poter agire

### Cosa NON è presente nella scheda operatore (ma potrebbe aggiungersi)

La sezione attuale non mostra:
- Storico fasi completate dall'operatore
- Fasi attualmente in carico (in_corso)
- Statistiche personali (tempo medio per fase, NC generate)

Questi dati sono disponibili nel DB: `ordine_fasi.operatore_id`, `ordine_fasi_operatori.operatore_id`,
`archivio_log`, `fasi_ordine_extra.operatore_id`.

---

## 8. Vista Operatore (`operatore.html`) — panoramica per contesto

### Struttura state

```js
let currentUser    = null;  // { id, nome, cognome, ruolo } — non Supabase Auth
let sessionToken   = null;  // UUID da verifica_pin, usato in tutte le RPC
let ordiniCache    = [];
let macroFasi      = [];
let isOnline       = navigator.onLine;
```

### Sezioni principali

1. **Home** (`renderHome()`) — "Mie fasi in corso" + lista ordini disponibili
2. **Ordine dettaglio** — fasi standard + fasi extra per un ordine specifico
3. **Notifiche** — push da responsabile

### Comportamento offline

`operatore.html` ha una coda offline (`pendingActions[]`) salvata in `localStorage`.
Quando torna online, esegue le azioni in coda via RPC in sequenza.

### RPC usate da `operatore.html`

| RPC | Trigger |
|-----|---------|
| `verifica_pin` | Login |
| `controlla_sessione` | Boot se già loggato |
| `prendi_in_carico_fase` | Tap "Inizia" su fase standard |
| `completa_fase` | Tap "Completa" su fase standard |
| `riapri_fase_operatore` | Tap "Riapri" (solo se ancora assegnata) |
| `aggiungi_collega_fase` | Aggiunta collega a fase standard |
| `rimuovi_collega_fase` | Rimozione collega |
| `conferma_ricezione_fase` | Conferma ricezione materiale (tipo_gestione=conferma_ricezione) |
| `segna_spedizione_fase` | Segna spedizione esterna (tipo_gestione=spedizione_esterna) |
| `prendi_in_carico_extra` | Inizia fase extra |
| `completa_fase_extra` | Completa fase extra |
| `unisciti_fase_extra` | Aggiungiti a fase extra già avviata |
| `aggiungi_collega_extra` | Aggiunta collega a extra |
| `rimuovi_collega_extra` | Rimozione collega da extra |
| `annulla_presa_in_carico_extra` | Annulla inizio extra |
| `segna_spedizione_extra` | Spedizione esterna extra |
| `conferma_ricezione_extra` | Conferma ricezione extra |
| `segnala_nc` | Segnalazione non conformità |

---

## 9. Vista Ufficio (`ufficio.html`) — sola lettura

### Identità e login

- `operatore.html` → dopo `verifica_pin` con ruolo `sola_lettura` → scrive `localStorage('ufficio-user')` → redirect
- `ufficio.html` legge da localStorage, non fa nessuna chiamata di autenticazione propria
- L'unica RPC presente è `verifica_pin` (linea 312), usata se l'utente fa login direttamente su `ufficio.html`

### Sezioni

1. **Lista produzione** (`lista-view`) — ordini attivi con ricerca real-time
2. **Dettaglio ordine** (`detail-view`) — fasi, avanzamento, nessun bottone azione
3. **Storico spedizioni** (`storico-view`) — ordini spediti nell'anno corrente

### Query storico

Senza filtro `eliminato`: include anche ordini archiviati (`eliminato=true`) via "Esporta e svuota".
```js
.or(
  `and(spedito_il.gte.${anno}-01-01,spedito_il.lt.${anno+1}-01-01),` +
  `and(spedito_il.is.null,completato_il.gte.${anno}-01-01,completato_il.lt.${anno+1}-01-01)`
)
```

---

## 10. Tabelle DB rilevanti (per riferimento)

| Tabella | Uso principale nel frontend |
|---------|-----------------------------|
| `users` | Operatori, responsabile — `operatoriCache`, `currentUserRow` |
| `ordini` | Ordini produzione — `ordiniCache` |
| `fasi` | Fasi standard — `fasi[]` nel configuratore |
| `ordine_fasi` | Stato fase per ogni ordine — avanzamento, in_corso, completata |
| `ordine_fasi_operatori` | Junction per più operatori su una fase |
| `fasi_ordine_extra` | Fasi personalizzate per ordini extra |
| `fase_tipi_prodotto` | Criteri: quali tipi prodotto attivano la fase |
| `fase_materiali` | Criteri: quali materiali attivano la fase |
| `fase_strutture` | Criteri: quali strutture attivano la fase |
| `non_conformita` | NC segnalate dagli operatori |
| `archivio_log` | Log immutabile di tutte le azioni |
| `config_orario` | Orario lavorativo (usato per stime e pianificazione) |
| `priorita_ordine_config` | Livelli di priorità configurabili |
| `attributi_prodotto_config` | Opzioni struttura e materiale |
| `macro_fasi` | Raggruppamenti di fasi per la visualizzazione |
| `notifiche` | Messaggi push responsabile → operatori |

---

## 11. Regole hardcoded — NON toccare senza conferma esplicita

Le seguenti regole in `crea_fasi_per_ordine()` (DB) non devono mai essere modificate:

- **Fase 8** — se `materiale ILIKE '%hdf%'` → `stato = 'non_applicabile'`
- **Fase 9** — se `struttura IN ('barra_l', 'complanare')` → `non_applicabile`; altrimenti `in_attesa` con `iniziata_il = NOW()`
- **Fase 11** — se `struttura IN ('barra_l', 'complanare')` → `non_applicabile`

`ricalcola_fase_su_ordini_esistenti` ha un guard esplicito:
```sql
IF p_fase_id IN (8, 9, 11) THEN
  RETURN jsonb_build_object('ok', true, 'saltato', true, 'motivo', 'fase_con_regola_hardcoded');
END IF;
```

---

## 12. Pattern di sicurezza nelle RPC SECURITY DEFINER

Tutte le RPC che scrivono dati devono avere entrambi questi check (in quest'ordine):

```sql
-- 1. Sessione valida (chiunque con token attivo — anche operatori)
IF NOT valida_sessione(p_responsabile_id, p_session_token) THEN
  RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
END IF;

-- 2. Ruolo corretto (solo per RPC riservate al responsabile)
IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
  RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
END IF;
```

`valida_sessione` restituisce `true` per **qualsiasi** utente con token valido, inclusi
gli operatori. Il secondo check è indispensabile per le RPC riservate.

Tutte le funzioni SECURITY DEFINER hanno `SET search_path TO 'public'`.
