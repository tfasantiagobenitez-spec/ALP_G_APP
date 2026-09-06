/* ==========================================================================
   app.js — Interfaz completa:
   - Login y sincronización Supabase / Local
   - Formularios declarativos con selección de ciudades argentinas
   - Almacenamiento y dimensionamiento de baterías (BESS)
   - Curva de generación vs demanda de 24 horas
   - Análisis de sensibilidad y matrices de riesgo
   - Comparador multi-proyecto lado a lado
   - Propuesta comercial ejecutiva con logo de empresa e impresión en PDF
   - Exportación de flujos de fondos a Excel (CSV)
   ========================================================================== */
(function () {
  'use strict';

  // Selectores, formato, gráficos y avisos viven en ui-comun.js
  const $ = UI0.$, $$ = UI0.$$;
  const fmtN = UI0.fmtN, fmtARS = UI0.fmtARS, fmtUSD = UI0.fmtUSD;
  const fmtPct = UI0.fmtPct, fmtAnios = UI0.fmtAnios, esc = UI0.esc, short = UI0.short;
  const kpis = UI0.kpis, barChart = UI0.barChart, lineChart = UI0.lineChart, toast = UI0.toast;

  // ---------- Empresa / Membrete por defecto ----------
  // Los datos de contacto arrancan vacíos a propósito: la propuesta no se imprime
  // hasta que alguien cargue el teléfono y el email reales de la empresa.
  const KEY_TEMA = 'alp_g_app_tema_v1';
  const DEFAULT_MEMBRETE = (window.DB && DB.MEMBRETE_DEFAULT) || {
    nombre: 'ALP GROUP',
    slogan: 'Ingeniería y Desarrollo Fotovoltaico · Autoconsumo & Eficiencia',
    asesor: '',
    tel: '',
    email: '',
    validez: '15',
    logo: 'img/logo.svg',
  };

  /** Membrete ya cargado. En modo nube vive en la tabla `empresa` y lo comparte todo el equipo. */
  function getMembrete() {
    return UI.membrete || DEFAULT_MEMBRETE;
  }

  async function cargarMembrete() {
    try { UI.membrete = await DB.empresa.get(); }
    catch (e) { console.warn('No se pudo cargar el membrete:', e.message); UI.membrete = Object.assign({}, DEFAULT_MEMBRETE); }
  }

  /** Datos sin los cuales la propuesta no debería salir a la calle. */
  function faltantesMembrete() {
    const m = getMembrete();
    const faltan = [];
    if (!String(m.nombre || '').trim()) faltan.push('nombre de la empresa');
    if (!String(m.tel || '').trim()) faltan.push('teléfono');
    if (!String(m.email || '').trim()) faltan.push('email de contacto');
    return faltan;
  }

  // ---------- Estado por defecto de un proyecto nuevo ----------
  const DEFAULT_ESTADO = {
    cliente_nombre: '', cliente_ubicacion: '', ciudad_id: 'ros', tipoInst: 'chapa', tipoSistema: 'industrial',
    presu_numero: '', presu_cuit: '', presu_paneles: '20', panel_w: '575',
    kwp: '11.5', usd_kwp: '650', tc: '1430', pr: '83', irrad: '1820', deg: '0.5',
    tarifa_resto: '120', inflacion: '0', horizonte: '20', tasa_desc: '10',
    devaluacion: '0', moneda_analisis: 'usd', fiscal: 'simetrico', amort_anios: '5',
    tarifa_tipo: 'simple', tarifa_pico: '', tarifa_valle: '',
    banda_pico_desde: '18', banda_pico_hasta: '23', banda_valle_desde: '23', banda_valle_hasta: '5',
    iva_pct: '0', iva_condicion: 'cf', cargo_fijo: '0',
    pot_contratada: '0', cargo_pot: '0', reducePotencia: 'no',
    irrad_fuente: 'tabla', inclinacion: '25', azimut: '0', albedo: '0.2', pr_fuente: 'manual',
    inv_potencia_ac: '0', inv_v_min: '200', inv_v_max: '1000', inv_v_arranque: '150',
    inv_mppt: '2', inv_i_max_mppt: '15',
    mod_voc: '51.8', mod_vmp: '43.4', mod_isc: '14.05', mod_imp: '13.25',
    mod_coef_voc: '-0.25', mod_noct: '45', mod_coef_pot: '-0.35',
    temp_min: '-5', temp_max: '40',
    pr_monto_pct: '0', pr_tasa: '0', pr_plazo: '60', pr_sistema: 'frances',
    pr_moneda: 'usd', pr_ajuste: '0', pr_gastos_pct: '0',
    ppa_tarifa: '0', ppa_plazo: '15', ppa_ajuste: '0', ppa_opcion: '0',
    opex_pct: '0.5', recambio_pct: '10', recambio_cada: '11', factor_co2: '0.45',
    incluirBateria: 'no', bat_kwh: '10', bat_usd_kwh: '450', bat_dod: '80', bat_tipo: 'litio',
    bat_ef: '92', bat_crate: '0.5', bat_vida: '12', bat_recambio_pct: '70',
    impData: JSON.stringify([{ nombre: 'Impuestos', pct: 10.5 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }]),
    genM: JSON.stringify(Calc.estimarGeneracion(11.5, 1820, 83)),
    conM: JSON.stringify([2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]),
    conEst: JSON.stringify([false, false, false, false, false, false, false, false, false, false, false, false]),
    genFuente: 'estimada', excModo: 'sin', tarifa_iny: '0', modeloAuto: 'horario',
    l_canon_kwp: '14', l_pago_ini: '7500', l_opcion: '2300', l_seguro: '790', l_mtto: '1700', l_plazo: '60',
    l_tasa_gan: '30', lGanancias: 'si', incluirRecambio: 'no',
  };

  // Opciones de ciudades argentinas para el selector
  const OPCIONES_CIUDADES = [['', '— Seleccionar región / ciudad —']].concat(
    Calc.CIUDADES_ARGENTINA.map(c => [c.id, `${c.nombre} (${c.irrad} kWh/m²)`])
  );

  // ---------- Definición declarativa de los formularios ----------
  const SECCIONES = [
    {
      titulo: 'Cliente y emplazamiento', cliente: true, campos: [
        { k: 'cliente_nombre', l: 'Cliente / Razón Social', t: 'text' },
        { k: 'ciudad_id', l: 'Región / Ciudad (Argentina)', t: 'select', o: OPCIONES_CIUDADES },
        { k: 'cliente_ubicacion', l: 'Ubicación específica', t: 'text' },
        { k: 'presu_cuit', l: 'CUIT', t: 'text' },
        { k: 'presu_numero', l: 'N° presupuesto / cotización', t: 'text' },
        { k: 'tipoInst', l: 'Tipo de instalación', t: 'select', o: [['chapa', 'Techo de chapa'], ['losa', 'Losa'], ['tierra', 'A tierra']] },
        { k: 'tipoSistema', l: 'Tipo de sistema / curva', t: 'select', o: [['residencial', 'Residencial'], ['comercial', 'Comercial Pyme'], ['industrial', 'Industrial']] },
        { k: 'presu_paneles', l: 'Cantidad de paneles', u: 'u.' },
        { k: 'panel_w', l: 'Potencia por panel', u: 'Wp' },
      ]
    },
    {
      titulo: 'Generación solar fotovoltaica', campos: [
        { k: 'kwp', l: 'Potencia instalada', u: 'kWp', step: 0.01 },
        { k: 'usd_kwp', l: 'Precio unitario solar', u: 'U$D/kWp', step: 0.01 },
        { k: 'tc', l: 'Tipo de cambio', u: '$/U$D' },
        { k: 'pr', l: 'Performance ratio (PR)', u: '%', step: 0.1 },
        { k: 'irrad', l: 'Irradiación anual (plano paneles)', u: 'kWh/m²', step: 0.1 },
        { k: 'deg', l: 'Degradación anual de paneles', u: '%/año', step: 0.1 },
        { k: 'factor_co2', l: 'Factor emisión CO₂ de red', u: 'kg CO₂/kWh', step: 0.01 },
        {
          k: 'modeloAuto', l: 'Modelo de autoconsumo', t: 'select', o: [
            ['horario', 'Horario · simulación 12 × 24 h (recomendado)'],
            ['mensual', 'Mensual · mín(generación, consumo) — versión anterior'],
          ]
        },
      ]
    },
    {
      titulo: 'Almacenamiento con baterías (BESS)', campos: [
        { k: 'incluirBateria', l: 'Almacenamiento con baterías', t: 'select', o: [['no', 'Sin baterías (On-Grid puro)'], ['si', 'Con banco de baterías (Híbrido / Backup)']] },
        { k: 'bat_tipo', l: 'Tecnología de batería', t: 'select', o: [['litio', 'Litio LFP (LiFePO4)'], ['gel', 'Gel / Plomo Ácido']] },
        { k: 'bat_kwh', l: 'Capacidad total de banco', u: 'kWh', step: 0.5 },
        { k: 'bat_usd_kwh', l: 'Costo unitario batería', u: 'U$D/kWh', step: 1 },
        { k: 'bat_dod', l: 'Profundidad de descarga (DoD)', u: '%', step: 1 },
        { k: 'bat_ef', l: 'Rendimiento ida y vuelta', u: '%', step: 0.5 },
        { k: 'bat_crate', l: 'Potencia máx. de carga / descarga', u: 'C', step: 0.1 },
        { k: 'bat_vida', l: 'Vida útil del banco', u: 'años' },
        { k: 'bat_recambio_pct', l: 'Costo del recambio del banco', u: '% del banco', step: 1 },
      ]
    },
    {
      titulo: 'Emplazamiento e irradiación', colapsable: true, acciones: 'irradiacion', campos: [
        {
          k: 'irrad_fuente', l: 'Fuente de irradiación', t: 'select', o: [
            ['tabla', 'Valor anual cargado a mano'],
            ['modelo', 'Calculada sobre el plano de los módulos'],
            ['nasa', 'Serie mensual de NASA POWER + plano'],
          ]
        },
        { k: 'lat', l: 'Latitud', u: '°', step: 0.01 },
        { k: 'lon', l: 'Longitud', u: '°', step: 0.01 },
        { k: 'inclinacion', l: 'Inclinación de los módulos', u: '°', step: 1 },
        { k: 'azimut', l: 'Azimut (0 = Norte, + al Oeste)', u: '°', step: 1 },
        { k: 'albedo', l: 'Albedo del entorno', u: '', step: 0.05 },
        {
          k: 'pr_fuente', l: 'Performance ratio', t: 'select', o: [
            ['manual', 'Cargado a mano'],
            ['calculado', 'Calculado desde el desglose de pérdidas'],
          ]
        },
      ]
    },
    {
      titulo: 'Tarifa eléctrica', impuestos: true, campos: [
        {
          k: 'tarifa_tipo', l: 'Estructura tarifaria', t: 'select', o: [
            ['simple', 'Precio único de la energía'],
            ['bandas', 'Bandas horarias (pico / valle / resto)'],
          ]
        },
        { k: 'tarifa_resto', l: 'Energía banda resto', u: '$/kWh', step: 0.01 },
        { k: 'tarifa_pico', l: 'Energía banda pico', u: '$/kWh', step: 0.01 },
        { k: 'tarifa_valle', l: 'Energía banda valle', u: '$/kWh', step: 0.01 },
        { k: 'banda_pico_desde', l: 'Pico desde', u: 'h' },
        { k: 'banda_pico_hasta', l: 'Pico hasta', u: 'h' },
        { k: 'banda_valle_desde', l: 'Valle desde', u: 'h' },
        { k: 'banda_valle_hasta', l: 'Valle hasta', u: 'h' },
        {
          k: 'iva_condicion', l: 'Condición frente al IVA', t: 'select', o: [
            ['cf', 'Consumidor final o monotributista (el IVA es costo)'],
            ['ri', 'Responsable inscripto (el IVA es crédito fiscal)'],
          ]
        },
        { k: 'iva_pct', l: 'Alícuota de IVA', u: '%', step: 0.5 },
        { k: 'cargo_fijo', l: 'Cargo fijo de la factura', u: '$/mes', step: 1 },
        { k: 'pot_contratada', l: 'Potencia contratada', u: 'kW', step: 1 },
        { k: 'cargo_pot', l: 'Cargo por potencia', u: '$/kW/mes', step: 1 },
        {
          k: 'reducePotencia', l: 'Renegociar la potencia contratada', t: 'select', o: [
            ['no', 'No (el solar no baja la potencia facturada)'],
            ['si', 'Sí, computar el ahorro por menor potencia'],
          ]
        },
        { k: 'excModo', l: 'Excedentes', t: 'select', o: [['sin', 'Sin remuneración'], ['iny', 'Inyección a red remunerada']] },
        { k: 'tarifa_iny', l: 'Tarifa de inyección', u: '$/kWh', step: 0.01 },
      ]
    },
    {
      titulo: 'Presupuesto por ítems (CAPEX)', colapsable: true, acciones: 'bom', campos: [],
    },
    {
      titulo: 'Inversor y cadenas de módulos', colapsable: true, campos: [
        { k: 'inv_potencia_ac', l: 'Potencia nominal del inversor', u: 'kW', step: 0.1 },
        { k: 'inv_v_max', l: 'Tensión máxima de entrada', u: 'V CC' },
        { k: 'inv_v_min', l: 'Tensión mínima de seguimiento', u: 'V CC' },
        { k: 'inv_v_arranque', l: 'Tensión de arranque', u: 'V CC' },
        { k: 'inv_mppt', l: 'Cantidad de entradas MPPT', u: 'u.' },
        { k: 'inv_i_max_mppt', l: 'Corriente máxima por MPPT', u: 'A', step: 0.1 },
        { k: 'mod_voc', l: 'Módulo: tensión de circuito abierto', u: 'V', step: 0.1 },
        { k: 'mod_vmp', l: 'Módulo: tensión de máxima potencia', u: 'V', step: 0.1 },
        { k: 'mod_isc', l: 'Módulo: corriente de cortocircuito', u: 'A', step: 0.01 },
        { k: 'mod_coef_voc', l: 'Coeficiente térmico de tensión', u: '%/°C', step: 0.01 },
        { k: 'mod_noct', l: 'Temperatura nominal de celda (NOCT)', u: '°C', step: 0.5 },
        { k: 'mod_coef_pot', l: 'Coeficiente térmico de potencia', u: '%/°C', step: 0.01 },
        { k: 'temp_min', l: 'Temperatura mínima de diseño', u: '°C', step: 1 },
        { k: 'temp_max', l: 'Temperatura máxima de diseño', u: '°C', step: 1 },
      ]
    },
    {
      titulo: 'Parámetros económicos', campos: [
        { k: 'inflacion', l: 'Aumento anual de tarifa (en $)', u: '%/año', step: 0.1 },
        { k: 'devaluacion', l: 'Devaluación anual esperada', u: '%/año', step: 0.1 },
        {
          k: 'moneda_analisis', l: 'Moneda de análisis', t: 'select', o: [
            ['usd', 'Dólares (U$D) — recomendado'],
            ['ars', 'Pesos ($) nominales'],
          ]
        },
        { k: 'horizonte', l: 'Horizonte de análisis', u: 'años' },
        { k: 'tasa_desc', l: 'Tasa de descuento (moneda de análisis)', u: '%', step: 0.1 },
        { k: 'opex_pct', l: 'OPEX anual', u: '% CAPEX', step: 0.1 },
        { k: 'incluirRecambio', l: 'Recambio de inversor', t: 'select', o: [['no', 'No incluir'], ['si', 'Incluir']] },
        { k: 'recambio_pct', l: 'Costo del recambio', u: '% CAPEX', step: 0.1 },
        { k: 'recambio_cada', l: 'Recambio cada', u: 'años' },
        {
          k: 'fiscal', l: 'Tratamiento de Ganancias', t: 'select', o: [
            ['simetrico', 'Simétrico: grava el ahorro, amortiza la compra y deduce el canon'],
            ['sin', 'No considerar Ganancias en ninguna opción'],
            ['legacy', 'Solo escudo del leasing (versión anterior)'],
          ]
        },
        { k: 'amort_anios', l: 'Amortización del equipo en', u: 'años' },
      ]
    },
    {
      titulo: 'Financiamiento por Leasing', campos: [
        { k: 'l_canon_kwp', l: 'Canon mensual', u: 'U$D/kWp', step: 0.1 },
        { k: 'l_plazo', l: 'Plazo', u: 'meses' },
        { k: 'l_pago_ini', l: 'Pago inicial', u: 'U$D' },
        { k: 'l_opcion', l: 'Opción de compra', u: 'U$D' },
        { k: 'l_seguro', l: 'Seguro anual', u: 'U$D/año' },
        { k: 'l_mtto', l: 'Mantenimiento anual', u: 'U$D/año' },
        { k: 'lGanancias', l: 'Deducible de Ganancias', t: 'select', o: [['si', 'Sí'], ['no', 'No']] },
        { k: 'l_tasa_gan', l: 'Alícuota Ganancias', u: '%', step: 0.1 },
      ]
    },
    {
      titulo: 'Préstamo bancario', colapsable: true, campos: [
        { k: 'pr_monto_pct', l: 'Porcentaje financiado', u: '% del CAPEX', step: 1 },
        {
          k: 'pr_moneda', l: 'Moneda del préstamo', t: 'select', o: [
            ['usd', 'Dólares'], ['ars', 'Pesos, tasa fija'], ['uva', 'Pesos ajustable por UVA'],
          ]
        },
        { k: 'pr_tasa', l: 'Tasa nominal anual', u: '%', step: 0.1 },
        { k: 'pr_plazo', l: 'Plazo', u: 'meses' },
        {
          k: 'pr_sistema', l: 'Sistema de amortización', t: 'select', o: [
            ['frances', 'Francés (cuota constante)'], ['aleman', 'Alemán (amortización constante)'],
          ]
        },
        { k: 'pr_ajuste', l: 'Ajuste anual del capital (UVA)', u: '%/año', step: 0.1 },
        { k: 'pr_gastos_pct', l: 'Gastos de otorgamiento', u: '% del monto', step: 0.1 },
      ]
    },
    {
      titulo: 'Contrato PPA', colapsable: true, campos: [
        { k: 'ppa_tarifa', l: 'Precio de la energía solar', u: 'U$D/kWh', step: 0.001 },
        { k: 'ppa_plazo', l: 'Plazo del contrato', u: 'años' },
        { k: 'ppa_ajuste', l: 'Ajuste anual del precio', u: '%/año', step: 0.1 },
        { k: 'ppa_opcion', l: 'Opción de compra al final', u: 'U$D' },
      ]
    },
  ];

  // ---------- Estado de la UI ----------
  const UI = {
    id: null,
    nombre: '', fecha: '', cliente_id: null, actualizado_en: null, legacy_id: null, creado_por: null,
    estado: null,
    dirty: false, tab: 'datos', filtro: '', res: null,
    proyectos: [], clientes: [], distribuidoras: [],
    compararSeleccionados: [],
    registro: false,
    monedaResultados: 'ARS',
    monedaLeasing: 'USD',
    modoDim: 'techo',
    asistenteAbierto: false,
    mes24h: null,          // null = día medio del año; 0-11 = mes concreto
    chequeos: [],
    chequeosAbierto: false,
    membrete: null,
    seccionesCerradas: {},   // titulo -> false significa abierta
    riesgo: null,
    tornado: null,
  };

  // =====================================================================
  //  Carga de datos
  // =====================================================================
  async function cargarTodo() {
    try {
      const [proy, cli, dist] = await Promise.all([DB.proyectos.list(), DB.clientes.list(), DB.distribuidoras.list()]);
      UI.proyectos = proy; UI.clientes = cli; UI.distribuidoras = dist;
    } catch (e) {
      alert('No se pudieron cargar los datos: ' + e.message);
      UI.proyectos = []; UI.clientes = []; UI.distribuidoras = DB.DISTRIBUIDORAS_DEFAULT;
    }
    renderLista();
  }

  // =====================================================================
  //  Lista de proyectos
  // =====================================================================
  function nombreCliente(id) { const c = UI.clientes.find(c => c.id === id); return c ? c.nombre : ''; }

  function renderLista() {
    const items = UI.proyectos;
    const f = UI.filtro.toLowerCase();
    const ul = $('#lista');
    $('#contador').textContent = items.length + (items.length === 1 ? ' proyecto' : ' proyectos') + (DB.modo === 'nube' ? ' · en la nube' : ' · en este navegador');
    if (!items.length) {
      ul.innerHTML = '<li class="vacio">No hay proyectos.<br><button class="btn btn-sm" id="btnEjemplos">Cargar ejemplos</button></li>';
      const be = $('#btnEjemplos');
      if (be) be.onclick = async () => { await DB.importJSON(JSON.stringify(window.EJEMPLO)); await cargarTodo(); toast('Ejemplos cargados'); };
      return;
    }
    const filtrados = items.filter(p => !f || (p.nombre + ' ' + p.resumen + ' ' + nombreCliente(p.cliente_id) + ' ' + (p.autor || '')).toLowerCase().includes(f));
    if (!filtrados.length) { ul.innerHTML = '<li class="vacio">Sin resultados para la búsqueda.</li>'; return; }
    ul.innerHTML = filtrados.map(p => `
      <li class="item ${p.id === UI.id ? 'activo' : ''}" data-id="${esc(p.id)}">
        <div class="item-nombre">${esc(p.nombre)}</div>
        <div class="item-resumen">${esc(p.resumen)}</div>
        <div class="item-fecha">${esc(p.fecha)}${p.autor ? ' · ' + esc(p.autor) : ''}</div>
      </li>`).join('');
    $$('#lista .item').forEach(li => li.onclick = () => abrir(li.dataset.id));
  }

  function confirmarDescartar() { return !UI.dirty || confirm('Hay cambios sin guardar. ¿Descartarlos?'); }

  function cargarEnUI(p) {
    UI.id = p.id; UI.nombre = p.nombre; UI.fecha = p.fecha || ''; UI.cliente_id = p.cliente_id || null;
    UI.actualizado_en = p.actualizado_en || null; UI.legacy_id = p.legacy_id || null; UI.creado_por = p.creado_por || null;
    UI.estado = Object.assign({}, DEFAULT_ESTADO, p.estado);
    UI.dirty = false;
    if (typeof UITecho3D !== 'undefined' && p.estado && p.estado.techo3d) {
      UITecho3D.cargarEstado(p.estado.techo3d);
    }
  }

  async function abrir(id) {
    if (id === UI.id) return;
    if (!confirmarDescartar()) return;
    let p = UI.proyectos.find(x => x.id === id);
    if (!p || !p.estado) { try { p = await DB.proyectos.get(id); } catch (e) { alert(e.message); return; } }
    if (!p) return;
    cargarEnUI(p);
    renderTodo();
    UIGestion.cargarRevisiones().then(() => {
      if (UI.tab === 'pipeline') UIGestion.renderRevisiones();
    });
  }

  function nuevo() {
    if (!confirmarDescartar()) return;
    UI.id = null; UI.nombre = 'Nuevo proyecto'; UI.fecha = ''; UI.cliente_id = null; UI.actualizado_en = null; UI.legacy_id = null; UI.creado_por = null;
    UI.estado = Object.assign({}, DEFAULT_ESTADO);
    UI.dirty = true; UI.tab = 'datos';
    renderTodo();
    $('#nombre').focus(); $('#nombre').select();
  }

  function cargarPlantilla(clave) {
    if (!clave || !Calc.PLANTILLAS[clave]) return;
    if (!confirmarDescartar()) return;
    const t = Calc.PLANTILLAS[clave];
    UI.id = null; UI.nombre = t.nombre; UI.fecha = ''; UI.cliente_id = null; UI.actualizado_en = null; UI.legacy_id = null; UI.creado_por = null;
    UI.estado = Object.assign({}, DEFAULT_ESTADO, t);
    UI.dirty = true; UI.tab = 'datos';
    renderTodo();
    toast('Plantilla "' + t.nombre + '" cargada');
  }

  async function guardar(force) {
    if (!UI.estado) return;
    if (!DB.puedeEditar()) { toast('Tu usuario es solo de lectura'); return; }
    if (typeof UITecho3D !== 'undefined' && typeof UITecho3D.guardarEstado === 'function') {
      const datosTecho = UITecho3D.guardarEstado();
      if (datosTecho && datosTecho.puntosPoligono && datosTecho.puntosPoligono.length >= 3) {
        UI.estado.techo3d = datosTecho;
      }
    }
    const nombre = $('#nombre').value.trim() || UI.estado.cliente_nombre || 'Sin nombre';
    const btn = $('#btnGuardar'); btn.disabled = true;
    try {
      const guardado = await DB.proyectos.save(
        { id: UI.id, nombre, cliente_id: UI.cliente_id, estado: UI.estado, actualizado_en: UI.actualizado_en, legacy_id: UI.legacy_id },
        { force: !!force });
      UI.id = guardado.id; UI.nombre = guardado.nombre; UI.fecha = guardado.fecha; UI.actualizado_en = guardado.actualizado_en || null;
      UI.creado_por = guardado.creado_por || UI.creado_por; UI.dirty = false;
      await cargarTodo(); renderBarra();
      toast('Proyecto guardado');
    } catch (e) {
      if (e instanceof DB.ConflictError) {
        const a = e.actual;
        if (confirm('Otro usuario guardó este proyecto el ' + a.fecha + '.\n\n¿Sobrescribir con tu versión? (Cancelar = recargar la de ellos y perder tus cambios)')) {
          btn.disabled = false; return guardar(true);
        }
        cargarEnUI(a); renderTodo(); toast('Se recargó la versión más reciente');
      } else alert('No se pudo guardar: ' + e.message);
    } finally { btn.disabled = false; }
  }

  async function duplicar() {
    if (!UI.estado) return;
    if (!DB.puedeEditar()) { toast('Tu usuario es solo de lectura'); return; }
    const nombre = (UI.nombre || 'Proyecto') + ' (copia)';
    try {
      const g = await DB.proyectos.save({ nombre, cliente_id: UI.cliente_id, estado: UI.estado });
      UI.id = g.id; UI.nombre = nombre; UI.fecha = g.fecha; UI.actualizado_en = g.actualizado_en || null; UI.legacy_id = null; UI.creado_por = g.creado_por || null; UI.dirty = false;
      await cargarTodo(); renderBarra();
      toast('Copia creada');
    } catch (e) { alert('No se pudo duplicar: ' + e.message); }
  }

  async function eliminar() {
    if (!UI.id) return;
    if (!confirm('Mandar "' + UI.nombre + '" a la papelera.\n\nVas a poder restaurarlo desde la pestaña Pipeline. ¿Seguir?')) return;
    try {
      await DB.proyectos.remove(UI.id);
      UI.id = null; UI.estado = null; UI.dirty = false;
      await cargarTodo(); renderTodo();
      toast('Proyecto enviado a la papelera');
    } catch (e) { alert('No se pudo eliminar: ' + e.message); }
  }

  function descargar(nombre, texto) {
    const blob = new Blob([texto], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const stamp = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); };

  async function exportarTodo() { descargar('proyectos_' + stamp() + '.json', await DB.exportJSON()); }
  async function exportarUno() {
    if (!UI.id) { toast('Guardá el proyecto antes de exportarlo'); return; }
    descargar((UI.nombre || 'proyecto').replace(/[^\w\-]+/g, '_') + '.json', await DB.exportJSON([UI.id]));
  }
  function importar(file) {
    const r = new FileReader();
    r.onload = async () => {
      try { const n = await DB.importJSON(r.result); await cargarTodo(); toast(n + ' proyecto(s) importado(s)'); }
      catch (e) { alert('No se pudo importar: ' + e.message); }
    };
    r.readAsText(file);
  }

  async function migrar() {
    const n = DB.localPendientes();
    if (!n) { toast('No hay proyectos locales para subir'); return; }
    if (!confirm('Se van a subir ' + n + ' proyecto(s) guardados en este navegador a la base de datos compartida. Los que ya fueron subidos se omiten. ¿Continuar?')) return;
    $('#btnMigrar').disabled = true;
    try {
      const r = await DB.migrarLocal();
      await cargarTodo();
      toast(r.subidos + ' subido(s), ' + r.omitidos + ' ya existían');
    } catch (e) { alert('Error al subir: ' + e.message); }
    finally { $('#btnMigrar').disabled = false; }
  }

  // =====================================================================
  //  Exportar Flujo a Excel (CSV)
  // =====================================================================
  function exportarFlujoCSV() {
    if (!UI.res) { toast('Cargá o guardá el proyecto para exportar'); return; }
    const r = UI.res, p = r.p;
    let csv = '\uFEFF'; // UTF-8 BOM para Excel
    csv += `"PROYECTO";"${(UI.nombre || 'Proyecto').replace(/"/g, '""')}"\n`;
    csv += `"CLIENTE";"${(p.cliente_nombre || '').replace(/"/g, '""')}"\n`;
    csv += `"POTENCIA (kWp)";"${fmtN(p.kwp, 2)}"\n`;
    csv += `"INVERSION TOTAL (U$D)";"${fmtN(r.capexUSD, 2)}"\n`;
    csv += `"TIPO DE CAMBIO ($/USD)";"${fmtN(p.tc, 2)}"\n`;
    csv += `"VAN ARS";"${fmtN(r.van, 0)}"\n`;
    csv += `"VAN USD";"${fmtN(r.vanUSD, 2)}"\n`;
    csv += `"TIR";"${r.tir ? fmtN(r.tir * 100, 2) + '%' : '—'}"\n`;
    csv += `"PAYBACK SIMPLE";"${fmtAnios(r.payback)}"\n`;
    csv += `"MODELO DE AUTOCONSUMO";"${p.modeloAuto === 'mensual' ? 'Mensual (version anterior)' : 'Horario 12x24'}"\n`;
    csv += `"COBERTURA DEL CONSUMO";"${fmtPct(r.coberturaPct)}"\n`;
    csv += `"EXCEDENTE VERTIDO (kWh/año)";"${fmtN(r.excAnual)}"\n\n`;

    csv += `"Año";"Generación (kWh)";"Ahorro ($)";"OPEX ($)";"Recambio inversor ($)";"Recambio baterías ($)";"Flujo Neto ($)";"Acumulado ($)";"Acum. Descontado ($)"\n`;
    csv += `0;;;;;;${-r.capexARS};${-r.capexARS};${-r.capexARS}\n`;
    r.anios.forEach(a => {
      csv += `${a.anio};${Math.round(a.gen)};${Math.round(a.ahorro)};${Math.round(a.opex)};${Math.round(a.recambioInv)};${Math.round(a.recambioBat)};${Math.round(a.flujo)};${Math.round(a.acum)};${Math.round(a.acumDesc)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (UI.nombre || 'Flujo_Caja_FV').replace(/[^\w\-]+/g, '_') + '_flujo.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Flujo de caja exportado a CSV');
  }

  // =====================================================================
  //  Render principal
  // =====================================================================
  function renderTodo() {
    renderLista();
    renderBarra();
    const main = $('#main');
    if (!UI.estado) { main.classList.add('sin-proyecto'); return; }
    main.classList.remove('sin-proyecto');
    renderTabs();
    renderDatos();
    recalcular();
    renderComparador();
  }

  function renderBarra() {
    $('#nombre').value = UI.nombre || '';
    $('#fecha').textContent = UI.fecha ? 'Guardado: ' + UI.fecha : 'Sin guardar';
    $('#dirty').hidden = !UI.dirty;
    const puede = DB.puedeEditar();
    const u = DB.usuario();
    const propio = !UI.id || !UI.creado_por || (u && (u.rol === 'admin' || u.id === UI.creado_por));
    $('#btnGuardar').disabled = !puede || !propio;
    $('#btnDuplicar').disabled = !puede;
    $('#btnEliminar').disabled = !UI.id || !puede || !propio;
    $('#btnGuardar').title = !puede ? 'Usuario solo lectura' : !propio ? 'Solo el autor o un admin pueden editar; usá Duplicar' : 'Guardar (Ctrl+S)';
    document.title = (UI.nombre ? UI.nombre + ' · ' : '') + 'Simulador FV';
  }

  function renderUsuario() {
    const u = DB.usuario();
    const el = $('#usuario');
    if (DB.modo === 'local') {
      el.innerHTML = '<span class="chip">Modo local</span>' + (DB.errorInit ? ' <span class="hint" title="' + esc(DB.errorInit) + '">sin conexión a la nube</span>' : '');
      $('#btnLogout').hidden = true; $('#btnMigrar').hidden = true;
      return;
    }
    el.innerHTML = u ? `<span class="chip chip-nube">☁ nube</span> <b>${esc(u.nombre)}</b> <span class="hint">${esc(u.rol)}</span>` : '';
    $('#btnLogout').hidden = !u;
    $('#btnMigrar').hidden = !u || !DB.puedeEditar() || DB.localPendientes() === 0;
  }

  function marcarDirty() { if (!UI.dirty) { UI.dirty = true; $('#dirty').hidden = false; } }

  function renderTabs() {
    $$('.tab').forEach(b => b.classList.toggle('activa', b.dataset.tab === UI.tab));
    $$('.pane').forEach(p => p.classList.toggle('activa', p.id === 'pane-' + UI.tab));
    renderPaneActiva();
  }

  // ---------- Formulario de datos ----------
  function renderDatos() {
    const e = UI.estado;
    const html = SECCIONES.map((sec, i) => {
      const cerrada = sec.colapsable && UI.seccionesCerradas[sec.titulo] !== false;
      return `
      <fieldset class="seccion ${sec.colapsable ? 'seccion-colapsable' : ''} ${cerrada ? 'cerrada' : ''}" data-sec="${i}">
        <legend ${sec.colapsable ? 'data-toggle-sec="' + i + '" role="button" tabindex="0"' : ''}>
          ${sec.colapsable ? `<span class="seccion-flecha">${cerrada ? '▶' : '▼'}</span> ` : ''}${sec.titulo}
        </legend>
        <div class="seccion-cuerpo" ${cerrada ? 'hidden' : ''}>
          ${sec.cliente ? clienteHTML() : ''}
          ${sec.acciones === 'irradiacion' ? accionesIrradiacionHTML() : ''}
          ${sec.acciones === 'bom' ? UIGestion.bomHTML(e) : ''}
          <div class="grid">
            ${sec.campos.map(c => campoHTML(c, e[c.k])).join('')}
          </div>
          ${sec.impuestos ? impuestosHTML(e.impData) : ''}
        </div>
      </fieldset>`;
    }).join('');
    $('#form-datos').innerHTML = html;

    $$('#form-datos [data-k]').forEach(el => {
      el.addEventListener('input', onCampo);
      el.addEventListener('change', onCampo);
    });
    $$('#form-datos [data-imp]').forEach(el => el.addEventListener('input', onImpuesto));
    $$('#form-datos [data-toggle-sec]').forEach(el => {
      const alternar = () => {
        const sec = SECCIONES[+el.dataset.toggleSec];
        UI.seccionesCerradas[sec.titulo] = UI.seccionesCerradas[sec.titulo] === false;
        renderDatos();
      };
      el.onclick = alternar;
      el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } };
    });
    const sc = $('#selCliente'); if (sc) sc.onchange = onSelCliente;
    const bc = $('#btnGuardarCliente'); if (bc) bc.onclick = guardarCliente;
    const sd = $('#selDistribuidora'); if (sd) sd.onchange = onSelDistribuidora;
    conectarAccionesIrradiacion();
    UIGestion.conectarBom();
    actualizarHintsNum();
  }

  /**
   * Cambia un campo del estado desde un módulo externo y refresca la pantalla.
   * El segundo argumento permite tocar varios campos de una sola vez.
   */
  function setCampo(clave, valor, extra) {
    if (!UI.estado) return;
    UI.estado[clave] = valor;
    if (extra) Object.keys(extra).forEach(k => { UI.estado[k] = extra[k]; });
    marcarDirty();
    renderDatos();
    recalcular();
  }

  /** Carga un estado completo en el formulario, sin guardarlo. */
  function cargarEstadoExterno(estado) {
    UI.estado = Object.assign({}, DEFAULT_ESTADO, estado);
    UI.dirty = true;
    UI.tab = 'datos';
    renderTabs();
    renderDatos();
    recalcular();
    renderBarra();
  }

  // ---------- Irradiación: datos satelitales e inclinación óptima ----------
  function accionesIrradiacionHTML() {
    return `<div class="acciones-seccion">
      <button type="button" class="btn btn-sm btn-primario" id="btnNasa">🛰 Traer irradiación de NASA POWER</button>
      <button type="button" class="btn btn-sm" id="btnInclinacionOptima">📐 Aplicar inclinación óptima</button>
      <button type="button" class="btn btn-sm" id="btnAplicarIrrad">⚡ Usar esta irradiación en el proyecto</button>
      <span class="hint" id="estadoNasa"></span>
    </div><div id="resumen-irrad">${resumenIrradiacionHTML()}</div>`;
  }

  function resumenIrradiacionHTML() {
    const irr = UI.res && UI.res.irradiacion;
    if (!irr) {
      return '<p class="hint">Con la fuente en «valor anual cargado a mano» el simulador no calcula la geometría del ' +
        'emplazamiento. Elegí una de las otras dos opciones para que la irradiación salga de la posición real del sol ' +
        'sobre tus módulos.</p>';
    }
    const ktMedio = irr.kt.reduce((s, x) => s + x, 0) / 12;
    return `<div class="asistente-resultados">
      <div class="asistente-kpi"><span class="asistente-kpi-val">${fmtN(irr.anualHorizontal)} kWh/m²</span><span class="asistente-kpi-lbl">Horizontal, año</span></div>
      <div class="asistente-kpi"><span class="asistente-kpi-val">${fmtN(irr.anualPlano)} kWh/m²</span><span class="asistente-kpi-lbl">Sobre el plano, año</span></div>
      <div class="asistente-kpi"><span class="asistente-kpi-val">${fmtPct((irr.ganancia - 1) * 100)}</span><span class="asistente-kpi-lbl">Ganancia por inclinación</span></div>
      <div class="asistente-kpi"><span class="asistente-kpi-val">${fmtN(ktMedio, 2)}</span><span class="asistente-kpi-lbl">Índice de claridad medio</span></div>
    </div>`;
  }

  /**
   * Refresca solo el resumen de irradiación, sin volver a dibujar el formulario:
   * si se redibujara entero, el campo que el usuario está escribiendo perdería el foco.
   */
  function refrescarResumenIrradiacion() {
    const cont = $('#resumen-irrad');
    if (cont) cont.innerHTML = resumenIrradiacionHTML();
  }

  function conectarAccionesIrradiacion() {
    const bn = $('#btnNasa');
    if (bn) bn.onclick = traerIrradiacionNasa;
    const bo = $('#btnInclinacionOptima');
    if (bo) bo.onclick = aplicarInclinacionOptima;
    const ba = $('#btnAplicarIrrad');
    if (ba) ba.onclick = aplicarIrradiacionCalculada;
  }

  async function traerIrradiacionNasa() {
    const p = Calc.normalizar(UI.estado);
    const est = $('#estadoNasa');
    const btn = $('#btnNasa');
    if (est) est.textContent = 'Consultando el satélite…';
    if (btn) btn.disabled = true;
    try {
      const d = await Calc.Solar.traerNasaPower(p.lat, p.lon);
      UI.estado.irrad_mensual_horiz = JSON.stringify(d.diariaHorizontal.map(x => +x.toFixed(4)));
      UI.estado.temp_mensual = JSON.stringify(d.tempMensual.map(x => +x.toFixed(2)));
      UI.estado.irrad_fuente = 'nasa';
      marcarDirty();
      renderDatos();
      recalcular();
      const anual = d.diariaHorizontal.reduce((s, x, m) => s + x * Calc.DIAS_MES[m], 0);
      toast('Irradiación de NASA POWER cargada: ' + fmtN(anual) + ' kWh/m² horizontales al año');
    } catch (err) {
      if (est) est.textContent = 'No se pudo consultar: ' + err.message;
      alert('No se pudo traer la irradiación satelital.\n\n' + err.message +
        '\n\nRevisá la conexión. El proyecto sigue funcionando con el modelo geométrico y el valor de tabla.');
    } finally { if (btn) btn.disabled = false; }
  }

  function aplicarInclinacionOptima() {
    const p = Calc.normalizar(UI.estado);
    const serie = p.irrad_mensual_horiz.some(x => x > 0) ? p.irrad_mensual_horiz : null;
    const base = { lat: p.lat, lon: p.lon, azimut: p.azimut, albedo: p.albedo, inclinacion: p.inclinacion };
    if (serie) base.diariaHorizontal = serie; else base.anualHorizontal = p.irrad;
    const opt = Calc.Solar.inclinacionOptima(base);
    UI.estado.inclinacion = String(opt.inclinacion);
    marcarDirty();
    renderDatos();
    recalcular();
    toast('Inclinación óptima ' + opt.inclinacion + '°: ' + fmtPct(opt.perdidaPct) + ' más que con la inclinación anterior');
  }

  function aplicarIrradiacionCalculada() {
    const r = UI.res;
    if (!r || !r.irradiacion) { toast('Elegí primero una fuente de irradiación calculada'); return; }
    const irr = r.irradiacion;
    UI.estado.irrad = String(Math.round(irr.anualPlano));
    // La generación mensual pasa a seguir la forma real del recurso en el sitio
    const p = Calc.normalizar(UI.estado);
    UI.estado.genM = JSON.stringify(irr.perfilMensual.map(f => Math.round(p.kwp * irr.anualPlano * (p.pr / 100) * f)));
    UI.estado.genFuente = 'estimada';
    marcarDirty();
    renderDatos();
    recalcular();
    toast('Irradiación y generación mensual actualizadas desde el modelo del sitio');
  }

  function clienteHTML() {
    const ops = UI.clientes.map(c => `<option value="${esc(c.id)}" ${c.id === UI.cliente_id ? 'selected' : ''}>${esc(c.nombre)}${c.cuit ? ' · ' + esc(c.cuit) : ''}</option>`).join('');
    const vinculado = UI.clientes.find(c => c.id === UI.cliente_id);
    return `<div class="fila-cliente">
      <label class="campo"><span class="etiqueta">Cliente registrado</span>
        <select id="selCliente"><option value="">— Elegir de la lista —</option>${ops}</select></label>
      <button class="btn btn-sm" type="button" id="btnGuardarCliente" ${DB.puedeEditar() ? '' : 'disabled'}>${vinculado ? 'Actualizar datos del cliente' : 'Registrar como cliente nuevo'}</button>
      <span class="hint">${vinculado ? 'Vinculado a "' + esc(vinculado.nombre) + '". Los proyectos del mismo cliente se agrupan en la búsqueda.' : 'Elegí un cliente existente o completá los datos y registralo.'}</span>
    </div>`;
  }

  function onSelCliente(ev) {
    const id = ev.target.value || null;
    UI.cliente_id = id;
    const c = UI.clientes.find(c => c.id === id);
    if (c) {
      UI.estado.cliente_nombre = c.nombre || '';
      UI.estado.cliente_ubicacion = c.ubicacion || '';
      UI.estado.presu_cuit = c.cuit || '';
      ['cliente_nombre', 'cliente_ubicacion', 'presu_cuit'].forEach(k => { const el = $('#f_' + k); if (el) el.value = UI.estado[k]; });
      if (!UI.id && (!$('#nombre').value || $('#nombre').value === 'Nuevo proyecto')) { $('#nombre').value = c.nombre; UI.nombre = c.nombre; }
    }
    marcarDirty(); recalcular();
    renderDatos();
  }

  async function guardarCliente() {
    const nombre = (UI.estado.cliente_nombre || '').trim();
    if (!nombre) { toast('Completá el nombre del cliente'); return; }
    try {
      const c = await DB.clientes.save({ id: UI.cliente_id || undefined, nombre, cuit: UI.estado.presu_cuit, ubicacion: UI.estado.cliente_ubicacion });
      UI.cliente_id = c.id;
      UI.clientes = await DB.clientes.list();
      marcarDirty(); renderDatos();
      toast('Cliente guardado');
    } catch (e) { alert('No se pudo guardar el cliente: ' + e.message); }
  }

  function campoHTML(c, v) {
    const id = 'f_' + c.k;
    let input, extra = '';
    if (c.t === 'select') {
      input = `<select id="${id}" data-k="${c.k}">${c.o.map(([val, lab]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    } else if (c.t === 'text') {
      input = `<input id="${id}" type="text" data-k="${c.k}" value="${esc(v)}">`;
    } else {
      input = `<div class="con-unidad"><input id="${id}" type="text" inputmode="decimal" data-k="${c.k}" value="${esc(v)}">${c.u ? `<span class="unidad">${c.u}</span>` : ''}</div>`;
      extra = `<small class="campo-hint" id="h_${c.k}"></small>`;
    }
    return `<label class="campo" for="${id}"><span class="etiqueta">${c.l}</span>${input}${extra}</label>`;
  }

  /**
   * Muestra debajo del campo el número que el motor realmente interpretó.
   * Solo aparece cuando el texto lleva coma o punto, que es donde la lectura puede sorprender
   * (en es-AR "1.500" son mil quinientos, no uno coma cinco).
   */
  function actualizarHintNum(k, crudo) {
    const el = document.getElementById('h_' + k);
    if (!el) return;
    const s = String(crudo === undefined ? (UI.estado ? UI.estado[k] : '') : crudo);
    if (!/[.,]/.test(s)) { el.textContent = ''; el.classList.remove('visible'); return; }
    el.textContent = '= ' + Calc.num(s).toLocaleString('es-AR', { maximumFractionDigits: 4 });
    el.classList.add('visible');
  }

  function actualizarHintsNum() {
    SECCIONES.forEach(sec => sec.campos.forEach(c => { if (!c.t) actualizarHintNum(c.k); }));
  }

  function impuestosHTML(impData) {
    const imps = Calc.parseImpuestos(impData);
    const ops = UI.distribuidoras.map(d => `<option value="${esc(d.id)}">${esc(d.nombre)}</option>`).join('');
    return `<div class="impuestos">
      <div class="sub-titulo">Impuestos y tasas sobre la tarifa <span class="hint">(% sobre la energía; se suman)</span></div>
      <div class="fila-acciones">
        <label class="campo campo-inline"><span class="etiqueta">Cargar preset de distribuidora</span>
          <select id="selDistribuidora"><option value="">— Elegir —</option>${ops}</select></label>
      </div>
      <table class="tabla tabla-imp">
        <thead><tr><th>#</th><th>Concepto</th><th>%</th></tr></thead>
        <tbody>${imps.map((it, i) => `<tr>
          <td>${i + 1}</td>
          <td><input type="text" data-imp="nombre" data-i="${i}" value="${esc(it.nombre)}" placeholder="Nombre del impuesto / tasa"></td>
          <td><input type="text" inputmode="decimal" class="num" data-imp="pct" data-i="${i}" value="${esc(it.pct)}"></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td></td><td>Total</td><td id="impTotal" class="num"></td></tr></tfoot>
      </table>
    </div>`;
  }

  function onSelDistribuidora(ev) {
    const d = UI.distribuidoras.find(d => String(d.id) === ev.target.value);
    if (!d) return;
    const imps = Calc.parseImpuestos(JSON.stringify(d.impuestos));
    UI.estado.impData = JSON.stringify(imps);
    marcarDirty(); renderDatos(); recalcular();
    toast('Impuestos de ' + d.nombre + ' aplicados');
  }

  function onCampo(ev) {
    const el = ev.target, k = el.dataset.k;
    UI.estado[k] = el.value;
    marcarDirty();
    actualizarHintNum(k, el.value);

    // Si seleccionó una ciudad argentina, actualizar irradiación y ubicación automáticamente
    if (k === 'ciudad_id' && el.value) {
      const c = Calc.CIUDADES_ARGENTINA.find(x => x.id === el.value);
      if (c) {
        UI.estado.irrad = String(c.irrad);
        if (!UI.estado.cliente_ubicacion) UI.estado.cliente_ubicacion = c.nombre;
        const irradEl = $('#f_irrad'); if (irradEl) irradEl.value = c.irrad;
        const ubicEl = $('#f_cliente_ubicacion'); if (ubicEl && !ubicEl.value) ubicEl.value = c.nombre;
        if (UI.estado.genFuente === 'estimada') {
          const p = Calc.normalizar(UI.estado);
          UI.estado.genM = JSON.stringify(Calc.estimarGeneracion(p.kwp, p.irrad, p.pr));
        }
      }
    }

    if (k === 'presu_paneles' || k === 'panel_w') {
      const n = Calc.num(UI.estado.presu_paneles), w = Calc.num(UI.estado.panel_w);
      if (n > 0 && w > 0) {
        UI.estado.kwp = (n * w / 1000).toFixed(2).replace(/\.?0+$/, '');
        const kEl = $('#f_kwp'); if (kEl) kEl.value = UI.estado.kwp;
        if (UI.estado.genFuente === 'estimada') {
          const p = Calc.normalizar(UI.estado);
          UI.estado.genM = JSON.stringify(Calc.estimarGeneracion(p.kwp, p.irrad, p.pr));
        }
      }
    }

    if (k === 'cliente_nombre' && !UI.id && (!$('#nombre').value || $('#nombre').value === 'Nuevo proyecto')) {
      $('#nombre').value = el.value; UI.nombre = el.value;
    }

    recalcularDiferido();
  }

  function onImpuesto(ev) {
    const el = ev.target, i = +el.dataset.i, campo = el.dataset.imp;
    const imps = Calc.parseImpuestos(UI.estado.impData);
    if (campo === 'nombre') imps[i].nombre = el.value;
    else imps[i].pct = Calc.num(el.value);
    UI.estado.impData = JSON.stringify(imps);
    marcarDirty();
    recalcularDiferido();
  }

  // ---------- Energía mensual & Ambiental ----------
  function kpisEnergia(r) {
    const items = [
      ['Generación anual', fmtN(r.genAnual) + ' kWh', fmtN(r.genEspecifica) + ' kWh/kWp · año 1'],
      ['Consumo anual', fmtN(r.conAnual) + ' kWh', 'demanda del cliente'],
      ['Cobertura solar', fmtPct(r.coberturaPct), 'autoconsumo / consumo'],
      ['Aprovechamiento', fmtPct(r.aprovechamientoPct), 'autoconsumo / generación'],
      ['Excedente anual', fmtN(r.excAnual) + ' kWh', r.p.excModo === 'iny' ? 'inyectado a ' + fmtN(r.tarifaIny, 2) + ' $/kWh' : 'sin remuneración'],
      ['CO₂ evitado año 1', fmtN(r.co2AnualTon, 1) + ' t CO₂', fmtN(r.co2TotalTon, 0) + ' t en ' + r.p.horizonte + ' años', 'ambiental'],
      ['Árboles equivalentes', fmtN(r.arbolesEq) + ' árboles', 'absorción anual equivalente', 'ambiental'],
      ['Km auto no emitidos', fmtN(r.kmAutoEq) + ' km', 'equivalente nafta / año', 'ambiental'],
    ];

    if (r.p.incluirBateria) {
      items.push([
        'Banco de Baterías',
        fmtN(r.p.bat_kwh, 1) + ' kWh (' + esc(r.p.bat_tipo.toUpperCase()) + ')',
        'Útil: ' + fmtN(r.capUtilBat, 1) + ' kWh · Autonomía: ' + fmtN(r.autonomiaHoras, 1) + ' hs',
        'bateria'
      ]);
      items.push([
        'Aporte de las baterías',
        fmtN(r.autoBatAnual) + ' kWh/año',
        r.p.modeloAuto === 'mensual'
          ? 'el modelo mensual no simula el ciclado'
          : fmtARS(r.ahorroBateriaAnual) + '/año de excedente recuperado',
        'bateria'
      ]);
    }

    return kpis(items);
  }

  function renderEnergia(r) {
    const p = r.p;
    const filas = r.meses.map((m, i) => `<tr>
      <td class="mes">${m}</td>
      <td><input type="text" inputmode="decimal" class="num" data-gen="${i}" value="${esc(p.genM[i])}"></td>
      <td><input type="text" inputmode="decimal" class="num" data-con="${i}" value="${esc(p.conM[i])}"></td>
      <td class="centro"><input type="checkbox" data-est="${i}" ${p.conEst[i] ? 'checked' : ''} title="Consumo estimado (sin factura)"></td>
      <td class="num">${fmtN(r.auto[i])}</td>
      <td class="num">${fmtN(r.exc[i])}</td>
      <td class="num">${fmtN(r.red[i])}</td>
      <td class="num">${fmtARS(r.ahorroMensual[i])}</td>
    </tr>`).join('');
    $('#tabla-energia').innerHTML = `
      <thead><tr>
        <th>Mes</th><th>Generación<br><small>kWh</small></th><th>Consumo<br><small>kWh</small></th><th>Est.</th>
        <th>Autoconsumo<br><small>kWh</small></th><th>Excedente<br><small>kWh</small></th><th>De red<br><small>kWh</small></th><th>Ahorro<br><small>$ (año 1)</small></th>
      </tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr>
        <td>Total</td><td class="num">${fmtN(r.genAnual)}</td><td class="num">${fmtN(r.conAnual)}</td><td></td>
        <td class="num">${fmtN(r.autoAnual)}</td><td class="num">${fmtN(r.excAnual)}</td><td class="num">${fmtN(r.conAnual - r.autoAnual)}</td><td class="num">${fmtARS(r.ahorroAnual1)}</td>
      </tr></tfoot>`;

    $$('#tabla-energia [data-gen]').forEach(el => el.addEventListener('input', () => setMes('genM', +el.dataset.gen, el.value, 'manual')));
    $$('#tabla-energia [data-con]').forEach(el => el.addEventListener('input', () => setMes('conM', +el.dataset.con, el.value)));
    $$('#tabla-energia [data-est]').forEach(el => el.addEventListener('change', () => {
      const a = Calc.arr(UI.estado.conEst, 12, false); a[+el.dataset.est] = el.checked;
      UI.estado.conEst = JSON.stringify(a); marcarDirty();
    }));
    renderEnergiaResumen(r);
    renderDesglosePerdidas(r);
    renderChart24h();
  }

  function renderEnergiaResumen(r) {
    const p = r.p;
    $('#kpi-energia').innerHTML = kpisEnergia(r);
    renderAvisoModelo(r);
    const estimada = Calc.estimarGeneracion(p.kwp, p.irrad, p.pr).reduce((s, x) => s + x, 0);
    const desvio = estimada > 0 ? (r.genAnual / estimada - 1) * 100 : 0;
    $('#gen-estimada').textContent = 'Estimación por kWp × irradiación × PR: ' + fmtN(estimada) + ' kWh/año' +
      (Math.abs(desvio) > 15 && r.genAnual > 0 ? ' · ⚠ la generación cargada difiere ' + fmtPct(desvio, 0) : '');
    barChart($('#chart-energia'), r.meses, [
      { nombre: 'Generación', valores: r.gen, color: 'var(--c-gen)' },
      { nombre: 'Consumo', valores: r.con, color: 'var(--c-con)' },
    ], 'kWh');
  }

  /** Explica con qué modelo se calculó el autoconsumo y avisa si es el anterior. */
  function renderAvisoModelo(r) {
    const el = $('#aviso-modelo');
    if (!el) return;
    if (r.p.modeloAuto === 'mensual') {
      el.className = 'aviso aviso-atencion';
      el.innerHTML = '<b>Modelo mensual (versión anterior).</b> El autoconsumo se toma como mín(generación, consumo) de cada mes, ' +
        'lo que supone que toda la energía del mediodía encuentra demanda simultánea y sobreestima el ahorro. ' +
        'Las baterías suman costo pero no aportan energía. Sirve para reproducir propuestas ya entregadas: ' +
        'para cotizaciones nuevas usá el modelo horario en la pestaña Datos.';
    } else {
      el.className = 'aviso aviso-ok';
      el.innerHTML = '<b>Modelo horario.</b> El autoconsumo sale de simular los 12 meses hora por hora: posición solar real ' +
        'según latitud y longitud, curva de demanda ' + esc(r.p.tipoSistema) + ' y despacho del banco de baterías. ' +
        'Cobertura del consumo <b>' + fmtPct(r.coberturaPct) + '</b> · aprovechamiento de la generación <b>' + fmtPct(r.aprovechamientoPct) + '</b>' +
        ' · excedente vertido <b>' + fmtN(r.excAnual) + ' kWh/año</b>.';
    }
  }

  function renderEnergiaSinInputs(r) {
    $$('#tabla-energia tbody tr').forEach((tr, i) => {
      const tds = tr.querySelectorAll('td');
      tds[4].textContent = fmtN(r.auto[i]); tds[5].textContent = fmtN(r.exc[i]);
      tds[6].textContent = fmtN(r.red[i]); tds[7].textContent = fmtARS(r.ahorroMensual[i]);
    });
    const tf = $$('#tabla-energia tfoot td');
    if (tf.length) {
      tf[1].textContent = fmtN(r.genAnual); tf[2].textContent = fmtN(r.conAnual);
      tf[4].textContent = fmtN(r.autoAnual); tf[5].textContent = fmtN(r.excAnual);
      tf[6].textContent = fmtN(r.conAnual - r.autoAnual); tf[7].textContent = fmtARS(r.ahorroAnual1);
    }
    renderEnergiaResumen(r);
    renderDesglosePerdidas(r);
    renderChart24h();
  }

  // ---------- Desglose de Pérdidas Técnicas ----------
  function renderDesglosePerdidas(r) {
    const cont = $('#cont-desglose-perdidas');
    if (!cont) return;
    const p = r.p;
    const data = Calc.desglosePerdidas(p);

    const cardsHtml = data.perdidas.map(it => `
      <div class="perdida-card">
        <div class="perdida-header">
          <span>${esc(it.concepto)}</span>
          <span class="perdida-val">−${fmtN(it.pct, 1)}%</span>
        </div>
        <div class="perdida-desc">${esc(it.desc)}</div>
        <div class="perdida-barra-cont">
          <div class="perdida-barra-fill" style="width: ${Math.min(100, it.pct * 10)}%;"></div>
        </div>
      </div>
    `).join('');

    cont.innerHTML = `
      <div class="perdidas-grid">${cardsHtml}</div>
      <div class="resumen-pr-banner">
        <div>
          <strong style="font-size: 14.5px; color: var(--primario);">Performance Ratio Global (PR): ${data.prCalculadoPct}%</strong>
          <div style="font-size: 12px; color: var(--texto-2); margin-top: 2px;">Pérdidas acumuladas en cadena de conversión: <b>−${data.perdidaTotalPct}%</b></div>
        </div>
        <div style="text-align: right;">
          <span class="badge-tag" style="font-size: 11.5px; padding: 4px 10px;">MONTAJE: ${esc(p.tipoInst.toUpperCase())}</span>
        </div>
      </div>
    `;
  }

  // ---------- Gráfico de 24 Horas ----------
  function renderChart24h() {
    const cont = $('#chart-24h');
    if (!cont || !UI.estado) return;
    const p24 = Calc.generarPerfil24h(UI.estado, UI.mes24h);
    const el24 = $('#hint-24h');
    if (el24) {
      const genDia = p24.reduce((s, x) => s + x.gen, 0);
      const horasSol = p24.filter(x => x.gen > 0.0001);
      const rango = horasSol.length ? horasSol[0].etiqueta + ' a ' + horasSol[horasSol.length - 1].etiqueta : '—';
      el24.textContent = fmtN(genDia, 1) + ' kWh generados por día · sol de ' + rango +
        (UI.mes24h === null ? ' (promedio del año)' : '');
    }
    const series = [
      { nombre: 'Generación solar', valores: p24.map(x => x.gen), color: 'var(--c-gen)' },
      { nombre: 'Demanda del cliente', valores: p24.map(x => x.con), color: 'var(--c-con)' },
      { nombre: 'Autoconsumo', valores: p24.map(x => x.autoTotal || x.auto), color: 'var(--ok)' },
    ];

    if (UI.estado.incluirBateria === 'si') {
      series.push({ nombre: 'Carga de batería', valores: p24.map(x => x.batCarga), color: '#8b5cf6' });
      series.push({ nombre: 'Descarga de batería', valores: p24.map(x => x.batDescarga), color: '#a855f7' });
    }

    lineChart(cont, series, 'kWh/h', p24.map(x => x.etiqueta));
  }

  function setMes(key, i, valor, fuente) {
    const a = Calc.arr(UI.estado[key], 12, 0);
    a[i] = Calc.num(valor);
    UI.estado[key] = JSON.stringify(a);
    if (fuente) UI.estado.genFuente = fuente;
    marcarDirty();
    recalcularEnergiaDiferido();
  }

  function estimarGen() {
    const p = Calc.normalizar(UI.estado);
    UI.estado.genM = JSON.stringify(Calc.estimarGeneracion(p.kwp, p.irrad, p.pr));
    UI.estado.genFuente = 'estimada';
    marcarDirty(); recalcular();
  }

  function rellenarConsumo() {
    const v = prompt('Consumo mensual (kWh) para aplicar a los 12 meses:', '2000');
    if (v === null) return;
    const n = Calc.num(v);
    UI.estado.conM = JSON.stringify(Array(12).fill(n));
    UI.estado.conEst = JSON.stringify(Array(12).fill(true));
    marcarDirty(); recalcular();
  }

  // ---------- Resultados ----------
  function setMonedaResultados(moneda) {
    UI.monedaResultados = moneda;
    $('#btnMonedaARS').classList.toggle('btn-primario', moneda === 'ARS');
    $('#btnMonedaUSD').classList.toggle('btn-primario', moneda === 'USD');
    $$('.moneda-label').forEach(el => el.textContent = moneda);
    if (UI.res) renderResultados(UI.res);
  }

  function setMonedaLeasing(moneda) {
    UI.monedaLeasing = moneda;
    $('#btnMonedaLeasingUSD').classList.toggle('btn-primario', moneda === 'USD');
    $('#btnMonedaLeasingARS').classList.toggle('btn-primario', moneda === 'ARS');
    if (UI.res) renderLeasing(UI.res);
  }

  function renderResultados(r) {
    const p = r.p;
    const esUSD = UI.monedaResultados === 'USD';

    const items = [
      ['Inversión (CAPEX)', esUSD ? fmtUSD(r.capexUSD) : fmtARS(r.capexARS), (esUSD ? fmtARS(r.capexARS) : fmtUSD(r.capexUSD)) + (p.incluirBateria ? ' (Solar + Baterías)' : '')],
      ['Ahorro año 1', esUSD ? fmtUSD(r.ahorroAnual1USD) : fmtARS(r.ahorroAnual1), (esUSD ? fmtARS(r.ahorroAnual1) : fmtUSD(r.ahorroAnual1USD)) + ' · ' + fmtN(esUSD ? r.ahorroAnual1USD / 12 : r.ahorroAnual1 / 12) + (esUSD ? ' U$D/mes' : ' $/mes')],
      ['Tarifa con impuestos', fmtN(r.tarifaFull, 2) + ' $/kWh', fmtN(p.tarifa_resto, 2) + ' + ' + fmtPct(r.impTotalPct, 2)],
      ['VAN @ ' + fmtN(p.tasa_desc, 1) + ' %', esUSD ? fmtUSD(r.vanUSD) : fmtARS(r.van), esUSD ? fmtARS(r.van) : fmtUSD(r.vanUSD), r.van >= 0 ? 'ok' : 'mal'],
      ['TIR ' + (p.moneda_analisis === 'ars' ? 'en $' : 'en U$D'),
        (p.moneda_analisis === 'ars' ? r.tir : r.tirUSD) === null ? '—' : fmtPct((p.moneda_analisis === 'ars' ? r.tir : r.tirUSD) * 100),
        (p.moneda_analisis === 'ars'
          ? (r.tirUSD === null ? '—' : fmtPct(r.tirUSD * 100) + ' en U$D')
          : (r.tir === null ? '—' : fmtPct(r.tir * 100) + ' en $ nominales')) + ' · ' + p.horizonte + ' años',
        (p.moneda_analisis === 'ars' ? r.tir : r.tirUSD) !== null && (p.moneda_analisis === 'ars' ? r.tir : r.tirUSD) * 100 >= p.tasa_desc ? 'ok' : 'mal'],
      ['Payback simple', fmtAnios(r.payback), 'descontado: ' + fmtAnios(r.paybackDesc), r.payback !== null && r.payback <= 6 ? 'ok' : ''],
      ['LCOE', esUSD ? fmtN(r.lcoeUSD * 100, 2) + ' ¢U$D/kWh' : fmtN(r.lcoeARS, 2) + ' $/kWh', esUSD ? fmtN(r.lcoeARS, 2) + ' $/kWh' : fmtN(r.lcoeUSD * 100, 2) + ' ¢U$D/kWh', r.lcoeARS < r.tarifaFull ? 'ok' : 'mal'],
      ['Ahorro acumulado', esUSD ? fmtUSD(r.ahorroTotalUSD) : fmtARS(r.ahorroTotal), (esUSD ? fmtARS(r.ahorroTotal) : fmtUSD(r.ahorroTotalUSD)) + ' en ' + p.horizonte + ' años'],
    ];

    $('#kpi-resultados').innerHTML = kpis(items);

    const flujosGrafico = esUSD
      ? [-r.capexUSD].concat(r.anios.map(a => a.acum / p.tc))
      : [-r.capexARS].concat(r.anios.map(a => a.acum));
    const flujosDescGrafico = esUSD
      ? [-r.capexUSD].concat(r.anios.map(a => a.acumDesc / p.tc))
      : [-r.capexARS].concat(r.anios.map(a => a.acumDesc));

    lineChart($('#chart-flujo'), [
      { nombre: 'Flujo acumulado', valores: flujosGrafico, color: 'var(--c-gen)' },
      { nombre: 'Acumulado descontado', valores: flujosDescGrafico, color: 'var(--c-con)' },
    ], esUSD ? 'U$D' : '$');

    const fmtM = v => esUSD ? fmtUSD(v / p.tc) : fmtARS(v);

    $('#tabla-flujo').innerHTML = `
      <thead><tr><th>Año</th><th>Generación<br><small>kWh</small></th><th>Ahorro<br><small>${esUSD ? 'U$D' : '$'}</small></th><th>OPEX<br><small>${esUSD ? 'U$D' : '$'}</small></th><th>Recambio<br><small>${esUSD ? 'U$D' : '$'}</small></th><th>Flujo<br><small>${esUSD ? 'U$D' : '$'}</small></th><th>Acumulado<br><small>${esUSD ? 'U$D' : '$'}</small></th><th>Acum. desc.<br><small>${esUSD ? 'U$D' : '$'}</small></th></tr></thead>
      <tbody>
        <tr><td>0</td><td></td><td></td><td></td><td></td><td class="num neg">${fmtM(-r.capexARS)}</td><td class="num neg">${fmtM(-r.capexARS)}</td><td class="num neg">${fmtM(-r.capexARS)}</td></tr>
        ${r.anios.map(a => `<tr>
          <td>${a.anio}</td><td class="num">${fmtN(a.gen)}</td><td class="num">${fmtM(a.ahorro)}</td>
          <td class="num">${a.opex ? fmtM(-a.opex) : '—'}</td><td class="num">${a.recambio ? fmtM(-a.recambio) : '—'}</td>
          <td class="num">${fmtM(a.flujo)}</td>
          <td class="num ${a.acum < 0 ? 'neg' : 'pos'}">${fmtM(a.acum)}</td>
          <td class="num ${a.acumDesc < 0 ? 'neg' : 'pos'}">${fmtM(a.acumDesc)}</td>
        </tr>`).join('')}
      </tbody>`;
  }

  // ---------- Leasing ----------
  function renderLeasing(r) {
    const L = r.leasing, p = r.p;
    const esARS = UI.monedaLeasing === 'ARS';
    const mult = esARS ? p.tc : 1;
    const fmtL = v => esARS ? fmtARS(v * mult) : fmtUSD(v);

    $('#kpi-leasing').innerHTML = kpis([
      ['Canon mensual', fmtL(L.canonMensual), fmtN(p.l_canon_kwp * (esARS ? p.tc : 1), 1) + (esARS ? ' $/kWp' : ' U$D/kWp') + ' × ' + fmtN(p.kwp, 2) + ' kWp'],
      ['Ahorro mensual año 1', fmtL(L.ahorroMensualUSD), esARS ? fmtUSD(L.ahorroMensualUSD) : fmtARS(r.ahorroAnual1 / 12)],
      ['Cuota total mensual', fmtL(L.cuotaMensualUSD), 'canon + seguro + mantenimiento'],
      ['Flujo mensual neto', fmtL(L.flujoMensualUSD), L.flujoMensualUSD >= 0 ? 'el ahorro cubre la cuota' : 'el ahorro no cubre la cuota', L.flujoMensualUSD >= 0 ? 'ok' : 'mal'],
      ['Costo total leasing', fmtL(L.neto), 'bruto ' + fmtL(L.bruto) + (L.ahorroImp ? ' − Ganancias ' + fmtL(L.ahorroImp) : '')],
      ['Sobrecosto vs. contado', fmtL(L.sobrecostoVsContado), fmtPct(L.capexUSD ? L.sobrecostoVsContado / L.capexUSD * 100 : 0) + ' sobre ' + fmtL(L.capexUSD)],
      ['VAN leasing @ ' + fmtN(p.tasa_desc, 1) + ' %', fmtL(L.van), 'contado: ' + fmtL(r.vanUSD), L.van >= 0 ? 'ok' : 'mal'],
      ['TIR leasing', L.tir === null ? '—' : fmtPct(L.tir * 100), 'payback ' + fmtAnios(L.payback)],
    ]);

    $('#tabla-leasing-resumen').innerHTML = `
      <tbody>
        <tr><td>Pago inicial</td><td class="num">${fmtL(L.pagoInicial)}</td></tr>
        <tr><td>Canon: ${fmtL(L.canonMensual)} × ${L.plazoMeses} meses</td><td class="num">${fmtL(L.canonTotal)}</td></tr>
        <tr><td>Seguro (${fmtN(L.plazoAnios, 1)} años)</td><td class="num">${fmtL(L.seguroTotal)}</td></tr>
        <tr><td>Mantenimiento (${fmtN(L.plazoAnios, 1)} años)</td><td class="num">${fmtL(L.mttoTotal)}</td></tr>
        <tr><td>Opción de compra</td><td class="num">${fmtL(L.opcion)}</td></tr>
        <tr class="total"><td>Total bruto</td><td class="num">${fmtL(L.bruto)}</td></tr>
        <tr><td>Ahorro impositivo (Ganancias ${p.lGanancias ? fmtN(p.l_tasa_gan) + ' %' : 'no aplica'})</td><td class="num pos">${L.ahorroImp ? '− ' + fmtL(L.ahorroImp) : '—'}</td></tr>
        <tr class="total"><td>Costo neto del leasing</td><td class="num">${fmtL(L.neto)}</td></tr>
        <tr><td>Compra al contado (CAPEX)</td><td class="num">${fmtL(L.capexUSD)}</td></tr>
      </tbody>`;

    lineChart($('#chart-leasing'), [
      { nombre: 'Leasing (acumulado ' + (esARS ? '$' : 'U$D') + ')', valores: [-L.pagoInicial * mult].concat(L.anios.map(a => a.acum * mult)), color: 'var(--c-gen)' },
      { nombre: 'Contado (acumulado ' + (esARS ? '$' : 'U$D') + ')', valores: [-r.capexUSD * mult].concat(r.anios.map(a => (a.acum / p.tc) * mult)), color: 'var(--c-con)' },
    ], esARS ? '$' : 'U$D');

    $('#tabla-leasing').innerHTML = `
      <thead><tr><th>Año</th><th>Ahorro<br><small>${esARS ? '$' : 'U$D'}</small></th><th>Costo leasing / OPEX<br><small>${esARS ? '$' : 'U$D'}</small></th><th>Escudo fiscal<br><small>${esARS ? '$' : 'U$D'}</small></th><th>Flujo<br><small>${esARS ? '$' : 'U$D'}</small></th><th>Acumulado<br><small>${esARS ? '$' : 'U$D'}</small></th></tr></thead>
      <tbody>
        <tr><td>0</td><td></td><td class="num neg">${fmtL(-L.pagoInicial)}</td><td></td><td class="num neg">${fmtL(-L.pagoInicial)}</td><td class="num neg">${fmtL(-L.pagoInicial)}</td></tr>
        ${L.anios.map(a => `<tr>
          <td>${a.anio}</td><td class="num">${fmtL(a.ahorro)}</td><td class="num">${fmtL(-a.costo)}</td>
          <td class="num">${a.escudo ? fmtL(a.escudo) : '—'}</td><td class="num">${fmtL(a.flujo)}</td>
          <td class="num ${a.acum < 0 ? 'neg' : 'pos'}">${fmtL(a.acum)}</td>
        </tr>`).join('')}
      </tbody>`;
  }

  // ---------- Sensibilidad ----------
  function renderSensibilidad() {
    if (!UI.estado) return;
    const sens = Calc.analisisSensibilidad(UI.estado);

    // Matriz 1: Tarifa vs CAPEX
    let html1 = `<table class="tabla tabla-matriz"><thead><tr><th>CAPEX \\ Tarifa</th>${sens.deltasTarifa.map(d => `<th>${d > 0 ? '+' : ''}${d} %</th>`).join('')}</tr></thead><tbody>`;
    sens.matrizTarifaCapex.forEach(fila => {
      html1 += `<tr><th>${fila.dCapex > 0 ? '+' : ''}${fila.dCapex} %</th>`;
      fila.celdas.forEach(c => {
        const clase = c.vanUSD > 0 ? (c.vanUSD > 10000 ? 'matriz-alta' : 'matriz-media') : 'matriz-negativa';
        html1 += `<td class="${clase}" title="VAN: ${fmtUSD(c.vanUSD)} | TIR: ${c.tir ? fmtPct(c.tir * 100) : '—'} | Payback: ${fmtAnios(c.payback)}">
          <div class="van-val">${fmtUSD(c.vanUSD)}</div>
          <div class="tir-val">${c.tir ? fmtPct(c.tir * 100) : '—'}</div>
        </td>`;
      });
      html1 += `</tr>`;
    });
    html1 += `</tbody></table>`;
    $('#cont-matriz-tarifa-capex').innerHTML = html1;

    // Matriz 2: Inflación vs Tasa de Descuento
    let html2 = `<table class="tabla tabla-matriz"><thead><tr><th>Tasa \\ Inflación</th>${sens.deltasInf.map(d => `<th>${d > 0 ? '+' : ''}${d} %</th>`).join('')}</tr></thead><tbody>`;
    sens.matrizInfTasa.forEach(fila => {
      html2 += `<tr><th>${fila.tasa} %</th>`;
      fila.celdas.forEach(c => {
        const clase = c.vanUSD > 0 ? (c.vanUSD > 10000 ? 'matriz-alta' : 'matriz-media') : 'matriz-negativa';
        html2 += `<td class="${clase}" title="VAN: ${fmtUSD(c.vanUSD)} | TIR: ${c.tir ? fmtPct(c.tir * 100) : '—'} | Payback: ${fmtAnios(c.payback)}">
          <div class="van-val">${fmtUSD(c.vanUSD)}</div>
          <div class="tir-val">${c.tir ? fmtPct(c.tir * 100) : '—'}</div>
        </td>`;
      });
      html2 += `</tr>`;
    });
    html2 += `</tbody></table>`;
    $('#cont-matriz-inf-tasa').innerHTML = html2;
  }

  // ---------- Comparador Multi-Proyecto ----------
  function renderComparador() {
    const selCont = $('#cont-comparador-selector');
    const tabCont = $('#cont-comparador-tabla');
    if (!selCont || !tabCont) return;

    if (!UI.proyectos.length) {
      tabCont.innerHTML = '<p class="vacio">No hay proyectos para comparar. Creá o cargá proyectos primero.</p>';
      return;
    }

    // Checkboxes de proyectos
    selCont.innerHTML = `<b>Seleccionar para comparar:</b> ` + UI.proyectos.map(p => `
      <label style="display:inline-flex; align-items:center; gap:4px; font-size:12px; margin-right:8px; cursor:pointer;">
        <input type="checkbox" data-cmp="${esc(p.id)}" ${UI.compararSeleccionados.includes(p.id) || (UI.compararSeleccionados.length === 0 && p.id === UI.id) ? 'checked' : ''}>
        ${esc(p.nombre)}
      </label>
    `).join('');

    $$('#cont-comparador-selector input[data-cmp]').forEach(ch => {
      ch.onchange = () => {
        const id = ch.dataset.cmp;
        if (ch.checked) {
          if (!UI.compararSeleccionados.includes(id)) UI.compararSeleccionados.push(id);
        } else {
          UI.compararSeleccionados = UI.compararSeleccionados.filter(x => x !== id);
        }
        renderComparadorTabla();
      };
    });

    if (UI.compararSeleccionados.length === 0 && UI.id) {
      UI.compararSeleccionados = [UI.id];
    }
    renderComparadorTabla();
  }

  function renderComparadorTabla() {
    const tabCont = $('#cont-comparador-tabla');
    if (!tabCont) return;
    const proys = UI.proyectos.filter(p => UI.compararSeleccionados.includes(p.id));
    if (!proys.length) {
      tabCont.innerHTML = '<p class="vacio">Marcá al menos un proyecto arriba para visualizar la comparativa.</p>';
      return;
    }

    const calculados = proys.map(p => ({
      p,
      r: Calc.calcular(p.estado || {})
    }));

    let html = `<table class="tabla tabla-comparador"><thead><tr><th>Métrica / Parámetro</th>`;
    calculados.forEach(c => {
      html += `<th class="${c.p.id === UI.id ? 'destacado' : ''}">${esc(c.p.nombre)}<br><small>${esc(c.p.resumen || '')}</small></th>`;
    });
    html += `</tr></thead><tbody>`;

    const filas = [
      ['Potencia instalada', c => fmtN(c.r.p.kwp, 2) + ' kWp'],
      ['Inversión Total (CAPEX)', c => fmtUSD(c.r.capexUSD) + ' (' + fmtARS(c.r.capexARS) + ')'],
      ['Baterías de almacenamiento', c => c.r.p.incluirBateria ? fmtN(c.r.p.bat_kwh, 1) + ' kWh (' + fmtUSD(c.r.capexBatUSD) + ')' : 'Sin baterías'],
      ['Generación anual (Año 1)', c => fmtN(c.r.genAnual) + ' kWh/año'],
      ['Autoconsumo solar', c => fmtPct(c.r.coberturaPct) + ' de la demanda'],
      ['Ahorro anual (Año 1)', c => fmtARS(c.r.ahorroAnual1) + ' (' + fmtUSD(c.r.ahorroAnual1USD) + ')'],
      ['Ahorro acumulado vida útil', c => fmtUSD(c.r.ahorroTotalUSD)],
      ['VAN (Valor Actual Neto)', c => `<span class="${c.r.van >= 0 ? 'pos' : 'neg'}">${fmtUSD(c.r.vanUSD)} (${fmtARS(c.r.van)})</span>`],
      ['TIR (Tasa Interna Retorno)', c => c.r.tir ? fmtPct(c.r.tir * 100) : '—'],
      ['Payback simple', c => fmtAnios(c.r.payback)],
      ['Payback descontado', c => fmtAnios(c.r.paybackDesc)],
      ['LCOE (Costo de Energía)', c => fmtN(c.r.lcoeARS, 2) + ' $/kWh (' + fmtN(c.r.lcoeUSD * 100, 2) + ' ¢U$D)'],
      ['CO₂ evitado por año', c => fmtN(c.r.co2AnualTon, 1) + ' t CO₂/año'],
      ['Árboles plantados eq.', c => fmtN(c.r.arbolesEq) + ' árboles'],
      ['Canon mensual Leasing', c => fmtUSD(c.r.leasing.canonMensual) + '/mes'],
    ];

    filas.forEach(([label, fn]) => {
      html += `<tr><td><b>${label}</b></td>`;
      calculados.forEach(c => {
        html += `<td>${fn(c)}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    tabCont.innerHTML = html;
  }

  // ---------- Propuesta Comercial con Gráficos Vectoriales SVG ----------
  function generarSvgBarrasPropuesta(r) {
    const W = 460, H = 160, ml = 36, mr = 10, mt = 18, mb = 22;
    const maxVal = Math.max(1, ...r.gen, ...r.con);
    const y = v => mt + (H - mt - mb) * (1 - v / maxVal);
    const gw = (W - ml - mr) / 12;
    const bw = gw * 0.38;

    let bars = '';
    r.meses.forEach((m, i) => {
      const g = r.gen[i] || 0, c = r.con[i] || 0;
      const xG = ml + i * gw + 2;
      const xC = xG + bw + 2;
      bars += `<rect x="${xG.toFixed(1)}" y="${y(g).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - y(g)).toFixed(1)}" fill="#f59e0b" rx="2"><title>${m} Gen: ${fmtN(g)} kWh</title></rect>`;
      bars += `<rect x="${xC.toFixed(1)}" y="${y(c).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - y(c)).toFixed(1)}" fill="#3b82f6" rx="2"><title>${m} Con: ${fmtN(c)} kWh</title></rect>`;
      bars += `<text x="${(ml + i * gw + gw / 2).toFixed(1)}" y="${(H - 6)}" font-size="9" fill="#64748b" text-anchor="middle" font-family="sans-serif">${m}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}" stroke="#e2e8f0" stroke-width="1"/>
      <line x1="${ml}" x2="${W - mr}" y1="${y(maxVal)}" y2="${y(maxVal)}" stroke="#f1f5f9" stroke-width="1"/>
      <text x="${ml - 4}" y="${y(maxVal) + 4}" font-size="8.5" fill="#94a3b8" text-anchor="end" font-family="sans-serif">${short(maxVal)}</text>
      <text x="${ml - 4}" y="${y(0)}" font-size="8.5" fill="#94a3b8" text-anchor="end" font-family="sans-serif">0</text>
      ${bars}
      <!-- Leyenda -->
      <rect x="${W - 130}" y="4" width="8" height="8" fill="#f59e0b" rx="2"/>
      <text x="${W - 118}" y="11" font-size="9" fill="#475569" font-family="sans-serif">Generación</text>
      <rect x="${W - 65}" y="4" width="8" height="8" fill="#3b82f6" rx="2"/>
      <text x="${W - 53}" y="11" font-size="9" fill="#475569" font-family="sans-serif">Consumo</text>
    </svg>`;
  }

  function generarSvgFlujoPropuesta(r) {
    const W = 360, H = 160, ml = 42, mr = 12, mt = 18, mb = 22;
    const p = r.p;
    const flujos = [-r.capexUSD].concat(r.anios.map(a => a.acum / p.tc));
    const minVal = Math.min(0, ...flujos);
    const maxVal = Math.max(0, ...flujos);
    const span = (maxVal - minVal) || 1;
    const y = v => mt + (H - mt - mb) * (1 - (v - minVal) / span);
    const n = flujos.length;
    const x = i => ml + (W - ml - mr) * (i / Math.max(1, n - 1));

    let pathD = '';
    flujos.forEach((v, i) => {
      pathD += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    });

    const pbX = r.payback !== null && r.payback <= p.horizonte ? x(r.payback) : null;

    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
      <line x1="${ml}" x2="${W - mr}" y1="${y(0)}" y2="${y(0)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="${ml - 4}" y="${y(maxVal) + 4}" font-size="8.5" fill="#94a3b8" text-anchor="end" font-family="sans-serif">${short(maxVal)}</text>
      <text x="${ml - 4}" y="${y(0) + 3}" font-size="8.5" fill="#64748b" text-anchor="end" font-family="sans-serif">$0</text>
      <text x="${ml - 4}" y="${y(minVal)}" font-size="8.5" fill="#94a3b8" text-anchor="end" font-family="sans-serif">${short(minVal)}</text>
      <path d="${pathD}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>
      ${pbX ? `
        <circle cx="${pbX.toFixed(1)}" cy="${y(0).toFixed(1)}" r="4.5" fill="#10b981"/>
        <text x="${pbX.toFixed(1)}" y="${(y(0) - 8).toFixed(1)}" font-size="9" font-weight="bold" fill="#047857" text-anchor="middle" font-family="sans-serif">Payback: ${fmtAnios(r.payback)}</text>
      ` : ''}
      <text x="${ml}" y="${H - 6}" font-size="9" fill="#94a3b8" font-family="sans-serif">Año 0</text>
      <text x="${W - mr}" y="${H - 6}" font-size="9" fill="#94a3b8" text-anchor="end" font-family="sans-serif">Año ${p.horizonte}</text>
    </svg>`;
  }

  function renderPropuesta(r) {
    const p = r.p, L = r.leasing;
    const m = getMembrete();
    const c = UI.clientes.find(c => c.id === UI.cliente_id) || {};
    const cliNombre = p.cliente_nombre || c.nombre || UI.nombre || 'Cliente';
    const cliUbicacion = p.cliente_ubicacion || c.ubicacion || 'Argentina';
    const cliCuit = p.presu_cuit || c.cuit || '—';
    const presuNum = p.presu_numero || ('COT-' + String(Date.now()).slice(-6));

    const logoSrc = m.logo || 'img/logo.svg';
    const logoHtml = `<img src="${esc(logoSrc)}" class="propuesta-logo" alt="ALP GROUP" onerror="this.onerror=null; this.src='img/logo.png'">`;

    const svgBarras = generarSvgBarrasPropuesta(r);
    const svgFlujo = generarSvgFlujoPropuesta(r);

    // Solo se muestran los datos de contacto cargados; los vacíos no dejan rastro en el papel.
    const contacto = [
      m.asesor ? 'Asesor: <b>' + esc(m.asesor) + '</b>' : '',
      m.tel ? 'Tel: ' + esc(m.tel) : '',
      m.email ? 'Email: ' + esc(m.email) : '',
    ].filter(Boolean).join(' · ');

    const faltan = faltantesMembrete();
    const avisoMembrete = faltan.length
      ? `<div class="propuesta-incompleta">
           <b>Membrete incompleto.</b> Falta cargar ${esc(faltan.join(', '))}.
           La propuesta no se puede imprimir hasta completarlo.
           <button type="button" class="btn btn-sm" id="btnAbrirMembretePropuesta">Completar membrete</button>
         </div>`
      : '';

    $('#propuesta-imprimible').innerHTML = `
      ${avisoMembrete}
      <div class="propuesta-header">
        <div class="propuesta-empresa">
          ${logoHtml}
          <h1>${esc(m.nombre)}</h1>
          <p>${esc(m.slogan)}</p>
          ${contacto ? `<p style="margin-top: 4px; font-size: 11.5px;">${contacto}</p>` : ''}
        </div>
        <div class="propuesta-doc">
          <div class="doc-titulo">PROPUESTA TÉCNICO-COMERCIAL</div>
          <div class="doc-num">N° ${esc(presuNum)}</div>
          <div class="doc-fecha">Fecha: ${UI.fecha ? UI.fecha.split(',')[0] : new Date().toLocaleDateString('es-AR')}</div>
          <div class="doc-fecha" style="font-size: 11px;">Validez de la oferta: ${esc(m.validez)} días</div>
        </div>
      </div>

      <div class="propuesta-grid">
        <div class="propuesta-bloque">
          <h4>👤 Datos del Cliente & Emplazamiento</h4>
          <div class="propuesta-fila"><span class="etq">Cliente / Razón Social:</span><span class="val">${esc(cliNombre)}</span></div>
          <div class="propuesta-fila"><span class="etq">CUIT / Identificación:</span><span class="val">${esc(cliCuit)}</span></div>
          <div class="propuesta-fila"><span class="etq">Ubicación de la obra:</span><span class="val">${esc(cliUbicacion)}</span></div>
          <div class="propuesta-fila"><span class="etq">Tipo de instalación:</span><span class="val">${esc(p.tipoInst.toUpperCase())} (${esc(p.tipoSistema)})</span></div>
        </div>

        <div class="propuesta-bloque">
          <h4>☀️ Especificaciones del Sistema FV</h4>
          <div class="propuesta-fila"><span class="etq">Potencia fotovoltaica:</span><span class="val">${fmtN(p.kwp, 2)} kWp</span></div>
          <div class="propuesta-fila"><span class="etq">Módulos solares:</span><span class="val">${fmtN(p.presu_paneles)} paneles × ${fmtN(p.panel_w)} Wp</span></div>
          <div class="propuesta-fila"><span class="etq">Generación estimada año 1:</span><span class="val">${fmtN(r.genAnual)} kWh/año</span></div>
          <div class="propuesta-fila"><span class="etq">Aprovechamiento solar:</span><span class="val">${fmtPct(r.aprovechamientoPct)} (Autoconsumo)</span></div>
          <div class="propuesta-fila"><span class="etq">Cobertura del consumo:</span><span class="val">${fmtPct(r.coberturaPct)} de la demanda anual</span></div>
          ${p.incluirBateria ? `<div class="propuesta-fila"><span class="etq">Almacenamiento (Baterías):</span><span class="val">${fmtN(p.bat_kwh, 1)} kWh (${esc(p.bat_tipo.toUpperCase())})</span></div>` : ''}
          ${p.incluirBateria && r.autoBatAnual > 0 ? `<div class="propuesta-fila"><span class="etq">Aporte de las baterías:</span><span class="val">${fmtN(r.autoBatAnual)} kWh/año desplazados al horario sin sol</span></div>` : ''}
        </div>
      </div>

      <!-- Gráficos Vectoriales de Generación y Curva Financiera -->
      <div class="propuesta-charts-grid">
        <div class="propuesta-chart-box">
          <h5>📊 Balance Energético Mensual (Año 1)</h5>
          ${svgBarras}
        </div>
        <div class="propuesta-chart-box">
          <h5>📈 Flujo Acumulado y Retorno (U$D)</h5>
          ${svgFlujo}
        </div>
      </div>

      ${(() => {
        let t3d = (UI.estado && UI.estado.techo3d)
          ? UI.estado.techo3d
          : (typeof UITecho3D !== 'undefined' ? UITecho3D.obtenerResumen() : null);
        if (typeof t3d === 'string') {
          try { t3d = JSON.parse(t3d); } catch (e) { t3d = null; }
        }
        const tieneT3d = t3d && (t3d.cantidadPaneles > 0 || (t3d.puntosPoligono && t3d.puntosPoligono.length >= 3));
        if (!tieneT3d) return '';
        const snapshot = t3d.snapshotDataUrl || (t3d.distribucion && t3d.distribucion.snapshotDataUrl);
        const areaTecho = t3d.areaTechoM2 || (t3d.distribucion && t3d.distribucion.areaTotalTecho) || 0;
        const paneles = t3d.cantidadPaneles || (t3d.distribucion && t3d.distribucion.count) || p.presu_paneles;
        const ocup = t3d.factorOcupacionPct || (t3d.distribucion && t3d.distribucion.factorOcupacionPct) || 0;
        return `
          <div class="propuesta-bloque" style="margin-bottom: 20px;">
            <h4>🛰️ Estudio Satelital 3D y Disposición de Cubierta</h4>
            <div style="display: grid; grid-template-columns: ${snapshot ? '1.1fr 1fr' : '1fr'}; gap: 16px; align-items: center;">
              ${snapshot ? `
                <div style="border-radius: var(--radio-sm); overflow: hidden; border: 1px solid var(--borde); background: #0f172a; text-align: center;">
                  <img src="${snapshot}" alt="Gemelo 3D Satelital" style="width: 100%; height: auto; max-height: 200px; object-fit: cover; display: block;">
                  <small style="display: block; padding: 4px; color: #94a3b8; font-size: 10px;">Gemelo 3D y simulación de sombras en el emplazamiento</small>
                </div>
              ` : ''}
              <div>
                <div class="propuesta-fila"><span class="etq">Superficie útil de cubierta:</span><span class="val">${fmtN(areaTecho)} m²</span></div>
                <div class="propuesta-fila"><span class="etq">Módulos en el plano:</span><span class="val">${fmtN(paneles)} paneles fotovoltaicos</span></div>
                <div class="propuesta-fila"><span class="etq">Orientación (Azimut):</span><span class="val">${t3d.azimutDeg !== undefined ? t3d.azimutDeg + '° (Norte = 0°)' : 'Óptima'}</span></div>
                <div class="propuesta-fila"><span class="etq">Inclinación proyectada:</span><span class="val">${t3d.inclinacionDeg !== undefined ? t3d.inclinacionDeg + '°' : '15°'}</span></div>
                <div class="propuesta-fila"><span class="etq">Tipo de nave / estructura:</span><span class="val">${esc((t3d.tipoNave || 'industrial').toUpperCase())} (${t3d.alturaNaveM || 8} m)</span></div>
                <div class="propuesta-fila"><span class="etq">Factor de ocupación útil:</span><span class="val">${ocup}% del techo aprovechado</span></div>
              </div>
            </div>
          </div>
        `;
      })()}

      <div class="propuesta-bloque" style="margin-bottom: 20px;">
        <h4>💰 Resumen Económico y Financiero</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 8px;">
          <div>
            <div style="font-weight: 700; font-size: 13px; color: var(--primario); margin-bottom: 6px;">OPCIÓN 1: Compra Directa (Llave en Mano)</div>
            <div class="propuesta-fila"><span class="etq">Inversión (CAPEX):</span><span class="val">${fmtUSD(r.capexUSD)}</span></div>
            <div class="propuesta-fila"><span class="etq">Ahorro anual estimado (Año 1):</span><span class="val pos">${fmtARS(r.ahorroAnual1)} (${fmtUSD(r.ahorroAnual1USD)})</span></div>
            <div class="propuesta-fila"><span class="etq">Tasa Interna de Retorno (TIR):</span><span class="val">${r.tir ? fmtPct(r.tir * 100) : '—'}</span></div>
            <div class="propuesta-fila"><span class="etq">Retorno simple de la inversión:</span><span class="val">${fmtAnios(r.payback)}</span></div>
            <div class="propuesta-fila"><span class="etq">Ahorro acumulado (${p.horizonte} años):</span><span class="val pos">${fmtUSD(r.ahorroTotalUSD)}</span></div>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 13px; color: var(--primario); margin-bottom: 6px;">OPCIÓN 2: Financiamiento por Leasing</div>
            <div class="propuesta-fila"><span class="etq">Pago inicial de ingreso:</span><span class="val">${fmtUSD(L.pagoInicial)}</span></div>
            <div class="propuesta-fila"><span class="etq">Canon mensual (${L.plazoMeses} meses):</span><span class="val">${fmtUSD(L.canonMensual)}/mes</span></div>
            <div class="propuesta-fila"><span class="etq">Ahorro mensual promedio:</span><span class="val pos">${fmtUSD(L.ahorroMensualUSD)}/mes</span></div>
            <div class="propuesta-fila"><span class="etq">Deducción de Ganancias:</span><span class="val">${p.lGanancias ? 'Aplica (' + fmtPct(p.l_tasa_gan) + ')' : 'No aplica'}</span></div>
            <div class="propuesta-fila"><span class="etq">Opción de compra final:</span><span class="val">${fmtUSD(L.opcion)}</span></div>
          </div>
        </div>
      </div>

      <div class="propuesta-insignia">
        <div class="propuesta-insignia-icon">🌱</div>
        <div class="propuesta-insignia-texto">
          <strong>Certificado de Impacto Ambiental Positivo</strong>
          <span>Este sistema evitará la emisión de <b>${fmtN(r.co2AnualTon, 1)} toneladas de CO₂ al año</b> (${fmtN(r.co2TotalTon, 0)} t en su vida útil), equivalente a plantar <b>${fmtN(r.arbolesEq)} árboles</b> y evitar <b>${fmtN(r.kmAutoEq)} km de conducción</b> vehicular.</span>
        </div>
      </div>

      <div class="propuesta-firmas">
        <div class="linea-firma">
          <b>${esc(m.nombre)}</b><br>
          <span style="font-size: 11px;">Firma y aclaración responsable técnico</span>
        </div>
        <div class="linea-firma">
          <b>${esc(cliNombre)}</b><br>
          <span style="font-size: 11px;">Conformidad y aceptación de la oferta</span>
        </div>
      </div>
    `;

    const btnMem = $('#btnAbrirMembretePropuesta');
    if (btnMem) btnMem.onclick = abrirMembrete;
  }

  // ---------- Panel de chequeos ----------
  const ETIQUETA_CAMPO = {};
  SECCIONES.forEach(sec => sec.campos.forEach(c => { ETIQUETA_CAMPO[c.k] = c.l; }));
  Object.assign(ETIQUETA_CAMPO, { genM: 'Generación mensual', conM: 'Consumo mensual' });

  function renderChequeos(r) {
    const cont = $('#panel-chequeos');
    if (!cont) return [];
    const items = Calc.validar(UI.estado, r);
    UI.chequeos = items;
    const errores = items.filter(x => x.nivel === 'error').length;
    const avisos = items.length - errores;

    if (!items.length) {
      cont.className = 'chequeos chequeos-ok';
      cont.innerHTML = '<div class="chequeos-cabecera"><span class="chequeos-icono">✓</span>' +
        '<b>Sin observaciones.</b> Los parámetros del proyecto están dentro de los rangos esperados.</div>';
      return items;
    }

    const resumen = [
      errores ? errores + (errores === 1 ? ' error' : ' errores') : '',
      avisos ? avisos + (avisos === 1 ? ' aviso' : ' avisos') : '',
    ].filter(Boolean).join(' · ');

    cont.className = 'chequeos ' + (errores ? 'chequeos-error' : 'chequeos-aviso');
    cont.innerHTML =
      `<div class="chequeos-cabecera" id="btnToggleChequeos" role="button" tabindex="0">
         <span class="chequeos-icono">${errores ? '✕' : '!'}</span>
         <b>Chequeos del proyecto:</b> ${esc(resumen)}
         <span class="chequeos-flecha">${UI.chequeosAbierto ? '▲' : '▼'}</span>
       </div>
       <ul class="chequeos-lista" ${UI.chequeosAbierto ? '' : 'hidden'}>
         ${items.map(x => `<li class="chequeo chequeo-${x.nivel}" data-campo="${esc(x.campo)}">
            <span class="chequeo-nivel">${x.nivel === 'error' ? 'Error' : 'Aviso'}</span>
            <div>
              <b>${esc(x.titulo)}</b>
              <div class="chequeo-detalle">${esc(x.detalle)}</div>
              ${ETIQUETA_CAMPO[x.campo] ? `<button type="button" class="btn btn-sm chequeo-ir">Ir a «${esc(ETIQUETA_CAMPO[x.campo])}»</button>` : ''}
            </div>
          </li>`).join('')}
       </ul>`;

    const cab = $('#btnToggleChequeos');
    if (cab) {
      const alternar = () => {
        UI.chequeosAbierto = !UI.chequeosAbierto;
        const ul = cont.querySelector('.chequeos-lista');
        if (ul) ul.hidden = !UI.chequeosAbierto;
        const fl = cont.querySelector('.chequeos-flecha');
        if (fl) fl.textContent = UI.chequeosAbierto ? '▲' : '▼';
      };
      cab.onclick = alternar;
      cab.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); } };
    }
    cont.querySelectorAll('.chequeo-ir').forEach(btn => {
      btn.onclick = () => {
        const campo = btn.closest('.chequeo').dataset.campo;
        const el = $('#f_' + campo);
        if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); }
        else { UI.tab = 'energia'; renderTabs(); }
      };
    });
    return items;
  }

  /** Explica el marco monetario con el que se descontaron los flujos. */
  function renderAvisoMoneda(r) {
    const el = $('#aviso-moneda');
    if (!el) return;
    const p = r.p;
    const enUSD = p.moneda_analisis !== 'ars';
    const partes = [
      `<b>Análisis en ${enUSD ? 'dólares' : 'pesos nominales'}.</b>`,
      `Tasa de descuento ${fmtPct(p.tasa_desc, 1)} en ${enUSD ? 'U$D' : '$'}, equivalente a ` +
      `<b>${fmtPct((enUSD ? r.rArs : r.rUsd) * 100, 1)}</b> en ${enUSD ? '$' : 'U$D'} con una devaluación de ${fmtPct(p.devaluacion, 1)} anual.`,
    ];
    if (p.inflacion > 0) {
      partes.push(`La tarifa sube ${fmtPct(p.inflacion, 1)} por año en pesos, que equivale a ` +
        `<b>${fmtPct(r.tarifaRealUSDPct, 1)} por año medida en dólares</b>.`);
    }
    partes.push(`Tipo de cambio proyectado al año ${p.horizonte}: <b>${fmtARS(r.tcFinal)}</b> por dólar.`);
    const alerta = p.inflacion > 3 && p.devaluacion === 0;
    el.className = 'aviso ' + (alerta ? 'aviso-atencion' : 'aviso-ok');
    if (alerta) {
      partes.push('Con devaluación cero el ahorro crece en dólares al mismo ritmo que en pesos, lo que sobreestima el retorno. ' +
        'Cargá la devaluación anual que esperás.');
    }
    el.innerHTML = partes.join(' ');
  }

  /** Explica cómo se trató Ganancias en la comparación leasing vs. compra. */
  function renderAvisoFiscal(r) {
    const el = $('#aviso-fiscal');
    if (!el) return;
    const p = r.p, L = r.leasing;
    if (p.fiscal === 'simetrico') {
      el.className = 'aviso aviso-ok';
      el.innerHTML = `<b>Comparación simétrica.</b> El ahorro de energía tributa Ganancias a ${fmtPct(p.l_tasa_gan, 1)} en ambas opciones. ` +
        `La compra amortiza el equipo en ${p.amort_anios} años (escudo total ${fmtUSD(r.escudoTotal / p.tc)}) y el leasing deduce ` +
        `canon, seguro y mantenimiento (escudo total ${fmtUSD(L.ahorroImp)}).`;
    } else if (p.fiscal === 'legacy') {
      el.className = 'aviso aviso-atencion';
      el.innerHTML = '<b>Comparación asimétrica (versión anterior).</b> El leasing deduce Ganancias pero la compra no amortiza el equipo, ' +
        'y el ahorro de energía no tributa en ninguna de las dos opciones. Eso favorece artificialmente al leasing. ' +
        'Sirve para reproducir una cotización ya entregada: para comparar en serio elegí «Simétrico» en la pestaña Datos.';
    } else {
      el.className = 'aviso';
      el.innerHTML = '<b>Sin considerar Ganancias.</b> Ninguna de las dos opciones computa escudo fiscal ni impuesto sobre el ahorro. ' +
        'Es el criterio correcto para un cliente que no tributa Ganancias (consumidor final o monotributista).';
    }
  }

  // ---------- Recalcular todo ----------
  function recalcular(sinInputsEnergia) {
    if (!UI.estado) return;
    const r = Calc.calcular(UI.estado);
    UI.res = r;
    renderChequeos(r);
    const t = $('#impTotal'); if (t) t.textContent = fmtN(r.impTotalPct, 3) + ' %';
    $('#resumen-cabecera').innerHTML =
      `<span class="resumen-badge">⚡ ${fmtN(r.p.kwp, 2)} kWp</span>` +
      `<span class="resumen-badge">💵 ${fmtUSD(r.capexUSD)}</span>` +
      `<span class="resumen-badge">📈 Ahorro año 1: ${fmtARS(r.ahorroAnual1)}</span>` +
      `<span class="resumen-badge ${r.van >= 0 ? 'pos' : 'neg'}">VAN ${fmtARS(r.van)}</span>` +
      `<span class="resumen-badge">TIR ${r.tir === null ? '—' : fmtPct(r.tir * 100)}</span>` +
      `<span class="resumen-badge">Payback ${fmtAnios(r.payback)}</span>` +
      `<span class="resumen-badge pos">🌱 ${fmtN(r.co2AnualTon, 1)} t CO₂/año</span>` +
      (r.p.incluirBateria ? `<span class="resumen-badge" style="color:#8b5cf6;">🔋 Batería ${fmtN(r.p.bat_kwh, 1)} kWh</span>` : '') +
      badgeChequeos();

    const bch = $('#badgeChequeos');
    if (bch) {
      bch.style.cursor = 'pointer';
      bch.onclick = () => {
        UI.tab = 'datos'; UI.chequeosAbierto = true;
        renderTabs(); renderChequeos(UI.res);
        const panel = $('#panel-chequeos');
        if (panel) panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
    }

    renderPaneActiva(sinInputsEnergia);
  }

  /**
   * Dibuja solo la pestaña que el usuario está mirando.
   * Antes se redibujaban las siete en cada tecla, y con la simulación horaria,
   * el Monte Carlo y el comparador de financiamiento eso ya no se sostiene.
   */
  function renderPaneActiva(sinInputsEnergia) {
    const r = UI.res;
    if (!r) return;
    switch (UI.tab) {
      case 'techo3d':
        if (typeof UITecho3D !== 'undefined') {
          UITecho3D.init();
        }
        break;
      case 'energia':
        if (sinInputsEnergia) renderEnergiaSinInputs(r); else renderEnergia(r);
        UIAnalisis.renderBandas(r);
        UIAnalisis.renderInversor(r);
        break;
      case 'resultados':
        renderResultados(r);
        renderAvisoMoneda(r);
        break;
      case 'financiamiento':
        renderLeasing(r);
        renderAvisoFiscal(r);
        UIAnalisis.renderFinanciamiento(r);
        break;
      case 'riesgo':
        renderSensibilidad();
        UIAnalisis.renderRiesgo(UI.riesgo, r);
        UIAnalisis.renderTornado(UI.tornado);
        marcarRiesgoDesactualizado();
        break;
      case 'comparador':
        renderComparador();
        break;
      case 'pipeline':
        UIGestion.renderPipeline();
        break;
      case 'tablero':
        UIGestion.renderTablero();
        break;
      case 'propuesta':
        renderPropuesta(r);
        break;
      case 'datos':
        // El formulario no se redibuja para no perder el foco; solo se actualizan
        // los bloques que dependen del cálculo.
        refrescarResumenIrradiacion();
        UIGestion.refrescarTotales(UI.estado);
        break;
      default:
        break;
    }
  }

  // Espacia el recálculo para que escribir en un campo no dispare el motor en cada tecla
  const recalcularDiferido = UI0.debounce(() => recalcular(), 160);
  const recalcularEnergiaDiferido = UI0.debounce(() => recalcular(true), 160);

  /**
   * Antes de imprimir revisa que el membrete tenga datos reales y que no queden
   * errores de carga sin resolver. Los avisos no bloquean, los errores piden confirmación.
   */
  function imprimirPropuesta() {
    const faltan = faltantesMembrete();
    if (faltan.length) {
      alert('La propuesta no puede salir con el membrete incompleto.\n\nFalta cargar: ' + faltan.join(', ') + '.');
      abrirMembrete();
      return;
    }
    const errores = (UI.chequeos || []).filter(x => x.nivel === 'error');
    if (errores.length) {
      const lista = errores.map(x => '  · ' + x.titulo).join('\n');
      if (!confirm('El proyecto tiene ' + errores.length + (errores.length === 1 ? ' error' : ' errores') +
        ' sin resolver:\n\n' + lista + '\n\n¿Imprimir igual?')) {
        UI.tab = 'datos'; UI.chequeosAbierto = true; renderTabs(); renderChequeos(UI.res);
        return;
      }
    }
    window.print();
  }

  // ---------- Análisis de riesgo (se corre a pedido, no en cada tecla) ----------
  function correrRiesgo() {
    if (!UI.estado) return;
    const btn = $('#btnCorrerRiesgo');
    const est = $('#estadoRiesgo');
    const n = +($('#selRiesgoN') || { value: 1000 }).value || 1000;
    if (btn) btn.disabled = true;
    if (est) est.textContent = 'Sorteando ' + fmtN(n) + ' escenarios…';

    // Se cede el hilo para que el navegador alcance a pintar el estado antes de bloquear
    setTimeout(() => {
      try {
        const t0 = Date.now();
        UI.riesgo = Calc.analisisMontecarlo(UI.estado, { n });
        UI.tornado = Calc.analisisTornado(UI.estado);
        UI.riesgoFirma = JSON.stringify(UI.estado);
        UIAnalisis.renderRiesgo(UI.riesgo, UI.res);
        UIAnalisis.renderTornado(UI.tornado);
        const ms = Date.now() - t0;
        const tiempo = ms < 1000 ? fmtN(ms) + ' ms' : fmtN(ms / 1000, 1) + ' s';
        if (est) est.textContent = fmtN(n) + ' escenarios en ' + tiempo +
          ' · semilla ' + UI.riesgo.semilla + ' (resultado reproducible)';
      } catch (e) {
        if (est) est.textContent = 'No se pudo correr la simulación: ' + e.message;
      } finally {
        if (btn) btn.disabled = false;
      }
    }, 30);
  }

  /** Avisa si el proyecto cambió después de la última simulación. */
  function marcarRiesgoDesactualizado() {
    const est = $('#estadoRiesgo');
    if (!est || !UI.riesgo) return;
    if (UI.riesgoFirma && UI.riesgoFirma !== JSON.stringify(UI.estado)) {
      est.textContent = 'El proyecto cambió después de esta simulación. Volvé a correrla para actualizarla.';
      est.className = 'hint hint-bloqueado';
    } else {
      est.className = 'hint';
    }
  }

  // =====================================================================
  //  Compartir y exportar la propuesta
  // =====================================================================

  /** Resumen de una línea por concepto, para mandar por mensaje. */
  function resumenTexto() {
    const r = UI.res;
    if (!r) return '';
    const m = getMembrete();
    const p = r.p;
    const lineas = [
      `*${m.nombre}* · Propuesta solar fotovoltaica`,
      p.cliente_nombre ? `Cliente: ${p.cliente_nombre}` : '',
      p.presu_numero ? `Cotización N° ${p.presu_numero}` : '',
      '',
      `☀️ Potencia: ${fmtN(p.kwp, 2)} kWp (${fmtN(p.presu_paneles)} módulos de ${fmtN(p.panel_w)} Wp)`,
      `⚡ Generación estimada: ${fmtN(r.genAnual)} kWh al año`,
      `🔌 Cubre el ${fmtPct(r.coberturaPct)} del consumo`,
      `💵 Inversión: ${fmtUSD(r.capexUSD)}`,
      `📉 Ahorro año 1: ${fmtARS(r.ahorroAnual1)}`,
      `📈 Retorno simple: ${fmtAnios(r.payback)}${r.tirUSD !== null ? ' · TIR ' + fmtPct(r.tirUSD * 100) : ''}`,
      `🌱 Evita ${fmtN(r.co2AnualTon, 1)} toneladas de CO₂ por año`,
      '',
      `Validez de la oferta: ${m.validez} días.`,
      m.asesor ? `${m.asesor}${m.tel ? ' · ' + m.tel : ''}` : (m.tel || ''),
    ];
    return lineas.filter(x => x !== '').join('\n');
  }

  function compartirWhatsapp() {
    const faltan = faltantesMembrete();
    if (faltan.length) { alert('Completá el membrete antes de compartir.\n\nFalta: ' + faltan.join(', ') + '.'); abrirMembrete(); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(resumenTexto()), '_blank', 'noopener');
  }

  function compartirEmail() {
    const faltan = faltantesMembrete();
    if (faltan.length) { alert('Completá el membrete antes de compartir.\n\nFalta: ' + faltan.join(', ') + '.'); abrirMembrete(); return; }
    const r = UI.res;
    const asunto = 'Propuesta solar fotovoltaica' + (r && r.p.presu_numero ? ' N° ' + r.p.presu_numero : '') +
      (r && r.p.cliente_nombre ? ' · ' + r.p.cliente_nombre : '');
    // El cuerpo va sin asteriscos: el formato de WhatsApp no aplica en el correo
    const cuerpo = resumenTexto().replace(/\*/g, '');
    location.href = 'mailto:?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
  }

  /**
   * Descarga la propuesta como un archivo HTML autónomo: se abre en cualquier
   * navegador sin la app, conserva los gráficos vectoriales e imprime en PDF.
   * No depende de ninguna librería externa.
   */
  function descargarPropuestaHTML() {
    if (!UI.res) { toast('Abrí un proyecto antes de exportar'); return; }
    const faltan = faltantesMembrete();
    if (faltan.length) { alert('La propuesta no puede salir con el membrete incompleto.\n\nFalta: ' + faltan.join(', ') + '.'); abrirMembrete(); return; }

    const nodo = $('#propuesta-imprimible').cloneNode(true);
    const aviso = nodo.querySelector('.propuesta-incompleta');
    if (aviso) aviso.remove();

    const m = getMembrete();
    const titulo = (UI.nombre || 'Propuesta') + ' · ' + m.nombre;
    const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>
  :root { --primario:#2563eb; --texto:#0f172a; --texto-2:#64748b; --borde:#e2e8f0; --ok:#10b981; --mal:#ef4444; }
  * { box-sizing:border-box; }
  body { margin:0; padding:26px; background:#f1f5f9; color:var(--texto);
         font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif; font-size:13px; line-height:1.5; }
  .propuesta-card { max-width:860px; margin:0 auto; background:#fff; padding:34px 38px;
                    border-radius:10px; box-shadow:0 8px 26px rgba(15,23,42,.10); }
  .propuesta-header { display:flex; justify-content:space-between; align-items:flex-start; gap:22px;
                      border-bottom:2px solid var(--primario); padding-bottom:14px; margin-bottom:20px; }
  .propuesta-logo { max-height:52px; width:auto; display:block; margin-bottom:8px; }
  .propuesta-empresa h1 { font-size:19px; margin:0 0 2px; color:var(--primario); }
  .propuesta-empresa p { margin:0; font-size:12px; color:var(--texto-2); }
  .propuesta-doc { text-align:right; }
  .doc-titulo { font-size:13.5px; font-weight:700; letter-spacing:.02em; }
  .doc-num { color:var(--primario); font-weight:700; font-size:13px; }
  .doc-fecha { font-size:11.5px; color:var(--texto-2); }
  .propuesta-grid, .propuesta-charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
  .propuesta-bloque, .propuesta-chart-box { border:1px solid var(--borde); border-radius:8px; padding:12px 14px; background:#f8fafc; }
  .propuesta-bloque h4, .propuesta-chart-box h5 { margin:0 0 8px; font-size:12.5px; color:var(--primario); }
  .propuesta-fila { display:flex; justify-content:space-between; gap:12px; padding:3px 0; font-size:12.5px; border-bottom:1px dotted var(--borde); }
  .propuesta-fila:last-child { border-bottom:none; }
  .etq { color:var(--texto-2); }
  .val { font-weight:600; text-align:right; }
  .pos { color:var(--ok); } .neg { color:var(--mal); }
  .propuesta-insignia { display:flex; gap:14px; align-items:center; border:1px solid var(--ok);
                        background:#ecfdf5; border-radius:8px; padding:12px 16px; margin-bottom:20px; }
  .propuesta-insignia-icon { font-size:26px; }
  .propuesta-insignia-texto strong { display:block; color:#047857; font-size:13px; margin-bottom:2px; }
  .propuesta-insignia-texto span { font-size:12px; color:var(--texto-2); }
  .propuesta-firmas { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:40px; }
  .linea-firma { border-top:1px solid var(--texto); padding-top:6px; text-align:center; font-size:12px; }
  svg { max-width:100%; height:auto; }
  @media print {
    body { background:#fff; padding:0; }
    .propuesta-card { box-shadow:none; border-radius:0; padding:0; max-width:100%; }
    .propuesta-bloque, .propuesta-chart-box, .propuesta-insignia, .propuesta-firmas { page-break-inside:avoid; }
  }
</style>
</head><body>
<div class="propuesta-card">${nodo.innerHTML}</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (UI.nombre || 'propuesta').replace(/[^\w\-]+/g, '_') + '_propuesta.html';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Propuesta exportada como archivo HTML autónomo');
  }

  /** Insignia de chequeos en la barra de resumen; lleva a la pestaña Datos al hacer clic. */
  function badgeChequeos() {
    const items = UI.chequeos || [];
    if (!items.length) return '<span class="resumen-badge pos" title="Sin observaciones">✓ Chequeos OK</span>';
    const errores = items.filter(x => x.nivel === 'error').length;
    const texto = errores ? errores + (errores === 1 ? ' error' : ' errores') : items.length + (items.length === 1 ? ' aviso' : ' avisos');
    return `<span class="resumen-badge ${errores ? 'neg' : 'atencion'}" id="badgeChequeos" title="Ver el detalle en la pestaña Datos">${errores ? '✕' : '!'} ${texto}</span>`;
  }

  // =====================================================================
  //  Membrete / Configuración / Logo
  // =====================================================================
  let logoBase64Temp = '';

  function abrirMembrete() {
    const m = getMembrete();
    $('#cfgEmpresaNombre').value = m.nombre;
    $('#cfgEmpresaSlogan').value = m.slogan;
    $('#cfgEmpresaAsesor').value = m.asesor;
    $('#cfgEmpresaTel').value = m.tel;
    $('#cfgEmpresaEmail').value = m.email;
    $('#cfgEmpresaValidez').value = m.validez;
    logoBase64Temp = m.logo || '';
    renderLogoPreview();

    // En modo nube el membrete es único para el equipo y solo lo edita un administrador.
    const puede = DB.puedeEditarEmpresa();
    $('#formMembrete').querySelectorAll('input, button[type="submit"]').forEach(el => { el.disabled = !puede; });
    const nota = $('#membreteAlcance');
    if (nota) {
      nota.textContent = DB.modo === 'nube'
        ? (puede ? 'Se guarda en la nube y lo ven todos los usuarios del equipo.'
                 : 'Solo un administrador puede modificar el membrete del equipo.')
        : 'Se guarda en este navegador.';
      nota.className = 'hint' + (DB.modo === 'nube' && !puede ? ' hint-bloqueado' : '');
    }
    $('#modalMembrete').hidden = false;
  }
  function cerrarMembrete() { $('#modalMembrete').hidden = true; }

  function renderLogoPreview() {
    const wrap = $('#logoPreviewWrap');
    const img = $('#imgLogoPreview');
    if (logoBase64Temp) {
      img.src = logoBase64Temp;
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
      img.src = '';
    }
  }

  const LOGO_MAX_BYTES = 400 * 1024;

  async function guardarMembrete(ev) {
    ev.preventDefault();
    if (!DB.puedeEditarEmpresa()) { toast('Solo un administrador puede cambiar el membrete'); return; }
    if (logoBase64Temp && logoBase64Temp.length > LOGO_MAX_BYTES) {
      alert('El logo pesa ' + Math.round(logoBase64Temp.length / 1024) + ' KB y el máximo son ' +
        Math.round(LOGO_MAX_BYTES / 1024) + ' KB.\n\nGuardalo en PNG optimizado o reducí sus dimensiones.');
      return;
    }
    const m = {
      nombre: $('#cfgEmpresaNombre').value.trim(),
      slogan: $('#cfgEmpresaSlogan').value.trim(),
      asesor: $('#cfgEmpresaAsesor').value.trim(),
      tel: $('#cfgEmpresaTel').value.trim(),
      email: $('#cfgEmpresaEmail').value.trim(),
      validez: $('#cfgEmpresaValidez').value.trim() || '15',
      logo: logoBase64Temp || '',
    };
    const btn = $('#formMembrete').querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      UI.membrete = await DB.empresa.save(m);
      cerrarMembrete();
      if (UI.res) renderPropuesta(UI.res);
      toast(DB.modo === 'nube' ? 'Membrete guardado para todo el equipo' : 'Membrete y logo guardados');
    } catch (e) {
      alert('No se pudo guardar el membrete: ' + e.message);
    } finally { if (btn) btn.disabled = false; }
  }

  // =====================================================================
  //  Tema Claro / Oscuro
  // =====================================================================
  function initTema() {
    const guardado = localStorage.getItem(KEY_TEMA);
    const prefiereDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const esDark = guardado === 'dark' || (!guardado && prefiereDark);
    document.documentElement.setAttribute('data-theme', esDark ? 'dark' : 'light');
    const btn = $('#btnTema');
    if (btn) btn.textContent = esDark ? '☀️' : '🌙';
  }

  function toggleTema() {
    const actual = document.documentElement.getAttribute('data-theme');
    const nuevo = actual === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    localStorage.setItem(KEY_TEMA, nuevo);
    const btn = $('#btnTema');
    if (btn) btn.textContent = nuevo === 'dark' ? '☀️' : '🌙';
  }

  // =====================================================================
  //  Login
  // =====================================================================
  function mostrarLogin(ver) {
    $('#login').hidden = !ver;
    if (ver) setTimeout(() => $('#loginEmail').focus(), 50);
  }
  function renderLoginModo() {
    $('#loginNombreWrap').hidden = !UI.registro;
    $('#loginBtn').textContent = UI.registro ? 'Crear cuenta' : 'Ingresar';
    $('#loginToggle').textContent = UI.registro ? 'Ya tengo cuenta' : 'Crear una cuenta nueva';
    $('#loginInfo').textContent = UI.registro ? 'El primer usuario registrado queda como administrador.' : 'Ingresá con tu usuario del equipo.';
    $('#loginError').textContent = '';
  }
  async function onLogin(ev) {
    ev.preventDefault();
    const email = $('#loginEmail').value.trim(), pass = $('#loginPass').value, nombre = $('#loginNombre').value.trim();
    const btn = $('#loginBtn'); btn.disabled = true; $('#loginError').textContent = '';
    try {
      if (UI.registro) {
        const conSesion = await DB.registro(email, pass, nombre || email.split('@')[0]);
        if (!conSesion) { $('#loginError').textContent = 'Cuenta creada. Revisá tu email para confirmarla y después ingresá.'; UI.registro = false; renderLoginModo(); return; }
      } else await DB.login(email, pass);
    } catch (e) { $('#loginError').textContent = e.message; }
    finally { btn.disabled = false; }
  }

  async function alCambiarUsuario(u) {
    renderUsuario();
    if (DB.modo === 'nube' && !u) { mostrarLogin(true); UI.proyectos = []; UI.estado = null; UI.id = null; renderTodo(); return; }
    mostrarLogin(false);
    await cargarMembrete();
    await cargarTodo();
    if (UI.proyectos.length) await abrir(UI.proyectos[0].id);
    else { UI.estado = null; UI.id = null; renderTodo(); }
  }

  // =====================================================================
  //  Asistente de Dimensionamiento y Superficie
  // =====================================================================
  function initAsistente() {
    const btnToggle = $('#btnToggleAsistente');
    if (btnToggle) {
      btnToggle.onclick = () => {
        UI.asistenteAbierto = !UI.asistenteAbierto;
        $('#asistente-cuerpo').hidden = !UI.asistenteAbierto;
        $('#asistente-icono').textContent = UI.asistenteAbierto ? '▲' : '▼';
        if (UI.asistenteAbierto) calcularYRenderAsistente();
      };
    }

    const tabTecho = $('#tabDimTecho');
    const tabConsumo = $('#tabDimConsumo');
    if (tabTecho && tabConsumo) {
      tabTecho.onclick = () => {
        UI.modoDim = 'techo';
        tabTecho.classList.add('btn-primario');
        tabConsumo.classList.remove('btn-primario');
        $('#modo-dim-techo').hidden = false;
        $('#modo-dim-consumo').hidden = true;
        calcularYRenderAsistente();
      };
      tabConsumo.onclick = () => {
        UI.modoDim = 'consumo';
        tabConsumo.classList.add('btn-primario');
        tabTecho.classList.remove('btn-primario');
        $('#modo-dim-consumo').hidden = false;
        $('#modo-dim-techo').hidden = true;
        calcularYRenderAsistente();
      };
    }

    ['dimAreaM2', 'dimTipoCubierta', 'dimPanelWp', 'dimCoberturaPct', 'dimConsumoAnual'].forEach(id => {
      const el = $('#' + id);
      if (el) {
        el.addEventListener('input', calcularYRenderAsistente);
        el.addEventListener('change', calcularYRenderAsistente);
      }
    });

    const btnAplicarTecho = $('#btnAplicarDimTecho');
    if (btnAplicarTecho) {
      btnAplicarTecho.onclick = () => {
        const r = Calc.dimensionarPorTecho({
          areaM2: $('#dimAreaM2').value,
          tipoCubierta: $('#dimTipoCubierta').value,
          panelWp: $('#dimPanelWp').value,
          irrad: UI.estado ? UI.estado.irrad : 1800,
          pr: UI.estado ? UI.estado.pr : 83
        });
        UI.estado.presu_paneles = String(r.paneles);
        UI.estado.panel_w = String(r.panelWp);
        UI.estado.kwp = String(r.kwp);
        UI.estado.tipoInst = r.tipoCubierta;
        if (UI.estado.genFuente === 'estimada') {
          UI.estado.genM = JSON.stringify(Calc.estimarGeneracion(r.kwp, Calc.num(UI.estado.irrad, 1800), Calc.num(UI.estado.pr, 83)));
        }
        marcarDirty();
        renderDatos();
        recalcular();
        toast(`Aplicado: ${r.paneles} paneles (${r.kwp} kWp)`);
      };
    }

    const btnAplicarConsumo = $('#btnAplicarDimConsumo');
    if (btnAplicarConsumo) {
      btnAplicarConsumo.onclick = () => {
        const r = Calc.dimensionarPorConsumo({
          conAnual: $('#dimConsumoAnual').value,
          coberturaPct: $('#dimCoberturaPct').value,
          irrad: UI.estado ? UI.estado.irrad : 1800,
          pr: UI.estado ? UI.estado.pr : 83,
          panelWp: UI.estado ? UI.estado.panel_w : 575
        });
        UI.estado.presu_paneles = String(r.paneles);
        UI.estado.kwp = String(r.kwp);
        if (UI.estado.genFuente === 'estimada') {
          UI.estado.genM = JSON.stringify(Calc.estimarGeneracion(r.kwp, Calc.num(UI.estado.irrad, 1800), Calc.num(UI.estado.pr, 83)));
        }
        marcarDirty();
        renderDatos();
        recalcular();
        toast(`Dimensionado: ${r.kwp} kWp (${r.paneles} módulos)`);
      };
    }
  }

  function calcularYRenderAsistente() {
    if (UI.modoDim === 'techo') {
      const area = Calc.num($('#dimAreaM2').value, 120);
      const tipo = $('#dimTipoCubierta').value;
      const wp = Calc.num($('#dimPanelWp').value, 575);
      const irrad = UI.estado ? Calc.num(UI.estado.irrad, 1800) : 1800;
      const pr = UI.estado ? Calc.num(UI.estado.pr, 83) : 83;
      const res = Calc.dimensionarPorTecho({ areaM2: area, tipoCubierta: tipo, panelWp: wp, irrad, pr });
      
      const el = $('#res-dim-techo');
      if (el) {
        el.innerHTML = `
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.paneles} u.</span><span class="asistente-kpi-lbl">Módulos máx.</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.kwp} kWp</span><span class="asistente-kpi-lbl">Potencia pico</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${fmtN(res.genAnualEstimada)} kWh</span><span class="asistente-kpi-lbl">Generación anual</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.areaUtil} m²</span><span class="asistente-kpi-lbl">Área neta útil</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.pesoSobrecargaKgM2} kg/m²</span><span class="asistente-kpi-lbl">Sobrecarga estática</span></div>
        `;
      }
    } else {
      const con = Calc.num($('#dimConsumoAnual').value, 24000);
      const cob = Calc.num($('#dimCoberturaPct').value, 75);
      const irrad = UI.estado ? Calc.num(UI.estado.irrad, 1800) : 1800;
      const pr = UI.estado ? Calc.num(UI.estado.pr, 83) : 83;
      const wp = UI.estado ? Calc.num(UI.estado.panel_w, 575) : 575;
      const res = Calc.dimensionarPorConsumo({ conAnual: con, coberturaPct: cob, irrad, pr, panelWp: wp });

      const el = $('#res-dim-consumo');
      if (el) {
        el.innerHTML = `
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.kwp} kWp</span><span class="asistente-kpi-lbl">Potencia necesaria</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.paneles} u.</span><span class="asistente-kpi-lbl">Módulos (${wp}Wp)</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${fmtN(res.genAnual)} kWh</span><span class="asistente-kpi-lbl">Generación año 1</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.coberturaRealPct}%</span><span class="asistente-kpi-lbl">Cobertura real</span></div>
          <div class="asistente-kpi"><span class="asistente-kpi-val">${res.areaRequeridaM2} m²</span><span class="asistente-kpi-lbl">Área techo req.</span></div>
        `;
      }
    }
  }

  // =====================================================================
  //  Init
  // =====================================================================
  async function init() {
    initTema();
    initAsistente();
    $('#btnTema').onclick = toggleTema;
    $('#btnNuevo').onclick = nuevo;
    $('#btnGuardar').onclick = () => guardar(false);
    $('#btnDuplicar').onclick = duplicar;
    $('#btnEliminar').onclick = eliminar;
    $('#btnExportarTodo').onclick = exportarTodo;
    $('#btnExportar').onclick = exportarUno;
    $('#btnExportarCSV').onclick = exportarFlujoCSV;
    $('#btnMonedaARS').onclick = () => setMonedaResultados('ARS');
    $('#btnMonedaUSD').onclick = () => setMonedaResultados('USD');
    $('#btnMonedaLeasingUSD').onclick = () => setMonedaLeasing('USD');
    $('#btnMonedaLeasingARS').onclick = () => setMonedaLeasing('ARS');
    $('#btnVerPropuesta').onclick = () => { UI.tab = 'propuesta'; renderTabs(); };
    $('#btnImprimirPropuesta').onclick = imprimirPropuesta;
    $('#btnImportar').onclick = () => $('#fileImport').click();
    $('#btnMigrar').onclick = migrar;
    $('#btnConfigMembrete').onclick = abrirMembrete;
    $('#btnCerrarMembrete').onclick = cerrarMembrete;
    $('#formMembrete').onsubmit = guardarMembrete;
    $('#btnQuitarLogo').onclick = () => { logoBase64Temp = ''; renderLogoPreview(); };
    $('#cfgEmpresaLogo').onchange = (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = () => { logoBase64Temp = r.result; renderLogoPreview(); };
      r.readAsDataURL(file);
    };
    $('#selPlantilla').onchange = (ev) => { cargarPlantilla(ev.target.value); ev.target.value = ''; };
    $('#btnLogout').onclick = async () => { if (!confirmarDescartar()) return; UI.dirty = false; await DB.logout(); };
    $('#fileImport').onchange = ev => { if (ev.target.files[0]) importar(ev.target.files[0]); ev.target.value = ''; };
    $('#btnEstimarGen').onclick = estimarGen;
    $('#btnRellenarCon').onclick = rellenarConsumo;
    const bRiesgo = $('#btnCorrerRiesgo'); if (bRiesgo) bRiesgo.onclick = correrRiesgo;
    const bPap = $('#btnVerPapelera'); if (bPap) bPap.onclick = UIGestion.abrirPapelera;
    const bCerrarPap = $('#btnCerrarPapelera'); if (bCerrarPap) bCerrarPap.onclick = UIGestion.cerrarPapelera;
    const bRev = $('#btnCongelarRevision'); if (bRev) bRev.onclick = UIGestion.congelarRevision;
    const bWa = $('#btnCompartirWhatsapp'); if (bWa) bWa.onclick = compartirWhatsapp;
    const bMail = $('#btnCompartirEmail'); if (bMail) bMail.onclick = compartirEmail;
    const bHtml = $('#btnDescargarHtml'); if (bHtml) bHtml.onclick = descargarPropuestaHTML;

    // Publicar puente para módulos externos (UITecho3D, etc.)
    window.UI = UI;
    window.recalcular = recalcular;
    window.marcarDirty = marcarDirty;
    window.renderDatos = renderDatos;

    // El módulo de gestión necesita leer el estado de la app y pedirle acciones
    UIGestion.init({
      UI,
      abrir: id => { UI.tab = 'datos'; abrir(id); },
      cargarTodo,
      setCampo,
      cargarEstado: cargarEstadoExterno,
      membrete: getMembrete,
    });

    const selMes = $('#selMes24h');
    if (selMes) {
      selMes.innerHTML = '<option value="">Día medio del año</option>' +
        Calc.MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('');
      selMes.onchange = ev => {
        UI.mes24h = ev.target.value === '' ? null : +ev.target.value;
        renderChart24h();
      };
    }

    $('#buscar').oninput = ev => { UI.filtro = ev.target.value; renderLista(); };
    $('#nombre').oninput = ev => { UI.nombre = ev.target.value; marcarDirty(); };
    $$('.tab').forEach(b => b.onclick = () => { UI.tab = b.dataset.tab; renderTabs(); });
    $('#loginForm').onsubmit = onLogin;
    $('#loginToggle').onclick = () => { UI.registro = !UI.registro; renderLoginModo(); };

    // Botón Usar sin cuenta (Modo local)
    const btnModoLocal = $('#btnModoLocal');
    if (btnModoLocal) {
      btnModoLocal.onclick = async () => {
        DB.usarModoLocal();
        mostrarLogin(false);
        renderUsuario();
        await cargarMembrete();
        await cargarTodo();
        if (UI.proyectos.length) await abrir(UI.proyectos[0].id);
        else {
          await DB.importJSON(JSON.stringify(window.EJEMPLO));
          await cargarTodo();
          if (UI.proyectos.length) await abrir(UI.proyectos[0].id);
        }
        toast('⚡ Modo local activado (sin cuenta)');
      };
    }

    document.addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(false); }
    });
    window.addEventListener('beforeunload', ev => { if (UI.dirty) { ev.preventDefault(); ev.returnValue = ''; } });

    const h = location.hash.replace('#', '');
    if (['datos', 'techo3d', 'energia', 'resultados', 'financiamiento', 'riesgo',
      'comparador', 'pipeline', 'tablero', 'propuesta'].includes(h)) UI.tab = h;

    await UIGestion.cargarCatalogo();
    await DB.init(window.APP_CONFIG);
    renderLoginModo();
    DB.onAuth(alCambiarUsuario);
    await alCambiarUsuario(DB.usuario());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
