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
  
  // 1. Eliminar todas las protecciones de rango y de hoja completas existentes en la hoja "Ordenes"
  var proteccionesActuales = sheetOrdenes.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  proteccionesActuales.forEach(function(p) { p.remove(); });
  
  var proteccionHoja = sheetOrdenes.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  proteccionHoja.forEach(function(p) { p.remove(); });
  Logger.log("✓ Protecciones previas eliminadas de la hoja Ordenes.");
  
  // 2. Columnas que SOLO el administrador/propietario o el sistema pueden editar.
  // Se agregan STATUS y columnas de trazabilidad para evitar alteraciones manuales.
  var colsToProtect = [
    "VerifLote", "VerifCant. Disponible", "VerifExp",
    "Fabricante", "Decision", "STATUS", "NoPags", 
    "Reimpresion", "TotalPags", "ConsecutivoImp", 
    "ImpresoPor", "Reimpreso", "ReimpresoPor"
  ];
  
  var filaEncabezados = 1;
  var headers = sheetOrdenes.getRange(filaEncabezados, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
  
  // 3. Aplicar protección solo a las columnas en colsToProtect
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i] ? headers[i].toString().trim() : "";
    if (colsToProtect.indexOf(header) !== -1 || colsToProtect.indexOf(header.replace('Por', '')) !== -1) {
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
  
  Logger.log("✓ Protección por columna configurada para Ordenes (se permiten ediciones en columnas no protegidas)");
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
 * Aplica validación de datos y formato condicional con colores a las columnas STATUS.
 * Restringe valores a: Impreso, Reimpreso, RecibidaQA, DevueltaQA, Cerrada.
 * Aplica colores específicos para cada estado.
 * @param {boolean} silent - Si es true, no muestra mensajes de UI (para uso en inicialización)
 */
function applyStatusDataValidation(silent) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Usar constantes de Config.gs para asegurar consistencia
    var statusOptions = [
      'Solicitada',
      'Autorizada',
      VALORES_STATUS.IMPRESO,
      VALORES_STATUS.REIMPRESO,
      VALORES_STATUS.RECIBIDA_QA,
      VALORES_STATUS.DEVUELTA_QA,
      VALORES_STATUS.CERRADA
    ];
    
    // Crear regla de validación
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusOptions, true)
      .setAllowInvalid(false)
      .setHelpText("Seleccione un estado: " + statusOptions.join(", "))
      .build();
    
    var sheetsToUpdate = ['Ordenes', 'RegistroNovedad'];
    var sheetsProcessed = [];
    
    sheetsToUpdate.forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        Logger.log("⚠️ Hoja no encontrada: " + sheetName);
        return;
      }
      
      var lastCol = sheet.getLastColumn();
      if (lastCol === 0) {
        Logger.log("⚠️ Hoja sin columnas: " + sheetName);
        return;
      }
      
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var statusColIdx = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);
      
      if (!statusColIdx) {
        Logger.log("⚠️ Columna STATUS no encontrada en: " + sheetName);
        return;
      }
      
      var maxRows = sheet.getMaxRows();
      if (maxRows <= 1) {
        Logger.log("⚠️ Hoja sin filas de datos: " + sheetName);
        return;
      }
      
      var range = sheet.getRange(2, statusColIdx, maxRows - 1, 1);
      
      // Aplicar validación de datos
      range.setDataValidation(rule);
      
      // Limpiar reglas de formato condicional existentes en esta columna
      var existingRules = sheet.getConditionalFormatRules();
      var filteredRules = existingRules.filter(function(rule) {
        var ruleRanges = rule.getRanges();
        for (var i = 0; i < ruleRanges.length; i++) {
          if (ruleRanges[i].getColumn() === statusColIdx) {
            return false; // Excluir esta regla
          }
        }
        return true; // Mantener esta regla
      });
      
      // Definir colores para cada estado
      var colorRules = [
        {
          status: 'Solicitada',
          bgColor: '#f8f9fa',    // Gris muy claro
          textColor: '#475569'   // Gris oscuro
        },
        {
          status: 'Autorizada',
          bgColor: '#dcfce7',    // Verde esmeralda claro
          textColor: '#047857'   // Verde esmeralda oscuro
        },
        {
          status: 'Impreso',
          bgColor: '#d9d9d9',    // Gris claro
          textColor: '#434343'   // Gris oscuro
        },
        {
          status: 'Reimpreso',
          bgColor: '#fff2cc',    // Amarillo claro
          textColor: '#7f6000'   // Amarillo oscuro
        },
        {
          status: 'RecibidaQA',
          bgColor: '#cfe2f3',    // Azul claro
          textColor: '#073763'   // Azul oscuro
        },
        {
          status: 'DevueltaQA',
          bgColor: '#f4cccc',    // Rojo claro
          textColor: '#990000'   // Rojo oscuro
        },
        {
          status: 'Cerrada',
          bgColor: '#d9ead3',    // Verde claro
          textColor: '#274e13'   // Verde oscuro
        }
      ];
      
      // Crear reglas de formato condicional para cada estado
      colorRules.forEach(function(colorRule) {
        var conditionalFormatRule = SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo(colorRule.status)
          .setBackground(colorRule.bgColor)
          .setFontColor(colorRule.textColor)
          .setBold(true)
          .setRanges([range])
          .build();
        
        filteredRules.push(conditionalFormatRule);
      });
      
      // Aplicar todas las reglas
      sheet.setConditionalFormatRules(filteredRules);
      
      Logger.log("✓ Validación y formato condicional aplicados a STATUS en: " + sheetName);
      sheetsProcessed.push(sheetName);
    });
    
    // Mostrar mensaje al usuario solo si no es modo silencioso
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        if (sheetsProcessed.length > 0) {
          ui.alert(
            '✅ Validaciones y Colores Aplicados',
            'Se aplicaron validaciones de datos y formato condicional a la columna STATUS en:\n\n' +
            sheetsProcessed.join('\n') + '\n\n' +
            'Estados disponibles:\n' +
            '⚪ Solicitada (gris claro)\n' +
            '✅ Autorizada (verde esmeralda)\n' +
            '⚫ Impreso (gris)\n' +
            '🟡 Reimpreso (amarillo)\n' +
            '🔵 RecibidaQA (azul)\n' +
            '🔴 DevueltaQA (rojo)\n' +
            '🟢 Cerrada (verde)',
            ui.ButtonSet.OK
          );
        } else {
          ui.alert(
            '⚠️ Advertencia',
            'No se pudo aplicar validaciones. Verifique que las hojas y columnas existan.',
            ui.ButtonSet.OK
          );
        }
      } catch (uiError) {
        Logger.log("No se pudo mostrar mensaje UI (contexto sin UI): " + uiError.message);
      }
    }
    
    return {
      status: 'success',
      sheetsProcessed: sheetsProcessed
    };
    
  } catch (e) {
    Logger.log("ERROR en applyStatusDataValidation: " + e.message);
    
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        ui.alert(
          'Error',
          'No se pudieron aplicar las validaciones:\n' + e.message,
          ui.ButtonSet.OK
        );
      } catch (uiError) {
        Logger.log("No se pudo mostrar error UI: " + uiError.message);
      }
    }
    
    throw e;
  }
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

/**
 * Prompt para aplicar validaciones y colores a columna STATUS (requiere contraseña de admin).
 */
function promptApplyStatusValidation() {
  withAdminAuth('Aplicar Validaciones de STATUS', function(ui) {
    applyStatusDataValidation();
  });
}

// --- MOTOR DE AUTORIZACIÓN RBAC ---

/**
 * Obtiene los permisos de un rol desde la hoja PermisosRoles con caché.
 * @param {string} userRol - Rol del usuario
 * @returns {Object} Objeto con permisos del rol (ej: { MENU_ADMIN: true, CARGAR_ORDENES: false, ... })
 */
function getUserPermissions(userRol) {
  try {
    if (!userRol) {
      Logger.log("getUserPermissions: Rol vacío o nulo");
      return {};
    }

    // Verificar caché primero (6 horas = 21600 segundos)
    var cacheKey = 'Permisos_' + userRol;
    var cache = CacheService.getScriptCache();
    var cachedPermissions = cache.get(cacheKey);
    
    if (cachedPermissions) {
      Logger.log("getUserPermissions: Permisos obtenidos desde caché para rol: " + userRol);
      return JSON.parse(cachedPermissions);
    }

    // Leer desde hoja PermisosRoles
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetPermisos = ss.getSheetByName('PermisosRoles');
    
    if (!sheetPermisos) {
      Logger.log("getUserPermissions: Hoja PermisosRoles no existe");
      return {};
    }

    var data = sheetPermisos.getDataRange().getValues();
    var headers = data[0];
    var permissions = {};

    // Buscar fila del rol (Columna A)
    for (var i = 1; i < data.length; i++) {
      var rolEnHoja = data[i][0] ? data[i][0].toString().trim() : '';
      
      if (rolEnHoja.toLowerCase() === userRol.toLowerCase()) {
        // Mapear valores booleanos a los encabezados
        for (var j = 1; j < headers.length; j++) {
          var permisoKey = headers[j] ? headers[j].toString().trim() : '';
          if (permisoKey) {
            permissions[permisoKey] = data[i][j] === true;
          }
        }
        
        // Guardar en caché
        cache.put(cacheKey, JSON.stringify(permissions), 21600);
        Logger.log("getUserPermissions: Permisos obtenidos desde hoja y cacheados para rol: " + userRol);
        return permissions;
      }
    }

    // Rol no encontrado
    Logger.log("getUserPermissions: Rol no encontrado en hoja PermisosRoles: " + userRol);
    return {};

  } catch (e) {
    Logger.log("ERROR en getUserPermissions: " + e.message);
    return {};
  }
}

/**
 * Verifica si un usuario tiene un permiso específico.
 * @param {string} userId - UserID del usuario
 * @param {string} permisoRequerido - Clave del permiso a verificar (ej: PERMISOS.CARGAR_ORDENES)
 * @returns {boolean} true si tiene permiso, false en caso contrario
 */
function hasPermission(userId, permisoRequerido) {
  try {
    if (!userId || !permisoRequerido) {
      Logger.log("hasPermission: userId o permisoRequerido vacío");
      return false;
    }

    // Obtener usuario desde hoja Usuarios
    var user = getUserRecordByUserId_(userId);
    
    if (!user) {
      Logger.log("hasPermission: Usuario no encontrado: " + userId);
      return false;
    }

    if (!user.rol) {
      Logger.log("hasPermission: Usuario sin rol: " + userId);
      return false;
    }

    // Obtener permisos del rol
    var permissions = getUserPermissions(user.rol);
    
    // Verificar permiso específico
    var tienePermiso = permissions[permisoRequerido] === true;
    
    Logger.log("hasPermission: Usuario " + userId + " con rol " + user.rol + " - Permiso " + permisoRequerido + ": " + tienePermiso);

    return tienePermiso;

  } catch (e) {
    Logger.log("ERROR en hasPermission: " + e.message);
    return false;
  }
}

/**
 * Verifica si un rol tiene un permiso específico (sin consultar hoja de usuarios).
 * Optimizada para uso en onOpen() donde ya conocemos el rol.
 * @param {string} rol - Rol del usuario
 * @param {string} permisoRequerido - Clave del permiso a verificar
 * @returns {boolean} true si tiene permiso, false en caso contrario
 */
function hasPermissionByRol(rol, permisoRequerido) {
  try {
    if (!rol || !permisoRequerido) {
      Logger.log("hasPermissionByRol: rol o permisoRequerido vacío");
      return false;
    }

    var permissions = getUserPermissions(rol);
    var tienePermiso = permissions[permisoRequerido] === true;

    Logger.log("hasPermissionByRol: Rol " + rol + " - Permiso " + permisoRequerido + ": " + tienePermiso);

    return tienePermiso;

  } catch (e) {
    Logger.log("ERROR en hasPermissionByRol: " + e.message);
    return false;
  }
}

/**
 * Lanza un error si el usuario no tiene el permiso especificado.
 * @param {string} userId - UserID del usuario
 * @param {string} permissionKey - Clave del permiso a verificar
 */
function enforcePermission(userId, permissionKey) {
  if (!hasPermission(userId, permissionKey)) {
    throw new Error('ACCESO DENEGADO: No tiene el permiso requerido (' + permissionKey + ') para realizar esta acción.');
  }
}
