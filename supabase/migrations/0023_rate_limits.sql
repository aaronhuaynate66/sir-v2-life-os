-- 0023 — Rate limiting atómico server-side (Auditoría técnica: riesgo crítico #1).
--
-- OBJETIVO: cortar loops/abuso/accidentes que disparen costo en los endpoints
-- LLM/Visión (un retry-loop del cliente podría quemar $$ en minutos). NO es
-- defensa contra un atacante determinado (la app es single-user) → el limiter
-- es fail-OPEN en el cliente si este RPC no existe/falla.
--
-- ENFOQUE: contador de ventana fija (fixed window) atómico. Una sola sentencia
-- INSERT ... ON CONFLICT hace el increment + reset de ventana sin race. El RPC
-- es SECURITY DEFINER: corre como owner y bypassa RLS, así la tabla queda
-- cerrada a acceso directo de clientes (RLS on + 0 policies).
--
-- La DECISIÓN allow/deny/Retry-After vive en JS (lib/ratelimit/window.ts, puro
-- y testeado); este RPC sólo devuelve el contador crudo + el now() del server
-- (para evitar clock-skew entre app y DB al calcular Retry-After).
--
-- IDEMPOTENTE: create table/function if-not-exists / or replace. Aditivo, sin
-- destructivos. ACCIÓN MANUAL: correr este archivo en el SQL editor de Supabase.

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  updated_at   timestamptz not null default now()
);

-- RLS on + SIN policies: ningún cliente (anon/authenticated) lee ni escribe
-- directo. El RPC SECURITY DEFINER es el único camino.
alter table public.rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_key            text,
  p_window_seconds integer
)
returns table(hits integer, window_start_at timestamptz, server_now timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now    timestamptz := now();
  v_window interval     := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as rl (key, window_start, count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key) do update
    set count = case
                  when rl.window_start <= v_now - v_window then 1
                  else rl.count + 1
                end,
        window_start = case
                  when rl.window_start <= v_now - v_window then v_now
                  else rl.window_start
                end,
        updated_at = v_now
  returning rl.count, rl.window_start into hits, window_start_at;

  server_now := v_now;
  return next;
end;
$$;

revoke all on function public.check_rate_limit(text, integer) from public;
grant execute on function public.check_rate_limit(text, integer) to authenticated, service_role;
