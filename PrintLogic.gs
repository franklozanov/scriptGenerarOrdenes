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
    var v = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
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
  
  // --- VALIDACIÓN DE STATUS PARA IMPRESIÓN ---
  var colStatusCol = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
  var statusValue = "";
  if (colStatusCol) {
    statusValue = targetRowData[colStatusCol - 1] ? targetRowData[colStatusCol - 1].toString().trim() : "";
  }
  
  // Bloquear impresión si STATUS es RecibidaQA, DevueltaQA o Cerrada
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
    errors: errors
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
    var v = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
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
  try {
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
    
    // Actualizar consecutivo en la hoja
    sheet.getRange(rowIndex, colConsecutivo).setValue(nextConsecutivo);
    
    // Construir nombre de archivo
    var targetFileName = 'Orden_' + orderNo + '_' + nextConsecutivo + '.pdf';
    
    Logger.log("Guardando versión #" + nextConsecutivo + ": " + targetFileName);
    
    // Decodificar base64 y crear el archivo
    var decodeStartedAt = new Date().getTime();
    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, 'application/pdf', targetFileName);
    Logger.log("saveFinalUnifiedPDF decode/blob ms: " + (new Date().getTime() - decodeStartedAt));
    
    var createStartedAt = new Date().getTime();
    var file = folder.createFile(blob);
    Logger.log("saveFinalUnifiedPDF createFile ms: " + (new Date().getTime() - createStartedAt));
    var fileId = file.getId();
    
    var drivePreviewUrl = file.getUrl();
    var viewerUrl = 'https://drive.google.com/file/d/' + fileId + '/view';
    Logger.log("saveFinalUnifiedPDF total ms: " + (new Date().getTime() - startedAt));
    
    // Retornar URLs y consecutivo
    return {
      fileId: fileId,
      drivePreviewUrl: drivePreviewUrl,
      viewerUrl: viewerUrl,
      archivoReemplazado: false,
      consecutivo: nextConsecutivo
    };
    
  } catch (e) {
    Logger.log("Error en saveFinalUnifiedPDF: " + e.message);
    throw new Error("Error al guardar PDF final: " + e.message);
  }
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
 * Wrapper con autenticación para saveFinalUnifiedPDF.
 * Llamado desde Index.html vía google.script.run.
 * 
 * @param {string} base64Data - Datos del PDF en base64
 * @param {string} orderNo - Número de orden
 * @param {string} userId - UserID del usuario que ejecuta la acción
 * @returns {Object} Resultado de saveFinalUnifiedPDF
 * @throws {Error} Si el usuario no está autorizado
 */
function saveFinalUnifiedPDFForUser(base64Data, orderNo, userId) {
  if (!isUserAuthorized(userId)) throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + userId + '.');
  return saveFinalUnifiedPDF(base64Data, orderNo);
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
  if (!isUserAuthorized(userId)) throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + userId + '.');
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
  if (!isUserAuthorized(userId)) throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + userId + '.');
  return internalUpdateTraceability(orderNo, userId, pagesPrinted, printType);
}
