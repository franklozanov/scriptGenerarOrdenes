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
  // La validación de identidad se realiza inline dentro de UploadCentralModal.html al cargar
  // (vía getInitialData() → activeEmail → match con hoja Usuarios)
  try {
    var template = HtmlService.createTemplateFromFile('UploadCentralModal');
    var html = template.evaluate()
      .setWidth(700)
      .setHeight(600);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Subida Masiva de Documentos');
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
    var colEstadoDocumentosCol = getColumnIndexByNameCaseInsensitive(headers, 'EstadoDocumentos', false);
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
      var estadoDoc = colEstadoDocumentosCol ? data[i][colEstadoDocumentosCol - 1] : "🔴 Faltan Ambos";
      var noAnalisis = colNoAnalisisCol ? data[i][colNoAnalisisCol - 1] : null;
      
      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var estadoDocStr = estadoDoc ? estadoDoc.toString().trim() : "🔴 Faltan Ambos";
      var noAnalisisStr = noAnalisis ? noAnalisis.toString().trim() : "";
      
      if (!noOrdenStr) continue;
      
      // Agregar a lista de OA pendientes si el estado incluye Faltan Ambos o Falta OA
      if (estadoDocStr.indexOf("Faltan Ambos") !== -1 || estadoDocStr.indexOf("Falta OA") !== -1) {
        if (ordenesPendientesOA.indexOf(noOrdenStr) === -1) {
          ordenesPendientesOA.push(noOrdenStr);
        }
      }
      
      // Agregar a lista de COA pendientes si el estado incluye Faltan Ambos o Falta COA Y tiene NoAnalisis
      if (noAnalisisStr && (estadoDocStr.indexOf("Faltan Ambos") !== -1 || estadoDocStr.indexOf("Falta COA") !== -1)) {
        if (ordenesPendientesCOA.indexOf(noAnalisisStr) === -1) {
          ordenesPendientesCOA.push(noAnalisisStr);
        }
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
    var colEstadoDocumentosIdx = getColumnIndexByName(headers, 'EstadoDocumentos', false);
    var colNoOrdenIdx = getColumnIndexByName(headers, 'NoOrden', true);
    var colNoAnalisisIdx = getColumnIndexByName(headers, 'NoAnalisis', false);
    
    // Determinar la columna objetivo según docType (para búsqueda en array data)
    var targetColName = "";
    var folderKey = "";
    
    if (docType === "Orden de Acondicionamiento") {
      targetColName = "NoOrden";
      folderKey = "DOC_ORDENES";
    } else if (docType === "Certificado de Analisis") {
      targetColName = "NoAnalisis";
      folderKey = "DOC_ANALISIS";
    }
    
    // Validación de seguridad para folderKey
    if (folderKey === "") {
      return { status: 'error', message: "Tipo de documento no reconocido o columnas no configuradas: " + docType };
    }
    
    // Obtener índice de columna objetivo para búsqueda en array (base-0)
    var targetColIdx = getColumnIndexByName(headers, targetColName, true) - 1;
    
    // Logs de auditoría críticos
    Logger.log("--- AUDITORIA DE BUSQUEDA ---");
    Logger.log("DocType: " + docType);
    Logger.log("Indice de Columna Objetivo (0-based): " + targetColIdx);
    Logger.log("Referencia a buscar: " + String(referenceNo).trim().toLowerCase());
    
    // Bucle de búsqueda para TODAS las filas que coincidan
    var targetRowIndices = [];
    var referenceNoStr = String(referenceNo).trim().toLowerCase();
    
    for (var i = 1; i < data.length; i++) {
      var cellValue = data[i][targetColIdx];
      var cellValueStr = cellValue != null ? String(cellValue).trim().toLowerCase() : "";
      
      if (cellValueStr === referenceNoStr) {
        targetRowIndices.push(i + 1); // +1 porque el array es base 0, y las filas de la hoja son base 1
      }
    }

    if (targetRowIndices.length === 0) {
      return { status: 'error', message: 'La referencia "' + referenceNo + '" no existe en la hoja. Puede haber sido eliminada mientras el modal estaba abierto.' };
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
    var skipUpload = false;
    var fileUrl = "";
    
    // Verificar si el archivo ya existe
    if (existingFiles.hasNext()) {
      Logger.log("Archivo ya existe: " + targetFileName);
      
      if (overwriteConfirmed === 'skipUpload') {
        // Usuario canceló reemplazo - solo actualizar estado sin tocar archivo
        Logger.log("Usuario canceló reemplazo. Actualizando estado sin modificar archivo.");
        var existingFile = existingFiles.next();
        fileUrl = existingFile.getUrl();
        skipUpload = true;
      } else if (!overwriteConfirmed) {
        // Retornar status 'exists' para que el frontend pida confirmación
        Logger.log("Retornando status 'exists' para pedir confirmación al usuario");
        return { status: 'exists', fileName: targetFileName, rowIdx: targetRowIndices[0] };
      } else {
        // Si overwriteConfirmed es true, proceder con el reemplazo
        while (existingFiles.hasNext()) {
          var oldFile = existingFiles.next();
          Logger.log("Enviando a papelera el archivo existente: " + oldFile.getName());
          oldFile.setTrashed(true); // Enviar a papelera para cumplimiento de auditoría
          archivoReemplazado = true;
        }
      }
    }

    // Subir archivo solo si no se saltó la subida
    if (!skipUpload) {
      // Decodificar base64 y crear el archivo
      var decodedData = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(decodedData, mimeType, targetFileName);
      var newFile = folder.createFile(blob);
      fileUrl = newFile.getUrl();
    }

    // Actualizar estado consolidado para TODAS las filas afectadas
    for (var j = 0; j < targetRowIndices.length; j++) {
      actualizarEstadoDocumentosEnHoja(sheetOrdenes, targetRowIndices[j], headers);
    }

    // Auditoría obligatoria
    var userIdentity = getUserIdentityStringByUserId_(actingUserId);
    var logMessage = "";
    
    if (skipUpload) {
      logMessage = "Se actualizó el estado a 'Cargado' para '" + docType + "' (ref: " + referenceNo + ") sin modificar el archivo existente";
    } else if (archivoReemplazado) {
      logMessage = "Se REEMPLAZÓ el documento tipo '" + docType + "' para la referencia " + referenceNo + " desde el modal centralizado";
    } else {
      logMessage = "Se subió el documento tipo '" + docType + "' para la referencia " + referenceNo + " desde el modal centralizado";
    }
    
    logChange('CARGA_DOCUMENTO', logMessage, userIdentity);
    
    return { status: 'success', message: 'Documento procesado exitosamente para ' + docType + ' ' + referenceNo + '.' };
    
  } catch (e) {
    Logger.log("Error en procesarSubidaDocumentoCentral: " + e.message);
    return { status: 'error', message: "Error interno del servidor: " + e.message };
  }
}
