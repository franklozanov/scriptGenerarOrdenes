/**
 * PrintLogic.gs
 * 
 * Módulo de lógica de impresión de órdenes.
 * Contiene funciones para:
 * - Apertura de diálogo de impresión
 * - Configuración de impresión (con caché)
 * - Búsqueda de PDFs en carpetas de Drive
 * - Obtención de datos de órdenes para impresión
 * - Preparación de payload de impresión
 * - Guardado y finalización de PDFs unificados
 * - Wrappers de autenticación para llamadas desde cliente
 * 
 * FASE 4 - Batch 4.1: Print Logic (Completado)
 */

// --- UI: APERTURA DE DIÁLOGO ---

/**
 * Abre el modal de impresión de órdenes.
 * Muestra el panel Index.html con las opciones de impresión.
 */
function openPrintDialog() {
    var template = HtmlService.createTemplateFromFile('Index');
  // Inyección de servidor (Server-side templating) para velocidad
  template.initialData = JSON.stringify(getInitialData());
  template.ordenesValidas = JSON.stringify(getOrdenesValidasParaImpresion());
  
  var html = template.evaluate()
    .setWidth(550).setHeight(700);
  SpreadsheetApp.getUi().showModelessDialog(html, ' ');
}

// --- CONFIGURACIÓN DE IMPRESIÓN ---

/**
 * Obtiene la configuración de impresión desde la hoja templates.
 * Utiliza caché para optimizar rendimiento (21600 segundos = 6 horas).
 * 
 * @returns {Object} Configuración con IDs de carpetas y coordenadas de campos
 * @private
 */
function getPrintConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('printConfig_v1');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log("Error parsing printConfig_v1: " + e.message);
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tplSheet = ss.getSheetByName('templates');
  if (!tplSheet) throw new Error("La hoja 'templates' no existe.");
  var tplData = tplSheet.getDataRange().getValues();
  var tplHeaders = tplData[0];
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Clave', false);
  var colValorIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Valor', false);
  if (!colClaveIdx) colClaveIdx = 1;
  if (!colValorIdx) colValorIdx = 2;
  colClaveIdx = colClaveIdx - 1;
  colValorIdx = colValorIdx - 1;

  var config = {
    DOC_ORDENES: "",
    DOC_ANALISIS: "",
    DOC_COMPLETO: "",
    coords: {
      "Fabricante": { x: 450, y: 585 },
      "Exp":        { x: 360, y: 495 },
      "NoAnalisis": { x: 155, y: 385 }
    }
  };

  function parseXY(str) {
    var matchX = str.match(/x:\s*([0-9.]+)/i);
    var matchY = str.match(/y:\s*([0-9.]+)/i);
    return { x: matchX ? parseFloat(matchX[1]) : 0, y: matchY ? parseFloat(matchY[1]) : 0 };
  }

  for (var i = 1; i < tplData.length; i++) {
    var k = tplData[i][colClaveIdx] ? tplData[i][colClaveIdx].toString().trim() : "";
    var v = tplData[i][colValorIdx] ? extractDriveId(tplData[i][colValorIdx].toString().trim()) : "";
    if (k === "DOC_ORDENES") config.DOC_ORDENES = v;
    if (k === "DOC_ANALISIS") config.DOC_ANALISIS = v;
    if (k === "DOC_COMPLETO") config.DOC_COMPLETO = v;
    if (k === "COORD_FABRICANTE" && v) config.coords["Fabricante"] = parseXY(v);
    if (k === "COORD_EXP" && v) config.coords["Exp"] = parseXY(v);
    if (k === "COORD_NoANALISIS" && v) config.coords["NoAnalisis"] = parseXY(v);
  }

  try {
    cache.put('printConfig_v1', JSON.stringify(config), 21600);
  } catch (e) {
    Logger.log("Error caching printConfig_v1: " + e.message);
  }

  return config;
}

// --- BÚSQUEDA DE PDFs ---

/**
 * Busca un PDF de orden en una carpeta de Drive.
 * 
 * @param {string} folderId - ID de la carpeta DOC_ORDENES
 * @param {string} orderNo - Número de orden a buscar
 * @returns {GoogleAppsScript.Drive.File} Archivo PDF encontrado
 * @throws {Error} Si no se encuentra el PDF o la carpeta no está configurada
 */
function findOrderPdfInFolder(folderId, orderNo) {
  if (!folderId) {
    throw new Error("DOC_ORDENES no está configurado en la hoja 'templates'. Configure el ID de la carpeta de órdenes.");
  }

  var folder = DriveApp.getFolderById(folderId);
  var normalizedOrderNo = orderNo.toString().trim().toLowerCase();
  var exactFiles = folder.getFilesByName(orderNo + ".pdf");
  if (exactFiles.hasNext()) {
    return exactFiles.next();
  }

  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName().toString().trim().toLowerCase();
    var mimeType = file.getMimeType();

    if (mimeType === MimeType.PDF && (fileName === normalizedOrderNo + ".pdf" || fileName.indexOf(normalizedOrderNo) !== -1)) {
      return file;
    }
  }

  throw new Error("No se encontró un PDF para la orden '" + orderNo + "' en la carpeta DOC_ORDENES (ID: " + folderId + "). Verifique que el archivo exista y que el nombre contenga el número de orden.");
}

/**
 * Busca un PDF de análisis en una carpeta de Drive.
 * 
 * @param {string} folderId - ID de la carpeta DOC_ANALISIS
 * @param {string} noAnalisis - Número de análisis a buscar
 * @returns {GoogleAppsScript.Drive.File} Archivo PDF encontrado
 * @throws {Error} Si no se encuentra el PDF o la carpeta no está configurada
 */
function findAnalysisPdfInFolder(folderId, noAnalisis) {
  if (!folderId) {
    throw new Error("DOC_ANALISIS no está configurado en la hoja 'templates'. Configure el ID de la carpeta de análisis.");
  }

  var folder = DriveApp.getFolderById(folderId);
  var normalizedNoAnalisis = noAnalisis.toString().trim().toLowerCase();
  var exactFiles = folder.getFilesByName(noAnalisis + ".pdf");
  if (exactFiles.hasNext()) {
    return exactFiles.next();
  }

  var aQuery = "title contains '" + noAnalisis + "' and mimeType = 'application/pdf' and trashed = false";
  var files = folder.searchFiles(aQuery);
  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName().toString().trim().toLowerCase();
    if (file.getMimeType() === MimeType.PDF && (fileName === normalizedNoAnalisis + ".pdf" || fileName.indexOf(normalizedNoAnalisis) === 0)) {
      return file;
    }
  }

  throw new Error("No se encontró un PDF de análisis para '" + noAnalisis + "' en la carpeta DOC_ANALISIS (ID: " + folderId + ").");
}

/**
 * Obtiene los datos de una orden para impresión.
 * Incluye validación de STATUS y precarga de PDFs dinámicos.
 * 
 * @param {string} orderNo - Número de orden
 * @returns {Object} Objeto con datos de la orden, PDFs y errores si existen
 */
function fetchOrderData(orderNo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet = ss.getSheetByName('Ordenes');
  if (!dataSheet) throw new Error("Sheet 'Ordenes' not found.");
  var headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  var printConfig = getPrintConfig_();
  var dynamicCoords = printConfig.coords || {
    "Fabricante": { x: 450, y: 585 },
    "Exp":        { x: 360, y: 495 },
    "NoAnalisis": { x: 155, y: 385 }
  };

  var colNoOrden = getColumnIndexByName(headers, 'NoOrden', true);
  var orderValues = dataSheet.getRange(1, colNoOrden, dataSheet.getLastRow(), 1).getValues();
  var targetRowIndex = -1;
  var normalizedOrderNo = orderNo != null ? orderNo.toString().trim().toLowerCase() : "";
  
  for (var idx = 1; idx < orderValues.length; idx++) {
    var rowOrderNo = orderValues[idx][0] != null ? orderValues[idx][0].toString().trim().toLowerCase() : "";
    if (rowOrderNo === normalizedOrderNo) { targetRowIndex = idx + 1; break; }
  }
  
  if (targetRowIndex === -1) {
    return {
      status: "error",
      ready: false,
      orderNo: orderNo,
      noAnalisis: "",
      formData: {},
      coords: dynamicCoords,
      pdfs: [],
      errors: [{ key: "NoOrden", message: "La orden " + orderNo + " no existe en la hoja Ordenes." }]
    };
  }

  var targetRowData = dataSheet.getRange(targetRowIndex, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  
  // Declarar arrays de errores y PDFs al inicio
  var errors = [];
  var dynamicPdfs = [];
  
  // --- VALIDACIÓN DE STATUS PARA IMPRESIÓN (GAMP 5 Compliance) ---
  var colStatusCol = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
  var statusValue = "";
  if (colStatusCol) {
    statusValue = targetRowData[colStatusCol - 1] ? targetRowData[colStatusCol - 1].toString().trim() : "";
  }
  
  // Bloquear impresión si STATUS es Solicitada (no aprobada por QA)
  if (statusValue === "Solicitada") {
    Logger.log("fetchOrderData: Orden " + orderNo + " con STATUS 'Solicitada' - Bloqueando impresión por falta de aprobación QA");
    return {
      status: "error",
      ready: false,
      orderNo: orderNo,
      noAnalisis: "",
      formData: {},
      coords: dynamicCoords,
      pdfs: [],
      errors: [{ key: "STATUS_BLOCKED", message: "No se puede imprimir esta orden. Su STATUS actual es 'Solicitada' y requiere aprobación QA. Contacte al administrador." }]
    };
  }
  
  // Bloquear impresión si STATUS está vacío o es un valor no reconocido
  if (!statusValue || statusValue === "") {
    Logger.log("fetchOrderData: Orden " + orderNo + " con STATUS vacío - Bloqueando impresión");
    return {
      status: "error",
      ready: false,
      orderNo: orderNo,
      noAnalisis: "",
      formData: {},
      coords: dynamicCoords,
      pdfs: [],
      errors: [{ key: "STATUS_BLOCKED", message: "No se puede imprimir esta orden. Su STATUS no está definido. Contacte al administrador." }]
    };
  }
  
  // Bloquear impresión si STATUS es RecibidaQA, DevueltaQA o Cerrada (lógica existente)
  if (statusValue === "RecibidaQA" || statusValue === "DevueltaQA" || statusValue === "Cerrada") {
    var currentUser = "";
    try { currentUser = Session.getActiveUser().getEmail(); } catch(e) {}
    
    // Intentar obtener userId desde email
    var userId = "";
    if (currentUser) {
      var userSheet = ss.getSheetByName('Usuarios');
      if (userSheet) {
        var userData = userSheet.getDataRange().getValues();
        if (userData.length >= 2) {
          var userHeaders = userData[0];
          var colEmailCol = getColumnIndexByNameCaseInsensitive(userHeaders, 'Email', false);
          var colUserIdCol = getColumnIndexByNameCaseInsensitive(userHeaders, 'UserID', false);
          if (colEmailCol && colUserIdCol) {
            for (var u = 1; u < userData.length; u++) {
              var userEmail = userData[u][colEmailCol - 1] ? userData[u][colEmailCol - 1].toString().trim() : "";
              if (userEmail === currentUser) {
                userId = userData[u][colUserIdCol - 1] ? userData[u][colUserIdCol - 1].toString().trim() : "";
                break;
              }
            }
          }
        }
      }
    }
    
    // Verificar rol del usuario
    var userRecord = userId ? getUserRecordByUserId_(userId) : null;
    var userRol = userRecord ? userRecord.rol : "";
    
    // Bypass para ADMIN
    if (userRol === "ADMIN") {
      Logger.log("ADVERTENCIA: Usuario ADMIN imprimiendo orden con STATUS " + statusValue + " - Bypass aplicado");
      errors.push({ 
        key: "STATUS_WARNING", 
        message: "ADVERTENCIA: Esta orden tiene STATUS '" + statusValue + "'. Como ADMIN, se permite la impresión, pero esto es inusual." 
      });
    } else {
      // Bloquear para STANDARD y QA
      return {
        status: "error",
        ready: false,
        orderNo: orderNo,
        noAnalisis: "",
        formData: {},
        coords: dynamicCoords,
        pdfs: [],
        errors: [{ key: "STATUS_BLOCKED", message: "No se puede imprimir esta orden. Su STATUS actual es '" + statusValue + "'. Contacte al administrador si necesita imprimir esta orden." }]
      };
    }
  }
  
  // Log de diagnóstico: orden autorizada para impresión
  if (statusValue === "Autorizada") {
    Logger.log("fetchOrderData: Orden " + orderNo + " con STATUS 'Autorizada' - Permitiendo impresión (GAMP 5 Compliance)");
  }
  // --- FIN VALIDACIÓN DE STATUS ---

  // --- BUSCAR SOLICITUD APROBADA PARA ESTA ORDEN ---
  var approvedRequest = null;
  try {
    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    if (solicitudesSheet) {
      var solHeaders = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
      var solData = solicitudesSheet.getDataRange().getValues();

      var colSolIdSolicitud = getColumnIndexByNameCaseInsensitive(solHeaders, 'ID_Solicitud', false);
      var colSolNoOrden = getColumnIndexByNameCaseInsensitive(solHeaders, 'NoOrden', false);
      var colSolEstado = getColumnIndexByNameCaseInsensitive(solHeaders, 'Estado', false);
      var colSolPlantillas = getColumnIndexByNameCaseInsensitive(solHeaders, 'Plantillas', false);

      if (colSolNoOrden && colSolEstado && colSolPlantillas) {
        for (var i = 1; i < solData.length; i++) {
          var solNoOrden = solData[i][colSolNoOrden - 1] ? solData[i][colSolNoOrden - 1].toString().trim() : "";
          var solEstado = solData[i][colSolEstado - 1] ? solData[i][colSolEstado - 1].toString().trim() : "";

          if (solNoOrden === orderNo && solEstado === 'Aprobada') {
            var idSolicitud = colSolIdSolicitud ? (solData[i][colSolIdSolicitud - 1] || '').toString() : '';
            var plantillas = solData[i][colSolPlantillas - 1] ? solData[i][colSolPlantillas - 1].toString() : '';
            approvedRequest = { id: idSolicitud, plantillas: plantillas };
            Logger.log("Solicitud aprobada encontrada para orden " + orderNo + ": " + idSolicitud);
            break;
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error buscando solicitud aprobada: " + e.message);
  }
  // --- FIN BÚSQUEDA SOLICITUD APROBADA ---

  var fieldNames = ["Proceso", "Codigo", "Descripcion", "Lote", "Exp", "Cantidad", "NoAnalisis", "NoOrden", "Fabricante"];
  var formData = {};
  var noAnalisisStr = "";

  fieldNames.forEach(function(name) {
    var hCol = getColumnIndexByNameCaseInsensitive(headers, name, false);
    if (hCol) {
      var val = targetRowData[hCol - 1];
      if (name === "NoAnalisis" && val != null) noAnalisisStr = val.toString().trim();

      if (val instanceof Date) {
        formData[name] = (name === "Exp") ? Utilities.formatDate(val, Session.getScriptTimeZone(), "MM/yyyy")
                                          : Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        formData[name] = (val != null) ? val.toString() : "";
      }
    }
  });

  try {
    var orderFile = findOrderPdfInFolder(printConfig.DOC_ORDENES, orderNo);
    dynamicPdfs.push({ key: "DOC_ORDENES", base64: Utilities.base64Encode(orderFile.getBlob().getBytes()), fileName: orderFile.getName() });
    Logger.log("✓ Precargado PDF de Orden para orden " + orderNo + " desde archivo: " + orderFile.getName());
  } catch (e) {
    Logger.log("Error fetching PDF de Orden from DOC_ORDENES: " + e.message);
    errors.push({ key: "DOC_ORDENES", message: "Archivo NoOrden " + orderNo + ".pdf no encontrado en DOC_ORDENES. Por favor cargue el documento." });
  }

  try {
    if (!noAnalisisStr) {
      throw new Error("La orden no tiene NoAnalisis.");
    }
    var analysisFile = findAnalysisPdfInFolder(printConfig.DOC_ANALISIS, noAnalisisStr);
    dynamicPdfs.push({ key: "DOC_ANALISIS", base64: Utilities.base64Encode(analysisFile.getBlob().getBytes()), fileName: analysisFile.getName() });
    Logger.log("✓ Precargado DOC_ANALISIS para orden " + orderNo + " desde archivo: " + analysisFile.getName());
  } catch (e) {
    Logger.log("Error fetching DOC_ANALISIS: " + e.message);
    var missingNoAnalisis = noAnalisisStr || "sin NoAnalisis";
    errors.push({ key: "DOC_ANALISIS", message: "Archivo NoAnalisis " + missingNoAnalisis + ".pdf no encontrado en DOC_ANALISIS. Por favor cargue el documento." });
  }

  return {
    status: errors.length ? "error" : "ready",
    ready: errors.length === 0,
    orderNo: orderNo,
    noAnalisis: noAnalisisStr,
    formData: formData,
    coords: dynamicCoords,
    pdfs: dynamicPdfs,
    errors: errors,
    orderStatus: statusValue,
    approvedRequest: approvedRequest
  };
}

/**
 * Prepara el payload de impresión para una orden.
 * Obtiene datos de la orden y PDFs dinámicos según la configuración de plantillas.
 * 
 * @param {string} orderNo - Número de orden
 * @param {Array} templateConfig - Configuración de plantillas a incluir
 * @returns {Object} Objeto con formData, pdfs y coords
 */
function preparePrintPayload(orderNo, templateConfig) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet = ss.getSheetByName('Ordenes');
  if (!dataSheet) throw new Error("Sheet 'Ordenes' not found.");
  var headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  
  var tplSheet = ss.getSheetByName('templates');
  var tplData = tplSheet.getDataRange().getValues();
  
  var tplHeaders = tplData[0];
  
  // Obtener índices de columnas por nombre para templates
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Clave', false);
  var colValorIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Valor', false);
  
  // Si alguna columna no existe, usar índices por defecto
  if (!colClaveIdx) colClaveIdx = 1;
  if (!colValorIdx) colValorIdx = 2;
  
  // Convertir a base-0 para acceso a array
  colClaveIdx = colClaveIdx - 1;
  colValorIdx = colValorIdx - 1;
  
  var folderId = "";
  var folderAnalysisId = "";
  var dynamicCoords = {
    "Fabricante": { x: 450, y: 585 },
    "Exp":        { x: 360, y: 495 },
    "NoAnalisis": { x: 155, y: 385 }
  };

  function parseXY(str) {
    var matchX = str.match(/x:\s*([0-9.]+)/i);
    var matchY = str.match(/y:\s*([0-9.]+)/i);
    return { x: matchX ? parseFloat(matchX[1]) : 0, y: matchY ? parseFloat(matchY[1]) : 0 };
  }
  
  for (var i = 1; i < tplData.length; i++) {
    var k = tplData[i][colClaveIdx].toString().trim();
    var v = tplData[i][colValorIdx] ? extractDriveId(tplData[i][colValorIdx].toString().trim()) : "";
    if (k === "DOC_ORDENES") folderId = v;
    if (k === "DOC_ANALISIS") folderAnalysisId = v;
    if (k === "COORD_FABRICANTE" && v) dynamicCoords["Fabricante"] = parseXY(v);
    if (k === "COORD_EXP" && v) dynamicCoords["Exp"] = parseXY(v);
    if (k === "COORD_NoANALISIS" && v) dynamicCoords["NoAnalisis"] = parseXY(v);
  }

  var colNoOrden = getColumnIndexByName(headers, 'NoOrden', true);
  var orderValues = dataSheet.getRange(1, colNoOrden, dataSheet.getLastRow(), 1).getValues();
  var targetRowIndex = -1;
  
  for (var idx = 1; idx < orderValues.length; idx++) {
    if (orderValues[idx][0] == orderNo) { targetRowIndex = idx + 1; break; }
  }
  
  if (targetRowIndex === -1) throw new Error("Order " + orderNo + " not found in 'Ordenes' sheet.");
  var targetRowData = dataSheet.getRange(targetRowIndex, 1, 1, dataSheet.getLastColumn()).getValues()[0];

  // --- VALIDACIÓN DE STATUS PARA PREPARACIÓN DE PAYLOAD (GAMP 5 Compliance) ---
  var colStatus = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
  if (colStatus) {
    var statusValue = targetRowData[colStatus - 1];
    var statusStr = statusValue ? statusValue.toString().trim() : "";
    
    if (statusStr === "Solicitada" || statusStr === "") {
      Logger.log("preparePrintPayload: Orden " + orderNo + " con STATUS '" + statusStr + "' - Bloqueando preparación de payload");
      throw new Error("Acceso denegado: No se puede preparar el payload de impresión para una orden que no ha sido Autorizada por QA.");
    }
    
    Logger.log("preparePrintPayload: Orden " + orderNo + " con STATUS '" + statusStr + "' - Permitiendo preparación de payload");
  }
  // --- FIN VALIDACIÓN DE STATUS ---

  var fieldNames = ["Proceso", "Codigo", "Descripcion", "Lote", "Exp", "Cantidad", "NoAnalisis", "NoOrden", "Fabricante"];
  var formData = {};
  var noAnalisisStr = "";
  
  fieldNames.forEach(function(name) {
    var hCol = getColumnIndexByNameCaseInsensitive(headers, name, false);
    if (hCol) {
      var val = targetRowData[hCol - 1];
      if (name === "NoAnalisis" && val != null) noAnalisisStr = val.toString().trim();
      
      if (val instanceof Date) {
        formData[name] = (name === "Exp") ? Utilities.formatDate(val, Session.getScriptTimeZone(), "MM/yyyy") 
                                          : Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        formData[name] = (val != null) ? val.toString() : "";
      }
    }
  });

  var pdfsToProcess = [];
  
  // Only process dynamic templates (DOC_ORDENES and DOC_ANALISIS)
  // Static templates are already preloaded on the frontend
  templateConfig.forEach(function(config) {
    var file;
    try {
      if (config.key === "DOC_ORDENES") {
        if (!folderId) {
          throw new Error("DOC_ORDENES no está configurado en la hoja 'templates'. Configure el ID de la carpeta de órdenes.");
        }
        try {
          file = findOrderPdfInFolder(folderId, orderNo);
        } catch (driveError) {
          if (driveError.message.indexOf("not found") !== -1 || driveError.message.indexOf("not exist") !== -1) {
            throw new Error("No se puede acceder a la carpeta DOC_ORDENES (ID: " + folderId + "). Verifique que el ID es correcto y que el script tiene permisos de acceso.");
          }
          throw driveError;
        }
        pdfsToProcess.push({ key: config.key, base64: Utilities.base64Encode(file.getBlob().getBytes()), copies: config.copies });
      } else if (config.key === "DOC_ANALISIS") {
        if (!folderAnalysisId) {
          throw new Error("DOC_ANALISIS no está configurado en la hoja 'templates'. Configure el ID de la carpeta de análisis.");
        }
        if (!noAnalisisStr) {
          throw new Error("La orden no tiene número de análisis (NoAnalisis). Complete este campo en la hoja 'Ordenes'.");
        }
        try {
          var aFolder = DriveApp.getFolderById(folderAnalysisId);
          var aQuery = "title contains '" + noAnalisisStr + "' and mimeType = 'application/pdf' and trashed = false";
          var aFiles = aFolder.searchFiles(aQuery);
          while (aFiles.hasNext()) {
            var candidate = aFiles.next();
            if (candidate.getName().indexOf(noAnalisisStr) === 0) { file = candidate; break; }
          }
          if (!file) {
            throw new Error("No se encontró el PDF de análisis que comience con '" + noAnalisisStr + "' en la carpeta configurada (ID: " + folderAnalysisId + ").");
          }
        } catch (driveError) {
          if (driveError.message.indexOf("not found") !== -1 || driveError.message.indexOf("not exist") !== -1) {
            throw new Error("No se puede acceder a la carpeta DOC_ANALISIS (ID: " + folderAnalysisId + "). Verifique que el ID es correcto y que el script tiene permisos de acceso.");
          }
          throw driveError;
        }
        pdfsToProcess.push({ key: config.key, base64: Utilities.base64Encode(file.getBlob().getBytes()), copies: config.copies });
      } else {
        // Static templates are skipped - they're already preloaded on the frontend
        Logger.log("Omitiendo plantilla estática " + config.key + " (ya precargada en el cliente)");
      }
    } catch (e) {
      Logger.log("ERROR en preparePrintPayload para " + config.key + ": " + e.message);
      throw new Error("Error cargando " + config.key + ": " + e.message);
    }
  });

  var finalPdfs = [];
  var pdfOrden = null, pdfAnalisis = null, pdfsOthers = [];

  for (var j = 0; j < pdfsToProcess.length; j++) {
    if (pdfsToProcess[j].key === "DOC_ORDENES") pdfOrden = pdfsToProcess[j];
    else if (pdfsToProcess[j].key === "DOC_ANALISIS") pdfAnalisis = pdfsToProcess[j];
    else pdfsOthers.push(pdfsToProcess[j]);
  }

  if (pdfOrden) finalPdfs.push(pdfOrden);
  if (pdfAnalisis) finalPdfs.push(pdfAnalisis);
  finalPdfs = finalPdfs.concat(pdfsOthers);

  return { formData: formData, pdfs: finalPdfs, coords: dynamicCoords };
}

/**
 * Guarda el PDF unificado final en Drive.
 * Incrementa el consecutivo de impresión y genera nombre de archivo versionado.
 * 
 * @param {string} base64Data - Datos del PDF en base64
 * @param {string} orderNo - Número de orden
 * @returns {Object} Objeto con fileId, URLs y consecutivo
 * @throws {Error} Si hay problemas al guardar el PDF
 */
function saveFinalUnifiedPDF(base64Data, orderNo) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error("El sistema está procesando otra orden simultánea. Por favor, intente nuevamente en unos segundos.");
  }
  try {
    return saveFinalUnifiedPDFCore_(base64Data, orderNo);
  } catch (e) {
    Logger.log("Error en saveFinalUnifiedPDF: " + e.message);
    throw new Error("Error al guardar PDF final: " + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Núcleo de generación del PDF final. NO adquiere lock (el llamador DEBE tenerlo).
 * Crea el archivo en Drive ANTES de comprometer el consecutivo, de modo que un fallo
 * al crear el archivo no deje el contador avanzado sin documento asociado.
 * Devuelve además el contexto necesario para un rollback transaccional.
 * @param {string} base64Data - Datos del PDF en base64
 * @param {string} orderNo - Número de orden
 * @returns {Object} { fileId, file, drivePreviewUrl, viewerUrl, consecutivo, oldConsecutivo, rowIndex, colConsecutivo, sheet }
 */
function saveFinalUnifiedPDFCore_(base64Data, orderNo) {
    var startedAt = new Date().getTime();
    var printConfig = getPrintConfig_();
    var folderId = printConfig.DOC_COMPLETO;
    
    if (!folderId) {
      throw new Error("No se encontró la carpeta DOC_COMPLETO en la hoja templates.");
    }
    
    var folder = DriveApp.getFolderById(folderId);
    
    // --- OBTENER CONSECUTIVO DESDE LA HOJA ORDENES ---
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) {
      throw new Error("Sheet 'Ordenes' not found.");
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Buscar columnas por nombre
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colConsecutivo = getColumnIndexByNameCaseInsensitive(headers, 'ConsecutivoImp', true);
    var colStatus = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
    
    // Buscar fila de la orden
    var orderValues = sheet.getRange(1, colNoOrden, sheet.getLastRow(), 1).getValues();
    var rowIndex = -1;
    var normalizedOrderNo = orderNo != null ? orderNo.toString().trim().toLowerCase() : "";
    
    for (var idx = 1; idx < orderValues.length; idx++) {
      var rowOrderNo = orderValues[idx][0] != null ? orderValues[idx][0].toString().trim().toLowerCase() : "";
      if (rowOrderNo === normalizedOrderNo) {
        rowIndex = idx + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error("No se encontró la orden " + orderNo + " en la hoja Ordenes.");
    }
    
    // --- VALIDACIÓN DE STATUS PARA GENERACIÓN DE PDF (GAMP 5 Compliance) ---
    if (colStatus) {
      var statusValue = sheet.getRange(rowIndex, colStatus).getValue();
      var statusStr = statusValue ? statusValue.toString().trim() : "";
      
      if (statusStr === "Solicitada" || statusStr === "") {
        Logger.log("saveFinalUnifiedPDF: Orden " + orderNo + " con STATUS '" + statusStr + "' - Bloqueando generación de PDF final");
        throw new Error("Acceso denegado: No se puede guardar el PDF final de una orden que no ha sido Autorizada por QA.");
      }
      
      Logger.log("saveFinalUnifiedPDF: Orden " + orderNo + " con STATUS '" + statusStr + "' - Permitiendo generación de PDF final");
    }
    // --- FIN VALIDACIÓN DE STATUS ---
    
    // Leer consecutivo actual e incrementar
    var rawConsecutivo = sheet.getRange(rowIndex, colConsecutivo).getValue();
    Logger.log('DEBUG: rawConsecutivo = ' + rawConsecutivo + ' (tipo: ' + typeof rawConsecutivo + ')');
    
    var currentConsecutivo = Number(rawConsecutivo);
    Logger.log('DEBUG: currentConsecutivo después de Number() = ' + currentConsecutivo);
    
    // Validar que sea un número válido
    if (isNaN(currentConsecutivo) || currentConsecutivo < 0) {
      Logger.log('⚠️ Consecutivo inválido detectado: ' + currentConsecutivo + '. Reiniciando a 0.');
      currentConsecutivo = 0;
    }
    
    var nextConsecutivo = currentConsecutivo + 1;
    Logger.log('DEBUG: nextConsecutivo = ' + nextConsecutivo);
    
    // Validar que no exceda límite razonable
    if (isNaN(nextConsecutivo) || nextConsecutivo > 9999) {
      throw new Error("El consecutivo de impresión es inválido o excede el límite permitido (9999). Valor actual: " + rawConsecutivo + ", siguiente: " + nextConsecutivo);
    }
    
    // Construir nombre de archivo
    var targetFileName = 'Orden_' + orderNo + '_' + nextConsecutivo + '.pdf';

    Logger.log("Guardando versión #" + nextConsecutivo + ": " + targetFileName);

    // 1) CREAR EL ARCHIVO PRIMERO (antes de comprometer el consecutivo)
    var decodeStartedAt = new Date().getTime();
    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, 'application/pdf', targetFileName);
    Logger.log("saveFinalUnifiedPDF decode/blob ms: " + (new Date().getTime() - decodeStartedAt));

    var createStartedAt = new Date().getTime();
    var file = folder.createFile(blob);
    Logger.log("saveFinalUnifiedPDF createFile ms: " + (new Date().getTime() - createStartedAt));
    var fileId = file.getId();

    // 2) COMPROMETER EL CONSECUTIVO SOLO CUANDO EL ARCHIVO YA EXISTE EN DRIVE
    //    (si createFile hubiera fallado, el contador nunca se habría avanzado)
    sheet.getRange(rowIndex, colConsecutivo).setValue(nextConsecutivo);
    SpreadsheetApp.flush(); // Forzar escritura síncrona
    
    var drivePreviewUrl = file.getUrl();
    
    var webAppUrl = getWebAppUrl();
    var viewerUrl = webAppUrl + '?action=secure&fileId=' + fileId + '&orderNo=' + orderNo;
    Logger.log("saveFinalUnifiedPDF total ms: " + (new Date().getTime() - startedAt));
    
    // Retornar URLs y consecutivo + contexto para rollback transaccional
    return {
      fileId: fileId,
      file: file,
      drivePreviewUrl: drivePreviewUrl,
      viewerUrl: viewerUrl,
      archivoReemplazado: false,
      consecutivo: nextConsecutivo,
      oldConsecutivo: currentConsecutivo,
      rowIndex: rowIndex,
      colConsecutivo: colConsecutivo,
      sheet: sheet
    };
}

/**
 * Finaliza el proceso post-guardado del PDF.
 * Registra en trazabilidad y aplica restricciones de seguridad.
 * 
 * @param {string} orderNo - Número de orden
 * @param {string} fileId - ID del archivo guardado en Drive
 * @param {boolean} archivoReemplazado - Si se reemplazó un archivo existente
 * @param {string} actingUserId - UserID del usuario que ejecuta la acción
 * @returns {string} Mensaje de confirmación
 */
function finalizeFinalPdfPostSave(orderNo, fileId, archivoReemplazado, actingUserId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var userIdentity = getUserIdentityStringByUserId_(actingUserId);
    var logMessage = archivoReemplazado
      ? "Se REEMPLAZÓ el documento unificado final para la orden " + orderNo
      : "Se generó y guardó el documento unificado final para la orden " + orderNo;
    logChange('GENERACION_PDF_FINAL', logMessage, userIdentity);

    try {
      file.setShareableByEditors(false);
    } catch(secErr) {
      Logger.log("No se pudieron aplicar restricciones de seguridad adicionales al PDF: " + secErr.message);
    }

    return "Post-guardado finalizado.";
  } catch (e) {
    Logger.log("Error en finalizeFinalPdfPostSave: " + e.message);
    return "Error en post-guardado: " + e.message;
  }
}

// --- WRAPPERS DE AUTENTICACIÓN PARA google.script.run ---

/**
 * Valida estrictamente en el servidor si una orden puede ser impresa.
 * Evita que usuarios malintencionados bypasseen el UI.
 */
function checkPrintAuthorization_(orderNo, printType, userId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ordenesSheet = ss.getSheetByName('Ordenes');
  var headers = ordenesSheet.getRange(1, 1, 1, ordenesSheet.getLastColumn()).getValues()[0];
  
  var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
  var colStatus = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
  
  var orderValues = ordenesSheet.getRange(1, colNoOrden, ordenesSheet.getLastRow(), 1).getValues();
  var targetRowIndex = -1;
  var normalizedOrderNo = orderNo.toString().trim().toLowerCase();
  
  for (var i = 1; i < orderValues.length; i++) {
    if (orderValues[i][0] && orderValues[i][0].toString().trim().toLowerCase() === normalizedOrderNo) {
      targetRowIndex = i + 1;
      break;
    }
  }
  
  if (targetRowIndex === -1) throw new Error("Orden no encontrada para validación de impresión.");
  
  var statusValue = ordenesSheet.getRange(targetRowIndex, colStatus).getValue();
  statusValue = statusValue ? statusValue.toString().trim() : "";
  
  var userRecord = getUserRecordByUserId_(userId);
  if (userRecord && userRecord.rol === 'ADMIN') {
    return true; // ADMIN bypass
  }
  
  if (statusValue === "Solicitada" || statusValue === "RecibidaQA" || statusValue === "DevueltaQA" || statusValue === "Cerrada" || statusValue === "") {
    throw new Error("Violación de seguridad: El estado actual (" + statusValue + ") no permite impresión.");
  }
  
  if (statusValue === "Impreso" || statusValue === "Reimpreso") {
    // Si ya está impresa, SOLO se puede si el tipo es Adicional o Reimpresión Y existe solicitud Aprobada.
    // Se normaliza el tipo para tolerar variantes de acento/caso ('Reimpresión' vs 'Reimpresion').
    if (normalizePrintType_(printType) !== 'adicional' && !isReimpresionType_(printType)) {
       throw new Error("Violación de seguridad: La orden ya está impresa. Use Adicional o Reimpresión.");
    }

    // Verificar en SolicitudesImpresion (SOLO validación: la solicitud se consume al registrar
    // la trazabilidad de forma exitosa, no aquí, para no consumirla si la generación falla).
    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    var isApproved = false;
    if (solicitudesSheet) {
      var solHeaders = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
      var solData = solicitudesSheet.getDataRange().getValues();
      var colSolNoOrden = getColumnIndexByNameCaseInsensitive(solHeaders, 'NoOrden', false);
      var colSolEstado = getColumnIndexByNameCaseInsensitive(solHeaders, 'Estado', false);

      for (var j = 1; j < solData.length; j++) {
        var sOrden = solData[j][colSolNoOrden-1] ? solData[j][colSolNoOrden-1].toString().trim() : "";
        var sEstado = solData[j][colSolEstado-1] ? solData[j][colSolEstado-1].toString().trim() : "";
        if (sOrden === orderNo.toString().trim() && sEstado === 'Aprobada') {
          isApproved = true;
          break;
        }
      }
    }

    if (!isApproved) {
      throw new Error("Violación de seguridad: No existe una solicitud QA Aprobada para reimprimir esta orden.");
    }
  }

  return true;
}

/**
 * Wrapper con autenticación para saveFinalUnifiedPDF.
 * Llamado desde Index.html vía google.script.run.
 * 
 * @param {string} base64Data - Datos del PDF en base64
 * @param {string} orderNo - Número de orden
 * @param {string} userId - UserID del usuario que ejecuta la acción
 * @returns {Object} Resultado de saveFinalUnifiedPDF
 * @throws {Error} Si el usuario no está autorizado
 */
function saveFinalUnifiedPDFForUser(base64Data, orderNo, userId, printType) {
  enforcePermission(userId, 'IMPRIMIR_ORDEN');
  checkPrintAuthorization_(orderNo, printType || "Inicial", userId);
  return saveFinalUnifiedPDF(base64Data, orderNo);
}

/**
 * TRANSACCIÓN ATÓMICA DE IMPRESIÓN.
 * Valida autorización, genera el PDF, registra trazabilidad y finaliza, todo bajo un ÚNICO lock.
 * Reemplaza la antigua orquestación cliente de 3 llamadas (saveFinalUnifiedPDFForUser +
 * updateTraceabilityForUser + finalizeFinalPdfForUser), que dejaba fugas de integridad:
 *   - consecutivo avanzado sin archivo si createFile fallaba,
 *   - trazabilidad "fire-and-forget" (o saltada si el popup se bloqueaba),
 *   - solicitud aprobada consumida antes de generar el PDF.
 *
 * Si algún paso posterior a la creación del archivo falla, revierte: elimina el archivo y
 * restaura el consecutivo, dejando la orden en un estado consistente.
 *
 * La contabilización ocurre al guardar el PDF en Drive (documento controlado emitido),
 * independientemente de que el visor llegue a abrirse en el navegador del operario.
 *
 * @param {string} base64Data - PDF final en base64
 * @param {string} orderNo - Número de orden
 * @param {string} userId - UserID del operario
 * @param {string} printType - 'Inicial' | 'Adicional' | 'Reimpresion'
 * @param {number} pagesPrinted - Total de páginas del PDF generado
 * @returns {Object} { fileId, viewerUrl, drivePreviewUrl, consecutivo, archivoReemplazado }
 * @throws {Error} Si no está autorizado o si la transacción no pudo completarse (revierte).
 */
function processPrintForUser(base64Data, orderNo, userId, printType, pagesPrinted) {
  enforcePermission(userId, 'IMPRIMIR_ORDEN');

  var tipo = printType || "Inicial";
  var paginas = Number(pagesPrinted) || 0;
  if (paginas <= 0) {
    throw new Error("Número de páginas inválido para registrar la impresión.");
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error("El sistema está procesando otra orden simultánea. Intente nuevamente en unos segundos.");
  }

  var saveResult = null;
  try {
    // 1. Validación de autorización (pura; NO consume la solicitud aprobada)
    checkPrintAuthorization_(orderNo, tipo, userId);

    // 2. Generación del archivo (crea el archivo y luego compromete el consecutivo)
    saveResult = saveFinalUnifiedPDFCore_(base64Data, orderNo);

    // 3. Trazabilidad + STATUS + historial + cierre de solicitud aprobada, y finalización
    try {
      internalUpdateTraceability(orderNo, userId, paginas, tipo);
      finalizeFinalPdfPostSave(orderNo, saveResult.fileId, false, userId);
    } catch (postErr) {
      // ROLLBACK: eliminar el archivo y restaurar el consecutivo para mantener consistencia
      try { saveResult.file.setTrashed(true); } catch (ignoredFileErr) {}
      try {
        saveResult.sheet.getRange(saveResult.rowIndex, saveResult.colConsecutivo).setValue(saveResult.oldConsecutivo);
        SpreadsheetApp.flush();
      } catch (ignoredCounterErr) {}
      Logger.log("processPrintForUser: rollback ejecutado. Causa: " + postErr.message);
      throw new Error("Impresión revertida por error al registrar trazabilidad: " + postErr.message);
    }

    return {
      fileId: saveResult.fileId,
      viewerUrl: saveResult.viewerUrl,
      drivePreviewUrl: saveResult.drivePreviewUrl,
      consecutivo: saveResult.consecutivo,
      archivoReemplazado: false
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Wrapper con autenticación para finalizeFinalPdfPostSave.
 * Llamado desde Index.html vía google.script.run.
 * 
 * @param {string} orderNo - Número de orden
 * @param {string} fileId - ID del archivo guardado
 * @param {boolean} archivoReemplazado - Si se reemplazó un archivo existente
 * @param {string} userId - UserID del usuario que ejecuta la acción
 * @returns {string} Mensaje de confirmación
 * @throws {Error} Si el usuario no está autorizado
 */
function finalizeFinalPdfForUser(orderNo, fileId, archivoReemplazado, userId) {
  enforcePermission(userId, 'IMPRIMIR_ORDEN');
  return finalizeFinalPdfPostSave(orderNo, fileId, archivoReemplazado, userId);
}

/**
 * Wrapper con autenticación para updateTraceability.
 * Llamado desde Index.html vía google.script.run.
 *
 * @param {string} orderNo - Número de orden
 * @param {string} userId - UserID del usuario que ejecuta la acción
 * @param {number} pagesPrinted - Número de páginas impresas
 * @param {string} printType - Tipo de impresión
 * @returns {Object} Resultado de internalUpdateTraceability
 * @throws {Error} Si el usuario no está autorizado
 */
function updateTraceabilityForUser(orderNo, userId, pagesPrinted, printType) {
  enforcePermission(userId, 'IMPRIMIR_ORDEN');
  // checkPrintAuthorization_ already consumes the 'Aprobada' status, 
  // so we shouldn't run it twice. The validation was done in saveFinalUnifiedPDFForUser.
  return internalUpdateTraceability(orderNo, userId, pagesPrinted, printType);
}

/**
 * Obtiene las solicitudes de impresión pendientes de aprobación QA.
 * Recorre la hoja 'SolicitudesImpresion' y retorna filas con Estado = 'Pendiente QA'.
 *
 * @returns {Array} Array de objetos con las solicitudes pendientes
 */
function getSolicitudesPendientesQA() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    if (!solicitudesSheet) {
      Logger.log("La hoja 'SolicitudesImpresion' no existe.");
      return [];
    }

    var headers = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
    var data = solicitudesSheet.getDataRange().getValues();

    var colEstado = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);
    var colIdSolicitud = getColumnIndexByNameCaseInsensitive(headers, 'ID_Solicitud', false);
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);
    var colTipoSolicitud = getColumnIndexByNameCaseInsensitive(headers, 'TipoSolicitud', false);
    var colSolicitadoPor = getColumnIndexByNameCaseInsensitive(headers, 'SolicitadoPor', false);
    var colMotivo = getColumnIndexByNameCaseInsensitive(headers, 'Motivo', false);
    var colPlantillas = getColumnIndexByNameCaseInsensitive(headers, 'Plantillas', false);
    var colFecha = getColumnIndexByNameCaseInsensitive(headers, 'Fecha', false);

    var solicitudesPendientes = [];

    for (var i = 1; i < data.length; i++) {
      var estado = colEstado ? (data[i][colEstado - 1] || '').toString().trim() : '';
      if (estado === 'Pendiente QA') {
        var row = data[i];
        var fechaVal = colFecha ? row[colFecha - 1] : '';
        var fechaStr = '';
        if (fechaVal instanceof Date) {
          fechaStr = Utilities.formatDate(fechaVal, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        } else if (fechaVal) {
          fechaStr = fechaVal.toString();
        }

        var solicitud = {
          idSolicitud: colIdSolicitud ? (row[colIdSolicitud - 1] || '').toString() : '',
          noOrden: colNoOrden ? (row[colNoOrden - 1] || '').toString() : '',
          tipoSolicitud: colTipoSolicitud ? (row[colTipoSolicitud - 1] || '').toString() : '',
          solicitadoPor: colSolicitadoPor ? (row[colSolicitadoPor - 1] || '').toString() : '',
          motivo: colMotivo ? (row[colMotivo - 1] || '').toString() : '',
          plantillas: colPlantillas ? (row[colPlantillas - 1] || '').toString() : '',
          fecha: fechaStr
        };
        solicitudesPendientes.push(solicitud);
      }
    }

    Logger.log("Solicitudes pendientes QA encontradas: " + solicitudesPendientes.length);
    return solicitudesPendientes;

  } catch (e) {
    Logger.log("Error en getSolicitudesPendientesQA: " + e.message);
    return [];
  }
}

/**
 * Abre el modal de aprobación de solicitudes de impresión extraordinaria.
 * Muestra el panel ModalAprobarImpresion.html con las solicitudes pendientes.
 */
function abrirModalAprobarImpresion() {
  var template = HtmlService.createTemplateFromFile('ModalAprobarImpresion');
  // Inyección de servidor (Server-side templating) para velocidad
  template.initialData = JSON.stringify(getInitialData());
  template.solicitudesPendientes = JSON.stringify(getSolicitudesPendientesQA());
  
  var html = template.evaluate()
    .setWidth(950).setHeight(700);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Aprobar Impresiones');
}

/**
 * Obtiene las órdenes válidas para impresión (datalist).
 * Retorna órdenes con STATUS Autorizada, Impreso o Reimpreso,
 * cruzando con SolicitudesImpresion para identificar aprobaciones pendientes.
 *
 * @returns {Array} Array de objetos { noOrden, label }
 */
function getOrdenesValidasParaImpresion() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ordenesSheet = ss.getSheetByName('Ordenes');
    if (!ordenesSheet) return [];

    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    var solicitudesAprobadas = {};

    // Cargar solicitudes aprobadas en mapa para cruce rápido
    if (solicitudesSheet) {
      var solHeaders = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
      var solData = solicitudesSheet.getDataRange().getValues();

      var colSolNoOrden = getColumnIndexByNameCaseInsensitive(solHeaders, 'NoOrden', false);
      var colSolEstado = getColumnIndexByNameCaseInsensitive(solHeaders, 'Estado', false);

      if (colSolNoOrden && colSolEstado) {
        for (var i = 1; i < solData.length; i++) {
          var solNoOrden = solData[i][colSolNoOrden - 1] ? solData[i][colSolNoOrden - 1].toString().trim() : "";
          var solEstado = solData[i][colSolEstado - 1] ? solData[i][colSolEstado - 1].toString().trim() : "";

          if (solEstado === 'Aprobada') {
            solicitudesAprobadas[solNoOrden] = true;
          }
        }
      }
    }

    // Obtener órdenes con STATUS válido
    var headers = ordenesSheet.getRange(1, 1, 1, ordenesSheet.getLastColumn()).getValues()[0];
    var data = ordenesSheet.getDataRange().getValues();

    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colStatus = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);

    var ordenesValidas = [];
    var statusValidos = ['Autorizada'];

    for (var i = 1; i < data.length; i++) {
      var noOrden = colNoOrden ? (data[i][colNoOrden - 1] || '').toString().trim() : '';
      var status = colStatus ? (data[i][colStatus - 1] || '').toString().trim() : '';

      if (!noOrden) continue;

      if (statusValidos.indexOf(status) !== -1) {
        var label = noOrden + ' - Autorizada';
        // Check if there is an approved request for this order even if it's not strictly Impreso,
        // just in case we need to show extra info, though typically it applies to Impreso.
        if (solicitudesAprobadas[noOrden]) {
          label = noOrden + ' - Solicitud Extra Aprobada';
        }

        ordenesValidas.push({ noOrden: noOrden, label: label });
      }
    }

    Logger.log("Órdenes válidas para impresión encontradas: " + ordenesValidas.length);
    return ordenesValidas;

  } catch (e) {
    Logger.log("Error en getOrdenesValidasParaImpresion: " + e.message);
    return [];
  }
}

// --- GESTIÓN DE SOLICITUDES DE IMPRESIÓN EXTRAORDINARIA ---

/**
 * Registra una solicitud de impresión extraordinaria (Reimpresión o Adicional).
 * Valida que la orden tenga un STATUS que permita solicitudes y crea el registro.
 *
 * @param {Object} params - Parámetros de la solicitud
 * @param {string} params.noOrden - Número de orden
 * @param {string} params.tipoSolicitud - Tipo de solicitud ('Reimpresión' o 'Adicional')
 * @param {string} params.motivo - Motivo de la solicitud
 * @param {string} params.plantillas - Plantillas y copias solicitadas (JSON o texto)
 * @param {string} userId - UserID del solicitante
 * @returns {Object} Resultado de la operación
 * @throws {Error} Si la orden no existe o su STATUS no permite solicitudes
 */
function registrarSolicitudImpresion(params, userId) {
  try {
    enforcePermission(userId, 'SOLICITAR_REIMPRESION');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ordenesSheet = ss.getSheetByName('Ordenes');
    if (!ordenesSheet) throw new Error("La hoja 'Ordenes' no existe.");

    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    if (!solicitudesSheet) throw new Error("La hoja 'SolicitudesImpresion' no existe. Ejecute el módulo Migration para crearla.");

    // Validar parámetros requeridos
    if (!params.noOrden || !params.tipoSolicitud || !params.motivo || !params.plantillas) {
      throw new Error("Faltan parámetros requeridos: noOrden, tipoSolicitud, motivo, plantillas.");
    }

    // Buscar la orden
    var headers = ordenesSheet.getRange(1, 1, 1, ordenesSheet.getLastColumn()).getValues()[0];
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colStatus = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);

    var orderValues = ordenesSheet.getRange(1, colNoOrden, ordenesSheet.getLastRow(), 1).getValues();
    var targetRowIndex = -1;
    var normalizedOrderNo = params.noOrden.toString().trim().toLowerCase();

    for (var idx = 1; idx < orderValues.length; idx++) {
      var rowOrderNo = orderValues[idx][0] ? orderValues[idx][0].toString().trim().toLowerCase() : "";
      if (rowOrderNo === normalizedOrderNo) {
        targetRowIndex = idx + 1;
        break;
      }
    }

    if (targetRowIndex === -1) {
      throw new Error("La orden '" + params.noOrden + "' no existe en la hoja Ordenes.");
    }

    // Validar STATUS de la orden
    var statusValue = "";
    if (colStatus) {
      statusValue = ordenesSheet.getRange(targetRowIndex, colStatus).getValue();
      statusValue = statusValue ? statusValue.toString().trim() : "";
    }

    var allowedStatuses = ['Impreso', 'Reimpreso', 'Autorizada'];
    if (allowedStatuses.indexOf(statusValue) === -1) {
      throw new Error("La orden '" + params.noOrden + "' tiene STATUS '" + statusValue + "'. Solo se permiten solicitudes para órdenes con STATUS: Impreso, Reimpreso o Autorizada.");
    }

    // Generar ID_Solicitud único
    var timestamp = new Date().getTime();
    var idSolicitud = 'REQ-' + timestamp;

    // Obtener identidad del solicitante
    var userIdentity = getUserIdentityStringByUserId_(userId);

    // --- EVALUAR AUTOAPROBACIÓN TEMPORAL CONFIGURABLE ---
    // Filtra por ventana de tiempo, tipo de solicitud, usuarios y órdenes/procesos.
    var colProceso = getColumnIndexByNameCaseInsensitive(headers, 'Proceso', false);
    var procesoOrden = colProceso ? (ordenesSheet.getRange(targetRowIndex, colProceso).getValue() || '').toString().trim() : '';
    var autoAprob = evaluateAutoApproval_(params.tipoSolicitud, userId, params.noOrden, procesoOrden);
    var estadoInicial = autoAprob.approved ? 'Aprobada' : 'Pendiente QA';
    var firmaInicial = autoAprob.approved ? ('Autoaprobación: ' + autoAprob.reason) : '';

    // Insertar fila en SolicitudesImpresion
    var solicitudesHeaders = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
    var newRow = [];
    var colMapping = {
      'ID_Solicitud': idSolicitud,
      'Fecha': new Date(),
      'NoOrden': params.noOrden,
      'SolicitadoPor': userIdentity,
      'TipoSolicitud': params.tipoSolicitud,
      'Motivo': params.motivo,
      'Plantillas': params.plantillas,
      'Estado': estadoInicial,
      'FirmaQA': firmaInicial
    };

    for (var i = 0; i < solicitudesHeaders.length; i++) {
      var headerName = solicitudesHeaders[i] ? solicitudesHeaders[i].toString().trim() : "";
      newRow.push(colMapping[headerName] || '');
    }

    solicitudesSheet.appendRow(newRow);

    // Registrar en Logs, historial de la orden y responder según autoaprobación
    var histSolicitud = "SOLICITUD " + params.tipoSolicitud + " (" + idSolicitud + ")"
      + (autoAprob.approved ? " AUTOAPROBADA" : " → Pendiente QA")
      + (params.motivo ? " · " + params.motivo : "") + " · " + userIdentity;
    appendHistorialImpresion_(ordenesSheet, targetRowIndex, headers, histSolicitud);

    if (autoAprob.approved) {
      logChange('AUTOAPROBACION_IMPRESION', 'Solicitud ' + idSolicitud + ' para orden ' + params.noOrden + ' AUTOAPROBADA (' + autoAprob.reason + ')', userIdentity);
      Logger.log("Solicitud autoaprobada: " + idSolicitud + " (" + autoAprob.reason + ")");
      return { status: 'success', message: 'Solicitud autoaprobada por configuración vigente. Ya puede imprimir.', idSolicitud: idSolicitud, autoAprobada: true };
    }

    logChange('SOLICITUD_IMPRESION', 'Solicitud ' + idSolicitud + ' creada para orden ' + params.noOrden + ' (Tipo: ' + params.tipoSolicitud + ')', userIdentity);
    Logger.log("Solicitud de impresión registrada: " + idSolicitud + " para orden " + params.noOrden);
    return { status: 'success', message: 'Solicitud enviada a QA exitosamente.', idSolicitud: idSolicitud, autoAprobada: false };

  } catch (e) {
    Logger.log("Error en registrarSolicitudImpresion: " + e.message);
    throw new Error("Error al registrar solicitud de impresión: " + e.message);
  }
}

/**
 * Procesa la aprobación o rechazo de solicitudes de impresión extraordinaria.
 * Actualiza el estado de las solicitudes seleccionadas y registra la firma QA.
 *
 * @param {Object} params - Parámetros de la aprobación
 * @param {Array} params.targetIds - Array de ID_Solicitud a procesar
 * @param {string} params.accion - Acción a ejecutar ('Aprobada' o 'Rechazada')
 * @param {string} userId - UserID del usuario QA que aprueba/rechaza
 * @returns {Object} Resultado de la operación
 * @throws {Error} Si hay errores en el procesamiento
 */
function procesarAprobacionImpresionQA(params, userId) {
  try {
    enforcePermission(userId, 'APROBAR_REIMPRESION');
    params.userId = userId;
    requireAuthorizedUserStrict_(params);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var solicitudesSheet = ss.getSheetByName('SolicitudesImpresion');
    if (!solicitudesSheet) throw new Error("La hoja 'SolicitudesImpresion' no existe.");

    var headers = solicitudesSheet.getRange(1, 1, 1, solicitudesSheet.getLastColumn()).getValues()[0];
    var data = solicitudesSheet.getDataRange().getValues();

    var colIdSolicitud = getColumnIndexByNameCaseInsensitive(headers, 'ID_Solicitud', false);
    var colEstado = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);
    var colFirmaQA = getColumnIndexByNameCaseInsensitive(headers, 'FirmaQA', false);
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', false);

    if (!colIdSolicitud || !colEstado || !colFirmaQA) {
      throw new Error("La hoja 'SolicitudesImpresion' no tiene las columnas requeridas.");
    }

    var targetIds = params.targetIds || [];
    var accion = params.accion || '';
    var userIdentity = getUserIdentityStringByUserId_(userId);
    var timestamp = new Date().toLocaleString('es-ES');
    var firmaQA = "QA: " + userIdentity + " - " + timestamp;

    var procesadas = 0;
    var noEncontradas = 0;
    var yaProcesadas = 0;

    for (var i = 1; i < data.length; i++) {
      var idSolicitud = colIdSolicitud ? (data[i][colIdSolicitud - 1] || '').toString() : '';
      var estadoActual = colEstado ? (data[i][colEstado - 1] || '').toString().trim() : '';

      if (targetIds.indexOf(idSolicitud) !== -1) {
        if (estadoActual !== 'Pendiente QA') {
          yaProcesadas++;
          continue;
        }

        // Actualizar estado y firma
        solicitudesSheet.getRange(i + 1, colEstado).setValue(accion);
        solicitudesSheet.getRange(i + 1, colFirmaQA).setValue(firmaQA);
        procesadas++;

        // Registrar en Logs y en el historial consolidado de la orden
        var noOrden = colNoOrden ? (data[i][colNoOrden - 1] || '').toString() : '';
        logChange('APROBACION_IMPRESION_QA', 'Solicitud ' + idSolicitud + ' para orden ' + noOrden + ' fue ' + accion.toLowerCase(), userIdentity);
        appendHistorialByOrderNo_(noOrden, "QA " + accion + " solicitud " + idSolicitud + " · " + userIdentity);
      }
    }

    var mensaje = 'Procesadas ' + procesadas + ' solicitud(es) exitosamente.';
    if (yaProcesadas > 0) {
      mensaje += ' ' + yaProcesadas + ' solicitud(es) ya habían sido procesadas y fueron omitidas.';
    }
    if (noEncontradas > 0) {
      mensaje += ' ' + noEncontradas + ' solicitud(es) no fueron encontradas.';
    }

    Logger.log("ProcesarAprobacionImpresionQA: " + mensaje);

    return { status: 'success', message: mensaje, procesadas: procesadas };

  } catch (e) {
    Logger.log("Error en procesarAprobacionImpresionQA: " + e.message);
    throw new Error("Error al procesar aprobación: " + e.message);
  }
}

/**
 * Obtiene el archivo PDF en Base64 para el visor seguro.
 * @param {string} fileId - ID del archivo en Drive
 * @returns {string} PDF codificado en Base64
 */
function getPdfSeguroBase64(fileId) {
  try {
    // Validacion de sesion deshabilitada para visores publicos (Security by Obscurity via fileId)
    // var activeEmail = Session.getActiveUser().getEmail();
    // var userRecord = getUserRecordByEmail_(activeEmail);
    // if (!userRecord || (!hasPermissionByRol(userRecord.rol, 'IMPRIMIR_ORDEN') && !hasPermissionByRol(userRecord.rol, 'VER_NATIVO_DRIVE'))) {
    //   throw new Error("Acceso denegado. No tiene los permisos requeridos para visualizar este documento.");
    // }
    
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    return Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    Logger.log("Error en getPdfSeguroBase64: " + e.message);
    throw new Error("No se pudo acceder al documento o no existe.");
  }
}

/**
 * Evalúa permisos si el visor seguro falla en renderizar.
 * Usa RBAC: Si tiene el permiso VER_NATIVO_DRIVE -> Retorna URL de Drive.
 * Si NO tiene permiso -> Ejecuta rollback de impresión y retorna error.
 */
function handleViewerFallback(fileId, orderNo) {
  // Se remueve la restriccion por email por incompatibilidad con cuentas externas
  // Solo se retorna el link nativo de Google Drive como fallback.
  var tienePermiso = true;
  
  if (tienePermiso) {
    return { 
      action: 'redirect', 
      url: 'https://drive.google.com/file/d/' + fileId + '/view' 
    };
  } else {
    // Rollback para no contabilizar la impresión fallida en personal operativo
    if (orderNo) {
      rollbackPrint(orderNo, fileId);
    }
    return { 
      action: 'error', 
      message: 'Ha ocurrido un error al cargar el documento. Solicite al administrador realizar la reimpresión.' 
    };
  }
}

/**
 * Revierte el conteo de una impresión fallida eliminando el PDF creado.
 */
function rollbackPrint(orderNo, fileId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues();
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colConsecutivo = getColumnIndexByNameCaseInsensitive(headers, 'ConsecutivoImp', true);
    
    var orderValues = sheet.getRange(1, colNoOrden, sheet.getLastRow(), 1).getValues();
    for (var idx = 1; idx < orderValues.length; idx++) {
      if (orderValues[idx] == orderNo) {
        var cell = sheet.getRange(idx + 1, colConsecutivo);
        var currentVal = Number(cell.getValue());
        if (currentVal > 0) {
          cell.setValue(currentVal - 1);
        }
        break;
      }
    }
    
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {}
    Logger.log("Rollback ejecutado exitosamente para orden: " + orderNo);
  } catch(e) {
    Logger.log("Error en rollbackPrint: " + e.message);
  }
}
