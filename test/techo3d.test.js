const assert = require('assert');
const { t, seccion, correrSuelta } = require('./_harness');
const Techo3D = require('../js/techo3d');

function suite() {
  seccion('techo3d.js · geometría, empaquetado y simulación solar 3D');

  t('calcAreaPerimetro: calcula área y perímetro de rectángulo conocido', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 20 },
      { x: 0, y: 20 }
    ];
    const r = Techo3D.calcAreaPerimetro(pts);
    assert.strictEqual(r.areaM2, 1000);
    assert.strictEqual(r.perimetroM, 140);
  });

  t('puntoEnPoligono: distingue puntos interiores y exteriores', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ];
    assert.strictEqual(Techo3D.puntoEnPoligono(5, 5, pts), true);
    assert.strictEqual(Techo3D.puntoEnPoligono(15, 5, pts), false);
    assert.strictEqual(Techo3D.puntoEnPoligono(-1, -1, pts), false);
  });

  t('distribuirPaneles: empaqueta módulos respetando márgenes y obstáculos', () => {
    const pts = [
      { x: -20, y: -10 },
      { x: 20, y: -10 },
      { x: 20, y: 10 },
      { x: -20, y: 10 }
    ];
    // Sin obstáculos
    const r1 = Techo3D.distribuirPaneles(pts, [], { potenciaWp: 575 });
    assert(r1.count > 50, 'Debe colocar más de 50 paneles en 800 m²');
    assert(r1.potenciaKwp > 25, 'Potencia debe superar los 25 kWp');

    // Con obstáculo grande en el centro
    const obs = [{ x: 0, y: 0, radio: 5.0 }];
    const r2 = Techo3D.distribuirPaneles(pts, obs, { potenciaWp: 575 });
    assert(r2.count < r1.count, 'Debe haber menos paneles debido al obstáculo');
  });

  t('calcularPosicionSolar: elevación solar positiva de día y negativa de noche', () => {
    const mediodia = Techo3D.calcularPosicionSolar(-34.6, -58.4, 0, 12.0); // Enero mediodía
    assert(mediodia.esDeDia, 'A las 12:00 hs debe ser de día');
    assert(mediodia.elevacionDeg > 60, 'El sol en verano al mediodía debe estar alto (> 60°)');

    const medianoche = Techo3D.calcularPosicionSolar(-34.6, -58.4, 0, 0.0); // Enero medianoche
    assert(!medianoche.esDeDia, 'A las 00:00 hs no debe ser de día');
    assert(medianoche.elevacionDeg < 0, 'Elevación debe ser negativa');
  });

  t('calcularLeasingExpress: métricas de leasing y cobertura del ahorro', () => {
    const r = Techo3D.calcularLeasingExpress(100, {
      costoPorWpKwp: 0.85,
      tarifaUsdKwh: 0.12,
      horasSolEquivalentes: 1600
    });

    assert(r.capexTotalUsd > 0, 'CAPEX debe ser positivo');
    assert(r.ahorroMensualUsd > 0, 'Ahorro mensual debe ser positivo');
    assert(r.cuotaLeasingMensualUsd > 0, 'Cuota leasing debe ser positiva');
    assert(r.ahorroNetoVeinticincoAnios > r.ahorroNetoCincoAnios, 'Ahorro a 25 años supera al de 5');
  });
}

if (require.main === module) correrSuelta(suite);
module.exports = suite;
