// ============================================================
// MODULE: SidebarLogic
// Descripción: Lógica del lado del servidor para el Sidebar SPA
// ============================================================

/**
 * Abre el panel lateral principal de QMS.
 */
function abrirSidebarQMS() {
  var html = HtmlService.createTemplateFromFile('SidebarQMS')
      .evaluate()
      .setTitle('Panel Principal QMS')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
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
