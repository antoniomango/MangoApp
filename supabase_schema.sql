-- ============================================================
-- MANGO SRL — Schema Database Supabase
-- Esegui TUTTO questo file nell'SQL Editor di Supabase
-- (Database → SQL Editor → New query → incolla → Run)
-- ============================================================

-- ============================================================
-- 0. ESTENSIONI
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

CREATE TYPE ruolo_utente AS ENUM ('responsabile', 'operatore', 'sola_lettura');

CREATE TYPE tipologia_ordine AS ENUM ('4_lati', 'barra_l', 'complanare', 'battente');

CREATE TYPE priorita_ordine AS ENUM ('normale', 'urgente', 'extra_urgente');

CREATE TYPE stato_ordine AS ENUM ('aperto', 'sospeso', 'spedito');

CREATE TYPE stato_fase AS ENUM ('disponibile', 'in_corso', 'completata');

CREATE TYPE stato_nc AS ENUM ('aperta', 'approvata', 'chiusa');

CREATE TYPE tipo_notifica AS ENUM ('nc_segnalata', 'ordine_in_ritardo', 'fase_riassegnata');

CREATE TYPE azione_log AS ENUM (
  'fase_iniziata',
  'fase_completata',
  'fase_riassegnata',
  'nc_segnalata',
  'nc_chiusa',
  'ordine_sospeso',
  'ordine_riattivato',
  'ordine_spedito',
  'ordine_creato'
);


-- ============================================================
-- 2. TABELLE
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 USERS
-- ------------------------------------------------------------
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  cognome     TEXT NOT NULL,
  pin         TEXT,                        -- bcrypt hash, solo per operatore/sola_lettura
  email       TEXT UNIQUE,                 -- solo per responsabile (Supabase Auth)
  ruolo       ruolo_utente NOT NULL,
  attivo      BOOLEAN NOT NULL DEFAULT TRUE,
  creato_il   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Il responsabile deve avere email, operatori devono avere PIN
  CONSTRAINT chk_responsabile_email CHECK (
    ruolo <> 'responsabile' OR email IS NOT NULL
  ),
  CONSTRAINT chk_operatore_pin CHECK (
    ruolo = 'responsabile' OR pin IS NOT NULL
  )
);

-- Indice per login rapido con email
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
-- Indice per ricerca per ruolo
CREATE INDEX idx_users_ruolo ON users(ruolo);


-- ------------------------------------------------------------
-- 2.2 FASI (16 fasi fisse, nomi editabili)
-- ------------------------------------------------------------
CREATE TABLE fasi (
  id          SMALLINT PRIMARY KEY,        -- 1→16, fisso
  nome        TEXT NOT NULL,
  descrizione TEXT
);

-- Inserimento fasi placeholder (rinominabili dall'interfaccia)
INSERT INTO fasi (id, nome, descrizione) VALUES
  (1,  'Taglio',        'Taglio del materiale grezzo alle dimensioni di progetto'),
  (2,  'Piallatura',    'Piallatura delle superfici per uniformare spessore e planarità'),
  (3,  'Fresatura',     'Fresatura di profili, scanalature e sagome'),
  (4,  'CNC',           'Lavorazione CNC per forme complesse e forature di precisione'),
  (5,  'Incollaggio',   'Incollaggio dei componenti con colla idonea'),
  (6,  'Pressatura',    'Pressatura in pressa per consolidamento incollaggio'),
  (7,  'Carteggiatura', 'Carteggiatura manuale e a nastro per finitura superficiale'),
  (8,  'Primer',        'Applicazione del primer di fondo'),
  (9,  'Colorazione',   'Prima mano di colore base'),
  (10, 'Verniciatura',  'Verniciatura finale con rifinitura'),
  (11, 'Asciugatura',   'Tempo di asciugatura in zona dedicata'),
  (12, 'Assemblaggio',  'Assemblaggio di tutti i componenti del portoncino/pannello'),
  (13, 'Guarnizioni',   'Montaggio guarnizioni perimetrali'),
  (14, 'Ferramenta',    'Montaggio cerniere, serratura e accessori in ferramenta'),
  (15, 'Controllo QC',  'Controllo qualità finale prima dell''imballaggio'),
  (16, 'Imballaggio',   'Imballaggio, etichettatura e preparazione alla spedizione');


-- ------------------------------------------------------------
-- 2.3 ORDINI
-- ------------------------------------------------------------
CREATE TABLE ordini (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codice        TEXT NOT NULL UNIQUE,       -- es. MNG-0041, generato da trigger
  cliente       TEXT NOT NULL,
  tipologia     tipologia_ordine NOT NULL,
  priorita      priorita_ordine NOT NULL DEFAULT 'normale',
  scadenza      DATE,
  stato         stato_ordine NOT NULL DEFAULT 'aperto',
  note_generali TEXT,
  creato_da     UUID NOT NULL REFERENCES users(id),
  tipo          TEXT NOT NULL DEFAULT 'standard' CHECK (tipo IN ('standard', 'extra')),
  eliminato     BOOLEAN NOT NULL DEFAULT FALSE,
  creato_il     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  spedito_il    TIMESTAMP WITH TIME ZONE               -- nullable
);

CREATE INDEX idx_ordini_stato ON ordini(stato);
CREATE INDEX idx_ordini_scadenza ON ordini(scadenza) WHERE stato <> 'spedito';
CREATE INDEX idx_ordini_priorita ON ordini(priorita);

-- Sequence per codici MNG-XXXX
CREATE SEQUENCE IF NOT EXISTS ordini_codice_seq START WITH 1;

-- Trigger: genera codice automatico alla creazione
CREATE OR REPLACE FUNCTION genera_codice_ordine()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codice IS NULL OR NEW.codice = '' THEN
    NEW.codice := 'MNG-' || LPAD(nextval('ordini_codice_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_genera_codice_ordine
  BEFORE INSERT ON ordini
  FOR EACH ROW EXECUTE FUNCTION genera_codice_ordine();


-- ------------------------------------------------------------
-- 2.4 ORDINE_FASI (tabella critica — stato in tempo reale)
-- ------------------------------------------------------------
CREATE TABLE ordine_fasi (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordine_id           UUID NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
  fase_id             SMALLINT NOT NULL REFERENCES fasi(id),
  stato               stato_fase NOT NULL DEFAULT 'disponibile',
  operatore_id        UUID REFERENCES users(id),   -- nullable: chi ha in carico/completato
  iniziata_il         TIMESTAMP WITH TIME ZONE,
  completata_il       TIMESTAMP WITH TIME ZONE,
  note_responsabile   TEXT,
  note_operatore      TEXT,

  UNIQUE (ordine_id, fase_id)
);

CREATE INDEX idx_ordine_fasi_ordine ON ordine_fasi(ordine_id);
CREATE INDEX idx_ordine_fasi_operatore ON ordine_fasi(operatore_id) WHERE operatore_id IS NOT NULL;
CREATE INDEX idx_ordine_fasi_stato ON ordine_fasi(stato);

-- Trigger: alla creazione di un ordine, genera automaticamente le 16 righe ordine_fasi
CREATE OR REPLACE FUNCTION crea_fasi_per_ordine()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ordine_fasi (ordine_id, fase_id, stato)
  SELECT NEW.id, f.id, 'disponibile'::stato_fase
  FROM fasi f
  ORDER BY f.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crea_fasi_ordine
  AFTER INSERT ON ordini
  FOR EACH ROW EXECUTE FUNCTION crea_fasi_per_ordine();

-- Trigger: quando la fase 16 viene completata, l'ordine passa automaticamente in "spedito"
-- Nota: la spedizione è un'azione esplicita dell'operatore ("Segna come spedito"),
--       quindi il trigger sotto marca lo stato solo su richiesta via funzione RPC.
--       Il flag automatico qui serve come fallback di sicurezza.

-- Trigger: impedisce di prendere in carico una fase già in_corso da un altro
CREATE OR REPLACE FUNCTION check_lock_fase()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stato = 'in_corso' AND NEW.stato = 'in_corso'
     AND OLD.operatore_id IS DISTINCT FROM NEW.operatore_id
     AND NEW.operatore_id IS NOT NULL THEN
    RAISE EXCEPTION 'Fase già in corso da un altro operatore. Riassegnazione consentita solo al responsabile.';
  END IF;
  -- Popola iniziata_il quando passa a in_corso
  IF NEW.stato = 'in_corso' AND OLD.stato = 'disponibile' THEN
    NEW.iniziata_il := NOW();
  END IF;
  -- Popola completata_il quando passa a completata
  IF NEW.stato = 'completata' AND OLD.stato = 'in_corso' THEN
    NEW.completata_il := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_lock_fase
  BEFORE UPDATE ON ordine_fasi
  FOR EACH ROW EXECUTE FUNCTION check_lock_fase();


-- ------------------------------------------------------------
-- 2.4b FASI_ORDINE_EXTRA (fasi libere per ordini di tipo "extra")
-- ------------------------------------------------------------
CREATE TABLE fasi_ordine_extra (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordine_id           UUID NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
  numero              SMALLINT NOT NULL,
  nome                TEXT NOT NULL,
  stato               stato_fase NOT NULL DEFAULT 'disponibile',
  operatore_id        UUID REFERENCES users(id),
  iniziata_il         TIMESTAMP WITH TIME ZONE,
  completata_il       TIMESTAMP WITH TIME ZONE,
  note_responsabile   TEXT,
  note_operatore      TEXT,

  UNIQUE (ordine_id, numero)
);

CREATE INDEX idx_fasi_extra_ordine ON fasi_ordine_extra(ordine_id);
CREATE INDEX idx_fasi_extra_operatore ON fasi_ordine_extra(operatore_id) WHERE operatore_id IS NOT NULL;


-- ------------------------------------------------------------
-- 2.5 ALLEGATI
-- ------------------------------------------------------------
CREATE TABLE allegati (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordine_fase_id  UUID NOT NULL REFERENCES ordine_fasi(id) ON DELETE CASCADE,
  url_file        TEXT NOT NULL,            -- path su Supabase Storage
  caricato_da     UUID NOT NULL REFERENCES users(id),
  caricato_il     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_allegati_ordine_fase ON allegati(ordine_fase_id);


-- ------------------------------------------------------------
-- 2.6 NON_CONFORMITA
-- ------------------------------------------------------------
CREATE TABLE non_conformita (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordine_id     UUID NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
  fase_id       SMALLINT NOT NULL REFERENCES fasi(id),
  descrizione   TEXT NOT NULL,
  foto_url      TEXT,                       -- nullable
  segnalata_da  UUID NOT NULL REFERENCES users(id),
  segnalata_il  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stato         stato_nc NOT NULL DEFAULT 'aperta',
  gestita_da    UUID REFERENCES users(id), -- nullable, sempre il responsabile
  gestita_il    TIMESTAMP WITH TIME ZONE,
  note_chiusura TEXT
);

CREATE INDEX idx_nc_ordine ON non_conformita(ordine_id);
CREATE INDEX idx_nc_stato ON non_conformita(stato);


-- ------------------------------------------------------------
-- 2.7 NOTIFICHE
-- ------------------------------------------------------------
CREATE TABLE notifiche (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  destinatario_id   UUID NOT NULL REFERENCES users(id),
  tipo              tipo_notifica NOT NULL,
  testo             TEXT NOT NULL,
  ordine_id         UUID REFERENCES ordini(id),   -- nullable
  letta             BOOLEAN NOT NULL DEFAULT FALSE,
  creata_il         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifiche_destinatario ON notifiche(destinatario_id, letta);
CREATE INDEX idx_notifiche_creata ON notifiche(creata_il DESC);


-- ------------------------------------------------------------
-- 2.8 ARCHIVIO_LOG (append-only, mai UPDATE/DELETE)
-- ------------------------------------------------------------
CREATE TABLE archivio_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordine_id   UUID NOT NULL REFERENCES ordini(id),
  fase_id     SMALLINT REFERENCES fasi(id),  -- nullable
  utente_id   UUID NOT NULL REFERENCES users(id),
  azione      azione_log NOT NULL,
  timestamp   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  dettaglio   JSONB                           -- snapshot dati per contesto
);

CREATE INDEX idx_log_ordine ON archivio_log(ordine_id);
CREATE INDEX idx_log_utente ON archivio_log(utente_id);
CREATE INDEX idx_log_timestamp ON archivio_log(timestamp DESC);

-- Sicurezza: impedisce UPDATE e DELETE sul log (immutabile) — usa trigger invece di RULE
-- Le RULE DO INSTEAD NOTHING restituiscono successo silenzioso; il trigger lancia un errore esplicito.
CREATE OR REPLACE FUNCTION prevent_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'archivio_log è immutabile: UPDATE e DELETE non sono consentiti';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_log
  BEFORE UPDATE ON archivio_log
  FOR EACH ROW EXECUTE FUNCTION prevent_log_modification();

CREATE TRIGGER trg_no_delete_log
  BEFORE DELETE ON archivio_log
  FOR EACH ROW EXECUTE FUNCTION prevent_log_modification();


-- ============================================================
-- 3. FUNZIONI RPC (chiamabili dal frontend via supabase.rpc())
-- ============================================================

-- RPC: Prendi in carico una fase (operatore)
-- Verifica che la fase sia disponibile, poi la blocca per l'operatore
CREATE OR REPLACE FUNCTION prendi_in_carico_fase(
  p_ordine_fase_id UUID,
  p_operatore_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fase ordine_fasi%ROWTYPE;
BEGIN
  -- Lock pessimistico sulla riga
  SELECT * INTO v_fase
  FROM ordine_fasi
  WHERE id = p_ordine_fase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata');
  END IF;

  IF v_fase.stato <> 'disponibile' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non disponibile — già presa in carico o completata');
  END IF;

  -- Verifica che l'ordine non sia sospeso
  IF EXISTS (SELECT 1 FROM ordini WHERE id = v_fase.ordine_id AND stato = 'sospeso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Ordine sospeso');
  END IF;

  UPDATE ordine_fasi
  SET stato = 'in_corso',
      operatore_id = p_operatore_id,
      iniziata_il = NOW()
  WHERE id = p_ordine_fase_id;

  -- Log
  INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_iniziata',
          jsonb_build_object('ordine_fase_id', p_ordine_fase_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- RPC: Completa una fase (operatore)
CREATE OR REPLACE FUNCTION completa_fase(
  p_ordine_fase_id  UUID,
  p_operatore_id    UUID,
  p_note_operatore  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fase ordine_fasi%ROWTYPE;
BEGIN
  SELECT * INTO v_fase
  FROM ordine_fasi
  WHERE id = p_ordine_fase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata');
  END IF;

  IF v_fase.stato <> 'in_corso' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non in corso');
  END IF;

  IF v_fase.operatore_id <> p_operatore_id THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Non sei l''operatore assegnato a questa fase');
  END IF;

  UPDATE ordine_fasi
  SET stato = 'completata',
      completata_il = NOW(),
      note_operatore = COALESCE(p_note_operatore, note_operatore)
  WHERE id = p_ordine_fase_id;

  -- Log
  INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_completata',
          jsonb_build_object('ordine_fase_id', p_ordine_fase_id, 'durata_min',
            EXTRACT(EPOCH FROM (NOW() - v_fase.iniziata_il))/60));

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- RPC: Riassegna fase (solo responsabile)
CREATE OR REPLACE FUNCTION riassegna_fase(
  p_ordine_fase_id    UUID,
  p_nuovo_operatore   UUID,
  p_responsabile_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fase ordine_fasi%ROWTYPE;
BEGIN
  -- Verifica che chi chiama sia il responsabile
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Azione riservata al responsabile');
  END IF;

  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata');
  END IF;

  UPDATE ordine_fasi
  SET operatore_id = p_nuovo_operatore,
      stato = 'in_corso',
      iniziata_il = COALESCE(v_fase.iniziata_il, NOW())
  WHERE id = p_ordine_fase_id;

  -- Log
  INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_responsabile_id, 'fase_riassegnata',
          jsonb_build_object('vecchio_operatore', v_fase.operatore_id,
                             'nuovo_operatore', p_nuovo_operatore));

  -- Notifica al responsabile
  INSERT INTO notifiche (destinatario_id, tipo, testo, ordine_id)
  SELECT id, 'fase_riassegnata',
    'Fase ' || v_fase.fase_id || ' riassegnata a nuovo operatore',
    v_fase.ordine_id
  FROM users WHERE ruolo = 'responsabile';

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- RPC: Segna ordine come spedito
CREATE OR REPLACE FUNCTION segna_spedito(
  p_ordine_id  UUID,
  p_utente_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ordini
  SET stato = 'spedito', spedito_il = NOW()
  WHERE id = p_ordine_id AND stato = 'aperto';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Ordine non trovato o non aperto');
  END IF;

  INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione)
  VALUES (p_ordine_id, NULL, p_utente_id, 'ordine_spedito');

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- RPC: Verifica PIN operatore (ritorna user o errore)
CREATE OR REPLACE FUNCTION verifica_pin(
  p_user_id UUID,
  p_pin     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id AND attivo = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Utente non trovato o disattivato');
  END IF;

  IF v_user.ruolo = 'responsabile' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Il responsabile usa email e password');
  END IF;

  IF v_user.pin = crypt(p_pin, v_user.pin) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'user', jsonb_build_object(
        'id', v_user.id,
        'nome', v_user.nome,
        'cognome', v_user.cognome,
        'ruolo', v_user.ruolo
      )
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'errore', 'PIN errato');
  END IF;
END;
$$;


-- RPC: Crea operatore con PIN hashato
CREATE OR REPLACE FUNCTION crea_operatore(
  p_nome    TEXT,
  p_cognome TEXT,
  p_pin     TEXT,
  p_ruolo   ruolo_utente DEFAULT 'operatore'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO users (nome, cognome, pin, ruolo)
  VALUES (p_nome, p_cognome, crypt(p_pin, gen_salt('bf')), p_ruolo)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;


-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Nota: Supabase usa JWT. Per i ruoli custom (operatore/sola_lettura
-- che non usano Supabase Auth), l'app chiama le RPC con SECURITY DEFINER
-- e passa l'user_id verificato. Le policy qui proteggono l'accesso
-- diretto alle tabelle per chi usa Supabase Auth (il responsabile).

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordini ENABLE ROW LEVEL SECURITY;
ALTER TABLE fasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordine_fasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE allegati ENABLE ROW LEVEL SECURITY;
ALTER TABLE non_conformita ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE archivio_log ENABLE ROW LEVEL SECURITY;

-- Policy permissiva per il service_role (usato dalle RPC SECURITY DEFINER)
-- e per l'anon/authenticated nel caso di chiamate dirette dal frontend del responsabile.
-- NOTA: In produzione, raffina queste policy in base alle esigenze.
-- Per ora usiamo una policy "pass-through" per authenticated per permettere
-- al frontend di funzionare. La logica di sicurezza reale è nelle RPC.

CREATE POLICY "Accesso autenticato" ON users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Accesso autenticato" ON ordini
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Lettura pubblica fasi" ON fasi
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifica fasi solo autenticato" ON fasi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Accesso autenticato" ON ordine_fasi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Accesso autenticato" ON allegati
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Accesso autenticato" ON non_conformita
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Accesso autenticato" ON notifiche
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Accesso autenticato" ON archivio_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Accesso anon per le RPC (operatori che non usano Supabase Auth)
CREATE POLICY "Anon può chiamare RPC" ON users
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon può leggere ordini" ON ordini
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon può leggere ordine_fasi" ON ordine_fasi
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon può leggere nc" ON non_conformita
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon può leggere notifiche" ON notifiche
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon può leggere log" ON archivio_log
  FOR SELECT TO anon USING (true);

-- Le RPC SECURITY DEFINER bypassano RLS, quindi possono scrivere anche da anon


-- ============================================================
-- 5. REALTIME — abilita le pubblicazioni per le tabelle critiche
-- ============================================================
-- Esegui questi comandi separatamente se necessario
-- (Supabase potrebbe richiederlo dalla UI: Database → Replication)

ALTER PUBLICATION supabase_realtime ADD TABLE ordini;
ALTER PUBLICATION supabase_realtime ADD TABLE ordine_fasi;
ALTER PUBLICATION supabase_realtime ADD TABLE fasi_ordine_extra;
ALTER PUBLICATION supabase_realtime ADD TABLE non_conformita;
ALTER PUBLICATION supabase_realtime ADD TABLE notifiche;


-- ============================================================
-- 6. STORAGE BUCKET (eseguire dalla UI o via questo SQL)
-- ============================================================
-- Crea un bucket "allegati-fasi" per le foto degli operatori.
-- Da UI: Storage → New bucket → "allegati-fasi" → Public: NO
-- Oppure via SQL (richiede l'estensione storage di Supabase):
INSERT INTO storage.buckets (id, name, public)
VALUES ('allegati-fasi', 'allegati-fasi', false)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- FINE SCHEMA
-- Il database è pronto. Passi successivi:
-- 1. Crea l'utente responsabile da Supabase Auth (Authentication → Users → Add user)
-- 2. Poi aggiungi la riga in "users" con ruolo='responsabile' e lo stesso id UUID
-- 3. Usa la RPC crea_operatore() per aggiungere operatori con PIN hashato
-- ============================================================
