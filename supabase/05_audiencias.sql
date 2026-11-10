-- =====================================================================
-- Calendario de audiencias con enlace de Google Meet
-- El enlace se guarda en una columna que el público no puede leer:
-- la consulta abierta ve la fecha y el tipo de audiencia, no el enlace.
-- Ejecute este archivo después de 04_preasignaciones.sql y regenere
-- 02_catalogo.sql para incluir el nuevo tipo de actuación.
-- =====================================================================

alter table public.actuaciones add column if not exists enlace_reunion text
  check (enlace_reunion is null or enlace_reunion ~ '^https://');

-- Inserción de actuaciones: ahora guarda el enlace de la reunión virtual
create or replace function public._insertar_actuacion(p_rad text, a jsonb, p_rol text)
returns public.actuaciones language plpgsql security definer set search_path = public as $$
declare
  pr public.procesos; t public.tipos_actuacion; n int; fila public.actuaciones;
  nueva_etapa text; o_nueva int; o_actual int; enlace text;
begin
  select * into pr from public.procesos where radicado = p_rad for update;
  if not found then raise exception 'El proceso % no existe', p_rad using errcode = 'P0001'; end if;
  if pr.estado = 'Terminado' and p_rol <> 'docente' then
    raise exception 'El proceso está terminado; solo el docente puede registrar actuaciones' using errcode = 'P0001';
  end if;
  select * into t from public.tipos_actuacion where k = a->>'tipo';
  if not found then raise exception 'Tipo de actuación no válido' using errcode = 'P0001'; end if;

  enlace := nullif(trim(a->>'enlace_reunion'), '');
  if enlace is not null and enlace !~ '^https://' then
    raise exception 'El enlace de la reunión debe iniciar con https://' using errcode = 'P0001';
  end if;

  n := pr.contador + 1;
  insert into public.actuaciones (
    codigo, radicado, numero, instancia, tipo, nombre, anotacion, rol, autor_id, firmante, fecha,
    termino_dias, termino_label, inicio_termino, fin_termino, fecha_estado, reservada,
    destinatarios, enlaces, audiencia, enlace_reunion)
  values (
    p_rad || '-' || lpad(n::text, 4, '0'), p_rad, n, pr.instancia, t.k, t.nombre,
    trim(a->>'anotacion'), p_rol, auth.uid(), trim(a->>'firmante'), (a->>'fecha')::date,
    nullif(a->>'termino_dias','')::int, nullif(a->>'termino_label',''),
    nullif(a->>'inicio_termino','')::date, nullif(a->>'fin_termino','')::date,
    case when p_rol in ('docente','juez','secretaria','magistrado') then nullif(a->>'fecha_estado','')::date else null end,
    coalesce((a->>'reservada')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(a->'destinatarios','[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(a->'enlaces','[]'::jsonb))), '{}'),
    case when jsonb_typeof(a->'audiencia') = 'object' then a->'audiencia' else null end,
    case when jsonb_typeof(a->'audiencia') = 'object' then enlace else null end)
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

-- El despacho puede actualizar el enlace o la sala de una audiencia ya fijada
-- (la fecha y la hora solo cambian mediante un nuevo auto)
create or replace function public.actualizar_audiencia(p_codigo text, p_enlace text, p_sala text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := nullif(trim(p_enlace), '');
begin
  if not public.es_despacho() then raise exception 'Solo el despacho actualiza los datos de la audiencia' using errcode = 'P0001'; end if;
  if e is not null and e !~ '^https://' then raise exception 'El enlace debe iniciar con https://' using errcode = 'P0001'; end if;
  update public.actuaciones
     set enlace_reunion = e,
         audiencia = jsonb_set(audiencia, '{lugar}', to_jsonb(coalesce(trim(p_sala), '')))
   where codigo = p_codigo and audiencia is not null;
  if not found then raise exception 'La actuación no fija una audiencia' using errcode = 'P0001'; end if;
end $$;
grant execute on function public.actualizar_audiencia(text, text, text) to authenticated;
revoke execute on function public.actualizar_audiencia(text, text, text) from anon;

-- Nuevo tipo de actuación para la segunda instancia
insert into public.tipos_actuacion (k, nombre, roles, etapa, instancia, termina, inicial, en_curso)
values ('auto_fija_sustentacion', 'Auto fija audiencia de sustentación y fallo', array['magistrado']::text[], 'segunda', null, false, false, true)
on conflict (k) do update set nombre = excluded.nombre, roles = excluded.roles, etapa = excluded.etapa;
