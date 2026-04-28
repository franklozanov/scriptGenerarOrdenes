// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

// URL de Cloud Function para compresión de PDFs (configurar después del despliegue)
var CLOUD_FUNCTION_URL = PropertiesService.getScriptProperties().getProperty('CLOUD_FUNCTION_URL') || '';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🖨️ Impresión')
    .addItem('Imprimir Plantillas', 'openPrintDialog')
    .addSeparator()
    .addItem('🔍 Diagnosticar Plantillas', 'diagnosticarPlantillas')
    .addSeparator()
    .addItem('🔒 Bloquear Hojas (Admin)', 'promptLock')
    .addItem('🔓 Desbloquear Hojas (Admin)', 'promptUnlock')
    .addItem('⚙️ Configurar Proxy (Admin)', 'promptSetWebAppUrl')
    .addItem('☁️ Configurar Cloud Function (Admin)', 'promptSetCloudFunctionUrl')
    .addToUi();
}

function openPrintDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(500).setHeight(650).setTitle('Panel de Impresión');
  SpreadsheetApp.getUi().showModalDialog(html, 'Panel de Impresión');
}

// --- SISTEMA DE SEGURIDAD Y BLOQUEO ---

function withAdminAuth(title, action) {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(title, 'Ingrese la contraseña de administrador:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.OK) {
    if (response.getResponseText() === ADMIN_PASS) {
      action(ui);
    } else {
      ui.alert('❌ Contraseña incorrecta.');
    }
  }
}

function promptLock() {
  withAdminAuth('Bloquear Sistema', function(ui) {
    lockRanges();
    ui.alert('✅ Sistema protegido. Las hojas Usuarios, templates y el rango I:T (excepto K) de Ordenes han sido bloqueados.');
  });
}

function promptUnlock() {
  withAdminAuth('Desbloquear Sistema', function(ui) {
    unlockRanges();
    ui.alert('✅ Sistema desbloqueado. Ahora es posible editar manualmente las hojas restringidas.');
  });
}

function promptSetWebAppUrl() {
  withAdminAuth('Configurar Proxy (Admin)', function(ui) {
    var urlResponse = ui.prompt('URL de Web App', 'Pegue la URL de la Web App desplegada (ejecutar como "Yo"):', ui.ButtonSet.OK_CANCEL);
    if (urlResponse.getSelectedButton() == ui.Button.OK) {
      PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', urlResponse.getResponseText().trim());
      ui.alert('✅ URL configurada. La app ahora inyectará datos silenciosamente usando privilegios elevados.');
    }
  });
}

function lockRanges() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Bloquear Usuarios completa
  var sheetUsuarios = ss.getSheetByName('Usuarios');
  if (sheetUsuarios) {
    var p1 = sheetUsuarios.protect().setDescription('Bloqueo_Usuarios');
    p1.removeEditors(p1.getEditors());
    if (p1.canDomainEdit()) p1.setDomainEdit(false);
  }

  // 2. Bloquear templates completa
  var sheetTemplates = ss.getSheetByName('templates');
  if (sheetTemplates) {
    var p2 = sheetTemplates.protect().setDescription('Bloqueo_Templates');
    p2.removeEditors(p2.getEditors());
    if (p2.canDomainEdit()) p2.setDomainEdit(false);
  }

  // 3. Bloquear rango I:T en Ordenes excepto columna K (edición libre)
  var sheetOrdenes = ss.getSheetByName('Ordenes');
  if (sheetOrdenes) {
    var p3 = sheetOrdenes.getRange('I:T').protect().setDescription('Bloqueo_Ordenes_IT');
    p3.setUnprotectedRanges([sheetOrdenes.getRange('K:K')]);
    p3.removeEditors(p3.getEditors());
    if (p3.canDomainEdit()) p3.setDomainEdit(false);
  }
}

function unlockRanges() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var protections = ss.getProtections(SpreadsheetApp.ProtectionType.SHEET)
                      .concat(ss.getProtections(SpreadsheetApp.ProtectionType.RANGE));
                      
  for (var i = 0; i < protections.length; i++) {
    var desc = protections[i].getDescription();
    if (desc === 'Bloqueo_Usuarios' || desc === 'Bloqueo_Templates' || desc === 'Bloqueo_Ordenes_IT' || desc === 'Bloqueo_Ordenes_IS') {
      protections[i].remove();
    }
  }
}


// --- PROTECCIÓN AUTOMÁTICA CONTRA EDICIÓN MANUAL ---

function onEdit(e) {
  if (!e) return;
  
  var user = Session.getActiveUser().getEmail();
  var effectiveUser = Session.getEffectiveUser().getEmail();
  
  // Si el usuario que edita es el efectivo (admin/Web App), permitir
  if (user === effectiveUser) return;
  
  var editedRange = e.range;
  var sheet = editedRange.getSheet();
  
  // Obtener protecciones de hoja y rango
  var sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var rangeProtections = editedRange.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  
  var allProtections = sheetProtections.concat(rangeProtections);
  var shouldRevert = false;
  var protectionDesc = "";
  
  // Verificar si el usuario puede editar según las protecciones reales
  for (var i = 0; i < allProtections.length; i++) {
    var protection = allProtections[i];
    if (!protection.canEdit()) {
      shouldRevert = true;
      protectionDesc = protection.getDescription() || "protegido";
      break;
    }
  }
  
  if (shouldRevert) {
    // Revertir al valor anterior
    editedRange.setValue(e.oldValue !== undefined ? e.oldValue : "");
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Este rango está protegido (" + protectionDesc + "). Cambio revertido.",
      "⚠️ Edición no permitida",
      5
    );
  }
}

// --- LÓGICA PRINCIPAL DE IMPRESIÓN ---

function getInitialData() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('initialData_v1');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {
        Logger.log("Error parsing cached data: " + e.message);
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
  
    var users = [];
    var userSheet = ss.getSheetByName('Usuarios');
    if (!userSheet) {
      throw new Error("La hoja 'Usuarios' no existe en el documento.");
    }
    
    try {
      var userData = userSheet.getDataRange().getValues();
      if (userData.length >= 2) {
        var colNombre = 0;
        for (var i = 0; i < userData[0].length; i++) {
          if (userData[0][i].toString().trim().toLowerCase() === "nombre") { colNombre = i; break; }
        }
        for (var j = 1; j < userData.length; j++) {
          if (userData[j][colNombre]) users.push(userData[j][colNombre].toString().trim());
        }
      }
    } catch (e) {
      Logger.log("Error reading Usuarios sheet: " + e.message);
      throw new Error("Error al leer la hoja 'Usuarios': " + e.message);
    }

    var templates = [];
    var tplSheet = ss.getSheetByName('templates');
    if (!tplSheet) {
      throw new Error("La hoja 'templates' no existe en el documento.");
    }
    
    try {
      var tplData = tplSheet.getDataRange().getValues();
      var accessErrors = [];
      
      for (var k = 0; k < tplData.length; k++) {
        var key = tplData[k][0] ? tplData[k][0].toString().trim() : "";
        var value = tplData[k][1] ? tplData[k][1].toString().trim() : "";
      
        if (key && key !== "Clave" && key !== "ID_FOLDER" && key.indexOf("COORD_") === -1) {
          var displayName = key;
          var hasAccess = true;
          
          if (key === "TPL_ORDEN") displayName = "Orden (Dinámico)";
          else if (key === "DOC_ANALISIS") displayName = "Cert. Análisis (Dinámico)";
          else if (value) {
            try { 
              var file = DriveApp.getFileById(value);
              displayName = file.getName(); 
            } catch (e) { 
              Logger.log("ERROR: No se puede acceder al archivo de Drive para " + key);
              Logger.log("  - ID del archivo: " + value);
              Logger.log("  - Error: " + e.message);
              displayName = key + " (Sin acceso)";
              hasAccess = false;
              accessErrors.push({
                key: key,
                fileId: value,
                error: e.message
              });
            }
          }
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: hasAccess });
        }
      }
      
      // Si hay errores de acceso, registrarlos de forma visible
      if (accessErrors.length > 0) {
        Logger.log("⚠️ ADVERTENCIA: " + accessErrors.length + " plantilla(s) sin acceso:");
        accessErrors.forEach(function(err) {
          Logger.log("  - " + err.key + " (ID: " + err.fileId + ")");
        });
      }
    } catch (e) {
      Logger.log("Error reading templates sheet: " + e.message);
      throw new Error("Error al leer la hoja 'templates': " + e.message);
    }

    var result = { users: users, templates: templates };
    try { cache.put('initialData_v1', JSON.stringify(result), 600); } catch (e) {
      Logger.log("Error caching data: " + e.message);
    }
    return result;
    
  } catch (error) {
    Logger.log("CRITICAL ERROR in getInitialData: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    throw new Error("Error cargando datos iniciales: " + error.message);
  }
}

function clearInitialDataCache() {
  CacheService.getScriptCache().remove('initialData_v1');
}

// Función de diagnóstico para verificar el estado de las plantillas
function diagnosticarPlantillas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tplSheet = ss.getSheetByName('templates');
  if (!tplSheet) {
    SpreadsheetApp.getUi().alert('❌ Error: La hoja "templates" no existe.');
    return;
  }
  
  var tplData = tplSheet.getDataRange().getValues();
  var report = "📋 DIAGNÓSTICO DE PLANTILLAS\n\n";
  var errorCount = 0;
  var successCount = 0;
  var folderId = "";
  var folderAnalysisId = "";
  
  // Verificar carpetas dinámicas primero
  for (var i = 0; i < tplData.length; i++) {
    var k = tplData[i][0] ? tplData[i][0].toString().trim() : "";
    var v = tplData[i][1] ? tplData[i][1].toString().trim() : "";
    if (k === "ID_FOLDER") folderId = v;
    if (k === "DOC_ANALISIS") folderAnalysisId = v;
  }
  
  report += "CARPETAS DINÁMICAS:\n";
  
  // Verificar ID_FOLDER
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      report += "✓ ID_FOLDER → " + folder.getName() + "\n";
      successCount++;
    } catch (e) {
      report += "✗ ID_FOLDER → ERROR: " + e.message + "\n";
      report += "  ID: " + folderId + "\n";
      errorCount++;
    }
  } else {
    report += "⚠ ID_FOLDER → No configurado (requerido para TPL_ORDEN)\n";
    errorCount++;
  }
  
  // Verificar DOC_ANALISIS
  if (folderAnalysisId) {
    try {
      var aFolder = DriveApp.getFolderById(folderAnalysisId);
      report += "✓ DOC_ANALISIS (carpeta) → " + aFolder.getName() + "\n";
      successCount++;
    } catch (e) {
      report += "✗ DOC_ANALISIS (carpeta) → ERROR: " + e.message + "\n";
      report += "  ID: " + folderAnalysisId + "\n";
      errorCount++;
    }
  } else {
    report += "⚠ DOC_ANALISIS (carpeta) → No configurado\n";
  }
  
  report += "\nPLANTILLAS ESTÁTICAS:\n";
  
  for (var i = 0; i < tplData.length; i++) {
    var key = tplData[i][0] ? tplData[i][0].toString().trim() : "";
    var value = tplData[i][1] ? tplData[i][1].toString().trim() : "";
    
    if (key && key !== "Clave" && key !== "ID_FOLDER" && key !== "DOC_ANALISIS" && key.indexOf("COORD_") === -1) {
      if (key === "TPL_ORDEN") {
        report += "✓ " + key + " (Dinámico - depende de ID_FOLDER)\n";
      } else if (value) {
        try {
          var file = DriveApp.getFileById(value);
          report += "✓ " + key + " → " + file.getName() + "\n";
          successCount++;
        } catch (e) {
          report += "✗ " + key + " → ERROR: " + e.message + "\n";
          report += "  ID: " + value + "\n";
          errorCount++;
        }
      } else {
        report += "⚠ " + key + " → Sin ID configurado\n";
        errorCount++;
      }
    }
  }
  
  report += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  report += "✓ Accesibles: " + successCount + "\n";
  report += "✗ Con errores: " + errorCount + "\n";
  
  if (errorCount > 0) {
    report += "\n⚠️ ACCIÓN REQUERIDA:\n";
    report += "1. Verifique los IDs de las plantillas con error\n";
    report += "2. Asegúrese de que el script tenga permisos\n";
    report += "3. Consulte SOLUCION_PLANTILLAS.md para ayuda";
  }
  
  SpreadsheetApp.getUi().alert(report);
  Logger.log(report);
}

function preparePrintPayload(orderNo, templateConfig) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dataSheet = ss.getSheetByName('Ordenes');
  if (!dataSheet) throw new Error("Sheet 'Ordenes' not found.");
  var headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues()[0];
  
  var tplSheet = ss.getSheetByName('templates');
  var tplData = tplSheet.getDataRange().getValues();
  
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
  
  for (var i = 0; i < tplData.length; i++) {
    var k = tplData[i][0].toString().trim();
    var v = tplData[i][1] ? tplData[i][1].toString().trim() : "";
    if (k === "ID_FOLDER") folderId = v;
    if (k === "DOC_ANALISIS") folderAnalysisId = v;
    if (k === "COORD_FABRICANTE" && v) dynamicCoords["Fabricante"] = parseXY(v);
    if (k === "COORD_EXP" && v) dynamicCoords["Exp"] = parseXY(v);
    if (k === "COORD_NoANALISIS" && v) dynamicCoords["NoAnalisis"] = parseXY(v);
  }

  var colNoOrden = headers.indexOf("NoOrden") + 1;
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
    var hIdx = headers.indexOf(name);
    if (hIdx !== -1) {
      var val = targetRowData[hIdx];
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
  
  templateConfig.forEach(function(config) {
    var file;
    try {
      if (config.key === "TPL_ORDEN") {
        if (!folderId) {
          throw new Error("ID_FOLDER no está configurado en la hoja 'templates'. Configure el ID de la carpeta de órdenes.");
        }
        try {
          var folder = DriveApp.getFolderById(folderId);
          var files = folder.getFilesByName(orderNo + ".pdf");
          if (files.hasNext()) {
            file = files.next();
          } else {
            throw new Error("El archivo '" + orderNo + ".pdf' no existe en la carpeta configurada (ID: " + folderId + "). Verifique que el archivo existe y el nombre coincide exactamente.");
          }
        } catch (driveError) {
          if (driveError.message.indexOf("not found") !== -1 || driveError.message.indexOf("not exist") !== -1) {
            throw new Error("No se puede acceder a la carpeta ID_FOLDER (ID: " + folderId + "). Verifique que el ID es correcto y que el script tiene permisos de acceso.");
          }
          throw driveError;
        }
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
      } else {
        if (!config.fileId) {
          throw new Error("El ID del archivo no está configurado en la hoja 'templates'.");
        }
        file = DriveApp.getFileById(config.fileId);
      }
      pdfsToProcess.push({ key: config.key, base64: Utilities.base64Encode(file.getBlob().getBytes()), copies: config.copies });
    } catch (e) {
      Logger.log("ERROR en preparePrintPayload para " + config.key + ": " + e.message);
      throw new Error("Error cargando " + config.key + ": " + e.message);
    }
  });

  var finalPdfs = [];
  var pdfOrden = null, pdfAnalisis = null, pdfsOthers = [];

  for (var j = 0; j < pdfsToProcess.length; j++) {
    if (pdfsToProcess[j].key === "TPL_ORDEN") pdfOrden = pdfsToProcess[j];
    else if (pdfsToProcess[j].key === "DOC_ANALISIS") pdfAnalisis = pdfsToProcess[j];
    else pdfsOthers.push(pdfsToProcess[j]);
  }

  if (pdfOrden) finalPdfs.push(pdfOrden);
  if (pdfAnalisis) finalPdfs.push(pdfAnalisis);
  finalPdfs = finalPdfs.concat(pdfsOthers);

  return { formData: formData, pdfs: finalPdfs, coords: dynamicCoords };
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    if (params.action === 'updateTraceability') {
      var result = internalUpdateTraceability(params.orderNo, params.userName, params.pagesPrinted, params.printType);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: result })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Acción no reconocida' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateTraceability(orderNo, userName, pagesPrinted, printType) {
  var webAppUrl = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  if (!webAppUrl) throw new Error("El sistema no tiene configurada la WEB_APP_URL. Contacte al administrador.");
  
  var payload = { action: 'updateTraceability', orderNo: orderNo, userName: userName, pagesPrinted: pagesPrinted, printType: printType };
  var options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
  
  var response = UrlFetchApp.fetch(webAppUrl, options);
  var result = JSON.parse(response.getContentText());
  
  if (result.status === 'success') {
    return result.message;
  } else {
    throw new Error("Proxy Error: " + result.message);
  }
}

function internalUpdateTraceability(orderNo, userName, pagesPrinted, printType) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  if (!sheet) throw new Error("Sheet 'Ordenes' not found.");

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var cols = {
    NoOrden: headers.indexOf("NoOrden") + 1, STATUS: headers.indexOf("STATUS") + 1,
    NoPags: headers.indexOf("NoPags") + 1, Reimpresion: headers.indexOf("Reimpresion") + 1,
    TotalPags: headers.indexOf("TotalPags") + 1, ImpresoPor: headers.indexOf("ImpresoPor") + 1,
    ReimpresoPor: headers.indexOf("ReimpresoPor") + 1
  };

  for (var k in cols) if (cols[k] === 0) throw new Error("Column '" + k + "' missing.");

  var colNoOrdenData = sheet.getRange(1, cols.NoOrden, sheet.getLastRow(), 1).getValues();
  var rowIndex = -1;
  for (var i = 1; i < colNoOrdenData.length; i++) { if (colNoOrdenData[i][0] == orderNo) { rowIndex = i + 1; break; } }

  if (rowIndex === -1) throw new Error("Row lost during update.");

  var currentNoPags = Number(sheet.getRange(rowIndex, cols.NoPags).getValue()) || 0;
  var currentReimpresion = Number(sheet.getRange(rowIndex, cols.Reimpresion).getValue()) || 0;
  var newEntry = userName + " (" + pagesPrinted + ")";

  if (printType === "Reimpresion") {
    sheet.getRange(rowIndex, cols.STATUS).setValue("Reimpreso");
    sheet.getRange(rowIndex, cols.Reimpresion).setValue(currentReimpresion + pagesPrinted);
    var currentReimpresoPor = sheet.getRange(rowIndex, cols.ReimpresoPor).getValue() || "";
    sheet.getRange(rowIndex, cols.ReimpresoPor).setValue(currentReimpresoPor ? currentReimpresoPor + ", " + newEntry : newEntry); 
  } else {
    sheet.getRange(rowIndex, cols.STATUS).setValue("Impreso");
    sheet.getRange(rowIndex, cols.NoPags).setValue(currentNoPags + pagesPrinted);
    var currentImpresoPor = sheet.getRange(rowIndex, cols.ImpresoPor).getValue() || "";
    sheet.getRange(rowIndex, cols.ImpresoPor).setValue(currentImpresoPor ? currentImpresoPor + ", " + newEntry : newEntry); 
  }

  var finalNoPags = Number(sheet.getRange(rowIndex, cols.NoPags).getValue()) || 0;
  var finalReimpresion = Number(sheet.getRange(rowIndex, cols.Reimpresion).getValue()) || 0;
  sheet.getRange(rowIndex, cols.TotalPags).setValue(finalNoPags + finalReimpresion);

  return "Record updated successfully.";
}

// --- SISTEMA DE COMPRESIÓN DE PDFs ---

function promptSetCloudFunctionUrl() {
  withAdminAuth('Configurar Cloud Function (Admin)', function(ui) {
    var urlResponse = ui.prompt('URL de Cloud Function', 'Pegue la URL de la Cloud Function desplegada para compresión de PDFs:', ui.ButtonSet.OK_CANCEL);
    if (urlResponse.getSelectedButton() == ui.Button.OK) {
      var url = urlResponse.getResponseText().trim();
      PropertiesService.getScriptProperties().setProperty('CLOUD_FUNCTION_URL', url);
      ui.alert('✅ Cloud Function configurada. Los PDFs dinámicos se comprimirán automáticamente antes de procesarse.');
    }
  });
}

function compressPdfViaCloudFunction(base64Pdf, quality) {
  var cloudUrl = PropertiesService.getScriptProperties().getProperty('CLOUD_FUNCTION_URL');
  
  if (!cloudUrl) {
    Logger.log('⚠️ Cloud Function no configurada. Usando PDF sin comprimir.');
    return { compressed_pdf: base64Pdf, skipped: true };
  }
  
  try {
    var payload = {
      pdf_base64: base64Pdf,
      quality: quality || 'ebook'
    };
    
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(cloudUrl, options);
    var result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && result.compressed_pdf) {
      Logger.log('✓ PDF comprimido: ' + result.original_size_kb + 'KB → ' + result.compressed_size_kb + 'KB (' + result.reduction_percent + '% reducción)');
      return result;
    } else {
      Logger.log('⚠️ Error en compresión: ' + (result.error || 'Unknown error'));
      return { compressed_pdf: base64Pdf, skipped: true };
    }
  } catch (e) {
    Logger.log('⚠️ Error llamando Cloud Function: ' + e.message);
    return { compressed_pdf: base64Pdf, skipped: true };
  }
}