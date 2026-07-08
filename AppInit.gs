// ============================================================
// MODULE: AppInit
// Descripción: Inicialización y validación de estructura del sistema
// Prioridad de Carga: 11° (depende de casi todo)
// FASE 5 - Batch 5.1: App Initialization
// ============================================================

// --- PROMPT CON AUTENTICACIÓN ADMIN ---

/**
 * Prompt para inicializar el sistema completo (requiere contraseña de admin).
 */
function promptInitializeApp() {
  withAdminAuth('Inicializar Sistema Completo (Admin)', function(ui) {
    initializeCompleteSystem(ui);
  });
}

// --- INICIALIZACIÓN BÁSICA ---

/**
 * Inicializa la aplicación validando estructura y corrigiendo problemas.
 * @param {Ui} ui - Objeto UI de SpreadsheetApp
 */
function initializeApp(ui) {
  if (!ui) ui = SpreadsheetApp.getUi();
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
    
    // Asegurar estructura y dropdowns de Matrices K (Prioridad y Activa)
    try {
      if (typeof ensureMatricesConfigSheet_ === 'function') {
        ensureMatricesConfigSheet_();
      }
    } catch (e) {
      Logger.log("⚠️ Error inicializando MatricesConfig desde initializeApp: " + e.message);
    }
    
    ui.alert('✅ Inicialización completada. Estructura y validaciones corregidas.\n\nIMPORTANTE: Si está actualizando desde una versión anterior, ejecute la función "migrarAdjuntoOrdenANuevasColumnas" desde el menú Script Editor.');

    // Registrar inicialización en Logs si existe
    logInitialization();
  }
}

// --- INICIALIZACIÓN COMPLETA DEL SISTEMA ---

/**
 * Inicializa el sistema completo: estructura, Web App URL, protecciones, auditoría y diagnósticos.
 * @param {Ui} ui - Objeto UI de SpreadsheetApp
 */
function initializeCompleteSystem(ui) {
  if (!ui) ui = SpreadsheetApp.getUi();
  var summary = [];
  
  // Limpiar caché al inicio para forzar recarga de plantillas actualizadas
  try {
    clearInitialDataCache();
    summary.push("✓ Caché de plantillas limpiado");
  } catch (e) {
    summary.push("✗ Error limpiando caché: " + e.message);
  }
  
  try {
    initializeWorkbookStructure_(ui);
    summary.push("✓ Estructura de hojas validada/corregida");
  } catch (e) {
    summary.push("✗ Error en estructura: " + e.message);
    throw e;
  }

  try {
    ensureMatricesConfigSheet_();
    summary.push("✓ Hoja de configuración de Matrices K verificada/creada");
  } catch (e) {
    summary.push("✗ Error en hoja Matrices K: " + e.message);
    // No se lanza: es no-crítico para el resto del sistema
  }

  try {
    ensureWebAppUrlConfigured_(ui);
    summary.push("✓ URL de Web App configurada");
  } catch (e) {
    summary.push("✗ Error configurando Web App URL: " + e.message);
    throw e;
  }

  try {
    applyNewProtectionScheme();
    summary.push("✓ Nuevo esquema de protección aplicado");
  } catch (e) {
    summary.push("✗ Error aplicando protecciones: " + e.message);
    throw e;
  }

  try {
    setupAuditTrailTrigger();
    summary.push("✓ Auditoría activada/verificada");
  } catch (e) {
    summary.push("✗ Error activando auditoría: " + e.message);
    throw e;
  }

  try {
    aplicarValidacionesEstadoCarga(true); // silent=true para evitar error de UI en inicialización
    summary.push("✓ Validaciones de estado de carga aplicadas");
  } catch (e) {
    summary.push("⚠️ Validaciones de estado: " + e.message);
  }

  try {
    applyStatusDataValidation(true); // silent=true para evitar error de UI en inicialización
    summary.push("✓ Validaciones y colores de STATUS aplicados");
  } catch (e) {
    summary.push("⚠️ Validaciones de STATUS: " + e.message);
  }


  // Migración de Seguridad de PIN y Bloqueo — requiere confirmación explícita, ya que
  // puede reiniciar a "PENDIENTE" cualquier valor de Clave que no sea ya un hash válido
  // (esto forzaría a esos usuarios a crear un PIN nuevo en su próximo inicio de sesión).
  var confirmarMigracionPin = ui.alert(
    "Migración de Seguridad de PIN",
    "¿Desea ejecutar la migración de seguridad de PIN ahora?\n\n" +
    "Esto normalizará la hoja 'Usuarios': cualquier valor de la columna 'Clave' que no sea ya " +
    "un PIN encriptado válido se reiniciará a \"PENDIENTE\" (el usuario deberá crear un PIN nuevo " +
    "en su próximo inicio de sesión). Los PIN ya encriptados correctamente NO se modifican.\n\n" +
    "Si está en medio de otra migración de cambios y prefiere posponer este paso, seleccione \"No\".",
    ui.ButtonSet.YES_NO
  );

  if (confirmarMigracionPin === ui.Button.YES) {
    try {
      migrarSeguridadPIN();
      summary.push("✓ Seguridad PIN encriptado migrada");
    } catch (e) {
      summary.push("⚠️ Migración Seguridad PIN: " + e.message);
    }
  } else {
    summary.push("⏭️ Migración de Seguridad PIN omitida (seleccionado por el usuario)");
  }

  // Migración de datos históricos (Fase 5): congelar IMPORTRANGE obsoletos
  try {
    var migracionResult = migrarFormulasAValoresEstaticos_();
    if (migracionResult.filasMigradas > 0) {
      summary.push("✓ Migración histórica: " + migracionResult.filasMigradas + " fila(s) con fórmulas congeladas a valores estáticos");
    } else {
      summary.push("✓ Migración histórica: Sin pendientes (datos ya estáticos)");
    }
  } catch (e) {
    summary.push("⚠️ Migración histórica: " + e.message);
  }

  try {
    logInitialization();
  } catch (e) {
    Logger.log("No se pudo registrar inicialización completa: " + e.message);
  }

  ui.alert("✅ Sistema inicializado completamente:\n\n" + summary.join("\n"));
}

/**
 * Wrapper invocable desde el sidebar (google.script.run) para inicializar el sistema completo.
 * El menú de la hoja usa promptInitializeApp; el botón del panel lateral usa esta función.
 * Verifica que el llamador sea administrador y reutiliza initializeCompleteSystem.
 * @returns {string} Mensaje de resultado para mostrar en el sidebar.
 * @throws {Error} Si el usuario no es administrador.
 */
function inicializarSistemaCompleto() {
  var email = "";
  try { email = Session.getActiveUser().getEmail(); } catch (e) {}
  var user = email ? getUserRecordByEmail_(email) : null;
  var rolUpper = user && user.rol ? user.rol.toString().toUpperCase() : "";
  var esAdmin = (rolUpper === 'ADMIN' || rolUpper === 'ADMINISTRADOR' || rolUpper === 'ADMINISTRADOR DE SISTEMA')
    || (user && hasPermissionByRol(user.rol, PERMISOS.MENU_ADMIN));

  if (!esAdmin) {
    throw new Error("ACCESO DENEGADO: Solo un administrador puede inicializar el sistema.");
  }

  initializeCompleteSystem(SpreadsheetApp.getUi());
  return "✅ Sistema inicializado: hojas, columnas, permisos, protecciones y validaciones aplicadas.";
}

// --- FUNCIONES AUXILIARES DE INICIALIZACIÓN ---

/**
 * Inicializa la estructura del libro de trabajo (hojas y encabezados).
 * @param {Ui} ui - Objeto UI de SpreadsheetApp
 * @private
 */
function initializeWorkbookStructure_(ui) {
  if (!ui) ui = SpreadsheetApp.getUi();
  var report = validateStructure();
  if (report.missingSheets.length > 0) {
    createMissingSheets(ui);
  }
  if (report.incorrectHeaders.length > 0) {
    fixHeaders(ui);
  }
}

/**
 * Asegura que la URL de la Web App esté configurada.
 * @param {Ui} ui - Objeto UI de SpreadsheetApp
 * @returns {string} URL configurada
 * @private
 */
function ensureWebAppUrlConfigured_(ui) {
  if (!ui) ui = SpreadsheetApp.getUi();
  var savedUrl = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  
  // Si ya existe URL configurada, preguntar si desea mantenerla o modificarla
  if (savedUrl) {
    var confirmMessage = "URL de Web App ya configurada:\n\n" + savedUrl + "\n\n¿Desea mantener esta URL?";
    var confirmResponse = ui.alert("Configuración Web App URL", confirmMessage, ui.ButtonSet.YES_NO);
    
    if (confirmResponse === ui.Button.YES) {
      Logger.log("✓ URL de Web App mantenida: " + savedUrl);
      return savedUrl;
    }
  }
  
  // Intentar obtener URL automáticamente
  var currentUrl = "";
  try {
    currentUrl = ScriptApp.getService().getUrl();
  } catch (e) {
    Logger.log("No se pudo obtener URL automática de Web App: " + e.message);
  }

  if (currentUrl && !savedUrl) {
    setWebAppUrl(currentUrl);
    Logger.log("✓ URL de Web App configurada automáticamente: " + currentUrl);
    return currentUrl;
  }

  // Solicitar URL manualmente
  var promptMessage = "Ingrese la URL del despliegue Web App (debe terminar en /exec):";
  
  if (savedUrl) {
    promptMessage += "\n\nURL anterior:\n" + savedUrl;
  }
  
  if (currentUrl) {
    promptMessage += "\n\nURL detectada automáticamente:\n" + currentUrl + "\n\n(Puede copiar esta URL o ingresar otra)";
  }

  var response = ui.prompt("Configurar Web App URL", promptMessage, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    if (savedUrl) {
      Logger.log("✓ Configuración cancelada, manteniendo URL anterior: " + savedUrl);
      return savedUrl;
    }
    throw new Error("Configuración de Web App URL cancelada por el usuario.");
  }

  var enteredUrl = response.getResponseText().trim();
  
  // Si no ingresó nada, usar la URL detectada automáticamente o la guardada
  if (!enteredUrl) {
    if (currentUrl) {
      setWebAppUrl(currentUrl);
      Logger.log("✓ URL de Web App configurada con URL detectada: " + currentUrl);
      return currentUrl;
    } else if (savedUrl) {
      Logger.log("✓ Manteniendo URL anterior: " + savedUrl);
      return savedUrl;
    } else {
      throw new Error("Debe ingresar una URL de Web App válida.");
    }
  }

  setWebAppUrl(enteredUrl);
  Logger.log("✓ URL de Web App configurada manualmente: " + enteredUrl);
  return enteredUrl;
}

// --- VALIDACIÓN DE ESTRUCTURA ---

/**
 * Valida la estructura del libro de trabajo (hojas y encabezados).
 * @returns {Object} Reporte con hojas faltantes y encabezados incorrectos
 */
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

// --- CREACIÓN Y CORRECCIÓN DE HOJAS ---

/**
 * Crea las hojas faltantes con sus encabezados.
 * @param {Ui} ui - Objeto UI de SpreadsheetApp
 */
function createMissingSheets(ui) {
  if (!ui) ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var sheetName in REQUIRED_SHEETS) {
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, REQUIRED_SHEETS[sheetName].length).setValues([REQUIRED_SHEETS[sheetName]]);
      Logger.log("✓ Hoja creada: " + sheetName);
      
      // Si se creó PermisosRoles, insertar filas de ejemplo
      if (sheetName === 'PermisosRoles') {
        // Columnas: Rol, MENU_ADMIN, MENU_CONFIG, CARGAR_ORDENES, SUBIR_DOCUMENTOS,
        // REGISTRAR_NOVEDAD, IMPRIMIR_ORDEN, SOLICITAR_REIMPRESION, APROBAR_REIMPRESION,
        // AUTORIZAR_QA, GESTIONAR_AUTOAPROBACION
        var permCols = REQUIRED_SHEETS['PermisosRoles'].length;
        sheet.getRange(2, 1, 1, permCols).setValues([['ADMIN', true, true, true, true, true, true, true, true, true, true]]);
        sheet.getRange(3, 1, 1, permCols).setValues([['QA', true, false, true, true, true, true, true, true, true, true]]);
        sheet.getRange(4, 1, 1, permCols).setValues([['STANDARD', false, false, false, true, true, true, true, false, false, false]]);
        Logger.log("✓ Filas de ejemplo insertadas en PermisosRoles");
      }
    }
  }
}

/**
 * Corrige los encabezados de las hojas existentes.
 * @param {Ui} ui - Objeto UI de SpreadsheetApp
 */
function fixHeaders(ui) {
  if (!ui) ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var sheetName in REQUIRED_SHEETS) {
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) continue;
    
    // Verificar ConsecutivoImp en hoja Ordenes
    if (sheetName === 'Ordenes') {
      try {
        var columnCreated = ensureConsecutivoImpColumn_(sheet);
        if (columnCreated) {
          Logger.log('✓ Columna ConsecutivoImp agregada a Ordenes');
        }
      } catch (e) {
        Logger.log('⚠️ Error al verificar ConsecutivoImp: ' + e.message);
        ui.alert('Error', 'No se pudo verificar/crear la columna ConsecutivoImp: ' + e.message, ui.ButtonSet.OK);
      }
    }
    
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
    
    if (!headersMatch && missingHeaders.length > 0) {
      // Agregar los encabezados faltantes al final de las columnas existentes sin sobreescribir
      var lastCol = sheet.getLastColumn();
      var startCol = lastCol === 0 ? 1 : lastCol + 1; // Manejo por si la hoja está totalmente en blanco
      
      sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
      Logger.log("✓ Encabezados faltantes agregados al final en la hoja " + sheetName + ": " + missingHeaders.join(", "));
      
      // Si la hoja es PermisosRoles, inicializar los nuevos permisos en 'true' para los administradores
      if (sheetName === 'PermisosRoles' && sheet.getLastRow() > 1) {
        var rolesData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
        for (var r = 0; r < rolesData.length; r++) {
          var roleName = (rolesData[r][0] || '').toString().toUpperCase();
          if (roleName === 'ADMIN' || roleName === 'ADMINISTRADOR' || roleName === 'ADMINISTRADOR DE SISTEMA') {
            var trues = [];
            for (var k = 0; k < missingHeaders.length; k++) trues.push(true);
            sheet.getRange(r + 2, startCol, 1, missingHeaders.length).setValues([trues]);
          } else {
            // Para los demás, por seguridad es false
            var falses = [];
            for (var k = 0; k < missingHeaders.length; k++) falses.push(false);
            sheet.getRange(r + 2, startCol, 1, missingHeaders.length).setValues([falses]);
          }
        }
      }
    }
  }
}

// --- VALIDACIONES DE DATOS ---

/**
 * Aplica validaciones de datos tipo dropdown a las columnas de estado de carga.
 * Asegura que solo se usen valores predefinidos en AdjuntoCOA, AdjuntoOA y EstadoCarga.
 * 
 * IMPORTANTE: Ejecutar después de agregar las columnas o cuando se necesite reforzar las validaciones.
 * @param {boolean} silent - Si es true, no muestra mensajes de UI (para uso en inicialización)
 */
function aplicarValidacionesEstadoCarga(silent) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Obtener índices de columnas
    var colAdjuntoCOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
    var colAdjuntoOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
    var colEstadoCargaIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoCarga', false);
    
    if (!colAdjuntoCOAIdx || !colAdjuntoOAIdx || !colEstadoCargaIdx) {
      throw new Error("No se encontraron las columnas AdjuntoCOA, AdjuntoOA o EstadoCarga. Asegúrese de que existan.");
    }
    
    var lastRow = sheet.getMaxRows();
    
    // Valores permitidos para AdjuntoCOA y AdjuntoOA (usar constantes de Config.gs)
    var valoresDocumento = [VALORES_DOCUMENTO.PENDIENTE, VALORES_DOCUMENTO.CARGADO];
    var ruleDocumento = SpreadsheetApp.newDataValidation()
      .requireValueInList(valoresDocumento, true)
      .setAllowInvalid(false)
      .setHelpText("Seleccione: " + valoresDocumento.join(" o "))
      .build();
    
    // Valores permitidos para EstadoCarga (usar constantes de Config.gs)
    var valoresEstadoCarga = [
      VALORES_ESTADO_CARGA.PENDIENTE_AMBOS,
      VALORES_ESTADO_CARGA.PENDIENTE_OA,
      VALORES_ESTADO_CARGA.PENDIENTE_COA,
      VALORES_ESTADO_CARGA.CARGADOS
    ];
    var ruleEstadoCarga = SpreadsheetApp.newDataValidation()
      .requireValueInList(valoresEstadoCarga, true)
      .setAllowInvalid(false)
      .setHelpText("Estado calculado automáticamente. Valores: " + valoresEstadoCarga.join(", "))
      .build();
    
    // Aplicar validación a AdjuntoCOA (desde fila 2 hasta el final)
    var rangeCOA = sheet.getRange(2, colAdjuntoCOAIdx, lastRow - 1, 1);
    rangeCOA.setDataValidation(ruleDocumento);
    Logger.log("✓ Validación aplicada a columna AdjuntoCOA");
    
    // Aplicar validación a AdjuntoOA
    var rangeOA = sheet.getRange(2, colAdjuntoOAIdx, lastRow - 1, 1);
    rangeOA.setDataValidation(ruleDocumento);
    Logger.log("✓ Validación aplicada a columna AdjuntoOA");
    
    // Aplicar validación a EstadoCarga
    var rangeEstado = sheet.getRange(2, colEstadoCargaIdx, lastRow - 1, 1);
    rangeEstado.setDataValidation(ruleEstadoCarga);
    Logger.log("✓ Validación aplicada a columna EstadoCarga");
    
    // Mostrar mensaje al usuario solo si no es modo silencioso
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        ui.alert(
          '✅ Validaciones Aplicadas',
          'Se aplicaron validaciones de datos tipo dropdown a las columnas:\n\n' +
          '• AdjuntoCOA: Pendiente, ✅ Cargado\n' +
          '• AdjuntoOA: Pendiente, ✅ Cargado\n' +
          '• EstadoCarga: Pendiente COA/OA, Pendiente OA, Pendiente COA, ✅ Cargados\n\n' +
          'Ahora solo se podrán ingresar valores válidos en estas columnas.',
          ui.ButtonSet.OK
        );
      } catch (uiError) {
        Logger.log("No se pudo mostrar mensaje UI (contexto sin UI): " + uiError.message);
      }
    }
    
    return {
      status: 'success',
      message: 'Validaciones aplicadas correctamente'
    };
    
  } catch (e) {
    Logger.log("ERROR al aplicar validaciones: " + e.message);
    
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

/**
 * Prompt para aplicar validaciones con autenticación admin.
 */
function promptAplicarValidacionesEstadoCarga() {
  withAdminAuth('Aplicar Validaciones de Estado de Carga', function(ui) {
    aplicarValidacionesEstadoCarga();
  });
}

// --- LOGGING ---

/**
 * Registra la inicialización del sistema en la hoja Logs.
 */
function logInitialization() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetLogs = ss.getSheetByName('Logs');
  
  if (!sheetLogs) {
    // Crear hoja Logs si no existe
    sheetLogs = ss.insertSheet('Logs');
    sheetLogs.getRange(1, 1, 1, 4).setValues([['Fecha', 'Usuario', 'TipoCambio', 'DescripcionCambio']]);
  }
  
  var timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var user = "Sistema";
  var tipoCambio = "INICIALIZACION";
  var descripcion = "Inicialización de estructura del libro de trabajo";
  
  sheetLogs.appendRow([timestamp, user, tipoCambio, descripcion]);
  Logger.log("✓ Inicialización registrada en Logs");
}

// --- MIGRACIÓN HISTÓRICA ---

/**
 * Congela las fórmulas IMPORTRANGE históricas de las columnas de validación
 * (VerifLote, VerifCant. Disponible, VerifExp, Fabricante, Decision, CantDispAFecha)
 * pasándolas a valores estáticos inmutables.
 *
 * Es IDEMPOTENTE: las filas que ya tienen valores estáticos (o que ya fueron migradas)
 * son detectadas y omitidas. Se puede llamar múltiples veces sin riesgo.
 *
 * @returns {{ filasMigradas: number, filasOmitidas: number }}
 * @private
 */
function migrarFormulasAValoresEstaticos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ordenes');
  if (!sheet) return { filasMigradas: 0, filasOmitidas: 0 };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { filasMigradas: 0, filasOmitidas: 0 };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Columnas que se deben congelar (si tienen fórmula IMPORTRANGE o similar)
  var colsACongelar = [
    'VerifLote',
    'VerifCant. Disponible',
    'VerifExp',
    'Fabricante',
    'Decision',
    'CantDispAFecha'
  ];

  // Resolver índices de columna (base-1). Omitir las que no existan aún.
  var colIndices = {};
  colsACongelar.forEach(function(nombre) {
    var idx = getColumnIndexByNameCaseInsensitive(headers, nombre, false);
    if (idx) colIndices[nombre] = idx;
  });

  if (Object.keys(colIndices).length === 0) {
    Logger.log('migrarFormulasAValoresEstaticos_: Ninguna columna de validación encontrada. Sin acción.');
    return { filasMigradas: 0, filasOmitidas: 0 };
  }

  var filasMigradas = 0;
  var filasOmitidas = 0;

  // Leer formulas y valores en bloque (una sola llamada a la API por columna)
  var colNombres = Object.keys(colIndices);
  for (var c = 0; c < colNombres.length; c++) {
    var nombre = colNombres[c];
    var colIdx = colIndices[nombre];

    var rangeData = sheet.getRange(2, colIdx, lastRow - 1, 1);
    var formulas  = rangeData.getFormulas();   // Fórmula cruda si la hay, "" si es valor
    var values    = rangeData.getValues();     // Valor evaluado actual

    var updates = []; // { row: Number, value: any }

    for (var r = 0; r < formulas.length; r++) {
      var formula = formulas[r][0];
      var value   = values[r][0];

      // Solo actuar si la celda TIENE una fórmula (es decir, está usando IMPORTRANGE u otra)
      if (formula && formula.toString().trim().length > 0) {
        updates.push({ row: r + 2, value: value }); // +2: fila real (header en fila 1)
      }
    }

    // Escribir en batch las celdas que tenían fórmula
    if (updates.length > 0) {
      updates.forEach(function(u) {
        sheet.getRange(u.row, colIdx).setValue(u.value);
      });
      filasMigradas = Math.max(filasMigradas, updates.length);
      Logger.log('migrarFormulasAValoresEstaticos_: ' + updates.length + ' celda(s) congeladas en columna "' + nombre + '"');
    } else {
      filasOmitidas++;
    }
  }

  if (filasMigradas > 0) {
    logChange(
      'MIGRACION_FORMULAS',
      'Fórmulas históricas congeladas como valores estáticos. Columnas: ' + colNombres.join(', ') + '. Filas afectadas: ~' + filasMigradas,
      'Sistema'
    );
  }

  return { filasMigradas: filasMigradas, filasOmitidas: filasOmitidas };
}
