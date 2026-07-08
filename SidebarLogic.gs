// ============================================================
// MODULE: SidebarLogic
// Descripción: Lógica del lado del servidor para el Sidebar SPA
// ============================================================
/* global SESSION_TIMEOUT_PROP_KEY, SESSION_TIMEOUT_DEFAULT_MIN, SESSION_TIMEOUT_MAX_MIN */

/**
 * Abre el panel lateral principal de QMS.
 * No debe invocarse directamente desde el menú: primero debe pasar por el gate
 * de identidad/PIN en abrirPanelQMS(). Se deja pública porque también se llama
 * desde completarLoginYAbrirPanel() una vez validado el PIN.
 *
 * Precarga getInitialData() en el servidor e inyecta el resultado directamente
 * en la plantilla (como ya hacen ModalCargaOrdenes/ModalAutorizarQA/etc.), en
 * vez de dejar que el Sidebar lo pida por su cuenta recién al mostrarse. Esto
 * elimina un round-trip completo del camino crítico entre "PIN validado" y
 * "panel utilizable" — y como abrirPanelQMS() ya dispara una precarga del mismo
 * caché mientras el usuario ingresa su PIN (ver ModalLoginPin.html), esta
 * llamada normalmente ya encuentra el caché de hojas 'Usuarios'/'templates'
 * caliente. Si getInitialData() fallara igual, se degrada de forma segura: el
 * Sidebar abre sin datos precargados y hace su propio fetch asíncrono de
 * respaldo (ver SidebarQMS.html).
 */
function abrirSidebarQMS() {
  var template = HtmlService.createTemplateFromFile('SidebarQMS');

  var initialData = null;
  try {
    initialData = getInitialData(false);
  } catch (e) {
    Logger.log("abrirSidebarQMS: no se pudo precargar getInitialData, el Sidebar la pedirá por su cuenta: " + e.message);
  }
  template.initialData = initialData ? JSON.stringify(initialData) : 'null';

  var html = template.evaluate()
      .setTitle('Panel Principal QMS')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Punto de entrada del menú "🎛️ Abrir Panel Principal QMS".
 * Muestra un modal NATIVO y bloqueante (showModalDialog) con el gate de
 * identidad/PIN (ModalLoginPin.html) ANTES de abrir el Sidebar. A diferencia
 * del Sidebar, un modal nativo de Google atenúa y bloquea automáticamente toda
 * la hoja de cálculo mientras está abierto, dando la impresión (y el efecto
 * real) de bloqueo de acceso a los datos durante la autenticación.
 */
function abrirPanelQMS() {
  // Si la sesión validada por PIN sigue vigente (dentro de la ventana de persistencia
  // configurada por el admin), se salta el modal de PIN y se abre el panel directamente.
  // Las firmas 21 CFR Part 11 (impresión, autorización QA, aprobaciones) NO se ven
  // afectadas: siguen pidiendo PIN por su cuenta al ejecutarse.
  var sesion = sesionSigueVigente_();
  if (sesion.vigente) {
    abrirSidebarQMS();
    return;
  }

  var template = HtmlService.createTemplateFromFile('ModalLoginPin');
  template.identidad = JSON.stringify(resolverIdentidadSesion());
  var html = template.evaluate()
      .setWidth(380)
      .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'Ingreso Seguro QMS');
}

/**
 * Resuelve la(s) identidad(es) asociadas al correo de la sesión activa, para el
 * modal de login. Si varias filas de 'Usuarios' comparten el mismo correo (ej.
 * un puesto de trabajo compartido), se listan todas para que el usuario elija
 * con cuál va a operar/firmar.
 * @returns {Object} { status: 'none'|'single'|'multiple', candidates: Object[], webAppUrl: string }
 */
function resolverIdentidadSesion() {
  var activeEmail = "";
  try { activeEmail = Session.getActiveUser().getEmail(); } catch (e) {}

  var webAppUrl = '';
  try { webAppUrl = getWebAppUrl(); } catch (e) { webAppUrl = ''; }

  if (!activeEmail) {
    return { status: 'none', candidates: [], webAppUrl: webAppUrl, activeEmail: activeEmail };
  }

  var candidatos = getUserRecordsByEmail_(activeEmail);
  var status = candidatos.length === 0 ? 'none' : (candidatos.length === 1 ? 'single' : 'multiple');

  return { status: status, candidates: candidatos, webAppUrl: webAppUrl, activeEmail: activeEmail };
}

/**
 * Confirma el login desde ModalLoginPin.html una vez que la identidad fue
 * validada (PIN correcto o recién creado) y abre el Sidebar QMS.
 * Revalida en el servidor que el userId elegido realmente pertenece al correo
 * de la sesión activa (no confía en lo que mande el cliente), y lo guarda en
 * una caché privada por usuario para que getInitialData() (Cache.gs) abra el
 * Sidebar con la misma identidad elegida aquí, incluso si el correo tiene
 * varios UserID asociados.
 * @param {string} userId - UserID cuya identidad ya fue validada en el modal.
 */
function completarLoginYAbrirPanel(userId) {
  var activeEmail = Session.getActiveUser().getEmail();
  var candidatos = getUserRecordsByEmail_(activeEmail);
  var pertenece = candidatos.some(function(c) { return c.userId === userId; });

  if (!pertenece) {
    throw new Error("ACCESO DENEGADO: El UserID indicado no corresponde a la sesión activa.");
  }

  // Marca de sesión validada por PIN. Se persiste en UserProperties con timestamp propio
  // (no en UserCache, cuyo TTL máximo es 6 h) para que la ventana de persistencia la
  // controle el admin sin ese tope. La vigencia se evalúa contra getSessionPersistMinutes()
  // en sesionSigueVigente_. Se conserva también en UserCache por compatibilidad con
  // lecturas previas, pero UserProperties es la fuente de verdad.
  var marca = JSON.stringify({ userId: userId, ts: Date.now() });
  try { PropertiesService.getUserProperties().setProperty('qmsSesionValidada', marca); } catch (e) {
    Logger.log('completarLoginYAbrirPanel: no se pudo escribir UserProperties: ' + e.message);
  }
  try { CacheService.getUserCache().put('qmsSesionValidada', marca, 21600); } catch (e) {}

  abrirSidebarQMS();
}

// -------------------------------------------------------
// PERSISTENCIA DE SESIÓN (evita re-pedir PIN al reabrir el panel)
// -------------------------------------------------------

/**
 * Lee la marca de sesión validada del usuario actual (UserProperties, con fallback a
 * UserCache) y determina si sigue vigente según la ventana configurada por el admin.
 * Verifica además que el userId marcado siga perteneciendo al correo de la sesión activa
 * (defensa: mismo criterio que getInitialData en Cache.gs).
 * @returns {Object} { vigente: boolean, userId: string }
 */
function sesionSigueVigente_() {
  try {
    var minutos = getSessionPersistMinutes();
    if (!minutos || minutos <= 0) return { vigente: false, userId: '' };

    var raw = '';
    try { raw = PropertiesService.getUserProperties().getProperty('qmsSesionValidada'); } catch (e) {}
    if (!raw) {
      try { raw = CacheService.getUserCache().get('qmsSesionValidada'); } catch (e) {}
    }
    if (!raw) return { vigente: false, userId: '' };

    var info = JSON.parse(raw);
    if (!info || !info.userId || !info.ts) return { vigente: false, userId: '' };

    var minutosTranscurridos = (Date.now() - info.ts) / 60000;
    if (minutosTranscurridos > minutos) return { vigente: false, userId: info.userId };

    var activeEmail = Session.getActiveUser().getEmail();
    var candidatos = getUserRecordsByEmail_(activeEmail);
    var pertenece = candidatos.some(function(c) { return c.userId === info.userId; });
    if (!pertenece) return { vigente: false, userId: '' };

    return { vigente: true, userId: info.userId };
  } catch (e) {
    Logger.log('sesionSigueVigente_: ' + e.message);
    return { vigente: false, userId: '' };
  }
}

/**
 * Devuelve los minutos de persistencia de sesión configurados. Solo lectura, callable
 * desde el cliente para poblar la UI. Default SESSION_PERSIST_DEFAULT_MIN si no hay valor.
 * @returns {number} Entero >= 0.
 */
function getSessionPersistMinutes() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(SESSION_PERSIST_PROP_KEY);
    if (raw === null || raw === '') return SESSION_PERSIST_DEFAULT_MIN;
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return SESSION_PERSIST_DEFAULT_MIN;
    return Math.min(n, SESSION_PERSIST_MAX_MIN);
  } catch (e) {
    return SESSION_PERSIST_DEFAULT_MIN;
  }
}

function getSessionTimeoutMinutes() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(SESSION_TIMEOUT_PROP_KEY);
    if (raw === null || raw === '') return SESSION_TIMEOUT_DEFAULT_MIN;
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 1) return SESSION_TIMEOUT_DEFAULT_MIN;
    return Math.min(n, SESSION_TIMEOUT_MAX_MIN);
  } catch (e) {
    return SESSION_TIMEOUT_DEFAULT_MIN;
  }
}

/**
 * Guarda los minutos de persistencia de sesión. Operación privilegiada: requiere
 * permiso de administrador y firma PIN (validada en la Web App antes de llamar aquí).
 * @param {Object} params - { minutos }
 * @param {string} userId - UserID validado que ejecuta el cambio.
 * @returns {Object} Resultado con la config persistida.
 */
function procesarSetSessionPersist(params, userId) {
  enforcePermission(userId, PERMISOS.MENU_ADMIN);

  var minutos = parseInt(params.minutos, 10);
  if (isNaN(minutos) || minutos < 0) throw new Error('Los minutos de persistencia deben ser un número entero mayor o igual a 0.');
  if (minutos > SESSION_PERSIST_MAX_MIN) throw new Error('El máximo permitido para persistencia es ' + SESSION_PERSIST_MAX_MIN + ' minutos (24 h).');

  var timeoutMinutos = parseInt(params.timeoutMinutos, 10);
  if (isNaN(timeoutMinutos) || timeoutMinutos < 1) throw new Error('Los minutos de inactividad deben ser un número entero mayor a 0.');
  if (timeoutMinutos > SESSION_TIMEOUT_MAX_MIN) throw new Error('El máximo permitido para inactividad es ' + SESSION_TIMEOUT_MAX_MIN + ' minutos.');

  var props = PropertiesService.getScriptProperties();
  props.setProperty(SESSION_PERSIST_PROP_KEY, String(minutos));
  props.setProperty(SESSION_TIMEOUT_PROP_KEY, String(timeoutMinutos));

  var userIdentity = getUserIdentityStringByUserId_(userId);
  logChange(
    'CONFIG_SESION_PERSISTENCIA',
    'Persistencia: ' + minutos + ' min. Inactividad: ' + timeoutMinutos + ' min.',
    userIdentity
  );

  return { status: 'success', message: 'Configuración actualizada.', minutos: minutos, timeoutMinutos: timeoutMinutos };
}

/**
 * Borra la marca de sesión validada del usuario actual, forzando que la próxima
 * apertura del panel pida PIN de nuevo. Útil en puestos de trabajo compartidos.
 * Callable desde el cliente (google.script.run).
 * @returns {Object} { ok: true }
 */
function cerrarSesionQMS() {
  try { PropertiesService.getUserProperties().deleteProperty('qmsSesionValidada'); } catch (e) {}
  try { CacheService.getUserCache().remove('qmsSesionValidada'); } catch (e) {}
  return { ok: true };
}

/**
 * Endpoint del lado del servidor para validar permisos dinámicamente antes de
 * realizar acciones sensibles desde el sidebar.
 */
function checkPermissionForAction(actionCode) {
  var email = Session.getActiveUser().getEmail();
  var user = getUserRecordByEmail_(email);
  if (!user || !user.rol) return false;
  return hasPermissionByRol(user.rol, actionCode);
}
