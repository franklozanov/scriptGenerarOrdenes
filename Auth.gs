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
 * @returns {Object|null} Objeto con userId, nombreCompleto, nombreCorto, email, rol, pin, estado, intentosFallidos
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
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);
  var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);
  var colIntentosIdx = getColumnIndexByNameCaseInsensitive(headers, 'IntentosFallidos', false);

  if (!colUserIdIdx) return null;

  colUserIdIdx -= 1;
  colNombreCompletoIdx = colNombreCompletoIdx ? colNombreCompletoIdx - 1 : null;
  colNombreCortoIdx = colNombreCortoIdx ? colNombreCortoIdx - 1 : null;
  colEmailIdx = colEmailIdx ? colEmailIdx - 1 : null;
  colRolIdx = colRolIdx ? colRolIdx - 1 : null;
  colClaveIdx = colClaveIdx ? colClaveIdx - 1 : null;
  colEstadoIdx = colEstadoIdx ? colEstadoIdx - 1 : null;
  colIntentosIdx = colIntentosIdx ? colIntentosIdx - 1 : null;

  var targetUserId = userId.toString().trim();
  for (var i = 1; i < data.length; i++) {
    var rowUserId = data[i][colUserIdIdx] ? data[i][colUserIdIdx].toString().trim() : "";
    if (rowUserId === targetUserId) {
      return {
        userId: rowUserId,
        nombreCompleto: colNombreCompletoIdx !== null && data[i][colNombreCompletoIdx] ? data[i][colNombreCompletoIdx].toString().trim() : "",
        nombreCorto: colNombreCortoIdx !== null && data[i][colNombreCortoIdx] ? data[i][colNombreCortoIdx].toString().trim() : "",
        email: colEmailIdx !== null && data[i][colEmailIdx] ? data[i][colEmailIdx].toString().trim() : "",
        rol: colRolIdx !== null && data[i][colRolIdx] ? data[i][colRolIdx].toString().trim().toUpperCase() : "",
        pin: colClaveIdx !== null && data[i][colClaveIdx] !== undefined ? data[i][colClaveIdx].toString().trim() : "",
        estado: colEstadoIdx !== null && data[i][colEstadoIdx] !== undefined ? data[i][colEstadoIdx].toString().trim() : "",
        intentosFallidos: colIntentosIdx !== null && data[i][colIntentosIdx] !== undefined ? parseInt(data[i][colIntentosIdx]) || 0 : 0
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
 * Encripta un PIN (Firma Electrónica) utilizando SHA-256.
 * @param {string|number} pin - PIN a encriptar
 * @returns {string} Cadena Hexadecimal de 64 caracteres.
 */
function hashPin_(pin) {
  if (pin === undefined || pin === null) return "";
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pin.toString().trim());
  var hexString = signature.map(function(byte) {
      var v = (byte < 0) ? 256 + byte : byte;
      return ("0" + v.toString(16)).slice(-2);
  }).join("");
  return hexString;
}

/**
 * Actualiza el estado de seguridad de un usuario (Intentos Fallidos y Estado).
 * @param {string} userId - UserID del usuario
 * @param {number} intentos - Número de intentos fallidos
 * @param {string} estado - Estado ("Activo", "Bloqueado", etc.)
 * @param {string} [nuevaClave] - Opcional. Nuevo PIN hasheado o "PENDIENTE".
 */
function updateUserSecurityState_(userId, intentos, estado, nuevaClave) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Usuarios');
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];
  var colUserIdIdx = getColumnIndexByNameCaseInsensitive(headers, 'UserID', false);
  var colIntentosIdx = getColumnIndexByNameCaseInsensitive(headers, 'IntentosFallidos', false);
  var colEstadoIdx = getColumnIndexByNameCaseInsensitive(headers, 'Estado', false);
  var colClaveIdx = getColumnIndexByNameCaseInsensitive(headers, 'Clave', false);

  if (!colUserIdIdx || !colIntentosIdx || !colEstadoIdx) return;

  var targetUserId = userId.toString().trim();
  for (var i = 1; i < data.length; i++) {
    var rowUserId = data[i][colUserIdIdx - 1] ? data[i][colUserIdIdx - 1].toString().trim() : "";
    if (rowUserId === targetUserId) {
      sheet.getRange(i + 1, colIntentosIdx).setValue(intentos);
      sheet.getRange(i + 1, colEstadoIdx).setValue(estado);
      
      if (nuevaClave !== undefined) {
        sheet.getRange(i + 1, colClaveIdx).setValue(nuevaClave);
      }
      return;
    }
  }
}
