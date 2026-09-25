/* global IndiceDocs */
// ============================================================
// MODULE: Helpers
// DescripciÃ³n: Funciones utilitarias de acceso a columnas
// Prioridad de Carga: 2Â° (base de todos los demÃ¡s mÃ³dulos)
// ============================================================

/**
 * Busca el Ã­ndice de una columna por su nombre de encabezado.
 * Devuelve Ã­ndice base-1 para usar con getRange(), o null si no existe.
 * @param {Array} headers - Array de encabezados (fila 1 de la hoja)
 * @param {string} columnName - Nombre exacto de la columna a buscar
 * @param {boolean} required - Si es true, lanza error si no encuentra la columna
 * @returns {number|null} Ãndice base-1 de la columna, o null si no existe y required=false
 */
function getColumnIndexByName(headers, columnName, required) {
  if (required === undefined) required = true;
  
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().trim() === columnName) {
      return i + 1; // Devolver base-1 para getRange()
    }
  }
  
  if (required) {
    throw new Error("No se encontrÃ³ la columna '" + columnName + "' en los encabezados.");
  }
  return null;
}

/**
 * Busca el Ã­ndice de una columna por su nombre de encabezado (case-insensitive).
 * Devuelve Ã­ndice base-1 para usar con getRange().
 * @param {Array} headers - Array de encabezados (fila 1 de la hoja)
 * @param {string} columnName - Nombre de la columna a buscar
 * @param {boolean} required - Si es true, lanza error si no encuentra la columna
 * @returns {number|null} Ãndice base-1 de la columna, o null si no existe y required=false
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
    throw new Error("No se encontrÃ³ la columna '" + columnName + "' en los encabezados.");
  }
  return null;
}

/**
 * Obtiene el valor de una celda por nombre de columna y nÃºmero de fila.
 * @param {Sheet} sheet - Hoja de cÃ¡lculo
 * @param {number} rowIndex - NÃºmero de fila (base-1)
 * @param {string} columnName - Nombre de la columna
 * @returns {*} Valor de la celda
 */
function getCellValueByColumnName(sheet, rowIndex, columnName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = getColumnIndexByName(headers, columnName, true);
  return sheet.getRange(rowIndex, colIndex).getValue();
}

/**
 * Establece el valor de una celda por nombre de columna y nÃºmero de fila.
 * @param {Sheet} sheet - Hoja de cÃ¡lculo
 * @param {number} rowIndex - NÃºmero de fila (base-1)
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
 * @param {string} estadoCOA - Estado del Certificado de AnÃ¡lisis ("Pendiente" o "âœ… Cargado")
 * @param {string} estadoOA - Estado de la Orden de Acondicionamiento ("Pendiente" o "âœ… Cargado")
 * @returns {string} Estado consolidado
 */
/**
 * Actualiza el estado consolidado de carga en una fila especÃ­fica.
 * @param {Sheet} sheet - Hoja de cÃ¡lculo 'Ordenes'
 * @param {number} rowIndex - NÃºmero de fila (base-1)
 * @param {Array} headers - Array de encabezados de la hoja
 */
/**
 * Extrae el ID de Google Drive a partir de una URL compartida.
 * Si el parÃ¡metro ya es un ID (no contiene 'http'), lo devuelve tal cual.
 * @param {string} urlOrId - URL de Drive o ID directo
 * @returns {string} El ID extraÃ­do
 */
function extractDriveId(urlOrId) {
  if (!urlOrId) return "";
  var str = urlOrId.toString().trim();
  if (str.indexOf("http") === -1 && str.indexOf("drive.google.com") === -1) {
    return str; // Probablemente ya es un ID
  }
  
  // ExpresiÃ³n regular para extraer IDs de archivos o carpetas de Drive (generalmente de 25 a 35 caracteres)
  var match = str.match(/[-\w]{25,}/);
  if (match) {
    return match[0];
  }
  return str;
}

/**
 * Normaliza un valor de tipo de impresiÃ³n eliminando acentos y espacios.
 * Unifica las variantes histÃ³ricas ('ReimpresiÃ³n' con acento vs 'Reimpresion' sin acento).
 * @param {string} printType - Valor recibido (ej: 'ReimpresiÃ³n', 'Adicional', 'Inicial')
 * @returns {string} Valor normalizado en minÃºsculas sin acentos
 */
function normalizePrintType_(printType) {
  if (!printType) return "";
  var s = printType.toString().trim().toLowerCase();
  // Reemplazo simple de vocales acentuadas (Apps Script no siempre soporta normalize())
  s = s.replace(/Ã¡/g, 'a').replace(/Ã©/g, 'e').replace(/Ã­/g, 'i').replace(/Ã³/g, 'o').replace(/Ãº/g, 'u');
  return s;
}

/**
 * Determina si un tipo de impresiÃ³n corresponde a una reimpresiÃ³n.
 * Acepta cualquier variante de acento/caso ('ReimpresiÃ³n', 'Reimpresion', ...).
 * @param {string} printType - Valor de tipo de impresiÃ³n
 * @returns {boolean} true si es reimpresiÃ³n
 */
function isReimpresionType_(printType) {
  return normalizePrintType_(printType).indexOf('reimp') === 0;
}

/**
 * Agrega una lÃ­nea con timestamp al historial consolidado de una orden.
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
      Logger.log("ADVERTENCIA: Columna 'HistorialImpresion' no existe. Ejecute la inicializaciÃ³n de columnas.");
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
 * Agrega una lÃ­nea de historial a una orden identificada por su NoOrden.
 * Wrapper de conveniencia cuando no se tiene el rowIndex/headers a mano.
 * @param {string} orderNo - NÃºmero de orden
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

function normalizarClaveDoc_(clave) {
  return String(clave).trim().toLowerCase();
}


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

function normalizarClaveDoc_(clave) {
  return String(clave).trim().toLowerCase();
}

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

function actualizarEstadoDocumentosEnHoja(sheet, rowIndex, headers) {
  var colNoOrdenIdx = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
  var colNoAnalisisIdx = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
  
  // Columnas Legacy / Simples
  var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoDocumentos', false);
  
  // Columnas Nuevas FASE 1
  var colEstadoCargaIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoCarga', false);
  var colAdjuntoOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
  var colAdjuntoCOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
  
  if (!colNoOrdenIdx) {
    Logger.log("ADVERTENCIA: No se encontro columna NoOrden");
    return;
  }
  
  var noOrden = sheet.getRange(rowIndex, colNoOrdenIdx).getValue();
  var noAnalisis = colNoAnalisisIdx ? sheet.getRange(rowIndex, colNoAnalisisIdx).getValue() : null;
  
  var res = verificarDocumentosEnDrive(noOrden, noAnalisis);
  
  // Actualizar Sistema Legacy
  if (colEstadoIdx) {
    var nuevoEstado = calcularEstadoDocumentos(res.tieneOA, res.tieneCOA);
    sheet.getRange(rowIndex, colEstadoIdx).setValue(nuevoEstado);
  }
  
  // Actualizar Sistema Nuevo
  if (colEstadoCargaIdx || colAdjuntoOAIdx || colAdjuntoCOAIdx) {
    if (colAdjuntoOAIdx) {
      sheet.getRange(rowIndex, colAdjuntoOAIdx).setValue(res.tieneOA ? VALORES_DOCUMENTO.CARGADO : VALORES_DOCUMENTO.PENDIENTE);
    }
    if (colAdjuntoCOAIdx) {
      sheet.getRange(rowIndex, colAdjuntoCOAIdx).setValue(res.tieneCOA ? VALORES_DOCUMENTO.CARGADO : VALORES_DOCUMENTO.PENDIENTE);
    }
    if (colEstadoCargaIdx) {
      var estadoCarga = VALORES_ESTADO_CARGA.PENDIENTE_AMBOS;
      if (res.tieneOA && res.tieneCOA) estadoCarga = VALORES_ESTADO_CARGA.CARGADOS;
      else if (res.tieneOA && !res.tieneCOA) estadoCarga = VALORES_ESTADO_CARGA.PENDIENTE_COA;
      else if (!res.tieneOA && res.tieneCOA) estadoCarga = VALORES_ESTADO_CARGA.PENDIENTE_OA;
      
      sheet.getRange(rowIndex, colEstadoCargaIdx).setValue(estadoCarga);
    }
  }
}
  
  var noOrden = sheet.getRange(rowIndex, colNoOrdenIdx).getValue();
  var noAnalisis = colNoAnalisisIdx ? sheet.getRange(rowIndex, colNoAnalisisIdx).getValue() : null;
  
  var res = verificarDocumentosEnDrive(noOrden, noAnalisis);
  var nuevoEstado = calcularEstadoDocumentos(res.tieneOA, res.tieneCOA);
  
  sheet.getRange(rowIndex, colEstadoIdx).setValue(nuevoEstado);
}
