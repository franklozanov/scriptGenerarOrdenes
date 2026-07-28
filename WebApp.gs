// ============================================================
// MODULE: WebApp
// Descripción: Endpoints públicos (doGet, doPost)
// Prioridad de Carga: 13° (último - depende de todo)
// FASE 5 - Batch 5.3: Web App Endpoints (FINAL)
// ============================================================

// --- ENDPOINT GET: Visor de PDF ---

/**
 * Maneja las solicitudes GET a la Web App.
 * Sirve PDFs directamente o muestra el visor HTML.
 * @param {Object} e - Objeto de evento con parámetros de la solicitud
 * @returns {HtmlOutput|ContentService} HTML del visor de PDF o PDF directo
 */
function doGet(e) {
  var fileId = e.parameter.fileId;
  var action = e.parameter.action;
  
  // Si action=viewpdf, servir el PDF directamente con headers inline
  if (action === 'viewpdf' && fileId) {
    try {
      Logger.log('doGet: Intentando servir PDF con fileId: ' + fileId);
      var file = DriveApp.getFileById(fileId);
      
      // Verificar que el archivo sea un PDF
      if (file.getMimeType() !== 'application/pdf') {
        throw new Error('El archivo no es un PDF válido');
      }
      
      Logger.log('doGet: Archivo encontrado: ' + file.getName());
      var blob = file.getBlob();
      var base64 = Utilities.base64Encode(blob.getBytes());
      Logger.log('doGet: PDF codificado en base64');
      
      // Servir el PDF usando data URI para que se abra en el visor del navegador
      var html = '<!DOCTYPE html><html><head><title>' + file.getName() + '</title></head><body>' +
        '<iframe src="data:application/pdf;base64,' + base64 + '" ' +
        'style="position:fixed;top:0;left:0;width:100%;height:100%;border:none;" ' +
        'type="application/pdf"></iframe>' +
        '</body></html>';
      
      return HtmlService.createHtmlOutput(html)
        .setTitle(file.getName())
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (error) {
      Logger.log('doGet ERROR: ' + error.message);
      return ContentService.createTextOutput('Error al cargar el PDF: ' + error.message + '\n\nFileId: ' + fileId)
        .setMimeType(ContentService.MimeType.TEXT);
    }
  }
  
  // Comportamiento original: mostrar visor HTML
  var html = HtmlService.createTemplateFromFile('PDFViewer')
    .evaluate()
    .setTitle('Visor de PDF')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  
  // Inyectar fileId en el HTML
  html = html.getContent().replace('{{fileId}}', fileId || '');
  
  return HtmlService.createHtmlOutput(html);
}

// --- ENDPOINT POST: Operaciones Privilegiadas ---

/**
 * Maneja las solicitudes POST a la Web App.
 * Procesa operaciones privilegiadas con autenticación de usuario.
 * @param {Object} e - Objeto de evento con datos POST
 * @returns {ContentService} Respuesta JSON
 */
function doPost(e) {
  try {
    if (!e || !e.postData) {
      return jsonResponse_({ status: 'error', message: 'No se recibieron datos en la solicitud.', diagnostic: 'MISSING_POST_DATA' });
    }

    var params;
    try {
      params = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return jsonResponse_({ status: 'error', message: 'Error al procesar los datos enviados. Formato JSON inválido.', diagnostic: 'JSON_PARSE_ERROR', details: parseError.message });
    }

    var result = handlePrivilegedOperation_(params);
    Logger.log("WebApp - Resultado: " + result.status);
    return jsonResponse_(result);
  } catch (error) {
    Logger.log("Error general en doPost: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    return jsonResponse_({ status: 'error', message: error.message, diagnostic: 'INTERNAL_SERVER_ERROR' });
  }
}

// --- FUNCIONES AUXILIARES ---

/**
 * Crea una respuesta JSON para la Web App.
 * @param {Object} payload - Objeto a serializar como JSON
 * @returns {ContentService} Respuesta con tipo MIME JSON
 * @private
 */
function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Maneja operaciones privilegiadas con autenticación de usuario.
 * Enruta las operaciones a las funciones correspondientes.
 * @param {Object} params - Parámetros de la operación
 * @returns {Object} Resultado de la operación
 * @private
 */
function handlePrivilegedOperation_(params) {
  var callingUserId = requireAuthorizedUser_(params);
  var operation = params.operation || '';
  Logger.log("WebApp - Operación solicitada: " + operation);
  Logger.log("WebApp - UserID validado: " + callingUserId);

  if (operation === 'uploadDocument') {
    if (!params.base64Data || !params.mimeType || !params.fileName || !params.referenceNo || !params.docType) {
      return { status: 'error', message: 'Faltan parámetros requeridos para subir documento.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    if (params.mimeType !== 'application/pdf') {
      return { status: 'error', message: 'Solo se permiten archivos PDF.', diagnostic: 'INVALID_MIME_TYPE', receivedMimeType: params.mimeType };
    }
    return procesarSubidaDocumentoCentral(params.base64Data, params.mimeType, params.fileName, params.referenceNo, params.docType, params.overwriteConfirmed || false, callingUserId);
  }

  if (operation === 'saveFinalPDF') {
    if (!params.base64Data || !params.orderNo) {
      return { status: 'error', message: 'Faltan parámetros requeridos para guardar el PDF final.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var saveResult = saveFinalUnifiedPDF(params.base64Data, params.orderNo);
    return { status: 'success', message: 'PDF final guardado exitosamente para orden ' + params.orderNo, data: saveResult };
  }

  if (operation === 'updateTraceability') {
    if (!params.orderNo || !params.userId || !params.pagesPrinted || !params.printType) {
      return { status: 'error', message: 'Faltan parámetros requeridos para actualizar trazabilidad.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var traceMsg = internalUpdateTraceability(params.orderNo, params.userId, params.pagesPrinted, params.printType);
    return { status: 'success', message: traceMsg };
  }

  if (operation === 'finalizeFinalPdf') {
    if (!params.orderNo || !params.fileId) {
      return { status: 'error', message: 'Faltan parámetros requeridos para finalizar post-guardado.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var finalizeMsg = finalizeFinalPdfPostSave(params.orderNo, params.fileId, params.archivoReemplazado || false, callingUserId);
    return { status: 'success', message: finalizeMsg };
  }

  if (operation === 'registrarNovedad') {
    if (!params.noOrden || !params.codigo || !params.tipoNovedad || !params.status || !params.realizadoPor) {
      return { status: 'error', message: 'Faltan parámetros requeridos para registrar novedad.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return procesarRegistroNovedad(params, callingUserId);
  }

  return {
    status: 'error',
    message: 'Operación no reconocida: ' + operation,
    diagnostic: 'UNKNOWN_OPERATION',
    supportedOperations: ['uploadDocument', 'saveFinalPDF', 'updateTraceability', 'finalizeFinalPdf', 'registrarNovedad']
  };
}

// --- GESTIÓN DE URL DE WEB APP ---

/**
 * Obtiene la URL de la Web App actual.
 * Intenta obtenerla desde propiedades guardadas, luego desde ScriptApp, y finalmente usa fallback.
 * @returns {string} URL de la Web App
 */
function getWebAppUrl() {
  try {
    var savedUrl = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
    if (savedUrl) {
      Logger.log("URL de Web App obtenida desde propiedades: " + savedUrl);
      return savedUrl;
    }

    var fallbackUrl = "https://script.google.com/macros/s/AKfycbyixSyKwcVkFQG1GQMyBhNZ8WOK0MVdg3wcThtG8tZvtpgGVzTj03M097hvEm01Hwwe/exec";

    var service = ScriptApp.getService();
    var url = service.getUrl();
    if (!url && fallbackUrl) {
      Logger.log("URL de Web App obtenida desde fallback: " + fallbackUrl);
      return fallbackUrl;
    }
    if (!url) {
      throw new Error("La URL de la Web App está vacía. Publique una nueva implementación como Aplicación web.");
    }
    Logger.log("URL de Web App obtenida: " + url);
    return url;
  } catch (e) {
    Logger.log("Error obteniendo URL de Web App: " + e.message);
    throw new Error("No se pudo obtener la URL de la Web App. Asegúrese de que el script esté desplegado como Web App.");
  }
}

/**
 * Guarda la URL de la Web App en propiedades del script.
 * Valida que la URL sea válida y limpia el caché de datos iniciales.
 * @param {string} url - URL de la Web App a guardar
 * @returns {string} Mensaje de confirmación
 */
function setWebAppUrl(url) {
  if (!url || url.toString().trim() === "") {
    throw new Error("Debe proporcionar una URL de Web App válida.");
  }

  var cleanUrl = url.toString().trim();
  if (cleanUrl.indexOf("https://script.google.com/") !== 0 || cleanUrl.indexOf("/exec") === -1) {
    throw new Error("La URL no parece ser una URL válida de Web App de Apps Script. Debe iniciar con https://script.google.com/ y terminar en /exec.");
  }

  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', cleanUrl);
  CacheService.getScriptCache().remove('initialData_v1');
  CacheService.getScriptCache().remove('initialData_v2');
  Logger.log("WEB_APP_URL guardada correctamente: " + cleanUrl);
  return "WEB_APP_URL guardada correctamente.";
}

/**
 * Redirige una solicitud al Web App a través del servidor para evitar problemas de CORS y múltiples cuentas.
 * @param {string} payloadString - El payload JSON como string
 * @returns {string} La respuesta del Web App como string JSON
 */
function proxyWebAppPost(payloadString) {
  var url = getWebAppUrl();
  var options = {
    method: 'post',
    contentType: 'text/plain',
    payload: payloadString,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();
  
  // Si la respuesta es HTML (p. ej., página de inicio de sesión de Google)
  if (responseText && responseText.trim().indexOf('<!DOCTYPE') === 0) {
    throw new Error('El Web App devolvió una página HTML en lugar de JSON. Verifique los permisos de publicación o actualice la URL del Web App.');
  }
  
  if (responseCode !== 200 && responseCode !== 302) {
    throw new Error('Error del servidor proxy (' + responseCode + '): ' + responseText.substring(0, 100));
  }
  
  return responseText;
}
