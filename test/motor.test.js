/* Tarifa por bandas, IVA, inversor y presupuesto por ítems. Ejecutar: node test/motor.test.js */
const assert = require('assert');
const C = require('../js/calc.js');
const { t, seccion, correrSuelta } = require('./_harness.js');

const BASE = C.PLANTILLAS.industrial;

function suite() {
  seccion('calc.js · tarifa, inversor y presupuesto');

  // ---------------------------------------------------------------- bandas horarias
  t('bandas: el reparto horario respeta los límites cargados', () => {
    const p = C.normalizar(Object.assign({}, BASE, { tarifa_tipo: 'bandas' }));
    const b = C.bandasPorHora(p);
    assert.strictEqual(b.length, 24);
    assert.strictEqual(b[19], 'pico', '19 h cae en pico');
    assert.strictEqual(b[2], 'valle', '02 h cae en valle');
    assert.strictEqual(b[12], 'resto', 'mediodía es resto');
    assert.strictEqual(b[23], 'valle', 'el valle cruza la medianoche');
    assert.strictEqual(b[17], 'resto', 'el pico arranca a las 18');
  });

  t('bandas: con tarifa simple todas las horas valen lo mismo', () => {
    const p = C.normalizar(BASE);
    assert.ok(C.bandasPorHora(p).every(x => x === 'resto'));
    const tar = C.tarifasPorHora(p);
    assert.ok(tar.porHora.every(x => Math.abs(x - tar.plena) < 1e-9));
  });

  t('bandas: el sol produce fuera del pico', () => {
    const r = C.calcular(Object.assign({}, BASE, { tarifa_tipo: 'bandas', tarifa_pico: '220', tarifa_valle: '70' }));
    const total = r.autoPorBanda.pico + r.autoPorBanda.valle + r.autoPorBanda.resto;
    assert.ok(total > 0);
    assert.ok(r.autoPorBanda.resto / total > 0.9, 'más del 90 % del autoconsumo cae en la banda resto');
    assert.strictEqual(r.autoPorBanda.valle, 0, 'de noche no hay sol para autoconsumir');
  });

  t('bandas: el precio de cada banda se aplica de verdad', () => {
    const simple = C.calcular(BASE);
    const caro = C.calcular(Object.assign({}, BASE, { tarifa_tipo: 'bandas', tarifa_pico: '400', tarifa_valle: '110' }));
    const barato = C.calcular(Object.assign({}, BASE, { tarifa_tipo: 'bandas', tarifa_pico: '10', tarifa_valle: '110' }));
    assert.ok(caro.ahorroAnual1 > simple.ahorroAnual1, 'un pico caro sube algo el ahorro');
    assert.ok(barato.ahorroAnual1 < simple.ahorroAnual1, 'un pico barato lo baja');
    // El efecto es chico porque el solar casi no produce en el pico
    assert.ok((caro.ahorroAnual1 / simple.ahorroAnual1 - 1) < 0.15, 'el pico mueve poco la aguja del solar');
  });

  t('bandas: con baterías la energía llega a la banda pico', () => {
    const e = Object.assign({}, BASE, {
      tarifa_tipo: 'bandas', tarifa_pico: '220', tarifa_valle: '70',
      incluirBateria: 'si', bat_kwh: '400', bat_usd_kwh: '400',
    });
    const r = C.calcular(e);
    assert.ok(r.autoPorBanda.pico > 0, 'la batería desplaza consumo al pico');
  });

  // ---------------------------------------------------------------- IVA
  t('IVA: para un responsable inscripto no es ahorro', () => {
    const cf = C.calcular(Object.assign({}, BASE, { iva_pct: '21', iva_condicion: 'cf' }));
    const ri = C.calcular(Object.assign({}, BASE, { iva_pct: '21', iva_condicion: 'ri' }));
    assert.ok(Math.abs(cf.tarifaFull / ri.tarifaFull - 1.21) < 1e-9, 'la diferencia es exactamente el IVA');
    assert.ok(Math.abs(cf.ahorroAnual1 / ri.ahorroAnual1 - 1.21) < 1e-9);
    const sinIva = C.calcular(BASE);
    assert.ok(Math.abs(ri.tarifaFull - sinIva.tarifaFull) < 1e-9, 'sin IVA cargado nada cambia');
  });

  t('IVA: sin alícuota cargada el resultado no se mueve', () => {
    const a = C.calcular(Object.assign({}, BASE, { iva_condicion: 'ri' }));
    const b = C.calcular(Object.assign({}, BASE, { iva_condicion: 'cf' }));
    assert.strictEqual(a.tarifaFull, b.tarifaFull);
  });

  // ---------------------------------------------------------------- cargos fijos y potencia
  t('factura estimada: suma energía, cargo fijo y potencia', () => {
    const r = C.calcular(Object.assign({}, BASE, { cargo_fijo: '5000', pot_contratada: '200', cargo_pot: '1200' }));
    assert.ok(Math.abs(r.facturaFijaAnual - 60000) < 1e-9);
    assert.ok(Math.abs(r.facturaPotenciaAnual - 200 * 1200 * 12) < 1e-9);
    assert.ok(r.facturaSinSolar > r.facturaConSolar, 'con solar se paga menos');
    assert.ok(Math.abs(r.facturaSinSolar - r.facturaConSolar - r.ahorroAnual1) < 1e-6);
  });

  t('potencia: no se computa ahorro salvo que se renegocie el contrato', () => {
    const sin = C.calcular(Object.assign({}, BASE, { cargo_pot: '1200' }));
    const con = C.calcular(Object.assign({}, BASE, { cargo_pot: '1200', reducePotencia: 'si' }));
    assert.strictEqual(sin.ahorroPotenciaAnual, 0, 'por defecto el solar no baja la potencia facturada');
    assert.ok(con.ahorroPotenciaAnual > 0, 'al renegociar aparece el ahorro');
    assert.ok(con.ahorroAnual1 > sin.ahorroAnual1);
    assert.ok(sin.reduccionPotenciaMedia > 0, 'la reducción se calcula igual, para poder mostrarla');
  });

  // ---------------------------------------------------------------- inversor
  t('inversor: la ventana de tensión sale de los extremos térmicos', () => {
    const inv = C.calcular(Object.assign({}, BASE, {
      inv_potencia_ac: '125', inv_v_max: '1100', inv_v_min: '200', inv_v_arranque: '150',
      mod_voc: '51.8', mod_vmp: '43.4', mod_coef_voc: '-0.25', temp_min: '-5', temp_max: '40',
    })).inversor;
    assert.ok(inv.vocFrio > 51.8, 'con frío la tensión de circuito abierto sube');
    assert.ok(inv.vmpCaliente < 43.4, 'con calor la de máxima potencia baja');
    assert.ok(inv.tCeldaCaliente > 40, 'la celda está más caliente que el aire');
    assert.strictEqual(inv.maxSerie, Math.floor(1100 / inv.vocFrio));
    assert.ok(inv.serie >= inv.minSerie && inv.serie <= inv.maxSerie, 'la serie elegida entra en la ventana');
    assert.ok(inv.cadenas * inv.serie >= inv.paneles, 'las cadenas alcanzan para todos los módulos');
  });

  t('inversor: avisa cuando ninguna serie entra en la ventana', () => {
    const inv = C.calcular(Object.assign({}, BASE, {
      inv_potencia_ac: '125', inv_v_max: '150', inv_v_min: '600', inv_v_arranque: '600',
    })).inversor;
    assert.ok(inv.maxSerie < inv.minSerie);
    assert.strictEqual(inv.serie, 0);
    assert.ok(inv.avisos.some(a => /ventana de tensión/.test(a)));
  });

  t('inversor: avisa por relación DC/AC y por potencia contratada', () => {
    const alto = C.calcular(Object.assign({}, BASE, { inv_potencia_ac: '90' })).inversor;
    assert.ok(alto.ratio > 1.35);
    assert.ok(alto.avisos.some(a => /DC\/AC/.test(a)));
    const gd = C.calcular(Object.assign({}, BASE, { inv_potencia_ac: '125', pot_contratada: '100' })).inversor;
    assert.ok(gd.avisos.some(a => /27\.424/.test(a)), 'recuerda el límite del régimen de generación distribuida');
  });

  t('inversor: el recorte crece al achicar el equipo', () => {
    const holgado = C.calcular(Object.assign({}, BASE, { inv_potencia_ac: '150' })).inversor.diaClaro;
    const justo = C.calcular(Object.assign({}, BASE, { inv_potencia_ac: '120' })).inversor.diaClaro;
    const chico = C.calcular(Object.assign({}, BASE, { inv_potencia_ac: '95' })).inversor.diaClaro;
    assert.strictEqual(holgado.recortePct, 0, 'con DC/AC 1 no recorta');
    assert.ok(justo.recortePct > 0 && justo.recortePct < 8, 'DC/AC 1,25 recorta poco: ' + justo.recortePct);
    assert.ok(chico.recortePct > justo.recortePct, 'DC/AC 1,6 recorta bastante más');
  });

  t('inversor: el pico en día despejado es realista', () => {
    const d = C.calcular(BASE).inversor.diaClaro;
    const p = C.normalizar(BASE);
    assert.ok(d.potenciaPicoDC > p.kwp * 0.75, 'el pico supera el 75 % de la potencia nominal');
    assert.ok(d.potenciaPicoDC < p.kwp, 'pero no llega al valor de placa');
    assert.ok(d.irradianciaPico > 850 && d.irradianciaPico < 1150, 'irradiancia ' + d.irradianciaPico);
    assert.ok(d.factorDC > 0.8 && d.factorDC < 0.95, 'factor de continua ' + d.factorDC);
  });

  t('recorte: el balance sigue conservando la energía', () => {
    const r = C.calcular(Object.assign({}, BASE, { inv_potencia_ac: '60' }));
    assert.ok(Math.abs(r.autoAnual + r.excAnual + r.clipAnual - r.genAnual) < 1e-6,
      'auto + excedente + recorte = generación');
    assert.ok(r.clipAnual > 0, 'con un inversor muy chico sí se recorta en el día medio');
  });

  // ---------------------------------------------------------------- irradiación
  t('irradiación: la fuente de tabla no calcula geometría', () => {
    assert.strictEqual(C.calcular(BASE).irradiacion, null);
    const p = C.normalizar(BASE);
    assert.strictEqual(p.irrad_fuente, 'tabla');
  });

  t('irradiación: con el modelo aparece la ganancia por inclinación', () => {
    const r = C.calcular(Object.assign({}, BASE, { irrad_fuente: 'modelo', ciudad_id: 'ros', inclinacion: '25' }));
    assert.ok(r.irradiacion, 'se calcula la irradiación del sitio');
    assert.ok(r.irradiacion.anualPlano > r.irradiacion.anualHorizontal);
    assert.ok(r.irradiacion.ganancia > 1.02 && r.irradiacion.ganancia < 1.2);
    // El valor de tabla se recupera al transponer: la ganancia se deshace y se vuelve a aplicar
    assert.ok(Math.abs(r.irradiacion.anualPlano - r.p.irrad) < 2, 'coincide con el valor cargado');
  });

  t('irradiación: cambiar la inclinación cambia el perfil mensual', () => {
    const plano = C.calcular(Object.assign({}, BASE, { irrad_fuente: 'modelo', ciudad_id: 'ros', inclinacion: '0' }));
    const inclinado = C.calcular(Object.assign({}, BASE, { irrad_fuente: 'modelo', ciudad_id: 'ros', inclinacion: '40' }));
    // Más inclinación aplana la estacionalidad: gana en invierno y pierde en verano
    const estacionalidad = irr => irr.perfilMensual[11] / irr.perfilMensual[5];
    assert.ok(estacionalidad(inclinado.irradiacion) < estacionalidad(plano.irradiacion));
  });

  t('irradiación: el perfil horario del plano alimenta el balance', () => {
    const tabla = C.calcular(BASE);
    const modelo = C.calcular(Object.assign({}, BASE, { irrad_fuente: 'modelo', ciudad_id: 'ros', inclinacion: '25' }));
    assert.strictEqual(tabla.genAnual, modelo.genAnual, 'la generación cargada no cambia');
    assert.notStrictEqual(tabla.autoAnual, modelo.autoAnual, 'pero el reparto horario sí');
  });

  t('PR calculado: sale del desglose de pérdidas', () => {
    const manual = C.calcular(BASE);
    const calculado = C.calcular(Object.assign({}, BASE, { pr_fuente: 'calculado' }));
    const desglose = C.desglosePerdidas(C.normalizar(BASE));
    assert.strictEqual(calculado.p.pr, desglose.prCalculadoPct);
    assert.notStrictEqual(manual.p.pr, calculado.p.pr, 'el PR cargado y el calculado no coincidían');
  });

  t('PR calculado: usa la temperatura del sitio cuando hay datos', () => {
    const conModelo = C.desglosePerdidas(C.normalizar(Object.assign({}, BASE, { irrad_fuente: 'modelo', ciudad_id: 'ros' })));
    assert.strictEqual(conModelo.fuenteTemp, 'modelo');
    const conSerie = C.desglosePerdidas(C.normalizar(Object.assign({}, BASE, {
      irrad_fuente: 'nasa', ciudad_id: 'ros',
      irrad_mensual_horiz: JSON.stringify([7.15, 6.11, 5.21, 3.87, 2.9, 2.45, 2.68, 3.59, 4.74, 5.64, 6.86, 7.24]),
      temp_mensual: JSON.stringify([26, 24.4, 21.8, 17.8, 13.8, 10.8, 10.1, 12.1, 14.9, 18.4, 21.9, 24.3]),
    })));
    assert.strictEqual(conSerie.fuenteTemp, 'sitio');
    assert.strictEqual(C.desglosePerdidas(C.normalizar(BASE)).fuenteTemp, 'tabla');
  });

  // ---------------------------------------------------------------- presupuesto por ítems
  const BOM = [
    { productoId: 'mod575', categoria: 'modulo', descripcion: 'Módulo 575 Wp', unidad: 'u.', cantidad: 260, precioUsd: 62 },
    { productoId: 'inv50', categoria: 'inversor', descripcion: 'Inversor 50 kW', unidad: 'u.', cantidad: 3, precioUsd: 2600 },
    { productoId: 'estchapa', categoria: 'estructura', descripcion: 'Estructura', unidad: 'kWp', cantidad: 1, precioUsd: 45 },
  ];

  t('presupuesto: los ítems por kWp se multiplican por la potencia', () => {
    const bom = C.parseBom(JSON.stringify(BOM));
    assert.strictEqual(bom.length, 3);
    const total = C.totalBom(bom, 100);
    assert.ok(Math.abs(total - (260 * 62 + 3 * 2600 + 45 * 100)) < 1e-9, 'total ' + total);
  });

  t('presupuesto: el precio por kWp pasa a ser un resultado', () => {
    const e = Object.assign({}, BASE, { bom: JSON.stringify(BOM), bom_activo: 'si' });
    const p = C.normalizar(e), r = C.calcular(e);
    assert.ok(Math.abs(p.usd_kwp - p.bomTotalUSD / p.kwp) < 1e-9);
    assert.ok(Math.abs(r.capexSolarUSD - p.bomTotalUSD) < 1e-6, 'el CAPEX solar es el total del presupuesto');
    assert.notStrictEqual(p.usd_kwp, 540, 'ya no usa el valor cargado a mano');
  });

  t('presupuesto: desactivarlo devuelve el precio cargado a mano', () => {
    const e = Object.assign({}, BASE, { bom: JSON.stringify(BOM), bom_activo: 'no' });
    const p = C.normalizar(e);
    assert.strictEqual(p.usd_kwp, 540);
    assert.strictEqual(p.bom_activo, false);
    assert.ok(p.bomTotalUSD > 0, 'los ítems se conservan por si se vuelve a activar');
  });

  t('presupuesto: una lista vacía no rompe nada', () => {
    const p = C.normalizar(Object.assign({}, BASE, { bom: '[]', bom_activo: 'si' }));
    assert.strictEqual(p.bom_activo, false, 'sin ítems no se activa');
    assert.strictEqual(p.usd_kwp, 540);
    assert.deepStrictEqual(C.parseBom('no es json'), []);
    assert.deepStrictEqual(C.parseBom(null), []);
  });

  // ---------------------------------------------------------------- validaciones nuevas
  t('validaciones: el proyecto sigue sin ruido con la tarifa por bandas', () => {
    const e = Object.assign({}, BASE, {
      tarifa_tipo: 'bandas', tarifa_pico: '220', tarifa_valle: '70',
      presu_numero: '900/2026', presu_cuit: '30-50081389-6', devaluacion: '15', inflacion: '20',
    });
    assert.strictEqual(C.validar(e).filter(x => x.nivel === 'error').length, 0);
  });
}

module.exports = suite;
if (require.main === module) correrSuelta(suite);
