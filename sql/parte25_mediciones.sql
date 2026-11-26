-- =====================================================================
-- PARTE 25 — Mediciones de campo (verticalidad, tensión de riendas)   (Neon > SQL Editor > Run)
-- No cambia datos existentes ni contraseñas. Se puede correr más de una vez.
-- Después de correrlo: Neon > Data API > "Refresh schema cache".
--
-- - Tabla "mediciones": cada medición queda guardada en la base, vinculada a su estructura
--   (se borra sola si se borra la estructura). Los datos de la planilla van en "datos" (JSON).
-- - La web la lee y la guarda solo con estas funciones (como el historial); QGIS la ve como tabla.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.mediciones (
  id            uuid PRIMARY KEY,
  estructura_id integer NOT NULL REFERENCES public."Estructuras OICI Obra"(fid) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('verticalidad_monopolo', 'verticalidad_mastil', 'tension_riendas')),
  fecha         date NOT NULL DEFAULT current_date,
  datos         jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado     jsonb,
  autor         text,
  autor_id      text,
  creado        timestamptz NOT NULL DEFAULT now(),
  modificado    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mediciones_estructura ON public.mediciones (estructura_id, fecha DESC);
ALTER TABLE public.mediciones ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.mediciones_de(p_estructura integer)
RETURNS SETOF public.mediciones
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.rol_web() IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no está habilitado';
  END IF;
  RETURN QUERY SELECT * FROM public.mediciones WHERE estructura_id = p_estructura ORDER BY fecha DESC, creado DESC;
END $fn$;

CREATE OR REPLACE FUNCTION public.guardar_medicion(p_id uuid, p_estructura integer, p_tipo text, p_fecha date,
                                                   p_datos jsonb, p_resultado jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_nombre text;
BEGIN
  IF coalesce(public.rol_web(), '') <> 'EDITOR' THEN
    RAISE EXCEPTION 'Solo un usuario con permiso de editor puede guardar mediciones';
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios_web WHERE user_id = auth.user_id();
  UPDATE public.mediciones
     SET tipo = p_tipo, fecha = coalesce(p_fecha, current_date), datos = coalesce(p_datos, '{}'::jsonb),
         resultado = p_resultado, modificado = now()
   WHERE id = p_id AND estructura_id = p_estructura;
  IF NOT FOUND THEN
    INSERT INTO public.mediciones (id, estructura_id, tipo, fecha, datos, resultado, autor, autor_id)
    VALUES (p_id, p_estructura, p_tipo, coalesce(p_fecha, current_date), coalesce(p_datos, '{}'::jsonb), p_resultado,
            v_nombre, auth.user_id());
  END IF;
  RETURN p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.borrar_medicion(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT (public.es_admin() OR EXISTS (SELECT 1 FROM public.mediciones
                                       WHERE id = p_id AND autor_id = auth.user_id() AND public.rol_web() = 'EDITOR')) THEN
    RAISE EXCEPTION 'Solo quien la cargó o el administrador pueden borrar una medición';
  END IF;
  DELETE FROM public.mediciones WHERE id = p_id;
END $fn$;

REVOKE ALL ON FUNCTION public.mediciones_de(integer), public.guardar_medicion(uuid, integer, text, date, jsonb, jsonb),
  public.borrar_medicion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mediciones_de(integer), public.guardar_medicion(uuid, integer, text, date, jsonb, jsonb),
  public.borrar_medicion(uuid) TO authenticated;

COMMIT;
