# Solución: Plantillas sin acceso

## Problema
El script no puede acceder a algunas plantillas configuradas en la hoja `templates`. Esto se debe a que los archivos PDF en Google Drive no están compartidos correctamente con el script.

## Síntomas
- En el Panel de Impresión aparecen plantillas marcadas como "(Sin acceso)"
- Las plantillas sin acceso están deshabilitadas (en gris)
- Al intentar generar el PDF, aparece un error

## Diagnóstico
1. Abra el menú **🖨️ Impresión** → **🔍 Diagnosticar Plantillas**
2. Revise el reporte que muestra qué plantillas tienen problemas
3. Anote los IDs de archivo que aparecen con error

## Soluciones

### Opción 1: Verificar IDs de archivo (Más común)
1. Abra la hoja `templates` en Google Sheets
2. Para cada plantilla con error, verifique que el ID en la columna B sea correcto
3. Para obtener el ID correcto de un archivo en Drive:
   - Abra el archivo PDF en Google Drive
   - Copie el ID de la URL (la parte después de `/d/` y antes de `/view`)
   - Ejemplo: `https://drive.google.com/file/d/1ABC123xyz/view` → ID = `1ABC123xyz`
4. Pegue el ID correcto en la hoja `templates`
5. Guarde los cambios

### Opción 2: Compartir archivos con el script
1. Identifique el correo electrónico del script (generalmente termina en `@gserviceaccount.com`)
2. Para cada archivo PDF con error:
   - Haga clic derecho en el archivo en Google Drive
   - Seleccione "Compartir"
   - Agregue el correo del script con permisos de "Lector"
3. Vuelva a ejecutar el diagnóstico

### Opción 3: Mover archivos a una carpeta compartida
1. Cree una carpeta en Google Drive
2. Comparta la carpeta con el script (permisos de Lector)
3. Mueva todos los archivos PDF de plantillas a esa carpeta
4. Actualice los IDs en la hoja `templates` si es necesario

## Verificación
Después de aplicar la solución:
1. Ejecute nuevamente **🔍 Diagnosticar Plantillas**
2. Verifique que todas las plantillas muestren "✓" (accesibles)
3. Abra el Panel de Impresión y confirme que no hay plantillas marcadas como "(Sin acceso)"

## Notas importantes
- Las plantillas `TPL_ORDEN` y `DOC_ANALISIS` son dinámicas y no requieren ID de archivo
- Si el problema persiste, contacte al administrador del sistema
- Los cambios en la configuración pueden tardar unos segundos en reflejarse debido al caché
