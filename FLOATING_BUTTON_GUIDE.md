# Guía del Botón Flotante de Novedad

## 📌 Descripción

El botón flotante "+ Novedad" es un acceso rápido visual ubicado en la esquina inferior derecha de la hoja "Ordenes" que permite abrir el modal de registro de novedad con un solo clic.

## 🎨 Características del Botón

- **Diseño**: Círculo azul con símbolo "+" blanco y texto "Novedad"
- **Tamaño**: 140x140 píxeles
- **Posición**: Esquina inferior derecha de la hoja
- **Efecto**: Sombra para dar sensación de flotación
- **Interacción**: Clic para abrir modal de registro de novedad

## 🔧 Instalación

### Opción 1: Desde el Editor de Scripts

Ejecute la función:
```javascript
crearBotonFlotanteNovedad()
```

### Opción 2: Con autenticación admin

Ejecute la función:
```javascript
promptCrearBotonFlotanteNovedad()
```

### Opción 3: Automática en inicialización completa

El botón se crea automáticamente al ejecutar:
```javascript
initializeCompleteSystem()
```

## 📍 Posicionamiento

### Posición Predeterminada
El botón se coloca automáticamente en:
- **Fila**: Cerca del final de la hoja (fila máxima - 5)
- **Columna**: Cerca del borde derecho (columna máxima - 2)

### Mover el Botón Manualmente
1. Haga clic en el botón para seleccionarlo
2. Arrástrelo a la posición deseada
3. Suelte para fijarlo en la nueva ubicación

**Nota**: El botón está anclado a una celda, por lo que se moverá si inserta/elimina filas o columnas.

## 🔄 Gestión del Botón

### Eliminar el Botón

Si necesita eliminar el botón (por ejemplo, para recrearlo):

**Opción 1: Desde el Editor de Scripts**
```javascript
eliminarBotonFlotanteNovedad()
```

**Opción 2: Con autenticación admin**
```javascript
promptEliminarBotonFlotanteNovedad()
```

**Opción 3: Manualmente**
1. Haga clic derecho en el botón
2. Seleccione "Eliminar"

### Recrear el Botón

Si eliminó el botón y desea recrearlo:
```javascript
crearBotonFlotanteNovedad()
```

La función automáticamente elimina cualquier botón existente antes de crear uno nuevo.

## 🎯 Funcionalidad

### Al Hacer Clic
El botón ejecuta la función `abrirModalRegistroNovedad()` que:
1. Abre el modal de registro de novedad
2. Permite registrar entregas, devoluciones y cambios de estado
3. Actualiza automáticamente la hoja "RegistroNovedad"

### Accesos Alternativos
El modal también se puede abrir desde:
- **Menú**: Gestionar OA → 📝 Registrar Entrega / Novedad
- **Botón flotante**: Clic en "+ Novedad" (este botón)

## 🎨 Personalización del Diseño

Si desea cambiar el diseño del botón, edite la función `createNovedadButtonSVG_()` en `FloatingButton.gs`:

### Cambiar Color del Círculo
```javascript
'<circle cx="70" cy="70" r="60" fill="#1976d2" .../>'
// Cambie #1976d2 por el color deseado
```

### Cambiar Tamaño del Botón
En la función `crearBotonFlotanteNovedad()`:
```javascript
image.setWidth(140);   // Ancho en píxeles
image.setHeight(140);  // Alto en píxeles
```

### Cambiar Texto
```javascript
'<text ...>Novedad</text>'
// Cambie "Novedad" por el texto deseado
```

## ⚠️ Solución de Problemas

### El botón no aparece
**Causa**: La función no se ejecutó correctamente.
**Solución**: 
1. Verifique los logs: `View → Logs` en el Editor de Scripts
2. Ejecute nuevamente `crearBotonFlotanteNovedad()`

### El botón no hace nada al hacer clic
**Causa**: El script no está asignado correctamente.
**Solución**:
1. Elimine el botón: `eliminarBotonFlotanteNovedad()`
2. Recree el botón: `crearBotonFlotanteNovedad()`

### Hay múltiples botones
**Causa**: La función se ejecutó varias veces.
**Solución**:
1. Ejecute `eliminarBotonFlotanteNovedad()` (elimina todos)
2. Ejecute `crearBotonFlotanteNovedad()` (crea uno nuevo)

### El botón se mueve al insertar filas/columnas
**Causa**: El botón está anclado a una celda.
**Solución**: Esto es comportamiento normal. Simplemente arrastre el botón a la posición deseada nuevamente.

## 📊 Ventajas del Botón Flotante

1. **Acceso rápido**: Un solo clic para abrir el modal
2. **Siempre visible**: No necesita buscar en menús
3. **Intuitivo**: Diseño familiar (similar a apps móviles)
4. **No invasivo**: Se ubica en área no utilizada de la hoja
5. **Profesional**: Mejora la experiencia de usuario

## 🔐 Seguridad

- El botón ejecuta la misma función que el menú (sin permisos adicionales)
- Requiere los mismos permisos de usuario que el modal normal
- No bypasea ninguna validación de seguridad

## 📝 Notas Técnicas

- **Formato**: SVG (Scalable Vector Graphics)
- **Anclaje**: Relativo a celda (no posición absoluta)
- **Script asignado**: `abrirModalRegistroNovedad`
- **Hoja objetivo**: `Ordenes`
- **Compatibilidad**: Google Sheets (no funciona en Excel)

## 🆘 Soporte

Si tiene problemas con el botón flotante:
1. Revise los logs del sistema
2. Verifique que la función `abrirModalRegistroNovedad()` funcione correctamente
3. Intente eliminar y recrear el botón
4. Consulte este documento para solución de problemas
