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
    var template = HtmlService.createTemplateFromFile('UploadCentralModal');
    var html = template.evaluate()
      .setWidth(700)
      .setHeight(600);
    SpreadsheetApp.getUi().showModelessDialog(html, ' '); // Título vacío - el drag handle provee el título
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

// --- OBTENCIÓN DE LISTAS PENDIENTES ---

/**
 * Obtiene las listas de órdenes y análisis pendientes de carga.
 * Retorna arrays con los NoOrden según el estado de carga de COA y OA.
 * 
 * @returns {Object} Objeto con arrays de órdenes pendientes por tipo de documento
 * @property {Array<string>} ordenesPendientesOA - Números de orden con OA pendiente
 * @property {Array<string>} ordenesPendientesCOA - Números de orden con COA pendiente
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
    var colAdjuntoCOACol = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
    var colAdjuntoOACol = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
    var colNoAnalisisCol = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { ordenesPendientesOA: [], ordenesPendientesCOA: [] };
    }
    
    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var data = dataRange.getValues();
    
    var ordenesPendientesOA = [];
    var ordenesPendientesCOA = [];
    
    for (var i = 0; i < data.length; i++) {
      var noOrden = data[i][colNoOrdenCol - 1];
      var estadoCOA = colAdjuntoCOACol ? data[i][colAdjuntoCOACol - 1] : "Pendiente";
      var estadoOA = colAdjuntoOACol ? data[i][colAdjuntoOACol - 1] : "Pendiente";
      var noAnalisis = colNoAnalisisCol ? data[i][colNoAnalisisCol - 1] : null;
      
      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var estadoCOAStr = estadoCOA ? estadoCOA.toString().trim() : "Pendiente";
      var estadoOAStr = estadoOA ? estadoOA.toString().trim() : "Pendiente";
      var noAnalisisStr = noAnalisis ? noAnalisis.toString().trim() : "";
      
      if (!noOrdenStr) continue;
      
      // Agregar a lista de OA pendientes si AdjuntoOA != "✅ Cargado"
      if (estadoOAStr !== "✅ Cargado") {
        ordenesPendientesOA.push(noOrdenStr);
      }
      
      // Agregar a lista de COA pendientes si AdjuntoCOA != "✅ Cargado" Y tiene NoAnalisis
      if (estadoCOAStr !== "✅ Cargado" && noAnalisisStr) {
        ordenesPendientesCOA.push(noAnalisisStr); // Usar NoAnalisis para COA
      }
    }
    
    Logger.log("✓ Órdenes con OA pendiente: " + ordenesPendientesOA.length);
    Logger.log("✓ Órdenes con COA pendiente: " + ordenesPendientesCOA.length);
    return { ordenesPendientesOA: ordenesPendientesOA, ordenesPendientesCOA: ordenesPendientesCOA };
    
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
    var colAdjuntoCOAIdx = getColumnIndexByName(headers, 'AdjuntoCOA', false);
    var colAdjuntoOAIdx = getColumnIndexByName(headers, 'AdjuntoOA', false);
    var colEstadoCargaIdx = getColumnIndexByName(headers, 'EstadoCarga', false);
    var colNoOrdenIdx = getColumnIndexByName(headers, 'NoOrden', true);
    var colNoAnalisisIdx = getColumnIndexByName(headers, 'NoAnalisis', false);
    
    // Determinar la columna objetivo según docType (para búsqueda en array data)
    var targetColName = "";
    var folderKey = "";
    var targetAdjuntoCol = null;
    
    if (docType === "Orden de Acondicionamiento") {
      targetColName = "NoOrden";
      folderKey = "DOC_ORDENES";
      targetAdjuntoCol = colAdjuntoOAIdx;
    } else if (docType === "Certificado de Analisis") {
      targetColName = "NoOrden";
      folderKey = "DOC_ANALISIS";
      targetAdjuntoCol = colAdjuntoCOAIdx;
    }
    
    // Validación de seguridad para folderKey y targetAdjuntoCol
    if (folderKey === "" || !targetAdjuntoCol) {
      return { status: 'error', message: "Tipo de documento no reconocido o columnas no configuradas: " + docType };
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

    // Validación: verificar que el documento específico esté pendiente
    var currentEstadoDoc = data[targetRowIndex - 1][targetAdjuntoCol - 1];
    var currentEstadoDocStr = currentEstadoDoc ? currentEstadoDoc.toString().trim() : "Pendiente";
    
    if (currentEstadoDocStr === "✅ Cargado") {
      return { status: 'error', message: 'El documento "' + docType + '" para "' + referenceNo + '" ya está cargado. Actualice el modal.' };
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
    var fileUrl = newFile.getUrl();
    var targetCell = sheetOrdenes.getRange(targetRowIndex, targetAdjuntoCol);
    targetCell.setValue(VALORES_DOCUMENTO.CARGADO);
    targetCell.setNote("Archivo cargado: " + fileUrl);
    
    // Actualizar estado consolidado
    if (colEstadoCargaIdx) {
      actualizarEstadoCarga(sheetOrdenes, targetRowIndex, headers);
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
