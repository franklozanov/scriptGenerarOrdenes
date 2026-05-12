// ============================================================
// MODULE: Diagnostics
// Descripción: Herramientas de diagnóstico del sistema
// Prioridad de Carga: 10° (solo lectura, dependencias mínimas)
// ============================================================

/**
 * Función de diagnóstico para verificar el estado de las plantillas.
 * Verifica acceso a carpetas dinámicas y plantillas estáticas.
 */
function diagnosticarPlantillas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tplSheet = ss.getSheetByName('templates');
  if (!tplSheet) {
    SpreadsheetApp.getUi().alert('❌ Error: La hoja "templates" no existe.');
    return;
  }
  
  var tplData = tplSheet.getDataRange().getValues();
  var report = "📋 DIAGNÓSTICO DE PLANTILLAS\n\n";
  var errorCount = 0;
  var successCount = 0;
  var folderId = "";
  var folderAnalysisId = "";
  
  var headers = tplData[0];
  
  // Obtener índices de columnas por nombre
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
  var colValorIdx = getColumnIndexByNameCaseInsensitive(headers, 'Valor', false);
  
  // Si alguna columna no existe, usar índices por defecto
  if (!colClaveIdx) colClaveIdx = 1;
  if (!colValorIdx) colValorIdx = 2;
  
  // Convertir a base-0 para acceso a array
  colClaveIdx = colClaveIdx - 1;
  colValorIdx = colValorIdx - 1;
  
  // Verificar carpetas dinámicas primero
  for (var i = 1; i < tplData.length; i++) {
    var k = tplData[i][colClaveIdx] ? tplData[i][colClaveIdx].toString().trim() : "";
    var v = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
    if (k === "DOC_ORDENES") folderId = v;
    if (k === "DOC_ANALISIS") folderAnalysisId = v;
  }
  
  report += "CARPETAS DINÁMICAS:\n";
  
  // Verificar DOC_ORDENES
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      report += "✓ DOC_ORDENES → " + folder.getName() + "\n";
      successCount++;
    } catch (e) {
      report += "✗ DOC_ORDENES → ERROR: " + e.message + "\n";
      report += "  ID: " + folderId + "\n";
      errorCount++;
    }
  } else {
    report += "⚠ DOC_ORDENES → No configurado (requerido para buscar PDF de órdenes)\n";
    errorCount++;
  }
  
  // Verificar DOC_ANALISIS
  if (folderAnalysisId) {
    try {
      var aFolder = DriveApp.getFolderById(folderAnalysisId);
      report += "✓ DOC_ANALISIS (carpeta) → " + aFolder.getName() + "\n";
      successCount++;
    } catch (e) {
      report += "✗ DOC_ANALISIS (carpeta) → ERROR: " + e.message + "\n";
      report += "  ID: " + folderAnalysisId + "\n";
      errorCount++;
    }
  } else {
    report += "⚠ DOC_ANALISIS (carpeta) → No configurado\n";
  }
  
  report += "\nPLANTILLAS ESTÁTICAS:\n";
  
  for (var i = 1; i < tplData.length; i++) {
    var key = tplData[i][0] ? tplData[i][0].toString().trim() : "";
    var value = tplData[i][1] ? tplData[i][1].toString().trim() : "";
    
    if (key && key !== "Clave" && key !== "DOC_ORDENES" && key !== "DOC_ANALISIS" && key !== "DOC_COMPLETO" && key.indexOf("COORD_") === -1 && key !== "TPL_ORDEN") {
      if (value) {
        try {
          var file = DriveApp.getFileById(value);
          report += "✓ " + key + " → " + file.getName() + "\n";
          successCount++;
        } catch (e) {
          report += "✗ " + key + " → ERROR: " + e.message + "\n";
          errorCount++;
        }
      } else {
        report += "⚠ " + key + " → No configurado\n";
        errorCount++;
      }
    }
  }
  
  report += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  report += "✓ Accesibles: " + successCount + "\n";
  report += "✗ Con errores: " + errorCount + "\n";
  
  if (errorCount > 0) {
    report += "\n⚠️ ACCIÓN REQUERIDA:\n";
    report += "1. Verifique los IDs de las plantillas con error\n";
    report += "2. Asegúrese de que el script tenga permisos\n";
    report += "3. Consulte SOLUCION_PLANTILLAS.md para ayuda";
  }
  
  SpreadsheetApp.getUi().alert(report);
  Logger.log(report);
}

/**
 * Asegura que la columna ConsecutivoImp exista en la hoja Ordenes.
 * Si no existe, la crea antes de ImpresoPor o al final.
 * @param {Sheet} sheet - Hoja de Ordenes
 * @returns {boolean} true si se creó la columna, false si ya existía
 */
function ensureConsecutivoImpColumn_(sheet) {
  try {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Verificar si ya existe (case-insensitive)
    var colConsecutivoIdx = getColumnIndexByNameCaseInsensitive(headers, 'ConsecutivoImp', false);
    
    if (colConsecutivoIdx) {
      Logger.log('✓ Columna ConsecutivoImp ya existe en posición ' + colConsecutivoIdx);
      return false;
    }
    
    // Buscar posición de ImpresoPor
    var colImpresoIdx = getColumnIndexByNameCaseInsensitive(headers, 'ImpresoPor', false);
    
    if (!colImpresoIdx) {
      // Si no existe ImpresoPor, agregar al final
      var lastCol = sheet.getLastColumn();
      sheet.insertColumnAfter(lastCol);
      sheet.getRange(1, lastCol + 1).setValue('ConsecutivoImp');
      Logger.log('✓ Columna ConsecutivoImp creada al final (columna ' + (lastCol + 1) + ')');
    } else {
      // Insertar ANTES de ImpresoPor
      sheet.insertColumnBefore(colImpresoIdx);
      sheet.getRange(1, colImpresoIdx).setValue('ConsecutivoImp');
      Logger.log('✓ Columna ConsecutivoImp creada antes de ImpresoPor (columna ' + colImpresoIdx + ')');
    }
    
    // Inicializar todas las filas existentes con valor 0
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var newColIdx = getColumnIndexByNameCaseInsensitive(
        sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0], 
        'ConsecutivoImp', 
        true
      );
      var range = sheet.getRange(2, newColIdx, lastRow - 1, 1);
      var values = [];
      for (var i = 0; i < lastRow - 1; i++) {
        values.push([0]);
      }
      range.setValues(values);
      Logger.log('✓ Inicializadas ' + (lastRow - 1) + ' filas con valor 0');
    }
    
    return true;
    
  } catch (e) {
    Logger.log('❌ Error en ensureConsecutivoImpColumn_: ' + e.message);
    throw new Error('Error al verificar/crear columna ConsecutivoImp: ' + e.message);
  }
}

/**
 * Función interna de diagnóstico para verificar la columna ConsecutivoImp.
 * Retorna string con el resultado en lugar de mostrar alert.
 * @returns {string} Resultado del diagnóstico
 */
function runConsecutivoImpDiagnostic_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  
  if (!sheet) {
    throw new Error("Hoja 'Ordenes' no encontrada");
  }
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = getColumnIndexByNameCaseInsensitive(headers, 'ConsecutivoImp', false);
  
  if (!colIdx) {
    throw new Error("Columna 'ConsecutivoImp' no existe");
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return "ConsecutivoImp verificado (columna " + colIdx + ", sin órdenes)";
  }
  
  var values = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
  var invalidCount = 0;
  var maxConsecutivo = 0;
  
  for (var i = 0; i < values.length; i++) {
    var val = Number(values[i][0]);
    if (isNaN(val) || val < 0) {
      invalidCount++;
    } else if (val > maxConsecutivo) {
      maxConsecutivo = val;
    }
  }
  
  var result = "ConsecutivoImp verificado: " + (lastRow - 1) + " órdenes, máx=" + maxConsecutivo;
  if (invalidCount > 0) {
    result += " (⚠️ " + invalidCount + " inválidos)";
  }
  
  Logger.log("✓ " + result);
  return result;
}

/**
 * Función de diagnóstico para verificar la columna ConsecutivoImp (UI).
 * Muestra el resultado en un alert para uso manual desde el menú.
 */
function diagnosticarConsecutivoImp() {
  try {
    var result = runConsecutivoImpDiagnostic_();
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colIdx = getColumnIndexByNameCaseInsensitive(headers, 'ConsecutivoImp', false);
    var lastRow = sheet.getLastRow();
    
    if (lastRow < 2) {
      SpreadsheetApp.getUi().alert("Diagnóstico ConsecutivoImp\n\n✓ Columna en posición " + colIdx + "\n✓ No hay órdenes para verificar");
      return;
    }
    
    var values = sheet.getRange(2, colIdx, lastRow - 1, 1).getValues();
    var invalidCount = 0;
    var maxConsecutivo = 0;
    
    for (var i = 0; i < values.length; i++) {
      var val = Number(values[i][0]);
      if (isNaN(val) || val < 0) {
        invalidCount++;
      } else if (val > maxConsecutivo) {
        maxConsecutivo = val;
      }
    }
    
    var report = "✓ Columna 'ConsecutivoImp' en posición " + colIdx + "\n";
    report += "✓ Total de órdenes: " + (lastRow - 1) + "\n";
    report += "✓ Consecutivo máximo: " + maxConsecutivo + "\n";
    
    if (invalidCount > 0) {
      report += "⚠️ Valores inválidos encontrados: " + invalidCount;
    } else {
      report += "✓ Todos los valores son válidos";
    }
    
    SpreadsheetApp.getUi().alert("Diagnóstico ConsecutivoImp\n\n" + report);
    
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ Error en diagnóstico: " + e.message);
  }
}
