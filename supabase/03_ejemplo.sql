-- Proceso de ejemplo (opcional). Datos ficticios para mostrar la plataforma en clase.
-- El docente puede declararlo terminado desde el expediente cuando inicie la simulación real.
begin;
insert into public.contadores (anio, ultimo) values (2026, 1)
  on conflict (anio) do update set ultimo = greatest(public.contadores.ultimo, 1);

insert into public.procesos (radicado, anio, consecutivo, clase_key, clase, instancia, etapa, estado,
  fecha_radicacion, ultima_actuacion, contador, sujetos, marca, cuantia, contenido, ejemplo)
values ('11001998900120260000100', 2026, 1, 'demanda',
  'Verbal: infracción de derechos de propiedad industrial (marca)', 1, 'contestacion', 'Activo',
  '2026-11-03', '2026-11-09', 4,
  '[{"tipo":"Demandante","nombre":"Café Cumbre Andina S.A.S.","id":"NIT ficticio 900000001","apoderado":"Equipo A"},
    {"tipo":"Demandado","nombre":"Distribuidora Cumbres del Café Ltda.","id":"NIT ficticio 900000002","apoderado":"Equipo B"}]'::jsonb,
  '{"signo":"CUMBRE ANDINA","tipo":"Mixta","registro":"Certificado ficticio 000001","clases":"30","cuestionado":"CUMBRES DEL CAFÉ","productos":"Café, café molido y bebidas a base de café"}'::jsonb,
  'Cien millones de pesos ($100 000 000)',
  'Demanda por uso no autorizado de un signo similarmente confundible (Decisión 486 de 2000, art. 155, lit. d).',
  true)
on conflict (radicado) do nothing;

insert into public.actuaciones (codigo, radicado, numero, instancia, tipo, nombre, anotacion, rol, firmante, fecha,
  registrado, termino_dias, termino_label, inicio_termino, fin_termino, fecha_estado, destinatarios)
values
 ('11001998900120260000100-0001','11001998900120260000100',1,1,'demanda',
  'Demanda verbal por infracción de derechos de propiedad industrial (marca)',
  'Radicación de demanda por el uso del signo CUMBRES DEL CAFÉ para café (clase 30). Pretensiones de cese, retiro de productos e indemnización con juramento estimatorio (Decisión 486 de 2000, arts. 241 y 243; CGP, art. 206).',
  'demandante','Equipo A','2026-11-03','2026-11-03 10:00-05',null,null,null,null,null,array['juez','secretaria']),
 ('11001998900120260000100-0002','11001998900120260000100',2,1,'informe','Informe secretarial al despacho',
  'Al despacho la demanda para su calificación.','secretaria','Secretaría','2026-11-04','2026-11-04 10:00-05',null,null,null,null,null,array['juez']),
 ('11001998900120260000100-0003','11001998900120260000100',3,1,'auto_admite','Auto admite demanda',
  'Admite la demanda, ordena notificar personalmente al demandado y correr traslado por veinte días. Reconoce personería al apoderado de la parte demandante.',
  'juez','Juez','2026-11-05','2026-11-05 10:00-05',null,null,null,null,'2026-11-06',array['demandante','demandado']),
 ('11001998900120260000100-0004','11001998900120260000100',4,1,'notif_envio',
  'Constancia de notificación personal por mensaje de datos',
  'Envío del auto admisorio, la demanda y sus anexos al correo de notificaciones judiciales del demandado.',
  'demandante','Equipo A','2026-11-09','2026-11-09 10:00-05',20,'Traslado de la demanda','2026-11-12','2026-12-11',null,array['demandado','juez'])
on conflict (codigo) do nothing;
commit;
