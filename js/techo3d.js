/* ==========================================================================
   techo3d.js — Motor Geométrico, Empaquetado de Módulos y Simulación 3D
   para ALP GROUP Simulador Fotovoltaico.
   
   Funcionalidades:
     1. Proyección geográfica y geometría de polígonos (área, perímetro, azimut).
     2. Detección de orientación y auto-layout óptimo de paneles solares.
     3. Gestión de zonas de exclusión / obstáculos (chimeneas, árboles, domos).
     4. Conector con NASA POWER API para irradiación y clima satelital.
     5. Posicionamiento astronómico del sol para sombras 3D dinámicas.
     6. Motor de cotización express en 90 segundos: Leasing no bancario vs. Ahorro.
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Techo3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;

  // Parámetros estándar de paneles de alta eficiencia para proyectos ALP Group (575 Wp)
  const PANEL_DEFECTO = {
    ancho: 1.134,       // metros
    alto: 2.278,        // metros
    potenciaWp: 575,    // Wp
    eficiencia: 0.222,  // 22.2%
    pesoKg: 28.5
  };

  /**
   * Convierte coordenadas geográficas [lat, lng] a coordenadas locales en metros
   * con respecto al centroide del polígono usando proyección equirrectangular.
   */
  function proyectarMetros(puntosLatLng) {
    if (!puntosLatLng || puntosLatLng.length === 0) return { puntos: [], centro: { lat: 0, lng: 0 } };

    let sumLat = 0, sumLng = 0;
    for (let p of puntosLatLng) {
      sumLat += p[0];
      sumLng += p[1];
    }
    const centro = { lat: sumLat / puntosLatLng.length, lng: sumLng / puntosLatLng.length };
    const latRad = centro.lat * RAD;
    const mPorLat = 111132.954;
    const mPorLng = 111132.954 * Math.cos(latRad);

    const puntos = puntosLatLng.map(p => ({
      x: (p[1] - centro.lng) * mPorLng,
      y: (p[0] - centro.lat) * mPorLat,
      lat: p[0],
      lng: p[1]
    }));

    return { puntos, centro, mPorLat, mPorLng };
  }

  /**
   * Cálculo de área (m²) y perímetro (m) de un polígono en coordenadas métricas (Shoelace formula).
   */
  function calcAreaPerimetro(puntosMetros) {
    const n = puntosMetros.length;
    if (n < 3) return { areaM2: 0, perimetroM: 0 };

    let area = 0;
    let perimetro = 0;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const p1 = puntosMetros[i];
      const p2 = puntosMetros[j];

      area += p1.x * p2.y - p2.x * p1.y;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      perimetro += Math.sqrt(dx * dx + dy * dy);
    }

    return {
      areaM2: Math.abs(area / 2),
      perimetroM: perimetro
    };
  }

  /**
   * Determina la orientación principal (Azimut óptimo) del polígono en grados (0° = Norte, 90° = Este, 180° = Sur, 270° = Oeste).
   * Busca la arista más larga o el eje principal de la nave.
   */
  function calcAzimutPrincipal(puntosMetros) {
    const n = puntosMetros.length;
    if (n < 2) return 0;

    let maxLongitud = 0;
    let mejorAngulo = 0;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = puntosMetros[j].x - puntosMetros[i].x;
      const dy = puntosMetros[j].y - puntosMetros[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > maxLongitud) {
        maxLongitud = len;
        // En coordenadas locales: x es Este, y es Norte.
        // El ángulo trigonométrico es atan2(dy, dx).
        // El azimut geográfico (0 = N, 90 = E) es (90 - ángulo) mod 360.
        let anguloGeo = 90 - (Math.atan2(dy, dx) * DEG);
        while (anguloGeo < 0) anguloGeo += 360;
        while (anguloGeo >= 360) anguloGeo -= 360;
        mejorAngulo = anguloGeo;
      }
    }

    // Normalizamos el azimut para que apunte hacia el semiplano Norte (óptimo en el hemisferio sur)
    return Math.round(mejorAngulo % 180);
  }

  /**
   * Algoritmo punto en polígono (Ray Casting).
   */
  function puntoEnPoligono(x, y, vertices) {
    let dentro = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;

      const intersecta = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersecta) dentro = !dentro;
    }
    return dentro;
  }

  /**
   * Comprueba si un rectángulo rotado está completamente contenido dentro del polígono
   * y no choca contra ningún obstáculo.
   */
  function rectanguloValido(cx, cy, ancho, alto, rotRad, verticesTecho, obstaculos) {
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);
    const hw = ancho / 2;
    const hh = alto / 2;

    // 4 esquinas del módulo
    const esquinas = [
      { x: cx + (-hw * cosR - -hh * sinR), y: cy + (-hw * sinR + -hh * cosR) },
      { x: cx + ( hw * cosR - -hh * sinR), y: cy + ( hw * sinR + -hh * cosR) },
      { x: cx + ( hw * cosR -  hh * sinR), y: cy + ( hw * sinR +  hh * cosR) },
      { x: cx + (-hw * cosR -  hh * sinR), y: cy + (-hw * sinR +  hh * cosR) }
    ];

    // Verificar que las 4 esquinas y el centro estén dentro del techo
    if (!puntoEnPoligono(cx, cy, verticesTecho)) return false;
    for (let e of esquinas) {
      if (!puntoEnPoligono(e.x, e.y, verticesTecho)) return false;
    }

    // Verificar colisión con obstáculos (círculos o zonas de exclusión)
    if (obstaculos && obstaculos.length > 0) {
      for (let obs of obstaculos) {
        const radioSeguridad = (obs.radio || 1.5) + Math.max(hw, hh);
        const distSq = (cx - obs.x) * (cx - obs.x) + (cy - obs.y) * (cy - obs.y);
        if (distSq < radioSeguridad * radioSeguridad) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Algoritmo de Auto-Layout: distribuye automáticamente los módulos fotovoltaicos
   * maximizando la potencia sobre el polígono útil, respetando márgenes y obstáculos.
   */
  function distribuirPaneles(puntosMetros, obstaculosMetros, opciones) {
    const opts = Object.assign({
      anchoPanel: PANEL_DEFECTO.ancho,
      altoPanel: PANEL_DEFECTO.alto,
      potenciaWp: PANEL_DEFECTO.potenciaWp,
      orientacion: 'portrait',     // 'portrait' (vertical) o 'landscape' (horizontal)
      margenBorde: 0.6,            // metros de pasillo perimetral
      espacioEntrePaneles: 0.05,   // metros entre paneles contiguos
      espacioEntreFilas: 0.15,     // metros entre filas (o mayor si hay inclinación)
      inclinacionTecho: 15,        // grados
      azimutManual: null           // grados (null = cálculo automático)
    }, opciones || {});

    if (!puntosMetros || puntosMetros.length < 3) {
      return { paneles: [], count: 0, potenciaKwp: 0, areaOcupadaM2: 0, factorOcupacionPct: 0 };
    }

    // Dimensiones efectivas del módulo según orientación
    const wModulo = opts.orientacion === 'landscape' ? opts.altoPanel : opts.anchoPanel;
    const hModulo = opts.orientacion === 'landscape' ? opts.anchoPanel : opts.altoPanel;

    // Determinar ángulo de rotación de la retícula
    const azimutDeg = opts.azimutManual !== null ? opts.azimutManual : calcAzimutPrincipal(puntosMetros);
    const rotacionRad = azimutDeg * RAD;

    // Calcular Bounding Box del polígono rotado para la retícula
    const cosA = Math.cos(-rotacionRad);
    const sinA = Math.sin(-rotacionRad);

    const puntosRotados = puntosMetros.map(p => ({
      x: p.x * cosA - p.y * sinA,
      y: p.x * sinA + p.y * cosA
    }));

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let p of puntosRotados) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const pasoX = wModulo + opts.espacioEntrePaneles;
    const pasoY = hModulo + opts.espacioEntreFilas;

    const paneles = [];
    const cosOrig = Math.cos(rotacionRad);
    const sinOrig = Math.sin(rotacionRad);

    // Iterar la retícula sobre el área delimitada
    for (let rx = minX + opts.margenBorde + wModulo / 2; rx <= maxX - opts.margenBorde - wModulo / 2; rx += pasoX) {
      for (let ry = minY + opts.margenBorde + hModulo / 2; ry <= maxY - opts.margenBorde - hModulo / 2; ry += pasoY) {
        // Convertir el punto candidato de vuelta a coordenadas del mundo
        const wx = rx * cosOrig - ry * sinOrig;
        const wy = rx * sinOrig + ry * cosOrig;

        if (rectanguloValido(wx, wy, wModulo, hModulo, rotacionRad, puntosMetros, obstaculosMetros)) {
          paneles.push({
            x: wx,
            y: wy,
            ancho: wModulo,
            alto: hModulo,
            rotacionRad: rotacionRad,
            rotacionDeg: azimutDeg
          });
        }
      }
    }

    const count = paneles.length;
    const potenciaKwp = (count * opts.potenciaWp) / 1000;
    const areaPanelUnit = opts.anchoPanel * opts.altoPanel;
    const areaOcupadaM2 = count * areaPanelUnit;
    const areaTotalTecho = calcAreaPerimetro(puntosMetros).areaM2;
    const factorOcupacionPct = areaTotalTecho > 0 ? (areaOcupadaM2 / areaTotalTecho) * 100 : 0;

    return {
      paneles,
      count,
      potenciaKwp: Math.round(potenciaKwp * 10) / 10,
      areaOcupadaM2: Math.round(areaOcupadaM2),
      areaTotalTecho: Math.round(areaTotalTecho),
      factorOcupacionPct: Math.round(factorOcupacionPct),
      azimutDeg
    };
  }

  /**
   * Cálculo astronómico de la posición solar (Elevación y Azimut) para sombras 3D en tiempo real.
   * Día medio mensual según mes (0 a 11) y hora decimal (0.0 a 24.0).
   */
  function calcularPosicionSolar(latDeg, lonDeg, mesIndex, horaDecimal) {
    const diaDelAnioPorMes = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
    const n = diaDelAnioPorMes[Math.max(0, Math.min(11, mesIndex))];

    // Declinación solar (Duffie & Beckman)
    const dec = 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365);

    // Ecuación del tiempo (Et) en minutos
    const b = 2 * Math.PI * (n - 1) / 365;
    const eTime = 229.2 * (0.000075 + 0.001868 * Math.cos(b) - 0.032077 * Math.sin(b)
      - 0.014615 * Math.cos(2 * b) - 0.040849 * Math.sin(2 * b));

    // Huso horario de Argentina (UTC-3)
    const timezone = -3;
    const meridianoLocal = timezone * 15;
    const correccionLongitud = 4 * (lonDeg - meridianoLocal);
    const tiempoSolar = horaDecimal + (correccionLongitud + eTime) / 60;

    // Ángulo horario (omega)
    const omega = (tiempoSolar - 12) * 15;

    // Ángulo cenital y elevación
    const sinElev = Math.sin(latDeg * RAD) * Math.sin(dec * RAD) +
      Math.cos(latDeg * RAD) * Math.cos(dec * RAD) * Math.cos(omega * RAD);
    const elevacionRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
    const elevacionDeg = elevacionRad * DEG;

    // Azimut solar (0° = Norte, 90° = Este, 180° = Sur, 270° = Oeste)
    const cosAz = (Math.sin(dec * RAD) - Math.sin(latDeg * RAD) * sinElev) /
      (Math.cos(latDeg * RAD) * Math.cos(elevacionRad) || 0.0001);
    let azimutRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    let azimutDeg = azimutRad * DEG;

    if (omega > 0) {
      azimutDeg = 360 - azimutDeg;
    }

    return {
      elevacionDeg: Math.round(elevacionDeg * 10) / 10,
      azimutDeg: Math.round(azimutDeg * 10) / 10,
      esDeDia: elevacionDeg > 0
    };
  }

  /**
   * Conexión con NASA POWER API para obtener irradiación global y temperatura histórica.
   * Gratuita, sin API key y cobertura global.
   */
  async function fetchNasaPower(lat, lon) {
    const latFix = (+lat).toFixed(4);
    const lonFix = (+lon).toFixed(4);
    const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M,WS10M&community=RE&longitude=${lonFix}&latitude=${latFix}&format=JSON`;

    try {
      const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const r = json.properties && json.properties.parameter;
      if (!r || !r.ALLSKY_SFC_SW_DWN) throw new Error('Formato inválido de NASA POWER');

      const meses = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const irradiacionMensual = meses.map(m => r.ALLSKY_SFC_SW_DWN[m] || 4.5);
      const tempMensual = meses.map(m => r.T2M ? r.T2M[m] : 18.0);
      const vientoMensual = meses.map(m => r.WS10M ? r.WS10M[m] : 3.5);

      return {
        ok: true,
        fuente: 'NASA POWER API (Climatología Satelital 30 años)',
        irradiacionMensual, // kWh/m²/día
        tempMensual,        // °C
        vientoMensual,      // m/s
        anualPromedio: r.ALLSKY_SFC_SW_DWN.ANN || (irradiacionMensual.reduce((a, b) => a + b, 0) / 12)
      };
    } catch (err) {
      console.warn('Fallo consulta NASA POWER, usando estimación astronómica local:', err);
      // Fallback robusto con el modelo astronómico local si no hay internet en campo
      const irradFallback = [6.8, 6.0, 5.0, 3.8, 2.7, 2.3, 2.6, 3.4, 4.5, 5.7, 6.5, 7.0];
      return {
        ok: false,
        fuente: 'Modelo Astronómico Local (Modo Offline)',
        irradiacionMensual: irradFallback,
        tempMensual: [24, 23, 21, 17, 13, 10, 10, 12, 14, 17, 20, 23],
        vientoMensual: [3.2, 3.0, 2.8, 2.5, 2.4, 2.5, 2.7, 2.9, 3.1, 3.3, 3.4, 3.3],
        anualPromedio: 4.7
      };
    }
  }

  /**
   * Calculadora de Cierre Financiero Express en 90 Segundos:
   * Demuestra el ahorro mensual versus la cuota mensual de leasing no bancario de ALP Group.
   */
  function calcularLeasingExpress(potenciaKwp, params) {
    const p = Object.assign({
      costoPorWpKwp: 0.88,         // U$D / Wp instalado llave en mano
      tarifaUsdKwh: 0.115,         // U$D / kWh tarifa comercial/industrial promedio
      horasSolEquivalentes: 1650,  // kWh/kWp año promedio Argentina centro
      plazoMeses: 60,              // 5 años estándar de leasing no bancario
      tasaAnualLeasingPct: 9.5,    // Tasa en dólares para leasing de equipos
      seguroOpexAnualPct: 1.2      // OPEX y seguro como % del CAPEX
    }, params || {});

    const capexTotalUsd = potenciaKwp * 1000 * p.costoPorWpKwp;
    const generacionAnualKwh = potenciaKwp * p.horasSolEquivalentes;
    const generacionMensualKwh = generacionAnualKwh / 12;

    // Ahorro promedio mensual en la factura eléctrica del cliente
    const ahorroMensualUsd = generacionMensualKwh * p.tarifaUsdKwh;

    // Cuota pura del leasing (sistema francés)
    const rMensual = (p.tasaAnualLeasingPct / 100) / 12;
    const nCuotas = p.plazoMeses;
    const cuotaAmortUsd = capexTotalUsd * (rMensual / (1 - Math.pow(1 + rMensual, -nCuotas)));

    // Más canon de seguro y mantenimiento preventivo mensual
    const opexMensualUsd = (capexTotalUsd * (p.seguroOpexAnualPct / 100)) / 12;
    const cuotaTotalLeasingUsd = cuotaAmortUsd + opexMensualUsd;

    // Flujo de caja neto para el cliente (Ahorro - Cuota)
    const flujoNetoMensualUsd = ahorroMensualUsd - cuotaTotalLeasingUsd;
    const ahorroNetoCincoAnios = (ahorroMensualUsd * 60) - (cuotaTotalLeasingUsd * 60);
    const ahorroNetoVeinticincoAnios = (ahorroMensualUsd * 300) - (cuotaTotalLeasingUsd * 60);

    return {
      capexTotalUsd: Math.round(capexTotalUsd),
      generacionAnualKwh: Math.round(generacionAnualKwh),
      ahorroMensualUsd: Math.round(ahorroMensualUsd),
      cuotaLeasingMensualUsd: Math.round(cuotaTotalLeasingUsd),
      flujoNetoMensualUsd: Math.round(flujoNetoMensualUsd),
      sePagaSolo: flujoNetoMensualUsd >= 0,
      coberturaCuotaPct: Math.round((ahorroMensualUsd / cuotaTotalLeasingUsd) * 100),
      ahorroNetoCincoAnios: Math.round(ahorroNetoCincoAnios),
      ahorroNetoVeinticincoAnios: Math.round(ahorroNetoVeinticincoAnios),
      plazoMeses: p.plazoMeses
    };
  }

  /**
   * Calcula la distancia mínima entre filas (pitch / inter-row spacing)
   * para estructuras inclinadas sobre losa o suelo, evitando sombras en el solsticio de invierno.
   */
  function calcularPitchOptimo(latDeg, inclinacionPanelDeg, altoPanelM, orientacion) {
    if (inclinacionPanelDeg <= 5) return { espacioEntreFilas: 0.15, pitchTotal: 0.15, deltaH: 0, alphaSolsticioDeg: 90 };

    const betaRad = inclinacionPanelDeg * RAD;
    const lEfectiva = orientacion === 'landscape' ? PANEL_DEFECTO.ancho : (altoPanelM || PANEL_DEFECTO.alto);

    // Altura del extremo superior del panel respecto al suelo/techo
    const deltaH = lEfectiva * Math.sin(betaRad);
    const anchoProyectado = lEfectiva * Math.cos(betaRad);

    // Ángulo solar mínimo al mediodía en solsticio de invierno:
    // En hemisferio sur (lat < 0), solsticio de invierno es el 21 de junio (declinación +23.45°)
    // alpha = 90° - |lat| - 23.45°
    const absLat = Math.abs(latDeg !== undefined ? latDeg : -34.6);
    const alphaDeg = Math.max(15, 90 - absLat - 23.45);
    const alphaRad = alphaDeg * RAD;

    // Distancia de sombra proyectada hacia atrás
    const distanciaSombra = deltaH / Math.tan(alphaRad);

    // Espaciado libre recomendado entre la parte trasera de una fila y el inicio de la siguiente
    const espacioEntreFilas = Math.max(0.25, Math.round(distanciaSombra * 100) / 100);
    const pitchTotal = Math.round((anchoProyectado + espacioEntreFilas) * 100) / 100;

    return {
      espacioEntreFilas,
      pitchTotal,
      deltaH: Math.round(deltaH * 100) / 100,
      alphaSolsticioDeg: Math.round(alphaDeg * 10) / 10
    };
  }

  /**
   * Consulta a OpenStreetMap Overpass API para buscar la huella poligonal del edificio más cercano.
   */
  async function fetchHuellaEdificioOSM(lat, lng) {
    const latFix = (+lat).toFixed(6);
    const lngFix = (+lng).toFixed(6);
    const query = `[out:json][timeout:8];(way["building"](around:40,${latFix},${lngFix}););out geom;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const json = await resp.json();
      if (json && json.elements && json.elements.length > 0) {
        const el = json.elements[0];
        if (el.geometry && el.geometry.length >= 3) {
          const puntos = el.geometry.map(pt => [pt.lat, pt.lon]);
          return {
            ok: true,
            tipo: el.tags && el.tags.building ? el.tags.building : 'industrial',
            puntos
          };
        }
      }
      return { ok: false, mensaje: 'No se encontró huella vectorial en OpenStreetMap en este punto.' };
    } catch (e) {
      return { ok: false, mensaje: e.message };
    }
  }

  /**
   * Catálogo de tipos de obstáculos estándar para cubiertas industriales y comerciales
   */
  const TIPOS_OBSTACULO = {
    arbol: { id: 'arbol', nombre: '🌳 Árbol', radioDefecto: 3.0, alturaDefecto: 8.0, colorHex: 0x15803d },
    chimenea: { id: 'chimenea', nombre: '🏭 Chimenea / Tiro', radioDefecto: 0.8, alturaDefecto: 4.5, colorHex: 0x64748b },
    hvac: { id: 'hvac', nombre: '❄️ Unidad HVAC / Clima', radioDefecto: 1.8, alturaDefecto: 2.2, colorHex: 0x94a3b8 },
    domo: { id: 'domo', nombre: '🪟 Domo / Tragaluz', radioDefecto: 1.2, alturaDefecto: 0.8, colorHex: 0x38bdf8 },
    antena: { id: 'antena', nombre: '🗼 Antena / Pararrayos', radioDefecto: 0.6, alturaDefecto: 9.0, colorHex: 0xd97706 }
  };

  /**
   * Cálculo de sombreado por trazado de rayos (Ray-casting) entre paneles y obstáculos.
   * Determina qué paneles están bajo sombra para una posición solar dada (elevación, azimut).
   */
  function calcularSombreadoPaneles(paneles, obstaculosMetros, elevacionDeg, azimutDeg, alturaBaseM) {
    if (!paneles || paneles.length === 0) return { sombreados: [], pctSombra: 0 };
    if (!obstaculosMetros || obstaculosMetros.length === 0 || elevacionDeg <= 0) {
      return { sombreados: new Array(paneles.length).fill(false), pctSombra: 0 };
    }

    const elevRad = elevacionDeg * RAD;
    const azRad = azimutDeg * RAD;

    // Vector unitario que apunta HACIA el sol
    // X = Este (+), Y = Norte (+), Z = Arriba (+)
    const sx = Math.cos(elevRad) * Math.sin(azRad);
    const sy = Math.cos(elevRad) * Math.cos(azRad);
    const sz = Math.sin(elevRad);

    const sombreados = new Array(paneles.length).fill(false);
    let cantSombreados = 0;

    const zBase = alturaBaseM || 8.0;

    for (let i = 0; i < paneles.length; i++) {
      const p = paneles[i];
      const px = p.x;
      const py = p.y;
      const pz = zBase + 0.2; // Altura del centro del panel

      for (let obs of obstaculosMetros) {
        const ox = obs.x;
        const oy = obs.y;
        const rObs = obs.radio || 2.0;
        const hObs = zBase + (obs.alturaRelativa || (obs.alturaTotal ? obs.alturaTotal - zBase : 3.5));

        // Intersección de rayo P + t*S con el cilindro vertical centrado en (ox, oy) de radio rObs
        // (px + t*sx - ox)^2 + (py + t*sy - oy)^2 = rObs^2
        const dx = px - ox;
        const dy = py - oy;

        const a = sx * sx + sy * sy;
        if (a < 1e-6) continue; // Rayo vertical

        const b = 2 * (dx * sx + dy * sy);
        const c = dx * dx + dy * dy - rObs * rObs;

        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sqrtDisc = Math.sqrt(disc);
          const t1 = (-b - sqrtDisc) / (2 * a);
          const t2 = (-b + sqrtDisc) / (2 * a);

          // Buscamos intersección en dirección al sol (t > 0)
          const t = t1 > 0 ? t1 : (t2 > 0 ? t2 : -1);
          if (t > 0) {
            // Verificar si el rayo pasa por debajo de la coronación del obstáculo
            const zRayo = pz + t * sz;
            if (zRayo <= hObs && zRayo >= zBase) {
              sombreados[i] = true;
              cantSombreados++;
              break;
            }
          }
        }
      }
    }

    const pctSombra = Math.round((cantSombreados / paneles.length) * 100);
    return {
      sombreados,
      cantSombreados,
      pctSombra
    };
  }

  /**
   * Estima la pérdida anual ponderada por sombras (% derate anual)
   * simulando muestras en solsticios y equinoccios en horas productivas (9h, 12h, 15h).
   */
  function estimarPerdidaSombrasAnual(paneles, obstaculosMetros, latDeg, lonDeg, alturaBaseM) {
    if (!paneles || paneles.length === 0 || !obstaculosMetros || obstaculosMetros.length === 0) {
      return 0;
    }

    const horasMuestra = [9.5, 12.0, 14.5];
    const mesesMuestra = [0, 5, 8]; // Enero (verano), Junio (invierno), Septiembre (equinoccio)

    let sumaPct = 0;
    let muestras = 0;

    for (let m of mesesMuestra) {
      for (let h of horasMuestra) {
        const sol = calcularPosicionSolar(latDeg, lonDeg, m, h);
        if (sol.esDeDia && sol.elevacionDeg > 10) {
          const res = calcularSombreadoPaneles(paneles, obstaculosMetros, sol.elevacionDeg, sol.azimutDeg, alturaBaseM);
          sumaPct += res.pctSombra;
          muestras++;
        }
      }
    }

    if (muestras === 0) return 0;
    // Ponderación anual estimada (la pérdida eléctrica suele ser menor que el sombreado visual total gracias a diodos bypass)
    const factorElectrico = 0.65;
    const perdidaAnualPct = Math.min(25, Math.round((sumaPct / muestras) * factorElectrico * 10) / 10);
    return perdidaAnualPct;
  }

  return {
    PANEL_DEFECTO,
    TIPOS_OBSTACULO,
    proyectarMetros,
    calcAreaPerimetro,
    calcAzimutPrincipal,
    puntoEnPoligono,
    distribuirPaneles,
    calcularPosicionSolar,
    calcularSombreadoPaneles,
    estimarPerdidaSombrasAnual,
    fetchNasaPower,
    calcularLeasingExpress,
    calcularPitchOptimo,
    fetchHuellaEdificioOSM
  };
});
