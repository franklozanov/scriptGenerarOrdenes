// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🖨️ Impresión')
    .addItem('Imprimir Plantillas', 'openPrintDialog')
    .addSeparator()
    .addItem('🔒 Bloquear Hojas (Admin)', 'promptLock')
    .addItem('🔓 Desbloquear Hojas (Admin)', 'promptUnlock')
    .addItem('⚙️ Configurar Proxy (Admin)', 'promptSetWebAppUrl')
    .addToUi();
}

function openPrintDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(500).setHeight(650).setTitle('Panel de Impresión');
  SpreadsheetApp.getUi().showModalDialog(html, 'Panel de Impresión');
}

// --- SISTEMA DE SEGURIDAD Y BLOQUEO ---

function promptLock() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Bloquear Sistema', 'Ingrese la contraseña de administrador:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.OK) {
    if (response.getResponseText() === ADMIN_PASS) {
      lockRanges();
      ui.alert('✅ Sistema protegido. Las hojas Usuarios, templates y el rango I:T (excepto K) de Ordenes han sido bloqueados.');
    } else {
      ui.alert('❌ Contraseña incorrecta.');
    }
  }
}

function promptUnlock() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Desbloquear Sistema', 'Ingrese la contraseña de administrador:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.OK) {
    if (response.getResponseText() === ADMIN_PASS) {
      unlockRanges();
      ui.alert('✅ Sistema desbloqueado. Ahora es posible editar manualmente las hojas restringidas.');
    } else {
      ui.alert('❌ Contraseña incorrecta.');
    }
  }
}

function promptSetWebAppUrl() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Configurar Proxy (Admin)', 'Ingrese la contraseña de administrador:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.OK) {
    if (response.getResponseText() === ADMIN_PASS) {
      var urlResponse = ui.prompt('URL de Web App', 'Pegue la URL de la Web App desplegada (ejecutar como "Yo"):', ui.ButtonSet.OK_CANCEL);
      if (urlResponse.getSelectedButton() == ui.Button.OK) {
        PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', urlResponse.getResponseText().trim());
        ui.alert('✅ URL configurada. La app ahora inyectará datos silenciosamente usando privilegios elevados.');
      }
    } else {
      ui.alert('❌ Contraseña incorrecta.');
    }
  }
}

function lockRanges() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var me = Session.getEffectiveUser();

  // 1. Bloquear Usuarios completa
  var sheetUsuarios = ss.getSheetByName('Usuarios');
  if (sheetUsuarios) {
    var p1 = sheetUsuarios.protect().setDescription('Bloqueo_Usuarios');
    p1.removeEditors(p1.getEditors());
    try { p1.addEditor(me); } catch (e) {}
    if (p1.canDomainEdit()) p1.setDomainEdit(false);
  }

  // 2. Bloquear templates completa
  var sheetTemplates = ss.getSheetByName('templates');
  if (sheetTemplates) {
    var p2 = sheetTemplates.protect().setDescription('Bloqueo_Templates');
    p2.removeEditors(p2.getEditors());
    try { p2.addEditor(me); } catch (e) {}
    if (p2.canDomainEdit()) p2.setDomainEdit(false);
  }

  // 3. Bloquear rango I:T en Ordenes excepto columna K (edición libre)
  var sheetOrdenes = ss.getSheetByName('Ordenes');
  if (sheetOrdenes) {
    var p3 = sheetOrdenes.getRange('I:T').protect().setDescription('Bloqueo_Ordenes_IT');
    p3.setUnprotectedRanges([sheetOrdenes.getRange('K:K')]);
    p3.removeEditors(p3.getEditors());
    try { p3.addEditor(me); } catch (e) {}
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


// --- LÓGICA PRINCIPAL DE IMPRESIÓN ---

function getInitialData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('initialData_v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var users = [];
  var userSheet = ss.getSheetByName('Usuarios');
  if (userSheet) {
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
  }

  var templates = [];
  var tplSheet = ss.getSheetByName('templates');
  if (tplSheet) {
    var tplData = tplSheet.getDataRange().getValues();
    for (var k = 0; k < tplData.length; k++) {
      var key = tplData[k][0].toString().trim();
      var value = tplData[k][1] ? tplData[k][1].toString().trim() : "";
      
      if (key && key !== "Clave" && key !== "ID_FOLDER" && key.indexOf("COORD_") === -1) {
        var displayName = key;
        if (key === "TPL_ORDEN") displayName = "Orden (Dinámico)";
        else if (key === "DOC_ANALISIS") displayName = "Cert. Análisis (Dinámico)";
        else if (value) {
          try { displayName = DriveApp.getFileById(value).getName(); } 
          catch (e) { displayName = key; }
        }
        templates.push({ key: key, fileId: value, name: displayName });
      }
    }
  }

  var result = { users: users, templates: templates };
  try { cache.put('initialData_v1', JSON.stringify(result), 600); } catch (e) {}
  return result;
}

function clearInitialDataCache() {
  CacheService.getScriptCache().remove('initialData_v1');
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
        if (!folderId) throw new Error("ID_FOLDER missing.");
        var files = DriveApp.getFolderById(folderId).getFilesByName(orderNo + ".pdf");
        if (files.hasNext()) file = files.next();
        else throw new Error("File " + orderNo + ".pdf not found.");
      } else if (config.key === "DOC_ANALISIS") {
        if (!folderAnalysisId || !noAnalisisStr) throw new Error("DOC_ANALISIS config or NoAnalisis missing.");
        var aQuery = "title contains '" + noAnalisisStr + "' and mimeType = 'application/pdf' and trashed = false";
        var aFiles = DriveApp.getFolderById(folderAnalysisId).searchFiles(aQuery);
        while (aFiles.hasNext()) {
          var candidate = aFiles.next();
          if (candidate.getName().indexOf(noAnalisisStr) === 0) { file = candidate; break; }
        }
        if (!file) throw new Error("Analysis PDF starting with " + noAnalisisStr + ".pdf not found.");
      } else {
        if (!config.fileId) throw new Error("File ID missing.");
        file = DriveApp.getFileById(config.fileId);
      }
      pdfsToProcess.push({ key: config.key, base64: Utilities.base64Encode(file.getBlob().getBytes()), copies: config.copies });
    } catch (e) {
      throw new Error("Error loading " + config.key + ": " + e.message);
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