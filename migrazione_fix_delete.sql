-- ================================================================
-- MANGO SRL — Fix eliminazione ordini (soft-delete)
-- Esegui nell'SQL Editor di Supabase
-- ================================================================

-- Aggiunge colonna eliminato a ordini (default false = visibile)
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS eliminato BOOLEAN NOT NULL DEFAULT FALSE;

-- Indice per filtrare rapidamente
CREATE INDEX IF NOT EXISTS idx_ordini_eliminato ON ordini(eliminato) WHERE eliminato = FALSE