// ============================================================
// MODULE: Config
// Descripción: Constantes globales y configuración del sistema
// Prioridad de Carga: 1° (define globales usados por todo)
// ============================================================

// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

// Claves de plantillas estáticas para caché
var STATIC_TEMPLATE_KEYS_ = ["TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES"];
var STATIC_TEMPLATE_CACHE_TTL_ = 21600;
var STATIC_TEMPLATE_CHUNK_SIZE_ = 80000;

// Estructura requerida de hojas y columnas
const REQUIRED_SHEETS = {
  'templates': ['Clave', 'Valor', 'NombreTemplate'],
  'Ordenes': ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden', 'Fabricante', 'AdjuntoCOA', 'AdjuntoOA', 'EstadoCarga', 'ConsecutivoImp', 'ImpresoPor', 'STATUS'],
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email', 'Rol'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio'],
  'RegistroNovedad': ['FechaNovedad', 'NoOrden', 'Codigo', 'TipoNovedad', 'Comentario', 'TotalPags', 'NoPagDevueltas', 'RealizadoPor', 'STATUS']
};
