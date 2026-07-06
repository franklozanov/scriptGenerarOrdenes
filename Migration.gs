// ============================================================
// MODULE: Migration
// Descripción: Scripts de migración de datos y estructura
// Prioridad de Carga: N/A (se ejecuta manualmente, no automáticamente)
// ============================================================
//
// ⚠️ IMPORTANTE - LEA ANTES DE USAR:
// 
// Este archivo contiene funciones de migración que se ejecutan MANUALMENTE
// una sola vez cuando se actualiza la estructura de datos del sistema.
//
// 📋 PROPÓSITO:
// - Migrar datos de estructuras antiguas a nuevas estructuras
// - Mantener historial de cambios estructurales en el sistema
// - Proporcionar funciones de verificación pre/post migración
//
// 🔒 REGLAS DE USO:
// 1. NUNCA ejecutar funciones de migración automáticamente en triggers
// 2. SIEMPRE hacer respaldo completo antes de ejecutar migraciones
// 3. SIEMPRE ejecutar verificarEstadoMigracion() ANTES de migrar
// 4. SOLO ejecutar cada migración UNA VEZ por ambiente
// 5. DOCUMENTAR fecha y usuario que ejecutó la migración
//
// 📝 CÓMO AGREGAR NUEVAS MIGRACIONES:
// 1. Crear función con nombre descriptivo: migrar[Descripción]()
// 2. Incluir validaciones de pre-condiciones (columnas existen, etc.)
// 3. Incluir lógica de skip para filas ya migradas
// 4. Incluir logs detallados del proceso
// 5. Incluir función de verificación asociada: verificar[Descripción]()
// 6. Documentar en comentarios: fecha creación, autor, propósito
//
// 📊 HISTORIAL DE MIGRACIONES:
// 
// [2026-05-13] migrarAdjuntoOrdenANuevasColumnas()
//   - Propósito: Migrar de columna única AdjuntoOrden a columnas separadas
//                AdjuntoCOA, AdjuntoOA y EstadoCarga
//   - Estado: Pendiente de ejecución en producción
//   - Ejecutado por: [PENDIENTE - Registrar aquí después de ejecutar]
//   - Resultado: [PENDIENTE - Registrar resultado aquí]
// [2026-07-06] migrarSeguridadPIN()
//   - Propósito: Limpiar contraseñas planas y preparar la hoja Usuarios para
//                el nuevo sistema de PIN encriptado y bloqueo.
//   - Estado: Pendiente
//
// ============================================================

/**
 * Migration.gs
 * 
 * Funciones de migración para actualizar la estructura de datos.
 * Este archivo contiene scripts de migración que se ejecutan una sola vez.
 */

/**
 * Migra la columna AdjuntoOrden a las nuevas columnas AdjuntoCOA y AdjuntoOA.
 * Esta función debe ejecutarse UNA SOLA VEZ después de agregar las nuevas columnas.
 * 
 * IMPORTANTE: Antes de ejecutar esta función:
 * 1. Agregue manualmente las columnas 'AdjuntoCOA', 'AdjuntoOA' y 'EstadoCarga' a la hoja 'Ordenes'
 * 2. Haga un respaldo de la hoja de cálculo
 * 
 * @returns {Object} Resultado de la migración con estadísticas
 */
function migrarAdjuntoOrdenANuevasColumnas() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Verificar que existan las nuevas columnas
    var colAdjuntoCOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
    var colAdjuntoOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
    var colEstadoCargaIdx = getColumnIndexByNameCaseInsensitive(headers, 'EstadoCarga', false);
    var colAdjuntoOrdenIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOrden', false);
    var colNoAnalisisIdx = getColumnIndexByNameCaseInsensitive(headers, 'NoAnalisis', false);
    
    if (!colAdjuntoCOAIdx || !colAdjuntoOAIdx || !colEstadoCargaIdx) {
      throw new Error("Las columnas 'AdjuntoCOA', 'AdjuntoOA' y 'EstadoCarga' deben existir antes de ejecutar la migración. Agréguelas manualmente primero.");
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { 
        status: 'success', 
        message: 'No hay datos para migrar.',
        rowsMigrated: 0
      };
    }
    
    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var data = dataRange.getValues();
    
    var rowsMigrated = 0;
    var rowsSkipped = 0;
    
    Logger.log("=== INICIANDO MIGRACIÓN ===");
    Logger.log("Total de filas a procesar: " + data.length);
    
    for (var i = 0; i < data.length; i++) {
      var rowIdx = i + 2; // +2 porque empezamos en fila 2 (después del header)
      
      // Obtener valor de AdjuntoOrden si existe
      var adjuntoOrdenValue = colAdjuntoOrdenIdx ? data[i][colAdjuntoOrdenIdx - 1] : null;
      var adjuntoOrdenStr = adjuntoOrdenValue ? adjuntoOrdenValue.toString().trim() : "";
      
      // Obtener NoAnalisis para determinar si tiene COA
      var noAnalisisValue = colNoAnalisisIdx ? data[i][colNoAnalisisIdx - 1] : null;
      var noAnalisisStr = noAnalisisValue ? noAnalisisValue.toString().trim() : "";
      var tieneCOA = noAnalisisStr !== "";
      
      // Verificar si ya tiene valores en las nuevas columnas
      var existingCOA = data[i][colAdjuntoCOAIdx - 1];
      var existingOA = data[i][colAdjuntoOAIdx - 1];
      var existingCOAStr = existingCOA ? existingCOA.toString().trim() : "";
      var existingOAStr = existingOA ? existingOA.toString().trim() : "";
      
      // Si ya tiene valores, saltar esta fila
      if (existingCOAStr !== "" || existingOAStr !== "") {
        rowsSkipped++;
        continue;
      }
      
      // Lógica de migración:
      // Si AdjuntoOrden = "✅ Cargado" -> ambas columnas a "✅ Cargado"
      // Determinar nuevos estados basados en el valor de AdjuntoOrden
      var nuevoEstadoCOA = VALORES_DOCUMENTO.PENDIENTE;
      var nuevoEstadoOA = VALORES_DOCUMENTO.PENDIENTE;
      
      if (adjuntoOrdenStr === VALORES_DOCUMENTO.CARGADO) {
        nuevoEstadoCOA = VALORES_DOCUMENTO.CARGADO;
        nuevoEstadoOA = VALORES_DOCUMENTO.CARGADO;
      } else {
        // Si estaba pendiente o vacío, dejar ambos como pendiente
        nuevoEstadoCOA = VALORES_DOCUMENTO.PENDIENTE;
        nuevoEstadoOA = VALORES_DOCUMENTO.PENDIENTE;
      }
      
      // Si no tiene NoAnalisis, el COA no aplica (dejar vacío o N/A)
      if (!tieneCOA) {
        nuevoEstadoCOA = ""; // Vacío si no tiene análisis
      }
      
      // Actualizar las celdas
      sheet.getRange(rowIdx, colAdjuntoCOAIdx).setValue(nuevoEstadoCOA);
      sheet.getRange(rowIdx, colAdjuntoOAIdx).setValue(nuevoEstadoOA);
      
      // Calcular y establecer estado consolidado
      actualizarEstadoCarga(sheet, rowIdx, headers);
      
      rowsMigrated++;
      
      // Log cada 50 filas para seguimiento
      if (rowsMigrated % 50 === 0) {
        Logger.log("Procesadas " + rowsMigrated + " filas...");
      }
    }
    
    Logger.log("=== MIGRACIÓN COMPLETADA ===");
    Logger.log("Filas migradas: " + rowsMigrated);
    Logger.log("Filas omitidas (ya tenían datos): " + rowsSkipped);
    
    // Mostrar mensaje al usuario
    var ui = SpreadsheetApp.getUi();
    ui.alert(
      'Migración Completada',
      'Se migraron ' + rowsMigrated + ' filas exitosamente.\n' +
      'Filas omitidas (ya tenían datos): ' + rowsSkipped + '\n\n' +
      'IMPORTANTE: Revise los datos y si todo está correcto, puede eliminar manualmente la columna "AdjuntoOrden" antigua.',
      ui.ButtonSet.OK
    );
    
    return {
      status: 'success',
      message: 'Migración completada exitosamente',
      rowsMigrated: rowsMigrated,
      rowsSkipped: rowsSkipped
    };
    
  } catch (e) {
    Logger.log("ERROR en migración: " + e.message);
    Logger.log(e.stack);
    
    var ui = SpreadsheetApp.getUi();
    ui.alert(
      'Error en Migración',
      'Ocurrió un error durante la migración:\n' + e.message + '\n\nRevise los logs para más detalles.',
      ui.ButtonSet.OK
    );
    
    throw e;
  }
}

/**
 * Función auxiliar para verificar el estado de la migración.
 * Muestra cuántas filas tienen datos en la columna antigua vs las nuevas.
 * @param {boolean} silent - Si es true, no muestra mensajes de UI (para uso en inicialización)
 */
function verificarEstadoMigracion(silent) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Ordenes');
    
    if (!sheet) {
      throw new Error("La hoja 'Ordenes' no existe.");
    }
    
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    var colAdjuntoCOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoCOA', false);
    var colAdjuntoOAIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOA', false);
    var colAdjuntoOrdenIdx = getColumnIndexByNameCaseInsensitive(headers, 'AdjuntoOrden', false);
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("No hay datos en la hoja.");
      return;
    }
    
    var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var data = dataRange.getValues();
    
    var conAdjuntoOrden = 0;
    var conNuevasColumnas = 0;
    var sinDatos = 0;
    
    for (var i = 0; i < data.length; i++) {
      var adjuntoOrden = colAdjuntoOrdenIdx ? data[i][colAdjuntoOrdenIdx - 1] : null;
      var adjuntoCOA = colAdjuntoCOAIdx ? data[i][colAdjuntoCOAIdx - 1] : null;
      var adjuntoOA = colAdjuntoOAIdx ? data[i][colAdjuntoOAIdx - 1] : null;
      
      var tieneOrden = adjuntoOrden && adjuntoOrden.toString().trim() !== "";
      var tieneNuevas = (adjuntoCOA && adjuntoCOA.toString().trim() !== "") || 
                        (adjuntoOA && adjuntoOA.toString().trim() !== "");
      
      if (tieneOrden) conAdjuntoOrden++;
      if (tieneNuevas) conNuevasColumnas++;
      if (!tieneOrden && !tieneNuevas) sinDatos++;
    }
    
    Logger.log("=== ESTADO DE MIGRACIÓN ===");
    Logger.log("Total de filas: " + data.length);
    Logger.log("Filas con datos en AdjuntoOrden: " + conAdjuntoOrden);
    Logger.log("Filas con datos en nuevas columnas (COA/OA): " + conNuevasColumnas);
    Logger.log("Filas sin datos en ninguna: " + sinDatos);
    
    // Mostrar mensaje al usuario solo si no es modo silencioso
    if (!silent) {
      try {
        var ui = SpreadsheetApp.getUi();
        ui.alert(
          'Estado de Migración',
          'Total de filas: ' + data.length + '\n' +
          'Filas con datos en AdjuntoOrden (antigua): ' + conAdjuntoOrden + '\n' +
          'Filas con datos en nuevas columnas (COA/OA): ' + conNuevasColumnas + '\n' +
          'Filas sin datos: ' + sinDatos,
          ui.ButtonSet.OK
        );
      } catch (uiError) {
        Logger.log("No se pudo mostrar mensaje UI (contexto sin UI): " + uiError.message);
      }
    }
    
    return {
      totalFilas: data.length,
      conAdjuntoOrden: conAdjuntoOrden,
      conNuevasColumnas: conNuevasColumnas,
      sinDatos: sinDatos
    };
    
  } catch (e) {
    Logger.log("ERROR en verificación: " + e.message);
    throw e;
  }
}

/**
 * Migra la hoja Usuarios al nuevo sistema de Seguridad PIN Encriptado.
 * 1. Verifica/Limpiará la columna 'Clave' para que el usuario deba crear su PIN.
 * 2. Verifica/Inicializa la columna 'IntentosFallidos' a 0.
 * 
 * Se puede ejecutar de manera segura múltiples veces (si el PIN ya parece un Hash SHA-256 no lo borra).
 */
function migrarSeguridadPIN() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
  var colIntentosIdx = getColumnIndexByNameCaseInsensitive(headers, 'IntentosFallidos', false);
  var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);

  if (!colClaveIdx || !colIntentosIdx || !colEstadoIdx) {
    Logger.log("migrarSeguridadPIN: Faltan columnas clave (Clave, Estado o IntentosFallidos). Ejecute fixHeaders primero.");
    return;
  }

  var dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  var data = dataRange.getValues();
  var needsUpdate = false;

  for (var i = 0; i < data.length; i++) {
    var clave = data[i][colClaveIdx - 1] ? data[i][colClaveIdx - 1].toString().trim() : "";
    var intentos = data[i][colIntentosIdx - 1];
    var estado = data[i][colEstadoIdx - 1] ? data[i][colEstadoIdx - 1].toString().trim() : "";
    
    // Si la clave no está vacía y no tiene pinta de ser un hash de 64 caracteres hex, la limpiamos
    if (clave !== "" && clave !== "PENDIENTE" && clave.length !== 64) {
      data[i][colClaveIdx - 1] = "PENDIENTE";
      needsUpdate = true;
    }

    // Inicializar IntentosFallidos a 0 si está vacío o no es número
    if (intentos === "" || isNaN(intentos)) {
      data[i][colIntentosIdx - 1] = 0;
      needsUpdate = true;
    }
    
    // Si no tiene estado, poner Activo
    if (estado === "") {
        data[i][colEstadoIdx - 1] = "Activo";
        needsUpdate = true;
    }
  }

  if (needsUpdate) {
    dataRange.setValues(data);
    Logger.log("✓ Migración de Seguridad PIN completada: Se limpiaron contraseñas antiguas y se inicializaron intentos.");
  } else {
    Logger.log("✓ Migración de Seguridad PIN verificada: No se requirieron cambios.");
  }
}
