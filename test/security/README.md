# Suite di test di autorizzazione (A01–A12)

Replica 12 casi concreti di bypass di autorizzazione contro `mango-test-security` — letture
anon su tabelle private, impersonazione di un altro operatore, RPC chiamate senza sessione,
token scaduto/revocato riusato, transizioni di stato non consentite, concorrenza su due
richieste simultanee, accesso diretto allo storage. Ogni test fallisce esplicitamente se una
policy o una RPC dovesse tornare permissiva in futuro.

**Va sempre e solo contro il progetto di test** (`kpdlynvmsoctagwtzrxr`) — mai produzione.

## Uso

```bash
cd test/security
npm install
node autorizzazione.mjs
```

Richiede una sola cosa non già nel repository: la **password diretta del database di test**
(diversa da quella di produzione già usata per `BACKUP_DATABASE.ps1` — non intercambiabili).
Da Supabase Dashboard → progetto `kpdlynvmsoctagwtzrxr` → Project Settings → Database →
Connection string, oppure chiedila ad Antonio. Fornirla con una delle due:

- variabile d'ambiente `MANGO_TEST_DB_PASSWORD`
- file `~/.mangoapp-test-db-password` (una riga, solo la password)

Serve solo per creare/pulire i fixture di test (un ordine, una fase, due sessioni operatore) —
i 12 test veri e propri girano tutti con la sola anon key pubblica, esattamente come farebbe un
client reale.

## Quando eseguirla

Prima di ogni deploy importante che tocca RLS, policy storage, grant o RPC di autenticazione —
non solo dopo un incidente. Un fallimento qui prima del deploy costa un minuto; lo stesso
fallimento scoperto dopo il deploy costa un incidente di sicurezza.

## I 12 casi

| Test | Cosa verifica |
|---|---|
| A01 | `anon` non legge `ordini` direttamente (tabella, non RPC) |
| A02 | `anon` non legge `users` direttamente |
| A03 | `anon` non può chiamare una RPC pattern-responsabile (`crea_operatore`) |
| A04 | `anon` non ottiene `dimensione_database` passando l'id di un responsabile reale (V-28) |
| A05 | Un operatore non può impersonarne un altro: proprio token + id altrui → rifiutato |
| A06 | RPC operatore chiamata con `session_token` nullo → rifiutata |
| A07 | RPC operatore chiamata con un `session_token` casuale/inventato → rifiutata |
| A08 | `session_token` scaduto riusato → rifiutato |
| A09 | Sessione con `forzato_logout=true` (token altrimenti valido) → rifiutata |
| A10 | `completa_fase` su una fase mai presa in carico (stato "disponibile") → rifiutata |
| A11 | Due `prendi_in_carico_fase` simultanee sulla stessa fase → esattamente una riesce |
| A12 | `anon` non scarica un file reale di `storage.objects` (nessuna policy anon) |

Dettagli, collaudo di ciascun caso e riferimenti alle sessioni di sicurezza da cui nascono: vedi
il vault, nota `2026-09-09-suite-test-autorizzazione-a01-a12.md`.

## Se un test fallisce

L'output elenca gli id falliti ed esce con codice 1. Non è un problema del test — è un segnale
che una policy RLS, un grant o una RPC sono tornati più permissivi di quanto dovrebbero essere.
Indagare la causa prima di procedere con qualunque deploy.
