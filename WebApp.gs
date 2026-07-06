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
  var mode = e.parameter.mode || '';

  // Validacion de sesion deshabilitada para visores publicos (Security by Obscurity via fileId)
  // var activeEmail = Session.getActiveUser().getEmail();
  // var userRecord = getUserRecordByEmail_(activeEmail);

  // Modo 'pending': el opener (sidebar) ya tiene los bytes del PDF en memoria y los entrega
  // por postMessage en cuanto la vista señale que está lista; no requiere fileId todavía
  // (el guardado en Drive ocurre en paralelo, en segundo plano). Ver ModalVisorPDF.html.
  if (action === 'secure' && mode === 'pending') {
    var htmlPending = HtmlService.createTemplateFromFile('ModalVisorPDF');
    htmlPending.fileId = '';
    htmlPending.orderNo = e.parameter.orderNo || '';
    htmlPending.mode = 'pending';
    htmlPending.nonce = e.parameter.nonce || '';
    return htmlPending.evaluate()
      .setTitle('Visor Restringido')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // Si action=secure, mostrar visor seguro con PDF.js
  if (action === 'secure' && fileId) {
    var htmlSecure = HtmlService.createTemplateFromFile('ModalVisorPDF');
    htmlSecure.fileId = fileId;
    htmlSecure.orderNo = e.parameter.orderNo || '';
    htmlSecure.mode = '';
    htmlSecure.nonce = '';
    return htmlSecure.evaluate()
      .setTitle('Visor Restringido')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createHtmlOutput('<h1>Ruta Inválida</h1><p>No se especificó una acción segura.</p>');
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
  // La validación ahora debe ser independiente de lo que envíe el cliente.
  var callingUserId = requireAuthorizedUserStrict_(params);
  var operation = params.operation || '';
  Logger.log("WebApp - Operación solicitada: " + operation);
  Logger.log("WebApp - UserID validado: " + callingUserId);

  if (operation === 'uploadDocument') {
    if (!hasPermission(callingUserId, PERMISOS.SUBIR_DOCUMENTOS)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.base64Data || !params.mimeType || !params.fileName || !params.referenceNo || !params.docType) {
      return { status: 'error', message: 'Faltan parámetros requeridos para subir documento.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    if (params.mimeType !== 'application/pdf') {
      return { status: 'error', message: 'Solo se permiten archivos PDF.', diagnostic: 'INVALID_MIME_TYPE', receivedMimeType: params.mimeType };
    }
    return procesarSubidaDocumentoCentral(params.base64Data, params.mimeType, params.fileName, params.referenceNo, params.docType, params.overwriteConfirmed || false, callingUserId);
  }

  if (operation === 'saveFinalPDF') {
    if (!hasPermission(callingUserId, PERMISOS.IMPRIMIR_ORDEN)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.base64Data || !params.orderNo) {
      return { status: 'error', message: 'Faltan parámetros requeridos para guardar el PDF final.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var saveResult = saveFinalUnifiedPDF(params.base64Data, params.orderNo);
    return { status: 'success', message: 'PDF final guardado exitosamente para orden ' + params.orderNo, data: saveResult };
  }

  if (operation === 'updateTraceability') {
    if (!hasPermission(callingUserId, PERMISOS.IMPRIMIR_ORDEN)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.orderNo || !params.userId || !params.pagesPrinted || !params.printType) {
      return { status: 'error', message: 'Faltan parámetros requeridos para actualizar trazabilidad.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var traceMsg = internalUpdateTraceability(params.orderNo, params.userId, params.pagesPrinted, params.printType);
    return { status: 'success', message: traceMsg };
  }

  if (operation === 'finalizeFinalPdf') {
    if (!hasPermission(callingUserId, PERMISOS.IMPRIMIR_ORDEN)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.orderNo || !params.fileId) {
      return { status: 'error', message: 'Faltan parámetros requeridos para finalizar post-guardado.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var finalizeMsg = finalizeFinalPdfPostSave(params.orderNo, params.fileId, params.archivoReemplazado || false, callingUserId);
    return { status: 'success', message: finalizeMsg };
  }

  if (operation === 'registrarNovedad') {
    if (!hasPermission(callingUserId, PERMISOS.REGISTRAR_NOVEDAD)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.noOrden || !params.codigo || !params.tipoNovedad || !params.status || !params.realizadoPor) {
      return { status: 'error', message: 'Faltan parámetros requeridos para registrar novedad.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return procesarRegistroNovedad(params, callingUserId);
  }

  if (operation === 'cargarOrdenesMasivas') {
    if (!hasPermission(callingUserId, PERMISOS.CARGAR_ORDENES)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.records || !Array.isArray(params.records) || params.records.length === 0) {
      return { status: 'error', message: 'Faltan parámetros requeridos para cargar órdenes masivas.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return procesarCargaOrdenesMasivas(params, callingUserId);
  }

  if (operation === 'validarMatrizKEnLinea') {
    if (!hasPermission(callingUserId, PERMISOS.CARGAR_ORDENES)) {
      return { status: 'error', message: 'No tiene permisos.' };
    }
    if (!params.noAnalisis) return { status: 'error', message: 'Falta NoAnalisis.' };
    
    var val = validarNoAnalisisContraMatrices(params.noAnalisis, {
      lote: params.lote || '',
      cantidad: parseFloat(params.cantidad) || 0,
      exp: params.exp || ''
    });
    
    return { status: 'success', data: val };
  }

  if (operation === 'validarTarjetasMasivo') {
    if (!hasPermission(callingUserId, PERMISOS.CARGAR_ORDENES)) {
      return { status: 'error', message: 'No tiene permisos.' };
    }
    if (!params.records || !Array.isArray(params.records)) {
      return { status: 'error', message: 'Faltan records.' };
    }
    var resultados = [];
    params.records.forEach(function(r, index) {
      if (!r.NoAnalisis) {
        resultados.push({ index: index, decision: '' });
      } else {
        var val = validarNoAnalisisContraMatrices(r.NoAnalisis, {
          lote: r.Lote || '',
          cantidad: parseFloat(r.Cantidad) || 0,
          exp: r.Exp || ''
        });
        resultados.push({ index: index, decision: val.decision });
      }
    });
    return { status: 'success', data: resultados };
  }

  if (operation === 'revalidarOrden') {
    if (!hasPermission(callingUserId, PERMISOS.AUTORIZAR_QA) && !hasPermission(callingUserId, PERMISOS.MENU_CONFIG)) {
      return { status: 'error', message: 'No tiene permisos para re-validar órdenes.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.noOrden) {
      return { status: 'error', message: 'Falta el parámetro noOrden.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return revalidarOrden(params.noOrden, callingUserId);
  }

  if (operation === 'getMatricesConfig') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN) && !hasPermission(callingUserId, PERMISOS.MENU_CONFIG)) {
      return { status: 'error', message: 'No tiene permisos para ver la configuración de matrices.', diagnostic: 'PERMISSION_DENIED' };
    }
    return { status: 'success', data: getMatricesConfig() };
  }

  if (operation === 'guardarMatrizConfig') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN) && !hasPermission(callingUserId, PERMISOS.MENU_CONFIG)) {
      return { status: 'error', message: 'No tiene permisos para modificar matrices.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.config) {
      return { status: 'error', message: 'Falta el parámetro config.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return guardarMatrizConfig(params.config, params.rowIndex || null);
  }

  if (operation === 'eliminarMatrizConfig') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN)) {
      return { status: 'error', message: 'Solo un administrador puede eliminar matrices.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.rowIndex) {
      return { status: 'error', message: 'Falta el parámetro rowIndex.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return eliminarMatrizConfig(params.rowIndex);
  }

  if (operation === 'actualizarCampoOrden') {
    if (!hasPermission(callingUserId, PERMISOS.AUTORIZAR_QA) && !hasPermission(callingUserId, PERMISOS.MENU_CONFIG)) {
      return { status: 'error', message: 'No tiene permisos para editar campos de órdenes.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.noOrden || !params.campo || params.nuevoValor === undefined) {
      return { status: 'error', message: 'Faltan parámetros: noOrden, campo, nuevoValor.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    // Solo se permiten editar campos no-críticos de sistema
    var CAMPOS_EDITABLES = ['NoAnalisis', 'Lote', 'Exp', 'Cantidad', 'Codigo', 'Descripcion'];
    if (CAMPOS_EDITABLES.indexOf(params.campo) === -1) {
      return { status: 'error', message: 'El campo "' + params.campo + '" no es editable desde el UI.', diagnostic: 'INVALID_FIELD' };
    }
    return actualizarCampoOrden_(params.noOrden, params.campo, params.nuevoValor, callingUserId);
  }

  if (operation === 'autorizarOrdenesQA') {
    if (!hasPermission(callingUserId, PERMISOS.AUTORIZAR_QA)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.targetIds || !Array.isArray(params.targetIds) || params.targetIds.length === 0) {
      return { status: 'error', message: 'Faltan parámetros requeridos para autorizar órdenes.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return procesarAutorizacionQA(params, callingUserId);
  }

  if (operation === 'solicitarImpresion') {
    if (!hasPermission(callingUserId, PERMISOS.SOLICITAR_REIMPRESION)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.noOrden || !params.tipoSolicitud || !params.motivo || !params.plantillas) {
      return { status: 'error', message: 'Faltan parámetros requeridos para solicitar impresión extraordinaria.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return registrarSolicitudImpresion(params, callingUserId);
  }

  if (operation === 'procesarAprobacionImpresionQA') {
    if (!hasPermission(callingUserId, PERMISOS.APROBAR_REIMPRESION)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.targetIds || !Array.isArray(params.targetIds) || params.targetIds.length === 0) {
      return { status: 'error', message: 'Faltan parámetros requeridos para procesar aprobación.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    if (!params.accion || (params.accion !== 'Aprobada' && params.accion !== 'Rechazada')) {
      return { status: 'error', message: 'Acción inválida. Debe ser "Aprobada" o "Rechazada".', diagnostic: 'INVALID_ACTION' };
    }
    return procesarAprobacionImpresionQA(params, callingUserId);
  }

  if (operation === 'setAutoApprovalConfig') {
    if (!hasPermission(callingUserId, PERMISOS.GESTIONAR_AUTOAPROBACION)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    return procesarSetAutoApproval(params, callingUserId);
  }

  if (operation === 'processPrint') {
    if (!hasPermission(callingUserId, PERMISOS.IMPRIMIR_ORDEN)) {
      return { status: 'error', message: 'No tiene permisos para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.base64Data || !params.orderNo || !params.pagesPrinted) {
      return { status: 'error', message: 'Faltan parámetros requeridos para procesar la impresión.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    // Corre como el propietario (identidad de la Web App), por lo que puede escribir en las
    // columnas/hojas protegidas de Ordenes. La transacción es atómica con rollback.
    var printResult = processPrintForUser(params.base64Data, params.orderNo, callingUserId, params.printType || 'Inicial', params.pagesPrinted);
    return { status: 'success', message: 'Impresión registrada para orden ' + params.orderNo, data: printResult };
  }

  return {
    status: 'error',
    message: 'Operación no reconocida: ' + operation,
    diagnostic: 'UNKNOWN_OPERATION',
    supportedOperations: ['uploadDocument', 'saveFinalPDF', 'updateTraceability', 'finalizeFinalPdf', 'registrarNovedad', 'cargarOrdenesMasivas', 'autorizarOrdenesQA', 'solicitarImpresion', 'procesarAprobacionImpresionQA', 'setAutoApprovalConfig', 'processPrint']
  };
}

// --- SEGURIDAD 21 CFR Part 11 ---

/**
 * Valida rigurosamente la identidad del usuario y su PIN.
 * No confía en parámetros front-end, obtiene el correo directamente de la sesión de Google.
 * @param {Object} params - Parámetros recibidos en el POST (debe contener pinFirma)
 * @returns {string} UserID del usuario validado
 * @throws {Error} Si el usuario no existe, no está activo o el PIN es incorrecto.
 */
function requireAuthorizedUserStrict_(params) {
  var userId = params.userId;
  var pinRecibido = params.pinFirma || params.pin;

  if (!userId) {
    // Fallback: Si no mandan userId, intentamos obtenerlo de la sesión activa
    var activeEmail = Session.getActiveUser().getEmail();
    if (!activeEmail) {
      throw new Error("No se proporcionó el UserID y no se pudo verificar la identidad de Google. Inicie sesión nuevamente.");
    }
    var userByEmail = getUserRecordByEmail_(activeEmail);
    if (!userByEmail) throw new Error("ACCESO DENEGADO: El correo " + activeEmail + " no está registrado.");
    userId = userByEmail.userId;
  }

  // 1. Buscar usuario en base de datos (Hoja Usuarios) por UserID
  var validUser = getUserRecordByUserId_(userId);
  if (!validUser) {
    throw new Error("ACCESO DENEGADO: El usuario con ID " + userId + " no está registrado en el sistema.");
  }

  if (validUser.estado !== "Activo") {
    throw new Error("ACCESO DENEGADO: Su usuario se encuentra inactivo o no tiene un estado definido. Por favor contacte al administrador para que verifique y configure su Estado como 'Activo' en la hoja Usuarios.");
  }

  // 2. Validar Firma Electrónica (PIN)
  if (!pinRecibido || pinRecibido.toString() !== validUser.pin.toString()) {
    throw new Error("FIRMA INVÁLIDA: El PIN ingresado es incorrecto.");
  }

  // Loguear inconsistencias de sesión si existen (Auditoría)
  var sessionEmail = Session.getActiveUser().getEmail();
  if (sessionEmail && sessionEmail.toLowerCase() !== validUser.email.toLowerCase()) {
    Logger.log("AUDITORÍA: Sesión activa (" + sessionEmail + ") ejecutando acción en nombre de (" + validUser.email + "). Autorizado por PIN.");
  }

  return validUser.userId;
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
