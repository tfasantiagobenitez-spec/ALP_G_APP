/* Alternativas de financiamiento. Ejecutar: node test/finanzas.test.js */
const assert = require('assert');
const F = require('../js/finanzas.js');
const Calc = require('../js/calc.js');
const { t, seccion, correrSuelta } = require('./_harness.js');

function suite() {
  seccion('finanzas.js');

  t('cuota francesa: fórmula conocida', () => {
    // 100.000 al 1 % mensual en 12 meses da 8.884,88
    const c = F.cuotaFrances(100000, 0.01, 12);
    assert.ok(Math.abs(c - 8884.88) < 0.05, 'cuota ' + c);
    assert.ok(Math.abs(F.cuotaFrances(120000, 0, 12) - 10000) < 1e-9, 'sin interés la cuota es capital sobre plazo');
    assert.strictEqual(F.cuotaFrances(1000, 0.02, 0), 0, 'sin plazo no hay cuota');
  });

  t('sistema francés: cuota constante y capital que se cancela', () => {
    const filas = F.tablaPrestamo({ monto: 100000, plazoMeses: 24, tasaAnual: 24, sistema: 'frances' });
    assert.strictEqual(filas.length, 24);
    const primera = filas[0].cuota, ultima = filas[23].cuota;
    assert.ok(Math.abs(primera / ultima - 1) < 0.01, 'la cuota es prácticamente constante');
    assert.ok(filas[23].saldo < 1e-6, 'el saldo final es cero');
    const capital = filas.reduce((s, f) => s + f.amortizacion, 0);
    assert.ok(Math.abs(capital - 100000) < 0.01, 'la suma de amortizaciones devuelve el capital');
    assert.ok(filas[0].interes > filas[23].interes, 'el interés decrece');
    assert.ok(filas[0].amortizacion < filas[23].amortizacion, 'la amortización crece');
  });

  t('sistema alemán: amortización constante y cuota decreciente', () => {
    const filas = F.tablaPrestamo({ monto: 120000, plazoMeses: 12, tasaAnual: 24, sistema: 'aleman' });
    assert.strictEqual(filas.length, 12);
    assert.ok(Math.abs(filas[0].amortizacion - 10000) < 0.01, 'amortización pareja');
    assert.ok(Math.abs(filas[10].amortizacion - 10000) < 0.01);
    assert.ok(filas[0].cuota > filas[11].cuota, 'la cuota baja mes a mes');
    assert.ok(filas[11].saldo < 1e-6, 'termina en cero');
  });

  t('préstamo ajustable: el capital indexado sube la cuota', () => {
    const fijo = F.tablaPrestamo({ monto: 100000, plazoMeses: 36, tasaAnual: 8, sistema: 'frances', ajusteAnual: 0 });
    const uva = F.tablaPrestamo({ monto: 100000, plazoMeses: 36, tasaAnual: 8, sistema: 'frances', ajusteAnual: 30 });
    assert.ok(uva[35].cuota > fijo[35].cuota * 2, 'con 30 % de ajuste anual la última cuota se dispara');
    assert.ok(uva[0].cuota > fijo[0].cuota, 'ya la primera cuota es mayor');
    assert.ok(uva[35].saldo < 1e-6, 'igual termina cancelado');
  });

  t('préstamo sin capital o sin plazo no genera cuotas', () => {
    assert.strictEqual(F.tablaPrestamo({ monto: 0, plazoMeses: 12, tasaAnual: 10 }).length, 0);
    assert.strictEqual(F.tablaPrestamo({ monto: 1000, plazoMeses: 0, tasaAnual: 10 }).length, 0);
  });

  t('agrupación por año reparte las cuotas correctamente', () => {
    const filas = F.tablaPrestamo({ monto: 120000, plazoMeses: 30, tasaAnual: 12, sistema: 'frances' });
    const anual = F.porAnio(filas, 5);
    assert.strictEqual(anual.length, 5);
    const total = anual.reduce((s, a) => s + a.cuota, 0);
    const totalFilas = filas.reduce((s, f) => s + f.cuota, 0);
    assert.ok(Math.abs(total - totalFilas) < 0.01, 'no se pierde ninguna cuota');
    // 30 meses ocupan los años 1, 2 y 3; el cuarto ya no tiene cuotas
    assert.ok(anual[2].cuota > 0 && anual[3].cuota === 0, 'el préstamo termina en el año 3');
    assert.ok(anual[2].cuota < anual[1].cuota, 'el último año solo tiene seis cuotas');
  });

  t('costo financiero total: mayor que la tasa nominal', () => {
    const filas = F.tablaPrestamo({ monto: 100000, plazoMeses: 24, tasaAnual: 24, sistema: 'frances' });
    const cft = F.costoFinanciero(100000, filas);
    // 24 % nominal anual capitalizado mensualmente da 26,8 % efectivo
    assert.ok(Math.abs(cft - 0.2682) < 0.005, 'CFT ' + cft);
    const conGastos = F.costoFinanciero(97000, filas);
    assert.ok(conGastos > cft, 'los gastos de otorgamiento encarecen el crédito');
  });

  const base = Object.assign({}, Calc.PLANTILLAS.industrial, {
    pr_monto_pct: '70', pr_tasa: '12', pr_plazo: '60', pr_sistema: 'frances', pr_moneda: 'usd', pr_gastos_pct: '2',
    ppa_tarifa: '0.06', ppa_plazo: '15', ppa_ajuste: '2', ppa_opcion: '15000',
  });

  t('comparador: aparecen las cuatro alternativas', () => {
    const r = Calc.calcular(base);
    const claves = r.financiamiento.filas.map(f => f.clave);
    assert.deepStrictEqual(claves, ['contado', 'leasing', 'prestamo', 'ppa']);
    assert.ok(r.financiamiento.mejor, 'se elige una mejor opción');
    assert.strictEqual(r.financiamiento.filas.filter(f => f.mejor).length, 1, 'una sola marcada como mejor');
  });

  t('comparador: sin préstamo ni PPA quedan solo contado y leasing', () => {
    const r = Calc.calcular(Object.assign({}, base, { pr_monto_pct: '0', ppa_tarifa: '0' }));
    assert.deepStrictEqual(r.financiamiento.filas.map(f => f.clave), ['contado', 'leasing']);
    assert.strictEqual(r.prestamo, null);
    assert.strictEqual(r.ppa, null);
  });

  t('préstamo: el aporte propio es lo que no se financia más los gastos', () => {
    const r = Calc.calcular(base);
    const pr = r.prestamo;
    assert.ok(Math.abs(pr.capitalUSD - r.capexUSD * 0.7) < 1e-6);
    assert.ok(Math.abs(pr.gastosUSD - pr.capitalUSD * 0.02) < 1e-6);
    assert.ok(Math.abs(pr.aporteUSD - (r.capexUSD * 0.3 + pr.gastosUSD)) < 1e-6);
    assert.ok(pr.aporteUSD < r.capexUSD, 'se desembolsa menos que comprando al contado');
    assert.strictEqual(pr.filas.length, 60);
  });

  t('préstamo: financiar más baja el desembolso inicial', () => {
    const poco = Calc.calcular(Object.assign({}, base, { pr_monto_pct: '30' })).prestamo;
    const mucho = Calc.calcular(Object.assign({}, base, { pr_monto_pct: '90' })).prestamo;
    assert.ok(mucho.aporteUSD < poco.aporteUSD, 'más financiación, menos aporte propio');
    assert.ok(mucho.totalCuotasUSD > poco.totalCuotasUSD, 'pero se pagan más cuotas');
  });

  t('préstamo: una tasa alta destruye el valor para el cliente', () => {
    const barato = Calc.calcular(Object.assign({}, base, { pr_tasa: '5' })).prestamo;
    const caro = Calc.calcular(Object.assign({}, base, { pr_tasa: '60' })).prestamo;
    assert.ok(caro.van < barato.van, 'peor VAN con tasa alta');
    assert.ok(caro.cft > barato.cft, 'y mayor costo financiero');
  });

  t('préstamo en pesos: las cuotas se convierten al tipo de cambio de cada año', () => {
    const enUsd = Calc.calcular(Object.assign({}, base, { pr_moneda: 'usd', devaluacion: '20' })).prestamo;
    const enArs = Calc.calcular(Object.assign({}, base, { pr_moneda: 'ars', devaluacion: '20' })).prestamo;
    assert.strictEqual(enUsd.enPesos, false);
    assert.strictEqual(enArs.enPesos, true);
    // Con devaluación alta, deber en pesos a tasa fija licúa la deuda
    assert.ok(enArs.van > enUsd.van, 'endeudarse en pesos conviene si el peso se devalúa');
  });

  t('PPA: el cliente no invierte y aun así gana algo', () => {
    const r = Calc.calcular(base);
    assert.strictEqual(r.financiamiento.filas.find(f => f.clave === 'ppa').desembolsoInicial, 0);
    assert.ok(r.ppa.van > 0, 'con un precio por debajo de la red el PPA da positivo');
    assert.ok(r.ppa.descuentoVsRed > 0, 'descuento sobre la tarifa');
    assert.ok(r.ppa.pagoTotal > 0);
  });

  t('PPA: un precio por encima de la red destruye el ahorro', () => {
    const r = Calc.calcular(Object.assign({}, base, { ppa_tarifa: '0.30' }));
    assert.ok(r.ppa.van < 0, 'pagar más caro que la distribuidora no tiene sentido');
    assert.ok(r.ppa.descuentoVsRed < 0, 'el descuento es negativo');
  });

  t('PPA: el contrato termina y aparece la opción de compra', () => {
    const r = Calc.calcular(Object.assign({}, base, { ppa_plazo: '10', ppa_opcion: '20000', horizonte: '20' }));
    const anios = r.ppa.anios;
    assert.ok(anios[9].pagoPPA > 0, 'en el año 10 todavía paga el PPA');
    assert.strictEqual(anios[10].pagoPPA, 0, 'en el año 11 ya no');
    assert.ok(Math.abs(anios[10].opcion - 20000) < 1e-6, 'la opción de compra cae en el año 11');
    assert.ok(anios[11].opex > 0, 'a partir de ahí el cliente paga el mantenimiento');
  });

  t('comparador: todas las opciones se descuentan a la misma tasa en dólares', () => {
    const r = Calc.calcular(base);
    const filas = r.financiamiento.filas.filter(f => f.disponible);
    filas.forEach(f => assert.ok(isFinite(f.van), f.clave + ' tiene VAN finito'));
    // El contado del comparador coincide con el VAN del motor principal
    const contado = filas.find(f => f.clave === 'contado');
    assert.ok(Math.abs(contado.van - r.vanUSD) < 1e-6, 'el contado usa el mismo VAN que la pestaña Resultados');
  });
}

module.exports = suite;
if (require.main === module) correrSuelta(suite);
