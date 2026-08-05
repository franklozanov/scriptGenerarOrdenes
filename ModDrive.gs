// ============================================================
// MODULE: ModDrive
// Descripción: Gestiona STATUS, EstadoDocumentos y la validación
//              de documentos en Google Drive.
//              - Asignación automática de STATUS = "Creada"
//              - Validación inline vía índice de documentos (O(1)),
//                misma lógica sin importar cuántas filas se peguen
//              - Prompt de reversión para filas ya impresas/anuladas
//              - Función de menú forzarActualizacion()
// Prioridad de Carga: 5° (depende de EventBuilder y Helpers)
// ============================================================

var ModDrive = {

  /**
   * Procesa STATUS y EstadoDocumentos tras una edición.
   * - Filas nuevas sin STATUS → asigna "Creada".
   * - Valida EstadoDocumentos inline vía el índice de documentos (O(1)):
   *   la misma lógica sin importar cuántas filas se peguen. Ya NO existe la
   *   rama de "pegado masivo diferido" ni el pseudo-estado "⏳ Pendiente Validar"
   *   (era un valor fuera del data-validation de la columna).
   * - Filas Impreso/Reimpreso/Anulada se saltan (no se re-validan) salvo en
   *   edición individual, donde se ofrece el prompt de reversión a "Creada".
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
    var statusValues = colStatusIdx ? evt.sheet.getRange(startRow, colStatusIdx, processNumRows, 1).getValues() : [];

    var multiFila = processNumRows > 1;
    if (multiFila) SpreadsheetApp.getActiveSpreadsheet().toast('Validando documentos...', 'Sistema QMS', 3);

    for (var r = 0; r < processNumRows; r++) {
      var isClearedIdx = (startRow === 2 && evt.editedRange.getRow() === 1) ? r + 1 : r;
      if (evt.isClearedArray[isClearedIdx]) continue;

      var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : '';
      var shouldValidate = evt.touchesRefColumns || evt.touchesStatus;

      // Fila nueva sin STATUS → "Creada" (inmediato, para que actualizarEstado lo vea)
      if (currStatus === '') {
        if (colStatusIdx) {
          evt.sheet.getRange(startRow + r, colStatusIdx).setValue(VALORES_STATUS.CREADA);
          currStatus = VALORES_STATUS.CREADA;
        }
      }

      if (currStatus === VALORES_STATUS.IMPRESO || currStatus === VALORES_STATUS.REIMPRESO || currStatus === VALORES_STATUS.ANULADA) {
        if (evt.numRows === 1) {
          var editedOnlyStatus = (evt.numCols === 1 && evt.startCol === colStatusIdx);
          if (editedOnlyStatus) {
            // El usuario cambió STATUS a mano: respetamos su elección sin preguntar.
            shouldValidate = true;
          } else {
            var ui = SpreadsheetApp.getUi();
            var statusStr = (currStatus === VALORES_STATUS.ANULADA) ? 'anulada' : 'impresa';
            var response = ui.alert(
              '⚠️ Orden ya procesada',
              'Estás modificando datos de una orden que ya fue ' + statusStr + ' (Fila ' + (startRow + r) + ').\n\n¿Deseas devolver el STATUS a "' + VALORES_STATUS.CREADA + '" para reactivar su validación en Drive?',
              ui.ButtonSet.YES_NO
            );
            if (response === ui.Button.YES) {
              if (colStatusIdx) evt.sheet.getRange(startRow + r, colStatusIdx).setValue(VALORES_STATUS.CREADA);
              shouldValidate = true;
              logChange('ESTADO_REVERTIDO', 'Usuario modificó fila ' + statusStr + ' y aceptó regresar el STATUS a ' + VALORES_STATUS.CREADA, evt.userIdentity);
            } else {
              shouldValidate = (currStatus === VALORES_STATUS.ANULADA);
            }
          }
        } else {
          // Pegado múltiple sobre filas impresas/anuladas: solo asegurar el sello de anuladas.
          shouldValidate = (currStatus === VALORES_STATUS.ANULADA);
        }
      }

      if (shouldValidate) {
        actualizarEstadoDocumentosEnHoja(evt.sheet, startRow + r, evt.headers);
      }
    }

    if (multiFila) SpreadsheetApp.getActiveSpreadsheet().toast('Validación completada.', 'Sistema QMS', 3);
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
