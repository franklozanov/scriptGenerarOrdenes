// ============================================================
// MODULE: FloatingButton
// Descripción: Gestión de botones flotantes en la hoja de cálculo
// Prioridad de Carga: N/A (se ejecuta manualmente)
// ============================================================

/**
 * Crea un botón flotante "+ Novedad" en la esquina inferior derecha de la hoja Ordenes.
 * El botón abre el modal de registro de novedad al hacer clic.
 * 
 * IMPORTANTE: Esta función debe ejecutarse UNA VEZ para crear el botón.
 * Si ya existe un botón, primero ejecute eliminarBotonFlotanteNovedad().
 */
function crearBotonFlotanteNovedad() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    // Eliminar botón existente si hay alguno
    eliminarBotonFlotanteNovedad();
    
    // Crear imagen SVG del botón
    var svgButton = createNovedadButtonSVG_();
    
    // Convertir SVG a blob
    var blob = Utilities.newBlob(svgButton, 'image/svg+xml', 'boton-novedad.svg');
    
    // Inserir imagen en la hoja
    var image = sheet.insertImage(blob, 1, 1);
    
    // Posicionar en esquina inferior derecha
    // Nota: Las coordenadas son relativas a la celda, no absolutas
    // Usaremos una celda fuera del área visible normal
    var lastRow = Math.max(sheet.getMaxRows() - 5, 50);
    var lastCol = Math.max(sheet.getMaxColumns() - 2, 20);
    
    // Mover la imagen a la posición deseada
    image.setAnchorCell(sheet.getRange(lastRow, lastCol));
    image.setAnchorCellXOffset(10);
    image.setAnchorCellYOffset(10);
    
    // Configurar tamaño del botón
    image.setWidth(140);
    image.setHeight(140);
    
    // Asignar función al hacer clic
    image.assignScript('abrirModalRegistroNovedad');
    
    Logger.log("✓ Botón flotante de Novedad creado exitosamente");
    
    // Mostrar mensaje al usuario
    var ui = SpreadsheetApp.getUi();
    ui.alert(
      '✅ Botón Flotante Creado',
      'Se ha creado un botón flotante "+ Novedad" en la esquina inferior derecha de la hoja Ordenes.\n\n' +
      'Haga clic en el botón para abrir el modal de registro de novedad.\n\n' +
      'Nota: Puede mover el botón arrastrándolo a la posición que prefiera.',
      ui.ButtonSet.OK
    );
    
    return { status: 'success', message: 'Botón flotante creado' };
    
  } catch (e) {
    Logger.log("ERROR al crear botón flotante: " + e.message);
    var ui = SpreadsheetApp.getUi();
    ui.alert(
      'Error',
      'No se pudo crear el botón flotante:\n' + e.message,
      ui.ButtonSet.OK
    );
    throw e;
  }
}

/**
 * Elimina el botón flotante de Novedad de la hoja Ordenes.
 * Útil para recrear el botón o limpiar la hoja.
 */
function eliminarBotonFlotanteNovedad() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      Logger.log("La hoja 'Ordenes' no existe.");
      return;
    }
    
    // Obtener todas las imágenes de la hoja
    var images = sheet.getImages();
    var deletedCount = 0;
    
    // Buscar y eliminar imágenes que tengan el script asignado de novedad
    for (var i = 0; i < images.length; i++) {
      var script = images[i].getScript();
      if (script === 'abrirModalRegistroNovedad') {
        images[i].remove();
        deletedCount++;
        Logger.log("✓ Botón flotante de Novedad eliminado");
      }
    }
    
    if (deletedCount === 0) {
      Logger.log("No se encontró ningún botón flotante de Novedad para eliminar");
    }
    
    return { status: 'success', deletedCount: deletedCount };
    
  } catch (e) {
    Logger.log("ERROR al eliminar botón flotante: " + e.message);
    throw e;
  }
}

/**
 * Crea el SVG del botón flotante con estilo moderno.
 * @returns {string} Código SVG del botón
 * @private
 */
function createNovedadButtonSVG_() {
  var svg = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg width="140" height="140" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur in="SourceAlpha" stdDeviation="3"/>' +
    '<feOffset dx="0" dy="2" result="offsetblur"/>' +
    '<feComponentTransfer>' +
    '<feFuncA type="linear" slope="0.3"/>' +
    '</feComponentTransfer>' +
    '<feMerge>' +
    '<feMergeNode/>' +
    '<feMergeNode in="SourceGraphic"/>' +
    '</feMerge>' +
    '</filter>' +
    '</defs>' +
    // Círculo de fondo con sombra
    '<circle cx="70" cy="70" r="60" fill="#1976d2" filter="url(#shadow)"/>' +
    // Borde del círculo
    '<circle cx="70" cy="70" r="60" fill="none" stroke="#1565c0" stroke-width="2"/>' +
    // Símbolo "+" en blanco
    '<line x1="70" y1="45" x2="70" y2="95" stroke="white" stroke-width="8" stroke-linecap="round"/>' +
    '<line x1="45" y1="70" x2="95" y2="70" stroke="white" stroke-width="8" stroke-linecap="round"/>' +
    // Texto "Novedad" debajo del +
    '<text x="70" y="110" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">Novedad</text>' +
    '</svg>';
  
  return svg;
}

/**
 * Prompt para crear el botón flotante con autenticación admin.
 */
function promptCrearBotonFlotanteNovedad() {
  withAdminAuth('Crear Botón Flotante de Novedad', function(ui) {
    crearBotonFlotanteNovedad();
  });
}

/**
 * Prompt para eliminar el botón flotante con autenticación admin.
 */
function promptEliminarBotonFlotanteNovedad() {
  withAdminAuth('Eliminar Botón Flotante de Novedad', function(ui) {
    var result = eliminarBotonFlotanteNovedad();
    if (result.deletedCount > 0) {
      ui.alert('✅ Botón flotante eliminado exitosamente.');
    } else {
      ui.alert('ℹ️ No se encontró ningún botón flotante para eliminar.');
    }
  });
}
