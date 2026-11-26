-- =====================================================================
-- PARTE 26 — Perfiles de modelos de estructura (para las mediciones)   (Neon > SQL Editor > Run)
-- Requiere la parte 25. No cambia datos existentes ni contraseñas. Se puede correr más de una vez.
-- Después de correrlo: Neon > Data API > "Refresh schema cache".
--
-- Un perfil es un modelo (marca y altura): qué planilla usa (monopolo o mástil) y sus datos
-- (tramos, niveles, riendas, tolerancias). Se crean y se cambian desde la web, sin tocar código.
-- Trae cargados el monopolo MP40 y el mástil Mingyuan/Ciemsa-Prosecco de 100 m.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.perfiles_medicion (
  id          uuid PRIMARY KEY,
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('monopolo', 'mastil')),
  datos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  autor       text,
  creado      timestamptz NOT NULL DEFAULT now(),
  modificado  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.perfiles_medicion ENABLE ROW LEVEL SECURITY;

INSERT INTO public.perfiles_medicion (id, nombre, tipo, datos)
SELECT '6c0d5d2e-0001-4a3e-9a51-000000000040', 'Monopolo MP40 (40 m)', 'monopolo',
  '{"fabricante": "", "altura_m": 40, "tramos": [
     {"nombre": "1", "ancho": 134, "altura": 0}, {"nombre": "2", "ancho": 116, "altura": 900},
     {"nombre": "3", "ancho": 97.3, "altura": 1834}, {"nombre": "4", "ancho": 75.5, "altura": 2872},
     {"nombre": "Tope", "ancho": 50.6, "altura": 4000}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles_medicion WHERE id = '6c0d5d2e-0001-4a3e-9a51-000000000040');

INSERT INTO public.perfiles_medicion (id, nombre, tipo, datos)
SELECT '6c0d5d2e-0002-4a3e-9a51-000000000100', 'Mástil Mingyuan/Ciemsa-Prosecco 100 m', 'mastil',
  '{"fabricante": "Mingyuan/Ciemsa-Prosecco", "altura_m": 100, "medio_parante": "", "desplome_admisible": "",
    "niveles": [{"altura": 1.9, "A": 120}, {"altura": 14.5, "A": 120}, {"altura": 28.9, "A": 120}, {"altura": 41.5, "A": 120},
                {"altura": 54.7, "A": 120}, {"altura": 69.1, "A": 120}, {"altura": 84.7, "A": 120}, {"altura": 96.7, "A": 120},
                {"altura": 100, "A": 120}],
    "tolerancia": 30, "anclajes": ["A", "B", "C"],
    "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1280},
                {"nombre": "3", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1280},
                {"nombre": "5", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "6", "tipo": "5/8 19h", "nominal": 1930},
                {"nombre": "7d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7i", "tipo": "5/8 19h", "nominal": 1930},
                {"nombre": "8d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8i", "tipo": "5/8 19h", "nominal": 1930}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles_medicion WHERE id = '6c0d5d2e-0002-4a3e-9a51-000000000100');

CREATE OR REPLACE FUNCTION public.perfiles_lista()
RETURNS SETOF public.perfiles_medicion
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.rol_web() IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no está habilitado';
  END IF;
  RETURN QUERY SELECT * FROM public.perfiles_medicion ORDER BY tipo, nombre;
END $fn$;

CREATE OR REPLACE FUNCTION public.guardar_perfil(p_id uuid, p_nombre text, p_tipo text, p_datos jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_nombre text;
BEGIN
  IF coalesce(public.rol_web(), '') <> 'EDITOR' THEN
    RAISE EXCEPTION 'Solo un usuario con permiso de editor puede cambiar perfiles';
  END IF;
  IF nullif(trim(p_nombre), '') IS NULL THEN
    RAISE EXCEPTION 'El perfil necesita un nombre';
  END IF;
  SELECT nombre INTO v_nombre FROM public.usuarios_web WHERE user_id = auth.user_id();
  UPDATE public.perfiles_medicion
     SET nombre = trim(p_nombre), tipo = p_tipo, datos = coalesce(p_datos, '{}'::jsonb), autor = v_nombre, modificado = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    INSERT INTO public.perfiles_medicion (id, nombre, tipo, datos, autor)
    VALUES (p_id, trim(p_nombre), p_tipo, coalesce(p_datos, '{}'::jsonb), v_nombre);
  END IF;
  RETURN p_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.borrar_perfil(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede borrar perfiles';
  END IF;
  DELETE FROM public.perfiles_medicion WHERE id = p_id;
END $fn$;

REVOKE ALL ON FUNCTION public.perfiles_lista(), public.guardar_perfil(uuid, text, text, jsonb), public.borrar_perfil(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perfiles_lista(), public.guardar_perfil(uuid, text, text, jsonb), public.borrar_perfil(uuid) TO authenticated;

COMMIT;
