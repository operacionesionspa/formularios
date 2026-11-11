/**
 * =====================================================================
 *  OPERACIONES ION · Script de Google (recibe los envíos de la app)
 * =====================================================================
 *  Dónde va: en la planilla de Google de Operaciones →
 *            Extensiones → Apps Script → reemplazar todo por este archivo.
 *  Instalación completa: ver README.md del repositorio.
 *
 *  Qué hace con cada envío:
 *   1. Verifica el proyecto y su clave (pestaña "Proyectos").
 *   2. Asigna un folio correlativo por proyecto: CAL26-SM-0001, CAL26-SM-0002…
 *   3. Escribe una fila por documento y una fila por ítem en la planilla.
 *   4. Guarda el PDF en Drive: Operaciones ION - Documentos / <Proyecto> / <Documento>.
 *   5. Envía el PDF por correo a los correos del proyecto (y copia al solicitante).
 *
 *  Reportes de avance (desde la versión 1.1):
 *   - El Excel de control publica la lista de actividades del proyecto
 *     (acción "catalogo") y la app la descarga (acción "catalogo_get").
 *   - Cada reporte diario (obra) y de gestión (oficina) agrega líneas con un
 *     ID correlativo en la pestaña "Avance_Lineas".
 *   - El Excel lee las líneas nuevas con:
 *       <URL>/exec?accion=avance&proyecto=CAL26&clave=...&desde=<último ID>
 *
 *  Tablero de programa (desde la versión 1.2):
 *   - El Excel publica la Gantt interna SIN COSTOS (acción "gantt", con clave).
 *   - El tablero web la lee sin clave: <URL>/exec?accion=gantt&proyecto=CAL26
 * =====================================================================
 */

var VERSION_SCRIPT = '1.2.0';
var HOJA_AVANCE = 'Avance_Lineas';
var MAX_LINEAS = 1500;
var HOJA_PROYECTOS = 'Proyectos';
var HOJA_FOLIOS = '_Folios';
var NOMBRE_CARPETA_RAIZ = 'Operaciones ION - Documentos';
var MAX_PDF_MB = 20;
var COLUMNAS_RESERVADAS = ['Folio', 'Registrado el', 'Proyecto', 'Nombre proyecto', 'PDF'];
var PROYECTOS_INICIALES = [
  ['CAL26', 'PMG Caliche'],
  ['AQA26', 'PFV Aquanqa'],
  ['SCB25', 'PMGD SCB']
];

/* ============================ menú de la planilla ============================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Operaciones ION')
    .addItem('1. Configurar planilla (primera vez)', 'configurar')
    .addItem('2. Enviarme un correo de prueba', 'probarCorreo')
    .addToUi();
}

function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('America/Santiago');
  hojaProyectos_();
  hojaFolios_();
  var carpeta = carpetaRaiz_();
  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
  });
  avisar_('Planilla configurada.\n\n' +
    '1) En la pestaña "Proyectos", complete la clave y los correos de cada proyecto.\n' +
    '2) Publique el script: Implementar → Nueva implementación → Aplicación web ' +
    '(Ejecutar como: Yo · Quién tiene acceso: Cualquier persona).\n\n' +
    'Los PDF se guardarán en la carpeta de Drive "' + carpeta.getName() + '".');
}

function probarCorreo() {
  var yo = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(yo, 'Prueba · Operaciones ION', 'El script puede enviar correos. Cupo restante hoy: ' + MailApp.getRemainingDailyQuota());
  avisar_('Correo de prueba enviado a ' + yo + '.');
}

/* ============================ entrada web ============================ */
function doGet(e) {
  var prm = (e && e.parameter) || {};
  if (prm.accion === 'avance') return salidaAvance_(prm);
  if (prm.accion === 'gantt') return salidaGantt_(prm);
  return salida_({ ok: true, app: 'Operaciones ION', version: VERSION_SCRIPT, mensaje: 'El script está publicado correctamente.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return salida_({ ok: false, codigo: 'formato', error: 'Solicitud no válida.' });
  }
  try {
    switch (req.action || req.accion) {
      case 'ping': return salida_({ ok: true, version: VERSION_SCRIPT });
      case 'validar': proyectoAutorizado_(req); return salida_({ ok: true });
      case 'folio': return salida_(accionFolio_(req));
      case 'enviar': return salida_(accionEnviar_(req));
      case 'catalogo': return salida_(accionCatalogo_(req));
      case 'catalogo_get': return salida_(accionCatalogoGet_(req));
      case 'gantt': return salida_(accionGantt_(req));
      default: return salida_({ ok: false, codigo: 'accion', error: 'Acción desconocida.' });
    }
  } catch (err) {
    if (err && err.codigo) return salida_({ ok: false, codigo: err.codigo, error: err.message });
    console.error(err && err.stack ? err.stack : err);
    return salida_({ ok: false, codigo: 'servidor', error: 'Error en el servidor: ' + (err && err.message ? err.message : err) });
  }
}

/* ============================ acciones ============================ */
function accionFolio_(req) {
  var p = proyectoAutorizado_(req);
  var tipo = texto_(req.tipo, 4).toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(tipo)) throw errorApp_('formato', 'Tipo de documento no válido.');
  var uid = texto_(req.uid, 64);
  if (!/^[\w-]{8,64}$/.test(uid)) throw errorApp_('formato', 'Identificador de envío no válido.');
  var lock = tomarLock_();
  try {
    var hf = hojaFolios_();
    var filas = hf.getLastRow() > 1 ? hf.getRange(2, 1, hf.getLastRow() - 1, 5).getValues() : [];
    var max = 0;
    for (var i = 0; i < filas.length; i++) {
      if (String(filas[i][0]) === uid) return { ok: true, folio: String(filas[i][1]) }; // reintento del mismo envío
      if (filas[i][2] === p.codigo && filas[i][3] === tipo) max = Math.max(max, Number(filas[i][4]) || 0);
    }
    var n = max + 1;
    var folio = p.codigo + '-' + tipo + '-' + ('000' + n).slice(-4);
    hf.appendRow([uid, folio, p.codigo, tipo, n, new Date()]);
    return { ok: true, folio: folio };
  } finally {
    lock.releaseLock();
  }
}

function accionEnviar_(req) {
  var p = proyectoAutorizado_(req);
  var uid = texto_(req.uid, 64);
  var folio = texto_(req.folio, 40);
  var tipoNombre = texto_(req.tipoNombre, 60) || 'Documento';
  if (!/^[\wÁÉÍÓÚÑáéíóúñ .-]{1,60}$/.test(tipoNombre)) throw errorApp_('formato', 'Nombre de documento no válido.');
  var resumen = validarTabla_(req.resumen, false);
  var detalle = req.detalle ? validarTabla_(req.detalle, true) : null;
  if (typeof req.pdf !== 'string' || req.pdf.length < 100) throw errorApp_('formato', 'Falta el PDF.');
  if (req.pdf.length > MAX_PDF_MB * 1.37 * 1024 * 1024) throw errorApp_('formato', 'El PDF supera ' + MAX_PDF_MB + ' MB.');

  var lock = tomarLock_();
  try {
    // El folio tiene que haber sido emitido para este mismo envío.
    var hf = hojaFolios_();
    var emitidos = hf.getLastRow() > 1 ? hf.getRange(2, 1, hf.getLastRow() - 1, 3).getValues() : [];
    var valido = emitidos.some(function (f) { return String(f[0]) === uid && String(f[1]) === folio && String(f[2]) === p.codigo; });
    if (!valido) throw errorApp_('folio', 'El folio no corresponde a este envío.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hr = ss.getSheetByName(tipoNombre) || ss.insertSheet(tipoNombre);
    var mapaR = asegurarEncabezados_(hr, ['Folio', 'Registrado el', 'Proyecto', 'Nombre proyecto']
      .concat(resumen.cols.map(function (c) { return c.l; }), ['PDF']));

    // ¿Ya estaba registrado? (la respuesta anterior no alcanzó a llegar al teléfono)
    if (hr.getLastRow() > 1) {
      var folios = hr.getRange(2, mapaR['Folio'], hr.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < folios.length; i++) {
        if (String(folios[i][0]) === folio) return { ok: true, folio: folio, duplicado: true, notificados: 0 };
      }
    }

    // 1) PDF en Drive
    var carpeta = carpetaDocumento_(p, tipoNombre);
    var nombrePdf = /^[\w.-]{5,120}\.pdf$/.test(String(req.pdfNombre || '')) && String(req.pdfNombre).indexOf(folio) === 0
      ? String(req.pdfNombre) : folio + '.pdf';
    var previos = carpeta.getFilesByName(nombrePdf);
    while (previos.hasNext()) previos.next().setTrashed(true);
    var blob = Utilities.newBlob(Utilities.base64Decode(req.pdf), 'application/pdf', nombrePdf);
    var archivo = carpeta.createFile(blob);
    var pdfUrl = archivo.getUrl();

    // 2) Filas de detalle (una por ítem)
    if (detalle && detalle.filas.length) {
      var nombreDetalle = (tipoNombre + ' - Ítems').slice(0, 90);
      var hd = ss.getSheetByName(nombreDetalle) || ss.insertSheet(nombreDetalle);
      var mapaD = asegurarEncabezados_(hd, ['Folio', 'Proyecto'].concat(detalle.cols.map(function (c) { return c.l; })));
      var filasD = detalle.filas.map(function (f) {
        var o = { 'Folio': folio, 'Proyecto': p.codigo };
        detalle.cols.forEach(function (c) { o[c.l] = valorCelda_(c, f[c.k]); });
        return o;
      });
      escribirFilas_(hd, mapaD, filasD, detalle.cols);
    }

    // 3) Fila de resumen (se escribe al final: si existe, el envío está completo)
    var o = { 'Folio': folio, 'Registrado el': new Date(), 'Proyecto': p.codigo, 'Nombre proyecto': p.nombre };
    resumen.cols.forEach(function (c) { o[c.l] = valorCelda_(c, resumen.fila[c.k]); });
    var fila = escribirFilas_(hr, mapaR, [o], resumen.cols.concat([{ l: 'Registrado el', fmt: 'dd-mm-yyyy hh:mm' }]));
    hr.getRange(fila, mapaR['PDF']).setRichTextValue(
      SpreadsheetApp.newRichTextValue().setText('Ver PDF').setLinkUrl(pdfUrl).build());

    // 3b) Líneas de avance para el Excel de control (reporte diario / gestión)
    if (Array.isArray(req.avance) && req.avance.length) escribirAvance_(p, folio, req.avance);

    // 4) Correo
    var aviso = '', notificados = 0;
    var para = p.correos;
    var copia = listaCorreos_(req.correoCopia).slice(0, 1);
    if (para.length || copia.length) {
      try {
        var total = para.length + copia.length;
        if (MailApp.getRemainingDailyQuota() < total) {
          aviso = 'Quedó registrado, pero hoy ya se alcanzó el límite de correos de Google.';
        } else {
          var asunto = '[' + p.codigo + '] ' + tipoNombre + ' ' + folio + (req.asunto ? ' · ' + texto_(req.asunto, 120) : '');
          MailApp.sendEmail({
            to: (para.length ? para : copia).join(','),
            cc: para.length ? copia.join(',') : '',
            subject: asunto,
            htmlBody: correoHtml_(p, tipoNombre, folio, resumen, detalle, pdfUrl, ss.getUrl()),
            name: 'Operaciones ION',
            attachments: [blob]
          });
          notificados = total;
        }
      } catch (err) {
        console.error(err);
        aviso = 'Quedó registrado, pero no se pudo enviar el correo.';
      }
    }
    return { ok: true, folio: folio, pdfUrl: pdfUrl, notificados: notificados, aviso: aviso };
  } finally {
    lock.releaseLock();
  }
}

/* ============================ reportes de avance ============================ */
// Lista de actividades publicada por el Excel de control (una por proyecto, en Drive).
function archivoCatalogo_(codigo, crear) {
  var carpeta = carpetaRaiz_();
  var nombre = 'catalogo_' + codigo + '.json';
  var it = carpeta.getFilesByName(nombre);
  if (it.hasNext()) return it.next();
  return crear ? carpeta.createFile(nombre, '{}', 'application/json') : null;
}

function accionCatalogo_(req) {
  var p = proyectoAutorizado_(req);
  if (!Array.isArray(req.items) || !req.items.length) throw errorApp_('formato', 'La lista de actividades viene vacía.');
  if (req.items.length > 5000) throw errorApp_('formato', 'La lista de actividades es demasiado grande.');
  var items = req.items.map(function (x) {
    x = x || {};
    var num = function (v) { var n = Number(v); return v === null || v === '' || !isFinite(n) ? null : n; };
    return {
      id: texto_(x.id, 40), nivel: Number(x.nivel) || 0, cuenta: texto_(x.cuenta, 20), partida: texto_(x.partida, 120),
      tipo: texto_(x.tipo, 40), etapa: texto_(x.etapa, 80), nombre: texto_(x.nombre, 160), unidad: texto_(x.unidad, 20),
      total: num(x.total), acumulado: num(x.acumulado), avance: num(x.avance), inicioPlan: texto_(x.inicioPlan, 10), finPlan: texto_(x.finPlan, 10),
      reporta: texto_(x.reporta, 20), disciplina: texto_(x.disciplina, 80)
    };
  }).filter(function (x) { return x.id; });
  var empresas = Array.isArray(req.empresas) ? req.empresas.slice(0, 200).map(function (e) { return texto_(e, 120); }).filter(function (e) { return e; }) : [];
  var cat = { proyecto: p.codigo, generado: texto_(req.generado, 20), recibido: new Date().toISOString(), items: items, empresas: empresas };
  var lock = tomarLock_();
  try {
    archivoCatalogo_(p.codigo, true).setContent(JSON.stringify(cat));
  } finally {
    lock.releaseLock();
  }
  return { ok: true, n: items.length };
}

function accionCatalogoGet_(req) {
  var p = proyectoAutorizado_(req);
  var f = archivoCatalogo_(p.codigo, false);
  var cat = null;
  if (f) { try { cat = JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (err) { cat = null; } }
  if (!cat || !Array.isArray(cat.items) || !cat.items.length) {
    throw errorApp_('catalogo', 'Todavía no hay lista de actividades para ' + p.codigo + '. Publíquela desde el Excel de control (botón "Publicar lista de actividades").');
  }
  return { ok: true, catalogo: cat };
}

function hojaAvance_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJA_AVANCE);
  if (h) return h;
  h = ss.insertSheet(HOJA_AVANCE);
  h.getRange(1, 1, 1, 13).setValues([['ID línea', 'Proyecto', 'Folio', 'Fecha', 'Origen', 'ID ítem', 'Cantidad del día', '% acumulado',
    'Listo', 'Fecha real', 'Comentario', 'Reportado por', 'Registrado el']]);
  h.getRange(1, 6, 5000, 1).setNumberFormat('@');
  formatoEncabezado_(h, 13);
  return h;
}

// Se llama dentro del lock de accionEnviar_
function escribirAvance_(p, folio, lineas) {
  if (lineas.length > MAX_LINEAS) throw errorApp_('formato', 'Demasiadas líneas de avance.');
  var h = hojaAvance_();
  var ult = h.getLastRow();
  var id = ult > 1 ? Number(h.getRange(ult, 1).getValue()) || 0 : 0;
  var limpio = function (v, max) { var s = texto_(v, max).replace(/[\t\r\n]+/g, ' '); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  var numero = function (v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? '' : n; };
  var fecha = function (v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? m[0] : ''; };
  var ahora = new Date();
  var filas = lineas.map(function (x) {
    x = x || {};
    id++;
    return [id, p.codigo, folio, fecha(x.fecha), limpio(x.origen, 20), limpio(x.item, 120), numero(x.cantidad), numero(x.pct),
      String(x.listo || '').trim().toUpperCase().indexOf('S') === 0 ? 'Sí' : '', fecha(x.fechaReal), limpio(x.comentario, 500), limpio(x.autor, 80), ahora];
  });
  h.getRange(ult + 1, 1, filas.length, 13).setValues(filas);
}

// Respuesta para el Excel: texto separado por tabulaciones
function salidaAvance_(prm) {
  var txt;
  try {
    var p = proyectoAutorizado_({ proyecto: prm.proyecto, clave: prm.clave });
    var desde = Number(prm.desde) || 0;
    var h = hojaAvance_();
    var n = h.getLastRow() - 1;
    var datos = n > 0 ? h.getRange(2, 1, n, 13).getValues() : [];
    var tz = Session.getScriptTimeZone() || 'America/Santiago';
    var f = function (v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v || ''); };
    var s = function (v) { return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' '); };
    var out = ['OK', ['ID', 'Folio', 'Fecha', 'Origen', 'ID item', 'Cantidad', 'Pct', 'Listo', 'Fecha real', 'Comentario', 'Autor'].join('\t')];
    datos.forEach(function (r) {
      if (Number(r[0]) > desde && String(r[1]) === p.codigo) {
        out.push([r[0], s(r[2]), f(r[3]), s(r[4]), s(r[5]), s(r[6]), s(r[7]), s(r[8]), f(r[9]), s(r[10]), s(r[11])].join('\t'));
      }
    });
    txt = out.join('\n');
  } catch (err) {
    txt = 'ERROR\t' + (err && err.message ? err.message : err);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.TEXT);
}

/* ============================ tablero de programa (Gantt sin costos) ============================ */
var COLUMNAS_GANTT = ['id', 'niv', 'nombre', 'cuenta', 'tipo', 'prov', 'area', 'disc', 'unid', 'cant', 'ejec', 'aplica',
  'ini', 'fin', 'iniR', 'finR', 'pct', 'lbIni', 'lbFin', 'desv', 'alerta'];

function archivoGantt_(codigo, crear) {
  var carpeta = carpetaRaiz_();
  var nombre = 'gantt_' + codigo + '.json';
  var it = carpeta.getFilesByName(nombre);
  if (it.hasNext()) return it.next();
  return crear ? carpeta.createFile(nombre, '{}', 'application/json') : null;
}

function accionGantt_(req) {
  var p = proyectoAutorizado_(req);
  var d = req.data || {};
  if (!Array.isArray(d.cols) || !Array.isArray(d.filas) || !d.filas.length) throw errorApp_('formato', 'La Gantt viene vacía.');
  if (d.filas.length > 6000) throw errorApp_('formato', 'La Gantt es demasiado grande.');
  // solo se guardan las columnas permitidas (nunca costos)
  var idx = COLUMNAS_GANTT.map(function (c) { return d.cols.indexOf(c); });
  var filas = d.filas.map(function (f) {
    return idx.map(function (i) {
      var v = i < 0 || !Array.isArray(f) ? null : f[i];
      return typeof v === 'number' ? (isFinite(v) ? v : null) : (v === null || v === undefined ? null : String(v).slice(0, 200));
    });
  });
  var num = function (v) { var n = Number(v); return v === null || v === '' || !isFinite(n) ? null : n; };
  var av = d.avance || {};
  var g = {
    proyecto: p.codigo, nombre: p.nombre, generado: texto_(d.generado, 20), corte: texto_(d.corte, 10), recibido: new Date().toISOString(),
    avance: { lntp: num(av.lntp), ntp: num(av.ntp), total: num(av.total) }, cols: COLUMNAS_GANTT, filas: filas
  };
  var lock = tomarLock_();
  try {
    archivoGantt_(p.codigo, true).setContent(JSON.stringify(g));
  } finally {
    lock.releaseLock();
  }
  return { ok: true, n: filas.length };
}

function salidaGantt_(prm) {
  var codigo = texto_(prm.proyecto, 20).toUpperCase();
  var f = archivoGantt_(codigo, false);
  if (!f) return salida_({ ok: false, codigo: 'gantt', error: 'Todavía no hay Gantt publicada para ' + codigo + '.' });
  return ContentService.createTextOutput('{"ok":true,"gantt":' + f.getBlob().getDataAsString('UTF-8') + '}').setMimeType(ContentService.MimeType.JSON);
}


/* ============================ proyectos y folios ============================ */
function proyectoAutorizado_(req) {
  var codigo = texto_(req.proyecto, 20).toUpperCase();
  var hp = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_PROYECTOS);
  if (!hp) throw errorApp_('config', 'La planilla no está configurada (menú Operaciones ION → Configurar planilla).');
  var filas = hp.getDataRange().getValues();
  for (var i = 1; i < filas.length; i++) {
    var f = filas[i];
    if (String(f[0]).trim().toUpperCase() !== codigo) continue;
    if (String(f[4]).trim().toUpperCase() === 'NO') throw errorApp_('proyecto', 'El proyecto ' + codigo + ' no está recibiendo documentos.');
    var clave = String(f[2]).trim();
    if (clave && clave !== texto_(req.clave, 100)) throw errorApp_('clave', 'La clave del proyecto no es correcta.');
    return { codigo: codigo, nombre: String(f[1]).trim(), correos: listaCorreos_(f[3]) };
  }
  throw errorApp_('proyecto', 'El proyecto ' + (codigo || '(vacío)') + ' no está registrado en la planilla.');
}

function hojaProyectos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hp = ss.getSheetByName(HOJA_PROYECTOS);
  if (hp) return hp;
  hp = ss.insertSheet(HOJA_PROYECTOS, 0);
  hp.getRange(1, 1, 1, 5).setValues([['Código', 'Nombre', 'Clave', 'Correos a notificar', 'Activo']]);
  hp.getRange(2, 1, PROYECTOS_INICIALES.length, 5).setValues(PROYECTOS_INICIALES.map(function (p) { return [p[0], p[1], '', '', 'SI']; }));
  hp.getRange(1, 3, PROYECTOS_INICIALES.length + 50, 1).setNumberFormat('@');
  formatoEncabezado_(hp, 5);
  hp.getRange(1, 3).setNote('Clave que la app pide la primera vez en cada teléfono. Si se deja vacía, el proyecto no pide clave.');
  hp.getRange(1, 4).setNote('Correos que reciben cada documento con el PDF adjunto. Separe varios con coma.');
  hp.getRange(1, 5).setNote('SI = acepta envíos. NO = los rechaza. No cambie el orden de estas columnas.');
  hp.setColumnWidth(2, 180);
  hp.setColumnWidth(4, 340);
  return hp;
}

function hojaFolios_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hf = ss.getSheetByName(HOJA_FOLIOS);
  if (hf) return hf;
  hf = ss.insertSheet(HOJA_FOLIOS);
  hf.getRange(1, 1, 1, 6).setValues([['UID', 'Folio', 'Proyecto', 'Tipo', 'N°', 'Fecha']]);
  hf.getRange(1, 1, 2000, 2).setNumberFormat('@');
  formatoEncabezado_(hf, 6);
  hf.hideSheet();
  return hf;
}

/* ============================ Drive ============================ */
function carpetaRaiz_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARPETA_RAIZ');
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* se crea de nuevo */ }
  }
  var nueva = DriveApp.createFolder(NOMBRE_CARPETA_RAIZ);
  props.setProperty('CARPETA_RAIZ', nueva.getId());
  return nueva;
}

function subcarpeta_(padre, nombre, prefijo) {
  var it = padre.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (n === nombre || (prefijo && n.indexOf(prefijo) === 0)) return f;
  }
  return padre.createFolder(nombre);
}

function carpetaDocumento_(p, tipoNombre) {
  var proyecto = subcarpeta_(carpetaRaiz_(), p.codigo + ' - ' + p.nombre, p.codigo + ' ');
  return subcarpeta_(proyecto, tipoNombre);
}

/* ============================ planilla ============================ */
function asegurarEncabezados_(hoja, etiquetas) {
  var n = hoja.getLastColumn();
  var actuales = n ? hoja.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
  var faltan = etiquetas.filter(function (e) { return actuales.indexOf(e) < 0; });
  if (faltan.length) {
    hoja.getRange(1, actuales.length + 1, 1, faltan.length).setValues([faltan]);
    actuales = actuales.concat(faltan);
    formatoEncabezado_(hoja, actuales.length);
  }
  var mapa = {};
  actuales.forEach(function (e, i) { if (e && !mapa[e]) mapa[e] = i + 1; });
  return mapa;
}

function escribirFilas_(hoja, mapa, filas, defs) {
  var ancho = 0;
  Object.keys(mapa).forEach(function (k) { ancho = Math.max(ancho, mapa[k]); });
  var inicio = hoja.getLastRow() + 1;
  var matriz = filas.map(function (f) {
    var r = [];
    for (var i = 0; i < ancho; i++) r.push('');
    Object.keys(f).forEach(function (et) { if (mapa[et]) r[mapa[et] - 1] = f[et]; });
    return r;
  });
  hoja.getRange(inicio, 1, matriz.length, ancho).setValues(matriz);
  defs.forEach(function (c) {
    var col = mapa[c.l];
    if (!col) return;
    var rango = hoja.getRange(inicio, col, matriz.length, 1);
    var fmt = c.t === 'fecha' ? 'dd-mm-yyyy' : c.fmt;
    if (fmt) rango.setNumberFormat(fmt);
    if (c.opciones && c.opciones.length) {
      rango.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(c.opciones, true).setAllowInvalid(false).build());
    }
  });
  return inicio;
}

function formatoEncabezado_(hoja, n) {
  var r = hoja.getRange(1, 1, 1, n);
  r.setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff').setWrap(true);
  hoja.setFrozenRows(1);
}

function valorCelda_(c, v) {
  if (v === undefined || v === null || v === '') return c.defecto || '';
  if (c.t === 'fecha') {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : '';
  }
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  var s = String(v).slice(0, 5000);
  // Evita que un texto que parte con = + - @ se interprete como fórmula.
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function validarTabla_(t, multiple) {
  if (!t || !Array.isArray(t.cols) || t.cols.length > 60) throw errorApp_('formato', 'Datos incompletos.');
  var cols = t.cols.map(function (c) {
    c = c || {};
    return {
      k: texto_(c.k, 40), l: texto_(c.l, 80), t: c.t === 'fecha' ? 'fecha' : '',
      fmt: /^[0#.,%]{1,10}$/.test(String(c.fmt || '')) ? c.fmt : '',
      opciones: Array.isArray(c.opciones) ? c.opciones.slice(0, 30).map(function (o) { return texto_(o, 60); }) : null,
      defecto: texto_(c.defecto, 60), oficina: !!c.oficina, correo: !!c.correo
    };
  }).filter(function (c) { return c.k && c.l && COLUMNAS_RESERVADAS.indexOf(c.l) < 0; });
  if (multiple) {
    if (!Array.isArray(t.filas) || t.filas.length > 300) throw errorApp_('formato', 'Demasiados ítems.');
    return { cols: cols, filas: t.filas.map(function (f) { return f && typeof f === 'object' ? f : {}; }) };
  }
  return { cols: cols, fila: t.fila && typeof t.fila === 'object' ? t.fila : {} };
}

/* ============================ correo ============================ */
function correoHtml_(p, tipoNombre, folio, resumen, detalle, pdfUrl, planillaUrl) {
  var h = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;max-width:760px">';
  h += '<h2 style="margin:0 0 2px">' + esc_(tipoNombre) + ' ' + esc_(folio) + '</h2>';
  h += '<p style="margin:0 0 14px;color:#6b7280">' + esc_(p.codigo) + ' · ' + esc_(p.nombre) + '</p>';
  h += '<table cellpadding="4" style="border-collapse:collapse;font-size:13px;margin-bottom:14px">';
  resumen.cols.forEach(function (c) {
    if (c.oficina) return;
    var v = formatoCorreo_(c, resumen.fila[c.k]);
    if (v === '') return;
    h += '<tr><td style="color:#6b7280;padding-right:14px;vertical-align:top">' + esc_(c.l) + '</td><td style="white-space:pre-wrap"><b>' + esc_(v) + '</b></td></tr>';
  });
  h += '</table>';
  if (detalle && detalle.filas.length) {
    var cols = detalle.cols.filter(function (c) { return c.correo; });
    h += '<table cellpadding="5" style="border-collapse:collapse;font-size:12.5px;border:1px solid #e2e4e8">';
    h += '<tr style="background:#f0f1f4">' + cols.map(function (c) { return '<th style="text-align:left;border:1px solid #e2e4e8">' + esc_(c.l) + '</th>'; }).join('') + '</tr>';
    detalle.filas.forEach(function (f) {
      h += '<tr>' + cols.map(function (c) { return '<td style="border:1px solid #e2e4e8">' + esc_(formatoCorreo_(c, f[c.k])) + '</td>'; }).join('') + '</tr>';
    });
    h += '</table>';
  }
  h += '<p style="margin-top:16px">El PDF va adjunto. ' +
    '<a href="' + esc_(pdfUrl) + '">Ver en Drive</a> · <a href="' + esc_(planillaUrl) + '">Abrir planilla</a> ' +
    '<span style="color:#6b7280">(los enlaces requieren acceso a la cuenta de Operaciones)</span></p>';
  h += '<p style="color:#9ca3af;font-size:12px">Enviado automáticamente por la app Operaciones ION.</p></div>';
  return h;
}

function formatoCorreo_(c, v) {
  if (v === undefined || v === null || v === '') return '';
  if (c.t === 'fecha') { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v)); return m ? m[3] + '-' + m[2] + '-' + m[1] : String(v); }
  if (typeof v === 'number') {
    if (c.fmt && c.fmt.indexOf('%') >= 0) return String(Math.round(v * 1000) / 10).replace('.', ',') + ' %';
    return String(Math.round(v * 100) / 100).replace('.', ',');
  }
  return String(v).slice(0, 2000);
}

/* ============================ utilidades ============================ */
function salida_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function errorApp_(codigo, mensaje) {
  var e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

function tomarLock_() {
  var l = LockService.getScriptLock();
  if (!l.tryLock(30000)) throw errorApp_('ocupado', 'El servidor está ocupado. Se reintentará en unos minutos.');
  return l;
}

function texto_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max);
}

function listaCorreos_(v) {
  return String(v || '').split(/[,;\s]+/).map(function (s) { return s.trim(); })
    .filter(function (s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); });
}

function esc_(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function avisar_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { Logger.log(msg); }
}
