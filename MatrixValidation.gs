// ============================================================
// MODULE: MatrixValidation
// Descripción: Motor de validación backend contra Matrices K externas.
//   - Consulta dinámica por nombre de columna (no por índice)
//   - Búsqueda secuencial por prioridad entre N matrices activas
//   - Lógica de Decision idéntica a las fórmulas originales de Google Sheets
// Prioridad de Carga: 3° (depende de Config.gs y MatrizConfig.gs)
// ============================================================

/**
 * Motor principal de validación. Dado un NoAnalisis K y los datos de la orden,
 * consulta todas las matrices activas (en orden de prioridad) y devuelve
 * los valores validados + la decisión final.
 *
 * @param {string} noAnalisisK      - Clave primaria de búsqueda (No Análisis K)
 * @param {Object} datosOrden       - Datos de la orden a comparar:
 *   {
 *     lote:     string,   // Lote solicitado en la orden
 *     cantidad: number,   // Cantidad solicitada
 *     exp:      string    // Fecha vencimiento solicitada (cualquier formato)
 *   }
 * @returns {Object}
 *   {
 *     encontrado:         boolean,
 *     matriceConsultada:  string,
 *     verifLote:          string,
 *     verifCantDisponible: number|string,
 *     verifExp:           string,
 *     fabricante:         string,
 *     cantDispAFecha:     number|string,   // Snapshot de cantidad al momento de la consulta
 *     decision:           string,          // Ver VALORES_DECISION en Config.gs
 *     alertas:            string[]         // Detalle de cada discrepancia encontrada
 *   }
 */
function validarNoAnalisisContraMatrices(noAnalisisK, datosOrden) {
  var resultado = {
    encontrado:          false,
    matriceConsultada:   '',
    verifLote:           '',
    verifCantDisponible: '',
    verifExp:            '',
    fabricante:          '',
    cantDispAFecha:      '',
    decision:            VALORES_DECISION.NO_ENCONTRADO,
    alertas:             []
  };

  if (!noAnalisisK || noAnalisisK.toString().trim() === '') {
    resultado.decision = VALORES_DECISION.NO_ENCONTRADO;
    resultado.alertas.push('No Análisis K vacío o inválido.');
    return resultado;
  }

  var matrices = getMatricesActivasOrdenadas();
  if (matrices.length === 0) {
    resultado.decision = VALORES_DECISION.NO_ENCONTRADO;
    resultado.alertas.push('No hay matrices K configuradas y activas en Sys_MatricesConfig.');
    return resultado;
  }

  var noAnalisisStr = noAnalisisK.toString().trim();

  // Iterar matrices en orden de prioridad
  for (var m = 0; m < matrices.length; m++) {
    var matriz = matrices[m];
    Logger.log('MatrixValidation: Consultando "' + matriz.nombreMatriz + '" para NoAnalisis=' + noAnalisisStr);

    try {
      var filaMatriz = buscarFilaEnMatriz_(noAnalisisStr, matriz);
      if (!filaMatriz) continue; // No encontrado en esta matriz, intentar la siguiente

      // Material encontrado — extraer valores por nombre de columna
      resultado.encontrado        = true;
      resultado.matriceConsultada = matriz.nombreMatriz;
      resultado.verifLote          = leerCelda_(filaMatriz, matriz.columnaLote);
      resultado.verifCantDisponible = leerCeldaNumero_(filaMatriz, matriz.columnaCantidad);
      resultado.verifExp           = leerCelda_(filaMatriz, matriz.columnaVencimiento);
      resultado.fabricante         = leerCelda_(filaMatriz, matriz.columnaFabricante);
      resultado.cantDispAFecha     = resultado.verifCantDisponible; // Snapshot en este instante

      // Evaluar reglas de decisión
      resultado.decision = evaluarDecision_(resultado, datosOrden, resultado.alertas);

      Logger.log('MatrixValidation: Resultado en "' + matriz.nombreMatriz + '": ' + resultado.decision);
      return resultado; // Detener búsqueda: ya encontramos el material
    } catch (e) {
      Logger.log('MatrixValidation: Error al consultar "' + matriz.nombreMatriz + '": ' + e.message);
      // Continuar con la siguiente matriz
    }
  }

  // Si llegamos aquí, no se encontró en ninguna matriz
  resultado.alertas.push('El No Análisis K "' + noAnalisisStr + '" no fue encontrado en ninguna de las ' + matrices.length + ' matrices activas.');
  return resultado;
}

// -------------------------------------------------------
// BÚSQUEDA EN MATRIZ EXTERNA
// -------------------------------------------------------

/**
 * Abre la spreadsheet externa y busca la fila donde la columna llave
 * coincide con el noAnalisisK dado. La búsqueda es case-insensitive y
 * trimea espacios en ambos lados.
 *
 * @param {string} noAnalisisK - Valor a buscar
 * @param {Object} matriz      - Objeto de configuración de la matriz
 * @returns {Object|null}      - { headers: string[], values: any[] } o null si no encontrado
 * @private
 */
function buscarFilaEnMatriz_(noAnalisisK, matriz) {
  if (!matriz.idArchivo) {
    Logger.log('buscarFilaEnMatriz_: ID de archivo vacío para "' + matriz.nombreMatriz + '"');
    return null;
  }

  var ss = SpreadsheetApp.openById(matriz.idArchivo);
  var sheet = matriz.nombrePestana
    ? ss.getSheetByName(matriz.nombrePestana)
    : ss.getSheets()[0];

  if (!sheet) {
    Logger.log('buscarFilaEnMatriz_: Pestaña "' + matriz.nombrePestana + '" no encontrada en "' + matriz.nombreMatriz + '"');
    return null;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Encontrar el índice de la columna llave (base-0 para acceso a array)
  var colLlaveIdx = -1;
  var colLlaveBuscar = (matriz.columnaLlave || '').toString().toLowerCase().trim();
  for (var h = 0; h < headers.length; h++) {
    if (headers[h] && headers[h].toString().toLowerCase().trim() === colLlaveBuscar) {
      colLlaveIdx = h;
      break;
    }
  }

  if (colLlaveIdx === -1) {
    Logger.log('buscarFilaEnMatriz_: Columna llave "' + matriz.columnaLlave + '" no encontrada en headers de "' + matriz.nombreMatriz + '"');
    return null;
  }

  // Leer toda la columna llave de una vez (eficiente)
  var colData = sheet.getRange(2, colLlaveIdx + 1, lastRow - 1, 1).getValues();
  var buscarNorm = noAnalisisK.toString().toLowerCase().trim();

  for (var r = 0; r < colData.length; r++) {
    var cellVal = (colData[r][0] || '').toString().toLowerCase().trim();
    if (cellVal === buscarNorm) {
      // Fila encontrada — leer toda la fila
      var rowValues = sheet.getRange(r + 2, 1, 1, lastCol).getValues()[0];
      return { headers: headers, values: rowValues };
    }
  }

  return null; // No encontrado en esta matriz
}

/**
 * Lee el valor de una celda específica por nombre de columna dentro de una fila encontrada.
 * @param {{ headers: string[], values: any[] }} fila
 * @param {string} nombreColumna
 * @returns {string}
 * @private
 */
function leerCelda_(fila, nombreColumna) {
  if (!nombreColumna) return '';
  var nombreNorm = nombreColumna.toString().toLowerCase().trim();
  for (var i = 0; i < fila.headers.length; i++) {
    if (fila.headers[i] && fila.headers[i].toString().toLowerCase().trim() === nombreNorm) {
      var val = fila.values[i];
      return val !== undefined && val !== null ? val.toString().trim() : '';
    }
  }
  return '';
}

/**
 * Igual que leerCelda_ pero intenta devolver un número. Si no es número, devuelve 0.
 * @private
 */
function leerCeldaNumero_(fila, nombreColumna) {
  var raw = leerCelda_(fila, nombreColumna);
  var num = parseFloat(raw.toString().replace(/[^0-9.\-]/g, ''));
  return isNaN(num) ? 0 : num;
}

// -------------------------------------------------------
// LÓGICA DE DECISIÓN (Business Rules)
// -------------------------------------------------------

/**
 * Evalúa las 3 reglas de negocio (idénticas a la fórmula original de Google Sheets)
 * y devuelve la cadena de decisión correspondiente.
 *
 * Reglas:
 *   1. Lote Solicitado == Lote Matriz
 *   2. Fecha Vencimiento Solicitada (mm/yyyy) == Fecha Matriz (mm/yyyy)
 *   3. Cantidad Solicitada <= Cantidad Disponible en Matriz
 *
 * @param {Object}   validados   - Valores leídos de la Matriz K
 * @param {Object}   datosOrden  - Datos de la orden (lote, cantidad, exp)
 * @param {string[]} alertas     - Array mutable donde se acumulan los mensajes de error
 * @returns {string} Texto de decisión (ver VALORES_DECISION)
 * @private
 */
function evaluarDecision_(validados, datosOrden, alertas) {
  // Si no hay datos de la orden para comparar, decisión es OK (solo se registran datos de inventario)
  if (!datosOrden) return VALORES_DECISION.OK;

  var errores = [];

  // --- Regla 1: Cantidad ---
  var cantSolicitada = parseFloat((datosOrden.cantidad || 0).toString().replace(/[^0-9.\-]/g, ''));
  var cantDisp       = typeof validados.verifCantDisponible === 'number'
    ? validados.verifCantDisponible
    : parseFloat((validados.verifCantDisponible || '0').toString().replace(/[^0-9.\-]/g, ''));

  var cantidadOk = (!isNaN(cantSolicitada) && !isNaN(cantDisp) && cantSolicitada <= cantDisp);

  // --- Regla 2: Lote ---
  var loteOrden  = (datosOrden.lote  || '').toString().trim().toLowerCase();
  var loteMatriz = (validados.verifLote || '').toString().trim().toLowerCase();
  var loteOk = (loteOrden === '' || loteOrden === loteMatriz);

  // --- Regla 3: Fecha Vencimiento (comparar solo mm/yyyy) ---
  var expOrden  = normalizarFecha_(datosOrden.exp  || '');
  var expMatriz = normalizarFecha_(validados.verifExp || '');
  // Si alguna de las dos está vacía, se omite la comparación (sin info = sin error de fecha)
  var fechaOk = (expOrden === '' || expMatriz === '' || expOrden === expMatriz);

  // Acumular errores con detalle específico (igual al comportamiento de la fórmula original)
  if (!loteOk)  errores.push('Lote');
  if (!fechaOk) errores.push('Fecha');

  // La cantidad tiene prioridad sobre los otros errores (según fórmula original)
  if (!cantidadOk) {
    var detalleCant = 'Cant. sol (' + cantSolicitada + ') > disp (' + cantDisp + ')';
    alertas.push(detalleCant);
    return VALORES_DECISION.CANTIDAD_NO_DISPONIBLE + ' | ' + detalleCant;
  }

  if (errores.length > 0) {
    var descErrores = [];
    errores.forEach(function(e) {
      if (e === 'Lote') {
        var lDet = 'Lote orden (' + (datosOrden.lote || '-') + ') != Matriz (' + validados.verifLote + ')';
        alertas.push(lDet);
        descErrores.push(lDet);
      }
      if (e === 'Fecha') {
        var fDet = 'Exp orden (' + (expOrden || '-') + ') != Matriz (' + (expMatriz || '-') + ')';
        alertas.push(fDet);
        descErrores.push(fDet);
      }
    });
    var msg = VALORES_DECISION.ERROR_PREFIX + errores.join(', ') + ' | ' + descErrores.join('; ');
    return msg;
  }


  return VALORES_DECISION.OK;
}

/**
 * Normaliza una fecha a formato "mm/yyyy" para comparación.
 * Acepta: Date object, "dd/mm/yyyy", "mm/yyyy", "yyyy-mm-dd", número serial de Sheets.
 * Si no puede parsear, devuelve el string original trimado.
 * @param {any} valor
 * @returns {string}
 * @private
 */
function normalizarFecha_(valor) {
  if (!valor && valor !== 0) return '';

  // Si es Date de JavaScript (GAS retorna objetos Date de las celdas de fecha)
  if (valor instanceof Date) {
    var mes  = ('0' + (valor.getMonth() + 1)).slice(-2);
    var anio = valor.getFullYear();
    return mes + '/' + anio;
  }

  var str = valor.toString().trim();
  if (!str) return '';

  // Formato "dd/mm/yyyy" → extraer mm/yyyy
  var matchDMY = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (matchDMY) return ('0' + matchDMY[2]).slice(-2) + '/' + matchDMY[3];

  // Formato "mm/yyyy" directo
  var matchMY = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (matchMY) return ('0' + matchMY[1]).slice(-2) + '/' + matchMY[2];

  // Formato ISO "yyyy-mm-dd"
  var matchISO = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchISO) return matchISO[2] + '/' + matchISO[1];

  return str; // Devolver tal cual si no se reconoce el formato
}

// -------------------------------------------------------
// FUNCIÓN DE RE-VALIDACIÓN (usada en la Fase 4 - Edición In Situ)
// -------------------------------------------------------

/**
 * Re-valida una orden específica contra las Matrices K y actualiza sus columnas
 * de validación en la hoja Ordenes. Llamada desde el backend al editar una orden desde la UI.
 *
 * @param {string} noOrden   - Número de orden a re-validar
 * @param {string} userId    - UserID del usuario que solicita la re-validación
 * @returns {Object} { ok: boolean, decision: string, alertas: string[], error?: string }
 */
function revalidarOrden(noOrden, userId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) throw new Error('Hoja Ordenes no encontrada.');

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('No hay órdenes en la hoja.');

    // Encontrar la fila de la orden
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colData = sheet.getRange(2, colNoOrden, lastRow - 1, 1).getValues();
    var filaOrden = -1;
    for (var r = 0; r < colData.length; r++) {
      if ((colData[r][0] || '').toString().trim() === noOrden.toString().trim()) {
        filaOrden = r + 2; // +2: header en fila 1
        break;
      }
    }
    if (filaOrden === -1) throw new Error('Orden "' + noOrden + '" no encontrada en la hoja.');

    // Leer datos actuales de la orden (para la comparación)
    var rowValues = sheet.getRange(filaOrden, 1, 1, headers.length).getValues()[0];
    var colNoAnalisis = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
    var colLote       = getColumnIndexByNameCaseInsensitive(headers, 'Lote', false);
    var colCantidad   = getColumnIndexByNameCaseInsensitive(headers, 'Cantidad', false);
    var colExp        = getColumnIndexByNameCaseInsensitive(headers, 'Exp', false);

    var noAnalisisK = colNoAnalisis ? (rowValues[colNoAnalisis - 1] || '').toString().trim() : '';
    var datosOrden = {
      lote:     colLote     ? (rowValues[colLote - 1]     || '').toString().trim() : '',
      cantidad: colCantidad ? (rowValues[colCantidad - 1] || 0)                    : 0,
      exp:      colExp      ? rowValues[colExp - 1]                                 : ''
    };

    // Ejecutar el motor de validación
    var resultado = validarNoAnalisisContraMatrices(noAnalisisK, datosOrden);

    // Escribir resultados de vuelta en la hoja
    escribirResultadoValidacion_(sheet, headers, filaOrden, resultado);

    // Registrar en trazabilidad
    var userEmail = '';
    try { userEmail = Session.getActiveUser().getEmail(); } catch(e) {}
    logChange(
      'REVALIDACION_ORDEN',
      'Re-validación de orden "' + noOrden + '" por ' + (userEmail || userId) +
        '. Decisión: ' + resultado.decision,
      userEmail || userId
    );

    return {
      ok:       true,
      decision: resultado.decision,
      alertas:  resultado.alertas,
      fabricante: resultado.fabricante,
      verifLote: resultado.verifLote,
      verifExp:  resultado.verifExp,
      cantDisp:  resultado.cantDispAFecha
    };
  } catch (e) {
    Logger.log('revalidarOrden: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// -------------------------------------------------------
// HELPER INTERNO: ESCRIBIR RESULTADO EN LA HOJA
// -------------------------------------------------------

/**
 * Escribe los valores de un resultado de validación en las columnas correspondientes
 * de la fila indicada en la hoja Ordenes.
 *
 * @param {Sheet}    sheet    - Hoja Ordenes
 * @param {string[]} headers  - Array de encabezados (base-0)
 * @param {number}   filaIdx  - Número de fila en la hoja (base-1)
 * @param {Object}   resultado - Resultado de validarNoAnalisisContraMatrices
 * @private
 */
function escribirResultadoValidacion_(sheet, headers, filaIdx, resultado) {
  var cols = {
    'VerifLote':            resultado.verifLote,
    'VerifCant. Disponible': resultado.verifCantDisponible,
    'VerifExp':             resultado.verifExp,
    'Fabricante':           resultado.fabricante,
    'Decision':             resultado.decision,
    'CantDispAFecha':       resultado.cantDispAFecha
  };

  Object.keys(cols).forEach(function(nombreCol) {
    var idx = getColumnIndexByNameCaseInsensitive(headers, nombreCol, false);
    if (idx) {
      sheet.getRange(filaIdx, idx).setValue(cols[nombreCol]);
    }
  });
}

/**
 * Actualiza un campo específico de una orden en la hoja Ordenes y registra el cambio.
 * Usada por el modal de edición in situ de la Fase 4.
 *
 * @param {string} noOrden    - Número de orden
 * @param {string} campo      - Nombre de la columna a actualizar (ej. 'NoAnalisis')
 * @param {any}    nuevoValor - Nuevo valor
 * @param {string} userId     - UserID del usuario que realiza el cambio
 * @returns {Object} { ok: boolean, error?: string }
 */
function actualizarCampoOrden_(noOrden, campo, nuevoValor, userId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) throw new Error('Hoja Ordenes no encontrada.');

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colNoOrden = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colCampo   = getColumnIndexByNameCaseInsensitive(headers, campo, false);

    if (!colCampo) throw new Error('Columna "' + campo + '" no encontrada en Ordenes.');

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('No hay órdenes en la hoja.');

    var colData = sheet.getRange(2, colNoOrden, lastRow - 1, 1).getValues();
    var filaOrden = -1;
    for (var r = 0; r < colData.length; r++) {
      if ((colData[r][0] || '').toString().trim() === noOrden.toString().trim()) {
        filaOrden = r + 2;
        break;
      }
    }
    if (filaOrden === -1) throw new Error('Orden "' + noOrden + '" no encontrada.');

    var valorAnterior = sheet.getRange(filaOrden, colCampo).getValue();
    sheet.getRange(filaOrden, colCampo).setValue(nuevoValor);

    var userEmail = '';
    try { userEmail = Session.getActiveUser().getEmail(); } catch(e) {}
    logChange(
      'EDICION_CAMPO_ORDEN',
      'Orden "' + noOrden + '" - Campo "' + campo + '" actualizado de "' + valorAnterior + '" a "' + nuevoValor + '" por ' + (userEmail || userId),
      userEmail || userId
    );

    return { ok: true };
  } catch (e) {
    Logger.log('actualizarCampoOrden_: ' + e.message);
    return { ok: false, error: e.message };
  }
}
