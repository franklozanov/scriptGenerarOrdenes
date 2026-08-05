// ============================================================
// MODULE: EventBuilder
// Descripción: Construye el objeto EnrichedEvent a partir del
//              evento crudo de Google Apps Script.
//              Centraliza TODA la resolución de columnas y contexto.
// Prioridad de Carga: 4° (depende de Helpers y Auth)
// ============================================================

/**
 * Las 8 columnas clave de datos de solicitud.
 * Cualquier edición en estas columnas dispara la trazabilidad completa.
 */
var TARGET_HEADERS = ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden'];

/**
 * Construye un objeto EnrichedEvent estandarizado a partir del evento crudo `e`.
 * Este objeto es la ÚNICA fuente de verdad para todos los módulos.
 * 
 * Los módulos NO deben:
 * - Llamar a getColumnIndexByNameCaseInsensitive() directamente
 * - Redeclarar startRow, numRows, nombreCorto, etc.
 * - Hacer getRange() para leer encabezados
 * 
 * @param {Object} e - Evento de edición de Google Apps Script
 * @returns {Object|null} EnrichedEvent o null si la edición no debe procesarse
 */
function buildEnrichedEvent(e) {
  if (!e || !e.range || !e.source) return null;

  var editedRange = e.range;
  var sheet = editedRange.getSheet();
  var sheetName = sheet.getName();

  // No procesar ediciones en hojas internas del sistema (Logs, índice, etc.)
  if (HOJAS_NO_AUDITADAS.indexOf(sheetName) !== -1) return null;

  var startRow = editedRange.getRow();
  var numRows = editedRange.getNumRows();
  var startCol = editedRange.getColumn();
  var numCols = editedRange.getNumColumns();
  var endCol = startCol + numCols - 1;

  // === RESOLUCIÓN DE IDENTIDAD DEL USUARIO (1 sola vez) ===
  var email = (e.user && e.user.getEmail()) ? e.user.getEmail() : Session.getActiveUser().getEmail();
  var userIdentity = email || 'Usuario no identificado (edición directa)';
  var nombreCorto = email ? email.split('@')[0] : 'Usuario';

  if (email && typeof getUserRecordsByEmail_ === 'function') {
    var userRecords = getUserRecordsByEmail_(email);
    if (userRecords && userRecords.length > 0) {
      userIdentity = userRecords[0].userId + ' - ' + (userRecords[0].nombreCorto || userRecords[0].userId);
      nombreCorto = userRecords[0].nombreCorto || userRecords[0].userId;
    }
  }

  // === VERIFICACIÓN DE PERMISOS ===
  var hasPermission = true;
  var protectionDesc = '';
  var sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var allRangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  var overlappingProtections = sheetProtections.slice();

  var eRow = editedRange.getRow();
  var eCol = editedRange.getColumn();

  for (var j = 0; j < allRangeProtections.length; j++) {
    var pRange = allRangeProtections[j].getRange();
    if (eRow >= pRange.getRow() && eRow <= pRange.getLastRow() &&
        eCol >= pRange.getColumn() && eCol <= pRange.getLastColumn()) {
      overlappingProtections.push(allRangeProtections[j]);
    }
  }

  for (var i = 0; i < overlappingProtections.length; i++) {
    var protection = overlappingProtections[i];
    if (!protection.canEdit()) {
      hasPermission = false;
      protectionDesc = protection.getDescription() || 'protegido';
      break;
    }
  }

  // === RESOLUCIÓN DE ENCABEZADOS Y COLUMNAS (1 sola vez) ===
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Mapa de columnas clave — cada columna se resuelve UNA sola vez
  var cols = {
    Proceso: getColumnIndexByNameCaseInsensitive(headers, 'Proceso', false),
    Codigo: getColumnIndexByNameCaseInsensitive(headers, 'Codigo', false),
    Descripcion: getColumnIndexByNameCaseInsensitive(headers, 'Descripcion', false),
    Lote: getColumnIndexByNameCaseInsensitive(headers, 'Lote', false),
    Exp: getColumnIndexByNameCaseInsensitive(headers, 'Exp', false),
    Cantidad: getColumnIndexByNameCaseInsensitive(headers, 'Cantidad', false),
    NoAnalisis: getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false),
    NoOrden: getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false),
    SolicitadoPor: getColumnIndexByNameCaseInsensitive(headers, 'SolicitadoPor', false) || getColumnIndexByNameCaseInsensitive(headers, 'SolicitadaPor', false),
    STATUS: getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false),
    EstadoDocumentos: getColumnIndexByNameCaseInsensitive(headers, 'EstadoDocumentos', false),
    CantDispAFecha: getColumnIndexByNameCaseInsensitive(headers, 'CantDispAFecha', false),
    VerifCant: getColumnIndexByNameCaseInsensitive(headers, 'VerifCant. Disponible', false) || getColumnIndexByNameCaseInsensitive(headers, 'VerifCant.Disponible', false)
  };

  // Índices de las 8 columnas clave de datos
  var targetColIndices = [];
  var maxColIndex = 0;
  for (var h = 0; h < TARGET_HEADERS.length; h++) {
    var idx = cols[TARGET_HEADERS[h]];
    if (idx) {
      targetColIndices.push(idx);
      if (idx > maxColIndex) maxColIndex = idx;
    }
  }

  // === FLAGS BOOLEANOS (calculados 1 sola vez) ===
  var touchesDataColumns = false;
  for (var c = startCol; c <= endCol; c++) {
    if (targetColIndices.indexOf(c) !== -1) {
      touchesDataColumns = true;
      break;
    }
  }

  var touchesSolicitadoPor = cols.SolicitadoPor ? (startCol <= cols.SolicitadoPor && endCol >= cols.SolicitadoPor) : false;
  var touchesVerifCant = cols.VerifCant ? (startCol <= cols.VerifCant && endCol >= cols.VerifCant) : false;
  var touchesStatus = cols.STATUS ? (startCol <= cols.STATUS && endCol >= cols.STATUS) : false;
  var touchesNoOrden = cols.NoOrden ? (startCol <= cols.NoOrden && endCol >= cols.NoOrden) : false;
  var touchesNoAnalisis = cols.NoAnalisis ? (startCol <= cols.NoAnalisis && endCol >= cols.NoAnalisis) : false;
  var touchesRefColumns = touchesNoOrden || touchesNoAnalisis;

  var isRequestEdit = false;
  if (cols.Proceso && cols.NoOrden && startCol <= cols.NoOrden && endCol >= cols.Proceso) {
    isRequestEdit = true;
  }
  var isRequestOrStatusEdit = isRequestEdit || touchesStatus;

  // === DETECCIÓN DE FILAS VACÍAS (FASE 0 legacy) ===
  var isClearedArray = [];
  var anyRowCleared = false;

  // Solo calcular para hoja Ordenes y si hay columnas clave
  if (sheetName === 'Ordenes' && maxColIndex > 0 && startRow > 1) {
    var processStartRow = startRow;
    var processNumRows = numRows;
    if (processStartRow === 1) {
      processStartRow = 2;
      processNumRows--;
    }

    if (processNumRows > 0) {
      var rowData = sheet.getRange(processStartRow, 1, processNumRows, maxColIndex).getValues();

      for (var r = 0; r < processNumRows; r++) {
        var rowIsEmpty = true;
        for (var ci = 0; ci < targetColIndices.length; ci++) {
          var val = rowData[r][targetColIndices[ci] - 1];
          if (val !== undefined && val !== null && val.toString().trim() !== '') {
            rowIsEmpty = false;
            break;
          }
        }
        isClearedArray.push(rowIsEmpty);
        if (rowIsEmpty) anyRowCleared = true;
      }
    }
  }

  // Si no se calculó, llenar con false
  if (isClearedArray.length === 0) {
    for (var ri = 0; ri < numRows; ri++) {
      isClearedArray.push(false);
    }
  }

  // === CONSTRUIR Y RETORNAR EL EVENTO ENRIQUECIDO ===
  return {
    // Contexto de la edición
    sheet: sheet,
    sheetName: sheetName,
    editedRange: editedRange,
    startRow: startRow,
    numRows: numRows,
    startCol: startCol,
    numCols: numCols,
    endCol: endCol,

    // Datos pre-cargados
    headers: headers,

    // Mapa de columnas
    cols: cols,
    targetColIndices: targetColIndices,
    maxColIndex: maxColIndex,

    // Flags booleanos
    touchesDataColumns: touchesDataColumns,
    touchesSolicitadoPor: touchesSolicitadoPor,
    touchesVerifCant: touchesVerifCant,
    touchesStatus: touchesStatus,
    touchesRefColumns: touchesRefColumns,
    isRequestEdit: isRequestEdit,
    isRequestOrStatusEdit: isRequestOrStatusEdit,

    // Detección de filas vacías
    isClearedArray: isClearedArray,
    anyRowCleared: anyRowCleared,

    // Identidad del usuario
    email: email,
    userIdentity: userIdentity,
    nombreCorto: nombreCorto,

    // Permisos
    hasPermission: hasPermission,
    protectionDesc: protectionDesc
  };
}
