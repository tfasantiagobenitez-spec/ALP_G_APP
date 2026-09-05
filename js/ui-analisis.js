/* ==========================================================================
   ui-analisis.js — Pestañas de Financiamiento y Riesgo.

   Dibuja el comparador de las cuatro alternativas de financiamiento, el detalle
   del préstamo bancario, la distribución de Monte Carlo del VAN y el diagrama
   de tornado. Publica window.UIAnalisis; app.js decide cuándo llamarlo.
   ========================================================================== */
(function (root) {
  'use strict';

  const U = root.UI0;
  const { $, fmtN, fmtARS, fmtUSD, fmtPct, fmtAnios, esc, short } = U;

  const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // =====================================================================
  //  Financiamiento
  // =====================================================================
  function renderFinanciamiento(r) {
    const cont = $('#cont-financiamiento');
    if (!cont) return;
    const filas = r.financiamiento.filas.filter(f => f.disponible);

    if (filas.length < 2) {
      cont.innerHTML = '<p class="vacio">Cargá al menos una alternativa de financiamiento en la pestaña Datos para comparar.</p>';
      $('#detalle-prestamo').innerHTML = '';
      return;
    }

    const metricas = [
      ['Desembolso inicial', f => fmtUSD(f.desembolsoInicial), 'menor'],
      ['Flujo mensual año 1', f => fmtUSD(f.flujoMensual1), 'mayor'],
      ['VAN para el cliente', f => `<b class="${f.van >= 0 ? 'pos' : 'neg'}">${fmtUSD(f.van)}</b>`, 'mayor'],
      ['TIR', f => f.tir === null ? '—' : fmtPct(f.tir * 100), 'mayor'],
      ['Repago', f => f.clave === 'ppa' ? 'Sin inversión' : fmtAnios(f.payback), 'menor'],
      ['Costo total del esquema', f => fmtUSD(f.costoTotal), 'menor'],
    ];

    let html = '<table class="tabla tabla-comparador"><thead><tr><th>Métrica</th>';
    filas.forEach(f => {
      html += `<th class="${f.mejor ? 'destacado' : ''}">${esc(f.nombre)}${f.mejor ? '<br><small>mejor VAN</small>' : ''}</th>`;
    });
    html += '</tr></thead><tbody>';

    metricas.forEach(([label, fn]) => {
      html += `<tr><td><b>${label}</b></td>`;
      filas.forEach(f => { html += `<td>${fn(f)}</td>`; });
      html += '</tr>';
    });

    html += '<tr><td><b>Cuándo conviene</b></td>';
    filas.forEach(f => { html += `<td><span class="hint">${esc(f.nota)}</span></td>`; });
    html += '</tr></tbody></table>';
    cont.innerHTML = html;

    renderDetallePrestamo(r);
  }

  function renderDetallePrestamo(r) {
    const cont = $('#detalle-prestamo');
    if (!cont) return;
    const pr = r.prestamo;
    if (!pr) { cont.innerHTML = ''; return; }

    const moneda = pr.moneda === 'usd' ? 'U$D' : '$';
    const fmtM = v => pr.enPesos ? fmtARS(v) : fmtUSD(v);
    const nombreSistema = pr.sistema === 'aleman' ? 'alemán' : 'francés';
    const nombreMoneda = pr.moneda === 'uva' ? 'pesos ajustables por UVA'
      : pr.moneda === 'ars' ? 'pesos a tasa fija' : 'dólares';

    // Las primeras doce cuotas alcanzan para ver la forma del sistema elegido
    const primeras = pr.filas.slice(0, 12);

    cont.innerHTML = `
      <h3 style="margin-top: 22px;">Detalle del préstamo bancario</h3>
      <div class="kpis">${U.kpis([
        ['Capital financiado', fmtUSD(pr.capitalUSD), fmtPct(pr.montoPct) + ' del CAPEX · ' + nombreMoneda],
        ['Aporte propio', fmtUSD(pr.aporteUSD), 'incluye ' + fmtUSD(pr.gastosUSD) + ' de gastos de otorgamiento'],
        ['Primera cuota', fmtUSD(pr.primeraCuotaUSD), pr.plazoMeses + ' cuotas, sistema ' + nombreSistema],
        ['Costo financiero total', pr.cft === null ? '—' : fmtPct(pr.cft * 100),
          'tasa nominal ' + fmtPct(pr.tasaAnual) + (pr.ajuste ? ' + ajuste ' + fmtPct(pr.ajuste) : ''),
          pr.cft !== null && pr.cft * 100 > 40 ? 'mal' : ''],
      ])}</div>
      <div class="scroll"><table class="tabla">
        <thead><tr><th>Cuota</th><th>Total (${moneda})</th><th>Interés (${moneda})</th><th>Capital (${moneda})</th><th>Saldo (${moneda})</th></tr></thead>
        <tbody>${primeras.map(f => `<tr>
          <td>${f.mes}</td>
          <td class="num">${fmtM(f.cuota)}</td>
          <td class="num">${fmtM(f.interes)}</td>
          <td class="num">${fmtM(f.amortizacion)}</td>
          <td class="num">${fmtM(f.saldo)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Se muestran las primeras 12 de ${pr.filas.length} cuotas.
        ${pr.moneda === 'uva' ? 'El capital se indexa mes a mes, por eso la cuota crece en pesos aunque la tasa sea fija.' : ''}</p>`;
  }

  // =====================================================================
  //  Riesgo
  // =====================================================================
  function renderRiesgo(mc, r) {
    const kpi = $('#kpi-riesgo');
    const chart = $('#chart-riesgo');
    if (!kpi || !chart) return;

    if (!mc) {
      kpi.innerHTML = '';
      chart.innerHTML = '<p class="vacio">Corré la simulación para ver la distribución del VAN.</p>';
      return;
    }

    const claseProb = mc.probPositivo >= 80 ? 'ok' : mc.probPositivo >= 50 ? '' : 'mal';
    kpi.innerHTML = U.kpis([
      ['Probabilidad de VAN positivo', fmtPct(mc.probPositivo), mc.n.toLocaleString('es-AR') + ' escenarios sorteados', claseProb],
      ['VAN pesimista (P10)', fmtUSD(mc.p10), 'uno de cada diez casos da peor que esto', mc.p10 >= 0 ? 'ok' : 'mal'],
      ['VAN mediano (P50)', fmtUSD(mc.p50), 'el caso central', mc.p50 >= 0 ? 'ok' : 'mal'],
      ['VAN optimista (P90)', fmtUSD(mc.p90), 'uno de cada diez casos da mejor que esto'],
      ['Dispersión', fmtUSD(mc.desvio), 'desvío estándar alrededor de ' + fmtUSD(mc.media)],
      ['TIR mediana', fmtPct(mc.tirP50 * 100), 'P10 ' + fmtPct(mc.tirP10 * 100) + ' · P90 ' + fmtPct(mc.tirP90 * 100)],
      ['Repago mediano', fmtAnios(mc.paybackP50), mc.sinRepagoPct > 0
        ? fmtPct(mc.sinRepagoPct) + ' de los casos no recupera la inversión'
        : 'todos los escenarios recuperan la inversión'],
    ]);

    U.histograma(chart, mc.histograma, {
      corte: 0,
      color: 'var(--c-gen)',
      colorNegativo: 'var(--mal)',
      etiqueta: 'VAN U$D',
      lineas: [
        { valor: 0, nombre: 'VAN 0', color: 'var(--texto-2)' },
        { valor: mc.p50, nombre: 'P50', color: 'var(--primario)' },
      ],
    });
  }

  function renderTornado(tor) {
    const chart = $('#chart-tornado');
    const tabla = $('#tabla-tornado');
    if (!chart || !tabla) return;
    if (!tor) {
      chart.innerHTML = '<p class="vacio">Corré la simulación para ver qué variable pesa más.</p>';
      tabla.innerHTML = '';
      return;
    }

    U.tornadoChart(chart, tor.filas, tor.vanBase, { color: 'var(--c-con)' });

    const unidadValor = f => f.modo === 'rel'
      ? fmtPct((f.alto / (f.base || 1) - 1) * 100, 0)
      : '±' + fmtN(f.alto - f.base, 2) + ' ' + f.unidad;

    tabla.innerHTML = `<table class="tabla">
      <thead><tr><th>Variable</th><th>Recorrido</th><th>VAN bajo</th><th>VAN alto</th><th>Amplitud</th><th>Peso</th></tr></thead>
      <tbody>${tor.filas.map(f => `<tr>
        <td><b>${esc(f.nombre)}</b><div class="hint">${esc(f.detalle)}</div></td>
        <td class="num">${unidadValor(f)}</td>
        <td class="num ${f.vanBajo < 0 ? 'neg' : ''}">${fmtUSD(f.vanBajo)}</td>
        <td class="num ${f.vanAlto < 0 ? 'neg' : ''}">${fmtUSD(f.vanAlto)}</td>
        <td class="num">${fmtUSD(f.amplitud)}</td>
        <td><div class="barra-peso"><div class="barra-peso-fill" style="width:${f.pesoRelativo.toFixed(0)}%"></div></div>
            <span class="hint">${f.pesoRelativo.toFixed(0)} %</span></td>
      </tr>`).join('')}</tbody></table>`;
  }

  // =====================================================================
  //  Energía: bandas horarias, recorte del inversor y cadenas
  // =====================================================================
  function renderBandas(r) {
    const cont = $('#cont-bandas');
    if (!cont) return;
    const p = r.p;
    if (p.tarifa_tipo !== 'bandas') {
      cont.innerHTML = '<p class="hint">La tarifa está cargada con un precio único. Elegí «bandas horarias» en la pestaña Datos ' +
        'para ver cuánta energía cae en cada banda y cuánto vale realmente el autoconsumo.</p>';
      return;
    }
    const total = r.autoPorBanda.pico + r.autoPorBanda.valle + r.autoPorBanda.resto;
    const bandas = [
      ['pico', 'Pico', p.tarifa_pico, p.banda_pico_desde, p.banda_pico_hasta],
      ['resto', 'Resto', p.tarifa_resto, p.banda_pico_hasta, p.banda_valle_desde],
      ['valle', 'Valle', p.tarifa_valle, p.banda_valle_desde, p.banda_valle_hasta],
    ];
    cont.innerHTML = `<table class="tabla">
      <thead><tr><th>Banda</th><th>Horario</th><th>Precio</th><th>Autoconsumo</th><th>% del autoconsumo</th><th>Compra a la red</th></tr></thead>
      <tbody>${bandas.map(([k, nombre, precio, desde, hasta]) => `<tr>
        <td><span class="chip chip-banda chip-${k}">${nombre}</span></td>
        <td>${String(desde).padStart(2, '0')}:00 a ${String(hasta).padStart(2, '0')}:00</td>
        <td class="num">${fmtN(precio, 2)} $/kWh</td>
        <td class="num">${fmtN(r.autoPorBanda[k])} kWh</td>
        <td class="num">${total > 0 ? fmtPct(r.autoPorBanda[k] / total * 100) : '—'}</td>
        <td class="num">${fmtN(r.redPorBanda[k])} kWh</td>
      </tr>`).join('')}</tbody></table>
      <p class="hint">El sol produce en la banda resto, no en la de pico. Por eso una tarifa con pico caro mejora poco el ahorro solar
      salvo que haya baterías que desplacen energía a la noche.</p>`;
  }

  function renderInversor(r) {
    const cont = $('#cont-inversor');
    if (!cont) return;
    const inv = r.inversor;
    const claro = inv.diaClaro;

    if (inv.potenciaAC <= 0) {
      cont.innerHTML = `<p class="hint">Cargá la potencia del inversor en la pestaña Datos para verificar la relación DC/AC,
        el recorte por potencia y la ventana de tensión de las cadenas.
        Con ${fmtN(r.p.kwp, 2)} kWp instalados, el pico en un día despejado sería de
        <b>${fmtN(claro.potenciaPicoDC, 1)} kW</b> en corriente continua.</p>`;
      return;
    }

    cont.innerHTML = `
      <div class="kpis">${U.kpis([
        ['Relación DC / AC', fmtN(inv.ratio, 2), fmtN(r.p.kwp, 2) + ' kWp sobre ' + fmtN(inv.potenciaAC, 1) + ' kW',
          inv.ratio > 1.35 ? 'mal' : inv.ratio >= 1.05 ? 'ok' : ''],
        ['Pico en día despejado', fmtN(claro.potenciaPicoDC, 1) + ' kW',
          'irradiancia de ' + fmtN(claro.irradianciaPico) + ' W/m² sobre el plano'],
        ['Recorte en día despejado', fmtPct(claro.recortePct),
          'energía que el inversor no puede convertir', claro.recortePct > 3 ? 'mal' : 'ok'],
        ['Recorte sobre el año medio', fmtN(r.clipAnual) + ' kWh',
          r.genAnual > 0 ? fmtPct(r.clipAnual / r.genAnual * 100, 2) + ' de la generación' : '—'],
        ['Cadenas', inv.serie > 0 ? inv.cadenas + ' × ' + inv.serie + ' módulos' : 'sin solución',
          'entre ' + inv.minSerie + ' y ' + inv.maxSerie + ' módulos en serie'],
        ['Ventana de tensión', fmtN(inv.vmpCaliente, 0) + ' a ' + fmtN(inv.vocFrio, 0) + ' V',
          'Vmp a ' + fmtN(inv.tCeldaCaliente, 0) + ' °C de celda · Voc a ' + fmtN(inv.tCeldaFria, 0) + ' °C'],
      ])}</div>
      ${inv.avisos.length ? `<ul class="lista-avisos">${inv.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <p class="hint">El recorte sobre el año medio siempre da menos que el del día despejado: el balance horario promedia días
      nublados y aplana el pico. Para dimensionar el inversor mandá el día despejado.</p>`;
  }

  root.UIAnalisis = {
    renderFinanciamiento,
    renderRiesgo,
    renderTornado,
    renderBandas,
    renderInversor,
    MESES_CORTOS,
  };
})(window);
