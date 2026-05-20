// ============================================================
// MODULE: Main
// Descripción: Punto de entrada UI (onOpen, menús, modales)
// Prioridad de Carga: 12° (depende de todo)
// FASE 5 - Batch 5.2: Main Entry Point
// ============================================================

// --- TRIGGER PRINCIPAL: onOpen() ---

/**
 * Trigger que se ejecuta al abrir el libro de trabajo.
 * Crea los menús de la aplicación y precarga datos en caché.
 */
function onOpen() {
  var activeEmail = Session.getActiveUser().getEmail();
  var validUser = getUserRecordByEmail_(activeEmail); // Función a implementar que busque en 'Usuarios'
  
  if (!validUser) {
    SpreadsheetApp.getUi().alert(
      '⛔ ACCESO DENEGADO', 
      'El usuario ' + (activeEmail || 'desconocido') + ' no está autorizado para visualizar o interactuar con este documento.\n\nPor favor contacte al Administrador de QA.', 
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return; // Detiene la creación de menús
  }

  // 1. Menú de Administrador (Opciones de seguridad y proxy)
  var adminMenu;
  // Fallback de seguridad: El Administrador siempre ve el menú de inicialización
  var isAdminFallback = validUser.rol === 'Administrador';
  if (hasPermission(validUser.userId, PERMISOS.MENU_ADMIN) || isAdminFallback) {
    adminMenu = SpreadsheetApp.getUi().createMenu('🔒 Opciones Admin')
      .addItem('🚀 Inicializar Sistema Completo', 'promptInitializeApp');
  }

  // 2. Menú de Configuración General
  var configMenu;
  if (hasPermission(validUser.userId, PERMISOS.MENU_CONFIG)) {
    configMenu = SpreadsheetApp.getUi().createMenu('⚙️ Configuración')
      .addItem('📊 Diagnosticar Plantillas', 'diagnosticarPlantillas')
      .addItem('🔍 Diagnosticar ConsecutivoImp', 'diagnosticarConsecutivoImp');
    
    if (adminMenu) {
      configMenu.addSeparator().addSubMenu(adminMenu);
    }
  }

  // 3. Menú Principal (Gestionar OA) - Construido condicionalmente según permisos
  var mainMenu = SpreadsheetApp.getUi().createMenu('Gestionar OA');
  
  if (hasPermission(validUser.userId, PERMISOS.CARGAR_ORDENES)) {
    mainMenu.addItem('📥 Cargar Nuevas Órdenes', 'abrirModalCargaOrdenes');
  }
  
  if (hasPermission(validUser.userId, PERMISOS.SUBIR_DOCUMENTOS)) {
    mainMenu.addItem('📤 Subir documentos', 'abrirModalSubidaGeneral');
  }
  
  if (hasPermission(validUser.userId, PERMISOS.IMPRIMIR_ORDEN)) {
    mainMenu.addItem('🖨️ Imprimir Orden', 'openPrintDialog');
  }
  
  if (hasPermission(validUser.userId, PERMISOS.REGISTRAR_NOVEDAD)) {
    mainMenu.addItem('📝 Registrar Entrega / Novedad', 'abrirModalRegistroNovedad');
  }
  
  if (configMenu) {
    mainMenu.addSeparator().addSubMenu(configMenu);
  }
  
  mainMenu.addToUi();
  
  // Cache warmup: precargar datos silenciosamente
  try {
    getInitialData();
    syncVerifCantDisponible();
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
