// ============================================================
// MODULE: Cache
// Descripción: Sistema de caché para plantillas y datos iniciales
// Prioridad de Carga: 5° (depende de Helpers y Config)
// ============================================================

/**
 * Genera el prefijo de caché para una plantilla estática.
 */
function getStaticTemplateCachePrefix_(key) {
  return 'staticPdf_' + key + '_';
}

/**
 * Obtiene una plantilla estática desde el caché (chunked).
 */
function getCachedStaticTemplateBase64_(key) {
  var cache = CacheService.getScriptCache();
  var prefix = getStaticTemplateCachePrefix_(key);
  var meta = cache.get(prefix + 'meta');
  if (!meta) return null;

  try {
    var parsedMeta = JSON.parse(meta);
    var chunks = [];
    for (var i = 0; i < parsedMeta.chunkCount; i++) {
      var chunk = cache.get(prefix + i);
      if (chunk == null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  } catch (e) {
    Logger.log("Error leyendo caché estático " + key + ": " + e.message);
    return null;
  }
}

/**
 * Cachea una plantilla estática en chunks.
 */
function cacheStaticTemplateBase64_(key, base64) {
  if (!base64) return;
  var cache = CacheService.getScriptCache();
  var prefix = getStaticTemplateCachePrefix_(key);
  var chunkCount = Math.ceil(base64.length / STATIC_TEMPLATE_CHUNK_SIZE_);

  try {
    for (var i = 0; i < chunkCount; i++) {
      cache.put(prefix + i, base64.substring(i * STATIC_TEMPLATE_CHUNK_SIZE_, (i + 1) * STATIC_TEMPLATE_CHUNK_SIZE_), STATIC_TEMPLATE_CACHE_TTL_);
    }
    cache.put(prefix + 'meta', JSON.stringify({ chunkCount: chunkCount }), STATIC_TEMPLATE_CACHE_TTL_);
  } catch (e) {
    Logger.log("Error cacheando plantilla estática " + key + ": " + e.message);
  }
}

/**
 * Obtiene el base64 de una plantilla estática (desde caché o Drive).
 */
function getStaticTemplateBase64_(key, fileId) {
  var cached = getCachedStaticTemplateBase64_(key);
  if (cached) return cached;

  var file = DriveApp.getFileById(fileId);
  var base64 = Utilities.base64Encode(file.getBlob().getBytes());
  cacheStaticTemplateBase64_(key, base64);
  return base64;
}

/**
 * Obtiene datos iniciales (usuarios y plantillas) para los modales.
 * Usa caché de 10 minutos para optimizar performance.
 */
function getInitialData() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('initialData_v2');
    
    // Obtener usuario actual para sus permisos (se hace siempre, no desde caché)
    var activeEmail = Session.getActiveUser().getEmail();
    var validUser = getUserRecordByEmail_(activeEmail);
    var userPermissions = {};
    if (validUser && validUser.rol) {
      userPermissions = getUserPermissions(validUser.rol);
    }
    
    if (cached) {
      try {
        var parsedData = JSON.parse(cached);
        for (var i = 0; i < parsedData.templates.length; i++) {
          var t = parsedData.templates[i];
          if (STATIC_TEMPLATE_KEYS_.indexOf(t.key) !== -1 && t.fileId && t.hasAccess) {
            t.base64 = getStaticTemplateBase64_(t.key, t.fileId);
          } else {
            t.base64 = null;
          }
        }
        if (!parsedData.webAppUrl) {
          try { parsedData.webAppUrl = getWebAppUrl(); } catch(urlErr) { parsedData.webAppUrl = ''; }
        }
        // Agregar permisos del usuario actual dinámicamente (NO desde caché)
        parsedData.userPermissions = userPermissions;
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
        
        var colUserIdIdx = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
        var colNombreCompletoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Nombre Completo', false);
        var colNombreCortoIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreCorto', false);
        var colEmailIdx = getColumnIndexByNameCaseInsensitive(headers, 'Email', false);
        var colRolIdx = getColumnIndexByNameCaseInsensitive(headers, 'Rol', false);
        
        if (!colUserIdIdx) colUserIdIdx = 1;
        if (!colNombreCompletoIdx) colNombreCompletoIdx = 2;
        if (!colNombreCortoIdx) colNombreCortoIdx = 3;
        
        colUserIdIdx = colUserIdIdx - 1;
        colNombreCompletoIdx = colNombreCompletoIdx - 1;
        colNombreCortoIdx = colNombreCortoIdx - 1;
        if (colEmailIdx) colEmailIdx = colEmailIdx - 1;
        if (colRolIdx) colRolIdx = colRolIdx - 1;
        
        for (var j = 1; j < userData.length; j++) {
          if (colUserIdIdx !== undefined && colNombreCompletoIdx !== undefined && userData[j][colUserIdIdx] && userData[j][colNombreCompletoIdx]) {
            var userId = userData[j][colUserIdIdx].toString().trim();
            var nombreCompleto = userData[j][colNombreCompletoIdx].toString().trim();
            if (userId && nombreCompleto) {
              users.push({
                userId: userId,
                nombreCompleto: nombreCompleto,
                nombreCorto: colNombreCortoIdx !== undefined && userData[j][colNombreCortoIdx] ? userData[j][colNombreCortoIdx].toString().trim() : "",
                email: colEmailIdx !== undefined && colEmailIdx !== null && userData[j][colEmailIdx] ? userData[j][colEmailIdx].toString().trim() : "",
                rol: colRolIdx !== undefined && colRolIdx !== null && userData[j][colRolIdx] ? userData[j][colRolIdx].toString().trim() : ""
              });
            }
          }
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
      
      var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
      var colValorIdx = getColumnIndexByNameCaseInsensitive(headers, 'Valor', false);
      var colNombreTemplateIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreTemplate', false);
      
      if (!colClaveIdx) colClaveIdx = 1;
      if (!colValorIdx) colValorIdx = 2;
      
      colClaveIdx = colClaveIdx - 1;
      colValorIdx = colValorIdx - 1;
      if (colNombreTemplateIdx) colNombreTemplateIdx = colNombreTemplateIdx - 1;
      
      for (var k = 1; k < tplData.length; k++) {
        var key = tplData[k][colClaveIdx] ? tplData[k][colClaveIdx].toString().trim() : "";
        var value = tplData[k][colValorIdx] ? tplData[k][colValorIdx].toString().trim() : "";
      
        if (key && key !== "Clave" && key !== "DOC_ORDENES" && key !== "DOC_ANALISIS" && key !== "DOC_COMPLETO" && key.indexOf("COORD_") === -1 && key !== "TPL_ORDEN") {
          var displayName = key;
          var hasAccess = true;
          var base64 = null;
          
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var nombreTemplateValue = tplData[k][colNombreTemplateIdx].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          if (displayName === key) {
            if (key === "DOC_ANALISIS") displayName = "Cert. Análisis (Dinámico)";
          }
          
          if (value) {
            try { 
              var file = DriveApp.getFileById(value);
              if (displayName === key) {
                displayName = file.getName();
              }
              
              if (STATIC_TEMPLATE_KEYS_.indexOf(key) !== -1) {
                base64 = getStaticTemplateBase64_(key, value);
                Logger.log("✓ Precargando base64 para " + key);
              }
            } catch (e) { 
              Logger.log("ERROR: No se puede acceder al archivo de Drive para " + key);
              Logger.log("  - ID del archivo: " + value);
              Logger.log("  - Error: " + e.message);
              
              if (STATIC_TEMPLATE_KEYS_.indexOf(key) === -1) {
                displayName = displayName + " (Sin acceso)";
                hasAccess = false;
                accessErrors.push({
                  key: key,
                  fileId: value,
                  error: e.message
                });
              } else {
                Logger.log("  - Plantilla estática, manteniendo hasAccess = true");
              }
            }
          }
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: hasAccess, base64: base64 });
        }
        
        if (key === "DOC_ORDENES") {
          var displayName = "Orden (Dinámico)";
          
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var nombreTemplateValue = tplData[k][colNombreTemplateIdx].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: true, base64: null });
        }
        
        if (key === "DOC_ANALISIS") {
          var displayName = "Cert. Análisis (Dinámico)";
          
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var nombreTemplateValue = tplData[k][colNombreTemplateIdx].toString().trim();
            if (nombreTemplateValue) {
              displayName = nombreTemplateValue;
            }
          }
          
          templates.push({ key: key, fileId: value, name: displayName, hasAccess: true, base64: null });
        }
      }
      
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

    var webAppUrl = '';
    try { webAppUrl = getWebAppUrl(); } catch(e) { webAppUrl = ''; }
    
    // Los permisos ya se calcularon al inicio de la función
    var result = { users: users, templates: templates, webAppUrl: webAppUrl, userPermissions: userPermissions };
    
    const sortOrder = ["DOC_ORDENES", "DOC_ANALISIS", "TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_CONTROLES", "TPL_INSPECCION", "TPL_COC"];
    templates.sort(function(a, b) {
      var indexA = sortOrder.indexOf(a.key);
      var indexB = sortOrder.indexOf(b.key);
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) {
        return -1;
      }
      if (indexB !== -1) {
        return 1;
      }
      return 0;
    });
    
    // NO cachear userPermissions - son específicos por usuario
    var dataToCache = { users: users, templates: [], webAppUrl: webAppUrl };
    for (var idx = 0; idx < templates.length; idx++) {
      var t = templates[idx];
      dataToCache.templates.push({ key: t.key, fileId: t.fileId, name: t.name, hasAccess: t.hasAccess });
    }
    
    try { cache.put('initialData_v2', JSON.stringify(dataToCache), 600); } catch (e) {
      Logger.log("Error caching data: " + e.message);
    }
    return result;
    
  } catch (error) {
    Logger.log("CRITICAL ERROR in getInitialData: " + error.message);
    Logger.log("Stack trace: " + error.stack);
    throw new Error("Error cargando datos iniciales: " + error.message);
  }
}

/**
 * Limpia el caché de datos iniciales y plantillas estáticas.
 */
function clearInitialDataCache() {
  var cache = CacheService.getScriptCache();
  cache.remove('initialData_v1');
  cache.remove('initialData_v2');
  cache.remove('printConfig_v1');
  
  // Limpiar caché de permisos de roles
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetPermisos = ss.getSheetByName('PermisosRoles');
    if (sheetPermisos) {
      var data = sheetPermisos.getDataRange().getValues();
      for (var r = 1; r < data.length; r++) {
        var rol = data[r][0] ? data[r][0].toString().trim() : '';
        if (rol) cache.remove('Permisos_' + rol);
      }
    }
  } catch (e) {
    Logger.log("Error limpiando caché de permisos: " + e.message);
  }
  
  for (var i = 0; i < STATIC_TEMPLATE_KEYS_.length; i++) {
    var prefix = getStaticTemplateCachePrefix_(STATIC_TEMPLATE_KEYS_[i]);
    var meta = cache.get(prefix + 'meta');
    if (meta) {
      try {
        var parsedMeta = JSON.parse(meta);
        for (var j = 0; j < parsedMeta.chunkCount; j++) {
          cache.remove(prefix + j);
        }
      } catch (e) {
        Logger.log("Error limpiando caché estático " + STATIC_TEMPLATE_KEYS_[i] + ": " + e.message);
      }
    }
    cache.remove(prefix + 'meta');
  }
}
