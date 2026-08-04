// ============================================================
// MODULE: ModUsuarios
// Descripción: Gestiona la columna SolicitadoPor.
//              - Firma de creación ("Crea: NombreCorto (fecha)")
//              - Firma de modificación ("Mod: NombreCorto (fecha)")
//              - Periodo de gracia de 5 minutos (sobrescribe vs acumula)
//              - Limpieza cuando se vacía una fila
// Prioridad de Carga: 5° (depende de EventBuilder)
// ============================================================

var ModUsuarios = {

  /**
   * Limpia las columnas derivadas (CantDispAFecha, EstadoDocumentos, SolicitadoPor)
   * cuando el usuario vacía todas las columnas clave de una fila.
   * Corresponde a la FASE 0 del monolito (Traceability.gs L248-266).
   * 
   * @param {Object} evt - EnrichedEvent del EventBuilder
   */
  limpiarFilasVacias: function(evt) {
    if (!evt.anyRowCleared) return;

    var startRow = evt.startRow;
    var processNumRows = evt.numRows;
    if (startRow === 1) { startRow = 2; processNumRows--; }
    if (processNumRows <= 0) return;

    var dispValues = evt.cols.CantDispAFecha ? evt.sheet.getRange(startRow, evt.cols.CantDispAFecha, processNumRows, 1).getValues() : [];
    var estValues = evt.cols.EstadoDocumentos ? evt.sheet.getRange(startRow, evt.cols.EstadoDocumentos, processNumRows, 1).getValues() : [];
    var solValues = evt.cols.SolicitadoPor ? evt.sheet.getRange(startRow, evt.cols.SolicitadoPor, processNumRows, 1).getValues() : [];
    var statValues = evt.cols.STATUS ? evt.sheet.getRange(startRow, evt.cols.STATUS, processNumRows, 1).getValues() : [];

    var changedDisp = false, changedEst = false, changedSol = false, changedStat = false;

    for (var r = 0; r < processNumRows; r++) {
      if (evt.isClearedArray[r]) {
        if (evt.cols.CantDispAFecha && dispValues[r][0] !== '') { dispValues[r][0] = ''; changedDisp = true; }
        if (evt.cols.EstadoDocumentos && estValues[r][0] !== '') { estValues[r][0] = ''; changedEst = true; }
        if (evt.cols.SolicitadoPor && solValues[r][0] !== '') { solValues[r][0] = ''; changedSol = true; }
        if (evt.cols.STATUS && statValues[r][0] !== '') { statValues[r][0] = ''; changedStat = true; }
      }
    }

    if (changedDisp) evt.sheet.getRange(startRow, evt.cols.CantDispAFecha, processNumRows, 1).setValues(dispValues);
    if (changedEst) evt.sheet.getRange(startRow, evt.cols.EstadoDocumentos, processNumRows, 1).setValues(estValues);
    if (changedSol) evt.sheet.getRange(startRow, evt.cols.SolicitadoPor, processNumRows, 1).setValues(solValues);
    if (changedStat) evt.sheet.getRange(startRow, evt.cols.STATUS, processNumRows, 1).setValues(statValues);
  },

  /**
   * Actualiza la columna SolicitadoPor con la firma del usuario.
   * - Primera edición: "Crea: NombreCorto (dd/MM/yy HH:mm)"
   * - Modificación dentro de 5 min: Sobrescribe la última línea "Mod:"
   * - Modificación después de 5 min: Acumula nueva línea "Mod:"
   * Corresponde a la FASE 1 del monolito (Traceability.gs L268-364).
   * 
   * @param {Object} evt - EnrichedEvent del EventBuilder
   */
  actualizarSolicitadoPor: function(evt) {
    if (!evt.cols.SolicitadoPor) return;
    if (!evt.touchesDataColumns) return;
    // Si SOLO se editó SolicitadoPor y nada más, no procesar
    if (evt.touchesSolicitadoPor && evt.numCols === 1) return;

    var iterStartRow = evt.startRow;
    var iterNumRows = evt.numRows;
    if (iterStartRow === 1) { iterStartRow = 2; iterNumRows--; }
    if (iterNumRows <= 0) return;

    var targetRange = evt.sheet.getRange(iterStartRow, evt.cols.SolicitadoPor, iterNumRows, 1);
    var currentValues = targetRange.getValues();
    var updateNeeded = false;

    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm');
    var baseStamp = evt.nombreCorto + ' (' + timestamp + ')';

    for (var i = 0; i < iterNumRows; i++) {
      var isClearedIdx = (iterStartRow === 2 && evt.editedRange.getRow() === 1) ? i + 1 : i;

      // Fila vacía: limpiar la firma si existe
      if (evt.isClearedArray[isClearedIdx]) {
        var currVal = currentValues[i][0] ? currentValues[i][0].toString() : '';
        if (currVal !== '') {
          currentValues[i][0] = '';
          updateNeeded = true;
        }
        continue;
      }

      var currVal = currentValues[i][0] ? currentValues[i][0].toString() : '';

      if (currVal === '' || evt.touchesSolicitadoPor) {
        // Primera edición o sobreescritura directa de SolicitadoPor
        currentValues[i][0] = 'Crea: ' + baseStamp;
        updateNeeded = true;
      } else {
        // Lógica de periodo de gracia de 5 minutos
        var lines = currVal.split('\n');
        var lastLine = lines[lines.length - 1];

        var timeMatch = lastLine.match(/.* \((.*?)\)/);
        var lastMs = 0;
        if (timeMatch) {
          var p = timeMatch[1].split(' ');
          if (p.length === 2) {
            var d = p[0].split('/');
            var t = p[1].split(':');
            if (d.length === 3 && t.length === 2) {
              lastMs = new Date(2000 + parseInt(d[2], 10), parseInt(d[1], 10) - 1, parseInt(d[0], 10), parseInt(t[0], 10), parseInt(t[1], 10)).getTime();
            }
          }
        }
        var nowMs = new Date().getTime();
        var elapsed = nowMs - lastMs;

        if (lines.length === 1) {
          // Solo existe "Crea:", agregamos "Mod:" preservando la creación
          lines.push('Mod: ' + baseStamp);
        } else {
          if (elapsed <= 300000) { // 5 minutos
            // Dentro del periodo de gracia: sobrescribir última línea Mod:
            lines[lines.length - 1] = 'Mod: ' + baseStamp;
          } else {
            // Fuera del periodo: acumular nueva línea Mod:
            lines.push('Mod: ' + baseStamp);
          }
        }

        var newLineStr = lines.join('\n');
        if (currVal !== newLineStr) {
          currentValues[i][0] = newLineStr;
          updateNeeded = true;
        }
      }
    }

    if (updateNeeded) {
      targetRange.setValues(currentValues);
      SpreadsheetApp.flush(); // Fuerza la visualización inmediata antes de validación Drive
    }
  }
};
