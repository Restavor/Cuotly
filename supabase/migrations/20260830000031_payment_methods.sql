-- Métodos de pago: transferencia o Bizum, y nada más.
--
-- Los tres documentos se contradecían y CLAUDE.md prohíbe resolver una
-- contradicción por cuenta propia, así que se paró y se preguntó:
--
--   · PRD RN-FIN-03: "métodos registrados: transferencia, tarjeta,
--     efectivo, domiciliación, otro" (cinco, sin Bizum).
--   · CLAUDE.md: "Sin Stripe: los pagos se registran manualmente
--     (transferencia o Bizum)".
--   · Especificación Maestra §244: "Métodos: transferencia bancaria o
--     Bizum".
--
-- Bosco decidió el 31/08/2026: transferencia o Bizum. Dos métodos.
-- Recogido en docs/DECISIONES.md (decisión 10) y corregido en el PRD.
--
-- Esto anula la parte de la migración 20260830000028 que se limitó a
-- añadir 'bizum' a los cinco anteriores: aquel cambio resolvía la
-- contradicción por su cuenta, que es justo lo que no tocaba hacer.
--
-- No hay datos que migrar: `payments` es del Hito 7, todavía sin
-- desplegar, y el único método que usan los tests es 'transfer'.
alter table public.payments drop constraint payments_method_check;

alter table public.payments add constraint payments_method_check
  check (method in ('transfer', 'bizum'));

comment on column public.payments.method is
  'RN-FIN-03: transferencia o Bizum. Sin Stripe, sin tarjeta, sin
   domiciliación — los pagos se registran a mano (CLAUDE.md, decisión 10
   de docs/DECISIONES.md).';
