/* ==========================================================================
   ui-comun.js — Piezas de interfaz que comparten todos los módulos:
   selectores, formato de números argentino, escapado de HTML, tarjetas de
   indicadores, gráficos SVG sin dependencias y avisos flotantes.

   Se carga antes que el resto de la interfaz y publica window.UI0.
   ========================================================================== */
(function (root) {
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
  const esc = s => String(s === undefined || s === null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Abrevia magnitudes grandes: 1.234.567 → "1,2 M". */
  const short = n => Math.abs(n) >= 1e9 ? fmtN(n / 1e9, 1) + ' MM'
    : Math.abs(n) >= 1e6 ? fmtN(n / 1e6, 1) + ' M'
      : Math.abs(n) >= 1e3 ? fmtN(n / 1e3, 0) + ' k' : fmtN(n, 0);

  /** Tarjetas de indicadores: [título, valor, subtítulo, clase]. */
  function kpis(items) {
    return items.map(([t, v, s, cls]) =>
      `<div class="kpi ${cls || ''}"><div class="kpi-t">${t}</div><div class="kpi-v">${v}</div><div class="kpi-s">${s || ''}</div></div>`
    ).join('');
  }

  // ---------- Gráficos SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** Marcas de eje "redondas" dentro del rango pedido. */
  function niceTicks(min, max, n) {
    if (min === max) { max = min + 1; }
    const span = max - min, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const t0 = Math.floor(min / step) * step, ticks = [];
    for (let v = t0; v <= max + step * 0.5; v += step) ticks.push(v);
    return ticks;
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
      svg.appendChild(svgEl('text', { x: x(i), y: H - 10, class: 'tick', 'text-anchor': 'middle' },
        customXLabels ? customXLabels[i] : i));
    }
    series.forEach(s => {
      const d = s.valores.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      svg.appendChild(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      s.valores.forEach((v, i) => {
        const c = svgEl('circle', { cx: x(i), cy: y(v), r: 3.5, fill: s.color });
        c.appendChild(svgEl('title', {}, `${customXLabels ? customXLabels[i] : 'Año ' + i} · ${s.nombre}: ${fmtN(v, 2)} ${unidad}`));
        svg.appendChild(c);
      });
    });
    leyenda(svg, series, W - mr);
    cont.innerHTML = ''; cont.appendChild(svg);
  }

  /**
   * Histograma vertical con una línea de referencia opcional (por ejemplo el VAN cero).
   * bins: [{desde, hasta, n}]
   */
  function histograma(cont, bins, opciones) {
    const o = opciones || {};
    const W = 720, H = 250, ml = 46, mr = 12, mt = 30, mb = 34;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
    if (!bins.length) { cont.innerHTML = ''; cont.appendChild(svg); return; }

    const maxN = Math.max.apply(null, bins.map(b => b.n));
    const min = bins[0].desde, max = bins[bins.length - 1].hasta;
    const x = v => ml + (W - ml - mr) * ((v - min) / ((max - min) || 1));
    const y = n => mt + (H - mt - mb) * (1 - n / (maxN || 1));

    niceTicks(0, maxN, 4).forEach(t => {
      svg.appendChild(svgEl('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), class: 'grid' }));
      svg.appendChild(svgEl('text', { x: ml - 6, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' }, short(t)));
    });

    bins.forEach(b => {
      const x0 = x(b.desde), x1 = x(b.hasta);
      const negativo = b.hasta <= (o.corte === undefined ? 0 : o.corte);
      const r = svgEl('rect', {
        x: x0 + 0.5, y: y(b.n), width: Math.max(1, x1 - x0 - 1), height: Math.max(0, y(0) - y(b.n)),
        fill: negativo ? (o.colorNegativo || 'var(--mal)') : (o.color || 'var(--c-gen)'), rx: 1,
      });
      r.appendChild(svgEl('title', {}, `${o.etiqueta || ''} ${short(b.desde)} a ${short(b.hasta)}: ${b.n} casos`));
      svg.appendChild(r);
    });

    // Marcas del eje horizontal
    niceTicks(min, max, 5).forEach(t => {
      if (t < min || t > max) return;
      svg.appendChild(svgEl('text', { x: x(t), y: H - 12, class: 'tick', 'text-anchor': 'middle' }, short(t)));
    });

    // Las etiquetas se escalonan cuando dos líneas caen cerca, para que no se pisen
    const puestas = [];
    (o.lineas || []).forEach(l => {
      if (l.valor < min || l.valor > max) return;
      const px = x(l.valor);
      let nivel = 0;
      while (puestas.some(p => p.nivel === nivel && Math.abs(p.x - px) < 46)) nivel++;
      puestas.push({ x: px, nivel });
      svg.appendChild(svgEl('line', {
        x1: px, x2: px, y1: mt - nivel * 11, y2: y(0),
        stroke: l.color || 'var(--texto)', 'stroke-width': 1.5, 'stroke-dasharray': '4,3',
      }));
      svg.appendChild(svgEl('text', {
        x: px, y: mt - 4 - nivel * 11, class: 'tick', 'text-anchor': 'middle', fill: l.color || 'var(--texto)',
      }, l.nombre));
    });

    cont.innerHTML = ''; cont.appendChild(svg);
  }

  /**
   * Diagrama de tornado: barras horizontales centradas en el valor base,
   * ordenadas por cuánto mueven el resultado.
   */
  function tornadoChart(cont, filas, base, opciones) {
    const o = opciones || {};
    const alto = 34, ml = 190, mr = 70, mt = 26;
    const H = mt + filas.length * alto + 16, W = 720;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
    if (!filas.length) { cont.innerHTML = ''; cont.appendChild(svg); return; }

    const todos = filas.reduce((a, f) => a.concat([f.vanBajo, f.vanAlto]), [base]);
    const min = Math.min.apply(null, todos), max = Math.max.apply(null, todos);
    const span = (max - min) || 1;
    const x = v => ml + (W - ml - mr) * ((v - min) / span);

    svg.appendChild(svgEl('line', {
      x1: x(base), x2: x(base), y1: mt - 8, y2: H - 10,
      stroke: 'var(--texto-2)', 'stroke-width': 1.5, 'stroke-dasharray': '3,3',
    }));
    svg.appendChild(svgEl('text', { x: x(base), y: mt - 12, class: 'tick', 'text-anchor': 'middle' },
      'base ' + short(base)));

    filas.forEach((f, i) => {
      const yc = mt + i * alto + alto / 2;
      const xa = x(f.vanBajo), xb = x(f.vanAlto);
      const izq = Math.min(xa, xb), ancho = Math.abs(xb - xa);
      svg.appendChild(svgEl('text', { x: ml - 10, y: yc + 4, class: 'tick', 'text-anchor': 'end' }, f.nombre));
      const r = svgEl('rect', {
        x: izq, y: yc - 10, width: Math.max(2, ancho), height: 20,
        fill: o.color || 'var(--c-con)', rx: 3, opacity: 0.85,
      });
      r.appendChild(svgEl('title', {}, `${f.nombre}: de ${short(f.vanBajo)} a ${short(f.vanAlto)}`));
      svg.appendChild(r);
      svg.appendChild(svgEl('text', { x: W - mr + 6, y: yc + 4, class: 'tick' }, short(f.amplitud)));
    });

    cont.innerHTML = ''; cont.appendChild(svg);
  }

  // ---------- Aviso flotante ----------
  let toastT;
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('ver');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('ver'), 2600);
  }

  /** Espacia las llamadas para no recalcular en cada tecla. */
  function debounce(fn, ms) {
    let t;
    const envuelta = function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
    envuelta.cancelar = () => clearTimeout(t);
    envuelta.yaMismo = function () { clearTimeout(t); fn.apply(this, arguments); };
    return envuelta;
  }

  root.UI0 = {
    $, $$,
    fmtN, fmtARS, fmtUSD, fmtPct, fmtAnios, esc, short,
    kpis, svgEl, niceTicks, leyenda,
    barChart, lineChart, histograma, tornadoChart,
    toast, debounce,
  };
})(window);
