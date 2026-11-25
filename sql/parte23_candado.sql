-- =====================================================================
-- PARTE 23 — Color de candado   (Neon > SQL Editor > Run)
-- No cambia datos existentes ni contraseñas. Se puede correr más de una vez.
-- Después de correrlo: Neon > Data API > "Refresh schema cache".
--
-- - Agrega la columna "CANDADO" (texto) a "Estructuras OICI Obra" y a "Obras".
--   Vacía = la web pone el color según la zona del listado de candados; con un valor
--   (negro, gris, rojo, amarillo, azul, marron, lila, verde, blanco) es el color elegido a mano.
-- Requiere la parte 22 (OI y ART).
-- =====================================================================
BEGIN;

ALTER TABLE public."Estructuras OICI Obra" ADD COLUMN IF NOT EXISTS "CANDADO" text;
ALTER TABLE public."Obras" ADD COLUMN IF NOT EXISTS "CANDADO" text;

DO $do$
DECLARE
  par record;
  v_def text;
BEGIN
  FOR par IN SELECT * FROM (VALUES ('v_estructuras', 'Estructuras OICI Obra'), ('v_obras', 'Obras')) AS t(vista, tabla) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = par.vista AND column_name = 'candado') THEN
      v_def := rtrim(pg_get_viewdef(('public.' || par.vista)::regclass, true), E'; \n');
      EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker = true) AS
                      SELECT v.*, x."CANDADO" AS candado
                      FROM (%s) v LEFT JOIN public.%I x ON x.fid = v.id', par.vista, v_def, par.tabla);
    END IF;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.editar_capa(p_tipo text, p_id integer, p_cambios jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_tabla     text;
  v_permitido text[];
  v_cols      text;
  v_n         integer;
BEGIN
  IF coalesce(public.rol_web(), '') <> 'EDITOR' THEN
    RAISE EXCEPTION 'Solo un usuario con permiso de editor puede cambiar datos';
  END IF;
  IF p_tipo = 'estructura' THEN
    v_tabla := 'Estructuras OICI Obra';
    v_permitido := ARRAY['ESTADO', 'ESTRUCTURA', 'LICITACIÓN', 'AÑO', 'D.O.', 'FECHA INICIO', 'FECHA FIN',
                         'RECEPCIÓN', 'PLANOS', 'OBSERVACIONES', 'FIN PREVISTO', 'OI', 'ART', 'CANDADO'];
  ELSIF p_tipo = 'obra' THEN
    v_tabla := 'Obras';
    v_permitido := ARRAY['Estado', 'Sala', 'Localidad', 'Departamento', 'Licitación', 'Tarea', 'Descripción',
                         'D.O.', 'Planos', 'FIN PREVISTO', 'FECHA FIN', 'OI', 'ART', 'CANDADO'];
  ELSE
    RAISE EXCEPTION 'Capa desconocida: %', p_tipo;
  END IF;

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols
  FROM jsonb_object_keys(coalesce(p_cambios, '{}'::jsonb)) AS k
  WHERE k = ANY (v_permitido)
    AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = 'public' AND c.table_name = v_tabla AND c.column_name = k);
  IF v_cols IS NULL THEN RAISE EXCEPTION 'No hay campos para cambiar'; END IF;

  EXECUTE format('UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE fid = $2',
                 v_tabla, v_cols, v_cols, v_tabla)
    USING p_cambios, p_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'No se encontró el elemento % en %', p_id, v_tabla; END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.editar_capa(text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_capa(text, integer, jsonb) TO authenticated;

COMMIT;
