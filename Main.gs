// ============================================================
// MODULE: Main
// Descripción: Punto de entrada UI (onOpen, menús, modales)
// Prioridad de Carga: 12° (depende de todo)
// FASE 5 - Batch 5.2: Main Entry Point
// ============================================================

// --- TRIGGER PRINCIPAL: onOpen() ---

/**
 * Trigger simple - Captura correo automáticamente.
 * Si el correo no está disponible (usuarios inter-dominio),
 * crea menú de autorización nativa OAuth.
 */
function onOpen() {
  var activeEmail = Session.getActiveUser().getEmail();
  
  if (!activeEmail || activeEmail === "") {
    Logger.log("onOpen: Correo no detectado. Creando menú de autorización nativa.");
    SpreadsheetApp.getUi().createMenu('🔐 Iniciar Sesión')
      .addItem('Autorizar Acceso', 'autorizarUsuarioExterno')
      .addToUi();
      
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Por favor, haz clic en "🔐 Iniciar Sesión" en el menú superior para cargar la aplicación.', 
      'Autorización Requerida', 
      10
    );
    return;
  }
  
  onOpenMain(activeEmail);
}

/**
 * Función ejecutada manualmente por usuarios externos desde el menú.
 * Fuerza a Google a validar los permisos OAuth y captura el correo real.
 */
function autorizarUsuarioExterno() {
  var activeEmail = Session.getActiveUser().getEmail();
  
  if (!activeEmail || activeEmail === "") {
    SpreadsheetApp.getUi().alert(
      '❌ Error de Autorización', 
      'No se pudo obtener la autorización de Google. El sistema no puede identificar su cuenta de correo de forma segura.', 
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Identidad verificada: ' + activeEmail + '. Cargando sistema...', 'Éxito', 3);
  onOpenMain(activeEmail);
}

/**
 * Función centralizadora para construir menús y cargar la aplicación.
 * @param {string} email - Correo del usuario ya detectado y validado.
 */
function onOpenMain(email) {
  var activeEmail = email;
  var validUser = getUserRecordByEmail_(activeEmail);
  
  if (!validUser) {
    SpreadsheetApp.getUi().alert(
      '⛔ ACCESO DENEGADO', 
      'El usuario ' + (activeEmail || 'desconocido') + ' no está autorizado para visualizar o interactuar con este documento.\n\nPor favor contacte al Administrador de QA.', 
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return; // Detiene la creación de menús
  }

  // Diagnóstico de permisos antes de construir menú
  var userPermissions = getUserPermissions(validUser.rol);
  Logger.log("Diagnóstico Menú - Rol: " + validUser.rol + " | Permisos obtenidos: " + JSON.stringify(userPermissions));
  
  if (Object.keys(userPermissions).length === 0) {
    SpreadsheetApp.getUi().toast('⚠️ Atención: Tu rol "' + validUser.rol + '" no tiene permisos configurados. Verifica la hoja PermisosRoles.', 'Sistema de Permisos', 10);
  }

  // 1. Menú de Administrador (Opciones de seguridad y proxy)
  var adminMenu;
  // Fallback de seguridad: El Administrador siempre ve el menú de inicialización (cubriendo variaciones de nombre)
  var rolUpper = validUser.rol ? validUser.rol.toUpperCase() : '';
  var isAdminFallback = (rolUpper === 'ADMINISTRADOR' || rolUpper === 'ADMIN' || rolUpper === 'ADMINISTRADOR DE SISTEMA');
  
  if (hasPermissionByRol(validUser.rol, PERMISOS.MENU_ADMIN) || isAdminFallback) {
    adminMenu = SpreadsheetApp.getUi().createMenu('🔒 Opciones Admin')
      .addItem('🚀 Inicializar Sistema Completo', 'promptInitializeApp');
  }

  // 2. Menú de Configuración General
  var configMenu;
  if (hasPermissionByRol(validUser.rol, PERMISOS.MENU_CONFIG)) {
    configMenu = SpreadsheetApp.getUi().createMenu('⚙️ Configuración')
      .addItem('📊 Diagnosticar Plantillas', 'diagnosticarPlantillas')
      .addItem('🔍 Diagnosticar ConsecutivoImp', 'diagnosticarConsecutivoImp');
  }

  // 3. Menú Principal (Gestionar OA) - Construido condicionalmente según permisos
  var mainMenu = SpreadsheetApp.getUi().createMenu('Gestionar OA');
  
  var hasMainMenuItems = false;

  // Fase 3: Migración a Sidebar SPA
  mainMenu.addItem('🎛️ Abrir Panel Principal QMS', 'abrirSidebarQMS');
  hasMainMenuItems = true;

  if (configMenu) {
    mainMenu.addSeparator().addSubMenu(configMenu);
    hasMainMenuItems = true;
  }

  if (adminMenu) {
    mainMenu.addSeparator().addSubMenu(adminMenu);
    hasMainMenuItems = true;
  }
  
  if (!hasMainMenuItems) {
    mainMenu.addItem('🚫 Sin opciones disponibles', 'mostrarAlertaSinPermisos');
  }
  
  mainMenu.addToUi();
  
  // Cache warmup: precargar datos silenciosamente
  try {
    getInitialData();
    // syncVerifCantDisponible() OBSOLETO: el snapshot de CantDispAFecha
    // ahora se captura en el backend al crear la orden (Fase 3 MatrixValidation).
    hideUnauthorizedSheets_();
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Sistema listo. Abriendo Panel Principal...', 'Sistema QMS', 3);
    
    // Abrir Sidebar automáticamente al iniciar la hoja
    abrirSidebarQMS();
  } catch (e) {
    Logger.log("Error en warmup de caché: " + e.message);
  }
}

/**
 * @deprecated Fase 3: Esta función fue reemplazada por el motor de validación backend
 * (MatrixValidation.gs → validarNoAnalisisContraMatrices). El snapshot de CantDispAFecha
 * ahora se escribe en el momento exacto de la carga masiva de órdenes. Esta función
 * se mantiene como referencia histórica pero NO debe llamarse.
 */
function syncVerifCantDisponible() {
  Logger.log('syncVerifCantDisponible: FUNCIÓN OBSOLETA. El snapshot ahora lo maneja el backend en procesarCargaOrdenesMasivas.');
}

/**
 * Oculta todas las hojas del documento excepto las permitidas para el flujo operativo.
 */
function hideUnauthorizedSheets_() {
  try {
    var allowedSheets = ['Ordenes', 'RegistroNovedad', 'SolicitudesImpresion'];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var sheetName = sheet.getName();
      
      if (allowedSheets.indexOf(sheetName) === -1) {
        if (!sheet.isSheetHidden()) {
          sheet.hideSheet();
        }
      }
    }
  } catch (e) {
    Logger.log("ERROR en hideUnauthorizedSheets_: " + e.message);
  }
}

/**
 * Función de fallback cuando el menú no tiene opciones por falta de permisos.
 */
function mostrarAlertaSinPermisos() {
  SpreadsheetApp.getUi().alert(
    'Sin Permisos', 
    'Tu rol actual no tiene habilitada ninguna acción para este menú.', 
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ============================================================
// 🛠️ HERRAMIENTA DE DIAGNÓSTICO PROFUNDO (ROOT CAUSE ANALYSIS)
// Ejecutar esta función manualmente desde el editor de Apps Script
// ============================================================
function runDeepDiagnosticAdmin() {
  Logger.log("=== INICIANDO DIAGNÓSTICO PROFUNDO DE PERMISOS ===");
  
  var email = Session.getActiveUser().getEmail();
  Logger.log("1. Usuario Activo: '" + email + "'");
  
  // 1. Verificar registro del usuario
  var validUser = getUserRecordByEmail_(email);
  Logger.log("2. Objeto validUser recuperado: " + JSON.stringify(validUser));
  if (!validUser) {
    Logger.log("❌ FALLO CRÍTICO: validUser es null o undefined.");
    return;
  }
  
  // 2. Verificar string exacto del rol (revelar espacios ocultos)
  var rol = validUser.rol;
  Logger.log("3. Rol crudo: '" + rol + "' | Longitud: " + (rol ? rol.length : 0));
  Logger.log("4. Rol en uppercase: '" + (rol ? rol.toUpperCase() : 'NULO') + "'");
  Logger.log("5. Car codes del rol: " + (rol ? rol.split('').map(function(c) { return c.charCodeAt(0); }).join(' ') : 'NULO'));
  
  // 6. Verificar estado de las constantes
  Logger.log("6. Constante PERMISOS.MENU_ADMIN tiene valor: '" + (typeof PERMISOS !== 'undefined' ? PERMISOS.MENU_ADMIN : 'INDEFINIDO') + "'");
  
  // 7. Verificar mapa de permisos extraído de la hoja
  var userPermissions = getUserPermissions(rol);
  Logger.log("7. Mapa de permisos devuelto por getUserPermissions: " + JSON.stringify(userPermissions));
  
  if (userPermissions && typeof PERMISOS !== 'undefined') {
    var permisoEspecifico = userPermissions[PERMISOS.MENU_ADMIN];
    Logger.log("8. Valor extraído para MENU_ADMIN en el mapa: " + permisoEspecifico + " (Tipo de dato: " + typeof permisoEspecifico + ")");
  }
  
  // 9. Probar la función evaluadora final
  var hasPerm = hasPermissionByRol(rol, typeof PERMISOS !== 'undefined' ? PERMISOS.MENU_ADMIN : null);
  Logger.log("9. Resultado final de hasPermissionByRol(): " + hasPerm + " (Tipo de dato: " + typeof hasPerm + ")");
  
  // 10. Verificar fallback de admin
  var rolUpper = rol ? rol.toUpperCase() : '';
  var isAdminFallback = (rolUpper === 'ADMINISTRADOR' || rolUpper === 'ADMIN' || rolUpper === 'ADMINISTRADOR DE SISTEMA');
  Logger.log("10. Resultado de isAdminFallback: " + isAdminFallback);
  
  // 11. Verificar caché
  var cache = CacheService.getScriptCache();
  var cacheKey = 'Permisos_' + rol;
  var cachedPermissions = cache.get(cacheKey);
  Logger.log("11. Caché existe: " + (cachedPermissions ? 'SÍ' : 'NO'));
  if (cachedPermissions) {
    Logger.log("12. Contenido del caché: " + cachedPermissions);
  }
  
  Logger.log("=== FIN DEL DIAGNÓSTICO ===");
}

/**
 * Utilidad para limpiar el caché de permisos si el diagnóstico lo requiere (Paso 3).
 */
function clearPermissionsCache() {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['Permisos_ADMINISTRADOR', 'Permisos_ADMIN', 'Permisos_Administrador de Sistema']);
  Logger.log("Caché de permisos limpiado");
}

/**
 * Busca al usuario en la hoja 'Usuarios' por su correo electrónico.
 * (Implementación de la función faltante)
 * @param {string} email - Correo del usuario activo.
 * @returns {Object|null} Objeto con {email, rol} o null si no se encuentra.
 */
function getUserRecordByEmail_(email) {
  if (!email) return null;
  
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Usuarios');
    if (!sheet) {
      Logger.log("❌ Error: No se encontró la hoja 'Usuarios'");
      return null;
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null; // No hay registros
    
    var headers = data[0];
    
    // Usar la función utilitaria existente para buscar columnas, o por defecto A (0) y B (1)
    var userIdCol = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
    var emailCol = getColumnIndexByNameCaseInsensitive(headers, 'Correo', false) || getColumnIndexByNameCaseInsensitive(headers, 'Email', false);
    var rolCol = getColumnIndexByNameCaseInsensitive(headers, 'Rol', false);
    var estadoCol = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);
    var nombreCol = getColumnIndexByNameCaseInsensitive(headers, 'Nombre Completo', false);
    var cortoCol = getColumnIndexByNameCaseInsensitive(headers, 'NombreCorto', false);
    
    var userIdIdx = userIdCol ? userIdCol - 1 : 0;
    var emailIdx = emailCol ? emailCol - 1 : 0;
    var rolIdx = rolCol ? rolCol - 1 : 1;
    var estadoIdx = estadoCol ? estadoCol - 1 : 2; // Asumir col C si no se encuentra
    var nombreIdx = nombreCol ? nombreCol - 1 : null;
    var cortoIdx = cortoCol ? cortoCol - 1 : null;
    
    for (var i = 1; i < data.length; i++) {
      var rowEmail = data[i][emailIdx] ? data[i][emailIdx].toString().trim().toLowerCase() : '';
      if (rowEmail === email.toLowerCase()) {
        return {
          userId: data[i][userIdIdx] ? data[i][userIdIdx].toString().trim() : '',
          email: data[i][emailIdx].toString().trim(),
          rol: data[i][rolIdx].toString().trim(),
          estado: data[i][estadoIdx] ? data[i][estadoIdx].toString().trim() : 'Activo', // Por defecto Activo si no hay columna
          nombreCompleto: nombreIdx !== null && data[i][nombreIdx] ? data[i][nombreIdx].toString().trim() : '',
          nombreCorto: cortoIdx !== null && data[i][cortoIdx] ? data[i][cortoIdx].toString().trim() : ''
        };
      }
    }
  } catch (e) {
    Logger.log("Error en getUserRecordByEmail_: " + e.message);
  }
  
  return null;
}
