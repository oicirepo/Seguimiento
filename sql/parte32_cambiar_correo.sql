-- =====================================================================
-- PARTE 32 — Pasar una cuenta a otro correo sin perder nada   (Neon > SQL Editor > Run)
--
-- Antes de correrlo:
--   1. En la web, «Crear cuenta» con el correo NUEVO (y su contraseña). Queda esperando habilitación;
--      no hace falta aprobarla: este script le pasa todo lo de la cuenta vieja.
--   2. Cambiá los dos correos de abajo (viejo y nuevo) y dale Run.
--
-- Qué hace: la cuenta nueva queda con el mismo acceso que la vieja (administrador, Editor, director de obra…)
-- y pasan a la nueva las mediciones, el historial y los pedidos hechos con la vieja. Los nombres que se ven
-- en la web no cambian. La cuenta vieja queda sin acceso (si querés, después la borrás en Neon > Auth).
-- No toca contraseñas de la base, ni QGIS, ni QField. Si algo no coincide, no cambia nada y avisa.
-- =====================================================================
DO $do$
DECLARE
  v_viejo  text := lower('correo.viejo@gmail.com');       -- correo de la cuenta que hoy tiene el acceso
  v_nuevo  text := lower('nombre.apellido@antel.com.uy'); -- correo de la cuenta nueva (ya creada en la web)
  v_id_v   text;
  v_id_n   text;
  r        record;
  v_n      integer;
BEGIN
  SELECT to_jsonb(u)->>'id' INTO v_id_v FROM neon_auth."user" u WHERE lower(to_jsonb(u)->>'email') = v_viejo;
  SELECT to_jsonb(u)->>'id' INTO v_id_n FROM neon_auth."user" u WHERE lower(to_jsonb(u)->>'email') = v_nuevo;
  IF v_id_v IS NULL THEN RAISE EXCEPTION 'No existe una cuenta con el correo %', v_viejo; END IF;
  IF v_id_n IS NULL THEN RAISE EXCEPTION 'No existe una cuenta con el correo %: creala primero en la web', v_nuevo; END IF;
  IF v_id_v = v_id_n THEN RAISE EXCEPTION 'Los dos correos son la misma cuenta'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios_web WHERE user_id = v_id_v) THEN
    RAISE EXCEPTION 'La cuenta % no tiene acceso a la web: no hay nada para pasar', v_viejo;
  END IF;

  -- el acceso: se borra el que haya tomado la cuenta nueva y se le pasa el de la vieja
  DELETE FROM public.usuarios_web WHERE user_id = v_id_n;
  UPDATE public.usuarios_web SET user_id = v_id_n WHERE user_id = v_id_v;
  RAISE NOTICE 'Acceso pasado de % a %', v_viejo, v_nuevo;

  -- lo hecho con la cuenta vieja (solo las tablas y columnas que existan)
  FOR r IN SELECT * FROM (VALUES ('mediciones', 'autor_id'), ('historial', 'usuario_id'), ('historial', 'deshecho_por'),
           ('solicitudes_borrado', 'pedido_por'), ('solicitudes_borrado', 'resuelto_por'),
           ('solicitudes_forma', 'pedido_por'), ('solicitudes_forma', 'resuelto_por')) AS t(tabla, columna)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = r.tabla AND column_name = r.columna) THEN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.tabla, r.columna, r.columna) USING v_id_n, v_id_v;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN RAISE NOTICE '%.%: % filas', r.tabla, r.columna, v_n; END IF;
    END IF;
  END LOOP;
END $do$;

-- Control: cuentas con acceso y su correo
SELECT w.nombre, w.rol, w.admin, x.j->>'email' AS correo
FROM public.usuarios_web w
LEFT JOIN (SELECT to_jsonb(u) AS j FROM neon_auth."user" u) x ON x.j->>'id' = w.user_id
ORDER BY w.admin DESC, w.nombre;
