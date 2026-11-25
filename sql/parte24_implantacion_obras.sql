-- =====================================================================
-- PARTE 24 — Hito «Implantación» en Obras   (Neon > SQL Editor > Run)
-- No cambia contraseñas. Se puede correr más de una vez (no duplica nada).
--
-- Obras queda con 3 hitos: Proyecto aprobado → Implantación → Infraestructura finalizada.
-- - Se agrega a la plantilla (para las obras nuevas) y a cada obra que ya existe.
-- - En las obras que ya están En obra o Terminadas, se carga como hecho (sin fecha).
-- - Al marcarla hecha, la obra pasa a En obra (igual que el Implantado de las estructuras).
-- =====================================================================
BEGIN;

INSERT INTO public.plantilla_hitos (capa, orden, nombre, etapa)
SELECT 'OBRAS', 15, 'Implantación', 3
WHERE NOT EXISTS (SELECT 1 FROM public.plantilla_hitos WHERE capa = 'OBRAS' AND nombre ILIKE 'Implanta%');

INSERT INTO public.hitos (obra_id, orden, nombre, etapa, estado)
SELECT o.fid, 15, 'Implantación', 3,
       CASE WHEN o."Estado" IN ('CONS', 'FIN') THEN 'HECHO' ELSE 'PENDIENTE' END
FROM public."Obras" o
WHERE NOT EXISTS (SELECT 1 FROM public.hitos h WHERE h.obra_id = o.fid AND h.nombre ILIKE 'Implanta%');

COMMIT;
