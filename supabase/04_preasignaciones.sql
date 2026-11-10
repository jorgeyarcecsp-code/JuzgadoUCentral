-- =====================================================================
-- Roles preasignados por correo institucional
-- El docente registra el correo y el rol antes de que el estudiante cree
-- su usuario; al registrarse, la cuenta recibe ese rol automáticamente.
-- Ejecute este archivo después de 01_esquema.sql.
-- =====================================================================

create table if not exists public.roles_preasignados (
  correo  text primary key check (correo = lower(correo)),
  rol     text not null check (rol in ('docente','juez','secretaria','magistrado','demandante','demandado','perito','observador')),
  nombre  text,
  creado  timestamptz not null default now()
);
alter table public.roles_preasignados enable row level security;
revoke all on public.roles_preasignados from anon, authenticated;
grant select on public.roles_preasignados to authenticated;
drop policy if exists preasignados_docente on public.roles_preasignados;
create policy preasignados_docente on public.roles_preasignados for select to authenticated using (public.es_docente());

-- El perfil toma el rol preasignado al momento del registro
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare adm text; meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); pre public.roles_preasignados;
begin
  select correo_admin into adm from public.ajustes where id = 1;
  if coalesce(meta->>'autoriza_datos','') = '' then
    raise exception 'Se requiere la autorización de tratamiento de datos personales' using errcode = 'P0001';
  end if;
  select * into pre from public.roles_preasignados where correo = lower(new.email);
  insert into public.perfiles (id, correo, nombre, grupo, rol_solicitado, rol, autoriza_datos)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(meta->>'nombre'),''), pre.nombre, split_part(new.email,'@',1)),
    nullif(trim(meta->>'grupo'),''),
    nullif(meta->>'rol_solicitado',''),
    case when lower(new.email) = lower(adm) then 'docente' else pre.rol end,
    (meta->>'autoriza_datos')::timestamptz
  );
  return new;
end $$;

-- Preasigna (o cambia) el rol de un correo; si la cuenta ya existe, lo aplica de inmediato
create or replace function public.preasignar_rol(p_correo text, p_rol text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare dom text; c text := lower(trim(p_correo));
begin
  if not public.es_docente() then raise exception 'Solo el docente preasigna roles' using errcode = 'P0001'; end if;
  select dominio into dom from public.ajustes where id = 1;
  if c not like '%@' || lower(dom) then raise exception 'El correo debe ser institucional @%', dom using errcode = 'P0001'; end if;
  if p_rol not in ('docente','juez','secretaria','magistrado','demandante','demandado','perito','observador') then
    raise exception 'Rol no válido' using errcode = 'P0001'; end if;
  insert into public.roles_preasignados (correo, rol, nombre) values (c, p_rol, nullif(trim(p_nombre),''))
    on conflict (correo) do update set rol = excluded.rol, nombre = coalesce(excluded.nombre, public.roles_preasignados.nombre);
  update public.perfiles set rol = p_rol where correo = c and id <> auth.uid();
end $$;

create or replace function public.quitar_preasignacion(p_correo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_docente() then raise exception 'Solo el docente modifica las preasignaciones' using errcode = 'P0001'; end if;
  delete from public.roles_preasignados where correo = lower(trim(p_correo));
end $$;

grant execute on function public.preasignar_rol(text, text, text), public.quitar_preasignacion(text) to authenticated;
revoke execute on function public.preasignar_rol(text, text, text), public.quitar_preasignacion(text) from anon;
