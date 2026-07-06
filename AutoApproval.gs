// ============================================================
// MODULE: AutoApproval
// Descripción: Autoaprobación temporal configurable de solicitudes
//              de impresión extraordinaria (Reimpresión / Adicional).
// Filtros: ventana de tiempo, tipo de solicitud, usuarios y órdenes/procesos.
// Config persistida en ScriptProperties bajo AUTO_APPROVAL_PROP_KEY (JSON).
// ============================================================

/**
 * Devuelve la configuración de autoaprobación normalizada.
 * Callable de solo lectura desde el cliente (google.script.run) para poblar la UI.
 * @returns {Object} { enabled, expiresAt, tipos, userIds, ordenes, active }
 */
function getAutoApprovalConfig() {
  var fallback = { enabled: false, expiresAt: '', tipos: [], userIds: ['all'], ordenes: ['all'], active: false };
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(AUTO_APPROVAL_PROP_KEY);
    if (!raw) return fallback;
    var cfg = JSON.parse(raw);
    cfg.enabled = cfg.enabled === true;
    cfg.expiresAt = cfg.expiresAt || '';
    cfg.tipos = cfg.tipos || [];
    cfg.userIds = (cfg.userIds && cfg.userIds.length) ? cfg.userIds : ['all'];
    cfg.ordenes = (cfg.ordenes && cfg.ordenes.length) ? cfg.ordenes : ['all'];
    // Marcar si está vigente ahora mismo (para que la UI muestre el estado real)
    cfg.active = cfg.enabled && (!cfg.expiresAt || new Date(cfg.expiresAt).getTime() > new Date().getTime());
    return cfg;
  } catch (e) {
    Logger.log("Error en getAutoApprovalConfig: " + e.message);
    return fallback;
  }
}

/**
 * Guarda la configuración de autoaprobación. Operación privilegiada (requiere permiso
 * GESTIONAR_AUTOAPROBACION y firma PIN validada por la Web App).
 * @param {Object} params - { enabled, expiresAt, tipos[], userIds[], ordenes[] }
 * @param {string} userId - UserID validado que ejecuta el cambio
 * @returns {Object} Resultado con la configuración persistida
 */
function procesarSetAutoApproval(params, userId) {
  enforcePermission(userId, 'GESTIONAR_AUTOAPROBACION');

  var cfg = {
    enabled: params.enabled === true,
    expiresAt: params.expiresAt || '',
    tipos: Array.isArray(params.tipos) ? params.tipos : [],
    userIds: (Array.isArray(params.userIds) && params.userIds.length) ? params.userIds : ['all'],
    ordenes: (Array.isArray(params.ordenes) && params.ordenes.length) ? params.ordenes : ['all']
  };

  // Validaciones cuando se activa
  if (cfg.enabled) {
    if (!cfg.expiresAt) {
      throw new Error("Debe especificar una fecha/hora de expiración para la autoaprobación.");
    }
    var exp = new Date(cfg.expiresAt).getTime();
    if (isNaN(exp)) throw new Error("Fecha de expiración inválida.");
    if (exp <= new Date().getTime()) throw new Error("La fecha de expiración debe ser futura.");
    if (!cfg.tipos.length) throw new Error("Seleccione al menos un tipo de solicitud a autoaprobar.");
  }

  PropertiesService.getScriptProperties().setProperty(AUTO_APPROVAL_PROP_KEY, JSON.stringify(cfg));

  var userIdentity = getUserIdentityStringByUserId_(userId);
  var detalle = cfg.enabled
    ? ('ACTIVADA hasta ' + cfg.expiresAt + ' · tipos: ' + cfg.tipos.join(', ')
        + ' · usuarios: ' + cfg.userIds.join(', ') + ' · órdenes: ' + cfg.ordenes.join(', '))
    : 'DESACTIVADA';
  logChange('CONFIG_AUTOAPROBACION', 'Autoaprobación ' + detalle, userIdentity);

  return {
    status: 'success',
    message: cfg.enabled ? 'Autoaprobación activada.' : 'Autoaprobación desactivada.',
    config: getAutoApprovalConfig()
  };
}

/**
 * Evalúa si una solicitud debe autoaprobarse según la configuración vigente.
 * Todos los filtros configurados deben cumplirse (AND).
 * @param {string} tipoSolicitud - 'Reimpresión' | 'Adicional' (tolera acentos/caso)
 * @param {string} userId - UserID del solicitante
 * @param {string} noOrden - Número de orden
 * @param {string} proceso - Proceso de la orden
 * @returns {Object} { approved: boolean, reason: string }
 */
function evaluateAutoApproval_(tipoSolicitud, userId, noOrden, proceso) {
  try {
    var cfg = getAutoApprovalConfig();
    if (!cfg || !cfg.enabled) return { approved: false, reason: '' };

    // 1. Ventana de tiempo
    var now = new Date().getTime();
    if (cfg.expiresAt) {
      var exp = new Date(cfg.expiresAt).getTime();
      if (isNaN(exp) || now > exp) return { approved: false, reason: '' };
    }

    // 2. Tipo de solicitud (debe estar explícitamente incluido)
    var tipoNorm = normalizePrintType_(tipoSolicitud);
    var tiposCfg = (cfg.tipos || []).map(function (t) { return normalizePrintType_(t); });
    if (tiposCfg.length === 0 || tiposCfg.indexOf(tipoNorm) === -1) {
      return { approved: false, reason: '' };
    }

    // 3. Usuarios ('all' o lista de userIds)
    var users = cfg.userIds || [];
    var allUsers = users.length === 0 || users.indexOf('all') !== -1 || users.indexOf('ALL') !== -1;
    if (!allUsers && users.map(String).indexOf(String(userId)) === -1) {
      return { approved: false, reason: '' };
    }

    // 4. Órdenes / procesos ('all' o coincidencia por NoOrden o Proceso)
    var ordenes = cfg.ordenes || [];
    var allOrders = ordenes.length === 0 || ordenes.indexOf('all') !== -1 || ordenes.indexOf('ALL') !== -1;
    if (!allOrders) {
      var noOrdenStr = (noOrden || '').toString().trim().toLowerCase();
      var procesoStr = (proceso || '').toString().trim().toLowerCase();
      var match = false;
      for (var i = 0; i < ordenes.length; i++) {
        var o = (ordenes[i] || '').toString().trim().toLowerCase();
        if (o && (o === noOrdenStr || o === procesoStr)) { match = true; break; }
      }
      if (!match) return { approved: false, reason: '' };
    }

    var venceStr = cfg.expiresAt ? (' vigente hasta ' + cfg.expiresAt) : '';
    return { approved: true, reason: 'config' + venceStr };
  } catch (e) {
    Logger.log("Error en evaluateAutoApproval_: " + e.message);
    return { approved: false, reason: '' };
  }
}
