/**
 * QMS App - Documentación de Arquitectura y Lineamientos
 * 
 * Este documento describe la arquitectura central, el modelo de datos y 
 * las reglas de desarrollo del Sistema de Gestión de Calidad (QMS App).
 *
 * ==========================================
 * 1. Arquitectura del Sistema
 * ==========================================
 * El sistema está construido como una Single Page Application (SPA) dentro 
 * de la barra lateral (Sidebar) de Google Sheets, respaldada por un backend en GAS.
 * 
 * - Frontend (SidebarQMS.html): SPA renderizada en el cliente. Utiliza HTML/CSS 
 *   plano y Javascript asíncrono puro (Vanilla JS). Los íconos se gestionan con Lucide. 
 *   La generación de PDFs se realiza client-side usando pdf-lib.
 * 
 * - Comunicación (RPC Seguro): Toda la comunicación Frontend-Backend fluye a 
 *   través de un único túnel: google.script.run.rpcToWebApp(). NUNCA se debe usar fetch() 
 *   hacia WebApp URLs para evitar bloqueos por redirecciones HTML de autenticación.
 * 
 * - Backend (WebApp.gs / SidebarLogic.gs): Procesa peticiones estructuradas mediante 
 *   handlePrivilegedOperation_(). Actúa como controlador y protege la ejecución 
 *   exigiendo validaciones de seguridad (PIN) y permisos.
 *
 * ==========================================
 * 2. Seguridad y Sesiones
 * ==========================================
 * - Persistencia de Sesión: Funciona mediante PropertiesService.getUserProperties(), 
 *   asignando un TTL configurable por el administrador.
 * - Firma con PIN: Las escrituras (Autorizar QA, etc) requieren obligatoriamente 
 *   la adjunción del PIN en el payload de la operación.
 * - Clave Maestra (Admin): Guardada en las propiedades del proyecto (LOCK_PASSWORD). 
 *   Permite a los administradores inicializar el sistema o saltar flujos.
 *
 * ==========================================
 * 3. Lineamientos de Diseño UI/UX
 * ==========================================
 * - Minimalismo (Regla de 3 Colores): 
 *     Primario: Azul (#2563eb).
 *     Neutros: Pizarra (#0f172a, #64748b, #e2e8f0).
 *     Semánticos: Verde (#10b981), Ámbar (#f59e0b) o Rojo (#dc2626) para estados.
 * - Modales y Alertas: Deben heredar de `custom-modal-overlay`, manteniendo un ancho 
 *   reducido (max-width: 260px), bordes redondeados y texto centrado.
 * - Skeleton Loaders: Las cargas iniciales deben presentar animaciones skeleton 
 *   y aprovechar el Pre-warming (Carga pre-calentada).
 *
 * ==========================================
 * 4. Modelo de Datos (Resumido)
 * ==========================================
 * - Sys_MatricesConfig (Matriz Local): El "Router". Mapea identificadores abstractos 
 *   (ej. DOC_ORDENES, SYS_USUARIOS) a los IDs físicos de Google Drive.
 * - Usuarios (Hoja Externa): Tabla maestra de autenticación (Correos, IDs, Hash PIN, Rol).
 * - Órdenes (Hoja Externa): Tabla de hechos principal (Órdenes, estado logístico, firmas).
 *
 * ==========================================
 * 5. Reglas Estrictas de Desarrollo
 * ==========================================
 * 1. NUNCA quemar IDs de Google Sheets en el código (Hardcoding). Usar Sys_MatricesConfig.
 * 2. Uso de postWebApp: Toda nueva funcionalidad asíncrona debe invocarse a través 
 *    del método postWebApp({ operation: '...' }) en el Sidebar.
 * 3. Listas Blancas: Nuevos endpoints de solo lectura (sin firma PIN estricta) deben 
 *    añadirse al arreglo basicAuthOperations en WebApp.gs.
 * 4. Validación Dual: Reglas de negocio críticas (Ej. "Solo QA autoriza") deben 
 *    validarse tanto en el HTML (ocultando UI) como en el servidor (WebApp.gs).
 */
