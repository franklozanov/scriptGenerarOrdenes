// ============================================================
// MODULE: ButtonImage
// Descripción: Gestión de la imagen del botón flotante de Novedad
// Prioridad de Carga: N/A (se ejecuta bajo demanda)
// ============================================================

/**
 * Obtiene el blob de la imagen del botón flotante.
 * Usa caché para evitar cargar desde Drive repetidamente.
 * La imagen está almacenada en Drive con ID: 1fmVlKe3jI6CymA9_iW4vNO_7PncuFGu1
 * 
 * @returns {Blob} Blob de la imagen PNG del botón
 * @private
 */
function createNovedadButtonImage_() {
  try {
    var properties = PropertiesService.getScriptProperties();
    var propertyKey = 'NOVEDAD_BUTTON_IMAGE_BASE64';
    
    // Intentar obtener desde propiedades almacenadas
    var storedBase64 = properties.getProperty(propertyKey);
    
    if (storedBase64) {
      Logger.log("✓ Imagen del botón obtenida desde almacenamiento");
      var binaryData = Utilities.base64Decode(storedBase64);
      return Utilities.newBlob(binaryData, 'image/png', 'novedad-button.png');
    }
    
    // Si no está almacenada, cargar desde Drive
    Logger.log("Cargando imagen del botón desde Drive...");
    var imageFileId = '1fmVlKe3jI6CymA9_iW4vNO_7PncuFGu1';
    var imageFile = DriveApp.getFileById(imageFileId);
    var imageBlob = imageFile.getBlob();
    
    // Convertir a base64 y guardar en propiedades
    var base64Data = Utilities.base64Encode(imageBlob.getBytes());
    
    // Verificar tamaño (límite de PropertiesService es ~500KB)
    if (base64Data.length > 500000) {
      Logger.log("⚠ Imagen demasiado grande para almacenar. Usando desde Drive directamente.");
      imageBlob.setContentType('image/png');
      return imageBlob;
    }
    
    properties.setProperty(propertyKey, base64Data);
    Logger.log("✓ Imagen cargada desde Drive y almacenada (tamaño: " + Math.round(base64Data.length/1024) + "KB)");
    
    imageBlob.setContentType('image/png');
    return imageBlob;
    
  } catch (e) {
    Logger.log("ERROR al obtener imagen del botón: " + e.message);
    Logger.log("Usando imagen de respaldo...");
    return createFallbackButtonImage_();
  }
}

/**
 * Crea una imagen de respaldo simple en caso de que falle la carga desde Drive.
 * Genera un PNG mínimo de 1x1 pixel transparente.
 * 
 * @returns {Blob} Blob de imagen PNG de respaldo
 * @private
 */
function createFallbackButtonImage_() {
  // PNG transparente de 1x1 pixel (89 bytes en base64)
  var base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  var binaryData = Utilities.base64Decode(base64PNG);
  var blob = Utilities.newBlob(binaryData, 'image/png', 'fallback-button.png');
  
  Logger.log("⚠ Usando imagen de respaldo (1x1 transparente)");
  
  return blob;
}

/**
 * Limpia la imagen almacenada del botón flotante.
 * Útil para forzar la recarga desde Drive si se actualiza la imagen.
 */
function limpiarImagenBotonAlmacenada() {
  try {
    var properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('NOVEDAD_BUTTON_IMAGE_BASE64');
    Logger.log("✓ Imagen del botón eliminada del almacenamiento");
    return { status: 'success', message: 'Imagen eliminada. Se recargará desde Drive la próxima vez.' };
  } catch (e) {
    Logger.log("ERROR al limpiar imagen almacenada: " + e.message);
    throw e;
  }
}
