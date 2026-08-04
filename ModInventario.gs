// ============================================================
// MODULE: ModInventario
// Descripción: Gestiona la columna CantDispAFecha.
//              - Copia automática de VerifCant → CantDispAFecha
//              - Prompt de actualización al supervisor
// Prioridad de Carga: 5° (depende de EventBuilder)
// ============================================================

var ModInventario = {

  /**
   * Procesa la lógica de CantDispAFecha y VerifCant.
   * - Si CantDispAFecha está vacío y VerifCant tiene un valor numérico válido,
   *   copia automáticamente el valor.
   * - Si CantDispAFecha ya tiene valor y se edita Cantidad/NoAnalisis,
   *   pregunta al supervisor si desea actualizar.
   * Corresponde a la FASE 2 del monolito (Traceability.gs L366-414).
   * 
   * @param {Object} evt - EnrichedEvent del EventBuilder
   */
  procesarCantDisp: function(evt) {
    if (!evt.cols.CantDispAFecha || !evt.cols.VerifCant) return;

    var startRow = evt.startRow;
    var processNumRows = evt.numRows;
    if (startRow === 1) { startRow = 2; processNumRows--; }
    if (processNumRows <= 0) return;

    SpreadsheetApp.flush();
    var targetRangeCantDisp = evt.sheet.getRange(startRow, evt.cols.CantDispAFecha, processNumRows, 1);
    var targetRangeVerif = evt.sheet.getRange(startRow, evt.cols.VerifCant, processNumRows, 1);

    var lotes = evt.cols.Lote ? evt.sheet.getRange(startRow, evt.cols.Lote, processNumRows, 1).getValues() : null;
    var codigos = evt.cols.Codigo ? evt.sheet.getRange(startRow, evt.cols.Codigo, processNumRows, 1).getValues() : null;

    var cantDispValues = targetRangeCantDisp.getValues();
    var verifValues = targetRangeVerif.getValues();
    var updateNeeded = false;

    for (var r = 0; r < processNumRows; r++) {
      if (evt.isClearedArray[r]) continue;
      var actualVerif = verifValues[r][0];
      var actualCantDisp = cantDispValues[r][0];
      var hasLote = lotes ? (lotes[r][0] !== '') : true;
      var hasCodigo = codigos ? (codigos[r][0] !== '') : true;

      if (actualCantDisp === '' && actualVerif !== '' && actualVerif !== '-' && !isNaN(actualVerif) && hasLote && hasCodigo) {
        // Copia automática inicial
        cantDispValues[r][0] = actualVerif;
        updateNeeded = true;
        logChange('AUTO_COPY_VERIFCANT', 'Captura inicial: ' + actualVerif + ' a CantDispAFecha en fila ' + (startRow + r), evt.userIdentity);
      }
      else if (actualCantDisp !== '') {
        // Prompt al supervisor si se editó Cantidad o NoAnalisis en una sola celda
        if (evt.numRows === 1 && evt.numCols === 1) {
          var editedColName = evt.headers[evt.editedRange.getColumn() - 1];
          if (editedColName === 'Cantidad' || editedColName === 'NoAnalisis') {
            if (actualVerif !== '' && actualVerif !== '-' && !isNaN(actualVerif) && actualVerif !== actualCantDisp) {
              var ui = SpreadsheetApp.getUi();
              var response = ui.alert(
                'Actualización de Inventario',
                'Has modificado la columna "' + editedColName + '" en la fila ' + startRow + '.\n\n¿Deseas actualizar el registro histórico de "CantDispAFecha" con el valor de inventario actual disponible (' + actualVerif + ')?\n\n(Valor guardado actualmente: ' + actualCantDisp + ')',
                ui.ButtonSet.YES_NO
              );
              if (response === ui.Button.YES) {
                cantDispValues[r][0] = actualVerif;
                updateNeeded = true;
                logChange('ACTUALIZACION_CANT_DISP', 'Usuario actualizó CantDispAFecha de ' + actualCantDisp + ' a ' + actualVerif + ' tras modificar ' + editedColName + ' en fila ' + startRow, evt.userIdentity);
              }
            }
          }
        }
      }
    }
    if (updateNeeded) targetRangeCantDisp.setValues(cantDispValues);
  }
};
