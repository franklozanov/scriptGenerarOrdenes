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
 * Punto de entrada del nuevo sistema modular.
 * Es invocado por onEditInstalled cuando USE_NEW_ROUTER === true.
 * 
 * @param {Object} e - Evento de edición de Google Apps Script
 */
function runNewEventRouter(e) {
  try {
    var editedRange = e.range;
    var sheet = editedRange.getSheet();
    var sheetName = sheet.getName();

    // === ENFORCEMENT 1: hoja solo-sistema ===
    // Toda edición MANUAL a estas hojas se revierte y audita. Los setValue del
    // script no disparan el trigger, así que aquí solo llegan ediciones humanas.
    if (HOJAS_SOLO_SISTEMA.indexOf(sheetName) !== -1) {
      Auditoria.revertirEdicionSistema(e, editedRange);
      return;
    }

    // === CONSTRUIR EVENTO ENRIQUECIDO ===
    var evt = buildEnrichedEvent(e);
    if (!evt) return;

    // === ENFORCEMENT 2: columnas solo-sistema en Ordenes ===
    // Revierte la edición manual a esas columnas (salvo en filas que se están
    // vaciando: eso es un borrado legítimo). Si SOLO se tocaron columnas de
    // sistema, no hay datos que procesar y se corta.
    if (evt.sheetName === 'Ordenes' && evt.columnasSistemaTocadas.length > 0) {
      Auditoria.revertirColumnasSistema(e, evt);
      if (evt.soloColumnasSistema) return;
    }

    // === DELEGACIÓN SECUENCIAL ESTRICTA ===
    // El orden importa: SolicitadoPor debe escribirse y flushearse
    // ANTES de que ModDrive lance la validación lenta de Drive.

    // 1. Permisos y protecciones (protecciones nativas; queda por compatibilidad)
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
