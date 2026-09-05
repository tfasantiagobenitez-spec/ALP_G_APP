/* Motor de cálculo: parseo, balance horario, baterías, moneda y fiscal.
   Ejecutar: node test/calc.test.js */
const assert = require('assert');
const Calc = require('../js/calc.js');
const { t, seccion, correrSuelta } = require('./_harness.js');

function suite() {
  seccion('calc.js · motor base');

  t('num: acepta coma decimal y miles', () => {
    assert.strictEqual(Calc.num('8,05'), 8.05);
    assert.strictEqual(Calc.num('1.234,5'), 1234.5);
    assert.strictEqual(Calc.num('1430'), 1430);
    assert.strictEqual(Calc.num(''), 0);
    assert.strictEqual(Calc.num('', 7), 7);
  });

  t('num: punto como separador de miles (es-AR)', () => {
    assert.strictEqual(Calc.num('1.500'), 1500);
    assert.strictEqual(Calc.num('12.650'), 12650);
    assert.strictEqual(Calc.num('1.234.567'), 1234567);
    assert.strictEqual(Calc.num('999.000'), 999000);
  });

  t('num: no confunde decimales legítimos con miles', () => {
    assert.strictEqual(Calc.num('0.545'), 0.545);      // cabeza con cero a la izquierda -> decimal
    assert.strictEqual(Calc.num('544.09'), 544.09);    // grupo de 2 dígitos -> decimal
    assert.strictEqual(Calc.num('1820.1'), 1820.1);
    assert.strictEqual(Calc.num('0.5'), 0.5);
    assert.strictEqual(Calc.num('1.5'), 1.5);
    assert.strictEqual(Calc.num('12.6543'), 12.6543);  // grupo de 4 dígitos -> decimal
  });

  t('num: formato anglosajón, signo y unidades', () => {
    assert.strictEqual(Calc.num('1,500.50'), 1500.5);
    assert.strictEqual(Calc.num('U$D 550'), 550);
    assert.strictEqual(Calc.num('$ 1.430'), 1430);
    assert.strictEqual(Calc.num('-1.200'), -1200);
    assert.strictEqual(Calc.num('-8,05'), -8.05);
    assert.strictEqual(Calc.num('abc', 3), 3);
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
  // Mismo proyecto forzado al modelo anterior, para verificar la compatibilidad hacia atrás.
  const pecorellaMensual = Object.assign({}, pecorella, { modeloAuto: 'mensual' });

  t('calcular: energía y ahorro año 1 (Pecorella, modelo horario)', () => {
    const r = Calc.calcular(pecorella);
    assert.strictEqual(r.p.modeloAuto, 'horario', 'el modelo horario es el predeterminado');
    assert.strictEqual(r.genAnual, 48240);
    assert.strictEqual(r.conAnual, 87600);
    // parte de la generación del mediodía no encuentra demanda simultánea
    assert.ok(r.autoAnual > 39000 && r.autoAnual < 43000, 'autoAnual=' + r.autoAnual);
    assert.ok(r.excAnual > 5000 && r.excAnual < 9500, 'excAnual=' + r.excAnual);
    assert.ok(Math.abs(r.tarifaFull - 99.61575) < 1e-6);
    assert.ok(Math.abs(r.ahorroAnual1 - r.autoAnual * 99.61575) < 1e-3);
    assert.ok(Math.abs(r.capexUSD - 34.65 * 544.09) < 1e-6);
    assert.ok(Math.abs(r.capexARS - 34.65 * 544.09 * 1430) < 1e-3);
  });

  t('calcular: el balance horario conserva la energía', () => {
    const r = Calc.calcular(pecorella);
    assert.ok(Math.abs(r.autoAnual + r.excAnual - r.genAnual) < 1e-6, 'auto + excedente = generación');
    assert.ok(Math.abs(r.autoAnual + r.redAnual - r.conAnual) < 1e-6, 'auto + red = consumo');
    for (let m = 0; m < 12; m++) {
      assert.ok(Math.abs(r.auto[m] + r.exc[m] - r.gen[m]) < 1e-6, 'mes ' + m + ': auto + exc = gen');
      assert.ok(Math.abs(r.auto[m] + r.red[m] - r.con[m]) < 1e-6, 'mes ' + m + ': auto + red = con');
    }
  });

  t('calcular: modelo mensual reproduce los resultados anteriores', () => {
    const r = Calc.calcular(pecorellaMensual);
    assert.strictEqual(r.autoAnual, 48240);          // toda la generación se autoconsume
    assert.strictEqual(r.excAnual, 0);
    assert.ok(Math.abs(r.ahorroAnual1 - 48240 * 99.61575) < 1e-3);
    assert.ok(r.payback > 5 && r.payback < 6, 'payback ~5.7 años: ' + r.payback);
  });

  t('calcular: el modelo horario es más conservador que el mensual', () => {
    const h = Calc.calcular(pecorella), m = Calc.calcular(pecorellaMensual);
    assert.ok(h.autoAnual < m.autoAnual, 'menos autoconsumo');
    assert.ok(h.ahorroAnual1 < m.ahorroAnual1, 'menos ahorro');
    assert.ok(h.van < m.van, 'menor VAN');
    assert.ok(h.payback > m.payback, 'mayor payback');
  });

  t('calcular: indicadores coherentes', () => {
    const r = Calc.calcular(pecorella);
    assert.strictEqual(r.anios.length, 20);
    assert.ok(r.van > 0, 'VAN positivo');
    assert.ok(r.tir > 0.1, 'TIR > tasa de descuento');
    assert.ok(r.payback > 6 && r.payback < 8, 'payback ~6.7 años: ' + r.payback);
    assert.ok(r.lcoeARS < r.tarifaFull, 'LCOE < tarifa');
    // degradación aplicada
    assert.ok(r.anios[19].gen < r.anios[0].gen);
    assert.ok(Math.abs(r.anios[1].gen / r.anios[0].gen - 0.995) < 1e-9);
  });

  t('calcular: excedente con inyección', () => {
    const e = Object.assign({}, pecorella, { conM: '[1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000]', excModo: 'iny', tarifa_iny: '50' });
    const r = Calc.calcular(e);
    assert.ok(r.autoAnual < 12000, 'el consumo acota el autoconsumo');
    assert.ok(Math.abs(r.autoAnual + r.excAnual - 48240) < 1e-6);
    assert.ok(Math.abs(r.ahorroAnual1 - (r.autoAnual * r.tarifaFull + r.excAnual * 50)) < 1e-3);
    const r2 = Calc.calcular(Object.assign({}, e, { excModo: 'sin' }));
    assert.ok(Math.abs(r2.ahorroAnual1 - r2.autoAnual * r2.tarifaFull) < 1e-3);
    assert.ok(r2.ahorroAnual1 < r.ahorroAnual1, 'sin remuneración se ahorra menos');
  });

  t('calcular: inflación y recambio', () => {
    const e = Object.assign({}, pecorella, { inflacion: '20', incluirRecambio: 'si', recambio_pct: '10', recambio_cada: '11', opex_pct: '1' });
    const r = Calc.calcular(e);
    assert.ok(Math.abs(r.anios[1].ahorro / r.anios[0].ahorro - 1.2 * 0.995) < 1e-9);
    assert.ok(r.anios[10].recambio > 0 && r.anios[9].recambio === 0, 'recambio en año 11');
    assert.ok(Math.abs(r.anios[0].opex - r.capexARS * 0.01) < 1e-6);
    // sin baterías el recambio del inversor se calcula sobre el CAPEX solar, que es el total
    assert.ok(Math.abs(r.anios[10].recambioInv - r.anios[10].recambio) < 1e-9);
    assert.strictEqual(r.anios[10].recambioBat, 0);
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
    // el VAN crece con la tarifa y cae con el CAPEX
    const fila = sens.matrizTarifaCapex[2].celdas;
    assert.ok(fila[4].vanUSD > fila[0].vanUSD, 'más tarifa, más VAN');
    assert.ok(sens.matrizTarifaCapex[0].celdas[2].vanUSD > sens.matrizTarifaCapex[4].celdas[2].vanUSD, 'más CAPEX, menos VAN');
  });

  t('plantillas: existen y calculan correctamente', () => {
    assert.ok(Calc.PLANTILLAS.residencial);
    assert.ok(Calc.PLANTILLAS.comercial);
    assert.ok(Calc.PLANTILLAS.industrial);
    const r = Calc.calcular(Calc.PLANTILLAS.comercial);
    assert.ok(r.van > 0);
  });

  // ---------------------------------------------------------------- modelo horario

  t('perfilGenHora: fracciones normalizadas y días más largos en verano', () => {
    const ene = Calc.perfilGenHora(0, -34.6, -58.38);
    const jun = Calc.perfilGenHora(5, -34.6, -58.38);
    assert.ok(Math.abs(ene.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'enero suma 1');
    assert.ok(Math.abs(jun.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'junio suma 1');
    const horasSol = a => a.filter(x => x > 0).length;
    assert.ok(horasSol(ene) > horasSol(jun), 'enero tiene más horas de sol que junio');
    assert.strictEqual(ene.filter(x => x > 0)[0] !== undefined, true);
    // de noche no hay generación
    assert.strictEqual(ene[0], 0);
    assert.strictEqual(ene[23], 0);
  });

  t('perfilGenHora: la latitud cambia la duración del día', () => {
    const horasSol = a => a.filter(x => x > 0).length;
    const ushuaiaJun = Calc.perfilGenHora(5, -54.8, -68.3);
    const jujuyJun = Calc.perfilGenHora(5, -24.18, -65.30);
    assert.ok(horasSol(ushuaiaJun) < horasSol(jujuyJun), 'invierno más corto en el sur');
  });

  t('PERFIL_CON_HORA: los tres perfiles de demanda suman 1', () => {
    ['residencial', 'comercial', 'industrial'].forEach(k => {
      const s = Calc.PERFIL_CON_HORA[k].reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(s - 1) < 1e-9, k + ' suma ' + s);
    });
  });

  t('balanceAnual: el perfil de demanda cambia el autoconsumo', () => {
    const cob = tipo => {
      const r = Calc.calcular(Object.assign({}, pecorella, { tipoSistema: tipo }));
      return r.autoAnual;
    };
    // con la misma generación, el industrial (demanda diurna y plana) aprovecha más que el residencial
    assert.ok(cob('industrial') > cob('residencial'), 'industrial > residencial');
    assert.ok(cob('comercial') > cob('residencial'), 'comercial > residencial');
  });

  t('calcular: almacenamiento con baterías (BESS)', () => {
    const e = Object.assign({}, pecorella, { incluirBateria: 'si', bat_kwh: '15', bat_usd_kwh: '400', bat_dod: '80' });
    const r = Calc.calcular(e);
    assert.strictEqual(r.capexBatUSD, 6000);
    assert.strictEqual(r.capexUSD, r.capexSolarUSD + 6000);
    assert.strictEqual(r.capUtilBat, 12);
    assert.ok(r.autonomiaHoras > 1);
  });

  t('calcular: la batería aumenta el autoconsumo y el ahorro', () => {
    const base = Object.assign({}, pecorella, { conM: JSON.stringify(Array(12).fill(3000)) });
    const sin = Calc.calcular(base);
    const con = Calc.calcular(Object.assign({}, base, { incluirBateria: 'si', bat_kwh: '40', bat_usd_kwh: '400', bat_dod: '80' }));
    assert.ok(con.autoBatAnual > 0, 'la batería entrega energía: ' + con.autoBatAnual);
    assert.ok(con.autoAnual > sin.autoAnual, 'más autoconsumo con batería');
    assert.ok(con.ahorroAnual1 > sin.ahorroAnual1, 'más ahorro con batería');
    assert.ok(con.excAnual < sin.excAnual, 'menos excedente vertido a la red');
    assert.ok(Math.abs(con.autoAnual - sin.autoAnual - con.autoBatAnual) < 1e-6, 'el aporte extra es el de la batería');
    assert.ok(Math.abs(con.ahorroBateriaAnual - con.autoBatAnual * con.tarifaFull) < 1e-3);
  });

  t('calcular: la batería tiene recambio propio en el flujo', () => {
    const e = Object.assign({}, pecorella, {
      incluirBateria: 'si', bat_kwh: '20', bat_usd_kwh: '400', bat_vida: '10', bat_recambio_pct: '70', horizonte: '25',
    });
    const r = Calc.calcular(e);
    assert.ok(r.anios[9].recambioBat > 0, 'recambio del banco en el año 10');
    assert.strictEqual(r.anios[8].recambioBat, 0);
    assert.ok(r.anios[19].recambioBat > 0, 'segundo recambio en el año 20');
    assert.ok(Math.abs(r.anios[9].recambioBat - r.capexBatARS * 0.7) < 1e-6);
  });

  t('calcular: sin batería no hay aporte ni recambio de banco', () => {
    const r = Calc.calcular(pecorella);
    assert.strictEqual(r.autoBatAnual, 0);
    assert.strictEqual(r.capexBatUSD, 0);
    r.anios.forEach(a => assert.strictEqual(a.recambioBat, 0));
  });

  t('calcular: modelo mensual ignora la batería en el balance', () => {
    const e = Object.assign({}, pecorellaMensual, { incluirBateria: 'si', bat_kwh: '40', bat_usd_kwh: '400' });
    const r = Calc.calcular(e);
    assert.strictEqual(r.autoBatAnual, 0, 'el modelo anterior no simula el ciclado');
    assert.ok(r.capexBatUSD > 0, 'pero sí suma el costo del banco');
  });

  t('generarPerfil24h: genera 24 puntos coherentes', () => {
    const p24 = Calc.generarPerfil24h(pecorella);
    assert.strictEqual(p24.length, 24);
    assert.strictEqual(p24[0].hora, 0);
    assert.strictEqual(p24[13].hora, 13);
    assert.ok(p24[13].gen > p24[0].gen);
    assert.strictEqual(p24[0].gen, 0, 'de madrugada no hay generación');
  });

  t('generarPerfil24h: coincide con el balance anual', () => {
    const r = Calc.calcular(pecorella);
    const p24 = Calc.generarPerfil24h(pecorella);
    const genDia = p24.reduce((s, h) => s + h.gen, 0);
    const conDia = p24.reduce((s, h) => s + h.con, 0);
    assert.ok(Math.abs(genDia * 365.25 - r.genAnual) < 1, 'generación diaria × 365.25 = anual');
    assert.ok(Math.abs(conDia * 365.25 - r.conAnual) < 1, 'consumo diario × 365.25 = anual');
  });

  t('generarPerfil24h: acepta un mes concreto', () => {
    const ene = Calc.generarPerfil24h(pecorella, 0);
    const jun = Calc.generarPerfil24h(pecorella, 5);
    const genDia = a => a.reduce((s, h) => s + h.gen, 0);
    assert.ok(genDia(ene) > genDia(jun), 'en enero se genera más por día que en junio');
    const horasSol = a => a.filter(h => h.gen > 0).length;
    assert.ok(horasSol(ene) > horasSol(jun), 'días más largos en enero');
  });

  t('generarPerfil24h: simula ciclado de batería correctamente', () => {
    const e = Object.assign({}, pecorella, { incluirBateria: 'si', bat_kwh: '20', bat_dod: '80', excModo: 'sin' });
    const p24 = Calc.generarPerfil24h(e);
    assert.strictEqual(p24.length, 24);
    const carga = p24.reduce((s, h) => s + h.batCarga, 0);
    const descarga = p24.reduce((s, h) => s + h.batDescarga, 0);
    assert.ok(carga > 0, 'la batería carga durante el día');
    assert.ok(descarga > 0, 'la batería descarga fuera del sol');
    assert.ok(descarga <= carga + 1e-9, 'no se entrega más de lo que se almacenó');
    p24.forEach(h => assert.ok(h.batSoCPct >= -1e-9 && h.batSoCPct <= 100 + 1e-9, 'SoC dentro de rango: ' + h.batSoCPct));
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
    Calc.CIUDADES_ARGENTINA.forEach(c => {
      assert.ok(typeof c.lat === 'number' && c.lat < 0, c.id + ' tiene latitud sur');
      assert.ok(typeof c.lon === 'number' && c.lon < 0, c.id + ' tiene longitud oeste');
    });
  });

  t('normalizar: toma latitud y longitud de la ciudad elegida', () => {
    const p = Calc.normalizar({ ciudad_id: 'ush' });
    assert.ok(Math.abs(p.lat - (-54.80)) < 1e-9);
    assert.ok(Math.abs(p.lon - (-68.30)) < 1e-9);
    const q = Calc.normalizar({});
    assert.strictEqual(q.lat, -32, 'centro del país por defecto');
  });

  // ---------------------------------------------------------------- moneda de análisis

  t('moneda: sin devaluación, pesos y dólares son la misma cuenta', () => {
    const r = Calc.calcular(Object.assign({}, pecorella, { devaluacion: '0', fiscal: 'sin' }));
    assert.ok(Math.abs(r.van - r.vanUSD * 1430) < 1e-6, 'VAN convertido coincide');
    assert.ok(Math.abs(r.lcoeARS - r.lcoeUSD * 1430) < 1e-9, 'LCOE convertido coincide');
    assert.ok(Math.abs(r.rArs - r.rUsd) < 1e-12, 'una sola tasa');
    assert.ok(Math.abs(r.tir - r.tirUSD) < 1e-9, 'una sola TIR');
    assert.strictEqual(r.tcFinal, 1430, 'el tipo de cambio no se mueve');
  });

  t('moneda: Fisher relaciona las dos tasas y las dos TIR', () => {
    const e = Object.assign({}, pecorella, { devaluacion: '15', inflacion: '20', tasa_desc: '10', moneda_analisis: 'usd', fiscal: 'sin' });
    const r = Calc.calcular(e);
    assert.ok(Math.abs(r.rUsd - 0.10) < 1e-12, 'la tasa cargada es la de dólares');
    assert.ok(Math.abs(r.rArs - (1.10 * 1.15 - 1)) < 1e-12, 'r_pesos = (1+r_usd)(1+dev)-1');
    assert.ok(Math.abs(r.van - r.vanUSD * 1430) / Math.abs(r.van) < 1e-9, 'el VAN es el mismo en las dos monedas');
    assert.ok(Math.abs((1 + r.tir) / 1.15 - 1 - r.tirUSD) < 1e-9, 'las TIR también cumplen Fisher');
  });

  t('moneda: analizar en pesos deriva la tasa en dólares', () => {
    const e = Object.assign({}, pecorella, { devaluacion: '15', tasa_desc: '26.5', moneda_analisis: 'ars', fiscal: 'sin' });
    const r = Calc.calcular(e);
    assert.ok(Math.abs(r.rArs - 0.265) < 1e-12);
    assert.ok(Math.abs(r.rUsd - (1.265 / 1.15 - 1)) < 1e-12);
    assert.ok(Math.abs(r.van - r.vanUSD * 1430) / Math.abs(r.van) < 1e-9);
  });

  t('moneda: la devaluación revela la suba real de la tarifa en dólares', () => {
    const r = Calc.calcular(Object.assign({}, pecorella, { inflacion: '20', devaluacion: '15' }));
    assert.ok(Math.abs(r.tarifaRealUSDPct - (1.20 / 1.15 - 1) * 100) < 1e-9, 'tarifaRealUSDPct=' + r.tarifaRealUSDPct);
    const r2 = Calc.calcular(Object.assign({}, pecorella, { inflacion: '20', devaluacion: '20' }));
    assert.ok(Math.abs(r2.tarifaRealUSDPct) < 1e-9, 'si la tarifa acompaña al dólar, no sube en términos reales');
  });

  t('moneda: el tipo de cambio proyectado se aplica año a año', () => {
    const r = Calc.calcular(Object.assign({}, pecorella, { devaluacion: '10', horizonte: '10' }));
    assert.ok(Math.abs(r.anios[0].tc - 1430 * 1.10) < 1e-9);
    assert.ok(Math.abs(r.anios[9].tc - 1430 * Math.pow(1.10, 10)) < 1e-6);
    assert.ok(Math.abs(r.tcFinal - 1430 * Math.pow(1.10, 10)) < 1e-6);
    assert.ok(Math.abs(r.anios[5].flujoUSD - r.anios[5].flujo / r.anios[5].tc) < 1e-9);
  });

  t('moneda: con devaluación el ahorro vale menos en dólares', () => {
    const sinDev = Calc.calcular(Object.assign({}, pecorella, { inflacion: '20', devaluacion: '0', fiscal: 'sin' }));
    const conDev = Calc.calcular(Object.assign({}, pecorella, { inflacion: '20', devaluacion: '20', fiscal: 'sin' }));
    assert.ok(conDev.ahorroTotalUSD < sinDev.ahorroTotalUSD, 'menos dólares acumulados');
    assert.ok(conDev.vanUSD < sinDev.vanUSD, 'menor VAN en dólares');
  });

  // ---------------------------------------------------------------- régimen fiscal

  t('fiscal: por defecto es simétrico salvo que el leasing no deduzca', () => {
    assert.strictEqual(Calc.normalizar({ lGanancias: 'si' }).fiscal, 'simetrico');
    assert.strictEqual(Calc.normalizar({}).fiscal, 'simetrico');
    assert.strictEqual(Calc.normalizar({ lGanancias: 'no' }).fiscal, 'sin');
    assert.strictEqual(Calc.normalizar({ fiscal: 'legacy', lGanancias: 'si' }).fiscal, 'legacy');
  });

  t('fiscal: sin Ganancias no hay escudo en ninguna opción', () => {
    const r = Calc.calcular(Object.assign({}, pecorella, { fiscal: 'sin' }));
    assert.strictEqual(r.escudoTotal, 0);
    assert.strictEqual(r.leasing.ahorroImp, 0);
    assert.strictEqual(r.leasing.gLeas, 0);
    r.anios.forEach(a => assert.strictEqual(a.impuesto, 0, 'el ahorro no tributa'));
  });

  t('fiscal: el criterio anterior solo premia al leasing', () => {
    const r = Calc.calcular(Object.assign({}, pecorella, { fiscal: 'legacy' }));
    assert.strictEqual(r.escudoTotal, 0, 'la compra no amortiza');
    assert.ok(r.leasing.ahorroImp > 0, 'el leasing sí deduce');
    r.anios.forEach(a => assert.strictEqual(a.impuesto, 0, 'el ahorro no tributa'));
  });

  t('fiscal: el régimen simétrico grava el ahorro y amortiza la compra', () => {
    const e = Object.assign({}, pecorella, { fiscal: 'simetrico', l_tasa_gan: '30', amort_anios: '5' });
    const r = Calc.calcular(e);
    assert.ok(r.escudoTotal > 0, 'la compra amortiza');
    assert.ok(r.leasing.ahorroImp > 0, 'el leasing deduce');
    assert.ok(r.anios[0].impuesto > 0, 'el ahorro tributa');
    // amortización lineal sobre el CAPEX, solo durante los años de vida fiscal
    assert.ok(Math.abs(r.anios[0].amort - r.capexARS / 5) < 1e-6);
    assert.strictEqual(r.anios[5].amort, 0, 'termina en el año 5');
    assert.ok(Math.abs(r.escudoTotal - r.capexARS * 0.30) < 1e-6, 'el escudo total es el CAPEX por la alícuota');
    assert.ok(Math.abs(r.anios[0].escudoAmort - (r.capexARS / 5) * 0.30) < 1e-6);
  });

  t('fiscal: el criterio anterior favorece al leasing frente al simétrico', () => {
    const leg = Calc.calcular(Object.assign({}, pecorella, { fiscal: 'legacy' }));
    const sim = Calc.calcular(Object.assign({}, pecorella, { fiscal: 'simetrico' }));
    assert.ok(leg.leasing.van > sim.leasing.van, 'el leasing luce mejor con el criterio anterior');
    assert.ok(sim.vanUSD < leg.vanUSD, 'la compra paga impuesto sobre el ahorro en el simétrico');
  });

  t('fiscal: el ahorro del leasing también queda neto de impuesto', () => {
    const r = Calc.calcular(Object.assign({}, pecorella, { fiscal: 'simetrico', l_tasa_gan: '30' }));
    const L = r.leasing;
    assert.ok(Math.abs(L.gAhorro - 0.30) < 1e-12);
    assert.ok(Math.abs(L.anios[0].ahorro - L.anios[0].ahorroBruto * 0.70) < 1e-9);
  });

  // ---------------------------------------------------------------- validaciones

  t('cuitValido: acepta CUIT reales y rechaza inventados', () => {
    assert.strictEqual(Calc.cuitValido('30-50081389-6'), true);
    assert.strictEqual(Calc.cuitValido('30718066162'), true);
    assert.strictEqual(Calc.cuitValido('00000000000'), false);
    assert.strictEqual(Calc.cuitValido('30-50081389-7'), false, 'dígito verificador cambiado');
    assert.strictEqual(Calc.cuitValido('123'), false);
    assert.strictEqual(Calc.cuitValido(''), false);
  });

  t('validar: un proyecto vacío acumula errores', () => {
    const v = Calc.validar({});
    const errores = v.filter(x => x.nivel === 'error');
    assert.ok(errores.length >= 5, 'errores=' + errores.length);
    const campos = errores.map(x => x.campo);
    ['kwp', 'usd_kwp', 'tarifa_resto', 'conM', 'genM'].forEach(k => assert.ok(campos.indexOf(k) >= 0, 'falta el error de ' + k));
  });

  t('validar: ordena los errores antes que los avisos', () => {
    const v = Calc.validar({});
    let vistoAviso = false;
    v.forEach(x => {
      if (x.nivel === 'aviso') vistoAviso = true;
      else assert.ok(!vistoAviso, 'apareció un error después de un aviso');
    });
  });

  t('validar: detecta potencia que no coincide con los módulos', () => {
    // 70 × 575 Wp = 40,25 kWp, un 16 % por encima de los 34,65 kWp cargados
    const e = Object.assign({}, pecorella, { presu_paneles: '70', panel_w: '575', kwp: '34.65' });
    const v = Calc.validar(e);
    assert.ok(v.some(x => x.campo === 'kwp' && /no coincide/i.test(x.titulo)), 'no detectó el desajuste');
    // 60 × 575 Wp = 34,5 kWp, dentro de la tolerancia del 2 %
    const ok = Calc.validar(Object.assign({}, pecorella, { presu_paneles: '60', panel_w: '575', kwp: '34.65' }));
    assert.ok(!ok.some(x => x.campo === 'kwp' && /no coincide/i.test(x.titulo)), 'falso positivo dentro de tolerancia');
  });

  t('validar: detecta parámetros técnicos fuera de rango', () => {
    const v = Calc.validar(Object.assign({}, pecorella, { pr: '120', irrad: '3000', deg: '-1' }));
    ['pr', 'irrad', 'deg'].forEach(k => assert.ok(v.some(x => x.campo === k), 'no marcó ' + k));
  });

  t('validar: detecta inyección remunerada sin precio y CUIT inválido', () => {
    const v = Calc.validar(Object.assign({}, pecorella, { excModo: 'iny', tarifa_iny: '0', presu_cuit: '30-50081389-7' }));
    assert.ok(v.some(x => x.campo === 'tarifa_iny'));
    assert.ok(v.some(x => x.campo === 'presu_cuit'));
  });

  t('validar: avisa cuando el marco monetario o fiscal engaña', () => {
    const v = Calc.validar(Object.assign({}, pecorella, { fiscal: 'legacy', inflacion: '25', devaluacion: '0' }));
    assert.ok(v.some(x => x.campo === 'fiscal'), 'no avisó de la asimetría fiscal');
    assert.ok(v.some(x => x.campo === 'devaluacion'), 'no avisó de la tarifa creciendo en dólares');
    const v2 = Calc.validar(Object.assign({}, pecorella, { fiscal: 'simetrico', inflacion: '25', devaluacion: '20' }));
    assert.ok(!v2.some(x => x.campo === 'fiscal' || x.campo === 'devaluacion'), 'avisos que no correspondían');
  });

  t('validar: un proyecto bien cargado no acumula ruido', () => {
    const bueno = Object.assign({}, Calc.PLANTILLAS.industrial, {
      presu_numero: '700/2026', presu_cuit: '30-50081389-6', devaluacion: '15', inflacion: '20',
    });
    const v = Calc.validar(bueno);
    assert.strictEqual(v.filter(x => x.nivel === 'error').length, 0, 'sin errores');
    assert.ok(v.length <= 2, 'demasiados avisos: ' + v.map(x => x.titulo).join(', '));
  });

  t('validar: acepta un resultado ya calculado y da lo mismo', () => {
    const r = Calc.calcular(pecorella);
    const a = Calc.validar(pecorella, r).map(x => x.campo + ':' + x.titulo);
    const b = Calc.validar(pecorella).map(x => x.campo + ':' + x.titulo);
    assert.deepStrictEqual(a, b);
  });
}

module.exports = suite;
if (require.main === module) correrSuelta(suite);
