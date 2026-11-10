// Genera 02_catalogo.sql a partir de js/catalogo.js para que el servidor
// valide roles y etapas con la misma fuente que usa la página.
// Uso: node supabase/generar_catalogo.js > supabase/02_catalogo.sql
const CAT = require('../js/catalogo.js');
const q = s => (s === null || s === undefined) ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const arr = a => "array[" + a.map(q).join(',') + "]::text[]";
const out = [];
out.push('-- Generado automáticamente desde js/catalogo.js. No lo edite a mano.');
out.push('begin;');
out.push('insert into public.etapas (k, orden, nombre) values');
out.push(CAT.ETAPAS.map((e, i) => `  (${q(e.k)}, ${i + 1}, ${q(e.n)})`).join(',\n'));
out.push('on conflict (k) do update set orden = excluded.orden, nombre = excluded.nombre;');
const tipos = {};
CAT.TYPES.forEach(t => { tipos[t.k] = { k: t.k, n: t.n, r: [...t.r], et: t.et || null, inst: t.inst || null, fin: !!t.fin, ini: false, cur: true }; });
CAT.INICIALES.forEach(t => {
  const x = tipos[t.k];
  if (x) { x.ini = true; x.n = t.n; x.r = [...new Set(x.r.concat(t.r))]; }
  else tipos[t.k] = { k: t.k, n: t.n, r: [...t.r], et: t.et || null, inst: null, fin: false, ini: true, cur: false };
});
out.push('insert into public.tipos_actuacion (k, nombre, roles, etapa, instancia, termina, inicial, en_curso) values');
out.push(Object.values(tipos).map(t => `  (${q(t.k)}, ${q(t.n)}, ${arr(t.r)}, ${q(t.et)}, ${t.inst === null ? 'null' : t.inst}, ${t.fin}, ${t.ini}, ${t.cur})`).join(',\n'));
out.push('on conflict (k) do update set nombre = excluded.nombre, roles = excluded.roles, etapa = excluded.etapa,');
out.push('  instancia = excluded.instancia, termina = excluded.termina, inicial = excluded.inicial, en_curso = excluded.en_curso;');
out.push('commit;');
console.log(out.join('\n'));
