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
 * 
 * @param {boolean} silent - Si es true, no muestra mensajes de UI (para uso en inicialización)
 */
function crearBotonFlotanteNovedad(silent) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    // Eliminar botón existente si hay alguno
    eliminarBotonFlotanteNovedad();
    
    // Usar una imagen PNG simple en base64 (más compatible que SVG)
    var imageBlob = createNovedadButtonImage_();
    
    // Insertar imagen en la hoja
    var image = sheet.insertImage(imageBlob, 1, 1);
    
    // Posicionar en esquina inferior derecha
    var lastRow = Math.max(sheet.getMaxRows() - 5, 50);
    var lastCol = Math.max(sheet.getMaxColumns() - 2, 20);
    
    // Mover la imagen a la posición deseada
    image.setAnchorCell(sheet.getRange(lastRow, lastCol));
    image.setAnchorCellXOffset(10);
    image.setAnchorCellYOffset(10);
    
    // Configurar tamaño del botón
    image.setWidth(120);
    image.setHeight(120);
    
    // Asignar función al hacer clic
    image.assignScript('abrirModalRegistroNovedad');
    
    Logger.log("✓ Botón flotante de Novedad creado exitosamente");
    
    // Mostrar mensaje al usuario solo si no es modo silencioso
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        ui.alert(
          '✅ Botón Flotante Creado',
          'Se ha creado un botón flotante "+ Novedad" en la esquina inferior derecha de la hoja Ordenes.\n\n' +
          'Haga clic en el botón para abrir el modal de registro de novedad.\n\n' +
          'Nota: Puede mover el botón arrastrándolo a la posición que prefiera.',
          ui.ButtonSet.OK
        );
      } catch (uiError) {
        Logger.log("No se pudo mostrar mensaje UI (contexto sin UI): " + uiError.message);
      }
    }
    
    return { status: 'success', message: 'Botón flotante creado' };
    
  } catch (e) {
    Logger.log("ERROR al crear botón flotante: " + e.message);
    
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        ui.alert(
          'Error',
          'No se pudo crear el botón flotante:\n' + e.message,
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
 * Crea una imagen del botón flotante.
 * Genera un SVG embebido en base64 sin necesidad de conexión a internet.
 * @returns {Blob} Blob de la imagen SVG
 * @private
 */
function createNovedadButtonImage_() {
  // Crear SVG con círculo azul y símbolo "+"
  var svg = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="60" cy="60" r="55" fill="#1976d2" stroke="#1565c0" stroke-width="3"/>' +
    '<text x="60" y="85" font-family="Arial, sans-serif" font-size="70" font-weight="bold" ' +
    'fill="#FFFFFF" text-anchor="middle">+</text>' +
    '<text x="60" y="105" font-family="Arial, sans-serif" font-size="12" font-weight="normal" ' +
    'fill="#FFFFFF" text-anchor="middle">Novedad</text>' +
    '</svg>';
  
  try {
    // Convertir SVG a blob
    var blob = Utilities.newBlob(svg, 'image/svg+xml', 'boton-novedad.svg');
    Logger.log("✓ Imagen del botón creada exitosamente (SVG embebido)");
    return blob;
  } catch (e) {
    Logger.log("Error al crear imagen SVG: " + e.message);
    throw new Error("No se pudo crear la imagen del botón: " + e.message);
  }
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
