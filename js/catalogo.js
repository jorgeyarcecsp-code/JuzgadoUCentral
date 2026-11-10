/* Catálogo procesal y cómputo de términos.
   Fuente única: el script supabase/generar_catalogo.js produce a partir de este archivo
   la tabla de tipos de actuación que el servidor usa para validar roles y etapas. */
(function (root) {
  const P = ['demandante', 'demandado'];

  const ROLES = {
    docente: 'Docente (administración)',
    juez: 'Juez de primera instancia',
    secretaria: 'Secretaría del despacho',
    magistrado: 'Magistrado ponente, segunda instancia',
    demandante: 'Apoderado parte demandante',
    demandado: 'Apoderado parte demandada',
    perito: 'Perito',
    observador: 'Observador'
  };
  const DESPACHO = ['juez', 'secretaria', 'magistrado', 'docente'];

  const ETAPAS = [
    { k: 'cautelares_previas', n: 'Medidas cautelares previas', norma: 'Decisión 486 de 2000, arts. 245 a 249', q: 'Demandante y juez', t: 'Opcional. Pueden pedirse antes de iniciar la acción, con ella o después (art. 245). Se decretan si se acreditan la legitimación, la existencia del derecho y pruebas que permitan presumir razonablemente la infracción o su inminencia (art. 247).' },
    { k: 'calificacion', n: 'Demanda y calificación', norma: 'CGP, arts. 82, 84, 90 y 368; Decisión 486 de 2000, arts. 155, 238, 241 y 244', q: 'Demandante, secretaría y juez', t: 'El juez admite, inadmite (cinco días para subsanar) o rechaza. La acción prescribe a los dos años contados desde que el titular conoció la infracción o a los cinco años desde la última comisión (art. 244).' },
    { k: 'notificacion', n: 'Notificación del auto admisorio', norma: 'CGP, arts. 291 y 292; Ley 2213 de 2022, art. 8', q: 'Demandante y secretaría', t: 'Por mensaje de datos, la notificación se entiende surtida dos días hábiles después del envío y el término corre desde el día siguiente.' },
    { k: 'contestacion', n: 'Contestación y excepciones', norma: 'CGP, arts. 96, 100, 101, 206 y 369', q: 'Demandado', t: 'Traslado de veinte días. Las excepciones previas se proponen en escrito separado; procede la objeción al juramento estimatorio.' },
    { k: 'traslado_excepciones', n: 'Traslado de excepciones', norma: 'CGP, arts. 101, 110 y 370', q: 'Secretaría y demandante', t: 'Excepciones de mérito: cinco días. Excepciones previas: tres días.' },
    { k: 'audiencia_inicial', n: 'Audiencia inicial', norma: 'CGP, art. 372', q: 'Juez y partes', t: 'Conciliación, interrogatorios de parte, fijación del litigio, control de legalidad y decreto de pruebas.' },
    { k: 'instruccion', n: 'Instrucción y juzgamiento', norma: 'CGP, art. 373', q: 'Juez, partes y perito', t: 'Práctica de pruebas, alegatos hasta por veinte minutos por parte y sentencia.' },
    { k: 'sentencia1', n: 'Sentencia de primera instancia', norma: 'CGP, arts. 280, 294 y 373; Decisión 486 de 2000, arts. 155, 241 y 243', q: 'Juez', t: 'La apelación se interpone en la audiencia; los reparos concretos, dentro de los tres días siguientes (CGP, art. 322, num. 3).' },
    { k: 'apelacion', n: 'Concesión de la apelación', norma: 'CGP, arts. 322, 323 y 324', q: 'Juez y secretaría', t: 'El juez concede el recurso y la secretaría remite el expediente al superior.' },
    { k: 'segunda', n: 'Segunda instancia', norma: 'CGP, arts. 325 a 328; Ley 2213 de 2022, art. 12', q: 'Magistrado y partes', t: 'Ejecutoriado el auto que admite la apelación, el apelante sustenta dentro de los cinco días siguientes; traslado al no recurrente por cinco días.' },
    { k: 'ip', n: 'Interpretación prejudicial', norma: 'Tratado de Creación del TJCA, art. 33; Estatuto del TJCA (Decisión 500), arts. 123, 127 y 128', q: 'Magistrado', t: 'Obligatoria para el juez de última instancia que aplica la Decisión 486, salvo acto aclarado; el juez debe adoptar la interpretación.' },
    { k: 'sentencia2', n: 'Sentencia de segunda instancia', norma: 'CGP, art. 328; Ley 2213 de 2022, art. 12', q: 'Magistrado', t: 'Sentencia escrita, notificada por estado.' },
    { k: 'casacion', n: 'Casación', norma: 'CGP, arts. 333 a 338', q: 'Partes y magistrado', t: 'Procede según el interés para recurrir (CGP, art. 338).' },
    { k: 'terminado', n: 'Terminado', norma: 'CGP, arts. 302 y 329', q: 'Juez', t: 'Ejecutoria, obedecimiento a lo resuelto por el superior y archivo.' }
  ];

  const INICIALES = [
    { k: 'demanda', n: 'Demanda verbal por infracción de derechos de propiedad industrial (marca)', r: ['demandante'], norma: 'CGP, arts. 82, 84 y 368; Decisión 486 de 2000, arts. 155, 238 y 241', et: 'calificacion' },
    { k: 'mc_previas', n: 'Solicitud de medidas cautelares previas a la demanda', r: ['demandante'], norma: 'Decisión 486 de 2000, arts. 245 a 247', et: 'cautelares_previas', res: true }
  ];

  const TYPES = [
    { k: 'demanda', n: 'Demanda (en trámite iniciado con medidas previas)', g: 'Escritos de la parte demandante', r: ['demandante'], norma: 'CGP, arts. 82, 84 y 368; Decisión 486 de 2000, arts. 238 y 241', et: 'calificacion' },
    { k: 'subsanacion', n: 'Escrito de subsanación de la demanda', g: 'Escritos de la parte demandante', r: ['demandante'], norma: 'CGP, art. 90' },
    { k: 'reforma', n: 'Reforma de la demanda', g: 'Escritos de la parte demandante', r: ['demandante'], norma: 'CGP, art. 93' },
    { k: 'notif_envio', n: 'Constancia de notificación personal por mensaje de datos', g: 'Escritos de la parte demandante', r: ['demandante', 'secretaria'], norma: 'CGP, art. 291; Ley 2213 de 2022, art. 8', d: 20, off: 2, tl: 'Traslado de la demanda', et: 'contestacion', ayuda: 'La notificación se entiende surtida dos días hábiles después del envío y el traslado de veinte días corre desde el día siguiente (Ley 2213 de 2022, art. 8; CGP, art. 369). Registre como fecha de la actuación la del envío.' },
    { k: 'mc_solicitud', n: 'Solicitud de medidas cautelares', g: 'Escritos de la parte demandante', r: ['demandante'], norma: 'Decisión 486 de 2000, arts. 245 a 247', res: true },
    { k: 'pronunc_merito', n: 'Pronunciamiento sobre excepciones de mérito', g: 'Escritos de la parte demandante', r: ['demandante'], norma: 'CGP, art. 370' },
    { k: 'pronunc_previas', n: 'Pronunciamiento sobre excepciones previas', g: 'Escritos de la parte demandante', r: ['demandante'], norma: 'CGP, art. 101' },
    { k: 'contestacion', n: 'Contestación de la demanda', g: 'Escritos de la parte demandada', r: ['demandado'], norma: 'CGP, arts. 96 y 369', et: 'traslado_excepciones' },
    { k: 'excep_previas', n: 'Excepciones previas', g: 'Escritos de la parte demandada', r: ['demandado'], norma: 'CGP, arts. 100 y 101' },
    { k: 'objecion_jur', n: 'Objeción al juramento estimatorio', g: 'Escritos de la parte demandada', r: ['demandado'], norma: 'CGP, art. 206' },
    { k: 'mc_revision', n: 'Solicitud de revisión de medidas cautelares ejecutadas', g: 'Escritos de la parte demandada', r: ['demandado'], norma: 'Decisión 486 de 2000, art. 248' },
    { k: 'poder', n: 'Poder especial', g: 'Escritos de parte', r: P, norma: 'CGP, art. 74; Ley 2213 de 2022, art. 5' },
    { k: 'memorial', n: 'Memorial', g: 'Escritos de parte', r: P, norma: 'CGP, art. 109' },
    { k: 'pruebas', n: 'Solicitud o aporte de pruebas', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 164, 165 y 173' },
    { k: 'dictamen_parte', n: 'Aporte de dictamen pericial de parte', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 226 y 227' },
    { k: 'alegatos', n: 'Alegatos de conclusión', g: 'Escritos de parte', r: P, norma: 'CGP, art. 373, num. 4' },
    { k: 'reposicion', n: 'Recurso de reposición', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 318 y 319' },
    { k: 'apel_auto', n: 'Recurso de apelación contra auto', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 320, 321 y 322' },
    { k: 'reparos', n: 'Apelación de la sentencia: reparos concretos', g: 'Escritos de parte', r: P, norma: 'CGP, art. 322, num. 3', et: 'apelacion' },
    { k: 'sustentacion', n: 'Sustentación del recurso de apelación', g: 'Escritos de parte', r: P, norma: 'Ley 2213 de 2022, art. 12; CGP, art. 322' },
    { k: 'replica', n: 'Réplica a la sustentación del recurso', g: 'Escritos de parte', r: P, norma: 'Ley 2213 de 2022, art. 12' },
    { k: 'aclaracion', n: 'Solicitud de aclaración, corrección o adición', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 285, 286 y 287' },
    { k: 'nulidad', n: 'Solicitud de nulidad procesal', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 133 a 135' },
    { k: 'conciliacion', n: 'Acuerdo conciliatorio o de transacción', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 312 y 372, num. 6' },
    { k: 'desistimiento', n: 'Desistimiento', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 314 a 316' },
    { k: 'casacion', n: 'Recurso extraordinario de casación', g: 'Escritos de parte', r: P, norma: 'CGP, arts. 333 a 338', et: 'casacion' },
    { k: 'dictamen', n: 'Dictamen pericial', g: 'Auxiliares de la justicia', r: ['perito'], norma: 'CGP, arts. 226 a 228' },
    { k: 'perito_aclara', n: 'Aclaración o complementación del dictamen', g: 'Auxiliares de la justicia', r: ['perito'], norma: 'CGP, art. 228' },
    { k: 'auto_admite', n: 'Auto admite demanda', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 90 y 369', est: true, et: 'notificacion', ayuda: 'Ordena notificar personalmente al demandado y correr traslado por veinte días.' },
    { k: 'auto_inadmite', n: 'Auto inadmite demanda', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, art. 90', est: true, d: 5, tl: 'Subsanación de la demanda', et: 'calificacion' },
    { k: 'auto_rechaza', n: 'Auto rechaza demanda', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, art. 90', est: true, et: 'terminado', fin: true },
    { k: 'auto_mc', n: 'Auto decreta medidas cautelares', g: 'Providencias del juez', r: ['juez'], norma: 'Decisión 486 de 2000, arts. 245 a 247', res: true, ayuda: 'Puede decretarse sin intervención del demandado; ejecutada la medida, se notifica a la parte afectada (Decisión 486 de 2000, art. 248). Levante la reserva desde el expediente cuando corresponda.' },
    { k: 'auto_niega_mc', n: 'Auto niega medidas cautelares', g: 'Providencias del juez', r: ['juez'], norma: 'Decisión 486 de 2000, art. 247', est: true },
    { k: 'auto_previas', n: 'Auto resuelve excepciones previas', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, art. 101', est: true },
    { k: 'auto_fija_inicial', n: 'Auto fija fecha de audiencia inicial', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, art. 372', est: true, aud: 'Audiencia inicial', et: 'audiencia_inicial' },
    { k: 'acta_inicial', n: 'Acta de audiencia inicial', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 294 y 372', et: 'instruccion', ayuda: 'Conciliación, interrogatorios, fijación del litigio, control de legalidad y decreto de pruebas. Lo decidido en audiencia queda notificado en estrados (CGP, art. 294).' },
    { k: 'auto_pruebas', n: 'Auto decreta pruebas', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 169 y 372, num. 10', est: true },
    { k: 'auto_fija_aij', n: 'Auto fija fecha de audiencia de instrucción y juzgamiento', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 372 y 373', est: true, aud: 'Audiencia de instrucción y juzgamiento', et: 'instruccion' },
    { k: 'acta_aij', n: 'Acta de audiencia de instrucción y juzgamiento', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 294 y 373', et: 'sentencia1' },
    { k: 'sentencia1', n: 'Sentencia de primera instancia', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 280 y 373, num. 5; Decisión 486 de 2000, arts. 155, 238, 241 y 243', et: 'sentencia1', ayuda: 'Proferida en audiencia queda notificada en estrados (CGP, art. 294). Si es escrita, márquela para fijación en estado.' },
    { k: 'auto_reposicion', n: 'Auto resuelve recurso de reposición', g: 'Providencias del juez', r: ['juez', 'magistrado'], norma: 'CGP, arts. 318 y 319', est: true },
    { k: 'auto_concede_apel', n: 'Auto concede recurso de apelación', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 322 y 323', est: true, et: 'apelacion' },
    { k: 'auto_niega_apel', n: 'Auto niega recurso de apelación', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, art. 322', est: true },
    { k: 'auto_ip_facultativa', n: 'Auto solicita interpretación prejudicial facultativa al TJCA', g: 'Providencias del juez', r: ['juez'], norma: 'Estatuto del TJCA (Decisión 500), art. 122', est: true },
    { k: 'auto_tramite', n: 'Auto de trámite', g: 'Providencias del juez', r: ['juez', 'magistrado'], norma: 'CGP, art. 279', est: true },
    { k: 'auto_requiere', n: 'Auto requiere a una parte', g: 'Providencias del juez', r: ['juez', 'magistrado'], norma: 'CGP, art. 42', est: true },
    { k: 'comunicacion', n: 'Comunicación procesal del despacho', g: 'Providencias del juez', r: ['juez', 'magistrado'], norma: 'CGP, art. 111' },
    { k: 'auto_obedezcase', n: 'Auto de obedecimiento a lo resuelto por el superior', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, art. 329', est: true, et: 'terminado' },
    { k: 'auto_termina', n: 'Auto declara terminado el proceso y ordena archivo', g: 'Providencias del juez', r: ['juez'], norma: 'CGP, arts. 122, 312 y 314', est: true, et: 'terminado', fin: true },
    { k: 'informe', n: 'Informe secretarial al despacho', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, art. 109' },
    { k: 'citacion', n: 'Citación para notificación personal', g: 'Secretaría', r: ['secretaria', 'demandante'], norma: 'CGP, art. 291' },
    { k: 'acta_notif', n: 'Acta de notificación personal', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, arts. 290 y 291', d: 20, tl: 'Traslado de la demanda', et: 'contestacion' },
    { k: 'aviso', n: 'Notificación por aviso', g: 'Secretaría', r: ['secretaria', 'demandante'], norma: 'CGP, arts. 91 y 292', d: 20, off: 1, tl: 'Traslado de la demanda', et: 'contestacion', ayuda: 'La notificación por aviso se considera surtida al finalizar el día siguiente al de la entrega (CGP, art. 292). Verifique además el término para retirar copias del artículo 91 y ajuste el término si corresponde.' },
    { k: 'traslado', n: 'Traslado secretarial', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, art. 110', d: 5, tl: 'Traslado', ayuda: 'Excepciones de mérito: cinco días (CGP, art. 370). Excepciones previas: tres días (CGP, art. 101). Ajuste el término según el escrito.' },
    { k: 'oficio', n: 'Oficio', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, art. 111' },
    { k: 'constancia', n: 'Constancia secretarial', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, art. 109' },
    { k: 'ejecutoria', n: 'Constancia de ejecutoria', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, art. 302' },
    { k: 'remision', n: 'Remisión del expediente al superior', g: 'Secretaría', r: ['secretaria'], norma: 'CGP, arts. 323 y 324', inst: 2, et: 'segunda' },
    { k: 'devolucion', n: 'Devolución del expediente al despacho de origen', g: 'Secretaría', r: ['secretaria', 'magistrado'], norma: 'CGP, art. 329', inst: 1 },
    { k: 'auto_admite_apel', n: 'Auto admite recurso de apelación', g: 'Segunda instancia', r: ['magistrado'], norma: 'CGP, art. 325; Ley 2213 de 2022, art. 12', est: true, d: 3, tl: 'Ejecutoria y solicitud de pruebas', et: 'segunda', ayuda: 'Ejecutoriado este auto, el apelante sustenta dentro de los cinco días siguientes (Ley 2213 de 2022, art. 12).' },
    { k: 'auto_fija_sustentacion', n: 'Auto fija audiencia de sustentación y fallo', g: 'Segunda instancia', r: ['magistrado'], norma: 'CGP, art. 327; Ley 2213 de 2022, art. 12', est: true, aud: 'Audiencia de sustentación y fallo', et: 'segunda', ayuda: 'Procede cuando se decretan pruebas en segunda instancia; en los demás casos la sustentación es escrita (Ley 2213 de 2022, art. 12).' },
    { k: 'auto_desierto', n: 'Auto declara desierto el recurso de apelación', g: 'Segunda instancia', r: ['magistrado'], norma: 'CGP, art. 322, num. 3; Ley 2213 de 2022, art. 12', est: true },
    { k: 'traslado_sust', n: 'Traslado de la sustentación al no recurrente', g: 'Segunda instancia', r: ['magistrado', 'secretaria'], norma: 'Ley 2213 de 2022, art. 12; CGP, art. 110', est: true, d: 5, tl: 'Traslado al no recurrente' },
    { k: 'auto_ip', n: 'Auto suspende el proceso y solicita interpretación prejudicial obligatoria al TJCA', g: 'Segunda instancia', r: ['magistrado'], norma: 'Tratado de Creación del TJCA, art. 33; Estatuto del TJCA (Decisión 500), arts. 123 y 125', est: true, et: 'ip' },
    { k: 'incorpora_ip', n: 'Incorporación de la interpretación prejudicial del TJCA', g: 'Segunda instancia', r: ['magistrado'], norma: 'Estatuto del TJCA (Decisión 500), arts. 127 y 128', est: true },
    { k: 'sentencia2', n: 'Sentencia de segunda instancia', g: 'Segunda instancia', r: ['magistrado'], norma: 'CGP, art. 328; Ley 2213 de 2022, art. 12', est: true, et: 'sentencia2' },
    { k: 'auto_casacion', n: 'Auto concede o niega recurso de casación', g: 'Segunda instancia', r: ['magistrado'], norma: 'CGP, arts. 334 y 338', est: true }
  ];

  const TMAP = {};
  TYPES.concat(INICIALES).forEach(t => { TMAP[t.k] = t; });

  /* Días hábiles en Colombia: fines de semana, festivos de la Ley 51 de 1983 y, si se activa, vacancia judicial colectiva */
  const pad = (n, l) => String(n).padStart(l, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addD = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  const toMonday = d => { const w = d.getDay(); return w === 1 ? d : addD(d, (8 - w) % 7); };
  const HC = {};
  function festivos(y) {
    if (HC[y]) return HC[y];
    const s = new Set(), E = easter(y), D = (m, d) => new Date(y, m - 1, d);
    [D(1, 1), D(5, 1), D(7, 20), D(8, 7), D(12, 8), D(12, 25), addD(E, -3), addD(E, -2)].forEach(d => s.add(ymd(d)));
    [D(1, 6), D(3, 19), D(6, 29), D(8, 15), D(10, 12), D(11, 1), D(11, 11)].forEach(d => s.add(ymd(toMonday(d))));
    [addD(E, 43), addD(E, 64), addD(E, 71)].forEach(d => s.add(ymd(d)));
    return (HC[y] = s);
  }
  function esHabil(d, vac) {
    const w = d.getDay(); if (w === 0 || w === 6) return false;
    if (festivos(d.getFullYear()).has(ymd(d))) return false;
    if (vac) {
      const m = d.getMonth() + 1, day = d.getDate();
      if ((m === 12 && day >= 20) || (m === 1 && day <= 10)) return false;
      const E = easter(d.getFullYear()), t = d.getTime();
      if (t >= addD(E, -6).getTime() && t <= addD(E, -4).getTime()) return false;
    }
    return true;
  }
  function siguienteHabil(s, vac) { let d = addD(parseD(s), 1); while (!esHabil(d, vac)) d = addD(d, 1); return ymd(d); }
  function termino(fecha, dias, off, vac) {
    let d = parseD(fecha), k = off || 0;
    while (k > 0) { d = addD(d, 1); if (esHabil(d, vac)) k--; }
    let ini = addD(d, 1); while (!esHabil(ini, vac)) ini = addD(ini, 1);
    let fin = new Date(ini), c = 1; while (c < dias) { fin = addD(fin, 1); if (esHabil(fin, vac)) c++; }
    return { inicio: ymd(ini), fin: ymd(fin) };
  }
  function habilesHasta(fin, hoy, vac) {
    const h = parseD(hoy), f = parseD(fin); if (f < h) return -1;
    let n = 0, d = new Date(h); while (d <= f) { if (esHabil(d, vac)) n++; d = addD(d, 1); } return n;
  }

  const CAT = { ROLES, DESPACHO, ETAPAS, INICIALES, TYPES, TMAP, pad, ymd, parseD, festivos, esHabil, siguienteHabil, termino, habilesHasta };
  if (typeof module !== 'undefined' && module.exports) module.exports = CAT; else root.CAT = CAT;
})(typeof window !== 'undefined' ? window : globalThis);
