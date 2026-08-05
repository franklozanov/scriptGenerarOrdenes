// ============================================================
// MODULE: EventRouter
// Descripción: Punto de entrada del sistema modular de edición.
//              Reemplaza al monolito onEditInstalled cuando se activa.
// Prioridad de Carga: 5° (depende de EventBuilder y todos los módulos)
// ============================================================

/**
 * Kill Switch: Controla si el sistema usa el nuevo Router modular
 * o el monolito legacy en Traceability.gs.
 * 
 * - false: El sistema usa onEditInstalled legacy (comportamiento actual).
 * - true:  El sistema usa el nuevo Event Router modular.
 * 
 * INSTRUCCIONES DE ROLLBACK: Si algo falla en producción, cambiar a false
 * y hacer clasp push. El sistema volverá al comportamiento anterior inmediatamente.
 */
var USE_NEW_ROUTER = true;

/**
 * Columnas "derivadas" que son escritas por el sistema, no por el usuario.
 * Si una edición SOLO toca una de estas columnas, el Router no debe procesarla
 * para evitar cascadas infinitas (un setValue dispara otro onEdit).
 */
var COLUMNAS_DERIVADAS = ['SolicitadoPor', 'SolicitadaPor', 'EstadoDocumentos', 'CantDispAFecha'];

/**
 * Punto de entrada del nuevo sistema modular.
 * Es invocado por onEditInstalled cuando USE_NEW_ROUTER === true.
 * 
 * @param {Object} e - Evento de edición de Google Apps Script
 */
function runNewEventRouter(e) {
  try {
    // === GUARD CLAUSE ANTI-CASCADA ===
    // Si la edición fue SOLO en una columna derivada (escrita por el sistema),
    // no procesar para evitar bucles infinitos.
    var editedRange = e.range;
    var sheet = editedRange.getSheet();
    var sheetName = sheet.getName();
    
    if (HOJAS_NO_AUDITADAS.indexOf(sheetName) !== -1) return;
    
    if (sheetName === 'Ordenes') {
      var numCols = editedRange.getNumColumns();
      if (numCols === 1) {
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var editedColIdx = editedRange.getColumn();
        var editedColName = (editedColIdx <= headers.length) ? headers[editedColIdx - 1].toString().trim() : '';
        if (COLUMNAS_DERIVADAS.indexOf(editedColName) !== -1) {
          return; // Edición en columna derivada — cortocircuitar
        }
      }
    }

    // === CONSTRUIR EVENTO ENRIQUECIDO ===
    var evt = buildEnrichedEvent(e);
    if (!evt) return;

    // === DELEGACIÓN SECUENCIAL ESTRICTA ===
    // El orden importa: SolicitadoPor debe escribirse y flushearse
    // ANTES de que ModDrive lance la validación lenta de Drive.
    
    // 1. Permisos y protecciones
    if (!evt.hasPermission) {
      Auditoria.revertirEdicionNoPermitida(evt, e);
      return;
    }

    // 2. Manejo especial de hojas no-Ordenes
    if (evt.sheetName === 'templates') {
      clearInitialDataCache();
      logChange('ACTUALIZACION_PLANTILLAS', 'Se detectó modificación en la hoja de plantillas. Caché limpiado automáticamente.', evt.userIdentity);
      return;
    }

    // 3. Procesamiento de hoja Ordenes
    if (evt.sheetName === 'Ordenes' && evt.startRow > 1) {
      // 3a. Limpieza de filas vacías (FASE 0 legacy)
      ModUsuarios.limpiarFilasVacias(evt);
      
      // 3b. Firma de usuario (SolicitadoPor)
      ModUsuarios.actualizarSolicitadoPor(evt);
      
      // 3c. Inventario (CantDispAFecha)
      ModInventario.procesarCantDisp(evt);
      
      // 3d. STATUS + Validación Drive
      ModDrive.procesarStatusYDocumentos(evt);
    }

    // 4. Registro forense en Logs (aplica a TODAS las hojas)
    Auditoria.registrarEdicion(evt, e);

  } catch (error) {
    Logger.log('ERROR FATAL en runNewEventRouter: ' + error.message);
    Logger.log('Stack trace: ' + error.stack);
    try {
      logChange('ERROR_SISTEMA', 'Error en runNewEventRouter: ' + error.message, 'Sistema');
    } catch (logError) {
      Logger.log('No se pudo registrar el error en Logs: ' + logError.message);
    }
  }
}
