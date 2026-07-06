# Plan de Migración a Sidebar SPA (Single Page Application)

## 1. Análisis del Problema de Rendimiento
El sistema actual sufre demoras de carga al abrir los modales (Cargar Órdenes, Solicitar Reimpresión, etc.) debido a dos razones principales:
1. **Google Apps Script Sandbox:** Cada vez que se abre un modal, Google crea un iframe seguro. Este proceso de inicialización de seguridad toma entre 1.5 y 3 segundos.
2. **Sobrecarga de Base64 en el HTML Inicial:** Actualmente, la función `getInitialData()` convierte las plantillas estáticas (archivos PDF de hasta 3MB) a cadenas Base64. Esto genera grandes cantidades de datos que se inyectan directamente en el HTML inicial (`template.initialData`). Descargar y parsear este bloque de texto bloquea el navegador y causa lentitud severa al abrir la interfaz.

## 2. Corrección de Bug: TLP_INSPECTION
El error reportado donde el sistema no encuentra la plantilla de inspección se debe a un error tipográfico en la hoja de cálculo.
- **En el código fuente (`Config.gs` y `Index.html`):** La constante está definida correctamente en español como `TPL_INSPECCION` (TPL por Template).
- **En la hoja de cálculo ('templates'):** Está escrito incorrectamente como `TLP_INSPECTION` (L y P invertidas, e inglés).
- **Acción requerida:** Modificar la columna "Clave" en la pestaña de `templates` de la hoja de cálculo para que diga exactamente `TPL_INSPECCION`. No es necesario modificar el código para esto.

## 3. Optimización del Menú Superior
Actualmente, el menú `Gestionar OA` está saturado con múltiples opciones individuales que abren distintos modales. Con la nueva arquitectura, el menú se limpiará drásticamente.

**Nuevo Menú Propuesto:**
```text
Gestionar OA
  ┣ 🎛️ Abrir Panel Principal QMS
  ┣ ---------------------------
  ┣ ⚙️ Configuración (Submenú)
  ┗ 🔒 Opciones Admin (Submenú)
```
Todas las operaciones diarias operativas vivirán dentro del *Panel Principal QMS*.

## 4. Estructura del Nuevo Sidebar SPA
El Sidebar actuará como un panel de control central. Permanecerá abierto a la derecha de la pantalla y el usuario podrá navegar entre opciones instantáneamente, sin tiempos de carga extra, usando un sistema de pestañas internas. El contenido se filtrará automáticamente según el rol del usuario (Ej. STANDARD no verá opciones de QA).

**Estructura Interna del Panel Lateral:**
1. 📑 **Órdenes y Documentos** *(Visible para STANDARD y ADMIN)*
   - Cargar Nuevas Órdenes (Excel)
   - Subir Documentos Adicionales
2. 🖨️ **Centro de Impresión** *(Visible para STANDARD y ADMIN)*
   - Imprimir Orden (Combinación PDF)
   - Solicitar Reimpresión (Por daño/adicionales)
3. 📦 **Gestión de Piso** *(Visible para STANDARD y ADMIN)*
   - Registrar Entrega / Novedad
4. 🛡️ **Aprobaciones y QA** *(Visible SOLO para QA y ADMIN)*
   - Autorizar Órdenes en estado "Solicitada"
   - Aprobar/Rechazar Solicitudes de Reimpresión

## 5. Fases de Implementación

Para asegurar una transición fluida y sin romper la operatividad actual, la migración se debe realizar en 4 fases:

### Fase 1: Preparación del Backend (Lógica de Datos)
- Crear el archivo `SidebarLogic.gs`.
- Modificar `Cache.gs` para evitar que `getInitialData()` adjunte cadenas Base64 pesadas durante la carga de la interfaz.
- Ajustar la estructura de datos para enviar los permisos de rol (`userPermissions`) al frontend de manera eficiente.

### Fase 2: Interfaz de Usuario (Frontend del Sidebar)
- Construir el archivo maestro `SidebarQMS.html`.
- Desarrollar la interfaz visual con un diseño moderno (HTML/CSS) basado en navegación por pestañas (tabs).
- Programar el "Filtro de Roles Visual": El JavaScript ocultará o eliminará del DOM las pestañas sensibles (ej. Aprobaciones QA) si el usuario no tiene los permisos adecuados en su sesión.

### Fase 3: Migración de Módulos (Lift & Shift)
- Mover el contenido funcional y visual de los modales actuales (`ModalCargaOrdenes.html`, `UploadCentralModal.html`, `Index.html` de impresión) al nuevo Sidebar.
- Convertir cada modal en una `<div class="view-section">` dentro del Sidebar.
- Unificar estilos para mantener consistencia visual.

### Fase 4: Optimización de Rendimiento (Lazy Loading) y Seguridad
- Implementar la descarga asíncrona de archivos Base64 en segundo plano (`google.script.run`) justo después de que el Sidebar se haya renderizado de forma visible. Para cuando el usuario necesite "Generar PDF", los archivos ya estarán cacheados en la memoria del navegador.
- Reforzar la seguridad en el backend asegurando que todas las acciones originadas desde el Sidebar validen el rol del usuario (`hasPermission`) de forma estricta. Esto previene que un usuario ejecute acciones no autorizadas mediante manipulación del navegador.
