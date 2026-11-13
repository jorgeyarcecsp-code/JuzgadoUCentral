/* Sala Virtual de Litigio Simulado: aplicación del sitio público */
(function () {
  'use strict';
  const C = window.CAT;
  const { ROLES, DESPACHO, ETAPAS, INICIALES, TYPES, TMAP, pad, ymd, siguienteHabil, termino, habilesHasta } = C;
  const EIDX = Object.fromEntries(ETAPAS.map((e, i) => [e.k, i]));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOM = (window.CONFIG.DOMINIO || 'ucentral.edu.co').toLowerCase();
  const BASE = location.origin + location.pathname;
  const PCOLS = 'radicado,anio,consecutivo,clase_key,clase,instancia,etapa,estado,fecha_radicacion,ultima_actuacion,contador,sujetos,marca,cuantia,contenido,ejemplo';
  const ACOLS = 'codigo,radicado,numero,instancia,tipo,nombre,anotacion,rol,fecha,registrado,termino_dias,termino_label,inicio_termino,fin_termino,fecha_estado,reservada,audiencia,anulada,motivo_anulacion';
  const MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];

  const configurado = !/SU-PROYECTO|SU-CLAVE/.test(window.CONFIG.SUPABASE_URL + window.CONFIG.SUPABASE_ANON_KEY);
  const sb = configurado ? window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } }) : null;

  const S = {
    session: null, perfil: null, ajustes: {}, procesos: new Map(), acts: [], docs: [], perfiles: [],
    view: 'consulta', proc: null, ptab: 'actuaciones', qmode: 'radicado', q: {}, estDate: ymd(new Date()),
    cargando: true, error: null, recuperacion: false, radProc: null, ultimaFirma: '', ultima: null,
    calMes: ymd(new Date()).slice(0, 7), calSel: null, calNueva: null, comoRol: null, decidir: null
  };

  /* ---------- Utilidades ---------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => ymd(new Date());
  const vac = () => !!S.ajustes.vacancia;
  const fechaLarga = s => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return d + ' de ' + MESES[m - 1] + ' de ' + y; };
  const fechaHora = iso => { if (!iso) return ''; const d = new Date(iso); return ymd(d) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2); };
  const fmtRad = r => r ? [r.slice(0, 5), r.slice(5, 7), r.slice(7, 9), r.slice(9, 12), r.slice(12, 16), r.slice(16, 21), r.slice(21, 23)].join('-') : '';
  const radInst = p => p.radicado.slice(0, 21) + (p.instancia >= 2 ? '01' : '00');
  const tamano = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const despachoN = p => p.instancia >= 2 ? (S.ajustes.despacho2 || 'Sala Civil simulada, segunda instancia') : (S.ajustes.despacho1 || 'Despacho simulado de propiedad industrial, primera instancia');
  const nombreRol = r => ROLES[r] || r || '';
  function aviso(m) { const t = $('mensaje'); t.textContent = m; t.classList.remove('oculto'); clearTimeout(aviso.h); aviso.h = setTimeout(() => t.classList.add('oculto'), 5000); }
  function rolReal() { return S.perfil && S.perfil.rol ? S.perfil.rol : null; }
  function rol() { return rolReal() === 'docente' && S.comoRol ? S.comoRol : rolReal(); }
  const simulando = () => rolReal() === 'docente' && !!S.comoRol;
  const conComo = obj => simulando() ? Object.assign({}, obj, { como_rol: S.comoRol }) : obj;
  const puedeRadicar = () => !!rol() && rol() !== 'observador';
  const esDocente = () => rol() === 'docente';
  const esDespacho = () => DESPACHO.includes(rol());
  const tiposPara = r => r === 'docente' ? TYPES : TYPES.filter(t => t.r.includes(r));
  const inicialesPara = r => ['docente', 'juez', 'secretaria'].includes(r) ? INICIALES : INICIALES.filter(t => t.r.includes(r));
  const actsDe = rad => S.acts.filter(a => a.radicado === rad);
  function traducirError(e) {
    const m = (e && (e.message || e.error_description || e.msg)) || String(e || '');
    if (/Database error saving new user|correos institucionales/i.test(m)) return 'Solo se admiten correos institucionales @' + DOM + '.';
    if (/already registered|already exists/i.test(m)) return 'Ya existe una cuenta con ese correo. Ingrese o recupere su contraseña.';
    if (/Email not confirmed/i.test(m)) return 'Su correo aún no está confirmado. Abra el enlace que le enviamos a su correo institucional.';
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/rate limit|too many/i.test(m)) return 'Se alcanzó el límite de envíos de correo por hora. Intente de nuevo más tarde.';
    if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
    if (/mime|not supported|Payload too large|exceeded the maximum/i.test(m)) return 'El archivo no es PDF, imagen o texto, o supera 20 MB.';
    return m;
  }

  /* ---------- Datos ---------- */
  async function cargarTodo() {
    if (!sb) return;
    try {
      const auth = !!S.session;
      const [aj, pr, ac] = await Promise.all([
        sb.from('ajustes').select('id,dominio,despacho1,juez,despacho2,magistrado,vacancia').eq('id', 1).maybeSingle(),
        sb.from('procesos').select(auth ? '*' : PCOLS).order('ultima_actuacion', { ascending: false }),
        sb.from('actuaciones').select(auth ? '*' : ACOLS).order('registrado', { ascending: false }).limit(5000)
      ]);
      if (pr.error) throw pr.error; if (ac.error) throw ac.error;
      S.ajustes = aj.data || {};
      S.procesos = new Map((pr.data || []).map(p => [p.radicado, p]));
      S.acts = ac.data || [];
      S.error = null;
    } catch (e) { S.error = 'No fue posible consultar la base de datos: ' + traducirError(e); }
  }
  async function cargarPerfil() {
    S.perfil = null;
    if (!S.session) return;
    const { data } = await sb.from('perfiles').select('*').eq('id', S.session.user.id).maybeSingle();
    S.perfil = data || null;
  }
  async function cargarDocs(rad) {
    S.docs = [];
    if (!rol()) return;
    const { data } = await sb.from('documentos').select('*').eq('radicado', rad).order('creado');
    S.docs = data || [];
  }
  async function cargarPerfiles() {
    if (!esDocente()) return;
    const [pf, pr] = await Promise.all([
      sb.from('perfiles').select('*').order('creado'),
      sb.from('roles_preasignados').select('*').order('creado')
    ]);
    S.perfiles = pf.data || [];
    S.preasignados = pr.data || [];
  }

  /* ---------- Navegación ---------- */
  const VISTAS_PUBLICAS = ['consulta', 'estados', 'agenda', 'guia', 'privacidad', 'ingresar', 'registro', 'recuperar'];
  function leerRuta() {
    const h = (location.hash || '#consulta').slice(1);
    if (h.startsWith('p-')) { S.view = 'proceso'; S.proc = h.slice(2); }
    else S.view = h || 'consulta';
  }
  function ir(h) { if (location.hash === '#' + h) render(); else location.hash = h; }
  window.addEventListener('hashchange', async () => {
    leerRuta(); if (S.view === 'proceso') await cargarDocs(S.proc); if (S.view === 'bandeja') await cargarDocsTodos(); if (S.view === 'admin') await cargarPerfiles();
    render(); window.scrollTo(0, 0);
  });

  function menu() {
    const items = [['consulta', 'Consulta de procesos'], ['estados', 'Estados y traslados'], ['agenda', 'Audiencias'], ['guia', 'Guía del proceso']];
    if (puedeRadicar()) items.splice(1, 0, ['radicar', 'Radicar actuación'], ['bandeja', 'Bandeja y términos']);
    if (esDocente()) items.push(['admin', 'Administración']);
    const actual = S.view === 'proceso' ? 'consulta' : S.view;
    $('menu').innerHTML = items.map(([k, n]) => '<a href="#' + k + '"' + (k === actual ? ' aria-current="page"' : '') + '>' + n + '</a>').join('');
    let c = '';
    if (!sb) c = '<span class="marca alerta">Sitio sin configurar</span>';
    else if (S.session) c = '<span>' + esc(S.perfil ? S.perfil.nombre : S.session.user.email) + '</span>' + (rolReal() === 'docente' ? '<label class="peq" for="sel-como" style="display:flex;gap:6px;align-items:center">Ver como<select id="sel-como" style="width:auto;padding:4px 8px">' + [['', 'Docente (superusuario)'], ['juez', ROLES.juez], ['secretaria', ROLES.secretaria], ['magistrado', ROLES.magistrado], ['demandante', ROLES.demandante], ['demandado', ROLES.demandado], ['perito', ROLES.perito]].map(([k, n]) => '<option value="' + k + '"' + ((S.comoRol || '') === k ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></label>' : (rol() ? '<span class="marca activa">' + esc(nombreRol(rol())) + '</span>' : '<span class="marca alerta">Rol pendiente de asignación</span>')) + '<button class="boton peq" data-a="salir">Cerrar sesión</button>';
    else c = '<a class="boton peq" href="#ingresar">Ingresar</a><a class="boton peq principal" href="#registro">Crear usuario</a>';
    $('cuenta').innerHTML = c;
  }

  function render() {
    menu();
    const M = $('principal');
    if (!sb) { M.innerHTML = '<section class="panel"><h2>Sitio pendiente de configuración</h2><p>Falta conectar la base de datos. Edite <b>js/config.js</b> con la dirección y la clave anónima del proyecto de Supabase, según la guía de instalación del repositorio.</p></section>'; return; }
    if (S.cargando) { M.innerHTML = '<div class="vacio">Cargando…</div>'; return; }
    const privadas = { radicar: puedeRadicar, bandeja: puedeRadicar, admin: esDocente };
    if (privadas[S.view] && !privadas[S.view]()) {
      M.innerHTML = '<section class="panel"><h2>Acceso restringido</h2><p>' + (S.session ? 'Su cuenta aún no tiene un rol asignado por el docente moderador.' : 'Para esta sección debe ingresar con su usuario institucional.') + '</p>' + (S.session ? '' : '<a class="boton principal" href="#ingresar">Ingresar</a>') + '</section>'; return;
    }
    if (S.recuperacion) { M.innerHTML = vNuevaClave(); return; }
    let h = S.error ? '<div class="nota error">' + esc(S.error) + '</div>' : '';
    if (simulando()) h += '<div class="nota alerta"><b>Modo de verificación.</b> Está viendo la plataforma y actuando como <b>' + esc(nombreRol(S.comoRol)) + '</b>, con los permisos exactos de ese perfil. Las actuaciones que radique quedan marcadas como realizadas por el docente. <button class="boton peq" data-a="salir-como">Volver a docente</button></div>';
    if (['consulta', 'proceso', 'estados', 'bandeja', 'agenda', 'radicar'].includes(S.view)) h += cifras();
    const V = { consulta: vConsulta, proceso: vProceso, radicar: vRadicar, estados: vEstados, bandeja: vBandeja, agenda: vAgenda, guia: vGuia, privacidad: vPrivacidad, ingresar: vIngresar, registro: vRegistro, recuperar: vRecuperar, admin: vAdmin };
    h += (V[S.view] || vConsulta)();
    M.innerHTML = h;
    if (S.view === 'radicar') dinamicoRadicar();
    if (S.view === 'agenda' && $('ap-anot') && !$('ap-anot').value) textoAuto();
  }

  /* ---------- Cifras de resumen ---------- */
  function visible(a) { return !a.reservada || esDespacho() || (!simulando() && S.session && a.autor_id === S.session.user.id) || (rol() && a.rol === rol()); }
  function cifras() {
    const ps = [...S.procesos.values()]; const vis = S.acts.filter(a => !a.anulada && visible(a));
    const act = ps.filter(p => p.estado !== 'Terminado').length;
    const deHoy = vis.filter(a => a.fecha === hoy()).length;
    const venc = vis.filter(a => a.fin_termino && (n => n >= 0 && n <= 3)(habilesHasta(a.fin_termino, hoy(), vac()))).length;
    const aud = vis.filter(a => a.audiencia && a.audiencia.fecha >= hoy()).sort((x, y) => (x.audiencia.fecha + x.audiencia.hora).localeCompare(y.audiencia.fecha + y.audiencia.hora))[0];
    return '<div class="cifras"><div class="cifra"><b>' + act + '</b><span>Procesos activos</span></div><div class="cifra"><b>' + deHoy + '</b><span>Actuaciones registradas hoy</span></div><div class="cifra"><b>' + venc + '</b><span>Términos que vencen en tres días hábiles o menos</span></div><div class="cifra"><b style="font-size:1.1rem">' + (aud ? esc(fechaLarga(aud.audiencia.fecha) + ', ' + aud.audiencia.hora) : 'Sin programar') + '</b><span>' + (aud ? esc(aud.audiencia.tipo) : 'Próxima audiencia') + '</span></div></div>';
  }

  /* ---------- Consulta pública ---------- */
  function construido() { const q = S.q; return '11' + '001' + '99' + '89' + '001' + String(q.anio || new Date().getFullYear()) + pad((q.cons || '').replace(/\D/g, '') || '0', 5) + (q.rec || '00'); }
  function vConsulta() {
    const m = S.qmode, q = S.q;
    const modos = [['radicado', 'Número de radicación'], ['nombre', 'Nombre o razón social'], ['construir', 'Construir número'], ['despacho', 'Despacho y clase de proceso']];
    let f = '';
    if (m === 'radicado') f = '<div class="rejilla r2"><label for="q-rad">Número de radicación (23 dígitos)<input type="text" id="q-rad" inputmode="numeric" maxlength="29" value="' + esc(q.rad || '') + '" placeholder="11001998900120260000100"></label><label for="q-solo">Procesos<select id="q-solo"><option value="todos">Todos los procesos</option><option value="activos"' + (q.solo === 'activos' ? ' selected' : '') + '>Solo procesos activos</option></select></label></div>';
    if (m === 'nombre') f = '<div class="rejilla r3"><label for="q-tipo">Sujeto procesal<select id="q-tipo"><option value="">Cualquiera</option><option' + (q.tipo === 'Demandante' ? ' selected' : '') + '>Demandante</option><option' + (q.tipo === 'Demandado' ? ' selected' : '') + '>Demandado</option></select></label><label for="q-nom">Nombre o razón social<input type="text" id="q-nom" value="' + esc(q.nom || '') + '" placeholder="Mínimo tres caracteres"></label></div>';
    if (m === 'construir') f = '<div class="rejilla r3"><label for="c-dep">Departamento<select id="c-dep"><option>11 · Bogotá D. C.</option></select></label><label for="c-mun">Ciudad<select id="c-mun"><option>001 · Bogotá</option></select></label><label for="c-ent">Entidad<select id="c-ent"><option>99 · Simulación académica</option></select></label><label for="c-esp">Especialidad<select id="c-esp"><option>89 · Propiedad industrial (Consultorio Jurídico)</option></select></label><label for="c-desp">Despacho<select id="c-desp"><option>001 · Despacho simulado</option></select></label><label for="c-anio">Año<input type="number" id="c-anio" min="2020" max="2100" value="' + esc(q.anio || new Date().getFullYear()) + '"></label><label for="c-cons">Consecutivo (cinco dígitos)<input type="text" id="c-cons" maxlength="5" value="' + esc(q.cons || '') + '" placeholder="00001"></label><label for="c-rec">Instancia<select id="c-rec"><option value="00">00 · Primera instancia</option><option value="01"' + (q.rec === '01' ? ' selected' : '') + '>01 · Segunda instancia</option></select></label></div><p class="peq suave" id="c-prev">Número construido: <span class="mono">' + esc(fmtRad(construido())) + '</span></p>';
    if (m === 'despacho') f = '<div class="rejilla r3"><label for="q-inst">Despacho<select id="q-inst"><option value="">Todos</option><option value="1"' + (q.inst === '1' ? ' selected' : '') + '>' + esc(despachoN({ instancia: 1 })) + '</option><option value="2"' + (q.inst === '2' ? ' selected' : '') + '>' + esc(despachoN({ instancia: 2 })) + '</option></select></label><label for="q-clase">Clase de proceso<select id="q-clase"><option value="">Todas</option><option value="demanda"' + (q.clase === 'demanda' ? ' selected' : '') + '>Verbal: infracción de derechos de propiedad industrial</option><option value="mc_previas"' + (q.clase === 'mc_previas' ? ' selected' : '') + '>Medidas cautelares previas</option></select></label><label for="q-etapa">Etapa<select id="q-etapa"><option value="">Todas</option>' + ETAPAS.map(e => '<option value="' + e.k + '"' + (q.etapa === e.k ? ' selected' : '') + '>' + esc(e.n) + '</option>').join('') + '</select></label></div>';
    return '<section class="panel"><div class="panel-cab"><h2>Consulta de procesos</h2>' + (puedeRadicar() && inicialesPara(rol()).length ? '<button class="boton principal" data-a="nuevo">Radicar escrito inicial</button>' : '') + '</div><p class="peq suave">La consulta es pública y no requiere registro. Los documentos del expediente solo están disponibles para los participantes registrados.</p><div class="selector" role="group" aria-label="Tipo de consulta">' + modos.map(([k, n]) => '<button data-a="modo" data-m="' + k + '" aria-pressed="' + (m === k) + '">' + n + '</button>').join('') + '</div><form id="f-consulta">' + f + '<div class="acciones" style="margin-top:14px"><button class="boton principal" type="submit">Consultar</button><button class="boton" type="button" data-a="limpiar">Nueva consulta</button></div></form></section><section class="panel"><div class="panel-cab"><h2>Resultados</h2><span class="peq suave">Seleccione un proceso para ver el expediente</span></div><div id="resultados">' + resultados() + '</div></section>';
  }
  function filtrar() {
    let ps = [...S.procesos.values()]; const q = S.q, m = S.qmode;
    if (m === 'radicado' && q.rad) { const d = q.rad.replace(/\D/g, ''); ps = ps.filter(p => d.length >= 21 ? p.radicado.startsWith(d.slice(0, 21)) : p.radicado.includes(d)); }
    if (m === 'radicado' && q.solo === 'activos') ps = ps.filter(p => p.estado !== 'Terminado');
    if (m === 'nombre' && q.nom && q.nom.trim().length >= 3) { const n = q.nom.trim().toLowerCase(); ps = ps.filter(p => (p.sujetos || []).some(s => (!q.tipo || s.tipo === q.tipo) && (s.nombre || '').toLowerCase().includes(n))); }
    if (m === 'construir' && q.cons) { const c = construido(); ps = ps.filter(p => p.radicado.slice(0, 21) === c.slice(0, 21) && (c.slice(21) === '00' || p.instancia >= 2)); }
    if (m === 'despacho') { if (q.inst) ps = ps.filter(p => String(p.instancia) === q.inst); if (q.clase) ps = ps.filter(p => p.clase_key === q.clase); if (q.etapa) ps = ps.filter(p => p.etapa === q.etapa); }
    return ps.sort((a, b) => (b.ultima_actuacion || '').localeCompare(a.ultima_actuacion || ''));
  }
  function etiquetaEtapa(p) { const e = ETAPAS[EIDX[p.etapa]]; return p.estado === 'Terminado' ? '<span class="marca">Terminado</span>' : '<span class="marca activa">' + esc(e ? e.n : p.etapa) + '</span>'; }
  function resultados() {
    const ps = filtrar();
    if (!ps.length) return '<div class="vacio">' + (S.procesos.size ? 'No hay procesos que coincidan con la consulta.' : 'Aún no hay procesos radicados.') + '</div>';
    return '<div class="tabla"><table><thead><tr><th>Número de radicación</th><th>Fecha de radicación y última actuación</th><th>Despacho y departamento</th><th>Sujetos procesales</th><th>Etapa</th></tr></thead><tbody>' + ps.map(p => '<tr class="abrir" data-a="abrir" data-r="' + p.radicado + '" tabindex="0"><td class="num"><a href="#p-' + p.radicado + '">' + fmtRad(radInst(p)) + '</a>' + (p.ejemplo ? '<br><span class="marca">Ejemplo</span>' : '') + '</td><td class="num">' + esc(p.fecha_radicacion) + '<br>' + esc(p.ultima_actuacion || '') + '</td><td>' + esc(despachoN(p)) + '<br><span class="peq suave">Bogotá D. C.</span></td><td>' + (p.sujetos || []).map(s => esc(s.tipo) + ': ' + esc(s.nombre)).join('<br>') + '</td><td>' + etiquetaEtapa(p) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  /* ---------- Expediente ---------- */
  function vProceso() {
    const p = S.procesos.get(S.proc);
    if (!p) return '<section class="panel vacio">No se encontró el proceso. <a href="#consulta">Volver a la consulta</a></section>';
    const ei = EIDX[p.etapa] ?? 0;
    const pest = [['datos', 'Datos del proceso'], ['sujetos', 'Sujetos procesales'], ['actuaciones', 'Actuaciones'], ['documentos', 'Índice del expediente'], ['audiencias', 'Audiencias']];
    const cuerpo = { datos: pDatos, sujetos: pSujetos, actuaciones: pActuaciones, documentos: pDocumentos, audiencias: pAudiencias }[S.ptab](p);
    return '<section class="panel"><div class="panel-cab"><div><a href="#consulta">Volver a la consulta</a><h2 style="margin-top:8px">Proceso <span class="mono">' + fmtRad(radInst(p)) + '</span></h2><p class="peq suave" style="margin:4px 0 0">' + esc(despachoN(p)) + '. ' + esc(p.clase) + '.</p></div><div class="acciones">' + (esDespacho() && pendientes().some(x => x.p.radicado === p.radicado) ? '<a class="boton principal" href="#bandeja">Decidir escritos pendientes (' + pendientes().filter(x => x.p.radicado === p.radicado).length + ')</a>' : '') + (puedeRadicar() ? '<button class="boton' + (esDespacho() && pendientes().some(x => x.p.radicado === p.radicado) ? '' : ' principal') + '" data-a="radicar-en" data-r="' + p.radicado + '">Registrar actuación</button>' : '') + (esDespacho() ? '<label for="sel-etapa" class="peq">Etapa<select id="sel-etapa" data-r="' + p.radicado + '">' + ETAPAS.map(e => '<option value="' + e.k + '"' + (e.k === p.etapa ? ' selected' : '') + '>' + esc(e.n) + '</option>').join('') + '</select></label>' : '') + '</div></div><div class="etapas" aria-label="Etapas del proceso">' + ETAPAS.map((e, i) => '<div class="etapa ' + (p.estado === 'Terminado' || i < ei ? 'hecha' : i === ei ? 'actual' : '') + '">' + esc(e.n) + '</div>').join('') + '</div></section><section class="panel"><div class="selector" role="tablist">' + pest.map(([k, n]) => '<button role="tab" data-a="pest" data-t="' + k + '" aria-pressed="' + (S.ptab === k) + '">' + n + '</button>').join('') + '</div>' + cuerpo + '</section>';
  }
  function pDatos(p) {
    const m = p.marca || {};
    const filas = [['Fecha de radicación', fechaLarga(p.fecha_radicacion)], ['Despacho', despachoN(p)], ['Funcionario', p.instancia >= 2 ? (S.ajustes.magistrado || 'Magistrado ponente designado por el docente') : (S.ajustes.juez || 'Juez designado por el docente')], ['Tipo de proceso', 'Declarativo'], ['Clase de proceso', p.clase_key === 'mc_previas' ? 'Medidas cautelares previas' : 'Verbal (CGP, art. 368)'], ['Subclase', 'Infracción de derechos de propiedad industrial: marcas'], ['Recurso', p.instancia >= 2 ? 'Apelación' : 'Sin recurso en trámite'], ['Ubicación del expediente', p.estado === 'Terminado' ? 'Archivo' : p.instancia >= 2 ? 'Despacho de segunda instancia' : 'Despacho de primera instancia'], ['Radicado de primera instancia', fmtRad(p.radicado)], ['Marca registrada', (m.signo || '') + (m.tipo ? ' (' + m.tipo.toLowerCase() + ')' : '')], ['Certificado de registro', m.registro], ['Clases de la Clasificación de Niza', m.clases], ['Signo cuestionado', m.cuestionado], ['Productos o servicios', m.productos], ['Cuantía estimada', p.cuantia], ['Contenido de la radicación', p.contenido]];
    return '<div class="ficha">' + filas.map(([k, v]) => '<div>' + esc(k) + '</div><div>' + esc(v || 'No registra') + '</div>').join('') + '</div>';
  }
  function pSujetos(p) { return '<div class="tabla"><table><thead><tr><th>Tipo</th><th>Es emplazado</th><th>Nombre o razón social</th><th>Identificación</th><th>Apoderado</th></tr></thead><tbody>' + (p.sujetos || []).map(s => '<tr><td>' + esc(s.tipo) + '</td><td>No</td><td>' + esc(s.nombre) + '</td><td class="num">' + esc(s.id || '') + '</td><td>' + esc(s.apoderado || '') + '</td></tr>').join('') + '</tbody></table></div>'; }
  function docsDe(codigo) { return S.docs.filter(d => d.codigo === codigo); }
  function celdaDocs(a) {
    if (!S.session) return '<span class="peq suave">Ingrese para consultar</span>';
    if (!rol()) return '<span class="peq suave">Requiere rol asignado</span>';
    const ds = docsDe(a.codigo).map(d => '<button class="boton enlace" data-a="doc" data-ruta="' + esc(d.ruta) + '">' + esc(d.nombre) + '</button>');
    const es = (a.enlaces || []).map(u => '<a href="' + esc(u) + '" target="_blank" rel="noopener">Enlace externo</a>');
    return ds.concat(es).join('<br>') || '<span class="peq suave">Sin anexos</span>';
  }
  function pActuaciones(p) {
    const as = actsDe(p.radicado).sort((a, b) => b.numero - a.numero);
    const anular = ['juez', 'magistrado', 'docente'].includes(rol());
    const enEspera = new Set(pendientes().map(x => x.a.codigo));
    const filas = as.filter(visible).map(a => { const t = TMAP[a.tipo] || {}; return '<tr class="' + (a.anulada ? 'anulada' : '') + '"><td class="num">' + pad(a.numero, 4) + '</td><td class="num">' + esc(a.fecha) + '</td><td>' + esc(a.nombre) + (a.reservada ? ' <span class="marca reservada">Reservada</span>' : '') + (enEspera.has(a.codigo) ? ' <span class="marca alerta">Pendiente de decisión</span>' : '') + (a.fecha_estado ? ' <span class="marca">Estado del ' + esc(a.fecha_estado) + '</span>' : '') + '<br><span class="peq suave">' + esc(t.norma || '') + '</span></td><td>' + esc(a.anotacion) + (a.anulada ? '<br><span class="peq">Anulada: ' + esc(a.motivo_anulacion || '') + '</span>' : '') + (a.audiencia ? '<br><span class="peq">' + esc(a.audiencia.tipo + ': ' + fechaLarga(a.audiencia.fecha) + ', ' + a.audiencia.hora) + '</span>' : '') + '</td><td class="num">' + esc(a.inicio_termino || '') + '</td><td class="num">' + esc(a.fin_termino || '') + '</td><td class="num">' + esc(fechaHora(a.registrado)) + '</td><td>' + celdaDocs(a) + '</td><td class="peq">' + esc(nombreRol(a.rol)) + (a.actuado_por === 'docente' ? '<br><span class="marca alerta">Verificación docente</span>' : '') + (a.firmante ? '<br><span class="suave">' + esc(a.firmante) + '</span>' : '') + '</td><td>' + (anular && !a.anulada ? '<button class="boton peq" data-a="anular" data-c="' + a.codigo + '">Anular</button> ' : '') + (a.reservada && esDespacho() ? '<button class="boton peq" data-a="levantar" data-c="' + a.codigo + '">Levantar reserva</button>' : '') + '</td></tr>'; }).join('');
    return '<div class="acciones" style="margin-bottom:12px"><button class="boton peq" data-a="copiar-acts" data-r="' + p.radicado + '">Copiar listado de actuaciones</button></div><div class="tabla"><table><thead><tr><th>N.º</th><th>Fecha de actuación</th><th>Actuación</th><th>Anotación</th><th>Inicia término</th><th>Finaliza término</th><th>Fecha de registro</th><th>Documentos</th><th>Radicó</th><th><span class="oculto">Acciones</span></th></tr></thead><tbody>' + (filas || '<tr><td colspan="10" class="vacio">Sin actuaciones visibles.</td></tr>') + '</tbody></table></div>';
  }
  function pDocumentos(p) {
    if (!rol()) return '<div class="nota">El índice del expediente y los documentos están disponibles para los participantes registrados con rol asignado. ' + (S.session ? '' : '<a href="#ingresar">Ingresar</a>') + '</div>';
    const porCodigo = Object.fromEntries(actsDe(p.radicado).map(a => [a.codigo, a]));
    const filas = S.docs.filter(d => porCodigo[d.codigo]).sort((a, b) => porCodigo[a.codigo].numero - porCodigo[b.codigo].numero || a.creado.localeCompare(b.creado)).map((d, i) => { const a = porCodigo[d.codigo]; return '<tr><td class="num">' + (i + 1) + '</td><td><button class="boton enlace" data-a="doc" data-ruta="' + esc(d.ruta) + '">' + esc(d.nombre) + '</button></td><td class="num">' + pad(a.numero, 4) + '</td><td>' + esc(a.nombre) + '</td><td class="num">' + esc(a.fecha) + '</td><td class="num">' + tamano(d.tamano || 0) + '</td><td>' + esc(nombreRol(a.rol)) + '</td><td class="num peq" title="' + esc(d.sha256 || '') + '">' + esc((d.sha256 || '').slice(0, 16)) + '</td></tr>'; }).join('');
    return '<p class="nota">Índice electrónico del expediente: documentos en orden cronológico, con la huella SHA-256 calculada al momento de la carga para verificar su integridad.</p><div class="tabla" style="margin-top:12px"><table><thead><tr><th>Orden</th><th>Documento</th><th>Actuación</th><th>Tipo de actuación</th><th>Fecha</th><th>Tamaño</th><th>Origen</th><th>Huella SHA-256 (inicio)</th></tr></thead><tbody>' + (filas || '<tr><td colspan="8" class="vacio">Sin documentos cargados.</td></tr>') + '</tbody></table></div>';
  }
  function celdaEnlace(a) {
    if (!S.session) return '<span class="suave peq">Enlace disponible para participantes registrados</span>';
    return a.enlace_reunion ? '<a class="boton peq principal" href="' + esc(a.enlace_reunion) + '" target="_blank" rel="noopener">Unirse por Google Meet</a>' : '<span class="suave peq">Sin enlace</span>';
  }
  function filasAudiencias(lista, conRad) {
    if (!lista.length) return '<div class="vacio">No hay audiencias programadas.</div>';
    return '<div class="tabla"><table><thead><tr>' + (conRad ? '<th>Proceso</th>' : '') + '<th>Fecha</th><th>Hora</th><th>Audiencia</th><th>Sala</th><th>Conexión</th><th>Fijada en</th></tr></thead><tbody>' + lista.map(a => '<tr>' + (conRad ? '<td class="num"><a href="#p-' + a.radicado + '">' + fmtRad(a.radicado) + '</a></td>' : '') + '<td>' + esc(fechaLarga(a.audiencia.fecha)) + '</td><td class="num">' + esc(a.audiencia.hora) + ' a ' + esc(horaFin(a)) + '</td><td><button class="boton enlace" data-a="aud-ver" data-c="' + a.codigo + '">' + esc(a.audiencia.tipo) + '</button></td><td>' + esc(a.audiencia.lugar || '') + '</td><td>' + celdaEnlace(a) + '</td><td class="peq">Actuación ' + pad(a.numero, 4) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  /* ---------- Calendario de audiencias ---------- */
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const RE_MEET = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?[^\s]*)?$/i;
  const listaAudiencias = () => S.acts.filter(a => a.audiencia && a.audiencia.fecha && !a.anulada && visible(a)).sort((a, b) => (a.audiencia.fecha + a.audiencia.hora).localeCompare(b.audiencia.fecha + b.audiencia.hora));
  function inicioAud(a) { const [y, m, d] = a.audiencia.fecha.split('-').map(Number); const [h, mi] = (a.audiencia.hora || '09:00').split(':').map(Number); return new Date(y, m - 1, d, h, mi); }
  function finAud(a) { return new Date(inicioAud(a).getTime() + (Number(a.audiencia.duracion) || 120) * 60000); }
  const horaFin = a => { const f = finAud(a); return pad(f.getHours(), 2) + ':' + pad(f.getMinutes(), 2); };
  const sello = d => d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) + 'T' + pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + '00';
  function textoEvento(a) {
    const p = S.procesos.get(a.radicado);
    return { titulo: a.audiencia.tipo + ' · Proceso ' + fmtRad(p ? radInst(p) : a.radicado), detalle: 'Juzgado Universidad Central (simulación académica)\nProceso ' + fmtRad(p ? radInst(p) : a.radicado) + (p ? '\n' + (p.sujetos || []).map(s => s.tipo + ': ' + s.nombre).join('\n') : '') + '\nFijada en la actuación ' + pad(a.numero, 4) + (a.audiencia.lugar ? '\nSala: ' + a.audiencia.lugar : '') + (S.session && a.enlace_reunion ? '\nGoogle Meet: ' + a.enlace_reunion : '') };
  }
  function urlGoogleCalendar(a) {
    const e = textoEvento(a);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.titulo) + '&dates=' + sello(inicioAud(a)) + '/' + sello(finAud(a)) + '&ctz=America/Bogota&details=' + encodeURIComponent(e.detalle) + ((S.session && a.enlace_reunion) ? '&location=' + encodeURIComponent(a.enlace_reunion) : (a.audiencia.lugar ? '&location=' + encodeURIComponent(a.audiencia.lugar) : ''));
  }
  function textoIcs(a) {
    const utc = d => { const u = new Date(d.getTime() + 5 * 3600000); return u.getFullYear() + pad(u.getMonth() + 1, 2) + pad(u.getDate(), 2) + 'T' + pad(u.getHours(), 2) + pad(u.getMinutes(), 2) + '00Z'; };
    const e = textoEvento(a); const limpio = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Juzgado Universidad Central//Audiencias//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + a.codigo + '@juzgado-ucentral', 'DTSTAMP:' + utc(new Date(Date.now() - 5 * 3600000)), 'DTSTART:' + utc(inicioAud(a)), 'DTEND:' + utc(finAud(a)), 'SUMMARY:' + limpio(e.titulo), 'DESCRIPTION:' + limpio(e.detalle), (S.session && a.enlace_reunion) ? 'LOCATION:' + limpio(a.enlace_reunion) : (a.audiencia.lugar ? 'LOCATION:' + limpio(a.audiencia.lugar) : ''), (S.session && a.enlace_reunion) ? 'URL:' + a.enlace_reunion : '', 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + limpio(e.titulo), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  }
  function calendario() {
    const [y, m] = S.calMes.split('-').map(Number);
    const primero = new Date(y, m - 1, 1); const desfase = (primero.getDay() + 6) % 7; const dias = new Date(y, m, 0).getDate();
    const porDia = {}; listaAudiencias().forEach(a => { (porDia[a.audiencia.fecha] = porDia[a.audiencia.fecha] || []).push(a); });
    const fest = C.festivos(y); let celdas = '';
    for (let i = 0; i < desfase; i++) celdas += '<div class="cal-dia fuera" aria-hidden="true"></div>';
    for (let d = 1; d <= dias; d++) {
      const f = y + '-' + pad(m, 2) + '-' + pad(d, 2); const fecha = new Date(y, m - 1, d); const fin = fecha.getDay() === 0 || fecha.getDay() === 6;
      const ev = (porDia[f] || []).map(a => '<button class="cal-evento' + (S.calSel === a.codigo ? ' sel' : '') + '" data-a="aud-ver" data-c="' + a.codigo + '"><b>' + esc(a.audiencia.hora) + '</b> ' + esc(a.audiencia.tipo) + '</button>').join('');
      const puedeProg = esDespacho() && f >= hoy() && !fin && !fest.has(f);
      celdas += '<div class="cal-dia' + (f === hoy() ? ' hoy' : '') + (fin || fest.has(f) ? ' inhabil' : '') + '"><div class="cal-num">' + d + (fest.has(f) ? ' <span class="peq suave">Festivo</span>' : '') + (puedeProg ? '<button class="cal-mas" data-a="aud-nueva" data-f="' + f + '" aria-label="Programar audiencia el ' + esc(fechaLarga(f)) + '">+</button>' : '') + '</div>' + ev + '</div>';
    }
    const resto = (7 - ((desfase + dias) % 7)) % 7; for (let i = 0; i < resto; i++) celdas += '<div class="cal-dia fuera" aria-hidden="true"></div>';
    const titulo = MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1) + ' de ' + y;
    return '<div class="panel-cab"><h2>Calendario de audiencias</h2><div class="acciones"><button class="boton peq" data-a="mes" data-d="-1" aria-label="Mes anterior">Anterior</button><span class="cal-titulo">' + esc(titulo) + '</span><button class="boton peq" data-a="mes" data-d="1" aria-label="Mes siguiente">Siguiente</button><button class="boton peq" data-a="mes" data-d="0">Hoy</button></div></div><div class="cal-envoltura"><div class="cal">' + DIAS.map(d => '<div class="cal-cab">' + d + '</div>').join('') + celdas + '</div></div>';
  }
  function detalleAudiencia() {
    const a = S.acts.find(x => x.codigo === S.calSel); if (!a || !a.audiencia) return '';
    const p = S.procesos.get(a.radicado);
    const editar = esDespacho() ? '<form id="f-aud-editar" class="rejilla r3" data-c="' + a.codigo + '" style="margin-top:14px"><label for="ae-enlace">Enlace de Google Meet<input type="url" id="ae-enlace" value="' + esc(a.enlace_reunion || '') + '" placeholder="https://meet.google.com/abc-defg-hij"></label><label for="ae-sala">Sala<input type="text" id="ae-sala" value="' + esc(a.audiencia.lugar || '') + '"></label><div class="acciones"><button class="boton" type="submit">Actualizar enlace y sala</button><span class="peq" id="ae-msg"></span></div></form><p class="peq suave" style="margin:6px 0 0">Para cambiar la fecha o la hora, el despacho debe proferir un nuevo auto que fije la audiencia.</p>' : '';
    return '<section class="panel" id="aud-detalle"><div class="panel-cab"><h2>' + esc(a.audiencia.tipo) + '</h2><button class="boton peq" data-a="aud-cerrar">Cerrar</button></div><div class="ficha"><div>Proceso</div><div><a href="#p-' + a.radicado + '">' + fmtRad(p ? radInst(p) : a.radicado) + '</a>' + (p ? '<br><span class="peq">' + (p.sujetos || []).map(s => esc(s.tipo + ': ' + s.nombre)).join('<br>') + '</span>' : '') + '</div><div>Fecha</div><div>' + esc(fechaLarga(a.audiencia.fecha)) + '</div><div>Hora</div><div>' + esc(a.audiencia.hora + ' a ' + horaFin(a)) + ' (hora de Colombia)</div><div>Sala</div><div>' + esc(a.audiencia.lugar || 'Virtual') + '</div><div>Conexión</div><div>' + celdaEnlace(a) + '</div><div>Fijada en</div><div>Actuación ' + pad(a.numero, 4) + ': ' + esc(a.nombre) + ' (' + esc(a.fecha) + ')</div></div><div class="acciones" style="margin-top:14px"><a class="boton" href="' + esc(urlGoogleCalendar(a)) + '" target="_blank" rel="noopener">Agregar a Google Calendar</a><button class="boton" data-a="aud-ics" data-c="' + a.codigo + '">Descargar invitación (.ics)</button></div>' + editar + '</section>';
  }
  function formProgramar() {
    if (!esDespacho()) return '';
    const r = rol(); const tipos = (r === 'docente' ? TYPES : TYPES.filter(t => t.r.includes(r))).filter(t => t.aud);
    if (!tipos.length) return '<section class="panel" id="aud-programar"><h2>Programar audiencia</h2><p class="suave">Su rol no fija audiencias. Lo hacen el juez, el magistrado o el docente.</p></section>';
    const ps = [...S.procesos.values()].filter(p => p.estado !== 'Terminado').sort((a, b) => a.radicado.localeCompare(b.radicado));
    return '<form class="panel" id="f-aud-prog" novalidate><div class="panel-cab"><h2>Programar audiencia</h2><span class="peq suave">Se registra como auto que fija la audiencia, con número consecutivo y fijación en estado</span></div><div class="rejilla r2"><label for="ap-proc"><span class="ob">Proceso</span><select id="ap-proc">' + ps.map(p => '<option value="' + p.radicado + '"' + (S.radProc === p.radicado ? ' selected' : '') + '>' + fmtRad(radInst(p)) + ' · ' + esc((p.sujetos || []).map(s => s.nombre).join(' contra ')) + '</option>').join('') + '</select></label><label for="ap-tipo"><span class="ob">Audiencia</span><select id="ap-tipo">' + tipos.map(t => '<option value="' + t.k + '">' + esc(t.aud) + '</option>').join('') + '</select></label></div><div class="rejilla r3" style="margin-top:14px"><label for="ap-fecha"><span class="ob">Fecha</span><input type="date" id="ap-fecha" min="' + hoy() + '" value="' + esc(S.calNueva || '') + '"></label><label for="ap-hora"><span class="ob">Hora de inicio</span><input type="time" id="ap-hora" value="09:00" step="900"></label><label for="ap-dur">Duración<select id="ap-dur"><option value="60">1 hora</option><option value="90">1 hora y 30 minutos</option><option value="120" selected>2 horas</option><option value="180">3 horas</option><option value="240">4 horas</option></select></label></div><fieldset style="margin-top:14px"><legend>Conexión virtual</legend><div class="acciones"><a class="boton" href="https://meet.google.com/new" target="_blank" rel="noopener">Crear reunión en Google Meet</a><span class="peq suave">Se abre en otra pestaña. Copie el enlace de la reunión y péguelo abajo.</span></div><div class="rejilla r2"><label for="ap-enlace">Enlace de Google Meet<input type="url" id="ap-enlace" placeholder="https://meet.google.com/abc-defg-hij"></label><label for="ap-sala">Sala (si es presencial o mixta)<input type="text" id="ap-sala" placeholder="Sala de audiencias del Consultorio Jurídico"></label></div></fieldset><div class="rejilla r2" style="margin-top:14px"><label for="ap-firma"><span class="ob">Firmante</span><input type="text" id="ap-firma" value="' + esc(S.ultimaFirma || (S.perfil ? S.perfil.nombre : '')) + '"></label><div></div></div><label for="ap-anot" style="margin-top:14px"><span class="ob">Texto del auto</span><textarea id="ap-anot"></textarea></label><div class="acciones" style="margin-top:14px"><button class="boton principal" type="submit" id="ap-enviar">Programar y fijar en estado</button><span class="peq" id="ap-msg"></span></div></form>';
  }
  function textoAuto() {
    const t = TMAP[$('ap-tipo').value]; const f = $('ap-fecha').value, h = $('ap-hora').value, enl = $('ap-enlace').value.trim(), sala = $('ap-sala').value.trim();
    if (!t || !f || !h) return;
    const modo = enl && sala ? 'de manera mixta, en ' + sala + ' y por Google Meet' : enl ? 'de manera virtual por Google Meet' : sala ? 'de manera presencial en ' + sala : 'en la forma que oportunamente se comunique';
    $('ap-anot').value = 'Fija el ' + fechaLarga(f) + ', a las ' + h + ', para llevar a cabo la ' + t.aud.charAt(0).toLowerCase() + t.aud.slice(1) + ' (' + t.norma + '), que se realizará ' + modo + ' (Ley 2213 de 2022, art. 7). Se advierte a las partes y apoderados sobre su deber de comparecer.';
  }
  async function enviarProgramacion() {
    const v = id => ($(id) ? $(id).value.trim() : ''); const msg = $('ap-msg'); const k = v('ap-tipo'), t = TMAP[k];
    const f = v('ap-fecha'), h = v('ap-hora'), enl = v('ap-enlace'), rad = v('ap-proc'), dur = Number(v('ap-dur')) || 120; const falta = [];
    if (!rad) falta.push('proceso'); if (!f) falta.push('fecha'); if (!h) falta.push('hora'); if (!v('ap-firma')) falta.push('firmante'); if (!v('ap-anot')) falta.push('texto del auto');
    if (f && f < hoy()) falta.push('una fecha futura');
    if (f && !C.esHabil(C.parseD(f), vac())) falta.push('un día hábil (la fecha elegida es fin de semana, festivo o vacancia)');
    if (enl && !RE_MEET.test(enl)) falta.push('un enlace de Google Meet válido, del tipo https://meet.google.com/abc-defg-hij');
    if (!enl && !v('ap-sala')) falta.push('el enlace de Google Meet o la sala');
    if (falta.length) { msg.innerHTML = '<span style="color:var(--rojo)">Revise: ' + esc(falta.join('; ')) + '.</span>'; return; }
    const ini = new Date(...f.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)), ...h.split(':').map(Number)); const fin = new Date(ini.getTime() + dur * 60000);
    const choque = listaAudiencias().find(a => a.audiencia.fecha === f && inicioAud(a) < fin && finAud(a) > ini);
    if (choque) { msg.innerHTML = '<span style="color:var(--rojo)">El despacho ya tiene ese día una ' + esc(choque.audiencia.tipo.toLowerCase()) + ' de ' + esc(choque.audiencia.hora + ' a ' + horaFin(choque)) + '. Elija otra hora.</span>'; return; }
    $('ap-enviar').disabled = true; msg.textContent = 'Registrando el auto…';
    const a = { tipo: k, fecha: hoy(), anotacion: v('ap-anot'), firmante: v('ap-firma'), fecha_estado: siguienteHabil(hoy(), vac()), reservada: false, destinatarios: ['demandante', 'demandado', 'perito', 'secretaria'], enlaces: [], audiencia: { tipo: t.aud, fecha: f, hora: h, duracion: dur, lugar: v('ap-sala') }, enlace_reunion: enl || null };
    S.ultimaFirma = v('ap-firma');
    const r = await sb.rpc('radicar_actuacion', { p_radicado: rad, a: conComo(a) });
    if (r.error) { msg.innerHTML = '<span style="color:var(--rojo)">' + esc(traducirError(r.error)) + '</span>'; $('ap-enviar').disabled = false; return; }
    await cargarTodo(); S.calSel = r.data.codigo; S.calMes = f.slice(0, 7); S.calNueva = null; S.ultima = Object.assign({}, r.data, { anexos: [] });
    render(); mostrarConstancia(S.ultima, false, []); aviso('Audiencia programada');
  }
  function pAudiencias(p) { return filasAudiencias(actsDe(p.radicado).filter(a => a.audiencia && !a.anulada && visible(a)).sort((a, b) => (a.audiencia.fecha + a.audiencia.hora).localeCompare(b.audiencia.fecha + b.audiencia.hora)), false); }

  /* ---------- Radicación ---------- */
  function vRadicar() {
    const r = rol(); const ps = [...S.procesos.values()].filter(p => p.estado !== 'Terminado' || r === 'docente').sort((a, b) => a.radicado.localeCompare(b.radicado));
    const ini = inicialesPara(r); const sel = S.radProc || (ps[0] ? ps[0].radicado : '__nuevo');
    return '<form class="panel" id="f-radicar" novalidate><div class="panel-cab"><h2>Radicar actuación</h2><span class="marca activa">Radica como: ' + esc(nombreRol(r)) + '</span></div><div class="rejilla" style="gap:16px"><label for="f-proc"><span class="ob">Proceso</span><select id="f-proc">' + (ini.length ? '<option value="__nuevo"' + (sel === '__nuevo' ? ' selected' : '') + '>Nuevo proceso: radicar escrito inicial (asigna radicado)</option>' : '') + ps.map(p => '<option value="' + p.radicado + '"' + (p.radicado === sel ? ' selected' : '') + '>' + fmtRad(radInst(p)) + ' · ' + esc((p.sujetos || []).map(s => s.nombre).join(' contra ')) + '</option>').join('') + '</select></label><div id="f-din"></div></div></form>';
  }
  function opcionesTipo(lista) { const g = {}; lista.forEach(t => { (g[t.g] = g[t.g] || []).push(t); }); return Object.entries(g).map(([k, ts]) => '<optgroup label="' + esc(k) + '">' + ts.map(t => '<option value="' + t.k + '">' + esc(t.n) + '</option>').join('') + '</optgroup>').join(''); }
  function dinamicoRadicar() {
    const el = $('f-din'); if (!el) return; const r = rol(); const nuevo = $('f-proc').value === '__nuevo';
    const lista = nuevo ? inicialesPara(r).map(t => Object.assign({}, t, { g: 'Escrito inicial' })) : tiposPara(r);
    if (!lista.length) { el.innerHTML = '<p class="suave">Su rol no tiene actuaciones disponibles.</p>'; return; }
    let h = '<label for="f-tipo"><span class="ob">Actuación</span><select id="f-tipo">' + opcionesTipo(lista) + '</select></label><div id="f-info"></div>';
    if (nuevo) h += '<fieldset><legend>Sujetos procesales</legend><p class="peq suave" style="margin:0">Use nombres ficticios. No registre datos personales reales de terceros.</p><div class="rejilla r2"><label for="n-dte"><span class="ob">Demandante (titular de la marca)</span><input type="text" id="n-dte"></label><label for="n-dte-id">Identificación (NIT o cédula)<input type="text" id="n-dte-id"></label><label for="n-dte-ap"><span class="ob">Apoderado de la parte demandante</span><input type="text" id="n-dte-ap" placeholder="Nombre del equipo"></label><label for="n-ddo"><span class="ob">Demandado (presunto infractor)</span><input type="text" id="n-ddo"></label><label for="n-ddo-id">Identificación (NIT o cédula)<input type="text" id="n-ddo-id"></label><label for="n-ddo-ap">Apoderado de la parte demandada<input type="text" id="n-ddo-ap" placeholder="Nombre del equipo"></label></div></fieldset><fieldset><legend>Derecho marcario invocado</legend><div class="rejilla r2"><label for="n-signo"><span class="ob">Marca registrada</span><input type="text" id="n-signo"></label><label for="n-mtipo">Tipo de marca<select id="n-mtipo"><option>Nominativa</option><option>Mixta</option><option>Figurativa</option><option>Tridimensional</option><option>Sonora</option><option>Otra</option></select></label><label for="n-reg"><span class="ob">Certificado de registro</span><input type="text" id="n-reg"></label><label for="n-clases">Clases de la Clasificación de Niza<input type="text" id="n-clases" placeholder="Por ejemplo: 30 y 35"></label><label for="n-cuest"><span class="ob">Signo cuestionado</span><input type="text" id="n-cuest"></label><label for="n-prod">Productos o servicios<input type="text" id="n-prod"></label><label for="n-cuantia">Cuantía estimada<input type="text" id="n-cuantia" placeholder="Por ejemplo: cien millones de pesos ($100 000 000)"></label><label for="n-conoc">Fecha en que el titular conoció la infracción<input type="date" id="n-conoc"></label></div><p class="peq suave" id="n-presc"></p></fieldset>';
    h += '<div class="rejilla r3"><label for="f-fecha"><span class="ob">Fecha de la actuación</span><input type="date" id="f-fecha" value="' + hoy() + '"></label><label for="f-firma"><span class="ob">Firmante</span><input type="text" id="f-firma" value="' + esc(S.ultimaFirma || (S.perfil ? S.perfil.nombre : '')) + '" placeholder="Nombre y calidad"></label><label for="f-dias">Término (días hábiles)<input type="number" id="f-dias" min="0" max="120"></label></div><label for="f-anot"><span class="ob">Anotación</span><textarea id="f-anot" placeholder="Resumen de la actuación tal como aparecerá en el registro público"></textarea></label><div id="f-term" class="peq suave"></div><div id="f-aud"></div><div class="acciones"><label class="casilla" for="f-estado"><input type="checkbox" id="f-estado"> Fijar en estado electrónico</label><label class="casilla" for="f-res"><input type="checkbox" id="f-res"> Actuación reservada</label></div><fieldset><legend>Dirigida a</legend><div class="acciones">' + ['juez', 'secretaria', 'magistrado', 'demandante', 'demandado', 'perito'].map(k => '<label class="casilla" for="d-' + k + '"><input type="checkbox" id="d-' + k + '" class="f-dest" value="' + k + '"> ' + esc(nombreRol(k)) + '</label>').join('') + '</div></fieldset><fieldset><legend>Documentos</legend><label for="f-arch">Archivos PDF, imagen (PNG, JPG, WEBP) o texto, hasta 20 MB cada uno<input type="file" id="f-arch" multiple accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,.txt,text/plain"></label><label for="f-enlace">Enlace externo (Drive, OneDrive u otro repositorio)<input type="url" id="f-enlace" placeholder="https://"></label><p class="peq suave" style="margin:0">Convierta a PDF los documentos de Word antes de cargarlos.</p></fieldset><div class="acciones"><button class="boton principal" type="submit" id="f-enviar">Radicar</button><span class="peq" id="f-estado-envio"></span></div>';
    el.innerHTML = h; cambioTipo();
  }
  function cambioTipo() {
    const k = $('f-tipo').value, t = TMAP[k], r = rol(); const p = S.procesos.get($('f-proc').value);
    $('f-info').innerHTML = '<div class="nota"><b>Fundamento:</b> ' + esc(t.norma) + (t.ayuda ? '<br>' + esc(t.ayuda) : '') + '</div>';
    const desp = DESPACHO.includes(r);
    $('f-dias').value = t.d || ''; $('f-dias').disabled = !desp && !t.d;
    $('f-estado').checked = !!t.est; $('f-estado').disabled = !desp;
    $('f-res').checked = !!t.res;
    const inst = p ? p.instancia : 1;
    const provid = /^(auto|sentencia|comunicacion|traslado)/.test(k);
    const def = desp ? (provid ? ['demandante', 'demandado'] : ['juez']) : (inst >= 2 ? ['magistrado'] : ['juez', 'secretaria']);
    if (k === 'dictamen' || k === 'perito_aclara') def.push('demandante', 'demandado');
    document.querySelectorAll('.f-dest').forEach(c => { c.checked = def.includes(c.value); });
    $('f-aud').innerHTML = t.aud ? '<fieldset><legend>' + esc(t.aud) + '</legend><div class="rejilla r3"><label for="a-fecha"><span class="ob">Fecha</span><input type="date" id="a-fecha"></label><label for="a-hora"><span class="ob">Hora</span><input type="time" id="a-hora" value="09:00"></label><label for="a-dur">Duración<select id="a-dur"><option value="60">1 hora</option><option value="90">1 hora y 30 minutos</option><option value="120" selected>2 horas</option><option value="180">3 horas</option><option value="240">4 horas</option></select></label><label for="a-lugar">Sala<input type="text" id="a-lugar" placeholder="Sala de audiencias del Consultorio Jurídico"></label><label for="a-enlace">Enlace de Google Meet<input type="url" id="a-enlace" placeholder="https://meet.google.com/abc-defg-hij"></label></div><p class="peq suave" style="margin:0"><a href="https://meet.google.com/new" target="_blank" rel="noopener">Crear reunión en Google Meet</a> y pegar aquí el enlace.</p></fieldset>' : '';
    vistaTermino();
  }
  function vistaTermino() {
    const el = $('f-term'); if (!el) return; const t = TMAP[$('f-tipo').value];
    const dias = +$('f-dias').value || 0, fecha = $('f-fecha').value || hoy(), est = $('f-estado').checked;
    const base = est ? siguienteHabil(fecha, vac()) : fecha; let s = '';
    if (est) s += 'Fijación en estado: ' + fechaLarga(base) + '. ';
    if (dias > 0) { const tr = termino(base, dias, t.off || 0, vac()); s += (t.tl || 'Término') + ': ' + dias + ' días hábiles, del ' + fechaLarga(tr.inicio) + ' al ' + fechaLarga(tr.fin) + '.'; }
    el.textContent = s;
  }
  function notaPrescripcion() {
    const el = $('n-presc'); if (!el) return; const c = $('n-conoc').value; if (!c) { el.textContent = ''; return; }
    const lim = C.parseD(c); lim.setFullYear(lim.getFullYear() + 2); const l = ymd(lim);
    el.innerHTML = l >= hoy() ? 'Prescripción por conocimiento (Decisión 486 de 2000, art. 244): la acción puede ejercerse hasta el ' + esc(fechaLarga(l)) + ', sin perjuicio del plazo de cinco años desde la última comisión.' : '<span style="color:var(--rojo)">Han transcurrido más de dos años desde el conocimiento de la infracción (Decisión 486 de 2000, art. 244). Verifique la prescripción antes de radicar.</span>';
  }
  async function sha256(f) { try { const h = await crypto.subtle.digest('SHA-256', await f.arrayBuffer()); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return null; } }
  const nombreSeguro = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);

  async function enviarRadicacion(e) {
    e.preventDefault();
    const v = id => { const x = $(id); return x ? x.value.trim() : ''; };
    const st = $('f-estado-envio'), btn = $('f-enviar');
    const proc = v('f-proc'), nuevo = proc === '__nuevo', k = v('f-tipo'), t = TMAP[k];
    const falta = [];
    if (!v('f-anot')) falta.push('anotación'); if (!v('f-firma')) falta.push('firmante'); if (!v('f-fecha')) falta.push('fecha');
    if (nuevo) [['n-dte', 'demandante'], ['n-dte-ap', 'apoderado de la parte demandante'], ['n-ddo', 'demandado'], ['n-signo', 'marca registrada'], ['n-reg', 'certificado de registro'], ['n-cuest', 'signo cuestionado']].forEach(([i, n]) => { if (!v(i)) falta.push(n); });
    if (t.aud && (!v('a-fecha') || !v('a-hora'))) falta.push('fecha y hora de la audiencia');
    const enlace = v('f-enlace'); if (enlace && !/^https:\/\//i.test(enlace)) falta.push('enlace válido que inicie con https://');
    const enlaceAud = v('a-enlace'); if (t.aud && enlaceAud && !RE_MEET.test(enlaceAud)) falta.push('un enlace de Google Meet válido, del tipo https://meet.google.com/abc-defg-hij');
    const archivos = [...($('f-arch').files || [])];
    archivos.forEach(f => { if (f.size > 20971520) falta.push('“' + f.name + '” supera 20 MB'); else if (!MIMES.includes(f.type)) falta.push('“' + f.name + '” no es PDF, imagen o texto'); });
    if (falta.length) { st.innerHTML = '<span style="color:var(--rojo)">Revise: ' + esc(falta.join('; ')) + '.</span>'; return; }
    btn.disabled = true; st.textContent = 'Radicando…';
    try {
      const fecha = v('f-fecha'), dias = +v('f-dias') || 0, est = $('f-estado').checked;
      const fechaEstado = est ? siguienteHabil(fecha, vac()) : null;
      const tr = dias > 0 ? termino(fechaEstado || fecha, dias, t.off || 0, vac()) : null;
      const a = {
        tipo: k, fecha, anotacion: v('f-anot'), firmante: v('f-firma'),
        termino_dias: dias || null, termino_label: dias ? (t.tl || 'Término') : null,
        inicio_termino: tr ? tr.inicio : null, fin_termino: tr ? tr.fin : null, fecha_estado: fechaEstado,
        reservada: $('f-res').checked, destinatarios: [...document.querySelectorAll('.f-dest:checked')].map(c => c.value),
        enlaces: enlace ? [enlace] : [], audiencia: t.aud ? { tipo: t.aud, fecha: v('a-fecha'), hora: v('a-hora'), duracion: Number(v('a-dur')) || 120, lugar: v('a-lugar') } : null, enlace_reunion: t.aud && enlaceAud ? enlaceAud : null
      };
      S.ultimaFirma = v('f-firma');
      let res;
      if (nuevo) {
        res = await sb.rpc('radicar_inicial', { p: Object.assign(conComo({}), a, {
          sujetos: [{ tipo: 'Demandante', nombre: v('n-dte'), id: v('n-dte-id'), apoderado: v('n-dte-ap') }, { tipo: 'Demandado', nombre: v('n-ddo'), id: v('n-ddo-id'), apoderado: v('n-ddo-ap') }],
          marca: { signo: v('n-signo'), tipo: v('n-mtipo'), registro: v('n-reg'), clases: v('n-clases'), cuestionado: v('n-cuest'), productos: v('n-prod'), conocimiento: v('n-conoc') },
          cuantia: v('n-cuantia') }) });
      } else res = await sb.rpc('radicar_actuacion', { p_radicado: proc, a: conComo(a) });
      if (res.error) throw res.error;
      const act = res.data;
      const errores = []; const anexos = [];
      for (const f of archivos) {
        st.textContent = 'Cargando ' + f.name + '…';
        const ruta = act.radicado + '/' + act.codigo + '/' + Date.now() + '-' + nombreSeguro(f.name);
        const huella = await sha256(f);
        const up = await sb.storage.from('expedientes').upload(ruta, f, { contentType: f.type, upsert: false });
        if (up.error) { errores.push(f.name + ': ' + traducirError(up.error)); continue; }
        const ins = await sb.from('documentos').insert({ codigo: act.codigo, radicado: act.radicado, nombre: f.name, ruta, tamano: f.size, tipo: f.type, sha256: huella });
        if (ins.error) errores.push(f.name + ': ' + traducirError(ins.error)); else anexos.push({ nombre: f.name, sha256: huella });
      }
      S.radProc = act.radicado; S.ultima = Object.assign({}, act, { anexos });
      await cargarTodo();
      mostrarConstancia(S.ultima, nuevo, errores);
      render();
    } catch (err) { st.innerHTML = '<span style="color:var(--rojo)">No se pudo radicar: ' + esc(traducirError(err)) + '</span>'; btn.disabled = false; }
  }
  function textoConstancia(a) {
    const p = S.procesos.get(a.radicado) || { radicado: a.radicado, instancia: a.instancia };
    return ['Constancia de radicación (simulación académica)', 'Universidad Central, Consultorio Jurídico', '', 'Proceso: ' + fmtRad(radInst(p)), 'Actuación n.º ' + pad(a.numero, 4) + ', código ' + a.codigo, 'Tipo: ' + a.nombre, 'Fundamento: ' + ((TMAP[a.tipo] || {}).norma || ''), 'Fecha de la actuación: ' + fechaLarga(a.fecha), 'Registrada: ' + fechaHora(a.registrado), 'Radicó: ' + nombreRol(a.rol) + ', ' + a.firmante,
      a.fecha_estado ? 'Fijación en estado: ' + fechaLarga(a.fecha_estado) : '', a.fin_termino ? (a.termino_label + ': del ' + fechaLarga(a.inicio_termino) + ' al ' + fechaLarga(a.fin_termino)) : '', a.audiencia ? (a.audiencia.tipo + ': ' + fechaLarga(a.audiencia.fecha) + ', ' + a.audiencia.hora) : '',
      ...(a.anexos || []).map((d, i) => 'Anexo ' + (i + 1) + ': ' + d.nombre + ' (SHA-256 ' + (d.sha256 || 'no calculada') + ')')].filter(x => x !== '').join('\n');
  }
  function mostrarConstancia(a, nuevo, errores) {
    $('dialogo').innerHTML = '<div class="velo" data-a="cerrar"><div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dt" data-alto="1"><h2 id="dt">Actuación radicada</h2>' + (nuevo ? '<p>Se asignó el radicado <b class="mono">' + fmtRad(a.radicado) + '</b>.</p>' : '') + (errores && errores.length ? '<div class="nota error">No se cargaron estos archivos: ' + esc(errores.join('; ')) + '. Radique un memorial con los anexos faltantes.</div>' : '') + '<div class="constancia">' + esc(textoConstancia(a)) + '</div><div class="acciones"><button class="boton principal" data-a="copiar-constancia">Copiar constancia</button><a class="boton" href="#p-' + a.radicado + '" data-a="cerrar-ir">Ver expediente</a><button class="boton" data-a="cerrar">Cerrar</button></div></div></div>';
  }

  /* ---------- Estados, bandeja y agenda ---------- */
  function vEstados() {
    const d = S.estDate; const est = S.acts.filter(a => a.fecha_estado === d && !a.anulada && visible(a));
    const tras = S.acts.filter(a => !a.anulada && visible(a) && a.inicio_termino && a.inicio_termino <= d && a.fin_termino >= d && /traslado/i.test(a.termino_label || ''));
    const tabla = (lista, col) => lista.length ? '<div class="tabla"><table><thead><tr><th>Proceso</th><th>Demandante</th><th>Demandado</th><th>Actuación</th><th>' + col + '</th></tr></thead><tbody>' + lista.map(a => { const p = S.procesos.get(a.radicado) || { sujetos: [] }; const s = t => ((p.sujetos || []).find(x => x.tipo === t) || {}).nombre || ''; return '<tr><td class="num"><a href="#p-' + a.radicado + '">' + fmtRad(p.radicado ? radInst(p) : a.radicado) + '</a></td><td>' + esc(s('Demandante')) + '</td><td>' + esc(s('Demandado')) + '</td><td>' + esc(a.nombre) + '<br><span class="peq">' + esc(a.anotacion) + '</span></td><td class="num">' + (col === 'Fecha de la providencia' ? esc(a.fecha) : esc(a.inicio_termino + ' a ' + a.fin_termino)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vacio">Sin registros para esta fecha.</div>';
    return '<section class="panel"><div class="panel-cab"><h2>Estado electrónico del ' + esc(fechaLarga(d)) + '</h2><label for="est-fecha" class="peq">Fecha<input type="date" id="est-fecha" value="' + esc(d) + '"></label></div><p class="peq suave">Las providencias se insertan en el estado al día siguiente de su fecha (Código General del Proceso, art. 295; Ley 2213 de 2022, art. 9).</p>' + tabla(est, 'Fecha de la providencia') + '</section><section class="panel"><h2 style="margin-bottom:14px">Traslados en curso en esa fecha</h2>' + tabla(tras, 'Término') + '</section>';
  }
  /* ---------- Pendientes del despacho ---------- */
  const ROLES_PARTE = ['demandante', 'demandado', 'perito'];
  const ROLES_DESP = ['juez', 'secretaria', 'magistrado', 'docente'];
  const GRUPO_DECISION = { demanda: 'inicial', subsanacion: 'inicial', reforma: 'inicial', mc_previas: 'cautelar', mc_solicitud: 'cautelar', contestacion: 'contestacion', excep_previas: 'previas', objecion_jur: 'contestacion', pronunc_merito: 'tramite', reposicion: 'reposicion', apel_auto: 'apelacion', reparos: 'apelacion', sustentacion: 'sustentacion', nulidad: 'tramite', desistimiento: 'terminacion', conciliacion: 'terminacion' };
  const DECISIONES = {
    inicial: ['auto_admite', 'auto_inadmite', 'auto_rechaza'], cautelar: ['auto_mc', 'auto_niega_mc'],
    contestacion: ['traslado', 'auto_fija_inicial', 'auto_tramite'], previas: ['traslado', 'auto_previas'],
    reposicion: ['auto_reposicion'], apelacion: ['auto_concede_apel', 'auto_niega_apel'], sustentacion: ['traslado_sust', 'sentencia2'],
    terminacion: ['auto_termina', 'auto_tramite'], tramite: ['auto_tramite', 'auto_requiere']
  };
  function pendientes() {
    const out = [];
    for (const p of S.procesos.values()) {
      if (p.estado === 'Terminado') continue;
      const as = actsDe(p.radicado).filter(a => !a.anulada);
      const ult = as.filter(a => ROLES_DESP.includes(a.rol)).reduce((m, a) => Math.max(m, a.numero), 0);
      as.filter(a => ROLES_PARTE.includes(a.rol) && a.numero > ult && visible(a)).forEach(a => out.push({ p, a }));
    }
    return out.sort((x, y) => (x.a.registrado || '').localeCompare(y.a.registrado || ''));
  }
  function opcionesDecision(a) {
    const grupo = GRUPO_DECISION[a.tipo] || 'tramite'; const permitidos = new Set(tiposPara(rol()).map(t => t.k));
    return DECISIONES[grupo].filter(k => permitidos.has(k));
  }
  const nombreParte = (p, tipo) => (((p.sujetos || []).find(s => s.tipo === tipo)) || {}).nombre || '';
  function plantilla(k, p, a) {
    const dte = nombreParte(p, 'Demandante'), ddo = nombreParte(p, 'Demandado');
    const T = {
      auto_admite: 'Por reunir los requisitos de los artículos 82, 84 y 368 del Código General del Proceso, admite la demanda verbal por infracción de derechos de propiedad industrial promovida por ' + dte + ' contra ' + ddo.replace(/\.$/, '') + '. Ordena notificar personalmente a la parte demandada (CGP, arts. 291 y 292; Ley 2213 de 2022, art. 8) y correrle traslado por el término de veinte (20) días (CGP, art. 369). Reconoce personería al apoderado de la parte demandante.',
      auto_inadmite: 'Inadmite la demanda promovida por ' + dte + ' contra ' + ddo + ' por los siguientes defectos: [señale con precisión cada defecto]. Concede a la parte demandante el término de cinco (5) días para subsanarla, so pena de rechazo (CGP, art. 90).',
      auto_rechaza: 'Rechaza la demanda promovida por ' + dte + ' contra ' + ddo + ' por [indique la causal: falta de jurisdicción o de competencia, caducidad o falta de subsanación oportuna] (CGP, art. 90).',
      traslado: a.tipo === 'excep_previas' ? 'De las excepciones previas propuestas por la parte demandada se corre traslado a la parte demandante por el término de tres (3) días (CGP, arts. 101 y 110).' : 'De las excepciones de mérito propuestas por la parte demandada en la contestación se corre traslado a la parte demandante por el término de cinco (5) días (CGP, arts. 110 y 370).',
      auto_previas: 'Resuelve las excepciones previas propuestas por la parte demandada: [declara probada o no probada cada excepción y sus consecuencias] (CGP, art. 101).',
      auto_tramite: 'Agrega al expediente el escrito presentado por la ' + (a.rol === 'demandado' ? 'parte demandada' : a.rol === 'demandante' ? 'parte demandante' : 'perito') + ' (actuación ' + pad(a.numero, 4) + ') y dispone: [indique la decisión].',
      auto_requiere: 'Requiere a la ' + (a.rol === 'demandado' ? 'parte demandada' : 'parte demandante') + ' para que, en el término de [número] días, [indique la carga procesal].',
      auto_mc: 'Decreta las siguientes medidas cautelares: [describa cada medida] (Decisión 486 de 2000, arts. 245 a 247). Fija caución por [monto].',
      auto_niega_mc: 'Niega las medidas cautelares solicitadas porque [indique el requisito no acreditado] (Decisión 486 de 2000, art. 247).',
      auto_reposicion: 'Resuelve el recurso de reposición interpuesto contra [providencia]: [repone o no repone] (CGP, art. 318).',
      auto_concede_apel: 'Concede en el efecto [devolutivo, suspensivo o diferido] el recurso de apelación interpuesto contra [providencia] (CGP, arts. 322 y 323). Ordena remitir el expediente al superior.',
      auto_niega_apel: 'Niega por improcedente el recurso de apelación interpuesto contra [providencia] (CGP, arts. 321 y 322).',
      traslado_sust: 'De la sustentación del recurso de apelación se corre traslado a la parte no recurrente por el término de cinco (5) días (Ley 2213 de 2022, art. 12).',
      auto_termina: 'Declara terminado el proceso por [desistimiento, transacción o conciliación] y ordena su archivo (CGP, arts. 312 y 314).'
    };
    return T[k] || '';
  }
  function vPendientesDespacho() {
    const lista = pendientes();
    const dec = S.decidir ? lista.find(x => x.a.codigo === S.decidir.codigo) : null;
    const filas = lista.map(({ p, a }) => {
      const ops = opcionesDecision(a);
      return '<tr' + (dec && dec.a.codigo === a.codigo ? ' style="background:var(--fondo)"' : '') + '><td class="num"><a href="#p-' + p.radicado + '">' + fmtRad(radInst(p)) + '</a></td><td>' + esc(a.nombre) + '<br><span class="peq suave">' + esc(nombreRol(a.rol)) + ', ' + esc(fechaHora(a.registrado)) + '</span></td><td class="peq">' + esc(a.anotacion) + '</td><td>' + celdaDocs(a) + '</td><td><div class="acciones">' + (ops.length ? ops.map(k => '<button class="boton peq' + (k === 'auto_admite' ? ' principal' : '') + '" data-a="decidir" data-c="' + a.codigo + '" data-k="' + k + '">' + esc(ETIQUETA_DECISION[k] || TMAP[k].n) + '</button>').join('') : '<span class="peq suave">Corresponde a otro funcionario del despacho</span>') + '</div></td></tr>';
    }).join('');
    return '<section class="panel" id="pendientes"><div class="panel-cab"><h2>Escritos pendientes de decisión</h2><span class="peq suave">' + lista.length + ' escrito' + (lista.length === 1 ? '' : 's') + ' radicado' + (lista.length === 1 ? '' : 's') + ' por las partes después de la última actuación del despacho</span></div>' + (filas ? '<div class="tabla"><table><thead><tr><th>Proceso</th><th>Escrito</th><th>Contenido</th><th>Documentos</th><th>Decisión</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '<div class="vacio">No hay escritos pendientes. Cuando una parte radique una demanda, una contestación u otro escrito, aparecerá aquí para su análisis.</div>') + '</section>' + (dec ? formDecision(dec.p, dec.a, S.decidir.k) : '');
  }
  const ETIQUETA_DECISION = { auto_admite: 'Admitir', auto_inadmite: 'Inadmitir', auto_rechaza: 'Rechazar', traslado: 'Correr traslado', auto_fija_inicial: 'Fijar audiencia inicial', auto_tramite: 'Auto de trámite', auto_requiere: 'Requerir', auto_previas: 'Resolver excepciones previas', auto_mc: 'Decretar medidas', auto_niega_mc: 'Negar medidas', auto_reposicion: 'Resolver reposición', auto_concede_apel: 'Conceder apelación', auto_niega_apel: 'Negar apelación', traslado_sust: 'Correr traslado', sentencia2: 'Proferir sentencia', auto_termina: 'Terminar proceso' };
  function formDecision(p, a, k) {
    const t = TMAP[k]; const est = !!t.est; const base = est ? siguienteHabil(hoy(), vac()) : hoy();
    const tr = t.d ? termino(base, t.d, t.off || 0, vac()) : null;
    return '<form class="panel" id="f-decidir" data-c="' + a.codigo + '" data-k="' + k + '" data-r="' + p.radicado + '" novalidate><div class="panel-cab"><h2>' + esc(t.n) + '</h2><button class="boton peq" type="button" data-a="decidir-cerrar">Cancelar</button></div>' +
      '<div class="ficha"><div>Proceso</div><div>' + fmtRad(radInst(p)) + '<br><span class="peq">' + esc(nombreParte(p, 'Demandante')) + ' contra ' + esc(nombreParte(p, 'Demandado')) + '</span></div><div>Escrito analizado</div><div>Actuación ' + pad(a.numero, 4) + ': ' + esc(a.nombre) + ' (' + esc(nombreRol(a.rol)) + ', ' + esc(a.fecha) + ')<br><span class="peq">' + esc(a.anotacion) + '</span></div><div>Documentos del escrito</div><div>' + celdaDocs(a) + '</div><div>Fundamento</div><div>' + esc(t.norma) + '</div>' + (tr ? '<div>' + esc(t.tl || 'Término') + '</div><div>' + t.d + ' días hábiles, del ' + esc(fechaLarga(tr.inicio)) + ' al ' + esc(fechaLarga(tr.fin)) + '</div>' : '') + (est ? '<div>Notificación</div><div>Estado electrónico del ' + esc(fechaLarga(base)) + '</div>' : '') + '</div>' +
      '<label for="d-texto" style="margin-top:16px"><span class="ob">Texto de la providencia</span><textarea id="d-texto" style="min-height:150px">' + esc(plantilla(k, p, a)) + '</textarea></label><p class="peq suave" style="margin:4px 0 0">Complete los apartes entre corchetes antes de firmar.</p>' +
      '<div class="rejilla r2" style="margin-top:14px"><label for="d-firma"><span class="ob">Firmante</span><input type="text" id="d-firma" value="' + esc(S.ultimaFirma || (S.perfil ? S.perfil.nombre : '')) + '"></label><label for="d-arch">Providencia en PDF (opcional)<input type="file" id="d-arch" accept=".pdf,application/pdf"></label></div>' +
      '<div class="acciones" style="margin-top:14px"><button class="boton principal" type="submit" id="d-enviar">Firmar y ' + (est ? 'fijar en estado' : 'registrar') + '</button><span class="peq" id="d-msg"></span></div></form>';
  }
  async function subirAnexos(act, archivos, st) {
    const errores = [], anexos = [];
    for (const f of archivos) {
      if (st) st.textContent = 'Cargando ' + f.name + '…';
      const ruta = act.radicado + '/' + act.codigo + '/' + Date.now() + '-' + nombreSeguro(f.name);
      const huella = await sha256(f);
      const up = await sb.storage.from('expedientes').upload(ruta, f, { contentType: f.type, upsert: false });
      if (up.error) { errores.push(f.name + ': ' + traducirError(up.error)); continue; }
      const ins = await sb.from('documentos').insert({ codigo: act.codigo, radicado: act.radicado, nombre: f.name, ruta, tamano: f.size, tipo: f.type, sha256: huella });
      if (ins.error) errores.push(f.name + ': ' + traducirError(ins.error)); else anexos.push({ nombre: f.name, sha256: huella });
    }
    return { errores, anexos };
  }
  async function enviarDecision(f) {
    const k = f.dataset.k, t = TMAP[k], rad = f.dataset.r; const msg = $('d-msg'); const texto = $('d-texto').value.trim(), firma = $('d-firma').value.trim();
    const falta = []; if (!texto) falta.push('texto de la providencia'); if (!firma) falta.push('firmante'); if (/\[[^\]]*\]/.test(texto)) falta.push('completar los apartes entre corchetes');
    const arch = [...($('d-arch').files || [])]; arch.forEach(x => { if (x.type !== 'application/pdf') falta.push('“' + x.name + '” debe ser PDF'); else if (x.size > 20971520) falta.push('“' + x.name + '” supera 20 MB'); });
    if (falta.length) { msg.innerHTML = '<span style="color:var(--rojo)">Revise: ' + esc(falta.join('; ')) + '.</span>'; return; }
    $('d-enviar').disabled = true; msg.textContent = 'Registrando la providencia…';
    const fecha = hoy(); const fechaEstado = t.est ? siguienteHabil(fecha, vac()) : null; const tr = t.d ? termino(fechaEstado || fecha, t.d, t.off || 0, vac()) : null;
    const a = { tipo: k, fecha, anotacion: texto, firmante: firma, termino_dias: t.d || null, termino_label: t.d ? (t.tl || 'Término') : null, inicio_termino: tr ? tr.inicio : null, fin_termino: tr ? tr.fin : null, fecha_estado: fechaEstado, reservada: !!t.res, destinatarios: k === 'traslado' || k === 'traslado_sust' ? ['demandante', 'demandado', 'secretaria'] : ['demandante', 'demandado'], enlaces: [], audiencia: null };
    S.ultimaFirma = firma;
    const r = await sb.rpc('radicar_actuacion', { p_radicado: rad, a: conComo(a) });
    if (r.error) { msg.innerHTML = '<span style="color:var(--rojo)">' + esc(traducirError(r.error)) + '</span>'; $('d-enviar').disabled = false; return; }
    const { errores, anexos } = await subirAnexos(r.data, arch, msg);
    S.decidir = null; await cargarTodo(); await cargarDocsTodos();
    S.ultima = Object.assign({}, r.data, { anexos }); render(); mostrarConstancia(S.ultima, false, errores); aviso(t.n + ' registrado');
  }
  async function cargarDocsTodos() { S.docs = []; if (!rol()) return; const { data } = await sb.from('documentos').select('*').order('creado'); S.docs = data || []; }
  function vMisEscritos() {
    const r = rol(); const mios = pendientes().filter(x => x.a.rol === r);
    if (!mios.length) return '';
    return '<section class="panel"><div class="panel-cab"><h2>Mis escritos en análisis del despacho</h2></div><div class="tabla"><table><thead><tr><th>Proceso</th><th>Escrito</th><th>Radicado el</th><th>Documentos</th><th>Estado</th></tr></thead><tbody>' + mios.map(({ p, a }) => '<tr><td class="num"><a href="#p-' + p.radicado + '">' + fmtRad(radInst(p)) + '</a></td><td>' + esc(a.nombre) + '</td><td class="num">' + esc(fechaHora(a.registrado)) + '</td><td>' + celdaDocs(a) + '</td><td><span class="marca alerta">En análisis del despacho</span></td></tr>').join('') + '</tbody></table></div></section>';
  }
  function vBandeja() {
    const r = rol(); const vis = S.acts.filter(a => !a.anulada && visible(a));
    const mias = r === 'docente' ? vis : vis.filter(a => (a.destinatarios || []).includes(r));
    const terms = mias.filter(a => a.fin_termino && habilesHasta(a.fin_termino, hoy(), vac()) >= 0).sort((a, b) => a.fin_termino.localeCompare(b.fin_termino));
    const coms = mias.slice().sort((a, b) => (b.registrado || '').localeCompare(a.registrado || '')).slice(0, 50);
    const sev = n => n <= 1 ? 'critica' : n <= 3 ? 'alerta' : '';
    return (esDespacho() ? vPendientesDespacho() : vMisEscritos()) + '<section class="panel"><div class="panel-cab"><h2>Términos en curso</h2><span class="peq suave">' + (r === 'docente' ? 'Todos los procesos' : 'Dirigidos a: ' + esc(nombreRol(r))) + '</span></div>' + (terms.length ? '<div class="tabla"><table><thead><tr><th>Días hábiles restantes</th><th>Término</th><th>Proceso</th><th>Actuación que lo origina</th><th>Inicia</th><th>Vence</th></tr></thead><tbody>' + terms.map(a => { const n = habilesHasta(a.fin_termino, hoy(), vac()); return '<tr><td class="num"><span class="punto ' + sev(n) + '"></span>' + n + '</td><td>' + esc(a.termino_label || 'Término') + '</td><td class="num"><a href="#p-' + a.radicado + '">' + fmtRad(a.radicado) + '</a></td><td>' + esc(a.nombre) + '</td><td class="num">' + esc(a.inicio_termino) + '</td><td class="num">' + esc(a.fin_termino) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vacio">No hay términos en curso.</div>') + '</section><section class="panel"><h2 style="margin-bottom:14px">Comunicaciones recibidas</h2>' + (coms.length ? '<div class="tabla"><table><thead><tr><th>Registrada</th><th>Proceso</th><th>Actuación</th><th>Remite</th></tr></thead><tbody>' + coms.map(a => '<tr><td class="num">' + esc(fechaHora(a.registrado)) + '</td><td class="num"><a href="#p-' + a.radicado + '">' + fmtRad(a.radicado) + '</a></td><td>' + esc(a.nombre) + '<br><span class="peq">' + esc(a.anotacion) + '</span></td><td class="peq">' + esc(nombreRol(a.rol)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="vacio">Sin comunicaciones.</div>') + '</section>';
  }
  function vAgenda() {
    const l = listaAudiencias();
    return '<section class="panel">' + calendario() + (esDespacho() ? '<p class="peq suave" style="margin:10px 0 0">Use el signo + de un día hábil para programar una audiencia en esa fecha.</p>' : '') + '</section>' + detalleAudiencia() + formProgramar() + '<section class="panel"><h2 style="margin-bottom:14px">Próximas audiencias</h2>' + filasAudiencias(l.filter(a => a.audiencia.fecha >= hoy()), true) + '</section><section class="panel"><h2 style="margin-bottom:14px">Audiencias celebradas</h2>' + filasAudiencias(l.filter(a => a.audiencia.fecha < hoy()).reverse(), true) + '</section>';
  }

  /* ---------- Guía y aviso de privacidad ---------- */
  function vGuia() {
    return '<section class="panel"><h2 style="margin-bottom:12px">Ruta procesal de la simulación</h2><div class="texto-largo"><p>Proceso declarativo verbal por infracción de derechos sobre marca registrada, regido por el Código General del Proceso (CGP) y por la Decisión 486 de 2000 de la Comunidad Andina, que contiene el régimen común sobre propiedad industrial. Referente de competencia: la autoridad nacional con funciones jurisdiccionales en propiedad industrial (CGP, art. 24, num. 3, lit. a) o el juez civil, con segunda instancia ante la Sala Civil del Tribunal Superior. En segunda instancia aplica la consulta obligatoria ante el Tribunal de Justicia de la Comunidad Andina (TJCA).</p><p>Los términos se cuentan en días hábiles; se excluyen fines de semana y festivos (Ley 51 de 1983)' + (vac() ? ' y la vacancia judicial colectiva' : '') + '.</p></div>' + ETAPAS.map((e, i) => '<div class="ruta"><div class="n">' + (i + 1) + '</div><div><h3>' + esc(e.n) + '</h3><p class="peq" style="margin:4px 0"><b>Fundamento:</b> ' + esc(e.norma) + '. <b>Actúan:</b> ' + esc(e.q) + '.</p><p class="peq suave texto-largo" style="margin:0">' + esc(e.t) + '</p></div></div>').join('') + '</section><section class="panel"><h2 style="margin-bottom:12px">Reglas de funcionamiento</h2><div class="rejilla r2 peq"><div class="nota">Cada actuación recibe un número consecutivo dentro de su proceso y un código único (radicado y consecutivo). El escrito inicial asigna el radicado de 23 dígitos.</div><div class="nota">El radicado termina en 00 en primera instancia y en 01 cuando el expediente se remite al superior.</div><div class="nota">Las providencias marcadas para estado se fijan al día hábil siguiente; los términos corren desde el día siguiente a la notificación (CGP, arts. 118 y 295).</div><div class="nota">Las solicitudes y los autos de medidas cautelares quedan reservados para el despacho y para quien los radica, hasta que el despacho levante la reserva.</div><div class="nota alerta">Las actuaciones no se eliminan: el juez, el magistrado o el docente las anula con motivo y la anotación permanece visible.</div><div class="nota alerta">Los roles se validan en el servidor. Cada estudiante radica solo las actuaciones que corresponden al rol que le asignó el docente.</div></div></section>';
  }
  function vPrivacidad() {
    return '<section class="panel texto-largo"><h2 style="margin-bottom:12px">Aviso de privacidad y autorización de tratamiento de datos personales</h2>' +
      '<p><b>Responsable del tratamiento.</b> Universidad Central, NIT 860024746-1, carrera 5 n.º 21-38, Bogotá D. C. Canal de atención para consultas y reclamos: datospersonalessg@ucentral.edu.co. La plataforma es administrada por el docente moderador del Consultorio Jurídico.</p>' +
      '<p><b>Datos que se recogen.</b> Nombre, correo electrónico institucional, grupo o equipo, rol solicitado y asignado, registro de las actuaciones que usted radica (fecha, hora, firmante) y los documentos que carga.</p>' +
      '<p><b>Finalidad.</b> Gestionar la participación en la audiencia simulada del Consultorio Jurídico: verificar la pertenencia a la comunidad universitaria, asignar roles procesales, dejar trazabilidad de las actuaciones y permitir la evaluación académica.</p>' +
      '<p><b>Información pública.</b> La consulta abierta muestra el radicado, las partes ficticias del caso, la etapa y el registro de actuaciones con el rol procesal que las radica. No se publican nombres de usuarios, correos, firmantes ni documentos; estos solo son visibles para los participantes registrados con rol asignado.</p>' +
      '<p><b>Derechos del titular.</b> Usted puede conocer, actualizar y rectificar sus datos; solicitar prueba de la autorización; ser informado sobre el uso de sus datos; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización o solicitar la supresión de sus datos, y acceder a ellos en forma gratuita (Ley 1581 de 2012, art. 8).</p>' +
      '<p><b>Marco normativo.</b> Constitución Política, art. 15; Ley 1581 de 2012, arts. 9 y 12; Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015; Política de Protección de Datos Personales de la Universidad Central (Acuerdo del Consejo Superior 16 de 2018, modificado por el Acuerdo 13 de 2023).</p>' +
      '<p><b>Recomendación.</b> Use nombres ficticios para las partes del caso y no cargue documentos con datos personales reales de terceros.</p></section>';
  }

  /* ---------- Cuenta ---------- */
  function vIngresar() {
    if (S.session) return '<section class="panel"><h2>Sesión iniciada</h2><p>Ingresó como ' + esc(S.session.user.email) + '.</p><a class="boton principal" href="#consulta">Ir a la consulta</a></section>';
    return '<section class="panel" style="max-width:520px"><h2 style="margin-bottom:14px">Ingresar</h2><form id="f-ingresar" class="rejilla"><label for="i-correo"><span class="ob">Correo institucional</span><input type="email" id="i-correo" autocomplete="username" placeholder="usuario@' + DOM + '"></label><label for="i-clave"><span class="ob">Contraseña</span><input type="password" id="i-clave" autocomplete="current-password"></label><div class="acciones"><button class="boton principal" type="submit">Ingresar</button><a href="#recuperar">Olvidé mi contraseña</a></div><p class="peq" id="i-msg"></p></form><p class="peq suave">¿No tiene usuario? <a href="#registro">Cree su usuario con el correo institucional</a>.</p></section>';
  }
  function vRegistro() {
    if (S.session) return vIngresar();
    return '<section class="panel" style="max-width:720px"><h2 style="margin-bottom:6px">Crear usuario</h2><p class="peq suave">Solo se admiten correos institucionales @' + esc(DOM) + '. Recibirá un enlace de confirmación en su correo y, después, el docente moderador le asignará el rol procesal.</p><form id="f-registro" class="rejilla"><div class="rejilla r2"><label for="g-nombre"><span class="ob">Nombre completo</span><input type="text" id="g-nombre" autocomplete="name"></label><label for="g-correo"><span class="ob">Correo institucional</span><input type="email" id="g-correo" autocomplete="email" placeholder="usuario@' + DOM + '"></label><label for="g-clave"><span class="ob">Contraseña (mínimo 8 caracteres)</span><input type="password" id="g-clave" autocomplete="new-password"></label><label for="g-clave2"><span class="ob">Confirmar contraseña</span><input type="password" id="g-clave2" autocomplete="new-password"></label><label for="g-rol">Rol que solicita<select id="g-rol">' + ['demandante', 'demandado', 'juez', 'secretaria', 'magistrado', 'perito', 'observador'].map(k => '<option value="' + k + '">' + esc(nombreRol(k)) + '</option>').join('') + '</select></label><label for="g-grupo">Grupo o equipo<input type="text" id="g-grupo" placeholder="Por ejemplo: equipo A"></label></div><label class="casilla" for="g-auto"><input type="checkbox" id="g-auto"> <span>Autorizo a la Universidad Central el tratamiento de mis datos personales para las finalidades descritas en el <a href="#privacidad" target="_blank">aviso de privacidad</a>, conforme a la Ley 1581 de 2012.</span></label><div class="acciones"><button class="boton principal" type="submit">Crear usuario</button></div><p class="peq" id="g-msg"></p></form></section>';
  }
  function vRecuperar() { return '<section class="panel" style="max-width:520px"><h2 style="margin-bottom:14px">Recuperar contraseña</h2><form id="f-recuperar" class="rejilla"><label for="r-correo"><span class="ob">Correo institucional</span><input type="email" id="r-correo" placeholder="usuario@' + DOM + '"></label><button class="boton principal" type="submit">Enviar enlace</button><p class="peq" id="r-msg"></p></form></section>'; }
  function vNuevaClave() { return '<section class="panel" style="max-width:520px"><h2 style="margin-bottom:14px">Defina su nueva contraseña</h2><form id="f-nueva" class="rejilla"><label for="n-clave"><span class="ob">Nueva contraseña (mínimo 8 caracteres)</span><input type="password" id="n-clave" autocomplete="new-password"></label><button class="boton principal" type="submit">Guardar contraseña</button><p class="peq" id="n-msg"></p></form></section>'; }

  /* ---------- Administración ---------- */
  function vAdmin() {
    const filas = S.perfiles.map(u => '<tr><td>' + esc(u.nombre) + '</td><td>' + esc(u.correo) + '</td><td>' + esc(u.grupo || '') + '</td><td>' + esc(nombreRol(u.rol_solicitado)) + '</td><td class="num">' + esc(fechaHora(u.creado)) + '</td><td><select class="sel-rol" data-u="' + u.id + '" aria-label="Rol asignado a ' + esc(u.nombre) + '"><option value="">Sin asignar</option>' + Object.entries(ROLES).map(([k, n]) => '<option value="' + k + '"' + (u.rol === k ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></td></tr>').join('');
    const pend = S.perfiles.filter(u => !u.rol).length;
    const registrados = new Set(S.perfiles.map(u => u.correo));
    const pre = (S.preasignados || []).map(x => '<tr><td>' + esc(x.nombre || '') + '</td><td>' + esc(x.correo) + '</td><td>' + esc(nombreRol(x.rol)) + '</td><td>' + (registrados.has(x.correo) ? '<span class="marca activa">Registrado</span>' : '<span class="marca alerta">Pendiente de registro</span>') + '</td><td><button class="boton peq" data-a="quitar-pre" data-c="' + esc(x.correo) + '">Quitar</button></td></tr>').join('');
    const formPre = '<section class="panel"><div class="panel-cab"><h2>Preasignar roles</h2><span class="peq suave">El estudiante recibe el rol al crear su usuario con este correo</span></div><form id="f-pre" class="rejilla r3"><label for="pre-nombre">Nombre<input type="text" id="pre-nombre" placeholder="Nombre del estudiante"></label><label for="pre-correo"><span class="ob">Correo institucional</span><input type="email" id="pre-correo" placeholder="usuario@' + esc(DOM) + '"></label><label for="pre-rol"><span class="ob">Rol</span><select id="pre-rol">' + Object.entries(ROLES).filter(([k]) => k !== 'docente').map(([k, n]) => '<option value="' + k + '">' + esc(n) + '</option>').join('') + '</select></label><div class="acciones"><button class="boton principal" type="submit">Preasignar</button><span class="peq" id="pre-msg"></span></div></form>' + (pre ? '<div class="tabla" style="margin-top:16px"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th><span class="oculto">Acciones</span></th></tr></thead><tbody>' + pre + '</tbody></table></div>' : '') + '</section>';
    return formPre + '<section class="panel"><div class="panel-cab"><h2>Usuarios y roles</h2><span class="peq suave">' + S.perfiles.length + ' usuarios, ' + pend + ' pendientes de rol</span></div>' + (filas ? '<div class="tabla"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Grupo</th><th>Rol solicitado</th><th>Registro</th><th>Rol asignado</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '<div class="vacio">Aún no hay usuarios registrados.</div>') + '</section>' +
      '<form class="panel" id="f-ajustes"><h2 style="margin-bottom:14px">Datos del despacho simulado</h2><div class="rejilla r2"><label for="aj-d1">Despacho de primera instancia<input type="text" id="aj-d1" value="' + esc(S.ajustes.despacho1 || '') + '"></label><label for="aj-j">Juez<input type="text" id="aj-j" value="' + esc(S.ajustes.juez || '') + '"></label><label for="aj-d2">Despacho de segunda instancia<input type="text" id="aj-d2" value="' + esc(S.ajustes.despacho2 || '') + '"></label><label for="aj-m">Magistrado ponente<input type="text" id="aj-m" value="' + esc(S.ajustes.magistrado || '') + '"></label></div><label class="casilla" for="aj-vac" style="margin-top:14px"><input type="checkbox" id="aj-vac"' + (S.ajustes.vacancia ? ' checked' : '') + '> Descontar la vacancia judicial colectiva (Semana Santa, de lunes a miércoles, y del 20 de diciembre al 10 de enero)</label><div class="acciones" style="margin-top:14px"><button class="boton principal" type="submit">Guardar datos</button><button class="boton" type="button" data-a="respaldo">Copiar respaldo del expediente (JSON)</button></div></form>';
  }

  /* ---------- Eventos ---------- */
  function leerConsulta() {
    const g = id => { const x = $(id); return x ? x.value : undefined; }; const q = S.q;
    if (S.qmode === 'radicado') { q.rad = g('q-rad'); q.solo = g('q-solo'); }
    if (S.qmode === 'nombre') { q.tipo = g('q-tipo'); q.nom = g('q-nom'); }
    if (S.qmode === 'construir') { q.anio = g('c-anio'); q.cons = g('c-cons'); q.rec = g('c-rec'); }
    if (S.qmode === 'despacho') { q.inst = g('q-inst'); q.clase = g('q-clase'); q.etapa = g('q-etapa'); }
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'cerrar' && e.target.closest('[data-alto]') && !e.target.closest('button')) return;
    if (a === 'abrir' && !e.target.closest('a')) ir('p-' + b.dataset.r);
    else if (a === 'modo') { S.qmode = b.dataset.m; render(); }
    else if (a === 'limpiar') { S.q = {}; render(); }
    else if (a === 'pest') { S.ptab = b.dataset.t; render(); }
    else if (a === 'nuevo') { S.radProc = '__nuevo'; ir('radicar'); }
    else if (a === 'radicar-en') { S.radProc = b.dataset.r; ir('radicar'); }
    else if (a === 'cerrar' || a === 'cerrar-ir') $('dialogo').innerHTML = '';
    else if (a === 'salir') { await sb.auth.signOut(); aviso('Sesión cerrada'); }
    else if (a === 'copiar-constancia') { try { await navigator.clipboard.writeText(textoConstancia(S.ultima)); aviso('Constancia copiada'); } catch (x) { aviso('No se pudo copiar; seleccione el texto manualmente'); } }
    else if (a === 'copiar-acts') { const p = S.procesos.get(b.dataset.r); const txt = 'Proceso ' + fmtRad(radInst(p)) + '\n' + actsDe(p.radicado).filter(visible).sort((x, y) => x.numero - y.numero).map(x => pad(x.numero, 4) + ' | ' + x.fecha + ' | ' + x.nombre + ' | ' + x.anotacion + (x.fin_termino ? ' | Término del ' + x.inicio_termino + ' al ' + x.fin_termino : '') + (x.anulada ? ' | Anulada' : '')).join('\n'); try { await navigator.clipboard.writeText(txt); aviso('Listado copiado'); } catch (x) { aviso('No se pudo copiar'); } }
    else if (a === 'doc') {
      const w = window.open('', '_blank');
      const r = await sb.storage.from('expedientes').createSignedUrl(b.dataset.ruta, 300);
      if (r.error) { if (w) w.close(); aviso('No se pudo abrir el documento: ' + traducirError(r.error)); } else if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
    }
    else if (a === 'anular') {
      const act = S.acts.find(x => x.codigo === b.dataset.c);
      $('dialogo').innerHTML = '<div class="velo"><div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="an"><h2 id="an">Anular la actuación ' + pad(act.numero, 4) + '</h2><p class="peq suave">' + esc(act.nombre) + '. La actuación seguirá visible, tachada, con el motivo.</p><label for="an-mot"><span class="ob">Motivo</span><textarea id="an-mot"></textarea></label><p class="peq" id="an-err" style="color:var(--rojo)"></p><div class="acciones"><button class="boton principal" data-a="confirmar-anular" data-c="' + act.codigo + '">Anular</button><button class="boton" data-a="cerrar">Cancelar</button></div></div></div>';
    }
    else if (a === 'confirmar-anular') {
      const r = await sb.rpc('anular_actuacion', { p_codigo: b.dataset.c, p_motivo: ($('an-mot').value || '').trim() + ' (' + nombreRol(rol()) + ')' });
      if (r.error) { $('an-err').textContent = traducirError(r.error); return; }
      $('dialogo').innerHTML = ''; await cargarTodo(); render(); aviso('Actuación anulada');
    }
    else if (a === 'levantar') { const r = await sb.rpc('levantar_reserva', { p_codigo: b.dataset.c }); if (r.error) aviso(traducirError(r.error)); else { await cargarTodo(); render(); aviso('Reserva levantada'); } }
    else if (a === 'salir-como') { S.comoRol = null; S.decidir = null; render(); }
    else if (a === 'decidir') {
      const k = b.dataset.k;
      if (k === 'auto_fija_inicial') { const x = S.acts.find(y => y.codigo === b.dataset.c); S.radProc = x ? x.radicado : null; S.calNueva = null; ir('agenda'); setTimeout(() => { const el = $('f-aud-prog'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); return; }
      S.decidir = { codigo: b.dataset.c, k }; render(); const el = $('f-decidir'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    else if (a === 'decidir-cerrar') { S.decidir = null; render(); }
    else if (a === 'mes') { const d = Number(b.dataset.d); if (!d) S.calMes = hoy().slice(0, 7); else { const [y, m] = S.calMes.split('-').map(Number); const n = new Date(y, m - 1 + d, 1); S.calMes = n.getFullYear() + '-' + pad(n.getMonth() + 1, 2); } render(); }
    else if (a === 'aud-ver') { S.calSel = b.dataset.c; const x = S.acts.find(y => y.codigo === b.dataset.c); if (x && x.audiencia) S.calMes = x.audiencia.fecha.slice(0, 7); if (S.view !== 'agenda') ir('agenda'); else { render(); const el = $('aud-detalle'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
    else if (a === 'aud-cerrar') { S.calSel = null; render(); }
    else if (a === 'aud-nueva') { S.calNueva = b.dataset.f; render(); const el = $('aud-programar') || $('f-aud-prog'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const h = $('ap-hora'); if (h) h.focus(); }
    else if (a === 'aud-ics') { const x = S.acts.find(y => y.codigo === b.dataset.c); const url = URL.createObjectURL(new Blob([textoIcs(x)], { type: 'text/calendar;charset=utf-8' })); const enl = document.createElement('a'); enl.href = url; enl.download = 'audiencia-' + x.codigo + '.ics'; document.body.appendChild(enl); enl.click(); enl.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    else if (a === 'quitar-pre') { const r = await sb.rpc('quitar_preasignacion', { p_correo: b.dataset.c }); if (r.error) aviso(traducirError(r.error)); else { await cargarPerfiles(); render(); aviso('Preasignación retirada'); } }
    else if (a === 'respaldo') { const datos = { procesos: [...S.procesos.values()], actuaciones: S.acts, exportado: new Date().toISOString() }; try { await navigator.clipboard.writeText(JSON.stringify(datos, null, 2)); aviso('Respaldo copiado al portapapeles'); } catch (x) { aviso('No se pudo copiar'); } }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-a="abrir"]')) ir('p-' + e.target.dataset.r); if (e.key === 'Escape') $('dialogo').innerHTML = ''; });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'sel-como') { S.comoRol = t.value || null; S.decidir = null; S.radProc = null; if ((S.view === 'admin' && !esDocente()) || ((S.view === 'radicar' || S.view === 'bandeja') && !puedeRadicar())) ir('consulta'); else render(); aviso(S.comoRol ? 'Ahora ve la plataforma como ' + nombreRol(S.comoRol) : 'Volvió al perfil de docente'); return; }
    if (t.id === 'f-proc') { S.radProc = t.value; dinamicoRadicar(); }
    else if (t.id === 'f-tipo') cambioTipo();
    else if (['f-dias', 'f-fecha', 'f-estado'].includes(t.id)) vistaTermino();
    else if (t.id === 'n-conoc') notaPrescripcion();
    else if (['ap-tipo', 'ap-fecha', 'ap-hora', 'ap-enlace', 'ap-sala'].includes(t.id)) textoAuto();
    else if (t.id === 'ap-proc') S.radProc = t.value;
    else if (t.id === 'est-fecha') { S.estDate = t.value || hoy(); render(); }
    else if (t.id === 'sel-etapa') { const r = await sb.rpc('cambiar_etapa', { p_radicado: t.dataset.r, p_etapa: t.value }); if (r.error) aviso(traducirError(r.error)); else { await cargarTodo(); render(); aviso('Etapa actualizada'); } }
    else if (t.classList.contains('sel-rol')) { const r = await sb.rpc('asignar_rol', { p_usuario: t.dataset.u, p_rol: t.value }); if (r.error) aviso(traducirError(r.error)); else { await cargarPerfiles(); aviso('Rol asignado'); } }
    else if (S.view === 'consulta' && S.qmode === 'construir' && t.closest('#f-consulta')) { leerConsulta(); const el = $('c-prev'); if (el) el.innerHTML = 'Número construido: <span class="mono">' + esc(fmtRad(construido())) + '</span>'; }
  });
  document.addEventListener('input', e => { if (['f-dias', 'f-fecha'].includes(e.target.id)) vistaTermino(); });
  document.addEventListener('submit', async e => {
    const f = e.target; e.preventDefault();
    const v = id => ($(id) ? $(id).value.trim() : '');
    if (f.id === 'f-consulta') { leerConsulta(); $('resultados').innerHTML = resultados(); }
    else if (f.id === 'f-radicar') enviarRadicacion(e);
    else if (f.id === 'f-ingresar') {
      const msg = $('i-msg'); msg.textContent = 'Verificando…';
      const { error } = await sb.auth.signInWithPassword({ email: v('i-correo').toLowerCase(), password: $('i-clave').value });
      if (error) msg.innerHTML = '<span style="color:var(--rojo)">' + esc(traducirError(error)) + '</span>'; else ir('consulta');
    }
    else if (f.id === 'f-registro') {
      const msg = $('g-msg'); const correo = v('g-correo').toLowerCase(); const clave = $('g-clave').value; const fallas = [];
      if (v('g-nombre').length < 3) fallas.push('escriba su nombre completo');
      if (!new RegExp('^[^@\\s]+@' + DOM.replace(/\./g, '\\.') + '$').test(correo)) fallas.push('use su correo institucional @' + DOM);
      if (clave.length < 8) fallas.push('la contraseña debe tener al menos 8 caracteres');
      if (clave !== $('g-clave2').value) fallas.push('las contraseñas no coinciden');
      if (!$('g-auto').checked) fallas.push('debe autorizar el tratamiento de datos personales');
      if (fallas.length) { msg.innerHTML = '<span style="color:var(--rojo)">Revise: ' + esc(fallas.join('; ')) + '.</span>'; return; }
      msg.textContent = 'Creando usuario…';
      const { error } = await sb.auth.signUp({ email: correo, password: clave, options: { emailRedirectTo: BASE, data: { nombre: v('g-nombre'), grupo: v('g-grupo'), rol_solicitado: v('g-rol'), autoriza_datos: new Date().toISOString() } } });
      if (error) msg.innerHTML = '<span style="color:var(--rojo)">' + esc(traducirError(error)) + '</span>';
      else { f.reset(); msg.innerHTML = '<span style="color:var(--verde)">Usuario creado. Abra el enlace de confirmación que enviamos a ' + esc(correo) + ' y luego ingrese con su contraseña.</span>'; }
    }
    else if (f.id === 'f-recuperar') {
      const msg = $('r-msg'); const { error } = await sb.auth.resetPasswordForEmail(v('r-correo').toLowerCase(), { redirectTo: BASE });
      msg.innerHTML = error ? '<span style="color:var(--rojo)">' + esc(traducirError(error)) + '</span>' : 'Si el correo está registrado, recibirá un enlace para definir una nueva contraseña.';
    }
    else if (f.id === 'f-nueva') {
      const msg = $('n-msg'); const c = $('n-clave').value; if (c.length < 8) { msg.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
      const { error } = await sb.auth.updateUser({ password: c });
      if (error) msg.textContent = traducirError(error); else { S.recuperacion = false; aviso('Contraseña actualizada'); ir('consulta'); }
    }
    else if (f.id === 'f-aud-prog') enviarProgramacion();
    else if (f.id === 'f-decidir') enviarDecision(f);
    else if (f.id === 'f-aud-editar') {
      const msg = $('ae-msg'); const enl = v('ae-enlace');
      if (enl && !RE_MEET.test(enl)) { msg.innerHTML = '<span style="color:var(--rojo)">Use un enlace de Google Meet válido, del tipo https://meet.google.com/abc-defg-hij.</span>'; return; }
      const r = await sb.rpc('actualizar_audiencia', { p_codigo: f.dataset.c, p_enlace: enl, p_sala: v('ae-sala') });
      if (r.error) { msg.innerHTML = '<span style="color:var(--rojo)">' + esc(traducirError(r.error)) + '</span>'; return; }
      await cargarTodo(); render(); aviso('Datos de la audiencia actualizados');
    }
    else if (f.id === 'f-pre') {
      const msg = $('pre-msg'); const correo = v('pre-correo').toLowerCase();
      if (!new RegExp('^[^@\\s]+@' + DOM.replace(/\./g, '\\.') + '$').test(correo)) { msg.innerHTML = '<span style="color:var(--rojo)">Use un correo @' + esc(DOM) + '.</span>'; return; }
      const r = await sb.rpc('preasignar_rol', { p_correo: correo, p_rol: v('pre-rol'), p_nombre: v('pre-nombre') });
      if (r.error) { msg.innerHTML = '<span style="color:var(--rojo)">' + esc(traducirError(r.error)) + '</span>'; return; }
      await cargarPerfiles(); render(); aviso('Rol preasignado a ' + correo);
    }
    else if (f.id === 'f-ajustes') {
      const r = await sb.from('ajustes').update({ despacho1: v('aj-d1'), juez: v('aj-j') || null, despacho2: v('aj-d2'), magistrado: v('aj-m') || null, vacancia: $('aj-vac').checked, actualizado: new Date().toISOString() }).eq('id', 1);
      if (r.error) aviso(traducirError(r.error)); else { await cargarTodo(); render(); aviso('Datos guardados'); }
    }
  });

  /* ---------- Arranque ---------- */
  async function iniciar() {
    leerRuta();
    if (!sb) { S.cargando = false; render(); return; }
    const url = new URL(location.href);
    const errUrl = url.searchParams.get('error_description');
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    if (url.searchParams.has('code') || errUrl) {
      history.replaceState(null, '', BASE + (location.hash || '#consulta'));
      if (errUrl && !S.session) setTimeout(() => aviso('Su correo quedó confirmado o el enlace venció. Ingrese con su contraseña.'), 300);
    }
    await cargarPerfil(); await cargarTodo();
    if (S.view === 'proceso') await cargarDocs(S.proc);
    if (S.view === 'admin') await cargarPerfiles();
    if (S.view === 'bandeja') await cargarDocsTodos();
    S.cargando = false; render();
    sb.auth.onAuthStateChange(async (evento, sesion) => {
      const cambio = (sesion && sesion.user.id) !== (S.session && S.session.user.id);
      S.session = sesion;
      if (evento === 'PASSWORD_RECOVERY') { S.recuperacion = true; render(); return; }
      if (cambio || evento === 'SIGNED_OUT') {
        setTimeout(async () => { await cargarPerfil(); await cargarTodo(); if (S.view === 'proceso') await cargarDocs(S.proc); render(); }, 0);
      }
    });
    setInterval(async () => {
      if (document.hidden || S.view === 'radicar' || S.view === 'admin' || (S.view === 'agenda' && esDespacho()) || S.decidir) return;
      const ae = document.activeElement; if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
      await cargarTodo(); if (S.view === 'proceso') await cargarDocs(S.proc); render();
    }, 60000);
  }
  iniciar();
})();
