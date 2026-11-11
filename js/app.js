/* =====================================================================
   Operaciones ION · motor de la aplicación
   - Proyectos y feriados: js/config.js
   - Formularios: js/forms/*.js (cada uno se registra con OPS.registrarFormulario)
   Este archivo normalmente no necesita cambios.
   ===================================================================== */
(function () {
  'use strict';

  const VERSION_APP = '1.1.0';
  const CFG = window.OPS_CONFIG || {};
  CFG.proyectos = CFG.proyectos || [];
  CFG.endpoint = String(CFG.endpoint || '').trim();
  const FORMS = [];

  /* ============================ utilidades ============================ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const clonar = (o) => JSON.parse(JSON.stringify(o));

  function nuevoId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* contexto no seguro */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // Convierte lo que escribe el usuario en número. Acepta "1,5", "1.5", "1.000" (mil) y "1.234,5".
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return parseFloat(s);
  }
  const fmtNum = (n, dec) => (Number.isFinite(n) ? n.toLocaleString('es-CL', { maximumFractionDigits: dec == null ? 2 : dec }) : '');
  const fmtPct = (f) => (Number.isFinite(f) ? (f * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' %' : '');

  // Fechas: se trabajan a mediodía para evitar saltos por cambio de horario.
  const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoyISO = () => isoDe(new Date());
  function fechaDe(iso) {
    const p = String(iso || '').split('-').map(Number);
    return p.length === 3 && p.every(Number.isFinite) && p[0] > 1900 ? new Date(p[0], p[1] - 1, p[2], 12) : null;
  }
  const fmtFecha = (iso) => { const d = fechaDe(iso); return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` : ''; };
  const fmtFechaHora = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const FERIADOS = new Set(CFG.feriados || []);
  const esHabil = (d) => { const w = d.getDay(); return w !== 0 && w !== 6 && !FERIADOS.has(isoDe(d)); };
  // Equivale a NETWORKDAYS(desde; hasta) - 1 del Excel, descontando además los feriados de Chile.
  function diasHabiles(desdeISO, hastaISO) {
    const a = fechaDe(desdeISO), b = fechaDe(hastaISO);
    if (!a || !b || b < a) return null;
    let n = 0;
    for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (esHabil(d)) n++;
    return n - 1;
  }

  const UTIL = { esc, num, fmtNum, fmtPct, fmtFecha, fmtFechaHora, isoDe, hoyISO, fechaDe, diasHabiles, esHabil, nuevoId, clonar };

  /* ============================ almacenamiento ============================ */
  // Preferencias pequeñas (proyecto elegido, claves, datos del firmante).
  const LS = (() => {
    try { const s = window.localStorage; s.setItem('__ops', '1'); s.removeItem('__ops'); return s; } catch (e) {
      const m = {};
      return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
    }
  })();
  const pref = {
    get(k, def) { try { const v = LS.getItem('ops:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { LS.setItem('ops:' + k, JSON.stringify(v)); } catch (e) { /* sin espacio */ } },
    del(k) { try { LS.removeItem('ops:' + k); } catch (e) { /* nada */ } }
  };

  // Borradores y envíos (incluyen fotos y firmas): IndexedDB; si no existe, memoria de la sesión.
  const DB = (() => {
    const mem = new Map();
    let abriendo = null;
    function abrir() {
      if (!abriendo) {
        abriendo = new Promise((res) => {
          try {
            const r = indexedDB.open('operaciones-ion', 1);
            r.onupgradeneeded = () => r.result.createObjectStore('kv');
            r.onsuccess = () => res(r.result);
            r.onerror = () => res(null);
            r.onblocked = () => res(null);
          } catch (e) { res(null); }
        });
      }
      return abriendo;
    }
    function op(db, modo, fn) {
      return new Promise((res, rej) => {
        const tx = db.transaction('kv', modo);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => res(req ? req.result : undefined);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('No se pudo guardar'));
      });
    }
    return {
      async get(k) { const db = await abrir(); if (db) return op(db, 'readonly', (s) => s.get(k)); const v = mem.get(k); return v === undefined ? undefined : clonar(v); },
      async set(k, v) { const db = await abrir(); if (db) return op(db, 'readwrite', (s) => s.put(v, k)); mem.set(k, clonar(v)); },
      async del(k) { const db = await abrir(); if (db) return op(db, 'readwrite', (s) => s.delete(k)); mem.delete(k); },
      async lista(prefijo) {
        const db = await abrir();
        if (db) return op(db, 'readonly', (s) => s.getAll(IDBKeyRange.bound(prefijo, prefijo + '￿')));
        return [...mem.entries()].filter(([k]) => k.startsWith(prefijo)).map(([, v]) => clonar(v));
      }
    };
  })();

  /* ============================ interfaz básica ============================ */
  let toastT = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), ms || 2800);
  }

  // Ventana modal propia (no usa alert/confirm del navegador). Devuelve { valor, datos }.
  function modal(o) {
    return new Promise((resolve) => {
      const botones = o.botones || [{ txt: 'Aceptar', valor: true, clase: 'prim' }];
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="modal-c" role="dialog" aria-modal="true">${o.titulo ? `<h3>${esc(o.titulo)}</h3>` : ''}${o.html || ''}
        <div class="btns">${botones.map((b, i) => `<button class="btn ${b.clase || 'fant'}" data-i="${i}">${esc(b.txt)}</button>`).join('')}</div></div>`;
      document.body.appendChild(m);
      const cerrar = (valor) => {
        const datos = {};
        $$('input, textarea, select', m).forEach((i) => { if (i.name) datos[i.name] = i.value; });
        m.remove();
        resolve({ valor, datos });
      };
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) cerrar(botones[+b.dataset.i].valor);
        else if (e.target === m && o.cerrable !== false) cerrar(null);
      });
      m.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const p = botones.find((b) => b.clase === 'prim'); if (p) cerrar(p.valor); }
      });
      if (o.alAbrir) o.alAbrir(m);
    });
  }
  const confirmar = (titulo, texto, si, clase) =>
    modal({ titulo, html: `<p>${esc(texto)}</p>`, botones: [{ txt: 'Cancelar', valor: false }, { txt: si || 'Aceptar', valor: true, clase: clase || 'prim' }] }).then((r) => r.valor === true);

  function cargando(texto) {
    let c = $('#carga');
    if (texto === false) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'carga'; c.className = 'carga'; document.body.appendChild(c); }
    c.innerHTML = `<div><div class="spin"></div>${esc(texto || 'Cargando…')}</div>`;
  }

  let puedeCompartirCache = null;
  function puedeCompartir() {
    if (puedeCompartirCache === null) {
      try { puedeCompartirCache = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { puedeCompartirCache = false; }
    }
    return puedeCompartirCache;
  }

  /* ============================ estado y navegación ============================ */
  const S = { vista: '', proyecto: null, form: null, data: null, paso: 0, draftKey: '', abiertos: new Set(), ultimo: null, enviando: false };
  const app = () => $('#app');
  const formPorId = (id) => FORMS.find((f) => f.id === id);
  const ctxBase = () => ({ proyecto: S.proyecto, util: UTIL, catalogo: S.proyecto ? catalogoDe(S.proyecto.codigo) : null });

  function ir(vista, o) {
    S.vista = vista;
    if (o && o.reemplazar) history.replaceState({ vista }, ''); else history.pushState({ vista }, '');
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    actualizarCabecera();
    $('#navPasos').hidden = S.vista !== 'form';
    if (!S.proyecto && S.vista !== 'proyectos' && S.vista !== 'envios') S.vista = 'proyectos';
    switch (S.vista) {
      case 'menu': return vistaMenu();
      case 'form': return S.form && S.data ? vistaForm() : (S.vista = 'menu', render());
      case 'exito': return S.ultimo ? vistaExito() : (S.vista = 'menu', render());
      case 'envios': return vistaEnvios();
      default: S.vista = 'proyectos'; return vistaProyectos();
    }
  }

  function actualizarCabecera() {
    const p = S.proyecto, bp = $('#btnProyecto');
    bp.hidden = !p || S.vista === 'proyectos';
    if (p) bp.textContent = p.codigo;
    $('#topSub').textContent = S.vista === 'form' && S.form ? S.form.nombre : (p && S.vista !== 'proyectos' ? p.nombre : 'Formularios de obra');
    actualizarRed();
  }

  function actualizarRed() {
    const on = navigator.onLine;
    const n = $('#net');
    n.classList.toggle('off', !on);
    n.title = on ? 'Con conexión' : 'Sin conexión';
    let h = '';
    if (!CFG.endpoint) h += '<div class="banner demo">Modo demostración: la app aún no está conectada a la planilla. Los PDF se generan, pero no se registran.</div>';
    if (!on) h += '<div class="banner off">Sin señal. Puede seguir completando: los envíos quedan guardados y se envían solos cuando vuelve la conexión.</div>';
    $('#banner').innerHTML = h;
  }

  /* ============================ vistas ============================ */
  function vistaProyectos() {
    const actual = S.proyecto && S.proyecto.codigo;
    app().innerHTML = `
      <h2 class="titulo-vista">¿En qué proyecto está trabajando?</h2>
      <p class="sub-vista">Los documentos quedarán asociados a este proyecto.</p>
      <div class="lista-op">${CFG.proyectos.map((p) => `
        <button class="op${p.codigo === actual ? ' sel' : ''}" data-proy="${esc(p.codigo)}">
          <span class="cod">${esc(p.codigo)}</span><span class="tx"><b>${esc(p.nombre)}</b></span><span class="fl">›</span>
        </button>`).join('')}
      </div>
      <button class="link-btn" data-ir="envios">Ver mis envíos</button>`;
  }

  async function vistaMenu() {
    const p = S.proyecto;
    app().innerHTML = `
      <h2 class="titulo-vista">${esc(p.nombre)}</h2>
      <p class="sub-vista">Proyecto ${esc(p.codigo)} · ¿Qué documento necesita?</p>
      <div class="lista-op">
        ${FORMS.map((f) => `
          <button class="op" data-form="${esc(f.id)}">
            <span class="ico">${esc(f.icono || '📄')}</span>
            <span class="tx"><b>${esc(f.nombre)}</b><small>${esc(f.descripcion || '')}</small></span>
            <span class="tag" data-borrador="${esc(f.id)}" hidden>Borrador</span><span class="fl">›</span>
          </button>`).join('')}
        ${(CFG.proximos || []).map((x) => `
          <div class="op prox"><span class="ico">${esc(x.icono || '📄')}</span>
            <span class="tx"><b>${esc(x.nombre)}</b><small>Próximamente</small></span></div>`).join('')}
      </div>
      ${(() => { const t = ((CFG.proyectos || []).find((x) => x.codigo === p.codigo) || {}).tablero; return t ? `<div class="lista-op"><a class="op" href="${esc(t)}" style="text-decoration:none;color:inherit"><span class="ico">📊</span><span class="tx"><b>Tablero del proyecto</b><small>Programa, tareas por área y minutas</small></span><span class="fl">›</span></a></div>` : ''; })()}
      <div class="lista-op">
        <button class="op" data-ir="envios"><span class="ico">🗂️</span>
          <span class="tx"><b>Mis envíos</b><small>Documentos generados en este teléfono</small></span>
          <span class="tag alerta" id="tagPend" hidden></span><span class="fl">›</span></button>
      </div>
      <button class="link-btn" data-ir="proyectos">Cambiar de proyecto</button>
      ${CFG.endpoint && CFG.pedirClave ? '<button class="link-btn" data-acc="cambiar-clave">Cambiar clave del proyecto</button>' : ''}`;
    for (const f of FORMS) {
      const b = await DB.get(claveBorrador(f)).catch(() => null);
      const t = $(`[data-borrador="${f.id}"]`);
      if (b && t) t.hidden = false;
    }
    actualizarPendientes();
  }

  async function actualizarPendientes() {
    const recs = await DB.lista('env:').catch(() => []);
    const n = recs.filter((r) => r.estado === 'pendiente' || r.estado === 'error').length;
    const t = $('#tagPend');
    if (t) { t.hidden = !n; t.textContent = n === 1 ? '1 por enviar' : `${n} por enviar`; }
    return n;
  }

  function vistaExito() {
    const r = S.ultimo;
    const ico = { enviado: '✅', pendiente: '⏳', error: '⚠️', demo: '📄' }[r.estado] || '📄';
    let titulo, txt;
    if (r.estado === 'enviado') {
      titulo = '¡Enviado!';
      txt = r.aviso || (r.notificados ? 'Quedó registrado en la planilla de Operaciones y se envió por correo al equipo del proyecto.' : 'Quedó registrado en la planilla de Operaciones.');
    }
    else if (r.estado === 'pendiente') { titulo = 'Guardado, pendiente de envío'; txt = 'No hay conexión con el servidor. Se enviará solo cuando el teléfono tenga señal y la app esté abierta. Puede revisar el estado en «Mis envíos».'; }
    else if (r.estado === 'error') { titulo = 'No se pudo enviar'; txt = r.error || 'Error desconocido.'; }
    else { titulo = 'PDF generado'; txt = 'Modo demostración: el PDF se descargó en este teléfono, pero no se registró en la planilla porque la app aún no está conectada.'; }
    const definitivo = r.estado === 'enviado' || r.estado === 'demo';
    app().innerHTML = `
      <section class="card exito">
        <div class="ico">${ico}</div>
        <h2>${esc(titulo)}</h2>
        ${r.folio ? `<div class="folio">${esc(r.folio)}</div>` : ''}
        <p class="sub">${esc(r.nombre)} · ${esc(r.proyecto.codigo)} ${esc(r.proyecto.nombre)}</p>
        <p>${esc(txt)}</p>
        <button class="btn prim" data-acc="pdf" data-id="${esc(r.id)}">⬇ Descargar PDF${definitivo ? '' : ' (borrador)'}</button>
        ${puedeCompartir() ? `<button class="btn azul" data-acc="compartir" data-id="${esc(r.id)}">📤 Compartir PDF</button>` : ''}
        ${r.estado === 'error' || r.estado === 'pendiente' ? `<button class="btn verde" data-acc="reintentar" data-id="${esc(r.id)}">Reintentar envío</button>` : ''}
        <button class="btn fant" data-acc="nuevo" data-f="${esc(r.formId)}">Nuevo documento</button>
        <button class="btn fant" data-ir="menu">Volver al inicio</button>
      </section>`;
  }

  async function vistaEnvios() {
    app().innerHTML = `
      <h2 class="titulo-vista">Mis envíos</h2>
      <p class="sub-vista">Documentos generados en este teléfono (todos los proyectos).</p>
      <div id="listaEnvios"><div class="vacio">Cargando…</div></div>
      <button class="link-btn" data-ir="${S.proyecto ? 'menu' : 'proyectos'}">‹ Volver</button>`;
    const recs = (await DB.lista('env:').catch(() => [])).sort((a, b) => b.creado.localeCompare(a.creado));
    const cont = $('#listaEnvios');
    if (!cont || S.vista !== 'envios') return;
    if (!recs.length) { cont.innerHTML = '<div class="vacio">Todavía no hay documentos generados en este teléfono.</div>'; return; }
    const pend = recs.filter((r) => r.estado === 'pendiente').length;
    cont.innerHTML = (pend && CFG.endpoint
      ? `<div class="card" style="padding:12px 14px"><button class="btn verde" style="margin:0" data-acc="enviar-pendientes">Enviar ${pend === 1 ? '1 pendiente' : pend + ' pendientes'} ahora</button></div>`
      : '') + recs.map(htmlEnvio).join('');
  }

  function htmlEnvio(r) {
    const est = { enviado: ['ok', 'Enviado'], pendiente: ['pend', 'Pendiente'], error: ['mal', 'Error'], demo: ['gris', 'Demostración'] }[r.estado] || ['gris', r.estado];
    const f = formPorId(r.formId);
    const etiqueta = f && f.etiqueta ? ' · ' + f.etiqueta(r.data) : '';
    return `
      <div class="envio">
        <div class="envio-h">
          <div><b>${esc(r.folio || 'Sin folio aún')}</b>
            <small>${esc(r.proyecto.codigo)} · ${esc(r.nombre)}${esc(etiqueta)}</small>
            <small>Creado ${esc(fmtFechaHora(r.creado))}${r.enviado ? ' · enviado ' + esc(fmtFechaHora(r.enviado)) : ''}</small></div>
          <span class="pill ${est[0]}">${est[1]}</span>
        </div>
        ${r.error && r.estado !== 'enviado' ? `<div class="error-tx">${esc(r.error)}</div>` : ''}
        <div class="envio-acc">
          <button data-acc="pdf" data-id="${esc(r.id)}">PDF</button>
          ${puedeCompartir() ? `<button data-acc="compartir" data-id="${esc(r.id)}">Compartir</button>` : ''}
          ${r.estado === 'error' || r.estado === 'pendiente' ? `<button data-acc="reintentar" data-id="${esc(r.id)}">Reintentar</button>` : ''}
          <button class="del" data-acc="eliminar" data-id="${esc(r.id)}" aria-label="Eliminar de este teléfono">🗑</button>
        </div>
      </div>`;
  }

  /* ============================ proyecto y clave ============================ */
  const necesitaClave = (codigo) => !!(CFG.endpoint && CFG.pedirClave && !pref.get('clave:' + codigo, '') && !pref.get('sinClave:' + codigo, false));

  async function elegirProyecto(codigo) {
    const p = CFG.proyectos.find((x) => x.codigo === codigo);
    if (!p) return;
    if (necesitaClave(p.codigo) && !(await pedirClave(p))) return;
    S.proyecto = { codigo: p.codigo, nombre: p.nombre };
    pref.set('proyecto', p.codigo);
    ir('menu');
  }

  async function pedirClave(p, mensaje) {
    // Si el proyecto no tiene clave en la planilla, no se pregunta.
    if (!mensaje && navigator.onLine) {
      cargando('Verificando proyecto…');
      try {
        await api({ action: 'validar', proyecto: p.codigo, clave: '' }, 20000);
        cargando(false);
        pref.set('sinClave:' + p.codigo, true);
        return true;
      } catch (e) {
        cargando(false);
        if (e.codigo === 'proyecto') { toast(e.message, 5000); return false; }
      }
    }
    for (;;) {
      const r = await modal({
        titulo: `Clave del proyecto ${p.codigo}`,
        html: `<p>${esc(mensaje || 'Ingrese la clave que le entregó el PM o el Ing. de Proyecto. Se pide solo una vez en este teléfono.')}</p>
               <input type="password" name="clave" autocomplete="off" autocapitalize="off" placeholder="Clave del proyecto">`,
        botones: [{ txt: 'Cancelar', valor: null }, { txt: 'Continuar', valor: 'ok', clase: 'prim' }],
        alAbrir: (m) => setTimeout(() => { const i = $('input', m); if (i) i.focus(); }, 60)
      });
      if (r.valor !== 'ok') return false;
      const clave = String(r.datos.clave || '').trim();
      if (!clave) { mensaje = 'Debe ingresar la clave.'; continue; }
      if (navigator.onLine) {
        cargando('Validando clave…');
        try {
          await api({ action: 'validar', proyecto: p.codigo, clave }, 20000);
        } catch (e) {
          if (e.codigo === 'clave') { cargando(false); mensaje = 'La clave no es correcta. Inténtelo de nuevo.'; continue; }
          if (e.codigo === 'proyecto') { cargando(false); toast(e.message, 5000); return false; }
          // Sin conexión u otro problema: se valida al momento de enviar.
        }
        cargando(false);
      }
      pref.set('clave:' + p.codigo, clave);
      pref.del('sinClave:' + p.codigo);
      return true;
    }
  }

  /* ============================ catálogo de actividades ============================ */
  // Lista de partidas, etapas y actividades que publica el Excel de control del proyecto.
  // Se guarda en el teléfono para poder reportar sin señal.
  const CATS = {};
  function catalogoDe(codigo) {
    if (!CATS[codigo]) CATS[codigo] = pref.get('catalogo:' + codigo, null);
    return CATS[codigo];
  }
  async function asegurarCatalogo(p) {
    const guardado = catalogoDe(p.codigo);
    if (CFG.endpoint && navigator.onLine) {
      cargando('Actualizando lista de actividades…');
      try {
        const r = await api({ action: 'catalogo_get', proyecto: p.codigo, clave: pref.get('clave:' + p.codigo, '') }, 30000);
        if (r.catalogo && Array.isArray(r.catalogo.items)) {
          CATS[p.codigo] = r.catalogo;
          pref.set('catalogo:' + p.codigo, r.catalogo);
        }
      } catch (e) {
        if (e.codigo === 'clave') { cargando(false); toast(e.message, 5000); return false; }
        if (e.codigo === 'catalogo' && !guardado) { cargando(false); toast(e.message, 6000); return false; }
      } finally { cargando(false); }
    }
    if (!catalogoDe(p.codigo)) {
      toast(CFG.endpoint ? 'No hay lista de actividades en este teléfono. Conéctese a internet y vuelva a abrir el formulario.' : 'Modo demostración: no hay lista de actividades (falta conectar la app).', 6000);
      return false;
    }
    return true;
  }

  /* ============================ formulario ============================ */
  const claveBorrador = (f) => `borrador:${S.proyecto.codigo}:${f.id}`;
  const recorrerCampos = (f, fn) => f.pasos.forEach((p) => p.campos.forEach(fn));

  function buscarDef(id, itemsId) {
    for (const p of S.form.pasos) {
      for (const c of p.campos) {
        if (itemsId) { if (c.id === itemsId && c.tipo === 'items') return c.campos.find((x) => x.id === id) || null; }
        else if (c.id === id) return c;
      }
    }
    return null;
  }

  async function abrirForm(id) {
    const f = formPorId(id);
    if (!f || !S.proyecto) return;
    if (necesitaClave(S.proyecto.codigo) && !(await pedirClave(S.proyecto))) return;
    if (f.catalogo && !(await asegurarCatalogo(S.proyecto))) return;
    const dk = `borrador:${S.proyecto.codigo}:${f.id}`;
    const b = await DB.get(dk).catch(() => null);
    let data = null, paso = 0;
    if (b && b.data) {
      const r = await modal({
        titulo: 'Tiene un borrador guardado',
        html: `<p>Guardado el ${esc(fmtFechaHora(b.guardado))}. ¿Desea continuarlo?</p>`,
        botones: [{ txt: 'Empezar de nuevo', valor: 'nuevo' }, { txt: 'Continuar', valor: 'seguir', clase: 'prim' }]
      });
      if (r.valor === null) return;
      if (r.valor === 'seguir') { data = b.data; paso = Math.min(b.paso || 0, f.pasos.length - 1); }
      else await DB.del(dk).catch(() => {});
    }
    S.form = f;
    S.draftKey = dk;
    S.data = data || datosIniciales(f);
    S.paso = paso;
    S.abiertos = new Set();
    recorrerCampos(f, (c) => {
      if (c.tipo !== 'items') return;
      S.data[c.id] = S.data[c.id] || [];
      S.data[c.id].forEach((it) => { if (!it._id) it._id = nuevoId(); });
      if (S.data[c.id].length === 1) S.abiertos.add(S.data[c.id][0]._id);
    });
    ir('form');
  }

  function datosIniciales(f) {
    const d = f.inicial(ctxBase());
    recorrerCampos(f, (c) => {
      if (c.recordar) { const v = pref.get('recordar:' + c.id, null); if (v) d[c.id] = v; }
    });
    return d;
  }

  function vistaForm() {
    const f = S.form, d = S.data, paso = f.pasos[S.paso];
    app().innerHTML = `
      <div class="pasos">${f.pasos.map((p, i) => `<button class="paso-pill${i === S.paso ? ' act' : ''}${i < S.paso ? ' ok' : ''}" data-paso="${i}">${i + 1}. ${esc(p.titulo)}</button>`).join('')}</div>
      <section class="card">
        <h2>${esc(paso.titulo)}</h2>${paso.ayuda ? `<p class="sub">${esc(paso.ayuda)}</p>` : ''}
        <div class="grid" id="campos">${paso.campos.map((c) => htmlCampo(c, d, null)).join('')}</div>
        ${paso.final ? htmlFinal() : ''}
      </section>`;
    $$('canvas[data-firma]', app()).forEach(activarFirma);
    $('#btnAnt').textContent = S.paso === 0 ? '‹ Volver' : '‹ Anterior';
    $('#btnSig').hidden = !!paso.final;
    const pill = $('.paso-pill.act');
    if (pill && pill.scrollIntoView) pill.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (paso.alMostrar) setTimeout(() => { if (S.vista === 'form' && S.data) paso.alMostrar(S.data, ctxBase()); }, 0);
  }

  // Permite a un formulario completar campos por su cuenta (p. ej. clima automático)
  function asignarDatos(obj) {
    if (!S.data || S.vista !== 'form') return false;
    Object.assign(S.data, obj);
    rehacerPaso();
    programarBorrador();
    return true;
  }

  function rehacerPaso() { const y = window.scrollY; vistaForm(); window.scrollTo(0, y); }

  function htmlFinal() {
    return CFG.endpoint
      ? `<button class="btn verde" data-acc="enviar">📤 Enviar</button>
         <button class="btn fant" data-acc="ver-borrador">Ver PDF antes de enviar</button>`
      : `<div class="aviso info">Modo demostración: se generará el PDF en este teléfono, pero no se registrará en la planilla.</div>
         <button class="btn verde" data-acc="enviar">⬇ Generar PDF</button>`;
  }

  const opcionesDe = (c, d, it) => (typeof c.opciones === 'function' ? c.opciones(d, it) : c.opciones) || [];
  const esReq = (c, d, it) => (typeof c.req === 'function' ? !!c.req(d, it) : !!c.req);

  function htmlCampo(c, d, it) {
    const v = (it || d)[c.id];
    const medio = c.ancho === 'medio' ? ' medio' : '';
    const lab = c.label ? `<label class="fl">${esc(c.label)} <b class="req"${esReq(c, d, it) ? '' : ' hidden'}>*</b></label>` : '';
    const ayuda = c.ayuda ? `<small class="ayuda">${esc(c.ayuda)}</small>` : '';
    const ph = c.placeholder ? ` placeholder="${esc(c.placeholder)}"` : '';
    let ctrl = '';
    switch (c.tipo) {
      case 'texto': ctrl = `<input type="text" data-k="${c.id}" value="${esc(v)}"${ph} autocomplete="off">`; break;
      case 'correo': ctrl = `<input type="email" data-k="${c.id}" value="${esc(v)}"${ph} inputmode="email" autocomplete="email" autocapitalize="off">`; break;
      case 'numero': ctrl = `<input type="text" data-k="${c.id}" value="${esc(v)}"${ph || ' placeholder="0"'} inputmode="decimal" autocomplete="off">`; break;
      case 'fecha': ctrl = `<input type="date" data-k="${c.id}" value="${esc(v)}">`; break;
      case 'area': ctrl = `<textarea data-k="${c.id}" rows="${c.filas || 3}"${ph}>${esc(v)}</textarea>`; break;
      case 'opciones':
        ctrl = `<div class="seg" role="radiogroup">${opcionesDe(c, d, it).map((o) =>
          `<button type="button" class="seg-b${o === v ? ' on' : ''}" data-k="${c.id}" data-val="${esc(o)}" role="radio" aria-checked="${o === v}">${esc(o)}</button>`).join('')}</div>`;
        break;
      case 'lista': ctrl = htmlSelect(c, d, it); break;
      case 'calculo':
        return `<div class="campo${medio}" data-campo="${c.id}">${lab}<div class="calc-v ${c.estilo ? c.estilo(d, it) || '' : ''}">${esc(c.valor(d, it))}</div></div>`;
      case 'aviso': return `<div data-campo="${c.id}">${c.html(d, it) || ''}</div>`;
      case 'items': return htmlItems(c, d);
      case 'firma':
        ctrl = `<div class="firma-box${v ? ' con' : ''}"><canvas data-firma="${c.id}"></canvas><div class="ph">Firme aquí con el dedo</div></div>
                <div class="firma-acc"><button type="button" data-acc="borrar-firma" data-k="${c.id}">Borrar firma</button></div>`;
        break;
      case 'fotos': ctrl = htmlFotos(c, v || []); break;
      case 'resumen': return `<div data-campo="${c.id}">${c.html(d, ctxBase())}</div>`;
      case 'custom': return `<div class="campo" data-campo="${c.id}">${lab}${c.html(d, ctxBase())}${ayuda}<div class="err-msg"></div></div>`;
      default: ctrl = '';
    }
    return `<div class="campo${medio}" data-campo="${c.id}"${c.visible && !c.visible(d, it) ? ' hidden' : ''}>${lab}${ctrl}${ayuda}<div class="err-msg"></div></div>`;
  }

  function htmlSelect(c, d, it) {
    const ops = opcionesDe(c, d, it), v = (it || d)[c.id];
    const ph = ops.length ? (c.placeholder || 'Seleccione…') : (c.vacio || '—');
    return `<select data-k="${c.id}" data-ops="${esc(ops.join('|'))}"${ops.length ? '' : ' disabled'}><option value="">${esc(ph)}</option>${ops.map((o) =>
      `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }

  function htmlItems(c, d) {
    const lista = d[c.id] || [];
    return `<div class="items" data-campo="${c.id}" data-items="${c.id}">
      ${lista.map((it, i) => htmlItem(c, d, it, i)).join('')}
      <div class="err-msg"></div>
      <button type="button" class="btn punt" data-acc="agregar-item" data-items-id="${c.id}">＋ Agregar ${esc(c.itemNombre || 'ítem')}</button>
    </div>`;
  }

  function htmlItem(c, d, it, i) {
    return `<div class="item${S.abiertos.has(it._id) ? '' : ' cerrado'}" data-item="${esc(it._id)}">
      <div class="item-h"><span class="n">${i + 1}</span>
        <button type="button" class="t" data-acc="toggle-item"><b>${esc(c.titulo(it, i))}</b><small>${esc(c.sub(it, i))}</small></button>
        <button type="button" class="tog" data-acc="toggle-item" aria-label="Abrir o cerrar">▾</button></div>
      <div class="item-b grid">${c.campos.map((sc) => htmlCampo(sc, d, it)).join('')}
        <div class="item-acc"><button type="button" data-acc="duplicar-item">Duplicar</button><button type="button" class="del" data-acc="quitar-item">Eliminar</button></div>
      </div>
    </div>`;
  }

  function htmlFotos(c, fotos) {
    const max = c.max || 6;
    return `<div class="fotos-g">${fotos.map((f, i) => `
        <div class="foto"><img src="${esc(f.data)}" alt="Foto ${i + 1}"><button type="button" data-acc="quitar-foto" data-k="${c.id}" data-i="${i}" aria-label="Quitar foto">×</button></div>`).join('')}
        ${fotos.length < max ? `<label class="foto-add"><input type="file" accept="image/*" multiple data-fotos="${c.id}"><div><span>📷</span>Agregar foto</div></label>` : ''}
      </div><small class="ayuda">${fotos.length} de ${max} fotos</small>`;
  }

  // Ubica el ítem (si corresponde) al que pertenece un elemento del formulario.
  function contexto(el) {
    const itemEl = el.closest('[data-item]');
    if (!itemEl) return { it: null, itemsId: null };
    const itemsId = itemEl.closest('[data-items]').dataset.items;
    return { it: (S.data[itemsId] || []).find((x) => x._id === itemEl.dataset.item) || null, itemsId };
  }

  function asignar(el, valor) {
    const { it } = contexto(el);
    const fuente = it || S.data;
    if (fuente[el.dataset.k] === valor) return;
    fuente[el.dataset.k] = valor;
    const campo = el.closest('[data-campo]');
    if (campo) campo.classList.remove('err');
    refrescar();
    programarBorrador();
  }

  // Recalcula campos calculados, avisos, listas dependientes, obligatoriedad y títulos de ítems.
  function refrescar() {
    const raiz = $('#campos');
    if (!raiz) return;
    $$('[data-campo]', raiz).forEach((el) => {
      const { it, itemsId } = contexto(el);
      const def = buscarDef(el.dataset.campo, itemsId);
      if (!def) return;
      if (def.tipo === 'calculo') {
        const cv = $('.calc-v', el);
        cv.textContent = def.valor(S.data, it);
        cv.className = 'calc-v ' + (def.estilo ? def.estilo(S.data, it) || '' : '');
      } else if (def.tipo === 'aviso') {
        el.innerHTML = def.html(S.data, it) || '';
      } else if (def.tipo === 'lista' && typeof def.opciones === 'function') {
        const sel = $('select', el), ops = opcionesDe(def, S.data, it);
        if (sel && sel.dataset.ops !== ops.join('|')) {
          const fuente = it || S.data;
          if (!ops.includes(fuente[def.id])) fuente[def.id] = '';
          sel.outerHTML = htmlSelect(def, S.data, it);
        }
      }
      const star = $(':scope > label .req', el);
      if (star) star.hidden = !esReq(def, S.data, it);
      if (def.visible) el.hidden = !def.visible(S.data, it);
    });
    $$('[data-item]', raiz).forEach((itemEl) => {
      const itemsId = itemEl.closest('[data-items]').dataset.items;
      const c = buscarDef(itemsId), lista = S.data[itemsId] || [];
      const i = lista.findIndex((x) => x._id === itemEl.dataset.item);
      if (i < 0) return;
      $('.item-h .t b', itemEl).textContent = c.titulo(lista[i], i);
      $('.item-h .t small', itemEl).textContent = c.sub(lista[i], i);
    });
  }

  /* ---------- validación ---------- */
  function validarCampo(c, d, it) {
    if (c.tipo === 'custom') return c.validar ? c.validar(null, d, ctxBase()) || null : null;
    if (['calculo', 'aviso', 'resumen', 'items'].includes(c.tipo)) return null;
    if (c.visible && !c.visible(d, it)) return null;
    const v = (it || d)[c.id];
    const vacio = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim());
    if (vacio) {
      if (!esReq(c, d, it)) return null;
      if (c.tipo === 'firma') return 'Falta la firma';
      if (c.tipo === 'opciones' || c.tipo === 'lista') return 'Seleccione una opción';
      return 'Campo obligatorio';
    }
    if (c.tipo === 'numero') {
      const n = num(v);
      if (!Number.isFinite(n)) return 'Ingrese un número válido';
      if (c.min != null && n < c.min) return `Debe ser ${c.min} o más`;
      if (c.mayorQue != null && n <= c.mayorQue) return `Debe ser mayor que ${c.mayorQue}`;
    }
    if (c.tipo === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim())) return 'Correo no válido';
    if (c.tipo === 'lista' && !opcionesDe(c, d, it).includes(v)) return 'Seleccione una opción de la lista';
    if (c.tipo === 'fecha' && !fechaDe(v)) return 'Fecha no válida';
    if (c.validar) return c.validar(v, d, it) || null;
    return null;
  }

  function validarPaso(i) {
    const errs = [], d = S.data;
    for (const c of S.form.pasos[i].campos) {
      if (c.tipo === 'items') {
        const lista = d[c.id] || [];
        if (lista.length < (c.min || 0)) errs.push({ campo: c.id, msg: `Agregue al menos ${c.min === 1 ? 'un' : c.min} ${c.itemNombre || 'ítem'}` });
        lista.forEach((it) => c.campos.forEach((sc) => { const m = validarCampo(sc, d, it); if (m) errs.push({ campo: sc.id, item: it._id, msg: m }); }));
      } else {
        const m = validarCampo(c, d, null);
        if (m) errs.push({ campo: c.id, msg: m });
      }
    }
    return errs;
  }

  function mostrarErrores(errs) {
    const raiz = $('#campos');
    if (!raiz) return;
    $$('.err', raiz).forEach((el) => el.classList.remove('err'));
    $$('.err-item', raiz).forEach((el) => el.classList.remove('err-item'));
    let primero = null;
    errs.forEach((er) => {
      let el;
      if (er.item) {
        const itemEl = $(`[data-item="${er.item}"]`, raiz);
        if (!itemEl) return;
        itemEl.classList.add('err-item');
        itemEl.classList.remove('cerrado');
        S.abiertos.add(er.item);
        el = $(`[data-campo="${er.campo}"]`, itemEl);
      } else {
        el = $$(`[data-campo="${er.campo}"]`, raiz).find((x) => !x.closest('[data-item]'));
      }
      if (!el) return;
      el.classList.add('err');
      const m = $(':scope > .err-msg', el);
      if (m) m.textContent = er.msg;
      primero = primero || el;
    });
    toast(errs.length === 1 ? 'Falta completar o corregir 1 campo' : `Faltan completar o corregir ${errs.length} campos`);
    if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function irAPaso(i) {
    if (i === S.paso || i < 0 || i >= S.form.pasos.length) return;
    if (i > S.paso) {
      for (let k = S.paso; k < i; k++) {
        const errs = validarPaso(k);
        if (errs.length) {
          if (k !== S.paso) { S.paso = k; vistaForm(); }
          mostrarErrores(errs);
          return;
        }
      }
    }
    S.paso = i;
    guardarBorradorYa();
    vistaForm();
    window.scrollTo(0, 0);
  }

  function salirForm() {
    guardarBorradorYa();
    if (history.state && history.state.vista === 'form') history.back();
    else ir('menu', { reemplazar: true });
  }

  /* ---------- borrador automático ---------- */
  let borradorT = null;
  function programarBorrador() { clearTimeout(borradorT); borradorT = setTimeout(guardarBorradorYa, 700); }
  function guardarBorradorYa() {
    clearTimeout(borradorT);
    if (!S.data || !S.draftKey) return Promise.resolve();
    return DB.set(S.draftKey, { data: S.data, paso: S.paso, guardado: new Date().toISOString() })
      .catch(() => toast('No se pudo guardar el borrador: memoria del teléfono llena', 5000));
  }

  /* ---------- firma ---------- */
  function activarFirma(cv) {
    const k = cv.dataset.firma, caja = cv.parentElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    let ctx;
    function ajustar() {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      cv.width = Math.round(r.width * ratio);
      cv.height = Math.round(r.height * ratio);
      ctx = cv.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      const v = S.data && S.data[k];
      if (v && v.data) {
        const img = new Image();
        img.onload = () => {
          // La firma guardada está en píxeles del dispositivo: se dibuja a su tamaño original o reducida si no cabe.
          const wCss = img.width / ratio, hCss = img.height / ratio;
          const e = Math.min((r.width - 8) / wCss, (r.height - 8) / hCss, 1);
          const w = wCss * e, h = hCss * e;
          ctx.drawImage(img, (r.width - w) / 2, (r.height - h) / 2, w, h);
        };
        img.src = v.data;
      }
    }
    cv._ajustar = ajustar;
    ajustar();
    let dibujando = false, ult = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* nada */ }
      dibujando = true; ult = pos(e);
      ctx.beginPath(); ctx.arc(ult.x, ult.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dibujando) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(ult.x, ult.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ult = p;
    });
    const fin = () => {
      if (!dibujando) return;
      dibujando = false;
      const rec = recortarFirma(cv);
      S.data[k] = rec || '';
      caja.classList.toggle('con', !!rec);
      const campo = cv.closest('[data-campo]');
      if (campo) campo.classList.remove('err');
      programarBorrador();
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('pointerleave', fin);
  }

  // Devuelve la firma recortada a su contenido, como PNG.
  function recortarFirma(cv) {
    const w = cv.width, h = cv.height;
    const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return null;
    const m = 8;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return { data: out.toDataURL('image/png'), w: out.width, h: out.height };
  }

  /* ---------- fotos ---------- */
  function comprimirImagen(file, maxLado, calidad) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const c = cv.getContext('2d');
        c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
        c.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res({ data: cv.toDataURL('image/jpeg', calidad), w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  async function procesarFotos(input) {
    const k = input.dataset.fotos, c = buscarDef(k), max = c.max || 6;
    const lista = S.data[k] = S.data[k] || [];
    const todos = Array.from(input.files || []);
    const archivos = todos.slice(0, Math.max(0, max - lista.length));
    if (!archivos.length) return;
    cargando('Procesando fotos…');
    let fallas = 0;
    for (const a of archivos) {
      try { lista.push(await comprimirImagen(a, 1400, 0.7)); } catch (e) { fallas++; }
    }
    cargando(false);
    if (fallas) toast(fallas === 1 ? 'No se pudo leer una foto' : `No se pudieron leer ${fallas} fotos`);
    else if (todos.length > archivos.length) toast(`Máximo ${max} fotos`);
    rehacerPaso();
    programarBorrador();
  }

  /* ============================ envío ============================ */
  class ErrorApi extends Error { constructor(codigo, msg) { super(msg); this.codigo = codigo; } }
  const REINTENTABLE = ['red', 'ocupado'];

  async function api(payload, ms) {
    if (!CFG.endpoint) throw new ErrorApi('config', 'La app no está conectada a la planilla.');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms || 60000);
    let txt;
    try {
      // Sin cabecera Content-Type: el navegador usa text/plain y Apps Script no exige verificación CORS previa.
      const r = await fetch(CFG.endpoint, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      txt = await r.text();
    } catch (e) {
      throw new ErrorApi('red', 'Sin conexión con el servidor. Se reintentará automáticamente.');
    } finally { clearTimeout(tm); }
    let j;
    try { j = JSON.parse(txt); } catch (e) {
      throw new ErrorApi('respuesta', 'El servidor respondió algo inesperado. Revise que el script esté publicado con acceso para "Cualquier persona".');
    }
    if (!j || !j.ok) throw new ErrorApi((j && j.codigo) || 'servidor', (j && j.error) || 'Error del servidor.');
    return j;
  }

  const ctxPdf = (rec) => ({ folio: rec.folio || '', borrador: !rec.folio, proyecto: rec.proyecto, logo: LOGO, generado: new Date(), util: UTIL });
  const construirPdf = (rec) => formPorId(rec.formId).pdf(rec.data, ctxPdf(rec));
  function nombrePdf(rec) {
    const f = formPorId(rec.formId);
    const base = rec.folio || `${rec.proyecto.codigo}-${rec.tipo}-BORRADOR`;
    return `${base}_${String(f.archivo || f.nombre).replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
  }
  function descargarPdf(rec) {
    try { construirPdf(rec).save(nombrePdf(rec)); }
    catch (e) { console.error(e); toast('No se pudo generar el PDF: ' + e.message, 5000); }
  }
  async function compartirPdf(rec) {
    let doc;
    try { doc = construirPdf(rec); } catch (e) { console.error(e); toast('No se pudo generar el PDF', 4000); return; }
    const nombre = nombrePdf(rec);
    const file = new File([doc.output('blob')], nombre, { type: 'application/pdf' });
    if (puedeCompartir()) {
      try { await navigator.share({ files: [file], title: nombre, text: `${rec.nombre} ${rec.folio || ''} · ${rec.proyecto.codigo} ${rec.proyecto.nombre}` }); }
      catch (e) { if (e.name !== 'AbortError') doc.save(nombre); }
    } else { doc.save(nombre); toast('PDF descargado'); }
  }

  const enVuelo = new Set();
  async function enviarRegistro(rec) {
    if (enVuelo.has(rec.uid)) return rec;
    enVuelo.add(rec.uid);
    const f = formPorId(rec.formId);
    const clave = pref.get('clave:' + rec.proyecto.codigo, '');
    try {
      if (!rec.folio) {
        const r = await api({ action: 'folio', uid: rec.uid, proyecto: rec.proyecto.codigo, tipo: rec.tipo, clave }, 30000);
        rec.folio = r.folio;
        await DB.set(rec.id, rec);
      }
      const ctx = ctxPdf(rec);
      const pdf = f.pdf(rec.data, ctx).output('datauristring').split(',')[1];
      const reg = f.registro(rec.data, ctx);
      const r2 = await api({
        action: 'enviar', uid: rec.uid, folio: rec.folio, proyecto: rec.proyecto.codigo, clave,
        tipo: rec.tipo, tipoNombre: f.nombre, resumen: reg.resumen, detalle: reg.detalle,
        asunto: reg.asunto || '', correoCopia: reg.correoCopia || '', avance: reg.avance || null, pdf, pdfNombre: nombrePdf(rec), version: VERSION_APP
      }, 180000);
      rec.estado = 'enviado';
      rec.error = '';
      rec.codigoError = '';
      rec.aviso = r2.aviso || '';
      rec.notificados = r2.notificados || 0;
      rec.enviado = new Date().toISOString();
    } catch (e) {
      if (REINTENTABLE.includes(e.codigo)) { rec.estado = 'pendiente'; rec.error = e.message; }
      else { rec.estado = 'error'; rec.error = e.message || String(e); rec.codigoError = e.codigo || ''; }
    } finally {
      enVuelo.delete(rec.uid);
    }
    await DB.set(rec.id, rec).catch(() => {});
    actualizarPendientes();
    return rec;
  }

  async function enviar() {
    if (S.enviando) return;
    const f = S.form;
    for (let i = 0; i < f.pasos.length; i++) {
      const errs = validarPaso(i);
      if (errs.length) { S.paso = i; vistaForm(); mostrarErrores(errs); return; }
    }
    S.enviando = true;
    try {
      const u = nuevoId();
      const rec = {
        id: 'env:' + u, uid: u, formId: f.id, tipo: f.tipo, nombre: f.nombre,
        proyecto: { codigo: S.proyecto.codigo, nombre: S.proyecto.nombre },
        creado: new Date().toISOString(), estado: CFG.endpoint ? 'pendiente' : 'demo',
        folio: CFG.endpoint ? null : `DEMO-${S.proyecto.codigo}-${f.tipo}`, error: '', data: clonar(S.data)
      };
      recorrerCampos(f, (c) => { if (c.recordar && S.data[c.id]) pref.set('recordar:' + c.id, S.data[c.id]); });
      await DB.set(rec.id, rec);
      clearTimeout(borradorT);
      const dk = S.draftKey;
      S.data = null; S.draftKey = '';
      await DB.del(dk).catch(() => {});
      if (rec.estado === 'demo') descargarPdf(rec);
      else if (navigator.onLine) {
        cargando('Enviando… no cierre la app');
        try { await enviarRegistro(rec); } finally { cargando(false); }
      } else {
        rec.error = 'Sin conexión: se enviará automáticamente cuando vuelva la señal.';
        await DB.set(rec.id, rec).catch(() => {});
      }
      S.ultimo = rec;
      ir('exito', { reemplazar: true });
    } catch (e) {
      console.error(e);
      toast('No se pudo guardar el documento: ' + (e.message || e), 6000);
    } finally { S.enviando = false; }
  }

  let procesando = false;
  async function procesarCola(manual) {
    if (procesando || !CFG.endpoint || !navigator.onLine) return;
    procesando = true;
    let enviados = 0;
    try {
      const recs = (await DB.lista('env:')).filter((r) => r.estado === 'pendiente').sort((a, b) => a.creado.localeCompare(b.creado));
      for (const r of recs) {
        await enviarRegistro(r);
        if (r.estado === 'enviado') enviados++;
        else if (r.estado === 'pendiente') break; // sigue sin conexión
      }
    } catch (e) { console.warn(e); }
    finally { procesando = false; }
    if (enviados) toast(enviados === 1 ? 'Se envió 1 documento pendiente' : `Se enviaron ${enviados} documentos pendientes`, 4000);
    else if (manual) toast('No se pudo enviar: revise la conexión', 4000);
    actualizarPendientes();
    if (S.vista === 'envios') vistaEnvios();
    if (S.vista === 'exito' && S.ultimo) { const r = await DB.get(S.ultimo.id).catch(() => null); if (r) { S.ultimo = r; vistaExito(); } }
  }

  async function reintentar(id) {
    const rec = await DB.get(id);
    if (!rec) return;
    if (rec.codigoError === 'clave') {
      const p = CFG.proyectos.find((x) => x.codigo === rec.proyecto.codigo) || rec.proyecto;
      if (!(await pedirClave(p, 'La clave guardada no fue aceptada. Ingrésela nuevamente.'))) return;
    }
    if (!navigator.onLine) { toast('Sin conexión. Se enviará cuando vuelva la señal.'); return; }
    rec.estado = 'pendiente';
    cargando('Enviando…');
    try { await enviarRegistro(rec); } finally { cargando(false); }
    toast(rec.estado === 'enviado' ? `Enviado: ${rec.folio}` : rec.error, 4000);
    if (S.vista === 'exito') { S.ultimo = rec; vistaExito(); }
    else if (S.vista === 'envios') vistaEnvios();
  }

  /* ============================ eventos ============================ */
  async function alClic(e) {
    const t = e.target.closest('button');
    if (!t || !app().contains(t)) return;
    if (t.dataset.proy) return elegirProyecto(t.dataset.proy);
    if (t.dataset.form) return abrirForm(t.dataset.form);
    if (t.dataset.ir) {
      if (t.dataset.ir === 'menu' && !S.proyecto) return ir('proyectos');
      return ir(t.dataset.ir);
    }
    if (t.dataset.paso != null) return irAPaso(+t.dataset.paso);
    if (t.classList.contains('seg-b')) {
      asignar(t, t.dataset.val);
      $$('.seg-b', t.parentElement).forEach((b) => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      return;
    }
    const acc = t.dataset.acc;
    if (!acc) return;
    const id = t.dataset.id;
    switch (acc) {
      case 'agregar-item': {
        const c = buscarDef(t.dataset.itemsId), lista = S.data[c.id];
        if (lista.length >= (c.max || 100)) { toast(`Máximo ${c.max} ${c.itemNombre || 'ítems'} por documento`); return; }
        const it = Object.assign({}, c.nuevo ? c.nuevo(S.data) : {}, { _id: nuevoId() });
        lista.push(it);
        S.abiertos = new Set([it._id]);
        rehacerPaso();
        const el = $(`[data-item="${it._id}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        programarBorrador();
        return;
      }
      case 'toggle-item': {
        const itemEl = t.closest('[data-item]');
        const cerrado = itemEl.classList.toggle('cerrado');
        if (cerrado) S.abiertos.delete(itemEl.dataset.item); else S.abiertos.add(itemEl.dataset.item);
        return;
      }
      case 'duplicar-item': {
        const { it, itemsId } = contexto(t);
        const lista = S.data[itemsId], c = buscarDef(itemsId);
        if (lista.length >= (c.max || 100)) { toast(`Máximo ${c.max} ${c.itemNombre || 'ítems'} por documento`); return; }
        const copia = Object.assign(clonar(it), { _id: nuevoId() });
        lista.splice(lista.indexOf(it) + 1, 0, copia);
        S.abiertos = new Set([copia._id]);
        rehacerPaso();
        const el = $(`[data-item="${copia._id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast('Duplicado: ajuste lo que cambie');
        programarBorrador();
        return;
      }
      case 'quitar-item': {
        const { it, itemsId } = contexto(t);
        const lista = S.data[itemsId], c = buscarDef(itemsId);
        const n = lista.indexOf(it) + 1;
        if (!(await confirmar(`Eliminar ${c.itemNombre || 'ítem'} ${n}`, `${c.titulo(it, n - 1)}`, 'Eliminar', 'peligro'))) return;
        lista.splice(n - 1, 1);
        S.abiertos.delete(it._id);
        rehacerPaso();
        programarBorrador();
        return;
      }
      case 'borrar-firma': {
        S.data[t.dataset.k] = '';
        const cv = $(`canvas[data-firma="${t.dataset.k}"]`);
        if (cv) { cv.parentElement.classList.remove('con'); cv._ajustar(); }
        programarBorrador();
        return;
      }
      case 'quitar-foto': {
        S.data[t.dataset.k].splice(+t.dataset.i, 1);
        rehacerPaso();
        programarBorrador();
        return;
      }
      case 'enviar': return enviar();
      case 'ver-borrador':
        return descargarPdf({ formId: S.form.id, tipo: S.form.tipo, proyecto: S.proyecto, folio: '', data: S.data });
      case 'cambiar-clave': {
        const p = CFG.proyectos.find((x) => x.codigo === S.proyecto.codigo) || S.proyecto;
        if (await pedirClave(p, 'Ingrese la nueva clave del proyecto.')) toast('Clave actualizada');
        return;
      }
      case 'nuevo': return abrirForm(t.dataset.f);
      case 'pdf': { const r = await DB.get(id); if (r) descargarPdf(r); return; }
      case 'compartir': { const r = await DB.get(id); if (r) compartirPdf(r); return; }
      case 'reintentar': return reintentar(id);
      case 'enviar-pendientes': {
        cargando('Enviando pendientes…');
        try { await procesarCola(true); } finally { cargando(false); }
        return;
      }
      case 'eliminar': {
        const r = await DB.get(id);
        if (!r) return;
        const txt = r.estado === 'enviado'
          ? 'Se elimina solo de este teléfono. El registro en la planilla y el PDF en Drive se mantienen.'
          : r.estado === 'demo' ? 'Se elimina de este teléfono.' : 'Este documento AÚN NO SE HA ENVIADO. Si lo elimina, se pierde.';
        if (!(await confirmar('¿Eliminar de este teléfono?', txt, 'Eliminar', 'peligro'))) return;
        await DB.del(id);
        vistaEnvios();
        actualizarPendientes();
        return;
      }
      default:
    }
  }

  let LOGO = null;
  function cargarLogo() {
    return fetch('img/logo-ion.png')
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo'))))
      .then((b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }))
      .then((data) => new Promise((res) => {
        const img = new Image();
        img.onload = () => { LOGO = { data, w: img.naturalWidth, h: img.naturalHeight }; res(); };
        img.onerror = () => res();
        img.src = data;
      }))
      .catch(() => { /* el PDF se genera sin logo */ });
  }

  function iniciar() {
    const raiz = app();
    raiz.addEventListener('click', alClic);
    raiz.addEventListener('input', (e) => {
      const el = e.target;
      if (S.vista === 'form' && el.dataset.k && el.tagName !== 'SELECT') asignar(el, el.value);
    });
    raiz.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.fotos) { procesarFotos(el); return; }
      if (S.vista === 'form' && el.dataset.k) asignar(el, el.value);
    });
    $('#btnAnt').addEventListener('click', () => { if (S.paso === 0) salirForm(); else irAPaso(S.paso - 1); });
    $('#btnSig').addEventListener('click', () => {
      const errs = validarPaso(S.paso);
      if (errs.length) { mostrarErrores(errs); return; }
      irAPaso(S.paso + 1);
    });
    $('#btnProyecto').addEventListener('click', async () => {
      if (S.vista === 'form') {
        if (!(await confirmar('¿Cambiar de proyecto?', 'El documento que está completando queda guardado como borrador.', 'Cambiar'))) return;
        await guardarBorradorYa();
      }
      ir('proyectos');
    });
    window.addEventListener('popstate', (e) => {
      if (S.vista === 'form') guardarBorradorYa();
      const v = (e.state && e.state.vista) || (S.proyecto ? 'menu' : 'proyectos');
      S.vista = v;
      render();
    });
    window.addEventListener('online', () => { actualizarRed(); setTimeout(() => procesarCola(), 1500); });
    window.addEventListener('offline', actualizarRed);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') guardarBorradorYa();
      else procesarCola();
    });
    let rz = null;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => $$('canvas[data-firma]').forEach((cv) => cv._ajustar && cv._ajustar()), 250);
    });

    const cod = pref.get('proyecto', null);
    const p = CFG.proyectos.find((x) => x.codigo === cod);
    if (p) S.proyecto = { codigo: p.codigo, nombre: p.nombre };
    S.vista = p ? 'menu' : 'proyectos';
    history.replaceState({ vista: S.vista }, '');
    render();
    cargarLogo();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
    }
    setTimeout(() => procesarCola(), 2000);
    setInterval(() => procesarCola(), 60000);
  }

  window.OPS = {
    version: VERSION_APP,
    util: UTIL,
    registrarFormulario: (f) => { FORMS.push(f); },
    catalogo: (codigo) => catalogoDe(codigo),
    asignarDatos,
    datos: () => S.data,
    proyecto: () => S.proyecto,
    toast,
    iniciar
  };
})();
