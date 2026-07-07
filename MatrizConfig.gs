// ============================================================
// MODULE: MatrizConfig
// Descripción: Motor de configuración y lectura de Matrices K externas.
//   - Creación y mantenimiento de la hoja Sys_MatricesConfig
//   - CRUD de configuración de matrices desde el backend
//   - Función principal de lectura de matrices activas ordenadas por prioridad
// Prioridad de Carga: 2° (depende solo de Config.gs)
//
// REGLA DE DISEÑO: toda lectura/escritura de una fila de Sys_MatricesConfig se hace
// mapeando por NOMBRE de columna (vía los headers reales de la hoja), nunca por índice
// posicional fijo. Los índices de columna cambian entre entornos/versiones (columnas
// nuevas se insertan o se añaden al final), así que un row[N] hardcodeado se desalinea
// silenciosamente con datos ya existentes. Ver getFilaMatrizComoObjeto_/escribirFilaMatriz_.
// ============================================================

// -------------------------------------------------------
// SECCIÓN 1: CREACIÓN Y MANTENIMIENTO DE LA HOJA
// -------------------------------------------------------

/**
 * Asegura que la hoja Sys_MatricesConfig exista con los encabezados correctos.
 * Si no existe, la crea. Si ya existe, verifica integridad de encabezados e INSERTA
 * cualquier columna canónica faltante en su posición lógica correcta (no al final),
 * para no desalinear las columnas existentes a la derecha del punto de inserción.
 * Es idempotente: puede llamarse múltiples veces sin riesgo.
 * @returns {Sheet} La hoja Sys_MatricesConfig
 */
function ensureMatricesConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SYS_MATRICES_SHEET_NAME);

  if (!sheet) {
    // Crear la hoja al final del libro
    sheet = ss.insertSheet(SYS_MATRICES_SHEET_NAME);

    // Escribir encabezados iniciales
    var headerRange = sheet.getRange(1, 1, 1, MATRICES_CONFIG_HEADERS.length);
    headerRange
      .setValues([MATRICES_CONFIG_HEADERS])
      .setFontWeight('bold')
      .setBackground('#263238')
      .setFontColor('#FFFFFF');

    // Proteger la hoja para que solo el propietario la edite directamente
    try {
      var protection = sheet.protect().setDescription('Configuración de Matrices K - Solo sistema');
      protection.setWarningOnly(true);
    } catch (e) {
      Logger.log('MatrizConfig: No se pudo aplicar protección: ' + e.message);
    }

    // Ocultar la hoja (es de sistema, no visible para el usuario final)
    sheet.hideSheet();
    Logger.log('✓ MatrizConfig: Hoja ' + SYS_MATRICES_SHEET_NAME + ' creada.');
  } else {
    // Verificar que tenga todos los encabezados canónicos, EN SU POSICIÓN LÓGICA.
    // Se inserta cada columna faltante en el índice que le corresponde según
    // MATRICES_CONFIG_HEADERS, para no desalinear los datos ya existentes a su derecha.
    MATRICES_CONFIG_HEADERS.forEach(function(nombreCol, idx) {
      var actualHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      var yaExiste = actualHeaders.some(function(h) { return (h || '').toString().trim().toLowerCase() === nombreCol.toLowerCase(); });
      if (yaExiste) return;

      var posicionInsercion = idx + 1; // Columna base-1 donde debería quedar
      if (posicionInsercion > sheet.getLastColumn()) {
        sheet.getRange(1, posicionInsercion).setValue(nombreCol);
      } else {
        sheet.insertColumnBefore(posicionInsercion);
        sheet.getRange(1, posicionInsercion).setValue(nombreCol);
      }
      Logger.log('✓ MatrizConfig: Columna faltante "' + nombreCol + '" insertada en posición ' + posicionInsercion);
    });

    sheet.getRange(1, 1, 1, MATRICES_CONFIG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#263238')
      .setFontColor('#FFFFFF');
  }

  // --- RE-APLICAR SIEMPRE ESTILOS, NOTAS Y VALIDACIONES (Aún si ya existe) ---
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var notasPorColumna = {
    'Nombre Matriz':       "Nombre descriptivo para identificar esta Matriz (Ej. 'Matriz 2026')",
    'ID Archivo':          "ID del archivo de Google Sheets (la cadena larga en la URL entre /d/ y /edit)",
    'Nombre de Pestaña':   "Nombre exacto de la pestaña/hoja interna donde están los datos (Ej. 'Hoja 1')",
    'Fila de Encabezados': "Número de fila donde están los títulos de columna en la hoja externa (Ej. '1'). Vacío = fila 1.",
    'Columna Llave':       "Nombre exacto de la columna que contiene el No Análisis K (Ej. 'No Análisis')",
    'Columna Lote':        "Nombre exacto de la columna que contiene el Lote (Ej. 'Lote')",
    'Columna Cantidad':    "Nombre exacto de la columna que contiene la Cantidad Disponible (Ej. 'Cant. Disp.')",
    'Columna Vencimiento': "Nombre exacto de la columna que contiene la Fecha de Vencimiento (Ej. 'Exp')",
    'Columna Fabricante':  "Nombre exacto de la columna que contiene el Fabricante (Ej. 'Fabricante')",
    'Prioridad':           "Orden de prioridad (1 = primera en buscar). Seleccione un número del dropdown.",
    'Activa':              "Seleccione 'Si' para activarla o 'No' para ignorar esta matriz. Se autocompleta al validar exitosamente."
  };
  var anchosPorColumna = {
    'Nombre Matriz': 160, 'ID Archivo': 260, 'Nombre de Pestaña': 160, 'Fila de Encabezados': 130,
    'Columna Llave': 160, 'Columna Lote': 140, 'Columna Cantidad': 180, 'Columna Vencimiento': 180,
    'Columna Fabricante': 160, 'Prioridad': 90, 'Activa': 80
  };

  headers.forEach(function(nombreCol, idx0) {
    var col = idx0 + 1;
    var nombreNorm = (nombreCol || '').toString().trim();
    if (notasPorColumna[nombreNorm]) {
      sheet.getRange(1, col).setNote(notasPorColumna[nombreNorm]);
    }
    if (anchosPorColumna[nombreNorm]) {
      sheet.setColumnWidth(col, anchosPorColumna[nombreNorm]);
    }
  });

  // Forzar encabezado de fila
  sheet.setFrozenRows(1);

  // Data Validations para hasta 100 filas (mapeadas por nombre, no por posición)
  var prioridadRules = [];
  for (var i = 1; i <= 20; i++) prioridadRules.push(i.toString());

  var valPrioridad = SpreadsheetApp.newDataValidation().requireValueInList(prioridadRules, true).setAllowInvalid(false).build();
  var valActiva = SpreadsheetApp.newDataValidation().requireValueInList(['Si', 'No'], true).setAllowInvalid(false).build();

  var colPrioridad = getColumnIndexByNameCaseInsensitive(headers, 'Prioridad', false);
  var colActiva = getColumnIndexByNameCaseInsensitive(headers, 'Activa', false);

  if (colPrioridad) sheet.getRange(2, colPrioridad, 100, 1).setDataValidation(valPrioridad);
  if (colActiva) sheet.getRange(2, colActiva, 100, 1).setDataValidation(valActiva);

  return sheet;
}

// -------------------------------------------------------
// SECCIÓN 1B: MAPEO GENÉRICO FILA <-> OBJETO POR NOMBRE DE COLUMNA
// -------------------------------------------------------

// Mapa entre el nombre de campo del objeto JS y el nombre real de columna en la hoja.
var MATRIZ_CAMPO_A_COLUMNA_ = {
  nombreMatriz:       'Nombre Matriz',
  idArchivo:          'ID Archivo',
  nombrePestana:      'Nombre de Pestaña',
  filaEncabezados:    'Fila de Encabezados',
  columnaLlave:       'Columna Llave',
  columnaLote:        'Columna Lote',
  columnaCantidad:    'Columna Cantidad',
  columnaVencimiento: 'Columna Vencimiento',
  columnaFabricante:  'Columna Fabricante',
  prioridad:          'Prioridad',
  activa:             'Activa'
};

/**
 * Lee una fila de Sys_MatricesConfig y la devuelve como objeto, mapeando cada campo
 * por el NOMBRE real de su columna en la hoja (no por posición). Campos cuya columna
 * no exista en la hoja quedan como '' (string) para que el llamador aplique su propio default.
 * @param {Sheet} sheet    - Hoja Sys_MatricesConfig ya asegurada.
 * @param {string[]} headers - Encabezados reales de la hoja (fila 1).
 * @param {number} rowIndex - Fila a leer (base 1).
 * @returns {Object} Objeto con las claves de MATRIZ_CAMPO_A_COLUMNA_, valores en crudo (string trim).
 * @private
 */
function getFilaMatrizComoObjeto_(sheet, headers, rowIndex) {
  var rowValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var obj = {};
  Object.keys(MATRIZ_CAMPO_A_COLUMNA_).forEach(function(campo) {
    var nombreCol = MATRIZ_CAMPO_A_COLUMNA_[campo];
    var colIdx = getColumnIndexByNameCaseInsensitive(headers, nombreCol, false);
    obj[campo] = colIdx ? (rowValues[colIdx - 1] || '').toString().trim() : '';
  });
  return obj;
}

/**
 * Escribe un objeto de configuración de matriz en una fila, mapeando cada campo
 * presente en `config` a la columna correspondiente por NOMBRE (no por posición).
 * Campos cuya columna no exista en la hoja se ignoran en silencio.
 * @param {Sheet} sheet
 * @param {string[]} headers
 * @param {number} rowIndex
 * @param {Object} config - Puede tener cualquier subconjunto de las claves de MATRIZ_CAMPO_A_COLUMNA_.
 * @private
 */
function escribirFilaMatriz_(sheet, headers, rowIndex, config) {
  Object.keys(config).forEach(function(campo) {
    var nombreCol = MATRIZ_CAMPO_A_COLUMNA_[campo];
    if (!nombreCol) return;
    var colIdx = getColumnIndexByNameCaseInsensitive(headers, nombreCol, false);
    if (!colIdx) return;
    sheet.getRange(rowIndex, colIdx).setValue(config[campo]);
  });
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
 *     nombreMatriz, idArchivo, nombrePestana, filaEncabezados, columnaLlave,
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

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var matrices = [];

  for (var rowIndex = 2; rowIndex <= lastRow; rowIndex++) {
    var raw = getFilaMatrizComoObjeto_(sheet, headers, rowIndex);
    if (raw.activa.toLowerCase() !== 'si') continue; // Solo matrices activas

    var idExtraido = extractDriveId(raw.idArchivo) || raw.idArchivo;

    matrices.push({
      nombreMatriz:       raw.nombreMatriz,
      idArchivo:          idExtraido,
      nombrePestana:      raw.nombrePestana,
      filaEncabezados:    parseInt(raw.filaEncabezados, 10) || 1,
      columnaLlave:       raw.columnaLlave,
      columnaLote:        raw.columnaLote,
      columnaCantidad:    raw.columnaCantidad,
      columnaVencimiento: raw.columnaVencimiento,
      columnaFabricante:  raw.columnaFabricante,
      prioridad:          parseInt(raw.prioridad, 10) || 99,
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

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var resultado = [];
  for (var rowIndex = 2; rowIndex <= lastRow; rowIndex++) {
    var obj = getFilaMatrizComoObjeto_(sheet, headers, rowIndex);
    obj.rowIndex = rowIndex;
    resultado.push(obj);
  }
  return resultado;
}

/**
 * Guarda (crea o actualiza) una configuración de matriz.
 * Si rowIndex es null/undefined, crea una nueva fila al final.
 * Si rowIndex es un número, actualiza esa fila específica.
 *
 * @param {Object} config - Objeto con todos los campos de la matriz.
 * @param {number|null} rowIndex - Fila a actualizar, o null para crear.
 * @returns {Object} { ok: true, rowIndex: number } o { ok: false, error: "..." }
 */
function guardarMatrizConfig(config, rowIndex) {
  try {
    _validarPermisoConfigMatrices_();

    var sheet = ensureMatricesConfigSheet_();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Extraer ID del link si el usuario pegó la URL completa
    var idArchivo = (config.idArchivo || '').toString().trim();
    var idExtraido = extractDriveId(idArchivo) || idArchivo;

    var datosAEscribir = {
      nombreMatriz:       (config.nombreMatriz       || '').toString().trim(),
      idArchivo:          idExtraido,
      nombrePestana:      (config.nombrePestana      || '').toString().trim(),
      filaEncabezados:    parseInt(config.filaEncabezados, 10) || 1,
      columnaLlave:       (config.columnaLlave       || '').toString().trim(),
      columnaLote:        (config.columnaLote        || '').toString().trim(),
      columnaCantidad:    (config.columnaCantidad    || '').toString().trim(),
      columnaVencimiento: (config.columnaVencimiento || '').toString().trim(),
      columnaFabricante:  (config.columnaFabricante  || '').toString().trim(),
      prioridad:          parseInt(config.prioridad, 10) || 99,
      // La activación es siempre resultado de validarYActualizarFilaMatriz_, nunca del guardado directo.
      activa:             'No'
    };

    var targetRow = (rowIndex && rowIndex > 1) ? rowIndex : sheet.getLastRow() + 1;
    escribirFilaMatriz_(sheet, headers, targetRow, datosAEscribir);

    logChange(
      'MATRIZ_CONFIG_GUARDADA',
      'Matriz "' + datosAEscribir.nombreMatriz + '" ' + (rowIndex ? 'actualizada' : 'creada') + ' en fila ' + targetRow,
      Session.getActiveUser().getEmail()
    );

    return { ok: true, rowIndex: targetRow };
  } catch (e) {
    Logger.log('MatrizConfig.guardarMatrizConfig: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// -------------------------------------------------------
// SECCIÓN 4: VALIDACIÓN ESTRUCTURAL DE UNA FILA + AUTO-ACTIVACIÓN
// -------------------------------------------------------

/**
 * Valida la configuración de una fila específica de Sys_MatricesConfig contra la hoja
 * externa real: confirma que el archivo abre, que la pestaña existe, y que todas las
 * columnas configuradas existen como encabezados en la fila indicada por
 * "Fila de Encabezados". Deja constancia del resultado como nota en la celda de
 * "ID Archivo" y auto-activa la fila (Activa = "Si") únicamente si todo es correcto;
 * en cualquier otro caso fuerza Activa = "No" para no dejar una matriz rota participando
 * en las búsquedas de validarNoAnalisisContraMatrices.
 *
 * @param {number} rowIndex - Fila a validar en Sys_MatricesConfig (base 1, incluye header).
 * @returns {Object} { ok: boolean, mensaje: string }
 */
function validarYActualizarFilaMatriz_(rowIndex) {
  var sheet = ensureMatricesConfigSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var mensaje = '';
  var ok = false;

  try {
    if (!rowIndex || rowIndex < 2) throw new Error('Índice de fila inválido.');

    var raw = getFilaMatrizComoObjeto_(sheet, headers, rowIndex);
    var filaEncabezados = parseInt(raw.filaEncabezados, 10) || 1;

    if (!raw.idArchivo) {
      throw new Error('ID de archivo vacío.');
    }

    var idExtraido = extractDriveId(raw.idArchivo) || raw.idArchivo;

    var ssExterna;
    try {
      ssExterna = SpreadsheetApp.openById(idExtraido);
    } catch (eOpen) {
      throw new Error('Hoja no encontrada o sin acceso: ' + eOpen.message);
    }

    var sheetExterna = raw.nombrePestana
      ? ssExterna.getSheetByName(raw.nombrePestana)
      : ssExterna.getSheets()[0];

    if (!sheetExterna) {
      throw new Error("Pestaña '" + raw.nombrePestana + "' no encontrada.");
    }

    var lastCol = sheetExterna.getLastColumn();
    if (lastCol < 1 || sheetExterna.getLastRow() < filaEncabezados) {
      throw new Error('La fila de encabezados (' + filaEncabezados + ') está fuera de rango en la hoja externa.');
    }

    var headersExternos = sheetExterna.getRange(filaEncabezados, 1, 1, lastCol).getValues()[0];

    var checkCols = [raw.columnaLlave, raw.columnaLote, raw.columnaCantidad, raw.columnaVencimiento];
    if (raw.columnaFabricante) checkCols.push(raw.columnaFabricante);

    var faltantes = [];
    checkCols.forEach(function(nombreCol) {
      if (!nombreCol) return;
      if (!getColumnIndexByNameCaseInsensitive(headersExternos, nombreCol, false)) {
        faltantes.push(nombreCol);
      }
    });

    if (faltantes.length > 0) {
      throw new Error('Columnas no encontradas: ' + faltantes.join(', '));
    }

    ok = true;
    mensaje = '✅ Validado ' + new Date().toLocaleString('es-CO') + ': hoja, pestaña y columnas OK.';
  } catch (e) {
    ok = false;
    mensaje = '❌ ' + e.message;
  }

  try {
    escribirFilaMatriz_(sheet, headers, rowIndex, { activa: ok ? 'Si' : 'No' });
    var colIdArchivo = getColumnIndexByNameCaseInsensitive(headers, 'ID Archivo', false);
    if (colIdArchivo) sheet.getRange(rowIndex, colIdArchivo).setNote(mensaje);
  } catch (eWrite) {
    Logger.log('validarYActualizarFilaMatriz_: error al escribir resultado: ' + eWrite.message);
  }

  try {
    logChange(
      'MATRIZ_CONFIG_VALIDADA',
      'Validación de matriz en fila ' + rowIndex + ': ' + mensaje,
      Session.getActiveUser().getEmail()
    );
  } catch (eLog) {}

  return { ok: ok, mensaje: mensaje };
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
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colNombreMatriz = getColumnIndexByNameCaseInsensitive(headers, 'Nombre Matriz', false);
    var nombreMatriz = colNombreMatriz ? sheet.getRange(rowIndex, colNombreMatriz).getValue() : '(sin nombre)';
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

// -------------------------------------------------------
// SECCIÓN 5: MODAL DE PIN PARA EDICIÓN MANUAL EN LA HOJA
// -------------------------------------------------------

/**
 * Abre el modal nativo y bloqueante que pide el PIN de un usuario ADMIN antes de
 * aceptar una edición manual hecha directamente sobre Sys_MatricesConfig. Llamado
 * desde onEditInstalled (Traceability.gs) justo después de revertir la edición.
 * Precarga la identidad de sesión (mismo patrón que abrirPanelQMS/resolverIdentidadSesion)
 * para que el modal ya sepa qué candidato(s) de usuario corresponden al correo activo.
 *
 * @param {number} fila             - Fila editada en Sys_MatricesConfig (base 1).
 * @param {number} columna          - Columna editada (base 1).
 * @param {any}    valorPropuesto   - Valor que el usuario intentó escribir (ya revertido).
 * @param {string} identidadEditor  - Identidad legible del editor (solo para contexto/mensaje).
 */
function abrirModalPinMatrizConfig_(fila, columna, valorPropuesto, identidadEditor) {
  var sheet = ensureMatricesConfigSheet_();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var nombreColumna = (headers[columna - 1] || '').toString().trim() || ('Columna ' + columna);

  var template = HtmlService.createTemplateFromFile('ModalPinMatrizConfig');
  template.identidad = JSON.stringify(resolverIdentidadSesion());
  template.contexto = JSON.stringify({
    fila: fila,
    columna: columna,
    nombreColumna: nombreColumna,
    valorPropuesto: valorPropuesto === undefined || valorPropuesto === null ? '' : valorPropuesto.toString(),
    identidadEditor: identidadEditor || ''
  });

  var html = template.evaluate()
      .setWidth(400)
      .setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, 'Edición Protegida — Matrices K');
}
