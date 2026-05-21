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

  if (hasPermissionByRol(validUser.rol, PERMISOS.CARGAR_ORDENES)) {
    mainMenu.addItem('📥 Cargar Nuevas Órdenes', 'abrirModalCargaOrdenes');
    hasMainMenuItems = true;
  }
  
  if (hasPermissionByRol(validUser.rol, PERMISOS.SUBIR_DOCUMENTOS)) {
    mainMenu.addItem('📤 Subir documentos', 'abrirModalSubidaGeneral');
    hasMainMenuItems = true;
  }
  
  if (hasPermissionByRol(validUser.rol, PERMISOS.IMPRIMIR_ORDEN)) {
    mainMenu.addItem('🖨️ Imprimir Orden', 'openPrintDialog');
    hasMainMenuItems = true;
  }
  
  if (hasPermissionByRol(validUser.rol, PERMISOS.REGISTRAR_NOVEDAD)) {
    mainMenu.addItem('📝 Registrar Entrega / Novedad', 'abrirModalRegistroNovedad');
    hasMainMenuItems = true;
  }
  
  if (hasPermissionByRol(validUser.rol, PERMISOS.AUTORIZAR_QA)) {
    mainMenu.addItem('✅ Autorizar Órdenes (QA)', 'abrirModalAutorizarQA');
    hasMainMenuItems = true;
  }

  if (hasPermissionByRol(validUser.rol, PERMISOS.APROBAR_REIMPRESION)) {
    mainMenu.addItem('📋 Aprobar Solicitudes de Impresión', 'abrirModalAprobarImpresion');
    hasMainMenuItems = true;
  }

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
    syncVerifCantDisponible();
    hideUnauthorizedSheets_();
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Sistema listo. Use "Gestionar OA → 📝 Registrar Entrega / Novedad" para registrar novedades.', 'Sistema QMS', 7);
  } catch (e) {
    Logger.log("Error en warmup de caché: " + e.message);
  }
}

// --- SINCRONIZACIÓN DE DATOS ---

/**
 * Sincroniza valores de VerifCant. Disponible a CantDispAFecha al abrir la hoja.
 * Solo actualiza si VerifCant. Disponible tiene un número >= 0 y es diferente a CantDispAFecha.
 */
function syncVerifCantDisponible() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) {
      Logger.log("syncVerifCantDisponible: Hoja 'Ordenes' no encontrada.");
      return;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return; // No hay datos

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Usar getColumnIndexByNameCaseInsensitive (devuelve base-1)
    var verifCantCol = getColumnIndexByNameCaseInsensitive(headers, 'VerifCant. Disponible', false);
    var cantDispCol = getColumnIndexByNameCaseInsensitive(headers, 'CantDispAFecha', false);

    if (!verifCantCol) {
      Logger.log("syncVerifCantDisponible: Columna 'VerifCant. Disponible' no encontrada.");
      return;
    }
    
    if (!cantDispCol) {
      Logger.log("syncVerifCantDisponible: Columna 'CantDispAFecha' no encontrada.");
      return;
    }

    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = dataRange.getValues();
    var updates = [];

    for (var i = 0; i < values.length; i++) {
      var verifCantValue = values[i][verifCantCol - 1]; // -1 para acceso a array base-0
      var cantDispValue = values[i][cantDispCol - 1];

      // Si VerifCant. Disponible es un número >= 0 (no "-")
      if (verifCantValue !== '-' && verifCantValue !== '' && !isNaN(verifCantValue)) {
        var numVerifCant = Number(verifCantValue);
        if (numVerifCant >= 0) {
          // CORRECCIÓN: Solo copiar si 'CantDispAFecha' está vacío, para no sobreescribir datos existentes.
          // Esto asegura que la lógica solo se aplique a filas nuevas o no inicializadas.
          if (cantDispValue === '' || cantDispValue === null || cantDispValue === undefined) {
            updates.push({
              row: i + 2, // +2 porque i empieza en 0 y hay header
              value: numVerifCant
            });
          }
        }
      }
    }

    if (updates.length > 0) {
      Logger.log("syncVerifCantDisponible: Actualizando " + updates.length + " filas.");
      updates.forEach(function(update) {
        sheet.getRange(update.row, cantDispCol).setValue(update.value); // cantDispCol ya es base-1
      });
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Se sincronizaron ' + updates.length + ' valores de Cantidad Disponible.', 
        'Sincronización', 
        3
      );
    } else {
      Logger.log("syncVerifCantDisponible: No se requieren actualizaciones.");
    }
  } catch (e) {
    Logger.log("ERROR en syncVerifCantDisponible: " + e.message);
    Logger.log("Stack trace: " + e.stack);
  }
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
    var emailCol = getColumnIndexByNameCaseInsensitive(headers, 'Correo', false) || getColumnIndexByNameCaseInsensitive(headers, 'Email', false);
    var rolCol = getColumnIndexByNameCaseInsensitive(headers, 'Rol', false);
    
    var emailIdx = emailCol ? emailCol - 1 : 0;
    var rolIdx = rolCol ? rolCol - 1 : 1;
    
    for (var i = 1; i < data.length; i++) {
      var rowEmail = data[i][emailIdx] ? data[i][emailIdx].toString().trim().toLowerCase() : '';
      if (rowEmail === email.toLowerCase()) {
        return {
          email: data[i][emailIdx].toString().trim(),
          rol: data[i][rolIdx].toString().trim()
        };
      }
    }
  } catch (e) {
    Logger.log("Error en getUserRecordByEmail_: " + e.message);
  }
  
  return null;
}
