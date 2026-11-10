-- =====================================================================
-- Sala Virtual de Litigio Simulado
-- Consultorio Jurídico, Universidad Central
-- Esquema de base de datos para Supabase (PostgreSQL)
--
-- Ejecute este archivo completo en Supabase > SQL Editor.
-- Luego ejecute 02_catalogo.sql y, si lo desea, 03_ejemplo.sql.
--
-- Antes de ejecutarlo, revise los dos valores de la sección 1:
-- el dominio institucional y el correo del docente administrador.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Configuración general
-- ---------------------------------------------------------------------
create table if not exists public.ajustes (
  id            int primary key default 1 check (id = 1),
  dominio       text not null default 'ucentral.edu.co',
  correo_admin  text not null default 'jyarcet@ucentral.edu.co',
  despacho1     text not null default 'Despacho simulado de propiedad industrial, primera instancia',
  juez          text,
  despacho2     text not null default 'Sala Civil simulada, segunda instancia',
  magistrado    text,
  vacancia      boolean not null default false,
  actualizado   timestamptz not null default now()
);
insert into public.ajustes (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Perfiles de usuario (uno por cuenta de Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  correo          text not null unique,
  nombre          text not null check (length(trim(nombre)) > 2),
  grupo           text,
  rol_solicitado  text,
  rol             text check (rol in ('docente','juez','secretaria','magistrado','demandante','demandado','perito','observador')),
  autoriza_datos  timestamptz not null,
  creado          timestamptz not null default now()
);

-- Bloquea el registro con correos ajenos al dominio institucional
create or replace function public.validar_dominio()
returns trigger language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  select dominio into dom from public.ajustes where id = 1;
  if new.email is null or lower(new.email) not like '%@' || lower(dom) then
    raise exception 'Solo se admiten correos institucionales @%', dom using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists antes_de_crear_usuario on auth.users;
create trigger antes_de_crear_usuario
  before insert on auth.users
  for each row execute function public.validar_dominio();

-- Crea el perfil a partir de los datos del formulario de registro
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare adm text; meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  select correo_admin into adm from public.ajustes where id = 1;
  if coalesce(meta->>'autoriza_datos','') = '' then
    raise exception 'Se requiere la autorización de tratamiento de datos personales' using errcode = 'P0001';
  end if;
  insert into public.perfiles (id, correo, nombre, grupo, rol_solicitado, rol, autoriza_datos)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(meta->>'nombre'),''), split_part(new.email,'@',1)),
    nullif(trim(meta->>'grupo'),''),
    nullif(meta->>'rol_solicitado',''),
    case when lower(new.email) = lower(adm) then 'docente' else null end,
    (meta->>'autoriza_datos')::timestamptz
  );
  return new;
end $$;

drop trigger if exists despues_de_crear_usuario on auth.users;
create trigger despues_de_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Funciones de apoyo para las reglas de acceso
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;
create or replace function public.es_docente()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'docente', false)
$$;
create or replace function public.es_despacho()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() in ('docente','juez','secretaria','magistrado'), false)
$$;

-- ---------------------------------------------------------------------
-- 3. Catálogos (se llenan con 02_catalogo.sql)
-- ---------------------------------------------------------------------
create table if not exists public.etapas (
  k      text primary key,
  orden  int not null unique,
  nombre text not null
);

create table if not exists public.tipos_actuacion (
  k          text primary key,
  nombre     text not null,
  roles      text[] not null,
  etapa      text references public.etapas (k),
  instancia  int,
  termina    boolean not null default false,
  inicial    boolean not null default false,
  en_curso   boolean not null default true
);

-- ---------------------------------------------------------------------
-- 4. Procesos, actuaciones y documentos
-- ---------------------------------------------------------------------
create table if not exists public.contadores (
  anio   int primary key,
  ultimo int not null default 0
);

create table if not exists public.procesos (
  radicado          text primary key check (radicado ~ '^[0-9]{23}$'),
  anio              int not null,
  consecutivo       int not null,
  clase_key         text not null,
  clase             text not null,
  instancia         int not null default 1 check (instancia in (1,2)),
  etapa             text not null references public.etapas (k),
  estado            text not null default 'Activo' check (estado in ('Activo','Terminado')),
  fecha_radicacion  date not null,
  ultima_actuacion  date,
  contador          int not null default 0,
  sujetos           jsonb not null default '[]'::jsonb,
  marca             jsonb not null default '{}'::jsonb,
  cuantia           text,
  contenido         text,
  ejemplo           boolean not null default false,
  creado_por        uuid references auth.users (id) on delete set null,
  creado            timestamptz not null default now(),
  unique (anio, consecutivo)
);

create table if not exists public.actuaciones (
  codigo            text primary key,
  radicado          text not null references public.procesos (radicado) on delete cascade,
  numero            int not null,
  instancia         int not null,
  tipo              text not null references public.tipos_actuacion (k),
  nombre            text not null,
  anotacion         text not null check (length(trim(anotacion)) > 0),
  rol               text not null,
  autor_id          uuid references auth.users (id) on delete set null,
  firmante          text not null check (length(trim(firmante)) > 0),
  fecha             date not null,
  registrado        timestamptz not null default now(),
  termino_dias      int,
  termino_label     text,
  inicio_termino    date,
  fin_termino       date,
  fecha_estado      date,
  reservada         boolean not null default false,
  destinatarios     text[] not null default '{}',
  enlaces           text[] not null default '{}',
  audiencia         jsonb,
  anulada           boolean not null default false,
  motivo_anulacion  text,
  unique (radicado, numero)
);
create index if not exists actuaciones_radicado_idx on public.actuaciones (radicado);
create index if not exists actuaciones_estado_idx on public.actuaciones (fecha_estado);

create table if not exists public.documentos (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null references public.actuaciones (codigo) on delete cascade,
  radicado    text not null references public.procesos (radicado) on delete cascade,
  nombre      text not null,
  ruta        text not null unique,
  tamano      bigint,
  tipo        text,
  sha256      text,
  subido_por  uuid default auth.uid() references auth.users (id) on delete set null,
  creado      timestamptz not null default now()
);
create index if not exists documentos_radicado_idx on public.documentos (radicado);

-- ---------------------------------------------------------------------
-- 5. Radicación: numeración consecutiva y control de roles en el servidor
-- ---------------------------------------------------------------------
create or replace function public._insertar_actuacion(p_rad text, a jsonb, p_rol text)
returns public.actuaciones language plpgsql security definer set search_path = public as $$
declare
  pr public.procesos; t public.tipos_actuacion; n int; fila public.actuaciones;
  nueva_etapa text; o_nueva int; o_actual int;
begin
  select * into pr from public.procesos where radicado = p_rad for update;
  if not found then raise exception 'El proceso % no existe', p_rad using errcode = 'P0001'; end if;
  if pr.estado = 'Terminado' and p_rol <> 'docente' then
    raise exception 'El proceso está terminado; solo el docente puede registrar actuaciones' using errcode = 'P0001';
  end if;
  select * into t from public.tipos_actuacion where k = a->>'tipo';
  if not found then raise exception 'Tipo de actuación no válido' using errcode = 'P0001'; end if;

  n := pr.contador + 1;
  insert into public.actuaciones (
    codigo, radicado, numero, instancia, tipo, nombre, anotacion, rol, autor_id, firmante, fecha,
    termino_dias, termino_label, inicio_termino, fin_termino, fecha_estado, reservada,
    destinatarios, enlaces, audiencia)
  values (
    p_rad || '-' || lpad(n::text, 4, '0'), p_rad, n, pr.instancia, t.k, t.nombre,
    trim(a->>'anotacion'), p_rol, auth.uid(), trim(a->>'firmante'), (a->>'fecha')::date,
    nullif(a->>'termino_dias','')::int, nullif(a->>'termino_label',''),
    nullif(a->>'inicio_termino','')::date, nullif(a->>'fin_termino','')::date,
    case when p_rol in ('docente','juez','secretaria','magistrado') then nullif(a->>'fecha_estado','')::date else null end,
    coalesce((a->>'reservada')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(a->'destinatarios','[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(a->'enlaces','[]'::jsonb))), '{}'),
    case when jsonb_typeof(a->'audiencia') = 'object' then a->'audiencia' else null end)
  returning * into fila;

  nueva_etapa := pr.etapa;
  if t.etapa is not null then
    select orden into o_nueva from public.etapas where k = t.etapa;
    select orden into o_actual from public.etapas where k = pr.etapa;
    if o_nueva > o_actual then nueva_etapa := t.etapa; end if;
  end if;

  update public.procesos set
    contador = n,
    ultima_actuacion = greatest(coalesce(ultima_actuacion, fila.fecha), fila.fecha),
    etapa = nueva_etapa,
    instancia = coalesce(t.instancia, instancia),
    estado = case when t.termina then 'Terminado' else estado end
  where radicado = p_rad;

  return fila;
end $$;
revoke all on function public._insertar_actuacion(text, jsonb, text) from public, anon, authenticated;

-- Escrito inicial: asigna radicado de 23 dígitos y registra la actuación 0001
create or replace function public.radicar_inicial(p jsonb)
returns public.actuaciones language plpgsql security definer set search_path = public as $$
declare r text := public.mi_rol(); t public.tipos_actuacion; v_anio int; n int; rad text; fila public.actuaciones;
begin
  if r is null or r = 'observador' then raise exception 'Su cuenta no tiene un rol habilitado para radicar' using errcode = 'P0001'; end if;
  select * into t from public.tipos_actuacion where k = p->>'tipo' and inicial;
  if not found then raise exception 'Tipo de escrito inicial no válido' using errcode = 'P0001'; end if;
  if not (r = any (t.roles) or r in ('docente','juez','secretaria')) then
    raise exception 'Su rol no permite radicar este escrito' using errcode = 'P0001';
  end if;
  if coalesce(trim(p->'marca'->>'signo'),'') = '' or jsonb_array_length(coalesce(p->'sujetos','[]'::jsonb)) < 2 then
    raise exception 'Faltan los sujetos procesales o la marca' using errcode = 'P0001';
  end if;

  v_anio := extract(year from (p->>'fecha')::date);
  insert into public.contadores (anio, ultimo) values (v_anio, 1)
    on conflict (anio) do update set ultimo = public.contadores.ultimo + 1
    returning ultimo into n;
  rad := '11001' || '99' || '89' || '001' || v_anio::text || lpad(n::text, 5, '0') || '00';

  insert into public.procesos (radicado, anio, consecutivo, clase_key, clase, instancia, etapa, estado,
    fecha_radicacion, ultima_actuacion, contador, sujetos, marca, cuantia, contenido, creado_por)
  values (rad, v_anio, n, t.k,
    case when t.k = 'mc_previas' then 'Medidas cautelares previas por infracción marcaria'
         else 'Verbal: infracción de derechos de propiedad industrial (marca)' end,
    1, t.etapa, 'Activo', (p->>'fecha')::date, (p->>'fecha')::date, 0,
    p->'sujetos', coalesce(p->'marca','{}'::jsonb), nullif(p->>'cuantia',''), nullif(p->>'anotacion',''), auth.uid());

  fila := public._insertar_actuacion(rad, p, r);
  return fila;
end $$;

-- Actuación en un proceso existente
create or replace function public.radicar_actuacion(p_radicado text, a jsonb)
returns public.actuaciones language plpgsql security definer set search_path = public as $$
declare r text := public.mi_rol(); t public.tipos_actuacion;
begin
  if r is null or r = 'observador' then raise exception 'Su cuenta no tiene un rol habilitado para radicar' using errcode = 'P0001'; end if;
  select * into t from public.tipos_actuacion where k = a->>'tipo' and en_curso;
  if not found then raise exception 'Tipo de actuación no válido' using errcode = 'P0001'; end if;
  if r <> 'docente' and not (r = any (t.roles)) then
    raise exception 'El rol % no puede radicar “%”', r, t.nombre using errcode = 'P0001';
  end if;
  return public._insertar_actuacion(p_radicado, a, r);
end $$;

create or replace function public.anular_actuacion(p_codigo text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.mi_rol(),'') not in ('docente','juez','magistrado') then
    raise exception 'Solo el juez, el magistrado o el docente anulan actuaciones' using errcode = 'P0001'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Indique el motivo de la anulación' using errcode = 'P0001'; end if;
  update public.actuaciones set anulada = true,
    motivo_anulacion = trim(p_motivo) || ' (' || to_char(now() at time zone 'America/Bogota','YYYY-MM-DD HH24:MI') || ')'
  where codigo = p_codigo;
end $$;

create or replace function public.levantar_reserva(p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_despacho() then raise exception 'Solo el despacho levanta la reserva' using errcode = 'P0001'; end if;
  update public.actuaciones set reservada = false where codigo = p_codigo;
end $$;

create or replace function public.cambiar_etapa(p_radicado text, p_etapa text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_despacho() then raise exception 'Solo el despacho cambia la etapa' using errcode = 'P0001'; end if;
  update public.procesos set etapa = p_etapa,
    estado = case when p_etapa = 'terminado' then 'Terminado' else 'Activo' end
  where radicado = p_radicado;
end $$;

create or replace function public.asignar_rol(p_usuario uuid, p_rol text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_docente() then raise exception 'Solo el docente asigna roles' using errcode = 'P0001'; end if;
  if p_usuario = auth.uid() and coalesce(p_rol,'') <> 'docente' then
    raise exception 'No puede retirarse a sí mismo el rol de docente' using errcode = 'P0001'; end if;
  update public.perfiles set rol = nullif(p_rol,'') where id = p_usuario;
end $$;

create or replace function public.actualizar_mi_perfil(p_nombre text, p_grupo text, p_rol_solicitado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.perfiles set nombre = trim(p_nombre), grupo = nullif(trim(p_grupo),''),
    rol_solicitado = nullif(p_rol_solicitado,'')
  where id = auth.uid();
end $$;

grant execute on function public.radicar_inicial(jsonb), public.radicar_actuacion(text, jsonb),
  public.anular_actuacion(text, text), public.levantar_reserva(text), public.cambiar_etapa(text, text),
  public.asignar_rol(uuid, text), public.actualizar_mi_perfil(text, text, text) to authenticated;
revoke execute on function public.radicar_inicial(jsonb), public.radicar_actuacion(text, jsonb),
  public.anular_actuacion(text, text), public.levantar_reserva(text), public.cambiar_etapa(text, text),
  public.asignar_rol(uuid, text), public.actualizar_mi_perfil(text, text, text) from anon;

-- ---------------------------------------------------------------------
-- 6. Reglas de acceso (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.ajustes          enable row level security;
alter table public.perfiles         enable row level security;
alter table public.etapas           enable row level security;
alter table public.tipos_actuacion  enable row level security;
alter table public.contadores       enable row level security;
alter table public.procesos         enable row level security;
alter table public.actuaciones      enable row level security;
alter table public.documentos       enable row level security;

-- Ninguna escritura directa: todo pasa por las funciones de la sección 5
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant insert on public.documentos to authenticated;
grant update (despacho1, juez, despacho2, magistrado, vacancia, actualizado) on public.ajustes to authenticated;

-- El correo del administrador no se expone: se leen solo los datos del despacho simulado
revoke select on public.ajustes from anon, authenticated;
grant select (id, dominio, despacho1, juez, despacho2, magistrado, vacancia) on public.ajustes to anon, authenticated;

-- Consulta pública sin registro: procesos y actuaciones, sin datos de autoría
revoke select on public.procesos, public.actuaciones, public.perfiles, public.documentos, public.contadores from anon;
grant select (radicado, anio, consecutivo, clase_key, clase, instancia, etapa, estado, fecha_radicacion,
  ultima_actuacion, contador, sujetos, marca, cuantia, contenido, ejemplo) on public.procesos to anon;
grant select (codigo, radicado, numero, instancia, tipo, nombre, anotacion, rol, fecha, registrado,
  termino_dias, termino_label, inicio_termino, fin_termino, fecha_estado, reservada, audiencia,
  anulada, motivo_anulacion) on public.actuaciones to anon;
grant select on public.procesos, public.actuaciones, public.documentos, public.perfiles to authenticated;

drop policy if exists ajustes_lectura on public.ajustes;
create policy ajustes_lectura on public.ajustes for select to anon, authenticated using (true);
drop policy if exists ajustes_docente on public.ajustes;
create policy ajustes_docente on public.ajustes for update to authenticated using (public.es_docente()) with check (public.es_docente());

drop policy if exists catalogo_etapas on public.etapas;
create policy catalogo_etapas on public.etapas for select to anon, authenticated using (true);
drop policy if exists catalogo_tipos on public.tipos_actuacion;
create policy catalogo_tipos on public.tipos_actuacion for select to anon, authenticated using (true);

drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_docente());

drop policy if exists procesos_lectura on public.procesos;
create policy procesos_lectura on public.procesos for select to anon, authenticated using (true);

drop policy if exists actuaciones_publicas on public.actuaciones;
create policy actuaciones_publicas on public.actuaciones for select to anon using (not reservada);
drop policy if exists actuaciones_usuarios on public.actuaciones;
create policy actuaciones_usuarios on public.actuaciones for select to authenticated
  using (not reservada or public.es_despacho() or autor_id = auth.uid() or rol = public.mi_rol());

-- Documentos: solo usuarios registrados con rol asignado
drop policy if exists documentos_lectura on public.documentos;
create policy documentos_lectura on public.documentos for select to authenticated
  using (public.mi_rol() is not null
         and exists (select 1 from public.actuaciones a where a.codigo = documentos.codigo));
drop policy if exists documentos_carga on public.documentos;
create policy documentos_carga on public.documentos for insert to authenticated
  with check (subido_por = auth.uid()
              and exists (select 1 from public.actuaciones a
                          where a.codigo = documentos.codigo and a.radicado = documentos.radicado
                            and a.autor_id = auth.uid())
              and ruta like documentos.radicado || '/' || documentos.codigo || '/%');

-- ---------------------------------------------------------------------
-- 7. Almacenamiento de archivos (bucket privado, 20 MB, PDF, imagen o texto)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expedientes', 'expedientes', false, 20971520,
        array['application/pdf','image/png','image/jpeg','image/webp','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expedientes_carga on storage.objects;
create policy expedientes_carga on storage.objects for insert to authenticated
  with check (bucket_id = 'expedientes'
              and exists (select 1 from public.actuaciones a
                          where a.codigo = (storage.foldername(name))[2] and a.autor_id = auth.uid()));
drop policy if exists expedientes_lectura on storage.objects;
create policy expedientes_lectura on storage.objects for select to authenticated
  using (bucket_id = 'expedientes'
         and exists (select 1 from public.documentos d where d.ruta = storage.objects.name));
