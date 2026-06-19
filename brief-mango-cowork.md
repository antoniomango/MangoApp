# BRIEF PROGETTO — Sistema Gestione Produzione Mango Srl

## Contesto

Mango Srl è un'azienda manifatturiera nel settore legno/arredamento. Produce portoncini e pannelli in 4 varianti strutturali: **4 Lati**, **Barra ad L**, **Complanare**, **Battente**. Il processo produttivo standard prevede **16 fasi fisse** per ogni ordine.

Attualmente la produzione è tracciata con un file Excel + macro VBA (funzionante, testato con dati reali). L'obiettivo di questo progetto è **sostituirlo** con un sistema web moderno, accessibile da PC (per il responsabile produzione) e da smartphone (per gli operatori in officina), con dati sincronizzati in tempo reale.

Il committente è il Responsabile Produzione. Vuole anche usare questo progetto come asset dimostrabile (track record di efficienza, riduzione non conformità) per una futura trattativa salariale interna.

---

## Stack tecnologico richiesto

- **Frontend**: HTML/CSS/JS — due interfacce distinte (dashboard PC responsabile, app mobile operatore/sola lettura). Vanno bene anche React se più comodo per la gestione dello stato, purché il risultato finale sia eseguibile come web app.
- **Database**: **Supabase** (PostgreSQL gestito, piano gratuito) — scelto per: realtime nativo (sync sotto 1 secondo tra dispositivi), nessun server da mantenere, dati esportabili, scalabile in futuro.
- **Autenticazione**:
  - Responsabile → email + password (Supabase Auth standard)
  - Operatori e profilo sola lettura → selezione nome da lista + **PIN a 4 cifre** (va implementato come logica custom sopra Supabase, non auth standard, perché deve essere rapidissimo da smartphone)
- **Notifiche push**: solo verso il responsabile, per ora. Valutare Supabase Realtime + servizio gratuito tipo OneSignal se serve push native fuori dal browser; altrimenti notifiche in-app sono sufficienti per la v1.
- **Offline support**: l'app mobile operatore deve continuare a funzionare senza connessione (lettura dati già caricati + azioni in coda) e sincronizzare automaticamente al ritorno della rete. Da implementare con una coda locale (es. IndexedDB) che si scarica su Supabase alla riconnessione.

---

## Utenti e livelli di accesso

Massimo **10 operatori** totali nel sistema. Tre ruoli:

### 1. Responsabile (1 utente — il committente)
- Accesso completo da PC (vista principale) e da smartphone (vista secondaria, più snella, per quando è fuori ufficio)
- Unico ruolo che può: creare/eliminare ordini, sospendere/riattivare ordini, riassegnare una fase bloccata a un altro operatore, gestire profili operatori, approvare/chiudere NC, vedere l'archivio, esportare dati

### 2. Operatore (fino a 10)
- Login con PIN da smartphone
- Vede: tutti gli ordini aperti (non solo "suoi" — **nessuna assegnazione fissa, chiunque può lavorare su qualsiasi ordine**)
- Può: prendere in carico una fase libera, completarla, aggiungere note e foto sulla fase che sta lavorando, segnalare NC
- Non può: vedere note/foto come editabili su fasi che non sta lavorando lui (solo lettura), sospendere ordini, eliminare nulla, riassegnare fasi prese da altri

### 3. Sola lettura (titolare + persona in ufficio, profili dedicati)
- Login con PIN da smartphone (o accesso da PC, indifferente)
- Vede: tutti gli ordini aperti e la fase attuale di ciascuno, in tempo reale
- Nessuna azione possibile, nessun pulsante attivo

---

## Regola chiave: gestione delle fasi (logica di "lock")

Questa è la logica più delicata del sistema, va implementata con attenzione:

1. Ogni ordine ha **16 fasi fisse** (sempre le stesse, tabella di riferimento condivisa — vedi sotto i nomi placeholder)
2. Stato di una fase: **disponibile** → **in_corso** → **completata**
3. Quando un operatore apre una fase disponibile e la prende in carico, la fase passa a **in_corso** e si "blocca" per lui: nessun altro operatore può toccarla, la vedono come "in corso — [nome operatore]"
4. Solo il **responsabile** può forzare la riassegnazione di una fase bloccata a un altro operatore (caso d'uso: l'operatore che la stava lavorando si ferma per qualsiasi motivo e non puo continuare)
5. Ogni fase ha due campi note distinti: **note del responsabile** (scritte di solito alla creazione ordine, ma modificabili anche in corso d'opera per segnalare problemi/istruzioni) e **note dell'operatore** (scritte da chi lavora la fase). Chi sta per iniziare una fase deve vedere le note del responsabile prima di prenderla in carico
6. Ogni fase permette di allegare **foto** (caricate dall'operatore mentre la lavora)
7. **Nessuna fase custom**: il sistema gestisce solo le 16 fasi standard, niente fasi aggiuntive per ordine

---

## Regola chiave: ciclo di vita di un ordine

```
CREATO (dal responsabile, da PC)
   ↓
APERTO → le fasi vengono lavorate progressivamente dagli operatori
   ↓ (in qualsiasi momento, solo dal responsabile)
SOSPESO → nessuno può lavorarci finché non viene riattivato dal responsabile
   ↓
APERTO (riattivato)
   ↓ (quando l'operatore segna la spedizione)
SPEDITO → l'ordine si sposta AUTOMATICAMENTE in ARCHIVIO
```

Note importanti:
- La spedizione la segna **l'operatore** (non il responsabile), tipicamente dopo la fase 16
- Il passaggio in archivio è automatico, non richiede azione manuale del responsabile
- L'archivio è in **sola lettura**, contiene lo storico completo (fasi, tempi, note, foto, NC) di ogni ordine spedito
- L'archivio è esportabile in **CSV/Excel** dal PC, filtrabile per periodo/cliente/tipologia

---

## Regola chiave: Non Conformità (NC)

1. L'operatore segnala una NC da smartphone: seleziona ordine, seleziona fase, scrive descrizione, allega foto opzionale
2. Alla creazione di una NC, parte una **notifica al responsabile** (in-app, eventualmente push)
3. Solo il **responsabile** può approvare/chiudere una NC, anche dal suo smartphone — non solo da PC
4. Una NC chiusa richiede una nota di chiusura
5. Stati NC: **aperta → approvata/gestita → chiusa**

---

## Notifiche (solo verso il responsabile, per ora)

Eventi che generano notifica:
- Nuova NC segnalata
- Ordine urgente in ritardo rispetto alla scadenza

Le notifiche vanno registrate in tabella (storico consultabile) e mostrate come badge/contatore non letto nell'interfaccia PC e mobile del responsabile.

---

## Struttura database Supabase (8 tabelle)

### `users`
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| nome | text | |
| cognome | text | |
| pin | text | **criptato/hashato**, non in chiaro — usato solo per operatore e sola_lettura |
| email | text | solo per responsabile, usato con Supabase Auth |
| ruolo | enum | `responsabile` \| `operatore` \| `sola_lettura` |
| attivo | boolean | per disattivare un profilo senza eliminarlo |
| creato_il | timestamp | |

### `ordini`
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| codice | text | es. MNG-0041, generato automaticamente in sequenza |
| cliente | text | |
| tipologia | enum | `4_lati` \| `barra_l` \| `complanare` \| `battente` |
| priorita | enum | `normale` \| `urgente` \| `extra_urgente` |
| scadenza | date | |
| stato | enum | `aperto` \| `sospeso` \| `spedito` |
| note_generali | text | |
| creato_da | FK → users.id | |
| creato_il | timestamp | |
| spedito_il | timestamp | nullable, popolato alla spedizione |

### `fasi`
16 righe a numero fisso (l'ordine 1→16 non cambia, perché `ordine_fasi` e tutta la logica di sequenza si basano su quel numero), ma **nome e descrizione devono essere editabili da interfaccia, senza intervenire sul codice**.
| campo | tipo | note |
|---|---|---|
| id | int | 1 → 16, ordine fisso, non editabile |
| nome | text | **editabile da interfaccia** (es. Taglio, Piallatura...) |
| descrizione | text | **editabile da interfaccia**, opzionale |

> ⚠️ **I nomi delle 16 fasi usati nei prototipi HTML sono placeholder inventati** (Taglio, Piallatura, Fresatura, CNC, Incollaggio, Pressatura, Carteggiatura, Primer, Colorazione, Verniciatura, Asciugatura, Assemblaggio, Guarnizioni, Ferramenta, Controllo QC, Imballaggio). Vanno usati solo come valori iniziali di popolamento — il responsabile potrà poi rinominarli in qualsiasi momento dalla schermata "Configurazione Fasi" (vedi sotto), senza bisogno di richiedere modifiche al codice.

**Requisito di progettazione importante**: in tutta l'interfaccia (dashboard, dettaglio ordine, app mobile, modulo di ricognizione) i nomi delle fasi vanno sempre letti dinamicamente dalla tabella `fasi`, mai scritti come testo fisso ("hardcoded") da nessuna parte nel codice. Questo garantisce che un cambio di nome fatto dal responsabile si propaghi ovunque automaticamente.

### `ordine_fasi`
Tabella più critica — lo stato in tempo reale di ogni fase per ogni ordine.
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| ordine_id | FK → ordini.id | |
| fase_id | FK → fasi.id | |
| stato | enum | `disponibile` \| `in_corso` \| `completata` |
| operatore_id | FK → users.id | nullable, chi ha in carico/ha completato la fase |
| iniziata_il | timestamp | nullable |
| completata_il | timestamp | nullable |
| note_responsabile | text | visibile prima di iniziare la fase |
| note_operatore | text | scritta da chi lavora la fase |

> Alla creazione di un ordine, vanno generate automaticamente 16 righe in questa tabella (una per fase), tutte con stato `disponibile` tranne la prima eventualmente, secondo la logica che preferite (sequenziale o libera — da chiarire in fase di sviluppo se le fasi vanno fatte in ordine stretto o possono essere prese in ordine diverso).

### `allegati`
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| ordine_fase_id | FK → ordine_fasi.id | |
| url_file | text | path su Supabase Storage |
| caricato_da | FK → users.id | |
| caricato_il | timestamp | |

### `non_conformita`
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| ordine_id | FK → ordini.id | |
| fase_id | FK → fasi.id | |
| descrizione | text | |
| foto_url | text | nullable |
| segnalata_da | FK → users.id | |
| segnalata_il | timestamp | |
| stato | enum | `aperta` \| `approvata` \| `chiusa` |
| gestita_da | FK → users.id | nullable, sempre il responsabile |
| gestita_il | timestamp | nullable |
| note_chiusura | text | nullable |

### `notifiche`
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| destinatario_id | FK → users.id | per ora sempre il responsabile |
| tipo | enum | `nc_segnalata` \| `ordine_in_ritardo` \| `fase_riassegnata` |
| testo | text | |
| ordine_id | FK → ordini.id | nullable |
| letta | boolean | default false |
| creata_il | timestamp | |

### `archivio_log`
Log immutabile, solo scrittura (append-only) — mai update/delete. Base per le statistiche di efficienza.
| campo | tipo | note |
|---|---|---|
| id | uuid/serial | PK |
| ordine_id | FK → ordini.id | |
| fase_id | FK → fasi.id | nullable |
| utente_id | FK → users.id | |
| azione | enum | `fase_iniziata` \| `fase_completata` \| `fase_riassegnata` \| `nc_segnalata` \| `nc_chiusa` \| `ordine_sospeso` \| `ordine_riattivato` \| `ordine_spedito` |
| timestamp | timestamp | |
| dettaglio | text/jsonb | testo libero o snapshot dati per contesto |

---

## Schermate richieste — Vista Responsabile (PC)

1. **Login** — email + password
2. **Dashboard** — KPI realtime (ordini aperti, in ritardo, completati settimana, NC aperte), lista ordini attivi con stato fasi a colpo d'occhio, notifiche non lette in evidenza
3. **Ordini** — lista ordini aperti/sospesi, crea nuovo, filtra per prioritá/tipologia/scadenza, sospendi/riattiva
4. **Dettaglio ordine** — dati ordine, le 16 fasi con stato/operatore/tempi/note/foto, log completo, riassegna fase, segnala NC, segna come spedito (anche se normalmente lo fa l'operatore, va previsto che il responsabile possa farlo se serve)
5. **Non Conformità** — lista NC aperte, apri/approva/chiudi con nota
6. **Operatori** — crea/gestisci profili, assegna PIN e ruolo, attiva/disattiva, vedi chi è online e su quale fase in questo momento
7. **Archivio** — solo ordini spediti, filtrabile per periodo/cliente/tipologia, esportabile CSV/Excel
8. **Notifiche** — storico notifiche lette/non lette
9. **Configurazione Fasi** — elenco delle 16 fasi standard, ognuna rinominabile e con descrizione editabile in qualsiasi momento. Le modifiche si riflettono immediatamente ovunque nel sistema (PC, mobile, ricognizione), perché tutta l'interfaccia legge i nomi da questa tabella e non li ha mai scritti fissi nel codice

## Schermate richieste — Vista Operatore (Mobile)

1. **Login** — selezione nome da lista + PIN 4 cifre
2. **Home** — ordini con fase in corso assegnata a lui, ordini con fasi disponibili da prendere in carico, accesso rapido a "segnala NC"
3. **Dettaglio ordine** — stato e priorità, le 16 fasi (stato visivo), fase attuale con note del responsabile visibili prima di iniziare, pulsante "Prendi in carico" (se libera) o "Completa fase" (se sua), campo nota + upload foto sulla fase che sta lavorando, pulsante "Segna come spedito" (visibile solo su fase 16 completata)
4. **Segnala NC** — seleziona ordine, seleziona fase, descrizione, foto opzionale, invia
5. **Le mie attività** — storico personale: fasi completate, tempi, ordini lavorati (solo i suoi dati)

## Schermate richieste — Vista Sola Lettura (Mobile, eventualmente anche PC)

1. **Login** — PIN
2. **Lista ordini aperti** — fase attuale, stato, priorità, aggiornamento realtime, nessun pulsante/azione, eventualmente filtro per cliente/priorità

---

## Funzionalità trasversali

- **Realtime**: ogni cambiamento di stato (fase avanzata, NC segnalata, ordine sospeso...) deve propagarsi a tutti i dispositivi connessi entro ~1 secondo, senza bisogno di refresh manuale
- **Offline-first sull'app operatore**: se l'operatore è in un'area dell'officina senza rete, deve poter comunque prendere in carico/completare una fase, scrivere note, scattare foto — tutto va in coda locale e si sincronizza alla riconnessione
- **Ricognizione esportabile da smartphone**: generabile come PDF o schermata condivisibile (sostituisce il modulo di ricognizione cartaceo attualmente usato)
- **Audit trail completo**: `archivio_log` non si modifica mai, serve da base dati oggettiva per dimostrare efficienza/riduzione NC nel tempo (uso strategico: trattativa salariale del responsabile)

---

## Cosa NON è richiesto in questa fase

- Nessuna gestione di fasi custom per ordine (le 16 fasi sono fisse per tutti)
- Nessuna assegnazione preventiva di operatori a ordini specifici (modello "chiunque può prendere in carico qualsiasi fase disponibile")
- Nessuna logica di coda/prenotazione per la CNC (l'app traccia l'avanzamento, non coordina l'accesso alla macchina)
- Nessuna notifica verso gli operatori (per ora solo il responsabile riceve notifiche)
- Nessun livello di accesso intermedio oltre ai 3 definiti (responsabile, operatore, sola lettura)

---

## Materiali di partenza disponibili

Nella cartella di lavoro sono presenti due prototipi HTML statici già validati visivamente dal committente, utili come riferimento di stile e layout (palette legno/ambra, font Inter + DM Mono):
- `mango-produzione.html` — Mockup dashboard PC responsabile (KPI, tabella ordini, modale nuovo ordine, card operatori/NC)
- `mango-mobile.html` — Mockup app mobile operatore (home, dettaglio ordine con fasi, azioni rapide, NC)

Questi file sono solo riferimenti di interfaccia (dati finti, nessuna logica reale, nessun collegamento a database) — vanno presi come base di stile da evolvere, non da considerare come codice di produzione.

---

## Ordine di sviluppo suggerito

1. Setup progetto Supabase + creazione delle 8 tabelle con relazioni e RLS (Row Level Security) per i 3 ruoli — popolare `fasi` con i 16 nomi placeholder indicati sopra come valori di partenza, editabili in seguito
2. Vista Responsabile PC (autenticazione email/password, dashboard, ordini, dettaglio ordine, operatori, NC, archivio, notifiche, configurazione fasi)
3. Vista Operatore mobile (autenticazione PIN, home, dettaglio ordine con lock delle fasi, NC, attività personali)
4. Vista Sola Lettura mobile
5. Notifiche (in-app prima, push reale dopo se necessario)
6. Offline sync sull'app operatore

Il responsabile potrà rinominare le 16 fasi in qualsiasi momento dopo il lancio, dalla schermata "Configurazione Fasi" — non è necessario fermarsi a confermare i nomi reali prima di iniziare lo sviluppo, dato che sono modificabili senza toccare codice.
