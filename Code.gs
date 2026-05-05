// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🖨️ Impresión')
    .addItem('Imprimir Plantillas', 'openPrintDialog')
    .addSeparator()
    .addItem(' Diagnosticar Plantillas', 'diagnosticarPlantillas')
    .addSeparator()
    .addItem(' Bloquear Hojas (Admin)', 'promptLock')
    .addItem('🔓 Desbloquear Hojas (Admin)', 'promptUnlock')
    .addItem('⚙️ Configurar Proxy (Admin)', 'promptSetWebAppUrl')
    .addSeparator()
    .addItem('🔧 Inicializar App (Admin)', 'promptInitializeApp')
    .addItem('🛡️ Aplicar Nuevo Esquema de Protección (Admin)', 'promptApplyNewProtection')
    .addItem('▶️ Activar Auditoría (Admin)', 'promptSetupAuditTrail')
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

function promptInitializeApp() {
  withAdminAuth('Inicializar App (Admin)', function(ui) {
    initializeApp(ui);
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
        var colNombre = 0;
        for (var i = 0; i < userData[0].length; i++) {
          var headerValue = userData[0][i].toString().trim().toLowerCase();
          if (headerValue === "nombre completo" || headerValue === "nombrecorto") { colNombre = i; break; }
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
  'Ordenes': ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden', 'Fabricante'],
  'Usuarios': ['UserID', 'Nombre Completo', 'NombreCorto', 'Email'],
  'Logs': ['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']
};

function initializeApp(ui) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = validateStructure();
  
  if (report.missingSheets.length === 0 && report.incorrectHeaders.length === 0) {
    ui.alert('✅ Estructura válida. Todas las hojas y encabezados son correctos.');
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
    ui.alert('✅ Inicialización completada. Estructura corregida.');
    
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
  var user = Session.getActiveUser().getEmail();
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
  
  var legacyDescriptions = ['Bloqueo_Usuarios', 'Bloqueo_Templates', 'Bloqueo_Ordenes_IT', 'Bloqueo_Ordenes_IS'];
  
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
  
  // Desproteger rango A:H (columnas 1-8) usando setUnprotectedRanges con array
  var lastRow = sheetOrdenes.getLastRow();
  if (lastRow < 1) lastRow = 1;
  var unprotectedRange = sheetOrdenes.getRange(1, 1, lastRow, 8); // A:H
  protection.setUnprotectedRanges([unprotectedRange]); // CORRECCIÓN: usar array
  
  Logger.log("✓ Protección mixta configurada para Ordenes (A:H desprotegido, I-Z protegido)");
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
  // Guard clause: ignorar ediciones en hoja Logs para evitar bucles infinitos
  if (e.source.getActiveSheet().getName() === 'Logs') return;
  
  var user = Session.getActiveUser().getEmail();
  var effectiveUser = Session.getEffectiveUser().getEmail();
  
  // Si el usuario que edita es el efectivo (admin/Web App), permitir sin registro
  if (user === effectiveUser) return;
  
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
  
  // Usuario tiene permiso, registrar la edición válida
  var numRows = editedRange.getNumRows();
  var numCols = editedRange.getNumColumns();
  
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