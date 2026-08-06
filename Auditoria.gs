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
    var esCeldaSuelta = (editedRange.getNumRows() === 1 && editedRange.getNumColumns() === 1);
    var addr = editedRange.getA1Notation();

    // Segunda capa (tras la advertencia previa): CELDA SUELTA → revertir al valor
    // anterior; MULTI-CELDA → SOLO auditar (el usuario puede Ctrl+Z o el admin
    // restaura de versiones). Así no destruimos datos sin valor anterior disponible.
    if (esCeldaSuelta) {
      editedRange.setValue(e.oldValue !== undefined ? e.oldValue : '');
      SpreadsheetApp.flush();
    }

    var email = (e.user && e.user.getEmail()) ? e.user.getEmail() : Session.getActiveUser().getEmail();
    var userIdentity = email || 'Usuario no identificado (edición directa)';
    if (email && typeof getUserRecordsByEmail_ === 'function') {
      var recs = getUserRecordsByEmail_(email);
      if (recs && recs.length > 0) {
        userIdentity = recs[0].userId + ' - ' + (recs[0].nombreCorto || recs[0].userId);
      }
    }

    if (esCeldaSuelta) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'La hoja "' + sheet.getName() + '" es de sistema. Cambio revertido.', '⚠️ Edición no permitida', 6);
      logChange('VIOLACION_PERMISO',
        'Edición manual en hoja de sistema ' + sheet.getName() + ' ' + addr + '. Revertido (celda).', userIdentity);
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Editaste la hoja de sistema "' + sheet.getName() + '" en varias celdas. Registrado — usa Ctrl+Z para deshacer.',
        '⚠️ Edición registrada', 8);
      logChange('VIOLACION_PERMISO',
        'Edición manual MULTI-CELDA en hoja de sistema ' + sheet.getName() + ' ' + addr + '. NO revertido (auditado; deshacer con Ctrl+Z o restaurar versión).', userIdentity);
    }
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

    var nombres = [];
    for (var ci = 0; ci < colsSys.length; ci++) {
      var col = colsSys[ci];
      nombres.push((evt.headers[col - 1] != null) ? evt.headers[col - 1].toString().trim() : ('col' + col));
    }
    var addr = evt.editedRange.getA1Notation();

    // Segunda capa (tras la advertencia previa):
    // - CELDA SUELTA con valor editable → revertir al valor anterior exacto.
    // - MULTI-CELDA → SOLO auditar (no revertir; el usuario puede Ctrl+Z o el admin
    //   restaura de versiones). Así no destruimos datos sin valor anterior disponible.
    if (evt.numRows === 1 && evt.numCols === 1) {
      // No pelear con borrado legítimo de fila ni tocar encabezado.
      if (evt.startRow === 1 || evt.isClearedArray[0]) return false;

      evt.sheet.getRange(evt.startRow, colsSys[0]).setValue(e.oldValue !== undefined ? e.oldValue : '');
      SpreadsheetApp.flush();
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Columna de sistema (' + nombres[0] + ') no editable. Cambio revertido.', '⚠️ Edición no permitida', 6);
      logChange('VIOLACION_PERMISO',
        'Edición manual a columna de sistema [' + nombres[0] + '] en Ordenes ' + addr + '. Revertido (celda).', evt.userIdentity);
      return true;
    }

    // Multi-celda: SOLO auditar.
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Editaste columna(s) de sistema (' + nombres.join(', ') + ') en varias celdas. Registrado — usa Ctrl+Z para deshacer.',
      '⚠️ Edición registrada', 8);
    logChange('VIOLACION_PERMISO',
      'Edición manual MULTI-CELDA a columna(s) de sistema [' + nombres.join(', ') + '] en Ordenes ' + addr + '. NO revertido (auditado; deshacer con Ctrl+Z o restaurar versión).', evt.userIdentity);
    return false;
  },

  /**
   * Registra una edición que el enforcement habría revertido pero se permitió
   * por haber una ventana de bypass ADMIN vigente. El bypass NO elimina la
   * trazabilidad: cambia "revertir" por "dejar constancia".
   *
   * @param {Object} e - Evento crudo de Google Apps Script
   * @param {Range} editedRange - Rango editado
   * @param {string} contexto - Qué se tocó (hoja de sistema o columnas de sistema)
   * @param {string} userIdentity - Identidad del admin para el log
   */
  registrarEdicionBypass: function(e, editedRange, contexto, userIdentity) {
    var addr = editedRange.getA1Notation();
    var detalle;

    if (editedRange.getNumRows() === 1 && editedRange.getNumColumns() === 1) {
      detalle = '🔴 Antes: ' + (e.oldValue !== undefined ? e.oldValue : '(vacío)') + '\n' +
                '🟢 Ahora: ' + (e.value !== undefined ? e.value : '(vacío)');
    } else {
      detalle = '📦 Edición múltiple: ' + (editedRange.getNumRows() * editedRange.getNumColumns()) + ' celdas.';
    }

    logChange('EDICION_ADMIN_BYPASS',
      '🔓 Bypass ADMIN vigente — cambio PERMITIDO (no revertido).\n' +
      '📍 ' + contexto + ' ' + addr + '\n' + detalle,
      userIdentity);

    var restante = tiempoRestanteBypass_();
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Cambio permitido y registrado en Logs.' + (restante ? ' Bypass vence en ' + restante + ' min.' : ''),
      '🔓 Modo mantenimiento', 5);
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
