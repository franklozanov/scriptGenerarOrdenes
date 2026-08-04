// ============================================================
// MODULE: IndiceDocumentos
// Descripción: Espejo local (índice materializado) de las carpetas
//              de Drive DOC_ORDENES (OA) y DOC_ANALISIS (COA).
//              Convierte la validación de EstadoDocumentos de un
//              escaneo lento por-orden a un lookup O(1) en memoria.
//
//              - Fuente de verdad durable: hoja oculta 'IndiceDocumentos'
//              - Memo por ejecución para no releer la hoja en cada onEdit
//              - Refresco: horario + al subir un doc + on-demand (menú)
// Prioridad de Carga: depende de Helpers, Config y PrintLogic (getPrintConfig_)
// ============================================================

/**
 * Convierte un nombre de archivo o un valor de celda en una clave canónica
 * comparable. Se usa TANTO al construir el índice (desde nombres de archivo)
 * COMO al consultarlo (desde el valor de la celda) — garantiza que ambos
 * lados hablen el mismo idioma y elimina el match difuso (contains).
 *
 *   "0042.pdf"      -> "42"           (OA numérico, sin ceros a la izquierda)
 *   "OA0042.pdf"    -> "42"           (OA subido a mano por el admin)
 *   42 (número)     -> "42"
 *   "2026-0015.pdf" -> "2026-0015"    (COA alfanumérico: stem tal cual)
 *   "COA2026-0015"  -> "2026-0015"
 *
 * @param {*} raw - Nombre de archivo o valor de celda (NoOrden / NoAnalisis)
 * @returns {string} Clave canónica ("" si no hay contenido)
 */
function normalizarClaveDoc_(raw) {
  var s = String(raw == null ? '' : raw).trim().toLowerCase();
  s = s.replace(/\.pdf$/, '');     // quitar extensión (si viene de un filename)
  s = s.replace(/^(oa|coa)/, '');  // quitar prefijo opcional del admin
  if (s !== '' && /^\d+$/.test(s)) {
    return String(parseInt(s, 10)); // puramente numérico -> canónico entero (mata ceros a la izquierda)
  }
  return s;                         // alfanumérico (ej. COA 2026-0015) -> stem normalizado
}

var IndiceDocs = {

  NOMBRE_HOJA: 'IndiceDocumentos',
  PROP_LAST_REFRESH: 'INDICE_DOCS_LAST_REFRESH',

  // Memo por ejecución (se reinicia en cada invocación del script). null = no cargado.
  _mem: null,

  /**
   * Obtiene (o crea) la hoja oculta del índice. La columna Clave (B) se fuerza
   * a formato texto para que "2026-0015" o "0042" no sufran coerción de Sheets.
   */
  _obtenerHoja: function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(this.NOMBRE_HOJA);
    if (!sh) {
      sh = ss.insertSheet(this.NOMBRE_HOJA);
      sh.getRange(1, 1, 1, 5).setValues([['Tipo', 'Clave', 'FileId', 'NombreArchivo', 'FechaIndex']]);
      sh.getRange('B:B').setNumberFormat('@'); // Clave como texto plano
      sh.hideSheet();
    }
    return sh;
  },

  /**
   * Lista los PDFs de una carpeta y los mapea a [tipo, clave, fileId, nombre, fecha].
   * Deduplica por clave (conserva el primero). Tolera folderId vacío o inválido.
   */
  _listarCarpeta: function(folderId, tipo) {
    var filas = [];
    if (!folderId) return filas;

    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('IndiceDocs: carpeta ' + tipo + ' (' + folderId + ') inválida: ' + e.message);
      return filas;
    }

    var vistas = {};
    var ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.getMimeType() !== MimeType.PDF) continue;
      var nombre = f.getName();
      var clave = normalizarClaveDoc_(nombre);
      if (clave === '' || vistas[clave]) continue;
      vistas[clave] = true;
      filas.push([tipo, clave, f.getId(), nombre, ahora]);
    }
    return filas;
  },

  /**
   * Reconstruye el índice completo desde las dos carpetas de Drive.
   * A ~300 archivos toma segundos. Escritura atómica (clear + un solo setValues)
   * protegida por lock para que un lector concurrente no vea el índice a medias.
   *
   * @returns {{oa:number, coa:number}} Conteo indexado por tipo.
   */
  reconstruir: function() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      Logger.log('IndiceDocs: reconstrucción ya en curso, se omite.');
      return { oa: -1, coa: -1 };
    }
    try {
      var config;
      try {
        config = getPrintConfig_();
      } catch (e) {
        Logger.log('IndiceDocs: no se pudo leer getPrintConfig_: ' + e.message);
        config = { DOC_ORDENES: '', DOC_ANALISIS: '' };
      }

      var filasOA = this._listarCarpeta(config.DOC_ORDENES, 'OA');
      var filasCOA = this._listarCarpeta(config.DOC_ANALISIS, 'COA');
      var todas = filasOA.concat(filasCOA);

      var sh = this._obtenerHoja();
      sh.clearContents();
      sh.getRange(1, 1, 1, 5).setValues([['Tipo', 'Clave', 'FileId', 'NombreArchivo', 'FechaIndex']]);
      sh.getRange('B:B').setNumberFormat('@');
      if (todas.length > 0) {
        sh.getRange(2, 1, todas.length, 5).setValues(todas);
      }

      PropertiesService.getScriptProperties().setProperty(
        this.PROP_LAST_REFRESH,
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
      );
      this.invalidarMem();

      Logger.log('IndiceDocs: reconstruido OA=' + filasOA.length + ' COA=' + filasCOA.length);
      return { oa: filasOA.length, coa: filasCOA.length };
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Carga el índice a memoria como { OA: {clave->fileId}, COA: {clave->fileId} }.
   * Memoizado por ejecución.
   */
  cargar: function() {
    if (this._mem) return this._mem;

    var idx = { OA: {}, COA: {} };
    // Lectura sin efectos colaterales: si la hoja no existe aún (antes del primer
    // rebuild), devolvemos índice vacío sin crearla. La crean reconstruir()/agregar().
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(this.NOMBRE_HOJA);
    var last = sh ? sh.getLastRow() : 0;
    if (sh && last >= 2) {
      var data = sh.getRange(2, 1, last - 1, 3).getValues(); // Tipo, Clave, FileId
      for (var i = 0; i < data.length; i++) {
        var tipo = data[i][0];
        var clave = String(data[i][1]);
        var fileId = data[i][2];
        if (tipo === 'OA') idx.OA[clave] = fileId;
        else if (tipo === 'COA') idx.COA[clave] = fileId;
      }
    }
    this._mem = idx;
    return idx;
  },

  /**
   * Agrega (o actualiza) una entrada de forma incremental. Para el hook de subida:
   * refleja al instante un doc recién cargado sin esperar el rebuild horario.
   *
   * @param {string} tipo - 'OA' o 'COA'
   * @param {string} fileId - ID del archivo en Drive
   * @param {string} nombre - Nombre del archivo (para derivar la clave)
   */
  agregar: function(tipo, fileId, nombre) {
    var clave = normalizarClaveDoc_(nombre);
    if (clave === '' || (tipo !== 'OA' && tipo !== 'COA')) return;

    var idx = this.cargar();
    if (idx[tipo][clave] !== undefined) {
      // Ya existe la clave: solo refrescamos el fileId en memoria (evita fila duplicada).
      idx[tipo][clave] = fileId;
      return;
    }

    var sh = this._obtenerHoja();
    var ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    sh.appendRow([tipo, clave, fileId, nombre, ahora]);
    idx[tipo][clave] = fileId; // mantener el memo sincronizado
  },

  /**
   * Devuelve el fileId de un documento por tipo+clave, o null si no está indexado.
   * Bonus: permite a la impresión hacer getFileById directo (sin buscar en la carpeta).
   */
  obtenerFileId: function(tipo, clave) {
    var idx = this.cargar();
    var k = normalizarClaveDoc_(clave);
    return (idx[tipo] && idx[tipo][k] !== undefined) ? idx[tipo][k] : null;
  },

  /** Invalida el memo por ejecución (tras un rebuild). */
  invalidarMem: function() {
    this._mem = null;
  }
};

// --- WRAPPERS PÚBLICOS (menú / trigger por tiempo llaman por nombre de función) ---

/**
 * Reconstruye el índice de documentos. Invocable desde el menú y el trigger horario.
 */
function reconstruirIndiceDocumentos() {
  var r = IndiceDocs.reconstruir();
  if (r.oa < 0) return; // reconstrucción concurrente omitida
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Índice de documentos actualizado: ' + r.oa + ' OA, ' + r.coa + ' COA.',
      'Sistema QMS', 6
    );
  } catch (e) { /* sin UI disponible (ejecución por trigger): silencioso */ }
}

/**
 * Crea el disparador horario que mantiene el índice fresco.
 * Idempotente: no duplica si ya existe.
 */
function setupIndiceDocsTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'reconstruirIndiceDocumentos') {
      Logger.log('⚠️ Disparador reconstruirIndiceDocumentos ya existe');
      return;
    }
  }
  ScriptApp.newTrigger('reconstruirIndiceDocumentos')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('✓ Disparador horario reconstruirIndiceDocumentos creado');
}
