/* =====================================================================
   Formulario: SOLICITUD DE MATERIALES Y HERRAMIENTAS
   Basado en "SIE25-000-Formato_solicitud_materiales_v0.xlsx" (Rev. 0, 24-10-2025)
   ===================================================================== */
(function () {
  'use strict';
  const U = OPS.util;

  /* ---------- LISTAS (equivalen a la Hoja2 del Excel) ---------- */
  // Días hábiles mínimos (Hoja2!K9). Igual que el Excel: "A TIEMPO" solo si el plazo es MAYOR a este valor.
  const PLAZO_MINIMO = 8;
  const PRIORIDADES = ['Alta', 'Media', 'Baja'];
  const LUGARES = ['Obra', 'Oficina courier', 'Oficina ION'];
  const TIPOS = ['Material', 'Herramienta'];
  const UNIDADES = ['un', 'm', 'm²', 'm³', 'kg', 'ton', 'lt', 'gl', 'rollo', 'caja', 'saco', 'juego', 'par', 'global'];
  const ESTADOS_OFICINA = ['Pendiente', 'Aprobado', 'Aprobado parcial', 'Rechazado'];
  const CATEGORIAS = {
    'Suministros Generales': [
      'Cable String', 'Cables BT', 'Cables MT', 'Cable Comunicaciones & SSAA', 'Canalizaciones',
      'Cámaras Eléctricas', 'Suministros Eléctricos menores', 'Estación Meteorológica', 'Sistema SCADA',
      'Cámaras CCTV', 'Postes & Ferretería CCTV', 'Suministros menores CCTV', 'Conductores PAT',
      'Materiales y Termofusiones PAT', 'UPS', 'Tableros SSAA', 'Generales Sala de Control',
      'Spare Parts', 'Adicional Suministros'
    ],
    'Suministros Obras Civiles': ['Arena', 'Hormigón', 'Otros Áridos'],
    'Suministros Indirectos': [
      'Baños IIFF', 'Contenedores IIFF', 'Camionetas', 'Combustible', 'Agua', 'Generales IIFF',
      'Alimentación, Alojamiento & Viáticos', 'Traslado Personal', 'Seguridad Obra'
    ]
  };
  const FORMATO = { revision: '0', version: '24-10-2025' };

  /* ---------- cálculos (mismas fórmulas del Excel) ---------- */
  const plazo = (d) => U.diasHabiles(d.fechaSolicitud, d.fechaRequerida);            // K8
  function estadoPlazo(d) {                                                            // K7
    const p = plazo(d);
    if (p == null) return '';
    return p > PLAZO_MINIMO ? 'A TIEMPO' : 'FUERA DE PLAZO';
  }
  function fechaMinimaATiempo(d) {
    const ini = U.fechaDe(d.fechaSolicitud);
    if (!ini) return '';
    const f = new Date(ini);
    for (let i = 0; i < 90; i++) {
      f.setDate(f.getDate() + 1);
      if (U.diasHabiles(d.fechaSolicitud, U.isoDe(f)) > PLAZO_MINIMO) return U.isoDe(f);
    }
    return '';
  }
  function total(it) {                                                                 // L = H + N(J)
    const c = U.num(it.cantidad);
    if (!Number.isFinite(c)) return NaN;
    const e = U.num(it.extra);
    return c + (Number.isFinite(e) ? e : 0);
  }
  function pctExtra(it) {                                                              // M = N(J) / H
    const c = U.num(it.cantidad);
    if (!Number.isFinite(c) || c === 0) return NaN;
    const e = U.num(it.extra);
    return (Number.isFinite(e) ? e : 0) / c;
  }
  const numOVacio = (v) => { const n = U.num(v); return Number.isFinite(n) ? n : ''; };
  const fmtCant = (v) => { const n = U.num(v); return Number.isFinite(n) ? U.fmtNum(n) : ''; };

  /* ---------- pantalla de revisión ---------- */
  function resumenHtml(d, ctx) {
    const est = estadoPlazo(d), p = plazo(d), items = d.items || [];
    return `
      <dl class="res-grid">
        <dt>Proyecto</dt><dd>${U.esc(ctx.proyecto.codigo)} · ${U.esc(ctx.proyecto.nombre)}</dd>
        <dt>Fecha de solicitud</dt><dd>${U.esc(U.fmtFecha(d.fechaSolicitud))}</dd>
        <dt>Fecha requerida</dt><dd>${U.esc(U.fmtFecha(d.fechaRequerida))}</dd>
        <dt>Plazo</dt><dd>${p == null ? '—' : p + ' días hábiles'}</dd>
        <dt>Estado</dt><dd><span class="pill ${est === 'A TIEMPO' ? 'ok' : 'mal'}">${U.esc(est || '—')}</span></dd>
        <dt>Prioridad</dt><dd>${U.esc(d.prioridad)}</dd>
        <dt>Lugar de entrega</dt><dd>${U.esc(d.lugar)}</dd>
      </dl>
      <div class="res-tit">Materiales (${items.length})</div>
      <table class="res-tabla">
        <thead><tr><th>#</th><th>Material</th><th style="text-align:right">Total</th><th style="text-align:right">% extra</th></tr></thead>
        <tbody>${items.map((it, i) => `
          <tr><td>${i + 1}</td>
            <td>${U.esc(it.nombre)}<br><small style="color:#6b7280">${U.esc(it.tipo)} · ${U.esc(it.subcategoria)}</small></td>
            <td class="num">${U.esc(U.fmtNum(total(it)))} ${U.esc(it.unidad)}</td>
            <td class="num">${U.esc(U.fmtPct(pctExtra(it)))}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="res-tit">Observaciones y fotos</div>
      <p style="margin:0 0 4px;white-space:pre-wrap">${U.esc((d.observaciones || '').trim() || 'Sin observaciones.')}</p>
      <p class="sub" style="margin:0">${(d.fotos || []).length} foto(s) adjunta(s)</p>
      <div class="res-tit">Solicitado por</div>
      <p style="margin:0">${U.esc(d.solicitante)} · ${U.esc(d.cargo)}${d.correo ? `<br><small style="color:#6b7280">Copia a ${U.esc(d.correo)}</small>` : ''}</p>
      ${d.firma && d.firma.data ? `<img class="res-firma" src="${U.esc(d.firma.data)}" alt="Firma">` : ''}`;
  }

  /* ---------- filas para la planilla y datos del correo ---------- */
  function registro(d) {
    const est = estadoPlazo(d), items = d.items || [];
    const oficina = { oficina: true };
    return {
      asunto: `Prioridad ${d.prioridad} · ${est}`,
      correoCopia: (d.correo || '').trim(),
      resumen: {
        cols: [
          { k: 'fechaSolicitud', l: 'Fecha de solicitud', t: 'fecha' },
          { k: 'fechaRequerida', l: 'Fecha requerida entrega', t: 'fecha' },
          { k: 'plazo', l: 'Días hábiles de plazo' },
          { k: 'estadoPlazo', l: 'Estado de solicitud' },
          { k: 'prioridad', l: 'Prioridad' },
          { k: 'lugar', l: 'Lugar de entrega' },
          { k: 'nItems', l: 'N° de ítems' },
          { k: 'observaciones', l: 'Observaciones' },
          { k: 'nFotos', l: 'N° de fotos' },
          { k: 'solicitante', l: 'Solicitado por' },
          { k: 'cargo', l: 'Cargo solicitante' },
          { k: 'correo', l: 'Correo solicitante' },
          Object.assign({ k: 'estadoOficina', l: 'Estado (Oficina)', opciones: ESTADOS_OFICINA, defecto: 'Pendiente' }, oficina),
          Object.assign({ k: 'revisadoPor', l: 'Revisado por (Oficina)' }, oficina),
          Object.assign({ k: 'aprobadoPor', l: 'Aprobado por (Oficina)' }, oficina)
        ],
        fila: {
          fechaSolicitud: d.fechaSolicitud, fechaRequerida: d.fechaRequerida, plazo: plazo(d), estadoPlazo: est,
          prioridad: d.prioridad, lugar: d.lugar, nItems: items.length, observaciones: (d.observaciones || '').trim(),
          nFotos: (d.fotos || []).length, solicitante: d.solicitante, cargo: d.cargo, correo: (d.correo || '').trim()
        }
      },
      detalle: {
        cols: [
          { k: 'n', l: 'N°', correo: true },
          { k: 'nombre', l: 'Nombre del material', correo: true },
          { k: 'tipo', l: 'Material / Herramienta' },
          { k: 'categoria', l: 'Categoría' },
          { k: 'subcategoria', l: 'Subcategoría', correo: true },
          { k: 'unidad', l: 'Unidad', correo: true },
          { k: 'stock', l: 'Stock en obra', correo: true },
          { k: 'cantidad', l: 'Cantidad requerida', correo: true },
          { k: 'justificacion', l: 'Justificación de cantidad' },
          { k: 'extra', l: 'Cantidad extra', correo: true },
          { k: 'justificacionExtra', l: 'Justificación cantidad extra' },
          { k: 'total', l: 'Cantidad total', correo: true },
          { k: 'pctExtra', l: '% extra', fmt: '0.0%', correo: true },
          { k: 'fechaRequerida', l: 'Fecha requerida entrega', t: 'fecha' },
          { k: 'prioridad', l: 'Prioridad' },
          Object.assign({ k: 'aprobada', l: 'Cantidad aprobada' }, oficina),
          Object.assign({ k: 'estado', l: 'Estado', opciones: ESTADOS_OFICINA, defecto: 'Pendiente' }, oficina),
          Object.assign({ k: 'comentario', l: 'Comentario oficina' }, oficina)
        ],
        filas: items.map((it, i) => ({
          n: i + 1, nombre: (it.nombre || '').trim(), tipo: it.tipo, categoria: it.categoria, subcategoria: it.subcategoria,
          unidad: it.unidad, stock: numOVacio(it.stock), cantidad: numOVacio(it.cantidad), justificacion: (it.justificacion || '').trim(),
          extra: numOVacio(it.extra), justificacionExtra: (it.justificacionExtra || '').trim(),
          total: Number.isFinite(total(it)) ? total(it) : '', pctExtra: Number.isFinite(pctExtra(it)) ? pctExtra(it) : '',
          fechaRequerida: d.fechaRequerida, prioridad: d.prioridad
        }))
      }
    };
  }

  /* ---------- PDF (A4 horizontal, mismo orden que el Excel) ---------- */
  // Las fuentes estándar del PDF no muestran bien superíndices ni emojis en todos los visores:
  // m² y m³ se escriben m2 y m3, y se quitan los caracteres que no se pueden imprimir.
  function textoPdf(v) {
    return String(v == null ? '' : v)
      .replace(/[²³¹]/g, (c) => ({ '²': '2', '³': '3', '¹': '1' })[c])
      .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '');
  }
  function limpiarParaPdf(v) {
    if (typeof v === 'string') return v.startsWith('data:') ? v : textoPdf(v);
    if (Array.isArray(v)) return v.map(limpiarParaPdf);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = limpiarParaPdf(v[k]); }); return o; }
    return v;
  }

  function textoAjustado(doc, txt, x, y, maxW, size) {
    let s = size;
    doc.setFontSize(s);
    while (doc.getTextWidth(txt) > maxW && s > 5.5) { s -= 0.25; doc.setFontSize(s); }
    let t = txt;
    while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -2) + '.';
    doc.text(t, x, y);
  }

  function imagenAjustada(doc, img, fmt, x, y, w, h) {
    const e = Math.min(w / img.w, h / img.h);
    const iw = img.w * e, ih = img.h * e;
    doc.addImage(img.data, fmt, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }

  function pdf(datos, ctx) {
    const d = limpiarParaPdf(datos);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const PW = 297, PH = 210, M = 10, W = PW - 2 * M;
    const C = {
      ink: [26, 26, 26], gris: [240, 241, 244], gris2: [226, 228, 233], linea: [150, 155, 162], azul: [46, 159, 212],
      azulLt: [234, 246, 252], verde: [63, 125, 20], rojo: [200, 35, 28], muted: [107, 114, 128]
    };
    const folioTxt = textoPdf(ctx.folio || 'BORRADOR (sin folio)');
    const proyTxt = textoPdf(`${ctx.proyecto.codigo} - ${ctx.proyecto.nombre}`);
    doc.setProperties({ title: `Solicitud de materiales ${ctx.folio || 'borrador'}`, subject: proyTxt, author: 'Operaciones ION', creator: 'Operaciones ION' });
    doc.setLineWidth(0.2);
    doc.setDrawColor(...C.linea);
    doc.setTextColor(...C.ink);

    /* --- encabezado --- */
    const y0 = M, hH = 24, wL = 50, wC = 147, xC = M + wL, xR = xC + wC, wR = W - wL - wC, wRl = 27;
    doc.setFillColor(...C.gris);
    doc.rect(xR, y0, wRl, hH, 'F');
    doc.rect(M, y0, W, hH);
    doc.line(xC, y0, xC, y0 + hH);
    doc.line(xR, y0, xR, y0 + hH);
    doc.line(xR + wRl, y0, xR + wRl, y0 + hH);
    for (let i = 1; i < 4; i++) doc.line(xR, y0 + (i * hH) / 4, xR + wR, y0 + (i * hH) / 4);
    if (ctx.logo) {
      imagenAjustada(doc, ctx.logo, 'PNG', M + 6, y0 + 4, wL - 12, hH - 8);
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
      doc.text('ION', M + wL / 2, y0 + hH / 2 + 3, { align: 'center' });
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5);
    doc.text('SOLICITUD DE MATERIALES Y HERRAMIENTAS', xC + wC / 2, y0 + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C.muted);
    doc.text('GESTIÓN DE ADQUISICIONES', xC + wC / 2, y0 + 17.5, { align: 'center' });
    doc.setTextColor(...C.ink);
    [['Código', folioTxt], ['Revisión', FORMATO.revision], ['Versión formato', FORMATO.version], ['Proyecto', proyTxt]].forEach((f, i) => {
      const yy = y0 + (i * hH) / 4 + hH / 8 + 1.1;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text(f[0], xR + 2, yy);
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      if (i === 0 && !ctx.folio) doc.setTextColor(...C.rojo);
      textoAjustado(doc, String(f[1]), xR + wRl + 2, yy, wR - wRl - 4, i === 0 ? 9 : 8);
      doc.setTextColor(...C.ink);
    });

    /* --- información general --- */
    const est = estadoPlazo(d), p = plazo(d);
    const etiqueta = { cellWidth: 38, fillColor: C.gris, fontStyle: 'bold' };
    const base = { font: 'helvetica', lineColor: C.linea, lineWidth: 0.2, textColor: C.ink, valign: 'middle', overflow: 'linebreak' };
    doc.autoTable({
      startY: y0 + hH + 4, margin: { left: M, right: M }, theme: 'grid', tableWidth: W,
      head: [[{ content: 'INFORMACIÓN GENERAL', colSpan: 6 }]],
      body: [
        ['Fecha de solicitud', U.fmtFecha(d.fechaSolicitud), 'Estado de solicitud', est, 'Prioridad', d.prioridad],
        ['Fecha requerida entrega', U.fmtFecha(d.fechaRequerida), 'Días hábiles de plazo', p == null ? '' : String(p), 'Lugar de entrega', d.lugar]
      ],
      styles: Object.assign({ fontSize: 8, cellPadding: 1.6 }, base),
      headStyles: { fillColor: C.ink, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: etiqueta, 1: { cellWidth: 54.33 }, 2: etiqueta, 3: { cellWidth: 54.33 }, 4: etiqueta, 5: { cellWidth: 'auto' } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.row.index === 0 && h.column.index === 3 && est) {
          h.cell.styles.fontStyle = 'bold';
          h.cell.styles.textColor = est === 'A TIEMPO' ? C.verde : C.rojo;
        }
      }
    });

    /* --- listado de materiales --- */
    const items = d.items || [];
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4, margin: { left: M, right: M, top: M + 2, bottom: 14 }, theme: 'grid', tableWidth: W,
      head: [
        [
          { content: 'LISTADO DE MATERIALES (completa obra)', colSpan: 13, styles: { fillColor: C.ink, textColor: 255, halign: 'left', fontSize: 8 } },
          { content: 'USO OFICINA (Ing. Proyecto / PM)', colSpan: 3, styles: { fillColor: C.azul, textColor: 255, halign: 'center', fontSize: 7.5 } }
        ],
        ['N°', 'Nombre del material', 'Material /\nHerramienta', 'Categoría', 'Subcategoría', 'Unidad', 'Stock en\nobra', 'Cantidad\nrequerida',
          'Justificación de cantidad\n(plano, cubicación, partida)', 'Cantidad\nextra', 'Justificación\ncantidad extra', 'Cantidad\ntotal', '% extra',
          'Cantidad\naprobada', 'Estado', 'Comentario\noficina']
      ],
      body: items.map((it, i) => [
        i + 1, it.nombre, it.tipo, it.categoria, it.subcategoria, it.unidad, fmtCant(it.stock), fmtCant(it.cantidad),
        it.justificacion, fmtCant(it.extra), it.justificacionExtra, U.fmtNum(total(it)), U.fmtPct(pctExtra(it)), '', '', ''
      ]),
      styles: Object.assign({ fontSize: 7, cellPadding: 1.2 }, base),
      headStyles: { fillColor: C.gris2, textColor: C.ink, fontStyle: 'bold', fontSize: 6.5, halign: 'center', valign: 'middle', cellPadding: 0.8 },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 30 }, 2: { cellWidth: 16 }, 3: { cellWidth: 19 }, 4: { cellWidth: 22 },
        5: { cellWidth: 10, halign: 'center' }, 6: { cellWidth: 12, halign: 'right' }, 7: { cellWidth: 13, halign: 'right' },
        8: { cellWidth: 35 }, 9: { cellWidth: 12, halign: 'right' }, 10: { cellWidth: 27 },
        11: { cellWidth: 12, halign: 'right', fillColor: C.gris, fontStyle: 'bold' }, 12: { cellWidth: 11, halign: 'right', fillColor: C.gris },
        13: { cellWidth: 13, fillColor: C.azulLt }, 14: { cellWidth: 16, fillColor: C.azulLt }, 15: { cellWidth: 'auto', fillColor: C.azulLt }
      },
      showHead: 'everyPage'
    });

    /* --- observaciones --- */
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4, margin: { left: M, right: M, top: M + 2, bottom: 14 }, theme: 'grid', tableWidth: W,
      head: [['OBSERVACIONES (especificaciones técnicas, comentarios adicionales, etc.)']],
      body: [[(d.observaciones || '').trim() || 'Sin observaciones.']],
      styles: Object.assign({ fontSize: 8, cellPadding: 1.6 }, base),
      bodyStyles: { minCellHeight: 11, valign: 'top', cellPadding: 2 },
      headStyles: { fillColor: C.ink, textColor: 255, fontStyle: 'bold', fontSize: 8 }
    });

    /* --- firmas --- */
    const hF = 40, bw = (W - 8) / 3, lw = 16;
    let yF = doc.lastAutoTable.finalY + 5;
    if (yF + hF + 6 > PH - 12) { doc.addPage(); yF = M + 4; }
    [
      ['SOLICITADO POR (Obra)', d.solicitante, d.cargo, U.fmtFecha(d.fechaSolicitud), d.firma, C.ink],
      ['REVISADO POR (Oficina)', '', '', '', null, C.azul],
      ['APROBADO POR (Oficina)', '', '', '', null, C.azul]
    ].forEach((b, i) => {
      const x = M + i * (bw + 4);
      doc.setFillColor(...b[5]); doc.rect(x, yF, bw, 6, 'F');
      doc.setFillColor(...C.gris); doc.rect(x, yF + 6, lw, hF - 6, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text(b[0], x + 2, yF + 4.1);
      doc.setTextColor(...C.ink);
      [['Nombre', b[1]], ['Cargo', b[2]], ['Fecha', b[3]]].forEach((f, j) => {
        const yy = yF + 6 + j * 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(f[0], x + 2, yy + 4);
        doc.setFont('helvetica', 'normal'); textoAjustado(doc, String(f[1] || ''), x + lw + 2, yy + 4, bw - lw - 4, 8);
        doc.line(x, yy + 6, x + bw, yy + 6);
      });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('Firma', x + 2, yF + 28);
      if (b[4] && b[4].data) imagenAjustada(doc, b[4], 'PNG', x + lw + 3, yF + 25, bw - lw - 6, hF - 26);
      doc.rect(x, yF, bw, hF);
      doc.line(x + lw, yF + 6, x + lw, yF + hF);
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...C.muted);
    doc.text('Cantidad total y % extra se calculan automáticamente. Las columnas "Uso oficina" y las firmas de revisión y aprobación las completa el PM o el Ing. de Proyecto en la planilla de Operaciones.',
      M, yF + hF + 4, { maxWidth: W });
    doc.setTextColor(...C.ink);

    /* --- anexo fotográfico (6 fotos por página) --- */
    const fotos = d.fotos || [];
    const cw = (W - 10) / 3, ch = (PH - 14 - (M + 10) - 5) / 2;
    for (let i = 0; i < fotos.length; i += 6) {
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text('ANEXO FOTOGRÁFICO', M, M + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.muted);
      doc.text(`${folioTxt} · ${proyTxt}`, PW - M, M + 5, { align: 'right' });
      doc.setTextColor(...C.ink);
      fotos.slice(i, i + 6).forEach((f, k) => {
        const x = M + (k % 3) * (cw + 5), yy = M + 10 + Math.floor(k / 3) * (ch + 5);
        doc.setFillColor(...C.gris); doc.rect(x, yy, cw, ch - 6, 'F');
        imagenAjustada(doc, f, 'JPEG', x, yy, cw, ch - 6);
        doc.setFontSize(8); doc.text(`Foto ${i + k + 1}`, x + cw / 2, yy + ch - 1.5, { align: 'center' });
      });
    }

    /* --- pie de página y marca de borrador --- */
    const tot = doc.getNumberOfPages(), gen = U.fmtFechaHora(ctx.generado || new Date());
    for (let pg = 1; pg <= tot; pg++) {
      doc.setPage(pg);
      if (!ctx.folio && doc.GState) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.setFont('helvetica', 'bold'); doc.setFontSize(90); doc.setTextColor(...C.rojo);
        doc.text('BORRADOR', PW / 2, PH / 2 + 15, { align: 'center', angle: 18 });
        doc.restoreGraphicsState();
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.muted);
      doc.text(`Operaciones ION · Solicitud de materiales · generado el ${gen}`, M, PH - 6);
      doc.text(folioTxt, PW / 2, PH - 6, { align: 'center' });
      doc.text(`Página ${pg} de ${tot}`, PW - M, PH - 6, { align: 'right' });
    }
    doc.setTextColor(...C.ink);
    return doc;
  }

  /* ---------- definición del formulario ---------- */
  OPS.registrarFormulario({
    id: 'solicitud-materiales',
    tipo: 'SM',                       // prefijo del folio: CAL26-SM-0001
    nombre: 'Solicitud de materiales',
    archivo: 'Solicitud_materiales',
    descripcion: 'Materiales y herramientas para obra',
    icono: '📦',
    etiqueta: (d) => { const n = (d.items || []).length; return n === 1 ? '1 material' : `${n} materiales`; },
    inicial: () => ({
      fechaSolicitud: U.hoyISO(), fechaRequerida: '', prioridad: 'Media', lugar: 'Obra',
      items: [{ tipo: 'Material' }], observaciones: '', fotos: [],
      solicitante: '', cargo: 'Site Manager', correo: '', firma: ''
    }),
    pasos: [
      {
        titulo: 'General',
        ayuda: 'Fechas, prioridad y lugar de entrega.',
        campos: [
          { id: 'fechaSolicitud', tipo: 'fecha', label: 'Fecha de solicitud', req: true, ancho: 'medio' },
          {
            id: 'fechaRequerida', tipo: 'fecha', label: 'Fecha requerida', req: true, ancho: 'medio',
            validar: (v, d) => (d.fechaSolicitud && v < d.fechaSolicitud ? 'No puede ser anterior a la fecha de solicitud' : null)
          },
          { id: 'plazo', tipo: 'calculo', label: 'Días hábiles de plazo', ancho: 'medio', valor: (d) => { const p = plazo(d); return p == null ? '—' : String(p); } },
          {
            id: 'estadoPlazo', tipo: 'calculo', label: 'Estado de solicitud', ancho: 'medio',
            valor: (d) => estadoPlazo(d) || '—',
            estilo: (d) => ({ 'A TIEMPO': 'ok', 'FUERA DE PLAZO': 'mal' })[estadoPlazo(d)] || ''
          },
          {
            id: 'avisoPlazo', tipo: 'aviso',
            html: (d) => {
              if (estadoPlazo(d) !== 'FUERA DE PLAZO') return '';
              const f = fechaMinimaATiempo(d);
              return `<div class="aviso mal">Para quedar A TIEMPO se necesitan más de ${PLAZO_MINIMO} días hábiles de plazo.${f ? ` La fecha requerida debería ser desde el <b>${U.esc(U.fmtFecha(f))}</b>.` : ''} Si es urgente, explique el motivo en Observaciones.</div>`;
            }
          },
          { id: 'prioridad', tipo: 'opciones', label: 'Prioridad', opciones: PRIORIDADES, req: true },
          { id: 'lugar', tipo: 'opciones', label: 'Lugar de entrega', opciones: LUGARES, req: true }
        ]
      },
      {
        titulo: 'Materiales',
        ayuda: 'Agregue cada material o herramienta. La cantidad total y el % extra se calculan solos.',
        campos: [
          {
            id: 'items', tipo: 'items', itemNombre: 'material', min: 1, max: 80,
            nuevo: () => ({ tipo: 'Material' }),
            titulo: (it) => (it.nombre && it.nombre.trim()) || 'Material sin nombre',
            sub: (it) => {
              const t = total(it), partes = [];
              if (Number.isFinite(t)) partes.push(`${U.fmtNum(t)} ${it.unidad || ''}`.trim());
              if (it.subcategoria) partes.push(it.subcategoria);
              return partes.join(' · ') || 'Toque para completar';
            },
            campos: [
              { id: 'nombre', tipo: 'texto', label: 'Nombre del material', req: true, placeholder: 'Ej: Cable BT 4x16 mm²' },
              { id: 'tipo', tipo: 'opciones', label: 'Material / Herramienta', opciones: TIPOS, req: true },
              { id: 'categoria', tipo: 'lista', label: 'Categoría', opciones: Object.keys(CATEGORIAS), req: true },
              { id: 'subcategoria', tipo: 'lista', label: 'Subcategoría', opciones: (d, it) => CATEGORIAS[it.categoria] || [], vacio: 'Primero elija la categoría', req: true },
              { id: 'unidad', tipo: 'lista', label: 'Unidad', opciones: UNIDADES, req: true, ancho: 'medio' },
              { id: 'stock', tipo: 'numero', label: 'Stock en obra', req: true, min: 0, ancho: 'medio' },
              { id: 'cantidad', tipo: 'numero', label: 'Cantidad requerida', req: true, mayorQue: 0, ancho: 'medio' },
              { id: 'extra', tipo: 'numero', label: 'Cantidad extra', min: 0, ancho: 'medio' },
              { id: 'justificacion', tipo: 'area', label: 'Justificación de cantidad', ayuda: 'Plano, cubicación o partida', req: true, filas: 2, placeholder: 'Ej: Plano E-102 rev B, tramo TG a TD-3' },
              { id: 'justificacionExtra', tipo: 'area', label: 'Justificación de la cantidad extra', req: (d, it) => U.num(it.extra) > 0, filas: 2, placeholder: 'Obligatoria si pide cantidad extra' },
              { id: 'total', tipo: 'calculo', label: 'Cantidad total', ancho: 'medio', valor: (d, it) => { const t = total(it); return Number.isFinite(t) ? `${U.fmtNum(t)} ${it.unidad || ''}`.trim() : '—'; } },
              { id: 'pct', tipo: 'calculo', label: '% extra', ancho: 'medio', valor: (d, it) => U.fmtPct(pctExtra(it)) || '—' }
            ]
          }
        ]
      },
      {
        titulo: 'Observaciones',
        campos: [
          { id: 'observaciones', tipo: 'area', label: 'Observaciones', ayuda: 'Especificaciones técnicas, comentarios adicionales, etc.', filas: 4 },
          { id: 'fotos', tipo: 'fotos', label: 'Fotos (opcional)', ayuda: 'Plano, stock actual, referencia del material…', max: 6 }
        ]
      },
      {
        titulo: 'Firma',
        ayuda: 'Nombre, cargo y correo quedan recordados en este teléfono para la próxima vez.',
        campos: [
          { id: 'solicitante', tipo: 'texto', label: 'Nombre de quien solicita', req: true, recordar: true },
          { id: 'cargo', tipo: 'texto', label: 'Cargo', req: true, recordar: true },
          { id: 'correo', tipo: 'correo', label: 'Correo para recibir copia (opcional)', recordar: true, placeholder: 'nombre@empresa.cl' },
          { id: 'firma', tipo: 'firma', label: 'Firma', req: true }
        ]
      },
      {
        titulo: 'Revisión',
        ayuda: 'Revise antes de enviar. Se generará el PDF con el formato oficial.',
        final: true,
        campos: [{ id: 'resumen', tipo: 'resumen', html: resumenHtml }]
      }
    ],
    registro,
    pdf
  });
})();
