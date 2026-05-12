function onOpen() {
  // 1. Menú de Administrador (Opciones de seguridad y proxy)
  var adminMenu = SpreadsheetApp.getUi().createMenu('🔒 Opciones Admin')
    .addItem('🚀 Inicializar Sistema Completo', 'promptInitializeApp');

  // 2. Menú de Configuración General
  var configMenu = SpreadsheetApp.getUi().createMenu('⚙️ Configuración')
    .addItem('📊 Diagnosticar Plantillas', 'diagnosticarPlantillas')
    .addItem('🔍 Diagnosticar ConsecutivoImp', 'diagnosticarConsecutivoImp')
    .addSeparator()
    .addSubMenu(adminMenu);

  // 3. Menú Principal (Gestionar OA)
  SpreadsheetApp.getUi().createMenu('Gestionar OA')
    .addItem('📤 Subir documentos', 'abrirModalSubidaGeneral')
    .addItem('🖨️ Imprimir Orden', 'openPrintDialog')
    .addItem('📝 Registrar Entrega / Novedad', 'abrirModalRegistroNovedad')
    .addSeparator()
    .addSubMenu(configMenu)
    .addToUi();
  
  // Cache warmup: precargar datos silenciosamente
  try {
    getInitialData();
    syncVerifCantDisponible();
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Plantillas estáticas listas.', 'Sistema QMS', 5);
  } catch (e) {
    Logger.log("Error en warmup de caché: " + e.message);
  }
}

/**
 * Sincroniza valores de VerifCant. Disponible a CantDispAFecha al abrir la hoja.
 * Solo actualiza si VerifCant. Disponible tiene un número >= 0 y es diferente a CantDispAFecha.
 */
function syncVerifCantDisponible() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) {
      Logger.log("syncVerifCantDisponible: Hoja 'Ordenes' no encontrada.");
      return;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return; // No hay datos

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // CORREGIDO: Usar getColumnIndexByNameCaseInsensitive (devuelve base-1)
    var verifCantCol = getColumnIndexByNameCaseInsensitive(headers, 'VerifCant. Disponible', false);
    var cantDispCol = getColumnIndexByNameCaseInsensitive(headers, 'CantDispAFecha', false);

    if (!verifCantCol) {
      Logger.log("syncVerifCantDisponible: Columna 'VerifCant. Disponible' no encontrada.");
      return;
    }
    
    if (!cantDispCol) {
      Logger.log("syncVerifCantDisponible: Columna 'CantDispAFecha' no encontrada.");
      return;
    }

    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = dataRange.getValues();
    var updates = [];

    for (var i = 0; i < values.length; i++) {
      var verifCantValue = values[i][verifCantCol - 1]; // -1 para acceso a array base-0
      var cantDispValue = values[i][cantDispCol - 1];

      // Si VerifCant. Disponible es un número >= 0 (no "-")
      if (verifCantValue !== '-' && verifCantValue !== '' && !isNaN(verifCantValue)) {
        var numVerifCant = Number(verifCantValue);
        if (numVerifCant >= 0) {
          // Verificar si necesita actualización
          if (numVerifCant !== Number(cantDispValue)) {
            updates.push({
              row: i + 2, // +2 porque i empieza en 0 y hay header
              value: numVerifCant
            });
          }
        }
      }
    }

    if (updates.length > 0) {
      Logger.log("syncVerifCantDisponible: Actualizando " + updates.length + " filas.");
      updates.forEach(function(update) {
        sheet.getRange(update.row, cantDispCol).setValue(update.value); // cantDispCol ya es base-1
      });
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Se sincronizaron ' + updates.length + ' valores de Cantidad Disponible.', 
        'Sincronización', 
        3
      );
    } else {
      Logger.log("syncVerifCantDisponible: No se requieren actualizaciones.");
    }
  } catch (e) {
    Logger.log("ERROR en syncVerifCantDisponible: " + e.message);
    Logger.log("Stack trace: " + e.stack);
  }
}

function openPrintDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(550).setHeight(700).setTitle('Panel de Impresión');
  SpreadsheetApp.getUi().showModalDialog(html, 'Panel de Impresión');
}

function promptInitializeApp() {
  withAdminAuth('Inicializar Sistema Completo (Admin)', function(ui) {
    initializeCompleteSystem(ui);
  });
}

// --- LÓGICA PRINCIPAL DE IMPRESIÓN ---

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

  var dynamicPdfs = [];
  var errors = [];

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

// --- FASE 1: INICIALIZACIÓN Y VALIDACIÓN DE ESTRUCTURA ---

// Estructura esperada del libro de trabajo
function initializeApp(ui) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = validateStructure();
  
  if (report.missingSheets.length === 0 && report.incorrectHeaders.length === 0) {
    ui.alert('✅ Estructura válida. Todas las hojas y encabezados son correctos. Use "🔄 Actualizar Botones de Subida" para configurar la columna AdjuntoOrden.');
    return;
  }
  
  var message = "Se detectaron discrepancias en la estructura:\n\n";
  
  if (report.missingSheets.length > 0) {
    message += "❌ Hojas faltantes:\n" + report.missingSheets.join("\n") + "\n\n";
  }
  
  if (report.incorrectHeaders.length > 0) {
    message += "❌ Encabezados incorrectos:\n" + report.incorrectHeaders.join("\n") + "\n\n";
  }
  
  message += "¿Desea corregir estos problemas automáticamente?";
  
  var response = ui.alert("Inicializar App", message, ui.ButtonSet.YES_NO);
  
  if (response === ui.Button.YES) {
    createMissingSheets(ui);
    fixHeaders(ui);
    ui.alert('✅ Inicialización completada. Estructura corregida. Use "🔄 Actualizar Botones de Subida" para configurar la columna AdjuntoOrden.');

    // Registrar inicialización en Logs si existe
    logInitialization();
  }
}

function initializeCompleteSystem(ui) {
  var summary = [];
  
  // Limpiar caché al inicio para forzar recarga de plantillas actualizadas
  try {
    clearInitialDataCache();
    summary.push("✓ Caché de plantillas limpiado");
  } catch (e) {
    summary.push("✗ Error limpiando caché: " + e.message);
  }
  
  try {
    initializeWorkbookStructure_(ui);
    summary.push("✓ Estructura de hojas validada/corregida");
  } catch (e) {
    summary.push("✗ Error en estructura: " + e.message);
    throw e;
  }

  try {
    ensureWebAppUrlConfigured_(ui);
    summary.push("✓ URL de Web App configurada");
  } catch (e) {
    summary.push("✗ Error configurando Web App URL: " + e.message);
    throw e;
  }

  try {
    applyNewProtectionScheme();
    summary.push("✓ Nuevo esquema de protección aplicado");
  } catch (e) {
    summary.push("✗ Error aplicando protecciones: " + e.message);
    throw e;
  }

  try {
    setupAuditTrailTrigger();
    summary.push("✓ Auditoría activada/verificada");
  } catch (e) {
    summary.push("✗ Error activando auditoría: " + e.message);
    throw e;
  }

  // === NUEVO: Diagnóstico de ConsecutivoImp ===
  try {
    var diagnosticResult = runConsecutivoImpDiagnostic_();
    summary.push("✓ " + diagnosticResult);
  } catch (e) {
    summary.push("⚠️ Diagnóstico ConsecutivoImp: " + e.message);
  }

  try {
    logInitialization();
  } catch (e) {
    Logger.log("No se pudo registrar inicialización completa: " + e.message);
  }

  ui.alert("✅ Sistema inicializado completamente:\n\n" + summary.join("\n"));
}

function initializeWorkbookStructure_(ui) {
  var report = validateStructure();
  if (report.missingSheets.length > 0) {
    createMissingSheets(ui);
  }
  if (report.incorrectHeaders.length > 0) {
    fixHeaders(ui);
  }
}

function ensureWebAppUrlConfigured_(ui) {
  var savedUrl = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  
  // Si ya existe URL configurada, preguntar si desea mantenerla o modificarla
  if (savedUrl) {
    var confirmMessage = "URL de Web App ya configurada:\n\n" + savedUrl + "\n\n¿Desea mantener esta URL?";
    var confirmResponse = ui.alert("Configuración Web App URL", confirmMessage, ui.ButtonSet.YES_NO);
    
    if (confirmResponse === ui.Button.YES) {
      Logger.log("✓ URL de Web App mantenida: " + savedUrl);
      return savedUrl;
    }
  }
  
  // Intentar obtener URL automáticamente
  var currentUrl = "";
  try {
    currentUrl = ScriptApp.getService().getUrl();
  } catch (e) {
    Logger.log("No se pudo obtener URL automática de Web App: " + e.message);
  }

  if (currentUrl && !savedUrl) {
    setWebAppUrl(currentUrl);
    Logger.log("✓ URL de Web App configurada automáticamente: " + currentUrl);
    return currentUrl;
  }

  // Solicitar URL manualmente
  var promptMessage = "Ingrese la URL del despliegue Web App (debe terminar en /exec):";
  
  if (savedUrl) {
    promptMessage += "\n\nURL anterior:\n" + savedUrl;
  }
  
  if (currentUrl) {
    promptMessage += "\n\nURL detectada automáticamente:\n" + currentUrl + "\n\n(Puede copiar esta URL o ingresar otra)";
  }

  var response = ui.prompt("Configurar Web App URL", promptMessage, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    if (savedUrl) {
      Logger.log("✓ Configuración cancelada, manteniendo URL anterior: " + savedUrl);
      return savedUrl;
    }
    throw new Error("Configuración de Web App URL cancelada por el usuario.");
  }

  var enteredUrl = response.getResponseText().trim();
  
  // Si no ingresó nada, usar la URL detectada automáticamente o la guardada
  if (!enteredUrl) {
    if (currentUrl) {
      setWebAppUrl(currentUrl);
      Logger.log("✓ URL de Web App configurada con URL detectada: " + currentUrl);
      return currentUrl;
    } else if (savedUrl) {
      Logger.log("✓ Manteniendo URL anterior: " + savedUrl);
      return savedUrl;
    } else {
      throw new Error("Debe ingresar una URL de Web App válida.");
    }
  }

  setWebAppUrl(enteredUrl);
  Logger.log("✓ URL de Web App configurada manualmente: " + enteredUrl);
  return enteredUrl;
}

function validateStructure() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var missingSheets = [];
  var incorrectHeaders = [];
  
  for (var sheetName in REQUIRED_SHEETS) {
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      missingSheets.push(sheetName);
      continue;
    }
    
    var expectedHeaders = REQUIRED_SHEETS[sheetName];
    var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Comparar encabezados (case-insensitive)
    var headersMatch = true;
    var missingHeaders = [];
    
    for (var i = 0; i < expectedHeaders.length; i++) {
      var found = false;
      for (var j = 0; j < actualHeaders.length; j++) {
        if (actualHeaders[j] && actualHeaders[j].toString().toLowerCase() === expectedHeaders[i].toLowerCase()) {
          found = true;
          break;
        }
      }
      if (!found) {
        missingHeaders.push(expectedHeaders[i]);
        headersMatch = false;
      }
    }
    
    if (!headersMatch) {
      incorrectHeaders.push(sheetName + " (falta: " + missingHeaders.join(", ") + ")");
    }
  }
  
  return {
    missingSheets: missingSheets,
    incorrectHeaders: incorrectHeaders
  };
}

function createMissingSheets(ui) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var sheetName in REQUIRED_SHEETS) {
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, REQUIRED_SHEETS[sheetName].length).setValues([REQUIRED_SHEETS[sheetName]]);
      Logger.log("✓ Hoja creada: " + sheetName);
    }
  }
}

function fixHeaders(ui) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var sheetName in REQUIRED_SHEETS) {
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) continue;
    
    // === NUEVO: Verificar ConsecutivoImp en hoja Ordenes ===
    if (sheetName === 'Ordenes') {
      try {
        var columnCreated = ensureConsecutivoImpColumn_(sheet);
        if (columnCreated) {
          Logger.log('✓ Columna ConsecutivoImp agregada a Ordenes');
        }
      } catch (e) {
        Logger.log('⚠️ Error al verificar ConsecutivoImp: ' + e.message);
        ui.alert('Error', 'No se pudo verificar/crear la columna ConsecutivoImp: ' + e.message, ui.ButtonSet.OK);
      }
    }
    // === FIN NUEVO ===
    
    var expectedHeaders = REQUIRED_SHEETS[sheetName];
    var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Verificar si hay datos en la hoja (más allá de la fila de encabezados)
    var hasData = sheet.getLastRow() > 1;
    
    var headersMatch = true;
    var missingHeaders = [];
    
    for (var i = 0; i < expectedHeaders.length; i++) {
      var found = false;
      for (var j = 0; j < actualHeaders.length; j++) {
        if (actualHeaders[j] && actualHeaders[j].toString().toLowerCase() === expectedHeaders[i].toLowerCase()) {
          found = true;
          break;
        }
      }
      if (!found) {
        missingHeaders.push(expectedHeaders[i]);
        headersMatch = false;
      }
    }
    
    if (!headersMatch && hasData) {
      // Advertencia: hoja tiene datos pero encabezados incorrectos
      var warning = "La hoja '" + sheetName + "' tiene datos pero encabezados incorrectos.\n" +
                   "Faltan: " + missingHeaders.join(", ") + "\n" +
                   "¿Desea corregir los encabezados? (Esto podría afectar datos existentes)";
      
      var response = ui.alert("Advertencia", warning, ui.ButtonSet.YES_NO);
      
      if (response !== ui.Button.YES) {
        Logger.log("⚠️ Corrección de encabezados cancelada por usuario en hoja: " + sheetName);
        continue;
      }
    }
    
    if (!headersMatch) {
      // Corregir encabezados
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      Logger.log("✓ Encabezados corregidos en hoja: " + sheetName);
    }
  }
}

function logInitialization() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');
  
  if (!sheetLogs) {
    // Crear hoja Logs si no existe
    sheetLogs = ss.insertSheet('Logs');
    sheetLogs.getRange(1, 1, 1, 4).setValues([['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']]);
  }
  
  var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var user = "Sistema";
  var tipoCambio = "INICIALIZACION";
  var descripcion = "Inicialización de estructura del libro de trabajo";
  
  sheetLogs.appendRow([timestamp, user, tipoCambio, descripcion]);
  Logger.log("✓ Inicialización registrada en Logs");
}

// --- FASE 3: GESTIÓN DE PERMISOS Y PROTECCIÓN DE HOJAS ---

function removeLegacyProtections() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Obtener TODAS las protecciones de hoja y rango en todo el libro
  var allSheetProtections = ss.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var allRangeProtections = ss.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  
  var totalRemoved = 0;
  
  // Eliminar TODAS las protecciones de hoja
  Logger.log("=== Eliminando protecciones de hoja ===");
  for (var i = 0; i < allSheetProtections.length; i++) {
    var desc = allSheetProtections[i].getDescription() || "(sin descripción)";
    var sheetName = allSheetProtections[i].getRange().getSheet().getName();
    try {
      allSheetProtections[i].remove();
      Logger.log("✓ Eliminada protección de hoja: " + desc + " en hoja: " + sheetName);
      totalRemoved++;
    } catch (e) {
      Logger.log("✗ Error al eliminar protección de hoja: " + desc + " - " + e.message);
    }
  }
  
  // Eliminar TODAS las protecciones de rango
  Logger.log("=== Eliminando protecciones de rango ===");
  for (var j = 0; j < allRangeProtections.length; j++) {
    var desc = allRangeProtections[j].getDescription() || "(sin descripción)";
    var sheetName = allRangeProtections[j].getRange().getSheet().getName();
    var rangeA1 = allRangeProtections[j].getRange().getA1Notation();
    try {
      allRangeProtections[j].remove();
      Logger.log("✓ Eliminada protección de rango: " + desc + " en " + sheetName + "!" + rangeA1);
      totalRemoved++;
    } catch (e) {
      Logger.log("✗ Error al eliminar protección de rango: " + desc + " - " + e.message);
    }
  }
  
  Logger.log("=== TOTAL: " + totalRemoved + " protecciones eliminadas ===");
}

function hideAllSheetsExcept(visibleSheetNames) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = ss.getSheets();
  
  Logger.log("=== Ocultando hojas ===");
  var hiddenCount = 0;
  
  for (var i = 0; i < allSheets.length; i++) {
    var sheet = allSheets[i];
    var sheetName = sheet.getName();
    
    // Si la hoja NO está en la lista de hojas visibles, ocultarla
    if (visibleSheetNames.indexOf(sheetName) === -1) {
      try {
        sheet.hideSheet();
        Logger.log("✓ Hoja ocultada: " + sheetName);
        hiddenCount++;
      } catch (e) {
        Logger.log("✗ Error al ocultar hoja: " + sheetName + " - " + e.message);
      }
    } else {
      // Asegurarse de que las hojas visibles estén mostradas
      if (sheet.isSheetHidden()) {
        sheet.showSheet();
        Logger.log("✓ Hoja mostrada: " + sheetName);
      }
    }
  }
  
  Logger.log("=== TOTAL: " + hiddenCount + " hojas ocultadas ===");
}

function ensureFolderPermissions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tplSheet = ss.getSheetByName('templates');
  
  if (!tplSheet) {
    Logger.log("⚠️ Hoja templates no existe");
    return;
  }
  
  var tplData = tplSheet.getDataRange().getValues();
  var tplHeaders = tplData[0];
  var folderKeys = ['DOC_ORDENES', 'DOC_ANALISIS', 'DOC_COMPLETO'];
  var ownerEmail = Session.getEffectiveUser().getEmail();
  
  // Obtener índices de columnas
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Clave', false);
  var colValorIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Valor', false);
  
  // Si alguna columna no existe, usar índices por defecto
  if (!colClaveIdx) colClaveIdx = 1;
  if (!colValorIdx) colValorIdx = 2;
  
  // Convertir a base-0 para acceso a array
  colClaveIdx = colClaveIdx - 1;
  colValorIdx = colValorIdx - 1;
  
  Logger.log("=== Verificando permisos de carpetas de Drive ===");
  
  for (var i = 1; i < tplData.length; i++) {
    var key = tplData[i][colClaveIdx] ? tplData[i][colClaveIdx].toString().trim() : "";
    var folderId = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
    
    if (folderKeys.indexOf(key) !== -1 && folderId) {
      try {
        var folder = DriveApp.getFolderById(folderId);
        
        // Verificar si el propietario tiene acceso de escritura
        var editors = folder.getEditors();
        var hasAccess = false;
        
        for (var j = 0; j < editors.length; j++) {
          if (editors[j].getEmail() === ownerEmail) {
            hasAccess = true;
            break;
          }
        }
        
        // Si el propietario es el dueño de la carpeta, también tiene acceso
        try {
          if (folder.getOwner().getEmail() === ownerEmail) {
            hasAccess = true;
          }
        } catch (ownerError) {
          // En algunos casos getOwner() puede fallar, continuar
          Logger.log("⚠️ No se pudo verificar propietario de carpeta " + key);
        }
        
        if (hasAccess) {
          Logger.log("✓ Carpeta " + key + " (" + folderId + ") tiene permisos correctos");
        } else {
          Logger.log("⚠️ Carpeta " + key + " requiere permisos. Agregando editor...");
          try {
            folder.addEditor(ownerEmail);
            Logger.log("✓ Permisos agregados a carpeta " + key);
          } catch (addError) {
            Logger.log("✗ No se pudo agregar editor a carpeta " + key + ": " + addError.message);
          }
        }
        
      } catch (e) {
        Logger.log("✗ Error al verificar carpeta " + key + " (" + folderId + "): " + e.message);
      }
    }
  }
  
  Logger.log("=== Verificación de permisos completada ===");
}

function applyNewProtectionScheme() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Primero eliminar protecciones legacy
  removeLegacyProtections();
  
  // Ocultar todas las hojas excepto Ordenes, Logs y RegistroNovedad
  hideAllSheetsExcept(['Ordenes', 'Logs', 'RegistroNovedad']);
  
  // Verificar y asegurar permisos de carpetas de Drive
  ensureFolderPermissions();
  
  // Proteger hoja templates
  var sheetTemplates = ss.getSheetByName('templates');
  if (sheetTemplates) {
    protectSheetFully(sheetTemplates, 'Proteccion_Templates');
  }
  
  // Proteger hoja Usuarios
  var sheetUsuarios = ss.getSheetByName('Usuarios');
  if (sheetUsuarios) {
    protectSheetFully(sheetUsuarios, 'Proteccion_Usuarios');
  }
  
  // Proteger hoja RegistroNovedad
  var sheetRegistroNovedad = ss.getSheetByName('RegistroNovedad');
  if (sheetRegistroNovedad) {
    protectSheetFully(sheetRegistroNovedad, 'Proteccion_RegistroNovedad');
  }
  
  // Configurar protección mixta para Ordenes
  configureOrdenesProtection();
  
  // Configurar protección para Logs
  configureLogsProtection();
  
  // Aplicar Validación de Datos a las columnas STATUS
  applyStatusDataValidation();
  
  Logger.log("✓ Nuevo esquema de protección aplicado");
}

function protectSheetFully(sheet, description) {
  var protection = sheet.protect().setDescription(description);
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  
  // Agregar al propietario como editor para que el script pueda escribir
  var ownerEmail = Session.getEffectiveUser().getEmail();
  if (ownerEmail) {
    protection.addEditor(ownerEmail);
  }
  
  Logger.log("✓ Hoja protegida completamente: " + sheet.getName());
}

function configureOrdenesProtection() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetOrdenes = ss.getSheetByName('Ordenes');
  if (!sheetOrdenes) return;
  
  // 1. Eliminar todas las protecciones de rango existentes en la hoja "Ordenes"
  var proteccionesActuales = sheetOrdenes.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  proteccionesActuales.forEach(function(p) {
    p.remove();
    Logger.log("✓ Eliminada protección: " + p.getDescription());
  });
  
  // 2. Columnas que SOLO el administrador/propietario puede editar directamente en la hoja.
  // Las columnas de trazabilidad (STATUS, NoPags, ImpresoPor, Reimpresion, ReimpresoPor, TotalPags)
  // NO se protegen aquí porque el script las escribe desde el modal (google.script.run corre
  // como el usuario activo, no como propietario). Su acceso se controla exclusivamente por código.
  var colsToProtect = [
    "VerifLote", "VerifCant. Disponible", "VerifExp",
    "Fabricante", "Decision"
  ];
  
  var filaEncabezados = 1;
  var headers = sheetOrdenes.getRange(filaEncabezados, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
  
  // 3. Aplicar protección solo a las columnas en colsToProtect
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i] ? headers[i].toString().trim() : "";
    if (colsToProtect.indexOf(header) !== -1) {
      var columna = i + 1;
      // Protege toda la columna excepto el encabezado
      var rangoAProteger = sheetOrdenes.getRange(filaEncabezados + 1, columna, sheetOrdenes.getMaxRows() - filaEncabezados);
      
      var proteccion = rangoAProteger.protect().setDescription("Protección Admin: " + header);
      
      // Eliminar editores para que solo el propietario/admin pueda editar
      proteccion.removeEditors(proteccion.getEditors());
      if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
      
      // Agregar al propietario como editor para que el script pueda escribir
      var ownerEmail = Session.getEffectiveUser().getEmail();
      if (ownerEmail) {
        proteccion.addEditor(ownerEmail);
      }
      
      Logger.log("✓ Protección aplicada a columna: " + header);
    }
  }
  
  // Las columnas no incluidas en colsToProtect no tendrán protección de rango
  // por lo que respetarán los permisos generales de la hoja (permisos nativos de Drive)
  
  Logger.log("✓ Protección por columna configurada para Ordenes");
}

function applyStatusDataValidation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var statusOptions = ['Impreso', 'Reimpreso', 'RecibidaQA', 'DevueltaQA', 'Cerrada'];
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusOptions, true)
    .setAllowInvalid(false)
    .build();
    
  var sheetsToUpdate = ['Ordenes', 'RegistroNovedad'];
  
  sheetsToUpdate.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      var lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues();
        var statusColIdx = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
        
        if (statusColIdx) {
          var maxRows = sheet.getMaxRows();
          if (maxRows > 1) {
            var range = sheet.getRange(2, statusColIdx, maxRows - 1, 1);
            range.setDataValidation(rule);
            Logger.log("✓ Validación de datos aplicada a columna STATUS en hoja: " + sheetName);
          }
        }
      }
    }
  });
}

function configureLogsProtection() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');
  if (!sheetLogs) return;
  
  // Proteger hoja completa
  var protection = sheetLogs.protect().setDescription('Proteccion_Logs');
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  
  // Agregar permiso de escritura para el script (propietario)
  var ownerEmail = Session.getEffectiveUser().getEmail();
  if (ownerEmail) {
    protection.addEditor(ownerEmail);
    Logger.log("✓ Hoja Logs protegida con permisos de escritura para script");
  }
}

function promptApplyNewProtection() {
  withAdminAuth('Aplicar Nuevo Esquema de Protección (Admin)', function(ui) {
    applyNewProtectionScheme();
    ui.alert('✅ Nuevo esquema de protección aplicado. Protecciones legacy eliminadas.');
  });
}

function promptSetupAuditTrail() {
  withAdminAuth('Activar Auditoría (Admin)', function(ui) {
    setupAuditTrailTrigger();
    ui.alert('✅ Sistema de auditoría activado. Los cambios se registrarán en la hoja Logs.');
  });
}

// --- FASE 3: GESTIÓN DE PERMISOS Y PROTECCIONES ---

/**
 * Retorna un array con los NoOrden de todas las filas donde AdjuntoOrden sea "Pendiente".
 * @returns {Array} Array de strings con números de orden pendientes.
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

// --- FUNCIÓN PARA ABRIR MODAL DE SUBIDA GENERAL ---

/**
 * Abre el modal centralizado de subida de archivos.
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

function abrirModalRegistroNovedad() {
  try {
    var html = HtmlService.createHtmlOutputFromFile('ModalRegistroNovedad')
      .setWidth(600)
      .setHeight(650)
      .setTitle('Registrar Entrega / Novedad');
    SpreadsheetApp.getUi().showModalDialog(html, 'Registro de Novedad');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

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

// --- FUNCIÓN PARA PROCESAR LA SUBIDA DEL DOCUMENTO (CENTRALIZADA) ---

/**
 * Procesa la subida de un documento desde el modal centralizado.
 * Soporta dos tipos de documentos: Orden de Acondicionamiento y Registro de Inspeccion Base.
 * @param {string} base64Data - Datos del archivo en base64
 * @param {string} mimeType - Tipo MIME del archivo
 * @param {string} fileName - Nombre original del archivo
 * @param {string} referenceNo - Número de referencia (NoOrden o NoAnalisis)
 * @param {string} docType - Tipo de documento ("Orden de Acondicionamiento" o "Registro de Inspeccion Base")
 * @param {boolean} overwriteConfirmed - Indica si el usuario confirmó la sobrescritura del archivo existente
 * @returns {Object} Resultado de la operación
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

// --- WRAPPERS PARA google.script.run (desde Index.html) ---

function saveFinalUnifiedPDFForUser(base64Data, orderNo, userId) {
  if (!isUserAuthorized(userId)) throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + userId + '.');
  return saveFinalUnifiedPDF(base64Data, orderNo);
}

function finalizeFinalPdfForUser(orderNo, fileId, archivoReemplazado, userId) {
  if (!isUserAuthorized(userId)) throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + userId + '.');
  return finalizeFinalPdfPostSave(orderNo, fileId, archivoReemplazado, userId);
}

function updateTraceabilityForUser(orderNo, userId, pagesPrinted, printType) {
  if (!isUserAuthorized(userId)) throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + userId + '.');
  return internalUpdateTraceability(orderNo, userId, pagesPrinted, printType);
}

// --- FUNCIÓN PARA GUARDAR PDF UNIFICADO FINAL ---

/**
 * Guarda el PDF unificado final en la carpeta DOC_COMPLETO.
 * @param {string} base64Data - Datos del PDF en base64
 * @param {string} orderNo - Número de orden
 * @returns {string} URL de visualización directa del PDF
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

// --- FUNCIÓN doGet PARA SERVIR VISOR PDF ---

/**
 * Maneja las solicitudes GET a la Web App.
 * @param {Object} e - Objeto de evento
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

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

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

/**
 * Obtiene la URL de la Web App actual.
 * Esta función debe ejecutarse en el contexto del propietario para obtener la URL correcta.
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

