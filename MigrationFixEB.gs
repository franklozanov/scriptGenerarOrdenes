// ============================================================
// MODULE: MigrationFixEB
// Descripción: Script de migración segura de datos desde la 
//              versión antigua (Impresion_V2) hacia la nueva 
//              estructura (fix-eb-app).
// ============================================================

/**
 * Función principal de migración.
 * Configura los IDs de los documentos antes de ejecutar.
 */
function ejecutarMigracion() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert('Migración de Datos', 
    '¿Está seguro de iniciar la migración? Asegúrese de haber configurado el SOURCE_SPREADSHEET_ID en el código.', 
    ui.ButtonSet.YES_NO);
    
  if (confirm !== ui.Button.YES) {
    ui.alert('Migración cancelada.');
    return;
  }

  // TODO: Reemplaza con el ID de la hoja de cálculo de origen (Impresion_V2)
  var SOURCE_SPREADSHEET_ID = 'COMPLETAR_ID_AQUI'; 
  
  if (SOURCE_SPREADSHEET_ID === 'COMPLETAR_ID_AQUI') {
    ui.alert('Error: Debes configurar el SOURCE_SPREADSHEET_ID en MigrationFixEB.gs antes de ejecutar.');
    return;
  }

  var sourceSS;
  try {
    sourceSS = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  } catch (e) {
    ui.alert('Error: No se pudo abrir la hoja de origen. Verifica el ID y los permisos.');
    return;
  }

  var targetSS = SpreadsheetApp.getActiveSpreadsheet();

  ui.alert('La migración puede tomar varios minutos. Revisa los Logs (Ejecuciones) para seguir el progreso.');

  // Fase 1: Maestros
  Logger.log('Iniciando Fase 1: Tablas Maestras');
  migrarHoja(sourceSS, targetSS, 'Usuarios', true);
  migrarHoja(sourceSS, targetSS, 'PermisosRoles', true);
  migrarHoja(sourceSS, targetSS, 'ParametrosNovedades', true);
  migrarHoja(sourceSS, targetSS, 'templates', true);

  // Fase 2: Bases de Calidad (Kardex)
  Logger.log('Iniciando Fase 2: Bases de Calidad');
  // Para Kardex, mantenemos los formatos del encabezado pero copiamos la data
  migrarKardex(sourceSS, targetSS, 'K2026', 6);
  migrarKardex(sourceSS, targetSS, 'K2025', 8);

  // Fase 3: Operación Central
  Logger.log('Iniciando Fase 3: Operación Central');
  migrarOrdenes(sourceSS, targetSS, 'Ordenes');

  // Fase 4 y 5: Tablas Relacionales y Auditoría
  Logger.log('Iniciando Fase 4 y 5: Auditoría e Índices');
  migrarHoja(sourceSS, targetSS, 'RegistroNovedad', true);
  migrarHoja(sourceSS, targetSS, 'IndiceDocumentos', true);
  migrarHoja(sourceSS, targetSS, 'Logs', true);
  migrarHoja(sourceSS, targetSS, 'LogTiemposProceso', true);

  Logger.log('MIGRACIÓN COMPLETADA CON ÉXITO.');
  ui.alert('Éxito', 'La migración ha finalizado. Revisa los logs para más detalles.', ui.ButtonSet.OK);
}

/**
 * Migra una hoja completa (valores). Útil para maestros y auditoría.
 */
function migrarHoja(sourceSS, targetSS, sheetName, clearTarget) {
  var sourceSheet = sourceSS.getSheetByName(sheetName);
  var targetSheet = targetSS.getSheetByName(sheetName);
  
  if (!sourceSheet) {
    Logger.log('Hoja de origen no encontrada: ' + sheetName);
    return;
  }
  
  if (!targetSheet) {
    targetSheet = targetSS.insertSheet(sheetName);
    Logger.log('Hoja creada en destino: ' + sheetName);
  } else if (clearTarget) {
    targetSheet.clearContents();
  }

  var data = sourceSheet.getDataRange().getValues();
  if (data.length > 0 && data[0].length > 0) {
    // Pegar solo valores para evitar arrastrar referencias externas
    targetSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    Logger.log('Migrados ' + data.length + ' registros en ' + sheetName);
  }
}

/**
 * Migra hojas Kardex respetando las filas de encabezado complejas en el destino.
 */
function migrarKardex(sourceSS, targetSS, sheetName, dataStartRow) {
  var sourceSheet = sourceSS.getSheetByName(sheetName);
  var targetSheet = targetSS.getSheetByName(sheetName);
  
  if (!sourceSheet || !targetSheet) {
    Logger.log('Kardex ' + sheetName + ' no encontrado en origen o destino. Saltando.');
    return;
  }
  
  var sourceLastRow = sourceSheet.getLastRow();
  var sourceLastCol = sourceSheet.getLastColumn();
  
  if (sourceLastRow >= dataStartRow) {
    var dataRows = sourceLastRow - dataStartRow + 1;
    var data = sourceSheet.getRange(dataStartRow, 1, dataRows, sourceLastCol).getValues();
    
    // Limpiar destino a partir de la fila de inicio
    var targetLastRow = targetSheet.getLastRow();
    if (targetLastRow >= dataStartRow) {
      targetSheet.getRange(dataStartRow, 1, targetLastRow - dataStartRow + 1, targetSheet.getMaxColumns()).clearContent();
    }
    
    // Forzar ciertas columnas de código (ej: Lote en N) a formato texto
    // (Opcional: targetSheet.getRange("N:N").setNumberFormat('@'); pero es mejor que el destino ya lo tenga)
    
    targetSheet.getRange(dataStartRow, 1, data.length, data[0].length).setValues(data);
    Logger.log('Kardex ' + sheetName + ' migrado: ' + data.length + ' registros.');
  }
}

/**
 * Migra la hoja de órdenes con manejo especial (Pegar valores).
 */
function migrarOrdenes(sourceSS, targetSS, sheetName) {
  var sourceSheet = sourceSS.getSheetByName(sheetName);
  var targetSheet = targetSS.getSheetByName(sheetName);
  
  if (!sourceSheet || !targetSheet) {
    Logger.log('Hoja de Ordenes no encontrada.');
    return;
  }
  
  var data = sourceSheet.getDataRange().getValues();
  if (data.length <= 1) return; // Solo encabezados
  
  targetSheet.clearContents();
  
  // Pegamos encabezados
  targetSheet.getRange(1, 1, 1, data[0].length).setValues([data[0]]);
  
  // Extraemos la data sin encabezado
  var rows = data.slice(1);
  
  // Forzar a formato texto para códigos
  targetSheet.getRange("B:B").setNumberFormat('@'); // Codigo
  targetSheet.getRange("D:D").setNumberFormat('@'); // Lote
  targetSheet.getRange("G:G").setNumberFormat('@'); // NoAnalisis
  targetSheet.getRange("H:H").setNumberFormat('@'); // NoOrden
  
  // SetValues (solo valores estáticos, congela las fórmulas antiguas de K:P)
  targetSheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  
  Logger.log('Migradas ' + rows.length + ' Órdenes.');
}
