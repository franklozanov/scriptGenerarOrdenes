# Reglas de Desarrollo — Sistema QMS

Checklist obligatorio para cualquier cambio en este proyecto de Google Apps Script. Cada regla nace de un bug real o de una restricción de la plataforma. **Léelo antes de editar y revísalo antes de sincronizar.**

---

## A. Datos y hojas

- **A1. Mapear columnas por NOMBRE, nunca por índice fijo.** Usa `getColumnIndexByNameCaseInsensitive(headers, 'NombreColumna', ...)`. Los usuarios reordenan columnas; `row[5]` es una bomba de tiempo.
- **A2. La columna `Type` de `templates` es `Estatica | Dinamica | Coordinate | Config`.** Estática ⇔ `Type === 'Estatica'`.
- **A3. Claves especiales de `templates`:** `DOC_ORDENES`/`DOC_ANALISIS` = Dinamica (payload del servidor); `DOC_COMPLETO` = Config / destino (se omite al generar); `COORD_*` = coordenadas; `TPL_*` = estáticas (Estatica).
- **A4. Tras cambiar columnas/permisos, correr "Inicializar Sistema Completo".** Si no, las protecciones y validaciones quedan inconsistentes.
- **A5. Estructura canónica en `Config.gs → REQUIRED_SHEETS`.** Es la fuente de verdad de qué columnas debe tener cada hoja.

---

## B. Modales HTML (Apps Script)

- **B1. `<meta charset="UTF-8">` como PRIMER elemento del `<head>`** en todo modal. Sin él, GAS puede corromper acentos/emojis al reinyectar el HTML vía `document.write`.
- **B2. NUNCA usar `newWindow.closed` para detectar popup bloqueado.** En el iframe sandbox cross-origin da falso positivo. Único indicador confiable: `window.open() === null`.
- **B3. Separar "mostrar" de "registrar".** Una operación crítica (guardar, registrar impresión) NUNCA debe depender de que un popup abra o de un dato cross-origin. Dispararla incondicionalmente.
- **B4. Un solo bloque `<script>` de lógica, preferentemente al final del `<body>`.** Evitar `<script>` inline complejo en el `<head>` (rompió el arranque en el pasado). `pdf-lib` se carga con `<script src>` simple.
- **B5. Componer estilos y utilidades vía `<?!= ... ?>`.** `Theme.html` (CSS) y `GlobalScripts.html` (JS) se inyectan server-side; no duplicar.
- **B6. `showModelessDialog` para modales operativos** (no bloquean la hoja); `showModalDialog` solo para el de identidad. Título en blanco (`' '`) para no duplicar la barra nativa.

---

## C. Backend / seguridad

- **C1. Toda operación privilegiada pasa por un wrapper `*ForUser`** que valida `isUserAuthorized(userId)` y lanza `ACCESS_DENIED`. Las funciones internas no revalidan.
- **C2. `isUserAuthorized` es permisivo con rol vacío** (devuelve `true`). Tenerlo presente al razonar sobre acceso.
- **C3. Operaciones admin siempre re-piden contraseña** (`withAdminAuth` → `LOCK_PASSWORD`). No cachear.
- **C4. La identidad se valida inline en cada modal** (vía `getInitialData` → `activeEmail` → hoja Usuarios), no en el opener.
- **C5. Guardado de impresión = transacción atómica** (`processAndSavePdfBackgroundForUser`): guardar + trazabilidad + finalize + historial en una sola llamada.

---

## D. Trazabilidad (regulatorio)

- **D1. Los contadores se ACUMULAN, nunca se sobrescriben.** `NoPags`/`Reimpresion` suman; `ImpresoPor`/`ReimpresoPor` hacen append de firmas.
- **D2. `ConsecutivoImp` es monótono por orden** (siempre +1). El nombre del archivo guardado incluye el consecutivo: `Orden_<n>_<consecutivo>.pdf`.
- **D3. `printType` decide primera-impresión vs reimpresión.** `Reimpresion` → STATUS `Reimpreso`; cualquier otro → `Impreso`.
- **D4. Dos niveles de log:** hoja `Logs` (eventos globales, `logChange`) y columna `HistorialImpresion` (bitácora por orden, `logHistorialImpresion_`).
- **D5. Bloqueo por STATUS** (`RecibidaQA`/`DevueltaQA`/`Cerrada`) con bypass solo para ADMIN.

---

## E. Flujo de trabajo (git + GAS)

- **E1. Trabajar SOLO en `Impresion_V2`.** La versión `App-dev`/`fix-eb-app` es un proyecto distinto; no mezclar código.
- **E2. `git push` NO despliega a Apps Script.** La sincronización a GAS se hace con el GAS↔GitHub assistant. Sincronizar antes de probar en la hoja.
- **E3. Ante un bug de regresión, comparar contra la última versión buena** (`git diff <commit-bueno>`) en vez de parchear a ciegas. El código en `.gs`/`.html` que sube el sync puede diferir de lo que crees.
- **E4. Verificar sintaxis JS antes de commitear.** Extraer los `<script>` y correr `node --check`.
- **E5. Diagnóstico de encoding: `node`/`jsdom` NO reproducen** problemas de charset del navegador (leen UTF-8 por defecto). El `document.write` del stack trace (`userCodeAppPanel`, `mae_html_user_bin`) es de Google, no nuestro.

---

## F. Rendimiento / UX

- **F1. Abrir el modal debe ser instantáneo.** Nada bloqueante en el arranque; las plantillas se precargan en background (`startBackgroundStaticPreload`).
- **F2. `getInitialData` NO precarga base64** (siempre `null`) para no bloquear la UI; los PDFs se bajan lazy/on-demand.
- **F3. Plantillas estáticas cacheadas en chunks** (6h TTL) para evitar re-descargas de Drive.
- **F4. Búsqueda de orden con `debounce(600ms)`** y control de race condition (descartar respuestas obsoletas).
