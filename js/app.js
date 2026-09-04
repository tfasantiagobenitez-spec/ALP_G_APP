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

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ---------- Formato ----------
  const fmtN = (n, d) => (n === null || n === undefined || isNaN(n)) ? '—'
    : n.toLocaleString('es-AR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const fmtARS = n => (n === null || n === undefined || isNaN(n)) ? '—' : '$ ' + fmtN(n, 0);
  const fmtUSD = n => (n === null || n === undefined || isNaN(n)) ? '—' : 'U$D ' + fmtN(n, 0);
  const fmtPct = (n, d) => (n === null || n === undefined || isNaN(n)) ? '—' : fmtN(n, d === undefined ? 1 : d) + ' %';
  const fmtAnios = n => (n === null || n === undefined) ? 'No recupera' : fmtN(n, 1) + ' años';
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Empresa / Membrete por defecto ----------
  const KEY_MEMBRETE = 'alp_g_app_empresa_v1';
  const KEY_TEMA = 'alp_g_app_tema_v1';
  const DEFAULT_MEMBRETE = {
    nombre: 'ALP GROUP',
    slogan: 'Ingeniería y Desarrollo Fotovoltaico · Autoconsumo & Eficiencia',
    asesor: 'Equipo Comercial & Técnico',
    tel: '+54 9 11 0000-0000',
    email: 'contacto@alpgroup.com.ar',
    validez: '15',
    logo: 'img/logo.svg',
  };

  function getMembrete() {
    try {
      const raw = localStorage.getItem(KEY_MEMBRETE);
      if (raw) return Object.assign({}, DEFAULT_MEMBRETE, JSON.parse(raw));
    } catch (e) { console.warn(e); }
    return DEFAULT_MEMBRETE;
  }

  function setMembrete(m) {
    try { localStorage.setItem(KEY_MEMBRETE, JSON.stringify(m)); } catch (e) { console.error(e); }
  }

  // ---------- Estado por defecto de un proyecto nuevo ----------
  const DEFAULT_ESTADO = {
    cliente_nombre: '', cliente_ubicacion: '', ciudad_id: 'ros', tipoInst: 'chapa', tipoSistema: 'industrial',
    presu_numero: '', presu_cuit: '', presu_paneles: '20', panel_w: '575',
    kwp: '11.5', usd_kwp: '650', tc: '1430', pr: '83', irrad: '1820', deg: '0.5',
    tarifa_resto: '120', inflacion: '0', horizonte: '20', tasa_desc: '10',
    opex_pct: '0.5', recambio_pct: '10', recambio_cada: '11', factor_co2: '0.45',
    incluirBateria: 'no', bat_kwh: '10', bat_usd_kwh: '450', bat_dod: '80', bat_tipo: 'litio',
    impData: JSON.stringify([{ nombre: 'Impuestos', pct: 10.5 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }]),
    genM: JSON.stringify(Calc.estimarGeneracion(11.5, 1820, 83)),
    conM: JSON.stringify([2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]),
    conEst: JSON.stringify([false, false, false, false, false, false, false, false, false, false, false, false]),
    genFuente: 'estimada', excModo: 'sin', tarifa_iny: '0',
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
      ]
    },
    {
      titulo: 'Almacenamiento con baterías (BESS)', campos: [
        { k: 'incluirBateria', l: 'Almacenamiento con baterías', t: 'select', o: [['no', 'Sin baterías (On-Grid puro)'], ['si', 'Con banco de baterías (Híbrido / Backup)']] },
        { k: 'bat_tipo', l: 'Tecnología de batería', t: 'select', o: [['litio', 'Litio LFP (LiFePO4)'], ['gel', 'Gel / Plomo Ácido']] },
        { k: 'bat_kwh', l: 'Capacidad total de banco', u: 'kWh', step: 0.5 },
        { k: 'bat_usd_kwh', l: 'Costo unitario batería', u: 'U$D/kWh', step: 1 },
        { k: 'bat_dod', l: 'Profundidad de descarga (DoD)', u: '%', step: 1 },
      ]
    },
    {
      titulo: 'Tarifa eléctrica', impuestos: true, campos: [
        { k: 'tarifa_resto', l: 'Tarifa energía (sin impuestos)', u: '$/kWh', step: 0.01 },
        { k: 'excModo', l: 'Excedentes', t: 'select', o: [['sin', 'Sin remuneración'], ['iny', 'Inyección a red remunerada']] },
        { k: 'tarifa_iny', l: 'Tarifa de inyección', u: '$/kWh', step: 0.01 },
      ]
    },
    {
      titulo: 'Parámetros económicos', campos: [
        { k: 'inflacion', l: 'Aumento anual de tarifa', u: '%/año', step: 0.1 },
        { k: 'horizonte', l: 'Horizonte de análisis', u: 'años' },
        { k: 'tasa_desc', l: 'Tasa de descuento', u: '%', step: 0.1 },
        { k: 'opex_pct', l: 'OPEX anual', u: '% CAPEX', step: 0.1 },
        { k: 'incluirRecambio', l: 'Recambio de inversor', t: 'select', o: [['no', 'No incluir'], ['si', 'Incluir']] },
        { k: 'recambio_pct', l: 'Costo del recambio', u: '% CAPEX', step: 0.1 },
        { k: 'recambio_cada', l: 'Recambio cada', u: 'años' },
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
  }

  async function abrir(id) {
    if (id === UI.id) return;
    if (!confirmarDescartar()) return;
    let p = UI.proyectos.find(x => x.id === id);
    if (!p || !p.estado) { try { p = await DB.proyectos.get(id); } catch (e) { alert(e.message); return; } }
    if (!p) return;
    cargarEnUI(p);
    renderTodo();
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
    if (!confirm('¿Eliminar "' + UI.nombre + '"? Esta acción no se puede deshacer.')) return;
    try {
      await DB.proyectos.remove(UI.id);
      UI.id = null; UI.estado = null; UI.dirty = false;
      await cargarTodo(); renderTodo();
      toast('Proyecto eliminado');
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
    csv += `"PAYBACK SIMPLE";"${fmtAnios(r.payback)}"\n\n`;

    csv += `"Año";"Generación (kWh)";"Ahorro ($)";"OPEX ($)";"Recambio ($)";"Flujo Neto ($)";"Acumulado ($)";"Acum. Descontado ($)"\n`;
    csv += `0;;;;;${-r.capexARS};${-r.capexARS};${-r.capexARS}\n`;
    r.anios.forEach(a => {
      csv += `${a.anio};${Math.round(a.gen)};${Math.round(a.ahorro)};${Math.round(a.opex)};${Math.round(a.recambio)};${Math.round(a.flujo)};${Math.round(a.acum)};${Math.round(a.acumDesc)}\n`;
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
    if (UI.tab === 'comparador') renderComparador();
  }

  // ---------- Formulario de datos ----------
  function renderDatos() {
    const e = UI.estado;
    const html = SECCIONES.map(sec => `
      <fieldset class="seccion">
        <legend>${sec.titulo}</legend>
        ${sec.cliente ? clienteHTML() : ''}
        <div class="grid">
          ${sec.campos.map(c => campoHTML(c, e[c.k])).join('')}
        </div>
        ${sec.impuestos ? impuestosHTML(e.impData) : ''}
      </fieldset>`).join('');
    $('#form-datos').innerHTML = html;

    $$('#form-datos [data-k]').forEach(el => {
      el.addEventListener('input', onCampo);
      el.addEventListener('change', onCampo);
    });
    $$('#form-datos [data-imp]').forEach(el => el.addEventListener('input', onImpuesto));
    const sc = $('#selCliente'); if (sc) sc.onchange = onSelCliente;
    const bc = $('#btnGuardarCliente'); if (bc) bc.onclick = guardarCliente;
    const sd = $('#selDistribuidora'); if (sd) sd.onchange = onSelDistribuidora;
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
    let input;
    if (c.t === 'select') {
      input = `<select id="${id}" data-k="${c.k}">${c.o.map(([val, lab]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    } else if (c.t === 'text') {
      input = `<input id="${id}" type="text" data-k="${c.k}" value="${esc(v)}">`;
    } else {
      input = `<div class="con-unidad"><input id="${id}" type="text" inputmode="decimal" data-k="${c.k}" value="${esc(v)}">${c.u ? `<span class="unidad">${c.u}</span>` : ''}</div>`;
    }
    return `<label class="campo" for="${id}"><span class="etiqueta">${c.l}</span>${input}</label>`;
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

    recalcular();
  }

  function onImpuesto(ev) {
    const el = ev.target, i = +el.dataset.i, campo = el.dataset.imp;
    const imps = Calc.parseImpuestos(UI.estado.impData);
    if (campo === 'nombre') imps[i].nombre = el.value;
    else imps[i].pct = Calc.num(el.value);
    UI.estado.impData = JSON.stringify(imps);
    marcarDirty();
    recalcular();
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
    const estimada = Calc.estimarGeneracion(p.kwp, p.irrad, p.pr).reduce((s, x) => s + x, 0);
    const desvio = estimada > 0 ? (r.genAnual / estimada - 1) * 100 : 0;
    $('#gen-estimada').textContent = 'Estimación por kWp × irradiación × PR: ' + fmtN(estimada) + ' kWh/año' +
      (Math.abs(desvio) > 15 && r.genAnual > 0 ? ' · ⚠ la generación cargada difiere ' + fmtPct(desvio, 0) : '');
    barChart($('#chart-energia'), r.meses, [
      { nombre: 'Generación', valores: r.gen, color: 'var(--c-gen)' },
      { nombre: 'Consumo', valores: r.con, color: 'var(--c-con)' },
    ], 'kWh');
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
    const p24 = Calc.generarPerfil24h(UI.estado);
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
    recalcular(true);
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
      ['TIR', r.tir === null ? '—' : fmtPct(r.tir * 100), 'flujo nominal, ' + p.horizonte + ' años', r.tir !== null && r.tir * 100 >= p.tasa_desc ? 'ok' : 'mal'],
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

    $('#propuesta-imprimible').innerHTML = `
      <div class="propuesta-header">
        <div class="propuesta-empresa">
          ${logoHtml}
          <h1>${esc(m.nombre)}</h1>
          <p>${esc(m.slogan)}</p>
          <p style="margin-top: 4px; font-size: 11.5px;">Asesor: <b>${esc(m.asesor)}</b> · Tel: ${esc(m.tel)} · Email: ${esc(m.email)}</p>
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
          ${p.incluirBateria ? `<div class="propuesta-fila"><span class="etq">Almacenamiento (Baterías):</span><span class="val">${fmtN(p.bat_kwh, 1)} kWh (${esc(p.bat_tipo.toUpperCase())})</span></div>` : ''}
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
  }

  function kpis(items) {
    return items.map(([t, v, s, cls]) => `<div class="kpi ${cls || ''}"><div class="kpi-t">${t}</div><div class="kpi-v">${v}</div><div class="kpi-s">${s || ''}</div></div>`).join('');
  }

  // ---------- Recalcular todo ----------
  function recalcular(sinInputsEnergia) {
    if (!UI.estado) return;
    const r = Calc.calcular(UI.estado);
    UI.res = r;
    const t = $('#impTotal'); if (t) t.textContent = fmtN(r.impTotalPct, 3) + ' %';
    $('#resumen-cabecera').innerHTML =
      `<span class="resumen-badge">⚡ ${fmtN(r.p.kwp, 2)} kWp</span>` +
      `<span class="resumen-badge">💵 ${fmtUSD(r.capexUSD)}</span>` +
      `<span class="resumen-badge">📈 Ahorro año 1: ${fmtARS(r.ahorroAnual1)}</span>` +
      `<span class="resumen-badge ${r.van >= 0 ? 'pos' : 'neg'}">VAN ${fmtARS(r.van)}</span>` +
      `<span class="resumen-badge">TIR ${r.tir === null ? '—' : fmtPct(r.tir * 100)}</span>` +
      `<span class="resumen-badge">Payback ${fmtAnios(r.payback)}</span>` +
      `<span class="resumen-badge pos">🌱 ${fmtN(r.co2AnualTon, 1)} t CO₂/año</span>` +
      (r.p.incluirBateria ? `<span class="resumen-badge" style="color:#8b5cf6;">🔋 Batería ${fmtN(r.p.bat_kwh, 1)} kWh</span>` : '');

    if (sinInputsEnergia) renderEnergiaSinInputs(r); else renderEnergia(r);
    renderResultados(r);
    renderLeasing(r);
    renderSensibilidad();
    renderPropuesta(r);
  }

  // =====================================================================
  //  Gráficos SVG (sin dependencias)
  // =====================================================================
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function niceTicks(min, max, n) {
    if (min === max) { max = min + 1; }
    const span = max - min, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const t0 = Math.floor(min / step) * step, ticks = [];
    for (let v = t0; v <= max + step * 0.5; v += step) ticks.push(v);
    return ticks;
  }
  const short = n => Math.abs(n) >= 1e9 ? fmtN(n / 1e9, 1) + ' MM' : Math.abs(n) >= 1e6 ? fmtN(n / 1e6, 1) + ' M' : Math.abs(n) >= 1e3 ? fmtN(n / 1e3, 0) + ' k' : fmtN(n, 0);

  function barChart(cont, labels, series, unidad) {
    const W = 720, H = 260, ml = 56, mr = 12, mt = 28, mb = 30;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
    const all = series.flatMap(s => s.valores);
    const ticks = niceTicks(0, Math.max(1, ...all), 5);
    const yMax = ticks[ticks.length - 1];
    const y = v => mt + (H - mt - mb) * (1 - v / yMax);
    ticks.forEach(t => {
      svg.appendChild(svgEl('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: ml - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' }, short(t)));
    });
    const n = labels.length, gw = (W - ml - mr) / n, bw = gw / (series.length + 1);
    labels.forEach((lab, i) => {
      series.forEach((s, j) => {
        const v = s.valores[i] || 0;
        const r = svgEl('rect', { x: ml + i * gw + bw / 2 + j * bw, y: y(v), width: bw - 2, height: Math.max(0, y(0) - y(v)), fill: s.color, rx: 3 });
        r.appendChild(svgEl('title', {}, `${lab} · ${s.nombre}: ${fmtN(v)} ${unidad}`));
        svg.appendChild(r);
      });
      svg.appendChild(svgEl('text', { x: ml + i * gw + gw / 2, y: H - 10, class: 'tick', 'text-anchor': 'middle' }, lab));
    });
    leyenda(svg, series, W - mr);
    cont.innerHTML = ''; cont.appendChild(svg);
  }

  function lineChart(cont, series, unidad, customXLabels) {
    const W = 720, H = 260, ml = 64, mr = 12, mt = 28, mb = 30;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
    const all = series.flatMap(s => s.valores);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 5);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const n = series[0].valores.length;
    const x = i => ml + (W - ml - mr) * (i / Math.max(1, n - 1));
    const y = v => mt + (H - mt - mb) * (1 - (v - yMin) / (yMax - yMin));
    ticks.forEach(t => {
      svg.appendChild(svgEl('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), class: t === 0 ? 'cero' : 'grid' }));
      svg.appendChild(svgEl('text', { x: ml - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' }, short(t)));
    });
    const paso = n > 20 ? 4 : n > 12 ? 2 : 1;
    for (let i = 0; i < n; i += paso) {
      const labelText = customXLabels ? customXLabels[i] : i;
      svg.appendChild(svgEl('text', { x: x(i), y: H - 10, class: 'tick', 'text-anchor': 'middle' }, labelText));
    }
    series.forEach(s => {
      const d = s.valores.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      svg.appendChild(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      s.valores.forEach((v, i) => {
        const c = svgEl('circle', { cx: x(i), cy: y(v), r: 3.5, fill: s.color });
        const xLab = customXLabels ? customXLabels[i] : `Año ${i}`;
        c.appendChild(svgEl('title', {}, `${xLab} · ${s.nombre}: ${fmtN(v, 2)} ${unidad}`));
        svg.appendChild(c);
      });
    });
    leyenda(svg, series, W - mr);
    cont.innerHTML = ''; cont.appendChild(svg);
  }

  function leyenda(svg, series, xRight) {
    let x = xRight;
    series.slice().reverse().forEach(s => {
      const w = s.nombre.length * 6.5 + 22;
      x -= w;
      svg.appendChild(svgEl('rect', { x, y: 6, width: 10, height: 10, fill: s.color, rx: 2 }));
      svg.appendChild(svgEl('text', { x: x + 14, y: 15, class: 'tick' }, s.nombre));
      x -= 10;
    });
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

  function guardarMembrete(ev) {
    ev.preventDefault();
    const m = {
      nombre: $('#cfgEmpresaNombre').value.trim(),
      slogan: $('#cfgEmpresaSlogan').value.trim(),
      asesor: $('#cfgEmpresaAsesor').value.trim(),
      tel: $('#cfgEmpresaTel').value.trim(),
      email: $('#cfgEmpresaEmail').value.trim(),
      validez: $('#cfgEmpresaValidez').value.trim() || '15',
      logo: logoBase64Temp || '',
    };
    setMembrete(m);
    cerrarMembrete();
    if (UI.res) renderPropuesta(UI.res);
    toast('Membrete y logo guardados');
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
    await cargarTodo();
    if (UI.proyectos.length) await abrir(UI.proyectos[0].id);
    else { UI.estado = null; UI.id = null; renderTodo(); }
  }

  // =====================================================================
  //  Toast
  // =====================================================================
  let toastT;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('ver');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('ver'), 2600);
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
    $('#btnImprimirPropuesta').onclick = () => window.print();
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
    if (['datos', 'energia', 'resultados', 'leasing', 'sensibilidad', 'comparador', 'propuesta'].includes(h)) UI.tab = h;

    await DB.init(window.APP_CONFIG);
    renderLoginModo();
    DB.onAuth(alCambiarUsuario);
    await alCambiarUsuario(DB.usuario());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
