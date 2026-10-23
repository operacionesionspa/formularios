/* =====================================================================
   Piezas comunes de los reportes de avance (obra y oficina)
   - Lista de actividades: la publica el Excel de control del proyecto
     (botón "Publicar lista de actividades") y la app la guarda en el teléfono.
   - Cada ítem del catálogo: id, nivel (1 partida, 2 etapa, 3 actividad),
     cuenta, partida, disciplina, reporta (Obra / Oficina), nombre, unidad,
     total, acumulado, avance (0..1), inicioPlan, finPlan.
   ===================================================================== */
(function () {
  'use strict';
  const U = OPS.util;

  const n0 = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);
  const esGl = (it) => !n0(it.total) || String(it.unidad || '').toLowerCase() === 'gl';
  const fmt = (v) => U.fmtNum(n0(v));

  // Ítems que reporta cada formulario
  function itemsObra(cat) {
    return (cat && cat.items ? cat.items : []).filter((it) => Number(it.nivel) === 3 && String(it.reporta || 'Obra') === 'Obra');
  }
  function itemsOficina(cat) {
    return (cat && cat.items ? cat.items : []).filter((it) =>
      (Number(it.nivel) === 3 && String(it.reporta) === 'Oficina') ||
      (Number(it.nivel) === 2 && !/ejecuci[oó]n/i.test(String(it.nombre))));
  }

  // Agrupa por disciplina y cuenta, en el orden del catálogo
  function agrupar(items) {
    const discs = [];
    const porD = {};
    items.forEach((it) => {
      const dn = it.disciplina || 'Sin disciplina';
      if (!porD[dn]) { porD[dn] = { nombre: dn, cuentas: [], porC: {} }; discs.push(porD[dn]); }
      const D = porD[dn];
      const cn = it.cuenta + ' · ' + String(it.partida || '').replace(/^\d+\s*·\s*/, '');
      if (!D.porC[cn]) { D.porC[cn] = { nombre: cn, items: [] }; D.cuentas.push(D.porC[cn]); }
      D.porC[cn].items.push(it);
    });
    return discs;
  }

  function filtroHtml(id, extra) {
    return `<div class="av-tools">
        <input type="search" class="av-filtro" data-lista="${id}" placeholder="Buscar actividad o cuenta…" autocomplete="off">
        <label class="av-chk"><input type="checkbox" class="av-solo" data-lista="${id}"> Solo con datos</label>
        ${extra || ''}
      </div>`;
  }

  // Lista agrupada (details plegables). fila(it) devuelve el HTML de cada ítem.
  function listaHtml(id, items, d, fila, tieneDato) {
    const grupos = agrupar(items);
    if (!items.length) return '<div class="aviso info">La lista de actividades no tiene ítems para este formulario. Publíquela desde el Excel.</div>';
    return `<div class="av-lista" id="${id}">${grupos.map((D) => {
      const nD = D.cuentas.reduce((a, C) => a + C.items.filter((it) => tieneDato(it, d)).length, 0);
      return `<details class="av-disc"${nD ? ' open' : ''}><summary><span>${U.esc(D.nombre)}</span><small>${nD ? nD + ' con datos' : ''}</small></summary>
        ${D.cuentas.map((C) => {
          const nC = C.items.filter((it) => tieneDato(it, d)).length;
          return `<details class="av-cta"${nC ? ' open' : ''}><summary><span>${U.esc(C.nombre)}</span><small>${nC ? nC + ' con datos' : C.items.length + ' ítems'}</small></summary>
            ${C.items.map((it) => `<div class="av-fila${tieneDato(it, d) ? ' con' : ''}" data-txt="${U.esc((it.nombre + ' ' + C.nombre + ' ' + D.nombre).toLowerCase())}">${fila(it, d)}</div>`).join('')}
          </details>`;
        }).join('')}
      </details>`;
    }).join('')}</div>`;
  }

  // Búsqueda y "solo con datos" (no vuelven a dibujar el formulario)
  function aplicarFiltro(lista) {
    const raiz = document.getElementById(lista);
    if (!raiz) return;
    const q = (document.querySelector(`.av-filtro[data-lista="${lista}"]`) || {}).value || '';
    const solo = (document.querySelector(`.av-solo[data-lista="${lista}"]`) || {}).checked;
    const t = q.trim().toLowerCase();
    raiz.querySelectorAll('.av-fila').forEach((f) => {
      const conDato = Array.from(f.querySelectorAll('input[data-k], select[data-k]')).some((i) => String(i.value || '').trim() !== '');
      f.classList.toggle('con', conDato);
      f.hidden = (t && !f.dataset.txt.includes(t)) || (solo && !conDato);
    });
    raiz.querySelectorAll('details.av-cta').forEach((c) => {
      const vis = Array.from(c.querySelectorAll('.av-fila')).some((f) => !f.hidden);
      c.hidden = !vis;
      if ((t || solo) && vis) c.open = true;
    });
    raiz.querySelectorAll('details.av-disc').forEach((dd) => {
      const vis = Array.from(dd.querySelectorAll('details.av-cta')).some((c) => !c.hidden);
      dd.hidden = !vis;
      if ((t || solo) && vis) dd.open = true;
    });
  }
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList && (el.classList.contains('av-filtro'))) aplicarFiltro(el.dataset.lista);
    else if (el.dataset && el.dataset.k && el.closest && el.closest('.av-fila')) el.closest('.av-fila').classList.toggle('con', String(el.value || '').trim() !== '');
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.classList && el.classList.contains('av-solo')) aplicarFiltro(el.dataset.lista);
    else if (el.dataset && el.dataset.k && el.closest && el.closest('.av-fila')) {
      const f = el.closest('.av-fila');
      f.classList.toggle('con', Array.from(f.querySelectorAll('[data-k]')).some((i) => String(i.value || '').trim() !== ''));
    }
  });

  /* ---------- PDF ---------- */
  function textoPdf(v) {
    return String(v == null ? '' : v)
      .replace(/[²³¹]/g, (c) => ({ '²': '2', '³': '3', '¹': '1' })[c])
      .replace(/[→]/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=')
      .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, '');
  }
  function limpiar(v) {
    if (typeof v === 'string') return v.startsWith('data:') ? v : textoPdf(v);
    if (Array.isArray(v)) return v.map(limpiar);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = limpiar(v[k]); }); return o; }
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
  function imagenAjustada(doc, img, fmtImg, x, y, w, h) {
    const e = Math.min(w / img.w, h / img.h);
    const iw = img.w * e, ih = img.h * e;
    doc.addImage(img.data, fmtImg, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  }
  const COL = {
    ink: [26, 26, 26], gris: [240, 241, 244], gris2: [226, 228, 233], linea: [150, 155, 162], azul: [46, 159, 212],
    azulLt: [234, 246, 252], verde: [63, 125, 20], rojo: [200, 35, 28], muted: [107, 114, 128], marino: [31, 56, 100]
  };
  const BASE = { font: 'helvetica', lineColor: COL.linea, lineWidth: 0.2, textColor: COL.ink, valign: 'middle', overflow: 'linebreak' };

  // Documento A4 horizontal con encabezado estándar. Devuelve { doc, y }
  function nuevoDoc(titulo, subtitulo, ctx, version) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const PW = 297, M = 10, W = PW - 2 * M;
    const folioTxt = textoPdf(ctx.folio || 'BORRADOR (sin folio)');
    const proyTxt = textoPdf(`${ctx.proyecto.codigo} - ${ctx.proyecto.nombre}`);
    doc.setProperties({ title: `${titulo} ${ctx.folio || 'borrador'}`, subject: proyTxt, author: 'Operaciones ION', creator: 'Operaciones ION' });
    doc.setLineWidth(0.2); doc.setDrawColor(...COL.linea); doc.setTextColor(...COL.ink);
    const y0 = M, hH = 24, wL = 50, wC = 147, xC = M + wL, xR = xC + wC, wR = W - wL - wC, wRl = 27;
    doc.setFillColor(...COL.gris); doc.rect(xR, y0, wRl, hH, 'F');
    doc.rect(M, y0, W, hH);
    doc.line(xC, y0, xC, y0 + hH); doc.line(xR, y0, xR, y0 + hH); doc.line(xR + wRl, y0, xR + wRl, y0 + hH);
    for (let i = 1; i < 4; i++) doc.line(xR, y0 + (i * hH) / 4, xR + wR, y0 + (i * hH) / 4);
    if (ctx.logo) imagenAjustada(doc, ctx.logo, 'PNG', M + 6, y0 + 4, wL - 12, hH - 8);
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('ION', M + wL / 2, y0 + hH / 2 + 3, { align: 'center' }); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5);
    doc.text(textoPdf(titulo.toUpperCase()), xC + wC / 2, y0 + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...COL.muted);
    doc.text(textoPdf(subtitulo), xC + wC / 2, y0 + 17.5, { align: 'center' });
    doc.setTextColor(...COL.ink);
    [['Código', folioTxt], ['Fecha', U.fmtFecha(ctx.fecha) || ''], ['Versión formato', version], ['Proyecto', proyTxt]].forEach((f, i) => {
      const yy = y0 + (i * hH) / 4 + hH / 8 + 1.1;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(f[0], xR + 2, yy);
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      if (i === 0 && !ctx.folio) doc.setTextColor(...COL.rojo);
      textoAjustado(doc, String(f[1]), xR + wRl + 2, yy, wR - wRl - 4, i === 0 ? 9 : 8);
      doc.setTextColor(...COL.ink);
    });
    return { doc, y: y0 + hH + 4, M, W, PW, PH: 210 };
  }

  function tabla(doc, y, M, W, titulo, head, body, columnStyles, extra) {
    doc.autoTable(Object.assign({
      startY: y, margin: { left: M, right: M, top: M + 2, bottom: 14 }, theme: 'grid', tableWidth: W,
      head: [[{ content: titulo, colSpan: head.length, styles: { fillColor: COL.ink, textColor: 255, halign: 'left', fontSize: 8 } }], head],
      body,
      styles: Object.assign({ fontSize: 7.5, cellPadding: 1.3 }, BASE),
      headStyles: { fillColor: COL.gris2, textColor: COL.ink, fontStyle: 'bold', fontSize: 7, halign: 'center', valign: 'middle', cellPadding: 0.9 },
      columnStyles: columnStyles || {},
      showHead: 'everyPage'
    }, extra || {}));
    return doc.lastAutoTable.finalY + 4;
  }

  function firmaYFotos(doc, y, M, W, PW, PH, d, ctx, nombreDoc) {
    const hF = 30, bw = (W - 4) / 2, lw = 16;
    if (y + hF + 6 > PH - 12) { doc.addPage(); y = M + 4; }
    const x = M;
    doc.setFillColor(...COL.ink); doc.rect(x, y, bw, 6, 'F');
    doc.setFillColor(...COL.gris); doc.rect(x, y + 6, lw, hF - 6, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text('REPORTADO POR', x + 2, y + 4.1);
    doc.setTextColor(...COL.ink);
    [['Nombre', d.nombre], ['Cargo', d.cargo]].forEach((f, j) => {
      const yy = y + 6 + j * 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text(f[0], x + 2, yy + 4);
      doc.setFont('helvetica', 'normal'); textoAjustado(doc, String(f[1] || ''), x + lw + 2, yy + 4, bw - lw - 4, 8);
      doc.line(x, yy + 6, x + bw, yy + 6);
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('Firma', x + 2, y + 21);
    if (d.firma && d.firma.data) imagenAjustada(doc, d.firma, 'PNG', x + lw + 3, y + 13, bw - lw - 6, hF - 14);
    doc.rect(x, y, bw, hF); doc.line(x + lw, y + 6, x + lw, y + hF);

    const fotos = d.fotos || [];
    const folioTxt = textoPdf(ctx.folio || 'BORRADOR (sin folio)');
    const proyTxt = textoPdf(`${ctx.proyecto.codigo} - ${ctx.proyecto.nombre}`);
    const cw = (W - 10) / 3, ch = (PH - 14 - (M + 10) - 5) / 2;
    for (let i = 0; i < fotos.length; i += 6) {
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('ANEXO FOTOGRÁFICO', M, M + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...COL.muted);
      doc.text(`${folioTxt} · ${proyTxt}`, PW - M, M + 5, { align: 'right' });
      doc.setTextColor(...COL.ink);
      fotos.slice(i, i + 6).forEach((f, k) => {
        const xx = M + (k % 3) * (cw + 5), yy = M + 10 + Math.floor(k / 3) * (ch + 5);
        doc.setFillColor(...COL.gris); doc.rect(xx, yy, cw, ch - 6, 'F');
        imagenAjustada(doc, f, 'JPEG', xx, yy, cw, ch - 6);
        doc.setFontSize(8); doc.text(`Foto ${i + k + 1}`, xx + cw / 2, yy + ch - 1.5, { align: 'center' });
      });
    }
    const tot = doc.getNumberOfPages(), gen = U.fmtFechaHora(ctx.generado || new Date());
    for (let pg = 1; pg <= tot; pg++) {
      doc.setPage(pg);
      if (!ctx.folio && doc.GState) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.setFont('helvetica', 'bold'); doc.setFontSize(90); doc.setTextColor(...COL.rojo);
        doc.text('BORRADOR', PW / 2, PH / 2 + 15, { align: 'center', angle: 18 });
        doc.restoreGraphicsState();
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...COL.muted);
      doc.text(`Operaciones ION · ${nombreDoc} · generado el ${gen}`, M, PH - 6);
      doc.text(folioTxt, PW / 2, PH - 6, { align: 'center' });
      doc.text(`Página ${pg} de ${tot}`, PW - M, PH - 6, { align: 'right' });
    }
    doc.setTextColor(...COL.ink);
    return doc;
  }

  // Texto para separar en el Excel (sin tabulaciones ni saltos)
  const linea = (s) => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').trim().slice(0, 500);

  OPS.avance = { n0, esGl, fmt, itemsObra, itemsOficina, agrupar, filtroHtml, listaHtml, aplicarFiltro, limpiar, textoPdf, nuevoDoc, tabla, firmaYFotos, COL, linea };
})();
