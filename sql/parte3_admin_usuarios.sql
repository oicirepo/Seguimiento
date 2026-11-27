-- =====================================================================
-- PARTE 3 — Administrar usuarios desde la web   (Neon > SQL Editor)
-- Requiere la parte 2 (sql_parte2_web.sql) ya corrida.
-- No cambia contraseñas ni usuarios de base; QGIS y QField siguen igual.
-- Después de correrlo: Neon > Data API > "Refresh schema cache".
-- =====================================================================
BEGIN;

-- Quién puede administrar usuarios desde la web
ALTER TABLE public.usuarios_web ADD COLUMN IF NOT EXISTS admin boolean NOT NULL DEFAULT false;

-- Primer administrador: la cuenta de este correo
UPDATE public.usuarios_web w SET admin = true
FROM (SELECT to_jsonb(u) AS j FROM neon_auth."user" u) x
WHERE w.user_id = x.j->>'id' AND lower(x.j->>'email') = lower('correo.del.administrador@ejemplo.com')  -- (ya corrida: el correo real no se publica);

CREATE OR REPLACE FUNCTION public.es_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT admin FROM public.usuarios_web WHERE user_id = auth.user_id()), false)
$$;

-- Lista de cuentas registradas, habilitadas o no (solo administradores)
CREATE OR REPLACE FUNCTION public.admin_usuarios()
RETURNS TABLE (user_id text, email text, nombre_cuenta text, registrado text,
               nombre text, rol text, iniciales_do text, admin boolean, habilitado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver los usuarios';
  END IF;
  RETURN QUERY
  SELECT x.j->>'id', x.j->>'email', x.j->>'name',
         coalesce(x.j->>'createdAt', x.j->>'created_at'),
         w.nombre, w.rol, w.iniciales_do, coalesce(w.admin, false), (w.user_id IS NOT NULL)
  FROM (SELECT to_jsonb(u) AS j FROM neon_auth."user" u) x
  LEFT JOIN public.usuarios_web w ON w.user_id = x.j->>'id'
  ORDER BY (w.user_id IS NOT NULL), coalesce(x.j->>'createdAt', x.j->>'created_at') DESC NULLS LAST;
END $$;

-- Habilitar o actualizar una cuenta
CREATE OR REPLACE FUNCTION public.admin_habilitar(p_user_id text, p_nombre text, p_rol text, p_iniciales text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede habilitar usuarios';
  END IF;
  IF p_rol NOT IN ('LECTOR', 'EDITOR') THEN
    RAISE EXCEPTION 'Rol no válido: %', p_rol;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE to_jsonb(u)->>'id' = p_user_id) THEN
    RAISE EXCEPTION 'Esa cuenta no existe';
  END IF;
  INSERT INTO public.usuarios_web (user_id, nombre, rol, iniciales_do)
  VALUES (p_user_id, coalesce(nullif(trim(p_nombre), ''), 'Sin nombre'), p_rol, nullif(trim(p_iniciales), ''))
  ON CONFLICT (user_id) DO UPDATE
    SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol, iniciales_do = EXCLUDED.iniciales_do;
END $$;

-- Quitar el acceso a una cuenta (la cuenta sigue existiendo, pero no ve datos)
CREATE OR REPLACE FUNCTION public.admin_quitar(p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede quitar accesos';
  END IF;
  IF p_user_id = auth.user_id() THEN
    RAISE EXCEPTION 'No podés quitarte el acceso a vos mismo';
  END IF;
  DELETE FROM public.usuarios_web WHERE user_id = p_user_id;
END $$;

REVOKE ALL ON FUNCTION public.es_admin(), public.admin_usuarios(),
  public.admin_habilitar(text, text, text, text), public.admin_quitar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_admin(), public.admin_usuarios(),
  public.admin_habilitar(text, text, text, text), public.admin_quitar(text) TO authenticated;

COMMIT;

-- Control: tiene que aparecer tu fila con admin = true
-- SELECT nombre, rol, iniciales_do, admin FROM public.usuarios_web;
