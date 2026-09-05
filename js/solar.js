/* ==========================================================================
   solar.js — Modelo físico de radiación solar sobre plano inclinado.

   Resuelve la cadena completa:
     irradiación horizontal → fracción difusa → transposición al plano de los
     módulos → perfil horario → temperatura de celda → pérdida térmica.

   Referencias: Duffie & Beckman, "Solar Engineering of Thermal Processes";
   correlación de Erbs para la fracción difusa; modelo isotrópico de Liu-Jordan
   para la transposición; modelo NOCT para la temperatura de celda.

   Sin dependencias. Funciona en navegador y en Node (para tests).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Solar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAD = Math.PI / 180;
  const GSC = 1367;                       // constante solar, W/m²
  const MERIDIANO_AR = -45;               // meridiano del huso UTC-3
  const DIAS_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const DIA_REPRESENTATIVO = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
  const PASOS_POR_HORA = 4;               // submuestreo de 15 minutos dentro de cada hora

  const sin = x => Math.sin(x * RAD);
  const cos = x => Math.cos(x * RAD);

  /** Declinación solar en grados para el día n del año. */
  function declinacion(n) { return 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365); }

  /** Ángulo horario de puesta del sol, en grados (0 a 180). */
  function anguloPuesta(latDeg, decDeg) {
    const c = -Math.tan(latDeg * RAD) * Math.tan(decDeg * RAD);
    if (c <= -1) return 180;              // sol de medianoche
    if (c >= 1) return 0;                 // noche polar
    return Math.acos(c) / RAD;
  }

  /** Irradiación extraterrestre diaria sobre plano horizontal (kWh/m²·día). */
  function h0Diario(latDeg, n) {
    const dec = declinacion(n);
    const ws = anguloPuesta(latDeg, dec);
    const factorOrbital = 1 + 0.033 * Math.cos(2 * Math.PI * n / 365);
    const julios = (24 * 3600 / Math.PI) * GSC * factorOrbital *
      (cos(latDeg) * cos(dec) * sin(ws) + (Math.PI * ws / 180) * sin(latDeg) * sin(dec));
    return Math.max(0, julios / 3.6e6);
  }

  /** Irradiación extraterrestre media diaria de cada mes (kWh/m²·día). */
  function h0Mensual(latDeg) {
    return DIA_REPRESENTATIVO.map(n => h0Diario(latDeg, n));
  }

  /**
   * Fracción difusa media mensual según la correlación de Erbs,
   * en función del índice de claridad Kt y del ángulo de puesta del sol.
   */
  function fraccionDifusa(kt, wsDeg) {
    const k = Math.min(0.8, Math.max(0.05, kt));
    let kd;
    if (wsDeg <= 81.4) {
      kd = 1.391 - 3.560 * k + 4.189 * k * k - 2.137 * k * k * k;
    } else {
      kd = 1.311 - 3.022 * k + 3.427 * k * k - 1.821 * k * k * k;
    }
    return Math.min(1, Math.max(0.05, kd));
  }

  /**
   * Convierte el azimut de instalación (0 = Norte franco, positivo hacia el Oeste)
   * al ángulo de superficie de Duffie (0 = Sur, positivo hacia el Oeste).
   */
  function azimutSuperficie(azimutNorteDeg) {
    let g = 180 - azimutNorteDeg;
    while (g > 180) g -= 360;
    while (g < -180) g += 360;
    return g;
  }

  /** Coseno del ángulo de incidencia sobre el plano inclinado (Duffie 1.6.2). */
  function cosIncidencia(latDeg, decDeg, betaDeg, gammaDeg, omegaDeg) {
    return sin(decDeg) * sin(latDeg) * cos(betaDeg)
      - sin(decDeg) * cos(latDeg) * sin(betaDeg) * cos(gammaDeg)
      + cos(decDeg) * cos(latDeg) * cos(betaDeg) * cos(omegaDeg)
      + cos(decDeg) * sin(latDeg) * sin(betaDeg) * cos(gammaDeg) * cos(omegaDeg)
      + cos(decDeg) * sin(betaDeg) * sin(gammaDeg) * sin(omegaDeg);
  }

  /** Coseno del ángulo cenital (plano horizontal). */
  function cosCenital(latDeg, decDeg, omegaDeg) {
    return sin(latDeg) * sin(decDeg) + cos(latDeg) * cos(decDeg) * cos(omegaDeg);
  }

  /**
   * Integra el día representativo de un mes en pasos de 15 minutos y devuelve:
   *   rb        razón de irradiación directa sobre el plano respecto de la horizontal
   *   perfil    24 fracciones horarias de irradiación sobre el plano (suman 1)
   *   perfilHor 24 fracciones horarias sobre plano horizontal (suman 1)
   *   horasSol  cantidad de horas de reloj con sol útil
   * El desfase entre el mediodía solar y el mediodía de reloj sale de la longitud.
   */
  function integrarDia(mes, latDeg, lonDeg, betaDeg, azimutNorteDeg, kd, albedo) {
    const dec = declinacion(DIA_REPRESENTATIVO[mes]);
    const gamma = azimutSuperficie(azimutNorteDeg);
    const desfase = (MERIDIANO_AR - lonDeg) / 15;
    const vistaCielo = (1 + cos(betaDeg)) / 2;
    const vistaSuelo = (1 - cos(betaDeg)) / 2;

    const plano = new Array(24).fill(0);
    const horizontal = new Array(24).fill(0);
    let sumaDirectaPlano = 0, sumaDirectaHoriz = 0;

    for (let h = 0; h < 24; h++) {
      for (let s = 0; s < PASOS_POR_HORA; s++) {
        const horaReloj = h + (s + 0.5) / PASOS_POR_HORA;
        const omega = 15 * (horaReloj - 12 - desfase);
        const cz = cosCenital(latDeg, dec, omega);
        if (cz <= 0.02) continue;                       // sol por debajo de ~1° de altura

        const ci = Math.max(0, cosIncidencia(latDeg, dec, betaDeg, gamma, omega));
        // Irradiancia horizontal proporcional al coseno cenital dentro del día
        const iHoriz = cz;
        const iDirecta = iHoriz * (1 - kd);
        const iDifusa = iHoriz * kd;
        const rbInstante = Math.min(6, ci / cz);        // se acota cerca del amanecer y el ocaso
        const iPlano = iDirecta * rbInstante + iDifusa * vistaCielo + iHoriz * albedo * vistaSuelo;

        plano[h] += iPlano;
        horizontal[h] += iHoriz;
        sumaDirectaPlano += iDirecta * rbInstante;
        sumaDirectaHoriz += iDirecta;
      }
    }

    const totPlano = plano.reduce((a, b) => a + b, 0);
    const totHoriz = horizontal.reduce((a, b) => a + b, 0);
    return {
      rb: sumaDirectaHoriz > 0 ? sumaDirectaPlano / sumaDirectaHoriz : 1,
      // Cuánta irradiación recibe el plano por cada unidad que recibe la horizontal
      factorPlano: totHoriz > 0 ? totPlano / totHoriz : 1,
      perfil: totPlano > 0 ? plano.map(x => x / totPlano) : plano.map(() => 1 / 24),
      perfilHorizontal: totHoriz > 0 ? horizontal.map(x => x / totHoriz) : horizontal.map(() => 1 / 24),
      horasSol: plano.filter(x => x > 0).length,
      declinacion: dec,
      anguloPuesta: anguloPuesta(latDeg, dec),
    };
  }

  /**
   * Reparto mensual típico de la irradiación horizontal cuando solo se conoce el total anual.
   * Supone índice de claridad constante a lo largo del año, así que la forma la
   * impone la geometría solar del sitio: es una aproximación de primer orden,
   * bastante mejor que un perfil único para todo el país.
   */
  function mensualDesdeAnualHorizontal(latDeg, anualHorizKWhM2) {
    const h0 = h0Mensual(latDeg);
    const totalGeometrico = h0.reduce((s, x, m) => s + x * DIAS_MES[m], 0);
    if (totalGeometrico <= 0) return h0.map(() => 0);
    const kt = anualHorizKWhM2 / totalGeometrico;
    return h0.map(x => x * kt);            // kWh/m²·día de cada mes
  }

  /**
   * Cálculo completo de irradiación sobre el plano de los módulos.
   *
   * opciones:
   *   lat, lon           coordenadas del sitio (grados, negativos en Argentina)
   *   inclinacion        β, grados sobre la horizontal
   *   azimut             0 = Norte franco, positivo hacia el Oeste
   *   albedo             reflectancia del suelo (0.2 por defecto)
   *   diariaHorizontal   [12] kWh/m²·día medidos (NASA POWER); opcional
   *   anualHorizontal    kWh/m²·año horizontal; se usa si no hay serie mensual
   *
   * Devuelve la irradiación mensual y anual sobre el plano, los perfiles horarios
   * de cada mes y el factor de ganancia respecto de la horizontal.
   */
  function irradiacionPlano(opciones) {
    const o = opciones || {};
    const lat = numero(o.lat, -32);
    const lon = numero(o.lon, -60);
    const beta = Math.min(90, Math.max(0, numero(o.inclinacion, Math.abs(lat))));
    const azimut = numero(o.azimut, 0);
    const albedo = Math.min(0.9, Math.max(0, numero(o.albedo, 0.2)));

    let diariaHoriz = Array.isArray(o.diariaHorizontal) && o.diariaHorizontal.length === 12
      ? o.diariaHorizontal.map(x => numero(x, 0))
      : null;
    if (!diariaHoriz || diariaHoriz.every(x => x <= 0)) {
      diariaHoriz = mensualDesdeAnualHorizontal(lat, numero(o.anualHorizontal, 1600));
    }

    const h0 = h0Mensual(lat);
    const mensualPlano = [], mensualHoriz = [], perfiles = [], kts = [], kds = [], rbs = [];
    let anualPlano = 0, anualHoriz = 0;

    for (let m = 0; m < 12; m++) {
      const dias = DIAS_MES[m];
      const kt = h0[m] > 0 ? diariaHoriz[m] / h0[m] : 0.5;
      const ws = anguloPuesta(lat, declinacion(DIA_REPRESENTATIVO[m]));
      const kd = fraccionDifusa(kt, ws);
      const d = integrarDia(m, lat, lon, beta, azimut, kd, albedo);

      const hMes = diariaHoriz[m] * dias;              // kWh/m² en el mes, horizontal
      const tMes = hMes * d.factorPlano;               // kWh/m² en el mes, sobre el plano

      mensualHoriz.push(hMes);
      mensualPlano.push(tMes);
      perfiles.push(d.perfil);
      kts.push(kt); kds.push(kd); rbs.push(d.rb);
      anualHoriz += hMes; anualPlano += tMes;
    }

    return {
      lat, lon, inclinacion: beta, azimut, albedo,
      diariaHorizontal: diariaHoriz,
      mensualHorizontal: mensualHoriz,
      mensualPlano,
      anualHorizontal: anualHoriz,
      anualPlano,
      // Reparto mensual normalizado: reemplaza al perfil fijo del motor
      perfilMensual: anualPlano > 0 ? mensualPlano.map(x => x / anualPlano) : mensualPlano.map(() => 1 / 12),
      perfilesHorarios: perfiles,
      ganancia: anualHoriz > 0 ? anualPlano / anualHoriz : 1,
      kt: kts, kd: kds, rb: rbs,
    };
  }

  /**
   * Busca la inclinación que maximiza la irradiación anual sobre el plano,
   * para el azimut indicado. Devuelve también cuánto se pierde con la
   * inclinación actual respecto de la óptima.
   */
  function inclinacionOptima(opciones) {
    const o = Object.assign({}, opciones);
    let mejorBeta = 0, mejorAnual = -1;
    for (let beta = 0; beta <= 60; beta += 1) {
      o.inclinacion = beta;
      const r = irradiacionPlano(o);
      if (r.anualPlano > mejorAnual) { mejorAnual = r.anualPlano; mejorBeta = beta; }
    }
    const actual = irradiacionPlano(opciones);
    return {
      inclinacion: mejorBeta,
      anualPlano: mejorAnual,
      anualActual: actual.anualPlano,
      perdidaPct: mejorAnual > 0 ? (1 - actual.anualPlano / mejorAnual) * 100 : 0,
    };
  }

  /**
   * Temperatura de celda por el modelo NOCT y pérdida de potencia asociada.
   *   tempAmbiente  °C
   *   irradiancia   W/m² sobre el plano
   *   noct          temperatura nominal de operación de celda (°C), típico 45
   *   coefPotencia  coeficiente de temperatura de la potencia (%/°C), típico -0.35
   */
  function perdidaTermica(tempAmbiente, irradiancia, noct, coefPotencia) {
    const ta = numero(tempAmbiente, 20);
    const g = Math.max(0, numero(irradiancia, 0));
    const nt = numero(noct, 45);
    const coef = numero(coefPotencia, -0.35);
    const tCelda = ta + (nt - 20) / 800 * g;
    return { tempCelda: tCelda, perdidaPct: Math.max(0, (tCelda - 25) * -coef) };
  }

  /**
   * Pérdida térmica media anual ponderada por energía.
   * Recorre los doce meses hora a hora usando la temperatura ambiente media
   * de cada mes y la irradiancia sobre el plano de ese instante.
   */
  function perdidaTermicaAnual(irr, tempMensual, noct, coefPotencia) {
    if (!irr || !irr.perfilesHorarios) return { perdidaPct: 0, tempCeldaMedia: 25 };
    const temps = Array.isArray(tempMensual) && tempMensual.length === 12
      ? tempMensual.map(x => numero(x, 20))
      : new Array(12).fill(20);
    let energia = 0, perdidaPonderada = 0, tempPonderada = 0;
    for (let m = 0; m < 12; m++) {
      const dias = DIAS_MES[m];
      const kwhDia = irr.mensualPlano[m] / dias;               // kWh/m²·día sobre el plano
      for (let h = 0; h < 24; h++) {
        const kwh = kwhDia * irr.perfilesHorarios[m][h];       // kWh/m² en esa hora
        if (kwh <= 0) continue;
        const irradiancia = kwh * 1000;                         // W/m² medios de la hora
        const pt = perdidaTermica(temps[m], irradiancia, noct, coefPotencia);
        const peso = kwh * dias;
        energia += peso;
        perdidaPonderada += pt.perdidaPct * peso;
        tempPonderada += pt.tempCelda * peso;
      }
    }
    return {
      perdidaPct: energia > 0 ? perdidaPonderada / energia : 0,
      tempCeldaMedia: energia > 0 ? tempPonderada / energia : 25,
    };
  }

  /**
   * Irradiancia horaria sobre el plano en un día despejado (W/m²).
   *
   * El balance anual trabaja con el día medio de cada mes, que mezcla días claros
   * y nublados y por eso subestima la potencia de pico. Para dimensionar el
   * inversor hace falta el día despejado, que es el que realmente recorta.
   * Modelo de cielo claro tipo Hottel/ASHRAE: la irradiancia directa normal decae
   * exponencialmente con la masa de aire y la difusa se toma como una fracción de ella.
   */
  function perfilClaroPlano(mes, latDeg, lonDeg, betaDeg, azimutNorteDeg, albedo) {
    const A = 1150;                       // irradiancia directa normal extrapolada, W/m²
    const B = 0.17;                       // coeficiente de extinción atmosférica
    const FRAC_DIFUSA = 0.12;             // difusa de cielo claro respecto de la directa horizontal
    const rho = Math.min(0.9, Math.max(0, numero(albedo, 0.2)));
    const dec = declinacion(DIA_REPRESENTATIVO[mes]);
    const gamma = azimutSuperficie(numero(azimutNorteDeg, 0));
    const beta = Math.min(90, Math.max(0, numero(betaDeg, 25)));
    const desfase = (MERIDIANO_AR - numero(lonDeg, -60)) / 15;
    const vistaCielo = (1 + cos(beta)) / 2;
    const vistaSuelo = (1 - cos(beta)) / 2;

    const horas = [];
    for (let h = 0; h < 24; h++) {
      let suma = 0;
      for (let s = 0; s < PASOS_POR_HORA; s++) {
        const horaReloj = h + (s + 0.5) / PASOS_POR_HORA;
        const omega = 15 * (horaReloj - 12 - desfase);
        const cz = cosCenital(latDeg, dec, omega);
        if (cz <= 0.05) continue;
        const gbn = A * Math.exp(-B / cz);                  // directa normal
        const gbh = gbn * cz;                                // directa sobre horizontal
        const gdh = FRAC_DIFUSA * gbh;                       // difusa horizontal
        const ci = Math.max(0, cosIncidencia(latDeg, dec, beta, gamma, omega));
        const gPlano = gbn * ci + gdh * vistaCielo + (gbh + gdh) * rho * vistaSuelo;
        suma += gPlano;
      }
      horas.push(suma / PASOS_POR_HORA);                     // W/m² medios de la hora
    }
    return horas;
  }

  /** Construye la URL de la climatología de NASA POWER para un punto. */
  function urlNasaPower(lat, lon) {
    return 'https://power.larc.nasa.gov/api/temporal/climatology/point' +
      '?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE' +
      '&longitude=' + encodeURIComponent(Number(lon).toFixed(4)) +
      '&latitude=' + encodeURIComponent(Number(lat).toFixed(4)) +
      '&format=JSON';
  }

  const MESES_NASA = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  /**
   * Interpreta la respuesta de NASA POWER.
   * Devuelve la irradiación horizontal media diaria (kWh/m²·día) y la
   * temperatura media (°C) de cada mes. Lanza si la respuesta no sirve.
   */
  function parsearNasaPower(json) {
    const p = json && json.properties && json.properties.parameter;
    if (!p || !p.ALLSKY_SFC_SW_DWN) throw new Error('La respuesta de NASA POWER no trae irradiación');
    const irr = MESES_NASA.map(k => Number(p.ALLSKY_SFC_SW_DWN[k]));
    const temp = p.T2M ? MESES_NASA.map(k => Number(p.T2M[k])) : new Array(12).fill(20);
    if (irr.some(x => !isFinite(x) || x <= 0)) throw new Error('NASA POWER devolvió valores inválidos para este punto');
    return { diariaHorizontal: irr, tempMensual: temp };
  }

  /** Descarga la climatología del punto. Requiere conexión; NASA POWER admite CORS. */
  function traerNasaPower(lat, lon, fetchImpl) {
    const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.reject(new Error('Este navegador no puede hacer la consulta'));
    return f(urlNasaPower(lat, lon))
      .then(r => {
        if (!r.ok) throw new Error('NASA POWER respondió ' + r.status);
        return r.json();
      })
      .then(parsearNasaPower);
  }

  function numero(v, def) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : def;
  }

  return {
    RAD, GSC, DIAS_MES, DIA_REPRESENTATIVO,
    declinacion,
    anguloPuesta,
    h0Diario,
    h0Mensual,
    fraccionDifusa,
    azimutSuperficie,
    cosIncidencia,
    cosCenital,
    integrarDia,
    mensualDesdeAnualHorizontal,
    irradiacionPlano,
    inclinacionOptima,
    perdidaTermica,
    perdidaTermicaAnual,
    perfilClaroPlano,
    urlNasaPower,
    parsearNasaPower,
    traerNasaPower,
  };
});
