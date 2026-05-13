// ============================================================
// MODULE: Traceability
// Descripción: Sistema de auditoría y trazabilidad de cambios
// Prioridad de Carga: 6° (depende de Auth y Helpers)
// ============================================================

/**
 * Wrapper público para actualizar trazabilidad (llamado desde Index.html).
 */
function updateTraceability(orderNo, userId, pagesPrinted, printType) {
  return internalUpdateTraceability(orderNo, userId, pagesPrinted, printType);
}

/**
 * Actualiza la trazabilidad de impresión en la hoja Ordenes.
 * @param {string} orderNo - Número de orden
 * @param {string} userId - UserID del usuario que imprime
 * @param {number} pagesPrinted - Número de páginas impresas
 * @param {string} printType - "Primera" o "Reimpresion"
 * @returns {string} Mensaje de confirmación
 */
function internalUpdateTraceability(orderNo, userId, pagesPrinted, printType) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  if (!sheet) throw new Error("Sheet 'Ordenes' not found.");

  var userRecord = getUserRecordByUserId_(userId);
  if (!userRecord) throw new Error("UserID no existe en la hoja Usuarios: " + userId);
  var nombreCorto = userRecord.nombreCorto || userRecord.userId;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var cols = {
    NoOrden: getColumnIndexByNameCaseInsensitive(headers, "NoOrden", true),
    STATUS: getColumnIndexByNameCaseInsensitive(headers, "STATUS", true),
    NoPags: getColumnIndexByNameCaseInsensitive(headers, "NoPags", true),
    Reimpresion: getColumnIndexByNameCaseInsensitive(headers, "Reimpresion", true),
    TotalPags: getColumnIndexByNameCaseInsensitive(headers, "TotalPags", true),
    ConsecutivoImp: getColumnIndexByNameCaseInsensitive(headers, "ConsecutivoImp", true),
    ImpresoPor: getColumnIndexByNameCaseInsensitive(headers, "ImpresoPor", true),
    ReimpresoPor: getColumnIndexByNameCaseInsensitive(headers, "Reimpreso", false) || getColumnIndexByNameCaseInsensitive(headers, "ReimpresoPor", true)
  };

  var colNoOrdenData = sheet.getRange(1, cols.NoOrden, sheet.getLastRow(), 1).getValues();
  var rowIndex = -1;
  for (var i = 1; i < colNoOrdenData.length; i++) { if (colNoOrdenData[i][0] == orderNo) { rowIndex = i + 1; break; } }

  if (rowIndex === -1) throw new Error("Row lost during update.");

  var consecutivo = Number(sheet.getRange(rowIndex, cols.ConsecutivoImp).getValue()) || 0;
  
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  
  var newEntry = consecutivo + "-" + nombreCorto + " " + timestamp + " (" + pagesPrinted + ")";

  function sumCsv(csvString) {
    if (!csvString) return 0;
    var parts = csvString.toString().split(",");
    var sum = 0;
    for (var p = 0; p < parts.length; p++) {
      sum += Number(parts[p].trim()) || 0;
    }
    return sum;
  }

  if (printType === "Reimpresion") {
    sheet.getRange(rowIndex, cols.STATUS).setValue("Reimpreso");
    
    var currentReimpresion = Number(sheet.getRange(rowIndex, cols.Reimpresion).getValue()) || 0;
    sheet.getRange(rowIndex, cols.Reimpresion).setValue(currentReimpresion + pagesPrinted);
    
    var currentReimpresoPor = sheet.getRange(rowIndex, cols.ReimpresoPor).getValue() || "";
    sheet.getRange(rowIndex, cols.ReimpresoPor).setValue(currentReimpresoPor ? currentReimpresoPor + ", " + newEntry : newEntry); 
  } else {
    sheet.getRange(rowIndex, cols.STATUS).setValue("Impreso");
    
    var currentNoPags = Number(sheet.getRange(rowIndex, cols.NoPags).getValue()) || 0;
    sheet.getRange(rowIndex, cols.NoPags).setValue(currentNoPags + pagesPrinted);
    
    var currentImpresoPor = sheet.getRange(rowIndex, cols.ImpresoPor).getValue() || "";
    sheet.getRange(rowIndex, cols.ImpresoPor).setValue(currentImpresoPor ? currentImpresoPor + ", " + newEntry : newEntry); 
  }

  var finalNoPags = Number(sheet.getRange(rowIndex, cols.NoPags).getValue()) || 0;
  var finalReimpresion = Number(sheet.getRange(rowIndex, cols.Reimpresion).getValue()) || 0;
  sheet.getRange(rowIndex, cols.TotalPags).setValue(finalNoPags + finalReimpresion);

  return "Record updated successfully.";
}

/**
 * Configura el trigger instalable para auditoría de ediciones.
 */
function setupAuditTrailTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditInstalled') {
      Logger.log("⚠️ Disparador onEditInstalled ya existe");
      return;
    }
  }
  
  ScriptApp.newTrigger('onEditInstalled')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  
  Logger.log("✓ Disparador onEditInstalled creado");
}

/**
 * Trigger instalable que registra todas las ediciones en la hoja Logs.
 * Incluye validación de permisos y lógica especial para columnas específicas.
 */
function onEditInstalled(e) {
  try {
    if (!e || !e.range || !e.source) return;
    
    if (e.source.getActiveSheet().getName() === 'Logs') return;
    
    var editedRange = e.range;
    var sheet = editedRange.getSheet();
    var sheetName = sheet.getName();
    
    var sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var allRangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    var overlappingProtections = sheetProtections.slice();
    
    var eRow = editedRange.getRow();
    var eCol = editedRange.getColumn();

    // CORREGIDO: Solo ignorar si NO hay objeto evento (ediciones programáticas)
    // Las ediciones manuales del propietario SÍ deben registrarse
    if (!e || !e.range) return;

    for (var j = 0; j < allRangeProtections.length; j++) {
      var pRange = allRangeProtections[j].getRange();
      if (eRow >= pRange.getRow() && eRow <= pRange.getLastRow() &&
          eCol >= pRange.getColumn() && eCol <= pRange.getLastColumn()) {
        overlappingProtections.push(allRangeProtections[j]);
      }
    }
    
    var hasPermission = true;
    var protectionDesc = "";
    
    for (var i = 0; i < overlappingProtections.length; i++) {
      var protection = overlappingProtections[i];
      if (!protection.canEdit()) {
        hasPermission = false;
        protectionDesc = protection.getDescription() || "protegido";
        break;
      }
    }
    
    var userIdentity = "Usuario no identificado (edición directa)";
    
    if (!hasPermission) {
      editedRange.setValue(e.oldValue !== undefined ? e.oldValue : "");
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "Este rango está protegido (" + protectionDesc + "). Cambio revertido.",
        "⚠️ Edición no permitida",
        5
      );
      var cellAddress = editedRange.getA1Notation();
      var violationDesc = "Intento de edición denegado en la celda " + cellAddress + " de la hoja " + sheetName;
      logChange('VIOLACION_PERMISO', violationDesc, userIdentity);
      return;
    }
    
    var numRows = editedRange.getNumRows();
    var numCols = editedRange.getNumColumns();

    if (sheetName === 'Ordenes' && numRows === 1 && numCols === 1) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      var editedColName = headers[editedRange.getColumn() - 1];
      
      if (editedColName === 'VerifCant. Disponible') {
        var oldValue = e.oldValue;
        var newValue = e.value;

        if (oldValue === '-' && newValue !== undefined && newValue !== '' && !isNaN(newValue)) {
          var numNewValue = Number(newValue);
          if (numNewValue > 0) {
            var rowIdx = editedRange.getRow();
            var cantDispAFechaCol = getColumnIndexByNameCaseInsensitive(headers, 'CantDispAFecha', false);
            
            if (cantDispAFechaCol) {
              sheet.getRange(rowIdx, cantDispAFechaCol).setValue(numNewValue);
              logChange(
                'AUTO_COPY_VERIFCANT', 
                'Copiado automáticamente ' + numNewValue + ' de "VerifCant. Disponible" a "CantDispAFecha" en fila ' + rowIdx, 
                userIdentity
              );
              SpreadsheetApp.getActiveSpreadsheet().toast(
                'Cantidad disponible copiada automáticamente: ' + numNewValue,
                'Sistema QMS',
                3
              );
            } else {
              Logger.log("ADVERTENCIA: Columna 'CantDispAFecha' no encontrada para auto-copia.");
            }
          }
        }
      }

      var colAdjuntoCol = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOrden', false);
      var colOrdenCol = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);

      if (colOrdenCol && editedRange.getColumn() === colOrdenCol) {
        var rowIdx = editedRange.getRow();
        var adjuntoValue = sheet.getRange(rowIdx, colAdjuntoCol).getValue();
        var adjuntoStr = adjuntoValue ? adjuntoValue.toString().trim() : "";
        
        if (adjuntoStr === "✅ Cargado") {
          var nuevoValor = e.value !== undefined ? e.value : "(vacío)";
          var valorAnterior = e.oldValue !== undefined ? e.oldValue : "(vacío)";
          
          sheet.getRange(rowIdx, colAdjuntoCol).setValue("Pendiente");
          sheet.getRange(rowIdx, colAdjuntoCol).clearNote();
          
          logChange('RESET_CARGA', 'NoOrden cambiado de ' + valorAnterior + ' a ' + nuevoValor + '. Estado devuelto a Pendiente.', userIdentity);
          SpreadsheetApp.getActiveSpreadsheet().toast("No. Orden modificado. El estado del adjunto ha vuelto a 'Pendiente'.", "Aviso del Sistema", 5);
          return;
        }
        
        if (adjuntoStr === "" && e.value !== undefined && e.value !== "") {
          sheet.getRange(rowIdx, colAdjuntoCol).setValue("Pendiente");
          logChange('ASIGNACION_PENDIENTE', 'NoOrden asignado. Estado de AdjuntoOrden establecido a Pendiente.', userIdentity);
          return;
        }
      }
    }
    
    if (numRows === 1 && numCols === 1) {
      var oldValue = e.oldValue !== undefined ? e.oldValue : "(vacío)";
      var newValue = e.value !== undefined ? e.value : "(vacío)";
      var cellAddress = editedRange.getA1Notation();
      var editDesc = "Cambió '" + oldValue + "' por '" + newValue + "' en la celda " + cellAddress + " de la hoja " + sheetName;
      var logType = (sheetName === 'RegistroNovedad') ? 'EDICION_MANUAL_NOVEDAD' : 'EDICION_CELDA';
      logChange(logType, editDesc, userIdentity);
    } else {
      var rangeA1 = editedRange.getA1Notation();
      var massEditDesc = "Edición masiva en el rango " + rangeA1 + " de la hoja " + sheetName;
      var logTypeMass = (sheetName === 'RegistroNovedad') ? 'EDICION_MASIVA_NOVEDAD' : 'EDICION_MASIVA';
      logChange(logTypeMass, massEditDesc, userIdentity);
    }
    
  } catch (error) {
    Logger.log("ERROR FATAL en onEditInstalled: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    try {
      logChange('ERROR_SISTEMA', 'Error en onEditInstalled: ' + error.message, 'Sistema');
    } catch (logError) {
      Logger.log("No se pudo registrar el error en Logs: " + logError.message);
    }
  }
}

/**
 * Registra un cambio en la hoja Logs.
 * @param {string} tipoCambio - Tipo de cambio (ej: EDICION_CELDA, CARGA_DOCUMENTO)
 * @param {string} descripcion - Descripción del cambio
 * @param {string} userIdentity - Identidad del usuario (formato: UserID - NombreCorto)
 */
function logChange(tipoCambio, descripcion, userIdentity) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');
  
  if (!sheetLogs) {
    Logger.log("⚠️ Hoja Logs no existe. Creando hoja Logs.");
    sheetLogs = ss.insertSheet('Logs');
    sheetLogs.getRange(1, 1, 1, 4).setValues([['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']]);
  }
  
  var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var user = userIdentity || "Sistema";
  
  sheetLogs.appendRow([timestamp, user, tipoCambio, descripcion]);
  Logger.log("✓ " + tipoCambio + " registrado en Logs");
}
