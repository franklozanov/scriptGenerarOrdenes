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
 * Crea el botón flotante usando un Drawing nativo de Google Sheets.
 * No requiere imágenes externas - usa formas y texto nativos.
 * @param {Sheet} sheet - Hoja donde crear el botón
 * @returns {Object} Drawing creado
 * @private
 */
function createNovedadButtonDrawing_(sheet) {
  try {
    // Crear un rectángulo con esquinas redondeadas (simula círculo)
    var shape = sheet.newChart()
      .asAreaChart() // Usamos un tipo de gráfico temporal
      .setPosition(5, 5, 0, 0) // Posición inicial (se ajustará después)
      .build();
    
    // Nota: Google Apps Script no permite crear Drawings directamente con formas personalizadas
    // La alternativa es usar una celda con formato especial como botón
    
    // Crear una celda especial que actúe como botón
    var buttonCell = sheet.getRange('A1');
    buttonCell.setValue('➕ Novedad');
    buttonCell.setBackground('#1976d2');
    buttonCell.setFontColor('#FFFFFF');
    buttonCell.setFontSize(14);
    buttonCell.setFontWeight('bold');
    buttonCell.setHorizontalAlignment('center');
    buttonCell.setVerticalAlignment('middle');
    
    // Ajustar tamaño de la celda
    sheet.setColumnWidth(1, 120);
    sheet.setRowHeight(1, 120);
    
    Logger.log("✓ Botón flotante creado usando celda formateada");
    
    return {
      type: 'cell',
      range: 'A1',
      sheet: sheet
    };
    
  } catch (e) {
    Logger.log("Error al crear botón flotante: " + e.message);
    throw new Error("No se pudo crear el botón flotante: " + e.message);
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
