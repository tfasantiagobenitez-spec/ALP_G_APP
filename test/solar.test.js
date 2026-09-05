/* Modelo físico de radiación solar. Ejecutar: node test/solar.test.js */
const assert = require('assert');
const S = require('../js/solar.js');
const { t, seccion, correrSuelta } = require('./_harness.js');

// Climatología real de Rosario según NASA POWER (kWh/m²·día de cada mes)
const ROSARIO = [7.153, 6.108, 5.2111, 3.8674, 2.9026, 2.4502, 2.6849, 3.5914, 4.735, 5.64, 6.8554, 7.2432];
const TEMP_ROSARIO = [25.97, 24.39, 21.75, 17.8, 13.82, 10.76, 10.06, 12.07, 14.86, 18.44, 21.86, 24.32];
const LAT_ROS = -32.95, LON_ROS = -60.65;

function suite() {
  seccion('solar.js');

  t('declinación: extremos en los solsticios', () => {
    assert.ok(Math.abs(S.declinacion(172) - 23.45) < 0.05, 'solsticio de junio');
    assert.ok(Math.abs(S.declinacion(355) + 23.45) < 0.05, 'solsticio de diciembre');
    assert.ok(Math.abs(S.declinacion(81)) < 1, 'equinoccio de marzo cerca de cero');
  });

  t('ángulo de puesta: días largos en verano austral', () => {
    const dic = S.anguloPuesta(LAT_ROS, S.declinacion(355));
    const jun = S.anguloPuesta(LAT_ROS, S.declinacion(172));
    assert.ok(dic > 100 && dic < 112, 'diciembre ' + dic);
    assert.ok(jun > 68 && jun < 80, 'junio ' + jun);
    assert.ok(dic > jun, 'el día es más largo en diciembre');
    // En el ecuador el día dura doce horas todo el año
    assert.ok(Math.abs(S.anguloPuesta(0, S.declinacion(172)) - 90) < 0.01);
  });

  t('ángulo de puesta: casos polares', () => {
    assert.strictEqual(S.anguloPuesta(-80, S.declinacion(355)), 180, 'sol de medianoche en la Antártida en diciembre');
    assert.strictEqual(S.anguloPuesta(-80, S.declinacion(172)), 0, 'noche polar en junio');
  });

  t('irradiación extraterrestre: máximo en verano y coherente en magnitud', () => {
    const h0 = S.h0Mensual(LAT_ROS);
    assert.strictEqual(h0.length, 12);
    assert.ok(h0[11] > h0[5], 'diciembre supera a junio');
    assert.ok(h0[11] > 11 && h0[11] < 13, 'diciembre ' + h0[11]);
    assert.ok(h0[5] > 4 && h0[5] < 6, 'junio ' + h0[5]);
  });

  t('fracción difusa: crece cuando el cielo se cierra', () => {
    const claro = S.fraccionDifusa(0.7, 90);
    const nublado = S.fraccionDifusa(0.25, 90);
    assert.ok(nublado > claro, 'con menos claridad hay más difusa');
    assert.ok(claro > 0.05 && claro < 0.4, 'cielo claro ' + claro);
    assert.ok(nublado > 0.6 && nublado <= 1, 'cielo cubierto ' + nublado);
  });

  t('azimut: la conversión al ángulo de superficie es consistente', () => {
    assert.strictEqual(S.azimutSuperficie(0), 180, 'Norte franco');
    assert.strictEqual(S.azimutSuperficie(180), 0, 'Sur franco');
    assert.strictEqual(S.azimutSuperficie(90), 90, 'Oeste');
    assert.strictEqual(S.azimutSuperficie(-90), -90, 'Este');
  });

  t('transposición: la inclinación óptima se parece a la latitud', () => {
    const opt = S.inclinacionOptima({ lat: LAT_ROS, lon: LON_ROS, azimut: 0, inclinacion: 0, diariaHorizontal: ROSARIO });
    assert.ok(opt.inclinacion > 20 && opt.inclinacion < 35, 'óptima ' + opt.inclinacion + '° para latitud 33°');
    assert.ok(opt.perdidaPct > 5 && opt.perdidaPct < 12, 'un plano horizontal pierde ' + opt.perdidaPct + ' %');
  });

  t('transposición: ganancia razonable sobre la horizontal', () => {
    const horiz = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 0, azimut: 0, diariaHorizontal: ROSARIO });
    const inclinado = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 26, azimut: 0, diariaHorizontal: ROSARIO });
    assert.ok(Math.abs(horiz.ganancia - 1) < 0.01, 'sin inclinar la ganancia es 1');
    assert.ok(inclinado.ganancia > 1.05 && inclinado.ganancia < 1.15, 'ganancia ' + inclinado.ganancia);
    assert.ok(Math.abs(horiz.anualHorizontal - inclinado.anualHorizontal) < 1, 'la horizontal no cambia con la inclinación');
  });

  t('transposición: orientar al sur arruina el rendimiento', () => {
    const norte = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 30, azimut: 0, diariaHorizontal: ROSARIO });
    const este = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 30, azimut: -90, diariaHorizontal: ROSARIO });
    const sur = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 30, azimut: 180, diariaHorizontal: ROSARIO });
    assert.ok(norte.anualPlano > este.anualPlano, 'Norte mejor que Este');
    assert.ok(este.anualPlano > sur.anualPlano, 'Este mejor que Sur');
    assert.ok(sur.anualPlano / norte.anualPlano < 0.75, 'al Sur se pierde más del 25 %');
  });

  t('transposición: Este y Oeste rinden casi lo mismo', () => {
    const este = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 20, azimut: -90, diariaHorizontal: ROSARIO });
    const oeste = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 20, azimut: 90, diariaHorizontal: ROSARIO });
    assert.ok(Math.abs(este.anualPlano / oeste.anualPlano - 1) < 0.02, 'simetría este-oeste');
  });

  t('perfiles: normalizados y con más horas de sol en verano', () => {
    const r = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 25, azimut: 0, diariaHorizontal: ROSARIO });
    assert.strictEqual(r.perfilesHorarios.length, 12);
    r.perfilesHorarios.forEach((p, m) => {
      assert.strictEqual(p.length, 24, 'mes ' + m);
      assert.ok(Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-9, 'mes ' + m + ' suma 1');
    });
    const horas = a => a.filter(x => x > 0).length;
    assert.ok(horas(r.perfilesHorarios[11]) > horas(r.perfilesHorarios[5]), 'diciembre tiene más horas de sol');
    assert.ok(Math.abs(r.perfilMensual.reduce((s, x) => s + x, 0) - 1) < 1e-9, 'el perfil mensual suma 1');
    assert.ok(r.perfilMensual[11] > r.perfilMensual[5], 'diciembre aporta más que junio');
  });

  t('perfiles: la latitud manda sobre la duración del día', () => {
    const horas = a => a.filter(x => x > 0).length;
    const ushuaia = S.irradiacionPlano({ lat: -54.8, lon: -68.3, inclinacion: 30, azimut: 0, anualHorizontal: 1000 });
    const jujuy = S.irradiacionPlano({ lat: -24.18, lon: -65.3, inclinacion: 30, azimut: 0, anualHorizontal: 2000 });
    assert.ok(horas(ushuaia.perfilesHorarios[5]) < horas(jujuy.perfilesHorarios[5]), 'invierno más corto en el sur');
    assert.ok(horas(ushuaia.perfilesHorarios[11]) > horas(jujuy.perfilesHorarios[11]), 'verano más largo en el sur');
  });

  t('reparto mensual desde el total anual conserva la energía', () => {
    const mensual = S.mensualDesdeAnualHorizontal(LAT_ROS, 1777);
    const total = mensual.reduce((s, x, m) => s + x * S.DIAS_MES[m], 0);
    assert.ok(Math.abs(total - 1777) < 1, 'total ' + total);
    assert.ok(mensual[11] > mensual[5], 'diciembre por encima de junio');
  });

  t('irradiacionPlano acepta el total anual cuando no hay serie mensual', () => {
    const r = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 25, azimut: 0, anualHorizontal: 1777 });
    assert.ok(Math.abs(r.anualHorizontal - 1777) < 2, 'respeta el anual horizontal');
    assert.ok(r.anualPlano > r.anualHorizontal, 'el plano inclinado recibe más');
  });

  t('temperatura de celda: sube con la irradiancia', () => {
    const frio = S.perdidaTermica(10, 200, 45, -0.35);
    const calor = S.perdidaTermica(35, 1000, 45, -0.35);
    assert.ok(calor.tempCelda > frio.tempCelda);
    assert.ok(Math.abs(calor.tempCelda - (35 + (45 - 20) / 800 * 1000)) < 1e-9, 'modelo NOCT');
    assert.ok(calor.perdidaPct > frio.perdidaPct, 'más calor, más pérdida');
    assert.strictEqual(S.perdidaTermica(20, 0, 45, -0.35).perdidaPct, 0, 'sin sol no hay sobretemperatura útil');
  });

  t('pérdida térmica anual: magnitud realista y sensible al clima', () => {
    const r = S.irradiacionPlano({ lat: LAT_ROS, lon: LON_ROS, inclinacion: 25, azimut: 0, diariaHorizontal: ROSARIO });
    const conTemp = S.perdidaTermicaAnual(r, TEMP_ROSARIO, 45, -0.35);
    assert.ok(conTemp.perdidaPct > 2 && conTemp.perdidaPct < 9, 'pérdida ' + conTemp.perdidaPct + ' %');
    assert.ok(conTemp.tempCeldaMedia > 25 && conTemp.tempCeldaMedia < 55, 'celda a ' + conTemp.tempCeldaMedia + ' °C');
    const calido = S.perdidaTermicaAnual(r, TEMP_ROSARIO.map(x => x + 10), 45, -0.35);
    assert.ok(calido.perdidaPct > conTemp.perdidaPct, 'un sitio más cálido pierde más');
  });

  t('día despejado: pico cerca de 1000 W/m² y campana centrada', () => {
    const g = S.perfilClaroPlano(11, LAT_ROS, LON_ROS, 25, 0, 0.2);
    assert.strictEqual(g.length, 24);
    const pico = Math.max.apply(null, g);
    assert.ok(pico > 850 && pico < 1150, 'irradiancia pico ' + pico + ' W/m²');
    assert.strictEqual(g[0], 0, 'de madrugada no hay sol');
    assert.strictEqual(g[23], 0, 'de noche tampoco');
    const iPico = g.indexOf(pico);
    assert.ok(iPico >= 11 && iPico <= 14, 'el pico cae cerca del mediodía solar, hora ' + iPico);
  });

  t('día despejado: verano supera al invierno', () => {
    const dic = S.perfilClaroPlano(11, LAT_ROS, LON_ROS, 25, 0, 0.2).reduce((s, x) => s + x, 0);
    const jun = S.perfilClaroPlano(5, LAT_ROS, LON_ROS, 25, 0, 0.2).reduce((s, x) => s + x, 0);
    assert.ok(dic > jun, 'diciembre ' + dic.toFixed(0) + ' contra junio ' + jun.toFixed(0));
  });

  t('NASA POWER: la URL y el parseo de la respuesta', () => {
    const url = S.urlNasaPower(LAT_ROS, LON_ROS);
    assert.ok(url.indexOf('power.larc.nasa.gov') > 0);
    assert.ok(url.indexOf('latitude=-32.9500') > 0, url);
    assert.ok(url.indexOf('ALLSKY_SFC_SW_DWN') > 0);

    const meses = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const irr = {}, temp = {};
    meses.forEach((k, i) => { irr[k] = ROSARIO[i]; temp[k] = TEMP_ROSARIO[i]; });
    const d = S.parsearNasaPower({ properties: { parameter: { ALLSKY_SFC_SW_DWN: irr, T2M: temp } } });
    assert.deepStrictEqual(d.diariaHorizontal, ROSARIO);
    assert.deepStrictEqual(d.tempMensual, TEMP_ROSARIO);
  });

  t('NASA POWER: rechaza respuestas inservibles', () => {
    assert.throws(() => S.parsearNasaPower({}), /irradiación/);
    const malo = {}; ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
      .forEach(k => { malo[k] = -999; });
    assert.throws(() => S.parsearNasaPower({ properties: { parameter: { ALLSKY_SFC_SW_DWN: malo } } }), /inválidos/);
  });
}

module.exports = suite;
if (require.main === module) correrSuelta(suite);
