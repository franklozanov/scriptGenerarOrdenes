// ============================================================
// MODULE: Cache
// Descripción: Sistema de caché para plantillas y datos iniciales
// Prioridad de Carga: 5° (depende de Helpers y Config)
// ============================================================

/**
 * Genera el prefijo de caché para una plantilla estática.
 */
function getStaticTemplateCachePrefix_(key, fileId) {
  return 'staticPdf_' + key + '_' + (fileId || 'noId') + '_';
}

/**
 * Obtiene una plantilla estática desde el caché (chunked).
 */
function getCachedStaticTemplateBase64_(key, fileId) {
  var cache = CacheService.getScriptCache();
  var prefix = getStaticTemplateCachePrefix_(key, fileId);
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
function cacheStaticTemplateBase64_(key, fileId, base64) {
  if (!base64) return;
  var cache = CacheService.getScriptCache();
  var prefix = getStaticTemplateCachePrefix_(key, fileId);
  var chunkCount = Math.ceil(base64.length / STATIC_TEMPLATE_CHUNK_SIZE_);

  try {
    for (var i = 0; i < chunkCount; i++) {
      cache.put(prefix + i, base64.substring(i * STATIC_TEMPLATE_CHUNK_SIZE_, (i + 1) * STATIC_TEMPLATE_CHUNK_SIZE_), STATIC_TEMPLATE_CACHE_TTL_);
    }
    cache.put(prefix + 'meta', JSON.stringify({ chunkCount: chunkCount }), STATIC_TEMPLATE_CACHE_TTL_);
    registrarStaticTemplateCacheada_(key, fileId);
  } catch (e) {
    Logger.log("Error cacheando plantilla estática " + key + ": " + e.message);
  }
}

/**
 * Registra la tupla (key, fileId) en ScriptProperties para permitir su posterior
 * limpieza quirúrgica cuando se modifiquen o eliminen plantillas.
 */
function registrarStaticTemplateCacheada_(key, fileId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty('CACHED_STATIC_KEYS');
    var list = raw ? JSON.parse(raw) : [];
    var exists = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key && list[i].fileId === fileId) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      list.push({ key: key, fileId: fileId });
      props.setProperty('CACHED_STATIC_KEYS', JSON.stringify(list));
    }
  } catch (e) {
    Logger.log("Error registrando clave estática cacheada: " + e.message);
  }
}

/**
 * Extrae el ID de Drive limpio si el usuario o una fórmula ingresó una URL completa.
 * Ignora strings que comienzan con '#' (errores de fórmulas de Sheets).
 * @private
 */
function extractDriveId_(value) {
  if (value === null || value === undefined) return "";
  var str = value.toString().trim();
  if (str === "" || str.indexOf("#") === 0) return "";
  
  var urlMatch = str.match(/\/(?:file\/d|folders|document\/d|spreadsheets\/d)\/([a-zA-Z0-9_-]+)/i) || 
                 str.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  return str;
}

/**
 * Normaliza el tipo de plantilla manejando mayúsculas, minúsculas y acentos.
 * @private
 */
function normalizarTipoPlantilla_(rawType) {
  if (!rawType) return "Estatica";
  var s = rawType.toString().trim().toLowerCase();
  s = s.normalize ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s.replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u");
  if (s === "estatica" || s === "static") return "Estatica";
  if (s === "dinamica" || s === "dynamic") return "Dinamica";
  if (s === "coordinate" || s === "coordenada" || s === "coordenadas") return "Coordinate";
  if (s === "config" || s === "configuracion") return "Config";
  return rawType.toString().trim();
}

/**
 * Normaliza el estado de la plantilla manejando fórmulas booleanas o texto variado.
 * @private
 */
function normalizarEstadoPlantilla_(rawEstado) {
  if (rawEstado === null || rawEstado === undefined) return "Inactiva";
  if (typeof rawEstado === "boolean") return rawEstado ? "Activa" : "Inactiva";
  var s = rawEstado.toString().trim().toLowerCase();
  if (s.indexOf("#") === 0) return "Inactiva";
  if (s === "activa" || s === "activo" || s === "true" || s === "1" || s === "si" || s === "sí") {
    return "Activa";
  }
  return "Inactiva";
}

/**
 * Resuelve la instancia del Spreadsheet activo o por ID de forma tolerante a fallos.
 * @private
 */
function getSpreadsheetInstance_(spreadsheetId) {
  var ss = null;
  if (spreadsheetId) {
    try { ss = SpreadsheetApp.openById(spreadsheetId); } catch(e) {}
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
  }
  if (!ss) {
    try {
      var savedId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (savedId) ss = SpreadsheetApp.openById(savedId);
    } catch(e) {}
  }
  if (ss) {
    try {
      PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    } catch(e) {}
  }
  return ss;
}

/**
 * Public wrapper para obtener el base64 de una plantilla estática desde el cliente.
 */
function getStaticTemplateBase64(key, fileId) {
  return getStaticTemplateBase64_(key, fileId);
}

/**
 * Obtiene el base64 de una plantilla estática (desde caché o Drive).
 */
function getStaticTemplateBase64_(key, fileId) {
  var cleanFileId = extractDriveId_(fileId);
  var cached = getCachedStaticTemplateBase64_(key, cleanFileId);
  if (cached) return cached;

  var file = DriveApp.getFileById(cleanFileId);
  var base64 = Utilities.base64Encode(file.getBlob().getBytes());
  cacheStaticTemplateBase64_(key, cleanFileId, base64);
  return base64;
}

/**
 * Obtiene datos iniciales (usuarios y plantillas) para los modales.
 * Usa caché de 10 minutos para optimizar performance.
 */
function getInitialData(spreadsheetId) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('initialData_v4');
    var activeEmail = "";
    var savedProfileIdx = null;
    try { 
      activeEmail = Session.getActiveUser().getEmail() || ""; 
      if (activeEmail) {
        var cachedIdx = CacheService.getUserCache().get('selectedProfileIdx_' + activeEmail);
        if (cachedIdx !== null) savedProfileIdx = parseInt(cachedIdx, 10);
      }
    } catch(e) {}
    
    var ss = getSpreadsheetInstance_(spreadsheetId);
    if (!ss) {
      throw new Error("No se pudo obtener acceso a la hoja de cálculo. Por favor intente recargar el documento.");
    }
    
    var currentSignature = "";
    try {
      var tplSheet = ss.getSheetByName('templates');
      if (tplSheet) {
        var tplDataRaw = tplSheet.getDataRange().getValues();
        currentSignature = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(tplDataRaw)));
      }
    } catch(e) {
      Logger.log("Error leyendo templates para firma: " + e.message);
    }

    var currentVersion = "";
    try {
      currentVersion = PropertiesService.getScriptProperties().getProperty('TEMPLATES_VERSION') || '0';
    } catch(e) {
      currentVersion = '0';
    }

    if (cached) {
      try { 
        var parsedData = JSON.parse(cached); 
        if (parsedData.templatesVersion === currentVersion && parsedData.templateSignature === currentSignature && currentSignature !== "") {
          for (var i = 0; i < parsedData.templates.length; i++) {
            var t = parsedData.templates[i];
            // FASE 6 OPTIMIZACIÓN: NO precargar el base64 aquí para no bloquear la UI.
            // Se descargarán asíncronamente o en Lazy Load durante la impresión.
            t.base64 = null;
            if (t.copias === undefined || t.copias === null || isNaN(t.copias)) {
              t.copias = 1;
            }
          }
          if (!parsedData.webAppUrl) {
            try { parsedData.webAppUrl = getWebAppUrl(); } catch(urlErr) { parsedData.webAppUrl = ''; }
          }
          parsedData.activeEmail = activeEmail;
          parsedData.savedProfileIdx = savedProfileIdx;
          parsedData.templatesVersion = currentVersion;
          return parsedData; 
        } else {
          Logger.log("Firma o versión de caché diferente o ausente. Se reconstruirá el caché de plantillas.");
        }
      } catch (e) {
        Logger.log("Error parsing cached data: " + e.message);
      }
    }
  
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
      var colTypeIdx = getColumnIndexByNameCaseInsensitive(headers, 'Type', false);
      var colNombreTemplateIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreTemplate', false);
      var colDescriptionIdx = getColumnIndexByNameCaseInsensitive(headers, 'Description', false);
      var colFormOrderIdx = getColumnIndexByNameCaseInsensitive(headers, 'FormOrder', false);
      var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);
      var colCopiasIdx = getColumnIndexByNameCaseInsensitive(headers, 'Copias', false);
      
      if (!colClaveIdx) colClaveIdx = 1;
      if (!colValorIdx) colValorIdx = 2;
      
      colClaveIdx = colClaveIdx - 1;
      colValorIdx = colValorIdx - 1;
      if (colTypeIdx) colTypeIdx = colTypeIdx - 1;
      if (colNombreTemplateIdx) colNombreTemplateIdx = colNombreTemplateIdx - 1;
      if (colDescriptionIdx) colDescriptionIdx = colDescriptionIdx - 1;
      if (colFormOrderIdx) colFormOrderIdx = colFormOrderIdx - 1;
      if (colEstadoIdx) colEstadoIdx = colEstadoIdx - 1;
      if (colCopiasIdx) colCopiasIdx = colCopiasIdx - 1;
      
      for (var k = 1; k < tplData.length; k++) {
        var rawKey = tplData[k][colClaveIdx];
        var key = rawKey ? rawKey.toString().trim() : "";
        if (!key || key.indexOf("#") === 0) continue; // Ignorar filas vacías o con fórmulas con error

        var rawValue = tplData[k][colValorIdx];
        var value = extractDriveId_(rawValue);
        var rawType = (colTypeIdx !== undefined && colTypeIdx !== null && tplData[k][colTypeIdx]) ? tplData[k][colTypeIdx].toString().trim() : "Estatica";
        var typeVal = normalizarTipoPlantilla_(rawType);
        var rawDescription = (colDescriptionIdx !== undefined && colDescriptionIdx !== null && tplData[k][colDescriptionIdx]) ? tplData[k][colDescriptionIdx].toString().trim() : "";
        var descriptionVal = (rawDescription.indexOf("#") === 0) ? "" : rawDescription;

        var formOrderRaw = (colFormOrderIdx !== undefined && colFormOrderIdx !== null && tplData[k][colFormOrderIdx] !== "") ? tplData[k][colFormOrderIdx] : 999;
        var formOrderVal = parseInt(formOrderRaw, 10);
        if (isNaN(formOrderVal)) formOrderVal = 999;
        
        var rawEstado = (colEstadoIdx !== undefined && colEstadoIdx !== null && tplData[k][colEstadoIdx] !== "") ? tplData[k][colEstadoIdx] : "";
        var estadoVal = normalizarEstadoPlantilla_(rawEstado);

        var copiasRaw = (colCopiasIdx !== undefined && colCopiasIdx !== null && tplData[k][colCopiasIdx] !== "") ? tplData[k][colCopiasIdx] : 1;
        var copiasVal = parseInt(copiasRaw, 10);
        if (isNaN(copiasVal) || copiasVal < 0) copiasVal = 1;
      
        if (key !== "Clave" && key !== "DOC_ORDENES" && key !== "DOC_ANALISIS" && key !== "DOC_COMPLETO" && key.indexOf("COORD_") === -1 && key !== "TPL_ORDEN") {
          var displayName = key;
          var hasAccess = true;
          var base64 = null;
          
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var rawNombre = tplData[k][colNombreTemplateIdx].toString().trim();
            if (rawNombre && rawNombre.indexOf("#") !== 0) {
              displayName = rawNombre;
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
              if (typeVal === 'Estatica') {
                // FASE 6 OPTIMIZACIÓN: NO precargar el base64 aquí
                base64 = null;
              }
            } catch (e) {
              Logger.log("ERROR: No se puede acceder al archivo de Drive para " + key);
              Logger.log("  - ID del archivo: " + value);
              Logger.log("  - Error: " + e.message);
              
              if (typeVal !== 'Estatica') {
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
          templates.push({ key: key, fileId: value, name: displayName, description: descriptionVal, type: typeVal, formOrder: formOrderVal, estado: estadoVal, copias: copiasVal, hasAccess: hasAccess, base64: base64 });
        }
        
        if (key === "DOC_ORDENES") {
          var displayName = "Orden (Dinámico)";
          
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var rawNombre = tplData[k][colNombreTemplateIdx].toString().trim();
            if (rawNombre && rawNombre.indexOf("#") !== 0) {
              displayName = rawNombre;
            }
          }
          
          templates.push({ key: key, fileId: value, name: displayName, description: descriptionVal, type: typeVal, formOrder: formOrderVal, estado: estadoVal, copias: copiasVal, hasAccess: true, base64: null });
        }
        
        if (key === "DOC_ANALISIS") {
          var displayName = "Cert. Análisis (Dinámico)";
          
          if (colNombreTemplateIdx !== undefined && colNombreTemplateIdx !== null && k > 0 && tplData[k][colNombreTemplateIdx]) {
            var rawNombre = tplData[k][colNombreTemplateIdx].toString().trim();
            if (rawNombre && rawNombre.indexOf("#") !== 0) {
              displayName = rawNombre;
            }
          }
          
          templates.push({ key: key, fileId: value, name: displayName, description: descriptionVal, type: typeVal, formOrder: formOrderVal, estado: estadoVal, copias: copiasVal, hasAccess: true, base64: null });
        }
      }
      
      // Ordenar plantillas por formOrder numérico seguro (evita NaN)
      templates.sort(function(a, b) {
        var orderA = (typeof a.formOrder === 'number' && !isNaN(a.formOrder)) ? a.formOrder : 999;
        var orderB = (typeof b.formOrder === 'number' && !isNaN(b.formOrder)) ? b.formOrder : 999;
        return orderA - orderB;
      });
      
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
    var result = { 
      users: users, 
      templates: templates, 
      webAppUrl: webAppUrl, 
      activeEmail: activeEmail, 
      savedProfileIdx: savedProfileIdx,
      templatesVersion: currentVersion 
    };
    
    var dataToCache = { 
      users: users, 
      templates: [], 
      webAppUrl: webAppUrl, 
      templateSignature: currentSignature,
      templatesVersion: currentVersion 
    };
    for (var idx = 0; idx < templates.length; idx++) {
      var t = templates[idx];
      dataToCache.templates.push({ key: t.key, fileId: t.fileId, name: t.name, description: t.description, type: t.type, formOrder: t.formOrder, estado: t.estado, copias: t.copias, hasAccess: t.hasAccess });
    }
    
    try { cache.put('initialData_v4', JSON.stringify(dataToCache), 600); } catch (e) {
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
 * Guarda en caché de usuario el índice del perfil seleccionado para persistencia en sesión.
 * @param {number} idx Índice del usuario en el array de coincidencias de email.
 */
function saveUserProfileSelection(idx) {
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) {
      // Guarda por 6 horas, que es más que suficiente para una "sesión" típica
      CacheService.getUserCache().put('selectedProfileIdx_' + email, idx.toString(), 21600);
    }
  } catch(e) {
    Logger.log("Error en saveUserProfileSelection: " + e.message);
  }
}

/**
 * Elimina los chunks y metadata de una plantilla estática en CacheService.
 * @private
 */
function eliminarChunksPlantillaEstatica_(cache, key, fileId) {
  try {
    var prefix = getStaticTemplateCachePrefix_(key, fileId);
    var meta = cache.get(prefix + 'meta');
    if (meta) {
      try {
        var parsedMeta = JSON.parse(meta);
        var chunkCount = parsedMeta.chunkCount || 0;
        for (var j = 0; j < chunkCount; j++) {
          cache.remove(prefix + j);
        }
      } catch (err) {
        Logger.log("Error parseando meta de " + prefix + ": " + err.message);
      }
      cache.remove(prefix + 'meta');
    }
  } catch (e) {
    Logger.log("Error eliminando chunks de " + key + " (" + fileId + "): " + e.message);
  }
}

/**
 * Limpia el caché de datos iniciales y plantillas estáticas en todo el sistema.
 * Invalida llaves de ScriptCache, chunks de PDFs y actualiza el timestamp de versión.
 * @param {string} [spreadsheetId] ID del spreadsheet opcional
 */
function clearInitialDataCache(spreadsheetId) {
  var cache = CacheService.getScriptCache();
  // 1. Limpiar llaves de datos iniciales y configuración
  cache.remove('initialData_v1');
  cache.remove('initialData_v2');
  cache.remove('initialData_v3');
  cache.remove('initialData_v4');
  cache.remove('printConfig_v1');

  var props = PropertiesService.getScriptProperties();

  // 2. Limpiar todos los chunks registrados previamente en ScriptProperties
  try {
    var raw = props.getProperty('CACHED_STATIC_KEYS');
    if (raw) {
      var list = JSON.parse(raw);
      for (var k = 0; k < list.length; k++) {
        eliminarChunksPlantillaEstatica_(cache, list[k].key, list[k].fileId);
      }
    }
    props.deleteProperty('CACHED_STATIC_KEYS');
  } catch (e) {
    Logger.log("Error limpiando CACHED_STATIC_KEYS: " + e.message);
  }

  // 3. Leer todas las llaves y fileIds directamente de la hoja templates
  try {
    var ss = getSpreadsheetInstance_(spreadsheetId);
    var tplSheet = ss ? ss.getSheetByName('templates') : null;
    if (tplSheet) {
      var data = tplSheet.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0];
        var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
        var colValorIdx = getColumnIndexByNameCaseInsensitive(headers, 'Valor', false);
        colClaveIdx = (colClaveIdx ? colClaveIdx - 1 : 0);
        colValorIdx = (colValorIdx ? colValorIdx - 1 : 1);

        for (var i = 1; i < data.length; i++) {
          var rawKey = data[i][colClaveIdx];
          var key = rawKey ? rawKey.toString().trim() : "";
          var rawFileId = data[i][colValorIdx] ? data[i][colValorIdx].toString().trim() : "";
          var fileId = extractDriveId_(rawFileId);
          if (key && key.indexOf("#") !== 0) {
            if (fileId) eliminarChunksPlantillaEstatica_(cache, key, fileId);
            if (rawFileId && rawFileId !== fileId) eliminarChunksPlantillaEstatica_(cache, key, rawFileId);
            eliminarChunksPlantillaEstatica_(cache, key, 'noId');
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Error leyendo hoja templates para limpiar caché: " + e.message);
  }

  // 4. Actualizar versión/timestamp de plantillas para invalidar memoria de clientes abiertos
  try {
    var newVersion = String(Date.now());
    props.setProperty('TEMPLATES_VERSION', newVersion);
    Logger.log("TEMPLATES_VERSION actualizada a: " + newVersion);
  } catch (e) {
    Logger.log("Error actualizando TEMPLATES_VERSION: " + e.message);
  }
}

/**
 * Función para menú o ejecución manual: fuerza la recarga completa del caché de plantillas.
 */
function forzarRecargaPlantillas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ssId = ss ? ss.getId() : null;
  clearInitialDataCache(ssId);
  try {
    getInitialData(ssId);
  } catch(e) {
    Logger.log("Error en pre-warm tras forzar recarga: " + e.message);
  }
  if (ss) {
    ss.toast('✅ Caché de plantillas limpiado y sincronizado.', 'Plantillas', 5);
  }
}

/**
 * Invalida el caché de plantillas y retorna los datos frescos directamente al cliente modal.
 * @param {string} spreadsheetId ID del spreadsheet opcional
 * @returns {Object} Datos iniciales frescos
 */
function forzarRecargaPlantillasCliente(spreadsheetId) {
  try {
    clearInitialDataCache(spreadsheetId);
    return getInitialData(spreadsheetId);
  } catch (err) {
    Logger.log("Error en forzarRecargaPlantillasCliente: " + err.message);
    throw new Error("No se pudo sincronizar las plantillas: " + err.message);
  }
}

/**
 * Retorna la versión actual de las plantillas (timestamp) para que los modales abiertos
 * detecten cambios sin necesidad de descargar todo el payload.
 * @returns {string} Timestamp de la versión actual
 */
function getTemplatesVersion() {
  try {
    return PropertiesService.getScriptProperties().getProperty('TEMPLATES_VERSION') || '0';
  } catch (e) {
    return '0';
  }
}
