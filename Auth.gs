// ============================================================
// MODULE: Auth
// Descripción: Autenticación y gestión de identidad de usuarios
// Prioridad de Carga: 3° (usado por Features y API)
// ============================================================

/**
 * Wrapper para ejecutar acciones que requieren autenticación de administrador.
 * @param {string} title - Título del prompt
 * @param {function} action - Función a ejecutar si la contraseña es correcta
 */
function withAdminAuth(title, action) {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(title, 'Ingrese la contraseña de administrador:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() == ui.Button.OK) {
    if (response.getResponseText() === ADMIN_PASS) {
      action(ui);
    } else {
      ui.alert('❌ Contraseña incorrecta.');
    }
  }
}

/**
 * Obtiene el registro completo de un usuario desde la hoja Usuarios.
 * @param {string} userId - UserID a buscar
 * @returns {Object|null} Objeto con userId, nombreCompleto, nombreCorto, email, rol
 */
function getUserRecordByUserId_(userId) {
  if (!userId) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  var headers = data[0];
  var colUserIdIdx = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
  var colNombreCompletoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Nombre Completo', false);
  var colNombreCortoIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreCorto', false);
  var colEmailIdx = getColumnIndexByNameCaseInsensitive(headers, 'Email', false);
  var colRolIdx = getColumnIndexByNameCaseInsensitive(headers, 'Rol', false);

  if (!colUserIdIdx) return null;

  colUserIdIdx -= 1;
  colNombreCompletoIdx = colNombreCompletoIdx ? colNombreCompletoIdx - 1 : null;
  colNombreCortoIdx = colNombreCortoIdx ? colNombreCortoIdx - 1 : null;
  colEmailIdx = colEmailIdx ? colEmailIdx - 1 : null;
  colRolIdx = colRolIdx ? colRolIdx - 1 : null;

  var targetUserId = userId.toString().trim();
  for (var i = 1; i < data.length; i++) {
    var rowUserId = data[i][colUserIdIdx] ? data[i][colUserIdIdx].toString().trim() : "";
    if (rowUserId === targetUserId) {
      return {
        userId: rowUserId,
        nombreCompleto: colNombreCompletoIdx !== null && data[i][colNombreCompletoIdx] ? data[i][colNombreCompletoIdx].toString().trim() : "",
        nombreCorto: colNombreCortoIdx !== null && data[i][colNombreCortoIdx] ? data[i][colNombreCortoIdx].toString().trim() : "",
        email: colEmailIdx !== null && data[i][colEmailIdx] ? data[i][colEmailIdx].toString().trim() : "",
        rol: colRolIdx !== null && data[i][colRolIdx] ? data[i][colRolIdx].toString().trim().toUpperCase() : ""
      };
    }
  }
  return null;
}

/**
 * Genera string de identidad para logs: "UserID - NombreCorto"
 * @param {string} userId - UserID del usuario
 * @returns {string} String de identidad formateado
 */
function getUserIdentityStringByUserId_(userId) {
  var user = getUserRecordByUserId_(userId);
  if (!user) return userId || "Usuario no identificado";
  return user.userId + " - " + (user.nombreCorto || user.userId);
}

/**
 * Verifica si un usuario está autorizado para realizar acciones de escritura.
 * @param {string} userId - El UserID del usuario a verificar
 * @returns {boolean} True si está autorizado, false en caso contrario
 */
function isUserAuthorized(userId) {
  var user = getUserRecordByUserId_(userId);
  if (!user) return false;
  if (!user.rol) return true;
  return user.rol === 'ADMIN' || user.rol === 'QA' || user.rol === 'STANDARD';
}

/**
 * Valida que el usuario esté autorizado en una solicitud de WebApp.
 * @param {Object} params - Parámetros de la solicitud
 * @returns {string} UserID validado
 * @throws {Error} Si falta userId o no está autorizado
 */
function requireAuthorizedUser_(params) {
  var callingUserId = params.userId || '';
  if (!callingUserId) {
    throw new Error('MISSING_USER_ID: No se proporcionó userId en la solicitud.');
  }
  if (!isUserAuthorized(callingUserId)) {
    throw new Error('ACCESS_DENIED: Acceso denegado para UserID ' + callingUserId + '.');
  }
  return callingUserId;
}

/**
 * Obtiene los registros de usuario asociados a un email.
 * @param {string} email - Email a buscar
 * @returns {Array} Array de objetos de usuario
 */
function getUserRecordsByEmail_(email) {
  if (!email) return [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var colUserIdIdx = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
  var colNombreCompletoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Nombre Completo', false);
  var colNombreCortoIdx = getColumnIndexByNameCaseInsensitive(headers, 'NombreCorto', false);
  var colEmailIdx = getColumnIndexByNameCaseInsensitive(headers, 'Email', false);
  var colRolIdx = getColumnIndexByNameCaseInsensitive(headers, 'Rol', false);

  if (!colUserIdIdx || !colEmailIdx) return [];

  colUserIdIdx -= 1;
  colNombreCompletoIdx = colNombreCompletoIdx ? colNombreCompletoIdx - 1 : null;
  colNombreCortoIdx = colNombreCortoIdx ? colNombreCortoIdx - 1 : null;
  colEmailIdx -= 1;
  colRolIdx = colRolIdx ? colRolIdx - 1 : null;

  var targetEmail = email.toString().trim().toLowerCase();
  var users = [];
  
  for (var i = 1; i < data.length; i++) {
    var rowEmail = data[i][colEmailIdx] ? data[i][colEmailIdx].toString().trim().toLowerCase() : "";
    if (rowEmail === targetEmail) {
      users.push({
        userId: data[i][colUserIdIdx] ? data[i][colUserIdIdx].toString().trim() : "",
        nombreCompleto: colNombreCompletoIdx !== null && data[i][colNombreCompletoIdx] ? data[i][colNombreCompletoIdx].toString().trim() : "",
        nombreCorto: colNombreCortoIdx !== null && data[i][colNombreCortoIdx] ? data[i][colNombreCortoIdx].toString().trim() : "",
        email: data[i][colEmailIdx] ? data[i][colEmailIdx].toString().trim() : "",
        rol: colRolIdx !== null && data[i][colRolIdx] ? data[i][colRolIdx].toString().trim().toUpperCase() : ""
      });
    }
  }
  return users;
}

/**
 * Función backend para validar la identidad de la sesión (llamada desde ModalValidacion).
 * @returns {Object} Respuesta con estado y datos del usuario
 */
function validarIdentidadSesion() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    return { status: 'ERROR', message: 'No se pudo obtener el correo de la sesión. Asegúrese de estar logueado.' };
  }
  
  var users = getUserRecordsByEmail_(email);
  
  if (users.length === 0) {
    return { status: 'DENIED', message: 'El correo ' + email + ' no está registrado en el sistema. Contacte al administrador.' };
  }
  
  if (users.length > 1) {
    return { status: 'MULTIPLE_USERS', users: users };
  }
  
  var user = users[0];
  if (!isUserAuthorized(user.userId)) {
    return { status: 'DENIED', message: 'Su usuario (' + user.userId + ') no tiene los permisos necesarios (Rol: ' + user.rol + ').' };
  }
  
  // Guardar como usuario activo
  PropertiesService.getUserProperties().setProperty('ACTIVE_USER_ID', user.userId);
  
  return { status: 'SUCCESS', user: user };
}

/**
 * Establece el usuario activo cuando hay múltiples cuentas para el mismo email.
 * @param {string} userId - UserID seleccionado
 * @returns {Object} Respuesta con estado
 */
function establecerUsuarioActivo(userId) {
  var email = Session.getActiveUser().getEmail();
  var users = getUserRecordsByEmail_(email);
  
  var isValid = users.some(function(u) { return u.userId === userId; });
  if (!isValid) {
    return { status: 'ERROR', message: 'El usuario seleccionado no corresponde a su cuenta de correo.' };
  }
  
  if (!isUserAuthorized(userId)) {
    return { status: 'DENIED', message: 'El usuario seleccionado no tiene los permisos necesarios.' };
  }
  
  PropertiesService.getUserProperties().setProperty('ACTIVE_USER_ID', userId);
  
  var user = getUserRecordByUserId_(userId);
  return { status: 'SUCCESS', user: user };
}

/**
 * [INACTIVA] Helper para validar identidad antes de abrir cualquier modal operativo.
 * Esta función ya NO se usa como guardián en los openers de modales.
 * La validación de identidad ahora ocurre INLINE dentro de cada modal HTML
 * al cargarse (vía getInitialData() → activeEmail → match con hoja Usuarios).
 * Se mantiene como referencia pero no debe llamarse desde openPrintDialog,
 * abrirModalSubidaGeneral ni abrirModalRegistroNovedad.
 *
 * @returns {boolean} True si la sesión es válida y tiene permisos
 */
/*
function checkAuthAndRunModal_() {
  var authStatus = validarIdentidadSesion();
  if (authStatus.status === 'SUCCESS') {
    return true;
  } else {
    abrirModalValidacion();
    return false;
  }
}
*/
