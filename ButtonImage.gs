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
    var cache = CacheService.getScriptCache();
    var cacheKey = 'NOVEDAD_BUTTON_IMAGE_BASE64';
    
    // Intentar obtener desde caché
    var cachedBase64 = cache.get(cacheKey);
    
    if (cachedBase64) {
      Logger.log("✓ Imagen del botón obtenida desde caché");
      var binaryData = Utilities.base64Decode(cachedBase64);
      return Utilities.newBlob(binaryData, 'image/png', 'novedad-button.png');
    }
    
    // Si no está en caché, cargar desde Drive
    Logger.log("Cargando imagen del botón desde Drive...");
    var imageFileId = '1fmVlKe3jI6CymA9_iW4vNO_7PncuFGu1';
    var imageFile = DriveApp.getFileById(imageFileId);
    var imageBlob = imageFile.getBlob();
    
    // Convertir a base64 y guardar en caché (6 horas)
    var base64Data = Utilities.base64Encode(imageBlob.getBytes());
    cache.put(cacheKey, base64Data, 21600); // 6 horas
    
    Logger.log("✓ Imagen cargada desde Drive y guardada en caché");
    
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
