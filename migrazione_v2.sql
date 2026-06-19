-- ================================================================
-- MANGO SRL — Migrazione v2
-- 20 fasi reali + struttura / tipo_prodotto / materiale
--
-- ESEGUI IN DUE PASSI NEL SQL EDITOR DI SUPABASE:
--   PASSO 1 → esegui solo la prima istruzione (ALTER TYPE)
--   PASSO 2 → esegui tutto il resto
-- ================================================================

-- ════════════ PASSO 1 — esegui DA SOLO ════════════
ALTER TYPE stato_fase ADD VALUE IF NOT EXISTS 'non_applicabile';
-- ══════════════════════════════════════════════════



-- ════════════ PASSO 2 — esegui dopo il PASSO 1 ════════════

-- 1. Aggiungi colonna tipo a ordini (distingue standard da extra)
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'standard'
  CHECK (tipo IN ('standard', 'extra'));

-- 1b. Crea tabella fasi_ordine_extra se non esiste
CREATE TABLE IF NOT EXISTS fasi_ordine_extra (
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

-- 1c. Pulizia dati (nessun ordine reale ancora presente)
TRUNCATE fasi_ordine_extra CASCADE;
TRUNCATE ordine_fasi      CASCADE;
TRUNCATE non_conformita   CASCADE;
TRUNCATE archivio_log     CASCADE;
TRUNCATE allegati         CASCADE;
TRUNCATE notifiche        CASCADE;
TRUNCATE ordini           CASCADE;
TRUNCATE fasi             CASCADE;
SELECT setval('ordini_codice_seq', 1, false);

-- 2. Sostituisci tipologia con struttura + tipo_prodotto + materiale
ALTER TABLE ordini DROP COLUMN IF EXISTS tipologia;
ALTER TABLE ordini
  ADD COLUMN IF NOT EXISTS struttura TEXT NOT NULL DEFAULT 'quattro_lati'
    CHECK (struttura IN ('quattro_lati', 'barra_l', 'complanare')),
  ADD COLUMN IF NOT EXISTS tipo_prodotto TEXT NOT NULL DEFAULT 'portoncino'
    CHECK (tipo_prodotto IN ('portoncino', 'battente')),
  ADD COLUMN IF NOT EXISTS materiale TEXT NOT NULL DEFAULT 'placchetta';

-- 3. Inserisci le 20 fasi reali
INSERT INTO fasi (id, nome, descrizione) VALUES
  (1,  'Prelievo e Taglio Lamellare',
       'Prelievo materia prima e taglio lamellare alle dimensioni di progetto'),
  (2,  'Trafilatura Lamellare',
       'Trafilatura del materiale lamellare'),
  (3,  'Foratura CNC Lamellare',
       'Foratura CNC del lamellare — CNC ★'),
  (4,  'Composizione Sandwich',
       'Composizione dei layer del pannello sandwich'),
  (5,  'Incollaggio Sandwich',
       'Incollaggio dei componenti sandwich'),
  (6,  'Squadratura CNC Sandwich',
       'Squadratura CNC del sandwich — CNC ★'),
  (7,  'Prelievo e Taglio Supporti 6mm',
       'Prelievo e taglio dei supporti da 6mm'),
  (8,  'Incollaggio Tranciato su Supporti',
       'Incollaggio del tranciato sui supporti — N/A se materiale MDF'),
  (9,  'Attesa Struttura',
       'Attesa struttura esterna — N/A se Barra ad L o Complanare'),
  (10, 'Chiusura Strettoio',
       '4 Lati: Chiusura Struttura Strettoio | Barra L/Comp: Chiusura Strettoio Struttura + Sandwich'),
  (11, 'Incollaggio Struttura + Sandwich',
       'Incollaggio struttura e sandwich — N/A se Barra ad L o Complanare'),
  (12, 'Calibratura Post',
       '4 Lati: Calibratura Post Incollaggio | Barra L/Comp: Calibratura Post Strettoio'),
  (13, 'Incollaggio Supporti su Anta',
       'Incollaggio dei supporti sull''anta'),
  (14, 'CNC Anta',
       'Lavorazione CNC sull''anta — CNC ★'),
  (15, 'Calibratura Finale',
       'Calibratura finale dell''anta'),
  (16, 'Imballaggio Pronto Consegna',
       'Imballaggio e preparazione per la consegna'),
  (17, 'Prelievo e Taglio Telaio',
       'Prelievo e taglio del materiale telaio — N/A se Battente'),
  (18, 'Trafilatura Telaio',
       'Trafilatura del telaio — N/A se Battente'),
  (19, 'CNC Telaio',
       'Lavorazione CNC del telaio — CNC ★ — N/A se Battente'),
  (20, 'Calibratura e Pulizia Finale Telaio',
       'Calibratura e pulizia finale del telaio — N/A se Battente');

-- 4. Aggiorna trigger con logica N/A automatica
CREATE OR REPLACE FUNCTION crea_fasi_per_ordine()
RETURNS TRIGGER AS $$
DECLARE
  v_struttura   TEXT;
  v_tipo_prod   TEXT;
  v_materiale   TEXT;
  v_stato       stato_fase;
  f             RECORD;
BEGIN
  -- Ordini extra: nessuna fase standard (le fasi sono in fasi_ordine_extra)
  IF NEW.tipo = 'extra' THEN
    RETURN NEW;
  END IF;

  v_struttura  := LOWER(COALESCE(NEW.struttura, ''));
  v_tipo_prod  := LOWER(COALESCE(NEW.tipo_prodotto, ''));
  v_materiale  := LOWER(COALESCE(NEW.materiale, ''));

  FOR f IN SELECT id FROM fasi ORDER BY id LOOP
    v_stato := 'disponibile'::stato_fase;

    -- F8: N/A se MDF
    IF f.id = 8 AND v_materiale LIKE '%mdf%' THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;

    -- F9: N/A se Barra ad L o Complanare
    IF f.id = 9 AND (v_struttura = 'barra_l' OR v_struttura = 'complanare') THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;

    -- F11: N/A se Barra ad L o Complanare
    IF f.id = 11 AND (v_struttura = 'barra_l' OR v_struttura = 'complanare') THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;

    -- F17-F20: N/A se Battente (non ha telaio)
    IF f.id BETWEEN 17 AND 20 AND v_tipo_prod = 'battente' THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;

    INSERT INTO ordine_fasi (ordine_id, fase_id, stato)
    VALUES (NEW.id, f.id, v_stato);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ricrea il trigger (nel caso non esistesse giá)
DROP TRIGGER IF EXISTS trg_crea_fasi_ordine ON ordini;
CREATE TRIGGER trg_crea_fasi_ordine
  AFTER INSERT ON ordini
  FOR EACH ROW EXECUTE FUNCTION crea_fasi_per_ordine();

-- ══════════════════════════════════════════════════
-- FINE MIGRAZIONE v2
-- ══════════════════════════════════════════════════
