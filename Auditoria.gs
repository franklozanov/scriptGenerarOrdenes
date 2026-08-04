// ============================================================
// MODULE: Auditoria
// Descripción: Registro forense de ediciones en la hoja Logs.
//              logChange() se mantiene como función global para
//              compatibilidad con NovedadLogic.gs, PrintLogic.gs
//              y UploadLogic.gs.
// Prioridad de Carga: 3° (depende de Helpers)
// ============================================================

/**
 * Namespace del módulo de Auditoría.
 * Contiene funciones que solo se invocan desde el EventRouter.
 * logChange() queda FUERA de este namespace intencionalmente (es global).
 */
var Auditoria = {

  /**
   * Revierte una edición no permitida y registra la violación.
   * Corresponde al bloque de protecciones del monolito (L171-182).
   * 
   * @param {Object} evt - EnrichedEvent del EventBuilder
   * @param {Object} e - Evento crudo de Google Apps Script
   */
  revertirEdicionNoPermitida: function(evt, e) {
    evt.editedRange.setValue(e.oldValue !== undefined ? e.oldValue : '');
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Este rango está protegido (' + evt.protectionDesc + '). Cambio revertido.',
      '⚠️ Edición no permitida',
      5
    );
    var cellAddress = evt.editedRange.getA1Notation();
    var violationDesc = 'Intento de edición denegado en la celda ' + cellAddress + ' de la hoja ' + evt.sheetName;
    logChange('VIOLACION_PERMISO', violationDesc, evt.userIdentity);
  },

  /**
   * Registra la edición en la hoja Logs (registro forense).
   * Corresponde al bloque de logging genérico del monolito (L552-611).
   * 
   * @param {Object} evt - EnrichedEvent del EventBuilder
   * @param {Object} e - Evento crudo de Google Apps Script
   */
  registrarEdicion: function(evt, e) {
    // Si es edición en Ordenes de refs/status con 1 celda, no saturar Logs
    if (evt.sheetName === 'Ordenes' && evt.numRows === 1 && evt.numCols === 1 && evt.isRequestOrStatusEdit) {
      return;
    }

    if (evt.numRows === 1 && evt.numCols === 1) {
      var oldValue = e.oldValue !== undefined ? e.oldValue : '(vacío)';
      var newValue = e.value !== undefined ? e.value : '(vacío)';
      var cellAddress = evt.editedRange.getA1Notation();

      var editDesc = '📍 Hoja: ' + evt.sheetName + '\n' +
                     '🎯 Celda: ' + cellAddress + '\n' +
                     '🔴 Antes: ' + oldValue + '\n' +
                     '🟢 Ahora: ' + newValue;

      var logType = (evt.sheetName === 'RegistroNovedad') ? 'EDICION_MANUAL_NOVEDAD' : 'EDICION_CELDA';
      logChange(logType, editDesc, evt.userIdentity);
    } else {
      var rangeA1 = evt.editedRange.getA1Notation();
      var values = evt.editedRange.getValues();
      var summaryRows = [];
      var maxRows = Math.min(10, values.length);
      var allEmpty = true;

      for (var r = 0; r < maxRows; r++) {
        var isRowEmpty = true;
        var rowStr = values[r].map(function(v) {
          if (v !== '') { allEmpty = false; isRowEmpty = false; }
          if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
          return v === '' ? '(vacío)' : v;
        }).join(' | ');

        if (!isRowEmpty) {
          summaryRows.push('▶ Fila ' + (r + 1) + ': [' + rowStr + ']');
        } else {
          summaryRows.push('▶ Fila ' + (r + 1) + ': [Borrada / Vacía]');
        }
      }

      for (var rr = maxRows; rr < values.length && allEmpty; rr++) {
        for (var cc = 0; cc < values[rr].length; cc++) {
          if (values[rr][cc] !== '') { allEmpty = false; break; }
        }
      }

      var massEditDesc = '';
      if (allEmpty) {
        massEditDesc = '📋 Borrado Masivo en: ' + evt.sheetName + '\n' +
                       '📍 Rango: ' + rangeA1 + ' (' + (evt.numRows * evt.numCols) + ' celdas)\n' +
                       '🔴 Todas las celdas de este rango fueron borradas o vaciadas.';
      } else {
        var valuesDesc = summaryRows.join('\n');
        if (values.length > 10) valuesDesc += '\n... (y ' + (values.length - 10) + ' filas más)';

        massEditDesc = '📋 Edición Masiva en: ' + evt.sheetName + '\n' +
                       '📍 Rango: ' + rangeA1 + ' (' + (evt.numRows * evt.numCols) + ' celdas)\n' +
                       'Nuevos Valores ingresados:\n' + valuesDesc;
      }

      var logTypeMass = (evt.sheetName === 'RegistroNovedad') ? 'EDICION_MASIVA_NOVEDAD' : 'EDICION_MASIVA';
      logChange(logTypeMass, massEditDesc, evt.userIdentity);
    }
  }
};
