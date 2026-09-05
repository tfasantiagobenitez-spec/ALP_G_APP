/* Monte Carlo y tornado. Ejecutar: node test/riesgo.test.js */
const assert = require('assert');
const R = require('../js/riesgo.js');
const Calc = require('../js/calc.js');
const { t, seccion, correrSuelta } = require('./_harness.js');

const BASE = Calc.PLANTILLAS.industrial;

function suite() {
  seccion('riesgo.js');

  t('generador: mismo resultado con la misma semilla', () => {
    const a = R.generador(42), b = R.generador(42), c = R.generador(43);
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    assert.deepStrictEqual(sa, sb, 'reproducible');
    assert.notDeepStrictEqual(sa, sc, 'semillas distintas dan series distintas');
    sa.forEach(x => assert.ok(x >= 0 && x < 1, 'dentro de [0,1): ' + x));
  });

  t('normal: media cerca de cero y desvío cerca de uno', () => {
    const rnd = R.generador(7);
    const n = 20000;
    let suma = 0, suma2 = 0;
    for (let i = 0; i < n; i++) { const z = R.normal(rnd); suma += z; suma2 += z * z; }
    const media = suma / n, varianza = suma2 / n - media * media;
    assert.ok(Math.abs(media) < 0.03, 'media ' + media);
    assert.ok(Math.abs(Math.sqrt(varianza) - 1) < 0.03, 'desvío ' + Math.sqrt(varianza));
  });

  t('percentil: interpola entre valores ordenados', () => {
    const v = [0, 10, 20, 30, 40];
    assert.strictEqual(R.percentil(v, 0), 0);
    assert.strictEqual(R.percentil(v, 1), 40);
    assert.strictEqual(R.percentil(v, 0.5), 20);
    assert.strictEqual(R.percentil(v, 0.25), 10);
    assert.strictEqual(R.percentil([], 0.5), 0, 'sin datos devuelve cero');
  });

  t('histograma: cubre todos los casos sin perder ninguno', () => {
    const v = [];
    for (let i = 0; i < 500; i++) v.push(i);
    const bins = R.histograma(v, 20);
    assert.strictEqual(bins.length, 20);
    assert.strictEqual(bins.reduce((s, b) => s + b.n, 0), 500);
    assert.ok(bins[0].desde <= 0 && bins[19].hasta >= 499);
  });

  t('Monte Carlo: estructura completa y percentiles ordenados', () => {
    const mc = Calc.analisisMontecarlo(BASE, { n: 300 });
    assert.strictEqual(mc.n, 300);
    assert.strictEqual(mc.vanes.length, 300);
    assert.ok(mc.p10 <= mc.p50 && mc.p50 <= mc.p90, 'percentiles ordenados');
    assert.ok(mc.min <= mc.p10 && mc.p90 <= mc.max);
    assert.ok(mc.probPositivo >= 0 && mc.probPositivo <= 100);
    assert.ok(mc.desvio > 0, 'hay dispersión');
    assert.strictEqual(mc.histograma.reduce((s, b) => s + b.n, 0), 300);
    for (let i = 1; i < mc.vanes.length; i++) assert.ok(mc.vanes[i] >= mc.vanes[i - 1], 'la muestra queda ordenada');
  });

  t('Monte Carlo: el mismo proyecto da siempre el mismo resultado', () => {
    const a = Calc.analisisMontecarlo(BASE, { n: 200 });
    const b = Calc.analisisMontecarlo(BASE, { n: 200 });
    assert.strictEqual(a.p50, b.p50);
    assert.strictEqual(a.media, b.media);
    assert.strictEqual(a.probPositivo, b.probPositivo);
    const c = Calc.analisisMontecarlo(BASE, { n: 200, semilla: 999 });
    assert.notStrictEqual(a.p50, c.p50, 'otra semilla, otro sorteo');
  });

  t('Monte Carlo: más incertidumbre ensancha la distribución', () => {
    const poca = Calc.analisisMontecarlo(BASE, { n: 400, variables: { tarifa_resto: 2, usd_kwp: 2, inflacion: 0, devaluacion: 0, genM: 1, deg: 0 } });
    const mucha = Calc.analisisMontecarlo(BASE, { n: 400, variables: { tarifa_resto: 25, usd_kwp: 25, inflacion: 0, devaluacion: 0, genM: 1, deg: 0 } });
    assert.ok(mucha.desvio > poca.desvio * 2, 'la dispersión crece con la incertidumbre');
    assert.ok(mucha.p90 - mucha.p10 > poca.p90 - poca.p10, 'el rango P10-P90 se ensancha');
  });

  t('Monte Carlo: un proyecto flojo tiene poca probabilidad de dar positivo', () => {
    const bueno = Calc.analisisMontecarlo(Calc.PLANTILLAS.parque, { n: 300 });
    const flojo = Calc.analisisMontecarlo(Calc.PLANTILLAS.residencial, { n: 300 });
    assert.ok(bueno.probPositivo > flojo.probPositivo, 'el parque es más seguro que el residencial');
    assert.ok(bueno.probPositivo > 80, 'probabilidad del parque ' + bueno.probPositivo);
  });

  t('Monte Carlo: sin variables inciertas no hay dispersión', () => {
    const mc = Calc.analisisMontecarlo(BASE, {
      n: 60, variables: { genM: 0, tarifa_resto: 0, usd_kwp: 0, inflacion: 0, devaluacion: 0, deg: 0 },
    });
    assert.ok(mc.desvio < 1e-6, 'todos los escenarios son iguales');
    assert.ok(Math.abs(mc.p10 - mc.p90) < 1e-6);
    assert.strictEqual(mc.variables.length, 0);
  });

  t('tornado: ordenado por amplitud y con peso relativo normalizado', () => {
    const tor = Calc.analisisTornado(BASE);
    assert.ok(tor.filas.length >= 5);
    for (let i = 1; i < tor.filas.length; i++) {
      assert.ok(tor.filas[i].amplitud <= tor.filas[i - 1].amplitud, 'ordenado de mayor a menor');
    }
    assert.ok(Math.abs(tor.filas[0].pesoRelativo - 100) < 1e-9, 'la primera pesa 100 %');
    tor.filas.forEach(f => {
      assert.ok(f.pesoRelativo >= 0 && f.pesoRelativo <= 100);
      assert.ok(isFinite(f.vanBajo) && isFinite(f.vanAlto));
      assert.ok(f.nombre && f.detalle, 'cada variable se explica');
    });
  });

  t('tornado: el sentido de cada variable es el esperado', () => {
    const tor = Calc.analisisTornado(BASE);
    const de = c => tor.filas.find(f => f.clave === c);
    assert.ok(de('tarifa_resto').vanAlto > de('tarifa_resto').vanBajo, 'más tarifa, más VAN');
    assert.ok(de('usd_kwp').vanAlto < de('usd_kwp').vanBajo, 'más CAPEX, menos VAN');
    assert.ok(de('genM').vanAlto > de('genM').vanBajo, 'más generación, más VAN');
    assert.ok(de('deg').vanAlto < de('deg').vanBajo, 'más degradación, menos VAN');
    assert.ok(de('devaluacion').vanAlto < de('devaluacion').vanBajo, 'más devaluación, menos VAN en dólares');
  });

  t('tornado: el VAN base coincide con el del motor', () => {
    const tor = Calc.analisisTornado(BASE);
    assert.ok(Math.abs(tor.vanBase - Calc.calcular(BASE).vanUSD) < 1e-9);
  });

  t('tornado: mover más desvíos amplía el recorrido', () => {
    const corto = Calc.analisisTornado(BASE, { desvios: 1 });
    const largo = Calc.analisisTornado(BASE, { desvios: 3 });
    assert.ok(largo.maxAmplitud > corto.maxAmplitud);
  });
}

module.exports = suite;
if (require.main === module) correrSuelta(suite);
