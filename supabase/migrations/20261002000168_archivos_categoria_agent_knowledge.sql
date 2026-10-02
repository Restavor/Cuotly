-- ============================================================
-- Restavor agents · Fase B (cierre) · novena categoría de archivo
--
-- Decisión 109 (resuelta por Bosco el 02/10/2026): RN-ARC-01 pasa de ocho
-- a nueve categorías. La nueva, `agent_knowledge`, es para los documentos
-- que el restaurante sube al agente de llamadas de Reservas (PRD de agents
-- §8.1). La migración 25 está aplicada y no se toca: aquí se recrea el CHECK.
--
-- Nada sube todavía documentos con esta categoría (es de la Fase G) y
-- ningún formulario de Restavor web la ofrece: cada uno fija la suya.
-- ============================================================
alter table public.files drop constraint files_category_check;

alter table public.files add constraint files_category_check check (category in (
  'logos', 'photos', 'menus', 'documents', 'reports', 'billing', 'requests_and_jobs', 'other',
  'agent_knowledge'
));
