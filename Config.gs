// ============================================================
// MODULE: Config
// Descripción: Constantes globales y configuración del sistema
// Prioridad de Carga: 1° (define globales usados por todo)
// ============================================================

// --- CONSTANTES DE VALORES DE DROPDOWN ---
// Estos valores deben coincidir EXACTAMENTE con los configurados en las validaciones de datos

var VALORES_ESTADO_DOCUMENTOS = {
  FALTAN_AMBOS: "🔴 Faltan Ambos",
  FALTA_OA: "🟡 Falta OA",
  FALTA_COA: "🟡 Falta COA",
  LISTOS: "🟢 Listos para Imprimir"
};

var VALORES_STATUS = {
  CREADA: "Creada",
  IMPRESO: "Impreso",
  REIMPRESO: "Reimpreso",
  RECIBIDA_QA: "RecibidaQA",
  DEVUELTA_QA: "DevueltaQA",
  CERRADA: "Cerrada",
  ANULADA: "Anulada"
};

// Hojas internas del sistema que NO se auditan (sus ediciones no se registran
// en Logs). Son logs/índices escritos por el script, no datos de negocio.
// Denylist: todo lo demás SÍ se audita por defecto (seguro para un QMS).
var HOJAS_NO_AUDITADAS = ['Logs', 'IndiceDocumentos', 'LogTiemposProceso'];

// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

// Configuración de plantillas estáticas para caché
var STATIC_TEMPLATE_CACHE_TTL_ = 21600;
var STATIC_TEMPLATE_CHUNK_SIZE_ = 80000;

// Estructura requerida de hojas y columnas
const REQUIRED_SHEETS = {
  'templates': ['Clave', 'Valor', 'Type', 'NombreTemplate', 'Description', 'FormOrder', 'Estado', 'Copias'],
  'Ordenes': ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden', 'Fabricante', 'SolicitadoPor', 'EstadoDocumentos', 'ConsecutivoImp', 'ImpresoPor', 'ReimpresoPor', 'NoPags', 'Reimpresion', 'TotalPags', 'STATUS', 'HistorialImpresion', 'Novedades'],
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email', 'Rol'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio'],
  'RegistroNovedad': ['FechaNovedad', 'NoOrden', 'Codigo', 'TipoNovedad', 'Categoria', 'Subcategoria', 'Comentario', 'TotalPags', 'NoPagDevueltas', 'RealizadoPor', 'STATUS'],
  'LogTiemposProceso': ['Timestamp', 'NoOrden', 'Proceso', 'RegistradoPor'],
  'ParametrosNovedades': ['Categoria', 'Subcategoria']
};
