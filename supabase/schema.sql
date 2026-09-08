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

-- Aprobación manual de cuentas.
-- Registrarse no alcanza para entrar: hace falta que un administrador habilite
-- la cuenta. Se agrega en dos pasos para que las cuentas que ya existían queden
-- aprobadas y solo las nuevas nazcan pendientes.
alter table public.perfiles add column if not exists aprobado boolean not null default true;
alter table public.perfiles alter column aprobado set default false;
alter table public.perfiles add column if not exists aprobado_en timestamptz;
alter table public.perfiles add column if not exists aprobado_por uuid references public.perfiles(id);
create index if not exists perfiles_pendientes_idx on public.perfiles (creado_en) where not aprobado;

-- Crea el perfil automáticamente al registrarse.
-- El primer usuario de una base vacía queda como administrador aprobado, porque
-- si no nadie podría habilitar a nadie. Todos los demás nacen pendientes.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  es_primero boolean := (select count(*) from public.perfiles) = 0;
begin
  insert into public.perfiles (id, nombre, email, rol, aprobado, aprobado_en)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when es_primero then 'admin'::rol_usuario else 'vendedor'::rol_usuario end,
    es_primero,
    case when es_primero then now() else null end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.crear_perfil();

-- Impide que alguien se apruebe o se ascienda a sí mismo.
-- Las políticas de fila dejan editar el perfil propio (para cambiar el nombre),
-- así que el rol y la aprobación se revierten cuando quien edita es un usuario
-- logueado que no es administrador.
--
-- Cuando auth.uid() es nulo no hay sesión: es el dueño del proyecto entrando por
-- el editor SQL o con la clave de servicio. A ese acceso no tiene sentido
-- frenarlo, porque podría desactivar el disparador de todos modos.
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  puede boolean := auth.uid() is null or public.es_admin();
begin
  if not puede then
    new.rol := old.rol;
    new.aprobado := old.aprobado;
    new.aprobado_en := old.aprobado_en;
    new.aprobado_por := old.aprobado_por;
  elsif new.aprobado is distinct from old.aprobado then
    new.aprobado_en := case when new.aprobado then now() else null end;
    new.aprobado_por := case when new.aprobado then auth.uid() else null end;
  end if;
  return new;
end $$;

drop trigger if exists perfiles_proteger on public.perfiles;
create trigger perfiles_proteger before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- Helpers de rol (security definer para no recursar en las políticas)
create or replace function public.mi_rol()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- Una cuenta sin aprobar no puede ver ni tocar nada, sea cual sea su rol.
create or replace function public.esta_aprobado()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' and aprobado from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.puede_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('admin', 'vendedor') and aprobado from public.perfiles where id = auth.uid()), false);
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

-- ---------- Membrete de la empresa (una sola fila, compartida por todo el equipo) ----------
create table if not exists public.empresa (
  id              boolean primary key default true check (id),   -- el check fuerza una única fila
  nombre          text not null default '',
  slogan          text not null default '',
  asesor          text not null default '',
  tel             text not null default '',
  email           text not null default '',
  validez         text not null default '15',
  logo            text,                                          -- data URI (base64) o ruta relativa
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id)
);

-- ---------- Estados del pipeline comercial ----------
do $$ begin
  create type estado_comercial as enum ('borrador', 'enviada', 'negociacion', 'ganada', 'perdida');
exception when duplicate_object then null; end $$;

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

-- Columnas del pipeline comercial y borrado lógico.
-- Se agregan por separado para que el esquema se pueda volver a correr sobre una base ya creada.
alter table public.proyectos add column if not exists estado_comercial estado_comercial not null default 'borrador';
alter table public.proyectos add column if not exists probabilidad smallint not null default 0;
alter table public.proyectos add column if not exists motivo_perdida text;
alter table public.proyectos add column if not exists fecha_envio timestamptz;
alter table public.proyectos add column if not exists fecha_cierre timestamptz;
alter table public.proyectos add column if not exists eliminado_en timestamptz;
alter table public.proyectos add column if not exists eliminado_por uuid references public.perfiles(id);

create index if not exists proyectos_pipeline_idx on public.proyectos (estado_comercial) where eliminado_en is null;
create index if not exists proyectos_papelera_idx on public.proyectos (eliminado_en desc) where eliminado_en is not null;

-- ---------- Revisiones congeladas de la propuesta ----------
-- Cada envío al cliente deja una copia inmutable del estado del proyecto,
-- para poder responder "¿cuál le mandamos?" seis meses después.
create table if not exists public.propuestas (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  revision    integer not null,
  etiqueta    text not null default '',
  nota        text,
  estado      jsonb not null,
  resumen     jsonb,                                  -- KPIs congelados: kWp, CAPEX, VAN, TIR, payback
  creado_por  uuid references public.perfiles(id) default auth.uid(),
  creado_en   timestamptz not null default now(),
  unique (proyecto_id, revision)
);
create index if not exists propuestas_proyecto_idx on public.propuestas (proyecto_id, revision desc);

-- ---------- Catálogo de equipos y lista de precios ----------
create table if not exists public.productos (
  id             uuid primary key default gen_random_uuid(),
  categoria      text not null,                       -- modulo, inversor, estructura, cableado, tablero, mano_obra, otro
  marca          text not null default '',
  modelo         text not null default '',
  descripcion    text not null default '',
  unidad         text not null default 'u.',
  precio_usd     numeric not null default 0,
  specs          jsonb not null default '{}'::jsonb,  -- Wp, Voc, Vmp, Isc, potencia AC, etc.
  activo         boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id)
);
create index if not exists productos_categoria_idx on public.productos (categoria) where activo;

-- ---------- Auditoría de cambios ----------
create table if not exists public.auditoria (
  id          bigserial primary key,
  tabla       text not null,
  registro_id text not null,
  accion      text not null,                          -- insert, update, delete, restaurar
  usuario_id  uuid references public.perfiles(id),
  detalle     jsonb,
  creado_en   timestamptz not null default now()
);
create index if not exists auditoria_registro_idx on public.auditoria (tabla, registro_id, creado_en desc);

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reg_id text;
  det jsonb;
begin
  if (tg_op = 'DELETE') then
    reg_id := old.id::text;
    det := jsonb_build_object('nombre', old.nombre);
  else
    reg_id := new.id::text;
    det := jsonb_build_object('nombre', new.nombre, 'kwp', new.kwp, 'estado_comercial', new.estado_comercial);
    -- Un borrado lógico se registra como tal, no como una edición más
    if (tg_op = 'UPDATE' and old.eliminado_en is null and new.eliminado_en is not null) then
      insert into public.auditoria (tabla, registro_id, accion, usuario_id, detalle)
      values ('proyectos', reg_id, 'papelera', auth.uid(), det);
      return new;
    end if;
    if (tg_op = 'UPDATE' and old.eliminado_en is not null and new.eliminado_en is null) then
      insert into public.auditoria (tabla, registro_id, accion, usuario_id, detalle)
      values ('proyectos', reg_id, 'restaurar', auth.uid(), det);
      return new;
    end if;
  end if;
  insert into public.auditoria (tabla, registro_id, accion, usuario_id, detalle)
  values ('proyectos', reg_id, lower(tg_op), auth.uid(), det);
  return coalesce(new, old);
end $$;

drop trigger if exists proyectos_auditoria on public.proyectos;
create trigger proyectos_auditoria after insert or update or delete on public.proyectos
  for each row execute function public.registrar_auditoria();

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

drop trigger if exists empresa_actualizado on public.empresa;
create trigger empresa_actualizado before update on public.empresa
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
alter table public.empresa        enable row level security;
alter table public.propuestas     enable row level security;
alter table public.productos      enable row level security;
alter table public.auditoria      enable row level security;

-- Perfiles
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated
  using (id = auth.uid() or public.esta_aprobado());
drop policy if exists perfiles_update_propio on public.perfiles;
create policy perfiles_update_propio on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin())
  with check (id = auth.uid() and rol = public.mi_rol() or public.es_admin());  -- solo admin cambia roles

-- Clientes
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes for select to authenticated using (public.esta_aprobado());
drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes for insert to authenticated with check (public.puede_editar());
drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes for update to authenticated using (public.puede_editar());
drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes for delete to authenticated using (public.es_admin());

-- Distribuidoras
drop policy if exists distribuidoras_select on public.distribuidoras;
create policy distribuidoras_select on public.distribuidoras for select to authenticated using (public.esta_aprobado());
drop policy if exists distribuidoras_admin on public.distribuidoras;
create policy distribuidoras_admin on public.distribuidoras for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Empresa (membrete): todo el equipo lo lee, solo un admin lo edita
drop policy if exists empresa_select on public.empresa;
create policy empresa_select on public.empresa for select to authenticated using (public.esta_aprobado());
drop policy if exists empresa_admin on public.empresa;
create policy empresa_admin on public.empresa for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Proyectos
drop policy if exists proyectos_select on public.proyectos;
create policy proyectos_select on public.proyectos for select to authenticated using (public.esta_aprobado());
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

-- Revisiones: las ve todo el equipo, las crea quien puede editar y nadie las modifica.
-- Una revisión congelada que se pueda editar no sirve para nada.
drop policy if exists propuestas_select on public.propuestas;
create policy propuestas_select on public.propuestas for select to authenticated using (public.esta_aprobado());
drop policy if exists propuestas_insert on public.propuestas;
create policy propuestas_insert on public.propuestas for insert to authenticated with check (public.puede_editar());
drop policy if exists propuestas_delete on public.propuestas;
create policy propuestas_delete on public.propuestas for delete to authenticated using (public.es_admin());

-- Catálogo y lista de precios: lo consulta todo el equipo, lo mantiene un admin
drop policy if exists productos_select on public.productos;
create policy productos_select on public.productos for select to authenticated using (public.esta_aprobado());
drop policy if exists productos_admin on public.productos;
create policy productos_admin on public.productos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Auditoría: se consulta, no se escribe a mano. El trigger inserta con security definer.
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated using (public.es_admin());

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

-- Fila única del membrete. Los datos de contacto quedan vacíos a propósito:
-- la app no deja imprimir una propuesta hasta que un admin los complete.
insert into public.empresa (id, nombre, slogan, asesor, tel, email, validez, logo)
values (true, 'ALP GROUP', 'Ingeniería y Desarrollo Fotovoltaico · Autoconsumo & Eficiencia', '', '', '', '15', 'img/logo.svg')
on conflict (id) do nothing;

-- Catálogo inicial con equipos habituales del mercado argentino.
-- Los precios son de referencia: actualizalos con los de tu proveedor.
insert into public.productos (categoria, marca, modelo, descripcion, unidad, precio_usd, specs) values
  ('modulo', 'Genérico', 'Monocristalino 575 Wp', 'Módulo bifacial N-Type 575 Wp', 'u.', 62,
   '{"wp":575,"voc":51.8,"vmp":43.4,"isc":14.05,"imp":13.25,"coef_voc":-0.25,"noct":45,"coef_pot":-0.35,"largo_m":2.278,"ancho_m":1.134,"peso_kg":28.5}'),
  ('modulo', 'Genérico', 'Monocristalino 450 Wp', 'Módulo monocristalino PERC 450 Wp', 'u.', 50,
   '{"wp":450,"voc":49.5,"vmp":41.2,"isc":11.4,"imp":10.9,"coef_voc":-0.27,"noct":45,"coef_pot":-0.35,"largo_m":2.094,"ancho_m":1.038,"peso_kg":23.5}'),
  ('inversor', 'Genérico', 'String trifásico 50 kW', 'Inversor de red trifásico 50 kW, 4 MPPT', 'u.', 2600,
   '{"potencia_ac":50,"v_max":1100,"v_min":200,"v_arranque":160,"mppt":4,"i_max_mppt":30,"eficiencia":98.4}'),
  ('inversor', 'Genérico', 'String trifásico 25 kW', 'Inversor de red trifásico 25 kW, 2 MPPT', 'u.', 1500,
   '{"potencia_ac":25,"v_max":1100,"v_min":200,"v_arranque":150,"mppt":2,"i_max_mppt":26,"eficiencia":98.3}'),
  ('inversor', 'Genérico', 'String monofásico 5 kW', 'Inversor de red monofásico 5 kW, 2 MPPT', 'u.', 520,
   '{"potencia_ac":5,"v_max":600,"v_min":80,"v_arranque":60,"mppt":2,"i_max_mppt":16,"eficiencia":97.6}'),
  ('bateria', 'Genérico', 'Banco LFP 10 kWh', 'Banco de litio LiFePO4 10 kWh con BMS', 'u.', 3800,
   '{"kwh":10,"dod":90,"eficiencia":94,"vida_anios":12,"c_rate":0.5}'),
  ('estructura', 'Genérico', 'Coplanar para chapa', 'Perfilería y grampas para cubierta de chapa', 'kWp', 45, '{}'),
  ('estructura', 'Genérico', 'Triangular para losa', 'Estructura inclinada con lastre para losa plana', 'kWp', 85, '{}'),
  ('estructura', 'Genérico', 'Hincada a tierra', 'Estructura hincada para montaje en suelo', 'kWp', 110, '{}'),
  ('cableado', 'Genérico', 'Conjunto CC y CA', 'Cable solar, conectores, canalización y puesta a tierra', 'kWp', 38, '{}'),
  ('tablero', 'Genérico', 'Tablero de protecciones', 'Tablero CC y CA con protecciones y seccionamiento', 'kWp', 32, '{}'),
  ('mano_obra', 'Genérico', 'Montaje e instalación', 'Mano de obra de montaje, conexionado y puesta en marcha', 'kWp', 95, '{}'),
  ('ingenieria', 'Genérico', 'Proyecto y tramitación', 'Ingeniería, planos, firma profesional y trámite de conexión', 'kWp', 45, '{}')
on conflict do nothing;

-- =============================================================================
--  Vistas útiles para listados y tableros
-- =============================================================================
create or replace view public.proyectos_lista as
  select p.id, p.legacy_id, p.cliente_id, c.nombre as cliente, p.nombre, p.kwp, p.resumen, p.enviado,
         p.estado_comercial, p.probabilidad, p.motivo_perdida, p.fecha_envio, p.fecha_cierre, p.eliminado_en,
         p.creado_por, pf.nombre as autor, p.creado_en, p.actualizado_en
  from public.proyectos p
  left join public.clientes c on c.id = p.cliente_id
  left join public.perfiles pf on pf.id = p.creado_por;

-- Embudo comercial: cuántos proyectos y cuántos kWp hay en cada etapa
create or replace view public.embudo as
  select estado_comercial,
         count(*)            as proyectos,
         coalesce(sum(kwp), 0) as kwp,
         coalesce(avg(probabilidad), 0) as probabilidad_media
  from public.proyectos
  where eliminado_en is null
  group by estado_comercial;
