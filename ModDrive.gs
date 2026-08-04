// ============================================================
// MODULE: ModDrive
// Descripción: Gestiona STATUS, EstadoDocumentos y la validación
//              de documentos en Google Drive.
//              - Asignación automática de STATUS = "Pendiente"
//              - Pegado masivo → "⏳ Pendiente Validar"
//              - Edición individual → Verificación inmediata en Drive
//              - Prompt de reversión para filas ya impresas/anuladas
//              - Función de menú forzarActualizacion()
// Prioridad de Carga: 5° (depende de EventBuilder y Helpers)
// ============================================================

var ModDrive = {

  /**
   * Procesa STATUS y EstadoDocumentos tras una edición.
   * - Filas nuevas sin STATUS → asigna "Pendiente"
   * - Pegado masivo (>3 filas) → marca "⏳ Pendiente Validar" sin consultar Drive
   * - Edición individual → valida documentos en Drive en tiempo real
   * - Filas impresas/anuladas → prompt de reversión
   * Corresponde a la FASE 3 del monolito (Traceability.gs L417-546).
   * 
   * @param {Object} evt - EnrichedEvent del EventBuilder
   */
  procesarStatusYDocumentos: function(evt) {
    if (!evt.isRequestOrStatusEdit) return;

    var startRow = evt.startRow;
    var processNumRows = evt.numRows;
    if (startRow === 1) { startRow = 2; processNumRows--; }
    if (processNumRows <= 0) return;

    var colStatusIdx = evt.cols.STATUS;
    var colEstadoDocs = evt.cols.EstadoDocumentos;

    var statusValues = colStatusIdx ? evt.sheet.getRange(startRow, colStatusIdx, processNumRows, 1).getValues() : [];
    var estadoDocsValues = colEstadoDocs ? evt.sheet.getRange(startRow, colEstadoDocs, processNumRows, 1).getValues() : [];

    // === PEGADO MASIVO: No bloquear con validaciones lentas de Drive ===
    if (evt.isMassivePaste) {
      var changedMassive = false;
      for (var r = 0; r < processNumRows; r++) {
        var isClearedIdx = (startRow === 2 && evt.editedRange.getRow() === 1) ? r + 1 : r;
        if (evt.isClearedArray[isClearedIdx]) continue;

        var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : '';

        // Filas nuevas sin STATUS → asignar Pendiente
        if (currStatus === '') {
          if (colStatusIdx) {
            statusValues[r][0] = 'Pendiente';
            currStatus = 'Pendiente';
            changedMassive = true;
          }
        }

        if (currStatus !== 'Impreso' && currStatus !== 'Reimpreso' && currStatus !== 'Anulada') {
          if (colEstadoDocs) {
            estadoDocsValues[r][0] = '⏳ Pendiente Validar';
            changedMassive = true;
          }
        } else if (currStatus === 'Anulada') {
          if (colEstadoDocs && estadoDocsValues[r][0] !== '🚫 Orden Anulada') {
            estadoDocsValues[r][0] = '🚫 Orden Anulada';
            changedMassive = true;
          }
        }
      }
      if (changedMassive) {
        if (colEstadoDocs) evt.sheet.getRange(startRow, colEstadoDocs, processNumRows, 1).setValues(estadoDocsValues);
        if (colStatusIdx) evt.sheet.getRange(startRow, colStatusIdx, processNumRows, 1).setValues(statusValues);
      }
      SpreadsheetApp.getActiveSpreadsheet().toast('Se pegaron varias filas. Usa \'Refrescar Estado de Documentos\' del menú superior para validarlas todas juntas.', 'Validación Diferida', 8);
      logChange('CAMBIO_MASIVO', 'Pegado de ' + processNumRows + ' filas. Se marcó como Pendiente Validar para optimizar.', evt.userIdentity);
    }
    // === EDICIÓN INDIVIDUAL O PEQUEÑA ===
    else {
      for (var r = 0; r < processNumRows; r++) {
        var isClearedIdx = (startRow === 2 && evt.editedRange.getRow() === 1) ? r + 1 : r;
        if (evt.isClearedArray[isClearedIdx]) continue;

        var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : '';
        var shouldValidate = evt.touchesRefColumns || evt.touchesStatus;

        // Filas nuevas sin STATUS → asignar Pendiente inmediatamente
        if (currStatus === '') {
          if (colStatusIdx) {
            evt.sheet.getRange(startRow + r, colStatusIdx).setValue('Pendiente');
            currStatus = 'Pendiente';
          }
        }

        if (currStatus === 'Impreso' || currStatus === 'Reimpreso' || currStatus === 'Anulada') {
          if (evt.numRows === 1) {
            var editedOnlyStatus = (evt.numCols === 1 && evt.startCol === colStatusIdx);

            if (editedOnlyStatus) {
              shouldValidate = true;
            } else {
              var ui = SpreadsheetApp.getUi();
              var statusStr = (currStatus === 'Anulada') ? 'anulada' : 'impresa';
              var response = ui.alert(
                '⚠️ Orden ya procesada',
                'Estás modificando datos de una orden que ya fue ' + statusStr + ' (Fila ' + (startRow + r) + ').\n\n¿Deseas devolver el STATUS a "Pendiente" para reactivar su validación en Drive?',
                ui.ButtonSet.YES_NO
              );

              if (response === ui.Button.YES) {
                if (colStatusIdx) evt.sheet.getRange(startRow + r, colStatusIdx).setValue('Pendiente');
                shouldValidate = true;
                logChange('ESTADO_REVERTIDO', 'Usuario modificó fila ' + statusStr + ' y aceptó regresar el STATUS a Pendiente', evt.userIdentity);
              } else {
                shouldValidate = (currStatus === 'Anulada');
              }
            }
          } else {
            shouldValidate = (currStatus === 'Anulada');
          }
        }

        if (shouldValidate) {
          if (processNumRows > 1) SpreadsheetApp.getActiveSpreadsheet().toast('Validando documentos en Drive...', 'Sistema QMS', 3);
          actualizarEstadoDocumentosEnHoja(evt.sheet, startRow + r, evt.headers);
          if (processNumRows > 1) SpreadsheetApp.getActiveSpreadsheet().toast('Validación en Drive completada.', 'Sistema QMS', 3);
        }
      }
    }
  },

  /**
   * Función de menú: Fuerza la actualización del estado de documentos
   * escaneando Drive para las filas seleccionadas o toda la hoja.
   * Corresponde a forzarActualizacionEstadoDocumentos() del monolito (L670-740).
   * 
   * Se invoca desde el wrapper público forzarActualizacionEstadoDocumentos().
   */
  forzarActualizacion: function() {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getActiveSheet();

      if (sheet.getName() !== 'Ordenes') {
        SpreadsheetApp.getUi().alert('Esta función solo se puede usar en la hoja Ordenes.');
        return;
      }

      var selection = sheet.getActiveRange();
      var startRow = selection.getRow();
      var numRows = selection.getNumRows();
      var maxRows = sheet.getLastRow();
      var soloPendientes = false;

      if (numRows === 1 || startRow === 1) {
        var ui = SpreadsheetApp.getUi();
        var respuesta = ui.alert(
          'Confirmación',
          '¿Desea escanear SOLO las órdenes Pendientes? (Recomendado y rápido).\n\nSeleccione "No" para forzar el escaneo de toda la hoja.',
          ui.ButtonSet.YES_NO_CANCEL
        );

        if (respuesta === ui.Button.CANCEL || respuesta === ui.Button.CLOSE) return;
        if (respuesta === ui.Button.YES) soloPendientes = true;

        startRow = 2;
        numRows = maxRows - 1;
      }

      if (numRows < 1) return;

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colStatusIdx = getColumnIndexByNameCaseInsensitive(headers, 'STATUS', false);

      var statusValues = [];
      if (colStatusIdx && soloPendientes) {
        statusValues = sheet.getRange(startRow, colStatusIdx, numRows, 1).getValues();
      }

      SpreadsheetApp.getActiveSpreadsheet().toast('Escaneando filas en Drive...', 'Sistema QMS', 5);

      var actualizadas = 0;
      var saltadas = 0;
      for (var r = 0; r < numRows; r++) {
        var currentRow = startRow + r;
        if (currentRow > maxRows) break;

        if (soloPendientes && colStatusIdx) {
          var st = statusValues[r][0] ? statusValues[r][0].toString().trim() : '';
          if (st === 'Impreso' || st === 'Reimpreso' || st === 'Anulada') {
            saltadas++;
            continue;
          }
        }

        actualizarEstadoDocumentosEnHoja(sheet, currentRow, headers);
        actualizadas++;
      }

      var msg = '✅ ' + actualizadas + ' filas validadas.';
      if (saltadas > 0) msg += ' (Saltadas ' + saltadas + ' ya impresas)';
      SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Sistema QMS', 8);
    } catch (e) {
      Logger.log('Error en forzarActualizacion: ' + e.message);
      SpreadsheetApp.getUi().alert('Error', 'Ocurrió un error al validar: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  }
};
