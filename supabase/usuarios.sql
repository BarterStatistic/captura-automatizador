-- Panel de administración (/admin). Pegar en Supabase → SQL Editor del proyecto de Dinamo
-- (el mismo de gemini_uso.sql, que debe correrse antes). Se puede correr más de una vez.
-- Solo la llave de servicio (SUPABASE_SERVICE_KEY) lee y escribe: RLS activo sin políticas.

-- 1) Usuarios de la herramienta -------------------------------------------------------------
create table if not exists public.usuarios (
  id bigint generated always as identity primary key,
  nombre text not null,
  nombre_clave text not null unique,   -- nombre sin acentos, mayúsculas ni espacios de más
  rol text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  hash text not null,                  -- scrypt con sal; la contraseña nunca se guarda
  activo boolean not null default true,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.usuarios enable row level security;

-- Los dos usuarios que ya existían, con las mismas contraseñas de hoy.
insert into public.usuarios (nombre, nombre_clave, rol, hash) values
  ('Braulio Acosta', 'braulio acosta', 'admin',
   'scrypt:16384:8:1:YTTxj54n8lToBaHTVyuEMg:2Npkh56GC1IOU5NQ5FkxEWb0XB5IWY8W8lpPmZCKKZg'),
  ('Bryan Barboza', 'bryan barboza', 'vendedor',
   'scrypt:16384:8:1:G5J3O_0Xzi6K8unwqcrDFw:GkPJVrzgIuz20-LiVj4SZrFIveS3ggNRK8uaqJuPLA8')
on conflict (nombre_clave) do nothing;

-- 2) Tipo de crédito de cada llamada a Gemini ----------------------------------------------
alter table public.gemini_uso add column if not exists tipo_credito text;
create index if not exists gemini_uso_tipo_idx on public.gemini_uso (tipo_credito);

-- 3) Balance del panel: totales, por tipo de crédito y por vendedor ------------------------
create or replace function public.admin_resumen(desde timestamptz)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select coalesce(usuario, '—') as usuario,
           coalesce(tipo_credito, 'Sin dato') as tipo,
           captura_id, costo_usd
    from gemini_uso where creado >= desde
  ),
  por_usuario as (
    select usuario, count(*) as n, sum(costo_usd) as usd, count(distinct captura_id) as c
    from base group by 1
  ),
  favorito as (
    select distinct on (usuario) usuario, tipo
    from (
      select usuario, tipo, count(distinct captura_id) as c
      from base where tipo <> 'Sin dato' group by 1, 2
    ) z
    order by usuario, c desc, tipo
  ),
  por_tipo as (
    select tipo, count(*) as n, sum(costo_usd) as usd, count(distinct captura_id) as c
    from base group by 1
  )
  select json_build_object(
    'llamadas', (select count(*) from base),
    'usd', (select coalesce(sum(costo_usd), 0) from base),
    'capturas', (select count(distinct captura_id) from base),
    'por_tipo', coalesce((
      select json_agg(json_build_object('tipo', tipo, 'capturas', c, 'llamadas', n, 'usd', usd) order by c desc, usd desc)
      from por_tipo
    ), '[]'::json),
    'por_usuario', coalesce((
      select json_agg(json_build_object(
        'usuario', u.usuario, 'llamadas', u.n, 'usd', u.usd, 'capturas', u.c, 'tipo_favorito', f.tipo
      ) order by u.usd desc)
      from por_usuario u left join favorito f using (usuario)
    ), '[]'::json)
  );
$$;
revoke all on function public.admin_resumen(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_resumen(timestamptz) to service_role;
