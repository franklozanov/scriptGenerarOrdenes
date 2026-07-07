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

  // ID de correlación compartido entre los distintos artefactos que esta única acción de
  // impresión puede generar (Logs del evento de impresión + cierre de solicitud asociada),
  // para poder reconstruir en la hoja Logs que pertenecen a la misma operación.
  var correlationId = Utilities.getUuid().substring(0, 8);

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

  // Una sola lectura de la fila completa (en vez de una llamada de servicio por celda) para
  // minimizar el tiempo que esta operación permanece bajo el LockService de impresión.
  var rowValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  var consecutivo = Number(rowValues[cols.ConsecutivoImp - 1]) || 0;

  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

  var newEntry = consecutivo + "-" + nombreCorto + " " + timestamp + " (" + pagesPrinted + ")";

  // Capturar STATUS previo para distinguir impresión Inicial vs Adicional en el historial
  var prevStatus = rowValues[cols.STATUS - 1];
  prevStatus = prevStatus ? prevStatus.toString().trim() : "";

  // Normalizar el tipo para tolerar variantes de acento/caso ('Reimpresión' vs 'Reimpresion')
  var esReimpresion = isReimpresionType_(printType);

  var etiquetaEvento;

  if (esReimpresion) {
    rowValues[cols.STATUS - 1] = VALORES_STATUS.REIMPRESO;

    // La reimpresión se registra por separado y NO suma a TotalPags (copias válidas)
    var currentReimpresion = Number(rowValues[cols.Reimpresion - 1]) || 0;
    rowValues[cols.Reimpresion - 1] = currentReimpresion + pagesPrinted;

    var currentReimpresoPor = rowValues[cols.ReimpresoPor - 1] || "";
    rowValues[cols.ReimpresoPor - 1] = currentReimpresoPor ? currentReimpresoPor + ", " + newEntry : newEntry;

    etiquetaEvento = "REIMPRESIÓN";
  } else {
    rowValues[cols.STATUS - 1] = VALORES_STATUS.IMPRESO;

    // Impresión inicial y adicional suman a NoPags (copias válidas)
    var currentNoPags = Number(rowValues[cols.NoPags - 1]) || 0;
    rowValues[cols.NoPags - 1] = currentNoPags + pagesPrinted;

    var currentImpresoPor = rowValues[cols.ImpresoPor - 1] || "";
    rowValues[cols.ImpresoPor - 1] = currentImpresoPor ? currentImpresoPor + ", " + newEntry : newEntry;

    // Si la orden ya estaba Impresa/Reimpresa, es una impresión ADICIONAL; si no, es la INICIAL
    etiquetaEvento = (prevStatus === VALORES_STATUS.IMPRESO || prevStatus === VALORES_STATUS.REIMPRESO)
      ? "IMPRESIÓN ADICIONAL"
      : "IMPRESIÓN INICIAL";
  }

  // TotalPags = copias válidas (Inicial + Adicional). La reimpresión NO suma aquí.
  var finalNoPags = Number(rowValues[cols.NoPags - 1]) || 0;
  rowValues[cols.TotalPags - 1] = finalNoPags;

  // Una sola escritura de toda la fila con los cambios aplicados (antes eran ~7 llamadas de
  // servicio, una lectura y una escritura por cada celda individual).
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);

  // Registrar el evento en el historial consolidado legible (columna HistorialImpresion)
  appendHistorialImpresion_(sheet, rowIndex, headers,
    etiquetaEvento + " #" + consecutivo + " · " + pagesPrinted + " pág · " + nombreCorto + " · ref:" + correlationId);

  // El evento de impresión en sí no quedaba en Logs (solo en HistorialImpresion, por orden) —
  // se registra aquí también para que sea auditable de forma centralizada, con el mismo
  // CorrelationId que el eventual cierre de solicitud más abajo.
  logChange(TIPOS_CAMBIO.IMPRESION_ORDEN, etiquetaEvento + " de orden " + orderNo + " (" + pagesPrinted + " páginas)", nombreCorto, {
    ordenRef: orderNo,
    campo: 'STATUS',
    valorAnterior: prevStatus,
    valorNuevo: rowValues[cols.STATUS - 1],
    correlationId: correlationId
  });

  // --- CERRAR SOLICITUD APROBADA SI EXISTE ---
  try {
    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    if (solicitudesSheet) {
      var solHeaders = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
      var solData = solicitudesSheet.getDataRange().getValues();

      var colSolIdSolicitud = getColumnIndexByNameCaseInsensitive(solHeaders, 'ID_Solicitud', false);
      var colSolNoOrden = getColumnIndexByNameCaseInsensitive(solHeaders, 'NoOrden', false);
      var colSolEstado = getColumnIndexByNameCaseInsensitive(solHeaders, 'Estado', false);

      if (colSolNoOrden && colSolEstado && colSolIdSolicitud) {
        for (var i = 1; i < solData.length; i++) {
          var solNoOrden = solData[i][colSolNoOrden - 1] ? solData[i][colSolNoOrden - 1].toString().trim() : "";
          var solEstado = solData[i][colSolEstado - 1] ? solData[i][colSolEstado - 1].toString().trim() : "";

          if (solNoOrden === orderNo && solEstado === 'Aprobada') {
            var idSolicitud = colSolIdSolicitud ? (solData[i][colSolIdSolicitud - 1] || '').toString() : '';
            solicitudesSheet.getRange(i + 1, colSolEstado).setValue('Completada');
            logChange(TIPOS_CAMBIO.SOLICITUD_COMPLETADA, 'La solicitud ' + idSolicitud + ' fue consumida al imprimir orden ' + orderNo, nombreCorto, {
              ordenRef: orderNo,
              campo: 'Estado',
              valorAnterior: 'Aprobada',
              valorNuevo: 'Completada',
              correlationId: correlationId
            });
            Logger.log("Solicitud " + idSolicitud + " marcada como Completada tras impresión de orden " + orderNo);
            break;
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error cerrando solicitud aprobada: " + e.message);
  }
  // --- FIN CIERRE SOLICITUD APROBADA ---

  return "Record updated successfully.";
}

/**
 * Configura los triggers instalables para auditoría: ediciones de celda (onEditInstalled)
 * y cambios estructurales (onChangeInstalled: inserción/eliminación de filas/columnas,
 * borrado de hojas, etc. — onEdit nunca dispara para estos casos). Idempotente: si un
 * trigger ya existe, no lo duplica.
 */
function setupAuditTrailTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var triggers = ScriptApp.getProjectTriggers();
  var yaExisteOnEdit = false;
  var yaExisteOnChange = false;
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'onEditInstalled') yaExisteOnEdit = true;
    if (handler === 'onChangeInstalled') yaExisteOnChange = true;
  }

  if (yaExisteOnEdit) {
    Logger.log("⚠️ Disparador onEditInstalled ya existe");
  } else {
    ScriptApp.newTrigger('onEditInstalled')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    Logger.log("✓ Disparador onEditInstalled creado");
  }

  if (yaExisteOnChange) {
    Logger.log("⚠️ Disparador onChangeInstalled ya existe");
  } else {
    ScriptApp.newTrigger('onChangeInstalled')
      .forSpreadsheet(ss)
      .onChange()
      .create();
    Logger.log("✓ Disparador onChangeInstalled creado");
  }
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

    // --- VERIFICACIÓN DE DESBLOQUEO TEMPORAL DE ADMIN ---
    var isUnlocked = PropertiesService.getScriptProperties().getProperty('SYS_UNLOCKED') === 'true';

    // --- DEFENSA EN PROFUNDIDAD: revertir ediciones MANUALES a hojas/columnas de sistema ---
    // Las escrituras de la app son programáticas y NO disparan onEdit; aquí solo llega una edición
    // manual. La protección ACL ya bloquea a los colaboradores; esto además revierte ediciones
    // manuales del propietario, que por diseño solo debe modificar estos datos vía la aplicación.
    var HOJAS_BLOQUEADAS_ = ['PermisosRoles', 'SolicitudesImpresion', 'Usuarios', 'templates', 'Templates', 'RegistroNovedad', 'Sys_MatricesConfig'];
    if (HOJAS_BLOQUEADAS_.indexOf(sheetName) !== -1) {
      if (isUnlocked) {
        logChange(TIPOS_CAMBIO.EDICION_ADMIN_LIBRE, 'Admin modificó manualmente ' + editedRange.getA1Notation() + ' en ' + sheetName, resolveEditorIdentity_(e));
        return;
      }
      revertManualEdit_(editedRange, e, sheetName, 'hoja bloqueada');
      return;
    }
    if (sheetName === 'Ordenes') {
      var ORDENES_COLS_SISTEMA_ = ['STATUS', 'NoPags', 'Reimpresion', 'TotalPags', 'ConsecutivoImp', 'ImpresoPor', 'Reimpreso', 'ReimpresoPor', 'HistorialImpresion', 'Decision', 'Fabricante'];
      var hdrsSis = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colEditadaNombre = hdrsSis[eCol - 1] ? hdrsSis[eCol - 1].toString().trim() : '';
      if (ORDENES_COLS_SISTEMA_.indexOf(colEditadaNombre) !== -1) {
        if (isUnlocked) {
          logChange(TIPOS_CAMBIO.EDICION_ADMIN_LIBRE, 'Admin modificó columna ' + colEditadaNombre + ' en Ordenes', resolveEditorIdentity_(e), { campo: colEditadaNombre });
          return;
        }
        revertManualEdit_(editedRange, e, sheetName, 'columna de sistema: ' + colEditadaNombre);
        return;
      }
    }
    // --- FIN DEFENSA EN PROFUNDIDAD ---

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
    
    var userIdentity = resolveEditorIdentity_(e);

    if (!hasPermission) {
      if (isUnlocked) {
        logChange(TIPOS_CAMBIO.EDICION_ADMIN_LIBRE, 'Admin modificó rango protegido en ' + sheetName + ' (' + protectionDesc + ')', userIdentity);
        return;
      }
      revertManualEdit_(editedRange, e, sheetName, 'rango protegido: ' + protectionDesc);
      return;
    }
    
    var numRows = editedRange.getNumRows();
    var numCols = editedRange.getNumColumns();

    if (sheetName === 'Ordenes' && numRows === 1 && numCols === 1) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      var editedColName = headers[editedRange.getColumn() - 1];
      
      // MIGRADO A BACKEND (Fase 3 - MatrixValidation):
      // El snapshot de CantDispAFecha ahora se captura en el momento exacto de la carga
      // de la orden desde el motor validarNoAnalisisContraMatrices. Ya no se usa onEdit
      // para este propósito (que de todas formas no funciona con fórmulas IMPORTRANGE).

      var colAdjuntoCOACol = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
      var colAdjuntoOACol = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
      var colOrdenCol = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);
      var colAnalisisCol = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
      
      // NUEVO: Detectar cambios en AdjuntoCOA o AdjuntoOA y actualizar EstadoCarga automáticamente
      if ((colAdjuntoCOACol && editedRange.getColumn() === colAdjuntoCOACol) || 
          (colAdjuntoOACol && editedRange.getColumn() === colAdjuntoOACol)) {
        var rowIdx = editedRange.getRow();
        actualizarEstadoCarga(sheet, rowIdx, headers);
        Logger.log("✓ EstadoCarga actualizado automáticamente en fila " + rowIdx + " después de editar " + editedColName);
        return;
      }

      // Manejo de cambios en NoOrden (resetea AdjuntoOA)
      if (colOrdenCol && editedRange.getColumn() === colOrdenCol) {
        var rowIdx = editedRange.getRow();
        var estadoOA = colAdjuntoOACol ? sheet.getRange(rowIdx, colAdjuntoOACol).getValue() : "";
        var estadoOAStr = estadoOA ? estadoOA.toString().trim() : "";
        
        // Si el documento OA está cargado, resetear al cambiar NoOrden
        if (estadoOAStr === "✅ Cargado") {
          var nuevoValor = e.value !== undefined ? e.value : "(vacío)";
          var valorAnterior = e.oldValue !== undefined ? e.oldValue : "(vacío)";
          
          if (colAdjuntoOACol) {
            sheet.getRange(rowIdx, colAdjuntoOACol).setValue(VALORES_DOCUMENTO.PENDIENTE);
            sheet.getRange(rowIdx, colAdjuntoOACol).clearNote();
          }
          
          actualizarEstadoCarga(sheet, rowIdx, headers);

          logChange(TIPOS_CAMBIO.RESET_CARGA_OA, 'NoOrden cambiado de ' + valorAnterior + ' a ' + nuevoValor + '. Estado de AdjuntoOA devuelto a Pendiente.', userIdentity,
            { ordenRef: nuevoValor, campo: 'NoOrden', valorAnterior: valorAnterior, valorNuevo: nuevoValor });
          SpreadsheetApp.getActiveSpreadsheet().toast("No. Orden modificado. El estado de la Orden de Acondicionamiento ha vuelto a 'Pendiente'.", "Aviso del Sistema", 5);
          return;
        }

        // Si NoOrden se asigna por primera vez y AdjuntoOA está vacío, inicializar
        if (estadoOAStr === "" && e.value !== undefined && e.value !== "") {
          if (colAdjuntoOACol) sheet.getRange(rowIdx, colAdjuntoOACol).setValue(VALORES_DOCUMENTO.PENDIENTE);
          actualizarEstadoCarga(sheet, rowIdx, headers);
          logChange(TIPOS_CAMBIO.ASIGNACION_PENDIENTE_OA, 'NoOrden asignado. Estado de AdjuntoOA establecido a Pendiente.', userIdentity,
            { ordenRef: e.value, campo: 'NoOrden', valorNuevo: e.value });
          return;
        }
      }

      // Manejo de cambios en NoAnalisis (resetea AdjuntoCOA)
      if (colAnalisisCol && editedRange.getColumn() === colAnalisisCol) {
        var rowIdx = editedRange.getRow();
        var estadoCOA = colAdjuntoCOACol ? sheet.getRange(rowIdx, colAdjuntoCOACol).getValue() : "";
        var estadoCOAStr = estadoCOA ? estadoCOA.toString().trim() : "";
        
        // Si el documento COA está cargado, resetear al cambiar NoAnalisis
        if (estadoCOAStr === "✅ Cargado") {
          var nuevoValor = e.value !== undefined ? e.value : "(vacío)";
          var valorAnterior = e.oldValue !== undefined ? e.oldValue : "(vacío)";
          
          if (colAdjuntoCOACol) {
            sheet.getRange(rowIdx, colAdjuntoCOACol).setValue(VALORES_DOCUMENTO.PENDIENTE);
            sheet.getRange(rowIdx, colAdjuntoCOACol).clearNote();
          }
          
          actualizarEstadoCarga(sheet, rowIdx, headers);

          logChange(TIPOS_CAMBIO.RESET_CARGA_COA, 'NoAnalisis cambiado de ' + valorAnterior + ' a ' + nuevoValor + '. Estado de AdjuntoCOA devuelto a Pendiente.', userIdentity,
            { campo: 'NoAnalisis', valorAnterior: valorAnterior, valorNuevo: nuevoValor });
          SpreadsheetApp.getActiveSpreadsheet().toast("No. Análisis modificado. El estado del Certificado de Análisis ha vuelto a 'Pendiente'.", "Aviso del Sistema", 5);
          return;
        }

        // Si NoAnalisis se asigna por primera vez y AdjuntoCOA está vacío, inicializar
        if (estadoCOAStr === "" && e.value !== undefined && e.value !== "") {
          if (colAdjuntoCOACol) sheet.getRange(rowIdx, colAdjuntoCOACol).setValue(VALORES_DOCUMENTO.PENDIENTE);
          actualizarEstadoCarga(sheet, rowIdx, headers);
          logChange(TIPOS_CAMBIO.ASIGNACION_PENDIENTE_COA, 'NoAnalisis asignado. Estado de AdjuntoCOA establecido a Pendiente.', userIdentity,
            { campo: 'NoAnalisis', valorNuevo: e.value });
          return;
        }
      }
    }
    
    if (numRows === 1 && numCols === 1) {
      var headersGen = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var campoEditado = headersGen[eCol - 1] ? headersGen[eCol - 1].toString().trim() : '';
      var oldValue = e.oldValue !== undefined ? e.oldValue : "(vacío)";
      var newValue = e.value !== undefined ? e.value : "(vacío)";
      var cellAddress = editedRange.getA1Notation();
      var editDesc = "Cambió '" + oldValue + "' por '" + newValue + "' en la celda " + cellAddress + " de la hoja " + sheetName +
        (campoEditado ? " (columna: " + campoEditado + ")" : "");
      var logType = (sheetName === 'RegistroNovedad') ? TIPOS_CAMBIO.EDICION_MANUAL_NOVEDAD : TIPOS_CAMBIO.EDICION_CELDA;

      var ordenRefSingle = '';
      if (sheetName === 'Ordenes') {
        var colNoOrdenGen = getColumnIndexByNameCaseInsensitive(headersGen, 'NoOrden', false);
        if (colNoOrdenGen) {
          var noOrdenValSingle = sheet.getRange(eRow, colNoOrdenGen).getValue();
          ordenRefSingle = noOrdenValSingle ? noOrdenValSingle.toString().trim() : '';
        }
      }

      logChange(logType, editDesc, userIdentity, {
        ordenRef: ordenRefSingle,
        campo: campoEditado,
        valorAnterior: oldValue,
        valorNuevo: newValue
      });
    } else {
      logMassEdit_(editedRange, sheet, sheetName, userIdentity);
    }

  } catch (error) {
    Logger.log("ERROR FATAL en onEditInstalled: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    try {
      logChange(TIPOS_CAMBIO.ERROR_SISTEMA, 'Error en onEditInstalled: ' + error.message, 'Sistema');
    } catch (logError) {
      Logger.log("No se pudo registrar el error en Logs: " + logError.message);
    }
  }
}

/**
 * Registra una edición masiva (multi-celda: pegado, relleno, borrado de rango) con el
 * mayor detalle posible: columnas afectadas, vista previa de los valores NUEVOS, y
 * NoOrden relacionados si la hoja es 'Ordenes'. Los valores ANTERIORES no están
 * disponibles para ediciones múltiples — es una limitación real de la API de onEdit de
 * Sheets (e.oldValue solo existe para edición de 1 celda), así que se deja explícito en
 * la descripción en vez de omitirlo en silencio (que es lo que pasaba antes).
 * @param {Range} editedRange - Rango editado (e.range)
 * @param {Sheet} sheet - Hoja afectada
 * @param {string} sheetName - Nombre de la hoja
 * @param {string} userIdentity - Identidad ya resuelta del editor (ver resolveEditorIdentity_)
 */
function logMassEdit_(editedRange, sheet, sheetName, userIdentity) {
  var rangeA1 = editedRange.getA1Notation();
  var numRows = editedRange.getNumRows();
  var numCols = editedRange.getNumColumns();
  var startCol = editedRange.getColumn();
  var startRow = editedRange.getRow();
  var totalCeldas = numRows * numCols;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colNames = [];
  for (var c = 0; c < numCols; c++) {
    var idx = startCol + c - 1;
    var name = (idx < headers.length && headers[idx]) ? headers[idx].toString().trim() : ('col ' + (idx + 1));
    colNames.push(name);
  }
  var columnasUnicas = colNames.filter(function(v, i) { return colNames.indexOf(v) === i; });

  // Vista previa compacta de los valores NUEVOS: si son pocas celdas, columna=valor;
  // si el rango es grande, describir tamaño/columnas en vez de volcar todo el contenido.
  var valorNuevoPreview;
  if (totalCeldas <= 6) {
    var newValues = editedRange.getValues();
    var pares = [];
    for (var r = 0; r < numRows; r++) {
      for (var c2 = 0; c2 < numCols; c2++) {
        var val = newValues[r][c2];
        pares.push(colNames[c2] + "=" + (val === '' || val === null || val === undefined ? "(vacío)" : val));
      }
    }
    valorNuevoPreview = pares.join(', ');
  } else {
    valorNuevoPreview = totalCeldas + " celda(s) en " + numRows + " fila(s) x " + numCols + " columna(s) (vista previa omitida por tamaño)";
  }

  // Si la hoja es Ordenes, listar los NoOrden de las filas afectadas para poder filtrar
  // el log por orden concreta, no solo por rango de celdas.
  var ordenRef = '';
  if (sheetName === 'Ordenes') {
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);
    if (colNoOrden) {
      var noOrdenValues = sheet.getRange(startRow, colNoOrden, numRows, 1).getValues();
      var noOrdenList = [];
      for (var rr = 0; rr < noOrdenValues.length; rr++) {
        var v = noOrdenValues[rr][0];
        if (v !== '' && v !== null && v !== undefined) noOrdenList.push(v.toString().trim());
      }
      var noOrdenUnicos = noOrdenList.filter(function(v, i) { return noOrdenList.indexOf(v) === i; });
      ordenRef = noOrdenUnicos.length > 20
        ? noOrdenUnicos.slice(0, 20).join(', ') + ' y ' + (noOrdenUnicos.length - 20) + ' más'
        : noOrdenUnicos.join(', ');
    }
  }

  var massEditDesc = "Edición masiva de " + totalCeldas + " celda(s) en el rango " + rangeA1 + " de la hoja " + sheetName +
    ". Columnas afectadas: " + columnasUnicas.join(', ') +
    ". Valores anteriores no disponibles (limitación de la API de Sheets para ediciones múltiples).";
  var logTypeMass = (sheetName === 'RegistroNovedad') ? TIPOS_CAMBIO.EDICION_MASIVA_NOVEDAD : TIPOS_CAMBIO.EDICION_MASIVA;

  logChange(logTypeMass, massEditDesc, userIdentity, {
    ordenRef: ordenRef,
    campo: columnasUnicas.join(', '),
    valorNuevo: valorNuevoPreview
  });
}

/**
 * Registra un cambio en la hoja Logs.
 * @param {string} tipoCambio - Tipo de cambio (ver TIPOS_CAMBIO en Config.gs)
 * @param {string} descripcion - Descripción del cambio
 * @param {string} userIdentity - Identidad del usuario (formato: UserID - NombreCorto)
 * @param {Object} [opts] - Detalle estructurado opcional, retrocompatible (si se omite,
 *   esas columnas quedan vacías, igual que antes de que existieran).
 * @param {string} [opts.ordenRef] - NoOrden(es) relacionados con el cambio
 * @param {string} [opts.campo] - Nombre(s) de columna/campo afectado(s)
 * @param {string} [opts.valorAnterior] - Valor previo (si se conoce)
 * @param {string} [opts.valorNuevo] - Valor nuevo
 * @param {string} [opts.correlationId] - ID compartido entre varios logChange() de una misma operación
 */
function logChange(tipoCambio, descripcion, userIdentity, opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');

  if (!sheetLogs) {
    Logger.log("⚠️ Hoja Logs no existe. Creando hoja Logs.");
    sheetLogs = ss.insertSheet('Logs');
    sheetLogs.getRange(1, 1, 1, REQUIRED_SHEETS.Logs.length).setValues([REQUIRED_SHEETS.Logs]);
  }

  var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var user = userIdentity || "Sistema";

  sheetLogs.appendRow([
    timestamp,
    user,
    tipoCambio,
    descripcion,
    opts.ordenRef || '',
    opts.campo || '',
    opts.valorAnterior || '',
    opts.valorNuevo || '',
    opts.correlationId || ''
  ]);
  Logger.log("✓ " + tipoCambio + " registrado en Logs");
}

/**
 * Resuelve una identidad de usuario legible ("UserID - NombreCorto") a partir de un
 * correo de sesión, con el mismo formato que usa el resto del sistema
 * (getUserIdentityStringByUserId_ en Auth.gs). Pensada para los triggers onEdit/onChange,
 * donde antes se usaba un placeholder fijo aunque el email sí estuviera disponible.
 * @param {Object} e - Objeto de evento (onEdit/onChange), puede ser undefined
 * @returns {string} Identidad legible, o un mensaje honesto si de verdad no hay email disponible
 */
function resolveEditorIdentity_(e) {
  var email = (e && e.user && e.user.getEmail) ? e.user.getEmail() : '';
  if (!email) return "Editor no identificado (permiso de email no disponible)";

  var user = getUserRecordByEmail_(email);
  if (user && user.userId) return getUserIdentityStringByUserId_(user.userId);

  return email; // Email válido pero sin registro en Usuarios (ej. propietario del script)
}

/**
 * Revierte una edición manual (defensa en profundidad) restaurando el valor previo y registrándola.
 * Solo restaura celdas individuales (e.oldValue existe); en ediciones múltiples/pegado registra sin
 * restaurar por celda. Las escrituras de la app son programáticas y no llegan aquí.
 * @param {Range} range - Rango editado manualmente
 * @param {Object} e - Objeto de evento onEdit
 * @param {string} sheetName - Nombre de la hoja
 * @param {string} motivo - Motivo de la reversión (para el log)
 */
function revertManualEdit_(range, e, sheetName, motivo) {
  try {
    if (e && e.oldValue !== undefined) {
      range.setValue(e.oldValue);
    } else if (e && e.value !== undefined) {
      // Era una celda vacía y se escribió algo
      range.clearContent();
    } else {
      // Edición múltiple, pegado, o borrado.
      range.clearContent();
      Logger.log("revertManualEdit_: edición múltiple o sin oldValue en " + sheetName + " (" + motivo + "), se limpió la celda. El usuario debe usar Ctrl+Z si sobreescribió datos.");
    }
  } catch (err) {
    Logger.log("revertManualEdit_ error al restaurar: " + err.message);
  }
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Edición revertida (" + motivo + "). Estos datos solo se modifican vía la aplicación.",
      "⛔ Modificación no permitida",
      6
    );
  } catch (err) {}
  try {
    logChange(TIPOS_CAMBIO.REVERSION_EDICION_MANUAL, 'Edición manual revertida en ' + range.getA1Notation() + ' de ' + sheetName + ' (' + motivo + ')', resolveEditorIdentity_(e), { campo: motivo });
  } catch (err) {}
}

/**
 * Trigger instalable de cambios ESTRUCTURALES (no de contenido de celda): inserción o
 * eliminación de filas/columnas, borrado/duplicado de hojas, etc. `onEdit` nunca dispara
 * para estos casos — antes de este trigger, borrar una fila completa de 'Ordenes' (por
 * ejemplo) no dejaba ningún rastro en Logs. `onChange` no expone qué rango/valores
 * cambiaron (la API de Sheets no lo provee para este tipo de evento), así que el detalle
 * se limita al tipo de cambio, la hoja activa y quién lo hizo.
 */
function onChangeInstalled(e) {
  try {
    if (!e || !e.changeType) return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var activeSheet = ss.getActiveSheet();
    var sheetName = activeSheet ? activeSheet.getName() : '(desconocida)';

    // Ediciones de contenido normales (EDIT) ya las cubre onEditInstalled con mucho más
    // detalle; aquí solo interesan los tipos verdaderamente estructurales.
    if (e.changeType === 'EDIT') return;

    var descripcion = "Cambio estructural (" + e.changeType + ") detectado en la hoja activa: " + sheetName;
    logChange(TIPOS_CAMBIO.CAMBIO_ESTRUCTURAL, descripcion, resolveEditorIdentity_(e), { campo: e.changeType });
  } catch (error) {
    Logger.log("ERROR FATAL en onChangeInstalled: " + error.message);
    try {
      logChange(TIPOS_CAMBIO.ERROR_SISTEMA, 'Error en onChangeInstalled: ' + error.message, 'Sistema');
    } catch (logError) {
      Logger.log("No se pudo registrar el error en Logs: " + logError.message);
    }
  }
}
