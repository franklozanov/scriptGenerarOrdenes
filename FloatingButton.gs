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
    var template = HtmlService.createTemplateFromFile('FloatingButtonSidebar');
    var html = template.evaluate()
      .setWidth(200)
      .setTitle('Novedades');
    
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
 * Muestra el sidebar flotante desde el menú (sin modo silent).
 * Esta función es llamada cuando el usuario hace clic en el menú.
 */
function mostrarSidebarFlotanteFromMenu() {
  mostrarSidebarFlotante(false);
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

/**
 * FUNCIÓN DE PRUEBA MANUAL
 * Ejecuta esta función desde el editor de Apps Script para probar el sidebar.
 * Menú: Extensiones → Apps Script → Seleccionar "testSidebarManual" → Ejecutar
 */
function testSidebarManual() {
  try {
    Logger.log("=== PRUEBA MANUAL DE SIDEBAR ===");
    
    // Mostrar el sidebar
    mostrarSidebarFlotante(false);
    
    // Mostrar confirmación
    SpreadsheetApp.getUi().alert(
      '✅ Sidebar Ejecutado',
      'El sidebar debería estar visible ahora en el borde derecho.\n\n' +
      'Si no lo ves:\n' +
      '1. Verifica que estés en la hoja correcta\n' +
      '2. Mira en el borde derecho de la pantalla\n' +
      '3. Revisa los logs (Ver → Registros)',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
  } catch (e) {
    Logger.log("ERROR: " + e.message);
    Logger.log("Stack: " + e.stack);
    
    SpreadsheetApp.getUi().alert(
      '❌ Error',
      'Error al mostrar sidebar:\n\n' + e.message + '\n\n' +
      'Detalles en logs (Ver → Registros)',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}
