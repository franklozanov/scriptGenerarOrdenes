// ============================================================
// MODULE: Diagnostics
// Descripción: Herramientas de diagnóstico del sistema
// Prioridad de Carga: 10° (solo lectura, dependencias mínimas)
// ============================================================

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
 * Función para diagnosticar la salud de las Matrices K activas.
 * @returns {Array<Object>} Lista de resultados por cada matriz
 */
function diagnosticarMatricesConfig() {
  var matrices = getMatricesActivasOrdenadas();
  var resultados = [];
  
  if (matrices.length === 0) {
    return [{ status: 'warning', nombre: 'Global', mensaje: 'No hay matrices activas configuradas.' }];
  }
  
  for (var i = 0; i < matrices.length; i++) {
    var matriz = matrices[i];
    var res = { nombre: matriz.nombreMatriz, status: 'ok', mensaje: 'Conexión y columnas verificadas correctamente.' };
    
    try {
      var ssK = SpreadsheetApp.openById(matriz.idArchivo);
      var sheetK = ssK.getSheetByName(matriz.nombrePestana);
      
      if (!sheetK) {
        res.status = 'error';
        res.mensaje = "Pestaña '" + matriz.nombrePestana + "' no encontrada.";
        resultados.push(res);
        continue;
      }
      
      var headers = sheetK.getRange(1, 1, 1, sheetK.getLastColumn()).getValues()[0];
      var checkCols = [matriz.columnaLlave, matriz.columnaLote, matriz.columnaCantidad, matriz.columnaVencimiento];
      if (matriz.columnaFabricante) checkCols.push(matriz.columnaFabricante);
      
      var missing = [];
      for (var c = 0; c < checkCols.length; c++) {
        var cName = checkCols[c].toString().trim();
        if (!cName) continue;
        if (!getColumnIndexByNameCaseInsensitive(headers, cName, false)) {
          missing.push(cName);
        }
      }
      
      if (missing.length > 0) {
        res.status = 'error';
        res.mensaje = "Columnas faltantes: " + missing.join(', ');
      }
      
    } catch (e) {
      res.status = 'error';
      res.mensaje = "Error de acceso: " + e.message;
    }
    
    resultados.push(res);
  }
  
  return resultados;
}
