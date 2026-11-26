-- =====================================================================
-- PARTE 27 — Riendas de los mástiles nuevos (Mingyuan/Ciemsa-Prosecco 100 m y 60 m)   (Neon > SQL Editor > Run)
-- Requiere la parte 26. No cambia mediciones ya hechas ni contraseñas. Se puede correr más de una vez.
--
-- Lectura de referencia de cada rienda = tensión inicial del plano (kgf), por diámetro:
--   13 mm (1/2") 1200 · 16 mm (5/8") 1900 · 20 mm (3/4") 2900   (todas de 19 hilos)
-- 100 m: 1 a 4 simples de 1/2"; 5 simple, 6d y 6i de 5/8"; 7d y 7i de 3/4".
-- 60 m:  1 y 2 simples de 1/2"; 3 simple de 5/8"; 4d y 4i de 3/4".
-- =====================================================================
BEGIN;

UPDATE public.perfiles_medicion
   SET datos = jsonb_set(datos, '{riendas}', '[
         {"nombre": "1", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1200},
         {"nombre": "3", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1200},
         {"nombre": "5", "tipo": "5/8 19h", "nominal": 1900},
         {"nombre": "6d", "tipo": "5/8 19h", "nominal": 1900}, {"nombre": "6i", "tipo": "5/8 19h", "nominal": 1900},
         {"nombre": "7d", "tipo": "3/4 19h", "nominal": 2900}, {"nombre": "7i", "tipo": "3/4 19h", "nominal": 2900}]'::jsonb),
       modificado = now()
 WHERE id = '6c0d5d2e-0002-4a3e-9a51-000000000100';

INSERT INTO public.perfiles_medicion (id, nombre, tipo, datos)
SELECT '6c0d5d2e-0003-4a3e-9a51-000000000060', 'Mástil Mingyuan/Ciemsa-Prosecco 60 m', 'mastil',
  '{"fabricante": "Mingyuan/Ciemsa-Prosecco", "altura_m": 60, "medio_parante": "", "desplome_admisible": "",
    "niveles": [{"altura": 1.9, "A": 120}, {"altura": 14.1, "A": 120}, {"altura": 29.1, "A": 120},
                {"altura": 43.5, "A": 120}, {"altura": 56.7, "A": 120}, {"altura": 60, "A": 120}],
    "tolerancia": 30, "anclajes": ["A", "B", "C"],
    "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1200},
                {"nombre": "3", "tipo": "5/8 19h", "nominal": 1900},
                {"nombre": "4d", "tipo": "3/4 19h", "nominal": 2900}, {"nombre": "4i", "tipo": "3/4 19h", "nominal": 2900}]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.perfiles_medicion WHERE id = '6c0d5d2e-0003-4a3e-9a51-000000000060');

COMMIT;

SELECT nombre, jsonb_array_length(datos->'riendas') AS riendas, jsonb_array_length(datos->'niveles') AS niveles
FROM public.perfiles_medicion WHERE tipo = 'mastil' ORDER BY nombre;
