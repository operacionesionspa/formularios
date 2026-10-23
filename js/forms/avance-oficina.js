/* =====================================================================
   Formulario: AVANCE DE GESTIÓN Y SUMINISTROS (oficina: PM / Ing. de Proyecto)
   - Etapas de cada cuenta (revisión de planos, cotización, OC, downpayment,
     BL, recepción en sitio, cierre…) y actividades con Reporta = Oficina
     (ingeniería, permisos, proceso de conexión CEN, protocolos…).
   - Por cada fila: Listo (con fecha real) o En curso (con %).
   ===================================================================== */
(function () {
  'use strict';
  const U = OPS.util;
  const A = OPS.avance;
  const VERSION = 'Rev. 0 · 22-10-2026';
  const ESTADOS = ['Listo', 'En curso'];

  const cat = (ctx) => (ctx && ctx.catalogo) || OPS.catalogo(ctx && ctx.proyecto ? ctx.proyecto.codigo : '') || { items: [] };
  const valor = (d, k) => String(d[k] == null ? '' : d[k]).trim();
  const tieneDato = (it, d) => valor(d, 'e:' + it.id) !== '';
  const nombreFila = (it) => (Number(it.nivel) === 2 ? 'Etapa ' + it.nombre : it.nombre);

  function fila(it, d) {
    const e = valor(d, 'e:' + it.id);
    const plan = it.inicioPlan || it.finPlan ? `plan ${U.fmtFecha(it.inicioPlan)} → ${U.fmtFecha(it.finPlan)} · ` : '';
    return `<div class="av-n"><b>${U.esc(nombreFila(it))}</b><small>${U.esc(plan)}avance actual ${U.esc(U.fmtPct(A.n0(it.avance)))}</small></div>
      <div class="av-of">
        <select data-k="e:${U.esc(it.id)}"><option value="">Sin cambio</option>${ESTADOS.map((o) => `<option${o === e ? ' selected' : ''}>${o}</option>`).join('')}</select>
        <input type="text" inputmode="decimal" data-k="p:${U.esc(it.id)}" value="${U.esc(valor(d, 'p:' + it.id))}" placeholder="% (en curso)">
        <input type="date" data-k="f:${U.esc(it.id)}" value="${U.esc(valor(d, 'f:' + it.id))}" title="Fecha real (si quedó lista)">
      </div>`;
  }

  const filas = (d, ctx) => A.itemsOficina(cat(ctx)).filter((it) => tieneDato(it, d));

  function validar(v, d, ctx) {
    const lst = filas(d, ctx);
    for (const it of lst) {
      const e = valor(d, 'e:' + it.id), p = valor(d, 'p:' + it.id), f = valor(d, 'f:' + it.id);
      if (e === 'En curso') {
        const x = U.num(p);
        if (!Number.isFinite(x) || x <= 0 || x >= 100) return `«${nombreFila(it)}»: indique el % de avance (entre 1 y 99).`;
      }
      if (f && f > U.hoyISO()) return `«${nombreFila(it)}»: la fecha real no puede ser futura.`;
    }
    if (!lst.length) return 'Marque al menos una etapa o actividad como «Listo» o «En curso».';
    return null;
  }

  function resumenHtml(d, ctx) {
    const lst = filas(d, ctx);
    return `
      <dl class="res-grid">
        <dt>Proyecto</dt><dd>${U.esc(ctx.proyecto.codigo)} · ${U.esc(ctx.proyecto.nombre)}</dd>
        <dt>Fecha</dt><dd>${U.esc(U.fmtFecha(d.fecha))}</dd>
      </dl>
      <div class="res-tit">Etapas y actividades (${lst.length})</div>
      <table class="res-tabla"><thead><tr><th>Ítem</th><th>Estado</th></tr></thead><tbody>
        ${lst.map((it) => {
          const e = valor(d, 'e:' + it.id);
          const det = e === 'Listo' ? 'Listo ' + U.fmtFecha(valor(d, 'f:' + it.id) || d.fecha) : 'En curso ' + valor(d, 'p:' + it.id) + ' %';
          return `<tr><td>${U.esc(nombreFila(it))}<br><small style="color:#6b7280">${U.esc(it.cuenta)} · ${U.esc(String(it.partida || '').replace(/^\d+\s*·\s*/, ''))}</small></td><td>${U.esc(det)}</td></tr>`;
        }).join('')}
      </tbody></table>
      <div class="res-tit">Observaciones</div>
      <p style="margin:0;white-space:pre-wrap">${U.esc((d.observaciones || '').trim() || 'Sin observaciones.')}</p>
      <div class="res-tit">Reportado por</div>
      <p style="margin:0">${U.esc(d.nombre)} · ${U.esc(d.cargo)}</p>`;
  }

  function registro(d, ctx) {
    const lst = filas(d, ctx), L = A.linea;
    const base = { fecha: d.fecha, origen: 'Oficina', autor: L(d.nombre) };
    const avance = lst.map((it) => {
      const e = valor(d, 'e:' + it.id);
      return e === 'Listo'
        ? Object.assign({ item: it.id, listo: 'Sí', fechaReal: valor(d, 'f:' + it.id) || d.fecha }, base)
        : Object.assign({ item: it.id, pct: U.num(valor(d, 'p:' + it.id)), fechaReal: valor(d, 'f:' + it.id) }, base);
    });
    if ((d.observaciones || '').trim()) avance.push(Object.assign({ item: '_OBS_OFICINA', comentario: L(d.observaciones) }, base));
    return {
      asunto: `${U.fmtFecha(d.fecha)} · ${lst.length} ítems`,
      resumen: {
        cols: [{ k: 'fecha', l: 'Fecha', t: 'fecha' }, { k: 'n', l: 'Ítems informados' }, { k: 'listos', l: 'Listos' }, { k: 'curso', l: 'En curso' },
          { k: 'observaciones', l: 'Observaciones' }, { k: 'nombre', l: 'Reportado por' }, { k: 'cargo', l: 'Cargo' }],
        fila: {
          fecha: d.fecha, n: lst.length, listos: lst.filter((it) => valor(d, 'e:' + it.id) === 'Listo').length,
          curso: lst.filter((it) => valor(d, 'e:' + it.id) === 'En curso').length, observaciones: (d.observaciones || '').trim(), nombre: d.nombre, cargo: d.cargo
        }
      },
      detalle: {
        cols: [{ k: 'id', l: 'ID Gantt' }, { k: 'cuenta', l: 'Cuenta', correo: true }, { k: 'item', l: 'Etapa / actividad', correo: true },
          { k: 'estado', l: 'Estado', correo: true }, { k: 'pct', l: '% avance', fmt: '0.0%', correo: true }, { k: 'fechaReal', l: 'Fecha real', t: 'fecha', correo: true }],
        filas: lst.map((it) => {
          const e = valor(d, 'e:' + it.id);
          return { id: it.id, cuenta: it.cuenta, item: nombreFila(it), estado: e, pct: e === 'Listo' ? 1 : U.num(valor(d, 'p:' + it.id)) / 100,
            fechaReal: e === 'Listo' ? (valor(d, 'f:' + it.id) || d.fecha) : valor(d, 'f:' + it.id) };
        })
      },
      avance
    };
  }

  function pdf(datos, ctx) {
    const d = A.limpiar(datos);
    const nd = A.nuevoDoc('Avance de gestión y suministros', 'OPERACIONES · OFICINA (PM / ING. DE PROYECTO)', Object.assign({}, ctx, { fecha: datos.fecha }), VERSION);
    const { doc, M, W, PW, PH } = nd;
    let y = nd.y;
    const reg = registro(datos, ctx);
    const body = [];
    A.agrupar(filas(datos, ctx)).forEach((D) => {
      body.push([{ content: A.textoPdf(D.nombre.toUpperCase()), colSpan: 6, styles: { fillColor: A.COL.azulLt, fontStyle: 'bold', textColor: A.COL.marino } }]);
      D.cuentas.forEach((C) => C.items.forEach((it) => {
        const f = reg.detalle.filas.find((x) => x.id === it.id);
        body.push([A.textoPdf(it.cuenta), A.textoPdf(String(it.partida || '').replace(/^\d+\s*·\s*/, '')), A.textoPdf(f.item), f.estado, U.fmtPct(f.pct), U.fmtFecha(f.fechaReal)]);
      }));
    });
    y = A.tabla(doc, y, M, W, `ETAPAS Y ACTIVIDADES INFORMADAS · ${U.fmtFecha(datos.fecha)}`, ['Cuenta', 'Partida', 'Etapa / actividad', 'Estado', '% avance', 'Fecha real'], body,
      { 0: { cellWidth: 18, halign: 'center' }, 1: { cellWidth: 60 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 24, halign: 'center' } });
    y = A.tabla(doc, y, M, W, 'OBSERVACIONES', ['Observaciones'], [[(d.observaciones || '').trim() || 'Sin observaciones.']], {}, { bodyStyles: { minCellHeight: 12, valign: 'top' } });
    return A.firmaYFotos(doc, y, M, W, PW, PH, d, ctx, 'Avance de gestión y suministros');
  }

  OPS.registrarFormulario({
    id: 'avance-oficina',
    tipo: 'AG',
    nombre: 'Avance de gestión y suministros',
    archivo: 'Avance_gestion',
    descripcion: 'Oficina: etapas de compra, recepción, permisos y conexión',
    icono: '🗂️',
    catalogo: true,
    etiqueta: (d) => U.fmtFecha(d.fecha),
    inicial: () => ({ fecha: U.hoyISO(), observaciones: '', fotos: [], nombre: '', cargo: 'Ingeniero de proyecto', firma: '' }),
    pasos: [
      {
        titulo: 'Avance',
        ayuda: '«Listo» marca la etapa o actividad como cumplida (con su fecha real; si la deja vacía se usa la fecha del reporte). «En curso» informa el % de avance.',
        campos: [
          { id: 'fecha', tipo: 'fecha', label: 'Fecha del reporte', req: true, ancho: 'medio', validar: (v) => (v > U.hoyISO() ? 'No puede ser una fecha futura' : null) },
          {
            id: 'listaOficina', tipo: 'custom',
            html: (d, ctx) => {
              const c = cat(ctx), items = A.itemsOficina(c);
              return `${c.generado ? `<small class="ayuda">Lista publicada el ${U.esc(c.generado)} · ${items.length} ítems</small>` : ''}
                ${A.filtroHtml('avOficina')}${A.listaHtml('avOficina', items, d, fila, tieneDato)}`;
            },
            validar: (v, d, ctx) => validar(v, d, ctx)
          }
        ]
      },
      {
        titulo: 'Observaciones',
        campos: [
          { id: 'observaciones', tipo: 'area', label: 'Observaciones', ayuda: 'ETA de suministros, temas con proveedores, el CEN o el cliente…', filas: 4 },
          { id: 'fotos', tipo: 'fotos', label: 'Respaldos (fotos de guías, BL, actas)', max: 6 }
        ]
      },
      {
        titulo: 'Firma',
        campos: [
          { id: 'nombre', tipo: 'texto', label: 'Nombre', req: true, recordar: true },
          { id: 'cargo', tipo: 'texto', label: 'Cargo', req: true, recordar: true },
          { id: 'firma', tipo: 'firma', label: 'Firma (opcional)' }
        ]
      },
      { titulo: 'Revisión', final: true, ayuda: 'Revise antes de enviar. Se carga en el Excel de control del proyecto.', campos: [{ id: 'resumen', tipo: 'resumen', html: resumenHtml }] }
    ],
    registro,
    pdf
  });
})();
