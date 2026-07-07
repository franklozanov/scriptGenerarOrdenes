// ============================================================
// MODULE: Diagnostics
// Descripción: Herramientas de diagnóstico del sistema
// Prioridad de Carga: 10° (solo lectura, dependencias mínimas)
// ============================================================

/**
 * Escanea la hoja 'templates' y verifica acceso a carpetas dinámicas y plantillas estáticas.
 * @returns {Array<Object>} Lista de resultados por cada plantilla/variable ({status, nombre, mensaje}).
 */
function diagnosticarPlantillasConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tplSheet = ss.getSheetByName('templates');
  if (!tplSheet) {
    return [{ status: 'error', nombre: 'templates', mensaje: 'La hoja "templates" no existe.' }];
  }

  var tplData = tplSheet.getDataRange().getValues();
  var resultados = [];

  var headers = tplData[0];

  // Obtener índices de columnas por nombre
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
  var colValorIdx = getColumnIndexByNameCaseInsensitive(headers, 'Valor', false);
  var colTypeIdx = getColumnIndexByNameCaseInsensitive(headers, 'Type', false);

  // Si alguna columna no existe, usar índices por defecto
  if (!colClaveIdx) colClaveIdx = 1;
  if (!colValorIdx) colValorIdx = 2;

  // Convertir a base-0 para acceso a array
  colClaveIdx = colClaveIdx - 1;
  colValorIdx = colValorIdx - 1;
  if (colTypeIdx) colTypeIdx = colTypeIdx - 1;

  for (var i = 1; i < tplData.length; i++) {
    var key = tplData[i][colClaveIdx] ? tplData[i][colClaveIdx].toString().trim() : "";
    var rawValue = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
    var value = rawValue ? extractDriveId(rawValue) : "";
    var type = (colTypeIdx !== undefined && colTypeIdx !== null && tplData[i][colTypeIdx]) ? tplData[i][colTypeIdx].toString().trim() : "";

    if (!key || key === "Clave") continue;

    // Lógica retrocompatible si no hay columna Type
    if (!type) {
        if (key === "DOC_ORDENES" || key === "DOC_ANALISIS" || key === "DOC_COMPLETO") type = "Folder";
        else if (key.indexOf("COORD_") !== -1) type = "Coordinate";
        else type = "File";
    }

    if (type === "Folder") {
      if (value) {
        try {
          var folder = DriveApp.getFolderById(value);
          resultados.push({ status: 'ok', nombre: key, mensaje: '[Carpeta] → ' + folder.getName() });
        } catch (e) {
          resultados.push({ status: 'error', nombre: key, mensaje: '[Carpeta] → ERROR: ' + e.message });
        }
      } else {
        resultados.push({ status: 'warning', nombre: key, mensaje: '[Carpeta] → No configurado' });
      }
    } else if (type === "File") {
      // Ignoramos TPL_ORDEN porque no es de Drive sino un HTML
      if (key === "TPL_ORDEN") continue;

      if (value) {
        try {
          var file = DriveApp.getFileById(value);
          resultados.push({ status: 'ok', nombre: key, mensaje: '[Archivo] → ' + file.getName() });
        } catch (e) {
          resultados.push({ status: 'error', nombre: key, mensaje: '[Archivo] → ERROR: ' + e.message });
        }
      } else {
        resultados.push({ status: 'warning', nombre: key, mensaje: '[Archivo] → No configurado' });
      }
    } else if (type === "Coordinate") {
      if (rawValue.match(/x:\s*[0-9.]+/i) && rawValue.match(/y:\s*[0-9.]+/i)) {
          resultados.push({ status: 'ok', nombre: key, mensaje: '[Coordenada] → Formato correcto (' + rawValue + ')' });
      } else if (!rawValue || rawValue === "N/A" || rawValue === "FALSE") {
          resultados.push({ status: 'warning', nombre: key, mensaje: '[Coordenada] → No configurada o inactiva' });
      } else {
          resultados.push({ status: 'error', nombre: key, mensaje: "[Coordenada] → Formato incorrecto. Se esperaba 'x: N, y: N'. Se recibió: " + rawValue });
      }
    } else {
       resultados.push({ status: 'warning', nombre: key, mensaje: "[Desconocido] → Tipo '" + type + "' no soportado" });
    }
  }

  return resultados;
}

/**
 * Función de diagnóstico para verificar el estado de las plantillas (uso manual desde el editor).
 * Verifica acceso a carpetas dinámicas y plantillas estáticas y muestra un reporte en un alert.
 */
function diagnosticarPlantillas() {
  var resultados = diagnosticarPlantillasConfig();
  var report = "📋 DIAGNÓSTICO DE PLANTILLAS\n\n";
  var errorCount = 0;
  var successCount = 0;

  resultados.forEach(function(r) {
    var prefix = r.status === 'ok' ? '✓' : (r.status === 'error' ? '✗' : '⚠');
    report += prefix + ' ' + r.nombre + ' → ' + r.mensaje + '\n';
    if (r.status === 'ok') successCount++;
    else if (r.status === 'error') errorCount++;
  });

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

/**
 * Verifica la columna ConsecutivoImp en la hoja Ordenes y devuelve el resultado estructurado.
 * @returns {Array<Object>} Lista de un único resultado ({status, nombre, mensaje}).
 */
function diagnosticarConsecutivoImpConfig() {
  try {
    var mensaje = runConsecutivoImpDiagnostic_();
    var status = mensaje.indexOf('⚠️') !== -1 ? 'warning' : 'ok';
    return [{ status: status, nombre: 'ConsecutivoImp', mensaje: mensaje }];
  } catch (e) {
    return [{ status: 'error', nombre: 'ConsecutivoImp', mensaje: e.message }];
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
