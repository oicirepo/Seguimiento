-- =====================================================================
-- PARTE 29 — Modelo por licitación y perfiles del mástil de la P103456   (Neon > SQL Editor > Run)
-- 1) Los perfiles Mingyuan de 100 y 60 m quedan asociados a la licitación P104556 (versión riendas y antirrotor).
-- 2) Perfiles nuevos del mástil de 100 m de la P103456 (Xinguangzheng), sacados de la planilla «Verticalidad Mástil 26O»:
--    - riendas y antirrotor: base, los 8 niveles de riendas y el tope (10 niveles)
--    - completo: los 26 niveles (con todos los empalmes)
--    A = 123.5 cm, medio parante = 5 cm, desplome admisible = 25 cm (0,25 % de 100 m).
-- No toca mediciones ni contraseñas. Se puede correr más de una vez (no pisa lo que ya cambiaste en la web).
-- =====================================================================
BEGIN;

UPDATE public.perfiles_medicion
   SET datos = jsonb_build_object('licitaciones', 'P104556', 'version', 'basica') || datos, modificado = now()
 WHERE id IN ('6c0d5d2e-0002-4a3e-9a51-000000000100', '6c0d5d2e-0003-4a3e-9a51-000000000060')
   AND NOT (datos ? 'licitaciones');

INSERT INTO public.perfiles_medicion (id, nombre, tipo, datos)
SELECT '6c0d5d2e-0004-4a3e-9a51-000000000100', 'Mástil Xinguangzheng 100 m (P103456)', 'mastil', '{"fabricante": "Xinguangzheng", "altura_m": 100, "licitaciones": "P103456", "version": "basica", "medio_parante": 5, "desplome_admisible": 25, "niveles": [{"nombre": "Base", "altura": 1.8, "A": 123.5}, {"nombre": "Rienda", "altura": 13.8, "A": 123.5}, {"nombre": "Rienda", "altura": 28.2, "A": 123.5}, {"nombre": "Rienda", "altura": 40.2, "A": 123.5}, {"nombre": "Rienda", "altura": 52.2, "A": 123.5}, {"nombre": "Rienda", "altura": 64.2, "A": 123.5}, {"nombre": "Rienda", "altura": 76.2, "A": 123.5}, {"nombre": "Antirrotor", "altura": 87, "A": 123.5}, {"nombre": "Antirrotor", "altura": 97.2, "A": 123.5}, {"nombre": "", "altura": 100, "A": 123.5}], "tolerancia": 30, "anclajes": ["A", "B", "C"], "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "3", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "5", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "6", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7i", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8i", "tipo": "5/8 19h", "nominal": 1930}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles_medicion WHERE id = '6c0d5d2e-0004-4a3e-9a51-000000000100');

INSERT INTO public.perfiles_medicion (id, nombre, tipo, datos)
SELECT '6c0d5d2e-0005-4a3e-9a51-000000000100', 'Mástil Xinguangzheng 100 m (P103456) completo', 'mastil', '{"fabricante": "Xinguangzheng", "altura_m": 100, "licitaciones": "P103456", "version": "completa", "medio_parante": 5, "desplome_admisible": 25, "niveles": [{"nombre": "Base", "altura": 1.8, "A": 123.5}, {"nombre": "Empalme", "altura": 6.3, "A": 123.5}, {"nombre": "Empalme", "altura": 12.3, "A": 123.5}, {"nombre": "Rienda", "altura": 13.8, "A": 123.5}, {"nombre": "Empalme", "altura": 18.3, "A": 123.5}, {"nombre": "Empalme", "altura": 24.3, "A": 123.5}, {"nombre": "Rienda", "altura": 28.2, "A": 123.5}, {"nombre": "Empalme", "altura": 30.3, "A": 123.5}, {"nombre": "Empalme", "altura": 36.3, "A": 123.5}, {"nombre": "Rienda", "altura": 40.2, "A": 123.5}, {"nombre": "Empalme", "altura": 42.3, "A": 123.5}, {"nombre": "Empalme", "altura": 48.3, "A": 123.5}, {"nombre": "Rienda", "altura": 52.2, "A": 123.5}, {"nombre": "Empalme", "altura": 54.33, "A": 123.5}, {"nombre": "Empalme", "altura": 60.3, "A": 123.5}, {"nombre": "Rienda", "altura": 64.2, "A": 123.5}, {"nombre": "Empalme", "altura": 66.3, "A": 123.5}, {"nombre": "Empalme", "altura": 72.3, "A": 123.5}, {"nombre": "Rienda", "altura": 76.2, "A": 123.5}, {"nombre": "Empalme", "altura": 78.3, "A": 123.5}, {"nombre": "Empalme", "altura": 84.3, "A": 123.5}, {"nombre": "Antirrotor", "altura": 87, "A": 123.5}, {"nombre": "Empalme", "altura": 90.3, "A": 123.5}, {"nombre": "Empalme", "altura": 96.3, "A": 123.5}, {"nombre": "Antirrotor", "altura": 97.2, "A": 123.5}, {"nombre": "", "altura": 100, "A": 123.5}], "tolerancia": 30, "anclajes": ["A", "B", "C"], "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "3", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "5", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "6", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7i", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8i", "tipo": "5/8 19h", "nominal": 1930}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles_medicion WHERE id = '6c0d5d2e-0005-4a3e-9a51-000000000100');

COMMIT;

SELECT nombre, datos->>'licitaciones' AS licitacion, coalesce(datos->>'version', 'basica') AS version,
       jsonb_array_length(datos->'niveles') AS niveles, jsonb_array_length(datos->'riendas') AS riendas
FROM public.perfiles_medicion WHERE tipo = 'mastil' ORDER BY nombre;
