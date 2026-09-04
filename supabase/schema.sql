-- =============================================================================
--  Simulador FV · Esquema para Supabase (Postgres)
--  Pegar completo en: Supabase → SQL Editor → New query → Run
-- =============================================================================

-- ---------- Tipos ----------
do $$ begin
  create type rol_usuario as enum ('admin', 'vendedor', 'lector');
exception when duplicate_object then null; end $$;

-- ---------- Perfiles (uno por usuario de auth) ----------
create table if not exists public.perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null default '',
  email        text,
  rol          rol_usuario not null default 'vendedor',
  creado_en    timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse. El primer usuario es admin.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when (select count(*) from public.perfiles) = 0 then 'admin'::rol_usuario else 'vendedor'::rol_usuario end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.crear_perfil();

-- Helpers de rol (security definer para no recursar en las políticas)
create or replace function public.mi_rol()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.puede_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('admin', 'vendedor') from public.perfiles where id = auth.uid()), false);
$$;

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  cuit           text,
  ubicacion      text,
  notas          text,
  creado_por     uuid references public.perfiles(id) default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists clientes_nombre_idx on public.clientes (lower(nombre));

-- ---------- Distribuidoras (presets de impuestos sobre la tarifa) ----------
create table if not exists public.distribuidoras (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  provincia  text,
  impuestos  jsonb not null default '[]'::jsonb,   -- [{nombre, pct}, ...] hasta 5
  activa     boolean not null default true
);

-- ---------- Proyectos ----------
create table if not exists public.proyectos (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,                        -- id original "p_1781204647505" si vino de una importación
  cliente_id      uuid references public.clientes(id) on delete set null,
  nombre          text not null,
  kwp             numeric,
  resumen         text,
  estado          jsonb not null default '{}'::jsonb, -- todos los parámetros técnicos y económicos
  enviado         boolean not null default false,     -- marca la versión enviada al cliente
  creado_por      uuid references public.perfiles(id) default auth.uid(),   -- FK a perfiles para poder hacer join
  creado_en       timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  actualizado_en  timestamptz not null default now()
);
create index if not exists proyectos_cliente_idx on public.proyectos (cliente_id);
create index if not exists proyectos_actualizado_idx on public.proyectos (actualizado_en desc);

-- Mantiene actualizado_en / actualizado_por en cada UPDATE
create or replace function public.marcar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists proyectos_actualizado on public.proyectos;
create trigger proyectos_actualizado before update on public.proyectos
  for each row execute function public.marcar_actualizado();

drop trigger if exists clientes_actualizado on public.clientes;
create trigger clientes_actualizado before update on public.clientes
  for each row execute function public.marcar_actualizado();

-- =============================================================================
--  Seguridad a nivel de fila (RLS)
--  Modelo por defecto: todo el equipo VE todos los clientes y proyectos;
--  vendedores y admins crean; edita el autor o un admin; borra el autor o un admin;
--  los lectores solo consultan.
-- =============================================================================
alter table public.perfiles       enable row level security;
alter table public.clientes       enable row level security;
alter table public.distribuidoras enable row level security;
alter table public.proyectos      enable row level security;

-- Perfiles
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated using (true);
drop policy if exists perfiles_update_propio on public.perfiles;
create policy perfiles_update_propio on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() and rol = public.mi_rol() or public.es_admin());  -- solo admin cambia roles

-- Clientes
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated using (true);
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated with check (public.puede_editar());
drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated using (public.puede_editar());
drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes for delete to authenticated using (public.es_admin());

-- Distribuidoras
drop policy if exists distribuidoras_select on public.distribuidoras;
create policy distribuidoras_select on public.distribuidoras for select to authenticated using (true);
drop policy if exists distribuidoras_admin on public.distribuidoras;
create policy distribuidoras_admin on public.distribuidoras for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Proyectos
drop policy if exists proyectos_select on public.proyectos;
create policy proyectos_select on public.proyectos for select to authenticated using (true);
--   Alternativa "cada uno ve lo suyo" (reemplazar la política anterior):
--   create policy proyectos_select on public.proyectos for select to authenticated
--     using (creado_por = auth.uid() or public.es_admin());
drop policy if exists proyectos_insert on public.proyectos;
create policy proyectos_insert on public.proyectos for insert to authenticated with check (public.puede_editar());
drop policy if exists proyectos_update on public.proyectos;
create policy proyectos_update on public.proyectos for update to authenticated
  using (public.puede_editar() and (creado_por = auth.uid() or public.es_admin()));
drop policy if exists proyectos_delete on public.proyectos;
create policy proyectos_delete on public.proyectos for delete to authenticated
  using (creado_por = auth.uid() or public.es_admin());

-- =============================================================================
--  Datos iniciales: distribuidoras con los impuestos que aparecen en los presupuestos
-- =============================================================================
insert into public.distribuidoras (nombre, provincia, impuestos) values
  ('EPE Santa Fe', 'Santa Fe', '[{"nombre":"Ley 7797","pct":6},{"nombre":"Ley 13.414 (FER)","pct":1.5},{"nombre":"Alumbrado Público (CAP)","pct":0.2},{"nombre":"Ley 12692 Energías Renovables","pct":0.0006},{"nombre":"","pct":0}]'),
  ('EDEN / EDEA / EDES (Pcia. Buenos Aires)', 'Buenos Aires', '[{"nombre":"Ley 11969 art. 72 ter","pct":6},{"nombre":"Ley 7290","pct":1},{"nombre":"Ley 11769 FCT","pct":3.5},{"nombre":"Ley 11969 art. 72 bis","pct":0.001},{"nombre":"Alumbrado Público","pct":0.24}]'),
  ('Edenor / Edesur (AMBA)', 'Buenos Aires', '[{"nombre":"Contribución Municipal Art.34","pct":6.424},{"nombre":"Contribución Provincial Art.34","pct":0.001},{"nombre":"Decreto-Ley 7290","pct":1},{"nombre":"Tasa Alumbrado Público","pct":1.43},{"nombre":"","pct":0}]'),
  ('EPEC Córdoba', 'Córdoba', '[{"nombre":"FODEP","pct":10},{"nombre":"Tasa Reg. Dec. 2298/00","pct":1.044},{"nombre":"Resol. 27/2015 Seg. Eléctrica","pct":0.261},{"nombre":"","pct":0},{"nombre":"","pct":0}]'),
  ('Genérica (solo impuestos)', null, '[{"nombre":"Impuestos","pct":10.5},{"nombre":"","pct":0},{"nombre":"","pct":0},{"nombre":"","pct":0},{"nombre":"","pct":0}]')
on conflict (nombre) do nothing;

-- =============================================================================
--  Vista útil para listados (proyecto + nombre del cliente + autor)
-- =============================================================================
create or replace view public.proyectos_lista as
  select p.id, p.legacy_id, p.cliente_id, c.nombre as cliente, p.nombre, p.kwp, p.resumen, p.enviado,
         p.creado_por, pf.nombre as autor, p.creado_en, p.actualizado_en
  from public.proyectos p
  left join public.clientes c on c.id = p.cliente_id
  left join public.perfiles pf on pf.id = p.creado_por;
