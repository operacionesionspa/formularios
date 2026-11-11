/* =====================================================================
   CONFIGURACIÓN · Operaciones ION
   Este es el único archivo que normalmente hay que editar.
   Después de guardar cambios en GitHub, la app se actualiza sola
   (en el teléfono puede requerir cerrar y abrir la app una vez).
   ===================================================================== */
window.OPS_CONFIG = {

  // URL de la aplicación web de Google Apps Script (termina en /exec).
  // Mientras esté vacía, la app funciona en MODO DEMOSTRACIÓN:
  // genera el PDF en el teléfono, pero no registra nada en la planilla.
  endpoint: 'https://script.google.com/macros/s/AKfycbyVcrAWrOGFGMx9NaVErMPBecPnPTALf_5zKGsEZl-0YnROs8_z6kPX6GJNG4ds6_zh/exec',

  // Pedir la clave del proyecto la primera vez que se elige un proyecto.
  // Las claves se definen en la pestaña "Proyectos" de la planilla
  // (no se guardan aquí porque este repositorio es público).
  pedirClave: true,

  // Proyectos activos. El código es el prefijo de los folios: CAL26-SM-0001.
  // Para agregar un proyecto: copie una línea y agréguelo también
  // en la pestaña "Proyectos" de la planilla.
  // lat / lon: ubicación de la obra para el clima automático (Open-Meteo).
  // Confirmar con las coordenadas del proyecto (Google Maps: clic derecho sobre la obra).
  proyectos: [
    { codigo: 'CAL26', nombre: 'PMG Caliche', lat: -22.33, lon: -69.46, tablero: 'caliche/' },
    { codigo: 'AQA26', nombre: 'PFV Aquanqa' },
    { codigo: 'SCB25', nombre: 'PMGD SCB' }
  ],

  // Clima automático del reporte diario: viento sobre este límite (km/h) en horario
  // de trabajo se informa como "Viento fuerte" (límite de montaje de paneles y trackers).
  clima: { limiteViento: 40, horaInicio: 8, horaFin: 18 },

  // Documentos que aparecen en el menú como "Próximamente".
  proximos: [
    { nombre: 'Reporte flash', icono: '⚡' }
  ],

  // Feriados nacionales de Chile (AAAA-MM-DD). Se descuentan al calcular
  // los días hábiles de plazo. Actualizar cada año con el calendario oficial.
  feriados: [
    // 2026
    '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21',
    '2026-06-21', '2026-06-29', '2026-07-16', '2026-08-15', '2026-09-18',
    '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08',
    '2026-12-25',
    // 2027 (confirmar con el calendario oficial cuando se publique)
    '2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21',
    '2027-06-21', '2027-06-28', '2027-07-16', '2027-08-15', '2027-09-18',
    '2027-09-19', '2027-10-11', '2027-10-31', '2027-11-01', '2027-12-08',
    '2027-12-25'
  ]
};
