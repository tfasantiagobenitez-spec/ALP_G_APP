/* ==========================================================================
   finanzas.js — Alternativas de financiamiento de un proyecto fotovoltaico.

   Pone las cuatro opciones en la misma vara: compra al contado, leasing,
   préstamo bancario y PPA. Todas se expresan en dólares, con el ahorro
   convertido al tipo de cambio proyectado de cada año y descontadas a la
   misma tasa, así la comparación no depende de en qué moneda esté cada pata.

   Sin dependencias. Funciona en navegador y en Node (para tests).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Finanzas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Cuota constante del sistema francés. */
  function cuotaFrances(capital, tasaMensual, meses) {
    if (meses <= 0) return 0;
    if (tasaMensual <= 0) return capital / meses;
    const f = Math.pow(1 + tasaMensual, meses);
    return capital * tasaMensual * f / (f - 1);
  }

  /**
   * Tabla de amortización mes a mes.
   *   sistema  'frances' cuota constante | 'aleman' amortización constante
   *   ajusteAnual  indexación del capital (préstamos UVA); 0 para tasa fija
   * Devuelve las cuotas en la moneda del préstamo.
   */
  function tablaPrestamo(opciones) {
    const o = opciones || {};
    const capital = Math.max(0, num(o.monto, 0));
    const meses = Math.max(0, Math.round(num(o.plazoMeses, 0)));
    const tasaMensual = num(o.tasaAnual, 0) / 100 / 12;
    const ajusteMensual = Math.pow(1 + num(o.ajusteAnual, 0) / 100, 1 / 12) - 1;
    const aleman = o.sistema === 'aleman';

    const filas = [];
    if (capital <= 0 || meses <= 0) return filas;

    let saldo = capital;
    const cuotaBase = cuotaFrances(capital, tasaMensual, meses);
    const amortBase = capital / meses;

    for (let m = 1; m <= meses; m++) {
      // El capital indexado crece antes de devengar el interés del período
      const indexado = saldo * (1 + ajusteMensual);
      const interes = indexado * tasaMensual;
      let amortizacion;
      if (aleman) {
        amortizacion = amortBase * Math.pow(1 + ajusteMensual, m);
      } else {
        amortizacion = cuotaBase * Math.pow(1 + ajusteMensual, m) - interes;
      }
      amortizacion = Math.min(amortizacion, indexado);
      saldo = Math.max(0, indexado - amortizacion);
      if (m === meses) { amortizacion += saldo; saldo = 0; }
      filas.push({ mes: m, cuota: interes + amortizacion, interes, amortizacion, saldo });
    }
    return filas;
  }

  /** Agrupa una tabla mensual en totales por año. */
  function porAnio(filas, horizonte) {
    const out = new Array(horizonte).fill(0).map(() => ({ cuota: 0, interes: 0, amortizacion: 0 }));
    filas.forEach(f => {
      const a = Math.ceil(f.mes / 12);
      if (a >= 1 && a <= horizonte) {
        out[a - 1].cuota += f.cuota;
        out[a - 1].interes += f.interes;
        out[a - 1].amortizacion += f.amortizacion;
      }
    });
    return out;
  }

  /** Costo financiero total efectivo anual del préstamo, por bisección sobre la TIR mensual. */
  function costoFinanciero(capitalNeto, filas) {
    if (!filas.length || capitalNeto <= 0) return null;
    const flujos = [capitalNeto].concat(filas.map(f => -f.cuota));
    const van = r => flujos.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
    let lo = -0.99, hi = 3;
    let flo = van(lo), fhi = van(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = van(mid);
      if (Math.abs(fm) < 1e-9) { lo = hi = mid; break; }
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    const mensual = (lo + hi) / 2;
    return Math.pow(1 + mensual, 12) - 1;      // tasa efectiva anual
  }

  /**
   * Flujo del cliente comprando el sistema con un préstamo bancario.
   * ctx trae el marco monetario y fiscal del motor principal.
   */
  function flujoPrestamo(p, ctx) {
    const montoPct = Math.min(100, Math.max(0, p.pr_monto_pct));
    const capitalUSD = ctx.capexUSD * montoPct / 100;
    const gastosUSD = capitalUSD * p.pr_gastos_pct / 100;
    const aporteUSD = ctx.capexUSD - capitalUSD + gastosUSD;
    const enPesos = p.pr_moneda === 'ars' || p.pr_moneda === 'uva';
    const capitalPrestamo = enPesos ? capitalUSD * p.tc : capitalUSD;
    const ajuste = p.pr_moneda === 'uva' ? p.pr_ajuste : 0;

    const filas = tablaPrestamo({
      monto: capitalPrestamo,
      plazoMeses: p.pr_plazo,
      tasaAnual: p.pr_tasa,
      sistema: p.pr_sistema,
      ajusteAnual: ajuste,
    });
    const anual = porAnio(filas, p.horizonte);
    const cft = costoFinanciero(capitalPrestamo * (1 - p.pr_gastos_pct / 100), filas);

    const flujos = [-aporteUSD];
    const anios = [];
    let acum = -aporteUSD;
    for (let t = 1; t <= p.horizonte; t++) {
      const fGen = Math.pow(1 - ctx.dg, t - 1);
      const fInf = Math.pow(1 + ctx.inf, t - 1);
      const tc = ctx.tcAnio(t);
      const ahorroUSD = ctx.ahorroAnual1 * fGen * fInf / tc;
      const opexUSD = ctx.opexAnual1 * fInf / tc;
      // Las cuotas en pesos se convierten al tipo de cambio del año; en dólares van directo
      const cuotaUSD = enPesos ? anual[t - 1].cuota / tc : anual[t - 1].cuota;
      const interesUSD = enPesos ? anual[t - 1].interes / tc : anual[t - 1].interes;
      // El interés es gasto deducible; la amortización del equipo ya la computa la compra
      const amortEquipoUSD = t <= p.amort_anios ? (ctx.capexARS / p.amort_anios) / tc : 0;
      const escudo = (interesUSD + amortEquipoUSD) * ctx.g;
      const flujo = (ahorroUSD - opexUSD) * (1 - ctx.g) - cuotaUSD + escudo;
      acum += flujo;
      flujos.push(flujo);
      anios.push({ anio: t, ahorro: ahorroUSD, opex: opexUSD, cuota: cuotaUSD, interes: interesUSD, escudo, flujo, acum });
    }

    const totalCuotasUSD = anual.reduce((s, a, i) => s + (enPesos ? a.cuota / ctx.tcAnio(i + 1) : a.cuota), 0);
    return {
      montoPct, capitalUSD, gastosUSD, aporteUSD, capitalPrestamo, enPesos, ajuste,
      moneda: p.pr_moneda, sistema: p.pr_sistema, plazoMeses: p.pr_plazo, tasaAnual: p.pr_tasa,
      filas, anual, cft, totalCuotasUSD,
      primeraCuotaUSD: filas.length ? (enPesos ? filas[0].cuota / ctx.tcAnio(1) : filas[0].cuota) : 0,
      anios, flujos,
      van: npv(ctx.rUsd, flujos), tir: irr(flujos), payback: payback(flujos),
    };
  }

  /**
   * Flujo del cliente bajo un contrato PPA: no invierte, y compra al desarrollador
   * la energía solar que consume a un precio menor que el de la distribuidora.
   */
  function flujoPPA(p, ctx) {
    const plazo = Math.max(1, Math.round(p.ppa_plazo));
    const flujos = [0];
    const anios = [];
    let acum = 0, energiaTotal = 0, pagoTotal = 0;

    for (let t = 1; t <= p.horizonte; t++) {
      const fGen = Math.pow(1 - ctx.dg, t - 1);
      const fInf = Math.pow(1 + ctx.inf, t - 1);
      const tc = ctx.tcAnio(t);
      const dentro = t <= plazo;
      const energia = ctx.autoAnual * fGen;                       // kWh solares consumidos
      // Lo que el cliente le habría pagado a la distribuidora por esa energía
      const valorRed = ctx.ahorroAnual1 * fGen * fInf / tc;
      const precioPPA = p.ppa_tarifa * Math.pow(1 + p.ppa_ajuste / 100, t - 1);
      const pagoPPA = dentro ? energia * precioPPA : 0;
      // Terminado el contrato el cliente ejerce la opción y pasa a operar el sistema
      const opcion = t === plazo + 1 && plazo < p.horizonte ? p.ppa_opcion : 0;
      const opex = dentro ? 0 : ctx.opexAnual1 * fInf / tc;
      const escudo = (pagoPPA + opex) * ctx.g;
      const flujo = valorRed * (1 - ctx.g) - pagoPPA - opex - opcion + escudo;
      acum += flujo;
      flujos.push(flujo);
      if (dentro) { energiaTotal += energia; pagoTotal += pagoPPA; }
      anios.push({ anio: t, valorRed, pagoPPA, opcion, opex, escudo, flujo, acum, precioPPA });
    }

    return {
      plazo, tarifa: p.ppa_tarifa, ajuste: p.ppa_ajuste, opcion: p.ppa_opcion,
      energiaTotal, pagoTotal,
      descuentoVsRed: ctx.tarifaFullUSD > 0 ? (1 - p.ppa_tarifa / ctx.tarifaFullUSD) * 100 : 0,
      anios, flujos,
      van: npv(ctx.rUsd, flujos), tir: irr(flujos), payback: payback(flujos),
    };
  }

  /**
   * Tabla comparativa de las cuatro alternativas, todas en dólares y a la misma tasa.
   * `contado` y `leasing` llegan ya calculados por el motor principal.
   */
  function comparar(p, ctx, contado, leasing) {
    const prestamo = p.pr_monto_pct > 0 && p.pr_plazo > 0 ? flujoPrestamo(p, ctx) : null;
    const ppa = p.ppa_tarifa > 0 ? flujoPPA(p, ctx) : null;

    const filas = [
      {
        clave: 'contado', nombre: 'Compra al contado', disponible: true,
        desembolsoInicial: ctx.capexUSD,
        van: contado.vanUSD, tir: contado.tirUSD, payback: contado.payback,
        flujoMensual1: contado.flujoMensualUSD,
        costoTotal: ctx.capexUSD,
        nota: 'Máximo retorno, requiere el capital completo por adelantado.',
      },
      {
        clave: 'leasing', nombre: 'Leasing', disponible: p.l_canon_kwp > 0,
        desembolsoInicial: leasing.pagoInicial,
        van: leasing.van, tir: leasing.tir, payback: leasing.payback,
        flujoMensual1: leasing.flujoMensualUSD,
        costoTotal: leasing.neto,
        nota: 'Sin inmovilizar capital; el canon es gasto deducible.',
      },
    ];

    if (prestamo) {
      filas.push({
        clave: 'prestamo', nombre: 'Préstamo bancario', disponible: true,
        desembolsoInicial: prestamo.aporteUSD,
        van: prestamo.van, tir: prestamo.tir, payback: prestamo.payback,
        flujoMensual1: prestamo.anios.length ? prestamo.anios[0].flujo / 12 : 0,
        costoTotal: prestamo.aporteUSD + prestamo.totalCuotasUSD,
        nota: 'El equipo es del cliente desde el día uno y se amortiza fiscalmente.',
        detalle: prestamo,
      });
    }
    if (ppa) {
      filas.push({
        clave: 'ppa', nombre: 'PPA (compra de energía)', disponible: true,
        desembolsoInicial: 0,
        van: ppa.van, tir: ppa.tir, payback: ppa.payback,
        flujoMensual1: ppa.anios.length ? ppa.anios[0].flujo / 12 : 0,
        costoTotal: ppa.pagoTotal + ppa.opcion,
        nota: 'Sin inversión ni riesgo técnico; el ahorro es menor.',
        detalle: ppa,
      });
    }

    const validas = filas.filter(f => f.disponible && isFinite(f.van));
    const mejor = validas.length ? validas.reduce((a, b) => (b.van > a.van ? b : a)) : null;
    filas.forEach(f => { f.mejor = !!mejor && f.clave === mejor.clave; });

    return { filas, prestamo, ppa, mejor: mejor ? mejor.clave : null };
  }

  // ---- utilidades numéricas (duplicadas a propósito para no acoplar los módulos) ----
  function npv(rate, flujos) {
    let v = 0;
    for (let t = 0; t < flujos.length; t++) v += flujos[t] / Math.pow(1 + rate, t);
    return v;
  }
  function irr(flujos) {
    let lo = -0.99, hi = 10;
    let flo = npv(lo, flujos), fhi = npv(hi, flujos);
    if (isNaN(flo) || isNaN(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = npv(mid, flujos);
      if (Math.abs(fm) < 1e-7) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }
  function payback(flujos) {
    let acum = flujos[0];
    if (acum >= 0) return 0;
    for (let t = 1; t < flujos.length; t++) {
      const prev = acum;
      acum += flujos[t];
      if (acum >= 0) return flujos[t] > 0 ? (t - 1) + (-prev / flujos[t]) : t;
    }
    return null;
  }
  function num(v, def) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : def;
  }

  return {
    cuotaFrances,
    tablaPrestamo,
    porAnio,
    costoFinanciero,
    flujoPrestamo,
    flujoPPA,
    comparar,
  };
});
