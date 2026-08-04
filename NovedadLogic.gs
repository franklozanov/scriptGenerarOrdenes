/**
 * NovedadLogic.gs
 * 
 * Módulo de lógica de registro de novedades y entregas.
 * Contiene funciones para:
 * - Apertura de modal de registro de novedades
 * - Obtención de órdenes disponibles para registro
 * - Procesamiento de registro de entregas y devoluciones
 * - Actualización de STATUS y trazabilidad
 * 
 * FASE 4 - Batch 4.3: Novedad Logic
 */

// --- UI: APERTURA DE MODAL ---

/**
 * Abre el modal de registro de entregas y novedades.
 * Muestra ModalRegistroNovedad.html para registrar entregas, devoluciones y cambios de estado.
 */
function abrirModalRegistroNovedad() {
  // La validación de identidad se realiza inline dentro de ModalRegistroNovedad.html al cargar
  // (vía getInitialData() → activeEmail → match con hoja Usuarios)
  try {
    var template = HtmlService.createTemplateFromFile('ModalRegistroNovedad');
    var html = template.evaluate()
      .setWidth(600)
      .setHeight(650);
    SpreadsheetApp.getUi().showModelessDialog(html, 'Registro de Entrega / Novedad OA');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al abrir el modal: ' + e.message);
  }
}

// --- OBTENCIÓN DE ÓRDENES DISPONIBLES ---

/**
 * Obtiene la lista de órdenes disponibles para registro de novedades.
 * Excluye órdenes con STATUS "Cerrada" o vacío.
 * 
 * @returns {Array<Object>} Array de objetos con información de órdenes
 * @property {string} noOrden - Número de orden
 * @property {string} codigo - Código del producto
 * @property {number} totalPags - Total de páginas de la orden
 */
function getOrdenesParaNovedad() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return []; // No hay datos

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    var colNoOrdenCol = getColumnIndexByNameCaseInsensitive(headers, 'NoOrden', true);
    var colCodigoCol = getColumnIndexByNameCaseInsensitive(headers, 'Codigo', true);
    var colTotalPagsCol = getColumnIndexByNameCaseInsensitive(headers, 'TotalPags', false);
    var colStatusCol = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);

    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = dataRange.getValues();
    var ordenes = [];

    for (var i = 0; i < values.length; i++) {
      var noOrden = values[i][colNoOrdenCol - 1];
      var codigo = values[i][colCodigoCol - 1];
      var status = colStatusCol ? values[i][colStatusCol - 1] : "";
      var totalPags = colTotalPagsCol ? values[i][colTotalPagsCol - 1] : 0;

      var noOrdenStr = noOrden ? noOrden.toString().trim() : "";
      var codigoStr = codigo ? codigo.toString().trim() : "";
      var statusStr = status ? status.toString().trim() : "";

      // Filtrar: excluir si STATUS es "Cerrada" o está vacío
      if (noOrdenStr && codigoStr && statusStr !== "Cerrada" && statusStr !== "") {
        ordenes.push({
          noOrden: noOrdenStr,
          codigo: codigoStr,
          totalPags: totalPags ? Number(totalPags) : 0
        });
      }
    }

    Logger.log("getOrdenesParaNovedad: Se encontraron " + ordenes.length + " órdenes disponibles para novedad.");
    return ordenes;
  } catch (e) {
    Logger.log("ERROR en getOrdenesParaNovedad: " + e.message);
    throw e;
  }
}

// --- PROCESAMIENTO DE REGISTRO DE NOVEDAD ---

/**
 * Procesa el registro de una novedad (entrega, devolución, etc.).
 * Actualiza el STATUS en la hoja Ordenes, registra en RegistroNovedad y audita en Logs.
 * 
 * @param {Object} params - Parámetros de la novedad
 * @param {string} params.noOrden - Número de orden
 * @param {string} params.codigo - Código del producto
 * @param {string} params.tipoNovedad - Tipo de novedad (Entrega, Devolución, etc.)
 * @param {string} params.comentario - Comentario adicional
 * @param {number} params.totalPags - Total de páginas
 * @param {number} params.noPagDevueltas - Número de páginas devueltas
 * @param {string} params.status - Nuevo STATUS a asignar
 * @param {string} params.realizadoPor - UserID de quien realiza la acción
 * @param {string} userId - UserID del usuario autenticado
 * @returns {Object} Resultado de la operación con status y mensaje
 */
function procesarRegistroNovedad(params, userId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Obtener información del usuario
    var user = getUserRecordByUserId_(userId);
    if (!user) {
      return { status: 'error', message: 'Usuario no encontrado: ' + userId };
    }
    var nombreCorto = user.nombreCorto || userId;

    // Obtener parámetros
    var noOrden = params.noOrden || "";
    var codigo = params.codigo || "";
    var tipoRegistro = params.tipoRegistro || "Novedad"; // "Novedad" o "Avance"
    var fechaActual = new Date();
    var timestampStr = Utilities.formatDate(fechaActual, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");

    // Actualizar STATUS y Novedades en la hoja Ordenes
    var sheetOrdenes = ss.getSheetByName('Ordenes');
    if (!sheetOrdenes) {
      return { status: 'error', message: 'La hoja Ordenes no existe.' };
    }

    var headersOrdenes = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
    var colNoOrdenCol = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'NoOrden', false);
    var colStatusCol = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'STATUS', false);
    var colNovedadesCol = getColumnIndexByNameCaseInsensitive(headersOrdenes, 'Novedades', false);

    if (!colNoOrdenCol) {
      return { status: 'error', message: 'No se encontró la columna NoOrden en Ordenes.' };
    }

    var dataRangeOrdenes = sheetOrdenes.getRange(2, 1, Math.max(1, sheetOrdenes.getLastRow() - 1), sheetOrdenes.getLastColumn());
    var valuesOrdenes = dataRangeOrdenes.getValues();
    var filaEncontrada = -1;
    var statusActual = "";
    var novedadesActuales = "";

    for (var i = 0; i < valuesOrdenes.length; i++) {
      var rowNoOrden = valuesOrdenes[i][colNoOrdenCol - 1];
      var rowNoOrdenStr = rowNoOrden ? rowNoOrden.toString().trim() : "";
      if (rowNoOrdenStr === noOrden) {
        filaEncontrada = i + 2;
        statusActual = colStatusCol ? (valuesOrdenes[i][colStatusCol - 1] || "") : "";
        if (colNovedadesCol) {
          novedadesActuales = valuesOrdenes[i][colNovedadesCol - 1] || "";
        }
        break;
      }
    }

    if (filaEncontrada === -1) {
      return { status: 'error', message: 'No se encontró la orden ' + noOrden + ' en la hoja Ordenes.' };
    }

    if (tipoRegistro === 'Avance') {
      var proceso = params.proceso || "";
      // Actualizar STATUS en Ordenes si es un avance (Lógica base)
      var statusMap = {
        'Inspección QA': 'RecibidaQA',
        'Revisión QA': 'RecibidaQA',
        'Devolución por QA': 'DevueltaQA',
        'Liberación': 'Cerrada',
        'Entrega a Producción': 'Impreso'
      };
      
      var nuevoStatus = statusMap[proceso] || params.status || statusActual;
      if (nuevoStatus && colStatusCol) {
        sheetOrdenes.getRange(filaEncontrada, colStatusCol).setValue(nuevoStatus);
      }

      // LogTiemposProceso
      var sheetTiempos = ss.getSheetByName('LogTiemposProceso');
      if (sheetTiempos) {
        sheetTiempos.appendRow([timestampStr, noOrden, proceso, nombreCorto]);
      } else {
        Logger.log("Hoja LogTiemposProceso no existe.");
      }
      
      var logDescripcion = 'Avance registrado: Orden ' + noOrden + ' -> ' + proceso;
      logChange('AVANCE_PROCESO', logDescripcion, getUserIdentityStringByUserId_(userId));

      return { 
        status: 'success', 
        message: 'Avance registrado exitosamente.',
        data: { noOrden: noOrden, nuevoStatus: nuevoStatus, realizadoPor: nombreCorto }
      };

    } else {
      // Registro de Novedad Operativa / Calidad
      var categoria = params.categoria || "";
      var subcategoria = params.subcategoria || "";
      var comentario = params.comentario || "";
      var totalPags = params.totalPags || 0;
      var noPagDevueltas = params.noPagDevueltas || 0;

      // Anexar a columna Novedades en Ordenes
      var textoNovedad = categoria + " (" + subcategoria + "): " + comentario + " - " + timestampStr + " - " + nombreCorto;
      if (colNovedadesCol) {
        var nuevaNovedadStr = novedadesActuales ? novedadesActuales + "\n" + textoNovedad : textoNovedad;
        sheetOrdenes.getRange(filaEncontrada, colNovedadesCol).setValue(nuevaNovedadStr);
      }

      // Insertar en RegistroNovedad
      var sheetRegistro = ss.getSheetByName('RegistroNovedad');
      if (sheetRegistro) {
        var lastColRegistro = Math.max(1, sheetRegistro.getLastColumn());
        var headersRegistro = sheetRegistro.getRange(1, 1, 1, lastColRegistro).getValues()[0];
        
        var rowData = new Array(headersRegistro.length).fill("");
        var dataMapping = {
          'FechaNovedad': timestampStr,
          'NoOrden': noOrden,
          'Codigo': codigo,
          'TipoNovedad': 'Novedad',
          'Categoria': categoria,
          'Subcategoria': subcategoria,
          'Comentario': comentario,
          'TotalPags': totalPags,
          'NoPagDevueltas': noPagDevueltas,
          'RealizadoPor': nombreCorto,
          'STATUS': statusActual
        };

        for (var colName in dataMapping) {
          var colIdx = getColumnIndexByNameCaseInsensitive(headersRegistro, colName, false);
          if (colIdx !== null && colIdx > 0) {
            rowData[colIdx - 1] = dataMapping[colName];
          }
        }
        sheetRegistro.appendRow(rowData);
      }

      var logDescripcionN = 'Novedad registrada: Orden ' + noOrden + ', Categoria: ' + categoria;
      logChange('REGISTRO_NOVEDAD', logDescripcionN, getUserIdentityStringByUserId_(userId));

      return { 
        status: 'success', 
        message: 'Novedad registrada exitosamente para orden ' + noOrden,
        data: { noOrden: noOrden, realizadoPor: nombreCorto }
      };
    }
  } catch (e) {
    Logger.log("ERROR en procesarRegistroNovedad: " + e.message);
    Logger.log("Stack trace: " + e.stack);
    return { status: 'error', message: 'Error al procesar registro: ' + e.message };
  }
}

// --- CONFIGURACIÓN DE CATEGORÍAS ---

/**
 * Obtiene el mapa de categorías y subcategorías desde la hoja ParametrosNovedades.
 * Si la hoja está vacía, inserta unos valores por defecto y los devuelve.
 * @returns {Object} Mapa de categorías (key) a array de subcategorías (value)
 */
function getNovedadesConfigMap() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('ParametrosNovedades');
    
    // Si la hoja no existe (aún no se ha inicializado), usar por defecto
    if (!sheet) {
      return getParametrosNovedadesPorDefecto_();
    }
    
    var lastRow = sheet.getLastRow();
    
    // Si la hoja existe pero está vacía (sólo encabezados), poblarla
    if (lastRow < 2) {
      poblarParametrosNovedadesPorDefecto_(sheet);
      lastRow = Math.max(2, sheet.getLastRow()); // Actualizar lastRow después de poblar
    }
    
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    var map = {};
    
    for (var i = 0; i < values.length; i++) {
      var cat = values[i][0] ? values[i][0].toString().trim() : "";
      var sub = values[i][1] ? values[i][1].toString().trim() : "";
      
      if (cat && sub) {
        if (!map[cat]) map[cat] = [];
        map[cat].push(sub);
      }
    }
    
    return map;
  } catch (e) {
    Logger.log("Error en getNovedadesConfigMap: " + e.message);
    return getParametrosNovedadesPorDefecto_(); // Fallback seguro
  }
}

function getParametrosNovedadesPorDefecto_() {
  return {
    'Impresión': ['Falla de inyección de tinta', 'Manchas/Tinta corrida', 'Datos ilegibles o borrosos', 'Desprendimiento de tinta', 'Código de barras/QR no lee', 'Error en consecutivo/lote/fecha', 'Otro'],
    'Desviación': ['Mezcla de material de empaque', 'Lote incorrecto', 'Falta de material', 'Falla en equipo/máquina', 'Daño físico a producto', 'Producto cruzado', 'Problema de temperatura/humedad', 'Otro'],
    'BPD': ['Firma faltante', 'Fecha incorrecta/faltante', 'Corrección no válida (tachones)', 'Casilla vacía', 'Uso de lápiz/corrector', 'Formato incorrecto', 'Otro'],
    'Observaciones': ['Faltantes en conteo (merma)', 'Sobrantes en conteo', 'Espera de insumos', 'Paro de línea programado', 'Otro']
  };
}

function poblarParametrosNovedadesPorDefecto_(sheet) {
  var defaultMap = getParametrosNovedadesPorDefecto_();
  var data = [];
  
  for (var cat in defaultMap) {
    var subs = defaultMap[cat];
    for (var i = 0; i < subs.length; i++) {
      data.push([cat, subs[i]]);
    }
  }
  
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, 2).setValues(data);
  }
}
