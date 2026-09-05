/* ==========================================================================
   ui-gestion.js — Gestión comercial: pipeline, revisiones congeladas,
   tablero gerencial, papelera y presupuesto por ítems.

   No toca el motor de cálculo: solo lee proyectos y escribe estados de venta.
   app.js le pasa un puente con su estado y sus acciones.
   ========================================================================== */
(function (root) {
  'use strict';

  const U = root.UI0;
  const { $, $$, fmtN, fmtARS, fmtUSD, fmtPct, fmtAnios, esc } = U;

  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const CATEGORIAS = [
    ['modulo', 'Módulos'], ['inversor', 'Inversores'], ['bateria', 'Baterías'],
    ['estructura', 'Estructura'], ['cableado', 'Cableado'], ['tablero', 'Tableros'],
    ['mano_obra', 'Mano de obra'], ['ingenieria', 'Ingeniería y trámites'], ['otro', 'Otros'],
  ];

  let app = null;          // puente con app.js
  let productos = [];      // catálogo cargado
  let revisiones = [];     // revisiones del proyecto abierto

  function init(puente) { app = puente; }

  async function cargarCatalogo() {
    try { productos = await DB.productos.list(); }
    catch (e) { console.warn('No se pudo cargar el catálogo:', e.message); productos = DB.PRODUCTOS_DEFAULT.slice(); }
  }

  function nombreCategoria(c) {
    const f = CATEGORIAS.find(x => x[0] === c);
    return f ? f[1] : c;
  }

  // =====================================================================
  //  Pipeline comercial
  // =====================================================================
  function renderPipeline() {
    renderEstadoProyecto();
    renderKanban();
    renderRevisiones();
  }

  /** Control de etapa del proyecto que está abierto. */
  function renderEstadoProyecto() {
    const cont = $('#estado-proyecto');
    if (!cont) return;
    const UI = app.UI;
    if (!UI.id) {
      cont.innerHTML = '<p class="hint">Guardá el proyecto para poder moverlo por el pipeline y congelar revisiones.</p>';
      return;
    }
    const p = UI.proyectos.find(x => x.id === UI.id) || {};
    const etapa = DB.etapaValida(p.estado_comercial);
    const esPerdida = etapa === 'perdida';

    cont.innerHTML = `
      <div class="estado-fila">
        <span class="etiqueta">Etapa de «${esc(UI.nombre || 'este proyecto')}»</span>
        <div class="etapas-selector">
          ${DB.ETAPAS.map(e => `<button type="button" class="btn btn-sm etapa-btn etapa-${e.color} ${e.clave === etapa ? 'activa' : ''}"
             data-etapa="${e.clave}" title="${esc(e.descripcion)}">${esc(e.nombre)}</button>`).join('')}
        </div>
      </div>
      <div class="estado-fila">
        <label class="campo campo-inline"><span class="etiqueta">Probabilidad de cierre</span>
          <div class="con-unidad"><input type="number" id="cfgProb" min="0" max="100" value="${p.probabilidad || DB.etapaDe(etapa).prob}"><span class="unidad">%</span></div>
        </label>
        ${esPerdida ? `<label class="campo campo-inline"><span class="etiqueta">Motivo de la pérdida</span>
          <select id="cfgMotivo">
            <option value="">— Elegir —</option>
            ${DB.MOTIVOS_PERDIDA.map(m => `<option value="${esc(m)}" ${p.motivo_perdida === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select></label>` : ''}
        <span class="hint">${p.fecha_envio ? 'Enviada el ' + DB.fechaFmt(p.fecha_envio).split(',')[0] + '. ' : ''}${p.fecha_cierre ? 'Cerrada el ' + DB.fechaFmt(p.fecha_cierre).split(',')[0] + '.' : ''}</span>
      </div>`;

    $$('#estado-proyecto [data-etapa]').forEach(b => { b.onclick = () => cambiarEtapa(UI.id, b.dataset.etapa); });
    const prob = $('#cfgProb');
    if (prob) prob.onchange = () => guardarCampoPipeline(UI.id, { probabilidad: Math.max(0, Math.min(100, +prob.value || 0)) });
    const mot = $('#cfgMotivo');
    if (mot) mot.onchange = () => guardarCampoPipeline(UI.id, { motivo_perdida: mot.value || null });
  }

  async function cambiarEtapa(id, clave) {
    const cambios = { estado_comercial: clave, probabilidad: DB.etapaDe(clave).prob };
    const ahora = new Date().toISOString();
    if (clave === 'enviada') cambios.fecha_envio = ahora;
    if (clave === 'ganada' || clave === 'perdida') cambios.fecha_cierre = ahora;
    if (clave === 'borrador') { cambios.fecha_envio = null; cambios.fecha_cierre = null; cambios.motivo_perdida = null; }
    await guardarCampoPipeline(id, cambios);
    U.toast('Proyecto movido a «' + DB.etapaDe(clave).nombre + '»');
  }

  async function guardarCampoPipeline(id, cambios) {
    if (!DB.puedeEditar()) { U.toast('Tu usuario es solo de lectura'); return; }
    try {
      await DB.proyectos.cambiarEtapa(id, cambios);
      await app.cargarTodo();
      renderPipeline();
    } catch (e) { alert('No se pudo actualizar el pipeline: ' + e.message); }
  }

  /** Tablero de columnas con todos los proyectos por etapa. */
  function renderKanban() {
    const cont = $('#cont-kanban');
    if (!cont) return;
    const proyectos = app.UI.proyectos;
    if (!proyectos.length) {
      cont.innerHTML = '<p class="vacio">No hay proyectos cargados.</p>';
      return;
    }

    cont.innerHTML = DB.ETAPAS.map(et => {
      const items = proyectos.filter(p => DB.etapaValida(p.estado_comercial) === et.clave);
      const kwp = items.reduce((s, p) => s + (parseFloat(String(p.kwp).replace(',', '.')) || 0), 0);
      return `<div class="kanban-col kanban-${et.color}">
        <div class="kanban-cab">
          <b>${esc(et.nombre)}</b>
          <span class="kanban-cuenta">${items.length}</span>
          <div class="kanban-kwp">${fmtN(kwp, 1)} kWp</div>
        </div>
        <div class="kanban-lista">
          ${items.length ? items.map(p => `
            <div class="kanban-item ${p.id === app.UI.id ? 'activo' : ''}" data-abrir="${esc(p.id)}" role="button" tabindex="0">
              <div class="kanban-nombre">${esc(p.nombre)}</div>
              <div class="kanban-resumen">${esc(p.resumen || '')}</div>
              <div class="kanban-pie">
                ${p.probabilidad ? `<span class="chip">${p.probabilidad} %</span>` : ''}
                ${p.autor ? `<span class="hint">${esc(p.autor)}</span>` : ''}
                ${p.motivo_perdida ? `<span class="hint">${esc(p.motivo_perdida)}</span>` : ''}
              </div>
            </div>`).join('') : '<div class="kanban-vacio">Sin proyectos</div>'}
        </div>
      </div>`;
    }).join('');

    $$('#cont-kanban [data-abrir]').forEach(el => {
      const abrir = () => app.abrir(el.dataset.abrir);
      el.onclick = abrir;
      el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } };
    });
  }

  // =====================================================================
  //  Revisiones congeladas
  // =====================================================================
  async function cargarRevisiones() {
    const UI = app.UI;
    if (!UI.id) { revisiones = []; return; }
    try { revisiones = await DB.propuestas.list(UI.id); }
    catch (e) { console.warn('No se pudieron cargar las revisiones:', e.message); revisiones = []; }
  }

  function renderRevisiones() {
    const cont = $('#cont-revisiones');
    if (!cont) return;
    const UI = app.UI;
    if (!UI.id) { cont.innerHTML = '<p class="hint">Guardá el proyecto para congelar revisiones.</p>'; return; }
    if (!revisiones.length) {
      cont.innerHTML = '<p class="hint">Todavía no hay revisiones congeladas. Cuando le mandes la propuesta al cliente, ' +
        'congelá una revisión: queda una copia inmutable de los números que viste, con fecha y autor.</p>';
      return;
    }

    cont.innerHTML = `<table class="tabla">
      <thead><tr><th>Revisión</th><th>Fecha</th><th>Autor</th><th>kWp</th><th>CAPEX</th><th>VAN</th><th>Payback</th><th>Nota</th><th></th></tr></thead>
      <tbody>${revisiones.map(r => {
        const s = r.resumen || {};
        return `<tr>
          <td><b>${esc(r.etiqueta)}</b></td>
          <td>${esc(DB.fechaFmt(r.creado_en))}</td>
          <td>${esc(r.autor || '—')}</td>
          <td class="num">${s.kwp !== undefined ? fmtN(s.kwp, 2) : '—'}</td>
          <td class="num">${s.capexUSD !== undefined ? fmtUSD(s.capexUSD) : '—'}</td>
          <td class="num ${s.vanUSD < 0 ? 'neg' : 'pos'}">${s.vanUSD !== undefined ? fmtUSD(s.vanUSD) : '—'}</td>
          <td class="num">${s.payback !== undefined ? fmtAnios(s.payback) : '—'}</td>
          <td>${esc(r.nota || '')}</td>
          <td><button type="button" class="btn btn-sm" data-restaurar-rev="${esc(r.id)}" title="Cargar estos parámetros en el proyecto">Recuperar</button></td>
        </tr>`;
      }).join('')}</tbody></table>
      <p class="hint">Recuperar carga los parámetros congelados en el formulario. No pisa nada hasta que guardes.</p>`;

    $$('#cont-revisiones [data-restaurar-rev]').forEach(b => {
      b.onclick = () => {
        const rev = revisiones.find(r => r.id === b.dataset.restaurarRev);
        if (!rev) return;
        if (!confirm('Vas a cargar los parámetros de «' + rev.etiqueta + '» en el formulario.\n\n' +
          'Los cambios sin guardar del proyecto actual se pierden. ¿Seguir?')) return;
        app.cargarEstado(rev.estado);
        U.toast('Parámetros de ' + rev.etiqueta + ' cargados. Guardá si querés conservarlos.');
      };
    });
  }

  async function congelarRevision() {
    const UI = app.UI;
    if (!UI.id) { U.toast('Guardá el proyecto antes de congelar una revisión'); return; }
    if (!DB.puedeEditar()) { U.toast('Tu usuario es solo de lectura'); return; }
    if (UI.dirty && !confirm('El proyecto tiene cambios sin guardar.\n\nLa revisión va a congelar lo que ves en pantalla. ¿Seguir?')) return;

    const nota = prompt('Nota de la revisión (opcional): qué cambió respecto de la anterior', '');
    if (nota === null) return;
    const r = UI.res;
    try {
      const rev = await DB.propuestas.crear(UI.id, {
        estado: UI.estado,
        nota,
        resumen: r ? {
          kwp: r.p.kwp, capexUSD: r.capexUSD, vanUSD: r.vanUSD,
          tir: r.tirUSD, payback: r.payback, ahorroAnual1: r.ahorroAnual1,
          cobertura: r.coberturaPct, moneda: r.p.moneda_analisis,
        } : null,
      });
      await cargarRevisiones();
      renderRevisiones();
      U.toast('Revisión ' + rev.etiqueta + ' congelada');
    } catch (e) { alert('No se pudo congelar la revisión: ' + e.message); }
  }

  // =====================================================================
  //  Tablero gerencial
  // =====================================================================
  function kwpDe(p) { return parseFloat(String(p.kwp).replace(',', '.')) || 0; }

  /**
   * Fecha de un proyecto en milisegundos. Usa la marca ISO cuando existe y,
   * si no, interpreta el formato "24/7/2026, 10:00:17" de los datos importados.
   * Devuelve null cuando no hay fecha utilizable, para no ubicar el proyecto en 1970.
   */
  function fechaDe(p) {
    if (p.actualizado_en) {
      const d = new Date(p.actualizado_en);
      if (!isNaN(d)) return d.getTime();
    }
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(p.fecha || ''));
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      if (!isNaN(d)) return d.getTime();
    }
    return null;
  }

  function metricas(proyectos) {
    const porEtapa = {};
    DB.ETAPAS.forEach(e => { porEtapa[e.clave] = { n: 0, kwp: 0, usd: 0 }; });
    let kwpTotal = 0, usdTotal = 0;

    const calculados = proyectos.map(p => {
      let r = null;
      try { r = p.estado ? Calc.calcular(p.estado) : null; } catch (e) { r = null; }
      const kwp = kwpDe(p);
      const usd = r ? r.capexUSD : 0;
      const et = DB.etapaValida(p.estado_comercial);
      porEtapa[et].n++; porEtapa[et].kwp += kwp; porEtapa[et].usd += usd;
      kwpTotal += kwp; usdTotal += usd;
      return { p, r, kwp, usd, etapa: et };
    });

    const cerrados = calculados.filter(c => c.etapa === 'ganada' || c.etapa === 'perdida');
    const ganados = calculados.filter(c => c.etapa === 'ganada');
    const abiertos = calculados.filter(c => ['borrador', 'enviada', 'negociacion'].indexOf(c.etapa) >= 0);

    return {
      calculados, porEtapa, kwpTotal, usdTotal,
      conversion: cerrados.length ? ganados.length / cerrados.length * 100 : null,
      ticketMedio: calculados.length ? usdTotal / calculados.length : 0,
      kwpMedio: calculados.length ? kwpTotal / calculados.length : 0,
      // Valor esperado del pipeline abierto, ponderado por probabilidad de cierre
      pipelinePonderado: abiertos.reduce((s, c) => s + c.usd * ((c.p.probabilidad || DB.etapaDe(c.etapa).prob) / 100), 0),
      ganadosUSD: ganados.reduce((s, c) => s + c.usd, 0),
      ganadosKwp: ganados.reduce((s, c) => s + c.kwp, 0),
      abiertos, ganados, cerrados,
    };
  }

  function renderTablero() {
    const proyectos = app.UI.proyectos;
    const kpi = $('#kpi-tablero');
    if (!kpi) return;
    if (!proyectos.length) {
      kpi.innerHTML = '';
      $('#cont-embudo').innerHTML = '<p class="vacio">No hay proyectos cargados.</p>';
      return;
    }

    const m = metricas(proyectos);

    kpi.innerHTML = U.kpis([
      ['Proyectos', fmtN(proyectos.length), m.abiertos.length + ' abiertos · ' + m.ganados.length + ' ganados'],
      ['Potencia cotizada', fmtN(m.kwpTotal, 1) + ' kWp', 'promedio ' + fmtN(m.kwpMedio, 1) + ' kWp por proyecto'],
      ['Monto cotizado', fmtUSD(m.usdTotal), 'ticket medio ' + fmtUSD(m.ticketMedio)],
      ['Pipeline ponderado', fmtUSD(m.pipelinePonderado), 'lo abierto por su probabilidad de cierre'],
      ['Tasa de conversión', m.conversion === null ? '—' : fmtPct(m.conversion),
        m.cerrados.length ? m.ganados.length + ' de ' + m.cerrados.length + ' cerrados' : 'todavía no cerró ninguno',
        m.conversion !== null && m.conversion >= 30 ? 'ok' : ''],
      ['Ganado', fmtUSD(m.ganadosUSD), fmtN(m.ganadosKwp, 1) + ' kWp firmados', 'ok'],
    ]);

    renderEmbudo(m);
    renderPorMes(m);
    renderAgrupado('#tabla-provincia', m, c => (c.r && c.r.p.cliente_ubicacion) || 'Sin ubicación', 'Ubicación');
    renderAgrupado('#tabla-vendedor', m, c => c.p.autor || 'Sin asignar', 'Responsable');
    renderAlertas(m);
  }

  function renderEmbudo(m) {
    const cont = $('#cont-embudo');
    if (!cont) return;
    const max = Math.max.apply(null, DB.ETAPAS.map(e => m.porEtapa[e.clave].usd).concat([1]));
    cont.innerHTML = `<div class="embudo">${DB.ETAPAS.map(e => {
      const d = m.porEtapa[e.clave];
      return `<div class="embudo-fila">
        <span class="embudo-nombre">${esc(e.nombre)}</span>
        <div class="embudo-barra"><div class="embudo-fill embudo-${e.color}" style="width:${(d.usd / max * 100).toFixed(1)}%"></div></div>
        <span class="embudo-valor">${fmtUSD(d.usd)}</span>
        <span class="embudo-cuenta">${d.n}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function renderPorMes(m) {
    const cont = $('#chart-tablero-mes');
    if (!cont) return;
    // Últimos doce meses según la fecha de última edición del proyecto
    const hoy = new Date();
    const claves = [], etiquetas = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      claves.push(d.getFullYear() + '-' + d.getMonth());
      etiquetas.push(MESES[d.getMonth()] + (d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''));
    }
    const kwpMes = new Array(12).fill(0), ganadoMes = new Array(12).fill(0);
    let fuera = 0;
    m.calculados.forEach(c => {
      const ms = fechaDe(c.p);
      if (ms === null) { fuera++; return; }
      const f = new Date(ms);
      const i = claves.indexOf(f.getFullYear() + '-' + f.getMonth());
      if (i < 0) { fuera++; return; }
      kwpMes[i] += c.kwp;
      if (c.etapa === 'ganada') ganadoMes[i] += c.kwp;
    });
    U.barChart(cont, etiquetas, [
      { nombre: 'Cotizado', valores: kwpMes, color: 'var(--c-con)' },
      { nombre: 'Ganado', valores: ganadoMes, color: 'var(--ok)' },
    ], 'kWp');
    if (fuera) {
      const nota = document.createElement('p');
      nota.className = 'hint';
      nota.textContent = fuera + (fuera === 1 ? ' proyecto queda' : ' proyectos quedan') +
        ' fuera del gráfico por tener fecha anterior a los últimos doce meses o no tener fecha.';
      cont.appendChild(nota);
    }
  }

  function renderAgrupado(selector, m, clave, titulo) {
    const cont = $(selector);
    if (!cont) return;
    const grupos = {};
    m.calculados.forEach(c => {
      const k = clave(c) || '—';
      if (!grupos[k]) grupos[k] = { n: 0, kwp: 0, usd: 0, ganados: 0 };
      grupos[k].n++; grupos[k].kwp += c.kwp; grupos[k].usd += c.usd;
      if (c.etapa === 'ganada') grupos[k].ganados++;
    });
    const filas = Object.keys(grupos).map(k => Object.assign({ k }, grupos[k])).sort((a, b) => b.usd - a.usd);
    cont.innerHTML = `<table class="tabla">
      <thead><tr><th>${titulo}</th><th>Proyectos</th><th>kWp</th><th>Monto</th><th>Ganados</th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td>${esc(f.k)}</td><td class="num">${f.n}</td>
        <td class="num">${fmtN(f.kwp, 1)}</td><td class="num">${fmtUSD(f.usd)}</td>
        <td class="num">${f.ganados}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  /** Lo que necesita una decisión hoy: ofertas vencidas, proyectos frenados y sin etapa. */
  function renderAlertas(m) {
    const cont = $('#cont-alertas');
    if (!cont) return;
    const hoy = Date.now();
    const dias = ms => Math.floor((hoy - ms) / 86400000);
    const alertas = [];

    m.calculados.forEach(c => {
      const p = c.p;
      const validez = parseInt((app.membrete() || {}).validez, 10) || 15;
      if (p.estado_comercial === 'enviada' && p.fecha_envio) {
        const d = dias(new Date(p.fecha_envio).getTime());
        if (d > validez) {
          alertas.push({ nivel: 'aviso', id: p.id, texto: `«${p.nombre}» se envió hace ${d} días y la oferta valía ${validez}. Está vencida.` });
        }
      }
      const ultima = fechaDe(p);
      if (['borrador', 'enviada', 'negociacion'].indexOf(c.etapa) >= 0 && ultima !== null) {
        const d = dias(ultima);
        if (d > 45) alertas.push({ nivel: 'aviso', id: p.id, texto: `«${p.nombre}» no se toca hace ${d} días y sigue abierto.` });
      }
      if (c.etapa === 'perdida' && !p.motivo_perdida) {
        alertas.push({ nivel: 'info', id: p.id, texto: `«${p.nombre}» está perdida y no tiene motivo cargado.` });
      }
      if (c.r && c.r.vanUSD < 0 && c.etapa !== 'perdida') {
        alertas.push({ nivel: 'info', id: p.id, texto: `«${p.nombre}» tiene VAN negativo (${fmtUSD(c.r.vanUSD)}) y sigue en el pipeline.` });
      }
    });

    if (!alertas.length) {
      cont.innerHTML = '<div class="aviso aviso-ok"><b>Nada pendiente.</b> Ningún proyecto está vencido, frenado ni sin motivo de pérdida.</div>';
      return;
    }
    cont.innerHTML = `<ul class="lista-alertas">${alertas.map(a => `
      <li class="alerta alerta-${a.nivel}">
        <span>${esc(a.texto)}</span>
        <button type="button" class="btn btn-sm" data-abrir-alerta="${esc(a.id)}">Abrir</button>
      </li>`).join('')}</ul>`;
    $$('#cont-alertas [data-abrir-alerta]').forEach(b => { b.onclick = () => app.abrir(b.dataset.abrirAlerta); });
  }

  // =====================================================================
  //  Papelera
  // =====================================================================
  async function abrirPapelera() {
    let borrados = [];
    try { borrados = await DB.proyectos.list({ papelera: true }); }
    catch (e) { alert('No se pudo abrir la papelera: ' + e.message); return; }

    const cont = $('#papeleraCuerpo');
    const modal = $('#modalPapelera');
    if (!cont || !modal) return;

    cont.innerHTML = borrados.length
      ? `<table class="tabla">
          <thead><tr><th>Proyecto</th><th>Eliminado</th><th></th></tr></thead>
          <tbody>${borrados.map(p => `<tr>
            <td><b>${esc(p.nombre)}</b><div class="hint">${esc(p.resumen || '')}</div></td>
            <td>${esc(DB.fechaFmt(p.eliminado_en))}</td>
            <td class="fila-acciones">
              <button type="button" class="btn btn-sm" data-restaurar="${esc(p.id)}">Restaurar</button>
              <button type="button" class="btn btn-sm btn-peligro" data-purgar="${esc(p.id)}">Borrar definitivo</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<p class="hint">La papelera está vacía. Los proyectos eliminados quedan acá hasta que los borres definitivamente.</p>';

    $$('#papeleraCuerpo [data-restaurar]').forEach(b => {
      b.onclick = async () => {
        try {
          await DB.proyectos.restaurar(b.dataset.restaurar);
          await app.cargarTodo();
          await abrirPapelera();
          U.toast('Proyecto restaurado');
        } catch (e) { alert('No se pudo restaurar: ' + e.message); }
      };
    });
    $$('#papeleraCuerpo [data-purgar]').forEach(b => {
      b.onclick = async () => {
        if (!confirm('Borrar definitivamente este proyecto y todas sus revisiones.\n\nEsto no se puede deshacer. ¿Seguir?')) return;
        try {
          await DB.proyectos.purgar(b.dataset.purgar);
          await abrirPapelera();
          U.toast('Proyecto borrado definitivamente');
        } catch (e) { alert('No se pudo borrar: ' + e.message); }
      };
    });

    modal.hidden = false;
  }

  function cerrarPapelera() { const m = $('#modalPapelera'); if (m) m.hidden = true; }

  // =====================================================================
  //  Presupuesto por ítems
  // =====================================================================
  function bomHTML(estado) {
    const bom = Calc.parseBom(estado.bom);
    const activo = estado.bom_activo === 'si';
    const kwp = Calc.num(estado.kwp);
    const total = Calc.totalBom(bom, kwp);

    const opciones = CATEGORIAS.map(([c, nombre]) => {
      const items = productos.filter(p => p.categoria === c);
      if (!items.length) return '';
      return `<optgroup label="${esc(nombre)}">${items.map(p =>
        `<option value="${esc(p.id)}">${esc(p.marca)} ${esc(p.modelo)} · U$D ${p.precio_usd} / ${esc(p.unidad)}</option>`
      ).join('')}</optgroup>`;
    }).join('');

    return `<div class="bom">
      <div class="fila-acciones">
        <label class="campo campo-inline"><span class="etiqueta">Precio del sistema</span>
          <select id="bomActivo">
            <option value="no" ${activo ? '' : 'selected'}>Cargar U$D/kWp a mano</option>
            <option value="si" ${activo ? 'selected' : ''}>Calcular desde el presupuesto por ítems</option>
          </select>
        </label>
        <label class="campo campo-inline"><span class="etiqueta">Agregar del catálogo</span>
          <select id="bomAgregar"><option value="">— Elegir equipo o servicio —</option>${opciones}</select>
        </label>
        <button type="button" class="btn btn-sm" id="bomLibre">＋ Ítem libre</button>
        <button type="button" class="btn btn-sm" id="bomSugerir" title="Arma un presupuesto tentativo con la potencia y el tipo de instalación cargados">✨ Sugerir</button>
      </div>
      ${bom.length ? `<div class="scroll"><table class="tabla tabla-bom">
        <thead><tr><th>Categoría</th><th>Descripción</th><th>Cant.</th><th>Unidad</th><th>U$D unitario</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>${bom.map((it, i) => `<tr>
          <td>${esc(nombreCategoria(it.categoria))}</td>
          <td><input type="text" data-bom="descripcion" data-i="${i}" value="${esc(it.descripcion)}"></td>
          <td><input type="text" inputmode="decimal" class="num" data-bom="cantidad" data-i="${i}" value="${esc(it.cantidad)}" ${it.unidad === 'kWp' ? 'disabled title="Se cobra por kWp instalado"' : ''}></td>
          <td>${esc(it.unidad)}</td>
          <td><input type="text" inputmode="decimal" class="num" data-bom="precioUsd" data-i="${i}" value="${esc(it.precioUsd)}"></td>
          <td class="num" data-bom-sub="${i}">${fmtUSD(it.precioUsd * (it.unidad === 'kWp' ? kwp : it.cantidad))}</td>
          <td><button type="button" class="btn btn-sm btn-peligro" data-bom-quitar="${i}" title="Quitar">✕</button></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr class="total">
          <td colspan="5">Total del presupuesto</td>
          <td class="num" id="bomTotal">${fmtUSD(total)}</td><td></td>
        </tr>
        <tr><td colspan="5">Precio unitario resultante</td>
          <td class="num" id="bomUnitario">${kwp > 0 ? fmtN(total / kwp, 2) + ' U$D/kWp' : '—'}</td><td></td>
        </tr></tfoot>
      </table></div>` : '<p class="hint">Sin ítems cargados. Agregá equipos del catálogo o pedí una sugerencia para armar el presupuesto.</p>'}
      ${activo ? '<p class="hint">El precio por kWp de la sección de generación pasa a ser el resultado de este presupuesto.</p>' : ''}
    </div>`;
  }

  function conectarBom() {
    const sel = $('#bomActivo');
    if (sel) sel.onchange = () => { app.setCampo('bom_activo', sel.value); };

    const agregar = $('#bomAgregar');
    if (agregar) agregar.onchange = () => {
      const prod = productos.find(p => String(p.id) === agregar.value);
      agregar.value = '';
      if (!prod) return;
      const bom = Calc.parseBom(app.UI.estado.bom);
      bom.push({
        productoId: String(prod.id), categoria: prod.categoria,
        descripcion: (prod.marca ? prod.marca + ' ' : '') + prod.modelo,
        unidad: prod.unidad === 'kWp' ? 'kWp' : 'u.',
        cantidad: prod.unidad === 'kWp' ? 1 : cantidadSugerida(prod),
        precioUsd: Number(prod.precio_usd) || 0,
      });
      app.setCampo('bom', JSON.stringify(bom));
    };

    const libre = $('#bomLibre');
    if (libre) libre.onclick = () => {
      const bom = Calc.parseBom(app.UI.estado.bom);
      bom.push({ productoId: '', categoria: 'otro', descripcion: 'Ítem sin catálogo', unidad: 'u.', cantidad: 1, precioUsd: 0 });
      app.setCampo('bom', JSON.stringify(bom));
    };

    const sug = $('#bomSugerir');
    if (sug) sug.onclick = sugerirBom;

    $$('[data-bom]').forEach(el => {
      el.addEventListener('change', () => {
        const bom = Calc.parseBom(app.UI.estado.bom);
        const i = +el.dataset.i, campo = el.dataset.bom;
        if (!bom[i]) return;
        bom[i][campo] = campo === 'descripcion' ? el.value : Calc.num(el.value);
        app.setCampo('bom', JSON.stringify(bom));
      });
    });

    $$('[data-bom-quitar]').forEach(b => {
      b.onclick = () => {
        const bom = Calc.parseBom(app.UI.estado.bom);
        bom.splice(+b.dataset.bomQuitar, 1);
        app.setCampo('bom', JSON.stringify(bom));
      };
    });
  }

  /**
   * Actualiza los subtotales del presupuesto sin volver a construir la tabla,
   * para que los ítems cobrados por kWp sigan a la potencia mientras se escribe.
   */
  function refrescarTotales(estado) {
    if (!$('#bomTotal')) return;
    const bom = Calc.parseBom(estado.bom);
    const kwp = Calc.num(estado.kwp);
    const total = Calc.totalBom(bom, kwp);
    bom.forEach((it, i) => {
      const celda = $('[data-bom-sub="' + i + '"]');
      if (celda) celda.textContent = fmtUSD(it.precioUsd * (it.unidad === 'kWp' ? kwp : it.cantidad));
    });
    $('#bomTotal').textContent = fmtUSD(total);
    const unit = $('#bomUnitario');
    if (unit) unit.textContent = kwp > 0 ? fmtN(total / kwp, 2) + ' U$D/kWp' : '—';
  }

  function cantidadSugerida(prod) {
    const p = Calc.normalizar(app.UI.estado);
    if (prod.categoria === 'modulo' && prod.specs && prod.specs.wp) {
      return Math.max(1, Math.round(p.kwp * 1000 / prod.specs.wp));
    }
    if (prod.categoria === 'inversor' && prod.specs && prod.specs.potencia_ac) {
      return Math.max(1, Math.ceil(p.kwp / 1.2 / prod.specs.potencia_ac));
    }
    if (prod.categoria === 'bateria' && prod.specs && prod.specs.kwh) {
      return p.incluirBateria ? Math.max(1, Math.ceil(p.bat_kwh / prod.specs.kwh)) : 1;
    }
    return 1;
  }

  /** Arma un presupuesto tentativo coherente con la potencia y la cubierta del proyecto. */
  function sugerirBom() {
    const p = Calc.normalizar(app.UI.estado);
    if (p.kwp <= 0) { U.toast('Cargá primero la potencia del sistema'); return; }
    const bom = [];
    const agregar = (categoria, filtro) => {
      const cands = productos.filter(x => x.categoria === categoria && (!filtro || filtro(x)));
      if (!cands.length) return;
      const prod = cands[0];
      bom.push({
        productoId: String(prod.id), categoria: prod.categoria,
        descripcion: (prod.marca ? prod.marca + ' ' : '') + prod.modelo,
        unidad: prod.unidad === 'kWp' ? 'kWp' : 'u.',
        cantidad: prod.unidad === 'kWp' ? 1 : cantidadSugerida(prod),
        precioUsd: Number(prod.precio_usd) || 0,
      });
    };

    // El módulo que mejor se acerque a la potencia unitaria cargada en el proyecto
    const modulos = productos.filter(x => x.categoria === 'modulo' && x.specs && x.specs.wp);
    if (modulos.length) {
      const mejor = modulos.reduce((a, b) =>
        Math.abs(b.specs.wp - p.panel_w) < Math.abs(a.specs.wp - p.panel_w) ? b : a);
      agregar('modulo', x => x.id === mejor.id);
    }
    // Inversor que cubra la potencia con la menor cantidad de equipos
    const inversores = productos.filter(x => x.categoria === 'inversor' && x.specs && x.specs.potencia_ac);
    if (inversores.length) {
      const objetivo = p.kwp / 1.2;
      const mejor = inversores.reduce((a, b) => {
        const ca = Math.ceil(objetivo / a.specs.potencia_ac), cb = Math.ceil(objetivo / b.specs.potencia_ac);
        return cb < ca || (cb === ca && b.specs.potencia_ac < a.specs.potencia_ac) ? b : a;
      });
      agregar('inversor', x => x.id === mejor.id);
    }
    if (p.incluirBateria) agregar('bateria');
    const cubierta = p.tipoInst === 'losa' ? 'losa' : p.tipoInst === 'tierra' ? 'tierra' : 'chapa';
    agregar('estructura', x => x.modelo.toLowerCase().indexOf(cubierta === 'chapa' ? 'chapa' : cubierta === 'losa' ? 'losa' : 'tierra') >= 0);
    agregar('cableado');
    agregar('tablero');
    agregar('mano_obra');
    agregar('ingenieria');

    app.setCampo('bom', JSON.stringify(bom), { bom_activo: 'si' });
    U.toast('Presupuesto sugerido con ' + bom.length + ' ítems. Ajustá cantidades y precios.');
  }

  root.UIGestion = {
    init,
    cargarCatalogo,
    cargarRevisiones,
    renderPipeline,
    renderRevisiones,
    renderTablero,
    congelarRevision,
    abrirPapelera,
    cerrarPapelera,
    bomHTML,
    conectarBom,
    refrescarTotales,
    metricas,
    CATEGORIAS,
  };
})(window);
