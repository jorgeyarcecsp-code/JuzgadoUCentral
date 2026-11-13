-- =====================================================================
-- Superusuario: el docente puede verificar cualquier perfil
-- El docente elige "Ver como" un rol y radica con los permisos exactos de
-- ese rol (el servidor los valida). La actuación queda registrada con el
-- rol simulado y marcada como realizada por el docente, para la trazabilidad.
-- Ejecute este archivo después de 05_audiencias.sql.
-- =====================================================================

alter table public.actuaciones add column if not exists actuado_por text;
grant select (actuado_por) on public.actuaciones to anon;

-- Rol con el que actúa la persona: el propio, o el simulado si es docente
create or replace function public._rol_efectivo(p_como text)
returns text language plpgsql stable security definer set search_path = public as $$
declare r text := public.mi_rol();
begin
  if r = 'docente' and coalesce(p_como, '') in ('juez','secretaria','magistrado','demandante','demandado','perito') then
    return p_como;
  end if;
  return r;
end $$;
revoke all on function public._rol_efectivo(text) from public, anon, authenticated;

create or replace function public.radicar_inicial(p jsonb)
returns public.actuaciones language plpgsql security definer set search_path = public as $$
declare r text := public._rol_efectivo(p->>'como_rol'); simulado boolean := public.mi_rol() = 'docente' and r <> 'docente';
  t public.tipos_actuacion; v_anio int; n int; rad text; fila public.actuaciones;
begin
  if r is null or r = 'observador' then raise exception 'Su cuenta no tiene un rol habilitado para radicar' using errcode = 'P0001'; end if;
  select * into t from public.tipos_actuacion where k = p->>'tipo' and inicial;
  if not found then raise exception 'Tipo de escrito inicial no válido' using errcode = 'P0001'; end if;
  if not (r = any (t.roles) or r in ('docente','juez','secretaria')) then
    raise exception 'El rol % no puede radicar este escrito', r using errcode = 'P0001';
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
  if simulado then
    update public.actuaciones set actuado_por = 'docente' where codigo = fila.codigo returning * into fila;
  end if;
  return fila;
end $$;

create or replace function public.radicar_actuacion(p_radicado text, a jsonb)
returns public.actuaciones language plpgsql security definer set search_path = public as $$
declare r text := public._rol_efectivo(a->>'como_rol'); simulado boolean := public.mi_rol() = 'docente' and r <> 'docente';
  t public.tipos_actuacion; fila public.actuaciones;
begin
  if r is null or r = 'observador' then raise exception 'Su cuenta no tiene un rol habilitado para radicar' using errcode = 'P0001'; end if;
  select * into t from public.tipos_actuacion where k = a->>'tipo' and en_curso;
  if not found then raise exception 'Tipo de actuación no válido' using errcode = 'P0001'; end if;
  if r <> 'docente' and not (r = any (t.roles)) then
    raise exception 'El rol % no puede radicar “%”', r, t.nombre using errcode = 'P0001';
  end if;
  fila := public._insertar_actuacion(p_radicado, a, r);
  if simulado then
    update public.actuaciones set actuado_por = 'docente' where codigo = fila.codigo returning * into fila;
  end if;
  return fila;
end $$;

grant execute on function public.radicar_inicial(jsonb), public.radicar_actuacion(text, jsonb) to authenticated;
revoke execute on function public.radicar_inicial(jsonb), public.radicar_actuacion(text, jsonb) from anon;
