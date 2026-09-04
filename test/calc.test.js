/* Test rápido del motor de cálculo. Ejecutar: node test/calc.test.js */
const assert = require('assert');
const Calc = require('../js/calc.js');

let fallos = 0;
function t(nombre, fn) {
  try { fn(); console.log('  ok   ' + nombre); }
  catch (e) { fallos++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}

console.log('calc.js');

t('num: acepta coma decimal y miles', () => {
  assert.strictEqual(Calc.num('8,05'), 8.05);
  assert.strictEqual(Calc.num('1.234,5'), 1234.5);
  assert.strictEqual(Calc.num('1430'), 1430);
  assert.strictEqual(Calc.num(''), 0);
  assert.strictEqual(Calc.num('', 7), 7);
});

t('arr: parsea string JSON y rellena', () => {
  assert.deepStrictEqual(Calc.arr('[1,2]', 3, 0), [1, 2, 0]);
  assert.deepStrictEqual(Calc.arr(null, 2, false), [false, false]);
});

t('irr: flujo simple conocido', () => {
  // -100, +60, +60 → TIR ≈ 13.07 %
  const r = Calc.irr([-100, 60, 60]);
  assert.ok(Math.abs(r - 0.1307) < 0.001, 'tir=' + r);
});

t('payback: interpolación', () => {
  assert.strictEqual(Calc.payback([-100, 40, 40, 40]), 2.5);
  assert.strictEqual(Calc.payback([-100, 10, 10]), null);
});

const pecorella = {
  kwp: '34.65', usd_kwp: '544.09', tc: '1430', pr: '78.2', irrad: '1828', deg: '0.5',
  tarifa_resto: '90.15', inflacion: '0', horizonte: '20', tasa_desc: '10',
  impData: '[{"nombre":"Impuestos","pct":10.5},{"nombre":"","pct":0},{"nombre":"","pct":0},{"nombre":"","pct":0},{"nombre":"","pct":0}]',
  genM: '[5275,4723,4296,3551,2853,2421,2568,3262,4029,4755,5136,5371]',
  conM: '[7300,7400,7300,7200,7300,7300,7300,7300,7300,7300,7300,7300]',
  conEst: '[true,false,true,false,true,true,true,true,true,true,true,true]',
  excModo: 'sin', tarifa_iny: '0',
  l_canon_kwp: '14', l_pago_ini: '4000', l_opcion: '3300', l_seguro: '726', l_mtto: '10800', lGanancias: 'si',
};

t('calcular: energía y ahorro año 1 (Pecorella)', () => {
  const r = Calc.calcular(pecorella);
  assert.strictEqual(r.genAnual, 48240);
  assert.strictEqual(r.autoAnual, 48240);          // toda la generación se autoconsume
  assert.strictEqual(r.excAnual, 0);
  assert.ok(Math.abs(r.tarifaFull - 99.61575) < 1e-6);
  assert.ok(Math.abs(r.ahorroAnual1 - 48240 * 99.61575) < 1e-3);
  assert.ok(Math.abs(r.capexUSD - 34.65 * 544.09) < 1e-6);
  assert.ok(Math.abs(r.capexARS - 34.65 * 544.09 * 1430) < 1e-3);
});

t('calcular: indicadores coherentes', () => {
  const r = Calc.calcular(pecorella);
  assert.strictEqual(r.anios.length, 20);
  assert.ok(r.van > 0, 'VAN positivo');
  assert.ok(r.tir > 0.1, 'TIR > tasa de descuento');
  assert.ok(r.payback > 5 && r.payback < 7, 'payback ~6 años: ' + r.payback);
  assert.ok(r.lcoeARS < r.tarifaFull, 'LCOE < tarifa');
  // degradación aplicada
  assert.ok(r.anios[19].gen < r.anios[0].gen);
  assert.ok(Math.abs(r.anios[1].gen / r.anios[0].gen - 0.995) < 1e-9);
});

t('calcular: excedente con inyección', () => {
  const e = Object.assign({}, pecorella, { conM: '[1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000]', excModo: 'iny', tarifa_iny: '50' });
  const r = Calc.calcular(e);
  assert.strictEqual(r.autoAnual, 12000);
  assert.strictEqual(r.excAnual, 48240 - 12000);
  assert.ok(Math.abs(r.ahorroAnual1 - (12000 * r.tarifaFull + 36240 * 50)) < 1e-3);
  const r2 = Calc.calcular(Object.assign({}, e, { excModo: 'sin' }));
  assert.ok(Math.abs(r2.ahorroAnual1 - 12000 * r.tarifaFull) < 1e-3);
});

t('calcular: inflación y recambio', () => {
  const e = Object.assign({}, pecorella, { inflacion: '20', incluirRecambio: 'si', recambio_pct: '10', recambio_cada: '11', opex_pct: '1' });
  const r = Calc.calcular(e);
  assert.ok(Math.abs(r.anios[1].ahorro / r.anios[0].ahorro - 1.2 * 0.995) < 1e-9);
  assert.ok(r.anios[10].recambio > 0 && r.anios[9].recambio === 0, 'recambio en año 11');
  assert.ok(Math.abs(r.anios[0].opex - r.capexARS * 0.01) < 1e-6);
});

t('calcular: leasing', () => {
  const r = Calc.calcular(pecorella);
  const L = r.leasing;
  assert.ok(Math.abs(L.canonMensual - 14 * 34.65) < 1e-9);
  assert.strictEqual(L.plazoMeses, 60);
  assert.ok(Math.abs(L.canonTotal - 14 * 34.65 * 60) < 1e-6);
  assert.ok(Math.abs(L.bruto - (4000 + L.canonTotal + 3300 + 726 * 5 + 10800 * 5)) < 1e-6);
  assert.ok(Math.abs(L.ahorroImp - (L.canonTotal + 726 * 5 + 10800 * 5) * 0.30) < 1e-6);
  assert.strictEqual(L.anios.length, 20);
  assert.ok(L.anios[4].costo > L.anios[3].costo, 'opción de compra en el año 5');
  assert.strictEqual(L.anios[5].escudo, 0);
});

t('calcular: datos con coma decimal', () => {
  const r = Calc.calcular(Object.assign({}, pecorella, { kwp: '4,6', usd_kwp: '1135,12', deg: '0,5' }));
  assert.ok(Math.abs(r.capexUSD - 4.6 * 1135.12) < 1e-6);
});

t('estimarGeneracion: suma ≈ kWp × irrad × PR', () => {
  const g = Calc.estimarGeneracion(10, 1800, 80);
  const s = g.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 14400) < 12, 'suma=' + s);
});

t('calcular: impacto ambiental (huella de carbono)', () => {
  const r = Calc.calcular(pecorella);
  assert.ok(r.co2AnualTon > 20 && r.co2AnualTon < 25, 'co2AnualTon ~ 21.7 ton');
  assert.ok(r.arbolesEq > 900, 'arboles equivalentes > 900');
  assert.ok(r.kmAutoEq > 100000, 'km auto equivalentes > 100k');
});

t('analisisSensibilidad: genera matrices completas', () => {
  const sens = Calc.analisisSensibilidad(pecorella);
  assert.strictEqual(sens.deltasTarifa.length, 5);
  assert.strictEqual(sens.matrizTarifaCapex.length, 5);
  assert.strictEqual(sens.matrizTarifaCapex[0].celdas.length, 5);
  assert.ok(typeof sens.matrizTarifaCapex[2].celdas[2].vanUSD === 'number');
  assert.strictEqual(sens.matrizInfTasa.length, 5);
});

t('plantillas: existen y calculan correctamente', () => {
  assert.ok(Calc.PLANTILLAS.residencial);
  assert.ok(Calc.PLANTILLAS.comercial);
  assert.ok(Calc.PLANTILLAS.industrial);
  const r = Calc.calcular(Calc.PLANTILLAS.residencial);
  assert.ok(r.van > 0);
});

t('calcular: almacenamiento con baterías (BESS)', () => {
  const e = Object.assign({}, pecorella, { incluirBateria: 'si', bat_kwh: '15', bat_usd_kwh: '400', bat_dod: '80' });
  const r = Calc.calcular(e);
  assert.strictEqual(r.capexBatUSD, 6000);
  assert.strictEqual(r.capexUSD, r.capexSolarUSD + 6000);
  assert.strictEqual(r.capUtilBat, 12);
  assert.ok(r.autonomiaHoras > 1);
});

t('generarPerfil24h: genera 24 puntos coherentes', () => {
  const p24 = Calc.generarPerfil24h(pecorella);
  assert.strictEqual(p24.length, 24);
  assert.strictEqual(p24[0].hora, 0);
  assert.strictEqual(p24[13].hora, 13);
  assert.ok(p24[13].gen > p24[0].gen);
});

t('generarPerfil24h: simula ciclado de batería correctamente', () => {
  const e = Object.assign({}, pecorella, { incluirBateria: 'si', bat_kwh: '20', bat_dod: '80', excModo: 'sin' });
  const p24 = Calc.generarPerfil24h(e);
  assert.strictEqual(p24.length, 24);
  const mediodia = p24[13];
  assert.ok(typeof mediodia.batCarga === 'number');
  assert.ok(typeof mediodia.batSoCPct === 'number');
});

t('dimensionarPorTecho: calcula paneles y potencia', () => {
  const r = Calc.dimensionarPorTecho({ areaM2: 150, tipoCubierta: 'chapa', panelWp: 575 });
  assert.ok(r.paneles > 35 && r.paneles < 50);
  assert.ok(r.kwp > 20);
  assert.strictEqual(r.tipoCubierta, 'chapa');
});

t('dimensionarPorConsumo: calcula kWp objetivo', () => {
  const r = Calc.dimensionarPorConsumo({ conAnual: 30000, coberturaPct: 75, irrad: 1800, pr: 83 });
  assert.ok(r.kwp > 12 && r.kwp < 20);
  assert.ok(r.paneles > 20);
  assert.ok(r.coberturaRealPct >= 70);
});

t('desglosePerdidas: calcula factores de pérdidas y PR resultante', () => {
  const r = Calc.desglosePerdidas({ tipoInst: 'chapa' });
  assert.strictEqual(r.perdidas.length, 6);
  assert.ok(r.prCalculadoPct > 75 && r.prCalculadoPct < 88);
  assert.ok(r.perdidaTotalPct > 12 && r.perdidaTotalPct < 25);
});

t('ciudades: base de datos completa', () => {
  assert.ok(Calc.CIUDADES_ARGENTINA.length >= 25);
  const ros = Calc.CIUDADES_ARGENTINA.find(c => c.id === 'ros');
  assert.strictEqual(ros.irrad, 1820);
});

console.log(fallos ? '\n' + fallos + ' test(s) fallaron' : '\nTodos los tests pasaron');
process.exit(fallos ? 1 : 0);


