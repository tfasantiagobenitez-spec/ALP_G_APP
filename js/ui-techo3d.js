/* ==========================================================================
   ui-techo3d.js — Interfaz de Usuario para Diseñador Satelital 3D y Cierre 90s
   ALP GROUP Simulador Fotovoltaico.
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UITecho3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let mapa = null;
  let capaSatelital = null;
  let capaEtiquetas = null;
  let capaOSM = null;
  let capaPoligono = null;
  let capaPaneles = null;
  let capaObstaculos = null;

  // Estado local del diseñador
  const state = {
    lat: -34.4250, // Coordenadas por defecto (Parque Industrial Pilar / Buenos Aires)
    lng: -58.9550,
    zoom: 18,
    puntosPoligono: [], // [[lat, lng], ...]
    obstaculos: [],     // [{ id, lat, lng, radio, alturaRelativa, tipo }]
    modoDibujo: 'techo', // 'techo' | 'obstaculo' | 'vista'
    tipoNave: 'industrial', // 'industrial' (8m) | 'comercio' (6m) | 'losa' (10m) | 'suelo' (0m)
    tipoEstructura: 'coplanar', // 'coplanar' (chapa) | 'triangulos' (losa/suelo)
    alturaNaveM: 8.0,
    tipoCubierta: 'dos_aguas', // 'dos_aguas' | 'un_agua' | 'plano'
    potenciaPanelWp: 575,
    orientacionPanel: 'portrait', // 'portrait' | 'landscape'
    inclinacionDeg: 15,
    azimutManual: null,
    distribucion: null, // Resultado de Techo3D.distribuirPaneles
    nasaData: null,
    perdidaSombrasAnualPct: 0,
    threePanelMeshes: [], // [{ mesh, defaultMat, shadowMat, panelData }]
    // Estado 3D (Three.js)
    threeScene: null,
    threeCamera: null,
    threeRenderer: null,
    threeControls: null,
    threeSunLight: null,
    threeBuildingGroup: null,
    horaSimulacion: 12.0,
    mesSimulacion: 0, // Enero
    animandoSol: false,
    animInterval: null
  };

  /**
   * Inicializa la vista y el mapa al entrar en la pestaña.
   */
  function init() {
    const cont = document.getElementById('pane-techo3d');
    if (!cont) return;

    if (!cont.dataset.inicializado) {
      renderEstructura(cont);
      initMapa();
      initThree3D();
      vincularEventos();
      cont.dataset.inicializado = 'true';
    } else {
      // Si ya estaba inicializado, refrescar tamaño del mapa y del canvas 3D
      setTimeout(() => {
        if (mapa) mapa.invalidateSize();
        ajustarTamanoThree();
      }, 150);
    }
  }

  /**
   * Renderiza el esqueleto HTML de la pestaña
   */
  function renderEstructura(cont) {
    cont.innerHTML = `
      <div class="techo3d-header">
        <div class="techo3d-busqueda">
          <div class="con-icono-busqueda">
            <input type="text" id="techoDireccion" placeholder="Ingresá dirección, parque industrial o ciudad (ej: Parque Industrial Pilar)…" autocomplete="off">
            <button type="button" class="btn btn-primario btn-sm" id="btnBuscarDireccion">🔍 Buscar</button>
            <button type="button" class="btn btn-sm" id="btnMiUbicacion" title="Usar mi ubicación GPS actual">📍 Mi GPS</button>
          </div>
          <div class="techo3d-presets">
            <span class="etiqueta-dim">Plantillas 90s:</span>
            <button type="button" class="btn btn-xs" id="btnPresetNaveGrande">🏭 Nave 1.200 m²</button>
            <button type="button" class="btn btn-xs" id="btnPresetComercio">🏢 Comercial 450 m²</button>
            <button type="button" class="btn btn-xs" id="btnPresetLosa">🏬 Losa Plana 300 m²</button>
          </div>
        </div>

        <div class="techo3d-tabs-visor">
          <button type="button" class="btn btn-sm btn-subtab activa" data-subtab="dual">🌓 Vista Dual (2D + 3D)</button>
          <button type="button" class="btn btn-sm btn-subtab" data-subtab="mapa">🗺️ Satélite 2D</button>
          <button type="button" class="btn btn-sm btn-subtab" data-subtab="3d">🧊 Gemelo 3D</button>
        </div>
      </div>

      <!-- Contenedor Principal: Paneles Visores y Barra Lateral -->
      <div class="techo3d-cuerpo">
        
        <!-- Visores (2D Map + 3D Three.js) -->
        <div class="techo3d-visores-grid modo-dual" id="contVisoresGrid">
          
          <!-- Visor 2D Satelital -->
          <div class="techo3d-visor-box" id="boxVisor2D">
            <div class="visor-badge">🗺️ Satélite Alta Resolución (Esri World Imagery)</div>
            <div id="mapaTecho" class="mapa-leaflet-cont"></div>
            <div class="mapa-toolbar">
              <button type="button" class="btn btn-sm btn-destacado" id="btnAutoDetectarTecho" title="Detectar automáticamente la huella del edificio en el centro del mapa con OpenStreetMap">🪄 Auto-Detectar</button>
              <button type="button" class="btn btn-sm btn-primario" id="btnHerramientaTecho" title="Trazar contorno del techo haciendo clics en las esquinas">✏️ Trazar Techo</button>
              <button type="button" class="btn btn-sm" id="btnCerrarTecho" style="display:none; background:#10b981; color:#fff; font-weight:700; border-color:#059669; box-shadow:0 0 8px rgba(16,185,129,0.5);" title="Finalizar trazado del techo">✅ Listo / Cerrar Techo</button>
              <button type="button" class="btn btn-sm" id="btnHerramientaObstaculo" title="Marcar chimeneas, domos o árboles">🚫 Añadir Obstáculo</button>
              <button type="button" class="btn btn-sm" id="btnLimpiarTecho" title="Borrar trazado actual">🗑️ Limpiar</button>
              <span class="toolbar-separador">|</span>
              <select id="selCapaMapa" class="select-sm" style="font-size:11.5px; padding:3px 6px; border-radius:4px; background:var(--bg); color:var(--texto); border:1px solid var(--borde);">
                <option value="hibrido" selected>🛰️ Satélite + Calles</option>
                <option value="satelital">🛰️ Satélite Puro</option>
                <option value="calles">🏙️ Calles (OSM)</option>
              </select>
            </div>
          </div>

          <!-- Visor 3D WebGL con Three.js -->
          <div class="techo3d-visor-box" id="boxVisor3D">
            <div class="visor-badge">🧊 Gemelo 3D + Sombras Solares en Tiempo Real</div>
            <div class="visor-3d-cam-tools">
              <button type="button" class="btn-cam" id="btnCamTop" title="Vista Cenital (Planta)">🛰️ Planta</button>
              <button type="button" class="btn-cam" id="btnCamIso" title="Vista Isométrica 45°">📐 Isométrica</button>
              <button type="button" class="btn-cam" id="btnCamFront" title="Vista Frontal / Rasante">🌅 Frontal</button>
              <button type="button" class="btn-cam" id="btnCamReset" title="Restablecer Vista">🔄 Reset</button>
            </div>
            <div id="canvas3dCont" class="canvas-3d-cont"></div>
            
            <!-- Barra de control solar astronómico -->
            <div class="solar-time-bar">
              <div class="solar-ctrl-item">
                <span style="font-size: 15px;">☀️</span>
                <label for="sliderHoraSolar">Hora:</label>
                <input type="range" id="sliderHoraSolar" min="6" max="19" step="0.25" value="12">
                <strong id="labelHoraSolar">12:00 hs</strong>
              </div>
              <div class="solar-ctrl-item">
                <label for="selMesSolar">Mes:</label>
                <select id="selMesSolar" class="select-sm">
                  <option value="0">Enero (Verano)</option>
                  <option value="1">Febrero</option>
                  <option value="2">Marzo (Equinoccio)</option>
                  <option value="3">Abril</option>
                  <option value="4">Mayo</option>
                  <option value="5">Junio (Solsticio Invierno)</option>
                  <option value="6">Julio</option>
                  <option value="7">Agosto</option>
                  <option value="8">Septiembre (Equinoccio)</option>
                  <option value="9">Octubre</option>
                  <option value="10">Noviembre</option>
                  <option value="11">Diciembre (Solsticio Verano)</option>
                </select>
              </div>
              <button type="button" class="btn btn-xs btn-primario" id="btnAnimarSol" title="Ver animación de sombras a lo largo del día">▶ Animar Día</button>
              <div class="solar-elev-badge" id="badgeElevacionSolar">Alt: 65° | Az: 0°</div>
            </div>
          </div>

        </div>

        <!-- Panel Lateral: Parámetros del Sistema y Cierre Express en 90s -->
        <aside class="techo3d-sidebar">
          
          <div class="sidebar-bloque">
            <h3 class="sidebar-titulo">📐 Parámetros de la Nave</h3>
            <div class="grid-2col">
              <label class="campo">
                <span class="etiqueta">Tipo de Inmueble</span>
                <select id="selTipoNave">
                  <option value="industrial">🏭 Nave Industrial (Chapa)</option>
                  <option value="comercial">🏢 Galpón Comercial</option>
                  <option value="losa">🏬 Losa Plana de Hormigón</option>
                  <option value="suelo">🌾 Terreno / Suelo Industrial</option>
                </select>
              </label>
              <label class="campo">
                <span class="etiqueta">Tipo de Cubierta</span>
                <select id="selTipoCubierta">
                  <option value="dos_aguas" selected>⛰️ Dos Aguas (Cumbrera)</option>
                  <option value="un_agua">📐 Un Agua (Inclinado)</option>
                  <option value="plano">🏢 Losa Plana / Parapeto</option>
                </select>
              </label>
            </div>

            <div class="grid-2col">
              <label class="campo">
                <span class="etiqueta">Estructura</span>
                <select id="selTipoEstructura">
                  <option value="coplanar" selected>Coplanar (Chapa / Teja)</option>
                  <option value="triangulos">Triángulos Inclinados (Losa / Suelo)</option>
                </select>
              </label>
              <label class="campo">
                <span class="etiqueta">Altura Alero</span>
                <div class="con-unidad"><input type="number" id="inpAlturaNave" value="8" min="2" max="30" step="0.5"><span class="unidad">m</span></div>
              </label>
            </div>

            <div class="grid-2col">
              <label class="campo">
                <span class="etiqueta">Potencia Módulo</span>
                <select id="selPotenciaPanel">
                  <option value="575" selected>575 Wp (Topcon Monocristalino)</option>
                  <option value="600">600 Wp (Alta Densidad)</option>
                  <option value="550">550 Wp (Estándar Pyme)</option>
                </select>
              </label>
              <label class="campo">
                <span class="etiqueta">Disposición</span>
                <select id="selOrientacionPanel">
                  <option value="portrait" selected>Vertical (Portrait)</option>
                  <option value="landscape">Horizontal (Landscape)</option>
                </select>
              </label>
            </div>

            <div class="grid-2col">
              <label class="campo">
                <span class="etiqueta">Inclinación Techo</span>
                <div class="con-unidad"><input type="number" id="inpInclinacionTecho" value="15" min="0" max="60"><span class="unidad">°</span></div>
              </label>
              <label class="campo">
                <span class="etiqueta">Azimut (Norte = 0°)</span>
                <div class="con-unidad"><input type="number" id="inpAzimutTecho" value="0" min="0" max="359"><span class="unidad">°</span></div>
              </label>
            </div>
            
            <div style="margin-top: 6px;">
              <button type="button" class="btn btn-sm btn-bloque" id="btnRecalcularLayout">⚡ Auto-Optimizar Disposición de Paneles</button>
            </div>
          </div>

          <!-- Métricas de Dimensionamiento Físico -->
          <div class="sidebar-bloque">
            <h3 class="sidebar-titulo">📊 Métricas del Arreglo Solar</h3>
            <div class="metricas-techo-grid">
              <div class="metrica-item">
                <div class="metrica-val" id="valAreaTecho">0 m²</div>
                <div class="metrica-lbl">Área del Techo</div>
              </div>
              <div class="metrica-item">
                <div class="metrica-val" id="valCantidadPaneles">0</div>
                <div class="metrica-lbl">Módulos Solares</div>
              </div>
              <div class="metrica-item">
                <div class="metrica-val valor-destacado" id="valPotenciaKwp">0 kWp</div>
                <div class="metrica-lbl">Potencia Pico</div>
              </div>
              <div class="metrica-item">
                <div class="metrica-val" id="valOcupacionTecho">0%</div>
                <div class="metrica-lbl">Ocupación Útil</div>
              </div>
            </div>
            <div class="metrica-clima-info" id="boxClimaInfo">
              <span>☀️ <strong>Radiación Satelital:</strong> Calculando NASA POWER / Local…</span>
            </div>
            <div class="metrica-sombra-info" id="boxSombrasInfo">
              <span>🌥️ <strong>Sombras:</strong> 0% en esta hora · Pérdida Anual Est.: 0%</span>
            </div>
          </div>

          <!-- Gestión Interactiva de Obstáculos -->
          <div class="sidebar-bloque" id="bloqueObstaculos">
            <div class="sidebar-titulo-con-accion">
              <h3 class="sidebar-titulo" style="margin-bottom:0;">🚫 Obstáculos & Sombras (<span id="countObstaculos">0</span>)</h3>
              <button type="button" class="btn btn-xs" id="btnAddObsManual" title="Agregar obstáculo en el centro del techo">+ Agregar</button>
            </div>
            <div id="listaObstaculosCont" class="lista-obstaculos-cont">
              <div class="obstaculos-vacio">No hay obstáculos trazados. Hacé clic en [ 🚫 Añadir Obstáculo ] en el mapa o en [+ Agregar].</div>
            </div>
          </div>

          <!-- CIERRE COMERCIAL EN 90 SEGUNDOS: LEASING VS AHORRO -->
          <div class="sidebar-bloque bloque-cierre-90s">
            <div class="cierre-header">
              <span style="font-size: 18px;">⚡</span>
              <div>
                <strong>Cierre Financiero Express (90s)</strong>
                <small style="display: block; color: var(--texto-2);">Leasing no bancario vs. Ahorro en Factura</small>
              </div>
            </div>

            <div class="cierre-kpis-grid">
              <div class="cierre-card ahorro">
                <div class="cierre-sub">Ahorro Eléctrico Proyectado</div>
                <div class="cierre-monto" id="valAhorroMensual">U$D 0 /mes</div>
                <small id="valAhorroAnual">0 kWh/año generados</small>
              </div>
              <div class="cierre-card cuota">
                <div class="cierre-sub">Cuota Leasing ALP Group</div>
                <div class="cierre-monto" id="valCuotaLeasing">U$D 0 /mes</div>
                <small>Plazo 60 meses · Sin banco</small>
              </div>
            </div>

            <!-- Veredicto de Cierre -->
            <div class="cierre-veredicto" id="boxVeredictoLeasing">
              <div class="veredicto-titulo" id="veredictoTitulo">✨ Flujo de Caja Positivo</div>
              <div class="veredicto-desc" id="veredictoDesc">El sistema se paga al 100% con el ahorro generado desde el primer mes.</div>
            </div>

            <!-- Acciones Rápidas para el Comercial de Campo -->
            <div class="cierre-acciones">
              <button type="button" class="btn btn-primario btn-sm btn-bloque" id="btnAplicarAlProyecto">
                ⚡ Aplicar al Proyecto Completo
              </button>
              <div class="cierre-btn-group">
                <button type="button" class="btn btn-sm btn-whatsapp" id="btnWhatsappExpress" title="Enviar cotización resumida por WhatsApp">
                  💬 WhatsApp
                </button>
                <button type="button" class="btn btn-sm" id="btnDescargarRender" title="Descargar imagen 3D para el cliente">
                  📸 Foto 3D
                </button>
              </div>
            </div>
          </div>

        </aside>
      </div>
    `;
  }

  /**
   * Inicializa el mapa Leaflet con la capa satelital de Esri
   */
  function initMapa() {
    if (typeof L === 'undefined') {
      console.warn('Leaflet no está cargado');
      return;
    }

    const mapDiv = document.getElementById('mapaTecho');
    if (!mapDiv) return;

    mapa = L.map('mapaTecho', {
      center: [state.lat, state.lng],
      zoom: state.zoom,
      maxZoom: 21,
      attributionControl: false
    });

    // Capa satelital de alta resolución (Esri World Imagery)
    capaSatelital = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 19,
      maxZoom: 21
    }).addTo(mapa);

    // Capa de nombres de calles y fronteras (Esri Reference)
    capaEtiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 19,
      maxZoom: 21
    }).addTo(mapa);

    // Capa OpenStreetMap estándar
    capaOSM = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    });

    // Grupos de capas
    capaPoligono = L.layerGroup().addTo(mapa);
    capaPaneles = L.layerGroup().addTo(mapa);
    capaObstaculos = L.layerGroup().addTo(mapa);

    // Evento de clic en el mapa para trazar
    mapa.on('click', onMapaClick);

    // Cargar plantilla inicial por defecto para demostración inmediata en 90s
    cargarPreset('industrial');
  }

  /**
   * Cierra el polígono del techo y finaliza el modo dibujo
   */
  function cerrarTecho() {
    state.modoDibujo = 'vista';
    if (mapa && mapa.doubleClickZoom) {
      mapa.doubleClickZoom.enable();
    }
    const btnT = document.getElementById('btnHerramientaTecho');
    if (btnT) {
      btnT.className = 'btn btn-sm btn-primario';
      btnT.textContent = '✏️ Trazar Techo';
    }
    const btnCerrar = document.getElementById('btnCerrarTecho');
    if (btnCerrar) btnCerrar.style.display = 'none';

    // Si el último punto quedó muy cerca del primero (< 30m o < 60px), remover el punto espurio generado al intentar cliquear el tooltip/marcador
    if (state.puntosPoligono.length > 3) {
      const p0 = state.puntosPoligono[0];
      const pUltimo = state.puntosPoligono[state.puntosPoligono.length - 1];
      const distM = Math.hypot((pUltimo[0] - p0[0]) * 111132, (pUltimo[1] - p0[1]) * 111132 * Math.cos(p0[0] * Math.PI / 180));
      if (distM < 30) {
        state.puntosPoligono.pop();
      }
    }

    actualizarTrazadoEnMapa();
    actualizarDimensionamiento();
    if (typeof window.toast === 'function') {
      window.toast('✨ Techo cerrado y dimensionado con éxito');
    }
  }

  /**
   * Manejador de clics en el mapa para trazar el polígono o agregar obstáculos
   */
  function onMapaClick(e) {
    if (state.modoDibujo === 'techo') {
      // 1. Si ya tenemos al menos 3 vértices, detectar si el clic fue sobre o cerca del vértice 1 (o en su tooltip)
      if (state.puntosPoligono.length >= 3) {
        const p0 = state.puntosPoligono[0];
        const distM = Math.hypot(
          (e.latlng.lat - p0[0]) * 111132,
          (e.latlng.lng - p0[1]) * 111132 * Math.cos(p0[0] * Math.PI / 180)
        );
        let distPx = Infinity;
        if (mapa) {
          const ptClick = mapa.latLngToContainerPoint(e.latlng);
          const pt0 = mapa.latLngToContainerPoint(p0);
          distPx = Math.hypot(ptClick.x - pt0.x, ptClick.y - pt0.y);
        }

        // Si el clic está a menos de 50px de pantalla o a menos de 20 metros en terreno:
        // El usuario quiso cerrar el polígono haciendo clic en el punto 1 o en su tooltip
        if (distPx <= 50 || distM <= 20) {
          cerrarTecho();
          return;
        }
      }

      // 2. Si el nuevo punto está a más de 1.5 km de los puntos previos, reiniciar polígono
      if (state.puntosPoligono.length > 0) {
        const p0 = state.puntosPoligono[0];
        const distAproxM = Math.hypot((e.latlng.lat - p0[0]) * 111132, (e.latlng.lng - p0[1]) * 111132 * Math.cos(p0[0] * Math.PI / 180));
        if (distAproxM > 1500) {
          state.puntosPoligono = [];
        }
      }

      // 3. Ignorar clics repetidos en el mismo punto exacto (< 2m)
      if (state.puntosPoligono.length > 0) {
        const pLast = state.puntosPoligono[state.puntosPoligono.length - 1];
        const distLastM = Math.hypot(
          (e.latlng.lat - pLast[0]) * 111132,
          (e.latlng.lng - pLast[1]) * 111132 * Math.cos(pLast[0] * Math.PI / 180)
        );
        if (distLastM < 2.0) {
          return;
        }
      }

      state.puntosPoligono.push([e.latlng.lat, e.latlng.lng]);
      actualizarTrazadoEnMapa();
      if (state.puntosPoligono.length >= 3) {
        actualizarDimensionamiento();
      }
    } else if (state.modoDibujo === 'obstaculo') {
      state.obstaculos.push({
        id: 'obs_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        radio: 2.5,
        alturaRelativa: 3.5,
        tipo: 'arbol'
      });
      actualizarObstaculosEnMapa();
      actualizarDimensionamiento();
    }
  }

  /**
   * Dibuja y actualiza el polígono del techo en el mapa Leaflet
   */
  function actualizarTrazadoEnMapa() {
    if (!capaPoligono) return;
    capaPoligono.clearLayers();

    // Actualizar botones de la barra superior
    const btnCerrar = document.getElementById('btnCerrarTecho');
    const btnT = document.getElementById('btnHerramientaTecho');
    if (state.modoDibujo === 'techo') {
      if (btnT) btnT.textContent = state.puntosPoligono.length > 0 ? `✏️ Trazando (${state.puntosPoligono.length} esquinas)` : '✏️ Trazar Techo';
      if (btnCerrar) btnCerrar.style.display = state.puntosPoligono.length >= 3 ? 'inline-block' : 'none';
    } else {
      if (btnT) btnT.textContent = '✏️ Trazar Techo';
      if (btnCerrar) btnCerrar.style.display = 'none';
    }

    if (state.puntosPoligono.length === 0) return;

    // Marcadores de vértices
    state.puntosPoligono.forEach((pt, idx) => {
      const esPrimero = idx === 0;
      const icon = L.divIcon({
        className: 'vertice-marker',
        html: `<div style="background:${esPrimero ? '#10b981' : '#2563eb'}; width:${esPrimero ? 20 : 16}px; height:${esPrimero ? 20 : 16}px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 8px rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; color:#fff; font-size:${esPrimero ? 10.5 : 9.5}px; font-weight:800; cursor:pointer;">${idx + 1}</div>`,
        iconSize: [esPrimero ? 20 : 16, esPrimero ? 20 : 16],
        iconAnchor: [esPrimero ? 10 : 8, esPrimero ? 10 : 8]
      });
      const marker = L.marker(pt, { icon }).addTo(capaPoligono);

      if (esPrimero && state.puntosPoligono.length >= 3 && state.modoDibujo === 'techo') {
        marker.bindTooltip(
          '<div style="cursor:pointer; font-weight:700; font-size:12px; padding:2px 6px;">✅ Clic acá para cerrar el techo</div>',
          { permanent: true, direction: 'top', offset: [0, -12], interactive: true }
        );
        marker.on('click', (ev) => {
          if (ev && ev.originalEvent) ev.originalEvent.stopPropagation();
          cerrarTecho();
        });
        const tt = marker.getTooltip();
        if (tt) {
          tt.on('click', (ev) => {
            if (ev && ev.originalEvent) ev.originalEvent.stopPropagation();
            cerrarTecho();
          });
        }
      }
    });

    // Línea o polígono cerrado
    if (state.puntosPoligono.length >= 3) {
      const esModoDibujo = state.modoDibujo === 'techo';
      L.polygon(state.puntosPoligono, {
        color: esModoDibujo ? '#3b82f6' : '#10b981',
        weight: esModoDibujo ? 3 : 2,
        fillColor: esModoDibujo ? '#60a5fa' : '#10b981',
        fillOpacity: esModoDibujo ? 0.25 : 0.1,
        dashArray: esModoDibujo ? '4, 4' : null
      }).addTo(capaPoligono);
    } else if (state.puntosPoligono.length === 2) {
      L.polyline(state.puntosPoligono, {
        color: '#3b82f6',
        weight: 3
      }).addTo(capaPoligono);
    }
  }

  /**
   * Dibuja los obstáculos en el mapa y actualiza la lista lateral
   */
  function actualizarObstaculosEnMapa() {
    if (!capaObstaculos) return;
    capaObstaculos.clearLayers();

    state.obstaculos.forEach((obs, idx) => {
      const tipoDef = (Techo3D.TIPOS_OBSTACULO && Techo3D.TIPOS_OBSTACULO[obs.tipo]) || { nombre: '🚫 Obstáculo', colorHex: 0xef4444 };
      const colorHex = '#' + tipoDef.colorHex.toString(16).padStart(6, '0');
      const circ = L.circle([obs.lat, obs.lng], {
        radius: obs.radio || 2.5,
        color: colorHex,
        fillColor: colorHex,
        fillOpacity: 0.45,
        weight: 2
      }).addTo(capaObstaculos);

      circ.bindTooltip(`${tipoDef.nombre} (r=${obs.radio || 2.5}m, h=${obs.alturaRelativa || 3.5}m)`, {
        direction: 'top',
        offset: [0, -5]
      });
    });

    renderizarListaObstaculos();
  }

  /**
   * Renderiza la lista interactiva de obstáculos en el panel lateral
   */
  function renderizarListaObstaculos() {
    const cont = document.getElementById('listaObstaculosCont');
    const countEl = document.getElementById('countObstaculos');
    if (countEl) countEl.textContent = state.obstaculos.length;
    if (!cont) return;

    if (state.obstaculos.length === 0) {
      cont.innerHTML = `<div class="obstaculos-vacio">No hay obstáculos trazados. Hacé clic en [ 🚫 Añadir Obstáculo ] en el mapa o en [+ Agregar].</div>`;
      return;
    }

    let html = '';
    state.obstaculos.forEach((obs, idx) => {
      const tipoDef = (Techo3D.TIPOS_OBSTACULO && Techo3D.TIPOS_OBSTACULO[obs.tipo]) || { nombre: '🚫 Obstáculo' };
      const icono = tipoDef.nombre.split(' ')[0] || '🚫';
      html += `
        <div class="obstaculo-item">
          <span class="obstaculo-icono">${icono}</span>
          <select class="select-obs-tipo select-sm" data-idx="${idx}" style="font-size:11px; padding:2px 4px; border-radius:3px; background:var(--panel); color:var(--texto); border:1px solid var(--borde);">
            <option value="arbol" ${obs.tipo === 'arbol' ? 'selected' : ''}>🌳 Árbol</option>
            <option value="chimenea" ${obs.tipo === 'chimenea' ? 'selected' : ''}>🏭 Chimenea</option>
            <option value="hvac" ${obs.tipo === 'hvac' ? 'selected' : ''}>❄️ HVAC</option>
            <option value="domo" ${obs.tipo === 'domo' ? 'selected' : ''}>🪟 Domo</option>
            <option value="antena" ${obs.tipo === 'antena' ? 'selected' : ''}>🗼 Antena</option>
          </select>
          <div class="obstaculo-dims">
            <span>R:</span>
            <input type="number" class="inp-obs-r" data-idx="${idx}" value="${obs.radio || 2.5}" min="0.3" max="20" step="0.5" title="Radio de seguridad (m)">
            <span>H:</span>
            <input type="number" class="inp-obs-h" data-idx="${idx}" value="${obs.alturaRelativa || 3.5}" min="0.5" max="30" step="0.5" title="Altura del obstáculo (m)">
          </div>
          <button type="button" class="btn-del-obs" data-idx="${idx}" title="Eliminar este obstáculo">🗑️</button>
        </div>
      `;
    });
    cont.innerHTML = html;

    // Vincular eventos de la lista
    cont.querySelectorAll('.select-obs-tipo').forEach(sel => {
      sel.addEventListener('change', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        if (state.obstaculos[i]) {
          state.obstaculos[i].tipo = e.target.value;
          actualizarObstaculosEnMapa();
          actualizarDimensionamiento();
        }
      });
    });

    cont.querySelectorAll('.inp-obs-r').forEach(inp => {
      inp.addEventListener('change', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        if (state.obstaculos[i]) {
          state.obstaculos[i].radio = Math.max(0.3, parseFloat(e.target.value) || 2.5);
          actualizarObstaculosEnMapa();
          actualizarDimensionamiento();
        }
      });
    });

    cont.querySelectorAll('.inp-obs-h').forEach(inp => {
      inp.addEventListener('change', e => {
        const i = parseInt(e.target.dataset.idx, 10);
        if (state.obstaculos[i]) {
          state.obstaculos[i].alturaRelativa = Math.max(0.5, parseFloat(e.target.value) || 3.5);
          actualizarDimensionamiento();
        }
      });
    });

    cont.querySelectorAll('.btn-del-obs').forEach(btn => {
      btn.addEventListener('click', e => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        state.obstaculos.splice(i, 1);
        actualizarObstaculosEnMapa();
        actualizarDimensionamiento();
      });
    });
  }

  /**
   * Dibuja los paneles solares resultantes del auto-layout sobre el mapa 2D
   */
  function dibujarPanelesEnMapa(resultado, centro, mPorLat, mPorLng) {
    if (!capaPaneles) return;
    capaPaneles.clearLayers();

    if (!resultado || !resultado.paneles || resultado.paneles.length === 0) return;

    resultado.paneles.forEach(p => {
      // 4 esquinas del panel en metros
      const cosR = Math.cos(p.rotacionRad);
      const sinR = Math.sin(p.rotacionRad);
      const hw = p.ancho / 2;
      const hh = p.alto / 2;

      const esquinasMetros = [
        { x: p.x + (-hw * cosR - -hh * sinR), y: p.y + (-hw * sinR + -hh * cosR) },
        { x: p.x + ( hw * cosR - -hh * sinR), y: p.y + ( hw * sinR + -hh * cosR) },
        { x: p.x + ( hw * cosR -  hh * sinR), y: p.y + ( hw * sinR +  hh * cosR) },
        { x: p.x + (-hw * cosR -  hh * sinR), y: p.y + (-hw * sinR +  hh * cosR) }
      ];

      // Convertir esquinas a [lat, lng]
      const esquinasLatLng = esquinasMetros.map(e => [
        centro.lat + (e.y / mPorLat),
        centro.lng + (e.x / mPorLng)
      ]);

      L.polygon(esquinasLatLng, {
        color: '#1d4ed8',
        weight: 1,
        fillColor: '#1e3a8a',
        fillOpacity: 0.85
      }).addTo(capaPaneles);
    });
  }

  /**
   * Ejecuta el auto-layout geométrico y actualiza los cálculos y el 3D
   */
  function actualizarDimensionamiento() {
    if (state.puntosPoligono.length < 3) {
      limpiarMetricas();
      if (capaPaneles) capaPaneles.clearLayers();
      actualizarEscena3D(null, null);
      return;
    }

    // 1. Proyectar a coordenadas métricas planas
    const { puntos: puntosMetros, centro, mPorLat, mPorLng } = Techo3D.proyectarMetros(state.puntosPoligono);

    // 2. Obstáculos en metros
    const obstaculosMetros = state.obstaculos.map(o => ({
      x: (o.lng - centro.lng) * mPorLng,
      y: (o.lat - centro.lat) * mPorLat,
      radio: o.radio || 2.5,
      alturaRelativa: o.alturaRelativa || 3.5,
      tipo: o.tipo || 'arbol'
    }));

    // 3. Opciones de empaquetado y cálculo de pitch anti-sombras
    const esTriangulos = state.tipoEstructura === 'triangulos' || state.tipoNave === 'losa' || state.tipoNave === 'suelo';
    let espacioFilas = 0.15;
    if (esTriangulos && state.inclinacionDeg > 5) {
      const pitch = Techo3D.calcularPitchOptimo(centro.lat, state.inclinacionDeg, null, state.orientacionPanel);
      espacioFilas = pitch.espacioEntreFilas;
    }

    const opciones = {
      potenciaWp: state.potenciaPanelWp,
      orientacion: state.orientacionPanel,
      inclinacionTecho: state.inclinacionDeg,
      espacioEntreFilas: espacioFilas,
      azimutManual: state.azimutManual
    };

    // 4. Distribuir módulos
    const res = Techo3D.distribuirPaneles(puntosMetros, obstaculosMetros, opciones);
    state.distribucion = res;

    // 4.b. Estimar pérdida anual por sombras con los obstáculos presentes
    state.perdidaSombrasAnualPct = Techo3D.estimarPerdidaSombrasAnual(
      res.paneles,
      obstaculosMetros,
      centro.lat,
      centro.lng,
      state.alturaNaveM || 8.0
    );

    // Actualizar azimut en UI si fue automático
    const inpAz = document.getElementById('inpAzimutTecho');
    if (inpAz && state.azimutManual === null) {
      inpAz.value = res.azimutDeg;
    }

    // 5. Dibujar en mapa 2D
    dibujarPanelesEnMapa(res, centro, mPorLat, mPorLng);

    // 6. Actualizar métricas en pantalla
    const valArea = document.getElementById('valAreaTecho');
    const valPaneles = document.getElementById('valCantidadPaneles');
    const valPot = document.getElementById('valPotenciaKwp');
    const valOcup = document.getElementById('valOcupacionTecho');

    if (valArea) valArea.textContent = `${res.areaTotalTecho} m²`;
    if (valPaneles) valPaneles.textContent = `${res.count} u.`;
    if (valPot) valPot.textContent = `${res.potenciaKwp} kWp`;
    if (valOcup) valOcup.textContent = `${res.factorOcupacionPct}%`;

    // 7. Cierre financiero express en 90 segundos
    actualizarCierreExpress(res.potenciaKwp);

    // 8. Actualizar gemelo 3D y sombras solares
    actualizarEscena3D(puntosMetros, res);
    actualizarPosicionSolar3D();

    // 9. Consultar radiación NASA POWER para la ubicación
    consultarNasaPower(centro.lat, centro.lng);
  }

  /**
   * Cálculo de métricas financieras de leasing y ahorro en 90 segundos
   */
  function actualizarCierreExpress(potenciaKwp) {
    if (!potenciaKwp || potenciaKwp <= 0) {
      limpiarMetricasFinancieras();
      return;
    }

    // Tomar tarifa y parámetros del proyecto actual si existen
    const tarifaUsd = (window.UI && UI.estado && UI.estado.tarifaARS && UI.estado.tipoCambioARS)
      ? (UI.estado.tarifaARS / UI.estado.tipoCambioARS)
      : 0.115;

    const leasing = Techo3D.calcularLeasingExpress(potenciaKwp, {
      tarifaUsdKwh: Math.max(0.06, tarifaUsd)
    });

    const elAhorro = document.getElementById('valAhorroMensual');
    const elGen = document.getElementById('valAhorroAnual');
    const elCuota = document.getElementById('valCuotaLeasing');
    const elTitulo = document.getElementById('veredictoTitulo');
    const elDesc = document.getElementById('veredictoDesc');
    const elBox = document.getElementById('boxVeredictoLeasing');

    if (elAhorro) elAhorro.textContent = `U$D ${fmtNum(leasing.ahorroMensualUsd)} /mes`;
    if (elGen) elGen.textContent = `${fmtNum(leasing.generacionAnualKwh)} kWh/año generados`;
    if (elCuota) elCuota.textContent = `U$D ${fmtNum(leasing.cuotaLeasingMensualUsd)} /mes`;

    if (elBox) {
      if (leasing.sePagaSolo) {
        elBox.className = 'cierre-veredicto exito';
        if (elTitulo) elTitulo.textContent = `✨ Flujo Positivo (+U$D ${fmtNum(leasing.flujoNetoMensualUsd)}/mes)`;
        if (elDesc) elDesc.textContent = `El ahorro eléctrico en factura supera la cuota del leasing (${leasing.coberturaCuotaPct}% de cobertura). ¡El cliente gana dinero desde el mes 1 sin inversión inicial!`;
      } else {
        elBox.className = 'cierre-veredicto neutro';
        const dif = Math.abs(leasing.flujoNetoMensualUsd);
        if (elTitulo) elTitulo.textContent = `⚖️ Cobertura del ${leasing.coberturaCuotaPct}% de la Cuota`;
        if (elDesc) elDesc.textContent = `El ahorro mensual cubre casi la totalidad de la cuota (diferencial neto: solo U$D ${fmtNum(dif)}/mes) capitalizando una planta de U$D ${fmtNum(leasing.capexTotalUsd)}.`;
      }
    }
  }

  function limpiarMetricas() {
    const ids = ['valAreaTecho', 'valCantidadPaneles', 'valPotenciaKwp', 'valOcupacionTecho'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });
    limpiarMetricasFinancieras();
  }

  function limpiarMetricasFinancieras() {
    const elAhorro = document.getElementById('valAhorroMensual');
    const elGen = document.getElementById('valAhorroAnual');
    const elCuota = document.getElementById('valCuotaLeasing');
    const elTitulo = document.getElementById('veredictoTitulo');
    const elDesc = document.getElementById('veredictoDesc');
    if (elAhorro) elAhorro.textContent = 'U$D 0 /mes';
    if (elGen) elGen.textContent = '0 kWh/año';
    if (elCuota) elCuota.textContent = 'U$D 0 /mes';
    if (elTitulo) elTitulo.textContent = 'Sin diseño cargado';
    if (elDesc) elDesc.textContent = 'Trazá el techo en el mapa o cargá una plantilla rápida para calcular.';
  }

  /**
   * Consulta asíncrona a la API de NASA POWER
   */
  async function consultarNasaPower(lat, lng) {
    const box = document.getElementById('boxClimaInfo');
    if (!box) return;

    box.innerHTML = `<span>⏳ Consultando base satelital NASA POWER…</span>`;
    const data = await Techo3D.fetchNasaPower(lat, lng);
    state.nasaData = data;

    if (data.ok) {
      box.innerHTML = `<span>☀️ <strong>NASA POWER:</strong> ${data.anualPromedio.toFixed(2)} kWh/m²·día promedio (${data.fuente})</span>`;
    } else {
      box.innerHTML = `<span>☀️ <strong>Modelo Solar:</strong> ${data.anualPromedio.toFixed(2)} kWh/m²·día (${data.fuente})</span>`;
    }
  }

  // =========================================================================
  // MOTOR 3D WEBGL (THREE.JS) CON SOMBRAS DINÁMICAS
  // =========================================================================

  function initThree3D() {
    const cont = document.getElementById('canvas3dCont');
    if (!cont || typeof THREE === 'undefined') return;

    // Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Fondo oscuro moderno

    // Cámara
    const width = cont.clientWidth || 500;
    const height = cont.clientHeight || 400;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 1000);
    camera.position.set(0, -50, 45);
    camera.up.set(0, 0, 1); // Eje Z hacia arriba (estándar arquitectónico)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    cont.appendChild(renderer.domElement);

    // Controles de órbita
    let controls = null;
    if (typeof THREE.OrbitControls !== 'undefined') {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.02; // No descender por debajo del suelo
    }

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Luz solar directa con sombras
    const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 250;
    const d = 60;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Suelo infinito
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    // Rejilla de referencia
    const grid = new THREE.GridHelper(150, 30, 0x3b82f6, 0x334155);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    // Grupo para el edificio y paneles
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    state.threeScene = scene;
    state.threeCamera = camera;
    state.threeRenderer = renderer;
    state.threeControls = controls;
    state.threeSunLight = sunLight;
    state.threeBuildingGroup = buildingGroup;

    // Loop de animación
    function animate() {
      requestAnimationFrame(animate);
      if (controls) controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Actualizar posición solar inicial
    actualizarPosicionSolar3D();
  }

  function ajustarTamanoThree() {
    const cont = document.getElementById('canvas3dCont');
    if (!cont || !state.threeRenderer || !state.threeCamera) return;
    const width = cont.clientWidth;
    const height = cont.clientHeight;
    if (width && height) {
      state.threeCamera.aspect = width / height;
      state.threeCamera.updateProjectionMatrix();
      state.threeRenderer.setSize(width, height);
    }
  }

  /**
   * Actualiza la posición 3D de la luz del sol según la fecha y hora seleccionadas
   */
  function actualizarPosicionSolar3D() {
    if (!state.threeSunLight) return;

    const lat = state.lat;
    const lng = state.lng;
    const mes = state.mesSimulacion;
    const hora = state.horaSimulacion;

    const pos = Techo3D.calcularPosicionSolar(lat, lng, mes, hora);

    const badge = document.getElementById('badgeElevacionSolar');
    if (badge) {
      if (pos.esDeDia) {
        badge.textContent = `Elev: ${pos.elevacionDeg}° | Az: ${pos.azimutDeg}° (De día)`;
        badge.style.color = '#fbbf24';
      } else {
        badge.textContent = `Elev: ${pos.elevacionDeg}° | Noche`;
        badge.style.color = '#94a3b8';
      }
    }

    if (pos.esDeDia) {
      // Coordenadas esféricas a cartesianas para la luz solar en Three.js
      // X = Este, Y = Norte, Z = Arriba
      const r = 80;
      const elevRad = pos.elevacionDeg * (Math.PI / 180);
      const azRad = pos.azimutDeg * (Math.PI / 180);

      // Azimut: 0 = Norte (+Y), 90 = Este (+X), 180 = Sur (-Y), 270 = Oeste (-X)
      const x = r * Math.cos(elevRad) * Math.sin(azRad);
      const y = r * Math.cos(elevRad) * Math.cos(azRad);
      const z = r * Math.sin(elevRad);

      state.threeSunLight.position.set(x, y, z);
      state.threeSunLight.intensity = Math.max(0.3, Math.sin(elevRad) * 1.5);
      state.threeSunLight.visible = true;
    } else {
      state.threeSunLight.visible = false;
    }

    // Cálculo y renderizado de sombreado en tiempo real sobre los paneles 3D
    if (state.distribucion && state.distribucion.paneles && state.puntosPoligono.length >= 3) {
      const { centro, mPorLat, mPorLng } = Techo3D.proyectarMetros(state.puntosPoligono);
      const obstaculosMetros = state.obstaculos.map(o => ({
        x: (o.lng - centro.lng) * mPorLng,
        y: (o.lat - centro.lat) * mPorLat,
        radio: o.radio || 2.5,
        alturaRelativa: o.alturaRelativa || 3.5,
        tipo: o.tipo || 'arbol'
      }));

      const resSombra = Techo3D.calcularSombreadoPaneles(
        state.distribucion.paneles,
        obstaculosMetros,
        pos.elevacionDeg,
        pos.azimutDeg,
        state.alturaNaveM || 8.0
      );

      // Cambiar material a sombreado en Three.js
      if (state.threePanelMeshes && state.threePanelMeshes.length > 0) {
        state.threePanelMeshes.forEach((item, idx) => {
          if (resSombra.sombreados[idx]) {
            item.mesh.material = item.shadowMat;
          } else {
            item.mesh.material = item.defaultMat;
          }
        });
      }

      // Actualizar texto informativo de sombras
      const boxSombras = document.getElementById('boxSombrasInfo');
      if (boxSombras) {
        if (!pos.esDeDia) {
          boxSombras.innerHTML = `<span>🌙 <strong>Noche:</strong> Sin radiación solar directa · Pérdida Anual Est.: ${state.perdidaSombrasAnualPct}%</span>`;
        } else if (resSombra.pctSombra > 0) {
          boxSombras.innerHTML = `<span>🌥️ <strong>Sombras Ahora:</strong> ${resSombra.pctSombra}% (${resSombra.cantSombreados} módulos sombreados) · Pérdida Anual Est.: ${state.perdidaSombrasAnualPct}%</span>`;
        } else {
          boxSombras.innerHTML = `<span>☀️ <strong>Sombras Ahora:</strong> 0% (100% despejado) · Pérdida Anual Est.: ${state.perdidaSombrasAnualPct}%</span>`;
        }
      }
    }
  }

  /**
   * Reconstruye la geometría 3D del edificio y los paneles en Three.js
   */
  function actualizarEscena3D(puntosMetros, distribucion) {
    if (!state.threeBuildingGroup) return;

    state.threePanelMeshes = [];

    // Limpiar objetos anteriores
    while (state.threeBuildingGroup.children.length > 0) {
      const obj = state.threeBuildingGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      state.threeBuildingGroup.remove(obj);
    }

    if (!puntosMetros || puntosMetros.length < 3) return;

    const alturaEdificio = state.alturaNaveM || 8.0;

    // 1. Crear el Shape 2D del polígono
    const shape = new THREE.Shape();
    shape.moveTo(puntosMetros[0].x, puntosMetros[0].y);
    for (let i = 1; i < puntosMetros.length; i++) {
      shape.lineTo(puntosMetros[i].x, puntosMetros[i].y);
    }
    shape.closePath();

    // 2. Extrusión 3D de las paredes del edificio
    const extrudeSettings = {
      depth: alturaEdificio,
      bevelEnabled: false
    };
    const buildingGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Color gris industrial
      roughness: 0.6,
      metalness: 0.2
    });
    const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    state.threeBuildingGroup.add(buildingMesh);

    // 3. Crear cubierta / techo según tipoCubierta
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7
    });

    if (state.tipoCubierta === 'plano' || state.tipoNave === 'losa' || state.tipoNave === 'suelo') {
      // Losa plana con muro perimetral (parapeto)
      const roofGeo = new THREE.ShapeGeometry(shape);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.z = alturaEdificio + 0.05;
      roofMesh.receiveShadow = true;
      state.threeBuildingGroup.add(roofMesh);

      // Parapeto perimetral de 0.7m
      const parapetMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
      for (let i = 0; i < puntosMetros.length; i++) {
        const j = (i + 1) % puntosMetros.length;
        const p1 = puntosMetros[i];
        const p2 = puntosMetros[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx);

        const wallGeo = new THREE.BoxGeometry(len, 0.25, 0.7);
        const wallMesh = new THREE.Mesh(wallGeo, parapetMat);
        wallMesh.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, alturaEdificio + 0.35);
        wallMesh.rotation.z = ang;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        state.threeBuildingGroup.add(wallMesh);
      }
    } else if (state.tipoCubierta === 'dos_aguas') {
      // Techo a dos aguas con cumbrera central
      const roofGeo = new THREE.ShapeGeometry(shape);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.z = alturaEdificio + 0.05;
      roofMesh.receiveShadow = true;
      state.threeBuildingGroup.add(roofMesh);

      // Cumbrera central elevada
      const azRad = (distribucion ? distribucion.azimutDeg : 0) * (Math.PI / 180);
      const ridgeLen = Math.sqrt(distribucion ? distribucion.areaTotalTecho : 400);
      const ridgeGeo = new THREE.BoxGeometry(ridgeLen * 0.9, 0.35, 1.2);
      const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
      const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
      ridge.position.set(0, 0, alturaEdificio + 0.6);
      ridge.rotation.z = azRad;
      ridge.castShadow = true;
      ridge.receiveShadow = true;
      state.threeBuildingGroup.add(ridge);
    } else {
      // Techo estándar
      const roofGeo = new THREE.ShapeGeometry(shape);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.z = alturaEdificio + 0.05;
      roofMesh.receiveShadow = true;
      state.threeBuildingGroup.add(roofMesh);
    }

    // 4. Crear los paneles solares 3D (con estructura coplanar o triángulos elevados)
    if (distribucion && distribucion.paneles) {
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,      // Marco de aluminio
        roughness: 0.4
      });

      const esTriangulos = state.tipoEstructura === 'triangulos' || state.tipoNave === 'losa' || state.tipoNave === 'suelo';
      const tiltRad = (esTriangulos ? state.inclinacionDeg : 0) * (Math.PI / 180);

      distribucion.paneles.forEach((p, idx) => {
        const pGroup = new THREE.Group();
        pGroup.position.set(p.x, p.y, alturaEdificio + 0.2);
        pGroup.rotation.z = p.rotacionRad;

        // Si es estructura con triángulos, inclinar el panel y renderizar caballetes de soporte
        if (esTriangulos && tiltRad > 0.05) {
          pGroup.rotation.x = -tiltRad;
          const hElevacion = (p.alto / 2) * Math.sin(tiltRad);
          pGroup.position.z += hElevacion + 0.08;

          // Patas de aluminio traseras que sostienen el ángulo del panel
          const hPata = p.alto * Math.sin(tiltRad);
          const legGeo = new THREE.CylinderGeometry(0.025, 0.025, hPata, 4);
          const legMesh1 = new THREE.Mesh(legGeo, frameMat);
          legMesh1.position.set(-p.ancho * 0.4, -p.alto * 0.45, -hPata / 2);
          legMesh1.rotation.x = Math.PI / 2;
          pGroup.add(legMesh1);

          const legMesh2 = legMesh1.clone();
          legMesh2.position.x = p.ancho * 0.4;
          pGroup.add(legMesh2);
        }

        // Materiales para estado iluminado vs sombreado
        const defaultMat = new THREE.MeshStandardMaterial({
          color: 0x1e3a8a,      // Azul oscuro monocristalino
          roughness: 0.2,
          metalness: 0.85
        });
        const shadowMat = new THREE.MeshStandardMaterial({
          color: 0x091428,      // Tono opaco sombreado
          roughness: 0.85,
          metalness: 0.1
        });

        const cellGeo = new THREE.BoxGeometry(p.ancho, p.alto, 0.06);
        const cellMesh = new THREE.Mesh(cellGeo, defaultMat);
        cellMesh.castShadow = true;
        cellMesh.receiveShadow = true;
        pGroup.add(cellMesh);

        state.threePanelMeshes.push({
          mesh: cellMesh,
          defaultMat,
          shadowMat,
          idx
        });

        state.threeBuildingGroup.add(pGroup);
      });
    }

    // 5. Obstáculos 3D según su tipo (Árbol, Chimenea, HVAC, Domo, Antena)
    state.obstaculos.forEach(obs => {
      const { centro, mPorLat, mPorLng } = Techo3D.proyectarMetros(state.puntosPoligono);
      const ox = (obs.lng - centro.lng) * mPorLng;
      const oy = (obs.lat - centro.lat) * mPorLat;
      const r = obs.radio || 2.5;
      const hRel = obs.alturaRelativa || 3.5;
      const tipo = obs.tipo || 'arbol';

      const obsGroup = new THREE.Group();
      obsGroup.position.set(ox, oy, alturaEdificio);

      if (tipo === 'arbol') {
        // Árbol que nace desde el suelo
        const trunkH = alturaEdificio + 1.5;
        const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, trunkH, 8);
        trunkGeo.rotateX(Math.PI / 2);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(0, 0, -alturaEdificio + trunkH / 2);
        trunk.castShadow = true;
        obsGroup.add(trunk);

        const crownGeo = new THREE.SphereGeometry(r, 12, 12);
        const crownMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(0, 0, trunkH - alturaEdificio + r * 0.4);
        crown.castShadow = true;
        obsGroup.add(crown);
      } else if (tipo === 'chimenea') {
        const chimGeo = new THREE.CylinderGeometry(r * 0.7, r * 0.8, hRel, 12);
        chimGeo.rotateX(Math.PI / 2);
        const chimMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
        const chim = new THREE.Mesh(chimGeo, chimMat);
        chim.position.set(0, 0, hRel / 2);
        chim.castShadow = true;
        obsGroup.add(chim);

        const capGeo = new THREE.ConeGeometry(r * 1.1, 0.4, 12);
        capGeo.rotateX(Math.PI / 2);
        const cap = new THREE.Mesh(capGeo, chimMat);
        cap.position.set(0, 0, hRel + 0.2);
        cap.castShadow = true;
        obsGroup.add(cap);
      } else if (tipo === 'hvac') {
        const boxGeo = new THREE.BoxGeometry(r * 1.6, r * 1.6, hRel);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.4 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(0, 0, hRel / 2);
        box.castShadow = true;
        obsGroup.add(box);

        const fanGeo = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.08, 12);
        fanGeo.rotateX(Math.PI / 2);
        const fanMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
        const fan = new THREE.Mesh(fanGeo, fanMat);
        fan.position.set(0, 0, hRel + 0.04);
        obsGroup.add(fan);
      } else if (tipo === 'domo') {
        const domeGeo = new THREE.SphereGeometry(r, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        domeGeo.rotateX(Math.PI / 2);
        const domeMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.65,
          roughness: 0.1,
          metalness: 0.1
        });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.set(0, 0, 0);
        dome.castShadow = true;
        obsGroup.add(dome);
      } else if (tipo === 'antena') {
        const mastGeo = new THREE.CylinderGeometry(0.08, 0.15, hRel, 6);
        mastGeo.rotateX(Math.PI / 2);
        const mastMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7 });
        const mast = new THREE.Mesh(mastGeo, mastMat);
        mast.position.set(0, 0, hRel / 2);
        mast.castShadow = true;
        obsGroup.add(mast);
      }

      state.threeBuildingGroup.add(obsGroup);
    });

    // Ajustar cámara para encuadrar el nuevo edificio
    if (state.threeControls) {
      state.threeControls.target.set(0, 0, alturaEdificio / 2);
    }
  }

  // =========================================================================
  // GESTIÓN DE EVENTOS Y BOTONES
  // =========================================================================

  function vincularEventos() {
    // Buscador de dirección Nominatim
    const btnBuscar = document.getElementById('btnBuscarDireccion');
    const inpDir = document.getElementById('techoDireccion');
    if (btnBuscar && inpDir) {
      const buscar = async () => {
        const query = inpDir.value.trim();
        if (!query) return;
        btnBuscar.disabled = true;
        btnBuscar.textContent = '⏳ Buscando…';
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Argentina')}&limit=1`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            state.lat = lat;
            state.lng = lng;
            // Limpiar polígono previo de otra localidad para evitar mezclar coordenadas
            state.puntosPoligono = [];
            state.obstaculos = [];
            actualizarTrazadoEnMapa();
            actualizarObstaculosEnMapa();
            actualizarDimensionamiento();
            if (mapa) {
              mapa.flyTo([lat, lng], 18);
            }
          } else {
            alert('No se encontraron resultados para esa dirección. Probá ingresando una ciudad o parque industrial.');
          }
        } catch (err) {
          console.error('Error en geocodificación:', err);
          alert('Error al conectar con el buscador de direcciones.');
        } finally {
          btnBuscar.disabled = false;
          btnBuscar.textContent = '🔍 Buscar';
        }
      };

      btnBuscar.addEventListener('click', buscar);
      inpDir.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
    }

    // Botón GPS actual
    const btnGps = document.getElementById('btnMiUbicacion');
    if (btnGps) {
      btnGps.addEventListener('click', () => {
        if (!navigator.geolocation) {
          alert('Tu navegador no soporta geolocalización.');
          return;
        }
        btnGps.textContent = '⏳ Obteniendo…';
        navigator.geolocation.getCurrentPosition(
          pos => {
            state.lat = pos.coords.latitude;
            state.lng = pos.coords.longitude;
            if (mapa) mapa.flyTo([state.lat, state.lng], 19);
            btnGps.textContent = '📍 Mi GPS';
          },
          err => {
            alert('No se pudo obtener tu ubicación actual.');
            btnGps.textContent = '📍 Mi GPS';
          }
        );
      });
    }

    // Subtabs de vista (Dual / Mapa / 3D)
    document.querySelectorAll('.btn-subtab').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.btn-subtab').forEach(b => b.classList.remove('activa'));
        e.currentTarget.classList.add('activa');
        const modo = e.currentTarget.dataset.subtab;
        const grid = document.getElementById('contVisoresGrid');
        if (!grid) return;

        grid.className = `techo3d-visores-grid modo-${modo}`;
        setTimeout(() => {
          if (mapa) mapa.invalidateSize();
          ajustarTamanoThree();
        }, 150);
      });
    });

    // Herramientas del mapa
    const btnAutoDetect = document.getElementById('btnAutoDetectarTecho');
    const btnTecho = document.getElementById('btnHerramientaTecho');
    const btnObs = document.getElementById('btnHerramientaObstaculo');
    const btnLimpiar = document.getElementById('btnLimpiarTecho');
    const selCapa = document.getElementById('selCapaMapa');

    if (btnAutoDetect && mapa) {
      btnAutoDetect.addEventListener('click', async () => {
        btnAutoDetect.disabled = true;
        btnAutoDetect.textContent = '🪄 Buscando…';
        const center = mapa.getCenter();
        const res = await Techo3D.fetchHuellaEdificioOSM(center.lat, center.lng);
        if (res.ok && res.puntos && res.puntos.length >= 3) {
          state.puntosPoligono = res.puntos.slice();
          actualizarTrazadoEnMapa();
          actualizarDimensionamiento();
          if (typeof window.toast === 'function') {
            window.toast('🪄 Huella de edificio detectada con éxito');
          }
        } else {
          alert('No se detectó una huella registrada en este punto exacto.\n\nPodés trazar las esquinas con [ ✏️ Trazar Techo ] o cargar una plantilla rápida de nave.');
        }
        btnAutoDetect.disabled = false;
        btnAutoDetect.textContent = '🪄 Auto-Detectar';
      });
    }

    if (selCapa && mapa) {
      selCapa.addEventListener('change', e => {
        const v = e.target.value;
        if (v === 'satelital') {
          if (!mapa.hasLayer(capaSatelital)) mapa.addLayer(capaSatelital);
          if (mapa.hasLayer(capaEtiquetas)) mapa.removeLayer(capaEtiquetas);
          if (capaOSM && mapa.hasLayer(capaOSM)) mapa.removeLayer(capaOSM);
        } else if (v === 'hibrido') {
          if (!mapa.hasLayer(capaSatelital)) mapa.addLayer(capaSatelital);
          if (!mapa.hasLayer(capaEtiquetas)) mapa.addLayer(capaEtiquetas);
          if (capaOSM && mapa.hasLayer(capaOSM)) mapa.removeLayer(capaOSM);
        } else if (v === 'calles') {
          if (mapa.hasLayer(capaSatelital)) mapa.removeLayer(capaSatelital);
          if (mapa.hasLayer(capaEtiquetas)) mapa.removeLayer(capaEtiquetas);
          if (capaOSM && !mapa.hasLayer(capaOSM)) mapa.addLayer(capaOSM);
        }
      });
    }

    if (btnTecho) {
      btnTecho.addEventListener('click', () => {
        state.modoDibujo = 'techo';
        state.puntosPoligono = [];
        if (mapa && mapa.doubleClickZoom) {
          mapa.doubleClickZoom.disable();
        }
        actualizarTrazadoEnMapa();
        actualizarDimensionamiento();
        btnTecho.className = 'btn btn-sm btn-primario';
        if (btnObs) btnObs.className = 'btn btn-sm';
        if (typeof window.toast === 'function') {
          window.toast('📍 Hacé clic en las esquinas de la fábrica. Podés cerrarlo con [ ✅ Listo / Cerrar Techo ] o clic en el punto 1');
        }
      });
    }

    const btnCerrar = document.getElementById('btnCerrarTecho');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => {
        if (state.puntosPoligono.length >= 3) {
          cerrarTecho();
        }
      });
    }

    if (mapa) {
      mapa.on('dblclick', (e) => {
        if (state.modoDibujo === 'techo' && state.puntosPoligono.length >= 3) {
          if (e && e.originalEvent) e.originalEvent.stopPropagation();
          cerrarTecho();
        }
      });
    }
    if (btnObs) {
      btnObs.addEventListener('click', () => {
        state.modoDibujo = 'obstaculo';
        btnObs.className = 'btn btn-sm btn-peligro';
        if (btnTecho) btnTecho.className = 'btn btn-sm';
      });
    }
    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        state.puntosPoligono = [];
        state.obstaculos = [];
        actualizarTrazadoEnMapa();
        actualizarObstaculosEnMapa();
        actualizarDimensionamiento();
      });
    }

    document.getElementById('selTipoEstructura')?.addEventListener('change', e => {
      state.tipoEstructura = e.target.value;
      actualizarDimensionamiento();
    });

    // Presets rápidos en 90 segundos
    document.getElementById('btnPresetNaveGrande')?.addEventListener('click', () => cargarPreset('industrial'));
    document.getElementById('btnPresetComercio')?.addEventListener('click', () => cargarPreset('comercial'));
    document.getElementById('btnPresetLosa')?.addEventListener('click', () => cargarPreset('losa'));

    // Controles solares 3D (Hora y Mes)
    const sliderHora = document.getElementById('sliderHoraSolar');
    const labelHora = document.getElementById('labelHoraSolar');
    const selMes = document.getElementById('selMesSolar');
    const btnAnimar = document.getElementById('btnAnimarSol');

    if (sliderHora && labelHora) {
      sliderHora.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        state.horaSimulacion = val;
        const horas = Math.floor(val);
        const mins = Math.round((val - horas) * 60);
        labelHora.textContent = `${horas.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} hs`;
        actualizarPosicionSolar3D();
      });
    }

    if (selMes) {
      selMes.addEventListener('change', e => {
        state.mesSimulacion = parseInt(e.target.value, 10);
        actualizarPosicionSolar3D();
      });
    }

    if (btnAnimar) {
      btnAnimar.addEventListener('click', () => {
        if (state.animandoSol) {
          clearInterval(state.animInterval);
          state.animandoSol = false;
          btnAnimar.textContent = '▶ Animar Día';
        } else {
          state.animandoSol = true;
          btnAnimar.textContent = '⏸ Pausar';
          let h = 6.0;
          state.animInterval = setInterval(() => {
            h += 0.25;
            if (h > 19.0) h = 6.0;
            state.horaSimulacion = h;
            if (sliderHora) sliderHora.value = h;
            const horas = Math.floor(h);
            const mins = Math.round((h - horas) * 60);
            if (labelHora) labelHora.textContent = `${horas.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} hs`;
            actualizarPosicionSolar3D();
          }, 120);
        }
      });
    }

    // Parámetros de la nave y módulos
    document.getElementById('selTipoNave')?.addEventListener('change', e => {
      state.tipoNave = e.target.value;
      const inpAlt = document.getElementById('inpAlturaNave');
      if (inpAlt) {
        if (state.tipoNave === 'industrial') inpAlt.value = 8;
        else if (state.tipoNave === 'comercial') inpAlt.value = 6;
        else if (state.tipoNave === 'losa') inpAlt.value = 10;
        else inpAlt.value = 0;
        state.alturaNaveM = parseFloat(inpAlt.value);
      }
      actualizarDimensionamiento();
    });

    document.getElementById('inpAlturaNave')?.addEventListener('input', e => {
      state.alturaNaveM = parseFloat(e.target.value) || 8;
      actualizarDimensionamiento();
    });

    document.getElementById('selPotenciaPanel')?.addEventListener('change', e => {
      state.potenciaPanelWp = parseInt(e.target.value, 10) || 575;
      actualizarDimensionamiento();
    });

    document.getElementById('selOrientacionPanel')?.addEventListener('change', e => {
      state.orientacionPanel = e.target.value;
      actualizarDimensionamiento();
    });

    document.getElementById('inpInclinacionTecho')?.addEventListener('input', e => {
      state.inclinacionDeg = parseFloat(e.target.value) || 15;
      actualizarDimensionamiento();
    });

    document.getElementById('inpAzimutTecho')?.addEventListener('input', e => {
      state.azimutManual = parseFloat(e.target.value);
      actualizarDimensionamiento();
    });

    document.getElementById('selTipoCubierta')?.addEventListener('change', e => {
      state.tipoCubierta = e.target.value;
      actualizarDimensionamiento();
    });

    document.getElementById('btnRecalcularLayout')?.addEventListener('click', () => {
      actualizarDimensionamiento();
    });

    // Botón manual para agregar obstáculo
    document.getElementById('btnAddObsManual')?.addEventListener('click', () => {
      if (state.puntosPoligono.length < 3) {
        alert('Primero trazá o cargá una nave para ubicar el obstáculo.');
        return;
      }
      const { centro } = Techo3D.proyectarMetros(state.puntosPoligono);
      const offsetLat = (Math.random() - 0.5) * 0.0001;
      const offsetLng = (Math.random() - 0.5) * 0.0001;
      state.obstaculos.push({
        id: 'obs_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        lat: centro.lat + offsetLat,
        lng: centro.lng + offsetLng,
        radio: 2.5,
        alturaRelativa: 3.5,
        tipo: 'hvac'
      });
      actualizarObstaculosEnMapa();
      actualizarDimensionamiento();
    });

    // Botones de presets de cámara 3D
    document.getElementById('btnCamTop')?.addEventListener('click', () => {
      if (state.threeCamera && state.threeControls) {
        state.threeCamera.position.set(0, 0, 75);
        state.threeControls.target.set(0, 0, 0);
        state.threeControls.update();
      }
    });

    document.getElementById('btnCamIso')?.addEventListener('click', () => {
      if (state.threeCamera && state.threeControls) {
        state.threeCamera.position.set(-45, -55, 45);
        state.threeControls.target.set(0, 0, (state.alturaNaveM || 8) / 2);
        state.threeControls.update();
      }
    });

    document.getElementById('btnCamFront')?.addEventListener('click', () => {
      if (state.threeCamera && state.threeControls) {
        state.threeCamera.position.set(0, -65, (state.alturaNaveM || 8) + 3);
        state.threeControls.target.set(0, 0, state.alturaNaveM || 8);
        state.threeControls.update();
      }
    });

    document.getElementById('btnCamReset')?.addEventListener('click', () => {
      if (state.threeCamera && state.threeControls) {
        state.threeCamera.position.set(0, -50, 45);
        state.threeControls.target.set(0, 0, (state.alturaNaveM || 8) / 2);
        state.threeControls.update();
      }
    });

    // =========================================================================
    // BOTÓN 1-CLIC: APLICAR AL PROYECTO COMPLETO
    // =========================================================================
    document.getElementById('btnAplicarAlProyecto')?.addEventListener('click', () => {
      if (!state.distribucion || state.distribucion.count <= 0) {
        alert('Primero trazá o seleccioná un techo para calcular los paneles.');
        return;
      }

      if (!window.UI || !UI.estado) {
        alert('No hay un proyecto activo seleccionado.');
        return;
      }

      const p = UI.estado;
      const d = state.distribucion;

      // Inyectar datos en el proyecto
      p.potenciaInstaladaKwp = d.potenciaKwp;
      p.cantidadModulos = d.count;
      p.potenciaModuloWp = state.potenciaPanelWp;
      p.inclinacion = state.inclinacionDeg;
      p.azimut = d.azimutDeg;

      // Inyectar factor de pérdida por sombras calculado del 3D
      if (p.perdidas) {
        p.perdidas.sombras = Math.max(0.5, Math.round(state.perdidaSombrasAnualPct * 10) / 10);
      }
      p.techo3d = guardarEstado();

      if (typeof window.marcarDirty === 'function') {
        window.marcarDirty();
      }

      // Notificar y recalcular
      if (typeof window.recalcular === 'function') {
        window.recalcular();
      }

      if (typeof window.toast === 'function') {
        window.toast(`⚡ Proyecto actualizado: ${d.count} módulos (${d.potenciaKwp} kWp) | Sombras: ${state.perdidaSombrasAnualPct}%`);
      } else {
        alert(`⚡ Proyecto actualizado con éxito:\n\n• Potencia: ${d.potenciaKwp} kWp\n• Módulos: ${d.count} u.\n• Inclinación: ${state.inclinacionDeg}°\n• Azimut: ${d.azimutDeg}°\n• Factor de sombras 3D: ${state.perdidaSombrasAnualPct}%`);
      }
    });

    // =========================================================================
    // BOTÓN WHATSAPP EXPRESS
    // =========================================================================
    document.getElementById('btnWhatsappExpress')?.addEventListener('click', () => {
      if (!state.distribucion || state.distribucion.count <= 0) {
        alert('Trazá un techo primero para generar el resumen.');
        return;
      }

      const d = state.distribucion;
      const leasing = Techo3D.calcularLeasingExpress(d.potenciaKwp);
      const clienteNombre = (window.UI && UI.estado && UI.estado.cliente) ? UI.estado.cliente : 'Estimado cliente';

      const texto = `☀️ *ALP GROUP · Propuesta Solar Express*\n\n` +
        `Hola *${clienteNombre}*, simulamos la cubierta con nuestro diseñador satelital 3D:\n\n` +
        `⚡ *Potencia proyectada:* ${d.potenciaKwp} kWp (${d.count} módulos de ${state.potenciaPanelWp} Wp)\n` +
        `🔋 *Generación estimada:* ${fmtNum(leasing.generacionAnualKwh)} kWh/año\n` +
        `💵 *Ahorro mensual en luz:* ~U$D ${fmtNum(leasing.ahorroMensualUsd)} /mes\n` +
        `🏦 *Cuota Leasing ALP (sin banco):* U$D ${fmtNum(leasing.cuotaLeasingMensualUsd)} /mes\n` +
        (leasing.sePagaSolo
          ? `✅ *Beneficio Neto:* +U$D ${fmtNum(leasing.flujoNetoMensualUsd)} /mes en su bolsillo desde el mes 1!\n\n`
          : `✅ *Cobertura del ahorro:* ${leasing.coberturaCuotaPct}% de la cuota se paga con el ahorro solar!\n\n`) +
        `¿Coordinamos una videollamada para ver el gemelo 3D de su techo?`;

      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
      window.open(url, '_blank');
    });

    // =========================================================================
    // BOTÓN DESCARGAR FOTO 3D
    // =========================================================================
    document.getElementById('btnDescargarRender')?.addEventListener('click', () => {
      if (!state.threeRenderer) return;
      const dataUrl = state.threeRenderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `render_techo3d_alpgroup_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    });
  }

  /**
   * Carga una plantilla predefinida de nave para demostración en 90 segundos
   */
  function cargarPreset(tipo) {
    // Tomar centro visible actual del mapa
    const center = (mapa && typeof mapa.getCenter === 'function') ? mapa.getCenter() : { lat: state.lat, lng: state.lng };
    const baseLat = center.lat;
    const baseLng = center.lng;
    state.lat = baseLat;
    state.lng = baseLng;

    // Generar rectángulo proporcional
    let wM = 40, hM = 30; // metros
    if (tipo === 'industrial') {
      wM = 50; hM = 24; // 1200 m²
      state.tipoNave = 'industrial';
      state.alturaNaveM = 8;
      state.tipoCubierta = 'dos_aguas';
    } else if (tipo === 'comercial') {
      wM = 30; hM = 15; // 450 m²
      state.tipoNave = 'comercial';
      state.alturaNaveM = 6;
      state.tipoCubierta = 'un_agua';
    } else if (tipo === 'losa') {
      wM = 20; hM = 15; // 300 m²
      state.tipoNave = 'losa';
      state.alturaNaveM = 10;
      state.tipoCubierta = 'plano';
    }

    const selCob = document.getElementById('selTipoCubierta');
    if (selCob) selCob.value = state.tipoCubierta;

    const latRad = baseLat * (Math.PI / 180);
    const dLat = (hM / 2) / 111132.954;
    const dLng = (wM / 2) / (111132.954 * Math.cos(latRad));

    state.puntosPoligono = [
      [baseLat - dLat, baseLng - dLng],
      [baseLat - dLat, baseLng + dLng],
      [baseLat + dLat, baseLng + dLng],
      [baseLat + dLat, baseLng - dLng]
    ];

    // Obstáculo de demostración (ej: árbol cercano que arroja sombra)
    state.obstaculos = [
      {
        id: 'obs_demo_1',
        lat: baseLat + dLat * 0.4,
        lng: baseLng - dLng * 1.3,
        radio: 3.5,
        alturaRelativa: 8.0,
        tipo: 'arbol'
      }
    ];

    actualizarTrazadoEnMapa();
    actualizarObstaculosEnMapa();
    actualizarDimensionamiento();

    if (mapa && mapa.getZoom() < 18) {
      mapa.setView([baseLat, baseLng], 18);
    }
  }

  function guardarEstado() {
    let snapshot = null;
    if (state.threeRenderer) {
      try {
        snapshot = state.threeRenderer.domElement.toDataURL('image/jpeg', 0.85);
      } catch (e) {}
    }
    return {
      lat: state.lat,
      lng: state.lng,
      zoom: (mapa && typeof mapa.getZoom === 'function') ? mapa.getZoom() : state.zoom,
      puntosPoligono: state.puntosPoligono.slice(),
      obstaculos: state.obstaculos.slice(),
      tipoNave: state.tipoNave,
      alturaNaveM: state.alturaNaveM,
      tipoCubierta: state.tipoCubierta,
      potenciaPanelWp: state.potenciaPanelWp,
      orientacionPanel: state.orientacionPanel,
      inclinacionDeg: state.inclinacionDeg,
      azimutManual: state.azimutManual,
      distribucion: state.distribucion,
      perdidaSombrasAnualPct: state.perdidaSombrasAnualPct,
      snapshotDataUrl: snapshot
    };
  }

  function cargarEstado(datos) {
    if (!datos) return;
    if (datos.lat !== undefined) state.lat = datos.lat;
    if (datos.lng !== undefined) state.lng = datos.lng;
    if (datos.zoom !== undefined) state.zoom = datos.zoom;
    if (Array.isArray(datos.puntosPoligono)) state.puntosPoligono = datos.puntosPoligono.slice();
    if (Array.isArray(datos.obstaculos)) state.obstaculos = datos.obstaculos.slice();
    if (datos.tipoNave) state.tipoNave = datos.tipoNave;
    if (datos.alturaNaveM) state.alturaNaveM = datos.alturaNaveM;
    if (datos.tipoCubierta) state.tipoCubierta = datos.tipoCubierta;
    if (datos.potenciaPanelWp) state.potenciaPanelWp = datos.potenciaPanelWp;
    if (datos.orientacionPanel) state.orientacionPanel = datos.orientacionPanel;
    if (datos.inclinacionDeg !== undefined) state.inclinacionDeg = datos.inclinacionDeg;
    if (datos.azimutManual !== undefined) state.azimutManual = datos.azimutManual;
    if (datos.perdidaSombrasAnualPct !== undefined) state.perdidaSombrasAnualPct = datos.perdidaSombrasAnualPct;

    // Actualizar campos en el DOM si ya existen
    const inpAlt = document.getElementById('inpAlturaNave');
    if (inpAlt) inpAlt.value = state.alturaNaveM;
    const selNave = document.getElementById('selTipoNave');
    if (selNave) selNave.value = state.tipoNave;
    const selCub = document.getElementById('selTipoCubierta');
    if (selCub) selCub.value = state.tipoCubierta;
    const selPot = document.getElementById('selPotenciaPanel');
    if (selPot) selPot.value = state.potenciaPanelWp;
    const selOri = document.getElementById('selOrientacionPanel');
    if (selOri) selOri.value = state.orientacionPanel;
    const inpInc = document.getElementById('inpInclinacionTecho');
    if (inpInc) inpInc.value = state.inclinacionDeg;
    const inpAz = document.getElementById('inpAzimutTecho');
    if (inpAz && state.azimutManual !== null) inpAz.value = state.azimutManual;

    if (mapa) {
      mapa.setView([state.lat, state.lng], state.zoom || 19);
      actualizarTrazadoEnMapa();
      actualizarObstaculosEnMapa();
      actualizarDimensionamiento();
    }
  }

  function obtenerResumen() {
    if (!state.distribucion || state.distribucion.count <= 0) return null;
    let snapshot = null;
    if (state.threeRenderer) {
      try {
        snapshot = state.threeRenderer.domElement.toDataURL('image/jpeg', 0.85);
      } catch (e) {}
    }
    return {
      potenciaKwp: state.distribucion.potenciaKwp,
      cantidadPaneles: state.distribucion.count,
      areaTechoM2: state.distribucion.areaTotalTecho,
      areaOcupadaM2: state.distribucion.areaOcupadaM2,
      factorOcupacionPct: state.distribucion.factorOcupacionPct,
      azimutDeg: state.distribucion.azimutDeg,
      inclinacionDeg: state.inclinacionDeg,
      tipoNave: state.tipoNave,
      alturaNaveM: state.alturaNaveM,
      potenciaPanelWp: state.potenciaPanelWp,
      snapshotDataUrl: snapshot
    };
  }

  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('es-AR');
  }

  return {
    init,
    actualizarDimensionamiento,
    guardarEstado,
    cargarEstado,
    obtenerResumen
  };
});
