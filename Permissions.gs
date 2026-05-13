// ============================================================
// MODULE: Permissions
// Descripción: Gestión de permisos y protecciones de hojas
// Prioridad de Carga: 4° (depende de Auth y Helpers)
// FASE 4 - Batch 4.4: Permissions (Completado)
// ============================================================

// --- ELIMINACIÓN DE PROTECCIONES LEGACY ---

/**
 * Elimina todas las protecciones de hoja y rango existentes en el libro.
 * Útil para limpiar configuraciones antiguas antes de aplicar nuevo esquema.
 */
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

// --- GESTIÓN DE VISIBILIDAD DE HOJAS ---

/**
 * Oculta todas las hojas excepto las especificadas en la lista.
 * @param {Array<string>} visibleSheetNames - Nombres de hojas que deben permanecer visibles
 */
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

// --- PERMISOS DE CARPETAS DE DRIVE ---

/**
 * Verifica y asegura que las carpetas de Drive configuradas tengan permisos correctos.
 * Agrega al propietario del script como editor si no tiene acceso.
 */
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

// --- APLICACIÓN DE ESQUEMA DE PROTECCIÓN ---

/**
 * Aplica el esquema completo de protección al libro.
 * Elimina protecciones legacy, oculta hojas, protege hojas sensibles y configura validaciones.
 */
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

// --- PROTECCIÓN DE HOJAS INDIVIDUALES ---

/**
 * Protege una hoja completamente, permitiendo solo escritura al propietario del script.
 * @param {Sheet} sheet - Hoja a proteger
 * @param {string} description - Descripción de la protección
 */
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

/**
 * Configura protección mixta para la hoja Ordenes.
 * Protege solo columnas específicas de administrador, dejando otras editables.
 */
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
  
  Logger.log("✓ Protección por columna configurada para Ordenes");
}

/**
 * Configura protección completa para la hoja Logs.
 * Solo el script puede escribir en esta hoja.
 */
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

// --- VALIDACIÓN DE DATOS ---

/**
 * Aplica validación de datos a las columnas STATUS.
 * Restringe valores a: Impreso, Reimpreso, RecibidaQA, DevueltaQA, Cerrada.
 */
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

// --- PROMPTS CON AUTENTICACIÓN ADMIN ---

/**
 * Prompt para aplicar el nuevo esquema de protección (requiere contraseña de admin).
 */
function promptApplyNewProtection() {
  withAdminAuth('Aplicar Nuevo Esquema de Protección (Admin)', function(ui) {
    applyNewProtectionScheme();
    ui.alert('✅ Nuevo esquema de protección aplicado. Protecciones legacy eliminadas.');
  });
}

/**
 * Prompt para activar el sistema de auditoría (requiere contraseña de admin).
 */
function promptSetupAuditTrail() {
  withAdminAuth('Activar Auditoría (Admin)', function(ui) {
    setupAuditTrailTrigger();
    ui.alert('✅ Sistema de auditoría activado. Los cambios se registrarán en la hoja Logs.');
  });
}
