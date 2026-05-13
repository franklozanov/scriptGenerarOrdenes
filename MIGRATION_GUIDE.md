# Guía de Migración - Estados Granulares de Carga

## Resumen de Cambios

Se ha implementado un sistema de **estados granulares** para el seguimiento de carga de documentos COA (Certificado de Análisis) y OA (Orden de Acondicionamiento).

### Estados Anteriores (2 estados)
- ❌ `Pendiente` - Documentos sin cargar
- ✅ `Cargado` - Documentos cargados

### Nuevos Estados (4 estados)
1. **Pendiente COA/OA** - Ambos documentos pendientes
2. **Pendiente OA** - Solo falta la Orden de Acondicionamiento
3. **Pendiente COA** - Solo falta el Certificado de Análisis
4. **✅ Cargados** - Ambos documentos cargados

## Cambios en la Estructura

### Columnas Modificadas en la Hoja "Ordenes"

**Columnas eliminadas:**
- `AdjuntoOrden` (antigua columna única)

**Columnas nuevas:**
- `AdjuntoCOA` - Estado del Certificado de Análisis
- `AdjuntoOA` - Estado de la Orden de Acondicionamiento  
- `EstadoCarga` - Estado consolidado calculado automáticamente

## Pasos de Migración

### 1. Agregar Nuevas Columnas Manualmente

**IMPORTANTE:** Debe agregar las columnas manualmente en la hoja "Ordenes" antes de ejecutar la migración.

Agregue las siguientes columnas en el orden indicado (después de "Fabricante"):
1. `AdjuntoCOA`
2. `AdjuntoOA`
3. `EstadoCarga`

### 2. Hacer Respaldo

**CRÍTICO:** Haga una copia de seguridad completa de la hoja de cálculo antes de continuar.

### 3. Ejecutar Verificación Pre-Migración

Desde el Editor de Scripts, ejecute:
```javascript
verificarEstadoMigracion()
```

Esta función mostrará:
- Total de filas en la hoja
- Filas con datos en `AdjuntoOrden` (columna antigua)
- Filas con datos en las nuevas columnas
- Filas sin datos

### 4. Ejecutar Migración

Desde el Editor de Scripts, ejecute:
```javascript
migrarAdjuntoOrdenANuevasColumnas()
```

**Lógica de migración:**
- Si `AdjuntoOrden` = "✅ Cargado" → Ambas columnas (`AdjuntoCOA` y `AdjuntoOA`) se marcarán como "✅ Cargado"
- Si `AdjuntoOrden` = "Pendiente" o vacío → Ambas columnas se marcarán como "Pendiente"
- Si la orden NO tiene `NoAnalisis`, el campo `AdjuntoCOA` quedará vacío (no aplica)
- El campo `EstadoCarga` se calculará automáticamente

### 5. Verificar Resultados

Después de la migración:
1. Revise algunas filas manualmente para confirmar que los datos se migraron correctamente
2. Verifique que la columna `EstadoCarga` muestre los estados correctos
3. Ejecute nuevamente `verificarEstadoMigracion()` para confirmar

### 6. Eliminar Columna Antigua (Opcional)

Una vez confirmado que todo funciona correctamente, puede eliminar manualmente la columna `AdjuntoOrden` antigua.

**ADVERTENCIA:** Solo elimine esta columna después de verificar exhaustivamente que la migración fue exitosa.

## Funcionalidad del Sistema Actualizado

### Modal de Subida de Documentos

El modal ahora permite seleccionar el tipo de documento específico:
- **Orden Acond.** - Para cargar Órdenes de Acondicionamiento
- **Certificado Análisis** - Para cargar Certificados de Análisis

Las listas de órdenes pendientes se filtran automáticamente según el tipo de documento seleccionado.

### Actualización Automática de Estados

Cuando se carga un documento:
1. Se actualiza la columna específica (`AdjuntoCOA` o `AdjuntoOA`) a "✅ Cargado"
2. Se recalcula automáticamente el `EstadoCarga` consolidado
3. El estado consolidado refleja qué documentos faltan por cargar

### Modificación de NoOrden

Si se modifica el `NoOrden` de una fila que tiene documentos cargados:
- Ambas columnas (`AdjuntoCOA` y `AdjuntoOA`) se resetean a "Pendiente"
- Se limpia la nota con el URL del archivo
- Se actualiza el `EstadoCarga` a "Pendiente COA/OA"
- Se registra el cambio en el log de auditoría

## Solución de Problemas

### Error: "Las columnas 'AdjuntoCOA', 'AdjuntoOA' y 'EstadoCarga' deben existir..."

**Solución:** Agregue manualmente las tres columnas a la hoja "Ordenes" antes de ejecutar la migración.

### La migración omite algunas filas

**Causa:** Las filas ya tienen datos en las nuevas columnas.

**Solución:** Esto es normal. La migración solo procesa filas que no tienen datos en las nuevas columnas para evitar sobrescribir datos existentes.

### El estado consolidado no se actualiza

**Solución:** Ejecute manualmente desde el Editor de Scripts:
```javascript
// Para una fila específica (ejemplo: fila 5)
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ordenes');
var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
actualizarEstadoCarga(sheet, 5, headers);
```

## Archivos Modificados

Los siguientes archivos fueron actualizados para soportar los estados granulares:

1. **Config.gs** - Estructura de columnas requeridas
2. **Helpers.gs** - Funciones de cálculo de estado consolidado
3. **UploadLogic.gs** - Lógica de carga de documentos
4. **UploadCentralModal.html** - Interfaz de usuario del modal
5. **Traceability.gs** - Auditoría y reseteo de estados
6. **AppInit.gs** - Mensajes de inicialización
7. **Migration.gs** - Funciones de migración (NUEVO)

## Contacto y Soporte

Para preguntas o problemas con la migración, consulte los logs del sistema o contacte al administrador del sistema.
