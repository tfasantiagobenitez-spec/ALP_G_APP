/* Arnés mínimo compartido por las suites. Sin dependencias. */
let fallos = 0, corridos = 0;

function t(nombre, fn) {
  corridos++;
  try { fn(); console.log('  ok   ' + nombre); }
  catch (e) { fallos++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}

function seccion(nombre) { console.log('\n' + nombre); }

function resumen() {
  console.log(fallos
    ? '\n' + fallos + ' de ' + corridos + ' test(s) fallaron'
    : '\n' + corridos + ' tests, todos pasaron');
  return fallos;
}

/** Corre una suite sola cuando el archivo se ejecuta directo con node. */
function correrSuelta(suite) {
  suite();
  process.exit(resumen() ? 1 : 0);
}

module.exports = { t, seccion, resumen, correrSuelta };
