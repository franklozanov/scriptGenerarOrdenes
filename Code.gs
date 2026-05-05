// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

function onOpen() {
  var adminMenu = SpreadsheetApp.getUi().createMenu('🔒 Opciones Admin')
    .addItem('⚙️ Configurar Proxy', 'promptSetWebAppUrl')
    .addItem('🔧 Inicializar App', 'promptInitializeApp')
    .addItem('🛡️ Aplicar Nuevo Esquema de Protección', 'promptApplyNewProtection')
    .addItem('▶️ Activar Auditoría', 'promptSetupAuditTrail');

  SpreadsheetApp.getUi().createMenu('🖨️ Impresión')
    .addItem('Imprimir Plantillas', 'openPrintDialog')
    .addSeparator()
    .addItem('🔄 Actualizar Celdas de Subida', 'actualizarCeldasDeSubida')
    .addItem('🧹 Limpiar Botones Residuales', 'limpiarBotonesResiduales')
    .addItem('🔍 Diagnosticar Celdas de Subida', 'diagnosticarCeldasDeSubida')
    .addSeparator()
    .addItem(' Diagnosticar Plantillas', 'diagnosticarPlantillas')
    .addSeparator()
    .addSubMenu(adminMenu)
    .addToUi();
  
  // Clear cache to ensure fresh NombreTemplate data is loaded
  clearInitialDataCache();
  
  // Cache warmup: preload data silently to improve performance
  try {
    getInitialData();
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Plantillas estáticas listas para impresión.', 'Sistema QMS', 5);
  } catch (e) {
    Logger.log("Error en warmup de caché: " + e.message);
  }
}

function openPrintDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Index')
    .setWidth(550).setHeight(700).setTitle('Panel de Impresión');
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


function promptSetWebAppUrl() {
  withAdminAuth('Configurar Proxy (Admin)', function(ui) {
    var urlResponse = ui.prompt('URL de Web App', 'Pegue la URL de la Web App desplegada (ejecutar como "Yo"):', ui.ButtonSet.OK_CANCEL);
    if (urlResponse.getSelectedButton() == ui.Button.OK) {
      PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', urlResponse.getResponseText().trim());
      ui.alert('✅ URL configurada. La app ahora inyectará datos silenciosamente usando privilegios elevados.');
    }
  });
}

function promptInitializeApp() {
  withAdminAuth('Inicializar App (Admin)', function(ui) {
    initializeApp(ui);
  });
}



// --- PROTECCIÓN AUTOMÁTICA CONTRA EDICIÓN MANUAL ---
// NOTA: Esta función simple onEdit(e) será migrada a un disparador instalable onEditInstalled en Fase 2
// Se mantiene comentada como referencia durante la transición

/*
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
*/

// --- LÓGICA PRINCIPAL DE IMPRESIÓN ---

function getInitialData() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('initialData_v1');
    if (cached) {
      try { 
        var parsedData = JSON.parse(cached); 
        var staticTemplates = ["TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES"];
        for (var i = 0; i < parsedData.templates.length; i++) {
          var t = parsedData.templates[i];
          if (staticTemplates.indexOf(t.key) !== -1 && t.fileId && t.hasAccess) {
            var file = DriveApp.getFileById(t.fileId);
            t.base64 = Utilities.base64Encode(file.getBlob().getBytes());
          } else {
            t.base64 = null;
          }
        }
        return parsedData; 
      } catch (e) {
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
        var colNombreCorto = 2; // Índice por defecto según estructura ['UserID', 'Nombre Completo', 'NombreCorto', 'Email']
        for (var i = 0; i < userData[0].length; i++) {
          var headerValue = userData[0][i].toString().trim().toLowerCase();
          if (headerValue === "nombrecorto") { colNombreCorto = i; break; }
        }
        for (var j = 1; j < userData.length; j++) {
          var userId = userData[j][0] ? userData[j][0].toString().trim() : "N/A";
          var nombreCompleto = userData[j][1] ? userData[j][1].toString().trim() : "N/A";
          var nombreCorto = userData[j][colNombreCorto] ? userData[j][colNombreCorto].toString().trim() : "N/A";
          users.push(userId + " - " + nombreCompleto);
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
      
      // Find column index for "NombreTemplate" if it exists
      var colNombreTemplate = -1;
      if (tplData.length > 0) {
        for (var i = 0; i < tplData[0].length; i++) {
          if (tplData[0][i].toString().trim().toLowerCase() === "nombretemplate") {
            colNombreTemplate = i;
            break;
          }
        }
      }
      
      // Static templates to preload
      var staticTemplates = ["TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES"];
      
      for (var k = 1; k < tplData.length; k++) {
        var key = tplData[k][0] ? tplData[k][0].toString().trim() : "";
        var value = tplData[k][1] ? tplData[k][1].toString().trim() : "";
      
        if (key && key !== "Clave" && key !== "ID_FOLDER" && key !== "DOC_ANALISIS" && key.indexOf("COORD_") === -1) {
          var displayName = key;
          var hasAccess = true;
          var base64 = null;
          
          // Try to get name from NombreTemplate column first (highest priority)
          if (colNombreTemplate !== -1 && k > 0 && tplData[k][colNombreTemplate]) {
            var nombreTemplateValue = tplData[k][colNombreTemplate].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          // Fallback to hardcoded names if NombreTemplate is empty or doesn't exist
          if (displayName === key) {
            if (key === "TPL_ORDEN") displayName = "Orden (Dinámico)";
            else if (key === "DOC_ANALISIS") displayName = "Cert. Análisis (Dinámico)";
          }
          
          if (value) {
            try { 
              var file = DriveApp.getFileById(value);
              // If displayName is still the key, use file name as final fallback
              if (displayName === key) {
                displayName = file.getName();
              }
              
              // Preload base64 for static templates
              if (staticTemplates.indexOf(key) !== -1) {
                base64 = Utilities.base64Encode(file.getBlob().getBytes());
                Logger.log("✓ Precargando base64 para " + key);
              }
            } catch (e) { 
              Logger.log("ERROR: No se puede acceder al archivo de Drive para " + key);
              Logger.log("  - ID del archivo: " + value);
              Logger.log("  - Error: " + e.message);
              
              // For static templates, do NOT set hasAccess = false since base64 is handled separately
              if (staticTemplates.indexOf(key) === -1) {
                // Only mark as no access for dynamic templates
                displayName = displayName + " (Sin acceso)";
                hasAccess = false;
                accessErrors.push({
                  key: key,
                  fileId: value,
                  error: e.message
                });
              } else {
                // Static templates: log error but keep hasAccess = true
                Logger.log("  - Plantilla estática, manteniendo hasAccess = true");
              }
            }
          }
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: hasAccess, base64: base64 });
        }
        
        // Handle DOC_ANALISIS separately - it's a folder ID, not a file ID
        if (key === "DOC_ANALISIS") {
          var displayName = "Cert. Análisis (Dinámico)";
          
          // Try to get name from NombreTemplate column first
          if (colNombreTemplate !== -1 && k > 0 && tplData[k][colNombreTemplate]) {
            var nombreTemplateValue = tplData[k][colNombreTemplate].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: true, base64: null });
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
    
    // Force hardcoded sort order for templates
    const sortOrder = ["TPL_ORDEN", "DOC_ANALISIS", "TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_CONTROLES", "TPL_INSPECCION", "TPL_COC"];
    templates.sort(function(a, b) {
      var indexA = sortOrder.indexOf(a.key);
      var indexB = sortOrder.indexOf(b.key);
      // If both are in sortOrder, compare their indices
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // If only A is in sortOrder, it comes first
      if (indexA !== -1) {
        return -1;
      }
      // If only B is in sortOrder, it comes first
      if (indexB !== -1) {
        return 1;
      }
      // If neither is in sortOrder, keep original order
      return 0;
    });
    
    // Clonar templates sin base64 para no exceder el límite de 100KB de CacheService
    var dataToCache = { users: users, templates: [] };
    for (var idx = 0; idx < templates.length; idx++) {
      var t = templates[idx];
      dataToCache.templates.push({ key: t.key, fileId: t.fileId, name: t.name, hasAccess: t.hasAccess });
    }
    
    try { cache.put('initialData_v1', JSON.stringify(dataToCache), 600); } catch (e) {
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
  for (var i = 1; i < tplData.length; i++) {
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
  
  for (var i = 1; i < tplData.length; i++) {
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

function fetchOrderData(orderNo) {
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
  
  for (var i = 1; i < tplData.length; i++) {
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

  // Fetch only dynamic templates (TPL_ORDEN and DOC_ANALISIS)
  var dynamicPdfs = [];
  
  // Try to fetch TPL_ORDEN
  try {
    if (folderId) {
      var folder = DriveApp.getFolderById(folderId);
      var files = folder.getFilesByName(orderNo + ".pdf");
      if (files.hasNext()) {
        var file = files.next();
        dynamicPdfs.push({ key: "TPL_ORDEN", base64: Utilities.base64Encode(file.getBlob().getBytes()) });
        Logger.log("✓ Precargado TPL_ORDEN para orden " + orderNo);
      } else {
        Logger.log("⚠️ No se encontró TPL_ORDEN para orden " + orderNo);
      }
    }
  } catch (e) {
    Logger.log("Error fetching TPL_ORDEN: " + e.message);
  }
  
  // Try to fetch DOC_ANALISIS
  try {
    if (folderAnalysisId && noAnalisisStr) {
      var aFolder = DriveApp.getFolderById(folderAnalysisId);
      var aQuery = "title contains '" + noAnalisisStr + "' and mimeType = 'application/pdf' and trashed = false";
      var aFiles = aFolder.searchFiles(aQuery);
      while (aFiles.hasNext()) {
        var candidate = aFiles.next();
        if (candidate.getName().indexOf(noAnalisisStr) === 0) {
          dynamicPdfs.push({ key: "DOC_ANALISIS", base64: Utilities.base64Encode(candidate.getBlob().getBytes()) });
          Logger.log("✓ Precargado DOC_ANALISIS para orden " + orderNo);
          break;
        }
      }
      if (dynamicPdfs.filter(p => p.key === "DOC_ANALISIS").length === 0) {
        Logger.log("⚠️ No se encontró DOC_ANALISIS para orden " + orderNo);
      }
    }
  } catch (e) {
    Logger.log("Error fetching DOC_ANALISIS: " + e.message);
  }

  return { formData: formData, coords: dynamicCoords, pdfs: dynamicPdfs };
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
  
  for (var i = 1; i < tplData.length; i++) {
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
  
  // Only process dynamic templates (TPL_ORDEN and DOC_ANALISIS)
  // Static templates are already preloaded on the frontend
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

// --- FASE 1: INICIALIZACIÓN Y VALIDACIÓN DE ESTRUCTURA ---

// Estructura esperada del libro de trabajo
const REQUIRED_SHEETS = {
  'templates': ['Clave', 'Valor', 'NombreTemplate'],  // CORRECCIÓN: ID_FOLDER es valor de fila, no columna
  'Ordenes': ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden', 'Fabricante', 'AdjuntoOrden'],
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']
};

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
  var userEmail = Session.getActiveUser().getEmail();
  var user = getUserIdentityString(userEmail);
  var tipoCambio = "INICIALIZACION";
  var descripcion = "Inicialización de estructura del libro de trabajo";
  
  sheetLogs.appendRow([timestamp, user, tipoCambio, descripcion]);
  Logger.log("✓ Inicialización registrada en Logs");
}

// --- FASE 3: GESTIÓN DE PERMISOS Y PROTECCIÓN DE HOJAS ---

function removeLegacyProtections() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var protections = ss.getProtections(SpreadsheetApp.ProtectionType.SHEET)
                      .concat(ss.getProtections(SpreadsheetApp.ProtectionType.RANGE));
  
  var legacyDescriptions = ['Bloqueo_Usuarios', 'Bloqueo_Templates', 'Bloqueo_Ordenes_IT', 'Bloqueo_Ordenes_IS', 'Bloqueo_Ordenes_Dinamico'];
  
  for (var i = 0; i < protections.length; i++) {
    if (legacyDescriptions.indexOf(protections[i].getDescription()) !== -1) {
      protections[i].remove();
      Logger.log("✓ Eliminada protección legacy: " + protections[i].getDescription());
    }
  }
}

function applyNewProtectionScheme() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Primero eliminar protecciones legacy
  removeLegacyProtections();
  
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
  
  // Configurar protección mixta para Ordenes
  configureOrdenesProtection();
  
  // Configurar protección para Logs
  configureLogsProtection();
  
  Logger.log("✓ Nuevo esquema de protección aplicado");
}

function protectSheetFully(sheet, description) {
  var protection = sheet.protect().setDescription(description);
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  Logger.log("✓ Hoja protegida completamente: " + sheet.getName());
}

function configureOrdenesProtection() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetOrdenes = ss.getSheetByName('Ordenes');
  if (!sheetOrdenes) return;
  
  // Proteger hoja completa primero
  var protection = sheetOrdenes.protect().setDescription('Proteccion_Ordenes_Nuevo');
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  
  var headers = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
  var colsToProtect = [
    "VerifLote", "CantDispAFecha", "VerifCant. Disponible", "VerifExp", 
    "Fabricante", "Decision", "STATUS", "ImpresoPor", "NoPags", 
    "ReimpresoPor", "Reimpresion", "TotalPags"
  ];
  
  var unprotectedRanges = [];
  var lastRow = sheetOrdenes.getLastRow();
  if (lastRow < 1) lastRow = 1;
  
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i] ? headers[i].toString().trim() : "";
    if (colsToProtect.indexOf(header) === -1) {
      unprotectedRanges.push(sheetOrdenes.getRange(1, i + 1, lastRow, 1));
    }
  }
  
  if (unprotectedRanges.length > 0) {
    protection.setUnprotectedRanges(unprotectedRanges);
  }
  
  Logger.log("✓ Protección mixta configurada para Ordenes (basada en encabezados dinámicos)");
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
  var ownerEmail = Session.getActiveUser().getEmail();
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

// --- FASE 2: SISTEMA DE TRAZABILIDAD (AUDIT TRAIL) ---

function setupAuditTrailTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Verificar si el disparador ya existe
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditInstalled') {
      Logger.log("⚠️ Disparador onEditInstalled ya existe");
      return;
    }
  }
  
  // Crear el disparador instalable
  ScriptApp.newTrigger('onEditInstalled')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  
  Logger.log("✓ Disparador onEditInstalled creado");
}

function onEditInstalled(e) {
  Logger.log("onEditInstalled Trigger ejecutado. Fuente: " + e.source.getActiveSheet().getName() + ", Rango: " + e.range.getA1Notation());
  
  // Guard clause: ignorar ediciones en hoja Logs para evitar bucles infinitos
  if (e.source.getActiveSheet().getName() === 'Logs') return;
  
  var user = Session.getActiveUser().getEmail();
  var effectiveUser = Session.getEffectiveUser().getEmail();
  
  var editedRange = e.range;
  var sheet = editedRange.getSheet();
  var sheetName = sheet.getName();
  
  // Verificar permisos de edición (lógica migrada de onEdit original)
  var sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var rangeProtections = editedRange.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  var allProtections = sheetProtections.concat(rangeProtections);
  var hasPermission = true;
  var protectionDesc = "";
  
  for (var i = 0; i < allProtections.length; i++) {
    var protection = allProtections[i];
    if (!protection.canEdit()) {
      hasPermission = false;
      protectionDesc = protection.getDescription() || "protegido";
      break;
    }
  }
  
  var userEmail = getUserEmail(e);
  var userIdentity = getUserIdentityString(userEmail);
  
  if (!hasPermission) {
    // Revertir al valor anterior
    editedRange.setValue(e.oldValue !== undefined ? e.oldValue : "");
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Este rango está protegido (" + protectionDesc + "). Cambio revertido.",
      "⚠️ Edición no permitida",
      5
    );
    
    // Registrar violación de permiso
    var cellAddress = editedRange.getA1Notation();
    var violationDesc = "Intento de edición denegado al usuario " + userEmail + " en la celda " + cellAddress + " de la hoja " + sheetName;
    logChange('VIOLACION_PERMISO', violationDesc, userIdentity);
    return;
  }
  
  // Usuario tiene permiso, obtener dimensiones de edición
  var numRows = editedRange.getNumRows();
  var numCols = editedRange.getNumColumns();

  // Lógica de detección de cambio de NoOrden en filas ya cargadas
  if (sheetName === 'Ordenes' && numRows === 1 && numCols === 1) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
    var colOrdenIdx = headers.indexOf('NoOrden') + 1;

    // Si se editó la columna NoOrden
    if (colOrdenIdx > 0 && editedRange.getColumn() === colOrdenIdx) {
      var rowIdx = editedRange.getRow();
      var adjuntoValue = sheet.getRange(rowIdx, colAdjuntoIdx).getValue();
      var adjuntoStr = adjuntoValue ? adjuntoValue.toString().trim() : "";
      
      // Si la fila ya tiene archivo cargado
      if (adjuntoStr.indexOf("Cargado") !== -1 || adjuntoStr.indexOf("✅") !== -1) {
        var nuevoValor = e.value !== undefined ? e.value : "(vacío)";
        var valorAnterior = e.oldValue !== undefined ? e.oldValue : "(vacío)";
        
        // Alertar al usuario
        var ui = SpreadsheetApp.getUi();
        var response = ui.alert(
          '⚠️ Cambio de NoOrden en fila con archivo cargado',
          'El número de orden cambió de "' + valorAnterior + '" a "' + nuevoValor + '".\n\n' +
          '¿Desea volver a cargar el archivo para la nueva orden o mantener el archivo existente?',
          ui.ButtonSet.YES_NO
        );
        
        if (response === ui.Button.YES) {
          // Usuario quiere volver a cargar: resetear estado
          sheet.getRange(rowIdx, colAdjuntoIdx).setValue("⬆️ Subir Archivo");
          logChange('RESET_CARGA', 'NoOrden cambiado de ' + valorAnterior + ' a ' + nuevoValor + '. Estado reseteado para nueva carga.', userIdentity);
          SpreadsheetApp.getActiveSpreadsheet().toast("Estado reseteado. Suba el nuevo archivo.", "Info", 5);
        } else {
          // Usuario quiere mantener: no hacer nada adicional
          logChange('MANTENER_CARGA', 'NoOrden cambiado de ' + valorAnterior + ' a ' + nuevoValor + '. Se mantiene archivo existente.', userIdentity);
          SpreadsheetApp.getActiveSpreadsheet().toast("Archivo existente mantenido.", "Info", 5);
        }
        return; // No continuar con el log normal de edición
      }
    }
  }
  
  // Registrar la edición válida
  
  if (numRows === 1 && numCols === 1) {
    // Edición de celda única
    var oldValue = e.oldValue !== undefined ? e.oldValue : "(vacío)";
    var newValue = e.value !== undefined ? e.value : "(vacío)";
    var cellAddress = editedRange.getA1Notation();
    var editDesc = "Cambió '" + oldValue + "' por '" + newValue + "' en la celda " + cellAddress + " de la hoja " + sheetName;
    logChange('EDICION_CELDA', editDesc, userIdentity);
  } else {
    // Edición masiva (multi-celda)
    var rangeA1 = editedRange.getA1Notation();
    var massEditDesc = "Edición masiva en el rango " + rangeA1 + " de la hoja " + sheetName;
    logChange('EDICION_MASIVA', massEditDesc, userIdentity);
  }
}

function getUserEmail(e) {
  var email = Session.getActiveUser().getEmail();
  if (!email || email === "") {
    email = e.user.email; // Intentar del evento
  }
  if (!email || email === "") {
    email = "Usuario no identificado (requiere dominio corporativo para CFR21 Part 11)";
  }
  return email;
}

function getUserIdentityString(email) {
  if (!email || email.indexOf("Usuario no identificado") !== -1) return email;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return email; // Fallback
  
  var data = sheet.getDataRange().getValues();
  // Iterar saltando el encabezado (fila 1 / índice 0)
  for (var i = 1; i < data.length; i++) {
    if (data[i][3] && data[i][3].toString().trim().toLowerCase() === email.toLowerCase()) {
      return (data[i][0] || "N/A") + " - " + (data[i][2] || "N/A");
    }
  }
  return email; // Fallback si el correo no está en la tabla
}

function logChange(tipoCambio, descripcion, userIdentity) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');
  
  if (!sheetLogs) {
    Logger.log("⚠️ Hoja Logs no existe. Creando hoja Logs.");
    sheetLogs = ss.insertSheet('Logs');
    sheetLogs.getRange(1, 1, 1, 4).setValues([['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']]);
  }
  
  var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var user = userIdentity || Session.getActiveUser().getEmail(); // Usar parámetro con fallback adicional
  
  sheetLogs.appendRow([timestamp, user, tipoCambio, descripcion]);
  Logger.log("✓ " + tipoCambio + " registrado en Logs");
}

/**
 * Se ejecuta cuando el usuario cambia la selección en la hoja.
 * Detecta si se ha hecho clic en una celda de "Subir Archivo" para abrir el modal.
 * @param {Object} e El objeto de evento de onSelectionChange.
 */
function onSelectionChange(e) {
  // Salir si el evento no tiene rango (ej. al cargar la hoja)
  if (!e || !e.range) return;

  // Solo nos interesa la selección de una única celda
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

  var sheet = e.range.getSheet();
  // Solo actuar en la hoja 'Ordenes'
  if (sheet.getName() !== 'Ordenes') return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
  var colOrdenIdx = headers.indexOf('NoOrden') + 1;

  // Solo actuar si se selecciona la columna 'AdjuntoOrden' y la celda contiene el texto específico
  if (e.range.getColumn() === colAdjuntoIdx && e.range.getValue() === "⬆️ Subir Archivo") {
    var rowIdx = e.range.getRow();
    var noOrden = sheet.getRange(rowIdx, colOrdenIdx).getValue();
    if (noOrden) {
      abrirModalSubidaDocumento(rowIdx, noOrden.toString().trim());
    }
  }
}

// --- FUNCIÓN PARA ABRIR MODAL DE SUBIDA DE DOCUMENTO ---

function abrirModalSubidaDocumento(rowIdx, noOrden) {
  try {
    var html = HtmlService.createHtmlOutputFromFile('UploadModal')
      .setWidth(500)
      .setHeight(350)
      .setTitle('Subir Adjunto - Orden ' + noOrden);
    
    // Inyectar variables en el HTML
    html = html.setContent(html.getContent()
      .replace(/{{ROW_IDX}}/g, rowIdx)
      .replace(/{{NO_ORDEN}}/g, noOrden)
    );
    
    SpreadsheetApp.getUi().showModalDialog(html, 'Subir Adjunto - Orden ' + noOrden);
  } catch (e) {
    Logger.log("Error al abrir modal de subida: " + e.message);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error al abrir el modal de subida.", "Error", 5);
  }
}

// --- FUNCIONES PARA BOTONES DE SUBIDA DE DOCUMENTOS ---

function actualizarCeldasDeSubida() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ La hoja "Ordenes" no fue encontrada.');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
  var colOrdenIdx = headers.indexOf('NoOrden') + 1;

  if (colAdjuntoIdx === 0 || colOrdenIdx === 0) {
    SpreadsheetApp.getUi().alert('❌ No se encontraron las columnas "AdjuntoOrden" y/o "NoOrden".');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('ℹ️ No hay filas de datos para procesar.');
    return;
  }

  var celdasActualizadas = 0;
  var filasIgnoradas = 0;
  var filasSinOrden = 0;

  var range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  var values = range.getValues();

  // Recorrer los datos en memoria para eficiencia
  for (var i = 0; i < values.length; i++) {
    var row = i + 2; // El índice de la fila real en la hoja
    var adjuntoStr = values[i][colAdjuntoIdx - 1] ? values[i][colAdjuntoIdx - 1].toString().trim() : "";
    var noOrden = values[i][colOrdenIdx - 1];

    // Ignorar filas que ya tienen un archivo cargado
    if (adjuntoStr.startsWith("=HYPERLINK") || adjuntoStr.includes("Cargado")) {
      filasIgnoradas++;
      continue;
    }

    // Si la celda está vacía y hay un número de orden, prepararla para la subida.
    if (adjuntoStr === "" && noOrden) {
      sheet.getRange(row, colAdjuntoIdx).setValue("⬆️ Subir Archivo");
      celdasActualizadas++;
    } else if (!noOrden) {
      filasSinOrden++;
    }
  }

  var mensaje = "=== Actualización de Celdas de Subida ===\n\n";
  mensaje += "✅ Celdas configuradas para subida: " + celdasActualizadas + "\n";
  mensaje += "⏭️ Filas ignoradas (ya cargadas): " + filasIgnoradas + "\n";
  mensaje += "⚠️ Filas sin NoOrden (ignoradas): " + filasSinOrden + "\n\n";
  mensaje += "ℹ️ Para subir un archivo, simplemente haga clic en la celda '⬆️ Subir Archivo' correspondiente.";

  SpreadsheetApp.getUi().alert(mensaje);
}

/**
 * Elimina todas las imágenes/botones residuales de la columna AdjuntoOrden.
 * Esta función limpia artefactos de la implementación anterior con assignScript.
 */
function limpiarBotonesResiduales() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ La hoja "Ordenes" no fue encontrada.');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
  
  if (colAdjuntoIdx === 0) {
    SpreadsheetApp.getUi().alert('❌ No se encontró la columna "AdjuntoOrden".');
    return;
  }

  var images = sheet.getImages();
  var botonesEliminados = 0;
  var ubicacionesEliminadas = [];
  
  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    var imgCol = img.getAnchorCell().getColumn();
    var imgRow = img.getAnchorCell().getRow();
    // Eliminar únicamente imágenes en la columna AdjuntoOrden
    if (imgCol === colAdjuntoIdx) {
      img.remove();
      botonesEliminados++;
      ubicacionesEliminadas.push("Fila " + imgRow);
    }
  }

  var mensaje = "=== Limpieza de Botones Residuales ===\n\n";
  mensaje += "🗑️ Botones/imágenes eliminados: " + botonesEliminados + "\n";
  
  if (botonesEliminados > 0) {
    mensaje += "📍 Ubicaciones: " + ubicacionesEliminadas.join(", ") + "\n\n";
    mensaje += "✅ Se eliminaron los artefactos de la implementación anterior.\n";
    mensaje += "ℹ️ El nuevo sistema usa celdas con texto '⬆️ Subir Archivo'.";
  } else {
    mensaje += "ℹ️ No se encontraron botones residuales para eliminar.\n";
    mensaje += "ℹ️ El sistema está limpio y usa el nuevo enfoque de celdas.";
  }

  SpreadsheetApp.getUi().alert(mensaje);
  Logger.log("✅ Limpieza completada: " + botonesEliminados + " botones eliminados");
}

function diagnosticarCeldasDeSubida() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  
  var reporte = "=== DIAGNÓSTICO DE CELDAS DE SUBIDA ===\n\n";
  
  if (!sheet) {
    reporte += "❌ Hoja 'Ordenes' NO encontrada\n";
    SpreadsheetApp.getUi().alert(reporte);
    return;
  }
  reporte += "✅ Hoja 'Ordenes' encontrada\n";
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
  var colOrdenIdx = headers.indexOf('NoOrden') + 1;
  
  reporte += "📍 Columna 'AdjuntoOrden': " + (colAdjuntoIdx > 0 ? `✅ (Col ${colAdjuntoIdx})` : "❌ NO ENCONTRADA") + "\n";
  reporte += "📍 Columna 'NoOrden': " + (colOrdenIdx > 0 ? `✅ (Col ${colOrdenIdx})` : "❌ NO ENCONTRADA") + "\n\n";
  
  if (colAdjuntoIdx === 0 || colOrdenIdx === 0) {
    SpreadsheetApp.getUi().alert(reporte);
    return;
  }
  
  // Detectar imágenes residuales en columna AdjuntoOrden
  var images = sheet.getImages();
  var imagenesEnColumna = 0;
  var imagenesInfo = [];
  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    var imgCol = img.getAnchorCell().getColumn();
    var imgRow = img.getAnchorCell().getRow();
    if (imgCol === colAdjuntoIdx) {
      imagenesEnColumna++;
      imagenesInfo.push(`Fila ${imgRow}`);
    }
  }
  
  if (imagenesEnColumna > 0) {
    reporte += "⚠️ IMÁGENES RESIDUALES ENCONTRADAS:\n";
    reporte += `   - Total de imágenes en columna AdjuntoOrden: ${imagenesEnColumna}\n`;
    reporte += `   - Ubicaciones: ${imagenesInfo.join(", ")}\n`;
    reporte += "   - Estas imágenes son artefactos de la implementación anterior.\n";
    reporte += "   - Deben eliminarse ejecutando '🧹 Limpiar Botones Residuales'.\n\n";
  }
  
  var lastRow = sheet.getLastRow();
  reporte += `📊 Total de filas de datos: ${lastRow - 1}\n\n`;
  
  var filasPendientes = 0, filasCargadas = 0, filasVacias = 0, filasSinOrden = 0;
  
  for (var row = 2; row <= lastRow; row++) {
    var adjuntoValue = sheet.getRange(row, colAdjuntoIdx).getValue();
    var adjuntoStr = adjuntoValue ? adjuntoValue.toString().trim() : "";
    var noOrden = sheet.getRange(row, colOrdenIdx).getValue();
    
    if (!noOrden) {
      filasSinOrden++;
    } else if (adjuntoStr.startsWith("=HYPERLINK") || adjuntoStr.includes("Cargado")) {
      filasCargadas++;
    } else if (adjuntoStr === "⬆️ Subir Archivo") {
      filasPendientes++;
    } else if (adjuntoStr === "") {
      filasVacias++;
    }
  }
  
  reporte += `📈 Estado de filas:\n`;
  reporte += `   - ⬆️ Pendientes de subida: ${filasPendientes}\n`;
  reporte += `   - ✅ Ya cargadas: ${filasCargadas}\n`;
  reporte += `   - (Vacías): ${filasVacias}\n`;
  reporte += `   - ⚠️ Sin NoOrden: ${filasSinOrden}\n\n`;
  
  reporte += "💡 Recomendaciones:\n";
  if (imagenesEnColumna > 0) {
    reporte += "   - ⚠️ PRIORIDAD: Ejecutar '🧹 Limpiar Botones Residuales' para eliminar imágenes obsoletas.\n";
  }
  if (filasVacias > 0) {
    reporte += "   - Ejecutar '🔄 Actualizar Celdas de Subida' para configurar las filas vacías.\n";
  } else if (filasPendientes === 0 && filasCargadas > 0) {
    reporte += "   - ¡Excelente! Todas las filas con orden ya tienen un documento cargado.\n";
  } else {
    reporte += "   - El sistema parece estar sincronizado. No se requieren acciones.\n";
  }
  
  SpreadsheetApp.getUi().alert(reporte);
  Logger.log(reporte);
}

// --- FUNCIÓN PARA PROCESAR LA SUBIDA DEL DOCUMENTO ---

function procesarSubidaDocumento(base64Data, mimeType, fileName, rowIdx, noOrden) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tplSheet = ss.getSheetByName('templates');
    
    if (!tplSheet) {
      throw new Error("La hoja 'templates' no existe.");
    }
    
    // Buscar ID_FOLDER en la hoja templates
    var tplData = tplSheet.getDataRange().getValues();
    var folderId = "";
    
    for (var i = 1; i < tplData.length; i++) {
      var key = tplData[i][0] ? tplData[i][0].toString().trim() : "";
      if (key === "ID_FOLDER") {
        folderId = tplData[i][1] ? tplData[i][1].toString().trim() : "";
        break;
      }
    }
    
    if (!folderId) {
      throw new Error("No se encontró la clave ID_FOLDER en la hoja 'templates'. Configure el ID de la carpeta de órdenes.");
    }
    
    // Obtener la carpeta destino
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      throw new Error("No se puede acceder a la carpeta ID_FOLDER (ID: " + folderId + "). Verifique que el ID es correcto y que el script tiene permisos de acceso.");
    }
    
    // Manejo de Históricos (Sobreescritura segura)
    var targetFileName = noOrden + ".pdf";
    var existingFiles = folder.getFilesByName(targetFileName);
    
    while (existingFiles.hasNext()) {
      var oldFile = existingFiles.next();
      Logger.log("Enviando a papelera el archivo existente: " + oldFile.getName());
      oldFile.setTrashed(true); // Enviar a papelera para cumplimiento de auditoría
    }
    
    // Decodificar base64 y crear el archivo
    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, mimeType, targetFileName);
    var newFile = folder.createFile(blob);
    
    // Actualizar UI en la hoja Ordenes
    var sheetOrdenes = ss.getSheetByName('Ordenes');
    if (!sheetOrdenes) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    var headers = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
    var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
    
    if (colAdjuntoIdx > 0) {
      // Crear hipervínculo al archivo
      var fileUrl = newFile.getUrl();
      var hyperlinkFormula = '=HYPERLINK("' + fileUrl + '", "✅ Cargado")';
      var targetCell = sheetOrdenes.getRange(rowIdx, colAdjuntoIdx);
      targetCell.clearDataValidations();
      targetCell.setValue(hyperlinkFormula);
    }
    
    // Auditoría obligatoria
    var userEmail = Session.getActiveUser().getEmail();
    var userIdentity = getUserIdentityString(userEmail);
    logChange('CARGA_DOCUMENTO', "Se subió el documento adjunto para la orden " + noOrden, userIdentity);
    
    return { status: 'success', message: 'Documento subido exitosamente.' };
    
  } catch (e) {
    Logger.log("Error en procesarSubidaDocumento: " + e.message);
    return { status: 'error', message: e.message };
  }
}