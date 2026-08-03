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
    sheet.getRange(rowIndex, cols.STATUS).setValue(VALORES_STATUS.REIMPRESO);
    
    var currentReimpresion = Number(sheet.getRange(rowIndex, cols.Reimpresion).getValue()) || 0;
    sheet.getRange(rowIndex, cols.Reimpresion).setValue(currentReimpresion + pagesPrinted);
    
    var currentReimpresoPor = sheet.getRange(rowIndex, cols.ReimpresoPor).getValue() || "";
    sheet.getRange(rowIndex, cols.ReimpresoPor).setValue(currentReimpresoPor ? currentReimpresoPor + ", " + newEntry : newEntry); 
  } else {
    sheet.getRange(rowIndex, cols.STATUS).setValue(VALORES_STATUS.IMPRESO);
    
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
    
    var email = (e.user && e.user.getEmail()) ? e.user.getEmail() : Session.getActiveUser().getEmail();
    var userIdentity = email || "Usuario no identificado (edición directa)";
    var nombreCorto = email ? email.split('@')[0] : "Usuario";
    
    // Obtener NombreCorto desde la hoja Usuarios usando Auth.gs si está disponible
    if (email && typeof getUserRecordsByEmail_ === 'function') {
      var userRecords = getUserRecordsByEmail_(email);
      if (userRecords && userRecords.length > 0) {
        userIdentity = userRecords[0].userId + " - " + (userRecords[0].nombreCorto || userRecords[0].userId);
        nombreCorto = userRecords[0].nombreCorto || userRecords[0].userId;
      }
    }
    
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

    if (sheetName === 'templates') {
      clearInitialDataCache();
      logChange('ACTUALIZACION_PLANTILLAS', 'Se detectó modificación en la hoja de plantillas. Caché limpiado automáticamente.', userIdentity);
      return;
    }

    if (sheetName === 'Ordenes') {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      var colProceso = getColumnIndexByNameCaseInsensitive(headers, 'Proceso', false);
      var colCodigo = getColumnIndexByNameCaseInsensitive(headers, 'Codigo', false);
      var colDescripcion = getColumnIndexByNameCaseInsensitive(headers, 'Descripcion', false);
      var cantDispAFechaCol = getColumnIndexByNameCaseInsensitive(headers, 'CantDispAFecha', false);
      var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoDocumentos', false);
      var colSolicitadoPor = getColumnIndexByNameCaseInsensitive(headers, 'SolicitadoPor', false) || getColumnIndexByNameCaseInsensitive(headers, 'SolicitadaPor', false);
      var verifCantCol = getColumnIndexByNameCaseInsensitive(headers, 'VerifCant. Disponible', false) || getColumnIndexByNameCaseInsensitive(headers, 'VerifCant.Disponible', false);
      
      var startRow = editedRange.getRow();
      var processNumRows = numRows;
      
      if (startRow > 1) { // Ignorar el encabezado
        // ==========================================
        // FASE 0: LIMPIEZA UNIFICADA DE FILAS
        // ==========================================
        var isClearedArray = []; 
        var procValues = colProceso ? sheet.getRange(startRow, colProceso, processNumRows, 1).getValues() : [];
        var codValues = colCodigo ? sheet.getRange(startRow, colCodigo, processNumRows, 1).getValues() : [];
        var descValues = colDescripcion ? sheet.getRange(startRow, colDescripcion, processNumRows, 1).getValues() : [];
        var anyRowCleared = false;
        
        for (var r = 0; r < processNumRows; r++) {
          var proc = procValues.length > 0 ? procValues[r][0].toString().trim() : "";
          var cod = codValues.length > 0 ? codValues[r][0].toString().trim() : "";
          var desc = descValues.length > 0 ? descValues[r][0].toString().trim() : "";
          
          if (proc === "" && cod === "" && desc === "") {
            isClearedArray.push(true);
            anyRowCleared = true;
          } else {
            isClearedArray.push(false);
          }
        }
        
        if (anyRowCleared) {
          var dispValues = cantDispAFechaCol ? sheet.getRange(startRow, cantDispAFechaCol, processNumRows, 1).getValues() : [];
          var estValues = colEstadoIdx ? sheet.getRange(startRow, colEstadoIdx, processNumRows, 1).getValues() : [];
          var solValues = colSolicitadoPor ? sheet.getRange(startRow, colSolicitadoPor, processNumRows, 1).getValues() : [];
          
          var changedDisp = false, changedEst = false, changedSol = false;
          
          for (var r = 0; r < processNumRows; r++) {
            if (isClearedArray[r]) {
              if (cantDispAFechaCol && dispValues[r][0] !== "") { dispValues[r][0] = ""; changedDisp = true; }
              if (colEstadoIdx && estValues[r][0] !== "") { estValues[r][0] = ""; changedEst = true; }
              if (colSolicitadoPor && solValues[r][0] !== "") { solValues[r][0] = ""; changedSol = true; }
            }
          }
          
          if (changedDisp) sheet.getRange(startRow, cantDispAFechaCol, processNumRows, 1).setValues(dispValues);
          if (changedEst) sheet.getRange(startRow, colEstadoIdx, processNumRows, 1).setValues(estValues);
          if (changedSol) sheet.getRange(startRow, colSolicitadoPor, processNumRows, 1).setValues(solValues);
        }

      // 1. Manejo dinámico e histórico de CantDispAFecha
      if (cantDispAFechaCol && verifCantCol) {
          
          // Forzar recálculo para asegurar que las fórmulas de VerifCant evaluaron la edición actual
          SpreadsheetApp.flush();
          
          var targetRangeCantDisp = sheet.getRange(startRow, cantDispAFechaCol, processNumRows, 1);
          var targetRangeVerif = sheet.getRange(startRow, verifCantCol, processNumRows, 1);
          
          var colLote = getColumnIndexByNameCaseInsensitive(headers, 'Lote', false);
          var colCodigo = getColumnIndexByNameCaseInsensitive(headers, 'Codigo', false);
          var lotes = colLote ? sheet.getRange(startRow, colLote, processNumRows, 1).getValues() : null;
          var codigos = colCodigo ? sheet.getRange(startRow, colCodigo, processNumRows, 1).getValues() : null;
          
          var cantDispValues = targetRangeCantDisp.getValues();
          var verifValues = targetRangeVerif.getValues();
          var updateNeeded = false;
          
          for (var r = 0; r < processNumRows; r++) {
            if (isClearedArray[r]) continue;
            var actualVerif = verifValues[r][0];
            var actualCantDisp = cantDispValues[r][0];
            var hasLote = lotes ? (lotes[r][0] !== "") : true;
            var hasCodigo = codigos ? (codigos[r][0] !== "") : true;
            
            // Regla A: Si CantDispAFecha está vacía, y ya hay Lote y Codigo, capturamos el inventario actual
            if (actualCantDisp === "" && actualVerif !== "" && actualVerif !== "-" && !isNaN(actualVerif) && hasLote && hasCodigo) {
              cantDispValues[r][0] = actualVerif;
              updateNeeded = true;
              logChange('AUTO_COPY_VERIFCANT', 'Captura inicial: ' + actualVerif + ' a CantDispAFecha en fila ' + (startRow + r), userIdentity);
            } 
            else if (actualCantDisp !== "") {
              // Regla B: Si ya se capturó antes, pero el usuario edita Cantidad o NoAnalisis (edición individual)
              if (numRows === 1 && numCols === 1) {
                var editedColName = headers[editedRange.getColumn() - 1];
                if (editedColName === 'Cantidad' || editedColName === 'NoAnalisis') {
                   // Validar que exista un número nuevo válido y diferente al histórico
                   if (actualVerif !== "" && actualVerif !== "-" && !isNaN(actualVerif) && actualVerif !== actualCantDisp) {
                     var ui = SpreadsheetApp.getUi();
                     var response = ui.alert(
                       'Actualización de Inventario',
                       'Has modificado la columna "' + editedColName + '" en la fila ' + startRow + '.\n\n¿Deseas actualizar el registro histórico de "CantDispAFecha" con el valor de inventario actual disponible (' + actualVerif + ')?\n\n(Valor guardado actualmente: ' + actualCantDisp + ')',
                       ui.ButtonSet.YES_NO
                     );
                     if (response === ui.Button.YES) {
                       cantDispValues[r][0] = actualVerif;
                       updateNeeded = true;
                       logChange('ACTUALIZACION_CANT_DISP', 'Usuario actualizó CantDispAFecha de ' + actualCantDisp + ' a ' + actualVerif + ' tras modificar ' + editedColName + ' en fila ' + startRow, userIdentity);
                     }
                   }
                }
              }
            }
          }
          
          if (updateNeeded) {
            targetRangeCantDisp.setValues(cantDispValues);
          }
        }
      }
      
      // 2. Manejo de cambios en NoOrden o NoAnalisis (para validación masiva y simple)
      var colOrdenCol = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);
      var colAnalisisCol = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
      
      var editIntersectsRefs = false;
      var startCol = editedRange.getColumn();
      var endCol = startCol + numCols - 1;
      
      if (colOrdenCol && startCol <= colOrdenCol && endCol >= colOrdenCol) editIntersectsRefs = true;
      if (colAnalisisCol && startCol <= colAnalisisCol && endCol >= colAnalisisCol) editIntersectsRefs = true;
      
      if (editIntersectsRefs) {
        var startRow = editedRange.getRow();
        var processNumRows = numRows;
        
        // Evitar procesar encabezado
        if (startRow === 1) {
          startRow = 2;
          processNumRows--;
        }
        
        if (processNumRows > 0) {
          if (processNumRows > 1) SpreadsheetApp.getActiveSpreadsheet().toast("Validando documentos en Drive para " + processNumRows + " filas...", "Sistema QMS", 3);
          
          for (var r = 0; r < processNumRows; r++) {
            // Ajuste de indice ya que Block 2 puede evitar el encabezado dinamicamente
            var isClearedIdx = (startRow === 2 && editedRange.getRow() === 1) ? r + 1 : r;
            if (isClearedArray[isClearedIdx]) continue;
            actualizarEstadoDocumentosEnHoja(sheet, startRow + r, headers);
          }
          
          if (processNumRows > 1) SpreadsheetApp.getActiveSpreadsheet().toast("Validación masiva completada.", "Sistema QMS", 3);
          
          logChange('CAMBIO_NO_ORDEN_ANALISIS', 'Revisión en Drive disparada por cambio en NoOrden/NoAnalisis para ' + processNumRows + ' filas.', userIdentity);
        }
      }

      // 3. Auto-tracking de "SolicitadoPor" (quién pegó/editó la fila)
      var colSolicitadoPor = getColumnIndexByNameCaseInsensitive(headers, 'SolicitadoPor', false) || getColumnIndexByNameCaseInsensitive(headers, 'SolicitadaPor', false);
      
      if (colSolicitadoPor) {
        var intersectsSolicitadoPor = (startCol <= colSolicitadoPor && endCol >= colSolicitadoPor);
        
        // 1. Definimos explícitamente las columnas objetivo que deben disparar el registro
        var targetHeaders = ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden'];
        var targetColIndices = [];
        
        // 2. Buscamos dinámicamente el índice actual de cada una
        for (var h = 0; h < targetHeaders.length; h++) {
          var idx = getColumnIndexByNameCaseInsensitive(headers, targetHeaders[h], false);
          if (idx) targetColIndices.push(idx);
        }
        
        // 3. Validamos si la edición (desde startCol hasta endCol) tocó alguna de estas columnas
        var tocaColumnasDatos = false;
        for (var c = startCol; c <= endCol; c++) {
          if (targetColIndices.indexOf(c) !== -1) {
            tocaColumnasDatos = true;
            break;
          }
        }
        
        // Procesamos la trazabilidad SOLO si la edición tocó las columnas de datos
        // y no editaron SOLO esa columna de SolicitadoPor manualmente
        if (tocaColumnasDatos && !(intersectsSolicitadoPor && numCols === 1)) {
          var iterStartRow = editedRange.getRow();
          var iterNumRows = numRows;
          
          if (iterStartRow === 1) {
            iterStartRow = 2;
            iterNumRows--;
          }
          
          if (iterNumRows > 0) {
            var targetRange = sheet.getRange(iterStartRow, colSolicitadoPor, iterNumRows, 1);
            var currentValues = targetRange.getValues();
            // Validamos usando las primeras 3 columnas (Proceso, Codigo, Descripcion)
            var firstColRange = sheet.getRange(iterStartRow, 1, iterNumRows, 3).getValues(); 
            var updateNeeded = false;
            
            var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yy HH:mm");
            var baseStamp = nombreCorto + " (" + timestamp + ")";
            
            for (var i = 0; i < iterNumRows; i++) {
              var isClearedIdx = (iterStartRow === 2 && editedRange.getRow() === 1) ? i + 1 : i;
              if (isClearedArray[isClearedIdx]) continue;
              
              var hasData = firstColRange[i].join("").trim() !== "";
              var currVal = currentValues[i][0] ? currentValues[i][0].toString() : "";
              
              if (!hasData) {
                if (currVal !== "") {
                  currentValues[i][0] = "";
                  updateNeeded = true;
                }
                continue;
              }
              
              // Si la celda está vacía O si el usuario pegó una fila completa (arrastrando basura vieja en esta col)
              if (currVal === "" || intersectsSolicitadoPor) {
                 currentValues[i][0] = "Crea: " + baseStamp;
                 updateNeeded = true;
              } else {
                 var lines = currVal.split("\n");
                 var newLine = lines[0]; // Mantiene original Crea:
                 
                 var allowMod = false;
                 
                 // Arquitectura Híbrida: Solo evaluamos "Mod:" en ediciones individuales
                 if (iterNumRows === 1) {
                   // 1. Cambio Duro (Sobreescritura / Borrado): e.oldValue tiene datos
                   if (e.oldValue !== undefined && e.oldValue !== "") {
                     allowMod = true;
                   } 
                   // 2. Llenado de celda en blanco: verificamos madurez de la fila (30 mins)
                   else {
                     var creaMatch = newLine.match(/Crea: .* \((.*?)\)/);
                     var creaMs = 0;
                     if (creaMatch) {
                       var p = creaMatch[1].split(" ");
                       if (p.length === 2) {
                         var d = p[0].split("/");
                         var t = p[1].split(":");
                         if (d.length === 3 && t.length === 2) {
                           creaMs = new Date(2000 + parseInt(d[2], 10), parseInt(d[1], 10) - 1, parseInt(d[0], 10), parseInt(t[0], 10), parseInt(t[1], 10)).getTime();
                         }
                       }
                     }
                     var nowMs = new Date().getTime();
                     // Si pasaron más de 30 minutos (1800000 ms) o si ya tenía un Mod previo
                     if ((nowMs - creaMs > 1800000) || lines.length > 1) {
                       allowMod = true;
                     }
                   }
                 }
                 
                 if (allowMod) {
                   newLine += "\nMod: " + baseStamp;
                   if (currVal !== newLine) {
                     currentValues[i][0] = newLine;
                     updateNeeded = true;
                   }
                 }
              }
            }
            
            if (updateNeeded) {
              targetRange.setValues(currentValues);
            }
          }
        }
      }
      
      // Si es edición simple en NoOrden/NoAnalisis, retornar temprano para no saturar Logs de celda
      if (numRows === 1 && numCols === 1 && editIntersectsRefs) return;
    }
    
    if (numRows === 1 && numCols === 1) {
      var oldValue = e.oldValue !== undefined ? e.oldValue : "(vacío)";
      var newValue = e.value !== undefined ? e.value : "(vacío)";
      var cellAddress = editedRange.getA1Notation();
      
      var editDesc = "📍 Hoja: " + sheetName + "\n" +
                     "🎯 Celda: " + cellAddress + "\n" +
                     "🔴 Antes: " + oldValue + "\n" +
                     "🟢 Ahora: " + newValue;
                     
      var logType = (sheetName === 'RegistroNovedad') ? 'EDICION_MANUAL_NOVEDAD' : 'EDICION_CELDA';
      logChange(logType, editDesc, userIdentity);
    } else {
      var rangeA1 = editedRange.getA1Notation();
      var values = editedRange.getValues();
      var summaryRows = [];
      var maxRows = Math.min(10, values.length);
      var allEmpty = true;
      
      for (var r = 0; r < maxRows; r++) {
        var isRowEmpty = true;
        var rowStr = values[r].map(function(v) { 
          if (v !== "") { allEmpty = false; isRowEmpty = false; }
          if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "dd/MM/yyyy");
          return v === "" ? "(vacío)" : v; 
        }).join(" | ");
        
        if (!isRowEmpty) {
          summaryRows.push("▶ Fila " + (r + 1) + ": [" + rowStr + "]");
        } else {
          summaryRows.push("▶ Fila " + (r + 1) + ": [Borrada / Vacía]");
        }
      }
      
      // Chequear todo el rango más allá de las maxRows para ver si fue un borrado total
      for (var rr = maxRows; rr < values.length && allEmpty; rr++) {
        for (var cc = 0; cc < values[rr].length; cc++) {
          if (values[rr][cc] !== "") { allEmpty = false; break; }
        }
      }
      
      var valuesDesc = "";
      var massEditDesc = "";
      
      if (allEmpty) {
        massEditDesc = "📋 Borrado Masivo en: " + sheetName + "\n" +
                       "📍 Rango: " + rangeA1 + " (" + (numRows * numCols) + " celdas)\n" +
                       "🔴 Todas las celdas de este rango fueron borradas o vaciadas.";
      } else {
        valuesDesc = summaryRows.join("\n");
        if (values.length > 10) valuesDesc += "\n... (y " + (values.length - 10) + " filas más)";
        
        massEditDesc = "📋 Edición Masiva en: " + sheetName + "\n" +
                       "📍 Rango: " + rangeA1 + " (" + (numRows * numCols) + " celdas)\n" +
                       "Nuevos Valores ingresados:\n" + valuesDesc;
      }
                         
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
  var dictTipos = {
    'GENERACION_PDF_FINAL': 'Generación de PDF',
    'EDICION_MASIVA': 'Edición Masiva',
    'ASIGNACION_PENDIENTE_OA': 'Asignación a Pendiente (OA)',
    'EDICION_CELDA': 'Edición de Celda',
    'CARGA_DOCUMENTO': 'Carga de Documento',
    'ERROR_SISTEMA': 'Error del Sistema',
    'REGISTRO_NOVEDAD': 'Registro de Novedad',
    'VIOLACION_PERMISO': 'Violación de Permisos',
    'RESET_CARGA_OA': 'Reinicio de Carga (OA)',
    'RESET_CARGA_COA': 'Reinicio de Carga (COA)',
    'ASIGNACION_PENDIENTE_COA': 'Asignación a Pendiente (COA)',
    'INICIALIZACION': 'Inicialización del Sistema',
    'EDICION_MANUAL_NOVEDAD': 'Edición de Novedad',
    'EDICION_MASIVA_NOVEDAD': 'Edición Masiva de Novedades'
  };
  var tipoNatural = dictTipos[tipoCambio] ? dictTipos[tipoCambio] : tipoCambio;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');
  
  if (!sheetLogs) {
    Logger.log("⚠️ Hoja Logs no existe. Creando hoja Logs.");
    sheetLogs = ss.insertSheet('Logs');
    sheetLogs.getRange(1, 1, 1, 4).setValues([['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']]);
  }
  
  var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var user = userIdentity || "Sistema";
  
  sheetLogs.appendRow([timestamp, user, tipoNatural, descripcion]);
  Logger.log("✓ " + tipoNatural + " registrado en Logs");
}

/**
 * Función manual ejecutada desde el menú para forzar la actualización del estado
 * de los documentos en base a lo que realmente hay en Drive.
 * Se aplica a las filas seleccionadas o a todas si solo hay una celda seleccionada.
 */
function forzarActualizacionEstadoDocumentos() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    
    if (sheet.getName() !== 'Ordenes') {
      SpreadsheetApp.getUi().alert('Esta función solo se puede usar en la hoja Ordenes.');
      return;
    }
    
    var selection = sheet.getActiveRange();
    var startRow = selection.getRow();
    var numRows = selection.getNumRows();
    var maxRows = sheet.getLastRow();
    
    // Si seleccionaron toda la hoja (o solo 1 celda), preguntar si quieren procesar todo
    if (numRows === 1 || startRow === 1) {
      var ui = SpreadsheetApp.getUi();
      var response = ui.alert('Confirmación', '¿Desea escanear y actualizar toda la hoja contra Drive? (Esto puede tardar unos segundos)', ui.ButtonSet.YES_NO);
      if (response !== ui.Button.YES) return;
      
      startRow = 2; // Ignorar encabezado
      numRows = maxRows - 1;
    }
    
    if (numRows < 1) return;
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    SpreadsheetApp.getActiveSpreadsheet().toast("Escaneando " + numRows + " filas en Drive...", "Sistema QMS", 5);
    
    var actualizadas = 0;
    for (var r = 0; r < numRows; r++) {
      var currentRow = startRow + r;
      if (currentRow > maxRows) break;
      
      actualizarEstadoDocumentosEnHoja(sheet, currentRow, headers);
      actualizadas++;
    }
    
    SpreadsheetApp.getActiveSpreadsheet().toast("✅ " + actualizadas + " filas validadas exitosamente.", "Sistema QMS", 5);
  } catch (e) {
    Logger.log("Error en forzarActualizacionEstadoDocumentos: " + e.message);
    SpreadsheetApp.getUi().alert("Error", "Ocurrió un error al validar: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
