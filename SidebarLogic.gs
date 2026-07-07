// ============================================================
// MODULE: SidebarLogic
// Descripción: Lógica del lado del servidor para el Sidebar SPA
// ============================================================

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
  var template = HtmlService.createTemplateFromFile('ModalLoginPin');
  template.identidad = JSON.stringify(resolverIdentidadSesion());
  var html = template.evaluate()
      .setWidth(380)
      .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'Autorización Requerida');
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

  CacheService.getUserCache().put('qmsSesionValidada', JSON.stringify({ userId: userId, ts: Date.now() }), 300);
  abrirSidebarQMS();
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
