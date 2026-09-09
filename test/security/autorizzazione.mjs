// Suite di test automatici di autorizzazione — A01/A12
// ============================================================
// Replica 12 casi concreti di bypass di autorizzazione (letture anon su tabelle private,
// impersonazione di un altro operatore, RPC senza sessione, token scaduto/revocato riusato,
// transizioni di stato non consentite, concorrenza su due richieste simultanee, accesso
// diretto allo storage) contro mango-test-security. Ogni test fallisce esplicitamente
// (exit code 1, elenco dei casi falliti) se una policy o una RPC dovesse tornare permissiva
// in futuro — eseguirla prima di ogni deploy importante su RLS/RPC/grant.
//
// Va SOLO contro mango-test-security (kpdlynvmsoctagwtzrxr) — mai produzione: crea e cancella
// fixture reali (ordine, fase, sessioni) e carica/cancella un file reale in storage.
//
// Uso:
//   cd test/security && npm install   (una tantum: installa @supabase/supabase-js e pg)
//   node autorizzazione.mjs
//
// Richiede la password diretta del database di TEST (non quella di produzione, diversa):
// Supabase Dashboard → progetto kpdlynvmsoctagwtzrxr → Project Settings → Database →
// Connection string, oppure chiedila ad Antonio. Fornirla via UNA delle due:
//   - variabile d'ambiente MANGO_TEST_DB_PASSWORD
//   - file ~/.mangoapp-test-db-password (una riga, solo la password) — stessa convenzione
//     di ~/.mangoapp-db-password già in uso per BACKUP_DATABASE.ps1 (quella è produzione,
//     questa è test: sono password diverse, non intercambiabili).
//
// Non richiede la service role key: l'anon key (pubblica, la stessa già imbarcata in
// js/config.js) e la password diretta del DB per il setup/teardown dei fixture bastano.

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import os from 'os';

const SUPABASE_URL = 'https://kpdlynvmsoctagwtzrxr.supabase.co';
// Anon key di TEST — pubblica, la stessa imbarcata in js/config.js. Non è un segreto: è
// pensata per girare lato client, la sicurezza reale è nella RLS/RPC che questa suite verifica.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZGx5bnZtc29jdGFnd3R6cnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjE3MzgsImV4cCI6MjA5Nzk5NzczOH0._2rKWXsJDFOI42IrN4lJiWFpbC5eievSRWsuFC1BURM';

function leggiPasswordTest() {
  if (process.env.MANGO_TEST_DB_PASSWORD) return process.env.MANGO_TEST_DB_PASSWORD;
  const percorso = `${os.homedir()}/.mangoapp-test-db-password`;
  if (fs.existsSync(percorso)) return fs.readFileSync(percorso, 'utf8').trim();
  console.error(
    'Password del database di TEST non trovata.\n' +
    'Impostare MANGO_TEST_DB_PASSWORD oppure creare ' + percorso + ' (una riga, solo la password).\n' +
    'Da Supabase Dashboard → progetto kpdlynvmsoctagwtzrxr → Project Settings → Database → Connection string.\n' +
    'ATTENZIONE: è la password del progetto di TEST, diversa da quella di produzione già in uso per i backup.'
  );
  process.exit(2);
}

const db = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.kpdlynvmsoctagwtzrxr',
  password: leggiPasswordTest(),
  ssl: { rejectUnauthorized: false },
});

const anon = createClient(SUPABASE_URL, ANON_KEY);

// Fixture fissi e riconoscibili (prefisso 77777777) — mai riusati da altri test di sessioni
// precedenti, sempre puliti a fine corsa anche in caso di errore a metà.
const T = {
  respId: '982ea7a7-daf5-42d5-852a-2a3afdd27404', // collaudo@test.local, ruolo responsabile
  op1Id: '00000000-0000-0000-0000-000000000002', // Test Operatore
  op2Id: 'aaaaaaaa-0000-0000-0000-000000000001', // Test Op1
  op1Token: '11111111-1111-1111-1111-111111111111',
  op2Token: '22222222-2222-2222-2222-222222222222',
  ordineId: '77777777-0000-0000-0000-000000000001',
  faseId: '77777777-0000-0000-0000-000000000002',
  storagePath: null, // assegnato in setup(), dopo un upload reale
};

const risultati = [];
function record(id, descrizione, pass, dettaglio) {
  risultati.push({ id, descrizione, pass });
  const riga = `${pass ? '✅' : '❌'} ${id} — ${descrizione}`;
  console.log(dettaglio ? `${riga}  (${dettaglio})` : riga);
}

async function headerAutorizzazione() {
  return { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY };
}

async function setup() {
  await db.connect();

  await db.query(
    `UPDATE users SET session_token=$1, session_token_scadenza=now()+interval '1 hour', forzato_logout=false WHERE id=$2`,
    [T.op1Token, T.op1Id]
  );
  await db.query(
    `UPDATE users SET session_token=$1, session_token_scadenza=now()+interval '1 hour', forzato_logout=false WHERE id=$2`,
    [T.op2Token, T.op2Id]
  );

  await db.query(
    `INSERT INTO ordini (id, codice, cliente, tipo, tipo_prodotto, struttura, materiale, quantita, stato)
     VALUES ($1,'TEST-A01-A12','Test Autorizzazione','standard','battente','quattro_lati','grezzo',1,'aperto')
     ON CONFLICT (id) DO UPDATE SET stato='aperto'`,
    [T.ordineId]
  );
  await db.query(
    `INSERT INTO ordine_fasi (id, ordine_id, fase_id, stato, operatore_id, iniziata_il, completata_il)
     VALUES ($1,$2,1,'disponibile',NULL,NULL,NULL)
     ON CONFLICT (id) DO UPDATE SET stato='disponibile', operatore_id=NULL, iniziata_il=NULL, completata_il=NULL`,
    [T.faseId, T.ordineId]
  );
  await db.query(`DELETE FROM ordine_fasi_operatori WHERE ordine_fase_id=$1`, [T.faseId]);

  // Upload reale (stesso percorso di produzione: allegato-upload + uploadToSignedUrl) per A12 —
  // un download() su un path reale è una verifica più rigorosa di list() su un bucket
  // potenzialmente vuoto (list() non dà errore esplicito su un bucket senza risultati).
  const { data: firma, error: eFirma } = await anon.functions.invoke('allegato-upload', {
    headers: await headerAutorizzazione(),
    body: { p_user_id: T.op1Id, p_session_token: T.op1Token, tipo: 'fase', ordine_id: T.ordineId, ordine_fase_id: T.faseId, estensione: 'jpg', indice: 1 },
  });
  if (eFirma || !firma?.ok) throw new Error('Setup A12 fallito: allegato-upload non ha firmato: ' + (eFirma?.message || firma?.errore));
  const blob = new Blob(['contenuto reale per la suite A01-A12'], { type: 'image/jpeg' });
  const { error: eUpload } = await anon.storage.from('allegati-fasi').uploadToSignedUrl(firma.path, firma.token, blob);
  if (eUpload) throw new Error('Setup A12 fallito: upload non riuscito: ' + eUpload.message);
  T.storagePath = firma.path;
}

async function teardown() {
  try {
    if (T.storagePath) {
      // Cancellazione diretta con service role non disponibile qui di proposito (la suite
      // usa solo l'anon key, come un vero client) — la riga allegati non esiste (upload
      // diretto, non passato da salva_allegato), quindi il file resta un residuo di test
      // isolato e riconoscibile (prefisso 77777777) fino alla prossima pulizia manuale;
      // non incide sui dati reali.
    }
    await db.query(`DELETE FROM ordine_fasi_operatori WHERE ordine_fase_id=$1`, [T.faseId]);
    await db.query(`DELETE FROM archivio_log WHERE ordine_id=$1`, [T.ordineId]);
    await db.query(`DELETE FROM allegati WHERE ordine_fase_id=$1`, [T.faseId]);
    await db.query(`DELETE FROM ordine_fasi WHERE id=$1`, [T.faseId]);
    await db.query(`DELETE FROM ordini WHERE id=$1`, [T.ordineId]);
    await db.query(
      `UPDATE users SET session_token=NULL, session_token_scadenza=NULL, forzato_logout=false WHERE id IN ($1,$2)`,
      [T.op1Id, T.op2Id]
    );
  } finally {
    await db.end();
  }
}

async function main() {
  await setup();

  // A01 — anon non legge la tabella ordini direttamente (Fase 2, Punto 1 dell'audit)
  {
    const { error } = await anon.from('ordini').select('*').limit(1);
    record('A01', 'anon non legge "ordini" direttamente', !!error && error.code === '42501', error?.message);
  }

  // A02 — anon non legge la tabella users direttamente
  {
    const { error } = await anon.from('users').select('*').limit(1);
    record('A02', 'anon non legge "users" direttamente', !!error && error.code === '42501', error?.message);
  }

  // A03 — anon non può chiamare una RPC pattern-responsabile (Punto 2 dell'audit, EXECUTE ristretto)
  {
    const { data, error } = await anon.rpc('crea_operatore', {
      p_nome: 'x', p_cognome: 'x', p_pin: '0000', p_ruolo: 'operatore', p_responsabile_id: T.respId,
    });
    const bloccato = (!!error && error.code === '42501') || data?.ok === false;
    record('A03', 'anon non può chiamare crea_operatore', bloccato, error?.message || JSON.stringify(data));
  }

  // A04 — anon non ottiene dimensione_database passando l'id di un responsabile reale (V-28)
  {
    const { data, error } = await anon.rpc('dimensione_database', { p_responsabile_id: T.respId });
    const bloccato = (!!error && error.code === '42501') || data === null || data?.ok === false;
    record('A04', 'anon non ottiene dimensione_database con id responsabile reale', bloccato, error?.message);
  }

  // A05 — un operatore non può impersonare un altro usando il proprio token con l'id altrui
  {
    const { data } = await anon.rpc('mie_fasi_in_corso', { p_operatore_id: T.op2Id, p_session_token: T.op1Token });
    const bloccato = data?.ok === false && data?.errore === 'sessione_non_valida';
    record('A05', 'il token di op1 non autentica l\'id di op2 (impersonazione)', bloccato, JSON.stringify(data));
  }

  // A06 — RPC operatore chiamata con session_token nullo
  {
    const { data } = await anon.rpc('mie_fasi_in_corso', { p_operatore_id: T.op1Id, p_session_token: null });
    record('A06', 'session_token nullo rifiutato', data?.ok === false && data?.errore === 'sessione_non_valida', JSON.stringify(data));
  }

  // A07 — RPC operatore chiamata con un session_token casuale, mai esistito
  {
    const { data } = await anon.rpc('mie_fasi_in_corso', { p_operatore_id: T.op1Id, p_session_token: '99999999-9999-9999-9999-999999999999' });
    record('A07', 'session_token casuale/inventato rifiutato', data?.ok === false && data?.errore === 'sessione_non_valida', JSON.stringify(data));
  }

  // A08 — session_token scaduto riusato (simula un client offline che ritenta dopo la scadenza)
  {
    await db.query(`UPDATE users SET session_token_scadenza = now() - interval '1 hour' WHERE id=$1`, [T.op1Id]);
    const { data } = await anon.rpc('mie_fasi_in_corso', { p_operatore_id: T.op1Id, p_session_token: T.op1Token });
    record('A08', 'session_token scaduto rifiutato', data?.ok === false && data?.errore === 'sessione_non_valida', JSON.stringify(data));
    await db.query(`UPDATE users SET session_token_scadenza = now() + interval '1 hour' WHERE id=$1`, [T.op1Id]);
  }

  // A09 — sessione revocata (forzato_logout) con token altrimenti valido e non scaduto
  {
    await db.query(`UPDATE users SET forzato_logout = true WHERE id=$1`, [T.op1Id]);
    const { data } = await anon.rpc('mie_fasi_in_corso', { p_operatore_id: T.op1Id, p_session_token: T.op1Token });
    record('A09', 'sessione con forzato_logout=true rifiutata', data?.ok === false && data?.errore === 'sessione_non_valida', JSON.stringify(data));
    await db.query(`UPDATE users SET forzato_logout = false WHERE id=$1`, [T.op1Id]);
  }

  // A10 — transizione di stato non consentita: completare una fase mai presa in carico
  {
    const { data } = await anon.rpc('completa_fase', { p_ordine_fase_id: T.faseId, p_operatore_id: T.op1Id, p_session_token: T.op1Token });
    const bloccato = data?.ok === false && data?.errore === 'stato_non_in_corso';
    record('A10', 'completa_fase su fase "disponibile" rifiutata', bloccato, JSON.stringify(data));
  }

  // A11 — concorrenza: due prendi_in_carico_fase simultanee sulla stessa fase disponibile
  {
    const [r1, r2] = await Promise.all([
      anon.rpc('prendi_in_carico_fase', { p_ordine_fase_id: T.faseId, p_operatore_id: T.op1Id, p_session_token: T.op1Token }),
      anon.rpc('prendi_in_carico_fase', { p_ordine_fase_id: T.faseId, p_operatore_id: T.op2Id, p_session_token: T.op2Token }),
    ]);
    const successi = [r1.data?.ok, r2.data?.ok].filter(Boolean).length;
    record('A11', 'esattamente una delle due prese in carico concorrenti riesce (FOR UPDATE)', successi === 1,
      `r1=${JSON.stringify(r1.data)} r2=${JSON.stringify(r2.data)}`);
  }

  // A12 — anon non può leggere direttamente un file reale in storage.objects (nessuna policy anon)
  {
    const { data, error } = await anon.storage.from('allegati-fasi').download(T.storagePath);
    record('A12', 'anon non scarica un file reale di storage.objects', !data && !!error, error?.message);
  }

  await teardown();

  const falliti = risultati.filter(r => !r.pass);
  console.log(`\n${risultati.length - falliti.length}/${risultati.length} test superati.`);
  if (falliti.length) {
    console.log('FALLITI:', falliti.map(f => f.id).join(', '));
    console.log('\nUn test fallito qui significa che una policy o una RPC è tornata permissiva —');
    console.log('non ignorare, indagare prima di procedere con un deploy su produzione.');
    process.exit(1);
  }
}

main().catch(async e => {
  console.error('Errore nella suite:', e);
  try { await teardown(); } catch (e2) { console.error('Anche il teardown è fallito:', e2); }
  process.exit(1);
});
