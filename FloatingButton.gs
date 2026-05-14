// ============================================================
// MODULE: FloatingButton
// Descripción: Gestión del sidebar flotante para registro de novedades
// Prioridad de Carga: N/A (se ejecuta automáticamente en onOpen)
// ============================================================

/**
 * Muestra el sidebar flotante colapsable con el botón de "Registrar Novedad".
 * El sidebar se muestra automáticamente al abrir la hoja y permanece colapsado
 * hasta que el usuario pasa el mouse sobre él.
 * 
 * @param {boolean} silent - Si es true, no muestra mensajes de error en UI
 */
function mostrarSidebarFlotante(silent) {
  try {
    var html = HtmlService.createHtmlOutputFromFile('FloatingButtonSidebar')
      .setWidth(40)
      .setTitle('');
    
    SpreadsheetApp.getUi().showSidebar(html);
    
    Logger.log("✓ Sidebar flotante de Novedad mostrado exitosamente");
    
    return { status: 'success', message: 'Sidebar flotante mostrado' };
    
  } catch (e) {
    Logger.log("ERROR al mostrar sidebar flotante: " + e.message);
    
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        ui.alert(
          'Error',
          'No se pudo mostrar el sidebar flotante:\n' + e.message,
          ui.ButtonSet.OK
        );
      } catch (uiError) {
        Logger.log("No se pudo mostrar error UI: " + uiError.message);
      }
    }
    
    throw e;
  }
}

/**
 * Oculta el sidebar flotante.
 * Nota: El sidebar se puede cerrar manualmente por el usuario usando el botón X.
 * Esta función es opcional y puede usarse programáticamente si es necesario.
 */
function ocultarSidebarFlotante() {
  try {
    // No hay una forma directa de cerrar un sidebar programáticamente en Apps Script
    // El usuario debe cerrarlo manualmente usando el botón X del sidebar
    Logger.log("ℹ️ El sidebar debe cerrarse manualmente por el usuario");
    
    return { status: 'info', message: 'El sidebar debe cerrarse manualmente' };
    
  } catch (e) {
    Logger.log("ERROR: " + e.message);
    throw e;
  }
}
