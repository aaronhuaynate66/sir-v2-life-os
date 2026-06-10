-- SIR V2 — 0069: género de la persona (para gatear el panel de ciclo menstrual
-- y, a futuro, mensajes/insights gendered). Nullable + tolerante: deploy seguro
-- antes de que el código mande la key (mismo patrón que estado_civil/education).
alter table public.people
  add column if not exists gender text
  check (gender in ('female', 'male', 'other'));
