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
 * Verifica si existen los PDFs de NoOrden (OA) y NoAnalisis (COA).
 * [ÍNDICE] Consulta el índice materializado en memoria (O(1)) en lugar de
 * escanear las carpetas de Drive por cada orden. El índice lo mantiene
 * IndiceDocumentos.gs (rebuild horario + hook de subida + menú on-demand).
 * La firma queda idéntica: ModDrive, el legacy y la impresión no cambian.
 */
function verificarDocumentosEnDrive(noOrden, noAnalisis) {
  var noOrdenStr = noOrden ? String(noOrden).trim() : "";
  var noAnalisisStr = noAnalisis ? String(noAnalisis).trim() : "";

  if (!noOrdenStr && !noAnalisisStr) {
    return { tieneOA: false, tieneCOA: false };
  }

  var idx = IndiceDocs.cargar();
  var tieneOA = noOrdenStr ? (idx.OA[normalizarClaveDoc_(noOrdenStr)] !== undefined) : false;
  var tieneCOA = noAnalisisStr ? (idx.COA[normalizarClaveDoc_(noAnalisisStr)] !== undefined) : false;

  return { tieneOA: tieneOA, tieneCOA: tieneCOA };
}

/**
 * Calcula el EstadoDocumentos a partir de la existencia de archivos.
 */
function calcularEstadoDocumentos(tieneOA, tieneCOA) {
  if (tieneOA && tieneCOA) {
    return VALORES_ESTADO_DOCUMENTOS.LISTOS;
  } else if (tieneOA && !tieneCOA) {
    return VALORES_ESTADO_DOCUMENTOS.FALTA_COA;
  } else if (!tieneOA && tieneCOA) {
    return VALORES_ESTADO_DOCUMENTOS.FALTA_OA;
  } else {
    return VALORES_ESTADO_DOCUMENTOS.FALTAN_AMBOS;
  }
}

/**
 * Actualiza el estado consolidado (EstadoDocumentos) de una fila revisando Drive.
 */
function actualizarEstadoDocumentosEnHoja(sheet, rowIndex, headers) {
  var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoDocumentos', false);
  if (!colEstadoIdx) return;
  
  var colOrdenIdx = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);
  var colAnalisisIdx = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
  
  var noOrden = colOrdenIdx ? sheet.getRange(rowIndex, colOrdenIdx).getValue() : "";
  var noAnalisis = colAnalisisIdx ? sheet.getRange(rowIndex, colAnalisisIdx).getValue() : "";
  
  // Si la fila está vacía, borrar estado
  if ((!noOrden || noOrden.toString().trim() === "") && 
      (!noAnalisis || noAnalisis.toString().trim() === "")) {
    sheet.getRange(rowIndex, colEstadoIdx).setValue("");
    return;
  }
  
  var colStatusIdx = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
  if (colStatusIdx) {
    var currentStatus = sheet.getRange(rowIndex, colStatusIdx).getValue().toString().trim();
    if (currentStatus === VALORES_STATUS.ANULADA) {
      sheet.getRange(rowIndex, colEstadoIdx).setValue("🚫 Orden Anulada");
      return;
    }
  }
  
  var res = verificarDocumentosEnDrive(noOrden, noAnalisis);
  var nuevoEstado = calcularEstadoDocumentos(res.tieneOA, res.tieneCOA);
  
  sheet.getRange(rowIndex, colEstadoIdx).setValue(nuevoEstado);
}
