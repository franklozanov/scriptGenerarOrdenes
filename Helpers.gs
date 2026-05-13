// ============================================================
// MODULE: Helpers
// Descripción: Funciones utilitarias de acceso a columnas
// Prioridad de Carga: 2° (base de todos los demás módulos)
// ============================================================

/**
 * Busca el índice de una columna por su nombre de encabezado.
 * Devuelve índice base-1 para usar con getRange(), o null si no existe.
 * @param {Array} headers - Array de encabezados (fila 1 de la hoja)
 * @param {string} columnName - Nombre exacto de la columna a buscar
 * @param {boolean} required - Si es true, lanza error si no encuentra la columna
 * @returns {number|null} Índice base-1 de la columna, o null si no existe y required=false
 */
function getColumnIndexByName(headers, columnName, required) {
  if (required === undefined) required = true;
  
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().trim() === columnName) {
      return i + 1; // Devolver base-1 para getRange()
    }
  }
  
  if (required) {
    throw new Error("No se encontró la columna '" + columnName + "' en los encabezados.");
  }
  return null;
}

/**
 * Busca el índice de una columna por su nombre de encabezado (case-insensitive).
 * Devuelve índice base-1 para usar con getRange().
 * @param {Array} headers - Array de encabezados (fila 1 de la hoja)
 * @param {string} columnName - Nombre de la columna a buscar
 * @param {boolean} required - Si es true, lanza error si no encuentra la columna
 * @returns {number|null} Índice base-1 de la columna, o null si no existe y required=false
 */
function getColumnIndexByNameCaseInsensitive(headers, columnName, required) {
  if (required === undefined) required = true;
  var columnNameLower = columnName.toString().trim().toLowerCase();
  
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().trim().toLowerCase() === columnNameLower) {
      return i + 1; // Devolver base-1 para getRange()
    }
  }
  
  if (required) {
    throw new Error("No se encontró la columna '" + columnName + "' en los encabezados.");
  }
  return null;
}

/**
 * Obtiene el valor de una celda por nombre de columna y número de fila.
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {number} rowIndex - Número de fila (base-1)
 * @param {string} columnName - Nombre de la columna
 * @returns {*} Valor de la celda
 */
function getCellValueByColumnName(sheet, rowIndex, columnName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = getColumnIndexByName(headers, columnName, true);
  return sheet.getRange(rowIndex, colIndex).getValue();
}

/**
 * Establece el valor de una celda por nombre de columna y número de fila.
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {number} rowIndex - Número de fila (base-1)
 * @param {string} columnName - Nombre de la columna
 * @param {*} value - Valor a establecer
 */
function setCellValueByColumnName(sheet, rowIndex, columnName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = getColumnIndexByName(headers, columnName, true);
  sheet.getRange(rowIndex, colIndex).setValue(value);
}

/**
 * Calcula el estado consolidado de carga basado en los estados de COA y OA.
 * @param {string} estadoCOA - Estado del Certificado de Análisis ("Pendiente" o "✅ Cargado")
 * @param {string} estadoOA - Estado de la Orden de Acondicionamiento ("Pendiente" o "✅ Cargado")
 * @returns {string} Estado consolidado
 */
function calcularEstadoCarga(estadoCOA, estadoOA) {
  var coaStr = estadoCOA ? estadoCOA.toString().trim() : "Pendiente";
  var oaStr = estadoOA ? estadoOA.toString().trim() : "Pendiente";
  
  var coaCargado = coaStr === "✅ Cargado";
  var oaCargado = oaStr === "✅ Cargado";
  
  if (coaCargado && oaCargado) {
    return "✅ Cargados";
  } else if (!coaCargado && !oaCargado) {
    return "Pendiente COA/OA";
  } else if (!coaCargado && oaCargado) {
    return "Pendiente COA";
  } else if (coaCargado && !oaCargado) {
    return "Pendiente OA";
  }
  
  return "Pendiente COA/OA";
}

/**
 * Actualiza el estado consolidado de carga en una fila específica.
 * @param {Sheet} sheet - Hoja de cálculo 'Ordenes'
 * @param {number} rowIndex - Número de fila (base-1)
 * @param {Array} headers - Array de encabezados de la hoja
 */
function actualizarEstadoCarga(sheet, rowIndex, headers) {
  var colCOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
  var colOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
  var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoCarga', false);
  
  if (!colCOAIdx || !colOAIdx || !colEstadoIdx) {
    Logger.log("ADVERTENCIA: No se encontraron las columnas necesarias para actualizar EstadoCarga");
    return;
  }
  
  var estadoCOA = sheet.getRange(rowIndex, colCOAIdx).getValue();
  var estadoOA = sheet.getRange(rowIndex, colOAIdx).getValue();
  
  var estadoConsolidado = calcularEstadoCarga(estadoCOA, estadoOA);
  sheet.getRange(rowIndex, colEstadoIdx).setValue(estadoConsolidado);
}
