// ============================================================
// MODULE: AdminBypass
// Descripción: Ventana temporal ("modo mantenimiento") que permite a un
//              usuario con rol ADMIN corregir a mano hojas/columnas de
//              sistema sin que el trigger-enforcement revierta la edición.
//              Requiere rol ADMIN + contraseña, caduca sola y queda auditada.
// Prioridad de Carga: 3° (usa getUserRecordsByEmail_, withAdminAuth, logChange)
// ============================================================

// Duración de la ventana de bypass, en minutos.
var BYPASS_DURACION_MIN = 5;

// Claves en ScriptProperties. NO sirve UserProperties: quien activa el bypass es
// el usuario, pero quien lo consulta es el trigger onEditInstalled, que corre como
// PROPIETARIO. ScriptProperties es el único almacén que ven ambos contextos.
var BYPASS_PROP_EMAIL = 'BYPASS_ADMIN_EMAIL';
var BYPASS_PROP_HASTA = 'BYPASS_ADMIN_HASTA';

// --- CONSULTA (la usa el EventRouter en cada edición) ---

/**
 * Resuelve el email del usuario que hizo la edición que disparó el trigger.
 * @param {Object} e - Evento crudo de Google Apps Script
 * @returns {string} Email en minúsculas, o '' si Google no lo expone
 */
function resolverEmailEditor_(e) {
  var email = '';
  try {
    email = (e && e.user && e.user.getEmail()) ? e.user.getEmail() : Session.getActiveUser().getEmail();
  } catch (err) {
    email = '';
  }
  return email ? email.toString().trim().toLowerCase() : '';
}

/**
 * Convierte un email en la identidad "UserID - NombreCorto" usada en Logs.
 * @param {string} email - Email del editor
 * @returns {string} Identidad para el log
 */
function resolverIdentidadEditor_(email) {
  if (!email) return 'Usuario no identificado (edición directa)';
  var recs = (typeof getUserRecordsByEmail_ === 'function') ? getUserRecordsByEmail_(email) : [];
  if (recs && recs.length > 0) {
    return recs[0].userId + ' - ' + (recs[0].nombreCorto || recs[0].userId);
  }
  return email;
}

/**
 * ¿Hay una ventana de bypass vigente para ESTE email?
 * El bypass es nominal: solo exime a quien lo activó. Si otro usuario edita
 * durante la ventana, el enforcement le aplica normalmente.
 *
 * @param {string} email - Email del usuario que editó
 * @returns {boolean} true si la edición debe permitirse sin revertir
 */
function bypassAdminActivoPara_(email) {
  if (!email) return false;

  var props = PropertiesService.getScriptProperties();
  var beneficiario = props.getProperty(BYPASS_PROP_EMAIL);
  var hasta = parseInt(props.getProperty(BYPASS_PROP_HASTA), 10);
  if (!beneficiario || !hasta) return false;

  if (Date.now() > hasta) {
    cerrarBypass_('expiró por tiempo', beneficiario);
    return false;
  }

  return beneficiario.toLowerCase() === email.toLowerCase();
}

/**
 * Minutos:segundos restantes de la ventana vigente (para mensajes al usuario).
 * @returns {string} Ej. "3:42", o '' si no hay ventana activa
 */
function tiempoRestanteBypass_() {
  var hasta = parseInt(PropertiesService.getScriptProperties().getProperty(BYPASS_PROP_HASTA), 10);
  if (!hasta) return '';
  var restanteMs = hasta - Date.now();
  if (restanteMs <= 0) return '';
  var totalSeg = Math.floor(restanteMs / 1000);
  var seg = totalSeg % 60;
  return Math.floor(totalSeg / 60) + ':' + (seg < 10 ? '0' + seg : seg);
}

/**
 * Borra la ventana de bypass y lo registra en Logs.
 * @param {string} motivo - Por qué se cierra (expiró / cierre manual)
 * @param {string} beneficiario - Email al que aplicaba
 */
function cerrarBypass_(motivo, beneficiario) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(BYPASS_PROP_EMAIL);
  props.deleteProperty(BYPASS_PROP_HASTA);
  try {
    logChange('BYPASS_ADMIN_CERRADO',
      '🔒 Ventana de bypass de integridad cerrada (' + motivo + ').', beneficiario || 'Sistema');
  } catch (err) {
    Logger.log('No se pudo registrar el cierre del bypass: ' + err.message);
  }
}

// --- ACCIONES DE MENÚ ---

/**
 * Activa la ventana de bypass. Exige DOS condiciones independientes:
 * 1) el usuario debe tener rol ADMIN en la hoja Usuarios, y
 * 2) debe conocer la contraseña de administrador (withAdminAuth, sin caché).
 */
function activarBypassAdmin() {
  var ui = SpreadsheetApp.getUi();

  var email = Session.getActiveUser().getEmail();
  if (!email) {
    ui.alert('❌ No se pudo identificar su cuenta de Google. Vuelva a abrir el libro e intente de nuevo.');
    return;
  }

  var registros = getUserRecordsByEmail_(email);
  var admin = null;
  for (var i = 0; i < registros.length; i++) {
    if (registros[i].rol === 'ADMIN') { admin = registros[i]; break; }
  }

  if (!admin) {
    ui.alert('❌ Acceso denegado',
      'El bypass de integridad solo puede activarlo un usuario con rol ADMIN.\n\nSu cuenta: ' + email,
      ui.ButtonSet.OK);
    logChange('VIOLACION_PERMISO',
      'Intento de activar el bypass de integridad sin rol ADMIN.', email);
    return;
  }

  var identidad = admin.userId + ' - ' + (admin.nombreCorto || admin.userId);

  withAdminAuth('🔓 Activar bypass de integridad (' + BYPASS_DURACION_MIN + ' min)', function(uiAuth) {
    var hasta = Date.now() + BYPASS_DURACION_MIN * 60 * 1000;
    PropertiesService.getScriptProperties().setProperties({
      BYPASS_ADMIN_EMAIL: email.toString().trim().toLowerCase(),
      BYPASS_ADMIN_HASTA: String(hasta)
    });

    var horaFin = Utilities.formatDate(new Date(hasta), Session.getScriptTimeZone(), 'HH:mm:ss');

    logChange('BYPASS_ADMIN_ACTIVADO',
      '🔓 Bypass de integridad ACTIVADO por ' + BYPASS_DURACION_MIN + ' min (hasta ' + horaFin + ').\n' +
      'Durante la ventana, las ediciones manuales de este usuario a hojas/columnas de sistema NO se revierten (quedan auditadas).',
      identidad);

    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Bypass activo hasta las ' + horaFin + '. Sus ediciones a columnas/hojas de sistema no se revertirán.',
      '🔓 Modo mantenimiento', 10);

    uiAuth.alert('🔓 Bypass activado',
      'Vence a las ' + horaFin + ' (' + BYPASS_DURACION_MIN + ' minutos).\n\n' +
      '• Solo aplica a SU cuenta (' + email + '). Los demás usuarios siguen protegidos.\n' +
      '• Toda edición que haga queda registrada en Logs como EDICION_ADMIN_BYPASS.\n' +
      '• Google seguirá mostrando el aviso "estás editando una celda protegida": acéptelo, es solo advertencia.\n' +
      '• Puede cerrarlo antes con "Desactivar bypass" del menú.',
      uiAuth.ButtonSet.OK);
  });
}

/**
 * Cierra la ventana de bypass antes de que caduque.
 */
function desactivarBypassAdmin() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var beneficiario = props.getProperty(BYPASS_PROP_EMAIL);

  if (!beneficiario) {
    ui.alert('No hay ninguna ventana de bypass activa.');
    return;
  }

  cerrarBypass_('cierre manual', beneficiario);
  SpreadsheetApp.getActiveSpreadsheet().toast('Protección de integridad restaurada.', '🔒 Bypass cerrado', 6);
  ui.alert('🔒 Bypass desactivado. El enforcement de integridad vuelve a estar activo para todos.');
}

/**
 * Muestra si hay una ventana de bypass vigente, para quién y cuánto le queda.
 */
function estadoBypassAdmin() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var beneficiario = props.getProperty(BYPASS_PROP_EMAIL);
  var restante = tiempoRestanteBypass_();

  if (!beneficiario || !restante) {
    if (beneficiario) cerrarBypass_('expiró por tiempo', beneficiario);
    ui.alert('🔒 Estado del bypass', 'No hay ventana activa. La protección de integridad está aplicada.', ui.ButtonSet.OK);
    return;
  }

  ui.alert('🔓 Estado del bypass',
    'Activo para: ' + beneficiario + '\nTiempo restante: ' + restante + ' min',
    ui.ButtonSet.OK);
}
