/**
 * NovedadLogic.gs
 * 
 * Módulo de lógica de registro de novedades y entregas.
 * Contiene funciones para:
 * - Apertura de modal de registro de novedades
 * - Obtención de órdenes disponibles para registro
 * - Procesamiento de registro de entregas y devoluciones
 * - Actualización de STATUS y trazabilidad
 * 
 * FASE 4 - Batch 4.3: Novedad Logic
 */

// --- UI: APERTURA DE MODAL ---

/**
 * Abre el modal de registro de entregas y novedades.
 * Muestra ModalRegistroNovedad.html para registrar entregas, devoluciones y cambios de estado.
 */
function abrirModalRegistroNovedad() {
  try {
    var html = HtmlService.createHtmlOutputFromFile('ModalRegistroNovedad')
      .setWidth(600)
      .setHeight(650);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Registrar Entrega / Novedad');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

// --- OBTENCIÓN DE ÓRDENES DISPONIBLES ---

/**
 * Obtiene la lista de órdenes disponibles para registro de novedades.
 * Excluye órdenes con STATUS "Cerrada" o vacío.
 * 
 * @returns {Array<Object>} Array de objetos con información de órdenes
 * @property {string} noOrden - Número de orden
 * @property {string} codigo - Código del producto
 * @property {number} totalPags - Total de páginas de la orden
 */
function getOrdenesParaNovedad() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return []; // No hay datos

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    var colNoOrdenCol = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colCodigoCol = getColumnIndexByNameCaseInsensitive(headers, 'Codigo', true);
    var colTotalPagsCol = getColumnIndexByNameCaseInsensitive(headers, 'TotalPags', false);
    var colStatusCol = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);

    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = dataRange.getValues();
    var ordenes = [];

    for (var i = 0; i < values.length; i++) {
      var noOrden = values[i][colNoOrdenCol - 1];
      var codigo = values[i][colCodigoCol - 1];
      var status = colStatusCol ? values[i][colStatusCol - 1] : "";
      var totalPags = colTotalPagsCol ? values[i][colTotalPagsCol - 1] : 0;

      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var codigoStr = codigo ? codigo.toString().trim() : "";
      var statusStr = status ? status.toString().trim() : "";

      // Filtrar: excluir si STATUS es "Cerrada" o está vacío
      if (noOrdenStr && codigoStr && statusStr !== "Cerrada" && statusStr !== "") {
        ordenes.push({
          noOrden: noOrdenStr,
          codigo: codigoStr,
          totalPags: totalPags ? Number(totalPags) : 0
        });
      }
    }

    Logger.log("getOrdenesParaNovedad: Se encontraron " + ordenes.length + " órdenes disponibles para novedad.");
    return ordenes;
  } catch (e) {
    Logger.log("ERROR en getOrdenesParaNovedad: " + e.message);
    throw e;
  }
}

// --- PROCESAMIENTO DE REGISTRO DE NOVEDAD ---

/**
 * Procesa el registro de una novedad (entrega, devolución, etc.).
 * Actualiza el STATUS en la hoja Ordenes, registra en RegistroNovedad y audita en Logs.
 * 
 * @param {Object} params - Parámetros de la novedad
 * @param {string} params.noOrden - Número de orden
 * @param {string} params.codigo - Código del producto
 * @param {string} params.tipoNovedad - Tipo de novedad (Entrega, Devolución, etc.)
 * @param {string} params.comentario - Comentario adicional
 * @param {number} params.totalPags - Total de páginas
 * @param {number} params.noPagDevueltas - Número de páginas devueltas
 * @param {string} params.status - Nuevo STATUS a asignar
 * @param {string} params.realizadoPor - UserID de quien realiza la acción
 * @param {string} userId - UserID del usuario autenticado
 * @returns {Object} Resultado de la operación con status y mensaje
 */
function procesarRegistroNovedad(params, userId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Obtener información del usuario
    var user = getUserRecordByUserId_(userId);
    if (!user) {
      return { status: 'error', message: 'Usuario no encontrado: ' + userId };
    }
    var nombreCorto = user.nombreCorto || userId;

    // Obtener parámetros
    var noOrden = params.noOrden || "";
    var codigo = params.codigo || "";
    var tipoNovedad = params.tipoNovedad || "";
    var comentario = params.comentario || "";
    var totalPags = params.totalPags || 0;
    var noPagDevueltas = params.noPagDevueltas || 0;
    var nuevoStatus = params.status || "";
    var realizadoPor = params.realizadoPor || userId;

    // Actualizar STATUS en la hoja Ordenes
    var sheetOrdenes = ss.getSheetByName('Ordenes');
    if (!sheetOrdenes) {
      return { status: 'error', message: 'La hoja Ordenes no existe.' };
    }

    var headersOrdenes = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
    var colNoOrdenCol = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'NoOrden', false);
    var colStatusCol = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'STATUS', false);

    if (!colNoOrdenCol || !colStatusCol) {
      return { status: 'error', message: 'No se encontraron las columnas NoOrden y/o STATUS en Ordenes.' };
    }

    var dataRangeOrdenes = sheetOrdenes.getRange(2, 1, sheetOrdenes.getLastRow() - 1, sheetOrdenes.getLastColumn());
    var valuesOrdenes = dataRangeOrdenes.getValues();
    var filaEncontrada = -1;

    for (var i = 0; i < valuesOrdenes.length; i++) {
      var rowNoOrden = valuesOrdenes[i][colNoOrdenCol - 1];
      var rowNoOrdenStr = rowNoOrden ? rowNoOrden.toString().trim() : "";
      if (rowNoOrdenStr === noOrden) {
        filaEncontrada = i + 2; // +2 por header y base-1
        break;
      }
    }

    if (filaEncontrada === -1) {
      return { status: 'error', message: 'No se encontró la orden ' + noOrden + ' en la hoja Ordenes.' };
    }

    // Actualizar STATUS
    sheetOrdenes.getRange(filaEncontrada, colStatusCol).setValue(nuevoStatus);

    // Insertar registro en hoja RegistroNovedad
    var sheetRegistro = ss.getSheetByName('RegistroNovedad');
    if (!sheetRegistro) {
      return { status: 'error', message: 'La hoja RegistroNovedad no existe.' };
    }

    var fechaNovedad = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // --- INICIO MAPEO DINÁMICO DE COLUMNAS ---
    // Obtener los encabezados actuales de la hoja
    var lastColRegistro = Math.max(1, sheetRegistro.getLastColumn());
    var headersRegistro = sheetRegistro.getRange(1, 1, 1, lastColRegistro).getValues()[0];
    
    // Crear array vacío del tamaño de las columnas
    var rowData = new Array(headersRegistro.length).fill("");
    
    // Mapear los datos exactos a insertar
    var dataMapping = {
      'FechaNovedad': fechaNovedad,
      'NoOrden': noOrden,
      'Codigo': codigo,
      'TipoNovedad': tipoNovedad,
      'Comentario': comentario,
      'TotalPags': totalPags,
      'NoPagDevueltas': noPagDevueltas,
      'RealizadoPor': nombreCorto,
      'STATUS': nuevoStatus
    };

    // Inyectar por nombre de encabezado usando el helper
    for (var colName in dataMapping) {
      var colIdx = getColumnIndexByNameCaseInsensitive(headersRegistro, colName, false);
      if (colIdx !== null && colIdx > 0) {
        rowData[colIdx - 1] = dataMapping[colName];
      }
    }

    sheetRegistro.appendRow(rowData);
    // --- FIN MAPEO DINÁMICO DE COLUMNAS ---

    // Registrar en Logs
    var userIdentity = getUserIdentityStringByUserId_(userId);
    var logDescripcion = 'Novedad registrada: Orden ' + noOrden + ', Tipo: ' + tipoNovedad + ', Nuevo STATUS: ' + nuevoStatus;
    logChange('REGISTRO_NOVEDAD', logDescripcion, userIdentity);

    Logger.log("procesarRegistroNovedad: Novedad registrada exitosamente para orden " + noOrden);
    return { 
      status: 'success', 
      message: 'Novedad registrada exitosamente para orden ' + noOrden,
      data: {
        noOrden: noOrden,
        nuevoStatus: nuevoStatus,
        realizadoPor: nombreCorto
      }
    };
  } catch (e) {
    Logger.log("ERROR en procesarRegistroNovedad: " + e.message);
    Logger.log("Stack trace: " + e.stack);
    return { status: 'error', message: 'Error al procesar registro de novedad: ' + e.message };
  }
}
