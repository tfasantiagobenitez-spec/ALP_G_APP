/* ==========================================================================
   db.js — Capa de datos unificada con dos adaptadores:
     · Local: localStorage (un usuario, sin servidor)
     · Nube:  Supabase (multiusuario, login, roles, control de conflictos)
   La app solo habla con `DB`; la interfaz es la misma en ambos modos.
   ========================================================================== */
(function (root) {
  'use strict';

  class ConflictError extends Error {
    constructor(actual) { super('El proyecto fue modificado por otro usuario'); this.name = 'ConflictError'; this.actual = actual; }
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** Numera las revisiones como A, B, ... Z, AA, AB, al estilo de los planos de obra. */
  function letraRevision(n) {
    let s = '', x = Math.max(1, Math.round(n));
    while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
    return s;
  }
  /** "11/6/2026, 04:04:07" (formato de los datos originales) */
  function fechaFmt(d) {
    d = d ? new Date(d) : new Date();
    if (isNaN(d)) return '';
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ', ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function resumenDe(estado) {
    const partes = [];
    if (estado.cliente_nombre) partes.push(estado.cliente_nombre);
    partes.push((estado.kwp || '0') + ' kWp');
    partes.push('U$D ' + (estado.usd_kwp || '0') + '/kWp');
    return partes.join(' · ');
  }

  /** Deja `estado` como objeto de strings (formato original). */
  function estadoAStrings(estado) {
    const est = {};
    Object.keys(estado || {}).forEach(k => {
      const v = estado[k];
      est[k] = (typeof v === 'string') ? v : (Array.isArray(v) || (v && typeof v === 'object')) ? JSON.stringify(v) : String(v);
    });
    return est;
  }

  function kwpNum(estado) {
    const s = String(estado.kwp || '0').replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? n : 0;
  }

  /** Extrae el mapa de proyectos de cualquier JSON aceptado por Importar. */
  function mapaDesdeJSON(text) {
    const obj = JSON.parse(text);
    if (obj && obj.proyectos && typeof obj.proyectos === 'object') return obj.proyectos;
    if (obj && obj.estado && typeof obj.estado === 'object') return { ['p_' + Date.now()]: obj };
    if (obj && typeof obj === 'object') return obj;
    throw new Error('Formato no reconocido');
  }

  const DISTRIBUIDORAS_DEFAULT = [
    { id: 'epe', nombre: 'EPE Santa Fe', provincia: 'Santa Fe', impuestos: [{ nombre: 'Ley 7797', pct: 6 }, { nombre: 'Ley 13.414 (FER)', pct: 1.5 }, { nombre: 'Alumbrado Público (CAP)', pct: 0.2 }, { nombre: 'Ley 12692 Energías Renovables', pct: 0.0006 }, { nombre: '', pct: 0 }] },
    { id: 'eden', nombre: 'EDEN / EDEA / EDES (Pcia. Buenos Aires)', provincia: 'Buenos Aires', impuestos: [{ nombre: 'Ley 11969 art. 72 ter', pct: 6 }, { nombre: 'Ley 7290', pct: 1 }, { nombre: 'Ley 11769 FCT', pct: 3.5 }, { nombre: 'Ley 11969 art. 72 bis', pct: 0.001 }, { nombre: 'Alumbrado Público', pct: 0.24 }] },
    { id: 'amba', nombre: 'Edenor / Edesur (AMBA)', provincia: 'Buenos Aires', impuestos: [{ nombre: 'Contribución Municipal Art.34', pct: 6.424 }, { nombre: 'Contribución Provincial Art.34', pct: 0.001 }, { nombre: 'Decreto-Ley 7290', pct: 1 }, { nombre: 'Tasa Alumbrado Público', pct: 1.43 }, { nombre: '', pct: 0 }] },
    { id: 'epec', nombre: 'EPEC Córdoba', provincia: 'Córdoba', impuestos: [{ nombre: 'FODEP', pct: 10 }, { nombre: 'Tasa Reg. Dec. 2298/00', pct: 1.044 }, { nombre: 'Resol. 27/2015 Seg. Eléctrica', pct: 0.261 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }] },
    { id: 'gen', nombre: 'Genérica (solo impuestos)', provincia: '', impuestos: [{ nombre: 'Impuestos', pct: 10.5 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }, { nombre: '', pct: 0 }] },
  ];

  /** Membrete por defecto. Los datos de contacto van vacíos: la app no imprime hasta que se completen. */
  const MEMBRETE_DEFAULT = {
    nombre: 'ALP GROUP',
    slogan: 'Ingeniería y Desarrollo Fotovoltaico · Autoconsumo & Eficiencia',
    asesor: '',
    tel: '',
    email: '',
    validez: '15',
    logo: 'img/logo.svg',
  };
  const CAMPOS_MEMBRETE = ['nombre', 'slogan', 'asesor', 'tel', 'email', 'validez', 'logo'];

  function limpiarMembrete(m) {
    const out = {};
    CAMPOS_MEMBRETE.forEach(k => { out[k] = m && m[k] != null ? String(m[k]) : MEMBRETE_DEFAULT[k]; });
    return out;
  }

  /** Etapas del pipeline comercial, en el orden en que avanza una venta. */
  const ETAPAS = [
    { clave: 'borrador', nombre: 'Borrador', prob: 10, color: 'gris', descripcion: 'Se está armando la cotización' },
    { clave: 'enviada', nombre: 'Enviada', prob: 30, color: 'azul', descripcion: 'El cliente ya la tiene' },
    { clave: 'negociacion', nombre: 'En negociación', prob: 60, color: 'ambar', descripcion: 'Hay ida y vuelta sobre precio o alcance' },
    { clave: 'ganada', nombre: 'Ganada', prob: 100, color: 'verde', descripcion: 'Contrato firmado' },
    { clave: 'perdida', nombre: 'Perdida', prob: 0, color: 'rojo', descripcion: 'No prosperó' },
  ];
  const CLAVES_ETAPA = ETAPAS.map(e => e.clave);
  function etapaValida(v) { return CLAVES_ETAPA.indexOf(v) >= 0 ? v : 'borrador'; }
  function etapaDe(clave) { return ETAPAS.find(e => e.clave === etapaValida(clave)); }

  const MOTIVOS_PERDIDA = [
    'Precio', 'Plazo de entrega', 'Eligió otro proveedor', 'Postergó la inversión',
    'No consiguió financiamiento', 'Cambió de proyecto', 'Sin respuesta', 'Otro',
  ];

  /** Catálogo de referencia para el modo local, con los mismos ítems que carga el esquema. */
  const PRODUCTOS_DEFAULT = [
    { id: 'mod575', categoria: 'modulo', marca: 'Genérico', modelo: 'Monocristalino 575 Wp', descripcion: 'Módulo bifacial N-Type 575 Wp', unidad: 'u.', precio_usd: 62, activo: true, specs: { wp: 575, voc: 51.8, vmp: 43.4, isc: 14.05, imp: 13.25, coef_voc: -0.25, noct: 45, coef_pot: -0.35, largo_m: 2.278, ancho_m: 1.134, peso_kg: 28.5 } },
    { id: 'mod450', categoria: 'modulo', marca: 'Genérico', modelo: 'Monocristalino 450 Wp', descripcion: 'Módulo monocristalino PERC 450 Wp', unidad: 'u.', precio_usd: 50, activo: true, specs: { wp: 450, voc: 49.5, vmp: 41.2, isc: 11.4, imp: 10.9, coef_voc: -0.27, noct: 45, coef_pot: -0.35, largo_m: 2.094, ancho_m: 1.038, peso_kg: 23.5 } },
    { id: 'inv50', categoria: 'inversor', marca: 'Genérico', modelo: 'String trifásico 50 kW', descripcion: 'Inversor de red trifásico 50 kW, 4 MPPT', unidad: 'u.', precio_usd: 2600, activo: true, specs: { potencia_ac: 50, v_max: 1100, v_min: 200, v_arranque: 160, mppt: 4, i_max_mppt: 30, eficiencia: 98.4 } },
    { id: 'inv25', categoria: 'inversor', marca: 'Genérico', modelo: 'String trifásico 25 kW', descripcion: 'Inversor de red trifásico 25 kW, 2 MPPT', unidad: 'u.', precio_usd: 1500, activo: true, specs: { potencia_ac: 25, v_max: 1100, v_min: 200, v_arranque: 150, mppt: 2, i_max_mppt: 26, eficiencia: 98.3 } },
    { id: 'inv5', categoria: 'inversor', marca: 'Genérico', modelo: 'String monofásico 5 kW', descripcion: 'Inversor de red monofásico 5 kW, 2 MPPT', unidad: 'u.', precio_usd: 520, activo: true, specs: { potencia_ac: 5, v_max: 600, v_min: 80, v_arranque: 60, mppt: 2, i_max_mppt: 16, eficiencia: 97.6 } },
    { id: 'bat10', categoria: 'bateria', marca: 'Genérico', modelo: 'Banco LFP 10 kWh', descripcion: 'Banco de litio LiFePO4 10 kWh con BMS', unidad: 'u.', precio_usd: 3800, activo: true, specs: { kwh: 10, dod: 90, eficiencia: 94, vida_anios: 12, c_rate: 0.5 } },
    { id: 'estchapa', categoria: 'estructura', marca: 'Genérico', modelo: 'Coplanar para chapa', descripcion: 'Perfilería y grampas para cubierta de chapa', unidad: 'kWp', precio_usd: 45, activo: true, specs: {} },
    { id: 'estlosa', categoria: 'estructura', marca: 'Genérico', modelo: 'Triangular para losa', descripcion: 'Estructura inclinada con lastre para losa plana', unidad: 'kWp', precio_usd: 85, activo: true, specs: {} },
    { id: 'esttierra', categoria: 'estructura', marca: 'Genérico', modelo: 'Hincada a tierra', descripcion: 'Estructura hincada para montaje en suelo', unidad: 'kWp', precio_usd: 110, activo: true, specs: {} },
    { id: 'cable', categoria: 'cableado', marca: 'Genérico', modelo: 'Conjunto CC y CA', descripcion: 'Cable solar, conectores, canalización y puesta a tierra', unidad: 'kWp', precio_usd: 38, activo: true, specs: {} },
    { id: 'tablero', categoria: 'tablero', marca: 'Genérico', modelo: 'Tablero de protecciones', descripcion: 'Tablero CC y CA con protecciones y seccionamiento', unidad: 'kWp', precio_usd: 32, activo: true, specs: {} },
    { id: 'mano', categoria: 'mano_obra', marca: 'Genérico', modelo: 'Montaje e instalación', descripcion: 'Mano de obra de montaje, conexionado y puesta en marcha', unidad: 'kWp', precio_usd: 95, activo: true, specs: {} },
    { id: 'ing', categoria: 'ingenieria', marca: 'Genérico', modelo: 'Proyecto y tramitación', descripcion: 'Ingeniería, planos, firma profesional y trámite de conexión', unidad: 'kWp', precio_usd: 45, activo: true, specs: {} },
  ];

  // =====================================================================
  //  Adaptador LOCAL (localStorage)
  // =====================================================================
  const KEY_P = 'alp_g_app_proyectos_v1';
  const KEY_C = 'alp_g_app_clientes_v1';
  const KEY_E = 'alp_g_app_empresa_v1';
  const KEY_R = 'alp_g_app_revisiones_v1';
  const KEY_PROD = 'alp_g_app_productos_v1';

  function lsLoad(key, def) {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch (e) { console.warn(e); }
    return def;
  }
  function lsSave(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error(e); } }
  function tsDe(id) { const n = parseInt(String(id).replace(/^p_/, ''), 10); return isFinite(n) ? n : 0; }

  const Local = {
    modo: 'local',
    async init() { return true; },
    onAuth() { },
    usuario() { return { id: 'local', nombre: 'Uso local', email: '', rol: 'admin' }; },
    puedeEditar() { return true; },
    async login() { }, async registro() { }, async logout() { },

    proyectos: {
      async list(opciones) {
        const enPapelera = !!(opciones && opciones.papelera);
        const data = lsLoad(KEY_P, { proyectos: {} });
        return Object.keys(data.proyectos).map(id => {
          const p = data.proyectos[id];
          return { id, nombre: p.nombre, kwp: p.kwp, resumen: p.resumen, cliente_id: p.cliente_id || null,
            fecha: typeof p.fecha === 'string' ? p.fecha : '', actualizado_en: p.actualizado_en || null,
            estado: p.estado, autor: '',
            estado_comercial: etapaValida(p.estado_comercial), probabilidad: p.probabilidad || 0,
            motivo_perdida: p.motivo_perdida || null, fecha_envio: p.fecha_envio || null,
            fecha_cierre: p.fecha_cierre || null, eliminado_en: p.eliminado_en || null };
        })
          .filter(p => enPapelera ? !!p.eliminado_en : !p.eliminado_en)
          .sort((a, b) => tsDe(b.id) - tsDe(a.id));
      },
      async get(id) {
        const p = lsLoad(KEY_P, { proyectos: {} }).proyectos[id];
        if (!p) return null;
        return Object.assign({ id, fecha: typeof p.fecha === 'string' ? p.fecha : '' }, p);
      },
      /** p = { id?, nombre, cliente_id, estado } */
      async save(p) {
        const data = lsLoad(KEY_P, { proyectos: {} });
        const id = p.id || 'p_' + Date.now();
        const est = estadoAStrings(p.estado);
        const ahora = new Date().toISOString();
        const previo = data.proyectos[id] || {};
        data.proyectos[id] = {
          nombre: p.nombre || est.cliente_nombre || 'Sin nombre',
          fecha: fechaFmt(ahora), kwp: est.kwp || '0', resumen: resumenDe(est), estado: est,
          cliente_id: p.cliente_id || null, actualizado_en: ahora, legacy_id: p.legacy_id || null,
          estado_comercial: etapaValida(p.estado_comercial || previo.estado_comercial),
          probabilidad: p.probabilidad !== undefined ? p.probabilidad : (previo.probabilidad || 0),
          motivo_perdida: p.motivo_perdida !== undefined ? p.motivo_perdida : (previo.motivo_perdida || null),
          fecha_envio: p.fecha_envio !== undefined ? p.fecha_envio : (previo.fecha_envio || null),
          fecha_cierre: p.fecha_cierre !== undefined ? p.fecha_cierre : (previo.fecha_cierre || null),
          eliminado_en: previo.eliminado_en || null,
        };
        lsSave(KEY_P, data);
        return Object.assign({ id }, data.proyectos[id]);
      },
      /** Borrado lógico: el proyecto va a la papelera y se puede recuperar. */
      async remove(id) {
        const data = lsLoad(KEY_P, { proyectos: {} });
        if (!data.proyectos[id]) return;
        data.proyectos[id].eliminado_en = new Date().toISOString();
        lsSave(KEY_P, data);
      },
      async restaurar(id) {
        const data = lsLoad(KEY_P, { proyectos: {} });
        if (!data.proyectos[id]) return;
        data.proyectos[id].eliminado_en = null;
        lsSave(KEY_P, data);
      },
      /** Borrado definitivo desde la papelera. */
      async purgar(id) {
        const data = lsLoad(KEY_P, { proyectos: {} });
        delete data.proyectos[id];
        lsSave(KEY_P, data);
        const revs = lsLoad(KEY_R, {});
        delete revs[id];
        lsSave(KEY_R, revs);
      },
      async cambiarEtapa(id, cambios) {
        const data = lsLoad(KEY_P, { proyectos: {} });
        const p = data.proyectos[id];
        if (!p) throw new Error('El proyecto ya no existe');
        Object.assign(p, cambios, { estado_comercial: etapaValida(cambios.estado_comercial || p.estado_comercial) });
        lsSave(KEY_P, data);
        return Object.assign({ id }, p);
      },
    },

    propuestas: {
      async list(proyectoId) {
        const m = lsLoad(KEY_R, {});
        return (m[proyectoId] || []).slice().sort((a, b) => b.revision - a.revision);
      },
      async crear(proyectoId, datos) {
        const m = lsLoad(KEY_R, {});
        const lista = m[proyectoId] || [];
        const revision = lista.reduce((max, r) => Math.max(max, r.revision), 0) + 1;
        const fila = {
          id: 'r_' + Date.now(), proyecto_id: proyectoId, revision,
          etiqueta: datos.etiqueta || ('Rev. ' + letraRevision(revision)),
          nota: datos.nota || '', estado: estadoAStrings(datos.estado),
          resumen: datos.resumen || null, creado_en: new Date().toISOString(), autor: '',
        };
        lista.push(fila);
        m[proyectoId] = lista;
        lsSave(KEY_R, m);
        return fila;
      },
      async remove(proyectoId, id) {
        const m = lsLoad(KEY_R, {});
        m[proyectoId] = (m[proyectoId] || []).filter(r => r.id !== id);
        lsSave(KEY_R, m);
      },
    },

    productos: {
      async list() {
        const guardados = lsLoad(KEY_PROD, null);
        return guardados && guardados.length ? guardados : PRODUCTOS_DEFAULT.slice();
      },
      async save(prod) {
        const lista = await this.list();
        const id = prod.id || 'p_' + Date.now();
        const i = lista.findIndex(x => x.id === id);
        const fila = Object.assign({ activo: true, specs: {} }, prod, { id });
        if (i >= 0) lista[i] = fila; else lista.push(fila);
        lsSave(KEY_PROD, lista);
        return fila;
      },
      async remove(id) {
        const lista = (await this.list()).filter(x => x.id !== id);
        lsSave(KEY_PROD, lista);
      },
    },

    async auditoria() { return []; },

    clientes: {
      async list() {
        const m = lsLoad(KEY_C, {});
        return Object.keys(m).map(id => Object.assign({ id }, m[id])).sort((a, b) => a.nombre.localeCompare(b.nombre));
      },
      async save(c) {
        const m = lsLoad(KEY_C, {});
        const id = c.id || 'c_' + Date.now();
        m[id] = { nombre: c.nombre, cuit: c.cuit || '', ubicacion: c.ubicacion || '' };
        lsSave(KEY_C, m);
        return Object.assign({ id }, m[id]);
      },
      async remove(id) { const m = lsLoad(KEY_C, {}); delete m[id]; lsSave(KEY_C, m); },
    },

    distribuidoras: { async list() { return DISTRIBUIDORAS_DEFAULT; } },

    empresa: {
      async get() { return limpiarMembrete(lsLoad(KEY_E, null)); },
      async save(m) { const lim = limpiarMembrete(m); lsSave(KEY_E, lim); return lim; },
    },
    puedeEditarEmpresa() { return true; },

    async migrarLocal() { throw new Error('Solo disponible en modo nube'); },
    localPendientes() { return 0; },
  };

  // =====================================================================
  //  Adaptador NUBE (Supabase)
  // =====================================================================
  const Nube = {
    modo: 'nube',
    client: null, sesion: null, perfil: null, _cb: null,

    async init(cfg) {
      if (!root.supabase || !root.supabase.createClient) throw new Error('No se pudo cargar la librería de Supabase (¿sin conexión?)');
      this.client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const { data } = await this.client.auth.getSession();
      this.sesion = data.session || null;
      if (this.sesion) await this._cargarPerfil();
      this.client.auth.onAuthStateChange(async (ev, s) => {
        const antes = this.sesion && this.sesion.user.id;
        this.sesion = s || null; this.perfil = null;
        if (s) await this._cargarPerfil();
        const ahora = s && s.user.id;
        if (antes !== ahora && this._cb) this._cb(this.usuario());
      });
      return true;
    },
    onAuth(cb) { this._cb = cb; },
    async _cargarPerfil() {
      const { data } = await this.client.from('perfiles').select('*').eq('id', this.sesion.user.id).maybeSingle();
      this.perfil = data || null;
    },
    usuario() {
      if (!this.sesion) return null;
      const u = this.sesion.user;
      return { id: u.id, email: u.email, nombre: (this.perfil && this.perfil.nombre) || u.email, rol: (this.perfil && this.perfil.rol) || 'vendedor' };
    },
    puedeEditar() { const u = this.usuario(); return !!u && u.rol !== 'lector'; },
    async login(email, password) {
      const { error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(traducir(error.message));
    },
    async registro(email, password, nombre) {
      const { data, error } = await this.client.auth.signUp({ email, password, options: { data: { nombre } } });
      if (error) throw new Error(traducir(error.message));
      return !!(data.session);   // false → requiere confirmar el email
    },
    async logout() { await this.client.auth.signOut(); },

    proyectos: {
      async list(opciones) {
        const enPapelera = !!(opciones && opciones.papelera);
        let q = Nube.client.from('proyectos')
          .select('id, legacy_id, cliente_id, nombre, kwp, resumen, enviado, creado_por, actualizado_en, estado, ' +
            'estado_comercial, probabilidad, motivo_perdida, fecha_envio, fecha_cierre, eliminado_en, ' +
            'perfiles!proyectos_creado_por_fkey(nombre)')
          .order('actualizado_en', { ascending: false });
        q = enPapelera ? q.not('eliminado_en', 'is', null) : q.is('eliminado_en', null);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data.map(r => ({
          id: r.id, nombre: r.nombre, kwp: r.kwp, resumen: r.resumen, cliente_id: r.cliente_id, enviado: r.enviado,
          creado_por: r.creado_por, autor: (r.perfiles && r.perfiles.nombre) || '',
          fecha: fechaFmt(r.actualizado_en), actualizado_en: r.actualizado_en, estado: r.estado,
          estado_comercial: etapaValida(r.estado_comercial), probabilidad: r.probabilidad || 0,
          motivo_perdida: r.motivo_perdida, fecha_envio: r.fecha_envio, fecha_cierre: r.fecha_cierre,
          eliminado_en: r.eliminado_en,
        }));
      },
      async get(id) {
        const { data, error } = await Nube.client.from('proyectos').select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        return Object.assign({}, data, { fecha: fechaFmt(data.actualizado_en) });
      },
      /** p = { id?, nombre, cliente_id, estado, actualizado_en?, legacy_id? }; opts.force ignora conflictos */
      async save(p, opts) {
        const est = estadoAStrings(p.estado);
        const row = { nombre: p.nombre || est.cliente_nombre || 'Sin nombre', cliente_id: p.cliente_id || null,
          kwp: kwpNum(est), resumen: resumenDe(est), estado: est };
        if (p.legacy_id) row.legacy_id = p.legacy_id;
        if (!p.id) {
          const { data, error } = await Nube.client.from('proyectos').insert(row).select().single();
          if (error) throw new Error(error.message);
          return Object.assign({}, data, { fecha: fechaFmt(data.actualizado_en) });
        }
        let q = Nube.client.from('proyectos').update(row).eq('id', p.id);
        if (!(opts && opts.force) && p.actualizado_en) q = q.eq('actualizado_en', p.actualizado_en);
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        if (!data || !data.length) {
          const actual = await this.get(p.id);
          if (!actual) throw new Error('El proyecto ya no existe (fue eliminado)');
          if (actual.actualizado_en === p.actualizado_en) throw new Error('No tenés permiso para editar este proyecto');
          throw new ConflictError(actual);
        }
        return Object.assign({}, data[0], { fecha: fechaFmt(data[0].actualizado_en) });
      },
      /** Borrado lógico: queda en la papelera con quién y cuándo lo mandó. */
      async remove(id) {
        const u = Nube.usuario();
        const { error } = await Nube.client.from('proyectos')
          .update({ eliminado_en: new Date().toISOString(), eliminado_por: u ? u.id : null }).eq('id', id);
        if (error) throw new Error(error.message);
      },
      async restaurar(id) {
        const { error } = await Nube.client.from('proyectos')
          .update({ eliminado_en: null, eliminado_por: null }).eq('id', id);
        if (error) throw new Error(error.message);
      },
      async purgar(id) {
        const { error } = await Nube.client.from('proyectos').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
      async cambiarEtapa(id, cambios) {
        const row = Object.assign({}, cambios);
        if (row.estado_comercial) row.estado_comercial = etapaValida(row.estado_comercial);
        const { data, error } = await Nube.client.from('proyectos').update(row).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
      },
    },

    propuestas: {
      async list(proyectoId) {
        const { data, error } = await Nube.client.from('propuestas')
          .select('id, proyecto_id, revision, etiqueta, nota, estado, resumen, creado_en, creado_por, perfiles(nombre)')
          .eq('proyecto_id', proyectoId).order('revision', { ascending: false });
        if (error) throw new Error(error.message);
        return data.map(r => Object.assign({}, r, { autor: (r.perfiles && r.perfiles.nombre) || '' }));
      },
      async crear(proyectoId, datos) {
        const previas = await this.list(proyectoId);
        const revision = previas.reduce((max, r) => Math.max(max, r.revision), 0) + 1;
        const row = {
          proyecto_id: proyectoId, revision,
          etiqueta: datos.etiqueta || ('Rev. ' + letraRevision(revision)),
          nota: datos.nota || '', estado: estadoAStrings(datos.estado), resumen: datos.resumen || null,
        };
        const { data, error } = await Nube.client.from('propuestas').insert(row).select().single();
        if (error) throw new Error(error.message);
        return data;
      },
      async remove(proyectoId, id) {
        const { error } = await Nube.client.from('propuestas').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
    },

    productos: {
      async list() {
        const { data, error } = await Nube.client.from('productos').select('*').eq('activo', true).order('categoria');
        if (error || !data || !data.length) return PRODUCTOS_DEFAULT.slice();
        return data;
      },
      async save(prod) {
        const row = {
          categoria: prod.categoria, marca: prod.marca || '', modelo: prod.modelo || '',
          descripcion: prod.descripcion || '', unidad: prod.unidad || 'u.',
          precio_usd: Number(prod.precio_usd) || 0, specs: prod.specs || {}, activo: prod.activo !== false,
        };
        const q = prod.id && !/^[a-z]+\d*$/.test(String(prod.id))
          ? Nube.client.from('productos').update(row).eq('id', prod.id)
          : Nube.client.from('productos').insert(row);
        const { data, error } = await q.select().single();
        if (error) {
          if (/row-level security|permission/i.test(error.message)) {
            throw new Error('Solo un administrador puede editar el catálogo de equipos');
          }
          throw new Error(error.message);
        }
        return data;
      },
      async remove(id) {
        const { error } = await Nube.client.from('productos').update({ activo: false }).eq('id', id);
        if (error) throw new Error(error.message);
      },
    },

    async auditoria(proyectoId) {
      let q = Nube.client.from('auditoria')
        .select('id, tabla, registro_id, accion, usuario_id, detalle, creado_en, perfiles:usuario_id(nombre)')
        .eq('tabla', 'proyectos').order('creado_en', { ascending: false }).limit(100);
      if (proyectoId) q = q.eq('registro_id', proyectoId);
      const { data, error } = await q;
      if (error) return [];
      return data.map(r => Object.assign({}, r, { autor: (r.perfiles && r.perfiles.nombre) || '' }));
    },

    clientes: {
      async list() {
        const { data, error } = await Nube.client.from('clientes').select('*').order('nombre');
        if (error) throw new Error(error.message);
        return data;
      },
      async save(c) {
        const row = { nombre: c.nombre, cuit: c.cuit || null, ubicacion: c.ubicacion || null };
        const q = c.id ? Nube.client.from('clientes').update(row).eq('id', c.id) : Nube.client.from('clientes').insert(row);
        const { data, error } = await q.select().single();
        if (error) throw new Error(error.message);
        return data;
      },
      async remove(id) {
        const { error } = await Nube.client.from('clientes').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
      /** Busca por nombre (case-insensitive) o crea. */
      async buscarOCrear(nombre, cuit, ubicacion) {
        if (!nombre) return null;
        const { data } = await Nube.client.from('clientes').select('*').ilike('nombre', nombre).limit(1);
        if (data && data.length) return data[0];
        return this.save({ nombre, cuit, ubicacion });
      },
    },

    distribuidoras: {
      async list() {
        const { data, error } = await Nube.client.from('distribuidoras').select('*').eq('activa', true).order('nombre');
        if (error || !data || !data.length) return DISTRIBUIDORAS_DEFAULT;
        return data;
      },
    },

    empresa: {
      async get() {
        const { data, error } = await Nube.client.from('empresa').select('*').limit(1).maybeSingle();
        if (error) { console.warn('No se pudo leer el membrete:', error.message); return limpiarMembrete(lsLoad(KEY_E, null)); }
        return limpiarMembrete(data);
      },
      /** Solo un admin puede guardarlo; la RLS lo vuelve a verificar del lado del servidor. */
      async save(m) {
        const lim = limpiarMembrete(m);
        const { data, error } = await Nube.client.from('empresa')
          .upsert(Object.assign({ id: true }, lim)).select().single();
        if (error) {
          if (/row-level security|permission/i.test(error.message)) {
            throw new Error('Solo un administrador puede cambiar el membrete de la empresa');
          }
          throw new Error(error.message);
        }
        return limpiarMembrete(data);
      },
    },
    puedeEditarEmpresa() { const u = this.usuario(); return !!u && u.rol === 'admin'; },

    /** Sube a la nube los proyectos que quedaron en localStorage. Devuelve {subidos, omitidos}. */
    async migrarLocal() {
      const local = lsLoad(KEY_P, { proyectos: {} }).proyectos;
      const ids = Object.keys(local);
      if (!ids.length) return { subidos: 0, omitidos: 0 };
      const { data: existentes } = await Nube.client.from('proyectos').select('legacy_id').not('legacy_id', 'is', null);
      const ya = new Set((existentes || []).map(r => r.legacy_id));
      let subidos = 0, omitidos = 0;
      for (const id of ids) {
        if (ya.has(id)) { omitidos++; continue; }
        const p = local[id], est = p.estado || {};
        const cli = await this.clientes.buscarOCrear(est.cliente_nombre, est.presu_cuit, est.cliente_ubicacion);
        await this.proyectos.save({ nombre: p.nombre, cliente_id: cli && cli.id, estado: est, legacy_id: id });
        subidos++;
      }
      return { subidos, omitidos };
    },
    localPendientes() { return Object.keys(lsLoad(KEY_P, { proyectos: {} }).proyectos).length; },
  };

  function traducir(msg) {
    const m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos';
    if (/Email not confirmed/i.test(m)) return 'Tenés que confirmar el email antes de ingresar';
    if (/already registered/i.test(m)) return 'Ese email ya está registrado';
    if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
    if (/rate limit/i.test(m)) return 'Demasiados intentos, esperá un minuto';
    return m;
  }

  // =====================================================================
  //  Fachada: elige adaptador y agrega importar / exportar
  // =====================================================================
  const DB = {
    modo: 'local', adaptador: Local,

    async init(cfg) {
      if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
        try { await Nube.init(cfg); this.adaptador = Nube; this.modo = 'nube'; }
        catch (e) { console.error('Supabase no disponible, usando modo local:', e); this.adaptador = Local; this.modo = 'local'; this.errorInit = e.message; }
      } else { this.adaptador = Local; this.modo = 'local'; }
      return this.modo;
    },

    onAuth(cb) { this.adaptador.onAuth(cb); },
    usuario() { return this.adaptador.usuario(); },
    puedeEditar() { return this.adaptador.puedeEditar(); },
    login(e, p) { return this.adaptador.login(e, p); },
    registro(e, p, n) { return this.adaptador.registro(e, p, n); },
    logout() { return this.adaptador.logout(); },
    get proyectos() { return this.adaptador.proyectos; },
    get clientes() { return this.adaptador.clientes; },
    get distribuidoras() { return this.adaptador.distribuidoras; },
    get empresa() { return this.adaptador.empresa; },
    get propuestas() { return this.adaptador.propuestas; },
    get productos() { return this.adaptador.productos; },
    puedeEditarEmpresa() { return this.adaptador.puedeEditarEmpresa(); },
    auditoria(id) { return this.adaptador.auditoria(id); },
    migrarLocal() { return this.adaptador.migrarLocal(); },
    localPendientes() { return this.adaptador.localPendientes(); },

    /** Importa JSON en cualquiera de los formatos aceptados. Devuelve cantidad importada. */
    async importJSON(text) {
      const mapa = mapaDesdeJSON(text);
      let n = 0;
      for (const id of Object.keys(mapa)) {
        const pr = mapa[id];
        if (!pr || typeof pr !== 'object' || !pr.estado) continue;
        const est = pr.estado;
        let cliente_id = pr.cliente_id || null;
        if (this.modo === 'nube' && !cliente_id && est.cliente_nombre) {
          const c = await Nube.clientes.buscarOCrear(est.cliente_nombre, est.presu_cuit, est.cliente_ubicacion);
          cliente_id = c && c.id;
        }
        const p = { nombre: pr.nombre || est.cliente_nombre || 'Sin nombre', cliente_id, estado: est };
        if (this.modo === 'local' && /^p_\d+$/.test(id)) p.id = id;           // conserva ids originales
        if (this.modo === 'nube' && /^p_\d+$/.test(id)) p.legacy_id = id;
        try { await this.proyectos.save(p); n++; }
        catch (e) { if (!/legacy_id/.test(e.message)) throw e; /* ya importado */ }
      }
      return n;
    },

    /** Exporta con la estructura original { proyectos: { id: {...} } }. */
    async exportJSON(ids) {
      const todos = await this.proyectos.list();
      const out = { proyectos: {} };
      todos.forEach(p => {
        if (ids && !ids.includes(p.id)) return;
        out.proyectos[p.legacy_id || p.id] = { nombre: p.nombre, fecha: p.fecha, kwp: String(p.kwp), resumen: p.resumen, estado: p.estado, cliente_id: p.cliente_id || undefined };
      });
      return JSON.stringify(out, null, 2);
    },

    usarModoLocal() {
      this.adaptador = Local;
      this.modo = 'local';
      return this.modo;
    },
  };

  DB.Local = Local;
  DB.Nube = Nube;
  DB.ConflictError = ConflictError;
  DB.fechaFmt = fechaFmt;
  DB.resumenDe = resumenDe;
  DB.DISTRIBUIDORAS_DEFAULT = DISTRIBUIDORAS_DEFAULT;
  DB.MEMBRETE_DEFAULT = MEMBRETE_DEFAULT;
  DB.PRODUCTOS_DEFAULT = PRODUCTOS_DEFAULT;
  DB.ETAPAS = ETAPAS;
  DB.MOTIVOS_PERDIDA = MOTIVOS_PERDIDA;
  DB.etapaDe = etapaDe;
  DB.etapaValida = etapaValida;
  DB.letraRevision = letraRevision;
  root.DB = DB;
})(window);
