-- =====================================================================
-- PARTE 28 — Nombre de cada nivel de verticalidad en los perfiles de mástil   (Neon > SQL Editor > Run)
-- Pone Base / Rienda / Antirrotor en los niveles de los perfiles Mingyuan de 100 m y 60 m.
-- Solo completa niveles que todavía no tienen nombre: lo que ya cambiaste en la web se respeta.
-- No toca mediciones ni contraseñas. Se puede correr más de una vez.
-- =====================================================================
UPDATE public.perfiles_medicion p
   SET datos = jsonb_set(p.datos, '{niveles}', (
         SELECT jsonb_agg(CASE WHEN COALESCE(e->>'nombre', '') <> '' THEN e
                               ELSE e || jsonb_build_object('nombre', COALESCE(n.nombre, '')) END ORDER BY x.i)
           FROM jsonb_array_elements(p.datos->'niveles') WITH ORDINALITY AS x(e, i)
           LEFT JOIN (VALUES
             ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 1, 'Base'), ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 2, 'Rienda'),
             ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 3, 'Rienda'), ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 4, 'Rienda'),
             ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 5, 'Rienda'), ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 6, 'Rienda'),
             ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 7, 'Antirrotor'), ('6c0d5d2e-0002-4a3e-9a51-000000000100'::uuid, 8, 'Antirrotor'),
             ('6c0d5d2e-0003-4a3e-9a51-000000000060'::uuid, 1, 'Base'), ('6c0d5d2e-0003-4a3e-9a51-000000000060'::uuid, 2, 'Rienda'),
             ('6c0d5d2e-0003-4a3e-9a51-000000000060'::uuid, 3, 'Rienda'), ('6c0d5d2e-0003-4a3e-9a51-000000000060'::uuid, 4, 'Rienda'),
             ('6c0d5d2e-0003-4a3e-9a51-000000000060'::uuid, 5, 'Antirrotor')
           ) AS n(perfil, idx, nombre) ON n.perfil = p.id AND n.idx = x.i)),
       modificado = now()
 WHERE p.id IN ('6c0d5d2e-0002-4a3e-9a51-000000000100', '6c0d5d2e-0003-4a3e-9a51-000000000060')
   AND jsonb_array_length(p.datos->'niveles') > 0;

SELECT nombre, (SELECT string_agg(COALESCE(e->>'nombre', '') || ' ' || (e->>'altura'), ' · ' ORDER BY i)
                  FROM jsonb_array_elements(datos->'niveles') WITH ORDINALITY AS x(e, i)) AS niveles
FROM public.perfiles_medicion WHERE tipo = 'mastil' ORDER BY nombre;
