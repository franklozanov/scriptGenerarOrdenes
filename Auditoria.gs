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
   * ENFORCEMENT: revierte una edición MANUAL a una hoja de sistema completa
   * (Logs, IndiceDocumentos, LogTiemposProceso) y la audita como violación.
   * Los setValue del script no disparan el trigger → aquí solo llegan ediciones
   * humanas, así que revertir siempre es correcto.
   *
   * @param {Object} e - Evento crudo de Google Apps Script
   * @param {Range} editedRange - Rango editado por el usuario
   */
  revertirEdicionSistema: function(e, editedRange) {
    var sheet = editedRange.getSheet();
    var numRows = editedRange.getNumRows();
    var numCols = editedRange.getNumColumns();

    if (numRows === 1 && numCols === 1) {
      editedRange.setValue(e.oldValue !== undefined ? e.oldValue : '');
    } else {
      editedRange.clearContent();
    }
    SpreadsheetApp.flush();

    var email = (e.user && e.user.getEmail()) ? e.user.getEmail() : Session.getActiveUser().getEmail();
    var userIdentity = email || 'Usuario no identificado (edición directa)';
    if (email && typeof getUserRecordsByEmail_ === 'function') {
      var recs = getUserRecordsByEmail_(email);
      if (recs && recs.length > 0) {
        userIdentity = recs[0].userId + ' - ' + (recs[0].nombreCorto || recs[0].userId);
      }
    }

    SpreadsheetApp.getActiveSpreadsheet().toast(
      'La hoja "' + sheet.getName() + '" es de sistema y no se edita manualmente. Cambio revertido.',
      '⚠️ Edición no permitida', 6);
    logChange('VIOLACION_PERMISO',
      'Intento de edición manual en hoja de sistema ' + sheet.getName() + ' ' + editedRange.getA1Notation() + '. Revertido.',
      userIdentity);
  },

  /**
   * ENFORCEMENT: revierte la edición MANUAL a columnas de sistema dentro de una
   * edición en Ordenes. Celda suelta → valor anterior exacto; multi-celda → limpiar.
   * NO toca filas que se están vaciando (borrado legítimo, isClearedArray) ni el
   * encabezado.
   *
   * @param {Object} e - Evento crudo de Google Apps Script
   * @param {Object} evt - EnrichedEvent del EventBuilder
   * @returns {boolean} true si revirtió algo
   */
  revertirColumnasSistema: function(e, evt) {
    var colsSys = evt.columnasSistemaTocadas;
    if (!colsSys || colsSys.length === 0) return false;

    var esCeldaSuelta = (evt.numRows === 1 && evt.numCols === 1);
    var revertidoAlgo = false;
    var nombres = [];

    for (var ci = 0; ci < colsSys.length; ci++) {
      var col = colsSys[ci];
      var nombreCol = (evt.headers[col - 1] != null) ? evt.headers[col - 1].toString().trim() : ('col' + col);
      for (var r = 0; r < evt.numRows; r++) {
        var fila = evt.startRow + r;
        if (fila === 1) continue;              // no tocar encabezados
        if (evt.isClearedArray[r]) continue;    // borrado legítimo de fila: no revertir

        if (esCeldaSuelta) {
          evt.sheet.getRange(fila, col).setValue(e.oldValue !== undefined ? e.oldValue : '');
        } else {
          evt.sheet.getRange(fila, col).clearContent();
        }
        revertidoAlgo = true;
        if (nombres.indexOf(nombreCol) === -1) nombres.push(nombreCol);
      }
    }

    if (!revertidoAlgo) return false;
    SpreadsheetApp.flush();

    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Columna(s) de sistema (' + nombres.join(', ') + ') no se editan manualmente. Cambio revertido.',
      '⚠️ Edición no permitida', 6);
    logChange('VIOLACION_PERMISO',
      'Intento de edición manual a columna(s) de sistema [' + nombres.join(', ') + '] en Ordenes ' + evt.editedRange.getA1Notation() + '. Revertido.',
      evt.userIdentity);
    return true;
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
