/* ==========================================================================
   calc.js — Motor de cálculo técnico-económico para proyectos fotovoltaicos
   Sin dependencias. Funciona en navegador y en Node (para tests).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Perfil mensual típico de generación (hemisferio sur, Argentina centro).
  // Fracciones normalizadas; se usa para estimar genM cuando no hay dato medido.
  const PERFIL_GEN = [0.1094, 0.0979, 0.0891, 0.0736, 0.0591, 0.0502, 0.0532, 0.0676, 0.0835, 0.0986, 0.1065, 0.1113];

  // Base de datos de radiación solar para ciudades y regiones de Argentina
  const CIUDADES_ARGENTINA = [
    { id: 'caba', nombre: 'Buenos Aires (CABA / AMBA)', prov: 'Buenos Aires', lat: -34.60, lon: -58.38, irrad: 1750 },
    { id: 'lp', nombre: 'La Plata', prov: 'Buenos Aires', lat: -34.92, lon: -57.95, irrad: 1740 },
    { id: 'mdp', nombre: 'Mar del Plata / Costa', prov: 'Buenos Aires', lat: -38.00, lon: -57.55, irrad: 1680 },
    { id: 'bb', nombre: 'Bahía Blanca', prov: 'Buenos Aires', lat: -38.71, lon: -62.27, irrad: 1820 },
    { id: 'tan', nombre: 'Tandil / Olavarría / Azul', prov: 'Buenos Aires', lat: -37.32, lon: -59.13, irrad: 1750 },
    { id: 'ros', nombre: 'Rosario', prov: 'Santa Fe', lat: -32.95, lon: -60.65, irrad: 1820 },
    { id: 'stfe', nombre: 'Santa Fe Capital', prov: 'Santa Fe', lat: -31.63, lon: -60.70, irrad: 1835 },
    { id: 'raf', nombre: 'Rafaela / Venado Tuerto', prov: 'Santa Fe', lat: -31.25, lon: -61.49, irrad: 1830 },
    { id: 'cba', nombre: 'Córdoba Capital', prov: 'Córdoba', lat: -31.42, lon: -64.18, irrad: 1910 },
    { id: 'rc', nombre: 'Río Cuarto / Villa María', prov: 'Córdoba', lat: -33.12, lon: -64.35, irrad: 1890 },
    { id: 'mza', nombre: 'Mendoza Capital / Gran Mendoza', prov: 'Mendoza', lat: -32.89, lon: -68.84, irrad: 2050 },
    { id: 'sr', nombre: 'San Rafael / General Alvear', prov: 'Mendoza', lat: -34.61, lon: -68.33, irrad: 2020 },
    { id: 'sj', nombre: 'San Juan Capital', prov: 'San Juan', lat: -31.53, lon: -68.53, irrad: 2180 },
    { id: 'sla', nombre: 'Salta Capital / Valle de Lerma', prov: 'Salta', lat: -24.78, lon: -65.41, irrad: 2120 },
    { id: 'juj', nombre: 'San Salvador de Jujuy', prov: 'Jujuy', lat: -24.18, lon: -65.30, irrad: 2150 },
    { id: 'puna', nombre: 'Puna Jujeña / Cauchari', prov: 'Jujuy', lat: -23.75, lon: -66.80, irrad: 2450 },
    { id: 'tuc', nombre: 'San Miguel de Tucumán', prov: 'Tucumán', lat: -26.82, lon: -65.22, irrad: 1850 },
    { id: 'nqn', nombre: 'Neuquén Capital / Alto Valle', prov: 'Neuquén', lat: -38.95, lon: -68.06, irrad: 1880 },
    { id: 'brc', nombre: 'San Carlos de Bariloche', prov: 'Río Negro', lat: -41.13, lon: -71.30, irrad: 1620 },
    { id: 'pm', nombre: 'Puerto Madryn / Trelew', prov: 'Chubut', lat: -43.25, lon: -65.31, irrad: 1720 },
    { id: 'cr', nombre: 'Comodoro Rivadavia', prov: 'Chubut', lat: -45.86, lon: -67.50, irrad: 1610 },
    { id: 'rg', nombre: 'Río Gallegos / El Calafate', prov: 'Santa Cruz', lat: -51.62, lon: -69.21, irrad: 1390 },
    { id: 'ush', nombre: 'Ushuaia / Río Grande', prov: 'Tierra del Fuego', lat: -54.80, lon: -68.30, irrad: 1180 },
    { id: 'nea', nombre: 'Resistencia / Corrientes', prov: 'Chaco / Corrientes', lat: -27.45, lon: -58.98, irrad: 1840 },
    { id: 'pos', nombre: 'Posadas / Iguazú', prov: 'Misiones', lat: -27.36, lon: -55.90, irrad: 1780 },
    { id: 'er', nombre: 'Paraná / Concordia / Gualeguaychú', prov: 'Entre Ríos', lat: -31.73, lon: -60.53, irrad: 1810 },
    { id: 'sl', nombre: 'San Luis Capital / Villa Mercedes', prov: 'San Luis', lat: -33.30, lon: -66.33, irrad: 1980 },
    { id: 'noa2', nombre: 'Catamarca / La Rioja', prov: 'NOA', lat: -28.46, lon: -65.78, irrad: 2100 },
    { id: 'lpampa', nombre: 'Santa Rosa / General Pico', prov: 'La Pampa', lat: -36.62, lon: -64.29, irrad: 1840 },
  ];

  /** Convierte "1.234,56" / "8,05" / "1430" / 12 a número. */
  function num(v, def) {
    if (v === null || v === undefined || v === '') return def || 0;
    if (typeof v === 'number') return isFinite(v) ? v : (def || 0);
    let s = String(v).trim();
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : (def || 0);
  }

  /** Parsea arrays guardados como string JSON ("[1,2,3]") o ya como array. */
  function arr(v, len, def) {
    let a = v;
    if (typeof v === 'string') { try { a = JSON.parse(v); } catch (e) { a = null; } }
    if (!Array.isArray(a)) a = [];
    const out = [];
    for (let i = 0; i < len; i++) out.push(a[i] === undefined ? def : a[i]);
    return out;
  }

  function parseImpuestos(v) {
    let a = v;
    if (typeof v === 'string') { try { a = JSON.parse(v); } catch (e) { a = []; } }
    if (!Array.isArray(a)) a = [];
    const out = [];
    for (let i = 0; i < 5; i++) {
      const it = a[i] || {};
      out.push({ nombre: it.nombre || '', pct: num(it.pct) });
    }
    return out;
  }

  /** Normaliza el objeto `estado` (todo string) a valores numéricos con defaults. */
  function normalizar(estado) {
    const e = estado || {};
    return {
      cliente_nombre: e.cliente_nombre || '',
      cliente_ubicacion: e.cliente_ubicacion || '',
      ciudad_id: e.ciudad_id || '',
      tipoInst: e.tipoInst || 'chapa',
      tipoSistema: e.tipoSistema || 'industrial',
      presu_numero: e.presu_numero || '',
      presu_cuit: e.presu_cuit || '',
      presu_paneles: num(e.presu_paneles),
      panel_w: num(e.panel_w, 575),
      kwp: num(e.kwp),
      usd_kwp: num(e.usd_kwp),
      tc: num(e.tc, 1) || 1,
      pr: num(e.pr, 83),
      irrad: num(e.irrad, 1800),
      deg: num(e.deg, 0.5),
      tarifa_resto: num(e.tarifa_resto),
      inflacion: num(e.inflacion),
      horizonte: Math.max(1, Math.round(num(e.horizonte, 20))),
      tasa_desc: num(e.tasa_desc, 10),
      opex_pct: num(e.opex_pct, 0),
      recambio_pct: num(e.recambio_pct, 10),
      recambio_cada: Math.max(1, Math.round(num(e.recambio_cada, 11))),
      incluirRecambio: e.incluirRecambio === 'si',
      // Baterías / Almacenamiento (BESS)
      incluirBateria: e.incluirBateria === 'si',
      bat_kwh: num(e.bat_kwh, 10),
      bat_usd_kwh: num(e.bat_usd_kwh, 450),
      bat_dod: num(e.bat_dod, 80),
      bat_tipo: e.bat_tipo || 'litio',
      impuestos: parseImpuestos(e.impData),
      genM: arr(e.genM, 12, 0).map(x => num(x)),
      conM: arr(e.conM, 12, 0).map(x => num(x)),
      conEst: arr(e.conEst, 12, false).map(x => x === true || x === 'true'),
      genFuente: e.genFuente || 'manual',
      excModo: e.excModo === 'iny' ? 'iny' : 'sin',
      tarifa_iny: num(e.tarifa_iny),
      l_canon_kwp: num(e.l_canon_kwp),
      l_pago_ini: num(e.l_pago_ini),
      l_opcion: num(e.l_opcion),
      l_seguro: num(e.l_seguro),
      l_mtto: num(e.l_mtto),
      l_tasa_gan: num(e.l_tasa_gan, 30),
      l_plazo: Math.max(1, Math.round(num(e.l_plazo, 60))),
      lGanancias: e.lGanancias !== 'no',
      factor_co2: num(e.factor_co2, 0.45), // kg CO2 / kWh (matriz eléctrica promedio Argentina SADI)
    };
  }

  /** Generación mensual estimada a partir de kWp, irradiación anual (kWh/m²) y PR (%). */
  function estimarGeneracion(kwp, irrad, pr) {
    const anual = kwp * irrad * (pr / 100);
    return PERFIL_GEN.map(f => Math.round(anual * f));
  }

  function npv(rate, flujos) {
    let v = 0;
    for (let t = 0; t < flujos.length; t++) v += flujos[t] / Math.pow(1 + rate, t);
    return v;
  }

  /** TIR por bisección. Devuelve null si no hay cambio de signo. */
  function irr(flujos) {
    let lo = -0.99, hi = 10;
    let flo = npv(lo, flujos), fhi = npv(hi, flujos);
    if (isNaN(flo) || isNaN(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm = npv(mid, flujos);
      if (Math.abs(fm) < 1e-7) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  /** Payback con interpolación lineal dentro del año. null si no recupera. */
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

  /** Cálculo principal. Recibe `estado` crudo (strings) y devuelve resultados. */
  function calcular(estado) {
    const p = normalizar(estado);

    // --- Energía año 1 ---
    const gen = p.genM.slice();
    const con = p.conM.slice();
    const auto = [], exc = [], red = [];
    for (let m = 0; m < 12; m++) {
      auto.push(Math.min(gen[m], con[m]));
      exc.push(Math.max(gen[m] - con[m], 0));
      red.push(Math.max(con[m] - gen[m], 0));
    }
    const sum = a => a.reduce((s, x) => s + x, 0);
    const genAnual = sum(gen), conAnual = sum(con), autoAnual = sum(auto), excAnual = sum(exc);

    // --- Tarifa ---
    const impTotalPct = p.impuestos.reduce((s, i) => s + i.pct, 0);
    const tarifaFull = p.tarifa_resto * (1 + impTotalPct / 100);   // $/kWh con impuestos
    const tarifaIny = p.excModo === 'iny' ? p.tarifa_iny : 0;

    const ahorroMensual = auto.map((a, m) => a * tarifaFull + exc[m] * tarifaIny);
    const ahorroAnual1 = sum(ahorroMensual);

    // --- Inversión ---
    const capexSolarUSD = p.kwp * p.usd_kwp;
    const capexBatUSD = p.incluirBateria ? p.bat_kwh * p.bat_usd_kwh : 0;
    const capexUSD = capexSolarUSD + capexBatUSD;
    const capexARS = capexUSD * p.tc;
    const opexAnual1 = capexARS * (p.opex_pct / 100);

    // --- Batería y Autonomía ---
    const capUtilBat = p.incluirBateria ? p.bat_kwh * (p.bat_dod / 100) : 0;
    const demandaMediaHora = conAnual > 0 ? conAnual / 8760 : 0;
    const autonomiaHoras = demandaMediaHora > 0 ? capUtilBat / demandaMediaHora : 0;

    // --- Flujo de caja (ARS nominales) ---
    const anios = [];
    const flujos = [-capexARS];
    let acum = -capexARS, acumDesc = -capexARS;
    let genTotal = 0, ahorroTotal = 0;
    const r = p.tasa_desc / 100, inf = p.inflacion / 100, dg = p.deg / 100;
    for (let t = 1; t <= p.horizonte; t++) {
      const fGen = Math.pow(1 - dg, t - 1);
      const fInf = Math.pow(1 + inf, t - 1);
      const genT = genAnual * fGen;
      const ahorroT = ahorroAnual1 * fGen * fInf;
      const opexT = opexAnual1 * fInf;
      const recambioT = (p.incluirRecambio && t % p.recambio_cada === 0 && t < p.horizonte)
        ? capexARS * (p.recambio_pct / 100) * fInf : 0;
      const flujo = ahorroT - opexT - recambioT;
      const desc = flujo / Math.pow(1 + r, t);
      acum += flujo; acumDesc += desc;
      genTotal += genT; ahorroTotal += ahorroT;
      flujos.push(flujo);
      anios.push({ anio: t, gen: genT, ahorro: ahorroT, opex: opexT, recambio: recambioT, flujo, acum, desc, acumDesc });
    }

    const van = npv(r, flujos);
    const tir = irr(flujos);
    const pb = payback(flujos);
    const pbDesc = payback(flujos.map((f, t) => f / Math.pow(1 + r, t)));

    // LCOE: (CAPEX + Σ costos descontados) / Σ generación descontada
    let costosDesc = capexARS, genDesc = 0;
    anios.forEach(a => {
      costosDesc += (a.opex + a.recambio) / Math.pow(1 + r, a.anio);
      genDesc += a.gen / Math.pow(1 + r, a.anio);
    });
    const lcoeARS = genDesc > 0 ? costosDesc / genDesc : 0;

    // --- Impacto Ambiental (Huella de Carbono) ---
    // Factor de emisión típico red argentina: ~0.45 kg CO2/kWh
    const co2AnualTon = (genAnual * p.factor_co2) / 1000;
    const co2TotalTon = (genTotal * p.factor_co2) / 1000;
    const arbolesEq = Math.round((co2AnualTon * 1000) / 21.7); // ~21.7 kg CO2/árbol/año
    const kmAutoEq = Math.round((co2AnualTon * 1000) / 0.19);  // ~0.19 kg CO2/km auto a nafta

    // --- Leasing ---
    const leasing = calcularLeasing(p, { ahorroAnual1, capexUSD, capexARS, opexAnual1, r, inf, dg });

    return {
      p, meses: MESES,
      gen, con, auto, exc, red,
      genAnual, conAnual, autoAnual, excAnual,
      coberturaPct: conAnual > 0 ? autoAnual / conAnual * 100 : 0,
      aprovechamientoPct: genAnual > 0 ? autoAnual / genAnual * 100 : 0,
      genEspecifica: p.kwp > 0 ? genAnual / p.kwp : 0,
      impTotalPct, tarifaFull, tarifaIny,
      ahorroMensual, ahorroAnual1, ahorroAnual1USD: ahorroAnual1 / p.tc,
      capexSolarUSD, capexBatUSD, capexUSD, capexARS, opexAnual1,
      capUtilBat, autonomiaHoras,
      anios, flujos, van, vanUSD: van / p.tc, tir, payback: pb, paybackDesc: pbDesc,
      lcoeARS, lcoeUSD: lcoeARS / p.tc,
      genTotal, ahorroTotal, ahorroTotalUSD: ahorroTotal / p.tc,
      co2AnualTon, co2TotalTon, arbolesEq, kmAutoEq,
      leasing,
    };
  }

  /**
   * Leasing (en USD, tipo de cambio constante).
   */
  function calcularLeasing(p, ctx) {
    const canonMensual = p.l_canon_kwp * p.kwp;
    const plazoAnios = p.l_plazo / 12;
    const canonTotal = canonMensual * p.l_plazo;
    const seguroTotal = p.l_seguro * plazoAnios;
    const mttoTotal = p.l_mtto * plazoAnios;
    const bruto = p.l_pago_ini + canonTotal + p.l_opcion + seguroTotal + mttoTotal;
    const deducible = canonTotal + seguroTotal + mttoTotal;
    const ahorroImp = p.lGanancias ? deducible * (p.l_tasa_gan / 100) : 0;
    const neto = bruto - ahorroImp;
    const ahorroMensualUSD = ctx.ahorroAnual1 / 12 / p.tc;
    const cuotaMensualUSD = canonMensual + (p.l_seguro + p.l_mtto) / 12;
    const flujoMensualUSD = ahorroMensualUSD - cuotaMensualUSD;

    // Flujo anual en USD (ahorro energético con inflación/degradación; costos del leasing fijos en USD)
    const flujos = [-p.l_pago_ini];
    const anios = [];
    let acum = -p.l_pago_ini;
    const nAnios = Math.ceil(plazoAnios);
    for (let t = 1; t <= p.horizonte; t++) {
      const fGen = Math.pow(1 - ctx.dg, t - 1);
      const fInf = Math.pow(1 + ctx.inf, t - 1);
      const ahorroT = ctx.ahorroAnual1 * fGen * fInf / p.tc;
      let costoT = 0, escudo = 0;
      if (t <= nAnios) {
        const mesesAnio = Math.min(12, p.l_plazo - (t - 1) * 12);
        const canonT = canonMensual * mesesAnio;
        const segT = p.l_seguro * mesesAnio / 12;
        const mttoT = p.l_mtto * mesesAnio / 12;
        costoT = canonT + segT + mttoT;
        escudo = p.lGanancias ? costoT * (p.l_tasa_gan / 100) : 0;
        if (t === nAnios) costoT += p.l_opcion;
      } else {
        costoT = ctx.opexAnual1 * fInf / p.tc;
      }
      const flujo = ahorroT - costoT + escudo;
      acum += flujo;
      flujos.push(flujo);
      anios.push({ anio: t, ahorro: ahorroT, costo: costoT, escudo, flujo, acum });
    }
    return {
      canonMensual, plazoMeses: p.l_plazo, plazoAnios, canonTotal, seguroTotal, mttoTotal,
      pagoInicial: p.l_pago_ini, opcion: p.l_opcion,
      bruto, ahorroImp, neto,
      capexUSD: ctx.capexUSD, sobrecostoVsContado: neto - ctx.capexUSD,
      ahorroMensualUSD, cuotaMensualUSD, flujoMensualUSD,
      anios, flujos,
      van: npv(ctx.r, flujos), tir: irr(flujos), payback: payback(flujos),
    };
  }

  /**
   * Genera el perfil horario medio de 24 horas (campana solar vs demanda del cliente).
   */
  function generarPerfil24h(estado) {
    const p = normalizar(estado);
    const r = calcular(estado);
    const genMediaDia = r.genAnual / 365; // kWh/día medio
    const conMediaDia = r.conAnual / 365; // kWh/día medio

    // Fracciones horarias de radiación solar (0 a 23 hs, campana centrada a las 13 hs)
    const fracGenHora = [
      0, 0, 0, 0, 0, 0, 0.005, 0.03, 0.07, 0.11, 0.14, 0.16, 0.17, 0.15, 0.11, 0.07, 0.03, 0.005, 0, 0, 0, 0, 0, 0
    ];

    // Fracciones horarias de consumo según tipoSistema
    let fracConHora;
    if (p.tipoSistema === 'comercial') {
      fracConHora = [
        0.015, 0.015, 0.015, 0.015, 0.015, 0.02, 0.03, 0.05, 0.07, 0.08, 0.085, 0.085, 0.08, 0.075, 0.08, 0.085, 0.08, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015
      ];
    } else if (p.tipoSistema === 'residencial') {
      fracConHora = [
        0.02, 0.015, 0.015, 0.015, 0.015, 0.02, 0.04, 0.06, 0.06, 0.04, 0.03, 0.03, 0.035, 0.035, 0.035, 0.04, 0.05, 0.065, 0.085, 0.095, 0.095, 0.08, 0.05, 0.03
      ];
    } else {
      // Industrial continuo / 2 turnos
      fracConHora = [
        0.03, 0.03, 0.03, 0.03, 0.035, 0.045, 0.055, 0.06, 0.06, 0.06, 0.06, 0.06, 0.055, 0.055, 0.06, 0.06, 0.06, 0.055, 0.045, 0.04, 0.035, 0.03, 0.03, 0.03
      ];
    }

    const horas = [];
    let batNivel = 0; // kWh almacenados en la batería
    const batCapUtil = p.incluirBateria ? p.bat_kwh * (p.bat_dod / 100) : 0;
    const batPotenciaMax = batCapUtil / 2; // C-rate 0.5C (ej: 10 kWh útil -> max 5 kW potencia carga/descarga)

    for (let h = 0; h < 24; h++) {
      const g = genMediaDia * fracGenHora[h];
      const c = conMediaDia * fracConHora[h];
      const autoDirecto = Math.min(g, c);
      let excBruto = Math.max(0, g - c);
      let redBruto = Math.max(0, c - g);
      
      let batCarga = 0;
      let batDescarga = 0;

      if (p.incluirBateria && batCapUtil > 0) {
        // Si hay excedente solar, cargar batería
        if (excBruto > 0 && batNivel < batCapUtil) {
          const espacioLibre = batCapUtil - batNivel;
          batCarga = Math.min(excBruto, espacioLibre, batPotenciaMax);
          batNivel += batCarga * 0.95; // eficiencia de carga 95%
          excBruto -= batCarga;
        }
        // Si falta energía y la batería tiene carga (especialmente en horas pico/tarde), descargar
        else if (redBruto > 0 && batNivel > 0) {
          batDescarga = Math.min(redBruto, batNivel, batPotenciaMax);
          batNivel -= batDescarga;
          redBruto -= batDescarga;
        }
      }

      const autoTotal = autoDirecto + batDescarga;

      horas.push({
        hora: h,
        etiqueta: String(h).padStart(2, '0') + ':00',
        gen: g,
        con: c,
        auto: autoDirecto,
        autoTotal: autoTotal,
        exc: excBruto,
        red: redBruto,
        batCarga: batCarga,
        batDescarga: batDescarga,
        batNivel: batNivel,
        batSoCPct: batCapUtil > 0 ? (batNivel / batCapUtil) * 100 : 0
      });
    }
    return horas;
  }

  /**
   * Dimensionamiento por área de techo / cubierta disponible.
   */
  function dimensionarPorTecho(opciones) {
    const areaM2 = num(opciones.areaM2, 100);
    const tipoCubierta = opciones.tipoCubierta || 'chapa';
    const panelWp = num(opciones.panelWp, 575);
    const irrad = num(opciones.irrad, 1800);
    const pr = num(opciones.pr, 83);

    // Dimensiones típicas panel ~575Wp: 2.278m × 1.134m ≈ 2.58 m²
    const areaPanelM2 = 2.58;

    // Factores de aprovechamiento efectivo de superficie según cubierta
    let factorOcupacion = 0.75; // Chapa coplanar
    if (tipoCubierta === 'losa') factorOcupacion = 0.55; // Losa con estructura inclinada y pasillos anti-sombra
    else if (tipoCubierta === 'teja') factorOcupacion = 0.65; // Tejas con cortes y obstáculos
    else if (tipoCubierta === 'tierra') factorOcupacion = 0.50; // Suelo con callejones

    const areaUtil = areaM2 * factorOcupacion;
    const paneles = Math.max(1, Math.floor(areaUtil / areaPanelM2));
    const kwp = Number((paneles * panelWp / 1000).toFixed(2));
    const genAnualEstimada = Math.round(kwp * irrad * (pr / 100));
    const pesoEstructuraKgM2 = tipoCubierta === 'losa' ? 22 : tipoCubierta === 'teja' ? 16 : 13.5; // kg/m² sobrecarga

    return {
      areaM2,
      tipoCubierta,
      factorOcupacion,
      areaUtil: Number(areaUtil.toFixed(1)),
      paneles,
      panelWp,
      kwp,
      genAnualEstimada,
      pesoSobrecargaKgM2: pesoEstructuraKgM2,
      pesoTotalKg: Math.round(paneles * 28.5 + areaUtil * (pesoEstructuraKgM2 - 11))
    };
  }

  /**
   * Dimensionamiento por objetivo de cobertura de consumo.
   */
  function dimensionarPorConsumo(opciones) {
    const conAnual = num(opciones.conAnual, 12000);
    const coberturaPct = num(opciones.coberturaPct, 70);
    const irrad = num(opciones.irrad, 1800);
    const pr = num(opciones.pr, 83);
    const panelWp = num(opciones.panelWp, 575);

    const energiaObjetivo = conAnual * (coberturaPct / 100);
    const rendimientoEspecifico = irrad * (pr / 100); // kWh/kWp
    const kwpObjetivo = rendimientoEspecifico > 0 ? energiaObjetivo / rendimientoEspecifico : 0;
    
    const paneles = Math.max(1, Math.ceil((kwpObjetivo * 1000) / panelWp));
    const kwpReal = Number((paneles * panelWp / 1000).toFixed(2));
    const genAnualReal = Math.round(kwpReal * rendimientoEspecifico);
    const coberturaRealPct = conAnual > 0 ? Number(((genAnualReal / conAnual) * 100).toFixed(1)) : 0;

    return {
      conAnual,
      coberturaDeseadaPct: coberturaPct,
      paneles,
      kwp: kwpReal,
      genAnual: genAnualReal,
      coberturaRealPct,
      areaRequeridaM2: Math.round(paneles * 2.58 / 0.75)
    };
  }

  /**
   * Desglose detallado de pérdidas del sistema (Sankey / Balance de Eficiencia).
   */
  function desglosePerdidas(p) {
    const tipo = p.tipoInst || 'chapa';
    // Pérdida por temperatura según ventilación de cubierta
    const pTemp = tipo === 'chapa' ? 6.2 : tipo === 'losa' ? 4.9 : 4.2;
    const pSuciedad = 3.0;
    const pMismatch = 1.5;
    const pCablesDC = 1.2;
    const pInversor = 2.1;
    const pCablesAC = 0.8;

    const perdidas = [
      { concepto: 'Temperatura de celdas fotovoltaicas', pct: pTemp, desc: 'Efecto térmico sobre el coeficiente de potencia' },
      { concepto: 'Polvo y suciedad superficial (Soiling)', pct: pSuciedad, desc: 'Atenuación por suciedad y polvillo ambiental' },
      { concepto: 'Tolerancia y desajuste de módulos (Mismatch)', pct: pMismatch, desc: 'Dispersión de fabricación y puntos de máxima potencia' },
      { concepto: 'Caída de tensión en cableado continua (DC)', pct: pCablesDC, desc: 'Pérdidas Joule en strings y conductores solares' },
      { concepto: 'Rendimiento y conversión del inversor', pct: pInversor, desc: 'Eficiencia de conversión DC a AC trifásica/monofásica' },
      { concepto: 'Caída de tensión en cableado alterno (AC)', pct: pCablesAC, desc: 'Pérdidas óhmicas entre inversor y tablero general' }
    ];

    const factorTotal = perdidas.reduce((acc, it) => acc * (1 - it.pct / 100), 1);
    const prCalculadoPct = Number((factorTotal * 100).toFixed(1));
    const perdidaTotalPct = Number(((1 - factorTotal) * 100).toFixed(1));

    return {
      perdidas,
      prCalculadoPct,
      perdidaTotalPct
    };
  }

  /**
   * Análisis de Sensibilidad multi-variable.
   * Genera matrices cruzadas de VAN, TIR y Payback frente a variaciones de Tarifa, Inflación y CAPEX.
   */
  function analisisSensibilidad(estado) {
    const base = normalizar(estado);
    const deltasTarifa = [-20, -10, 0, 10, 20];
    const deltasCapex = [-15, -10, 0, 10, 15];
    const deltasInf = [-5, 0, 5, 10];

    // Matriz 1: Tarifa vs CAPEX
    const matrizTarifaCapex = deltasCapex.map(dCapex => {
      const fila = deltasTarifa.map(dTar => {
        const clon = Object.assign({}, estado, {
          tarifa_resto: String(base.tarifa_resto * (1 + dTar / 100)),
          usd_kwp: String(base.usd_kwp * (1 + dCapex / 100)),
        });
        const r = calcular(clon);
        return {
          dTar, dCapex,
          vanUSD: r.vanUSD,
          vanARS: r.van,
          tir: r.tir,
          payback: r.payback,
        };
      });
      return { dCapex, celdas: fila };
    });

    // Matriz 2: Inflación de Tarifa vs Tasa de Descuento
    const tasasDesc = [6, 8, 10, 12, 15];
    const matrizInfTasa = tasasDesc.map(tasa => {
      const fila = deltasInf.map(dInf => {
        const clon = Object.assign({}, estado, {
          inflacion: String(Math.max(0, base.inflacion + dInf)),
          tasa_desc: String(tasa),
        });
        const r = calcular(clon);
        return {
          tasa, dInf,
          inflacionEfectiva: Math.max(0, base.inflacion + dInf),
          vanUSD: r.vanUSD,
          tir: r.tir,
          payback: r.payback,
        };
      });
      return { tasa, celdas: fila };
    });

    return {
      deltasTarifa,
      deltasCapex,
      deltasInf,
      tasasDesc,
      matrizTarifaCapex,
      matrizInfTasa,
    };
  }

  // Plantillas predefinidas para nuevos proyectos rápidos
  const PLANTILLAS = {
    residencial: {
      nombre: 'Residencial 5 kWp',
      cliente_nombre: 'Familia González',
      tipoInst: 'chapa', tipoSistema: 'residencial',
      presu_paneles: '9', panel_w: '575', kwp: '5.18',
      usd_kwp: '850', tc: '1430', pr: '83', irrad: '1780', deg: '0.5',
      tarifa_resto: '145', inflacion: '0', horizonte: '25', tasa_desc: '10',
      opex_pct: '0.5', recambio_pct: '12', recambio_cada: '12', incluirRecambio: 'si',
      excModo: 'iny', tarifa_iny: '65',
      conM: JSON.stringify([550, 520, 480, 420, 460, 510, 530, 470, 440, 460, 490, 540]),
      conEst: JSON.stringify(Array(12).fill(false)),
      genM: JSON.stringify(estimarGeneracion(5.18, 1780, 83)),
      genFuente: 'estimada',
      l_canon_kwp: '15', l_pago_ini: '1200', l_opcion: '450', l_seguro: '120', l_mtto: '250', l_plazo: '60',
      l_tasa_gan: '30', lGanancias: 'no',
    },
    comercial: {
      nombre: 'Comercial Pyme 30 kWp',
      cliente_nombre: 'Distribuidora Central S.R.L.',
      tipoInst: 'chapa', tipoSistema: 'comercial',
      presu_paneles: '52', panel_w: '575', kwp: '29.90',
      usd_kwp: '620', tc: '1430', pr: '84', irrad: '1820', deg: '0.5',
      tarifa_resto: '125', inflacion: '0', horizonte: '25', tasa_desc: '10',
      opex_pct: '0.5', recambio_pct: '10', recambio_cada: '11', incluirRecambio: 'si',
      excModo: 'sin', tarifa_iny: '0',
      conM: JSON.stringify([4800, 4600, 4900, 4700, 4500, 4400, 4500, 4600, 4700, 4800, 4900, 5000]),
      conEst: JSON.stringify(Array(12).fill(false)),
      genM: JSON.stringify(estimarGeneracion(29.90, 1820, 84)),
      genFuente: 'estimada',
      l_canon_kwp: '14', l_pago_ini: '4500', l_opcion: '2000', l_seguro: '450', l_mtto: '900', l_plazo: '60',
      l_tasa_gan: '30', lGanancias: 'si',
    },
    industrial: {
      nombre: 'Industrial 150 kWp',
      cliente_nombre: 'Metalúrgica del Plata S.A.',
      tipoInst: 'chapa', tipoSistema: 'industrial',
      presu_paneles: '260', panel_w: '575', kwp: '149.50',
      usd_kwp: '540', tc: '1430', pr: '85', irrad: '1830', deg: '0.5',
      tarifa_resto: '110', inflacion: '0', horizonte: '25', tasa_desc: '10',
      opex_pct: '0.5', recambio_pct: '10', recambio_cada: '11', incluirRecambio: 'si',
      excModo: 'sin', tarifa_iny: '0',
      conM: JSON.stringify([28000, 29000, 31000, 30000, 29000, 28000, 29000, 30000, 31000, 32000, 30000, 29000]),
      conEst: JSON.stringify(Array(12).fill(false)),
      genM: JSON.stringify(estimarGeneracion(149.50, 1830, 85)),
      genFuente: 'estimada',
      l_canon_kwp: '13.5', l_pago_ini: '18000', l_opcion: '9000', l_seguro: '1800', l_mtto: '3500', l_plazo: '60',
      l_tasa_gan: '30', lGanancias: 'si',
    },
    parque: {
      nombre: 'Gran Usuario / Parque 500 kWp',
      cliente_nombre: 'Agropecuaria Pampeana',
      tipoInst: 'tierra', tipoSistema: 'industrial',
      presu_paneles: '870', panel_w: '575', kwp: '500.25',
      usd_kwp: '490', tc: '1430', pr: '86', irrad: '1850', deg: '0.5',
      tarifa_resto: '105', inflacion: '0', horizonte: '30', tasa_desc: '10',
      opex_pct: '0.4', recambio_pct: '8', recambio_cada: '12', incluirRecambio: 'si',
      excModo: 'iny', tarifa_iny: '55',
      conM: JSON.stringify(Array(12).fill(75000)),
      conEst: JSON.stringify(Array(12).fill(false)),
      genM: JSON.stringify(estimarGeneracion(500.25, 1850, 86)),
      genFuente: 'estimada',
      l_canon_kwp: '12.5', l_pago_ini: '50000', l_opcion: '25000', l_seguro: '4500', l_mtto: '9500', l_plazo: '72',
      l_tasa_gan: '30', lGanancias: 'si',
    }
  };

  return {
    MESES,
    PERFIL_GEN,
    CIUDADES_ARGENTINA,
    PLANTILLAS,
    num,
    arr,
    parseImpuestos,
    normalizar,
    estimarGeneracion,
    calcular,
    npv,
    irr,
    payback,
    analisisSensibilidad,
    generarPerfil24h,
    dimensionarPorTecho,
    dimensionarPorConsumo,
    desglosePerdidas
  };
});


