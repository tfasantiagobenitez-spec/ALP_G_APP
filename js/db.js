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

  // =====================================================================
  //  Adaptador LOCAL (localStorage)
  // =====================================================================
  const KEY_P = 'alp_g_app_proyectos_v1';
  const KEY_C = 'alp_g_app_clientes_v1';

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
      async list() {
        const data = lsLoad(KEY_P, { proyectos: {} });
        return Object.keys(data.proyectos).map(id => {
          const p = data.proyectos[id];
          return { id, nombre: p.nombre, kwp: p.kwp, resumen: p.resumen, cliente_id: p.cliente_id || null,
            fecha: typeof p.fecha === 'string' ? p.fecha : '', actualizado_en: p.actualizado_en || null, estado: p.estado, autor: '' };
        }).sort((a, b) => tsDe(b.id) - tsDe(a.id));
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
        data.proyectos[id] = {
          nombre: p.nombre || est.cliente_nombre || 'Sin nombre',
          fecha: fechaFmt(ahora), kwp: est.kwp || '0', resumen: resumenDe(est), estado: est,
          cliente_id: p.cliente_id || null, actualizado_en: ahora, legacy_id: p.legacy_id || null,
        };
        lsSave(KEY_P, data);
        return Object.assign({ id }, data.proyectos[id]);
      },
      async remove(id) { const data = lsLoad(KEY_P, { proyectos: {} }); delete data.proyectos[id]; lsSave(KEY_P, data); },
    },

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
      async list() {
        const { data, error } = await Nube.client.from('proyectos')
          .select('id, legacy_id, cliente_id, nombre, kwp, resumen, enviado, creado_por, actualizado_en, estado, perfiles!proyectos_creado_por_fkey(nombre)')
          .order('actualizado_en', { ascending: false });
        if (error) throw new Error(error.message);
        return data.map(r => ({
          id: r.id, nombre: r.nombre, kwp: r.kwp, resumen: r.resumen, cliente_id: r.cliente_id, enviado: r.enviado,
          creado_por: r.creado_por, autor: (r.perfiles && r.perfiles.nombre) || '',
          fecha: fechaFmt(r.actualizado_en), actualizado_en: r.actualizado_en, estado: r.estado,
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
      async remove(id) {
        const { error } = await Nube.client.from('proyectos').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
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
  root.DB = DB;
})(window);
