/**
 * UploadLogic.gs
 * 
 * Módulo de lógica de subida de documentos.
 * Contiene funciones para:
 * - Apertura de modal de subida masiva
 * - Obtención de listas de órdenes pendientes
 * - Procesamiento de subida de documentos (Órdenes y Análisis)
 * - Validación y actualización de estado de documentos
 * 
 * FASE 4 - Batch 4.2: Upload Logic
 */

// --- UI: APERTURA DE MODAL ---

/**
 * Abre el modal centralizado de subida de archivos.
 * Muestra UploadCentralModal.html para subida masiva de documentos.
 */
function abrirModalSubidaGeneral() {
  try {
    var html = HtmlService.createHtmlOutputFromFile('UploadCentralModal')
      .setWidth(700)
      .setHeight(600)
      .setTitle('Subida Masiva de Documentos');
    SpreadsheetApp.getUi().showModalDialog(html, 'Subida Masiva de Órdenes');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

// --- OBTENCIÓN DE LISTAS PENDIENTES ---

/**
 * Obtiene las listas de órdenes y análisis pendientes de carga.
 * Retorna un array con los NoOrden de todas las filas donde AdjuntoOrden sea "Pendiente".
 * 
 * @returns {Object} Objeto con arrays de órdenes y análisis pendientes
 * @property {Array<string>} ordenes - Números de orden pendientes
 * @property {Array<string>} analisis - Números de análisis pendientes
 */
function getPendingOrdersList() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colNoOrdenCol = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colAdjuntoCol = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOrden', true);
    var colNoAnalisisCol = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { ordenes: [], analisis: [] }; // No hay datos
    }
    
    // Obtener todas las filas de datos
    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var data = dataRange.getValues();
    
    var ordenes = [];
    var analisis = [];
    
    for (var i = 0; i < data.length; i++) {
      var noOrden = data[i][colNoOrdenCol - 1];
      var adjuntoEstado = data[i][colAdjuntoCol - 1];
      var noAnalisis = colNoAnalisisCol ? data[i][colNoAnalisisCol - 1] : null;
      
      // Manejo seguro de valores nulos o indefinidos
      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var adjuntoStr = adjuntoEstado ? adjuntoEstado.toString().trim() : "";
      var noAnalisisStr = noAnalisis ? noAnalisis.toString().trim() : "";
      
      // Obtener órdenes pendientes (AdjuntoOrden == "Pendiente")
      if (noOrdenStr && adjuntoStr === "Pendiente") {
        ordenes.push(noOrdenStr);
      }
      
      // Obtener NoAnalisis solo para filas con AdjuntoOrden == "Pendiente"
      if (noAnalisisStr && adjuntoStr === "Pendiente") {
        analisis.push(noAnalisisStr);
      }
    }
    
    Logger.log("✓ Órdenes pendientes encontradas: " + ordenes.length);
    Logger.log("✓ NoAnalisis encontrados: " + analisis.length);
    return { ordenes: ordenes, analisis: analisis };
    
  } catch (e) {
    Logger.log("Error en getPendingOrdersList: " + e.message);
    throw new Error("Error al obtener listas pendientes: " + e.message);
  }
}

// --- PROCESAMIENTO DE SUBIDA DE DOCUMENTOS ---

/**
 * Procesa la subida de un documento (Orden o Análisis) al sistema.
 * Valida tipo de archivo, busca la referencia en la hoja, maneja sobrescritura,
 * guarda en Drive y actualiza estado en la hoja.
 * 
 * @param {string} base64Data - Datos del archivo en base64
 * @param {string} mimeType - Tipo MIME del archivo
 * @param {string} fileName - Nombre del archivo
 * @param {string} referenceNo - Número de referencia (NoOrden o NoAnalisis)
 * @param {string} docType - Tipo de documento ("Orden de Acondicionamiento" o "Registro de Inspeccion Base")
 * @param {boolean} overwriteConfirmed - Indica si el usuario confirmó la sobrescritura del archivo existente
 * @param {string} actingUserId - UserID del usuario que ejecuta la acción
 * @returns {Object} Resultado de la operación con status y mensaje
 */
function procesarSubidaDocumentoCentral(base64Data, mimeType, fileName, referenceNo, docType, overwriteConfirmed, actingUserId) {
  try {
    // Validación de seguridad: solo permitir PDF
    if (mimeType !== 'application/pdf') {
      return { status: 'error', message: 'Solo se permiten archivos PDF.' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetOrdenes = ss.getSheetByName('Ordenes');
    
    if (!sheetOrdenes) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }

    // Leer toda la data incluyendo encabezados
    var data = sheetOrdenes.getDataRange().getValues();
    var headers = data[0]; // La primera fila son los encabezados
    
    // Mapeo de columnas por nombre de encabezado (base-1 para getRange)
    var colAdjuntoIdx = getColumnIndexByName(headers, 'AdjuntoOrden', true);
    var colNoOrdenIdx = getColumnIndexByName(headers, 'NoOrden', true);
    var colNoAnalisisIdx = getColumnIndexByName(headers, 'NoAnalisis', true);
    
    // Determinar la columna objetivo según docType (para búsqueda en array data)
    var targetColName = "";
    var folderKey = "";
    if (docType === "Orden de Acondicionamiento") {
      targetColName = "NoOrden";
      folderKey = "DOC_ORDENES";
    } else if (docType === "Registro de Inspeccion Base") {
      targetColName = "NoAnalisis";
      folderKey = "DOC_ANALISIS";
    }
    
    // Validación de seguridad para folderKey
    if (folderKey === "") {
      return { status: 'error', message: "Tipo de documento no reconocido para asignar carpeta: " + docType };
    }
    
    // Obtener índice de columna objetivo para búsqueda en array (base-0)
    var targetColIdx = getColumnIndexByName(headers, targetColName, true) - 1;
    
    // Logs de auditoría críticos
    Logger.log("--- AUDITORIA DE BUSQUEDA ---");
    Logger.log("DocType: " + docType);
    Logger.log("Indice de Columna Objetivo (0-based): " + targetColIdx);
    Logger.log("Referencia a buscar: " + String(referenceNo).trim().toLowerCase());
    
    // Bucle de búsqueda de la fila (empezamos en 1 para saltar el encabezado)
    var targetRowIndex = -1;
    var referenceNoStr = String(referenceNo).trim().toLowerCase();
    
    for (var i = 1; i < data.length; i++) {
      var cellValue = data[i][targetColIdx];
      var cellValueStr = cellValue != null ? String(cellValue).trim().toLowerCase() : "";
      
      if (cellValueStr === referenceNoStr) {
        targetRowIndex = i + 1; // +1 porque el array es base 0, y las filas de la hoja son base 1
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { status: 'error', message: 'La referencia "' + referenceNo + '" no existe en la hoja. Puede haber sido eliminada mientras el modal estaba abierto.' };
    }

    // Validación específica para Orden de Acondicionamiento: verificar que AdjuntoOrden sea "Pendiente"
    if (docType === "Orden de Acondicionamiento") {
      var currentAdjunto = data[targetRowIndex - 1][colAdjuntoIdx - 1]; // colAdjuntoIdx es base-1, data es base-0
      if (currentAdjunto && currentAdjunto.toString().trim() !== "Pendiente") {
        return { status: 'error', message: 'La orden "' + referenceNo + '" ya no está en estado "Pendiente". Puede haber sido cargada por otro usuario. Actualice el modal.' };
      }
    }

    // Obtener carpeta desde templates
    var tplSheet = ss.getSheetByName('templates');
    if (!tplSheet) {
      throw new Error("La hoja 'templates' no existe.");
    }

    var tplData = tplSheet.getDataRange().getValues();
    var tplHeaders = tplData[0];
    var folderId = "";
    
    // Obtener índices de columnas por nombre para templates
    var colClaveIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Clave', false);
    var colValorIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Valor', false);
    
    // Si alguna columna no existe, usar índices por defecto
    if (!colClaveIdx) colClaveIdx = 1;
    if (!colValorIdx) colValorIdx = 2;
    
    // Convertir a base-0 para acceso a array
    colClaveIdx = colClaveIdx - 1;
    colValorIdx = colValorIdx - 1;

    for (var i = 1; i < tplData.length; i++) {
      var key = tplData[i][colClaveIdx] ? tplData[i][colClaveIdx].toString().trim() : "";
      if (key === folderKey) {
        folderId = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
        break;
      }
    }

    if (!folderId) {
      throw new Error("No se encontró la clave " + folderKey + " en la hoja 'templates'. Configure el ID de la carpeta correspondiente.");
    }

    // Obtener la carpeta destino
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
      Logger.log("Carpeta destino obtenida correctamente.");
    } catch (e) {
      throw new Error("No se puede acceder a la carpeta (ID: " + folderId + "). Verifique que el ID es correcto y que el script tiene permisos de acceso.");
    }

    // Manejo de Históricos (Sobreescritura segura)
    var targetFileName = referenceNo + ".pdf";
    var existingFiles = folder.getFilesByName(targetFileName);
    var archivoReemplazado = false;
    
    // Verificar si el archivo ya existe
    if (existingFiles.hasNext()) {
      Logger.log("Archivo ya existe: " + targetFileName);
      if (!overwriteConfirmed) {
        // Retornar status 'exists' para que el frontend pida confirmación
        Logger.log("Retornando status 'exists' para pedir confirmación al usuario");
        return { status: 'exists', fileName: targetFileName, rowIdx: targetRowIndex };
      }
      
      // Si overwriteConfirmed es true, proceder con el reemplazo
      while (existingFiles.hasNext()) {
        var oldFile = existingFiles.next();
        Logger.log("Enviando a papelera el archivo existente: " + oldFile.getName());
        oldFile.setTrashed(true); // Enviar a papelera para cumplimiento de auditoría
        archivoReemplazado = true;
      }
    }

    // Decodificar base64 y crear el archivo
    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, mimeType, targetFileName);
    var newFile = folder.createFile(blob);

    // Actualizar UI en la hoja según tipo de documento
    if (docType === "Orden de Acondicionamiento") {
      // Poner "✅ Cargado" en AdjuntoOrden y agregar Nota
      var targetCell = sheetOrdenes.getRange(targetRowIndex, colAdjuntoIdx); // colAdjuntoIdx es base-1
      targetCell.setValue("✅ Cargado");
      var fileUrl = newFile.getUrl();
      targetCell.setNote("Archivo cargado: " + fileUrl);
    } else if (docType === "Registro de Inspeccion Base") {
      // NO tocar AdjuntoOrden - solo agregar Nota en NoAnalisis
      var targetCell = sheetOrdenes.getRange(targetRowIndex, colNoAnalisisIdx); // colNoAnalisisIdx es base-1
      var fileUrl = newFile.getUrl();
      targetCell.setNote("Registro base cargado: " + fileUrl);
    }

    // Auditoría obligatoria
    var userIdentity = getUserIdentityStringByUserId_(actingUserId);
    var logMessage = archivoReemplazado 
      ? "Se REEMPLAZÓ el documento tipo '" + docType + "' para la referencia " + referenceNo + " desde el modal centralizado"
      : "Se subió el documento tipo '" + docType + "' para la referencia " + referenceNo + " desde el modal centralizado";
    logChange('CARGA_DOCUMENTO', logMessage, userIdentity);
    
    return { status: 'success', message: 'Documento subido exitosamente para ' + docType + ' ' + referenceNo + '.' };
    
  } catch (e) {
    Logger.log("Error en procesarSubidaDocumentoCentral: " + e.message);
    return { status: 'error', message: "Error interno del servidor: " + e.message };
  }
}
