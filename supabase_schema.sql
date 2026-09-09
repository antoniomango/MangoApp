--
-- MangoApp — schema dump di produzione (mango-produzione, mtpzfxnyfkzikzlkomwz), schema public
-- Generato con pg_dump 17.6 (binario locale in pgsql/bin, versione identica al server —
-- niente Docker necessario), --schema-only --schema=public.
-- Non include dati, né gli schemi auth/storage/cron (gestiti da Supabase).
--
-- Rigenerare dopo ogni migration rilevante — vedi CLAUDE.md.
--
--
-- PostgreSQL database dump
--

\restrict k1QdIfcQheB1jeCpvB52caa0xnN3rhuO7Wk6yzhFlZxcHabiaqyoTZ0dalgGTnM

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: azione_log; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.azione_log AS ENUM (
    'fase_iniziata',
    'fase_completata',
    'fase_riassegnata',
    'nc_segnalata',
    'nc_chiusa',
    'ordine_sospeso',
    'ordine_riattivato',
    'ordine_spedito',
    'ordine_creato',
    'fase_messa_in_attesa',
    'fase_ripresa',
    'fase_confermata_ricezione',
    'fase_annullata',
    'ordine_modificato',
    'fase_pausa_automatica',
    'fase_riaperta',
    'fase_eliminata'
);


ALTER TYPE public.azione_log OWNER TO postgres;

--
-- Name: priorita_ordine; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.priorita_ordine AS ENUM (
    'normale',
    'urgente',
    'extra_urgente'
);


ALTER TYPE public.priorita_ordine OWNER TO postgres;

--
-- Name: ruolo_utente; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ruolo_utente AS ENUM (
    'responsabile',
    'operatore',
    'sola_lettura'
);


ALTER TYPE public.ruolo_utente OWNER TO postgres;

--
-- Name: stato_fase; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.stato_fase AS ENUM (
    'disponibile',
    'in_corso',
    'completata',
    'non_applicabile',
    'in_attesa',
    'bloccata'
);


ALTER TYPE public.stato_fase OWNER TO postgres;

--
-- Name: stato_nc; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.stato_nc AS ENUM (
    'aperta',
    'approvata',
    'chiusa'
);


ALTER TYPE public.stato_nc OWNER TO postgres;

--
-- Name: stato_ordine; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.stato_ordine AS ENUM (
    'aperto',
    'sospeso',
    'spedito',
    'attesa_spedizione'
);


ALTER TYPE public.stato_ordine OWNER TO postgres;

--
-- Name: tipo_notifica; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.tipo_notifica AS ENUM (
    'nc_segnalata',
    'ordine_in_ritardo',
    'fase_riassegnata',
    'fase_ripresa',
    'ordine_creato',
    'ordine_pronto_spedizione',
    'ordine_sospeso',
    'comunicazione'
);


ALTER TYPE public.tipo_notifica OWNER TO postgres;

--
-- Name: tipologia_ordine; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.tipologia_ordine AS ENUM (
    '4_lati',
    'barra_l',
    'complanare',
    'battente'
);


ALTER TYPE public.tipologia_ordine OWNER TO postgres;

--
-- Name: aggiorna_criteri_fase(smallint, text[], text[], text[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiorna_criteri_fase(p_fase_id smallint, p_tipi_prodotto text[], p_materiali text[], p_strutture text[] DEFAULT '{}'::text[], p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ricalcolo JSONB;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  DELETE FROM fase_tipi_prodotto WHERE fase_id = p_fase_id;
  IF array_length(p_tipi_prodotto, 1) > 0 THEN
    INSERT INTO fase_tipi_prodotto (fase_id, tipo_prodotto_id)
    SELECT p_fase_id, unnest(p_tipi_prodotto);
  END IF;

  DELETE FROM fase_materiali WHERE fase_id = p_fase_id;
  IF array_length(p_materiali, 1) > 0 THEN
    INSERT INTO fase_materiali (fase_id, materiale_valore)
    SELECT p_fase_id, unnest(p_materiali);
  END IF;

  DELETE FROM fase_strutture WHERE fase_id = p_fase_id;
  IF array_length(p_strutture, 1) > 0 THEN
    INSERT INTO fase_strutture (fase_id, struttura_valore)
    SELECT p_fase_id, unnest(p_strutture);
  END IF;

  SELECT public.ricalcola_fase_su_ordini_esistenti(p_fase_id, p_responsabile_id, p_session_token)
  INTO v_ricalcolo;

  RETURN jsonb_build_object('ok', true, 'ricalcolo', v_ricalcolo);
END;
$$;


ALTER FUNCTION public.aggiorna_criteri_fase(p_fase_id smallint, p_tipi_prodotto text[], p_materiali text[], p_strutture text[], p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: aggiorna_operatore(uuid, text, text, public.ruolo_utente, numeric, boolean, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiorna_operatore(p_operatore_id uuid, p_nome text, p_cognome text, p_ruolo public.ruolo_utente, p_ore_default numeric, p_escluso_pianificazione boolean, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ruolo_precedente ruolo_utente;
  v_count_responsabili integer;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile' AND attivo=TRUE AND eliminato IS DISTINCT FROM TRUE) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT ruolo INTO v_ruolo_precedente FROM public.users WHERE id = p_operatore_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'utente_non_trovato');
  END IF;

  IF p_operatore_id = p_responsabile_id AND p_ruolo IS DISTINCT FROM v_ruolo_precedente THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'auto_cambio_ruolo_non_consentito');
  END IF;

  IF v_ruolo_precedente = 'responsabile' AND p_ruolo IS DISTINCT FROM v_ruolo_precedente THEN
    SELECT count(*) INTO v_count_responsabili FROM public.users
      WHERE ruolo = 'responsabile' AND attivo = TRUE AND eliminato IS DISTINCT FROM TRUE;
    IF v_count_responsabili <= 1 THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'ultimo_responsabile');
    END IF;
  END IF;

  UPDATE public.users
  SET nome = p_nome,
      cognome = p_cognome,
      ruolo = p_ruolo,
      ore_default = p_ore_default,
      escluso_pianificazione = p_escluso_pianificazione
  WHERE id = p_operatore_id;

  RETURN jsonb_build_object('ok', true, 'ruolo_precedente', v_ruolo_precedente, 'ruolo_nuovo', p_ruolo);
END;
$$;


ALTER FUNCTION public.aggiorna_operatore(p_operatore_id uuid, p_nome text, p_cognome text, p_ruolo public.ruolo_utente, p_ore_default numeric, p_escluso_pianificazione boolean, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: aggiorna_pin_operatore(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiorna_pin_operatore(p_operatore_id uuid, p_nuovo_pin text, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF p_responsabile_id IS NULL THEN RETURN json_build_object('ok', false, 'errore', 'responsabile_id_obbligatorio'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile' AND attivo=TRUE AND eliminato IS DISTINCT FROM TRUE) THEN
    RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_nuovo_pin !~ '^\d{4}$' THEN RETURN json_build_object('ok', false, 'errore', 'pin_non_valido'); END IF;
  UPDATE public.users SET pin_hash=extensions.crypt(p_nuovo_pin, extensions.gen_salt('bf')) WHERE id=p_operatore_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'errore', 'utente_non_trovato'); END IF;
  RETURN json_build_object('ok', true);
END;
$_$;


ALTER FUNCTION public.aggiorna_pin_operatore(p_operatore_id uuid, p_nuovo_pin text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: aggiorna_tipo_prodotto(text, text, integer, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiorna_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  UPDATE public.tipi_prodotto SET label=trim(p_label), posizione=COALESCE(p_posizione, posizione) WHERE id=p_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'errore', 'non_trovato'); END IF;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.aggiorna_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: aggiungi_collega_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiungi_collega_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  INSERT INTO fasi_extra_operatori(fasi_ordine_extra_id, operatore_id) VALUES(p_fase_extra_id, p_operatore_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.aggiungi_collega_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: aggiungi_collega_fase(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiungi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_richiedente_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_richiedente_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF p_collega_id IS DISTINCT FROM p_richiedente_id THEN
    IF v_fase.operatore_id IS DISTINCT FROM p_richiedente_id
       AND NOT EXISTS (SELECT 1 FROM ordine_fasi_operatori WHERE ordine_fase_id=p_ordine_fase_id AND operatore_id=p_richiedente_id)
       AND NOT EXISTS (SELECT 1 FROM users WHERE id=p_richiedente_id AND ruolo='responsabile') THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
    END IF;
  END IF;
  INSERT INTO ordine_fasi_operatori(ordine_fase_id, operatore_id)
  VALUES(p_ordine_fase_id, p_collega_id) ON CONFLICT DO NOTHING;
  IF p_collega_id = p_richiedente_id THEN
    BEGIN
    INSERT INTO archivio_log(ordine_id, utente_id, azione, dettaglio)
    VALUES(v_fase.ordine_id, p_richiedente_id, 'fase_iniziata',
           jsonb_build_object('unione', true, 'ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  ELSE
    BEGIN
    INSERT INTO archivio_log(ordine_id, utente_id, azione, dettaglio)
    VALUES(v_fase.ordine_id, p_richiedente_id, 'fase_iniziata',
           jsonb_build_object('aggiunto_da', p_richiedente_id, 'operatore_id', p_collega_id, 'ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.aggiungi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: aggiungi_tipo_prodotto(text, text, integer, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.aggiungi_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_id IS NULL OR trim(p_id)='' OR p_label IS NULL OR trim(p_label)='' THEN
    RETURN json_build_object('ok', false, 'errore', 'dati_mancanti');
  END IF;
  INSERT INTO public.tipi_prodotto (id, label, posizione)
    VALUES (lower(trim(p_id)), trim(p_label), COALESCE(p_posizione, 0)) ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'errore', 'id_gia_esistente'); END IF;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.aggiungi_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: annulla_fasi_ordine_eliminato(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.annulla_fasi_ordine_eliminato(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fasi_agg INT := 0;
  v_extra_agg INT := 0;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  -- Le fasi non ancora completate di un ordine eliminato non rappresentano più lavoro reale:
  -- passano a 'non_applicabile' (significato esatto nell'enum: fase che non va eseguita).
  -- Mai le 'completata' (traccia del lavoro davvero svolto) né le 'in_corso' (interrompere un
  -- lavoro attivo è una decisione diversa, non presa qui — vedi nota nel report/vault).
  UPDATE ordine_fasi SET stato = 'non_applicabile'
  WHERE ordine_id = p_ordine_id AND stato IN ('disponibile', 'in_attesa');
  GET DIAGNOSTICS v_fasi_agg = ROW_COUNT;

  UPDATE fasi_ordine_extra SET stato = 'non_applicabile'
  WHERE ordine_id = p_ordine_id AND stato IN ('disponibile', 'in_attesa');
  GET DIAGNOSTICS v_extra_agg = ROW_COUNT;

  -- Il log è accessorio: un suo fallimento non deve annullare le UPDATE già applicate sopra
  -- (stesso principio del job pausa-automatica-fine-turno).
  BEGIN
    INSERT INTO archivio_log (ordine_id, utente_id, azione, dettaglio)
    VALUES (p_ordine_id, p_responsabile_id, 'ordine_modificato',
            jsonb_build_object('motivo', 'ordine_eliminato', 'fasi_annullate', v_fasi_agg, 'fasi_extra_annullate', v_extra_agg));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log ordine_eliminato non scritto per ordine %: %', p_ordine_id, SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'fasi_annullate', v_fasi_agg, 'fasi_extra_annullate', v_extra_agg);
END;
$$;


ALTER FUNCTION public.annulla_fasi_ordine_eliminato(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: annulla_presa_in_carico(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.annulla_presa_in_carico(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'responsabile' AND attivo = TRUE) THEN
      RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
    END IF;
  END IF;
  DELETE FROM ordine_fasi_operatori WHERE ordine_fase_id = p_ordine_fase_id;
  UPDATE ordine_fasi SET stato='disponibile', operatore_id=NULL, iniziata_il=NULL, completata_il=NULL WHERE id=p_ordine_fase_id;
  RETURN json_build_object('ok', true, 'rimasti', 0);
END;
$$;


ALTER FUNCTION public.annulla_presa_in_carico(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: annulla_presa_in_carico_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.annulla_presa_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase fasi_ordine_extra%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_operatore_id AND ruolo='responsabile' AND attivo=TRUE) THEN
      RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
    END IF;
  END IF;
  DELETE FROM fasi_extra_operatori WHERE fasi_ordine_extra_id = p_fase_extra_id;
  UPDATE fasi_ordine_extra SET stato='disponibile', operatore_id=NULL, iniziata_il=NULL, completata_il=NULL WHERE id=p_fase_extra_id;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.annulla_presa_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: archivia_ordine(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.archivia_ordine(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_urls text[];
BEGIN
  IF p_ordine_id IS NULL THEN
    RAISE EXCEPTION 'ordine_id_obbligatorio' USING ERRCODE = '22004';
  END IF;

  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RAISE EXCEPTION 'sessione_non_valida' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_responsabile_id
      AND ruolo = 'responsabile'
      AND attivo = true
      AND eliminato IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'non_autorizzato' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(a.url_file) INTO v_urls
  FROM allegati a
  WHERE a.ordine_fase_id IN (SELECT id FROM ordine_fasi WHERE ordine_id = p_ordine_id);

  DELETE FROM allegati
  WHERE ordine_fase_id IN (
    SELECT id FROM ordine_fasi WHERE ordine_id = p_ordine_id
  );

  UPDATE ordini SET archiviato_il = NOW() WHERE id = p_ordine_id;

  RETURN jsonb_build_object('ok', true, 'url_eliminati', COALESCE(v_urls, '{}'));
END;
$$;


ALTER FUNCTION public.archivia_ordine(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: autorizza_upload_allegato(uuid, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ordine_esiste boolean;
  v_fase_ordine_id uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_user_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.ordini WHERE id = p_ordine_id) INTO v_ordine_esiste;
  IF NOT v_ordine_esiste THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'ordine_non_trovato');
  END IF;

  IF p_tipo = 'fase' THEN
    IF p_ordine_fase_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'ordine_fase_id_obbligatorio');
    END IF;
    SELECT ordine_id INTO v_fase_ordine_id FROM public.ordine_fasi WHERE id = p_ordine_fase_id;
    IF v_fase_ordine_id IS NULL OR v_fase_ordine_id <> p_ordine_id THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_coerente');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid) OWNER TO postgres;

--
-- Name: avanzamento_fasi_batch(uuid, uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.avanzamento_fasi_batch(p_operatore_id uuid, p_session_token uuid, p_ordine_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'ordine_fasi', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('ordine_id', of.ordine_id, 'fase_id', of.fase_id, 'stato', of.stato)), '[]'::jsonb)
      FROM ordine_fasi of
      WHERE of.ordine_id = ANY(p_ordine_ids)
    ),
    'fasi_extra', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('ordine_id', fe.ordine_id, 'nome', fe.nome, 'stato', fe.stato, 'numero', fe.numero) ORDER BY fe.numero), '[]'::jsonb)
      FROM fasi_ordine_extra fe
      WHERE fe.ordine_id = ANY(p_ordine_ids)
    )
  ));
END;
$$;


ALTER FUNCTION public.avanzamento_fasi_batch(p_operatore_id uuid, p_session_token uuid, p_ordine_ids uuid[]) OWNER TO postgres;

--
-- Name: calcola_tempo_combinazione(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calcola_tempo_combinazione(p_criteri jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(ore_lavorazione_interna numeric, giorni_calendario numeric, n_campioni integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH ordini_filtrati AS (
    SELECT o.id, o.creato_il, COALESCE(o.spedito_il, o.completato_il) AS chiusura_il
    FROM ordini o
    WHERE COALESCE(o.spedito_il, o.completato_il) IS NOT NULL
      AND o.creato_il IS NOT NULL
      AND (p_criteri->'struttura' IS NULL OR jsonb_array_length(p_criteri->'struttura') = 0
           OR o.struttura = ANY(ARRAY(SELECT jsonb_array_elements_text(p_criteri->'struttura'))))
      AND (p_criteri->'materiale' IS NULL OR jsonb_array_length(p_criteri->'materiale') = 0
           OR o.materiale = ANY(ARRAY(SELECT jsonb_array_elements_text(p_criteri->'materiale'))))
      AND (p_criteri->'tipo_prodotto' IS NULL OR jsonb_array_length(p_criteri->'tipo_prodotto') = 0
           OR o.tipo_prodotto = ANY(ARRAY(SELECT jsonb_array_elements_text(p_criteri->'tipo_prodotto'))))
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p_criteri->'fasi_incluse', '[]'::jsonb)) fi_val
        WHERE NOT EXISTS (
          SELECT 1 FROM ordine_fasi of2
          WHERE of2.ordine_id = o.id AND of2.fase_id = (fi_val#>>'{}')::smallint AND of2.stato = 'completata'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p_criteri->'fasi_escluse', '[]'::jsonb)) fe_val
        WHERE EXISTS (
          SELECT 1 FROM ordine_fasi of2
          WHERE of2.ordine_id = o.id AND of2.fase_id = (fe_val#>>'{}')::smallint AND of2.stato != 'non_applicabile'
        )
      )
  ),
  ore_per_ordine AS (
    SELECT of2.ordine_id,
      SUM(of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch, 1)) / 60.0 AS ore_interne
    FROM ordine_fasi of2
    JOIN fasi f ON f.id = of2.fase_id
    JOIN ordini_filtrati ofd ON ofd.id = of2.ordine_id
    WHERE of2.stato = 'completata'
      AND of2.tempo_accumulato_minuti > 0
      AND of2.completata_il IS NOT NULL
      AND NOT COALESCE(f.e_attesa_esterna, false)
    GROUP BY of2.ordine_id
  ),
  giorni_per_ordine AS (
    SELECT ofd.id AS ordine_id,
      EXTRACT(EPOCH FROM (ofd.chiusura_il - ofd.creato_il)) / 86400.0 AS giorni_cal
    FROM ordini_filtrati ofd
  )
  SELECT
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY opo.ore_interne)::numeric, 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gpo.giorni_cal)::numeric, 1),
    COUNT(DISTINCT ofd.id)::integer
  FROM ordini_filtrati ofd
  LEFT JOIN ore_per_ordine     opo ON opo.ordine_id = ofd.id
  LEFT JOIN giorni_per_ordine  gpo ON gpo.ordine_id = ofd.id;
END;
$$;


ALTER FUNCTION public.calcola_tempo_combinazione(p_criteri jsonb) OWNER TO postgres;

--
-- Name: capacita_produttiva_stimata(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.capacita_produttiva_stimata() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_settimane       integer;
  v_backlog_ore     numeric;
  v_ore_settimana   numeric;
  v_smaltimento     numeric;
  v_fallback_extra  numeric;
  v_default_extra   numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non_autenticato'; END IF;
  SELECT COALESCE(MAX(valore)::integer, 6) INTO v_settimane    FROM kpi_config WHERE chiave = 'settimane_storico_capacita';
  SELECT COALESCE(MAX(valore), 30)         INTO v_default_extra FROM kpi_config WHERE chiave = 'durata_default_fase_extra_minuti';

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY tempo_accumulato_minuti::numeric / GREATEST(n_ordini_batch,1)
  ) INTO v_fallback_extra
  FROM fasi_ordine_extra WHERE stato = 'completata' AND tempo_accumulato_minuti > 0;
  v_fallback_extra := COALESCE(v_fallback_extra, v_default_extra);

  WITH mediane AS (
    SELECT of2.fase_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch,1) / GREATEST(o.quantita,1)
      ) AS med_min
    FROM ordine_fasi of2
    JOIN ordini o ON o.id = of2.ordine_id
    JOIN fasi f   ON f.id = of2.fase_id
    WHERE of2.stato = 'completata'
      AND of2.tempo_accumulato_minuti > 0
      AND NOT COALESCE(f.e_attesa_esterna, false)
    GROUP BY of2.fase_id
  )
  SELECT COALESCE(SUM(
    CASE of2.stato
      WHEN 'in_corso' THEN COALESCE(m.med_min,0) * 0.5
      ELSE                  COALESCE(m.med_min,0)
    END
  ) / 60, 0)
  INTO v_backlog_ore
  FROM ordine_fasi of2
  JOIN fasi f ON f.id = of2.fase_id
  JOIN ordini o ON o.id = of2.ordine_id
  LEFT JOIN mediane m ON m.fase_id = of2.fase_id
  WHERE of2.stato IN ('disponibile','in_corso')
    AND NOT COALESCE(f.e_attesa_esterna, false)
    AND o.stato IN ('aperto','attesa_spedizione')
    AND COALESCE(o.eliminato, false) = false;

  WITH mediane_extra AS (
    SELECT lower(nome) AS nome_lower,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        tempo_accumulato_minuti::numeric / GREATEST(n_ordini_batch,1)
      ) AS med_min
    FROM fasi_ordine_extra
    WHERE stato = 'completata' AND tempo_accumulato_minuti > 0
    GROUP BY lower(nome)
    HAVING COUNT(*) >= 2
  )
  SELECT v_backlog_ore + COALESCE(SUM(
    CASE foe.stato
      WHEN 'in_corso' THEN COALESCE(me.med_min, v_fallback_extra) * 0.5
      ELSE                  COALESCE(me.med_min, v_fallback_extra)
    END
  ) / 60, 0)
  INTO v_backlog_ore
  FROM fasi_ordine_extra foe
  LEFT JOIN mediane_extra me ON me.nome_lower = lower(foe.nome)
  JOIN ordini o ON o.id = foe.ordine_id
  WHERE foe.stato IN ('disponibile','in_corso')
    AND NOT COALESCE(foe.e_attesa_esterna, false)
    AND o.stato IN ('aperto','attesa_spedizione')
    AND COALESCE(o.eliminato, false) = false;

  SELECT COALESCE(SUM(
    of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch,1) / GREATEST(o.quantita,1)
  ) / 60 / v_settimane, 0)
  INTO v_ore_settimana
  FROM ordine_fasi of2
  JOIN ordini o ON o.id = of2.ordine_id
  JOIN fasi f   ON f.id = of2.fase_id
  WHERE of2.stato = 'completata'
    AND of2.completata_il >= NOW() - (v_settimane * 7 || ' days')::interval
    AND of2.tempo_accumulato_minuti > 0
    AND NOT COALESCE(f.e_attesa_esterna, false);

  SELECT v_ore_settimana + COALESCE(SUM(
    foe.tempo_accumulato_minuti::numeric / GREATEST(foe.n_ordini_batch,1)
  ) / 60 / v_settimane, 0)
  INTO v_ore_settimana
  FROM fasi_ordine_extra foe
  WHERE foe.stato = 'completata'
    AND foe.completata_il >= NOW() - (v_settimane * 7 || ' days')::interval
    AND foe.tempo_accumulato_minuti > 0
    AND NOT COALESCE(foe.e_attesa_esterna, false);

  v_smaltimento := CASE
    WHEN v_ore_settimana > 0 THEN ROUND((v_backlog_ore / v_ore_settimana)::numeric, 1)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'backlog_ore',           ROUND(v_backlog_ore::numeric, 1),
    'ore_per_settimana',     ROUND(v_ore_settimana::numeric, 1),
    'settimane_smaltimento', v_smaltimento,
    'settimane_storico',     v_settimane
  );
END;
$$;


ALTER FUNCTION public.capacita_produttiva_stimata() OWNER TO postgres;

--
-- Name: check_lock_fase(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_lock_fase() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.stato = 'in_corso' AND OLD.stato = 'disponibile' THEN
    NEW.iniziata_il := NOW();
  END IF;
  IF NEW.stato = 'completata' AND OLD.stato IN ('in_corso', 'in_attesa') THEN
    NEW.completata_il := NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_lock_fase() OWNER TO postgres;

--
-- Name: check_ordine_completato(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_ordine_completato() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.stato IN ('completata', 'non_applicabile', 'in_attesa') THEN
    IF NOT EXISTS (
      SELECT 1 FROM ordine_fasi
      WHERE ordine_id = NEW.ordine_id
      AND stato IN ('disponibile', 'in_corso')
    ) THEN
      UPDATE ordini
      SET stato = 'attesa_spedizione', completato_il = NOW()
      WHERE id = NEW.ordine_id
      AND stato NOT IN ('spedito', 'attesa_spedizione', 'sospeso');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_ordine_completato() OWNER TO postgres;

--
-- Name: check_ordine_extra_completato(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_ordine_extra_completato() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.stato = 'completata' THEN
    IF NOT EXISTS (
      SELECT 1 FROM fasi_ordine_extra
      WHERE ordine_id = NEW.ordine_id
      AND stato IN ('disponibile', 'in_corso')
    ) THEN
      UPDATE ordini
      SET stato = 'attesa_spedizione', completato_il = NOW()
      WHERE id = NEW.ordine_id
      AND stato NOT IN ('spedito', 'attesa_spedizione', 'sospeso');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_ordine_extra_completato() OWNER TO postgres;

--
-- Name: colleghi_disponibili(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.colleghi_disponibili(p_operatore_id uuid, p_session_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'cognome', u.cognome) ORDER BY u.cognome), '[]'::jsonb)
    FROM users u
    WHERE u.attivo = true AND u.ruolo = 'operatore'
  ));
END;
$$;


ALTER FUNCTION public.colleghi_disponibili(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: completa_fase(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.completa_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_note_operatore text DEFAULT NULL::text, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fase   ordine_fasi%ROWTYPE;
  v_tg     text;
  v_durata numeric;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.fase_id IS NOT NULL THEN
    SELECT tipo_gestione INTO v_tg FROM fasi WHERE id = v_fase.fase_id;
    IF v_tg IS DISTINCT FROM 'standard' THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'usa_conferma_ricezione',
                                'tipo_gestione', v_tg, 'messaggio', 'Usa il pulsante specifico per questo tipo di fase');
    END IF;
  END IF;
  IF v_fase.stato <> 'in_corso' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_in_corso', 'stato', v_fase.stato);
  END IF;
  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id
     AND NOT EXISTS (SELECT 1 FROM ordine_fasi_operatori WHERE ordine_fase_id = p_ordine_fase_id AND operatore_id = p_operatore_id)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  v_durata := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_fase.iniziata_il)) / 60);
  UPDATE ordine_fasi
  SET stato = 'completata', completata_il = NOW(),
      note_operatore = COALESCE(p_note_operatore, note_operatore),
      tempo_accumulato_minuti = COALESCE(tempo_accumulato_minuti, 0) + v_durata
  WHERE id = p_ordine_fase_id;
  BEGIN
    INSERT INTO archivio_log(ordine_id, utente_id, azione, dettaglio)
  VALUES(v_fase.ordine_id, p_operatore_id, 'fase_completata',
         jsonb_build_object('ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.completa_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_note_operatore text, p_session_token uuid) OWNER TO postgres;

--
-- Name: completa_fase_extra(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.completa_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_note text DEFAULT NULL::text, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fase fasi_ordine_extra%ROWTYPE;
  v_durata numeric;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.stato <> 'in_corso' THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_in_corso'); END IF;
  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id
     AND NOT EXISTS (SELECT 1 FROM fasi_extra_operatori WHERE fasi_ordine_extra_id=p_fase_extra_id AND operatore_id=p_operatore_id)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id=p_operatore_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  v_durata := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_fase.iniziata_il)) / 60);
  UPDATE fasi_ordine_extra SET stato='completata', completata_il=NOW(), note_operatore=COALESCE(p_note, note_operatore),
    tempo_accumulato_minuti = COALESCE(tempo_accumulato_minuti, 0) + v_durata
  WHERE id=p_fase_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.completa_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_note text, p_session_token uuid) OWNER TO postgres;

--
-- Name: completa_fasi_batch(integer, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.completa_fasi_batch(p_fase_id integer, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INT;
  v_now TIMESTAMPTZ := NOW();
  v_dettaglio jsonb;
  v_ordine_rappresentativo uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.ordine_fasi
    WHERE fase_id=p_fase_id AND operatore_id=p_operatore_id AND stato='in_corso';
  IF v_count = 0 THEN RETURN json_build_object('ok', true, 'completate', 0); END IF;

  WITH aggiornate AS (
    UPDATE public.ordine_fasi SET stato='completata', completata_il=v_now,
      tempo_accumulato_minuti=COALESCE(tempo_accumulato_minuti,0)+GREATEST(0,EXTRACT(EPOCH FROM (v_now-iniziata_il))/60),
      n_ordini_batch=v_count
    WHERE fase_id=p_fase_id AND operatore_id=p_operatore_id AND stato='in_corso'
    RETURNING id, ordine_id
  )
  SELECT jsonb_agg(jsonb_build_object('ordine_fase_id', id, 'ordine_id', ordine_id)),
         (array_agg(ordine_id))[1]
  INTO v_dettaglio, v_ordine_rappresentativo
  FROM aggiornate;

  BEGIN
    INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
    VALUES (v_ordine_rappresentativo, p_fase_id, p_operatore_id, 'fase_completata',
            jsonb_build_object('batch', true, 'conteggio', v_count, 'fasi', v_dettaglio));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log batch non scritto: %', SQLERRM;
  END;

  RETURN json_build_object('ok', true, 'completate', v_count);
END;
$$;


ALTER FUNCTION public.completa_fasi_batch(p_fase_id integer, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: completa_fasi_extra_batch(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.completa_fasi_extra_batch(p_nome text, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INT;
  v_now TIMESTAMPTZ := NOW();
  v_min_iniziata TIMESTAMPTZ;
  v_tempo_batch numeric;
  v_dettaglio jsonb;
  v_ordine_rappresentativo uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT COUNT(*), MIN(iniziata_il) INTO v_count, v_min_iniziata
    FROM fasi_ordine_extra WHERE nome=p_nome AND operatore_id=p_operatore_id AND stato='in_corso';
  IF v_count = 0 THEN RETURN json_build_object('ok', false, 'errore', 'nessuna_fase_in_corso'); END IF;
  v_tempo_batch := CASE WHEN v_min_iniziata IS NOT NULL THEN EXTRACT(EPOCH FROM (v_now-v_min_iniziata))/60 ELSE NULL END;

  WITH aggiornate AS (
    UPDATE fasi_ordine_extra SET stato='completata', completata_il=v_now, n_ordini_batch=v_count, tempo_accumulato_minuti=v_tempo_batch
    WHERE nome=p_nome AND operatore_id=p_operatore_id AND stato='in_corso'
    RETURNING id, ordine_id
  )
  SELECT jsonb_agg(jsonb_build_object('fase_ordine_extra_id', id, 'ordine_id', ordine_id)),
         (array_agg(ordine_id))[1]
  INTO v_dettaglio, v_ordine_rappresentativo
  FROM aggiornate;

  BEGIN
    INSERT INTO archivio_log (ordine_id, utente_id, azione, dettaglio)
    VALUES (v_ordine_rappresentativo, p_operatore_id, 'fase_completata',
            jsonb_build_object('batch', true, 'extra', true, 'nome', p_nome, 'conteggio', v_count, 'fasi', v_dettaglio));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log batch extra non scritto: %', SQLERRM;
  END;

  RETURN json_build_object('ok', true, 'completate', v_count);
END;
$$;


ALTER FUNCTION public.completa_fasi_extra_batch(p_nome text, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: conferma_ricezione_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.conferma_ricezione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase fasi_ordine_extra%ROWTYPE; v_durata numeric;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.tipo_gestione <> 'spedizione_esterna' THEN RETURN jsonb_build_object('ok', false, 'errore', 'tipo_gestione_non_valido'); END IF;
  IF v_fase.stato <> 'in_attesa' THEN RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_in_attesa', 'stato', v_fase.stato); END IF;
  IF v_fase.spedita_il IS NULL THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_ancora_spedita'); END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_operatore_id AND ruolo='responsabile') THEN
    IF v_fase.operatore_id IS NOT NULL AND v_fase.operatore_id IS DISTINCT FROM p_operatore_id
       AND NOT EXISTS (SELECT 1 FROM fasi_extra_operatori WHERE fasi_ordine_extra_id=p_fase_extra_id AND operatore_id=p_operatore_id) THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
    END IF;
  END IF;
  v_durata := EXTRACT(EPOCH FROM (NOW() - v_fase.spedita_il)) / 60;
  UPDATE fasi_ordine_extra SET stato='completata', completata_il=NOW(), tempo_accumulato_minuti=v_durata, n_ordini_batch=1 WHERE id=p_fase_extra_id;
  RETURN jsonb_build_object('ok', true, 'durata_min', v_durata);
END;
$$;


ALTER FUNCTION public.conferma_ricezione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: conferma_ricezione_fase(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.conferma_ricezione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE; v_tg text; v_durata numeric;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  SELECT tipo_gestione INTO v_tg FROM fasi WHERE id = v_fase.fase_id;
  IF v_tg = 'conferma_ricezione' THEN
    IF v_fase.stato <> 'in_attesa' THEN RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_in_attesa', 'stato', v_fase.stato); END IF;
    v_durata := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(v_fase.iniziata_il, NOW()))) / 60);
  ELSIF v_tg = 'spedizione_esterna' THEN
    IF v_fase.stato <> 'in_attesa' THEN RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_in_attesa', 'stato', v_fase.stato); END IF;
    IF v_fase.spedita_il IS NULL THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_ancora_spedita', 'messaggio', 'Il pezzo non è ancora stato segnato come spedito.'); END IF;
    v_durata := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_fase.spedita_il)) / 60);
  ELSE
    RETURN jsonb_build_object('ok', false, 'errore', 'tipo_gestione_non_valido', 'tipo_gestione', v_tg);
  END IF;
  UPDATE ordine_fasi SET stato='completata', completata_il=NOW(),
    tempo_accumulato_minuti=COALESCE(tempo_accumulato_minuti,0)+v_durata, n_ordini_batch=1 WHERE id=p_ordine_fase_id;
  BEGIN
    INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
    VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_confermata_ricezione',
            jsonb_build_object('ordine_fase_id', p_ordine_fase_id, 'durata_min', v_durata));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN jsonb_build_object('ok', true, 'durata_min', v_durata);
END;
$$;


ALTER FUNCTION public.conferma_ricezione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: confronto_operatori_per_fase(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confronto_operatori_per_fase() RETURNS TABLE(fase_id smallint, fase_nome text, operatore_id uuid, operatore_nome text, mediana_min numeric, campioni bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  k_soglia_campioni int;
BEGIN
  SELECT COALESCE(valore::int, 5) INTO k_soglia_campioni
  FROM kpi_config WHERE chiave = 'soglia_campioni_op';
  k_soglia_campioni := COALESCE(k_soglia_campioni, 5);

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non_autenticato'; END IF;
  RETURN QUERY
  SELECT f.id::smallint, f.nome, u.id, (u.nome||' '||u.cognome)::text,
    CASE WHEN COUNT(*) >= k_soglia_campioni
      THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY of2.tempo_accumulato_minuti::numeric
          / GREATEST(of2.n_ordini_batch,1) / GREATEST(o.quantita,1)
      )::numeric, 0)
      ELSE NULL
    END,
    COUNT(*)::bigint
  FROM ordine_fasi of2
  JOIN ordini o ON o.id=of2.ordine_id
  JOIN fasi f ON f.id=of2.fase_id
  JOIN public.users u ON u.id=of2.operatore_id
  WHERE of2.stato='completata' AND of2.tempo_accumulato_minuti>0
    AND of2.completata_il IS NOT NULL AND of2.fase_id IS NOT NULL
    AND of2.operatore_id IS NOT NULL AND NOT COALESCE(f.e_attesa_esterna,false)
  GROUP BY f.id,f.nome,f.posizione,u.id,u.nome,u.cognome
  HAVING COUNT(*)>=1
  ORDER BY f.posizione,f.id, mediana_min NULLS LAST;
END;
$$;


ALTER FUNCTION public.confronto_operatori_per_fase() OWNER TO postgres;

--
-- Name: confronto_operatori_per_fase_extra(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confronto_operatori_per_fase_extra() RETURNS TABLE(catalogo_fase_extra_id uuid, fase_nome text, operatore_id uuid, operatore_nome text, mediana_min numeric, campioni bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  k_soglia_campioni int;
BEGIN
  SELECT COALESCE(valore::int, 5) INTO k_soglia_campioni
  FROM kpi_config WHERE chiave = 'soglia_campioni_op';
  k_soglia_campioni := COALESCE(k_soglia_campioni, 5);

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non_autenticato'; END IF;
  RETURN QUERY
  SELECT
    c.id,
    c.nome::text,
    u.id,
    (u.nome || ' ' || u.cognome)::text,
    CASE WHEN COUNT(*) >= k_soglia_campioni
      THEN ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY foe.tempo_accumulato_minuti::numeric
            / GREATEST(foe.n_ordini_batch, 1)
        )::numeric, 0)
      ELSE NULL
    END,
    COUNT(*)::bigint
  FROM fasi_ordine_extra foe
  JOIN catalogo_fasi_extra c ON c.id = foe.catalogo_fase_extra_id
  JOIN public.users        u ON u.id = foe.operatore_id
  WHERE foe.stato                       = 'completata'
    AND foe.tempo_accumulato_minuti     > 0
    AND foe.completata_il               IS NOT NULL
    AND foe.catalogo_fase_extra_id      IS NOT NULL
    AND foe.operatore_id                IS NOT NULL
    AND NOT c.e_attesa_esterna
  GROUP BY c.id, c.nome, u.id, u.nome, u.cognome
  HAVING COUNT(*) >= 1
  ORDER BY c.nome, u.cognome, mediana_min NULLS LAST;
END;
$$;


ALTER FUNCTION public.confronto_operatori_per_fase_extra() OWNER TO postgres;

--
-- Name: controlla_sessione(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.controlla_sessione(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valida', false, 'motivo', 'utente_non_trovato');
  END IF;
  IF v_user.attivo = false THEN
    RETURN jsonb_build_object('valida', false, 'motivo', 'disattivato');
  END IF;
  IF v_user.forzato_logout = true THEN
    UPDATE users SET forzato_logout = false WHERE id = p_user_id;
    RETURN jsonb_build_object('valida', false, 'motivo', 'forzato_logout');
  END IF;
  RETURN jsonb_build_object('valida', true);
END;
$$;


ALTER FUNCTION public.controlla_sessione(p_user_id uuid) OWNER TO postgres;

--
-- Name: crea_fasi_extra(uuid, jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.crea_fasi_extra(p_ordine_id uuid, p_fasi jsonb, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  INSERT INTO fasi_ordine_extra(ordine_id, numero, nome, tipo_gestione, e_attesa_esterna, note_responsabile, catalogo_fase_extra_id)
    SELECT
      p_ordine_id,
      (el->>'numero')::smallint,
      el->>'nome',
      COALESCE(NULLIF(el->>'tipo_gestione',''), 'standard'),
      COALESCE((el->>'e_attesa_esterna')::boolean, false),
      NULLIF(el->>'note_responsabile', ''),
      NULLIF(el->>'catalogo_fase_extra_id', '')::uuid
    FROM jsonb_array_elements(p_fasi) AS el;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.crea_fasi_extra(p_ordine_id uuid, p_fasi jsonb, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: crea_fasi_per_ordine(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.crea_fasi_per_ordine() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_struttura   TEXT;
  v_tipo_prod   TEXT;
  v_materiale   TEXT;
  v_stato       stato_fase;
  v_iniziata_il TIMESTAMPTZ;
  f             RECORD;
BEGIN
  IF NEW.tipo = 'extra' THEN RETURN NEW; END IF;

  v_struttura := LOWER(COALESCE(NEW.struttura, ''));
  v_tipo_prod := LOWER(COALESCE(NEW.tipo_prodotto, ''));
  v_materiale := LOWER(COALESCE(NEW.materiale, ''));

  FOR f IN
    SELECT
      fa.id,
      fa.opzionale,
      fa.avvio_automatico,
      ARRAY(SELECT ftp.tipo_prodotto_id FROM fase_tipi_prodotto ftp WHERE ftp.fase_id = fa.id) AS tipi_ids,
      ARRAY(SELECT fm.materiale_valore   FROM fase_materiali     fm  WHERE fm.fase_id  = fa.id) AS mat_valori,
      ARRAY(SELECT fs.struttura_valore   FROM fase_strutture     fs  WHERE fs.fase_id  = fa.id) AS strut_ids
    FROM fasi fa
    ORDER BY fa.posizione, fa.id
  LOOP
    v_stato       := 'disponibile'::stato_fase;
    v_iniziata_il := NULL;

    IF f.opzionale THEN
      INSERT INTO ordine_fasi (ordine_id, fase_id, stato, iniziata_il)
      VALUES (NEW.id, f.id, 'non_applicabile'::stato_fase, NULL);
      CONTINUE;
    END IF;

    IF cardinality(f.tipi_ids) > 0 AND NOT (v_tipo_prod = ANY(f.tipi_ids)) THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;
    IF cardinality(f.mat_valori) > 0 AND NOT (v_materiale = ANY(f.mat_valori)) THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;
    IF cardinality(f.strut_ids) > 0 AND NOT (v_struttura = ANY(f.strut_ids)) THEN
      v_stato := 'non_applicabile'::stato_fase;
    END IF;

    -- Avvio automatico: se la fase è applicabile e ha avvio_automatico = true,
    -- parte subito in in_attesa (senza presa in carico operatore)
    IF v_stato <> 'non_applicabile' AND COALESCE(f.avvio_automatico, false) THEN
      v_stato       := 'in_attesa'::stato_fase;
      v_iniziata_il := NOW();
    END IF;

    INSERT INTO ordine_fasi (ordine_id, fase_id, stato, iniziata_il)
    VALUES (NEW.id, f.id, v_stato, v_iniziata_il);
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.crea_fasi_per_ordine() OWNER TO postgres;

--
-- Name: crea_operatore(text, text, text, public.ruolo_utente, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.crea_operatore(p_nome text, p_cognome text, p_pin text, p_ruolo public.ruolo_utente DEFAULT 'operatore'::public.ruolo_utente, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
DECLARE v_id UUID;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF p_responsabile_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'errore', 'responsabile_id_obbligatorio'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile' AND attivo=TRUE AND eliminato IS DISTINCT FROM TRUE) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_pin !~ '^\d{4}$' THEN RETURN jsonb_build_object('ok', false, 'errore', 'pin_non_valido'); END IF;
  INSERT INTO public.users (nome, cognome, pin_hash, ruolo)
    VALUES (p_nome, p_cognome, extensions.crypt(p_pin, extensions.gen_salt('bf')), p_ruolo) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$_$;


ALTER FUNCTION public.crea_operatore(p_nome text, p_cognome text, p_pin text, p_ruolo public.ruolo_utente, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: crea_scheda_kpi(text, jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.crea_scheda_kpi(p_nome text, p_criteri jsonb, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_ore numeric; v_giorni numeric; v_campioni integer; v_id uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_nome IS NULL OR trim(p_nome) = '' THEN RETURN jsonb_build_object('ok', false, 'errore', 'nome_obbligatorio'); END IF;
  SELECT t.ore_lavorazione_interna, t.giorni_calendario, t.n_campioni INTO v_ore, v_giorni, v_campioni
    FROM public.calcola_tempo_combinazione(p_criteri) t;
  INSERT INTO public.kpi_schede (nome, criteri, ore_interne_iniziali, giorni_calendario_iniziali, n_campioni_iniziali, creata_da)
    VALUES (trim(p_nome), p_criteri, v_ore, v_giorni, v_campioni, p_responsabile_id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'n_campioni_iniziali', v_campioni,
    'ore_interne_iniziali', v_ore, 'giorni_calendario_iniziali', v_giorni);
END;
$$;


ALTER FUNCTION public.crea_scheda_kpi(p_nome text, p_criteri jsonb, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: data_consegna_stimata(numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.data_consegna_stimata(p_giorni_lavorativi_necessari numeric) RETURNS date
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_data   date := CURRENT_DATE;
  v_giorni int  := 0;
  v_limite int  := 1000;
BEGIN
  IF p_giorni_lavorativi_necessari <= 0 THEN RETURN CURRENT_DATE; END IF;
  WHILE v_giorni < CEIL(p_giorni_lavorativi_necessari)::int AND v_limite > 0 LOOP
    v_data   := v_data + 1;
    v_limite := v_limite - 1;
    IF e_giorno_lavorativo(v_data) THEN
      v_giorni := v_giorni + 1;
    END IF;
  END LOOP;
  RETURN v_data;
END;
$$;


ALTER FUNCTION public.data_consegna_stimata(p_giorni_lavorativi_necessari numeric) OWNER TO postgres;

--
-- Name: dettaglio_fase_completa(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dettaglio_fase_completa(p_operatore_id uuid, p_session_token uuid, p_ord_fase_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'fase', (
      SELECT to_jsonb(of) || jsonb_build_object(
        'users', CASE WHEN u.id IS NOT NULL THEN jsonb_build_object('nome', u.nome, 'cognome', u.cognome) ELSE NULL END,
        'fasi',  CASE WHEN f.id IS NOT NULL THEN jsonb_build_object('tipo_gestione', f.tipo_gestione) ELSE NULL END
      )
      FROM ordine_fasi of
      LEFT JOIN users u ON u.id = of.operatore_id
      LEFT JOIN fasi f ON f.id = of.fase_id
      WHERE of.id = p_ord_fase_id
    ),
    'collaboratori', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'operatore_id', ofo.operatore_id,
        'users', jsonb_build_object('nome', u.nome, 'cognome', u.cognome)
      )), '[]'::jsonb)
      FROM ordine_fasi_operatori ofo
      JOIN users u ON u.id = ofo.operatore_id
      WHERE ofo.ordine_fase_id = p_ord_fase_id
    )
  ));
END;
$$;


ALTER FUNCTION public.dettaglio_fase_completa(p_operatore_id uuid, p_session_token uuid, p_ord_fase_id uuid) OWNER TO postgres;

--
-- Name: dettaglio_fase_extra_completa(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dettaglio_fase_extra_completa(p_operatore_id uuid, p_session_token uuid, p_fase_extra_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'fase', (
      SELECT to_jsonb(fe) || jsonb_build_object(
        'users', CASE WHEN u.id IS NOT NULL THEN jsonb_build_object('nome', u.nome, 'cognome', u.cognome) ELSE NULL END
      )
      FROM fasi_ordine_extra fe
      LEFT JOIN users u ON u.id = fe.operatore_id
      WHERE fe.id = p_fase_extra_id
    ),
    'collaboratori', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'operatore_id', feo.operatore_id,
        'users', jsonb_build_object('nome', u.nome, 'cognome', u.cognome)
      )), '[]'::jsonb)
      FROM fasi_extra_operatori feo
      JOIN users u ON u.id = feo.operatore_id
      WHERE feo.fasi_ordine_extra_id = p_fase_extra_id
    )
  ));
END;
$$;


ALTER FUNCTION public.dettaglio_fase_extra_completa(p_operatore_id uuid, p_session_token uuid, p_fase_extra_id uuid) OWNER TO postgres;

--
-- Name: dettaglio_ordine_fasi(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dettaglio_ordine_fasi(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'ordine_fasi', (
      SELECT COALESCE(jsonb_agg(
        to_jsonb(of) || jsonb_build_object(
          'users', CASE WHEN u.id IS NOT NULL THEN jsonb_build_object('nome', u.nome, 'cognome', u.cognome) ELSE NULL END
        )
      ), '[]'::jsonb)
      FROM ordine_fasi of
      LEFT JOIN users u ON u.id = of.operatore_id
      WHERE of.ordine_id = p_ordine_id
    ),
    'fasi_extra', (
      SELECT COALESCE(jsonb_agg(
        to_jsonb(fe) || jsonb_build_object(
          'users', CASE WHEN u.id IS NOT NULL THEN jsonb_build_object('nome', u.nome, 'cognome', u.cognome) ELSE NULL END
        ) ORDER BY fe.numero
      ), '[]'::jsonb)
      FROM fasi_ordine_extra fe
      LEFT JOIN users u ON u.id = fe.operatore_id
      WHERE fe.ordine_id = p_ordine_id
    )
  ));
END;
$$;


ALTER FUNCTION public.dettaglio_ordine_fasi(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) OWNER TO postgres;

--
-- Name: dimensione_database(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dimensione_database(p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_db_bytes bigint;
  v_tabelle  jsonb;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RAISE EXCEPTION 'sessione_non_valida' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile'
  ) THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT jsonb_agg(r.t)
  INTO v_tabelle
  FROM (
    SELECT jsonb_build_object(
      'nome',          schemaname || '.' || tablename,
      'dim_leggibile', pg_size_pretty(pg_total_relation_size((schemaname || '.' || tablename)::regclass)),
      'dim_bytes',     pg_total_relation_size((schemaname || '.' || tablename)::regclass)
    ) AS t
    FROM pg_tables
    WHERE schemaname IN ('public', 'cron')
    ORDER BY pg_total_relation_size((schemaname || '.' || tablename)::regclass) DESC
    LIMIT 8
  ) r;

  RETURN jsonb_build_object(
    'db_bytes',     v_db_bytes,
    'db_leggibile', pg_size_pretty(v_db_bytes),
    'tabelle',      COALESCE(v_tabelle, '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION public.dimensione_database(p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: e_giorno_lavorativo(date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.e_giorno_lavorativo(p_data date) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dow    int;
  v_sabato boolean;
BEGIN
  v_dow := EXTRACT(DOW FROM p_data)::int;

  IF v_dow = 0 THEN RETURN false; END IF;

  IF v_dow = 6 THEN
    SELECT COALESCE(sabato_lavorativo, false) INTO v_sabato FROM config_orario LIMIT 1;
    IF NOT v_sabato THEN RETURN false; END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM chiusure_aziendali
    WHERE p_data BETWEEN data_inizio AND data_fine
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION public.e_giorno_lavorativo(p_data date) OWNER TO postgres;

--
-- Name: e_responsabile(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.e_responsabile() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND ruolo = 'responsabile'
      AND attivo = true
      AND eliminato IS DISTINCT FROM true
  );
$$;


ALTER FUNCTION public.e_responsabile() OWNER TO postgres;

--
-- Name: elenco_foto_fase(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_allegati jsonb;
BEGIN
  IF NOT COALESCE(valida_sessione(p_user_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', a.id, 'url_file', a.url_file, 'caricato_da', a.caricato_da
         )), '[]'::jsonb)
    INTO v_allegati
    FROM public.allegati a
    WHERE a.ordine_fase_id = p_ordine_fase_id;

  RETURN jsonb_build_object('ok', true, 'allegati', v_allegati);
END;
$$;


ALTER FUNCTION public.elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid) OWNER TO postgres;

--
-- Name: elenco_foto_ordine_responsabile(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elenco_foto_ordine_responsabile(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_allegati jsonb;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_responsabile_id AND ruolo = 'responsabile' AND attivo = true AND eliminato IS DISTINCT FROM true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ordini WHERE id = p_ordine_id) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'ordine_non_trovato');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', a.id, 'url_file', a.url_file, 'ordine_fase_id', a.ordine_fase_id, 'caricato_da', a.caricato_da
         )), '[]'::jsonb)
    INTO v_allegati
    FROM allegati a
    WHERE a.ordine_fase_id IN (SELECT id FROM ordine_fasi WHERE ordine_id = p_ordine_id);

  RETURN jsonb_build_object('ok', true, 'allegati', v_allegati);
END;
$$;


ALTER FUNCTION public.elenco_foto_ordine_responsabile(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_allegati(uuid[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_allegati(p_allegato_ids uuid[], p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_responsabile BOOLEAN; v_allegato RECORD; v_autorizzato BOOLEAN;
  v_eliminati uuid[] := '{}'; v_url_eliminati text[] := '{}'; v_rifiutati uuid[] := '{}';
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id=p_operatore_id AND ruolo='responsabile') INTO v_is_responsabile;
  FOR v_allegato IN SELECT a.id, a.url_file, a.caricato_da, a.ordine_fase_id FROM public.allegati a WHERE a.id = ANY(p_allegato_ids) LOOP
    IF v_is_responsabile THEN v_autorizzato := true;
    ELSE
      SELECT (v_allegato.caricato_da=p_operatore_id
        OR EXISTS(SELECT 1 FROM public.ordine_fasi WHERE id=v_allegato.ordine_fase_id AND operatore_id=p_operatore_id)
        OR EXISTS(SELECT 1 FROM public.ordine_fasi_operatori WHERE ordine_fase_id=v_allegato.ordine_fase_id AND operatore_id=p_operatore_id)
      ) INTO v_autorizzato;
    END IF;
    IF v_autorizzato THEN
      DELETE FROM public.allegati WHERE id = v_allegato.id;
      v_eliminati := array_append(v_eliminati, v_allegato.id);
      v_url_eliminati := array_append(v_url_eliminati, v_allegato.url_file);
    ELSE v_rifiutati := array_append(v_rifiutati, v_allegato.id); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'eliminati', v_eliminati, 'url_eliminati', v_url_eliminati, 'rifiutati', v_rifiutati);
END;
$$;


ALTER FUNCTION public.elimina_allegati(p_allegato_ids uuid[], p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_allegati_fasi(uuid[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_allegati_fasi(p_fase_ids uuid[], p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_urls text[];
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  SELECT array_agg(url_file) INTO v_urls FROM public.allegati WHERE ordine_fase_id = ANY(p_fase_ids);
  DELETE FROM public.allegati WHERE ordine_fase_id = ANY(p_fase_ids);
  RETURN jsonb_build_object('ok', true, 'url_eliminati', COALESCE(v_urls, '{}'));
END;
$$;


ALTER FUNCTION public.elimina_allegati_fasi(p_fase_ids uuid[], p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_chiusura_aziendale(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_chiusura_aziendale(p_chiusura_id uuid, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE((SELECT valida_sessione(p_responsabile_id, p_session_token)), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  DELETE FROM chiusure_aziendali WHERE id = p_chiusura_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'chiusura_non_trovata');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_chiusura_aziendale(p_chiusura_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_fase_custom_ordine(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_fase_custom_ordine(p_ordine_fase_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT * INTO v_row FROM ordine_fasi WHERE id = p_ordine_fase_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata');
  END IF;
  IF v_row.fase_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'fase_catalogo_non_eliminabile');
  END IF;
  IF v_row.stato = 'completata' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'fase_completata_non_eliminabile');
  END IF;

  DELETE FROM ordine_fasi WHERE id = p_ordine_fase_id;

  BEGIN
    INSERT INTO archivio_log (ordine_id, utente_id, azione, dettaglio)
  VALUES (v_row.ordine_id, p_responsabile_id, 'fase_eliminata',
    jsonb_build_object('nome', COALESCE(v_row.nome_custom, '?')));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_fase_custom_ordine(p_ordine_fase_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_fase_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase fasi_ordine_extra%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.stato = 'completata' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'fase_completata_non_eliminabile',
      'messaggio', 'La fase è già completata e non può essere eliminata per preservare lo storico.');
  END IF;
  DELETE FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_macchina(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_macchina(p_id uuid, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida'); END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato'); END IF;
  IF EXISTS (
    SELECT 1 FROM fase_macchine fm JOIN ordine_fasi of2 ON of2.fase_id=fm.fase_id JOIN ordini o ON o.id=of2.ordine_id
    WHERE fm.macchina_id=p_id AND o.stato NOT IN ('spedito') AND NOT COALESCE(o.eliminato,false) AND of2.stato NOT IN ('completata','non_applicabile')
  ) THEN RETURN jsonb_build_object('ok', false, 'errore', 'macchina_in_uso'); END IF;
  DELETE FROM macchine WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'macchina_non_trovata'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_manutenzione_macchina(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_manutenzione_macchina(p_id uuid, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida'); END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato'); END IF;
  DELETE FROM manutenzioni_macchina WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'manutenzione_non_trovata'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_manutenzione_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_operatore(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile' AND attivo=TRUE AND eliminato IS DISTINCT FROM TRUE) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_operatore_id = p_responsabile_id THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'auto_operazione_non_consentita');
  END IF;

  UPDATE public.users SET attivo = false, eliminato = true WHERE id = p_operatore_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'utente_non_trovato');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_scheda_kpi(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_scheda_kpi(p_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  DELETE FROM public.kpi_schede WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'scheda_non_trovata'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_scheda_kpi(p_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: elimina_tipo_prodotto(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.elimina_tipo_prodotto(p_id text, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_in_uso INT;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  SELECT COUNT(*) INTO v_in_uso FROM public.ordini WHERE tipo_prodotto=p_id AND stato NOT IN ('spedito') AND eliminato IS NOT TRUE;
  IF v_in_uso > 0 THEN RETURN json_build_object('ok', false, 'errore', 'tipo_in_uso', 'ordini', v_in_uso); END IF;
  -- fase_tipi_prodotto: CASCADE ON DELETE gestisce la pulizia automaticamente
  DELETE FROM public.tipi_prodotto WHERE id=p_id;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.elimina_tipo_prodotto(p_id text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: fasi_avanzamento_ordini(uuid, uuid, uuid[], uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fasi_avanzamento_ordini(p_operatore_id uuid, p_session_token uuid, p_std_ids uuid[] DEFAULT '{}'::uuid[], p_extra_ids uuid[] DEFAULT '{}'::uuid[], p_solo_aperti_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'disponibili_ordine_ids', (
      SELECT COALESCE(jsonb_agg(DISTINCT of.ordine_id), '[]'::jsonb)
      FROM ordine_fasi of
      WHERE of.stato = 'disponibile' AND of.ordine_id = ANY(p_solo_aperti_ids)
    ),
    'std', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('ordine_id', of.ordine_id, 'stato', of.stato, 'fase_id', of.fase_id)), '[]'::jsonb)
      FROM ordine_fasi of
      WHERE of.ordine_id = ANY(p_std_ids)
    ),
    'extra', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('ordine_id', fe.ordine_id, 'stato', fe.stato)), '[]'::jsonb)
      FROM fasi_ordine_extra fe
      WHERE fe.ordine_id = ANY(p_extra_ids)
    )
  ));
END;
$$;


ALTER FUNCTION public.fasi_avanzamento_ordini(p_operatore_id uuid, p_session_token uuid, p_std_ids uuid[], p_extra_ids uuid[], p_solo_aperti_ids uuid[]) OWNER TO postgres;

--
-- Name: fasi_dipendenze_stato(uuid, uuid, uuid, smallint[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fasi_dipendenze_stato(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid, p_fase_ids smallint[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('fase_id', of.fase_id, 'stato', of.stato)), '[]'::jsonb)
    FROM ordine_fasi of
    WHERE of.ordine_id = p_ordine_id AND of.fase_id = ANY(p_fase_ids)
  ));
END;
$$;


ALTER FUNCTION public.fasi_dipendenze_stato(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid, p_fase_ids smallint[]) OWNER TO postgres;

--
-- Name: fasi_in_corso_come_collega(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fasi_in_corso_come_collega(p_operatore_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            f.id,
      'ordine_id',     f.ordine_id,
      'fase_id',       f.fase_id,
      'nome_custom',   f.nome_custom,
      'stato',         f.stato,
      'iniziata_il',   f.iniziata_il,
      'completata_il', f.completata_il,
      'operatore_id',  f.operatore_id,
      'note_operatore',f.note_operatore,
      'ordini',        jsonb_build_object('codice', o.codice, 'cliente', o.cliente, 'stato', o.stato),
      'fasi',          jsonb_build_object('nome', fa.nome),
      'collegaNome',   u.nome || ' ' || u.cognome
    )
  )
  INTO v_result
  FROM ordine_fasi_operatori j
  JOIN ordine_fasi f  ON f.id  = j.ordine_fase_id
  JOIN ordini      o  ON o.id  = f.ordine_id
  LEFT JOIN fasi   fa ON fa.id = f.fase_id
  LEFT JOIN users  u  ON u.id  = f.operatore_id
  WHERE j.operatore_id  = p_operatore_id
    AND f.stato         = 'in_corso'
    AND j.aggiunto_il  >= f.iniziata_il;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION public.fasi_in_corso_come_collega(p_operatore_id uuid) OWNER TO postgres;

--
-- Name: fasi_stato_ordine(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fasi_stato_ordine(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('stato', of.stato)), '[]'::jsonb)
    FROM ordine_fasi of
    WHERE of.ordine_id = p_ordine_id
  ));
END;
$$;


ALTER FUNCTION public.fasi_stato_ordine(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) OWNER TO postgres;

--
-- Name: forza_completa_fase_extra(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.forza_completa_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_note text DEFAULT NULL::text, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase fasi_ordine_extra%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.stato = 'completata' THEN RETURN jsonb_build_object('ok', false, 'errore', 'gia_completata'); END IF;
  UPDATE fasi_ordine_extra
    SET stato = 'completata',
        completata_il = NOW(),
        note_operatore = COALESCE(p_note, note_operatore),
        tempo_accumulato_minuti = CASE
          WHEN v_fase.iniziata_il IS NOT NULL
          THEN EXTRACT(EPOCH FROM (NOW() - v_fase.iniziata_il)) / 60
          ELSE NULL
        END
    WHERE id = p_fase_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.forza_completa_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_note text, p_session_token uuid) OWNER TO postgres;

--
-- Name: forza_logout_operatore(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.forza_logout_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile' AND attivo=TRUE AND eliminato IS DISTINCT FROM TRUE) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_operatore_id = p_responsabile_id THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'auto_operazione_non_consentita');
  END IF;

  UPDATE public.users SET forzato_logout = true WHERE id = p_operatore_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'utente_non_trovato');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.forza_logout_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: fotocamera_interna_attiva(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fotocamera_interna_attiva() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_valore text;
BEGIN
  SELECT valore INTO v_valore FROM config_sistema WHERE chiave = 'fotocamera_interna_attiva';
  RETURN COALESCE(v_valore = 'true', false);
END;
$$;


ALTER FUNCTION public.fotocamera_interna_attiva() OWNER TO postgres;

--
-- Name: giorni_lavorativi_disponibili(date, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.giorni_lavorativi_disponibili(p_da date, p_a date) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COUNT(*)::integer
  FROM generate_series(p_da, p_a, '1 day'::interval) gs(g)
  WHERE e_giorno_lavorativo(gs.g::date);
$$;


ALTER FUNCTION public.giorni_lavorativi_disponibili(p_da date, p_a date) OWNER TO postgres;

--
-- Name: imposta_catalogo_fase_extra(uuid, uuid, uuid, text, text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_catalogo_fase_extra(p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid, p_nome text DEFAULT NULL::text, p_descrizione text DEFAULT NULL::text, p_tipo_gestione text DEFAULT 'standard'::text, p_e_attesa_esterna boolean DEFAULT false, p_attiva boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_new_id uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'nome_obbligatorio');
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO catalogo_fasi_extra(nome, descrizione, tipo_gestione, e_attesa_esterna, attiva)
    VALUES (trim(p_nome), p_descrizione, p_tipo_gestione, p_e_attesa_esterna, p_attiva)
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('ok', true, 'id', v_new_id);
  ELSE
    UPDATE catalogo_fasi_extra
    SET nome = trim(p_nome), descrizione = p_descrizione,
        tipo_gestione = p_tipo_gestione, e_attesa_esterna = p_e_attesa_esterna, attiva = p_attiva
    WHERE id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_trovato'); END IF;
    RETURN jsonb_build_object('ok', true, 'id', p_id);
  END IF;
END;
$$;


ALTER FUNCTION public.imposta_catalogo_fase_extra(p_responsabile_id uuid, p_session_token uuid, p_id uuid, p_nome text, p_descrizione text, p_tipo_gestione text, p_e_attesa_esterna boolean, p_attiva boolean) OWNER TO postgres;

--
-- Name: imposta_chiusura_aziendale(date, date, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_chiusura_aziendale(p_data_inizio date, p_data_fine date, p_descrizione text DEFAULT NULL::text, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT COALESCE((SELECT valida_sessione(p_responsabile_id, p_session_token)), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF p_data_fine < p_data_inizio THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'data_fine_precedente_inizio');
  END IF;

  INSERT INTO chiusure_aziendali (data_inizio, data_fine, descrizione)
  VALUES (p_data_inizio, p_data_fine, p_descrizione)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;


ALTER FUNCTION public.imposta_chiusura_aziendale(p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_competenze_fase(smallint, uuid[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_competenze_fase(p_fase_id smallint, p_operatori_ordinati uuid[], p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  DELETE FROM competenze_operatore_fase WHERE fase_id = p_fase_id;
  IF p_operatori_ordinati IS NOT NULL AND array_length(p_operatori_ordinati, 1) > 0 THEN
    INSERT INTO competenze_operatore_fase (operatore_id, fase_id, priorita)
    SELECT op_id, p_fase_id, ordinale::smallint
    FROM unnest(p_operatori_ordinati) WITH ORDINALITY AS t(op_id, ordinale);
  END IF;
  RETURN jsonb_build_object('ok', true, 'fase_id', p_fase_id,
    'n_competenti', COALESCE(array_length(p_operatori_ordinati, 1), 0));
END;
$$;


ALTER FUNCTION public.imposta_competenze_fase(p_fase_id smallint, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_competenze_macchina(uuid, uuid[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_competenze_macchina(p_macchina_id uuid, p_operatori_ordinati uuid[] DEFAULT NULL::uuid[], p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  DELETE FROM competenze_operatore_macchina WHERE macchina_id = p_macchina_id;
  IF p_operatori_ordinati IS NOT NULL AND array_length(p_operatori_ordinati, 1) > 0 THEN
    INSERT INTO competenze_operatore_macchina (operatore_id, macchina_id, priorita)
    SELECT op_id, p_macchina_id, ordinale::integer
    FROM unnest(p_operatori_ordinati) WITH ORDINALITY AS t(op_id, ordinale);
  END IF;

  RETURN jsonb_build_object('ok', true, 'n_competenti', COALESCE(array_length(p_operatori_ordinati, 1), 0));
END;
$$;


ALTER FUNCTION public.imposta_competenze_macchina(p_macchina_id uuid, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_competenze_per_catalogo_fase_extra(uuid, uuid, uuid[], uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_competenze_per_catalogo_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_operatori_ordinati uuid[], p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalogo_fasi_extra WHERE id = p_catalogo_fase_extra_id) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'catalogo_non_trovato');
  END IF;

  DELETE FROM competenze_operatore_fase_extra WHERE catalogo_fase_extra_id = p_catalogo_fase_extra_id;

  IF p_operatori_ordinati IS NOT NULL AND array_length(p_operatori_ordinati, 1) > 0 THEN
    INSERT INTO competenze_operatore_fase_extra (operatore_id, catalogo_fase_extra_id, priorita)
    SELECT unnest_op, p_catalogo_fase_extra_id, ordinale
    FROM (
      SELECT u AS unnest_op, row_number() OVER () AS ordinale
      FROM unnest(p_operatori_ordinati) AS u
    ) t
    WHERE EXISTS (SELECT 1 FROM users WHERE id = unnest_op AND ruolo = 'operatore');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.imposta_competenze_per_catalogo_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_operatori_ordinati uuid[], p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_dipendenze_fase(smallint, smallint[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_dipendenze_fase(p_fase_id smallint, p_dipende_da_ids smallint[], p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_dep smallint;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF p_fase_id = ANY(COALESCE(p_dipende_da_ids, ARRAY[]::smallint[])) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'dipendenza_circolare');
  END IF;

  FOREACH v_dep IN ARRAY COALESCE(p_dipende_da_ids, ARRAY[]::smallint[])
  LOOP
    IF EXISTS (
      WITH RECURSIVE reach AS (
        SELECT fd.dipende_da_fase_id AS nxt
        FROM fase_dipendenze fd
        WHERE fd.fase_id = v_dep
        UNION ALL
        SELECT fd2.dipende_da_fase_id
        FROM fase_dipendenze fd2
        JOIN reach r ON fd2.fase_id = r.nxt
      )
      SELECT 1 FROM reach WHERE nxt = p_fase_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'dipendenza_circolare');
    END IF;
  END LOOP;

  DELETE FROM fase_dipendenze WHERE fase_id = p_fase_id;

  IF array_length(COALESCE(p_dipende_da_ids, ARRAY[]::smallint[]), 1) > 0 THEN
    INSERT INTO fase_dipendenze (fase_id, dipende_da_fase_id)
    SELECT p_fase_id, unnest(p_dipende_da_ids);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.imposta_dipendenze_fase(p_fase_id smallint, p_dipende_da_ids smallint[], p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_disponibilita_giornaliera(uuid, date, numeric, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_disponibilita_giornaliera(p_operatore_id uuid, p_data date, p_ore numeric, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  INSERT INTO disponibilita_giornaliera(operatore_id, data, ore) VALUES (p_operatore_id, p_data, p_ore)
  ON CONFLICT (operatore_id, data) DO UPDATE SET ore = EXCLUDED.ore;
  RETURN jsonb_build_object('ok', true, 'operatore_id', p_operatore_id, 'data', p_data, 'ore', p_ore);
END;
$$;


ALTER FUNCTION public.imposta_disponibilita_giornaliera(p_operatore_id uuid, p_data date, p_ore numeric, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_fase_ordine(uuid, smallint, boolean, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_fase_ordine(p_ordine_id uuid, p_fase_id smallint, p_attiva boolean, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_riga ordine_fasi%ROWTYPE; v_tg text; v_stato stato_fase;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  SELECT tipo_gestione INTO v_tg FROM fasi WHERE id=p_fase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_catalogo_non_trovata'); END IF;
  SELECT * INTO v_riga FROM ordine_fasi WHERE ordine_id=p_ordine_id AND fase_id=p_fase_id;
  IF p_attiva THEN
    IF v_tg = 'conferma_ricezione' THEN v_stato := 'in_attesa'; ELSE v_stato := 'disponibile'; END IF;
    IF NOT FOUND THEN
      INSERT INTO ordine_fasi (ordine_id, fase_id, stato, iniziata_il)
        VALUES (p_ordine_id, p_fase_id, v_stato, CASE WHEN v_tg='conferma_ricezione' THEN NOW() ELSE NULL END);
    ELSIF v_riga.stato = 'non_applicabile' THEN
      UPDATE ordine_fasi SET stato=v_stato,
        iniziata_il=CASE WHEN v_tg='conferma_ricezione' THEN COALESCE(v_riga.iniziata_il,NOW()) ELSE v_riga.iniziata_il END
        WHERE id=v_riga.id;
    END IF;
    RETURN jsonb_build_object('ok', true);
  ELSE
    IF NOT FOUND OR v_riga.stato = 'non_applicabile' THEN RETURN jsonb_build_object('ok', true); END IF;
    IF v_riga.stato = 'in_corso' THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_in_corso', 'messaggio', 'La fase è in corso e non può essere disattivata.'); END IF;
    IF v_riga.stato = 'completata' THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_completata', 'messaggio', 'La fase è già completata e non può essere disattivata.'); END IF;
    IF v_riga.spedita_il IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'errore', 'spedizione_avviata', 'messaggio', 'Il pezzo è già stato spedito al fornitore, impossibile disattivare.'); END IF;
    UPDATE ordine_fasi SET stato='non_applicabile', iniziata_il=NULL, spedita_il=NULL WHERE id=v_riga.id;
    RETURN jsonb_build_object('ok', true);
  END IF;
END;
$$;


ALTER FUNCTION public.imposta_fase_ordine(p_ordine_id uuid, p_fase_id smallint, p_attiva boolean, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_fasi_macchina(uuid, smallint[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_fasi_macchina(p_macchina_id uuid, p_fase_ids smallint[] DEFAULT NULL::smallint[], p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  DELETE FROM fase_macchine WHERE macchina_id = p_macchina_id;
  IF p_fase_ids IS NOT NULL AND array_length(p_fase_ids, 1) > 0 THEN
    INSERT INTO fase_macchine (fase_id, macchina_id)
    SELECT unnest(p_fase_ids), p_macchina_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'n_fasi', COALESCE(array_length(p_fase_ids, 1), 0));
END;
$$;


ALTER FUNCTION public.imposta_fasi_macchina(p_macchina_id uuid, p_fase_ids smallint[], p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_macchina(text, text, numeric, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_macchina(p_nome text, p_stato text DEFAULT 'attiva'::text, p_ore_default numeric DEFAULT 8.0, p_id uuid DEFAULT NULL::uuid, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_stato NOT IN ('attiva', 'manutenzione', 'fuori_uso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_valido');
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO macchine (nome, stato, ore_default) VALUES (p_nome, p_stato, p_ore_default) RETURNING id INTO v_id;
  ELSE
    UPDATE macchine SET nome=p_nome, stato=p_stato, ore_default=p_ore_default, aggiornato_il=now() WHERE id=p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'errore', 'macchina_non_trovata'); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;


ALTER FUNCTION public.imposta_macchina(p_nome text, p_stato text, p_ore_default numeric, p_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_macchine_fase_extra(uuid, uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_macchine_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_macchine_ids jsonb, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF p_macchine_ids IS NOT NULL AND jsonb_typeof(p_macchine_ids) NOT IN ('array', 'null') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'formato_macchine_non_valido');
  END IF;

  DELETE FROM catalogo_fase_extra_macchine WHERE catalogo_fase_extra_id = p_catalogo_fase_extra_id;

  IF p_macchine_ids IS NOT NULL AND jsonb_typeof(p_macchine_ids) = 'array' AND jsonb_array_length(p_macchine_ids) > 0 THEN
    INSERT INTO catalogo_fase_extra_macchine(catalogo_fase_extra_id, macchina_id)
    SELECT p_catalogo_fase_extra_id, (el #>> '{}')::uuid
    FROM jsonb_array_elements(p_macchine_ids) AS el;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.imposta_macchine_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_macchine_ids jsonb, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_manutenzione_macchina(uuid, date, date, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_manutenzione_macchina(p_macchina_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text DEFAULT NULL::text, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida'); END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato'); END IF;
  IF p_data_fine < p_data_inizio THEN RETURN jsonb_build_object('ok', false, 'errore', 'data_fine_precedente_inizio'); END IF;
  INSERT INTO manutenzioni_macchina (macchina_id, data_inizio, data_fine, descrizione) VALUES (p_macchina_id, p_data_inizio, p_data_fine, p_descrizione) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;


ALTER FUNCTION public.imposta_manutenzione_macchina(p_macchina_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_permesso_periodo(uuid, date, date, numeric, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_permesso_periodo(p_operatore_id uuid, p_data_inizio date, p_data_fine date, p_ore numeric, p_motivo text DEFAULT NULL::text, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_giorni int;
  v_data   date;
BEGIN
  IF NOT COALESCE((SELECT valida_sessione(p_responsabile_id, p_session_token)), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF p_data_fine < p_data_inizio THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'data_fine_precedente_inizio');
  END IF;

  v_giorni := (p_data_fine - p_data_inizio) + 1;
  IF v_giorni > 90 THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'periodo_troppo_lungo', 'max_giorni', 90, 'richiesti', v_giorni);
  END IF;

  IF p_ore < 0 THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'ore_negative');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND attivo = true) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'operatore_non_trovato');
  END IF;

  v_data := p_data_inizio;
  WHILE v_data <= p_data_fine LOOP
    INSERT INTO disponibilita_giornaliera (operatore_id, data, ore, motivo)
    VALUES (p_operatore_id, v_data, p_ore, p_motivo)
    ON CONFLICT (operatore_id, data)
    DO UPDATE SET ore = EXCLUDED.ore, motivo = EXCLUDED.motivo;

    v_data := v_data + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'giorni_aggiornati', v_giorni);
END;
$$;


ALTER FUNCTION public.imposta_permesso_periodo(p_operatore_id uuid, p_data_inizio date, p_data_fine date, p_ore numeric, p_motivo text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: imposta_stato_operatore(uuid, boolean, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.imposta_stato_operatore(p_operatore_id uuid, p_attivo boolean, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_responsabile_id AND ruolo='responsabile' AND attivo=TRUE AND eliminato IS DISTINCT FROM TRUE) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  IF p_operatore_id = p_responsabile_id THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'auto_operazione_non_consentita');
  END IF;

  UPDATE public.users SET attivo = p_attivo WHERE id = p_operatore_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'utente_non_trovato');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.imposta_stato_operatore(p_operatore_id uuid, p_attivo boolean, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: in_orario_lavoro(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.in_orario_lavoro(p_momento timestamp with time zone DEFAULT now()) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_config    config_orario%ROWTYPE;
  v_dow       int  := EXTRACT(DOW FROM p_momento AT TIME ZONE 'Europe/Rome');
  v_ora       time := (p_momento AT TIME ZONE 'Europe/Rome')::time;
  v_ora_fine  time;
BEGIN
  SELECT * INTO v_config FROM config_orario LIMIT 1;
  IF v_config IS NULL THEN
    RETURN false;
  END IF;

  IF v_dow = 0 THEN
    RETURN false; -- domenica: nessuna finestra lavorativa gestita oggi (vedi nota vault su domenica_lavorativa)
  END IF;

  IF v_dow = 6 THEN
    IF NOT COALESCE(v_config.sabato_lavorativo, false) THEN
      RETURN false;
    END IF;
    v_ora_fine := v_config.ora_fine_sabato;
  ELSE
    v_ora_fine := v_config.ora_fine;
  END IF;

  -- Guardia esplicita: la riga di config_orario puo' esistere con campi essenziali
  -- NULL (mitigato dal 2026-08-31 con NOT NULL sullo schema, ma questa funzione non
  -- deve dipendere da quel vincolo per restare corretta). Senza questo controllo il
  -- confronto sotto restituirebbe NULL e non false, e "IF NOT in_orario_lavoro()" nei
  -- chiamanti fallirebbe APERTA (NOT NULL e' NULL, non true).
  IF v_config.ora_inizio IS NULL OR v_ora_fine IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE(v_ora >= v_config.ora_inizio AND v_ora < v_ora_fine, false);
END;
$$;


ALTER FUNCTION public.in_orario_lavoro(p_momento timestamp with time zone) OWNER TO postgres;

--
-- Name: lista_operatori_login(boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.lista_operatori_login(p_solo_sola_lettura boolean DEFAULT false) RETURNS TABLE(id uuid, nome text, cognome text, ruolo text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT u.id, u.nome, u.cognome, u.ruolo::text
  FROM users u
  WHERE u.attivo = true
    AND COALESCE(u.eliminato, false) = false
    AND (
      (p_solo_sola_lettura AND u.ruolo = 'sola_lettura')
      OR (NOT p_solo_sola_lettura AND u.ruolo IN ('operatore', 'sola_lettura'))
    )
  ORDER BY u.cognome;
$$;


ALTER FUNCTION public.lista_operatori_login(p_solo_sola_lettura boolean) OWNER TO postgres;

--
-- Name: lista_priorita_giornaliera(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.lista_priorita_giornaliera() RETURNS TABLE(id uuid, codice text, cliente text, priorita text, scadenza date, ore_rimaste numeric, giorni_scadenza integer, rapporto_critico numeric, a_rischio boolean, giorni_stima_consegna numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_soglia         numeric;
  v_min_giorno     numeric;
  v_margine        numeric;
  v_fallback_extra numeric;
  v_default_extra  numeric;
  v_fallback_ext   numeric := 2880;
  v_config         config_orario%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non_autenticato'; END IF;

  SELECT COALESCE(MAX(valore), 1)    INTO v_soglia       FROM kpi_config WHERE chiave = 'soglia_rischio_giorni';
  SELECT COALESCE(MAX(valore), 30)   INTO v_default_extra FROM kpi_config WHERE chiave = 'durata_default_fase_extra_minuti';
  SELECT COALESCE(MAX(valore), 0.90) INTO v_margine      FROM kpi_config WHERE chiave = 'margine_capacita';

  SELECT * INTO v_config FROM config_orario LIMIT 1;

  v_min_giorno := GREATEST(60, (
    CASE
      WHEN v_config.ora_inizio IS NOT NULL AND v_config.ora_fine IS NOT NULL
        THEN EXTRACT(EPOCH FROM (v_config.ora_fine - v_config.ora_inizio)) / 60.0
             - CASE WHEN COALESCE(v_config.pausa_attiva, false)
                    THEN COALESCE(v_config.pausa_minuti, 0)
                    ELSE 0 END
      ELSE 480
    END
  ) * v_margine);

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY tempo_accumulato_minuti::numeric / GREATEST(n_ordini_batch,1)
  ) INTO v_fallback_extra
  FROM fasi_ordine_extra
  WHERE stato = 'completata' AND tempo_accumulato_minuti > 0
    AND NOT COALESCE(e_attesa_esterna, false);
  v_fallback_extra := COALESCE(v_fallback_extra, v_default_extra);

  RETURN QUERY
  WITH
  mediane_std AS (
    SELECT of2.fase_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch,1) / GREATEST(o.quantita,1)
      ) AS med_min
    FROM ordine_fasi of2
    JOIN ordini o ON o.id = of2.ordine_id
    JOIN fasi f   ON f.id = of2.fase_id
    WHERE of2.stato = 'completata'
      AND of2.tempo_accumulato_minuti > 0
      AND of2.fase_id IS NOT NULL
      AND NOT COALESCE(f.e_attesa_esterna, false)
    GROUP BY of2.fase_id
  ),
  mediane_extra AS (
    SELECT lower(nome) AS nome_lower,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        tempo_accumulato_minuti::numeric / GREATEST(n_ordini_batch,1)
      ) AS med_min
    FROM fasi_ordine_extra
    WHERE stato = 'completata' AND tempo_accumulato_minuti > 0
      AND NOT COALESCE(e_attesa_esterna, false)
    GROUP BY lower(nome)
    HAVING COUNT(*) >= 2
  ),
  mediane_ext_std AS (
    SELECT of2.fase_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch,1)
      ) AS med_min
    FROM ordine_fasi of2
    JOIN fasi f ON f.id = of2.fase_id
    WHERE of2.stato = 'completata'
      AND of2.tempo_accumulato_minuti > 0
      AND COALESCE(f.e_attesa_esterna, false) = true
    GROUP BY of2.fase_id
  ),
  mediane_ext_extra AS (
    SELECT lower(nome) AS nome_lower,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
        tempo_accumulato_minuti::numeric / GREATEST(n_ordini_batch,1)
      ) AS med_min
    FROM fasi_ordine_extra
    WHERE stato = 'completata' AND tempo_accumulato_minuti > 0
      AND COALESCE(e_attesa_esterna, false) = true
    GROUP BY lower(nome)
  ),
  backlog_std AS (
    SELECT of2.ordine_id,
      SUM(CASE of2.stato
        WHEN 'in_corso' THEN COALESCE(m.med_min,0) * 0.5
        ELSE                  COALESCE(m.med_min,0)
      END) AS min_rim
    FROM ordine_fasi of2
    JOIN fasi f ON f.id = of2.fase_id
    LEFT JOIN mediane_std m ON m.fase_id = of2.fase_id
    WHERE of2.stato IN ('disponibile','in_corso')
      AND NOT COALESCE(f.e_attesa_esterna, false)
    GROUP BY of2.ordine_id
  ),
  backlog_extra AS (
    SELECT foe.ordine_id,
      SUM(CASE foe.stato
        WHEN 'in_corso' THEN COALESCE(me.med_min, v_fallback_extra) * 0.5
        ELSE                  COALESCE(me.med_min, v_fallback_extra)
      END) AS min_rim
    FROM fasi_ordine_extra foe
    LEFT JOIN mediane_extra me ON me.nome_lower = lower(foe.nome)
    WHERE foe.stato IN ('disponibile','in_corso')
      AND NOT COALESCE(foe.e_attesa_esterna, false)
    GROUP BY foe.ordine_id
  ),
  backlog AS (
    SELECT ordine_id, SUM(min_rim) AS min_rim
    FROM (
      SELECT ordine_id, min_rim FROM backlog_std
      UNION ALL
      SELECT ordine_id, min_rim FROM backlog_extra
    ) combined
    GROUP BY ordine_id
  ),
  backlog_ext_std AS (
    SELECT of2.ordine_id,
      SUM(CASE of2.stato
        WHEN 'in_attesa' THEN COALESCE(me.med_min, v_fallback_ext) * 0.5
        ELSE                  COALESCE(me.med_min, v_fallback_ext)
      END) AS min_ext
    FROM ordine_fasi of2
    JOIN fasi f ON f.id = of2.fase_id
    LEFT JOIN mediane_ext_std me ON me.fase_id = of2.fase_id
    WHERE of2.stato IN ('disponibile','in_attesa')
      AND COALESCE(f.e_attesa_esterna, false) = true
    GROUP BY of2.ordine_id
  ),
  backlog_ext_extra AS (
    SELECT foe.ordine_id,
      SUM(CASE foe.stato
        WHEN 'in_attesa' THEN COALESCE(mee.med_min, v_fallback_ext) * 0.5
        ELSE                  COALESCE(mee.med_min, v_fallback_ext)
      END) AS min_ext
    FROM fasi_ordine_extra foe
    LEFT JOIN mediane_ext_extra mee ON mee.nome_lower = lower(foe.nome)
    WHERE foe.stato IN ('disponibile','in_attesa')
      AND COALESCE(foe.e_attesa_esterna, false) = true
    GROUP BY foe.ordine_id
  ),
  backlog_ext AS (
    SELECT ordine_id, SUM(min_ext) AS min_ext
    FROM (
      SELECT ordine_id, min_ext FROM backlog_ext_std
      UNION ALL
      SELECT ordine_id, min_ext FROM backlog_ext_extra
    ) combined
    GROUP BY ordine_id
  ),
  gld AS (
    SELECT o.id,
      CASE
        WHEN o.scadenza < CURRENT_DATE THEN -1
        ELSE giorni_lavorativi_disponibili(CURRENT_DATE, o.scadenza)
      END AS gld
    FROM ordini o
    WHERE o.stato IN ('aperto','attesa_spedizione')
      AND COALESCE(o.eliminato, false) = false
      AND o.scadenza IS NOT NULL
  )
  SELECT
    o.id,
    o.codice,
    o.cliente,
    o.priorita,
    o.scadenza,
    ROUND(COALESCE(b.min_rim, 0)::numeric / 60, 1) AS ore_rimaste,
    (o.scadenza - CURRENT_DATE)::integer AS giorni_scadenza,
    CASE
      WHEN o.scadenza < CURRENT_DATE THEN 9999::numeric
      WHEN gld.gld = 0              THEN 9998::numeric
      WHEN COALESCE(b.min_rim, 0) + COALESCE(be.min_ext, 0) = 0 THEN 0::numeric
      ELSE ROUND((
          (COALESCE(b.min_rim, 0)::numeric / v_min_giorno
           + COALESCE(be.min_ext, 0)::numeric / 1440.0)
          / GREATEST(gld.gld::numeric, 0.01)
        )::numeric, 2)
    END AS rapporto_critico,
    (
      (
        COALESCE(b.min_rim, 0)::numeric / v_min_giorno
        + COALESCE(be.min_ext, 0)::numeric / 1440.0
      ) > GREATEST(gld.gld::numeric, 0)
      OR o.scadenza <= CURRENT_DATE + v_soglia::integer
    ) AS a_rischio,
    ROUND((
      COALESCE(b.min_rim, 0)::numeric / v_min_giorno
      + COALESCE(be.min_ext, 0)::numeric / 1440.0
    )::numeric, 1) AS giorni_stima_consegna
  FROM ordini o
  LEFT JOIN priorita_ordine_config p ON p.id = o.priorita
  LEFT JOIN backlog b    ON b.ordine_id = o.id
  LEFT JOIN backlog_ext be ON be.ordine_id = o.id
  LEFT JOIN gld          ON gld.id = o.id
  WHERE o.stato IN ('aperto','attesa_spedizione')
    AND COALESCE(o.eliminato, false) = false
    AND o.scadenza IS NOT NULL
  ORDER BY rapporto_critico DESC, COALESCE(p.peso, 0) DESC, o.scadenza;
END;
$$;


ALTER FUNCTION public.lista_priorita_giornaliera() OWNER TO postgres;

--
-- Name: lista_schede_kpi(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.lista_schede_kpi() RETURNS TABLE(id uuid, nome text, criteri jsonb, ore_interne_iniziali numeric, giorni_calendario_iniziali numeric, n_campioni_iniziali integer, ore_interne_correnti numeric, giorni_calendario_correnti numeric, n_campioni_correnti integer, var_ore_pct numeric, var_giorni_pct numeric, creata_il timestamp with time zone, creata_da uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rec  record;
  v_curr record;
BEGIN
  FOR v_rec IN SELECT * FROM public.kpi_schede ORDER BY creata_il DESC LOOP
    SELECT t.ore_lavorazione_interna, t.giorni_calendario, t.n_campioni
    INTO v_curr
    FROM public.calcola_tempo_combinazione(v_rec.criteri) t;
    RETURN QUERY SELECT
      v_rec.id,
      v_rec.nome,
      v_rec.criteri,
      v_rec.ore_interne_iniziali,
      v_rec.giorni_calendario_iniziali,
      v_rec.n_campioni_iniziali,
      v_curr.ore_lavorazione_interna,
      v_curr.giorni_calendario,
      v_curr.n_campioni,
      CASE
        WHEN v_rec.ore_interne_iniziali IS NULL OR v_rec.ore_interne_iniziali = 0 THEN NULL
        ELSE ROUND(((v_curr.ore_lavorazione_interna - v_rec.ore_interne_iniziali)
                    / v_rec.ore_interne_iniziali * 100)::numeric, 1)
      END,
      CASE
        WHEN v_rec.giorni_calendario_iniziali IS NULL OR v_rec.giorni_calendario_iniziali = 0 THEN NULL
        ELSE ROUND(((v_curr.giorni_calendario - v_rec.giorni_calendario_iniziali)
                    / v_rec.giorni_calendario_iniziali * 100)::numeric, 1)
      END,
      v_rec.creata_il,
      v_rec.creata_da;
  END LOOP;
END;
$$;


ALTER FUNCTION public.lista_schede_kpi() OWNER TO postgres;

--
-- Name: metti_in_attesa(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.metti_in_attesa(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata'); END IF;
  IF v_fase.stato <> 'in_corso' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'La fase non è in corso');
  END IF;
  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Non sei l''operatore assegnato a questa fase');
  END IF;
  IF EXISTS (SELECT 1 FROM ordini WHERE id = v_fase.ordine_id AND stato = 'sospeso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Ordine sospeso');
  END IF;
  UPDATE ordine_fasi SET
    stato = 'in_attesa',
    tempo_accumulato_minuti = COALESCE(tempo_accumulato_minuti, 0) +
      CASE WHEN v_fase.iniziata_il IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_fase.iniziata_il)) / 60.0)
           ELSE 0 END,
    iniziata_il = NULL
  WHERE id = p_ordine_fase_id;
  BEGIN
    INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_messa_in_attesa',
          jsonb_build_object('ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.metti_in_attesa(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: mie_fasi_in_corso(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mie_fasi_in_corso(p_operatore_id uuid, p_session_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'primarie', (
      SELECT COALESCE(jsonb_agg(
        to_jsonb(of) || jsonb_build_object(
          'ordini', jsonb_build_object('codice', o.codice, 'cliente', o.cliente, 'stato', o.stato),
          'fasi',   CASE WHEN f.id IS NOT NULL THEN jsonb_build_object('nome', f.nome) ELSE NULL END
        )
      ), '[]'::jsonb)
      FROM ordine_fasi of
      JOIN ordini o ON o.id = of.ordine_id
      LEFT JOIN fasi f ON f.id = of.fase_id
      WHERE of.operatore_id = p_operatore_id
        AND of.stato IN ('in_corso', 'in_attesa', 'bloccata')
    ),
    'extra', (
      SELECT COALESCE(jsonb_agg(
        to_jsonb(fe) || jsonb_build_object(
          'ordini', jsonb_build_object('codice', o.codice, 'cliente', o.cliente, 'stato', o.stato)
        )
      ), '[]'::jsonb)
      FROM fasi_ordine_extra fe
      JOIN ordini o ON o.id = fe.ordine_id
      WHERE fe.operatore_id = p_operatore_id
        AND fe.stato IN ('in_corso', 'in_attesa')
    )
  ));
END;
$$;


ALTER FUNCTION public.mie_fasi_in_corso(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: modifica_chiusura_aziendale(uuid, date, date, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.modifica_chiusura_aziendale(p_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text DEFAULT NULL::text, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE((SELECT valida_sessione(p_responsabile_id, p_session_token)), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF p_data_fine < p_data_inizio THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'data_fine_precedente_inizio');
  END IF;

  UPDATE chiusure_aziendali
  SET data_inizio  = p_data_inizio,
      data_fine    = p_data_fine,
      descrizione  = p_descrizione
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'chiusura_non_trovata');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.modifica_chiusura_aziendale(p_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: notifiche_operatore(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notifiche_operatore(p_operatore_id uuid, p_session_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', jsonb_build_object(
    'lista', (
      SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.creata_il DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM notifiche
        WHERE destinatario_id = p_operatore_id
        ORDER BY creata_il DESC
        LIMIT 30
      ) n
    ),
    'non_lette', (
      SELECT COUNT(*) FROM notifiche
      WHERE destinatario_id = p_operatore_id AND letta = false
    )
  ));
END;
$$;


ALTER FUNCTION public.notifiche_operatore(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: ordini_attivi(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ordini_attivi(p_operatore_id uuid, p_session_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
    FROM ordini o
    WHERE o.stato IN ('aperto', 'sospeso', 'attesa_spedizione')
      AND COALESCE(o.eliminato, false) = false
  ));
END;
$$;


ALTER FUNCTION public.ordini_attivi(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: pausa_tutte_fasi(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pausa_tutte_fasi(p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  UPDATE ordine_fasi SET
    stato = 'in_attesa',
    tempo_accumulato_minuti = COALESCE(tempo_accumulato_minuti, 0) +
      CASE WHEN iniziata_il IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - iniziata_il)) / 60.0)
           ELSE 0 END,
    iniziata_il = NULL
  WHERE operatore_id = p_operatore_id AND stato = 'in_corso';
  UPDATE fasi_ordine_extra SET
    stato = 'in_attesa',
    tempo_accumulato_minuti = COALESCE(tempo_accumulato_minuti, 0) +
      CASE WHEN iniziata_il IS NOT NULL
           THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - iniziata_il)) / 60.0)
           ELSE 0 END,
    iniziata_il = NULL
  WHERE operatore_id = p_operatore_id AND stato = 'in_corso';
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.pausa_tutte_fasi(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: piano_giornaliero_raggruppato(uuid, uuid, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.piano_giornaliero_raggruppato(p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_oggi               date;
  v_margine            numeric;
  v_k_soglia           int;
  v_k_soglia_gen       int;
  v_k_stima_fallback   numeric;
  v_chiusura_desc text;
  v_ordine        record;
  v_fase          record;
  v_fase_extra    record;
  v_comp          record;
  v_mediana       numeric;
  v_mediana_gen   numeric;
  v_n_camp        bigint;
  v_n_camp_gen    bigint;
  v_stima_ore     numeric;
  v_ore_disp      numeric;
  v_ore_usate     numeric;
  v_trovato       boolean;
  v_motiv         text;
  v_da_ieri       boolean;
  v_ha_competenze boolean;
  v_ha_macchine   boolean;
  v_mac_id        uuid;
  v_mac_nome      text;
  v_cfe_id        uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT
    COALESCE(MAX(valore) FILTER (WHERE chiave='margine_capacita'),                0.90),
    COALESCE(MAX(valore) FILTER (WHERE chiave='soglia_campioni_op'),              5)::int,
    COALESCE(MAX(valore) FILTER (WHERE chiave='soglia_campioni_gen'),             3)::int,
    COALESCE(MAX(valore) FILTER (WHERE chiave='durata_default_fase_extra_minuti'),30)
  INTO v_margine, v_k_soglia, v_k_soglia_gen, v_k_stima_fallback
  FROM kpi_config
  WHERE chiave IN ('margine_capacita','soglia_campioni_op','soglia_campioni_gen','durata_default_fase_extra_minuti');

  v_oggi := COALESCE(p_data, CURRENT_DATE);
  SELECT descrizione INTO v_chiusura_desc FROM chiusure_aziendali WHERE v_oggi BETWEEN data_inizio AND data_fine LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'data', v_oggi, 'chiuso', true, 'descrizione_chiusura', v_chiusura_desc);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _piano_r (
    fase_id smallint, fase_nome text, fase_pos int,
    ordine_id uuid, codice text, cliente text, scadenza date,
    da_ieri boolean, stato_fase text,
    op_id uuid, op_nome text, op_prio smallint,
    motivazione text, stima_min numeric, n_campioni bigint,
    conflitto boolean, extra_json jsonb,
    mac_id uuid, mac_nome text, stato_ordine text
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _cap_r (
    op_id uuid PRIMARY KEY, op_nome text, ore_disp numeric, ore_usate numeric DEFAULT 0
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _maccap_r (
    macchina_id uuid PRIMARY KEY, macchina_nome text, ore_disp numeric, ore_usate numeric DEFAULT 0
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _piano_extra_r (
    catalogo_id uuid, fase_nome text,
    ordine_id uuid, codice text, cliente text, scadenza date,
    da_ieri boolean, stato_fase text,
    op_id uuid, op_nome text, op_prio smallint,
    motivazione text, stima_min numeric, n_campioni bigint,
    conflitto boolean, mac_id uuid, mac_nome text, stato_ordine text
  ) ON COMMIT DROP;

  TRUNCATE _piano_r; TRUNCATE _cap_r; TRUNCATE _maccap_r; TRUNCATE _piano_extra_r;

  INSERT INTO _cap_r(op_id, op_nome, ore_disp, ore_usate)
  SELECT u.id, u.nome||' '||u.cognome, COALESCE(dg.ore, u.ore_default, 8.0)*v_margine, 0
  FROM users u LEFT JOIN disponibilita_giornaliera dg ON dg.operatore_id=u.id AND dg.data=v_oggi
  WHERE u.ruolo='operatore' AND u.attivo=true AND NOT COALESCE(u.eliminato,false) AND NOT COALESCE(u.escluso_pianificazione,false);

  INSERT INTO _maccap_r(macchina_id, macchina_nome, ore_disp, ore_usate)
  SELECT m.id, m.nome, m.ore_default*v_margine, 0 FROM macchine m
  WHERE m.stato='attiva' AND NOT EXISTS (SELECT 1 FROM manutenzioni_macchina mm WHERE mm.macchina_id=m.id AND v_oggi BETWEEN mm.data_inizio AND mm.data_fine);

  FOR v_ordine IN
    SELECT o.id, o.codice, o.cliente, o.scadenza, GREATEST(COALESCE(o.quantita,1),1) AS quantita, o.creato_il, o.stato
    FROM ordini o WHERE o.stato NOT IN ('spedito') AND NOT COALESCE(o.eliminato,false) AND o.tipo='standard'
    ORDER BY o.scadenza NULLS LAST, o.id
  LOOP
    SELECT of2.fase_id, f.nome, f.posizione, COALESCE(f.e_attesa_esterna,false) AS e_attesa_esterna, of2.stato, of2.iniziata_il
    INTO v_fase FROM ordine_fasi of2 JOIN fasi f ON f.id=of2.fase_id
    WHERE of2.ordine_id=v_ordine.id AND of2.stato IN ('disponibile','in_attesa')
      AND NOT EXISTS (
        SELECT 1 FROM fase_dipendenze fd JOIN ordine_fasi dep_of ON dep_of.ordine_id=v_ordine.id AND dep_of.fase_id=fd.dipende_da_fase_id
        WHERE fd.fase_id=of2.fase_id AND dep_of.stato NOT IN ('completata','non_applicabile')
      )
    ORDER BY f.posizione ASC, f.id ASC LIMIT 1;
    IF NOT FOUND THEN
      SELECT of2.fase_id, f.nome, f.posizione, false AS e_attesa_esterna, of2.stato, of2.iniziata_il
      INTO v_fase FROM ordine_fasi of2 JOIN fasi f ON f.id=of2.fase_id
      WHERE of2.ordine_id=v_ordine.id AND of2.stato IN ('disponibile','in_attesa') AND NOT COALESCE(f.e_attesa_esterna,false)
        AND EXISTS (
          SELECT 1 FROM fase_dipendenze fd JOIN ordine_fasi dep_of ON dep_of.ordine_id=v_ordine.id AND dep_of.fase_id=fd.dipende_da_fase_id
          WHERE fd.fase_id=of2.fase_id AND dep_of.stato NOT IN ('completata','non_applicabile')
        )
      ORDER BY f.posizione ASC, f.id ASC LIMIT 1;
      IF FOUND THEN
        INSERT INTO _piano_r VALUES (
          v_fase.fase_id, v_fase.nome, v_fase.posizione, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
          false, 'bloccata_dipendenze', NULL, NULL, NULL, 'In attesa di sblocco dipendenze', NULL, 0, false,
          (SELECT jsonb_agg(jsonb_build_object('fase_id',fd.dipende_da_fase_id,'nome',f_dep.nome))
           FROM fase_dipendenze fd JOIN fasi f_dep ON f_dep.id=fd.dipende_da_fase_id
           JOIN ordine_fasi dep_of ON dep_of.ordine_id=v_ordine.id AND dep_of.fase_id=fd.dipende_da_fase_id
           WHERE fd.fase_id=v_fase.fase_id AND dep_of.stato NOT IN ('completata','non_applicabile')),
          NULL, NULL, v_ordine.stato);
      END IF;
      CONTINUE;
    END IF;
    SELECT COALESCE(
      (SELECT (MAX(of2.completata_il)::date < v_oggi) FROM ordine_fasi of2 JOIN fasi f2 ON f2.id=of2.fase_id
       WHERE of2.ordine_id=v_ordine.id AND f2.posizione<v_fase.posizione AND of2.stato='completata'),
      (v_ordine.creato_il::date < v_oggi)
    ) INTO v_da_ieri;
    IF v_fase.e_attesa_esterna THEN
      INSERT INTO _piano_r VALUES (
        v_fase.fase_id, v_fase.nome, v_fase.posizione, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
        v_da_ieri, 'attesa_esterna', NULL, NULL, NULL, 'In attesa presso fornitore esterno', NULL, 0, false,
        jsonb_build_object('in_attesa_dal', v_fase.iniziata_il), NULL, NULL, v_ordine.stato);
      CONTINUE;
    END IF;
    SELECT CASE WHEN COUNT(*)>=v_k_soglia_gen THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY of2.tempo_accumulato_minuti::numeric/GREATEST(of2.n_ordini_batch,1)/GREATEST(o2.quantita,1))::numeric,0) ELSE NULL END, COUNT(*)
    INTO v_mediana_gen, v_n_camp_gen FROM ordine_fasi of2 JOIN ordini o2 ON o2.id=of2.ordine_id
    WHERE of2.fase_id=v_fase.fase_id AND of2.stato='completata' AND of2.tempo_accumulato_minuti>0 AND of2.completata_il IS NOT NULL;
    SELECT EXISTS(SELECT 1 FROM competenze_operatore_fase WHERE fase_id=v_fase.fase_id) INTO v_ha_competenze;
    SELECT EXISTS(SELECT 1 FROM fase_macchine WHERE fase_id=v_fase.fase_id) INTO v_ha_macchine;
    v_trovato := false;
    FOR v_comp IN
      SELECT cap.op_id AS operatore_id, c.priorita, cap.op_nome, (cap.ore_disp-cap.ore_usate) AS ore_libere
      FROM _cap_r cap LEFT JOIN competenze_operatore_fase c ON c.operatore_id=cap.op_id AND c.fase_id=v_fase.fase_id
      WHERE (v_ha_competenze AND c.operatore_id IS NOT NULL) OR (NOT v_ha_competenze)
      ORDER BY c.priorita ASC NULLS LAST, (cap.ore_disp-cap.ore_usate) DESC
    LOOP
      SELECT CASE WHEN COUNT(*)>=v_k_soglia THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY of2.tempo_accumulato_minuti::numeric/GREATEST(of2.n_ordini_batch,1)/GREATEST(o2.quantita,1))::numeric,0) ELSE NULL END, COUNT(*)
      INTO v_mediana, v_n_camp FROM ordine_fasi of2 JOIN ordini o2 ON o2.id=of2.ordine_id
      WHERE of2.fase_id=v_fase.fase_id AND of2.operatore_id=v_comp.operatore_id AND of2.stato='completata' AND of2.tempo_accumulato_minuti>0 AND of2.completata_il IS NOT NULL;
      IF v_mediana IS NOT NULL THEN
        v_stima_ore := (v_mediana*v_ordine.quantita)/60.0;
        v_motiv := v_comp.op_nome||CASE WHEN v_ha_competenze THEN ' — '||v_comp.priorita||'ª scelta, mediana storica '||v_mediana||' min ('||v_n_camp||' campioni)' ELSE ' — nessuna competenza specifica configurata, candidato per capacità disponibile (mediana storica '||v_mediana||' min)' END;
      ELSIF v_mediana_gen IS NOT NULL THEN
        v_mediana:=v_mediana_gen; v_stima_ore:=(v_mediana_gen*v_ordine.quantita)/60.0;
        v_motiv := v_comp.op_nome||CASE WHEN v_ha_competenze THEN ' — '||v_comp.priorita||'ª scelta, stima approssimata (media generale fase, '||v_n_camp_gen||' campioni totali)' ELSE ' — nessuna competenza specifica configurata, candidato per capacità disponibile (media generale fase, '||v_n_camp_gen||' campioni totali)' END;
      ELSE
        v_mediana:=v_k_stima_fallback; v_stima_ore:=(v_k_stima_fallback*v_ordine.quantita)/60.0;
        v_motiv := v_comp.op_nome||CASE WHEN v_ha_competenze THEN ' — '||v_comp.priorita||'ª scelta, stima approssimata (nessuno storico, valore prudenziale '||v_k_stima_fallback||' min)' ELSE ' — nessuna competenza specifica configurata, candidato per capacità disponibile (valore prudenziale '||v_k_stima_fallback||' min)' END;
      END IF;
      SELECT ore_usate, ore_disp INTO v_ore_usate, v_ore_disp FROM _cap_r WHERE op_id=v_comp.operatore_id;
      IF v_ore_usate+v_stima_ore > v_ore_disp THEN CONTINUE; END IF;
      v_mac_id := NULL; v_mac_nome := NULL;
      IF v_ha_macchine THEN
        SELECT mac.macchina_id, mac.macchina_nome INTO v_mac_id, v_mac_nome FROM _maccap_r mac
        WHERE mac.macchina_id IN (SELECT fm.macchina_id FROM fase_macchine fm WHERE fm.fase_id=v_fase.fase_id)
          AND (NOT EXISTS (SELECT 1 FROM competenze_operatore_macchina com WHERE com.macchina_id=mac.macchina_id)
               OR EXISTS  (SELECT 1 FROM competenze_operatore_macchina com WHERE com.macchina_id=mac.macchina_id AND com.operatore_id=v_comp.operatore_id))
          AND (mac.ore_disp-mac.ore_usate) >= v_stima_ore
        ORDER BY (mac.ore_disp-mac.ore_usate) DESC LIMIT 1;
        IF NOT FOUND THEN CONTINUE; END IF;
        UPDATE _maccap_r SET ore_usate=ore_usate+v_stima_ore WHERE macchina_id=v_mac_id;
      END IF;
      UPDATE _cap_r SET ore_usate=ore_usate+v_stima_ore WHERE op_id=v_comp.operatore_id;
      INSERT INTO _piano_r VALUES (
        v_fase.fase_id, v_fase.nome, v_fase.posizione, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
        v_da_ieri, v_fase.stato, v_comp.operatore_id, v_comp.op_nome, v_comp.priorita,
        v_motiv, v_mediana, COALESCE(v_n_camp,0), false, NULL, v_mac_id, v_mac_nome, v_ordine.stato);
      v_trovato := true; EXIT;
    END LOOP;
    IF NOT v_trovato THEN
      INSERT INTO _piano_r VALUES (
        v_fase.fase_id, v_fase.nome, v_fase.posizione, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
        v_da_ieri, v_fase.stato, NULL, NULL, NULL,
        CASE
          WHEN v_ha_macchine AND NOT EXISTS (SELECT 1 FROM _maccap_r WHERE macchina_id IN (SELECT macchina_id FROM fase_macchine WHERE fase_id=v_fase.fase_id))
            THEN 'Macchine richieste in manutenzione o fuori uso — riassegna manualmente'
          WHEN v_ha_macchine THEN 'Nessuna macchina disponibile con capacità sufficiente, o operatori esauriti — riassegna manualmente'
          WHEN v_ha_competenze THEN 'Tutti gli operatori competenti sono a capacità piena — riassegna manualmente'
          ELSE 'Tutti gli operatori sono a capacità piena oggi'
        END,
        NULL, 0, true, NULL, NULL, NULL, v_ordine.stato);
    END IF;
  END LOOP;

  FOR v_ordine IN
    SELECT o.id, o.codice, o.cliente, o.scadenza, GREATEST(COALESCE(o.quantita,1),1) AS quantita, o.creato_il, o.stato
    FROM ordini o WHERE o.stato NOT IN ('spedito') AND NOT COALESCE(o.eliminato,false) AND o.tipo='extra'
    ORDER BY o.scadenza NULLS LAST, o.id
  LOOP
    SELECT foe.id, foe.nome, foe.stato, foe.iniziata_il, foe.tipo_gestione,
           foe.catalogo_fase_extra_id, foe.ore_stimate_manuali, foe.macchina_id, foe.numero
    INTO v_fase_extra
    FROM fasi_ordine_extra foe
    WHERE foe.ordine_id = v_ordine.id AND foe.stato = 'disponibile'
    ORDER BY foe.numero ASC LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_cfe_id := v_fase_extra.catalogo_fase_extra_id;
    v_da_ieri := (v_ordine.creato_il::date < v_oggi);

    IF v_fase_extra.tipo_gestione = 'spedizione_esterna' THEN
      INSERT INTO _piano_extra_r VALUES (
        v_cfe_id, v_fase_extra.nome, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
        v_da_ieri, 'attesa_esterna', NULL, NULL, NULL,
        'In attesa presso fornitore esterno', NULL, 0, false, NULL, NULL, v_ordine.stato);
      CONTINUE;
    END IF;

    v_mediana_gen := NULL; v_n_camp_gen := 0;
    IF v_fase_extra.ore_stimate_manuali IS NOT NULL THEN
      v_mediana_gen := v_fase_extra.ore_stimate_manuali * 60;
      v_n_camp_gen := 0;
    ELSIF v_cfe_id IS NOT NULL THEN
      SELECT CASE WHEN COUNT(*)>=v_k_soglia_gen
               THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY foe2.tempo_accumulato_minuti::numeric/GREATEST(foe2.n_ordini_batch,1))::numeric,0)
               ELSE NULL END, COUNT(*)
      INTO v_mediana_gen, v_n_camp_gen
      FROM fasi_ordine_extra foe2
      WHERE foe2.catalogo_fase_extra_id=v_cfe_id AND foe2.stato='completata'
        AND foe2.tempo_accumulato_minuti>0 AND foe2.completata_il IS NOT NULL;
    END IF;

    v_ha_competenze := v_cfe_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM competenze_operatore_fase_extra WHERE catalogo_fase_extra_id=v_cfe_id
    );
    v_ha_macchine := v_cfe_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM catalogo_fase_extra_macchine WHERE catalogo_fase_extra_id=v_cfe_id
    );

    v_trovato := false;
    FOR v_comp IN
      SELECT cap.op_id AS operatore_id, c.priorita, cap.op_nome
      FROM _cap_r cap
      LEFT JOIN competenze_operatore_fase_extra c ON c.operatore_id=cap.op_id AND c.catalogo_fase_extra_id=v_cfe_id
      WHERE (v_ha_competenze AND c.operatore_id IS NOT NULL) OR (NOT v_ha_competenze)
      ORDER BY c.priorita ASC NULLS LAST, (cap.ore_disp-cap.ore_usate) DESC
    LOOP
      v_mediana := NULL; v_n_camp := 0;
      IF v_cfe_id IS NOT NULL THEN
        SELECT CASE WHEN COUNT(*)>=v_k_soglia
                 THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY foe2.tempo_accumulato_minuti::numeric/GREATEST(foe2.n_ordini_batch,1))::numeric,0)
                 ELSE NULL END, COUNT(*)
        INTO v_mediana, v_n_camp
        FROM fasi_ordine_extra foe2
        WHERE foe2.catalogo_fase_extra_id=v_cfe_id AND foe2.operatore_id=v_comp.operatore_id
          AND foe2.stato='completata' AND foe2.tempo_accumulato_minuti>0 AND foe2.completata_il IS NOT NULL;
      END IF;
      IF v_mediana IS NULL THEN
        v_mediana := COALESCE(v_mediana_gen, v_k_stima_fallback);
        v_n_camp := COALESCE(v_n_camp_gen, 0);
      END IF;
      v_stima_ore := v_mediana / 60.0;

      v_motiv := v_comp.op_nome || CASE WHEN v_ha_competenze
        THEN ' — '||v_comp.priorita||'ª scelta, mediana '||v_mediana||' min ('||v_n_camp||' campioni)'
        ELSE ' — candidato per capacità disponibile ('||v_mediana||' min stimati)' END;

      SELECT ore_usate, ore_disp INTO v_ore_usate, v_ore_disp FROM _cap_r WHERE op_id=v_comp.operatore_id;
      IF v_ore_usate+v_stima_ore > v_ore_disp THEN CONTINUE; END IF;

      v_mac_id := NULL; v_mac_nome := NULL;
      IF v_ha_macchine THEN
        SELECT mac.macchina_id, mac.macchina_nome INTO v_mac_id, v_mac_nome FROM _maccap_r mac
        WHERE mac.macchina_id IN (SELECT cfem.macchina_id FROM catalogo_fase_extra_macchine cfem WHERE cfem.catalogo_fase_extra_id=v_cfe_id)
          AND (NOT EXISTS (SELECT 1 FROM competenze_operatore_macchina com WHERE com.macchina_id=mac.macchina_id)
               OR EXISTS  (SELECT 1 FROM competenze_operatore_macchina com WHERE com.macchina_id=mac.macchina_id AND com.operatore_id=v_comp.operatore_id))
          AND (mac.ore_disp-mac.ore_usate) >= v_stima_ore
        ORDER BY (mac.ore_disp-mac.ore_usate) DESC LIMIT 1;
        IF NOT FOUND THEN CONTINUE; END IF;
        UPDATE _maccap_r SET ore_usate=ore_usate+v_stima_ore WHERE macchina_id=v_mac_id;
      END IF;

      UPDATE _cap_r SET ore_usate=ore_usate+v_stima_ore WHERE op_id=v_comp.operatore_id;
      INSERT INTO _piano_extra_r VALUES (
        v_cfe_id, v_fase_extra.nome, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
        v_da_ieri, v_fase_extra.stato, v_comp.operatore_id, v_comp.op_nome, v_comp.priorita,
        v_motiv, v_mediana, COALESCE(v_n_camp,0), false, v_mac_id, v_mac_nome, v_ordine.stato);
      v_trovato := true; EXIT;
    END LOOP;

    IF NOT v_trovato THEN
      INSERT INTO _piano_extra_r VALUES (
        v_cfe_id, v_fase_extra.nome, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
        v_da_ieri, v_fase_extra.stato, NULL, NULL, NULL,
        CASE
          WHEN v_ha_macchine THEN 'Nessuna macchina disponibile con capacità sufficiente — riassegna manualmente'
          WHEN v_ha_competenze THEN 'Tutti gli operatori competenti sono a capacità piena — riassegna manualmente'
          ELSE 'Tutti gli operatori sono a capacità piena oggi'
        END,
        NULL, 0, true, NULL, NULL, v_ordine.stato);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'data', v_oggi,
    'clusters', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('fase_id',g.fase_id,'fase_nome',g.fase_nome,'fase_posizione',g.fase_pos,
        'ordini',(SELECT jsonb_agg(jsonb_build_object(
          'ordine_id',r.ordine_id,'codice',r.codice,'cliente',r.cliente,'scadenza',r.scadenza,'da_ieri',r.da_ieri,'stato_fase',r.stato_fase,
          'operatore_proposto',CASE WHEN r.op_id IS NOT NULL THEN jsonb_build_object('id',r.op_id,'nome',r.op_nome,'priorita',r.op_prio) ELSE NULL END,
          'macchina_proposta',CASE WHEN r.mac_id IS NOT NULL THEN jsonb_build_object('id',r.mac_id,'nome',r.mac_nome) ELSE NULL END,
          'motivazione',r.motivazione,'stima_min',r.stima_min,'n_campioni',r.n_campioni,'conflitto',r.conflitto
        ) ORDER BY (CASE WHEN r.stato_ordine='attesa_spedizione' THEN 0 ELSE 1 END), r.scadenza NULLS LAST, r.cliente, r.codice)
        FROM _piano_r r WHERE r.fase_id=g.fase_id AND r.stato_fase NOT IN ('attesa_esterna','bloccata_dipendenze'))
      ) ORDER BY (CASE WHEN g.ha_attesa_spedizione THEN 0 ELSE 1 END), g.fase_pos, g.fase_id)
      FROM (
        SELECT fase_id, fase_nome, fase_pos,
          bool_or(stato_ordine = 'attesa_spedizione') AS ha_attesa_spedizione
        FROM _piano_r WHERE stato_fase NOT IN ('attesa_esterna','bloccata_dipendenze')
        GROUP BY fase_id, fase_nome, fase_pos
      ) g
    ),'[]'::jsonb),
    'clusters_extra', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'catalogo_id',g.catalogo_id,'fase_nome',g.fase_nome,
        'ordini',(SELECT jsonb_agg(jsonb_build_object(
          'ordine_id',r.ordine_id,'codice',r.codice,'cliente',r.cliente,'scadenza',r.scadenza,'da_ieri',r.da_ieri,'stato_fase',r.stato_fase,
          'operatore_proposto',CASE WHEN r.op_id IS NOT NULL THEN jsonb_build_object('id',r.op_id,'nome',r.op_nome,'priorita',r.op_prio) ELSE NULL END,
          'macchina_proposta',CASE WHEN r.mac_id IS NOT NULL THEN jsonb_build_object('id',r.mac_id,'nome',r.mac_nome) ELSE NULL END,
          'motivazione',r.motivazione,'stima_min',r.stima_min,'n_campioni',r.n_campioni,'conflitto',r.conflitto
        ) ORDER BY (CASE WHEN r.stato_ordine='attesa_spedizione' THEN 0 ELSE 1 END), r.scadenza NULLS LAST, r.cliente, r.codice)
        FROM _piano_extra_r r WHERE r.catalogo_id IS NOT DISTINCT FROM g.catalogo_id AND r.fase_nome=g.fase_nome
          AND r.stato_fase NOT IN ('attesa_esterna'))
      ) ORDER BY g.fase_nome)
      FROM (
        SELECT catalogo_id, fase_nome FROM _piano_extra_r
        WHERE stato_fase NOT IN ('attesa_esterna')
        GROUP BY catalogo_id, fase_nome
      ) g
    ),'[]'::jsonb),
    'attese_esterne', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('ordine_id',ordine_id,'codice',codice,'cliente',cliente,'scadenza',scadenza,'fase_id',fase_id,'fase_nome',fase_nome,'da_ieri',da_ieri,'in_attesa_dal',extra_json->'in_attesa_dal') ORDER BY cliente,codice)
      FROM _piano_r WHERE stato_fase='attesa_esterna'),'[]'::jsonb),
    'attese_sblocco', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('ordine_id',ordine_id,'codice',codice,'cliente',cliente,'scadenza',scadenza,'fase_id',fase_id,'fase_nome',fase_nome,'dipendenze',extra_json) ORDER BY cliente,codice)
      FROM _piano_r WHERE stato_fase='bloccata_dipendenze'),'[]'::jsonb),
    'conflitti', COALESCE((
      SELECT jsonb_agg(q) FROM (
        SELECT jsonb_build_object('ordine_id',ordine_id,'codice',codice,'cliente',cliente,'fase_id',fase_id,'fase_nome',fase_nome,'motivazione',motivazione) AS q FROM _piano_r WHERE conflitto=true
        UNION ALL
        SELECT jsonb_build_object('ordine_id',ordine_id,'codice',codice,'cliente',cliente,'fase_nome',fase_nome,'motivazione',motivazione) AS q FROM _piano_extra_r WHERE conflitto=true
      ) sq
    ),'[]'::jsonb),
    'ore_per_operatore', COALESCE((SELECT jsonb_object_agg(op_id::text,jsonb_build_object('nome',op_nome,'ore_disponibili',ROUND(ore_disp::numeric,2),'ore_assegnate',ROUND(ore_usate::numeric,2))) FROM _cap_r),'{}'::jsonb),
    'ore_per_macchina', COALESCE((SELECT jsonb_object_agg(macchina_id::text,jsonb_build_object('nome',macchina_nome,'ore_disponibili',ROUND(ore_disp::numeric,2),'ore_assegnate',ROUND(ore_usate::numeric,2))) FROM _maccap_r),'{}'::jsonb)
  );
END;
$$;


ALTER FUNCTION public.piano_giornaliero_raggruppato(p_responsabile_id uuid, p_session_token uuid, p_data date) OWNER TO postgres;

--
-- Name: piano_multi_giorno(integer, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.piano_multi_giorno(p_giorni integer DEFAULT 5, p_responsabile_id uuid DEFAULT NULL::uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_margine            numeric;
  v_k_soglia           int;
  v_k_soglia_gen       int;
  v_k_stima_fallback   numeric;

  v_config      config_orario%ROWTYPE;
  v_data        date;
  v_dow         int;
  v_giorno_num  int     := 0;
  v_ore_base    numeric;
  v_chiusura    text;

  v_ordine      RECORD;
  v_fase        RECORD;
  v_comp        RECORD;
  v_mediana     numeric;
  v_mediana_gen numeric;
  v_n_camp      bigint;
  v_n_camp_gen  bigint;
  v_stima_ore   numeric;
  v_ore_usate   numeric;
  v_ore_disp    numeric;
  v_trovato     boolean;
  v_mac_id      uuid;
  v_mac_nome    text;
  v_ha_comp     boolean;
  v_ha_mac      boolean;
  v_stima_inc   boolean;
  v_giorni_sim  jsonb;
  v_oltre       jsonb;
BEGIN
  IF p_responsabile_id IS NOT NULL THEN
    IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
    END IF;
  END IF;

  SELECT
    COALESCE(MAX(valore) FILTER (WHERE chiave='margine_capacita'),                0.90),
    COALESCE(MAX(valore) FILTER (WHERE chiave='soglia_campioni_op'),              5)::int,
    COALESCE(MAX(valore) FILTER (WHERE chiave='soglia_campioni_gen'),             3)::int,
    COALESCE(MAX(valore) FILTER (WHERE chiave='durata_default_fase_extra_minuti'),30)
  INTO v_margine, v_k_soglia, v_k_soglia_gen, v_k_stima_fallback
  FROM kpi_config
  WHERE chiave IN ('margine_capacita','soglia_campioni_op','soglia_campioni_gen','durata_default_fase_extra_minuti');

  SELECT * INTO v_config FROM config_orario LIMIT 1;

  CREATE TEMP TABLE IF NOT EXISTS _sim_fasi (
    ordine_id uuid,
    fase_id   smallint,
    stato_sim text,
    PRIMARY KEY (ordine_id, fase_id)
  ) ON COMMIT DROP;
  TRUNCATE _sim_fasi;

  INSERT INTO _sim_fasi (ordine_id, fase_id, stato_sim)
  SELECT DISTINCT ON (of2.ordine_id, of2.fase_id)
    of2.ordine_id,
    of2.fase_id,
    CASE WHEN of2.stato IN ('completata','non_applicabile')
         THEN 'completata_sim'
         ELSE 'disponibile' END
  FROM ordine_fasi of2
  JOIN ordini o ON o.id = of2.ordine_id
  WHERE o.stato IN ('aperto','attesa_spedizione')
    AND NOT COALESCE(o.eliminato, false)
    AND o.tipo = 'standard'
  ORDER BY of2.ordine_id,
           of2.fase_id,
           CASE WHEN of2.stato NOT IN ('completata','non_applicabile') THEN 0 ELSE 1 END ASC;

  CREATE TEMP TABLE IF NOT EXISTS _gantt_out (
    giorno_num int,
    data       date,
    ordine_id  uuid,
    codice     text,
    cliente    text,
    scadenza   date,
    fase_id    smallint,
    fase_nome  text,
    op_id      uuid,
    op_nome    text,
    mac_id     uuid,
    mac_nome   text,
    stima_min  numeric,
    stima_inc  boolean
  ) ON COMMIT DROP;
  TRUNCATE _gantt_out;

  CREATE TEMP TABLE IF NOT EXISTS _cap_sim (
    op_id     uuid PRIMARY KEY,
    op_nome   text,
    ore_disp  numeric,
    ore_usate numeric DEFAULT 0
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS _maccap_sim (
    macchina_id   uuid PRIMARY KEY,
    macchina_nome text,
    ore_disp      numeric,
    ore_usate     numeric DEFAULT 0
  ) ON COMMIT DROP;

  v_data := CURRENT_DATE;

  WHILE v_giorno_num < p_giorni LOOP
    v_data := v_data + 1;
    v_dow  := EXTRACT(DOW FROM v_data)::int;

    IF v_dow = 0 AND NOT COALESCE(v_config.domenica_lavorativa, false) THEN CONTINUE; END IF;
    IF v_dow = 6 AND NOT COALESCE(v_config.sabato_lavorativo, false) THEN CONTINUE; END IF;
    SELECT descrizione INTO v_chiusura FROM chiusure_aziendali
     WHERE v_data BETWEEN data_inizio AND data_fine LIMIT 1;
    IF FOUND THEN CONTINUE; END IF;

    v_giorno_num := v_giorno_num + 1;

    IF v_dow = 6 THEN
      v_ore_base := COALESCE(v_config.ore_sabato, 6.0);
    ELSIF v_dow = 0 THEN
      v_ore_base := COALESCE(v_config.ore_domenica, 6.0);
    ELSE
      IF v_config.ora_inizio IS NULL OR v_config.ora_fine IS NULL THEN
        v_ore_base := 8.0;
      ELSE
        v_ore_base := EXTRACT(EPOCH FROM (v_config.ora_fine - v_config.ora_inizio)) / 3600.0;
      END IF;
      IF COALESCE(v_config.pausa_attiva, false) THEN
        v_ore_base := v_ore_base - COALESCE(v_config.pausa_minuti, 0) / 60.0;
      END IF;
    END IF;

    TRUNCATE _cap_sim;
    INSERT INTO _cap_sim (op_id, op_nome, ore_disp)
    SELECT u.id, u.nome || ' ' || u.cognome, COALESCE(dg.ore, v_ore_base, 8.0) * v_margine
    FROM users u
    LEFT JOIN disponibilita_giornaliera dg ON dg.operatore_id = u.id AND dg.data = v_data
    WHERE u.ruolo = 'operatore' AND u.attivo = true
      AND NOT COALESCE(u.eliminato, false) AND NOT COALESCE(u.escluso_pianificazione, false);

    TRUNCATE _maccap_sim;
    INSERT INTO _maccap_sim (macchina_id, macchina_nome, ore_disp)
    SELECT m.id, m.nome, m.ore_default * v_margine FROM macchine m WHERE m.stato = 'attiva';

    FOR v_ordine IN
      SELECT o.id, o.codice, o.cliente, o.scadenza, GREATEST(COALESCE(o.quantita, 1), 1) AS quantita
      FROM ordini o
      WHERE o.stato IN ('aperto','attesa_spedizione') AND NOT COALESCE(o.eliminato, false) AND o.tipo = 'standard'
      ORDER BY o.scadenza NULLS LAST, o.id
    LOOP
      SELECT of2.fase_id, f.nome, f.posizione, COALESCE(f.e_attesa_esterna, false) AS e_attesa_esterna
      INTO v_fase
      FROM ordine_fasi of2
      JOIN fasi f ON f.id = of2.fase_id
      JOIN _sim_fasi sf ON sf.ordine_id = of2.ordine_id AND sf.fase_id = of2.fase_id
      WHERE of2.ordine_id = v_ordine.id AND sf.stato_sim = 'disponibile'
        AND NOT COALESCE(f.e_attesa_esterna, false)
        AND NOT EXISTS (
          SELECT 1 FROM fase_dipendenze fd
          JOIN _sim_fasi dep_sf ON dep_sf.ordine_id = of2.ordine_id AND dep_sf.fase_id = fd.dipende_da_fase_id
          WHERE fd.fase_id = of2.fase_id AND dep_sf.stato_sim <> 'completata_sim'
        )
      ORDER BY f.posizione ASC, f.id ASC LIMIT 1;

      IF NOT FOUND THEN CONTINUE; END IF;

      SELECT CASE WHEN COUNT(*) >= v_k_soglia_gen
                  THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch,1) / GREATEST(o2.quantita,1)
                  )::numeric, 0) ELSE NULL END, COUNT(*)
      INTO v_mediana_gen, v_n_camp_gen
      FROM ordine_fasi of2 JOIN ordini o2 ON o2.id = of2.ordine_id
      WHERE of2.fase_id = v_fase.fase_id AND of2.stato = 'completata' AND of2.tempo_accumulato_minuti > 0;

      v_stima_inc := (v_n_camp_gen < v_k_soglia_gen);

      SELECT EXISTS(SELECT 1 FROM competenze_operatore_fase WHERE fase_id = v_fase.fase_id) INTO v_ha_comp;
      SELECT EXISTS(SELECT 1 FROM fase_macchine WHERE fase_id = v_fase.fase_id) INTO v_ha_mac;

      v_trovato := false;

      FOR v_comp IN
        SELECT cap.op_id, cap.op_nome, c.priorita
        FROM _cap_sim cap
        LEFT JOIN competenze_operatore_fase c ON c.operatore_id = cap.op_id AND c.fase_id = v_fase.fase_id
        WHERE (v_ha_comp AND c.operatore_id IS NOT NULL) OR NOT v_ha_comp
        ORDER BY c.priorita ASC NULLS LAST, (cap.ore_disp - cap.ore_usate) DESC
      LOOP
        SELECT CASE WHEN COUNT(*) >= v_k_soglia
                    THEN ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                      ORDER BY of2.tempo_accumulato_minuti::numeric / GREATEST(of2.n_ordini_batch,1) / GREATEST(o2.quantita,1)
                    )::numeric, 0) ELSE NULL END, COUNT(*)
        INTO v_mediana, v_n_camp
        FROM ordine_fasi of2 JOIN ordini o2 ON o2.id = of2.ordine_id
        WHERE of2.fase_id = v_fase.fase_id AND of2.operatore_id = v_comp.op_id
          AND of2.stato = 'completata' AND of2.tempo_accumulato_minuti > 0;

        v_mediana   := COALESCE(v_mediana, v_mediana_gen, v_k_stima_fallback);
        v_stima_ore := (v_mediana * v_ordine.quantita) / 60.0;

        SELECT ore_usate, ore_disp INTO v_ore_usate, v_ore_disp FROM _cap_sim WHERE op_id = v_comp.op_id;
        IF v_ore_usate + v_stima_ore > v_ore_disp THEN CONTINUE; END IF;

        v_mac_id := NULL; v_mac_nome := NULL;
        IF v_ha_mac THEN
          SELECT mac.macchina_id, mac.macchina_nome INTO v_mac_id, v_mac_nome
          FROM _maccap_sim mac
          WHERE mac.macchina_id IN (SELECT fm.macchina_id FROM fase_macchine fm WHERE fm.fase_id = v_fase.fase_id)
            AND (NOT EXISTS (SELECT 1 FROM competenze_operatore_macchina com WHERE com.macchina_id = mac.macchina_id)
                 OR  EXISTS (SELECT 1 FROM competenze_operatore_macchina com WHERE com.macchina_id = mac.macchina_id AND com.operatore_id = v_comp.op_id))
            AND (mac.ore_disp - mac.ore_usate) >= v_stima_ore
          ORDER BY (mac.ore_disp - mac.ore_usate) DESC LIMIT 1;
          IF NOT FOUND THEN CONTINUE; END IF;
          UPDATE _maccap_sim SET ore_usate = ore_usate + v_stima_ore WHERE macchina_id = v_mac_id;
        END IF;

        UPDATE _cap_sim SET ore_usate = ore_usate + v_stima_ore WHERE op_id = v_comp.op_id;

        INSERT INTO _gantt_out VALUES (
          v_giorno_num, v_data, v_ordine.id, v_ordine.codice, v_ordine.cliente, v_ordine.scadenza,
          v_fase.fase_id, v_fase.nome, v_comp.op_id, v_comp.op_nome, v_mac_id, v_mac_nome,
          v_mediana * v_ordine.quantita, v_stima_inc
        );

        UPDATE _sim_fasi SET stato_sim = 'completata_sim' WHERE ordine_id = v_ordine.id AND fase_id = v_fase.fase_id;
        v_trovato := true; EXIT;
      END LOOP;
    END LOOP;
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object('giorno', g.giorno_num, 'data', g.data,
    'fasi', (SELECT jsonb_agg(jsonb_build_object(
      'ordine_id', r.ordine_id, 'codice', r.codice, 'cliente', r.cliente, 'scadenza', r.scadenza,
      'fase_id', r.fase_id, 'fase_nome', r.fase_nome, 'op_id', r.op_id, 'op_nome', r.op_nome,
      'mac_id', r.mac_id, 'mac_nome', r.mac_nome, 'stima_min', r.stima_min, 'stima_incerta', r.stima_inc
    ) ORDER BY r.scadenza NULLS LAST, r.cliente, r.codice)
    FROM _gantt_out r WHERE r.giorno_num = g.giorno_num)
  ) ORDER BY g.giorno_num) INTO v_giorni_sim
  FROM (SELECT DISTINCT giorno_num, data FROM _gantt_out ORDER BY giorno_num) g;

  SELECT jsonb_agg(jsonb_build_object(
    'ordine_id', o.id, 'codice', o.codice, 'cliente', o.cliente, 'scadenza', o.scadenza,
    'fase_id', sf.fase_id, 'fase_nome', f.nome
  ) ORDER BY o.scadenza NULLS LAST, o.cliente, o.codice) INTO v_oltre
  FROM _sim_fasi sf JOIN ordini o ON o.id = sf.ordine_id JOIN fasi f ON f.id = sf.fase_id
  WHERE sf.stato_sim = 'disponibile';

  RETURN jsonb_build_object(
    'ok', true,
    'giorni_simulati', COALESCE(v_giorni_sim, '[]'::jsonb),
    'oltre',           COALESCE(v_oltre, '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION public.piano_multi_giorno(p_giorni integer, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: prendi_in_carico_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prendi_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_stato TEXT;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT stato INTO v_stato FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF v_stato != 'disponibile' THEN RETURN json_build_object('ok', false, 'errore', 'non_disponibile'); END IF;
  UPDATE fasi_ordine_extra SET stato='in_corso', operatore_id=p_operatore_id, iniziata_il=NOW() WHERE id=p_fase_extra_id AND stato='disponibile';
  INSERT INTO fasi_extra_operatori(fasi_ordine_extra_id, operatore_id) VALUES(p_fase_extra_id, p_operatore_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.prendi_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: prendi_in_carico_fase(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prendi_in_carico_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fase ordine_fasi%ROWTYPE;
  v_deps_ns jsonb;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata'); END IF;
  IF v_fase.stato <> 'disponibile' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Fase non disponibile — già presa in carico o completata');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'fase_id', fd.dipende_da_fase_id,
    'nome',    f.nome,
    'stato',   of2.stato
  ))
  INTO v_deps_ns
  FROM fase_dipendenze fd
  JOIN fasi f ON f.id = fd.dipende_da_fase_id
  JOIN ordine_fasi of2
    ON of2.ordine_id = v_fase.ordine_id
   AND of2.fase_id  = fd.dipende_da_fase_id
  WHERE fd.fase_id = v_fase.fase_id
    AND of2.stato NOT IN ('completata', 'non_applicabile');

  IF v_deps_ns IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'errore', 'fase_bloccata_da_dipendenza',
      'dipendenze_non_soddisfatte', v_deps_ns
    );
  END IF;

  IF EXISTS (SELECT 1 FROM ordini WHERE id = v_fase.ordine_id AND stato = 'sospeso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Ordine sospeso');
  END IF;
  UPDATE ordine_fasi
     SET stato = 'in_corso', operatore_id = p_operatore_id, iniziata_il = NOW()
   WHERE id = p_ordine_fase_id;
  INSERT INTO ordine_fasi_operatori(ordine_fase_id, operatore_id)
    VALUES(p_ordine_fase_id, p_operatore_id) ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO archivio_log(ordine_id, fase_id, utente_id, azione, dettaglio)
    VALUES(v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_iniziata',
           jsonb_build_object('ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.prendi_in_carico_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: riapri_fase_extra_resp(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riapri_fase_extra_resp(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_ordine_id uuid;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  SELECT ordine_id INTO v_ordine_id FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;

  UPDATE fasi_ordine_extra
    SET stato = 'disponibile',
        operatore_id = NULL,
        iniziata_il = NULL,
        completata_il = NULL
    WHERE id = p_fase_extra_id;

  -- Se l'ordine era attesa_spedizione e ora ha fasi non completate, torna aperto
  UPDATE ordini
    SET stato = 'aperto', completato_il = NULL
    WHERE id = v_ordine_id
      AND stato = 'attesa_spedizione'
      AND EXISTS (
        SELECT 1 FROM fasi_ordine_extra
        WHERE ordine_id = v_ordine_id
          AND stato NOT IN ('completata')
      );

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.riapri_fase_extra_resp(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: riapri_fase_operatore(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riapri_fase_operatore(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fase            ordine_fasi%ROWTYPE;
  v_is_responsabile BOOLEAN := FALSE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF p_operatore_id IS NULL THEN
    RETURN json_build_object('ok', false, 'errore', 'operatore_id_obbligatorio');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id AND stato = 'completata';
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'errore', 'fase_non_trovata_o_non_completata');
  END IF;
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'responsabile' AND attivo = TRUE)
    INTO v_is_responsabile;
  IF NOT v_is_responsabile AND v_fase.operatore_id IS DISTINCT FROM p_operatore_id THEN
    RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  UPDATE ordine_fasi
  SET stato = 'disponibile', operatore_id = NULL, iniziata_il = NULL, completata_il = NULL
  WHERE id = p_ordine_fase_id;
  DELETE FROM ordine_fasi_operatori WHERE ordine_fase_id = p_ordine_fase_id;
  BEGIN
    INSERT INTO archivio_log (ordine_id, fase_id, utente_id, azione, dettaglio)
  VALUES (v_fase.ordine_id, v_fase.fase_id, p_operatore_id, 'fase_riaperta',
          jsonb_build_object('ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.riapri_fase_operatore(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: riassegna_fase(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riassegna_fase(p_ordine_fase_id uuid, p_responsabile_id uuid, p_nuovo_operatore uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'Azione riservata al responsabile');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id=p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'Fase non trovata'); END IF;
  UPDATE ordine_fasi SET operatore_id=p_nuovo_operatore, stato='in_corso', iniziata_il=COALESCE(v_fase.iniziata_il,NOW()) WHERE id=p_ordine_fase_id;
  DELETE FROM ordine_fasi_operatori WHERE ordine_fase_id=p_ordine_fase_id;
  INSERT INTO ordine_fasi_operatori(ordine_fase_id, operatore_id) VALUES(p_ordine_fase_id, p_nuovo_operatore) ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO archivio_log(ordine_id, fase_id, utente_id, azione, dettaglio)
    VALUES(v_fase.ordine_id, v_fase.fase_id, p_responsabile_id, 'fase_riassegnata',
           jsonb_build_object('vecchio_operatore', v_fase.operatore_id, 'nuovo_operatore', p_nuovo_operatore));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  INSERT INTO notifiche(destinatario_id, tipo, testo, ordine_id)
    SELECT id, 'fase_riassegnata', 'Fase riassegnata a nuovo operatore', v_fase.ordine_id FROM users WHERE ruolo='responsabile';
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.riassegna_fase(p_ordine_fase_id uuid, p_responsabile_id uuid, p_nuovo_operatore uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: riassegna_fase_extra(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riassegna_fase_extra(p_fase_extra_id uuid, p_nuovo_op uuid, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  UPDATE fasi_ordine_extra SET operatore_id=p_nuovo_op WHERE id=p_fase_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.riassegna_fase_extra(p_fase_extra_id uuid, p_nuovo_op uuid, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: ricalcola_fase_su_ordini_esistenti(smallint, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ricalcola_fase_su_ordini_esistenti(p_fase_id smallint, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ord       RECORD;
  v_tipo_prod TEXT;
  v_materiale TEXT;
  v_struttura TEXT;
  v_tipi_ids  TEXT[];
  v_mat_ids   TEXT[];
  v_strut_ids TEXT[];
  v_applicabile  BOOLEAN;
  v_riga      ordine_fasi%ROWTYPE;
  v_attivate  INT := 0;
  v_disattivate INT := 0;
  v_invariate INT := 0;
  v_saltate   INT := 0;
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_responsabile_id AND ruolo = 'responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  IF p_fase_id IN (8, 9, 11) THEN
    RETURN jsonb_build_object('ok', true, 'saltato', true, 'motivo', 'fase_con_regola_hardcoded');
  END IF;

  SELECT ARRAY(SELECT tipo_prodotto_id FROM fase_tipi_prodotto WHERE fase_id = p_fase_id) INTO v_tipi_ids;
  SELECT ARRAY(SELECT materiale_valore  FROM fase_materiali    WHERE fase_id = p_fase_id) INTO v_mat_ids;
  SELECT ARRAY(SELECT struttura_valore  FROM fase_strutture    WHERE fase_id = p_fase_id) INTO v_strut_ids;

  FOR v_ord IN
    SELECT o.id AS ordine_id, o.tipo_prodotto, o.materiale, o.struttura
    FROM ordini o
    WHERE o.stato != 'spedito'
      AND (o.eliminato IS NULL OR o.eliminato = false)
      AND o.tipo != 'extra'
  LOOP
    v_tipo_prod := LOWER(COALESCE(v_ord.tipo_prodotto, ''));
    v_materiale := LOWER(COALESCE(v_ord.materiale, ''));
    v_struttura := LOWER(COALESCE(v_ord.struttura, ''));

    v_applicabile := true;
    IF cardinality(v_tipi_ids)  > 0 AND NOT (v_tipo_prod = ANY(v_tipi_ids))  THEN v_applicabile := false; END IF;
    IF cardinality(v_mat_ids)   > 0 AND NOT (v_materiale  = ANY(v_mat_ids))  THEN v_applicabile := false; END IF;
    IF cardinality(v_strut_ids) > 0 AND NOT (v_struttura  = ANY(v_strut_ids)) THEN v_applicabile := false; END IF;

    SELECT * INTO v_riga FROM ordine_fasi
    WHERE ordine_id = v_ord.ordine_id AND fase_id = p_fase_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_applicabile THEN
      IF v_riga.stato = 'non_applicabile' THEN
        UPDATE ordine_fasi SET stato = 'disponibile'
        WHERE ordine_id = v_ord.ordine_id AND fase_id = p_fase_id;
        v_attivate := v_attivate + 1;
      ELSE
        v_invariate := v_invariate + 1;
      END IF;
    ELSE
      IF v_riga.stato IN ('in_corso','completata','in_attesa') THEN
        v_saltate := v_saltate + 1;
      ELSIF v_riga.stato = 'disponibile' THEN
        UPDATE ordine_fasi SET stato = 'non_applicabile'
        WHERE ordine_id = v_ord.ordine_id AND fase_id = p_fase_id;
        v_disattivate := v_disattivate + 1;
      ELSE
        v_invariate := v_invariate + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'attivate', v_attivate,
    'disattivate', v_disattivate,
    'invariate', v_invariate,
    'saltate_stato_avanzato', v_saltate
  );
END;
$$;


ALTER FUNCTION public.ricalcola_fase_su_ordini_esistenti(p_fase_id smallint, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: riepilogo_competenze_operatore(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riepilogo_competenze_operatore(p_operatore_id uuid) RETURNS TABLE(fase_id smallint, fase_nome text, fase_posizione integer, priorita smallint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.fase_id, f.nome, f.posizione, c.priorita
  FROM competenze_operatore_fase c JOIN fasi f ON f.id = c.fase_id
  WHERE c.operatore_id = p_operatore_id ORDER BY f.posizione, f.id;
$$;


ALTER FUNCTION public.riepilogo_competenze_operatore(p_operatore_id uuid) OWNER TO postgres;

--
-- Name: rimuovi_collega_extra(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rimuovi_collega_extra(p_fase_extra_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase fasi_ordine_extra%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_richiedente_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_richiedente_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF p_richiedente_id IS DISTINCT FROM p_collega_id
     AND v_fase.operatore_id IS DISTINCT FROM p_richiedente_id
     AND NOT EXISTS (SELECT 1 FROM fasi_extra_operatori WHERE fasi_ordine_extra_id=p_fase_extra_id AND operatore_id=p_richiedente_id)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id=p_richiedente_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  DELETE FROM fasi_extra_operatori WHERE fasi_ordine_extra_id=p_fase_extra_id AND operatore_id=p_collega_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.rimuovi_collega_extra(p_fase_extra_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: rimuovi_collega_fase(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rimuovi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_richiedente_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_richiedente_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF p_richiedente_id IS DISTINCT FROM p_collega_id
     AND v_fase.operatore_id IS DISTINCT FROM p_richiedente_id
     AND NOT EXISTS (SELECT 1 FROM ordine_fasi_operatori WHERE ordine_fase_id=p_ordine_fase_id AND operatore_id=p_richiedente_id)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id=p_richiedente_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  DELETE FROM ordine_fasi_operatori WHERE ordine_fase_id=p_ordine_fase_id AND operatore_id=p_collega_id;
  BEGIN
    INSERT INTO archivio_log(ordine_id, utente_id, azione, dettaglio)
  VALUES(v_fase.ordine_id, p_richiedente_id, 'fase_annullata',
         jsonb_build_object('rimosso_da', p_richiedente_id, 'operatore_id', p_collega_id, 'ordine_fase_id', p_ordine_fase_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.rimuovi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: riprendi_fase(uuid, uuid, boolean, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riprendi_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_forza boolean DEFAULT false, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE; v_tg text;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.fase_id IS NOT NULL THEN
    SELECT tipo_gestione INTO v_tg FROM fasi WHERE id = v_fase.fase_id;
    IF v_tg IS DISTINCT FROM 'standard' THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'usa_conferma_ricezione', 'tipo_gestione', v_tg, 'messaggio', 'Usa il pulsante specifico per questo tipo di fase');
    END IF;
  END IF;
  IF v_fase.stato NOT IN ('in_attesa','in_corso') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_riprendibile', 'stato', v_fase.stato);
  END IF;
  UPDATE ordine_fasi SET stato='in_corso', operatore_id=p_operatore_id, iniziata_il=COALESCE(v_fase.iniziata_il, NOW()) WHERE id=p_ordine_fase_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.riprendi_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_forza boolean, p_session_token uuid) OWNER TO postgres;

--
-- Name: riprendi_tutte_fasi(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.riprendi_tutte_fasi(p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  UPDATE ordine_fasi SET stato='in_corso', iniziata_il=NOW() WHERE operatore_id=p_operatore_id AND stato='in_attesa';
  UPDATE fasi_ordine_extra SET stato='in_corso', iniziata_il=NOW() WHERE operatore_id=p_operatore_id AND stato='in_attesa';
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.riprendi_tutte_fasi(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: salva_allegato(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.salva_allegato(p_ordine_fase_id uuid, p_url_file text, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.operatore_id IS DISTINCT FROM p_operatore_id
     AND NOT EXISTS (SELECT 1 FROM ordine_fasi_operatori WHERE ordine_fase_id=p_ordine_fase_id AND operatore_id=p_operatore_id)
     AND NOT EXISTS (SELECT 1 FROM users WHERE id=p_operatore_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  INSERT INTO allegati(ordine_fase_id, url_file, caricato_da) VALUES(p_ordine_fase_id, p_url_file, p_operatore_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.salva_allegato(p_ordine_fase_id uuid, p_url_file text, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: salva_nota_fase_extra(uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.salva_nota_fase_extra(p_fase_extra_id uuid, p_note text, p_responsabile_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_responsabile_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_responsabile_id AND ruolo='responsabile') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;
  UPDATE fasi_ordine_extra SET note_responsabile=p_note WHERE id=p_fase_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.salva_nota_fase_extra(p_fase_extra_id uuid, p_note text, p_responsabile_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: salva_onesignal_id(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.salva_onesignal_id(p_user_id uuid, p_onesignal_id text, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT COALESCE(valida_sessione(p_user_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'non_autorizzato');
  END IF;

  UPDATE public.users
     SET onesignal_id = p_onesignal_id
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('ok', v_count > 0, 'righe', v_count);
END;
$$;


ALTER FUNCTION public.salva_onesignal_id(p_user_id uuid, p_onesignal_id text, p_session_token uuid) OWNER TO postgres;

--
-- Name: segna_notifiche_lette(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.segna_notifiche_lette(p_utente_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count integer;
BEGIN
  IF NOT COALESCE(valida_sessione(p_utente_id, p_session_token), false) THEN
    RAISE EXCEPTION 'sessione_non_valida';
  END IF;

  UPDATE public.notifiche
  SET letta = true
  WHERE destinatario_id = p_utente_id AND letta = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION public.segna_notifiche_lette(p_utente_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: segna_spedito(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.segna_spedito(p_ordine_id uuid, p_utente_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_ordine ordini%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_utente_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_utente_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_ordine FROM ordini WHERE id = p_ordine_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'errore', 'Ordine non trovato'); END IF;
  IF v_ordine.stato = 'spedito' THEN RETURN json_build_object('ok', false, 'errore', 'Ordine già segnato come spedito'); END IF;
  IF v_ordine.stato NOT IN ('aperto', 'attesa_spedizione') THEN
    RETURN json_build_object('ok', false, 'errore', 'Impossibile spedire un ordine in stato: ' || v_ordine.stato);
  END IF;
  UPDATE ordini SET stato='spedito', spedito_il=NOW() WHERE id=p_ordine_id;
  BEGIN
    INSERT INTO archivio_log (ordine_id, utente_id, azione) VALUES (p_ordine_id, p_utente_id, 'ordine_spedito');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log non scritto: %', SQLERRM;
  END;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.segna_spedito(p_ordine_id uuid, p_utente_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: segna_spedizione_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.segna_spedizione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase fasi_ordine_extra%ROWTYPE;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_fase.tipo_gestione <> 'spedizione_esterna' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'tipo_gestione_non_valido', 'tipo_gestione', v_fase.tipo_gestione);
  END IF;
  IF v_fase.stato <> 'disponibile' THEN RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_disponibile', 'stato', v_fase.stato); END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_operatore_id AND ruolo='responsabile') THEN
    IF v_fase.operatore_id IS NOT NULL AND v_fase.operatore_id IS DISTINCT FROM p_operatore_id
       AND NOT EXISTS (SELECT 1 FROM fasi_extra_operatori WHERE fasi_ordine_extra_id=p_fase_extra_id AND operatore_id=p_operatore_id) THEN
      RETURN jsonb_build_object('ok', false, 'errore', 'non_autorizzato');
    END IF;
  END IF;
  UPDATE fasi_ordine_extra SET stato='in_attesa', spedita_il=NOW() WHERE id=p_fase_extra_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.segna_spedizione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: segna_spedizione_fase(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.segna_spedizione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_fase ordine_fasi%ROWTYPE; v_tg text;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT * INTO v_fase FROM ordine_fasi WHERE id = p_ordine_fase_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  SELECT tipo_gestione INTO v_tg FROM fasi WHERE id = v_fase.fase_id;
  IF v_tg IS DISTINCT FROM 'spedizione_esterna' THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'tipo_gestione_non_valido', 'tipo_gestione', v_tg);
  END IF;
  IF v_fase.stato <> 'disponibile' THEN RETURN jsonb_build_object('ok', false, 'errore', 'stato_non_disponibile', 'stato', v_fase.stato); END IF;
  UPDATE ordine_fasi SET stato='in_attesa', spedita_il=NOW() WHERE id=p_ordine_fase_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.segna_spedizione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: statistiche_lavoro_ordini(uuid[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.statistiche_lavoro_ordini(p_ordine_ids uuid[]) RETURNS TABLE(ordine_id uuid, minuti_lavoro numeric, minuti_attesa_esterna numeric, n_operatori bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH fasi_std AS (
    SELECT
      of2.ordine_id,
      COALESCE(of2.tempo_accumulato_minuti, 0) AS minuti,
      (COALESCE(f.tipo_gestione, 'standard') <> 'standard'
       OR COALESCE(f.e_attesa_esterna, false)) AS is_attesa_esterna,
      of2.operatore_id
    FROM ordine_fasi of2
    LEFT JOIN fasi f ON f.id = of2.fase_id
    WHERE of2.ordine_id = ANY(p_ordine_ids)
  ),
  fasi_extra AS (
    SELECT
      foe.ordine_id,
      COALESCE(foe.tempo_accumulato_minuti, 0) AS minuti,
      (COALESCE(foe.tipo_gestione, 'standard') <> 'standard'
       OR COALESCE(foe.e_attesa_esterna, false)) AS is_attesa_esterna,
      foe.operatore_id
    FROM fasi_ordine_extra foe
    WHERE foe.ordine_id = ANY(p_ordine_ids)
  ),
  tempo AS (
    SELECT
      ordine_id,
      SUM(CASE WHEN NOT is_attesa_esterna THEN minuti ELSE 0 END) AS minuti_lavoro,
      SUM(CASE WHEN     is_attesa_esterna THEN minuti ELSE 0 END) AS minuti_attesa_esterna
    FROM (
      SELECT ordine_id, minuti, is_attesa_esterna FROM fasi_std
      UNION ALL
      SELECT ordine_id, minuti, is_attesa_esterna FROM fasi_extra
    ) all_fasi
    GROUP BY ordine_id
  ),
  op_std AS (
    SELECT of2.ordine_id, of2.operatore_id AS op_id
    FROM ordine_fasi of2
    LEFT JOIN fasi f ON f.id = of2.fase_id
    WHERE of2.ordine_id = ANY(p_ordine_ids)
      AND of2.operatore_id IS NOT NULL
      AND COALESCE(f.tipo_gestione, 'standard') = 'standard'
      AND NOT COALESCE(f.e_attesa_esterna, false)
  ),
  op_std_jn AS (
    SELECT of2.ordine_id, ofo.operatore_id AS op_id
    FROM ordine_fasi_operatori ofo
    JOIN ordine_fasi of2 ON of2.id = ofo.ordine_fase_id
    LEFT JOIN fasi f ON f.id = of2.fase_id
    WHERE of2.ordine_id = ANY(p_ordine_ids)
      AND COALESCE(f.tipo_gestione, 'standard') = 'standard'
      AND NOT COALESCE(f.e_attesa_esterna, false)
  ),
  op_extra AS (
    SELECT foe.ordine_id, foe.operatore_id AS op_id
    FROM fasi_ordine_extra foe
    WHERE foe.ordine_id = ANY(p_ordine_ids)
      AND foe.operatore_id IS NOT NULL
      AND COALESCE(foe.tipo_gestione, 'standard') = 'standard'
      AND NOT COALESCE(foe.e_attesa_esterna, false)
  ),
  op_extra_jn AS (
    SELECT foe.ordine_id, feo.operatore_id AS op_id
    FROM fasi_extra_operatori feo
    JOIN fasi_ordine_extra foe ON foe.id = feo.fasi_ordine_extra_id
    WHERE foe.ordine_id = ANY(p_ordine_ids)
      AND COALESCE(foe.tipo_gestione, 'standard') = 'standard'
      AND NOT COALESCE(foe.e_attesa_esterna, false)
  ),
  tutti_op AS (
    SELECT ordine_id, op_id FROM op_std
    UNION
    SELECT ordine_id, op_id FROM op_std_jn
    UNION
    SELECT ordine_id, op_id FROM op_extra
    UNION
    SELECT ordine_id, op_id FROM op_extra_jn
  ),
  op_count AS (
    SELECT ordine_id, COUNT(DISTINCT op_id) AS n_operatori
    FROM tutti_op WHERE op_id IS NOT NULL
    GROUP BY ordine_id
  )
  SELECT
    o.id                                  AS ordine_id,
    COALESCE(t.minuti_lavoro, 0)         AS minuti_lavoro,
    COALESCE(t.minuti_attesa_esterna, 0) AS minuti_attesa_esterna,
    COALESCE(oc.n_operatori, 0)          AS n_operatori
  FROM unnest(p_ordine_ids) AS o(id)
  LEFT JOIN tempo    t  ON t.ordine_id  = o.id
  LEFT JOIN op_count oc ON oc.ordine_id = o.id;
$$;


ALTER FUNCTION public.statistiche_lavoro_ordini(p_ordine_ids uuid[]) OWNER TO postgres;

--
-- Name: storico_fasi_completate(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.storico_fasi_completate(p_operatore_id uuid, p_session_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb)
    FROM (
      SELECT to_jsonb(of) || jsonb_build_object(
        'ordini', jsonb_build_object('codice', o.codice, 'cliente', o.cliente),
        'fasi',   CASE WHEN f.id IS NOT NULL THEN jsonb_build_object('nome', f.nome) ELSE NULL END
      ) AS row_json
      FROM ordine_fasi of
      JOIN ordini o ON o.id = of.ordine_id
      LEFT JOIN fasi f ON f.id = of.fase_id
      WHERE of.operatore_id = p_operatore_id AND of.stato = 'completata'
      ORDER BY of.completata_il DESC
      LIMIT 30
    ) sub
  ));
END;
$$;


ALTER FUNCTION public.storico_fasi_completate(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: storico_ordini_periodo(uuid, uuid, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.storico_ordini_periodo(p_operatore_id uuid, p_session_token uuid, p_dal timestamp with time zone, p_al timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.spedito_il DESC NULLS LAST), '[]'::jsonb)
    FROM ordini o
    WHERE (o.spedito_il >= p_dal AND o.spedito_il < p_al)
       OR (o.spedito_il IS NULL AND o.completato_il >= p_dal AND o.completato_il < p_al)
  ));
END;
$$;


ALTER FUNCTION public.storico_ordini_periodo(p_operatore_id uuid, p_session_token uuid, p_dal timestamp with time zone, p_al timestamp with time zone) OWNER TO postgres;

--
-- Name: sync_e_attesa_esterna(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_e_attesa_esterna() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.tipo_gestione IN ('conferma_ricezione','spedizione_esterna') THEN
    NEW.e_attesa_esterna := true;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_e_attesa_esterna() OWNER TO postgres;

--
-- Name: tempo_medio_fasi_dati(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.tempo_medio_fasi_dati(p_operatore_id uuid, p_session_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN jsonb_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  RETURN jsonb_build_object('ok', true, 'dati', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fase_id', of.fase_id,
      'tempo_accumulato_minuti', of.tempo_accumulato_minuti,
      'n_ordini_batch', of.n_ordini_batch,
      'ordini', jsonb_build_object('quantita', o.quantita)
    )), '[]'::jsonb)
    FROM ordine_fasi of
    JOIN ordini o ON o.id = of.ordine_id
    WHERE of.stato = 'completata'
      AND of.tempo_accumulato_minuti > 0
      AND of.tempo_accumulato_minuti < 20000
      AND of.fase_id IS NOT NULL
  ));
END;
$$;


ALTER FUNCTION public.tempo_medio_fasi_dati(p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: trigger_push_notifica(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trigger_push_notifica() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_url TEXT;
  v_secret_key TEXT;
  v_edge_base TEXT;
  v_app_base TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_secret_key IS NULL THEN
    RAISE WARNING 'trigger_push_notifica: service_role_key non trovata in Vault';
    RETURN NEW;
  END IF;

  SELECT valore INTO v_edge_base FROM config_sistema WHERE chiave = 'edge_functions_base_url' LIMIT 1;
  SELECT valore INTO v_app_base  FROM config_sistema WHERE chiave = 'app_base_url'            LIMIT 1;

  IF v_edge_base IS NULL THEN
    RAISE WARNING 'trigger_push_notifica: edge_functions_base_url non trovata in config_sistema';
    RETURN NEW;
  END IF;
  IF v_app_base IS NULL THEN
    RAISE WARNING 'trigger_push_notifica: app_base_url non trovata in config_sistema';
    RETURN NEW;
  END IF;

  IF NEW.ordine_id IS NOT NULL THEN
    v_url := v_app_base || '/operatore.html?ordine=' || NEW.ordine_id::text;
  ELSE
    v_url := v_app_base || '/operatore.html';
  END IF;

  PERFORM net.http_post(
    url := v_edge_base || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret_key,
      'apikey', v_secret_key
    ),
    body := jsonb_build_object(
      'destinatario_id', NEW.destinatario_id::text,
      'messaggio', NEW.testo,
      'url', v_url
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_push_notifica() OWNER TO postgres;

--
-- Name: unisciti_fase_extra(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.unisciti_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_stato TEXT;
BEGIN
  IF NOT COALESCE(valida_sessione(p_operatore_id, p_session_token), false) THEN
    RETURN json_build_object('ok', false, 'errore', 'sessione_non_valida');
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_operatore_id AND ruolo = 'sola_lettura') THEN
    RETURN json_build_object('ok', false, 'errore', 'accesso_sola_lettura');
  END IF;
  SELECT stato INTO v_stato FROM fasi_ordine_extra WHERE id = p_fase_extra_id;
  IF v_stato IS NULL THEN RETURN json_build_object('ok', false, 'errore', 'fase_non_trovata'); END IF;
  IF v_stato != 'in_corso' THEN RETURN json_build_object('ok', false, 'errore', 'fase_non_in_corso'); END IF;
  INSERT INTO fasi_extra_operatori(fasi_ordine_extra_id, operatore_id) VALUES(p_fase_extra_id, p_operatore_id) ON CONFLICT DO NOTHING;
  RETURN json_build_object('ok', true);
END;
$$;


ALTER FUNCTION public.unisciti_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: valida_sessione(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.valida_sessione(p_user_id uuid, p_session_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Controlli comuni a tutti i ruoli
  IF NOT COALESCE(v_user.attivo, false)     THEN RETURN false; END IF;
  IF COALESCE(v_user.eliminato, false)      THEN RETURN false; END IF;
  IF COALESCE(v_user.forzato_logout, false) THEN RETURN false; END IF;

  -- Responsabile: autenticato via Supabase Auth, l'identità provata è auth.uid()
  IF v_user.ruolo = 'responsabile' THEN
    RETURN COALESCE(auth.uid() = p_user_id, false);
  END IF;

  -- Operatore / sola_lettura: autenticati via PIN + session_token
  IF p_session_token IS NULL                THEN RETURN false; END IF;
  IF v_user.session_token IS NULL           THEN RETURN false; END IF;
  IF v_user.session_token_scadenza IS NULL  THEN RETURN false; END IF;

  RETURN COALESCE(
           v_user.session_token = p_session_token
             AND v_user.session_token_scadenza > NOW(),
           false);
END;
$$;


ALTER FUNCTION public.valida_sessione(p_user_id uuid, p_session_token uuid) OWNER TO postgres;

--
-- Name: verifica_pin(uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.verifica_pin(p_user_id uuid, p_pin text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user RECORD;
  v_tentativi INT;
  v_token UUID;
BEGIN
  -- Rate limit: conta fallimenti ultimi 15 minuti
  SELECT COUNT(*) INTO v_tentativi
  FROM public.pin_tentativi
  WHERE user_id = p_user_id
    AND tentato_il > now() - INTERVAL '15 minutes';

  IF v_tentativi >= 5 THEN
    RETURN json_build_object(
      'ok', false,
      'errore', 'troppi_tentativi',
      'messaggio', 'Accesso bloccato per 15 minuti dopo troppi tentativi errati'
    );
  END IF;

  -- Carica utente (seleziona solo campi necessari)
  SELECT id, nome, cognome, ruolo, attivo, pin_hash
  INTO v_user
  FROM public.users
  WHERE id = p_user_id AND attivo = TRUE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'errore', 'utente_non_trovato');
  END IF;

  -- Verifica PIN tramite bcrypt (solo pin_hash, legacy rimosso)
  IF v_user.pin_hash IS NOT NULL AND extensions.crypt(p_pin, v_user.pin_hash) = v_user.pin_hash THEN
    -- Successo: pulisce i tentativi falliti
    DELETE FROM public.pin_tentativi WHERE user_id = p_user_id;
    -- Genera session_token valido 24h
    v_token := gen_random_uuid();
    UPDATE public.users
      SET session_token = v_token,
          session_token_scadenza = now() + INTERVAL '24 hours'
      WHERE id = p_user_id;
    -- Restituisce SOLO campi necessari, mai pin_hash
    RETURN json_build_object(
      'ok', true,
      'session_token', v_token::text,
      'user', json_build_object(
        'id',      v_user.id,
        'nome',    v_user.nome,
        'cognome', v_user.cognome,
        'ruolo',   v_user.ruolo,
        'attivo',  v_user.attivo
      )
    );
  END IF;

  -- Fallimento: registra tentativo
  INSERT INTO public.pin_tentativi(user_id) VALUES (p_user_id);

  RETURN json_build_object('ok', false, 'errore', 'pin_errato');
END;
$$;


ALTER FUNCTION public.verifica_pin(p_user_id uuid, p_pin text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: allegati; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allegati (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ordine_fase_id uuid NOT NULL,
    url_file text NOT NULL,
    caricato_da uuid NOT NULL,
    caricato_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.allegati OWNER TO postgres;

--
-- Name: archivio_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.archivio_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ordine_id uuid NOT NULL,
    fase_id smallint,
    utente_id uuid NOT NULL,
    azione public.azione_log NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    dettaglio jsonb
);


ALTER TABLE public.archivio_log OWNER TO postgres;

--
-- Name: attributi_prodotto_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attributi_prodotto_config (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    chiave text NOT NULL,
    etichetta text NOT NULL,
    tipo text DEFAULT 'select_singola'::text NOT NULL,
    opzioni jsonb DEFAULT '[]'::jsonb NOT NULL,
    obbligatorio boolean DEFAULT true NOT NULL,
    posizione integer DEFAULT 0 NOT NULL,
    attivo boolean DEFAULT true NOT NULL,
    CONSTRAINT attributi_prodotto_config_tipo_check CHECK ((tipo = 'select_singola'::text))
);


ALTER TABLE public.attributi_prodotto_config OWNER TO postgres;

--
-- Name: catalogo_fase_extra_macchine; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.catalogo_fase_extra_macchine (
    catalogo_fase_extra_id uuid NOT NULL,
    macchina_id uuid NOT NULL
);


ALTER TABLE public.catalogo_fase_extra_macchine OWNER TO postgres;

--
-- Name: catalogo_fasi_extra; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.catalogo_fasi_extra (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nome text NOT NULL,
    descrizione text,
    tipo_gestione text DEFAULT 'standard'::text NOT NULL,
    e_attesa_esterna boolean DEFAULT false NOT NULL,
    attiva boolean DEFAULT true NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.catalogo_fasi_extra OWNER TO postgres;

--
-- Name: chiusure_aziendali; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chiusure_aziendali (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_inizio date NOT NULL,
    data_fine date NOT NULL,
    descrizione text,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chiusure_date_check CHECK ((data_fine >= data_inizio))
);


ALTER TABLE public.chiusure_aziendali OWNER TO postgres;

--
-- Name: competenze_operatore_fase; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competenze_operatore_fase (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    operatore_id uuid NOT NULL,
    fase_id smallint NOT NULL,
    priorita smallint NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT competenze_operatore_fase_priorita_check CHECK ((priorita >= 1))
);


ALTER TABLE public.competenze_operatore_fase OWNER TO postgres;

--
-- Name: competenze_operatore_fase_extra; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competenze_operatore_fase_extra (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    operatore_id uuid NOT NULL,
    catalogo_fase_extra_id uuid NOT NULL,
    priorita smallint NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.competenze_operatore_fase_extra OWNER TO postgres;

--
-- Name: competenze_operatore_macchina; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competenze_operatore_macchina (
    operatore_id uuid NOT NULL,
    macchina_id uuid NOT NULL,
    priorita integer DEFAULT 1 NOT NULL
);


ALTER TABLE public.competenze_operatore_macchina OWNER TO postgres;

--
-- Name: config_orario; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.config_orario (
    id boolean DEFAULT true NOT NULL,
    ora_inizio time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    ora_fine time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    sabato_lavorativo boolean DEFAULT false NOT NULL,
    ore_sabato numeric(4,2) DEFAULT 4,
    domenica_lavorativa boolean DEFAULT false,
    ore_domenica numeric(4,2) DEFAULT 0,
    straordinario_attivo boolean DEFAULT false,
    ore_straordinario numeric(4,2) DEFAULT 2,
    pausa_attiva boolean DEFAULT true,
    pausa_minuti integer DEFAULT 60,
    ora_fine_sabato time without time zone DEFAULT '13:00:00'::time without time zone NOT NULL,
    CONSTRAINT config_orario_id_check CHECK ((id = true))
);


ALTER TABLE public.config_orario OWNER TO postgres;

--
-- Name: config_sistema; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.config_sistema (
    chiave text NOT NULL,
    valore text
);


ALTER TABLE public.config_sistema OWNER TO postgres;

--
-- Name: disponibilita_giornaliera; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.disponibilita_giornaliera (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    operatore_id uuid NOT NULL,
    data date NOT NULL,
    ore numeric(4,1) NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    motivo text,
    CONSTRAINT disponibilita_giornaliera_ore_check CHECK ((ore >= (0)::numeric))
);


ALTER TABLE public.disponibilita_giornaliera OWNER TO postgres;

--
-- Name: fase_dipendenze; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fase_dipendenze (
    fase_id smallint NOT NULL,
    dipende_da_fase_id smallint NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT no_self_dep CHECK ((fase_id <> dipende_da_fase_id))
);


ALTER TABLE public.fase_dipendenze OWNER TO postgres;

--
-- Name: fase_macchine; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fase_macchine (
    fase_id smallint NOT NULL,
    macchina_id uuid NOT NULL
);


ALTER TABLE public.fase_macchine OWNER TO postgres;

--
-- Name: fase_materiali; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fase_materiali (
    fase_id smallint NOT NULL,
    materiale_valore text NOT NULL
);


ALTER TABLE public.fase_materiali OWNER TO postgres;

--
-- Name: fase_strutture; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fase_strutture (
    fase_id smallint NOT NULL,
    struttura_valore text NOT NULL
);


ALTER TABLE public.fase_strutture OWNER TO postgres;

--
-- Name: fase_tipi_prodotto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fase_tipi_prodotto (
    fase_id smallint NOT NULL,
    tipo_prodotto_id text NOT NULL
);


ALTER TABLE public.fase_tipi_prodotto OWNER TO postgres;

--
-- Name: fasi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fasi (
    id smallint NOT NULL,
    nome text NOT NULL,
    descrizione text,
    posizione integer,
    macro_fase_id integer,
    e_attesa_esterna boolean DEFAULT false NOT NULL,
    tipo_gestione text DEFAULT 'standard'::text NOT NULL,
    opzionale boolean DEFAULT false NOT NULL,
    avvio_automatico boolean DEFAULT false NOT NULL,
    CONSTRAINT fasi_tipo_gestione_check CHECK ((tipo_gestione = ANY (ARRAY['standard'::text, 'conferma_ricezione'::text, 'spedizione_esterna'::text])))
);


ALTER TABLE public.fasi OWNER TO postgres;

--
-- Name: fasi_extra_operatori; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fasi_extra_operatori (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fasi_ordine_extra_id uuid NOT NULL,
    operatore_id uuid NOT NULL
);


ALTER TABLE public.fasi_extra_operatori OWNER TO postgres;

--
-- Name: fasi_ordine_extra; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fasi_ordine_extra (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ordine_id uuid NOT NULL,
    numero smallint NOT NULL,
    nome text NOT NULL,
    stato public.stato_fase DEFAULT 'disponibile'::public.stato_fase NOT NULL,
    operatore_id uuid,
    note_responsabile text,
    note_operatore text,
    iniziata_il timestamp with time zone,
    completata_il timestamp with time zone,
    creato_il timestamp with time zone DEFAULT now(),
    reminder_inviato_il timestamp with time zone,
    tempo_accumulato_minuti numeric,
    n_ordini_batch smallint DEFAULT 1 NOT NULL,
    e_attesa_esterna boolean DEFAULT false NOT NULL,
    tipo_gestione text DEFAULT 'standard'::text NOT NULL,
    spedita_il timestamp with time zone,
    catalogo_fase_extra_id uuid,
    macchina_id uuid,
    ore_stimate_manuali numeric,
    CONSTRAINT fasi_ordine_extra_numero_check CHECK (((numero >= 1) AND (numero <= 20))),
    CONSTRAINT foe_tipo_gestione_check CHECK ((tipo_gestione = ANY (ARRAY['standard'::text, 'conferma_ricezione'::text, 'spedizione_esterna'::text])))
);


ALTER TABLE public.fasi_ordine_extra OWNER TO postgres;

--
-- Name: kpi_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kpi_config (
    chiave text NOT NULL,
    valore numeric NOT NULL,
    descrizione text
);


ALTER TABLE public.kpi_config OWNER TO postgres;

--
-- Name: kpi_schede; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kpi_schede (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    criteri jsonb NOT NULL,
    ore_interne_iniziali numeric,
    giorni_calendario_iniziali numeric,
    n_campioni_iniziali integer,
    creata_da uuid,
    creata_il timestamp with time zone DEFAULT now()
);


ALTER TABLE public.kpi_schede OWNER TO postgres;

--
-- Name: macchine; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.macchine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    stato text DEFAULT 'attiva'::text NOT NULL,
    ore_default numeric DEFAULT 8.0 NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    aggiornato_il timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT macchine_stato_check CHECK ((stato = ANY (ARRAY['attiva'::text, 'manutenzione'::text, 'fuori_uso'::text])))
);


ALTER TABLE public.macchine OWNER TO postgres;

--
-- Name: macro_fasi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.macro_fasi (
    id integer NOT NULL,
    nome text NOT NULL,
    posizione integer DEFAULT 0,
    colore text DEFAULT '#6B7280'::text
);


ALTER TABLE public.macro_fasi OWNER TO postgres;

--
-- Name: macro_fasi_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.macro_fasi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.macro_fasi_id_seq OWNER TO postgres;

--
-- Name: macro_fasi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.macro_fasi_id_seq OWNED BY public.macro_fasi.id;


--
-- Name: manutenzioni_macchina; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.manutenzioni_macchina (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    macchina_id uuid NOT NULL,
    data_inizio date NOT NULL,
    data_fine date NOT NULL,
    descrizione text,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manutenzioni_macchina_date_check CHECK ((data_fine >= data_inizio))
);


ALTER TABLE public.manutenzioni_macchina OWNER TO postgres;

--
-- Name: notifiche; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifiche (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    destinatario_id uuid NOT NULL,
    tipo public.tipo_notifica NOT NULL,
    testo text NOT NULL,
    ordine_id uuid,
    letta boolean DEFAULT false NOT NULL,
    creata_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifiche OWNER TO postgres;

--
-- Name: notifiche_destinatari_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifiche_destinatari_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_evento text NOT NULL,
    utente_id uuid NOT NULL,
    attivo boolean DEFAULT true NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifiche_destinatari_config OWNER TO postgres;

--
-- Name: ordine_fasi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ordine_fasi (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    ordine_id uuid NOT NULL,
    fase_id smallint,
    stato public.stato_fase DEFAULT 'disponibile'::public.stato_fase NOT NULL,
    operatore_id uuid,
    iniziata_il timestamp with time zone,
    completata_il timestamp with time zone,
    note_responsabile text,
    note_operatore text,
    nome_custom text,
    tempo_accumulato_minuti numeric DEFAULT 0,
    reminder_inviato_il timestamp with time zone,
    n_ordini_batch smallint DEFAULT 1 NOT NULL,
    spedita_il timestamp with time zone
);


ALTER TABLE public.ordine_fasi OWNER TO postgres;

--
-- Name: COLUMN ordine_fasi.n_ordini_batch; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.ordine_fasi.n_ordini_batch IS 'Numero di ordini completati insieme nello stesso batch. Per calcolare il tempo EFFETTIVO per singola unità in qualsiasi analisi/KPI futura, dividere sempre tempo_accumulato_minuti per n_ordini_batch — non usare mai tempo_accumulato_minuti da solo per calcoli di tempo medio per fase.';


--
-- Name: ordine_fasi_operatori; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ordine_fasi_operatori (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ordine_fase_id uuid NOT NULL,
    operatore_id uuid NOT NULL,
    aggiunto_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ordine_fasi_operatori OWNER TO postgres;

--
-- Name: ordini; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ordini (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    codice text,
    cliente text NOT NULL,
    priorita text DEFAULT 'normale'::text NOT NULL,
    scadenza date,
    stato public.stato_ordine DEFAULT 'aperto'::public.stato_ordine NOT NULL,
    note_generali text,
    creato_da uuid NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    spedito_il timestamp with time zone,
    tipo text DEFAULT 'standard'::text,
    struttura text DEFAULT 'quattro_lati'::text NOT NULL,
    tipo_prodotto text DEFAULT 'portoncino'::text NOT NULL,
    materiale text DEFAULT 'placchetta'::text NOT NULL,
    eliminato boolean DEFAULT false NOT NULL,
    quantita integer DEFAULT 1 NOT NULL,
    completato_il timestamp with time zone,
    archiviato_il timestamp with time zone,
    CONSTRAINT ordini_quantita_check CHECK ((quantita >= 1)),
    CONSTRAINT ordini_tipo_check CHECK ((tipo = ANY (ARRAY['standard'::text, 'extra'::text])))
);


ALTER TABLE public.ordini OWNER TO postgres;

--
-- Name: ordini_codice_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ordini_codice_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ordini_codice_seq OWNER TO postgres;

--
-- Name: pin_tentativi; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pin_tentativi (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tentato_il timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pin_tentativi OWNER TO postgres;

--
-- Name: priorita_ordine_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.priorita_ordine_config (
    id text NOT NULL,
    etichetta text NOT NULL,
    peso integer DEFAULT 10 NOT NULL,
    posizione integer DEFAULT 0 NOT NULL,
    attivo boolean DEFAULT true NOT NULL
);


ALTER TABLE public.priorita_ordine_config OWNER TO postgres;

--
-- Name: snapshot_backfill_fasi_eliminate_20260903; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.snapshot_backfill_fasi_eliminate_20260903 (
    id uuid NOT NULL,
    tabella_origine text NOT NULL,
    stato_precedente public.stato_fase NOT NULL,
    momento timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT snapshot_backfill_fasi_eliminate_20260903_tabella_origine_check CHECK ((tabella_origine = ANY (ARRAY['ordine_fasi'::text, 'fasi_ordine_extra'::text])))
);


ALTER TABLE public.snapshot_backfill_fasi_eliminate_20260903 OWNER TO postgres;

--
-- Name: tipi_prodotto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tipi_prodotto (
    id text NOT NULL,
    label text NOT NULL,
    posizione integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.tipi_prodotto OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    nome text NOT NULL,
    cognome text NOT NULL,
    email text,
    ruolo public.ruolo_utente NOT NULL,
    attivo boolean DEFAULT true NOT NULL,
    creato_il timestamp with time zone DEFAULT now() NOT NULL,
    eliminato boolean DEFAULT false NOT NULL,
    pin_hash text,
    onesignal_id text,
    session_token uuid,
    session_token_scadenza timestamp with time zone,
    forzato_logout boolean DEFAULT false,
    ore_default numeric(4,1) DEFAULT 8.0 NOT NULL,
    escluso_pianificazione boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_responsabile_email CHECK (((ruolo <> 'responsabile'::public.ruolo_utente) OR (email IS NOT NULL)))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: macro_fasi id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.macro_fasi ALTER COLUMN id SET DEFAULT nextval('public.macro_fasi_id_seq'::regclass);


--
-- Name: allegati allegati_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allegati
    ADD CONSTRAINT allegati_pkey PRIMARY KEY (id);


--
-- Name: archivio_log archivio_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.archivio_log
    ADD CONSTRAINT archivio_log_pkey PRIMARY KEY (id);


--
-- Name: attributi_prodotto_config attributi_prodotto_config_chiave_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attributi_prodotto_config
    ADD CONSTRAINT attributi_prodotto_config_chiave_key UNIQUE (chiave);


--
-- Name: attributi_prodotto_config attributi_prodotto_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attributi_prodotto_config
    ADD CONSTRAINT attributi_prodotto_config_pkey PRIMARY KEY (id);


--
-- Name: catalogo_fase_extra_macchine catalogo_fase_extra_macchine_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_fase_extra_macchine
    ADD CONSTRAINT catalogo_fase_extra_macchine_pkey PRIMARY KEY (catalogo_fase_extra_id, macchina_id);


--
-- Name: catalogo_fasi_extra catalogo_fasi_extra_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_fasi_extra
    ADD CONSTRAINT catalogo_fasi_extra_pkey PRIMARY KEY (id);


--
-- Name: chiusure_aziendali chiusure_aziendali_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chiusure_aziendali
    ADD CONSTRAINT chiusure_aziendali_pkey PRIMARY KEY (id);


--
-- Name: competenze_operatore_fase_extra competenze_operatore_fase_ext_operatore_id_catalogo_fase_ex_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase_extra
    ADD CONSTRAINT competenze_operatore_fase_ext_operatore_id_catalogo_fase_ex_key UNIQUE (operatore_id, catalogo_fase_extra_id);


--
-- Name: competenze_operatore_fase_extra competenze_operatore_fase_extra_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase_extra
    ADD CONSTRAINT competenze_operatore_fase_extra_pkey PRIMARY KEY (id);


--
-- Name: competenze_operatore_fase competenze_operatore_fase_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase
    ADD CONSTRAINT competenze_operatore_fase_pkey PRIMARY KEY (id);


--
-- Name: competenze_operatore_fase competenze_operatore_fase_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase
    ADD CONSTRAINT competenze_operatore_fase_unique UNIQUE (operatore_id, fase_id);


--
-- Name: competenze_operatore_macchina competenze_operatore_macchina_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_macchina
    ADD CONSTRAINT competenze_operatore_macchina_pkey PRIMARY KEY (operatore_id, macchina_id);


--
-- Name: config_orario config_orario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.config_orario
    ADD CONSTRAINT config_orario_pkey PRIMARY KEY (id);


--
-- Name: config_sistema config_sistema_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.config_sistema
    ADD CONSTRAINT config_sistema_pkey PRIMARY KEY (chiave);


--
-- Name: disponibilita_giornaliera disponibilita_giornaliera_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.disponibilita_giornaliera
    ADD CONSTRAINT disponibilita_giornaliera_pkey PRIMARY KEY (id);


--
-- Name: disponibilita_giornaliera disponibilita_giornaliera_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.disponibilita_giornaliera
    ADD CONSTRAINT disponibilita_giornaliera_unique UNIQUE (operatore_id, data);


--
-- Name: fase_dipendenze fase_dipendenze_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_dipendenze
    ADD CONSTRAINT fase_dipendenze_pkey PRIMARY KEY (fase_id, dipende_da_fase_id);


--
-- Name: fase_macchine fase_macchine_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_macchine
    ADD CONSTRAINT fase_macchine_pkey PRIMARY KEY (fase_id, macchina_id);


--
-- Name: fase_materiali fase_materiali_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_materiali
    ADD CONSTRAINT fase_materiali_pkey PRIMARY KEY (fase_id, materiale_valore);


--
-- Name: fase_strutture fase_strutture_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_strutture
    ADD CONSTRAINT fase_strutture_pkey PRIMARY KEY (fase_id, struttura_valore);


--
-- Name: fase_tipi_prodotto fase_tipi_prodotto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_tipi_prodotto
    ADD CONSTRAINT fase_tipi_prodotto_pkey PRIMARY KEY (fase_id, tipo_prodotto_id);


--
-- Name: fasi_extra_operatori fasi_extra_operatori_fasi_ordine_extra_id_operatore_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_extra_operatori
    ADD CONSTRAINT fasi_extra_operatori_fasi_ordine_extra_id_operatore_id_key UNIQUE (fasi_ordine_extra_id, operatore_id);


--
-- Name: fasi_extra_operatori fasi_extra_operatori_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_extra_operatori
    ADD CONSTRAINT fasi_extra_operatori_pkey PRIMARY KEY (id);


--
-- Name: fasi_ordine_extra fasi_ordine_extra_ordine_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_ordine_extra
    ADD CONSTRAINT fasi_ordine_extra_ordine_id_numero_key UNIQUE (ordine_id, numero);


--
-- Name: fasi_ordine_extra fasi_ordine_extra_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_ordine_extra
    ADD CONSTRAINT fasi_ordine_extra_pkey PRIMARY KEY (id);


--
-- Name: fasi fasi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi
    ADD CONSTRAINT fasi_pkey PRIMARY KEY (id);


--
-- Name: kpi_config kpi_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_config
    ADD CONSTRAINT kpi_config_pkey PRIMARY KEY (chiave);


--
-- Name: kpi_schede kpi_schede_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_schede
    ADD CONSTRAINT kpi_schede_pkey PRIMARY KEY (id);


--
-- Name: macchine macchine_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.macchine
    ADD CONSTRAINT macchine_pkey PRIMARY KEY (id);


--
-- Name: macro_fasi macro_fasi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.macro_fasi
    ADD CONSTRAINT macro_fasi_pkey PRIMARY KEY (id);


--
-- Name: manutenzioni_macchina manutenzioni_macchina_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manutenzioni_macchina
    ADD CONSTRAINT manutenzioni_macchina_pkey PRIMARY KEY (id);


--
-- Name: notifiche_destinatari_config notifiche_destinatari_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifiche_destinatari_config
    ADD CONSTRAINT notifiche_destinatari_config_pkey PRIMARY KEY (id);


--
-- Name: notifiche_destinatari_config notifiche_destinatari_config_tipo_evento_utente_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifiche_destinatari_config
    ADD CONSTRAINT notifiche_destinatari_config_tipo_evento_utente_id_key UNIQUE (tipo_evento, utente_id);


--
-- Name: notifiche notifiche_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifiche
    ADD CONSTRAINT notifiche_pkey PRIMARY KEY (id);


--
-- Name: ordine_fasi_operatori ordine_fasi_operatori_ordine_fase_id_operatore_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi_operatori
    ADD CONSTRAINT ordine_fasi_operatori_ordine_fase_id_operatore_id_key UNIQUE (ordine_fase_id, operatore_id);


--
-- Name: ordine_fasi_operatori ordine_fasi_operatori_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi_operatori
    ADD CONSTRAINT ordine_fasi_operatori_pkey PRIMARY KEY (id);


--
-- Name: ordine_fasi ordine_fasi_ordine_id_fase_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi
    ADD CONSTRAINT ordine_fasi_ordine_id_fase_id_key UNIQUE (ordine_id, fase_id);


--
-- Name: ordine_fasi ordine_fasi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi
    ADD CONSTRAINT ordine_fasi_pkey PRIMARY KEY (id);


--
-- Name: ordini ordini_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordini
    ADD CONSTRAINT ordini_pkey PRIMARY KEY (id);


--
-- Name: pin_tentativi pin_tentativi_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pin_tentativi
    ADD CONSTRAINT pin_tentativi_pkey PRIMARY KEY (id);


--
-- Name: priorita_ordine_config priorita_ordine_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.priorita_ordine_config
    ADD CONSTRAINT priorita_ordine_config_pkey PRIMARY KEY (id);


--
-- Name: snapshot_backfill_fasi_eliminate_20260903 snapshot_backfill_fasi_eliminate_20260903_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.snapshot_backfill_fasi_eliminate_20260903
    ADD CONSTRAINT snapshot_backfill_fasi_eliminate_20260903_pkey PRIMARY KEY (id, tabella_origine);


--
-- Name: tipi_prodotto tipi_prodotto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipi_prodotto
    ADD CONSTRAINT tipi_prodotto_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_allegati_caricato_da; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_allegati_caricato_da ON public.allegati USING btree (caricato_da);


--
-- Name: idx_allegati_ordine_fase; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_allegati_ordine_fase ON public.allegati USING btree (ordine_fase_id);


--
-- Name: idx_archivio_log_fase_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_archivio_log_fase_id ON public.archivio_log USING btree (fase_id);


--
-- Name: idx_fasi_extra_operatori_operatore_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fasi_extra_operatori_operatore_id ON public.fasi_extra_operatori USING btree (operatore_id);


--
-- Name: idx_fasi_macro_fase_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fasi_macro_fase_id ON public.fasi USING btree (macro_fase_id);


--
-- Name: idx_fasi_ordine_extra_operatore_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fasi_ordine_extra_operatore_id ON public.fasi_ordine_extra USING btree (operatore_id);


--
-- Name: idx_kpi_schede_creata_da; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kpi_schede_creata_da ON public.kpi_schede USING btree (creata_da);


--
-- Name: idx_log_ordine; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_log_ordine ON public.archivio_log USING btree (ordine_id);


--
-- Name: idx_log_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_log_timestamp ON public.archivio_log USING btree ("timestamp" DESC);


--
-- Name: idx_log_utente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_log_utente ON public.archivio_log USING btree (utente_id);


--
-- Name: idx_notifiche_creata; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifiche_creata ON public.notifiche USING btree (creata_il DESC);


--
-- Name: idx_notifiche_destinatario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifiche_destinatario ON public.notifiche USING btree (destinatario_id, letta);


--
-- Name: idx_notifiche_ordine_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifiche_ordine_id ON public.notifiche USING btree (ordine_id);


--
-- Name: idx_ordine_fasi_fase_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordine_fasi_fase_id ON public.ordine_fasi USING btree (fase_id);


--
-- Name: idx_ordine_fasi_operatore; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordine_fasi_operatore ON public.ordine_fasi USING btree (operatore_id) WHERE (operatore_id IS NOT NULL);


--
-- Name: idx_ordine_fasi_operatori_operatore_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordine_fasi_operatori_operatore_id ON public.ordine_fasi_operatori USING btree (operatore_id);


--
-- Name: idx_ordine_fasi_ordine; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordine_fasi_ordine ON public.ordine_fasi USING btree (ordine_id);


--
-- Name: idx_ordine_fasi_stato; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordine_fasi_stato ON public.ordine_fasi USING btree (stato);


--
-- Name: idx_ordini_codice_attivi; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_ordini_codice_attivi ON public.ordini USING btree (codice) WHERE (eliminato = false);


--
-- Name: idx_ordini_creato_da; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordini_creato_da ON public.ordini USING btree (creato_da);


--
-- Name: idx_ordini_priorita; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordini_priorita ON public.ordini USING btree (priorita);


--
-- Name: idx_ordini_scadenza; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordini_scadenza ON public.ordini USING btree (scadenza) WHERE (stato <> 'spedito'::public.stato_ordine);


--
-- Name: idx_ordini_stato; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordini_stato ON public.ordini USING btree (stato);


--
-- Name: idx_ordini_tipo_prodotto; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ordini_tipo_prodotto ON public.ordini USING btree (tipo_prodotto);


--
-- Name: idx_pin_tentativi_user_id_tentato_il; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pin_tentativi_user_id_tentato_il ON public.pin_tentativi USING btree (user_id, tentato_il);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_users_ruolo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_ruolo ON public.users USING btree (ruolo);


--
-- Name: archivio_log no_delete_log; Type: RULE; Schema: public; Owner: postgres
--

CREATE RULE no_delete_log AS
    ON DELETE TO public.archivio_log DO INSTEAD NOTHING;


--
-- Name: archivio_log no_update_log; Type: RULE; Schema: public; Owner: postgres
--

CREATE RULE no_update_log AS
    ON UPDATE TO public.archivio_log DO INSTEAD NOTHING;


--
-- Name: fasi tg_sync_e_attesa_fasi; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tg_sync_e_attesa_fasi BEFORE INSERT OR UPDATE ON public.fasi FOR EACH ROW EXECUTE FUNCTION public.sync_e_attesa_esterna();


--
-- Name: fasi_ordine_extra tg_sync_e_attesa_fasi_extra; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tg_sync_e_attesa_fasi_extra BEFORE INSERT OR UPDATE ON public.fasi_ordine_extra FOR EACH ROW EXECUTE FUNCTION public.sync_e_attesa_esterna();


--
-- Name: ordine_fasi trg_check_lock_fase; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_check_lock_fase BEFORE UPDATE ON public.ordine_fasi FOR EACH ROW EXECUTE FUNCTION public.check_lock_fase();


--
-- Name: ordini trg_crea_fasi_ordine; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_crea_fasi_ordine AFTER INSERT ON public.ordini FOR EACH ROW EXECUTE FUNCTION public.crea_fasi_per_ordine();


--
-- Name: notifiche trg_push_notifica; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_push_notifica AFTER INSERT ON public.notifiche FOR EACH ROW EXECUTE FUNCTION public.trigger_push_notifica();


--
-- Name: ordine_fasi trigger_check_ordine_completato; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_check_ordine_completato AFTER UPDATE OF stato ON public.ordine_fasi FOR EACH ROW EXECUTE FUNCTION public.check_ordine_completato();


--
-- Name: fasi_ordine_extra trigger_check_ordine_extra_completato; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_check_ordine_extra_completato AFTER UPDATE ON public.fasi_ordine_extra FOR EACH ROW EXECUTE FUNCTION public.check_ordine_extra_completato();


--
-- Name: allegati allegati_caricato_da_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allegati
    ADD CONSTRAINT allegati_caricato_da_fkey FOREIGN KEY (caricato_da) REFERENCES public.users(id);


--
-- Name: allegati allegati_ordine_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allegati
    ADD CONSTRAINT allegati_ordine_fase_id_fkey FOREIGN KEY (ordine_fase_id) REFERENCES public.ordine_fasi(id) ON DELETE CASCADE;


--
-- Name: archivio_log archivio_log_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.archivio_log
    ADD CONSTRAINT archivio_log_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id);


--
-- Name: archivio_log archivio_log_ordine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.archivio_log
    ADD CONSTRAINT archivio_log_ordine_id_fkey FOREIGN KEY (ordine_id) REFERENCES public.ordini(id) ON DELETE CASCADE;


--
-- Name: archivio_log archivio_log_utente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.archivio_log
    ADD CONSTRAINT archivio_log_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES public.users(id);


--
-- Name: catalogo_fase_extra_macchine catalogo_fase_extra_macchine_catalogo_fase_extra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_fase_extra_macchine
    ADD CONSTRAINT catalogo_fase_extra_macchine_catalogo_fase_extra_id_fkey FOREIGN KEY (catalogo_fase_extra_id) REFERENCES public.catalogo_fasi_extra(id) ON DELETE CASCADE;


--
-- Name: catalogo_fase_extra_macchine catalogo_fase_extra_macchine_macchina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalogo_fase_extra_macchine
    ADD CONSTRAINT catalogo_fase_extra_macchine_macchina_id_fkey FOREIGN KEY (macchina_id) REFERENCES public.macchine(id) ON DELETE CASCADE;


--
-- Name: competenze_operatore_fase_extra competenze_operatore_fase_extra_catalogo_fase_extra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase_extra
    ADD CONSTRAINT competenze_operatore_fase_extra_catalogo_fase_extra_id_fkey FOREIGN KEY (catalogo_fase_extra_id) REFERENCES public.catalogo_fasi_extra(id) ON DELETE CASCADE;


--
-- Name: competenze_operatore_fase_extra competenze_operatore_fase_extra_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase_extra
    ADD CONSTRAINT competenze_operatore_fase_extra_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: competenze_operatore_fase competenze_operatore_fase_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase
    ADD CONSTRAINT competenze_operatore_fase_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: competenze_operatore_fase competenze_operatore_fase_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_fase
    ADD CONSTRAINT competenze_operatore_fase_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: competenze_operatore_macchina competenze_operatore_macchina_macchina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_macchina
    ADD CONSTRAINT competenze_operatore_macchina_macchina_id_fkey FOREIGN KEY (macchina_id) REFERENCES public.macchine(id) ON DELETE CASCADE;


--
-- Name: competenze_operatore_macchina competenze_operatore_macchina_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competenze_operatore_macchina
    ADD CONSTRAINT competenze_operatore_macchina_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: disponibilita_giornaliera disponibilita_giornaliera_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.disponibilita_giornaliera
    ADD CONSTRAINT disponibilita_giornaliera_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fase_dipendenze fase_dipendenze_dipende_da_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_dipendenze
    ADD CONSTRAINT fase_dipendenze_dipende_da_fase_id_fkey FOREIGN KEY (dipende_da_fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: fase_dipendenze fase_dipendenze_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_dipendenze
    ADD CONSTRAINT fase_dipendenze_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: fase_macchine fase_macchine_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_macchine
    ADD CONSTRAINT fase_macchine_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: fase_macchine fase_macchine_macchina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_macchine
    ADD CONSTRAINT fase_macchine_macchina_id_fkey FOREIGN KEY (macchina_id) REFERENCES public.macchine(id) ON DELETE CASCADE;


--
-- Name: fase_materiali fase_materiali_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_materiali
    ADD CONSTRAINT fase_materiali_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: fase_strutture fase_strutture_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_strutture
    ADD CONSTRAINT fase_strutture_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: fase_tipi_prodotto fase_tipi_prodotto_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_tipi_prodotto
    ADD CONSTRAINT fase_tipi_prodotto_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id) ON DELETE CASCADE;


--
-- Name: fase_tipi_prodotto fase_tipi_prodotto_tipo_prodotto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fase_tipi_prodotto
    ADD CONSTRAINT fase_tipi_prodotto_tipo_prodotto_id_fkey FOREIGN KEY (tipo_prodotto_id) REFERENCES public.tipi_prodotto(id) ON DELETE CASCADE;


--
-- Name: fasi_extra_operatori fasi_extra_operatori_fasi_ordine_extra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_extra_operatori
    ADD CONSTRAINT fasi_extra_operatori_fasi_ordine_extra_id_fkey FOREIGN KEY (fasi_ordine_extra_id) REFERENCES public.fasi_ordine_extra(id) ON DELETE CASCADE;


--
-- Name: fasi_extra_operatori fasi_extra_operatori_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_extra_operatori
    ADD CONSTRAINT fasi_extra_operatori_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fasi fasi_macro_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi
    ADD CONSTRAINT fasi_macro_fase_id_fkey FOREIGN KEY (macro_fase_id) REFERENCES public.macro_fasi(id) ON DELETE SET NULL;


--
-- Name: fasi_ordine_extra fasi_ordine_extra_catalogo_fase_extra_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_ordine_extra
    ADD CONSTRAINT fasi_ordine_extra_catalogo_fase_extra_id_fkey FOREIGN KEY (catalogo_fase_extra_id) REFERENCES public.catalogo_fasi_extra(id) ON DELETE SET NULL;


--
-- Name: fasi_ordine_extra fasi_ordine_extra_macchina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_ordine_extra
    ADD CONSTRAINT fasi_ordine_extra_macchina_id_fkey FOREIGN KEY (macchina_id) REFERENCES public.macchine(id) ON DELETE SET NULL;


--
-- Name: fasi_ordine_extra fasi_ordine_extra_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_ordine_extra
    ADD CONSTRAINT fasi_ordine_extra_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id);


--
-- Name: fasi_ordine_extra fasi_ordine_extra_ordine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fasi_ordine_extra
    ADD CONSTRAINT fasi_ordine_extra_ordine_id_fkey FOREIGN KEY (ordine_id) REFERENCES public.ordini(id) ON DELETE CASCADE;


--
-- Name: ordini fk_ordini_priorita; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordini
    ADD CONSTRAINT fk_ordini_priorita FOREIGN KEY (priorita) REFERENCES public.priorita_ordine_config(id);


--
-- Name: kpi_schede kpi_schede_creata_da_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kpi_schede
    ADD CONSTRAINT kpi_schede_creata_da_fkey FOREIGN KEY (creata_da) REFERENCES public.users(id);


--
-- Name: manutenzioni_macchina manutenzioni_macchina_macchina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manutenzioni_macchina
    ADD CONSTRAINT manutenzioni_macchina_macchina_id_fkey FOREIGN KEY (macchina_id) REFERENCES public.macchine(id) ON DELETE CASCADE;


--
-- Name: notifiche_destinatari_config notifiche_destinatari_config_utente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifiche_destinatari_config
    ADD CONSTRAINT notifiche_destinatari_config_utente_id_fkey FOREIGN KEY (utente_id) REFERENCES public.users(id);


--
-- Name: notifiche notifiche_destinatario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifiche
    ADD CONSTRAINT notifiche_destinatario_id_fkey FOREIGN KEY (destinatario_id) REFERENCES public.users(id);


--
-- Name: notifiche notifiche_ordine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifiche
    ADD CONSTRAINT notifiche_ordine_id_fkey FOREIGN KEY (ordine_id) REFERENCES public.ordini(id) ON DELETE CASCADE;


--
-- Name: ordine_fasi ordine_fasi_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi
    ADD CONSTRAINT ordine_fasi_fase_id_fkey FOREIGN KEY (fase_id) REFERENCES public.fasi(id);


--
-- Name: ordine_fasi ordine_fasi_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi
    ADD CONSTRAINT ordine_fasi_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id);


--
-- Name: ordine_fasi_operatori ordine_fasi_operatori_operatore_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi_operatori
    ADD CONSTRAINT ordine_fasi_operatori_operatore_id_fkey FOREIGN KEY (operatore_id) REFERENCES public.users(id);


--
-- Name: ordine_fasi_operatori ordine_fasi_operatori_ordine_fase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi_operatori
    ADD CONSTRAINT ordine_fasi_operatori_ordine_fase_id_fkey FOREIGN KEY (ordine_fase_id) REFERENCES public.ordine_fasi(id) ON DELETE CASCADE;


--
-- Name: ordine_fasi ordine_fasi_ordine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordine_fasi
    ADD CONSTRAINT ordine_fasi_ordine_id_fkey FOREIGN KEY (ordine_id) REFERENCES public.ordini(id) ON DELETE CASCADE;


--
-- Name: ordini ordini_creato_da_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordini
    ADD CONSTRAINT ordini_creato_da_fkey FOREIGN KEY (creato_da) REFERENCES public.users(id);


--
-- Name: ordini ordini_tipo_prodotto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ordini
    ADD CONSTRAINT ordini_tipo_prodotto_fkey FOREIGN KEY (tipo_prodotto) REFERENCES public.tipi_prodotto(id);


--
-- Name: pin_tentativi pin_tentativi_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pin_tentativi
    ADD CONSTRAINT pin_tentativi_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fasi Lettura pubblica fasi; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Lettura pubblica fasi" ON public.fasi FOR SELECT TO authenticated, anon USING (true);


--
-- Name: macro_fasi Solo autenticati modificano macro_fasi; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Solo autenticati modificano macro_fasi" ON public.macro_fasi USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: macro_fasi Tutti possono leggere macro_fasi; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Tutti possono leggere macro_fasi" ON public.macro_fasi FOR SELECT USING (true);


--
-- Name: allegati; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.allegati ENABLE ROW LEVEL SECURITY;

--
-- Name: archivio_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.archivio_log ENABLE ROW LEVEL SECURITY;

--
-- Name: archivio_log archivio_log_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY archivio_log_insert ON public.archivio_log FOR INSERT TO authenticated WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: archivio_log archivio_log_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY archivio_log_select ON public.archivio_log FOR SELECT TO authenticated USING (true);


--
-- Name: attributi_prodotto_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attributi_prodotto_config ENABLE ROW LEVEL SECURITY;

--
-- Name: allegati auth_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY auth_select ON public.allegati FOR SELECT TO authenticated USING (true);


--
-- Name: ordine_fasi_operatori auth_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY auth_select ON public.ordine_fasi_operatori FOR SELECT TO authenticated USING (true);


--
-- Name: catalogo_fase_extra_macchine; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.catalogo_fase_extra_macchine ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogo_fase_extra_macchine catalogo_fase_extra_macchine_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalogo_fase_extra_macchine_select ON public.catalogo_fase_extra_macchine FOR SELECT TO authenticated, anon USING (true);


--
-- Name: catalogo_fase_extra_macchine catalogo_fase_extra_macchine_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalogo_fase_extra_macchine_write_responsabile ON public.catalogo_fase_extra_macchine TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: catalogo_fasi_extra; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.catalogo_fasi_extra ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogo_fasi_extra catalogo_fasi_extra_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalogo_fasi_extra_select ON public.catalogo_fasi_extra FOR SELECT TO authenticated, anon USING (true);


--
-- Name: catalogo_fasi_extra catalogo_fasi_extra_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalogo_fasi_extra_write_responsabile ON public.catalogo_fasi_extra TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: chiusure_aziendali; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.chiusure_aziendali ENABLE ROW LEVEL SECURITY;

--
-- Name: chiusure_aziendali chiusure_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY chiusure_select ON public.chiusure_aziendali FOR SELECT USING (true);


--
-- Name: competenze_operatore_macchina comp_op_mac_sel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY comp_op_mac_sel ON public.competenze_operatore_macchina FOR SELECT USING (true);


--
-- Name: competenze_operatore_fase_extra competenze_fase_extra_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY competenze_fase_extra_select ON public.competenze_operatore_fase_extra FOR SELECT TO authenticated, anon USING (true);


--
-- Name: competenze_operatore_fase_extra competenze_fase_extra_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY competenze_fase_extra_write_responsabile ON public.competenze_operatore_fase_extra TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: competenze_operatore_fase; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.competenze_operatore_fase ENABLE ROW LEVEL SECURITY;

--
-- Name: competenze_operatore_fase_extra; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.competenze_operatore_fase_extra ENABLE ROW LEVEL SECURITY;

--
-- Name: competenze_operatore_macchina; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.competenze_operatore_macchina ENABLE ROW LEVEL SECURITY;

--
-- Name: config_orario; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.config_orario ENABLE ROW LEVEL SECURITY;

--
-- Name: config_orario config_orario_select_tutti; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY config_orario_select_tutti ON public.config_orario FOR SELECT TO authenticated, anon USING (true);


--
-- Name: config_orario config_orario_update_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY config_orario_update_responsabile ON public.config_orario FOR UPDATE TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: config_sistema; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.config_sistema ENABLE ROW LEVEL SECURITY;

--
-- Name: config_sistema config_sistema_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY config_sistema_select ON public.config_sistema FOR SELECT TO authenticated USING (true);


--
-- Name: config_sistema config_sistema_update_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY config_sistema_update_responsabile ON public.config_sistema FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente)))));


--
-- Name: disponibilita_giornaliera; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.disponibilita_giornaliera ENABLE ROW LEVEL SECURITY;

--
-- Name: fase_dipendenze; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fase_dipendenze ENABLE ROW LEVEL SECURITY;

--
-- Name: fase_macchine; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fase_macchine ENABLE ROW LEVEL SECURITY;

--
-- Name: fase_macchine fase_macchine_sel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fase_macchine_sel ON public.fase_macchine FOR SELECT USING (true);


--
-- Name: fase_materiali; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fase_materiali ENABLE ROW LEVEL SECURITY;

--
-- Name: fase_strutture; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fase_strutture ENABLE ROW LEVEL SECURITY;

--
-- Name: fase_tipi_prodotto; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fase_tipi_prodotto ENABLE ROW LEVEL SECURITY;

--
-- Name: fasi; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fasi ENABLE ROW LEVEL SECURITY;

--
-- Name: fasi_extra_operatori fasi_extra_op_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fasi_extra_op_select ON public.fasi_extra_operatori FOR SELECT TO authenticated, anon USING (true);


--
-- Name: fasi_extra_operatori; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fasi_extra_operatori ENABLE ROW LEVEL SECURITY;

--
-- Name: fasi_ordine_extra; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fasi_ordine_extra ENABLE ROW LEVEL SECURITY;

--
-- Name: fasi_ordine_extra fasi_ordine_extra_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fasi_ordine_extra_select ON public.fasi_ordine_extra FOR SELECT TO authenticated USING (true);


--
-- Name: fasi fasi_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fasi_write_responsabile ON public.fasi TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: kpi_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.kpi_config ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_config kpi_config_insert_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kpi_config_insert_responsabile ON public.kpi_config FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente)))));


--
-- Name: kpi_config kpi_config_lettura; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kpi_config_lettura ON public.kpi_config FOR SELECT TO authenticated USING (true);


--
-- Name: kpi_config kpi_config_scrittura_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY kpi_config_scrittura_responsabile ON public.kpi_config FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente)))));


--
-- Name: kpi_schede; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.kpi_schede ENABLE ROW LEVEL SECURITY;

--
-- Name: attributi_prodotto_config lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.attributi_prodotto_config FOR SELECT TO authenticated USING (true);


--
-- Name: competenze_operatore_fase lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.competenze_operatore_fase FOR SELECT USING (true);


--
-- Name: disponibilita_giornaliera lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.disponibilita_giornaliera FOR SELECT USING (true);


--
-- Name: fase_materiali lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.fase_materiali FOR SELECT USING (true);


--
-- Name: fase_strutture lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.fase_strutture FOR SELECT USING (true);


--
-- Name: fase_tipi_prodotto lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.fase_tipi_prodotto FOR SELECT USING (true);


--
-- Name: notifiche_destinatari_config lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.notifiche_destinatari_config FOR SELECT TO authenticated USING (true);


--
-- Name: priorita_ordine_config lettura_autenticati; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_autenticati ON public.priorita_ordine_config FOR SELECT TO authenticated USING (true);


--
-- Name: tipi_prodotto lettura_tipi_prodotto; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY lettura_tipi_prodotto ON public.tipi_prodotto FOR SELECT USING (true);


--
-- Name: macchine; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.macchine ENABLE ROW LEVEL SECURITY;

--
-- Name: macchine macchine_sel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY macchine_sel ON public.macchine FOR SELECT USING (true);


--
-- Name: macro_fasi; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.macro_fasi ENABLE ROW LEVEL SECURITY;

--
-- Name: manutenzioni_macchina manut_mac_sel; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY manut_mac_sel ON public.manutenzioni_macchina FOR SELECT USING (true);


--
-- Name: manutenzioni_macchina; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.manutenzioni_macchina ENABLE ROW LEVEL SECURITY;

--
-- Name: attributi_prodotto_config modifica_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY modifica_responsabile ON public.attributi_prodotto_config TO authenticated USING ((( SELECT users.ruolo
   FROM public.users
  WHERE (users.id = auth.uid())) = 'responsabile'::public.ruolo_utente)) WITH CHECK ((( SELECT users.ruolo
   FROM public.users
  WHERE (users.id = auth.uid())) = 'responsabile'::public.ruolo_utente));


--
-- Name: notifiche_destinatari_config modifica_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY modifica_responsabile ON public.notifiche_destinatari_config TO authenticated USING ((( SELECT users.ruolo
   FROM public.users
  WHERE (users.id = auth.uid())) = 'responsabile'::public.ruolo_utente)) WITH CHECK ((( SELECT users.ruolo
   FROM public.users
  WHERE (users.id = auth.uid())) = 'responsabile'::public.ruolo_utente));


--
-- Name: priorita_ordine_config modifica_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY modifica_responsabile ON public.priorita_ordine_config TO authenticated USING ((( SELECT users.ruolo
   FROM public.users
  WHERE (users.id = auth.uid())) = 'responsabile'::public.ruolo_utente)) WITH CHECK ((( SELECT users.ruolo
   FROM public.users
  WHERE (users.id = auth.uid())) = 'responsabile'::public.ruolo_utente));


--
-- Name: notifiche; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifiche ENABLE ROW LEVEL SECURITY;

--
-- Name: notifiche_destinatari_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifiche_destinatari_config ENABLE ROW LEVEL SECURITY;

--
-- Name: notifiche notifiche_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifiche_select ON public.notifiche FOR SELECT TO authenticated USING (true);


--
-- Name: notifiche notifiche_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifiche_write_responsabile ON public.notifiche TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: ordine_fasi; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ordine_fasi ENABLE ROW LEVEL SECURITY;

--
-- Name: ordine_fasi_operatori; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ordine_fasi_operatori ENABLE ROW LEVEL SECURITY;

--
-- Name: ordine_fasi ordine_fasi_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ordine_fasi_select ON public.ordine_fasi FOR SELECT TO authenticated USING (true);


--
-- Name: ordine_fasi ordine_fasi_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ordine_fasi_write_responsabile ON public.ordine_fasi TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: ordini; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ordini ENABLE ROW LEVEL SECURITY;

--
-- Name: ordini ordini_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ordini_select ON public.ordini FOR SELECT TO authenticated USING (true);


--
-- Name: ordini ordini_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY ordini_write_responsabile ON public.ordini TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: pin_tentativi; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pin_tentativi ENABLE ROW LEVEL SECURITY;

--
-- Name: priorita_ordine_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.priorita_ordine_config ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_schede responsabile_full_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY responsabile_full_access ON public.kpi_schede USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.ruolo = 'responsabile'::public.ruolo_utente)))));


--
-- Name: fase_dipendenze select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY select_all ON public.fase_dipendenze FOR SELECT USING (true);


--
-- Name: snapshot_backfill_fasi_eliminate_20260903; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.snapshot_backfill_fasi_eliminate_20260903 ENABLE ROW LEVEL SECURITY;

--
-- Name: tipi_prodotto; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tipi_prodotto ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_select ON public.users FOR SELECT TO authenticated USING (true);


--
-- Name: users users_write_responsabile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY users_write_responsabile ON public.users TO authenticated USING (( SELECT public.e_responsabile() AS e_responsabile)) WITH CHECK (( SELECT public.e_responsabile() AS e_responsabile));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION aggiorna_criteri_fase(p_fase_id smallint, p_tipi_prodotto text[], p_materiali text[], p_strutture text[], p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.aggiorna_criteri_fase(p_fase_id smallint, p_tipi_prodotto text[], p_materiali text[], p_strutture text[], p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aggiorna_criteri_fase(p_fase_id smallint, p_tipi_prodotto text[], p_materiali text[], p_strutture text[], p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiorna_criteri_fase(p_fase_id smallint, p_tipi_prodotto text[], p_materiali text[], p_strutture text[], p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION aggiorna_operatore(p_operatore_id uuid, p_nome text, p_cognome text, p_ruolo public.ruolo_utente, p_ore_default numeric, p_escluso_pianificazione boolean, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.aggiorna_operatore(p_operatore_id uuid, p_nome text, p_cognome text, p_ruolo public.ruolo_utente, p_ore_default numeric, p_escluso_pianificazione boolean, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aggiorna_operatore(p_operatore_id uuid, p_nome text, p_cognome text, p_ruolo public.ruolo_utente, p_ore_default numeric, p_escluso_pianificazione boolean, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiorna_operatore(p_operatore_id uuid, p_nome text, p_cognome text, p_ruolo public.ruolo_utente, p_ore_default numeric, p_escluso_pianificazione boolean, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION aggiorna_pin_operatore(p_operatore_id uuid, p_nuovo_pin text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.aggiorna_pin_operatore(p_operatore_id uuid, p_nuovo_pin text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aggiorna_pin_operatore(p_operatore_id uuid, p_nuovo_pin text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiorna_pin_operatore(p_operatore_id uuid, p_nuovo_pin text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION aggiorna_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.aggiorna_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aggiorna_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiorna_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION aggiungi_collega_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.aggiungi_collega_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.aggiungi_collega_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiungi_collega_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION aggiungi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.aggiungi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.aggiungi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiungi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION aggiungi_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.aggiungi_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aggiungi_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aggiungi_tipo_prodotto(p_id text, p_label text, p_posizione integer, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION annulla_fasi_ordine_eliminato(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.annulla_fasi_ordine_eliminato(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.annulla_fasi_ordine_eliminato(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.annulla_fasi_ordine_eliminato(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION annulla_presa_in_carico(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.annulla_presa_in_carico(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.annulla_presa_in_carico(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.annulla_presa_in_carico(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION annulla_presa_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.annulla_presa_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.annulla_presa_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.annulla_presa_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION archivia_ordine(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.archivia_ordine(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.archivia_ordine(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.archivia_ordine(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid) TO anon;
GRANT ALL ON FUNCTION public.autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.autorizza_upload_allegato(p_user_id uuid, p_session_token uuid, p_tipo text, p_ordine_id uuid, p_ordine_fase_id uuid) TO service_role;


--
-- Name: FUNCTION avanzamento_fasi_batch(p_operatore_id uuid, p_session_token uuid, p_ordine_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.avanzamento_fasi_batch(p_operatore_id uuid, p_session_token uuid, p_ordine_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.avanzamento_fasi_batch(p_operatore_id uuid, p_session_token uuid, p_ordine_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.avanzamento_fasi_batch(p_operatore_id uuid, p_session_token uuid, p_ordine_ids uuid[]) TO service_role;


--
-- Name: FUNCTION calcola_tempo_combinazione(p_criteri jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.calcola_tempo_combinazione(p_criteri jsonb) TO anon;
GRANT ALL ON FUNCTION public.calcola_tempo_combinazione(p_criteri jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.calcola_tempo_combinazione(p_criteri jsonb) TO service_role;


--
-- Name: FUNCTION capacita_produttiva_stimata(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.capacita_produttiva_stimata() TO anon;
GRANT ALL ON FUNCTION public.capacita_produttiva_stimata() TO authenticated;
GRANT ALL ON FUNCTION public.capacita_produttiva_stimata() TO service_role;


--
-- Name: FUNCTION check_lock_fase(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_lock_fase() TO anon;
GRANT ALL ON FUNCTION public.check_lock_fase() TO authenticated;
GRANT ALL ON FUNCTION public.check_lock_fase() TO service_role;


--
-- Name: FUNCTION check_ordine_completato(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_ordine_completato() TO anon;
GRANT ALL ON FUNCTION public.check_ordine_completato() TO authenticated;
GRANT ALL ON FUNCTION public.check_ordine_completato() TO service_role;


--
-- Name: FUNCTION check_ordine_extra_completato(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.check_ordine_extra_completato() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_ordine_extra_completato() TO anon;
GRANT ALL ON FUNCTION public.check_ordine_extra_completato() TO authenticated;
GRANT ALL ON FUNCTION public.check_ordine_extra_completato() TO service_role;


--
-- Name: FUNCTION colleghi_disponibili(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.colleghi_disponibili(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.colleghi_disponibili(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.colleghi_disponibili(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION completa_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_note_operatore text, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.completa_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_note_operatore text, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.completa_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_note_operatore text, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.completa_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_note_operatore text, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION completa_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_note text, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.completa_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_note text, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.completa_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_note text, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.completa_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_note text, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION completa_fasi_batch(p_fase_id integer, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.completa_fasi_batch(p_fase_id integer, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.completa_fasi_batch(p_fase_id integer, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.completa_fasi_batch(p_fase_id integer, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION completa_fasi_extra_batch(p_nome text, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.completa_fasi_extra_batch(p_nome text, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.completa_fasi_extra_batch(p_nome text, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.completa_fasi_extra_batch(p_nome text, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION conferma_ricezione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.conferma_ricezione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.conferma_ricezione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.conferma_ricezione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION conferma_ricezione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.conferma_ricezione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.conferma_ricezione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.conferma_ricezione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION confronto_operatori_per_fase(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.confronto_operatori_per_fase() TO anon;
GRANT ALL ON FUNCTION public.confronto_operatori_per_fase() TO authenticated;
GRANT ALL ON FUNCTION public.confronto_operatori_per_fase() TO service_role;


--
-- Name: FUNCTION confronto_operatori_per_fase_extra(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.confronto_operatori_per_fase_extra() TO anon;
GRANT ALL ON FUNCTION public.confronto_operatori_per_fase_extra() TO authenticated;
GRANT ALL ON FUNCTION public.confronto_operatori_per_fase_extra() TO service_role;


--
-- Name: FUNCTION controlla_sessione(p_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.controlla_sessione(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.controlla_sessione(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.controlla_sessione(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION crea_fasi_extra(p_ordine_id uuid, p_fasi jsonb, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.crea_fasi_extra(p_ordine_id uuid, p_fasi jsonb, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crea_fasi_extra(p_ordine_id uuid, p_fasi jsonb, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.crea_fasi_extra(p_ordine_id uuid, p_fasi jsonb, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION crea_fasi_per_ordine(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.crea_fasi_per_ordine() FROM PUBLIC;
GRANT ALL ON FUNCTION public.crea_fasi_per_ordine() TO anon;
GRANT ALL ON FUNCTION public.crea_fasi_per_ordine() TO authenticated;
GRANT ALL ON FUNCTION public.crea_fasi_per_ordine() TO service_role;


--
-- Name: FUNCTION crea_operatore(p_nome text, p_cognome text, p_pin text, p_ruolo public.ruolo_utente, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.crea_operatore(p_nome text, p_cognome text, p_pin text, p_ruolo public.ruolo_utente, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crea_operatore(p_nome text, p_cognome text, p_pin text, p_ruolo public.ruolo_utente, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.crea_operatore(p_nome text, p_cognome text, p_pin text, p_ruolo public.ruolo_utente, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION crea_scheda_kpi(p_nome text, p_criteri jsonb, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.crea_scheda_kpi(p_nome text, p_criteri jsonb, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crea_scheda_kpi(p_nome text, p_criteri jsonb, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.crea_scheda_kpi(p_nome text, p_criteri jsonb, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION data_consegna_stimata(p_giorni_lavorativi_necessari numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.data_consegna_stimata(p_giorni_lavorativi_necessari numeric) TO anon;
GRANT ALL ON FUNCTION public.data_consegna_stimata(p_giorni_lavorativi_necessari numeric) TO authenticated;
GRANT ALL ON FUNCTION public.data_consegna_stimata(p_giorni_lavorativi_necessari numeric) TO service_role;


--
-- Name: FUNCTION dettaglio_fase_completa(p_operatore_id uuid, p_session_token uuid, p_ord_fase_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dettaglio_fase_completa(p_operatore_id uuid, p_session_token uuid, p_ord_fase_id uuid) TO anon;
GRANT ALL ON FUNCTION public.dettaglio_fase_completa(p_operatore_id uuid, p_session_token uuid, p_ord_fase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dettaglio_fase_completa(p_operatore_id uuid, p_session_token uuid, p_ord_fase_id uuid) TO service_role;


--
-- Name: FUNCTION dettaglio_fase_extra_completa(p_operatore_id uuid, p_session_token uuid, p_fase_extra_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dettaglio_fase_extra_completa(p_operatore_id uuid, p_session_token uuid, p_fase_extra_id uuid) TO anon;
GRANT ALL ON FUNCTION public.dettaglio_fase_extra_completa(p_operatore_id uuid, p_session_token uuid, p_fase_extra_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dettaglio_fase_extra_completa(p_operatore_id uuid, p_session_token uuid, p_fase_extra_id uuid) TO service_role;


--
-- Name: FUNCTION dettaglio_ordine_fasi(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dettaglio_ordine_fasi(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) TO anon;
GRANT ALL ON FUNCTION public.dettaglio_ordine_fasi(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dettaglio_ordine_fasi(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) TO service_role;


--
-- Name: FUNCTION dimensione_database(p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.dimensione_database(p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dimensione_database(p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dimensione_database(p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION e_giorno_lavorativo(p_data date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.e_giorno_lavorativo(p_data date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.e_giorno_lavorativo(p_data date) TO service_role;


--
-- Name: FUNCTION e_responsabile(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.e_responsabile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.e_responsabile() TO authenticated;
GRANT ALL ON FUNCTION public.e_responsabile() TO service_role;


--
-- Name: FUNCTION elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid) TO anon;
GRANT ALL ON FUNCTION public.elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elenco_foto_fase(p_user_id uuid, p_session_token uuid, p_ordine_fase_id uuid) TO service_role;


--
-- Name: FUNCTION elenco_foto_ordine_responsabile(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elenco_foto_ordine_responsabile(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elenco_foto_ordine_responsabile(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elenco_foto_ordine_responsabile(p_ordine_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_allegati(p_allegato_ids uuid[], p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.elimina_allegati(p_allegato_ids uuid[], p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.elimina_allegati(p_allegato_ids uuid[], p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_allegati(p_allegato_ids uuid[], p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_allegati_fasi(p_fase_ids uuid[], p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_allegati_fasi(p_fase_ids uuid[], p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_allegati_fasi(p_fase_ids uuid[], p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_allegati_fasi(p_fase_ids uuid[], p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_chiusura_aziendale(p_chiusura_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_chiusura_aziendale(p_chiusura_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_chiusura_aziendale(p_chiusura_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_chiusura_aziendale(p_chiusura_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_fase_custom_ordine(p_ordine_fase_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_fase_custom_ordine(p_ordine_fase_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_fase_custom_ordine(p_ordine_fase_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_fase_custom_ordine(p_ordine_fase_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_manutenzione_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_manutenzione_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_manutenzione_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_manutenzione_macchina(p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_scheda_kpi(p_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_scheda_kpi(p_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_scheda_kpi(p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_scheda_kpi(p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION elimina_tipo_prodotto(p_id text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.elimina_tipo_prodotto(p_id text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elimina_tipo_prodotto(p_id text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.elimina_tipo_prodotto(p_id text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION fasi_avanzamento_ordini(p_operatore_id uuid, p_session_token uuid, p_std_ids uuid[], p_extra_ids uuid[], p_solo_aperti_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fasi_avanzamento_ordini(p_operatore_id uuid, p_session_token uuid, p_std_ids uuid[], p_extra_ids uuid[], p_solo_aperti_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.fasi_avanzamento_ordini(p_operatore_id uuid, p_session_token uuid, p_std_ids uuid[], p_extra_ids uuid[], p_solo_aperti_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.fasi_avanzamento_ordini(p_operatore_id uuid, p_session_token uuid, p_std_ids uuid[], p_extra_ids uuid[], p_solo_aperti_ids uuid[]) TO service_role;


--
-- Name: FUNCTION fasi_dipendenze_stato(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid, p_fase_ids smallint[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fasi_dipendenze_stato(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid, p_fase_ids smallint[]) TO anon;
GRANT ALL ON FUNCTION public.fasi_dipendenze_stato(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid, p_fase_ids smallint[]) TO authenticated;
GRANT ALL ON FUNCTION public.fasi_dipendenze_stato(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid, p_fase_ids smallint[]) TO service_role;


--
-- Name: FUNCTION fasi_in_corso_come_collega(p_operatore_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fasi_in_corso_come_collega(p_operatore_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fasi_in_corso_come_collega(p_operatore_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fasi_in_corso_come_collega(p_operatore_id uuid) TO service_role;


--
-- Name: FUNCTION fasi_stato_ordine(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fasi_stato_ordine(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fasi_stato_ordine(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fasi_stato_ordine(p_operatore_id uuid, p_session_token uuid, p_ordine_id uuid) TO service_role;


--
-- Name: FUNCTION forza_completa_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_note text, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.forza_completa_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_note text, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.forza_completa_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_note text, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.forza_completa_fase_extra(p_fase_extra_id uuid, p_responsabile_id uuid, p_note text, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION forza_logout_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.forza_logout_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.forza_logout_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.forza_logout_operatore(p_operatore_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION fotocamera_interna_attiva(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.fotocamera_interna_attiva() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fotocamera_interna_attiva() TO anon;
GRANT ALL ON FUNCTION public.fotocamera_interna_attiva() TO authenticated;
GRANT ALL ON FUNCTION public.fotocamera_interna_attiva() TO service_role;


--
-- Name: FUNCTION giorni_lavorativi_disponibili(p_da date, p_a date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.giorni_lavorativi_disponibili(p_da date, p_a date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.giorni_lavorativi_disponibili(p_da date, p_a date) TO service_role;


--
-- Name: FUNCTION imposta_catalogo_fase_extra(p_responsabile_id uuid, p_session_token uuid, p_id uuid, p_nome text, p_descrizione text, p_tipo_gestione text, p_e_attesa_esterna boolean, p_attiva boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_catalogo_fase_extra(p_responsabile_id uuid, p_session_token uuid, p_id uuid, p_nome text, p_descrizione text, p_tipo_gestione text, p_e_attesa_esterna boolean, p_attiva boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_catalogo_fase_extra(p_responsabile_id uuid, p_session_token uuid, p_id uuid, p_nome text, p_descrizione text, p_tipo_gestione text, p_e_attesa_esterna boolean, p_attiva boolean) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_catalogo_fase_extra(p_responsabile_id uuid, p_session_token uuid, p_id uuid, p_nome text, p_descrizione text, p_tipo_gestione text, p_e_attesa_esterna boolean, p_attiva boolean) TO service_role;


--
-- Name: FUNCTION imposta_chiusura_aziendale(p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_chiusura_aziendale(p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_chiusura_aziendale(p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_chiusura_aziendale(p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_competenze_fase(p_fase_id smallint, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_competenze_fase(p_fase_id smallint, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_competenze_fase(p_fase_id smallint, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_competenze_fase(p_fase_id smallint, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_competenze_macchina(p_macchina_id uuid, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_competenze_macchina(p_macchina_id uuid, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_competenze_macchina(p_macchina_id uuid, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_competenze_macchina(p_macchina_id uuid, p_operatori_ordinati uuid[], p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_competenze_per_catalogo_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_operatori_ordinati uuid[], p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_competenze_per_catalogo_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_operatori_ordinati uuid[], p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_competenze_per_catalogo_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_operatori_ordinati uuid[], p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_competenze_per_catalogo_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_operatori_ordinati uuid[], p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_dipendenze_fase(p_fase_id smallint, p_dipende_da_ids smallint[], p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_dipendenze_fase(p_fase_id smallint, p_dipende_da_ids smallint[], p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_dipendenze_fase(p_fase_id smallint, p_dipende_da_ids smallint[], p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_dipendenze_fase(p_fase_id smallint, p_dipende_da_ids smallint[], p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_disponibilita_giornaliera(p_operatore_id uuid, p_data date, p_ore numeric, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_disponibilita_giornaliera(p_operatore_id uuid, p_data date, p_ore numeric, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_disponibilita_giornaliera(p_operatore_id uuid, p_data date, p_ore numeric, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_disponibilita_giornaliera(p_operatore_id uuid, p_data date, p_ore numeric, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_fase_ordine(p_ordine_id uuid, p_fase_id smallint, p_attiva boolean, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_fase_ordine(p_ordine_id uuid, p_fase_id smallint, p_attiva boolean, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_fase_ordine(p_ordine_id uuid, p_fase_id smallint, p_attiva boolean, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_fase_ordine(p_ordine_id uuid, p_fase_id smallint, p_attiva boolean, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_fasi_macchina(p_macchina_id uuid, p_fase_ids smallint[], p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_fasi_macchina(p_macchina_id uuid, p_fase_ids smallint[], p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_fasi_macchina(p_macchina_id uuid, p_fase_ids smallint[], p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_fasi_macchina(p_macchina_id uuid, p_fase_ids smallint[], p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_macchina(p_nome text, p_stato text, p_ore_default numeric, p_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_macchina(p_nome text, p_stato text, p_ore_default numeric, p_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_macchina(p_nome text, p_stato text, p_ore_default numeric, p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_macchina(p_nome text, p_stato text, p_ore_default numeric, p_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_macchine_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_macchine_ids jsonb, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_macchine_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_macchine_ids jsonb, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_macchine_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_macchine_ids jsonb, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_macchine_fase_extra(p_responsabile_id uuid, p_catalogo_fase_extra_id uuid, p_macchine_ids jsonb, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_manutenzione_macchina(p_macchina_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_manutenzione_macchina(p_macchina_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_manutenzione_macchina(p_macchina_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_manutenzione_macchina(p_macchina_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_permesso_periodo(p_operatore_id uuid, p_data_inizio date, p_data_fine date, p_ore numeric, p_motivo text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_permesso_periodo(p_operatore_id uuid, p_data_inizio date, p_data_fine date, p_ore numeric, p_motivo text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_permesso_periodo(p_operatore_id uuid, p_data_inizio date, p_data_fine date, p_ore numeric, p_motivo text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_permesso_periodo(p_operatore_id uuid, p_data_inizio date, p_data_fine date, p_ore numeric, p_motivo text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION imposta_stato_operatore(p_operatore_id uuid, p_attivo boolean, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.imposta_stato_operatore(p_operatore_id uuid, p_attivo boolean, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.imposta_stato_operatore(p_operatore_id uuid, p_attivo boolean, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.imposta_stato_operatore(p_operatore_id uuid, p_attivo boolean, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION in_orario_lavoro(p_momento timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.in_orario_lavoro(p_momento timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.in_orario_lavoro(p_momento timestamp with time zone) TO service_role;


--
-- Name: FUNCTION lista_operatori_login(p_solo_sola_lettura boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.lista_operatori_login(p_solo_sola_lettura boolean) TO anon;
GRANT ALL ON FUNCTION public.lista_operatori_login(p_solo_sola_lettura boolean) TO authenticated;
GRANT ALL ON FUNCTION public.lista_operatori_login(p_solo_sola_lettura boolean) TO service_role;


--
-- Name: FUNCTION lista_priorita_giornaliera(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.lista_priorita_giornaliera() TO anon;
GRANT ALL ON FUNCTION public.lista_priorita_giornaliera() TO authenticated;
GRANT ALL ON FUNCTION public.lista_priorita_giornaliera() TO service_role;


--
-- Name: FUNCTION lista_schede_kpi(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.lista_schede_kpi() TO anon;
GRANT ALL ON FUNCTION public.lista_schede_kpi() TO authenticated;
GRANT ALL ON FUNCTION public.lista_schede_kpi() TO service_role;


--
-- Name: FUNCTION metti_in_attesa(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.metti_in_attesa(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.metti_in_attesa(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.metti_in_attesa(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION mie_fasi_in_corso(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.mie_fasi_in_corso(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.mie_fasi_in_corso(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mie_fasi_in_corso(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION modifica_chiusura_aziendale(p_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.modifica_chiusura_aziendale(p_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.modifica_chiusura_aziendale(p_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.modifica_chiusura_aziendale(p_id uuid, p_data_inizio date, p_data_fine date, p_descrizione text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION notifiche_operatore(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notifiche_operatore(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.notifiche_operatore(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.notifiche_operatore(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION ordini_attivi(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ordini_attivi(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.ordini_attivi(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ordini_attivi(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION pausa_tutte_fasi(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pausa_tutte_fasi(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.pausa_tutte_fasi(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pausa_tutte_fasi(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION piano_giornaliero_raggruppato(p_responsabile_id uuid, p_session_token uuid, p_data date); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.piano_giornaliero_raggruppato(p_responsabile_id uuid, p_session_token uuid, p_data date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.piano_giornaliero_raggruppato(p_responsabile_id uuid, p_session_token uuid, p_data date) TO authenticated;
GRANT ALL ON FUNCTION public.piano_giornaliero_raggruppato(p_responsabile_id uuid, p_session_token uuid, p_data date) TO service_role;


--
-- Name: FUNCTION piano_multi_giorno(p_giorni integer, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.piano_multi_giorno(p_giorni integer, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.piano_multi_giorno(p_giorni integer, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.piano_multi_giorno(p_giorni integer, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION prendi_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prendi_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.prendi_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.prendi_in_carico_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION prendi_in_carico_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prendi_in_carico_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.prendi_in_carico_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.prendi_in_carico_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riapri_fase_extra_resp(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.riapri_fase_extra_resp(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.riapri_fase_extra_resp(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riapri_fase_extra_resp(p_fase_extra_id uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riapri_fase_operatore(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.riapri_fase_operatore(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.riapri_fase_operatore(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riapri_fase_operatore(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riassegna_fase(p_ordine_fase_id uuid, p_responsabile_id uuid, p_nuovo_operatore uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.riassegna_fase(p_ordine_fase_id uuid, p_responsabile_id uuid, p_nuovo_operatore uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.riassegna_fase(p_ordine_fase_id uuid, p_responsabile_id uuid, p_nuovo_operatore uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riassegna_fase(p_ordine_fase_id uuid, p_responsabile_id uuid, p_nuovo_operatore uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riassegna_fase_extra(p_fase_extra_id uuid, p_nuovo_op uuid, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.riassegna_fase_extra(p_fase_extra_id uuid, p_nuovo_op uuid, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.riassegna_fase_extra(p_fase_extra_id uuid, p_nuovo_op uuid, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riassegna_fase_extra(p_fase_extra_id uuid, p_nuovo_op uuid, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION ricalcola_fase_su_ordini_esistenti(p_fase_id smallint, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.ricalcola_fase_su_ordini_esistenti(p_fase_id smallint, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ricalcola_fase_su_ordini_esistenti(p_fase_id smallint, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ricalcola_fase_su_ordini_esistenti(p_fase_id smallint, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riepilogo_competenze_operatore(p_operatore_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.riepilogo_competenze_operatore(p_operatore_id uuid) TO anon;
GRANT ALL ON FUNCTION public.riepilogo_competenze_operatore(p_operatore_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riepilogo_competenze_operatore(p_operatore_id uuid) TO service_role;


--
-- Name: FUNCTION rimuovi_collega_extra(p_fase_extra_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rimuovi_collega_extra(p_fase_extra_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.rimuovi_collega_extra(p_fase_extra_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rimuovi_collega_extra(p_fase_extra_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION rimuovi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rimuovi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.rimuovi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rimuovi_collega_fase(p_ordine_fase_id uuid, p_collega_id uuid, p_richiedente_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riprendi_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_forza boolean, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.riprendi_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_forza boolean, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.riprendi_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_forza boolean, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riprendi_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_forza boolean, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION riprendi_tutte_fasi(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.riprendi_tutte_fasi(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.riprendi_tutte_fasi(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.riprendi_tutte_fasi(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION salva_allegato(p_ordine_fase_id uuid, p_url_file text, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.salva_allegato(p_ordine_fase_id uuid, p_url_file text, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.salva_allegato(p_ordine_fase_id uuid, p_url_file text, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.salva_allegato(p_ordine_fase_id uuid, p_url_file text, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION salva_nota_fase_extra(p_fase_extra_id uuid, p_note text, p_responsabile_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.salva_nota_fase_extra(p_fase_extra_id uuid, p_note text, p_responsabile_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.salva_nota_fase_extra(p_fase_extra_id uuid, p_note text, p_responsabile_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.salva_nota_fase_extra(p_fase_extra_id uuid, p_note text, p_responsabile_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION salva_onesignal_id(p_user_id uuid, p_onesignal_id text, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.salva_onesignal_id(p_user_id uuid, p_onesignal_id text, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.salva_onesignal_id(p_user_id uuid, p_onesignal_id text, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.salva_onesignal_id(p_user_id uuid, p_onesignal_id text, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION segna_notifiche_lette(p_utente_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.segna_notifiche_lette(p_utente_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.segna_notifiche_lette(p_utente_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.segna_notifiche_lette(p_utente_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.segna_notifiche_lette(p_utente_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION segna_spedito(p_ordine_id uuid, p_utente_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.segna_spedito(p_ordine_id uuid, p_utente_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.segna_spedito(p_ordine_id uuid, p_utente_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.segna_spedito(p_ordine_id uuid, p_utente_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION segna_spedizione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.segna_spedizione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.segna_spedizione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.segna_spedizione_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION segna_spedizione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.segna_spedizione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.segna_spedizione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.segna_spedizione_fase(p_ordine_fase_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION statistiche_lavoro_ordini(p_ordine_ids uuid[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.statistiche_lavoro_ordini(p_ordine_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.statistiche_lavoro_ordini(p_ordine_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.statistiche_lavoro_ordini(p_ordine_ids uuid[]) TO service_role;


--
-- Name: FUNCTION storico_fasi_completate(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.storico_fasi_completate(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.storico_fasi_completate(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.storico_fasi_completate(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION storico_ordini_periodo(p_operatore_id uuid, p_session_token uuid, p_dal timestamp with time zone, p_al timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.storico_ordini_periodo(p_operatore_id uuid, p_session_token uuid, p_dal timestamp with time zone, p_al timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.storico_ordini_periodo(p_operatore_id uuid, p_session_token uuid, p_dal timestamp with time zone, p_al timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.storico_ordini_periodo(p_operatore_id uuid, p_session_token uuid, p_dal timestamp with time zone, p_al timestamp with time zone) TO service_role;


--
-- Name: FUNCTION sync_e_attesa_esterna(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_e_attesa_esterna() TO anon;
GRANT ALL ON FUNCTION public.sync_e_attesa_esterna() TO authenticated;
GRANT ALL ON FUNCTION public.sync_e_attesa_esterna() TO service_role;


--
-- Name: FUNCTION tempo_medio_fasi_dati(p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.tempo_medio_fasi_dati(p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.tempo_medio_fasi_dati(p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.tempo_medio_fasi_dati(p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION trigger_push_notifica(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trigger_push_notifica() TO anon;
GRANT ALL ON FUNCTION public.trigger_push_notifica() TO authenticated;
GRANT ALL ON FUNCTION public.trigger_push_notifica() TO service_role;


--
-- Name: FUNCTION unisciti_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.unisciti_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO anon;
GRANT ALL ON FUNCTION public.unisciti_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unisciti_fase_extra(p_fase_extra_id uuid, p_operatore_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION valida_sessione(p_user_id uuid, p_session_token uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.valida_sessione(p_user_id uuid, p_session_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valida_sessione(p_user_id uuid, p_session_token uuid) TO service_role;


--
-- Name: FUNCTION verifica_pin(p_user_id uuid, p_pin text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.verifica_pin(p_user_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verifica_pin(p_user_id uuid, p_pin text) TO anon;
GRANT ALL ON FUNCTION public.verifica_pin(p_user_id uuid, p_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.verifica_pin(p_user_id uuid, p_pin text) TO service_role;


--
-- Name: TABLE allegati; Type: ACL; Schema: public; Owner: postgres
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.allegati TO anon;
GRANT ALL ON TABLE public.allegati TO authenticated;
GRANT ALL ON TABLE public.allegati TO service_role;


--
-- Name: TABLE archivio_log; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.archivio_log TO anon;
GRANT ALL ON TABLE public.archivio_log TO authenticated;
GRANT ALL ON TABLE public.archivio_log TO service_role;


--
-- Name: TABLE attributi_prodotto_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attributi_prodotto_config TO anon;
GRANT ALL ON TABLE public.attributi_prodotto_config TO authenticated;
GRANT ALL ON TABLE public.attributi_prodotto_config TO service_role;


--
-- Name: TABLE catalogo_fase_extra_macchine; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.catalogo_fase_extra_macchine TO anon;
GRANT ALL ON TABLE public.catalogo_fase_extra_macchine TO authenticated;
GRANT ALL ON TABLE public.catalogo_fase_extra_macchine TO service_role;


--
-- Name: TABLE catalogo_fasi_extra; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.catalogo_fasi_extra TO anon;
GRANT ALL ON TABLE public.catalogo_fasi_extra TO authenticated;
GRANT ALL ON TABLE public.catalogo_fasi_extra TO service_role;


--
-- Name: TABLE chiusure_aziendali; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.chiusure_aziendali TO anon;
GRANT ALL ON TABLE public.chiusure_aziendali TO authenticated;
GRANT ALL ON TABLE public.chiusure_aziendali TO service_role;


--
-- Name: TABLE competenze_operatore_fase; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.competenze_operatore_fase TO anon;
GRANT ALL ON TABLE public.competenze_operatore_fase TO authenticated;
GRANT ALL ON TABLE public.competenze_operatore_fase TO service_role;


--
-- Name: TABLE competenze_operatore_fase_extra; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.competenze_operatore_fase_extra TO anon;
GRANT ALL ON TABLE public.competenze_operatore_fase_extra TO authenticated;
GRANT ALL ON TABLE public.competenze_operatore_fase_extra TO service_role;


--
-- Name: TABLE competenze_operatore_macchina; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.competenze_operatore_macchina TO anon;
GRANT ALL ON TABLE public.competenze_operatore_macchina TO authenticated;
GRANT ALL ON TABLE public.competenze_operatore_macchina TO service_role;


--
-- Name: TABLE config_orario; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.config_orario TO anon;
GRANT ALL ON TABLE public.config_orario TO authenticated;
GRANT ALL ON TABLE public.config_orario TO service_role;


--
-- Name: TABLE config_sistema; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.config_sistema TO anon;
GRANT ALL ON TABLE public.config_sistema TO authenticated;
GRANT ALL ON TABLE public.config_sistema TO service_role;


--
-- Name: TABLE disponibilita_giornaliera; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.disponibilita_giornaliera TO anon;
GRANT ALL ON TABLE public.disponibilita_giornaliera TO authenticated;
GRANT ALL ON TABLE public.disponibilita_giornaliera TO service_role;


--
-- Name: TABLE fase_dipendenze; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fase_dipendenze TO anon;
GRANT ALL ON TABLE public.fase_dipendenze TO authenticated;
GRANT ALL ON TABLE public.fase_dipendenze TO service_role;


--
-- Name: TABLE fase_macchine; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fase_macchine TO anon;
GRANT ALL ON TABLE public.fase_macchine TO authenticated;
GRANT ALL ON TABLE public.fase_macchine TO service_role;


--
-- Name: TABLE fase_materiali; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fase_materiali TO anon;
GRANT ALL ON TABLE public.fase_materiali TO authenticated;
GRANT ALL ON TABLE public.fase_materiali TO service_role;


--
-- Name: TABLE fase_strutture; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fase_strutture TO anon;
GRANT ALL ON TABLE public.fase_strutture TO authenticated;
GRANT ALL ON TABLE public.fase_strutture TO service_role;


--
-- Name: TABLE fase_tipi_prodotto; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fase_tipi_prodotto TO anon;
GRANT ALL ON TABLE public.fase_tipi_prodotto TO authenticated;
GRANT ALL ON TABLE public.fase_tipi_prodotto TO service_role;


--
-- Name: TABLE fasi; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fasi TO anon;
GRANT ALL ON TABLE public.fasi TO authenticated;
GRANT ALL ON TABLE public.fasi TO service_role;


--
-- Name: TABLE fasi_extra_operatori; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.fasi_extra_operatori TO anon;
GRANT ALL ON TABLE public.fasi_extra_operatori TO authenticated;
GRANT ALL ON TABLE public.fasi_extra_operatori TO service_role;


--
-- Name: TABLE fasi_ordine_extra; Type: ACL; Schema: public; Owner: postgres
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.fasi_ordine_extra TO anon;
GRANT ALL ON TABLE public.fasi_ordine_extra TO authenticated;
GRANT ALL ON TABLE public.fasi_ordine_extra TO service_role;


--
-- Name: COLUMN fasi_ordine_extra.catalogo_fase_extra_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(catalogo_fase_extra_id),UPDATE(catalogo_fase_extra_id) ON TABLE public.fasi_ordine_extra TO authenticated;


--
-- Name: COLUMN fasi_ordine_extra.macchina_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(macchina_id),UPDATE(macchina_id) ON TABLE public.fasi_ordine_extra TO authenticated;


--
-- Name: COLUMN fasi_ordine_extra.ore_stimate_manuali; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(ore_stimate_manuali),UPDATE(ore_stimate_manuali) ON TABLE public.fasi_ordine_extra TO authenticated;


--
-- Name: TABLE kpi_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.kpi_config TO anon;
GRANT ALL ON TABLE public.kpi_config TO authenticated;
GRANT ALL ON TABLE public.kpi_config TO service_role;


--
-- Name: TABLE kpi_schede; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.kpi_schede TO anon;
GRANT ALL ON TABLE public.kpi_schede TO authenticated;
GRANT ALL ON TABLE public.kpi_schede TO service_role;


--
-- Name: TABLE macchine; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.macchine TO anon;
GRANT ALL ON TABLE public.macchine TO authenticated;
GRANT ALL ON TABLE public.macchine TO service_role;


--
-- Name: TABLE macro_fasi; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.macro_fasi TO anon;
GRANT ALL ON TABLE public.macro_fasi TO authenticated;
GRANT ALL ON TABLE public.macro_fasi TO service_role;


--
-- Name: SEQUENCE macro_fasi_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.macro_fasi_id_seq TO anon;
GRANT ALL ON SEQUENCE public.macro_fasi_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.macro_fasi_id_seq TO service_role;


--
-- Name: TABLE manutenzioni_macchina; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.manutenzioni_macchina TO anon;
GRANT ALL ON TABLE public.manutenzioni_macchina TO authenticated;
GRANT ALL ON TABLE public.manutenzioni_macchina TO service_role;


--
-- Name: TABLE notifiche; Type: ACL; Schema: public; Owner: postgres
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifiche TO anon;
GRANT ALL ON TABLE public.notifiche TO authenticated;
GRANT ALL ON TABLE public.notifiche TO service_role;


--
-- Name: TABLE notifiche_destinatari_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifiche_destinatari_config TO anon;
GRANT ALL ON TABLE public.notifiche_destinatari_config TO authenticated;
GRANT ALL ON TABLE public.notifiche_destinatari_config TO service_role;


--
-- Name: TABLE ordine_fasi; Type: ACL; Schema: public; Owner: postgres
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ordine_fasi TO anon;
GRANT ALL ON TABLE public.ordine_fasi TO authenticated;
GRANT ALL ON TABLE public.ordine_fasi TO service_role;


--
-- Name: TABLE ordine_fasi_operatori; Type: ACL; Schema: public; Owner: postgres
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ordine_fasi_operatori TO anon;
GRANT ALL ON TABLE public.ordine_fasi_operatori TO authenticated;
GRANT ALL ON TABLE public.ordine_fasi_operatori TO service_role;


--
-- Name: TABLE ordini; Type: ACL; Schema: public; Owner: postgres
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ordini TO anon;
GRANT ALL ON TABLE public.ordini TO authenticated;
GRANT ALL ON TABLE public.ordini TO service_role;


--
-- Name: COLUMN ordini.archiviato_il; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL(archiviato_il) ON TABLE public.ordini TO postgres;
GRANT REFERENCES(archiviato_il) ON TABLE public.ordini TO anon;
GRANT ALL(archiviato_il) ON TABLE public.ordini TO authenticated;
GRANT ALL(archiviato_il) ON TABLE public.ordini TO service_role;


--
-- Name: SEQUENCE ordini_codice_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.ordini_codice_seq TO anon;
GRANT ALL ON SEQUENCE public.ordini_codice_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ordini_codice_seq TO service_role;


--
-- Name: TABLE pin_tentativi; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pin_tentativi TO service_role;


--
-- Name: TABLE priorita_ordine_config; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.priorita_ordine_config TO anon;
GRANT ALL ON TABLE public.priorita_ordine_config TO authenticated;
GRANT ALL ON TABLE public.priorita_ordine_config TO service_role;


--
-- Name: TABLE snapshot_backfill_fasi_eliminate_20260903; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.snapshot_backfill_fasi_eliminate_20260903 TO anon;
GRANT ALL ON TABLE public.snapshot_backfill_fasi_eliminate_20260903 TO authenticated;
GRANT ALL ON TABLE public.snapshot_backfill_fasi_eliminate_20260903 TO service_role;


--
-- Name: TABLE tipi_prodotto; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tipi_prodotto TO anon;
GRANT ALL ON TABLE public.tipi_prodotto TO authenticated;
GRANT ALL ON TABLE public.tipi_prodotto TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: COLUMN users.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.nome; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(nome) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.cognome; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(cognome) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.email; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(email) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.ruolo; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(ruolo) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.attivo; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(attivo) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.creato_il; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(creato_il) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.eliminato; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(eliminato) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.onesignal_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(onesignal_id) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.forzato_logout; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(forzato_logout) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.ore_default; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(ore_default) ON TABLE public.users TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict k1QdIfcQheB1jeCpvB52caa0xnN3rhuO7Wk6yzhFlZxcHabiaqyoTZ0dalgGTnM

