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
    var template = HtmlService.createTemplateFromFile('ModalRegistroNovedad');
    // Inyección de servidor (Server-side templating) para velocidad
    template.initialData = JSON.stringify(getInitialData());
    template.ordenesData = JSON.stringify(getOrdenesParaNovedad());
    
    var html = template.evaluate()
      .setWidth(600)
      .setHeight(650);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Registrar Entrega / Novedad');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

/**
 * Abre el modal de carga masiva de órdenes.
 * Muestra ModalCargaOrdenes.html para cargar múltiples órdenes desde Excel.
 */
function abrirModalCargaOrdenes() {
  try {
    var template = HtmlService.createTemplateFromFile('ModalCargaOrdenes');
    // Inyección de servidor (Server-side templating) para velocidad
    template.initialData = JSON.stringify(getInitialData());
    
    var html = template.evaluate()
      .setWidth(1000)
      .setHeight(700);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Cargar Órdenes Masivamente');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

/**
 * Abre el modal de autorización de órdenes QA.
 * Muestra ModalAutorizarQA.html para autorizar órdenes con STATUS 'Solicitada'.
 */
function abrirModalAutorizarQA() {
  try {
    var template = HtmlService.createTemplateFromFile('ModalAutorizarQA');
    // Inyección de servidor (Server-side templating) para velocidad
    template.initialData = JSON.stringify(getInitialData());
    template.ordenesSolicitadas = JSON.stringify(getOrdenesSolicitadasParaQA());
    
    var html = template.evaluate()
      .setWidth(950)
      .setHeight(700);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Autorizar Órdenes (QA)');
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

/**
 * Obtiene las órdenes pendientes de aprobación QA.
 * Retorna exclusivamente órdenes con STATUS === 'Solicitada'.
 *
 * @returns {Array<Object>} Array de objetos con información de órdenes solicitadas
 * @property {string} noOrden - Número de orden
 * @property {string} codigo - Código del producto
 * @property {string} descripcion - Descripción del producto
 * @property {string} lote - Número de lote
 * @property {string} estadoCarga - Estado de carga de documentos
 */
function getOrdenesSolicitadasParaQA() {
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
    var colDescripcionCol = getColumnIndexByNameCaseInsensitive(headers, 'Descripcion', false);
    var colLoteCol = getColumnIndexByNameCaseInsensitive(headers, 'Lote', false);
    var colEstadoCargaCol = getColumnIndexByNameCaseInsensitive(headers, 'EstadoCarga', false);
    var colStatusCol = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);

    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = dataRange.getValues();
    var ordenesSolicitadas = [];

    for (var i = 0; i < values.length; i++) {
      var noOrden = values[i][colNoOrdenCol - 1];
      var codigo = values[i][colCodigoCol - 1];
      var descripcion = colDescripcionCol ? values[i][colDescripcionCol - 1] : "";
      var lote = colLoteCol ? values[i][colLoteCol - 1] : "";
      var estadoCarga = colEstadoCargaCol ? values[i][colEstadoCargaCol - 1] : "";
      var status = colStatusCol ? values[i][colStatusCol - 1] : "";

      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var codigoStr = codigo ? codigo.toString().trim() : "";
      var statusStr = status ? status.toString().trim() : "";

      // Filtrar: solo STATUS === 'Solicitada'
      if (noOrdenStr && codigoStr && statusStr === 'Solicitada') {
        ordenesSolicitadas.push({
          noOrden: noOrdenStr,
          codigo: codigoStr,
          descripcion: descripcion ? descripcion.toString().trim() : "",
          lote: lote ? lote.toString().trim() : "",
          estadoCarga: estadoCarga ? estadoCarga.toString().trim() : ""
        });
      }
    }

    Logger.log("getOrdenesSolicitadasParaQA: Se encontraron " + ordenesSolicitadas.length + " órdenes con STATUS 'Solicitada'.");
    return ordenesSolicitadas;
  } catch (e) {
    Logger.log("ERROR en getOrdenesSolicitadasParaQA: " + e.message);
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
    enforcePermission(userId, 'REGISTRAR_NOVEDAD');
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

    // Registrar la novedad en el historial consolidado legible de la orden
    var detalleNovedad = "NOVEDAD: " + (tipoNovedad || "-");
    if (noPagDevueltas) detalleNovedad += " · " + noPagDevueltas + " pág devueltas";
    if (comentario) detalleNovedad += " · " + comentario;
    detalleNovedad += " · STATUS→" + nuevoStatus + " · " + nombreCorto;
    appendHistorialImpresion_(sheetOrdenes, filaEncontrada, headersOrdenes, detalleNovedad);

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

// --- CARGA MASIVA DE ÓRDENES ---

/**
 * Procesa la carga masiva de órdenes desde el modal.
 * Valida los datos, mapea a las columnas correctas de la hoja Ordenes y las inserta.
 * 
 * @param {Object} params - Parámetros de la carga masiva
 * @param {Array<Object>} params.records - Array de objetos con datos de órdenes
 * @param {string} params.pinFirma - PIN de firma electrónica
 * @param {string} userId - UserID del usuario autenticado
 * @returns {Object} Resultado de la operación con status y mensaje
 */
function procesarCargaOrdenesMasivas(params, userId) {
  try {
    enforcePermission(userId, 'CARGAR_ORDENES');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Obtener información del usuario
    var user = getUserRecordByUserId_(userId);
    if (!user) {
      return { status: 'error', message: 'Usuario no encontrado: ' + userId };
    }
    var nombreCorto = user.nombreCorto || userId;

    // Obtener registros
    var records = params.records || [];
    if (!Array.isArray(records) || records.length === 0) {
      return { status: 'error', message: 'No se recibieron registros para cargar.' };
    }

    // Obtener hoja Ordenes
    var sheetOrdenes = ss.getSheetByName('Ordenes');
    if (!sheetOrdenes) {
      return { status: 'error', message: 'La hoja Ordenes no existe.' };
    }

    // Obtener encabezados actuales
    var headersOrdenes = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
    var numColumns = headersOrdenes.length;

    // Obtener carpetas de destino desde hoja templates
    var folderDocOrdenes = null;
    var folderDocAnalisis = null;
    
    try {
      var sheetTemplates = ss.getSheetByName('templates');
      if (sheetTemplates) {
        var templatesData = sheetTemplates.getDataRange().getValues();
        templatesData.forEach(function(row) {
          var key = row[0] ? row[0].toString().trim() : '';
          var value = row[1] ? extractDriveId(row[1].toString().trim()) : '';
          
          if (key === 'DOC_ORDENES' && value) {
            folderDocOrdenes = DriveApp.getFolderById(value);
          }
          if (key === 'DOC_ANALISIS' && value) {
            folderDocAnalisis = DriveApp.getFolderById(value);
          }
        });
      }
    } catch (e) {
      Logger.log("ADVERTENCIA: No se pudieron obtener carpetas de destino: " + e.message);
    }

    // Mapear índices de columnas
    var colProceso = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Proceso', false);
    var colCodigo = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Codigo', false);
    var colDescripcion = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Descripcion', false);
    var colLote = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Lote', false);
    var colExp = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Exp', false);
    var colCantidad = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Cantidad', false);
    var colNoAnalisis = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'NoAnalisis', false);
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'NoOrden', false);
    var colFabricante = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Fabricante', false);
    var colAdjuntoCOA = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'AdjuntoCOA', false);
    var colAdjuntoOA = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'AdjuntoOA', false);
    var colEstadoCarga = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'EstadoCarga', false);
    var colConsecutivoImp = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'ConsecutivoImp', false);
    var colImpresoPor = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'ImpresoPor', false);
    var colStatus = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'STATUS', false);
    var colSolicitadaPor = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'SolicitadaPor', false);

    if (!colNoOrden || !colCodigo) {
      return { status: 'error', message: 'No se encontraron las columnas requeridas (NoOrden, Codigo) en la hoja Ordenes.' };
    }

    // Crear matriz 2D para insertar
    var newRows = [];
    var lastRow = sheetOrdenes.getLastRow();
    var startRow = lastRow > 0 ? lastRow + 1 : 2;

    // Procesar cada registro
    var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
    
    records.forEach(function(record) {
      var row = new Array(numColumns).fill('');
      
      // Variables para rastrear estado de carga de documentos
      var oaCargado = false;
      var coaCargado = false;

      // Mapear valores del registro a las columnas correctas
      if (colProceso) row[colProceso - 1] = record.Proceso || '';
      if (colCodigo) row[colCodigo - 1] = record.Codigo || '';
      if (colDescripcion) row[colDescripcion - 1] = record.Descripcion || '';
      if (colLote) row[colLote - 1] = record.Lote || '';
      if (colExp) row[colExp - 1] = record.Exp || '';
      if (colCantidad) row[colCantidad - 1] = record.Cantidad || 0;
      if (colNoAnalisis) row[colNoAnalisis - 1] = record.NoAnalisis || '';
      if (colNoOrden) row[colNoOrden - 1] = record.NoOrden || '';
      
      // Procesar archivo OA si viene
      if (record.fileOABase64 && folderDocOrdenes) {
        try {
          var decodedOA = Utilities.base64Decode(record.fileOABase64);
          var blobOA = Utilities.newBlob(decodedOA, 'application/pdf', record.fileOAName || record.NoOrden + '_OA.pdf');
          folderDocOrdenes.createFile(blobOA);
          row[colAdjuntoOA - 1] = VALORES_DOCUMENTO.CARGADO;
          oaCargado = true;
          Logger.log("Archivo OA guardado para orden: " + record.NoOrden);
        } catch (e) {
          Logger.log("ERROR al guardar archivo OA para orden " + record.NoOrden + ": " + e.message);
          row[colAdjuntoOA - 1] = VALORES_DOCUMENTO.PENDIENTE;
          oaCargado = false;
        }
      } else {
        row[colAdjuntoOA - 1] = VALORES_DOCUMENTO.PENDIENTE;
        oaCargado = false;
      }
      
      // Procesar archivo COA si viene
      if (record.fileCOABase64 && folderDocAnalisis) {
        try {
          var decodedCOA = Utilities.base64Decode(record.fileCOABase64);
          var blobCOA = Utilities.newBlob(decodedCOA, 'application/pdf', record.fileCOAName || record.NoOrden + '_COA.pdf');
          folderDocAnalisis.createFile(blobCOA);
          row[colAdjuntoCOA - 1] = VALORES_DOCUMENTO.CARGADO;
          coaCargado = true;
          Logger.log("Archivo COA guardado para orden: " + record.NoOrden);
        } catch (e) {
          Logger.log("ERROR al guardar archivo COA para orden " + record.NoOrden + ": " + e.message);
          row[colAdjuntoCOA - 1] = VALORES_DOCUMENTO.PENDIENTE;
          coaCargado = false;
        }
      } else {
        row[colAdjuntoCOA - 1] = VALORES_DOCUMENTO.PENDIENTE;
        coaCargado = false;
      }
      
      // Calcular EstadoCarga dinámicamente
      if (oaCargado && coaCargado) {
        row[colEstadoCarga - 1] = VALORES_ESTADO_CARGA.CARGADOS;
      } else if (oaCargado && !coaCargado) {
        row[colEstadoCarga - 1] = VALORES_ESTADO_CARGA.PENDIENTE_COA;
      } else if (!oaCargado && coaCargado) {
        row[colEstadoCarga - 1] = VALORES_ESTADO_CARGA.PENDIENTE_OA;
      } else {
        row[colEstadoCarga - 1] = VALORES_ESTADO_CARGA.PENDIENTE_AMBOS;
      }
      
      // Valores por defecto para columnas no proporcionadas
      if (colFabricante) row[colFabricante - 1] = '';
      if (colConsecutivoImp) row[colConsecutivoImp - 1] = '';
      if (colImpresoPor) row[colImpresoPor - 1] = '';
      if (colStatus) row[colStatus - 1] = 'Solicitada';
      if (colSolicitadaPor) row[colSolicitadaPor - 1] = (nombreCorto || userId) + " | " + timestamp;

      newRows.push(row);
    });

    // Insertar datos en la hoja
    if (newRows.length > 0) {
      sheetOrdenes.getRange(startRow, 1, newRows.length, numColumns).setValues(newRows);
      Logger.log("procesarCargaOrdenesMasivas: Insertadas " + newRows.length + " filas en hoja Ordenes");
    }

    // Registrar en Logs
    var userIdentity = getUserIdentityStringByUserId_(userId);
    var logDescripcion = 'Carga masiva de órdenes: ' + newRows.length + ' órdenes cargadas por ' + nombreCorto;
    logChange('CARGA_MASIVA_ORDENES', logDescripcion, userIdentity);

    return {
      status: 'success',
      message: 'Se cargaron exitosamente ' + newRows.length + ' órdenes en la hoja Ordenes.',
      data: {
        rowsInserted: newRows.length,
        insertedBy: nombreCorto
      }
    };

  } catch (e) {
    Logger.log("ERROR en procesarCargaOrdenesMasivas: " + e.message);
    Logger.log("Stack trace: " + e.stack);
    return { status: 'error', message: 'Error al procesar carga masiva de órdenes: ' + e.message };
  }
}

// --- AUTORIZACIÓN QA ---

/**
 * Procesa la autorización de órdenes QA.
 * Actualiza el STATUS a 'Autorizada' y registra la firma electrónica.
 *
 * @param {Object} params - Parámetros de la autorización
 * @param {Array<string>} params.targetIds - Array de números de orden a autorizar
 * @param {string} params.pinFirma - PIN de firma electrónica
 * @param {string} userId - UserID del usuario autenticado
 * @returns {Object} Resultado de la operación con status y mensaje
 */
function procesarAutorizacionQA(params, userId) {
  try {
    params.userId = userId;
    requireAuthorizedUserStrict_(params);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Obtener información del usuario
    var user = getUserRecordByUserId_(userId);
    if (!user) {
      return { status: 'error', message: 'Usuario no encontrado: ' + userId };
    }
    var nombreCorto = user.nombreCorto || userId;
    var userIdentity = getUserIdentityStringByUserId_(userId);
    
    // Obtener parámetros
    var targetIds = params.targetIds || [];
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return { status: 'error', message: 'No se proporcionaron órdenes para autorizar.' };
    }
    
    // Obtener hoja Ordenes
    var sheetOrdenes = ss.getSheetByName('Ordenes');
    if (!sheetOrdenes) {
      return { status: 'error', message: 'La hoja Ordenes no existe.' };
    }
    
    // Obtener encabezados
    var headersOrdenes = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'NoOrden', false);
    var colStatus = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'STATUS', false);
    var colEstadoCarga = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'EstadoCarga', false);
    var colSolicitadaPor = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'SolicitadaPor', false);
    
    if (!colNoOrden || !colStatus || !colEstadoCarga || !colSolicitadaPor) {
      return { status: 'error', message: 'No se encontraron las columnas requeridas en Ordenes.' };
    }
    
    // Generar timestamp
    var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
    
    // Obtener datos de la hoja
    var lastRow = sheetOrdenes.getLastRow();
    if (lastRow < 2) {
      return { status: 'error', message: 'No hay órdenes en la hoja.' };
    }
    
    var dataRange = sheetOrdenes.getRange(2, 1, lastRow - 1, sheetOrdenes.getLastColumn());
    var values = dataRange.getValues();
    
    var ordenesAutorizadas = [];
    var ordenesIgnoradas = [];
    var filasParaActualizar = [];
    
    // Recorrer filas para identificar órdenes a autorizar
    for (var i = 0; i < values.length; i++) {
      var noOrden = values[i][colNoOrden - 1];
      var status = values[i][colStatus - 1];
      var estadoCarga = values[i][colEstadoCarga - 1];
      var solicitadaPor = values[i][colSolicitadaPor - 1];
      
      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var statusStr = status ? status.toString().trim() : "";
      var estadoCargaStr = estadoCarga ? estadoCarga.toString().trim() : "";
      var solicitadaPorStr = solicitadaPor ? solicitadaPor.toString().trim() : "";
      
      // Verificar si esta orden está en targetIds y tiene STATUS 'Solicitada'
      if (targetIds.indexOf(noOrdenStr) !== -1 && statusStr === 'Solicitada') {
        // DOBLE VALIDACIÓN: Verificar que EstadoCarga no contenga "Pendiente"
        if (estadoCargaStr.toLowerCase().indexOf('pendiente') !== -1) {
          ordenesIgnoradas.push(noOrdenStr + ' (documentos pendientes)');
          Logger.log("procesarAutorizacionQA: Orden " + noOrdenStr + " ignorada por documentos pendientes.");
          continue;
        }
        
        // Preparar actualización
        var nuevaSolicitadaPor = solicitadaPorStr + " | Autorizado QA: " + nombreCorto + " - " + timestamp;
        
        filasParaActualizar.push({
          rowIndex: i + 2, // +2 por header y base-1
          status: 'Autorizada',
          solicitadaPor: nuevaSolicitadaPor
        });
        
        ordenesAutorizadas.push(noOrdenStr);
      }
    }
    
    if (ordenesAutorizadas.length === 0) {
      var mensajeIgnoradas = ordenesIgnoradas.length > 0 ? ' Órdenes ignoradas: ' + ordenesIgnoradas.join(', ') : '';
      return { status: 'error', message: 'No se autorizaron órdenes.' + mensajeIgnoradas };
    }
    
    // Aplicar actualizaciones
    filasParaActualizar.forEach(function(fila) {
      sheetOrdenes.getRange(fila.rowIndex, colStatus).setValue(fila.status);
      sheetOrdenes.getRange(fila.rowIndex, colSolicitadaPor).setValue(fila.solicitadaPor);
    });
    
    // Registrar en Logs
    var logDescripcion = 'Órdenes autorizadas: ' + ordenesAutorizadas.join(', ');
    if (ordenesIgnoradas.length > 0) {
      logDescripcion += ' (Ignoradas: ' + ordenesIgnoradas.join(', ') + ')';
    }
    logChange('AUTORIZACION_QA', logDescripcion, userIdentity);
    
    Logger.log("procesarAutorizacionQA: Se autorizaron " + ordenesAutorizadas.length + " órdenes. Ignoradas: " + ordenesIgnoradas.length);
    
    var mensaje = 'Se autorizaron exitosamente ' + ordenesAutorizadas.length + ' órdenes.';
    if (ordenesIgnoradas.length > 0) {
      mensaje += ' ' + ordenesIgnoradas.length + ' órdenes fueron ignoradas por documentos pendientes.';
    }
    
    return {
      status: 'success',
      message: mensaje,
      data: {
        authorizedCount: ordenesAutorizadas.length,
        ignoredCount: ordenesIgnoradas.length,
        authorizedOrders: ordenesAutorizadas,
        ignoredOrders: ordenesIgnoradas
      }
    };
    
  } catch (e) {
    Logger.log("ERROR en procesarAutorizacionQA: " + e.message);
    Logger.log("Stack trace: " + e.stack);
    return { status: 'error', message: 'Error al procesar autorización QA: ' + e.message };
  }
}
