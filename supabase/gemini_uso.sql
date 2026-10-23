-- Gasto de Gemini por llamada. Pegar en Supabase → SQL Editor del proyecto de Dinamo.
-- Solo la llave de servicio (SUPABASE_SERVICE_KEY) lee y escribe: RLS activo sin políticas.

create table if not exists public.gemini_uso (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  usuario text,
  captura_id text,
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  tokens_razonamiento integer not null default 0,
  costo_usd numeric(12,6) not null default 0,
  estado integer
);
create index if not exists gemini_uso_creado_idx on public.gemini_uso (creado desc);
create index if not exists gemini_uso_captura_idx on public.gemini_uso (captura_id);
alter table public.gemini_uso enable row level security;

create or replace function public.gemini_resumen(desde timestamptz)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'llamadas', count(*),
    'usd', coalesce(sum(costo_usd), 0),
    'capturas', count(distinct captura_id),
    'por_usuario', coalesce((
      select json_agg(json_build_object('usuario', u.usuario, 'llamadas', u.n, 'usd', u.usd, 'capturas', u.c) order by u.usd desc)
      from (
        select coalesce(usuario, '—') as usuario, count(*) as n, sum(costo_usd) as usd, count(distinct captura_id) as c
        from gemini_uso where creado >= desde group by 1
      ) u
    ), '[]'::json)
  )
  from gemini_uso where creado >= desde;
$$;
revoke all on function public.gemini_resumen(timestamptz) from public, anon, authenticated;
grant execute on function public.gemini_resumen(timestamptz) to service_role;
