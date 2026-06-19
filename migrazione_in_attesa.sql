-- ================================================================
-- MANGO SRL — Migrazione stato IN_ATTESA + logica subentro
--
-- ESEGUI IN DUE PASSI NEL SQL EDITOR DI SUPABASE:
--   PASSO 1 → esegui ognuna delle ALTER TYPE DA SOLA (una alla volta)
--   PASSO 2 → esegui tutto il resto insieme
-- ================================================================

-- ════════════ PASSO 1 — esegui ogni riga da sola ════════════
ALTER TYPE stato_fase    ADD VALUE IF NOT EXISTS 'in_attesa';
ALTER TYPE tipo_notifica ADD VALUE IF NOT EXISTS 'fase_ripresa';
ALTER TYPE azione_log    ADD VALUE IF NOT EXISTS 'fase_messa_in_attesa';
ALTER TYPE azione_log    ADD VALUE IF NOT EXISTS 'fase_ripresa';
-- ════════════════════════════════════════════════════════════



-- ════════════ PASSO 2 — esegui dopo il PASSO 1 ════════════

-- 1. Aggiorna trigger check_lock_fase per gestire in_attesa
CREATE OR REPLACE FUNCTION check_lock_fase()
RETURNS TRIGGER AS $$
BEGIN
  -- Popola iniziata_il la prima volta che passa a in_corso
  IF NEW.stato = 'in_corso' AND OLD.stato = 'disponibile' THEN
    NEW.iniziata_il := NOW();
  END IF;
  -- Popola completata_il quando viene completata (da qualsiasi stato attivo)
  IF NEW.stato = 'completata' AND OLD.stato IN ('in_corso', 'in_attesa') THEN
    NEW.completata_il := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 2. RPC: Metti in attesa (solo l'operatore che ha in carico la fase)
CREATE OR REPLACE FUNCTION metti_in_attesa(
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
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata');
  END IF;

  IF v_fase.stato <> 'in_corso' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'La fase non è in corso');
  END IF;

  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Non sei l''operatore assegnato a questa fase');
  END IF;

  -- Ordine non deve essere sospeso
  IF EXISTS (SELECT 1 FROM ordini WHERE id = v_fase.ordine_id AND stato = 'sospeso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Ordine sospeso');
  END IF;

  UPDATE ordine_fasi SET stato = 'in_attesa' WHERE id = p_ordine_fase_id;

  INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_messa_in_attesa',
          jsonb_build_object('ordine_fase_id', p_ordine_fase_id));

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- 3. RPC: Riprendi / subentra su una fase
--    - in_attesa → chiunque può riprendere liberamente
--    - in_corso di un altro → richiede p_forza = TRUE (confermato dall'operatore nel dialog)
--    Notifica sempre al vecchio operatore se è diverso da chi riprende
CREATE OR REPLACE FUNCTION riprendi_fase(
  p_ordine_fase_id UUID,
  p_operatore_id   UUID,
  p_forza          BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fase       ordine_fasi%ROWTYPE;
  v_vecchio_op UUID;
  v_nome_nuovo TEXT;
BEGIN
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata');
  END IF;

  IF v_fase.stato NOT IN ('in_attesa', 'in_corso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'La fase non è riprendibile (stato: ' || v_fase.stato || ')');
  END IF;

  -- Fase in_corso di un altro: richiede conferma esplicita
  IF v_fase.stato = 'in_corso'
     AND v_fase.operatore_id IS DISTINCT FROM p_operatore_id
     AND NOT p_forza THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase già in corso da un altro operatore',
                              'richiede_conferma', true,
                              'operatore_corrente', v_fase.operatore_id);
  END IF;

  -- Se è già mia e in_corso, niente da fare
  IF v_fase.stato = 'in_corso' AND v_fase.operatore_id = p_operatore_id THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_vecchio_op := v_fase.operatore_id;

  -- Recupera nome del nuovo operatore per la notifica
  SELECT nome || ' ' || cognome INTO v_nome_nuovo FROM users WHERE id = p_operatore_id;

  UPDATE ordine_fasi
  SET stato        = 'in_corso',
      operatore_id = p_operatore_id,
      iniziata_il  = COALESCE(v_fase.iniziata_il, NOW())
  WHERE id = p_ordine_fase_id;

  -- Log
  INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_ripresa',
          jsonb_build_object(
            'vecchio_operatore', v_vecchio_op,
            'stato_precedente',  v_fase.stato
          ));

  -- Notifica al vecchio operatore (se esiste ed è diverso da chi riprende)
  IF v_vecchio_op IS NOT NULL AND v_vecchio_op IS DISTINCT FROM p_operatore_id THEN
    INSERT INTO notifiche (destinatario_id, tipo, testo, ordine_id)
    VALUES (
      v_vecchio_op,
      'fase_ripresa',
      v_nome_nuovo || ' ha ripreso la fase ' || v_fase.fase_id ||
        CASE WHEN v_fase.stato = 'in_corso' THEN ' (subentro)' ELSE ' (ripresa da in attesa)' END,
      v_fase.ordine_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ════════════════════════════════════════════════════════════
-- FINE MIGRAZIONE IN_ATTESA
-- ════════════════════════════════════════════════════════════
