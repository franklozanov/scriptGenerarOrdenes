// ============================================================
// MODULE: RefactorEBDApp
// Descripción: Script de migración estructural "In-Place" 
//              para adaptar la hoja copiada a la rama fix-eb-app.
// ============================================================

function ejecutarRefactorEstructural() {
  var ui = SpreadsheetApp.getUi();
  
  // ID de la copia exacta
  var TARGET_SPREADSHEET_ID = '1nrHlI-b9K6XNLQckfhghd3O8QJ3tSsDH1ywN9jN-g4g'; 

  var confirm = ui.alert('Refactor Estructural', 
    '¿Está seguro de modificar la estructura de la hoja con ID ' + TARGET_SPREADSHEET_ID + '?\n\n' +
    'Esto reemplazará la columna "EstadoDocumentos" por "AdjuntoCOA", "AdjuntoOA" y "EstadoCarga".', 
    ui.ButtonSet.YES_NO);
    
  if (confirm !== ui.Button.YES) {
    ui.alert('Refactor cancelado.');
    return;
  }

  var targetSS;
  try {
    targetSS = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  } catch (e) {
    ui.alert('Error: No se pudo abrir la hoja ' + TARGET_SPREADSHEET_ID + '. Verifica los permisos.');
    return;
  }

  var sheetOrdenes = targetSS.getSheetByName('Ordenes');
  if (!sheetOrdenes) {
    ui.alert('No se encontró la pestaña "Ordenes" en la hoja destino.');
    return;
  }

  var headers = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
  
  // 1. Buscar la columna 'EstadoDocumentos'
  var colEstadoDocsIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().replace(/\s/g, '') === 'estadodocumentos') {
      colEstadoDocsIdx = i + 1; // 1-based para getRange
      break;
    }
  }

  if (colEstadoDocsIdx === -1) {
    ui.alert('La columna "EstadoDocumentos" no existe. Es posible que ya hayas ejecutado esta migración.');
    return;
  }

  // 2. Insertar 3 columnas antes de EstadoDocumentos
  sheetOrdenes.insertColumnsBefore(colEstadoDocsIdx, 3);
  
  // 3. Poner títulos a las nuevas columnas
  sheetOrdenes.getRange(1, colEstadoDocsIdx).setValue('AdjuntoCOA');
  sheetOrdenes.getRange(1, colEstadoDocsIdx + 1).setValue('AdjuntoOA');
  sheetOrdenes.getRange(1, colEstadoDocsIdx + 2).setValue('EstadoCarga');

  // 4. Mapear datos viejos a las 3 nuevas columnas
  var lastRow = sheetOrdenes.getLastRow();
  if (lastRow > 1) {
    var numRows = lastRow - 1;
    // La columna original se movió 3 posiciones a la derecha
    var colViejaIdx = colEstadoDocsIdx + 3; 
    var datosViejos = sheetOrdenes.getRange(2, colViejaIdx, numRows, 1).getValues();
    
    var nuevosDatos = [];
    for (var r = 0; r < datosViejos.length; r++) {
      var valorViejo = String(datosViejos[r][0]).toLowerCase();
      var adjCOA = "Pendiente";
      var adjOA = "Pendiente";
      var estadoCarga = "Pendiente COA/OA";

      if (valorViejo.indexOf('listos para imprimir') !== -1 || valorViejo.indexOf('cargados') !== -1 || valorViejo.indexOf('🟢') !== -1) {
        adjCOA = "✅ Cargado";
        adjOA = "✅ Cargado";
        estadoCarga = "✅ Cargados";
      } else if (valorViejo.indexOf('falta coa') !== -1) {
        adjCOA = "Pendiente";
        adjOA = "✅ Cargado";
        estadoCarga = "Pendiente COA";
      } else if (valorViejo.indexOf('falta oa') !== -1) {
        adjCOA = "✅ Cargado";
        adjOA = "Pendiente";
        estadoCarga = "Pendiente OA";
      } else if (valorViejo.indexOf('faltan ambos') !== -1) {
        adjCOA = "Pendiente";
        adjOA = "Pendiente";
        estadoCarga = "Pendiente COA/OA";
      } else if (valorViejo.indexOf('anulada') !== -1) {
        adjCOA = "Pendiente";
        adjOA = "Pendiente";
        estadoCarga = "🚫 Orden Anulada";
      } else {
        // En caso de estar vacía, la dejamos Pendiente
      }
      
      nuevosDatos.push([adjCOA, adjOA, estadoCarga]);
    }

    // 5. Pegar la data mapeada
    // Limpiamos las validaciones de datos heredadas antes de pegar
    sheetOrdenes.getRange(2, colEstadoDocsIdx, numRows, 3).clearDataValidations();
    sheetOrdenes.getRange(2, colEstadoDocsIdx, numRows, 3).setValues(nuevosDatos);
  }

  // 6. Eliminar la columna vieja
  sheetOrdenes.deleteColumn(colEstadoDocsIdx + 3);

  // 7. Forzar el formato texto a los IDs de Órdenes y Lotes
  var newHeaders = sheetOrdenes.getRange(1, 1, 1, sheetOrdenes.getLastColumn()).getValues()[0];
  for (var i = 0; i < newHeaders.length; i++) {
    var h = String(newHeaders[i]).toLowerCase().replace(/\s/g, '');
    if (h === 'codigo' || h === 'lote' || h === 'noanalisis' || h === 'noorden') {
      sheetOrdenes.getRange(2, i + 1, sheetOrdenes.getMaxRows(), 1).setNumberFormat('@');
    }
  }

  ui.alert('Migración In-Place completada.', 
    'Se reemplazó "EstadoDocumentos" exitosamente por las 3 nuevas columnas requeridas para fix-eb-app.', 
    ui.ButtonSet.OK);
}
