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
  AUTORIZAR_QA: 'AUTORIZAR_QA'
};

// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

// Claves de plantillas estáticas para caché
var STATIC_TEMPLATE_KEYS_ = ["TPL_CHECKLIST", "TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES", "TPL_ENTREGA_QA"];
var STATIC_TEMPLATE_CACHE_TTL_ = 21600;
var STATIC_TEMPLATE_CHUNK_SIZE_ = 80000;

// Estructura requerida de hojas y columnas
const REQUIRED_SHEETS = {
  'templates': ['Clave', 'Valor', 'Type', 'NombreTemplate', 'Description', 'FormOrder', 'FileFolderLink'],
  'Ordenes': ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden', 'Fabricante', 'AdjuntoCOA', 'AdjuntoOA', 'EstadoCarga', 'ConsecutivoImp', 'ImpresoPor', 'STATUS'],
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email', 'Rol'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio'],
  'RegistroNovedad': ['FechaNovedad', 'NoOrden', 'Codigo', 'TipoNovedad', 'Comentario', 'TotalPags', 'NoPagDevueltas', 'RealizadoPor', 'STATUS'],
  'PermisosRoles': ['Rol', 'MENU_ADMIN', 'MENU_CONFIG', 'CARGAR_ORDENES', 'SUBIR_DOCUMENTOS', 'REGISTRAR_NOVEDAD', 'IMPRIMIR_ORDEN', 'SOLICITAR_REIMPRESION', 'APROBAR_REIMPRESION', 'AUTORIZAR_QA'],
  'SolicitudesImpresion': ['ID_Solicitud', 'Fecha', 'NoOrden', 'SolicitadoPor', 'TipoSolicitud', 'Motivo', 'Plantillas', 'Estado', 'FirmaQA']
};
