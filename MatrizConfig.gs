// ============================================================
// MODULE: MatrizConfig
// Descripción: Motor de configuración y lectura de Matrices K externas.
//   - Creación y mantenimiento de la hoja Sys_MatricesConfig
//   - CRUD de configuración de matrices desde el backend
//   - Función principal de lectura de matrices activas ordenadas por prioridad
// Prioridad de Carga: 2° (depende solo de Config.gs)
// ============================================================

// -------------------------------------------------------
// SECCIÓN 1: CREACIÓN Y MANTENIMIENTO DE LA HOJA
// -------------------------------------------------------

/**
 * Asegura que la hoja Sys_MatricesConfig exista con los encabezados correctos.
 * Si no existe, la crea. Si ya existe, verifica integridad de encabezados.
 * Es idempotente: puede llamarse múltiples veces sin riesgo.
 * @returns {Sheet} La hoja Sys_MatricesConfig
 */
function ensureMatricesConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SYS_MATRICES_SHEET_NAME);

  if (!sheet) {
    // Crear la hoja al final del libro
    sheet = ss.insertSheet(SYS_MATRICES_SHEET_NAME);

    // Escribir encabezados
    sheet.getRange(1, 1, 1, MATRICES_CONFIG_HEADERS.length)
      .setValues([MATRICES_CONFIG_HEADERS])
      .setFontWeight('bold')
      .setBackground('#263238')
      .setFontColor('#FFFFFF');

    // Ajustar anchos de columna para legibilidad
    sheet.setColumnWidth(1, 160);  // Nombre Matriz
    sheet.setColumnWidth(2, 260);  // ID Archivo
    sheet.setColumnWidth(3, 160);  // Nombre de Pestaña
    sheet.setColumnWidth(4, 160);  // Columna Llave
    sheet.setColumnWidth(5, 140);  // Columna Lote
    sheet.setColumnWidth(6, 180);  // Columna Cantidad
    sheet.setColumnWidth(7, 180);  // Columna Vencimiento
    sheet.setColumnWidth(8, 160);  // Columna Fabricante
    sheet.setColumnWidth(9, 90);   // Prioridad
    sheet.setColumnWidth(10, 80);  // Activa

    // Forzar encabezado de fila
    sheet.setFrozenRows(1);

    // Proteger la hoja para que solo el propietario la edite directamente
    // (Los cambios se harán a través del panel de configuración)
    try {
      var protection = sheet.protect().setDescription('Configuración de Matrices K - Solo sistema');
      protection.setWarningOnly(true); // Warning, no bloqueo duro
    } catch (e) {
      Logger.log('MatrizConfig: No se pudo aplicar protección: ' + e.message);
    }

    // Ocultar la hoja (es de sistema, no visible para el usuario final)
    sheet.hideSheet();

    Logger.log('✓ MatrizConfig: Hoja ' + SYS_MATRICES_SHEET_NAME + ' creada.');
  } else {
    // Verificar que tenga todos los encabezados canónicos (resiliencia frente a cambios futuros)
    var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var missingHeaders = MATRICES_CONFIG_HEADERS.filter(function(h) {
      return actualHeaders.indexOf(h) === -1;
    });

    if (missingHeaders.length > 0) {
      var lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1, 1, missingHeaders.length)
        .setValues([missingHeaders])
        .setFontWeight('bold')
        .setBackground('#263238')
        .setFontColor('#FFFFFF');
      Logger.log('✓ MatrizConfig: Encabezados faltantes añadidos: ' + missingHeaders.join(', '));
    }
  }

  return sheet;
}

// -------------------------------------------------------
// SECCIÓN 2: LECTURA DE MATRICES ACTIVAS
// -------------------------------------------------------

/**
 * Lee todas las matrices activas de Sys_MatricesConfig ordenadas por Prioridad (ascendente).
 * Filtra las que tienen Activa = "Si" (case-insensitive).
 *
 * @returns {Array<Object>} Array de objetos con la configuración de cada matriz activa:
 *   {
 *     nombreMatriz, idArchivo, nombrePestana, columnaLlave,
 *     columnaLote, columnaCantidad, columnaVencimiento, columnaFabricante,
 *     prioridad, activa
 *   }
 */
function getMatricesActivasOrdenadas() {
  var sheet = ensureMatricesConfigSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    Logger.log('MatrizConfig: No hay matrices configuradas en ' + SYS_MATRICES_SHEET_NAME);
    return [];
  }

  var data = sheet.getRange(2, 1, lastRow - 1, MATRICES_CONFIG_HEADERS.length).getValues();

  var matrices = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var activa = (row[9] || '').toString().trim().toLowerCase();
    if (activa !== 'si') continue; // Solo matrices activas

    var idArchivo = (row[1] || '').toString().trim();
    // Extraer solo el ID si viene como URL completa de Google Sheets
    var idExtraido = extractDriveId(idArchivo) || idArchivo;

    matrices.push({
      nombreMatriz:       (row[0] || '').toString().trim(),
      idArchivo:          idExtraido,
      nombrePestana:      (row[2] || '').toString().trim(),
      columnaLlave:       (row[3] || '').toString().trim(),
      columnaLote:        (row[4] || '').toString().trim(),
      columnaCantidad:    (row[5] || '').toString().trim(),
      columnaVencimiento: (row[6] || '').toString().trim(),
      columnaFabricante:  (row[7] || '').toString().trim(),
      prioridad:          parseInt(row[8], 10) || 99,
      activa:             true
    });
  }

  // Ordenar por prioridad ascendente (1 = primera en consultar)
  matrices.sort(function(a, b) { return a.prioridad - b.prioridad; });

  Logger.log('MatrizConfig: ' + matrices.length + ' matrices activas cargadas.');
  return matrices;
}

// -------------------------------------------------------
// SECCIÓN 3: CRUD DE MATRICES (LLAMADO DESDE LA UI)
// -------------------------------------------------------

/**
 * Devuelve la lista completa de matrices (activas e inactivas) al panel de Configuración.
 * @returns {Array<Object>} Array de objetos con configuración de matrices.
 */
function getMatricesConfig() {
  var sheet = ensureMatricesConfigSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, MATRICES_CONFIG_HEADERS.length).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex:           i + 2, // Fila real en la hoja (base 1, +1 por header)
      nombreMatriz:       (row[0] || '').toString().trim(),
      idArchivo:          (row[1] || '').toString().trim(),
      nombrePestana:      (row[2] || '').toString().trim(),
      columnaLlave:       (row[3] || '').toString().trim(),
      columnaLote:        (row[4] || '').toString().trim(),
      columnaCantidad:    (row[5] || '').toString().trim(),
      columnaVencimiento: (row[6] || '').toString().trim(),
      columnaFabricante:  (row[7] || '').toString().trim(),
      prioridad:          (row[8] || '').toString().trim(),
      activa:             (row[9] || '').toString().trim()
    };
  });
}

/**
 * Guarda (crea o actualiza) una configuración de matriz.
 * Si rowIndex es null/undefined, crea una nueva fila al final.
 * Si rowIndex es un número, actualiza esa fila específica.
 *
 * @param {Object} config - Objeto con todos los campos de la matriz.
 * @param {number|null} rowIndex - Fila a actualizar, o null para crear.
 * @returns {Object} { ok: true } o { ok: false, error: "..." }
 */
function guardarMatrizConfig(config, rowIndex) {
  try {
    _validarPermisoConfigMatrices_();

    var sheet = ensureMatricesConfigSheet_();

    // Extraer ID del link si el usuario pegó la URL completa
    var idArchivo = (config.idArchivo || '').toString().trim();
    var idExtraido = extractDriveId(idArchivo) || idArchivo;

    var rowData = [
      (config.nombreMatriz       || '').toString().trim(),
      idExtraido,
      (config.nombrePestana      || '').toString().trim(),
      (config.columnaLlave       || '').toString().trim(),
      (config.columnaLote        || '').toString().trim(),
      (config.columnaCantidad    || '').toString().trim(),
      (config.columnaVencimiento || '').toString().trim(),
      (config.columnaFabricante  || '').toString().trim(),
      parseInt(config.prioridad, 10) || 99,
      (config.activa             || 'Si').toString().trim()
    ];

    var targetRow = (rowIndex && rowIndex > 1) ? rowIndex : sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);

    logChange(
      'MATRIZ_CONFIG_GUARDADA',
      'Matriz "' + rowData[0] + '" ' + (rowIndex ? 'actualizada' : 'creada') + ' en fila ' + targetRow,
      Session.getActiveUser().getEmail()
    );

    return { ok: true };
  } catch (e) {
    Logger.log('MatrizConfig.guardarMatrizConfig: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Elimina una fila de configuración de matriz por su índice de fila.
 * @param {number} rowIndex - Fila a eliminar (base 1).
 * @returns {Object} { ok: true } o { ok: false, error: "..." }
 */
function eliminarMatrizConfig(rowIndex) {
  try {
    _validarPermisoConfigMatrices_();
    if (!rowIndex || rowIndex < 2) throw new Error('Índice de fila inválido.');

    var sheet = ensureMatricesConfigSheet_();
    var nombreMatriz = sheet.getRange(rowIndex, 1).getValue();
    sheet.deleteRow(rowIndex);

    logChange(
      'MATRIZ_CONFIG_ELIMINADA',
      'Matriz "' + nombreMatriz + '" eliminada (fila ' + rowIndex + ')',
      Session.getActiveUser().getEmail()
    );

    return { ok: true };
  } catch (e) {
    Logger.log('MatrizConfig.eliminarMatrizConfig: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Valida que el usuario actual tenga permiso de administrador o configuración.
 * @private
 */
function _validarPermisoConfigMatrices_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) {}
  var user = email ? getUserRecordByEmail_(email) : null;
  var tienePermiso = user && (
    hasPermissionByRol(user.rol, PERMISOS.MENU_ADMIN) ||
    hasPermissionByRol(user.rol, PERMISOS.MENU_CONFIG)
  );
  if (!tienePermiso) {
    throw new Error('ACCESO DENEGADO: Solo administradores o configuradores pueden modificar las Matrices K.');
  }
}
