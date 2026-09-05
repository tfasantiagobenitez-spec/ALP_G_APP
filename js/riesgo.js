/* ==========================================================================
   riesgo.js — Análisis de incertidumbre del proyecto.

   Dos herramientas complementarias:
     · Monte Carlo: sortea miles de escenarios y devuelve la distribución del VAN,
       con la probabilidad de que el proyecto dé positivo y los percentiles P10/P50/P90.
     · Tornado: mueve una variable por vez y ordena cuánto pesa cada una,
       que es lo que hay que mirar antes de negociar un precio o una tarifa.

   El generador de números aleatorios lleva semilla, así el mismo proyecto
   devuelve siempre los mismos números y la propuesta es reproducible.

   Recibe la función `calcular` por parámetro para no acoplarse al motor.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Riesgo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Generador congruencial mulberry32: rápido, reproducible y suficiente para esto. */
  function generador(semilla) {
    let a = semilla >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Normal estándar por el método polar de Box-Muller. */
  function normal(rnd) {
    let u = 0, v = 0, s = 0;
    do {
      u = rnd() * 2 - 1; v = rnd() * 2 - 1; s = u * u + v * v;
    } while (s === 0 || s >= 1);
    return u * Math.sqrt(-2 * Math.log(s) / s);
  }

  /**
   * Variables inciertas y su dispersión típica.
   *   modo 'rel' → desvío en % del valor base; 'abs' → desvío en puntos
   *   piso / techo acotan el sorteo a valores con sentido físico
   */
  const VARIABLES = [
    { clave: 'genM', nombre: 'Recurso solar', modo: 'rel', sigma: 4, unidad: '%',
      detalle: 'Variabilidad interanual de la irradiación (P90 a P10)' },
    { clave: 'tarifa_resto', nombre: 'Tarifa eléctrica', modo: 'rel', sigma: 10, unidad: '%',
      detalle: 'Incertidumbre sobre el precio de la energía al momento de facturar' },
    { clave: 'usd_kwp', nombre: 'Costo del sistema', modo: 'rel', sigma: 8, unidad: '%',
      detalle: 'Variación del precio de módulos, inversores y montaje' },
    { clave: 'inflacion', nombre: 'Actualización tarifaria', modo: 'abs', sigma: 5, unidad: 'p.p.', piso: 0,
      detalle: 'Ritmo al que la distribuidora actualiza la tarifa en pesos' },
    { clave: 'devaluacion', nombre: 'Devaluación', modo: 'abs', sigma: 5, unidad: 'p.p.', piso: 0,
      detalle: 'Ritmo de depreciación del peso frente al dólar' },
    { clave: 'deg', nombre: 'Degradación de módulos', modo: 'abs', sigma: 0.15, unidad: 'p.p.', piso: 0, techo: 2,
      detalle: 'Pérdida anual de rendimiento de los paneles' },
  ];

  function num(v, def) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : def;
  }

  /** Lee el valor base de una variable en el estado crudo. */
  function valorBase(estado, clave, normalizar) {
    const p = normalizar(estado);
    if (clave === 'genM') return 1;                 // se trata como factor multiplicativo
    return num(p[clave], 0);
  }

  /** Devuelve un estado con la variable movida al valor indicado. */
  function aplicar(estado, clave, valor) {
    const e = Object.assign({}, estado);
    if (clave === 'genM') {
      let a = e.genM;
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch (err) { a = null; } }
      if (!Array.isArray(a)) return e;
      e.genM = JSON.stringify(a.map(x => num(x, 0) * valor));
    } else {
      e[clave] = String(valor);
    }
    return e;
  }

  function acotar(v, def) {
    let x = v;
    if (def.piso !== undefined) x = Math.max(def.piso, x);
    if (def.techo !== undefined) x = Math.min(def.techo, x);
    return x;
  }

  function percentil(ordenados, p) {
    if (!ordenados.length) return 0;
    const i = (ordenados.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo);
  }

  /**
   * Simulación de Monte Carlo sobre el VAN en dólares.
   *
   * opciones: { n, semilla, variables: {clave: sigma}, normalizar }
   * calcular: la función del motor que convierte un estado en resultados
   */
  function montecarlo(estado, opciones, calcular, normalizar) {
    const o = opciones || {};
    const n = Math.max(50, Math.min(20000, Math.round(num(o.n, 800))));
    const rnd = generador(num(o.semilla, 20260101));
    const defs = VARIABLES.map(v => Object.assign({}, v, {
      sigma: o.variables && o.variables[v.clave] !== undefined ? num(o.variables[v.clave], v.sigma) : v.sigma,
    })).filter(v => v.sigma > 0);

    const base = {};
    defs.forEach(v => { base[v.clave] = valorBase(estado, v.clave, normalizar); });

    const vanes = [], tires = [], paybacks = [];
    let positivos = 0, sinRepago = 0;

    for (let i = 0; i < n; i++) {
      let e = estado;
      defs.forEach(v => {
        const z = normal(rnd);
        const valor = v.modo === 'rel'
          ? base[v.clave] * (1 + z * v.sigma / 100)
          : base[v.clave] + z * v.sigma;
        e = aplicar(e, v.clave, acotar(valor, v));
      });
      const r = calcular(e);
      vanes.push(r.vanUSD);
      if (r.vanUSD > 0) positivos++;
      if (r.tir !== null) tires.push(r.tirUSD === null ? r.tir : r.tirUSD);
      if (r.payback === null) sinRepago++; else paybacks.push(r.payback);
    }

    const ordenados = vanes.slice().sort((a, b) => a - b);
    const media = vanes.reduce((s, x) => s + x, 0) / vanes.length;
    const varianza = vanes.reduce((s, x) => s + (x - media) * (x - media), 0) / vanes.length;
    const tirOrd = tires.slice().sort((a, b) => a - b);
    const pbOrd = paybacks.slice().sort((a, b) => a - b);

    return {
      n, semilla: num(o.semilla, 20260101), variables: defs,
      vanes: ordenados,
      media, desvio: Math.sqrt(varianza),
      p10: percentil(ordenados, 0.10),
      p50: percentil(ordenados, 0.50),
      p90: percentil(ordenados, 0.90),
      min: ordenados[0], max: ordenados[ordenados.length - 1],
      probPositivo: positivos / n * 100,
      tirP10: percentil(tirOrd, 0.10), tirP50: percentil(tirOrd, 0.50), tirP90: percentil(tirOrd, 0.90),
      paybackP10: percentil(pbOrd, 0.10), paybackP50: percentil(pbOrd, 0.50), paybackP90: percentil(pbOrd, 0.90),
      sinRepagoPct: sinRepago / n * 100,
      histograma: histograma(ordenados, 24),
    };
  }

  function histograma(ordenados, bins) {
    if (!ordenados.length) return [];
    const min = ordenados[0], max = ordenados[ordenados.length - 1];
    const ancho = (max - min) / bins || 1;
    const out = [];
    for (let b = 0; b < bins; b++) out.push({ desde: min + b * ancho, hasta: min + (b + 1) * ancho, n: 0 });
    ordenados.forEach(v => {
      let b = Math.floor((v - min) / ancho);
      if (b >= bins) b = bins - 1;
      if (b < 0) b = 0;
      out[b].n++;
    });
    return out;
  }

  /**
   * Diagrama de tornado: mueve cada variable un desvío hacia arriba y hacia abajo
   * dejando el resto en su valor base, y ordena por amplitud del efecto sobre el VAN.
   */
  function tornado(estado, opciones, calcular, normalizar) {
    const o = opciones || {};
    const k = num(o.desvios, 1.5);                  // cuántos sigmas se mueve cada variable
    const rBase = calcular(estado);
    const defs = VARIABLES.map(v => Object.assign({}, v, {
      sigma: o.variables && o.variables[v.clave] !== undefined ? num(o.variables[v.clave], v.sigma) : v.sigma,
    })).filter(v => v.sigma > 0);

    const filas = defs.map(v => {
      const base = valorBase(estado, v.clave, normalizar);
      const delta = v.modo === 'rel' ? base * (k * v.sigma / 100) : k * v.sigma;
      const bajo = acotar(base - delta, v);
      const alto = acotar(base + delta, v);
      const vanBajo = calcular(aplicar(estado, v.clave, bajo)).vanUSD;
      const vanAlto = calcular(aplicar(estado, v.clave, alto)).vanUSD;
      return {
        clave: v.clave, nombre: v.nombre, detalle: v.detalle, unidad: v.unidad, modo: v.modo,
        base, bajo, alto, vanBajo, vanAlto,
        amplitud: Math.abs(vanAlto - vanBajo),
        // Cuánto cambia el VAN por cada punto porcentual de la variable
        sensibilidad: delta !== 0 ? (vanAlto - vanBajo) / (2 * delta) : 0,
      };
    }).sort((a, b) => b.amplitud - a.amplitud);

    const maxAmplitud = filas.length ? filas[0].amplitud : 0;
    filas.forEach(f => { f.pesoRelativo = maxAmplitud > 0 ? f.amplitud / maxAmplitud * 100 : 0; });

    return { vanBase: rBase.vanUSD, desvios: k, filas, maxAmplitud };
  }

  return { VARIABLES, generador, normal, montecarlo, tornado, percentil, histograma };
});
