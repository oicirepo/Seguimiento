-- =====================================================================
-- PARTE 31 — Cuentas solo con correo @antel.com.uy (siempre las aprueba el administrador)
-- (Neon > SQL Editor > Run). Requiere las partes 3 y 14. No cambia contraseñas ni las cuentas que ya
-- tienen acceso (aunque su correo no sea de Antel). Se puede correr más de una vez.
-- Después de correrlo: Neon > Data API > "Refresh schema cache".
--
-- - Solo se pueden habilitar cuentas nuevas con correo @antel.com.uy. Las de otros dominios no aparecen
--   en «Esperando habilitación» y la base no deja habilitarlas.
-- - Ninguna cuenta entra sola: el administrador la aprueba en Usuarios (por defecto como «Solo visualizar»,
--   o como director de obra eligiendo cuál).
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.correo_permitido(p_email text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(lower(trim(p_email)) ~ '^[^@\s]+@antel\.com\.uy$', false)
$fn$;

-- (Si se corrió una versión anterior de esta parte, se quita el alta automática)
DROP FUNCTION IF EXISTS public.pedir_acceso();
DROP FUNCTION IF EXISTS public.admin_alta_automatica(boolean);
DROP TABLE IF EXISTS public.config_web;

-- Lista de cuentas: las pendientes solo si son @antel.com.uy (las habilitadas siempre)
DROP FUNCTION IF EXISTS public.admin_usuarios();
CREATE FUNCTION public.admin_usuarios()
RETURNS TABLE (user_id text, email text, nombre_cuenta text, registrado text,
               nombre text, rol text, iniciales_do text, admin boolean, habilitado boolean, con_obras boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
#variable_conflict use_column
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver los usuarios';
  END IF;
  RETURN QUERY
  SELECT x.j->>'id', x.j->>'email', x.j->>'name',
         coalesce(x.j->>'createdAt', x.j->>'created_at'),
         w.nombre, w.rol, w.iniciales_do, coalesce(w.admin, false), (w.user_id IS NOT NULL), coalesce(w.con_obras, false)
  FROM (SELECT to_jsonb(u) AS j FROM neon_auth."user" u) x
  LEFT JOIN public.usuarios_web w ON w.user_id = x.j->>'id'
  WHERE w.user_id IS NOT NULL OR public.correo_permitido(x.j->>'email')
  ORDER BY (w.user_id IS NOT NULL), coalesce(x.j->>'createdAt', x.j->>'created_at') DESC NULLS LAST;
END $fn$;

-- Habilitar: una cuenta nueva tiene que ser @antel.com.uy (las que ya tienen acceso se pueden seguir editando)
CREATE OR REPLACE FUNCTION public.admin_habilitar(p_user_id text, p_nombre text, p_rol text, p_iniciales text,
                                                  p_con_obras boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ini    text;
  v_con    boolean;
  v_nombre text;
  v_email  text;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede habilitar usuarios';
  END IF;
  IF p_rol NOT IN ('LECTOR', 'EDITOR') THEN
    RAISE EXCEPTION 'Rol no válido: %', p_rol;
  END IF;
  SELECT to_jsonb(u)->>'email' INTO v_email FROM neon_auth."user" u WHERE to_jsonb(u)->>'id' = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa cuenta no existe';
  END IF;
  IF NOT public.correo_permitido(v_email) AND NOT EXISTS (SELECT 1 FROM public.usuarios_web WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Solo se pueden habilitar cuentas con correo @antel.com.uy';
  END IF;
  v_ini := nullif(trim(p_iniciales), '');
  v_con := coalesce(p_con_obras, v_ini IS NOT NULL);
  IF NOT v_con THEN
    v_ini := NULL;
  END IF;
  v_nombre := coalesce(nullif(trim(p_nombre), ''), 'Sin nombre');
  UPDATE public.usuarios_web SET nombre = v_nombre, rol = p_rol, iniciales_do = v_ini, con_obras = v_con
  WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.usuarios_web (user_id, nombre, rol, iniciales_do, con_obras)
    VALUES (p_user_id, v_nombre, p_rol, v_ini, v_con);
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.admin_usuarios(), public.admin_habilitar(text, text, text, text, boolean),
  public.correo_permitido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_usuarios(), public.admin_habilitar(text, text, text, text, boolean) TO authenticated;

COMMIT;

-- Control: cuentas con acceso y si su correo es de Antel
SELECT w.nombre, w.rol, CASE WHEN w.con_obras THEN 'con obras' ELSE 've todas' END AS tipo, w.admin,
       x.j->>'email' AS correo, public.correo_permitido(x.j->>'email') AS es_antel
FROM public.usuarios_web w
LEFT JOIN (SELECT to_jsonb(u) AS j FROM neon_auth."user" u) x ON x.j->>'id' = w.user_id
ORDER BY w.nombre;
