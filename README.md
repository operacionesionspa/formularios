# Operaciones ION · Formularios de obra

App web para que el equipo en terreno complete documentos de Operaciones desde el teléfono, sin instalar nada.
Primer documento: **Solicitud de materiales y herramientas** (basado en el formato `SIE25-000-Formato_solicitud_materiales_v0.xlsx`, Rev. 0, 24-10-2025).

**Cómo funciona:**

1. La persona elige su **proyecto** (CAL26, AQA26 o SCB25) y luego el documento.
2. Completa el formulario por pasos y firma en la pantalla.
3. Al enviar, la app genera el PDF con el formato oficial y lo manda a un **script de Google**. El script:
   - asigna un folio correlativo por proyecto (`CAL26-SM-0001`);
   - registra los datos en una **planilla de Google**;
   - guarda el PDF en **Drive**;
   - envía el PDF por correo al equipo del proyecto.
4. **Sin señal:** el documento queda guardado en el teléfono y se envía solo cuando vuelve la conexión, con la app abierta.

```
Teléfono (GitHub Pages) ──► Script de Google ──► Planilla "BD Operaciones ION"
                                     ├──► Drive: Operaciones ION - Documentos / CAL26 - PMG Caliche / Solicitud de materiales / CAL26-SM-0001.pdf
                                     └──► Correo al PM / Ing. de Proyecto (PDF adjunto)
```

Este repositorio es independiente de la plataforma de HSEQ y no comparte código ni cuentas con ella.

---

## Estructura

| Archivo | Para qué sirve | ¿Se edita? |
|---|---|---|
| `js/config.js` | URL del script, proyectos, feriados | **Sí, es el archivo de configuración** |
| `js/forms/solicitud-materiales.js` | Campos, listas (categorías, unidades…), cálculos y PDF de la solicitud | Cuando cambie el formato |
| `js/forms/reporte-diario.js`, `avance-oficina.js`, `avance-comun.js` | Reportes de avance de obra y de oficina (ver al final) | Para cambiar listas (clima, especialidades, equipos) |
| `js/app.js` | Motor de la app (navegación, validación, firma, fotos, envíos, modo sin señal) | No |
| `apps-script/Codigo.gs` | Script que va en la planilla de Google | Se pega en Google, no se publica en GitHub |
| `css/`, `img/`, `vendor/` | Estilos, logo/íconos y librería de PDF (jsPDF) | Solo el logo, si quiere reemplazarlo |
| `sw.js`, `manifest.webmanifest` | Funcionamiento sin señal e instalación como app | Solo al agregar archivos nuevos |

---

## Puesta en marcha (una sola vez, ~30 minutos)

### 1. Cuenta de Google de Operaciones

La cuenta del área es **`operacionesionspa@gmail.com`** (dueña de la planilla, el script y la carpeta de Drive). No use una cuenta personal. Así la información no depende de una persona.

### 2. Planilla y script

1. En esa cuenta, cree una planilla de Google llamada **BD Operaciones ION**.
2. Abra **Extensiones → Apps Script**. Borre lo que aparece, pegue todo el contenido de `apps-script/Codigo.gs` y guarde (💾).
3. Vuelva a la planilla y recárguela. Aparece el menú **Operaciones ION**. Elija **1. Configurar planilla (primera vez)**.
   - Google pedirá autorización. Si muestra "Google no ha verificado esta app", haga clic en **Configuración avanzada → Ir a … (no seguro)**. Es normal: el script es propio de la cuenta.
   - Se crean la pestaña **Proyectos**, una pestaña oculta de folios y la carpeta de Drive **Operaciones ION - Documentos**.
4. En la pestaña **Proyectos**, complete por proyecto:
   - **Clave:** la que el equipo de obra ingresa una sola vez en su teléfono. Si queda vacía, ese proyecto no pide clave.
   - **Correos a notificar:** separados por coma.
   - **Activo:** `SI` o `NO`.
5. En Apps Script, vaya a **Implementar → Nueva implementación**:
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona**.
   - Haga clic en **Implementar** y copie la **URL de la aplicación web** (termina en `/exec`).
6. Para probar, abra esa URL en el navegador. Debe aparecer `{"ok":true,"app":"Operaciones ION",…}`.
7. Opcional: con el menú **Operaciones ION → 2. Enviarme un correo de prueba** confirma que el envío de correos funciona.

### 3. Repositorio y página en GitHub

1. Cree una **cuenta nueva de GitHub** para Operaciones (por ejemplo, `operaciones-ion`) con el correo del área.
2. Cree un repositorio nuevo, **público**, por ejemplo `formularios`.
3. Haga clic en **Add file → Upload files** y arrastre **el contenido** de esta carpeta: los archivos y subcarpetas, no la carpeta misma. Luego haga clic en **Commit changes**.
4. En **Settings → Pages**, en *Build and deployment*, elija **Deploy from a branch**, rama `main`, carpeta `/ (root)` y haga clic en **Save**.
   En 1 o 2 minutos la app queda en `https://operaciones-ion.github.io/formularios/`.
5. En GitHub, abra `js/config.js`, haga clic en el lápiz, pegue la URL del paso 2.5 en `endpoint: '…'` y haga clic en **Commit changes**.

> Mientras `endpoint` esté vacío, la app funciona en **modo demostración**: genera el PDF en el teléfono, pero no registra nada. Sirve para mostrarla antes de conectar Google.

### 4. Prueba completa

Abra la página en el teléfono, elija un proyecto, ingrese su clave y envíe una solicitud de prueba. Revise:

- la fila en la pestaña **Solicitud de materiales** y una fila por material en **Solicitud de materiales - Ítems**;
- el PDF en Drive;
- el correo con el PDF adjunto.

### 5. Instalar en el teléfono (recomendado)

- **Android (Chrome):** menú ⋮ → *Agregar a la pantalla principal* o *Instalar app*.
- **iPhone (Safari):** botón Compartir → *Agregar a inicio*.

Queda como un ícono más y se abre aunque no haya señal.

---

## Para la oficina (PM / Ing. de Proyecto)

- **Pestaña `Solicitud de materiales`:** una fila por solicitud, con enlace al PDF y columnas de oficina (Estado, Revisado por, Aprobado por).
- **Pestaña `Solicitud de materiales - Ítems`:** una fila por material. La oficina completa **Cantidad aprobada**, **Estado** (lista: Pendiente / Aprobado / Aprobado parcial / Rechazado) y **Comentario oficina**. Use filtros por proyecto, categoría o estado.
- **Folios:** `CÓDIGO-SM-0001`, correlativos por proyecto. Nunca se repiten. Si un envío se reintenta, no se duplica.
- **Comparación con el Excel:** las fórmulas son las mismas (Cantidad total, % extra, Días hábiles de plazo, A TIEMPO / FUERA DE PLAZO). Hay dos diferencias:
  - el plazo descuenta los **feriados de Chile**;
  - la app **no deja enviar** materiales sin justificación de cantidad, ni cantidad extra sin justificar.

## Mantenimiento

| Necesito… | Qué hacer |
|---|---|
| Agregar un proyecto | Agregarlo en `js/config.js` (lista `proyectos`) **y** en la pestaña **Proyectos** de la planilla |
| Cambiar una clave | Pestaña **Proyectos**. La app la pedirá de nuevo en el próximo envío |
| Dejar de recibir de un proyecto | Pestaña **Proyectos** → Activo = `NO` |
| Cambiar categorías, subcategorías, unidades o plazo mínimo | Inicio de `js/forms/solicitud-materiales.js` (sección LISTAS) |
| Actualizar feriados | `js/config.js`, lista `feriados`, una vez al año |
| Cambiar el script de Google | Pegar los cambios y luego **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así se mantiene la misma URL |
| Reemplazar el logo | Subir otro `img/logo-ion.png` con el mismo nombre |

Los teléfonos reciben las actualizaciones de la app al abrirla con señal. Si agrega archivos nuevos, súmelos a la lista `ARCHIVOS` de `sw.js` y cambie `VERSION`.

## Agregar un documento nuevo (reporte diario, reporte flash…)

1. Copie `js/forms/solicitud-materiales.js` con otro nombre y ajuste:
   - `id`, `tipo` (prefijo del folio, por ejemplo `RD`), `nombre`, `pasos` (campos), `registro` (columnas de la planilla) y `pdf`.
2. Agregue el archivo en `index.html` (junto al de solicitud de materiales) y en `sw.js`.
3. Quítelo de la lista `proximos` en `js/config.js`.

No hay que tocar el script de Google: crea solo las pestañas y columnas nuevas.

## Seguridad y límites

- **El repositorio es público** (requisito de GitHub Pages gratis). Aquí no hay datos ni claves; los datos viven solo en la planilla y en Drive de la cuenta de Operaciones.
- **La URL del script queda visible en el código.** Por eso cada proyecto tiene clave, y el script rechaza envíos sin clave válida, proyectos inactivos y folios que no emitió.
- **Correos:** una cuenta Gmail normal puede enviar a 100 destinatarios por día; con Google Workspace, 1.500. Si se alcanza el límite, el documento igual queda registrado y la app lo avisa.
- **Archivos:** máximo 6 fotos por solicitud (se comprimen en el teléfono) y 80 materiales por solicitud.
- **Historial local:** los documentos quedan guardados en el teléfono hasta enviarse. En **Mis envíos** se puede descargar o reenviar el PDF.
- **Paso a SharePoint:** cuando TI lo habilite, basta con apuntar `endpoint` a un nuevo receptor (por ejemplo, un flujo de Power Automate) que acepte el mismo formato de datos.

---

## Reportes de avance (versión 1.1)

Dos formularios nuevos que alimentan el **Excel de control del proyecto** (por ahora PMG Caliche):

| Formulario | Quién lo llena | Qué informa |
|---|---|---|
| **Reporte diario de avance** (folio `CAL26-RD-0001`) | Jefe de terreno | Cantidad ejecutada **hoy** en cada actividad de montaje (o % acumulado en los hitos «global»), clima, horas perdidas, dotación, horas máquina, interferencias, fotos y firma |
| **Avance de gestión y suministros** (folio `CAL26-AG-0001`) | PM / Ing. de proyecto | Etapas de cada cuenta (planos, cotización, OC, downpayment, BL, recepción en sitio…) y actividades de oficina (ingeniería, permisos, proceso de conexión CEN): **Listo** con fecha real o **En curso** con % |

```
Excel (Gantt_Interno + AF_V2) ──"Publicar lista de actividades"──► Script de Google ──► app (lista en el teléfono)
App (reporte) ──► Script de Google ──► pestaña "Avance_Lineas" (una línea por actividad, ID correlativo)
Excel (al abrirse y cada 60 min) ◄── líneas nuevas ── Script de Google      → hoja Avance_Diario → Gantt_Interno
```

- **Clima automático:** al abrir el reporte (con señal) se consulta Open-Meteo para la ubicación de la obra (`lat`/`lon` del proyecto en `js/config.js`, por confirmar): temperatura mín./máx., viento y ráfaga máx. en horario de trabajo, lluvia y horas con viento sobre el límite de montaje (`clima.limiteViento`, 40 km/h). Propone el clima (Despejado, Nublado, Viento fuerte o Lluvia); obra puede corregirlo.
- **Dotación por cargo y empresa:** cada fila es empresa (ION SpA o contratistas de la hoja *Contratistas* del Excel, u «Otra»), cargo, frente/especialidad, N° de personas y nombres (opcional). Dotación y equipos se copian del último reporte enviado desde el mismo teléfono.
- La lista de actividades sale de **AF_V2** del Excel: columna *Reporta* = Obra va al reporte diario; Oficina, al de gestión; *No reporta* no aparece.
- La app guarda la lista en el teléfono, así que se puede reportar sin señal (se envía al volver la conexión).
- Cada vez que el Excel trae avance nuevo, vuelve a publicar la lista con los acumulados al día.

### Actualizar el script (si ya estaba instalado)

1. En Apps Script, reemplace todo `Codigo.gs` por la versión nueva y guarde.
2. **Implementar → Gestionar implementaciones →** lápiz → *Versión: Nueva versión* → **Implementar**. Así la URL `/exec` no cambia.
   (Si es la primera instalación, siga la sección *Puesta en marcha*.)
3. Abra la URL `/exec` en el navegador: debe decir `"version":"1.1.0"`.

### Conectar el Excel de control

1. En la hoja **CONFIG** del Excel: **B40** = URL `/exec` del script, **B41** = código del proyecto (`CAL26`), **B42** = la clave del proyecto (la misma de la pestaña *Proyectos*).
2. En la hoja **Avance_Diario**, botón **Publicar lista de actividades**. Debe responder «… publicadas en la app».
3. En el teléfono, abra *Reporte diario de avance*: aparece la lista agrupada por disciplina y cuenta.
4. Envíe un reporte de prueba y en el Excel presione **Traer avance ahora** (o cierre y abra el Excel). La línea aparece en *Avance_Diario* y la cantidad en *Gantt_Interno*.

> No ordene ni borre filas de la pestaña **Avance_Lineas** de la planilla de Google: el Excel usa su ID correlativo para no cargar dos veces la misma línea.
