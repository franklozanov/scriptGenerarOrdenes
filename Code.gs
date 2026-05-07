// Obtiene la contraseña desde las propiedades del script
var ADMIN_PASS = PropertiesService.getScriptProperties().getProperty('LOCK_PASSWORD');

// --- FUNCIONES HELPER PARA ACCESO A COLUMNAS POR NOMBRE ---

/**
 * Busca el índice de una columna por su nombre de encabezado.
 * Devuelve índice base-1 para usar con getRange(), o null si no existe.
 * @param {Array} headers - Array de encabezados (fila 1 de la hoja)
 * @param {string} columnName - Nombre exacto de la columna a buscar
 * @param {boolean} required - Si es true, lanza error si no encuentra la columna
 * @returns {number|null} Índice base-1 de la columna, o null si no existe y required=false
 */
function getColumnIndexByName(headers, columnName, required) {
  if (required === undefined) required = true;
  
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().trim() === columnName) {
      return i + 1; // Devolver base-1 para getRange()
    }
  }
  
  if (required) {
    throw new Error("No se encontró la columna '" + columnName + "' en los encabezados.");
  }
  return null;
}

/**
 * Busca el índice de una columna por su nombre de encabezado (case-insensitive).
 * Devuelve índice base-1 para usar con getRange().
 * @param {Array} headers - Array de encabezados (fila 1 de la hoja)
 * @param {string} columnName - Nombre de la columna a buscar
 * @param {boolean} required - Si es true, lanza error si no encuentra la columna
 * @returns {number|null} Índice base-1 de la columna, o null si no existe y required=false
 */
function getColumnIndexByNameCaseInsensitive(headers, columnName, required) {
  if (required === undefined) required = true;
  var columnNameLower = columnName.toString().trim().toLowerCase();
  
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().trim().toLowerCase() === columnNameLower) {
      return i + 1; // Devolver base-1 para getRange()
    }
  }
  
  if (required) {
    throw new Error("No se encontró la columna '" + columnName + "' en los encabezados.");
  }
  return null;
}

/**
 * Obtiene el valor de una celda por nombre de columna y número de fila.
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {number} rowIndex - Número de fila (base-1)
 * @param {string} columnName - Nombre de la columna
 * @returns {*} Valor de la celda
 */
function getCellValueByColumnName(sheet, rowIndex, columnName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = getColumnIndexByName(headers, columnName, true);
  return sheet.getRange(rowIndex, colIndex).getValue();
}

/**
 * Establece el valor de una celda por nombre de columna y número de fila.
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {number} rowIndex - Número de fila (base-1)
 * @param {string} columnName - Nombre de la columna
 * @param {*} value - Valor a establecer
 */
function setCellValueByColumnName(sheet, rowIndex, columnName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = getColumnIndexByName(headers, columnName, true);
  sheet.getRange(rowIndex, colIndex).setValue(value);
}

function onOpen() {
  // 1. Menú de Administrador (Opciones de seguridad y proxy)
  var adminMenu = SpreadsheetApp.getUi().createMenu('🔒 Opciones Admin')
    .addItem('⚙️ Configurar Proxy', 'promptSetWebAppUrl')
    .addItem('🔧 Inicializar App', 'promptInitializeApp')
    .addItem('🛡️ Aplicar Nuevo Esquema de Protección', 'promptApplyNewProtection')
    .addItem('▶️ Activar Auditoría', 'promptSetupAuditTrail');

  // 2. Menú de Configuración General
  var configMenu = SpreadsheetApp.getUi().createMenu('⚙️ Configuración')
    .addItem('📊 Diagnosticar Plantillas', 'diagnosticarPlantillas')
    .addSeparator()
    .addSubMenu(adminMenu);

  // 3. Menú Principal (Gestionar OA)
  SpreadsheetApp.getUi().createMenu('Gestionar OA')
    .addItem('📤 Subir documentos', 'abrirModalSubidaGeneral')
    .addItem('🖨️ Imprimir Orden', 'openPrintDialog')
    .addSeparator()
    .addSubMenu(configMenu)
    .addToUi();
  
  // Limpiar caché para asegurar que se carguen datos frescos
  clearInitialDataCache();
  
  // Cache warmup: precargar datos silenciosamente
  try {
    getInitialData();
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Plantillas estáticas listas.', 'Sistema QMS', 5);
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
        var headers = userData[0];
        
        // Obtener índices de columnas por nombre
        var colUserIdIdx = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
        var colNombreCompletoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Nombre Completo', false);
        var colNombreCortoIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreCorto', false);
        
        // Si alguna columna no existe, usar índices por defecto
        if (!colUserIdIdx) colUserIdIdx = 1;
        if (!colNombreCompletoIdx) colNombreCompletoIdx = 2;
        if (!colNombreCortoIdx) colNombreCortoIdx = 3;
        
        // Convertir a base-0 para acceso a array
        colUserIdIdx = colUserIdIdx - 1;
        colNombreCompletoIdx = colNombreCompletoIdx - 1;
        colNombreCortoIdx = colNombreCortoIdx - 1;
        
        for (var j = 1; j < userData.length; j++) {
          var userId = userData[j][colUserIdIdx] ? userData[j][colUserIdIdx].toString().trim() : "N/A";
          var nombreCompleto = userData[j][colNombreCompletoIdx] ? userData[j][colNombreCompletoIdx].toString().trim() : "N/A";
          var nombreCorto = userData[j][colNombreCortoIdx] ? userData[j][colNombreCortoIdx].toString().trim() : "N/A";
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
      
      var headers = tplData[0];
      
      // Obtener índices de columnas por nombre
      var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
      var colValorIdx = getColumnIndexByNameCaseInsensitive(headers, 'Valor', false);
      var colNombreTemplateIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreTemplate', false);
      
      // Si alguna columna no existe, usar índices por defecto
      if (!colClaveIdx) colClaveIdx = 1;
      if (!colValorIdx) colValorIdx = 2;
      // colNombreTemplate es opcional
      
      // Convertir a base-0 para acceso a array
      colClaveIdx = colClaveIdx - 1;
      colValorIdx = colValorIdx - 1;
      if (colNombreTemplateIdx) colNombreTemplateIdx = colNombreTemplateIdx - 1;
      
      // Static templates to preload
      var staticTemplates = ["TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES"];
      
      for (var k = 1; k < tplData.length; k++) {
        var key = tplData[k][colClaveIdx] ? tplData[k][colClaveIdx].toString().trim() : "";
        var value = tplData[k][colValorIdx] ? tplData[k][colValorIdx].toString().trim() : "";
      
        if (key && key !== "Clave" && key !== "DOC_ORDENES" && key !== "DOC_ANALISIS" && key !== "DOC_COMPLETO" && key.indexOf("COORD_") === -1) {
          var displayName = key;
          var hasAccess = true;
          var base64 = null;
          
          // Try to get name from NombreTemplate column first (highest priority)
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var nombreTemplateValue = tplData[k][colNombreTemplateIdx].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          // Fallback to hardcoded names if NombreTemplate is empty or doesn't exist
          if (displayName === key) {
            if (key === "DOC_ANALISIS") displayName = "Cert. Análisis (Dinámico)";
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
        
        // Handle DOC_ORDENES separately - it's a folder ID, not a file ID (dynamic PDF of order)
        if (key === "DOC_ORDENES") {
          var displayName = "Orden (Dinámico)";
          
          // Try to get name from NombreTemplate column first
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var nombreTemplateValue = tplData[k][colNombreTemplateIdx].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: true, base64: null });
        }
        
        // Handle DOC_ANALISIS separately - it's a folder ID, not a file ID
        if (key === "DOC_ANALISIS") {
          var displayName = "Cert. Análisis (Dinámico)";
          
          // Try to get name from NombreTemplate column first
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var nombreTemplateValue = tplData[k][colNombreTemplateIdx].toString().trim();
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
    const sortOrder = ["DOC_ORDENES", "DOC_ANALISIS", "TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_CONTROLES", "TPL_INSPECCION", "TPL_COC"];
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
  
  var headers = tplData[0];
  
  // Obtener índices de columnas por nombre
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
  var colValorIdx = getColumnIndexByNameCaseInsensitive(headers, 'Valor', false);
  
  // Si alguna columna no existe, usar índices por defecto
  if (!colClaveIdx) colClaveIdx = 1;
  if (!colValorIdx) colValorIdx = 2;
  
  // Convertir a base-0 para acceso a array
  colClaveIdx = colClaveIdx - 1;
  colValorIdx = colValorIdx - 1;
  
  // Verificar carpetas dinámicas primero
  for (var i = 1; i < tplData.length; i++) {
    var k = tplData[i][colClaveIdx] ? tplData[i][colClaveIdx].toString().trim() : "";
    var v = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : "";
    if (k === "DOC_ORDENES") folderId = v;
    if (k === "DOC_ANALISIS") folderAnalysisId = v;
  }
  
  report += "CARPETAS DINÁMICAS:\n";
  
  // Verificar DOC_ORDENES
  if (folderId) {
    try {
      var folder = DriveApp.getFolderById(folderId);
      report += "✓ DOC_ORDENES → " + folder.getName() + "\n";
      successCount++;
    } catch (e) {
      report += "✗ DOC_ORDENES → ERROR: " + e.message + "\n";
      report += "  ID: " + folderId + "\n";
      errorCount++;
    }
  } else {
    report += "⚠ DOC_ORDENES → No configurado (requerido para buscar PDF de órdenes)\n";
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
    
    if (key && key !== "Clave" && key !== "DOC_ORDENES" && key !== "DOC_ANALISIS" && key !== "DOC_COMPLETO" && key.indexOf("COORD_") === -1) {
      if (value) {
        try {
          var file = DriveApp.getFileById(value);
          report += "✓ " + key + " → " + file.getName() + "\n";
          successCount++;
        } catch (e) {
          report += "✗ " + key + " → ERROR: " + e.message + "\n";
          errorCount++;
        }
      } else {
        report += "⚠ " + key + " → No configurado\n";
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

  // Fetch only dynamic templates (DOC_ORDENES and DOC_ANALISIS)
  var dynamicPdfs = [];
  
  // Try to fetch PDF de Orden from DOC_ORDENES folder
  try {
    if (folderId) {
      var folder = DriveApp.getFolderById(folderId);
      var files = folder.getFilesByName(orderNo + ".pdf");
      if (files.hasNext()) {
        var file = files.next();
        dynamicPdfs.push({ key: "DOC_ORDENES", base64: Utilities.base64Encode(file.getBlob().getBytes()) });
        Logger.log("✓ Precargado PDF de Orden para orden " + orderNo);
      } else {
        Logger.log("⚠️ No se encontró PDF de Orden para orden " + orderNo);
      }
    }
  } catch (e) {
    Logger.log("Error fetching PDF de Orden from DOC_ORDENES: " + e.message);
  }
  
  // Try to fetch DOC_ANALYSIS
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
          var folder = DriveApp.getFolderById(folderId);
          var files = folder.getFilesByName(orderNo + ".pdf");
          if (files.hasNext()) {
            file = files.next();
          } else {
            throw new Error("El archivo '" + orderNo + ".pdf' no existe en la carpeta configurada (ID: " + folderId + "). Verifique que el archivo existe y el nombre coincide exactamente.");
          }
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
  'templates': ['Clave', 'Valor', 'NombreTemplate'],  // CORRECCIÓN: DOC_ORDENES es valor de fila, no columna
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
  try {
    // Guard clause: Validación inicial del objeto evento
    if (!e || !e.range || !e.source) return;
    
    // Guard clause: ignorar ediciones en hoja Logs para evitar bucles
    if (e.source.getActiveSheet().getName() === 'Logs') return;
    
    var editedRange = e.range;
    var sheet = editedRange.getSheet();
    var sheetName = sheet.getName();
    
    // Verificar permisos de edición (Corregido: Intersección de rangos)
    var sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var allRangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    var overlappingProtections = sheetProtections.slice(); // Copiar protecciones de hoja
    
    // Filtrar solo las protecciones que afectan a la celda editada
    var eRow = editedRange.getRow();
    var eCol = editedRange.getColumn();
    
    for (var j = 0; j < allRangeProtections.length; j++) {
      var pRange = allRangeProtections[j].getRange();
      if (eRow >= pRange.getRow() && eRow <= pRange.getLastRow() &&
          eCol >= pRange.getColumn() && eCol <= pRange.getLastColumn()) {
        overlappingProtections.push(allRangeProtections[j]);
      }
    }
    
    var hasPermission = true;
    var protectionDesc = "";
    
    for (var i = 0; i < overlappingProtections.length; i++) {
      var protection = overlappingProtections[i];
      if (!protection.canEdit()) {
        hasPermission = false;
        protectionDesc = protection.getDescription() || "protegido";
        break;
      }
    }
    
    var userEmail = getUserEmail(e);
    var userIdentity = getUserIdentityString(userEmail);
    
    if (!hasPermission) {
      // Revertir al valor anterior si no tiene permiso
      editedRange.setValue(e.oldValue !== undefined ? e.oldValue : "");
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "Este rango está protegido (" + protectionDesc + "). Cambio revertido.",
        "⚠️ Edición no permitida",
        5
      );
      var cellAddress = editedRange.getA1Notation();
      var violationDesc = "Intento de edición denegado al usuario " + userEmail + " en la celda " + cellAddress + " de la hoja " + sheetName;
      logChange('VIOLACION_PERMISO', violationDesc, userIdentity);
      return;
    }
    
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
        if (adjuntoStr === "✅ Cargado") {
          var nuevoValor = e.value !== undefined ? e.value : "(vacío)";
          var valorAnterior = e.oldValue !== undefined ? e.oldValue : "(vacío)";
          
          // Reseteo AUTOMÁTICO del estado de carga (Sin UI bloqueante)
          sheet.getRange(rowIdx, colAdjuntoIdx).setValue("Pendiente");
          sheet.getRange(rowIdx, colAdjuntoIdx).clearNote();
          
          logChange('RESET_CARGA', 'NoOrden cambiado de ' + valorAnterior + ' a ' + nuevoValor + '. Estado devuelto a Pendiente.', userIdentity);
          SpreadsheetApp.getActiveSpreadsheet().toast("No. Orden modificado. El estado del adjunto ha vuelto a 'Pendiente'.", "Aviso del Sistema", 5);
          return; // No continuar con el log normal de edición
        }
        
        // Si AdjuntoOrden está vacío, asignar automáticamente "Pendiente"
        if (adjuntoStr === "" && e.value !== undefined && e.value !== "") {
          sheet.getRange(rowIdx, colAdjuntoIdx).setValue("Pendiente");
          logChange('ASIGNACION_PENDIENTE', 'NoOrden asignado. Estado de AdjuntoOrden establecido a Pendiente.', userIdentity);
          return; // No continuar con el log normal de edición
        }
      }
    }
    
    // Registrar la edición válida general
    if (numRows === 1 && numCols === 1) {
      var oldValue = e.oldValue !== undefined ? e.oldValue : "(vacío)";
      var newValue = e.value !== undefined ? e.value : "(vacío)";
      var cellAddress = editedRange.getA1Notation();
      var editDesc = "Cambió '" + oldValue + "' por '" + newValue + "' en la celda " + cellAddress + " de la hoja " + sheetName;
      logChange('EDICION_CELDA', editDesc, userIdentity);
    } else {
      var rangeA1 = editedRange.getA1Notation();
      var massEditDesc = "Edición masiva en el rango " + rangeA1 + " de la hoja " + sheetName;
      logChange('EDICION_MASIVA', massEditDesc, userIdentity);
    }
    
  } catch (error) {
    Logger.log("ERROR FATAL en onEditInstalled: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    try {
      logChange('ERROR_SISTEMA', 'Error en onEditInstalled: ' + error.message, 'Sistema');
    } catch (logError) {
      Logger.log("No se pudo registrar el error en Logs: " + logError.message);
    }
  }
}

function getUserEmail(e) {
  var email = "";
  try {
    email = Session.getActiveUser().getEmail();
  } catch (err) {}
  
  if (!email || email === "") {
    try { email = e.user.email; } catch (err) {}
  }
  
  if (!email || email === "") {
    email = "Usuario no identificado (Ejecución vía Trigger)";
  }
  return email;
}

function getUserIdentityString(email) {
  if (!email || email.indexOf("Usuario no identificado") !== -1) return email;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return email; // Fallback
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  // Obtener índices de columnas por nombre
  var colEmailIdx = getColumnIndexByNameCaseInsensitive(headers, 'Email', false);
  var colUserIdIdx = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
  var colNombreCortoIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreCorto', false);
  
  // Si alguna columna no existe, retornar email como fallback
  if (!colEmailIdx || !colUserIdIdx || !colNombreCortoIdx) return email;
  
  // Convertir a base-0 para acceso a array
  colEmailIdx = colEmailIdx - 1;
  colUserIdIdx = colUserIdIdx - 1;
  colNombreCortoIdx = colNombreCortoIdx - 1;
  
  // Iterar saltando el encabezado (fila 1 / índice 0)
  for (var i = 1; i < data.length; i++) {
    if (data[i][colEmailIdx] && data[i][colEmailIdx].toString().trim().toLowerCase() === email.toLowerCase()) {
      return (data[i][colUserIdIdx] || "N/A") + " - " + (data[i][colNombreCortoIdx] || "N/A");
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
 * NOTA: La lógica de subida de archivos ha sido centralizada en el modal UploadCentralModal.html.
 * Esta función ya no maneja la apertura de modales de subida por fila.
 * @param {Object} e El objeto de evento de onSelectionChange.
 */
function onSelectionChange(e) {
  // Función vacía - la lógica de subida ha sido centralizada
  // Se mantiene para compatibilidad con disparadores existentes
}

// --- FUNCIÓN PARA OBTENER LISTA DE ÓRDENES PENDIENTES ---

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
    var colNoOrdenIdx = headers.indexOf('NoOrden') + 1;
    var colAdjuntoIdx = headers.indexOf('AdjuntoOrden') + 1;
    var colNoAnalisisIdx = headers.indexOf('NoAnalisis') + 1;
    
    if (colNoOrdenIdx === 0 || colAdjuntoIdx === 0) {
      throw new Error("No se encontraron las columnas 'NoOrden' y/o 'AdjuntoOrden'.");
    }
    
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
      var noOrden = data[i][colNoOrdenIdx - 1];
      var adjuntoEstado = data[i][colAdjuntoIdx - 1];
      var noAnalisis = colNoAnalisisIdx > 0 ? data[i][colNoAnalisisIdx - 1] : null;
      
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
function procesarSubidaDocumentoCentral(base64Data, mimeType, fileName, referenceNo, docType, overwriteConfirmed) {
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
    var userEmail = Session.getActiveUser().getEmail();
    var userIdentity = getUserIdentityString(userEmail);
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

// --- FUNCIÓN PARA GUARDAR PDF UNIFICADO FINAL ---

/**
 * Guarda el PDF unificado final en la carpeta DOC_COMPLETO.
 * @param {string} base64Data - Datos del PDF en base64
 * @param {string} orderNo - Número de orden
 * @returns {string} URL de visualización directa del PDF
 */
function saveFinalUnifiedPDF(base64Data, orderNo) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tplSheet = ss.getSheetByName('templates');
    
    if (!tplSheet) {
      throw new Error("La hoja 'templates' no existe.");
    }
    
    var tplData = tplSheet.getDataRange().getValues();
    var tplHeaders = tplData[0];
    var folderId = null;
    
    // Obtener índices de columnas por nombre
    var colClaveIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Clave', false);
    var colValorIdx = getColumnIndexByNameCaseInsensitive(tplHeaders, 'Valor', false);
    
    if (!colClaveIdx) colClaveIdx = 1;
    if (!colValorIdx) colValorIdx = 2;
    
    // Convertir a base-0 para array
    colClaveIdx -= 1;
    colValorIdx -= 1;
    
    for (var i = 1; i < tplData.length; i++) {
      if (tplData[i][colClaveIdx] && tplData[i][colClaveIdx].toString().trim() === 'DOC_COMPLETO') {
        folderId = tplData[i][colValorIdx] ? tplData[i][colValorIdx].toString().trim() : null;
        break;
      }
    }
    
    if (!folderId) {
      throw new Error("No se encontró la carpeta DOC_COMPLETO en la hoja templates.");
    }
    
    var folder = DriveApp.getFolderById(folderId);
    var targetFileName = 'Orden_' + orderNo + '_Final.pdf';
    
    // Decodificar base64 y crear el archivo
    var decodedData = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedData, 'application/pdf', targetFileName);
    var file = folder.createFile(blob);
    
    // Configurar permisos de seguridad del archivo en Drive (evita descargas no autorizadas en Drive)
    try {
      file.setShareableByEditors(false);
      file.setCopyRequiresWriterPermission(true);
    } catch(secErr) {
      Logger.log("No se pudieron aplicar restricciones de seguridad adicionales al PDF: " + secErr.message);
    }
    
    // Retornamos un mensaje de éxito, ya no la URL directa porque el cliente manejará el PDF
    return "SUCCESS";
    
  } catch (e) {
    Logger.log("Error en saveFinalUnifiedPDF: " + e.message);
    throw new Error("Error al guardar PDF final: " + e.message);
  }
}

// --- FUNCIÓN doGet PARA SERVIR VISOR PDF ---

/**
 * Sirve el visor de PDF cuando se accede a la Web App con parámetro fileId.
 * @param {Object} e - Objeto de evento
 * @returns {HtmlOutput} HTML del visor de PDF
 */
function doGet(e) {
  var fileId = e.parameter.fileId;
  
  var html = HtmlService.createTemplateFromFile('PDFViewer')
    .evaluate()
    .setTitle('Visor de PDF')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  
  // Inyectar fileId en el HTML
  html = html.getContent().replace('{{fileId}}', fileId || '');
  
  return HtmlService.createHtmlOutput(html);
}