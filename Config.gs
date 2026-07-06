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
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email', 'Rol'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio'],
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
