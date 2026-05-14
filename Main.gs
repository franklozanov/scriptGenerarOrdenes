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
  // 1. Menú de Administrador (Opciones de seguridad y proxy)
  var adminMenu = SpreadsheetApp.getUi().createMenu('🔒 Opciones Admin')
    .addItem('🚀 Inicializar Sistema Completo', 'promptInitializeApp');

  // 2. Menú de Configuración General
  var configMenu = SpreadsheetApp.getUi().createMenu('⚙️ Configuración')
    .addItem('📊 Diagnosticar Plantillas', 'diagnosticarPlantillas')
    .addItem('🔍 Diagnosticar ConsecutivoImp', 'diagnosticarConsecutivoImp')
    .addSeparator()
    .addSubMenu(adminMenu);

  // 3. Menú Principal (Gestionar OA)
  SpreadsheetApp.getUi().createMenu('Gestionar OA')
    .addItem('📤 Subir documentos', 'abrirModalSubidaGeneral')
    .addItem('🖨️ Imprimir Orden', 'openPrintDialog')
    .addItem('📝 Registrar Entrega / Novedad', 'abrirModalRegistroNovedad')
    .addSeparator()
    .addSubMenu(configMenu)
    .addToUi();
  
  // Cache warmup: precargar datos silenciosamente
  try {
    getInitialData();
    syncVerifCantDisponible();
    SpreadsheetApp.getActiveSpreadsheet().toast('✅ Plantillas estáticas listas.', 'Sistema QMS', 5);
  } catch (e) {
    Logger.log("Error en warmup de caché: " + e.message);
  }
  
  // Verificar y crear botón flotante de Novedad si no existe
  try {
    verificarYCrearBotonFlotante_();
  } catch (e) {
    Logger.log("Error al verificar botón flotante: " + e.message);
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

// --- GESTIÓN DEL BOTÓN FLOTANTE ---

/**
 * Verifica si existe el botón flotante de Novedad y lo crea si no existe.
 * Se ejecuta silenciosamente en onOpen para mantener el botón siempre visible.
 * @private
 */
function verificarYCrearBotonFlotante_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      Logger.log("verificarYCrearBotonFlotante_: Hoja 'Ordenes' no encontrada.");
      return;
    }
    
    // Verificar si ya existe el botón
    var images = sheet.getImages();
    var botonExiste = false;
    
    for (var i = 0; i < images.length; i++) {
      var script = images[i].getScript();
      if (script === 'abrirModalRegistroNovedad') {
        botonExiste = true;
        Logger.log("✓ Botón flotante de Novedad ya existe");
        break;
      }
    }
    
    // Si no existe, crearlo silenciosamente
    if (!botonExiste) {
      Logger.log("Creando botón flotante de Novedad...");
      crearBotonFlotanteNovedad(true); // silent=true
      Logger.log("✓ Botón flotante de Novedad creado automáticamente");
    }
    
  } catch (e) {
    Logger.log("ERROR en verificarYCrearBotonFlotante_: " + e.message);
  }
}
