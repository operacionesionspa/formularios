/* =====================================================================
   Formulario: REPORTE DIARIO DE AVANCE (obra)
   - Cantidad ejecutada del día por actividad (lista publicada desde el
     Excel de control: filas de AF_V2 con Reporta = Obra).
   - Actividades en "gl" (hitos, sin cantidad medible): % de avance acumulado.
   - Clima, dotación, horas máquina, interferencias y fotos.
   Cada línea llega al Excel (hoja Avance_Diario) y se aplica en Gantt_Interno.
   ===================================================================== */
(function () {
  'use strict';
  const U = OPS.util;
  const A = OPS.avance;
  const VERSION = 'Rev. 0 · 22-10-2026';

  const CLIMA = ['Despejado', 'Nublado', 'Viento fuerte', 'Lluvia', 'Otro'];
  const CONDICION = ['Normal', 'Detención parcial', 'Detención total'];
  const EMPRESA_ION = 'ION SpA';
  const CARGOS = ['Jefe de terreno', 'Supervisor', 'Capataz', 'Prevencionista de riesgos', 'Encargado de calidad', 'Topógrafo', 'Alarife',
    'Maestro mayor', 'Maestro de primera', 'Maestro de segunda', 'Eléctrico', 'Técnico eléctrico', 'Montajista', 'Soldador', 'Rigger',
    'Operador de maquinaria', 'Chofer', 'Bodeguero', 'Administrativo', 'Ayudante / jornal', 'Otro'];
  const ESPECIALIDADES = ['Supervisión', 'Prevención de riesgos', 'Topografía', 'Obras civiles', 'Montaje mecánico', 'Eléctricos',
    'Comunicaciones / SCADA', 'Línea MT', 'Subestación', 'Calidad', 'Bodega / logística', 'Operación de equipos', 'Otro'];
  const CFG = window.OPS_CONFIG || {};
  const CL = Object.assign({ limiteViento: 40, horaInicio: 8, horaFin: 18 }, CFG.clima || {});

  // Empresas: ION + contratistas publicados desde el Excel (hoja Contratistas)
  function empresas(ctx) {
    const c = cat(ctx), lista = [EMPRESA_ION];
    (c.empresas || []).forEach((e) => { e = String(e || '').trim(); if (e && !lista.includes(e)) lista.push(e); });
    return lista.concat(['Otra']);
  }
  const nombreEmpresa = (x) => (x.empresa === 'Otra' ? (x.empresaOtra || 'Otra') : (x.empresa || EMPRESA_ION));
  const nombreCargo = (x) => (x.cargo === 'Otro' ? (x.cargoOtro || 'Otro') : (x.cargo || ''));
  const clave = (codigo) => 'ops:ultimosRecursos:' + codigo;
  function recursosAnteriores(codigo) {
    try { const v = JSON.parse(localStorage.getItem(clave(codigo)) || 'null'); return v || {}; } catch (e) { return {}; }
  }
  function guardarRecursos(codigo, d) {
    try {
      const limpiar = (l) => (l || []).map((x) => { const o = Object.assign({}, x); delete o._id; return o; });
      localStorage.setItem(clave(codigo), JSON.stringify({ dotacion: limpiar(d.dotacion), maquinas: limpiar(d.maquinas) }));
    } catch (e) { /* sin almacenamiento */ }
  }

  /* ---------- clima automático (Open-Meteo, sin clave) ---------- */
  function coords(codigo) {
    const p = (CFG.proyectos || []).find((x) => x.codigo === codigo);
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
  }
  async function obtenerClima(fecha, codigo) {
    const p = coords(codigo);
    if (!p) throw new Error('Falta la ubicación (lat/lon) del proyecto en js/config.js.');
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
      '&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,weather_code&timezone=America%2FSantiago' +
      '&start_date=' + fecha + '&end_date=' + fecha;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('El servicio del clima no respondió (' + r.status + ').');
    const j = await r.json();
    const h = j.hourly || {};
    const t = h.time || [];
    if (!t.length) throw new Error('Sin datos de clima para esa fecha.');
    let tmin = Infinity, tmax = -Infinity, vmax = 0, rafaga = 0, lluvia = 0, hViento = 0, codMax = 0;
    t.forEach((iso, i) => {
      const hora = Number(String(iso).slice(11, 13));
      const temp = Number(h.temperature_2m[i]), pp = Number(h.precipitation[i]) || 0;
      if (Number.isFinite(temp)) { tmin = Math.min(tmin, temp); tmax = Math.max(tmax, temp); }
      lluvia += pp;
      if (hora >= CL.horaInicio && hora < CL.horaFin) {
        const v = Number(h.wind_speed_10m[i]) || 0, g = Number(h.wind_gusts_10m[i]) || 0, cod = Number(h.weather_code[i]) || 0;
        vmax = Math.max(vmax, v); rafaga = Math.max(rafaga, g); codMax = Math.max(codMax, cod);
        if (v >= CL.limiteViento) hViento++;
      }
    });
    const r1 = (x) => Math.round(x * 10) / 10;
    let clima = 'Nublado';
    if (lluvia >= 1 || codMax >= 51) clima = 'Lluvia';
    else if (vmax >= CL.limiteViento) clima = 'Viento fuerte';
    else if (codMax <= 1) clima = 'Despejado';
    return {
      clima, climaFecha: fecha, climaFuente: 'Open-Meteo (' + p.lat + ', ' + p.lon + ')', tmin: r1(tmin), tmax: r1(tmax),
      vmax: Math.round(vmax), rafaga: Math.round(rafaga), lluvia: r1(lluvia), hViento
    };
  }
  const climaTxt = (d) => (d.climaFecha
    ? `${U.fmtNum(d.tmin, 1)} a ${U.fmtNum(d.tmax, 1)} °C · viento máx. ${d.vmax} km/h (ráfagas ${d.rafaga}) · lluvia ${U.fmtNum(d.lluvia, 1)} mm` +
      (d.hViento ? ` · ${d.hViento} h con viento ≥ ${CL.limiteViento} km/h` : '')
    : '');
  async function pedirClima(manual) {
    const d = OPS.datos(), p = OPS.proyecto();
    if (!d || !p || !d.fecha) return;
    if (!navigator.onLine) { if (manual) OPS.toast('Sin señal: elija el clima a mano.'); return; }
    const b = document.querySelector('.btn-clima');
    if (b) { b.disabled = true; b.textContent = 'Consultando clima…'; }
    try {
      const r = await obtenerClima(d.fecha, p.codigo);
      OPS.asignarDatos(r);
      if (manual) OPS.toast('Clima cargado: ' + r.clima);
    } catch (e) {
      if (b) { b.disabled = false; b.textContent = '🌤 Obtener clima automático'; }
      if (manual) OPS.toast(e.message || 'No se pudo obtener el clima', 5000);
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.btn-clima');
    if (b) { e.preventDefault(); pedirClima(true); }
  });
  const EQUIPOS = ['Excavadora', 'Retroexcavadora', 'Motoniveladora', 'Rodillo compactador', 'Camión aljibe', 'Camión tolva',
    'Hincadora', 'Perforadora (predrilling)', 'Manipulador telescópico', 'Grúa / camión pluma', 'Minicargador', 'Generador', 'Otro'];

  const cat = (ctx) => (ctx && ctx.catalogo) || OPS.catalogo(ctx && ctx.proyecto ? ctx.proyecto.codigo : '') || { items: [] };
  const valor = (d, k) => String(d[k] == null ? '' : d[k]).trim();
  const tieneDato = (it, d) => valor(d, 'q:' + it.id) !== '' || valor(d, 'p:' + it.id) !== '';

  /* ---------- lista de actividades ---------- */
  function fila(it, d) {
    const tot = A.n0(it.total), acu = A.n0(it.acumulado), pct = A.n0(it.avance);
    if (A.esGl(it)) {
      return `<div class="av-n"><b>${U.esc(it.nombre)}</b><small>Hito / global · avance actual ${U.esc(U.fmtPct(pct))}</small></div>
        <div class="av-in"><input type="text" inputmode="decimal" data-k="p:${U.esc(it.id)}" value="${U.esc(valor(d, 'p:' + it.id))}" placeholder="% acum."><span>%</span></div>`;
    }
    const saldo = Math.max(0, tot - acu);
    return `<div class="av-n"><b>${U.esc(it.nombre)}</b><small>Total ${U.esc(A.fmt(tot))} ${U.esc(it.unidad)} · acumulado ${U.esc(A.fmt(acu))} (${U.esc(U.fmtPct(tot ? acu / tot : 0))}) · saldo ${U.esc(A.fmt(saldo))}</small></div>
      <div class="av-in"><input type="text" inputmode="decimal" data-k="q:${U.esc(it.id)}" value="${U.esc(valor(d, 'q:' + it.id))}" placeholder="Hoy"><span>${U.esc(it.unidad)}</span></div>`;
  }

  function filas(d, ctx) {
    return A.itemsObra(cat(ctx)).filter((it) => tieneDato(it, d));
  }

  function validarAvance(v, d, ctx) {
    const items = A.itemsObra(cat(ctx));
    let n = 0;
    for (const it of items) {
      const q = valor(d, 'q:' + it.id), p = valor(d, 'p:' + it.id);
      if (q !== '') {
        const x = U.num(q);
        if (!Number.isFinite(x) || x < 0) return `«${it.nombre}»: ingrese una cantidad válida.`;
        const saldo = A.n0(it.total) - A.n0(it.acumulado);
        if (x > saldo * 1.0001 + 1e-9) return `«${it.nombre}»: ${U.fmtNum(x)} supera el saldo (${U.fmtNum(saldo)} ${it.unidad}). Avise a oficina si el total está mal.`;
        if (x > 0) n++;
      }
      if (p !== '') {
        const x = U.num(p);
        if (!Number.isFinite(x) || x < 0 || x > 100) return `«${it.nombre}»: el % debe estar entre 0 y 100.`;
        n++;
      }
    }
    if (!n && d.sinAvance !== 'Sí') return 'Ingrese el avance de al menos una actividad, o marque «Sin avance hoy».';
    return null;
  }

  /* ---------- totales ---------- */
  const totalDot = (d) => (d.dotacion || []).reduce((a, x) => a + (Number.isFinite(U.num(x.personas)) ? U.num(x.personas) : 0), 0);
  const totalHM = (d) => (d.maquinas || []).reduce((a, x) => a + (Number.isFinite(U.num(x.horas)) ? U.num(x.horas) : 0) * (Number.isFinite(U.num(x.cantidad)) ? U.num(x.cantidad) : 1), 0);

  /* ---------- revisión ---------- */
  function resumenHtml(d, ctx) {
    const lst = filas(d, ctx);
    return `
      <dl class="res-grid">
        <dt>Proyecto</dt><dd>${U.esc(ctx.proyecto.codigo)} · ${U.esc(ctx.proyecto.nombre)}</dd>
        <dt>Fecha</dt><dd>${U.esc(U.fmtFecha(d.fecha))}</dd>
        <dt>Clima</dt><dd>${U.esc(d.clima)} · ${U.esc(d.condicion)}${U.num(d.horasPerdidas) > 0 ? ` · ${U.esc(d.horasPerdidas)} h perdidas` : ''}${d.climaFecha === d.fecha ? `<br><small style="color:#6b7280">${U.esc(climaTxt(d))}</small>` : ''}</dd>
        <dt>Dotación</dt><dd>${U.fmtNum(totalDot(d))} personas</dd>
        <dt>Horas máquina</dt><dd>${U.fmtNum(totalHM(d))} h</dd>
      </dl>
      <div class="res-tit">Avance del día (${lst.length} actividades)</div>
      ${lst.length ? `<table class="res-tabla"><thead><tr><th>Actividad</th><th style="text-align:right">Hoy</th></tr></thead><tbody>
        ${lst.map((it) => `<tr><td>${U.esc(it.nombre)}<br><small style="color:#6b7280">${U.esc(it.cuenta)} · ${U.esc(String(it.partida || '').replace(/^\d+\s*·\s*/, ''))}</small></td>
          <td class="num">${A.esGl(it) ? U.esc(valor(d, 'p:' + it.id)) + ' % acum.' : U.esc(U.fmtNum(U.num(valor(d, 'q:' + it.id)))) + ' ' + U.esc(it.unidad)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="sub">Sin avance hoy.</p>'}
      <div class="res-tit">Interferencias</div>
      <p style="margin:0 0 4px;white-space:pre-wrap">${U.esc((d.interferencias || '').trim() || 'Sin interferencias.')}</p>
      <p class="sub" style="margin:0">${(d.fotos || []).length} foto(s) adjunta(s)</p>
      <div class="res-tit">Reportado por</div>
      <p style="margin:0">${U.esc(d.nombre)} · ${U.esc(d.cargo)}</p>
      ${d.firma && d.firma.data ? `<img class="res-firma" src="${U.esc(d.firma.data)}" alt="Firma">` : ''}`;
  }

  /* ---------- planilla, correo y líneas para el Excel ---------- */
  function registro(d, ctx) {
    const lst = filas(d, ctx);
    const L = A.linea;
    const base = { fecha: d.fecha, origen: 'Obra', autor: L(d.nombre) };
    const avance = [];
    lst.forEach((it) => {
      if (A.esGl(it)) avance.push(Object.assign({ item: it.id, pct: U.num(valor(d, 'p:' + it.id)) }, base));
      else avance.push(Object.assign({ item: it.id, cantidad: U.num(valor(d, 'q:' + it.id)) }, base));
    });
    if (ctx && ctx.proyecto) guardarRecursos(ctx.proyecto.codigo, d);
    avance.push(Object.assign({ item: '_CLIMA', comentario: L(`${d.clima} · ${d.condicion}${d.climaObs ? ' · ' + d.climaObs : ''}${d.climaFecha === d.fecha ? ' · ' + climaTxt(d) : ''}`), cantidad: U.num(d.horasPerdidas) || 0 }, base));
    (d.dotacion || []).forEach((x) => avance.push(Object.assign({ item: L('_DOT:' + nombreEmpresa(x) + ' · ' + nombreCargo(x)), cantidad: U.num(x.personas),
      comentario: L([x.especialidad, String(x.nombres || '').split(/\n+/).map((n) => n.trim()).filter(Boolean).join(', ')].filter(Boolean).join(' · ')) }, base)));
    (d.maquinas || []).forEach((x) => avance.push(Object.assign({ item: L('_HM:' + x.equipo + (x.detalle ? ' (' + x.detalle + ')' : '')), cantidad: (U.num(x.horas) || 0) * (U.num(x.cantidad) || 1), comentario: L(`${x.cantidad || 1} equipo(s) × ${x.horas} h`) }, base)));
    if ((d.interferencias || '').trim()) avance.push(Object.assign({ item: '_INTERF', comentario: L(d.interferencias) }, base));

    return {
      asunto: `${U.fmtFecha(d.fecha)} · ${lst.length} actividades`,
      resumen: {
        cols: [
          { k: 'fecha', l: 'Fecha', t: 'fecha' }, { k: 'clima', l: 'Clima' }, { k: 'tmin', l: 'Temp. mín. (°C)' }, { k: 'tmax', l: 'Temp. máx. (°C)' },
          { k: 'vmax', l: 'Viento máx. (km/h)' }, { k: 'rafaga', l: 'Ráfaga máx. (km/h)' }, { k: 'lluvia', l: 'Lluvia (mm)' }, { k: 'hViento', l: 'Horas con viento sobre límite' },
          { k: 'condicion', l: 'Condición de trabajo' },
          { k: 'horasPerdidas', l: 'Horas perdidas' }, { k: 'nAct', l: 'Actividades con avance' }, { k: 'dot', l: 'Dotación (personas)' },
          { k: 'hm', l: 'Horas máquina' }, { k: 'interferencias', l: 'Interferencias' }, { k: 'hse', l: 'Seguridad, calidad y medio ambiente' },
          { k: 'observaciones', l: 'Observaciones' }, { k: 'nFotos', l: 'N° de fotos' }, { k: 'nombre', l: 'Reportado por' }, { k: 'cargo', l: 'Cargo' }
        ],
        fila: {
          fecha: d.fecha, clima: d.clima + (d.climaObs ? ' · ' + d.climaObs : ''), condicion: d.condicion,
          tmin: d.climaFecha === d.fecha ? d.tmin : '', tmax: d.climaFecha === d.fecha ? d.tmax : '', vmax: d.climaFecha === d.fecha ? d.vmax : '',
          rafaga: d.climaFecha === d.fecha ? d.rafaga : '', lluvia: d.climaFecha === d.fecha ? d.lluvia : '', hViento: d.climaFecha === d.fecha ? d.hViento : '', horasPerdidas: U.num(d.horasPerdidas) || 0,
          nAct: lst.length, dot: totalDot(d), hm: totalHM(d), interferencias: (d.interferencias || '').trim(), hse: (d.hse || '').trim(),
          observaciones: (d.observaciones || '').trim(), nFotos: (d.fotos || []).length, nombre: d.nombre, cargo: d.cargo
        }
      },
      detalle: {
        cols: [
          { k: 'id', l: 'ID Gantt' }, { k: 'cuenta', l: 'Cuenta', correo: true }, { k: 'actividad', l: 'Actividad', correo: true },
          { k: 'unidad', l: 'Unidad', correo: true }, { k: 'total', l: 'Cantidad total' }, { k: 'previo', l: 'Acumulado previo' },
          { k: 'hoy', l: 'Ejecutado hoy', correo: true }, { k: 'nuevo', l: 'Nuevo acumulado', correo: true }, { k: 'pct', l: '% avance', fmt: '0.0%', correo: true }
        ],
        filas: lst.map((it) => {
          const tot = A.n0(it.total), prev = A.n0(it.acumulado);
          if (A.esGl(it)) {
            const p = U.num(valor(d, 'p:' + it.id)) / 100;
            return { id: it.id, cuenta: it.cuenta, actividad: it.nombre, unidad: '%', total: '', previo: A.n0(it.avance), hoy: '', nuevo: '', pct: p };
          }
          const q = U.num(valor(d, 'q:' + it.id));
          return { id: it.id, cuenta: it.cuenta, actividad: it.nombre, unidad: it.unidad, total: tot, previo: prev, hoy: q, nuevo: prev + q, pct: tot ? (prev + q) / tot : '' };
        })
      },
      avance
    };
  }

  /* ---------- PDF ---------- */
  function pdf(datos, ctx) {
    const d = A.limpiar(datos);
    const c = Object.assign({}, ctx, { fecha: datos.fecha });
    const nd = A.nuevoDoc('Reporte diario de avance', 'OPERACIONES · AVANCE FÍSICO EN OBRA', c, VERSION);
    const { doc, M, W, PW, PH } = nd;
    let y = nd.y;
    const reg = registro(datos, ctx);
    const R = reg.resumen.fila;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'grid', tableWidth: W,
      head: [[{ content: 'INFORMACIÓN GENERAL', colSpan: 6 }]],
      body: [
        ['Fecha', U.fmtFecha(d.fecha), 'Clima', A.textoPdf(R.clima), 'Condición de trabajo', A.textoPdf(d.condicion)],
        ['Dotación total', U.fmtNum(R.dot) + ' personas', 'Horas máquina', U.fmtNum(R.hm) + ' h', 'Horas perdidas', U.fmtNum(R.horasPerdidas) + ' h'],
        ['Temperatura', R.tmin !== '' ? `${U.fmtNum(R.tmin, 1)} a ${U.fmtNum(R.tmax, 1)} °C` : '-', 'Viento máx. (ráfagas)', R.vmax !== '' ? `${R.vmax} km/h (${R.rafaga})` : '-',
          'Lluvia / h viento fuerte', R.lluvia !== '' ? `${U.fmtNum(R.lluvia, 1)} mm · ${R.hViento} h >= ${CL.limiteViento} km/h` : '-']
      ].concat(R.tmin !== '' ? [[{ content: A.textoPdf(`Clima automático: ${d.climaFuente || ''}; viento en horario ${CL.horaInicio}:00 a ${CL.horaFin}:00. Clima y condición informados por obra.`), colSpan: 6, styles: { fontSize: 6.5, textColor: A.COL.muted } }]] : []),
      styles: Object.assign({ fontSize: 8, cellPadding: 1.6 }, { font: 'helvetica', lineColor: A.COL.linea, lineWidth: 0.2, textColor: A.COL.ink }),
      headStyles: { fillColor: A.COL.ink, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 34, fillColor: A.COL.gris, fontStyle: 'bold' }, 2: { cellWidth: 34, fillColor: A.COL.gris, fontStyle: 'bold' }, 4: { cellWidth: 38, fillColor: A.COL.gris, fontStyle: 'bold' } }
    });
    y = doc.lastAutoTable.finalY + 4;

    // avance agrupado por disciplina
    const lst = filas(datos, ctx);
    const body = [];
    A.agrupar(lst).forEach((D) => {
      body.push([{ content: A.textoPdf(D.nombre.toUpperCase()), colSpan: 9, styles: { fillColor: A.COL.azulLt, fontStyle: 'bold', textColor: A.COL.marino } }]);
      D.cuentas.forEach((C) => C.items.forEach((it) => {
        const f = reg.detalle.filas.find((x) => x.id === it.id);
        const gl = A.esGl(it);
        body.push([A.textoPdf(it.cuenta), A.textoPdf(it.nombre), gl ? '%' : A.textoPdf(it.unidad), gl ? '' : U.fmtNum(f.total), gl ? U.fmtPct(f.previo) : U.fmtNum(f.previo),
          gl ? '' : U.fmtNum(f.hoy), gl ? '' : U.fmtNum(f.nuevo), U.fmtPct(f.pct), A.textoPdf(String(it.partida || '').replace(/^\d+\s*·\s*/, ''))]);
      }));
    });
    if (!body.length) body.push([{ content: 'Sin avance registrado hoy.', colSpan: 9 }]);
    y = A.tabla(doc, y, M, W, 'AVANCE DEL DÍA', ['Cuenta', 'Actividad', 'Unidad', 'Total', 'Acumulado previo', 'Hoy', 'Nuevo acumulado', '% avance', 'Partida'], body,
      { 0: { cellWidth: 17, halign: 'center' }, 1: { cellWidth: 82 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 20, halign: 'right' }, 4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 18, halign: 'right', fontStyle: 'bold', fillColor: A.COL.gris }, 6: { cellWidth: 22, halign: 'right' }, 7: { cellWidth: 17, halign: 'right' }, 8: { cellWidth: 'auto' } });

    const dot = (d.dotacion || []).map((x) => [A.textoPdf(nombreEmpresa(x)), A.textoPdf(nombreCargo(x)), A.textoPdf(x.especialidad || ''), U.fmtNum(U.num(x.personas)),
      A.textoPdf(String(x.nombres || '').split(/\n+/).map((n) => n.trim()).filter(Boolean).join(', '))]);
    if (!dot.length) dot.push([{ content: 'Sin registro', colSpan: 5 }]);
    y = A.tabla(doc, y, M, W, `DOTACIÓN (${U.fmtNum(R.dot)} personas)`, ['Empresa', 'Cargo', 'Frente / especialidad', 'Personas', 'Nombres'], dot,
      { 0: { cellWidth: 60 }, 1: { cellWidth: 45 }, 2: { cellWidth: 40 }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 'auto' } });

    const hm = (d.maquinas || []).map((x) => [A.textoPdf(x.equipo), A.textoPdf(x.detalle || ''), U.fmtNum(U.num(x.cantidad) || 1), U.fmtNum(U.num(x.horas)), U.fmtNum((U.num(x.cantidad) || 1) * (U.num(x.horas) || 0))]);
    if (!hm.length) hm.push([{ content: 'Sin registro', colSpan: 5 }]);
    y = A.tabla(doc, y, M, W, `HORAS MÁQUINA (${U.fmtNum(R.hm)} h)`, ['Equipo', 'Detalle / patente / empresa', 'Cantidad', 'Horas c/u', 'Horas totales'], hm,
      { 0: { cellWidth: 60 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 25, halign: 'right' } });
    y = A.tabla(doc, y, M, W, 'INTERFERENCIAS, SEGURIDAD Y OBSERVACIONES', ['Interferencias', 'Seguridad, calidad y medio ambiente', 'Observaciones'],
      [[(d.interferencias || '').trim() || 'Sin interferencias.', (d.hse || '').trim() || '-', (d.observaciones || '').trim() || '-']],
      { 0: { cellWidth: W / 3 }, 1: { cellWidth: W / 3 }, 2: { cellWidth: 'auto' } }, { bodyStyles: { minCellHeight: 12, valign: 'top' } });
    return A.firmaYFotos(doc, y, M, W, PW, PH, d, ctx, 'Reporte diario de avance');
  }

  /* ---------- definición ---------- */
  OPS.registrarFormulario({
    id: 'reporte-diario',
    tipo: 'RD',
    nombre: 'Reporte diario de avance',
    archivo: 'Reporte_diario',
    descripcion: 'Avance de obra, dotación y horas máquina',
    icono: '📈',
    catalogo: true,
    etiqueta: (d) => U.fmtFecha(d.fecha),
    inicial: (ctx) => {
      const prev = ctx && ctx.proyecto ? recursosAnteriores(ctx.proyecto.codigo) : {};
      return {
        fecha: U.hoyISO(), clima: 'Despejado', climaObs: '', condicion: 'Normal', horasPerdidas: '', sinAvance: '',
        dotacion: prev.dotacion || [], maquinas: prev.maquinas || [], interferencias: '', hse: '', observaciones: '', fotos: [],
        nombre: '', cargo: 'Jefe de terreno', firma: ''
      };
    },
    pasos: [
      {
        titulo: 'General',
        ayuda: 'Fecha del reporte y condiciones del día. El clima se carga solo cuando hay señal.',
        alMostrar: (d) => {
          if (!d.fecha || d.climaFecha === d.fecha || d._climaIntento === d.fecha || !navigator.onLine) return;
          d._climaIntento = d.fecha;
          pedirClima(false);
        },
        campos: [
          { id: 'fecha', tipo: 'fecha', label: 'Fecha del reporte', req: true, ancho: 'medio', validar: (v) => (v > U.hoyISO() ? 'No puede ser una fecha futura' : null) },
          { id: 'horasPerdidas', tipo: 'numero', label: 'Horas perdidas (clima u otros)', min: 0, ancho: 'medio', placeholder: '0' },
          {
            id: 'climaInfo', tipo: 'aviso',
            html: (d) => {
              if (d.climaFecha && d.climaFecha === d.fecha) {
                return `<div class="aviso ${d.hViento ? 'mal' : 'info'}"><b>Clima automático del ${U.esc(U.fmtFecha(d.climaFecha))}:</b> ${U.esc(climaTxt(d))}.<br>
                  <small>Fuente: ${U.esc(d.climaFuente)}. Ajuste abajo si en obra fue distinto.</small>
                  <div style="margin-top:6px"><button type="button" class="link-btn btn-clima" style="padding:0">Actualizar clima</button></div></div>`;
              }
              return `<div class="aviso info">${d.climaFecha ? 'El clima cargado es de otra fecha. ' : ''}El clima se obtiene solo con señal, para la ubicación de la obra.
                <div style="margin-top:6px"><button type="button" class="btn azul btn-clima" style="margin:0">🌤 Obtener clima automático</button></div></div>`;
            }
          },
          { id: 'clima', tipo: 'opciones', label: 'Clima', opciones: CLIMA, req: true },
          { id: 'climaObs', tipo: 'texto', label: 'Detalle del clima (opcional)', placeholder: 'Ej: viento sobre 40 km/h desde las 14:00' },
          { id: 'condicion', tipo: 'opciones', label: 'Condición de trabajo', opciones: CONDICION, req: true }
        ]
      },
      {
        titulo: 'Avance',
        ayuda: 'Cantidad ejecutada HOY en cada actividad (no el acumulado). Los hitos «global» se informan con el % acumulado.',
        campos: [
          {
            id: 'listaAvance', tipo: 'custom',
            html: (d, ctx) => {
              const c = cat(ctx);
              const items = A.itemsObra(c);
              return `${c.generado ? `<small class="ayuda">Lista publicada el ${U.esc(c.generado)} · ${items.length} actividades</small>` : ''}
                ${A.filtroHtml('avObra')}${A.listaHtml('avObra', items, d, fila, tieneDato)}`;
            },
            validar: (v, d, ctx) => validarAvance(v, d, ctx)
          },
          { id: 'sinAvance', tipo: 'opciones', label: '¿Sin avance hoy?', opciones: ['Sí', 'No'], ayuda: 'Marque «Sí» solo si no hubo avance en ninguna actividad (igual se registra clima, dotación y horas).' }
        ]
      },
      {
        titulo: 'Recursos',
        ayuda: 'Dotación por cargo y empresa, y horas de equipos. Se copian del último reporte enviado desde este teléfono: ajuste lo que cambió.',
        campos: [
          {
            id: 'dotacion', tipo: 'items', itemNombre: 'cargo', max: 60,
            nuevo: () => ({ empresa: EMPRESA_ION, personas: '1' }),
            titulo: (it) => `${nombreCargo(it) || 'Cargo'} · ${nombreEmpresa(it)}`,
            sub: (it) => (it.personas ? `${it.personas} persona(s)${it.especialidad ? ' · ' + it.especialidad : ''}` : 'Toque para completar'),
            campos: [
              { id: 'empresa', tipo: 'lista', label: 'Empresa', opciones: () => empresas(OPS.proyecto() ? { proyecto: OPS.proyecto() } : null), req: true },
              { id: 'empresaOtra', tipo: 'texto', label: 'Nombre de la empresa', req: true, visible: (d, it) => it.empresa === 'Otra', placeholder: 'Razón social' },
              { id: 'cargo', tipo: 'lista', label: 'Cargo', opciones: CARGOS, req: true },
              { id: 'cargoOtro', tipo: 'texto', label: 'Detalle del cargo', req: true, visible: (d, it) => it.cargo === 'Otro' },
              { id: 'especialidad', tipo: 'lista', label: 'Frente / especialidad', opciones: ESPECIALIDADES },
              { id: 'personas', tipo: 'numero', label: 'N° de personas', req: true, mayorQue: 0, ancho: 'medio' },
              { id: 'nombres', tipo: 'area', label: 'Nombres (opcional)', ayuda: 'Uno por línea', filas: 2 }
            ]
          },
          {
            id: 'maquinas', tipo: 'items', itemNombre: 'equipo', max: 40,
            nuevo: () => ({ cantidad: '1' }),
            titulo: (it) => it.equipo || 'Equipo',
            sub: (it) => (it.horas ? `${it.cantidad || 1} × ${it.horas} h` : 'Toque para completar'),
            campos: [
              { id: 'equipo', tipo: 'lista', label: 'Equipo', opciones: EQUIPOS, req: true },
              { id: 'detalle', tipo: 'texto', label: 'Detalle (patente, empresa)', placeholder: 'Opcional' },
              { id: 'cantidad', tipo: 'numero', label: 'Cantidad de equipos', req: true, mayorQue: 0, ancho: 'medio' },
              { id: 'horas', tipo: 'numero', label: 'Horas trabajadas c/u', req: true, min: 0, ancho: 'medio' }
            ]
          }
        ]
      },
      {
        titulo: 'Observaciones',
        campos: [
          { id: 'interferencias', tipo: 'area', label: 'Interferencias', ayuda: 'Lo que impidió avanzar: frentes no liberados, falta de material, clima, mandante…', filas: 3 },
          { id: 'hse', tipo: 'area', label: 'Seguridad, calidad y medio ambiente', filas: 2 },
          { id: 'observaciones', tipo: 'area', label: 'Otras observaciones', filas: 2 },
          { id: 'fotos', tipo: 'fotos', label: 'Fotos del avance', max: 12 }
        ]
      },
      {
        titulo: 'Firma',
        ayuda: 'Nombre y cargo quedan recordados en este teléfono.',
        campos: [
          { id: 'nombre', tipo: 'texto', label: 'Nombre', req: true, recordar: true },
          { id: 'cargo', tipo: 'texto', label: 'Cargo', req: true, recordar: true },
          { id: 'firma', tipo: 'firma', label: 'Firma', req: true }
        ]
      },
      {
        titulo: 'Revisión',
        ayuda: 'Revise antes de enviar. El avance se carga en el Excel de control del proyecto.',
        final: true,
        campos: [{ id: 'resumen', tipo: 'resumen', html: resumenHtml }]
      }
    ],
    registro,
    pdf
  });
})();
