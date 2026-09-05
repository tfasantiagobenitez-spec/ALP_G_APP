/* Corre todas las suites de una. Ejecutar: node test/todos.js */
const { resumen } = require('./_harness.js');

const suites = [
  require('./calc.test.js'),
  require('./motor.test.js'),
  require('./solar.test.js'),
  require('./finanzas.test.js'),
  require('./riesgo.test.js'),
  require('./techo3d.test.js'),
];

suites.forEach(s => s());
process.exit(resumen() ? 1 : 0);
