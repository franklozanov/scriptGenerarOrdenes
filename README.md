# QMS App - Documentación de Arquitectura y Lineamientos

Este documento describe la arquitectura central, el modelo de datos y las reglas de desarrollo del Sistema de Gestión de Calidad (QMS App).

## 1. Arquitectura del Sistema
El sistema está construido como una **Single Page Application (SPA)** dentro de la barra lateral (Sidebar) de Google Sheets, respaldada por un backend en Google Apps Script (GAS).

* **Frontend (SidebarQMS.html):** SPA renderizada en el cliente. Utiliza HTML/CSS plano y Javascript asíncrono puro (Vanilla JS). Los íconos son gestionados mediante [Lucide](https://lucide.dev/). La generación de PDFs se realiza *client-side* usando `pdf-lib` para descargar la carga del servidor.
* **Comunicación (RPC Seguro):** Toda la comunicación Frontend-Backend fluye a través de un único túnel: `google.script.run.rpcToWebApp()`. **Nunca se debe usar `fetch` hacia WebApp URLs**, debido a los bloqueos de políticas de acceso cruzado (Cross-Domain) que devuelven redirecciones HTML de inicio de sesión.
* **Backend (WebApp.gs / SidebarLogic.gs):** Procesa peticiones estructuradas mediante `handlePrivilegedOperation_()`. Actúa como controlador y protege la ejecución de escrituras exigiendo validaciones de seguridad (PIN) y permisos de sesión.

## 2. Seguridad y Sesiones
* **Persistencia de Sesión:** Funciona mediante `PropertiesService.getUserProperties()`, asignando un tiempo de vida (TTL) configurable por el administrador.
* **Firma con PIN:** Las escrituras a bases de datos (Autorizar QA, Cambios de Estado) requieren obligatoriamente la adjunción del PIN (Firma Electrónica) en el *payload* de la operación.
* **Clave Maestra (Admin Override):** Guardada en las propiedades del proyecto (`LOCK_PASSWORD`). Permite a los administradores inicializar el sistema o saltar flujos en caso de emergencia.

## 3. Lineamientos de Diseño UI/UX
1. **Minimalismo (Regla de 3 Colores):** 
   * **Primario:** Azul (`#2563eb`) para llamadas a la acción genéricas y navegación.
   * **Neutros:** Pizarra (`#0f172a`, `#64748b`, `#e2e8f0`) para textos, subtítulos y bordes.
   * **Semánticos:** Solo se utilizan Verde (`#10b981`), Ámbar (`#f59e0b`) o Rojo (`#dc2626`) para estados específicos (Aprobado, Pendiente, Rechazado/Destructivo).
2. **Modales y Alertas:** Deben heredar las clases de `custom-modal-overlay`, manteniendo un ancho reducido (`max-width: 260px`), `box-sizing: border-box`, bordes redondeados y texto centrado. Evitar modales intrusivos de pantalla completa.
3. **Skeleton Loaders:** Las cargas iniciales deben presentar animaciones tipo *skeleton* (ej. `skeleton-avatar`) en lugar de pantallas blancas, y luego inyectar el contenido mediante *Pre-warming* (Carga pre-calentada).

## 4. Modelo de Datos (Resumido)
La base de datos es distribuida (múltiples archivos de Google Sheets) para evitar la saturación. El enrutamiento se logra mediante una matriz maestra:

* **`Sys_MatricesConfig` (Matriz Local):** Es el "Router" de la aplicación. Mapea identificadores abstractos (ej. `DOC_ORDENES`, `SYS_USUARIOS`) a los IDs físicos de los archivos de Drive.
* **`Usuarios` (Hoja Externa):** Tabla maestra de autenticación. Contiene correos, IDs únicos, Hash de seguridad del PIN, y Rol del usuario (`ADMIN`, `QA`, `PRODUCCION`).
* **`Órdenes` (Hoja Externa):** Tabla de hechos principal. Almacena las órdenes generadas, su estado logístico, y un registro (audit trail) de quién las crea y quién las libera.

## 5. Reglas Estrictas de Desarrollo
1. **Nunca** quemar IDs de Google Sheets en el código (`Hardcoding`). Siempre consultar a `mtz_obtenerIdArchivo(clave)`.
2. **Uso de `postWebApp`:** Toda nueva funcionalidad asíncrona debe invocarse a través del método `postWebApp({ operation: '...', userId: ... })` existente en el Sidebar.
3. **Listas Blancas:** Si se crea un nuevo endpoint de solo lectura (que no requiera firma PIN estricta), debe añadirse al arreglo `basicAuthOperations` en `WebApp.gs`.
4. **Validación Dual:** Cualquier regla de negocio crítica (Ej. "Solo QA autoriza reimpresiones") debe validarse **tanto en el HTML** (ocultando botones) **como en el servidor** (rechazando el Payload en `WebApp.gs`).