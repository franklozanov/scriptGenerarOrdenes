// ============================================================
// MODULE: Config
// Descripción: Constantes globales y configuración del sistema
// Prioridad de Carga: 1° (define globales usados por todo)
// ============================================================

// --- CONSTANTES DE VALORES DE DROPDOWN ---
// Estos valores deben coincidir EXACTAMENTE con los configurados en las validaciones de datos

var VALORES_DOCUMENTO = {
  PENDIENTE: "Pendiente",
  CARGADO: "✅ Cargado"
};

var VALORES_ESTADO_CARGA = {
  PENDIENTE_AMBOS: "Pendiente COA/OA",
  PENDIENTE_OA: "Pendiente OA",
  PENDIENTE_COA: "Pendiente COA",
  CARGADOS: "✅ Cargados"
};

var VALORES_STATUS = {
  IMPRESO: "Impreso",
  REIMPRESO: "Reimpreso",
  RECIBIDA_QA: "RecibidaQA",
  DEVUELTA_QA: "DevueltaQA",
  CERRADA: "Cerrada"
};

// --- TIPOS DE CAMBIO DE AUDITORÍA (hoja Logs, columna TipoCambio) ---
// Lista central para evitar que cada archivo invente su propio tag de texto libre
// (con el riesgo de typos/variantes). Usado hoy en Traceability.gs; se recomienda
// adoptarlo de forma incremental en el resto de call sites de logChange().
var TIPOS_CAMBIO = {
  EDICION_CELDA: "EDICION_CELDA",
  EDICION_MASIVA: "EDICION_MASIVA",
  EDICION_MANUAL_NOVEDAD: "EDICION_MANUAL_NOVEDAD",
  EDICION_MASIVA_NOVEDAD: "EDICION_MASIVA_NOVEDAD",
  EDICION_ADMIN_LIBRE: "EDICION_ADMIN_LIBRE",
  REVERSION_EDICION_MANUAL: "REVERSION_EDICION_MANUAL",
  RESET_CARGA_OA: "RESET_CARGA_OA",
  RESET_CARGA_COA: "RESET_CARGA_COA",
  ASIGNACION_PENDIENTE_OA: "ASIGNACION_PENDIENTE_OA",
  ASIGNACION_PENDIENTE_COA: "ASIGNACION_PENDIENTE_COA",
  ERROR_SISTEMA: "ERROR_SISTEMA",
  SOLICITUD_COMPLETADA: "SOLICITUD_COMPLETADA",
  CAMBIO_ESTRUCTURAL: "CAMBIO_ESTRUCTURAL",
  IMPRESION_ORDEN: "IMPRESION_ORDEN"
};

// --- PERMISOS RBAC (Role-Based Access Control) ---
// Claves de permisos del sistema
var PERMISOS = {
  MENU_ADMIN: 'MENU_ADMIN',
  MENU_CONFIG: 'MENU_CONFIG',
  CARGAR_ORDENES: 'CARGAR_ORDENES',
  SUBIR_DOCUMENTOS: 'SUBIR_DOCUMENTOS',
  REGISTRAR_NOVEDAD: 'REGISTRAR_NOVEDAD',
  IMPRIMIR_ORDEN: 'IMPRIMIR_ORDEN',
  SOLICITAR_REIMPRESION: 'SOLICITAR_REIMPRESION',
  APROBAR_REIMPRESION: 'APROBAR_REIMPRESION',
  AUTORIZAR_QA: 'AUTORIZAR_QA',
  GESTIONAR_AUTOAPROBACION: 'GESTIONAR_AUTOAPROBACION'
};

// --- CLAVE DE CONFIGURACIÓN DE AUTOAPROBACIÓN TEMPORAL (ScriptProperties) ---
var AUTO_APPROVAL_PROP_KEY = 'AUTO_APPROVAL_CONFIG';

// --- CLAVE DE CONFIGURACIÓN DE PERSISTENCIA DE SESIÓN (ScriptProperties) ---
// Minutos que una sesión validada por PIN permanece vigente para REABRIR el panel
// sin volver a pedir PIN. 0 = pedir PIN en cada apertura. No afecta las firmas
// electrónicas 21 CFR Part 11 (impresión, autorización QA, aprobaciones), que
// siempre re-piden PIN sin importar este valor.
var SESSION_PERSIST_PROP_KEY = 'SESSION_PERSIST_MINUTES';
var SESSION_PERSIST_DEFAULT_MIN = 30;
var SESSION_PERSIST_MAX_MIN = 1440; // 24 h

// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

// Claves de plantillas estáticas para caché
var STATIC_TEMPLATE_KEYS_ = ["TPL_CHECKLIST", "TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES", "TPL_ENTREGA_QA"];
var STATIC_TEMPLATE_CACHE_TTL_ = 21600;
var STATIC_TEMPLATE_CHUNK_SIZE_ = 80000;

// Estructura requerida de hojas y columnas
const REQUIRED_SHEETS = {
  'templates': ['Clave', 'Valor', 'Type', 'NombreTemplate', 'Description', 'FormOrder', 'FileFolderLink'],
  'Ordenes': ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden', 'Fabricante', 'AdjuntoCOA', 'AdjuntoOA', 'EstadoCarga', 'ConsecutivoImp', 'NoPags', 'Reimpresion', 'TotalPags', 'ImpresoPor', 'Reimpreso', 'HistorialImpresion', 'STATUS', 'VerifLote', 'VerifCant. Disponible', 'VerifExp', 'CantDispAFecha', 'Decision'],
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email', 'Rol', 'Clave', 'Estado', 'IntentosFallidos'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio', 'OrdenRef', 'CampoAfectado', 'ValorAnterior', 'ValorNuevo', 'CorrelationId'],
  'RegistroNovedad': ['FechaNovedad', 'NoOrden', 'Codigo', 'TipoNovedad', 'Comentario', 'TotalPags', 'NoPagDevueltas', 'RealizadoPor', 'STATUS'],
  'PermisosRoles': ['Rol', 'MENU_ADMIN', 'MENU_CONFIG', 'CARGAR_ORDENES', 'SUBIR_DOCUMENTOS', 'REGISTRAR_NOVEDAD', 'IMPRIMIR_ORDEN', 'SOLICITAR_REIMPRESION', 'APROBAR_REIMPRESION', 'AUTORIZAR_QA', 'GESTIONAR_AUTOAPROBACION'],
  'SolicitudesImpresion': ['ID_Solicitud', 'Fecha', 'NoOrden', 'SolicitadoPor', 'TipoSolicitud', 'Motivo', 'Plantillas', 'Estado', 'FirmaQA']
};

// --- CONFIGURACIÓN DE MATRICES DE VALIDACIÓN ---

/**
 * Nombre de la hoja de sistema que almacena la configuración de matrices K.
 * Esta hoja es creada automáticamente al inicializar el sistema y permanece oculta.
 */
var SYS_MATRICES_SHEET_NAME = 'Sys_MatricesConfig';

/**
 * Encabezados canónicos de la hoja Sys_MatricesConfig.
 * El orden de este array define el orden físico de columnas en la hoja.
 */
var MATRICES_CONFIG_HEADERS = [
  'Nombre Matriz',      // Nombre descriptivo (ej. "Matriz K 2026")
  'ID Archivo',         // ID extraído del link de Google Sheets externo
  'Nombre de Pestaña', // Nombre exacto del tab interno a consultar
  'Fila de Encabezados', // Fila donde están los títulos de columna en la hoja externa (vacío = 1)
  'Columna Llave',     // Nombre del encabezado con el No Análisis K
  'Columna Lote',      // Nombre del encabezado de Lote
  'Columna Cantidad',  // Nombre del encabezado de Cantidad Disponible
  'Columna Vencimiento', // Nombre del encabezado de Fecha de Vencimiento
  'Columna Fabricante', // Nombre del encabezado de Fabricante
  'Prioridad',         // Número entero (1 = primera en consultar)
  'Activa'             // "Si" / "No" — permite desactivar sin eliminar
];

/**
 * Valores posibles para la columna Decision de la hoja Ordenes.
 */
var VALORES_DECISION = {
  OK: 'OK, Generar orden',
  CANTIDAD_NO_DISPONIBLE: 'Cantidad no disponible en inventario',
  NO_ENCONTRADO: 'No encontrado en ninguna Matriz',
  ERROR_PREFIX: 'Error en: '   // Se concatena con los campos fallidos (ej. "Error en: Lote")
};

/**
 * Agrega o actualiza una plantilla en la hoja 'templates'
 */
function procesarAgregarPlantilla(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('templates');
  if (!sheet) return { status: 'error', message: 'Hoja templates no encontrada.' };
  
  var valorLimpio = params.valor.trim();
  // Extraer ID usando la función existente en Helpers.gs si la hay
  if (typeof extractDriveId === 'function') {
    var extracted = extractDriveId(valorLimpio);
    if (extracted) valorLimpio = extracted;
  } else {
    // Regex manual si no existe
    var match = valorLimpio.match(/[-\w]{25,}/);
    if (match) valorLimpio = match[0];
  }
  
  var data = sheet.getDataRange().getValues();
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(data[0], 'Clave', false) || 1;
  var colValorIdx = getColumnIndexByNameCaseInsensitive(data[0], 'Valor', false) || 2;
  var colTypeIdx = getColumnIndexByNameCaseInsensitive(data[0], 'Type', false) || 3;
  var colDescIdx = getColumnIndexByNameCaseInsensitive(data[0], 'Descripcion', false) || 4;
  
  var existingRow = -1;
  var searchKey = params.clave.trim();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][colClaveIdx - 1] && data[i][colClaveIdx - 1].toString().trim() === searchKey) {
      existingRow = i + 1;
      break;
    }
  }
  
  if (existingRow > -1) {
    // Actualizar
    sheet.getRange(existingRow, colValorIdx).setValue(valorLimpio);
    if (colTypeIdx) sheet.getRange(existingRow, colTypeIdx).setValue(params.tipo.trim());
    if (colDescIdx && params.descripcion) sheet.getRange(existingRow, colDescIdx).setValue(params.descripcion.trim());
    if (typeof clearInitialDataCache === 'function') clearInitialDataCache();
    return { status: 'success', message: 'Plantilla actualizada exitosamente.' };
  } else {
    // Añadir nueva fila
    var lastCol = sheet.getLastColumn() || 4;
    var newRow = new Array(lastCol).fill("");
    newRow[colClaveIdx - 1] = searchKey;
    newRow[colValorIdx - 1] = valorLimpio;
    if (colTypeIdx) newRow[colTypeIdx - 1] = params.tipo.trim();
    if (colDescIdx && params.descripcion) newRow[colDescIdx - 1] = params.descripcion.trim();
    
    sheet.appendRow(newRow);
    if (typeof clearInitialDataCache === 'function') clearInitialDataCache();
    return { status: 'success', message: 'Plantilla agregada exitosamente.' };
  }
}
