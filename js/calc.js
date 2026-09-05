/* ==========================================================================
   calc.js — Motor de cálculo técnico-económico para proyectos fotovoltaicos
   Sin dependencias. Funciona en navegador y en Node (para tests).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./solar.js'), require('./finanzas.js'), require('./riesgo.js'));
  } else {
    root.Calc = factory(root.Solar, root.Finanzas, root.Riesgo);
  }
})(typeof self !== 'undefined' ? self : this, function (Solar, Finanzas, Riesgo) {
  'use strict';

  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Perfil mensual típico de generación (hemisferio sur, Argentina centro).
  // Fracciones normalizadas; se usa para estimar genM cuando no hay dato medido.
  const PERFIL_GEN = [0.1094, 0.0979, 0.0891, 0.0736, 0.0591, 0.0502, 0.0532, 0.0676, 0.0835, 0.0986, 0.1065, 0.1113];

  // ---- Modelo horario -------------------------------------------------------
  const RAD = Math.PI / 180;
  const DIAS_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // suma 365.25
  const DIA_REPRESENTATIVO = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344]; // días tipo de Klein
  const MERIDIANO_AR = -45;   // huso UTC-3

  /** Escala un perfil de 24 valores para que sus fracciones sumen exactamente 1. */
  function normalizarPerfil(a) {
    const t = a.reduce((s, x) => s + x, 0);
    return t > 0 ? a.map(x => x / t) : a.map(() => 1 / 24);
  }

  // Perfiles horarios de demanda. Se normalizan a suma 1 para que el balance conserve energía.
  const PERFIL_CON_HORA = {
    residencial: normalizarPerfil([0.02, 0.015, 0.015, 0.015, 0.015, 0.02, 0.04, 0.06, 0.06, 0.04, 0.03, 0.03, 0.035, 0.035, 0.035, 0.04, 0.05, 0.065, 0.085, 0.095, 0.095, 0.08, 0.05, 0.03]),
    comercial: normalizarPerfil([0.015, 0.015, 0.015, 0.015, 0.015, 0.02, 0.03, 0.05, 0.07, 0.08, 0.085, 0.085, 0.08, 0.075, 0.08, 0.085, 0.08, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015]),
    industrial: normalizarPerfil([0.03, 0.03, 0.03, 0.03, 0.035, 0.045, 0.055, 0.06, 0.06, 0.06, 0.06, 0.06, 0.055, 0.055, 0.06, 0.06, 0.06, 0.055, 0.045, 0.04, 0.035, 0.03, 0.03, 0.03]),
  };

  // Bandas horarias del mercado eléctrico argentino (resolución de la Secretaría de Energía).
  const BANDAS_DEFAULT = { picoDesde: 18, picoHasta: 23, valleDesde: 23, valleHasta: 5 };

  /** Devuelve en qué banda cae cada hora del día. */
  function bandasPorHora(p) {
    const out = new Array(24).fill('resto');
    if (p.tarifa_tipo !== 'bandas') return out;
    const dentro = (h, desde, hasta) => {
      if (desde === hasta) return false;
      return desde < hasta ? (h >= desde && h < hasta) : (h >= desde || h < hasta);
    };
    for (let h = 0; h < 24; h++) {
      if (dentro(h, p.banda_valle_desde, p.banda_valle_hasta)) out[h] = 'valle';
      if (dentro(h, p.banda_pico_desde, p.banda_pico_hasta)) out[h] = 'pico';
    }
    return out;
  }

  /**
   * Precio final de la energía en cada hora del día ($/kWh).
   * Aplica los impuestos provinciales y municipales y, solo si el cliente es
   * consumidor final, también el IVA. Para un responsable inscripto el IVA es
   * crédito fiscal y no forma parte del ahorro.
   */
  function tarifasPorHora(p) {
    const impTotalPct = p.impuestos.reduce((s, i) => s + i.pct, 0);
    const ivaPct = p.iva_condicion === 'ri' ? 0 : p.iva_pct;
    const factor = (1 + impTotalPct / 100) * (1 + ivaPct / 100);
    const bandas = bandasPorHora(p);
    const base = {
      pico: p.tarifa_tipo === 'bandas' ? p.tarifa_pico : p.tarifa_resto,
      valle: p.tarifa_tipo === 'bandas' ? p.tarifa_valle : p.tarifa_resto,
      resto: p.tarifa_resto,
    };
    return {
      impTotalPct, ivaPct, factor, bandas, base,
      porHora: bandas.map(b => base[b] * factor),
      // Referencia de una sola cifra, útil para KPIs y para el modelo mensual
      plena: p.tarifa_resto * factor,
      iny: p.excModo === 'iny' ? p.tarifa_iny : 0,
    };
  }

  function ciudadPorId(id) {
    if (!id) return null;
    for (let i = 0; i < CIUDADES_ARGENTINA.length; i++) if (CIUDADES_ARGENTINA[i].id === id) return CIUDADES_ARGENTINA[i];
    return null;
  }

  /** Declinación solar (grados) para el día n del año. */
  function declinacionSolar(n) { return 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365); }

  const _cachePerfilGen = {};
  /**
   * 24 fracciones horarias de generación para un mes (suman 1).
   * Modelo geométrico: coseno del ángulo cenital según latitud, declinación y ángulo horario,
   * corregido por la diferencia entre el mediodía solar y el mediodía de reloj (huso UTC-3).
   */
  function perfilGenHora(mes, latDeg, lonDeg) {
    const lat = num(latDeg, -32), lon = num(lonDeg, -60);
    const clave = mes + '|' + lat.toFixed(2) + '|' + lon.toFixed(2);
    if (_cachePerfilGen[clave]) return _cachePerfilGen[clave];

    const dec = declinacionSolar(DIA_REPRESENTATIVO[mes]) * RAD;
    const fi = lat * RAD;
    const desfase = (MERIDIANO_AR - lon) / 15;      // horas entre el mediodía solar y las 12:00 de reloj
    const bruto = [];
    let total = 0;
    for (let h = 0; h < 24; h++) {
      const omega = 15 * (h + 0.5 - 12 - desfase) * RAD;
      const cosZ = Math.sin(fi) * Math.sin(dec) + Math.cos(fi) * Math.cos(dec) * Math.cos(omega);
      const v = cosZ > 0.02 ? cosZ : 0;             // por debajo de ~1 grado de altura solar no hay aporte útil
      bruto.push(v); total += v;
    }
    const f = total > 0 ? bruto.map(x => x / total) : bruto.map(() => 1 / 24);
    _cachePerfilGen[clave] = f;
    return f;
  }

  const _cacheIrrad = {};
  /**
   * Irradiación sobre el plano de los módulos, con memoria para no repetir
   * la integración de los doce días tipo en cada tecla.
   * Devuelve null cuando el proyecto usa el valor anual de tabla.
   */
  function irradiacionDe(p) {
    if (p.irrad_fuente === 'tabla' || !Solar) return null;
    const clave = [p.irrad_fuente, p.lat, p.lon, p.inclinacion, p.azimut, p.albedo, p.irrad,
      (p.irrad_mensual_horiz || []).join(',')].join('|');
    if (_cacheIrrad[clave]) return _cacheIrrad[clave];

    const opciones = {
      lat: p.lat, lon: p.lon, inclinacion: p.inclinacion, azimut: p.azimut, albedo: p.albedo,
    };
    const serie = p.irrad_mensual_horiz;
    if (p.irrad_fuente === 'nasa' && Array.isArray(serie) && serie.length === 12 && serie.some(x => x > 0)) {
      opciones.diariaHorizontal = serie;
    } else {
      // Sin serie medida se parte del valor anual de tabla y se busca la componente
      // horizontal cuya transposición devuelve ese mismo total sobre el plano.
      // Hacen falta un par de vueltas porque la ganancia depende de la fracción
      // difusa, que a su vez depende del índice de claridad.
      let horizontal = p.irrad;
      for (let i = 0; i < 4; i++) {
        const tanteo = Solar.irradiacionPlano(Object.assign({ anualHorizontal: horizontal }, opciones));
        if (!(tanteo.ganancia > 0)) break;
        const nuevo = horizontal * (p.irrad / tanteo.anualPlano);
        if (Math.abs(nuevo - horizontal) < 0.01) { horizontal = nuevo; break; }
        horizontal = nuevo;
      }
      opciones.anualHorizontal = horizontal;
    }
    const r = Solar.irradiacionPlano(opciones);
    _cacheIrrad[clave] = r;
    return r;
  }

  /** Perfiles horarios de generación de los doce meses (cada uno suma 1). */
  function perfilesGeneracion(p) {
    const irr = irradiacionDe(p);
    if (irr) return irr.perfilesHorarios;
    const out = [];
    for (let m = 0; m < 12; m++) out.push(perfilGenHora(m, p.lat, p.lon));
    return out;
  }

  /** Parámetros operativos del banco de baterías, o null si el proyecto no lleva. */
  function configBateria(p) {
    if (!p.incluirBateria || p.bat_kwh <= 0) return null;
    const rt = Math.min(0.99, Math.max(0.5, p.bat_ef / 100));
    const ef = Math.sqrt(rt);                        // pérdidas repartidas entre carga y descarga
    return {
      capUtil: p.bat_kwh * (p.bat_dod / 100),
      pMax: p.bat_kwh * p.bat_crate,
      efC: ef, efD: ef,
    };
  }

  /**
   * Despacho horario de un día: recorte por potencia del inversor, autoconsumo
   * directo, carga y descarga de batería, excedente vertido y compra a la red.
   * limiteAC es la potencia máxima de salida en kW; 0 significa sin recorte.
   */
  function simularDia(genH, conH, bat, socInicial, limiteAC) {
    const auto = [], exc = [], red = [], carga = [], descarga = [], soc = [], clip = [];
    let s = socInicial || 0;
    for (let h = 0; h < 24; h++) {
      const bruto = genH[h] || 0, c = conH[h] || 0;
      // En una hora, kWh y kW medios coinciden numéricamente
      const recorte = limiteAC > 0 ? Math.max(0, bruto - limiteAC) : 0;
      const g = bruto - recorte;
      clip.push(recorte);
      const directo = Math.min(g, c);
      let sobra = g - directo, falta = c - directo;
      let ch = 0, dch = 0;
      if (bat && bat.capUtil > 0) {
        if (sobra > 0 && s < bat.capUtil) {
          ch = Math.min(sobra, bat.pMax, (bat.capUtil - s) / bat.efC);
          s += ch * bat.efC; sobra -= ch;
        } else if (falta > 0 && s > 0) {
          dch = Math.min(falta, bat.pMax, s * bat.efD);
          s -= dch / bat.efD; falta -= dch;
        }
      }
      auto.push(directo + dch); exc.push(sobra); red.push(falta);
      carga.push(ch); descarga.push(dch); soc.push(s);
    }
    return { auto, exc, red, carga, descarga, soc, clip, socFin: s };
  }

  /** Día tipo con el estado de carga ya estabilizado (se repite el ciclo hasta converger). */
  function simularDiaTipo(genH, conH, bat, limiteAC) {
    let soc = 0, r = null;
    const pasadas = bat ? 3 : 1;
    for (let i = 0; i < pasadas; i++) { r = simularDia(genH, conH, bat, soc, limiteAC); soc = r.socFin; }
    return r;
  }

  /**
   * Balance energético anual.
   *   modeloAuto 'horario': simula 12 meses x 24 h con posición solar real, perfil de demanda y batería.
   *   modeloAuto 'mensual': modelo original min(generación, consumo) mes a mes, para reproducir propuestas anteriores.
   */
  function balanceAnual(p) {
    const gen = p.genM.slice(), con = p.conM.slice();
    const auto = [], exc = [], red = [], autoBat = [], clip = [], ahorroMensual = [];
    const sum = a => a.reduce((s, x) => s + x, 0);
    const tar = tarifasPorHora(p);
    const porBanda = { pico: 0, valle: 0, resto: 0 };
    const redPorBanda = { pico: 0, valle: 0, resto: 0 };
    const potPuntaSin = [], potPuntaCon = [];

    if (p.modeloAuto === 'mensual') {
      // Criterio anterior: compara totales del mes y valoriza todo a la tarifa plena.
      for (let m = 0; m < 12; m++) {
        const a = Math.min(gen[m], con[m]);
        const e = Math.max(gen[m] - con[m], 0);
        auto.push(a); exc.push(e); red.push(Math.max(con[m] - gen[m], 0));
        autoBat.push(0); clip.push(0);
        porBanda.resto += a; redPorBanda.resto += con[m] - a;
        ahorroMensual.push(a * tar.plena + e * tar.iny);
        potPuntaSin.push(0); potPuntaCon.push(0);
      }
    } else {
      const bat = configBateria(p);
      const limiteAC = p.inv_potencia_ac > 0 ? p.inv_potencia_ac : 0;
      const fracCon = PERFIL_CON_HORA[p.tipoSistema] || PERFIL_CON_HORA.industrial;
      const perfiles = perfilesGeneracion(p);
      for (let m = 0; m < 12; m++) {
        const dias = DIAS_MES[m];
        const genH = perfiles[m].map(f => f * gen[m] / dias);
        const conH = fracCon.map(f => f * con[m] / dias);
        const d = simularDiaTipo(genH, conH, bat, limiteAC);
        auto.push(sum(d.auto) * dias);
        exc.push(sum(d.exc) * dias);
        red.push(sum(d.red) * dias);
        autoBat.push(sum(d.descarga) * dias);
        clip.push(sum(d.clip) * dias);
        // Cada kWh se valoriza al precio de su banda horaria
        let ahorroMes = 0;
        for (let h = 0; h < 24; h++) {
          const banda = tar.bandas[h];
          porBanda[banda] += d.auto[h] * dias;
          redPorBanda[banda] += d.red[h] * dias;
          ahorroMes += (d.auto[h] * tar.porHora[h] + d.exc[h] * tar.iny) * dias;
        }
        ahorroMensual.push(ahorroMes);
        potPuntaSin.push(Math.max.apply(null, conH));
        potPuntaCon.push(Math.max.apply(null, d.red));
      }
    }

    return {
      gen, con, auto, exc, red, autoBat, clip, ahorroMensual,
      genAnual: sum(gen), conAnual: sum(con), autoAnual: sum(auto),
      excAnual: sum(exc), redAnual: sum(red), autoBatAnual: sum(autoBat),
      clipAnual: sum(clip), ahorroEnergiaAnual: sum(ahorroMensual),
      autoPorBanda: porBanda, redPorBanda,
      potPuntaSin, potPuntaCon, tarifas: tar,
    };
  }

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

  /**
   * true si los grupos separados por "." son miles al estilo es-AR: "1.500", "1.234.567".
   * Exige cabeza de 1 a 3 dígitos sin cero a la izquierda y todos los grupos siguientes de 3 dígitos,
   * para no confundir decimales legítimos como "0.545" o "544.09".
   */
  function esSeparadorDeMiles(grupos) {
    if (grupos.length < 2) return false;
    if (!/^[1-9]\d{0,2}$/.test(grupos[0])) return false;
    for (let i = 1; i < grupos.length; i++) if (!/^\d{3}$/.test(grupos[i])) return false;
    return true;
  }

  /**
   * Convierte texto a número aceptando notación argentina y anglosajona.
   *   "1.234,56" -> 1234.56 | "8,05" -> 8.05 | "1.500" -> 1500 | "0.545" -> 0.545
   *   "1,500.50" -> 1500.5  | "U$D 550" -> 550
   */
  function num(v, def) {
    const d = (def === undefined || def === null) ? 0 : def;
    if (v === null || v === undefined || v === '') return d;
    if (typeof v === 'number') return isFinite(v) ? v : d;

    let s = String(v).trim();
    if (!s) return d;
    let signo = 1;
    if (s.charAt(0) === '-' || s.charAt(0) === '\u2212') { signo = -1; s = s.slice(1); }
    else if (s.charAt(0) === '+') s = s.slice(1);
    s = s.replace(/[^0-9.,]/g, '');            // quita $, U$D, kWh, espacios, etc.
    if (!s) return d;

    const iPunto = s.lastIndexOf('.'), iComa = s.lastIndexOf(',');
    if (iPunto >= 0 && iComa >= 0) {
      // el separador que aparece último es el decimal
      s = iComa > iPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (iComa >= 0) {
      const g = s.split(',');
      s = g.length > 2 ? g.join('') : g.join('.');   // varias comas = miles; una coma = decimal
    } else if (iPunto >= 0) {
      const g = s.split('.');
      if (esSeparadorDeMiles(g)) s = g.join('');
    }
    const n = parseFloat(s);
    return isFinite(n) ? signo * n : d;
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
  /** Ítems del presupuesto detallado. Cada uno se cobra por unidad o por kWp instalado. */
  function parseBom(v) {
    let a = v;
    if (typeof v === 'string') { try { a = JSON.parse(v); } catch (err) { a = []; } }
    if (!Array.isArray(a)) a = [];
    return a.map(it => ({
      productoId: it.productoId || '',
      categoria: it.categoria || 'otro',
      descripcion: it.descripcion || '',
      unidad: it.unidad === 'kWp' ? 'kWp' : 'u.',
      cantidad: num(it.cantidad, 0),
      precioUsd: num(it.precioUsd, 0),
    }));
  }

  /** Costo total del presupuesto por ítems, en dólares. */
  function totalBom(bom, kwp) {
    return bom.reduce((s, it) => s + it.precioUsd * (it.unidad === 'kWp' ? kwp : it.cantidad), 0);
  }

  function normalizar(estado) {
    const e = estado || {};
    const tipoBat = e.bat_tipo || 'litio';
    const ciudad = ciudadPorId(e.ciudad_id);
    // Con presupuesto por ítems, el precio por kWp deja de ser un dato y pasa a ser un resultado
    const bom = parseBom(e.bom);
    const bomActivo = e.bom_activo === 'si' && bom.length > 0;
    const kwpBase = num(e.kwp);
    const bomTotal = totalBom(bom, kwpBase);
    const usdKwp = bomActivo && kwpBase > 0 ? bomTotal / kwpBase : num(e.usd_kwp);
    return {
      bom, bom_activo: bomActivo, bomTotalUSD: bomTotal,
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
      usd_kwp: usdKwp,
      tc: num(e.tc, 1) || 1,
      pr: num(e.pr, 83),
      irrad: num(e.irrad, 1800),
      deg: num(e.deg, 0.5),
      tarifa_resto: num(e.tarifa_resto),
      tarifa_tipo: e.tarifa_tipo === 'bandas' ? 'bandas' : 'simple',
      tarifa_pico: num(e.tarifa_pico, num(e.tarifa_resto)),
      tarifa_valle: num(e.tarifa_valle, num(e.tarifa_resto)),
      banda_pico_desde: Math.min(23, Math.max(0, Math.round(num(e.banda_pico_desde, BANDAS_DEFAULT.picoDesde)))),
      banda_pico_hasta: Math.min(24, Math.max(0, Math.round(num(e.banda_pico_hasta, BANDAS_DEFAULT.picoHasta)))),
      banda_valle_desde: Math.min(23, Math.max(0, Math.round(num(e.banda_valle_desde, BANDAS_DEFAULT.valleDesde)))),
      banda_valle_hasta: Math.min(24, Math.max(0, Math.round(num(e.banda_valle_hasta, BANDAS_DEFAULT.valleHasta)))),
      iva_pct: num(e.iva_pct, 0),
      iva_condicion: e.iva_condicion === 'ri' ? 'ri' : 'cf',
      cargo_fijo: num(e.cargo_fijo, 0),
      pot_contratada: num(e.pot_contratada, 0),
      cargo_pot: num(e.cargo_pot, 0),
      reducePotencia: e.reducePotencia === 'si',
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
      bat_tipo: tipoBat,
      bat_ef: num(e.bat_ef, tipoBat === 'gel' ? 82 : 92),                 // rendimiento ida y vuelta (%)
      bat_crate: num(e.bat_crate, 0.5),                                   // potencia máxima de carga/descarga (C)
      bat_vida: Math.max(1, Math.round(num(e.bat_vida, tipoBat === 'gel' ? 6 : 12))),
      bat_recambio_pct: num(e.bat_recambio_pct, 70),                      // % del costo del banco al recambiarlo
      impuestos: parseImpuestos(e.impData),
      genM: arr(e.genM, 12, 0).map(x => num(x)),
      conM: arr(e.conM, 12, 0).map(x => num(x)),
      conEst: arr(e.conEst, 12, false).map(x => x === true || x === 'true'),
      genFuente: e.genFuente || 'manual',
      modeloAuto: e.modeloAuto === 'mensual' ? 'mensual' : 'horario',
      // Marco monetario: la tasa de descuento se interpreta en la moneda de análisis
      // y la equivalente en la otra moneda sale de Fisher con la devaluación esperada.
      moneda_analisis: e.moneda_analisis === 'ars' ? 'ars' : 'usd',
      devaluacion: num(e.devaluacion, 0),
      // Tratamiento de Ganancias:
      //   'simetrico' grava el ahorro y reconoce amortización en la compra y canon en el leasing
      //   'legacy'    solo el escudo del leasing (criterio de versiones anteriores)
      //   'sin'       no considera Ganancias en ninguna opción
      fiscal: ['simetrico', 'sin', 'legacy'].indexOf(e.fiscal) >= 0
        ? e.fiscal
        : (e.lGanancias === 'no' ? 'sin' : 'simetrico'),
      amort_anios: Math.max(1, Math.round(num(e.amort_anios, 5))),
      lat: num(e.lat, ciudad ? ciudad.lat : -32),
      lon: num(e.lon, ciudad ? ciudad.lon : -60),
      // Irradiación: 'tabla' usa el valor anual cargado a mano; 'modelo' y 'nasa'
      // calculan la irradiación sobre el plano real de los módulos.
      irrad_fuente: ['modelo', 'nasa'].indexOf(e.irrad_fuente) >= 0 ? e.irrad_fuente : 'tabla',
      inclinacion: num(e.inclinacion, 25),
      azimut: num(e.azimut, 0),
      albedo: num(e.albedo, 0.2),
      irrad_mensual_horiz: arr(e.irrad_mensual_horiz, 12, 0).map(x => num(x)),
      temp_mensual: arr(e.temp_mensual, 12, 0).map(x => num(x)),
      // Inversor y cadenas de módulos
      inv_potencia_ac: num(e.inv_potencia_ac, 0),
      inv_v_min: num(e.inv_v_min, 200),
      inv_v_max: num(e.inv_v_max, 1000),
      inv_v_arranque: num(e.inv_v_arranque, 150),
      inv_mppt: Math.max(1, Math.round(num(e.inv_mppt, 2))),
      inv_i_max_mppt: num(e.inv_i_max_mppt, 15),
      mod_voc: num(e.mod_voc, 51.8),
      mod_vmp: num(e.mod_vmp, 43.4),
      mod_isc: num(e.mod_isc, 14.05),
      mod_imp: num(e.mod_imp, 13.25),
      mod_coef_voc: num(e.mod_coef_voc, -0.25),
      mod_noct: num(e.mod_noct, 45),
      mod_coef_pot: num(e.mod_coef_pot, -0.35),
      temp_min: num(e.temp_min, -5),
      temp_max: num(e.temp_max, 40),
      pr_fuente: e.pr_fuente === 'calculado' ? 'calculado' : 'manual',
      excModo: e.excModo === 'iny' ? 'iny' : 'sin',
      tarifa_iny: num(e.tarifa_iny),
      l_canon_kwp: num(e.l_canon_kwp),
      l_pago_ini: num(e.l_pago_ini),
      l_opcion: num(e.l_opcion),
      l_seguro: num(e.l_seguro),
      l_mtto: num(e.l_mtto),
      l_tasa_gan: num(e.l_tasa_gan, 30),
      // Préstamo bancario
      pr_monto_pct: num(e.pr_monto_pct, 0),
      pr_tasa: num(e.pr_tasa, 0),
      pr_plazo: Math.max(0, Math.round(num(e.pr_plazo, 60))),
      pr_sistema: e.pr_sistema === 'aleman' ? 'aleman' : 'frances',
      pr_moneda: ['ars', 'uva'].indexOf(e.pr_moneda) >= 0 ? e.pr_moneda : 'usd',
      pr_ajuste: num(e.pr_ajuste, num(e.inflacion, 0)),
      pr_gastos_pct: num(e.pr_gastos_pct, 0),
      // Contrato PPA
      ppa_tarifa: num(e.ppa_tarifa, 0),
      ppa_plazo: Math.max(1, Math.round(num(e.ppa_plazo, 15))),
      ppa_ajuste: num(e.ppa_ajuste, 0),
      ppa_opcion: num(e.ppa_opcion, 0),
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
    // Con PR calculado, el número sale del desglose de pérdidas en vez de cargarse a mano,
    // así el Performance Ratio y el diagrama de pérdidas dejan de contradecirse.
    if (p.pr_fuente === 'calculado') p.pr = desglosePerdidas(p).prCalculadoPct;

    // --- Energía año 1 (balance horario o mensual según modeloAuto) ---
    const bal = balanceAnual(p);
    const gen = bal.gen, con = bal.con, auto = bal.auto, exc = bal.exc, red = bal.red;
    const sum = a => a.reduce((s, x) => s + x, 0);
    const genAnual = bal.genAnual, conAnual = bal.conAnual, autoAnual = bal.autoAnual, excAnual = bal.excAnual;

    // --- Tarifa ---
    const tar = bal.tarifas;
    const impTotalPct = tar.impTotalPct;
    const tarifaFull = tar.plena;                                  // $/kWh con impuestos
    const tarifaIny = tar.iny;
    const clip = bal.clip, clipAnual = bal.clipAnual;

    // Ahorro por energía: cada kWh valorizado al precio de su banda horaria
    const ahorroMensual = bal.ahorroMensual.slice();
    const ahorroEnergiaAnual = bal.ahorroEnergiaAnual;

    // Ahorro por potencia: solo si el cliente va a renegociar la potencia contratada.
    // Por defecto no se cuenta, porque la punta de demanda suele caer fuera del sol.
    const reduccionPotencia = bal.potPuntaSin.map((sinSolar, m) => Math.max(0, sinSolar - bal.potPuntaCon[m]));
    const reduccionPotenciaMedia = reduccionPotencia.reduce((s, x) => s + x, 0) / 12;
    const ahorroPotenciaAnual = p.reducePotencia ? reduccionPotencia.reduce((s, x) => s + x * p.cargo_pot, 0) : 0;

    const ahorroAnual1 = ahorroEnergiaAnual + ahorroPotenciaAnual;

    // Factura anual estimada, para mostrarle al cliente el antes y el después
    const facturaFijaAnual = p.cargo_fijo * 12;
    const facturaPotenciaAnual = p.pot_contratada * p.cargo_pot * 12;
    const facturaSinSolar = conAnual * tarifaFull + facturaFijaAnual + facturaPotenciaAnual;
    const facturaConSolar = Math.max(0, facturaSinSolar - ahorroAnual1);

    // --- Inversión ---
    const capexSolarUSD = p.kwp * p.usd_kwp;
    const capexBatUSD = p.incluirBateria ? p.bat_kwh * p.bat_usd_kwh : 0;
    const capexUSD = capexSolarUSD + capexBatUSD;
    const capexARS = capexUSD * p.tc;
    const capexSolarARS = capexSolarUSD * p.tc;
    const capexBatARS = capexBatUSD * p.tc;
    const opexAnual1 = capexARS * (p.opex_pct / 100);

    // --- Batería y Autonomía ---
    const capUtilBat = p.incluirBateria ? p.bat_kwh * (p.bat_dod / 100) : 0;
    const demandaMediaHora = conAnual > 0 ? conAnual / 8760 : 0;
    const autonomiaHoras = demandaMediaHora > 0 ? capUtilBat / demandaMediaHora : 0;

    // --- Marco monetario ---
    const inf = p.inflacion / 100, dg = p.deg / 100, dev = p.devaluacion / 100;
    const rIn = p.tasa_desc / 100;
    // Fisher: (1 + r_pesos) = (1 + r_dólares) × (1 + devaluación).
    // El usuario carga la tasa en la moneda de análisis; la otra se deriva.
    const rUsd = p.moneda_analisis === 'ars' ? (1 + rIn) / (1 + dev) - 1 : rIn;
    const rArs = p.moneda_analisis === 'ars' ? rIn : (1 + rIn) * (1 + dev) - 1;
    const tcAnio = t => p.tc * Math.pow(1 + dev, t);
    // Cuánto sube realmente la tarifa medida en dólares
    const tarifaRealUSDPct = ((1 + inf) / (1 + dev) - 1) * 100;

    // --- Marco fiscal ---
    // g grava el ahorro y habilita la amortización del equipo; solo en el régimen simétrico.
    const g = p.fiscal === 'simetrico' ? p.l_tasa_gan / 100 : 0;
    const amortAnual = capexARS / p.amort_anios;

    // --- Flujo de caja (ARS nominales y su equivalente en USD) ---
    const anios = [];
    const flujos = [-capexARS];
    const flujosUSD = [-capexUSD];
    let acum = -capexARS, acumDesc = -capexARS;
    let genTotal = 0, ahorroTotal = 0, ahorroTotalUSD = 0, escudoTotal = 0;
    for (let t = 1; t <= p.horizonte; t++) {
      const fGen = Math.pow(1 - dg, t - 1);
      const fInf = Math.pow(1 + inf, t - 1);
      const genT = genAnual * fGen;
      const ahorroT = ahorroAnual1 * fGen * fInf;
      const opexT = opexAnual1 * fInf;
      const recambioInv = (p.incluirRecambio && t % p.recambio_cada === 0 && t < p.horizonte)
        ? capexSolarARS * (p.recambio_pct / 100) * fInf : 0;
      const recambioBat = (p.incluirBateria && capexBatARS > 0 && t % p.bat_vida === 0 && t < p.horizonte)
        ? capexBatARS * (p.bat_recambio_pct / 100) * fInf : 0;
      const recambioT = recambioInv + recambioBat;
      // Amortización del equipo sobre costo histórico: es deducción, no egreso de caja.
      const amortT = t <= p.amort_anios ? amortAnual : 0;
      const escudoAmort = amortT * g;
      // El ahorro de energía reduce un gasto deducible, así que aumenta la base imponible.
      const flujo = (ahorroT - opexT - recambioT) * (1 - g) + escudoAmort;
      const desc = flujo / Math.pow(1 + rArs, t);
      acum += flujo; acumDesc += desc;
      genTotal += genT; ahorroTotal += ahorroT; ahorroTotalUSD += ahorroT / tcAnio(t);
      escudoTotal += escudoAmort;
      flujos.push(flujo);
      flujosUSD.push(flujo / tcAnio(t));
      anios.push({
        anio: t, gen: genT, ahorro: ahorroT, opex: opexT, recambio: recambioT, recambioInv, recambioBat,
        amort: amortT, escudoAmort, impuesto: (ahorroT - opexT - recambioT) * g,
        flujo, flujoUSD: flujo / tcAnio(t), tc: tcAnio(t), acum, desc, acumDesc,
      });
    }

    const van = npv(rArs, flujos);
    const vanUSD = npv(rUsd, flujosUSD);
    const tir = irr(flujos);
    const tirUSD = irr(flujosUSD);
    // El repago se mide en la moneda en la que se analiza el proyecto.
    const enUSD = p.moneda_analisis !== 'ars';
    const flujosAn = enUSD ? flujosUSD : flujos;
    const rAn = enUSD ? rUsd : rArs;
    const pb = payback(flujosAn);
    const pbDesc = payback(flujosAn.map((f, t) => f / Math.pow(1 + rAn, t)));

    // LCOE: (CAPEX + Σ costos descontados) / Σ generación descontada. Siempre antes de impuestos.
    let costosDesc = capexARS, genDesc = 0, costosDescUSD = capexUSD, genDescUSD = 0;
    anios.forEach(a => {
      const costoT = a.opex + a.recambio;
      costosDesc += costoT / Math.pow(1 + rArs, a.anio);
      genDesc += a.gen / Math.pow(1 + rArs, a.anio);
      costosDescUSD += (costoT / a.tc) / Math.pow(1 + rUsd, a.anio);
      genDescUSD += a.gen / Math.pow(1 + rUsd, a.anio);
    });
    const lcoeARS = genDesc > 0 ? costosDesc / genDesc : 0;
    const lcoeUSDcalc = genDescUSD > 0 ? costosDescUSD / genDescUSD : 0;

    // --- Impacto Ambiental (Huella de Carbono) ---
    // Factor de emisión típico red argentina: ~0.45 kg CO2/kWh
    const co2AnualTon = (genAnual * p.factor_co2) / 1000;
    const co2TotalTon = (genTotal * p.factor_co2) / 1000;
    const arbolesEq = Math.round((co2AnualTon * 1000) / 21.7); // ~21.7 kg CO2/árbol/año
    const kmAutoEq = Math.round((co2AnualTon * 1000) / 0.19);  // ~0.19 kg CO2/km auto a nafta

    // --- Leasing ---
    const leasing = calcularLeasing(p, { ahorroAnual1, capexUSD, capexARS, opexAnual1, rUsd, inf, dg, g, tcAnio });

    // Comparador de alternativas de financiamiento, todas en dólares y a la misma tasa
    const ctxFin = {
      ahorroAnual1, capexUSD, capexARS, opexAnual1, rUsd, rArs, inf, dg, g, tcAnio,
      autoAnual, tarifaFullUSD: tarifaFull / p.tc,
    };
    const contadoResumen = {
      vanUSD: npv(rUsd, flujosUSD),
      tirUSD: irr(flujosUSD),
      payback: pb,
      flujoMensualUSD: (ahorroAnual1 * (1 - g) - opexAnual1 * (1 - g)) / 12 / p.tc,
    };
    const financiamiento = Finanzas
      ? Finanzas.comparar(p, ctxFin, contadoResumen, leasing)
      : { filas: [], prestamo: null, ppa: null, mejor: null };

    return {
      p, meses: MESES,
      gen, con, auto, exc, red,
      genAnual, conAnual, autoAnual, excAnual,
      coberturaPct: conAnual > 0 ? autoAnual / conAnual * 100 : 0,
      aprovechamientoPct: genAnual > 0 ? autoAnual / genAnual * 100 : 0,
      genEspecifica: p.kwp > 0 ? genAnual / p.kwp : 0,
      impTotalPct, tarifaFull, tarifaIny, tarifas: tar,
      clip, clipAnual,
      autoPorBanda: bal.autoPorBanda, redPorBanda: bal.redPorBanda,
      reduccionPotencia, reduccionPotenciaMedia,
      ahorroEnergiaAnual, ahorroPotenciaAnual,
      facturaSinSolar, facturaConSolar, facturaFijaAnual, facturaPotenciaAnual,
      irradiacion: irradiacionDe(p),
      inversor: dimensionarInversor(p),
      ahorroMensual, ahorroAnual1, ahorroAnual1USD: ahorroAnual1 / p.tc,
      capexSolarUSD, capexBatUSD, capexUSD, capexARS, capexSolarARS, capexBatARS, opexAnual1,
      capUtilBat, autonomiaHoras,
      autoBatAnual: bal.autoBatAnual,
      ahorroBateriaAnual: bal.autoBatAnual * (tarifaFull - tarifaIny),
      redAnual: bal.redAnual,
      anios, flujos, flujosUSD, van, vanUSD, tir, tirUSD, payback: pb, paybackDesc: pbDesc,
      lcoeARS, lcoeUSD: lcoeUSDcalc,
      rArs, rUsd, tarifaRealUSDPct, tcFinal: tcAnio(p.horizonte), escudoTotal,
      genTotal, ahorroTotal, ahorroTotalUSD,
      financiamiento, prestamo: financiamiento.prestamo, ppa: financiamiento.ppa,
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
    // Escudo del leasing: se anula si el régimen fiscal es "sin Ganancias".
    const gLeas = p.fiscal === 'sin' ? 0 : (p.lGanancias ? p.l_tasa_gan / 100 : 0);
    // Alícuota que grava el ahorro de energía; igual para leasing y compra en el régimen simétrico.
    const gAhorro = ctx.g;
    const ahorroImp = deducible * gLeas;
    const neto = bruto - ahorroImp;
    const ahorroMensualUSD = ctx.ahorroAnual1 / 12 / p.tc * (1 - gAhorro);
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
      // El ahorro nace en pesos y se convierte al tipo de cambio proyectado de cada año.
      const ahorroT = ctx.ahorroAnual1 * fGen * fInf / ctx.tcAnio(t);
      const ahorroNetoT = ahorroT * (1 - gAhorro);
      let costoT = 0, escudo = 0;
      if (t <= nAnios) {
        const mesesAnio = Math.min(12, p.l_plazo - (t - 1) * 12);
        const canonT = canonMensual * mesesAnio;
        const segT = p.l_seguro * mesesAnio / 12;
        const mttoT = p.l_mtto * mesesAnio / 12;
        costoT = canonT + segT + mttoT;
        escudo = costoT * gLeas;
        if (t === nAnios) costoT += p.l_opcion;
      } else {
        costoT = ctx.opexAnual1 * fInf / ctx.tcAnio(t);
        escudo = costoT * gAhorro;      // el mantenimiento también es gasto deducible
      }
      const flujo = ahorroNetoT - costoT + escudo;
      acum += flujo;
      flujos.push(flujo);
      anios.push({ anio: t, ahorro: ahorroNetoT, ahorroBruto: ahorroT, costo: costoT, escudo, flujo, acum });
    }
    return {
      canonMensual, plazoMeses: p.l_plazo, plazoAnios, canonTotal, seguroTotal, mttoTotal,
      pagoInicial: p.l_pago_ini, opcion: p.l_opcion,
      bruto, ahorroImp, neto, gLeas, gAhorro,
      capexUSD: ctx.capexUSD, sobrecostoVsContado: neto - ctx.capexUSD,
      ahorroMensualUSD, cuotaMensualUSD, flujoMensualUSD,
      anios, flujos,
      van: npv(ctx.rUsd, flujos), tir: irr(flujos), payback: payback(flujos),
    };
  }

  /**
   * Perfil horario de 24 horas para un mes (0-11) o, si no se indica, para el día medio del año.
   * Usa el mismo motor que el balance anual, así el gráfico y los números coinciden.
   */
  function generarPerfil24h(estado, mes) {
    const p = normalizar(estado);
    const bal = balanceAnual(p);
    const bat = configBateria(p);
    const fracCon = PERFIL_CON_HORA[p.tipoSistema] || PERFIL_CON_HORA.industrial;

    let genH = new Array(24).fill(0), conH = new Array(24).fill(0);
    const mesValido = mes !== undefined && mes !== null && mes >= 0 && mes <= 11;

    const perfiles = perfilesGeneracion(p);
    if (mesValido) {
      const dias = DIAS_MES[mes];
      genH = perfiles[mes].map(f => f * bal.gen[mes] / dias);
      conH = fracCon.map(f => f * bal.con[mes] / dias);
    } else {
      let diasTot = 0;
      for (let m = 0; m < 12; m++) {
        for (let h = 0; h < 24; h++) {
          genH[h] += perfiles[m][h] * bal.gen[m];
          conH[h] += fracCon[h] * bal.con[m];
        }
        diasTot += DIAS_MES[m];
      }
      genH = genH.map(x => x / diasTot);
      conH = conH.map(x => x / diasTot);
    }

    const limiteAC = p.inv_potencia_ac > 0 ? p.inv_potencia_ac : 0;
    const bandas = bandasPorHora(p);
    const d = simularDiaTipo(genH, conH, bat, limiteAC);
    const capUtil = bat ? bat.capUtil : 0;
    const horas = [];
    for (let h = 0; h < 24; h++) {
      horas.push({
        hora: h,
        etiqueta: String(h).padStart(2, '0') + ':00',
        gen: genH[h],
        genNeta: genH[h] - d.clip[h],
        clip: d.clip[h],
        con: conH[h],
        auto: Math.min(genH[h] - d.clip[h], conH[h]),
        autoTotal: d.auto[h],
        exc: d.exc[h],
        red: d.red[h],
        batCarga: d.carga[h],
        batDescarga: d.descarga[h],
        batNivel: d.soc[h],
        batSoCPct: capUtil > 0 ? (d.soc[h] / capUtil) * 100 : 0,
        banda: bandas[h],
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
   * Dimensionamiento eléctrico del inversor y de las cadenas de módulos.
   * Verifica la ventana de tensión en los extremos térmicos: la tensión de circuito
   * abierto con el mínimo histórico de temperatura no puede superar la máxima del
   * inversor, y la tensión de máxima potencia con la celda caliente tiene que
   * quedar por encima de la mínima de seguimiento.
   */
  function dimensionarInversor(p) {
    const paneles = Math.max(0, Math.round(p.presu_paneles));
    const potenciaAC = p.inv_potencia_ac > 0 ? p.inv_potencia_ac : 0;
    const ratio = potenciaAC > 0 ? p.kwp / potenciaAC : 0;

    // Extremos de temperatura de celda para el cálculo eléctrico
    const tCeldaFria = p.temp_min;                                    // amanecer sin sol: celda = ambiente
    const tCeldaCaliente = p.temp_max + (p.mod_noct - 20) / 800 * 1000;
    const coef = p.mod_coef_voc / 100;
    const vocFrio = p.mod_voc * (1 + coef * (tCeldaFria - 25));
    const vmpCaliente = p.mod_vmp * (1 + coef * (tCeldaCaliente - 25));

    const maxSerie = vocFrio > 0 ? Math.floor(p.inv_v_max / vocFrio) : 0;
    const minSerie = vmpCaliente > 0
      ? Math.max(Math.ceil(p.inv_v_arranque / vmpCaliente), Math.ceil(p.inv_v_min / vmpCaliente))
      : 0;

    // Se elige la serie más larga que entre en la ventana: menos corriente, menos pérdida en cables
    const serie = maxSerie >= minSerie && maxSerie > 0 ? maxSerie : 0;
    const cadenas = serie > 0 ? Math.ceil(paneles / serie) : 0;
    const panelesUltima = serie > 0 && cadenas > 0 ? paneles - serie * (cadenas - 1) : 0;
    const corrientePorCadena = p.mod_isc;
    const cadenasPorMppt = cadenas > 0 ? Math.ceil(cadenas / p.inv_mppt) : 0;

    // Potencia y recorte en un día despejado de verano, que es el caso que manda
    // el dimensionamiento. El día medio de cada mes promedia nublados y esconde el pico.
    const claro = potenciaPicoDiaClaro(p);

    const avisos = [];
    if (potenciaAC <= 0) avisos.push('Cargá la potencia nominal del inversor para verificar el dimensionamiento.');
    if (maxSerie < minSerie) {
      avisos.push('No hay ninguna cantidad de módulos en serie que entre en la ventana de tensión del inversor (' +
        minSerie + ' mínimo contra ' + maxSerie + ' máximo).');
    }
    if (serie > 0 && cadenas > 1 && panelesUltima !== serie) {
      avisos.push('La última cadena queda con ' + panelesUltima + ' módulos en vez de ' + serie +
        '. Conviene repartir parejo o usar entradas MPPT distintas.');
    }
    if (ratio > 1.35) avisos.push('Relación DC/AC de ' + ratio.toFixed(2) + ': el recorte por potencia va a ser importante.');
    if (ratio > 0 && ratio < 1) avisos.push('El inversor está sobredimensionado respecto del generador (DC/AC ' + ratio.toFixed(2) + ').');
    if (corrientePorCadena > p.inv_i_max_mppt) {
      avisos.push('La corriente de cortocircuito del módulo (' + corrientePorCadena.toFixed(2) + ' A) ' +
        'supera la máxima de la entrada MPPT (' + p.inv_i_max_mppt.toFixed(2) + ' A).');
    }
    if (potenciaAC > 0 && claro.recortePct > 3) {
      avisos.push('En un día despejado de verano se recortaría el ' + claro.recortePct.toFixed(1) +
        ' % de la energía del día. Considerá un inversor más grande.');
    }
    if (p.pot_contratada > 0 && p.kwp > p.pot_contratada) {
      avisos.push('La potencia instalada supera la potencia contratada. El régimen de generación distribuida ' +
        'de la Ley 27.424 exige que no la exceda para poder inyectar.');
    }

    return {
      potenciaAC, ratio, paneles,
      vocFrio, vmpCaliente, tCeldaCaliente, tCeldaFria,
      maxSerie, minSerie, serie, cadenas, panelesUltima, cadenasPorMppt,
      corrientePorCadena,
      diaClaro: claro,
      avisos,
    };
  }

  /**
   * Potencia de pico y recorte en un día despejado del mes de mayor irradiación.
   * El factor DC descuenta las pérdidas anteriores al inversor: temperatura,
   * suciedad, dispersión entre módulos y caída en el cableado de continua.
   */
  function potenciaPicoDiaClaro(p) {
    if (!Solar) return { potenciaPicoDC: 0, recortePct: 0, recorteKWh: 0, energiaDia: 0, mes: 0 };
    const perdidas = desglosePerdidas(p).perdidas;
    const antesInversor = ['Temperatura', 'Polvo', 'Tolerancia', 'continua'];
    const factorDC = perdidas.reduce((acc, it) =>
      antesInversor.some(k => it.concepto.indexOf(k) >= 0) ? acc * (1 - it.pct / 100) : acc, 1);

    // Mes de mayor recorte: el de sol más alto y días más largos del hemisferio sur
    const mes = p.lat < 0 ? 11 : 5;
    const g = Solar.perfilClaroPlano(mes, p.lat, p.lon, p.inclinacion, p.azimut, p.albedo);
    const potenciaDC = g.map(x => p.kwp * (x / 1000) * factorDC);
    const potenciaPicoDC = Math.max.apply(null, potenciaDC);
    const limite = p.inv_potencia_ac > 0 ? p.inv_potencia_ac : Infinity;
    const recorteKWh = potenciaDC.reduce((s, x) => s + Math.max(0, x - limite), 0);
    const energiaDia = potenciaDC.reduce((s, x) => s + x, 0);

    return {
      mes, factorDC, potenciaDC, potenciaPicoDC, energiaDia, recorteKWh,
      recortePct: energiaDia > 0 ? recorteKWh / energiaDia * 100 : 0,
      irradianciaPico: Math.max.apply(null, g),
    };
  }

  /**
   * Desglose detallado de pérdidas del sistema (Sankey / Balance de Eficiencia).
   * Cuando el proyecto tiene irradiación calculada, la pérdida térmica sale del
   * modelo NOCT con la temperatura del sitio en vez de una tabla fija por cubierta.
   */
  function desglosePerdidas(p) {
    const tipo = p.tipoInst || 'chapa';
    // Sobretemperatura por ventilación de la cubierta: la chapa coplanar disipa peor
    const extraMontaje = tipo === 'chapa' ? 1.8 : tipo === 'losa' ? 0.6 : 0;
    let pTemp = tipo === 'chapa' ? 6.2 : tipo === 'losa' ? 4.9 : 4.2;
    let fuenteTemp = 'tabla';

    const irr = irradiacionDe(p);
    if (irr && Solar) {
      const temps = p.temp_mensual && p.temp_mensual.some(x => x > 0) ? p.temp_mensual : null;
      const pt = Solar.perdidaTermicaAnual(irr, temps, p.mod_noct, p.mod_coef_pot);
      if (pt.perdidaPct > 0) {
        pTemp = Number((pt.perdidaPct + extraMontaje).toFixed(2));
        fuenteTemp = temps ? 'sitio' : 'modelo';
      }
    }

    const pSuciedad = 3.0;
    const pMismatch = 1.5;
    const pCablesDC = 1.2;
    const pInversor = 2.1;
    const pCablesAC = 0.8;

    const perdidas = [
      { concepto: 'Temperatura de celdas fotovoltaicas', pct: pTemp, desc: fuenteTemp === 'tabla'
          ? 'Efecto térmico sobre el coeficiente de potencia'
          : 'Modelo NOCT con la temperatura ' + (fuenteTemp === 'sitio' ? 'medida del sitio' : 'estimada del sitio') + ' y el montaje' },
      { concepto: 'Polvo y suciedad superficial (Soiling)', pct: pSuciedad, desc: 'Atenuación por suciedad y polvillo ambiental' },
      { concepto: 'Tolerancia y desajuste de módulos (Mismatch)', pct: pMismatch, desc: 'Dispersión de fabricación y puntos de máxima potencia' },
      { concepto: 'Caída de tensión en cableado continua (DC)', pct: pCablesDC, desc: 'Pérdidas Joule en strings y conductores solares' },
      { concepto: 'Rendimiento y conversión del inversor', pct: pInversor, desc: 'Eficiencia de conversión DC a AC trifásica/monofásica' },
      { concepto: 'Caída de tensión en cableado alterno (AC)', pct: pCablesAC, desc: 'Pérdidas óhmicas entre inversor y tablero general' }
    ];

    const factorTotal = perdidas.reduce((acc, it) => acc * (1 - it.pct / 100), 1);
    const prCalculadoPct = Number((factorTotal * 100).toFixed(1));
    const perdidaTotalPct = Number(((1 - factorTotal) * 100).toFixed(1));

    return { perdidas, prCalculadoPct, perdidaTotalPct, fuenteTemp };
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

  /**
   * Simulación de Monte Carlo sobre el VAN del proyecto.
   * Devuelve la distribución completa, la probabilidad de que el VAN sea positivo
   * y los percentiles P10, P50 y P90. La semilla es fija: el mismo proyecto
   * devuelve siempre los mismos números y la propuesta se puede reproducir.
   */
  function analisisMontecarlo(estado, opciones) {
    if (!Riesgo) return null;
    return Riesgo.montecarlo(estado, opciones, calcular, normalizar);
  }

  /** Diagrama de tornado: qué variable mueve más el VAN. */
  function analisisTornado(estado, opciones) {
    if (!Riesgo) return null;
    return Riesgo.tornado(estado, opciones, calcular, normalizar);
  }

  /** Verifica el dígito de control de un CUIT / CUIL argentino. */
  function cuitValido(cuit) {
    const s = String(cuit || '').replace(/\D/g, '');
    if (s.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(s)) return false;          // 00000000000 y similares
    const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i++) suma += parseInt(s.charAt(i), 10) * mult[i];
    let ver = 11 - (suma % 11);
    if (ver === 11) ver = 0; else if (ver === 10) ver = 9;
    return ver === parseInt(s.charAt(10), 10);
  }

  /**
   * Revisa el proyecto y devuelve los problemas encontrados, del más grave al más leve.
   * nivel: 'error' impide confiar en el resultado, 'aviso' merece una segunda mirada.
   */
  function validar(estado, res) {
    const p = normalizar(estado);
    const r = res || calcular(estado);
    const out = [];
    const add = (nivel, campo, titulo, detalle) => out.push({ nivel, campo, titulo, detalle });

    if (p.kwp <= 0) add('error', 'kwp', 'Falta la potencia instalada', 'Sin kWp no hay generación ni inversión que calcular.');
    if (p.usd_kwp <= 0) add('error', 'usd_kwp', 'Falta el precio por kWp', 'El CAPEX queda en cero y los indicadores no significan nada.');
    if (p.tc <= 1) add('error', 'tc', 'Tipo de cambio inválido', 'Cargá el valor en pesos por dólar que vas a usar en la cotización.');
    if (p.tarifa_resto <= 0) add('error', 'tarifa_resto', 'Falta la tarifa eléctrica', 'Sin tarifa el ahorro es cero y el proyecto nunca se paga.');
    if (r.conAnual <= 0) add('error', 'conM', 'Consumo anual en cero', 'Cargá las facturas del cliente o usá "Rellenar consumo constante".');
    if (r.genAnual <= 0) add('error', 'genM', 'Generación anual en cero', 'Usá "Estimar generación" o cargá los valores mes a mes.');

    const kwpPaneles = p.presu_paneles * p.panel_w / 1000;
    if (kwpPaneles > 0 && p.kwp > 0 && Math.abs(kwpPaneles / p.kwp - 1) > 0.02) {
      add('aviso', 'kwp', 'La potencia no coincide con los módulos',
        p.presu_paneles + ' × ' + p.panel_w + ' Wp = ' + kwpPaneles.toFixed(2) + ' kWp, pero está cargado ' + p.kwp.toFixed(2) + ' kWp.');
    }
    if (p.pr < 60 || p.pr > 90) add('aviso', 'pr', 'Performance ratio fuera de rango', 'Un PR de ' + p.pr + ' % es atípico. Lo habitual está entre 70 % y 88 %.');
    if (p.irrad < 900 || p.irrad > 2600) add('aviso', 'irrad', 'Irradiación fuera de rango', p.irrad + ' kWh/m² por año no corresponde a ninguna región argentina (1.180 a 2.450).');
    if (p.deg < 0 || p.deg > 2) add('aviso', 'deg', 'Degradación atípica', 'Los módulos actuales degradan entre 0,3 % y 0,7 % por año.');
    if (p.horizonte < 5 || p.horizonte > 35) add('aviso', 'horizonte', 'Horizonte poco habitual', 'Se suele analizar entre 15 y 30 años, según la garantía de los módulos.');
    if (p.tasa_desc <= 0) add('aviso', 'tasa_desc', 'Tasa de descuento en cero', 'Sin costo de oportunidad, el VAN sobreestima el atractivo del proyecto.');
    if (p.tasa_desc > 40) add('aviso', 'tasa_desc', 'Tasa de descuento muy alta', p.tasa_desc + ' % castiga tanto el futuro que casi ningún proyecto da positivo.');

    const genEst = estimarGeneracion(p.kwp, p.irrad, p.pr).reduce((s, x) => s + x, 0);
    if (genEst > 0 && r.genAnual > 0 && Math.abs(r.genAnual / genEst - 1) > 0.15) {
      add('aviso', 'genM', 'La generación cargada no coincide con la estimada',
        'Cargado ' + Math.round(r.genAnual) + ' kWh/año contra ' + Math.round(genEst) + ' estimados por kWp × irradiación × PR.');
    }
    if (r.coberturaPct > 100.01) add('aviso', 'genM', 'La cobertura supera el 100 %', 'Revisá el consumo: el sistema estaría generando más de lo que el cliente usa.');
    if (p.excModo === 'iny' && p.tarifa_iny <= 0) add('aviso', 'tarifa_iny', 'Inyección remunerada sin precio', 'Elegiste remunerar excedentes pero la tarifa de inyección es cero.');
    if (p.excModo === 'sin' && r.genAnual > 0 && r.excAnual / r.genAnual > 0.35) {
      add('aviso', 'excModo', 'Se vierte mucho excedente sin remunerar',
        Math.round(r.excAnual / r.genAnual * 100) + ' % de la generación se regala a la red. Evaluá bajar la potencia o sumar baterías.');
    }

    if (p.incluirBateria) {
      if (p.bat_dod < 30 || p.bat_dod > 95) add('aviso', 'bat_dod', 'Profundidad de descarga atípica', 'Litio LFP admite 80 % a 90 %; plomo-ácido y gel, 50 %.');
      if (p.bat_ef < 60 || p.bat_ef > 99) add('aviso', 'bat_ef', 'Rendimiento de batería fuera de rango', 'Litio LFP ronda 92 %; gel, 82 %.');
      if (p.bat_usd_kwh <= 0) add('aviso', 'bat_usd_kwh', 'Batería sin costo cargado', 'El banco aporta energía pero no suma inversión, así que el retorno queda inflado.');
    }

    if (p.l_canon_kwp > 0 && p.kwp > 0) {
      if (r.leasing.sobrecostoVsContado < 0) {
        add('aviso', 'l_canon_kwp', 'El leasing sale menos que la compra',
          'El costo neto del leasing quedó por debajo del CAPEX. Revisá el canon o la alícuota de Ganancias.');
      }
      if (p.l_plazo < 12 || p.l_plazo > 120) add('aviso', 'l_plazo', 'Plazo de leasing poco habitual', 'Lo usual va de 36 a 72 meses.');
    }

    if (p.presu_cuit && !cuitValido(p.presu_cuit)) {
      add('aviso', 'presu_cuit', 'CUIT inválido', 'El dígito verificador no cierra. Revisalo antes de emitir la propuesta.');
    }
    if (!p.cliente_nombre) add('aviso', 'cliente_nombre', 'Falta el nombre del cliente', 'La propuesta va a salir sin razón social.');
    if (!p.presu_numero) add('aviso', 'presu_numero', 'Falta el número de cotización', 'La propuesta va a numerarse sola y no vas a poder rastrearla.');

    if (p.fiscal === 'legacy') {
      add('aviso', 'fiscal', 'Comparación fiscal asimétrica',
        'Con el criterio anterior el leasing deduce Ganancias y la compra no amortiza, lo que favorece artificialmente al leasing.');
    }
    if (p.inflacion > 0 && p.devaluacion === 0) {
      add('aviso', 'devaluacion', 'La tarifa sube en dólares sin límite',
        'Con ' + p.inflacion + ' % de aumento anual y devaluación cero, la tarifa crece ' + p.inflacion + ' % por año medida en dólares. Cargá una devaluación esperada.');
    }

    const orden = { error: 0, aviso: 1 };
    return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
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
    PERFIL_CON_HORA,
    DIAS_MES,
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
    bandasPorHora,
    tarifasPorHora,
    irradiacionDe,
    perfilesGeneracion,
    dimensionarInversor,
    potenciaPicoDiaClaro,
    parseBom,
    totalBom,
    analisisMontecarlo,
    analisisTornado,
    BANDAS_DEFAULT,
    Solar, Finanzas, Riesgo,
    validar,
    cuitValido,
    balanceAnual,
    perfilGenHora,
    configBateria,
    generarPerfil24h,
    dimensionarPorTecho,
    dimensionarPorConsumo,
    desglosePerdidas
  };
});


