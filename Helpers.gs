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
  var coa = estadoCOA ? estadoCOA.toString().trim() : "";
  var oa = estadoOA ? estadoOA.toString().trim() : "";
  
  var coaCargado = (coa === VALORES_DOCUMENTO.CARGADO);
  var oaCargado = (oa === VALORES_DOCUMENTO.CARGADO);
  
  if (coaCargado && oaCargado) {
    return VALORES_ESTADO_CARGA.CARGADOS;
  } else if (coaCargado && !oaCargado) {
    return VALORES_ESTADO_CARGA.PENDIENTE_OA;
  } else if (!coaCargado && oaCargado) {
    return VALORES_ESTADO_CARGA.PENDIENTE_COA;
  } else {
    return VALORES_ESTADO_CARGA.PENDIENTE_AMBOS;
  }
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

/**
 * Extrae el ID de Google Drive a partir de una URL compartida.
 * Si el parámetro ya es un ID (no contiene 'http'), lo devuelve tal cual.
 * @param {string} urlOrId - URL de Drive o ID directo
 * @returns {string} El ID extraído
 */
function extractDriveId(urlOrId) {
  if (!urlOrId) return "";
  var str = urlOrId.toString().trim();
  if (str.indexOf("http") === -1 && str.indexOf("drive.google.com") === -1) {
    return str; // Probablemente ya es un ID
  }
  
  // Expresión regular para extraer IDs de archivos o carpetas de Drive (generalmente de 25 a 35 caracteres)
  var match = str.match(/[-\w]{25,}/);
  if (match) {
    return match[0];
  }
  return str;
}

/**
 * Normaliza un valor de tipo de impresión eliminando acentos y espacios.
 * Unifica las variantes históricas ('Reimpresión' con acento vs 'Reimpresion' sin acento).
 * @param {string} printType - Valor recibido (ej: 'Reimpresión', 'Adicional', 'Inicial')
 * @returns {string} Valor normalizado en minúsculas sin acentos
 */
function normalizePrintType_(printType) {
  if (!printType) return "";
  var s = printType.toString().trim().toLowerCase();
  // Reemplazo simple de vocales acentuadas (Apps Script no siempre soporta normalize())
  s = s.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u');
  return s;
}

/**
 * Determina si un tipo de impresión corresponde a una reimpresión.
 * Acepta cualquier variante de acento/caso ('Reimpresión', 'Reimpresion', ...).
 * @param {string} printType - Valor de tipo de impresión
 * @returns {boolean} true si es reimpresión
 */
function isReimpresionType_(printType) {
  return normalizePrintType_(printType).indexOf('reimp') === 0;
}

/**
 * Agrega una línea con timestamp al historial consolidado de una orden.
 * Escribe en la columna 'HistorialImpresion' de la hoja Ordenes (append, no sobrescribe).
 * Si la columna no existe, no falla (registra advertencia) para no romper transacciones.
 * @param {Sheet} sheet - Hoja 'Ordenes'
 * @param {number} rowIndex - Fila base-1 de la orden
 * @param {Array} headers - Encabezados de la hoja
 * @param {string} texto - Texto del evento a registrar
 */
function appendHistorialImpresion_(sheet, rowIndex, headers, texto) {
  try {
    var colHist = getColumnIndexByNameCaseInsensitive(headers, 'HistorialImpresion', false);
    if (!colHist) {
      Logger.log("ADVERTENCIA: Columna 'HistorialImpresion' no existe. Ejecute la inicialización de columnas.");
      return;
    }
    var timestamp = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm");
    var linea = "[" + timestamp + "] " + texto;
    var actual = sheet.getRange(rowIndex, colHist).getValue();
    actual = actual ? actual.toString() : "";
    sheet.getRange(rowIndex, colHist).setValue(actual ? actual + "\n" + linea : linea);
  } catch (e) {
    Logger.log("Error en appendHistorialImpresion_: " + e.message);
  }
}

/**
 * Agrega una línea de historial a una orden identificada por su NoOrden.
 * Wrapper de conveniencia cuando no se tiene el rowIndex/headers a mano.
 * @param {string} orderNo - Número de orden
 * @param {string} texto - Texto del evento a registrar
 */
function appendHistorialByOrderNo_(orderNo, texto) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ordenes');
    if (!sheet) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);
    if (!colNoOrden) return;
    var data = sheet.getRange(1, colNoOrden, sheet.getLastRow(), 1).getValues();
    var target = orderNo != null ? orderNo.toString().trim().toLowerCase() : "";
    for (var i = 1; i < data.length; i++) {
      var v = data[i][0] != null ? data[i][0].toString().trim().toLowerCase() : "";
      if (v === target) {
        appendHistorialImpresion_(sheet, i + 1, headers, texto);
        return;
      }
    }
  } catch (e) {
    Logger.log("Error en appendHistorialByOrderNo_: " + e.message);
  }
}
