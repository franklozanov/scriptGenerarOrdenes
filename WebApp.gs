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

  try {
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

    Logger.log("Ruta de visor inválida o incompleta. Parámetros: " + JSON.stringify(e.parameter));
    return HtmlService.createHtmlOutput('<h1>Solicitud Inválida</h1><p>No se especificó un documento seguro o el enlace está incompleto.</p>');
  } catch (error) {
    Logger.log("❌ ERROR CRÍTICO en doGet: " + error.message + "\nStack trace: " + error.stack);
    return HtmlService.createHtmlOutput('<h1>Error del Sistema</h1><p>Ocurrió un error inesperado al intentar cargar el visor. Por favor, intente nuevamente o contacte soporte técnico.</p>');
  }
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
    var errorContext = "doPost(" + (e && e.postData && e.postData.contents ? "parametros presentes" : "parametros nulos") + ")";
    Logger.log("❌ ERROR en " + errorContext + ": " + error.message);
    Logger.log("Pila de ejecución (Stack trace): " + error.stack);
    
    // Determinar si es un error de validación que debe mostrarse al usuario (ej. PIN incorrecto)
    var isValidationError = error.message.indexOf("ACCESO DENEGADO") !== -1 || 
                            error.message.indexOf("FIRMA INVÁLIDA") !== -1 ||
                            error.message.indexOf("No pudimos") !== -1;
                            
    var displayMessage = isValidationError 
      ? error.message 
      : 'Lo sentimos, ha ocurrido un error inesperado al procesar su solicitud en el servidor. Por favor, intente nuevamente más tarde o contacte al administrador.';

    // Mensaje natural para el usuario, detalles técnicos en diagnostic
    return jsonResponse_({ 
      status: 'error', 
      message: displayMessage, 
      diagnostic: error.message 
    });
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
  var operation = params.operation || '';
  Logger.log("WebApp - Operación solicitada: " + operation);

  var callingUserId;
  // La validación estricta (PIN) se requiere para casi todo, excepto para la creación inicial del PIN.
  if (operation === 'configurarNuevoPin') {
    callingUserId = requireAuthorizedUser_(params);
  } else {
    callingUserId = requireAuthorizedUserStrict_(params);
  }
  
  Logger.log("WebApp - UserID validado: " + callingUserId);

  if (operation === 'configurarNuevoPin') {
    var userRecord = getUserRecordByUserId_(callingUserId);
    if (!userRecord.rol) {
      return { status: 'error', message: 'Su usuario no tiene un rol asignado. Contacte al administrador antes de continuar.', diagnostic: 'MISSING_ROLE' };
    }
    if (isPinConfigured_(userRecord.pin)) {
      return { status: 'error', message: 'El usuario ya tiene un PIN configurado.', diagnostic: 'PIN_ALREADY_EXISTS' };
    }
    if (!params.nuevoPin || params.nuevoPin.toString().length !== 4) {
      return { status: 'error', message: 'El nuevo PIN debe tener exactamente 4 dígitos.', diagnostic: 'INVALID_PIN_FORMAT' };
    }
    
    var hash = hashPin_(params.nuevoPin);
    updateUserSecurityState_(callingUserId, 0, "Activo", hash);
    return { status: 'success', message: 'PIN configurado exitosamente.' };
  }

  if (operation === 'validarAccesoSesion') {
    // requireAuthorizedUserStrict_ ya validó existencia, estado y PIN, y aplicó
    // el conteo de intentos fallidos / bloqueo antes de llegar aquí (línea 137).
    // Si llegamos a este punto, el acceso es válido.
    return { status: 'success', message: 'Acceso concedido.', userId: callingUserId };
  }

  if (operation === 'gestionarUsuarioSeguridad') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN)) {
      return { status: 'error', message: 'No tiene permisos de administrador para ejecutar esta acción.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.targetUserId || !params.accionSeguridad) {
      return { status: 'error', message: 'Faltan parámetros requeridos.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    
    var targetUser = getUserRecordByUserId_(params.targetUserId);
    if (!targetUser) {
      return { status: 'error', message: 'Usuario objetivo no encontrado.', diagnostic: 'USER_NOT_FOUND' };
    }

    if (params.accionSeguridad === 'aprobar') {
      if (!targetUser.rol) {
        return { status: 'error', message: 'No se puede aprobar: el usuario no tiene un rol asignado. Asigne un rol en la hoja Usuarios primero.', diagnostic: 'MISSING_ROLE' };
      }
      updateUserSecurityState_(targetUser.userId, 0, "Activo");
      return { status: 'success', message: 'Acceso aprobado. El usuario ya puede crear su PIN e ingresar.' };
    } else if (params.accionSeguridad === 'desbloquear') {
      updateUserSecurityState_(targetUser.userId, 0, "Activo");
      return { status: 'success', message: 'Usuario desbloqueado exitosamente.' };
    } else if (params.accionSeguridad === 'resetear_pin') {
      updateUserSecurityState_(targetUser.userId, 0, "Activo", "PENDIENTE");
      return { status: 'success', message: 'PIN reseteado. El usuario deberá crear uno nuevo en su próximo acceso.' };
    } else {
      return { status: 'error', message: 'Acción desconocida.', diagnostic: 'UNKNOWN_ACTION' };
    }
  }

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

  if (operation === 'consultarAnalisisMatriz') {
    if (!hasPermission(callingUserId, PERMISOS.CARGAR_ORDENES)) {
      return { status: 'error', message: 'No tiene permisos.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.noAnalisis) return { status: 'error', message: 'Falta NoAnalisis.' };
    
    var dataMatriz = obtenerDatosMatrizPorAnalisis(params.noAnalisis);
    return { status: 'success', data: dataMatriz };
  }

  if (operation === 'diagnosticarMatrices') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN)) {
      return { status: 'error', message: 'No tiene permisos de Administrador.', diagnostic: 'PERMISSION_DENIED' };
    }
    try {
      var resultados = diagnosticarMatricesConfig();
      return { status: 'success', data: resultados };
    } catch (e) {
      return { status: 'error', message: 'Fallo al ejecutar diagnóstico: ' + e.message };
    }
  }


  if (operation === 'agregarPlantilla') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN)) {
      return { status: 'error', message: 'No tiene permisos de Administrador.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.clave || !params.valor || !params.tipo) {
      return { status: 'error', message: 'Faltan parámetros (clave, valor, tipo).' };
    }
    try {
      return procesarAgregarPlantilla(params);
    } catch (e) {
      return { status: 'error', message: 'Fallo al agregar plantilla: ' + e.message };
    }
  }

  if (operation === 'validarOrdenDuplicada') {
    if (!hasPermission(callingUserId, PERMISOS.CARGAR_ORDENES)) {
      return { status: 'error', message: 'No tiene permisos.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.noOrden) return { status: 'error', message: 'Falta NoOrden.' };
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Ordenes");
    if (!sheet) return { status: 'error', message: 'Hoja Ordenes no encontrada.' };
    
    var data = sheet.getDataRange().getValues();
    var colOrdenIdx = getColumnIndexByNameCaseInsensitive(data[0], 'No. Orden', false);
    if (!colOrdenIdx) return { status: 'error', message: 'Columna No. Orden no encontrada.' };
    
    colOrdenIdx -= 1; // Ajuste para array 0-index
    var duplicada = false;
    var searchOrden = params.noOrden.toString().trim();
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][colOrdenIdx] && data[i][colOrdenIdx].toString().trim() === searchOrden) {
        duplicada = true;
        break;
      }
    }
    return { status: 'success', duplicada: duplicada };
  }

  if (operation === 'checkFilesExist') {
    if (!hasPermission(callingUserId, PERMISOS.CARGAR_ORDENES)) return { status: 'error', message: 'Sin permisos' };
    var filesToCheck = params.files || []; // [{ name: '...', type: 'OA' }]
    var result = { exists: false, fileNames: [] };
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetTemplates = ss.getSheetByName('templates');
    var folderOAId = '', folderCOAId = '';
    
    if (sheetTemplates) {
      var tData = sheetTemplates.getDataRange().getValues();
      for (var i=1; i<tData.length; i++) {
        var key = tData[i][0] ? tData[i][0].toString().trim() : '';
        var val = tData[i][1] ? extractDriveId(tData[i][1].toString().trim()) : '';
        if (key === 'DOC_ORDENES') folderOAId = val;
        if (key === 'DOC_ANALISIS') folderCOAId = val;
      }
    }
    
    var folderOA = folderOAId ? DriveApp.getFolderById(folderOAId) : null;
    var folderCOA = folderCOAId ? DriveApp.getFolderById(folderCOAId) : null;
    
    filesToCheck.forEach(function(f) {
      var folder = f.type === 'OA' ? folderOA : folderCOA;
      if (folder) {
        var files = folder.getFilesByName(f.name);
        if (files.hasNext()) {
          result.exists = true;
          result.fileNames.push(f.name);
        }
      }
    });
    
    return { status: 'success', data: result };
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
    // Requiere específicamente rol ADMIN (no basta MENU_CONFIG): guardar una Matriz K
    // reescribe el ID de un archivo externo consultado en cada validación de orden, por
    // lo que exige el mismo nivel de autorización que la edición manual en la hoja.
    if (!esUsuarioRolAdmin_(callingUserId)) {
      return { status: 'error', message: 'Solo un administrador puede crear o modificar matrices.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.config) {
      return { status: 'error', message: 'Falta el parámetro config.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    var resultadoGuardado = guardarMatrizConfig(params.config, params.rowIndex || null);
    if (resultadoGuardado.ok && resultadoGuardado.rowIndex) {
      resultadoGuardado.validacion = validarYActualizarFilaMatriz_(resultadoGuardado.rowIndex);
    }
    return resultadoGuardado;
  }

  if (operation === 'eliminarMatrizConfig') {
    if (!esUsuarioRolAdmin_(callingUserId)) {
      return { status: 'error', message: 'Solo un administrador puede eliminar matrices.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.rowIndex) {
      return { status: 'error', message: 'Falta el parámetro rowIndex.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    return eliminarMatrizConfig(params.rowIndex);
  }

  if (operation === 'confirmarEdicionMatrizConfig') {
    if (!esUsuarioRolAdmin_(callingUserId)) {
      return { status: 'error', message: 'Solo un administrador puede autorizar esta edición.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (!params.fila || !params.columna) {
      return { status: 'error', message: 'Faltan parámetros fila/columna.', diagnostic: 'MISSING_REQUIRED_PARAMS' };
    }
    try {
      var sheetMatrices = ensureMatricesConfigSheet_();
      var headersMatrices = sheetMatrices.getRange(1, 1, 1, sheetMatrices.getLastColumn()).getValues()[0];
      var nombreColumnaEditada = (headersMatrices[params.columna - 1] || '').toString().trim() || ('columna ' + params.columna);
      sheetMatrices.getRange(params.fila, params.columna).setValue(params.valorPropuesto || '');
      logChange(
        'MATRIZ_CONFIG_EDICION_AUTORIZADA',
        'Edición manual de "' + nombreColumnaEditada +
          '" en fila ' + params.fila + ' autorizada con PIN de administrador. Nuevo valor: "' + params.valorPropuesto + '"',
        Session.getActiveUser().getEmail()
      );
      var resultadoValidacion = validarYActualizarFilaMatriz_(params.fila);
      return { status: 'success', resultado: resultadoValidacion };
    } catch (e) {
      return { status: 'error', message: 'No se pudo aplicar la edición: ' + e.message };
    }
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

  if (operation === 'getSessionPersistConfig') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN) && !hasPermission(callingUserId, PERMISOS.MENU_CONFIG)) {
      return { status: 'error', message: 'No tiene permisos para ver esta configuración.', diagnostic: 'PERMISSION_DENIED' };
    }
    return { status: 'success', minutos: getSessionPersistMinutes() };
  }

  if (operation === 'setSessionPersist') {
    // El gate de PIN ya corrió en requireAuthorizedUserStrict_ (handlePrivilegedOperation_).
    if (!esUsuarioRolAdmin_(callingUserId)) {
      return { status: 'error', message: 'Solo un administrador puede cambiar la persistencia de sesión.', diagnostic: 'PERMISSION_DENIED' };
    }
    return procesarSetSessionPersist(params, callingUserId);
  }

  if (operation === 'setSystemUnlock') {
    if (!hasPermission(callingUserId, PERMISOS.MENU_ADMIN) && !hasPermission(callingUserId, PERMISOS.MENU_CONFIG)) {
      return { status: 'error', message: 'No tiene permisos de administración.', diagnostic: 'PERMISSION_DENIED' };
    }
    if (params.unlock) {
      requireAuthorizedUserStrict_(params);
      PropertiesService.getScriptProperties().setProperty('SYS_UNLOCKED', 'true');
    } else {
      PropertiesService.getScriptProperties().deleteProperty('SYS_UNLOCKED');
    }
    return { status: 'success' };
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

// Prefijo que identifica una firma enviada como clave de administrador (bypass de PIN), en vez
// de un PIN de 4 dígitos. Ver requireAuthorizedUserStrict_ y GlobalScripts.html:promptSecurityPin.
var ADMIN_OVERRIDE_PREFIX_ = "__ADMIN_OVERRIDE__:";

/**
 * Determina si el UserID dado corresponde a un usuario con rol ADMIN (incluye variaciones
 * de nombre). Mismo criterio que el bypass de clave de administrador en requireAuthorizedUserStrict_.
 * @param {string} userId
 * @returns {boolean}
 */
function esUsuarioRolAdmin_(userId) {
  var user = getUserRecordByUserId_(userId);
  if (!user) return false;
  var rolUpper = (user.rol || '').toString().toUpperCase();
  return rolUpper === 'ADMIN' || rolUpper === 'ADMINISTRADOR' || rolUpper === 'ADMINISTRADOR DE SISTEMA';
}

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

  // 1.b Vía de recuperación exclusiva para ADMIN: permite usar la clave de administrador
  // (Script Property LOCK_PASSWORD) en vez del PIN, para desbloquear el acceso cuando el
  // PIN aún no se ha migrado/configurado o el usuario olvidó su PIN. Nunca aplica a otros roles.
  if (typeof pinRecibido === 'string' && pinRecibido.indexOf(ADMIN_OVERRIDE_PREFIX_) === 0) {
    var claveAdminIngresada = pinRecibido.substring(ADMIN_OVERRIDE_PREFIX_.length);
    var rolUpperOverride = (validUser.rol || '').toString().toUpperCase();
    var esAdminRolOverride = (rolUpperOverride === 'ADMIN' || rolUpperOverride === 'ADMINISTRADOR' || rolUpperOverride === 'ADMINISTRADOR DE SISTEMA');
    if (!esAdminRolOverride) {
      throw new Error("ACCESO DENEGADO: La clave de administrador solo puede usarse con el rol ADMIN.");
    }
    if (!ADMIN_PASS || claveAdminIngresada !== ADMIN_PASS) {
      throw new Error("ACCESO DENEGADO: Clave de administrador incorrecta.");
    }
    if (validUser.intentosFallidos > 0 || validUser.estado === "Bloqueado") {
      updateUserSecurityState_(validUser.userId, 0, "Activo");
    }
    Logger.log("AUDITORÍA: Acceso autorizado mediante CLAVE DE ADMINISTRADOR (bypass PIN) para usuario " + validUser.email);
    return validUser.userId;
  }

  if (validUser.estado === "Bloqueado") {
    throw new Error("ACCESO DENEGADO: Usuario bloqueado por superar límite de intentos de PIN fallidos. Contacte al administrador.");
  }

  if (validUser.estado === "Pendiente") {
    throw new Error("ACCESO DENEGADO: Su acceso está pendiente de aprobación por el administrador.");
  }

  if (validUser.estado !== "Activo") {
    throw new Error("ACCESO DENEGADO: Su usuario se encuentra inactivo. Contacte al administrador.");
  }

  // 2. Validar Firma Electrónica (PIN)
  var pinHash = hashPin_(pinRecibido);
  if (!pinRecibido || pinHash !== validUser.pin.toString()) {
    // Incrementar intentos fallidos
    var intentosActuales = (validUser.intentosFallidos || 0) + 1;
    var nuevoEstado = intentosActuales >= 5 ? "Bloqueado" : "Activo";
    updateUserSecurityState_(validUser.userId, intentosActuales, nuevoEstado);
    
    if (nuevoEstado === "Bloqueado") {
      throw new Error("ACCESO DENEGADO: Ha ingresado un PIN incorrecto demasiadas veces. Su usuario ha sido bloqueado.");
    } else {
      throw new Error("FIRMA INVÁLIDA: El PIN ingresado es incorrecto. Intento " + intentosActuales + " de 5.");
    }
  }

  // Si el PIN es correcto, resetear intentos fallidos (si los hubiera)
  if (validUser.intentosFallidos > 0) {
    updateUserSecurityState_(validUser.userId, 0, "Activo");
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
