# Sistema QMS — Gestión e Impresión de Órdenes de Acondicionamiento

Aplicación de **Google Apps Script** embebida en una hoja de cálculo de Google Sheets, para la gestión documental y la impresión controlada de Órdenes de Acondicionamiento (OA) y Certificados de Análisis (COA) en un entorno farmacéutico regulado (trazabilidad tipo 21 CFR Part 11).

> **Rama de trabajo actual:** `Impresion_V2`. La otra versión de producción (`App-dev` / `fix-eb-app`) es un proyecto **distinto** — no mezclar código entre ambas.

---

## 1. Qué hace la aplicación

Desde el menú **`Gestionar OA`** dentro de Google Sheets, el usuario puede:

| Opción de menú | Función | Qué hace |
|---|---|---|
| 📤 Subir documentos | `abrirModalSubidaGeneral` | Subida masiva de PDFs de órdenes (OA) y análisis (COA) a carpetas de Drive |
| 🖨️ Imprimir Orden | `openPrintDialog` | **Módulo principal**: genera el PDF unificado de impresión de una orden |
| 📝 Registrar Entrega / Novedad | `abrirModalRegistroNovedad` | Registra entregas/devoluciones y cambia el STATUS de la orden |
| ⚙️ Configuración → 📊 Diagnosticar Plantillas | `diagnosticarPlantillas` | Verifica acceso a carpetas y plantillas en Drive |
| ⚙️ Configuración → 🔍 Diagnosticar ConsecutivoImp | `diagnosticarConsecutivoImp` | Valida la columna del contador de impresión |
| 🔒 Opciones Admin → 🚀 Inicializar Sistema Completo | `promptInitializeApp` | Setup completo (columnas, protecciones, triggers, validaciones) |

El corazón del sistema es el **módulo de impresión** (`Index.html` + `PrintLogic.gs`): combina un PDF de la orden + un certificado de análisis + N plantillas estáticas en un solo documento, le inyecta los datos de la orden, y lo guarda versionado en Drive mientras registra la trazabilidad de la impresión.

---

## 2. Arquitectura

### Backend (`.gs` — Google Apps Script, V8)

| Archivo | Responsabilidad |
|---|---|
| `Config.gs` | Constantes globales: `REQUIRED_SHEETS`, `STATIC_TEMPLATE_KEYS_`, `VALORES_STATUS`, `ADMIN_PASS`. **Se carga primero.** |
| `Main.gs` | Punto de entrada: `onOpen()` (menús + warmup de caché), apertura de modales |
| `Auth.gs` | Identidad por email→hoja Usuarios, `isUserAuthorized`, `withAdminAuth`, sesión |
| `Permissions.gs` | RBAC, protecciones de hojas, permisos de carpetas Drive |
| `AppInit.gs` | `initializeCompleteSystem` — setup idempotente de estructura, protecciones y triggers |
| `Cache.gs` | `getInitialData`, caché chunked de plantillas estáticas |
| `PrintLogic.gs` | Lógica de impresión: buscar PDFs, consecutivo, guardar, wrappers `*ForUser` |
| `Traceability.gs` | Trazabilidad de impresión + trigger de auditoría `onEditInstalled` |
| `UploadLogic.gs` | Subida masiva de documentos |
| `NovedadLogic.gs` | Registro de novedades / cambios de STATUS |
| `WebApp.gs` | `doGet`/`doPost` (webapp), visor de PDF, `getWebAppUrl` |
| `Helpers.gs` | Utilidades comunes (mapeo de columnas por nombre, logging) |
| `Diagnostics.gs` | Herramientas de diagnóstico |
| `Migration.gs` | Migraciones de estructura de datos |

### Frontend (`.html` — servidos vía `HtmlService`)

| Archivo | Rol |
|---|---|
| `Index.html` | Modal de impresión (el principal) |
| `UploadCentralModal.html` | Modal de subida masiva |
| `ModalRegistroNovedad.html` | Modal de registro de novedades |
| `ModalValidacion.html` | Modal de validación de identidad (modal bloqueante) |
| `PDFViewer.html` | Visor de PDF de la webapp |
| `Theme.html` | **Design system CSS centralizado** — inyectado en todos los modales vía `<?!= ... ?>` |
| `GlobalScripts.html` | **JavaScript compartido** — inyectado en todos los modales (debounce, drag/resize, utilidades) |

Cada modal HTML compone `Theme.html` + `GlobalScripts.html` en tiempo de evaluación server-side mediante scriptlets `<?!= HtmlService.createHtmlOutputFromFile('...').getContent(); ?>`.

### Dos vías de comunicación cliente↔servidor

- **`Index.html`** usa `google.script.run` (llamadas directas al backend GAS).
- **`UploadCentralModal.html`** y **`ModalRegistroNovedad.html`** usan `fetch` POST contra la **webapp** (`doPost` en `WebApp.gs`, operaciones privilegiadas autenticadas con `userId`).

---

## 3. Estructura de datos (hojas)

Definida en `Config.gs` → `REQUIRED_SHEETS`. **Regla de oro del proyecto: las columnas SIEMPRE se mapean por nombre de encabezado** (`getColumnIndexByNameCaseInsensitive`), nunca por índice fijo `row[N]`.

### Hoja `templates` — configuración de plantillas
`Clave | Valor | Type | NombreTemplate | Description | FormOrder`

La columna **`Type`** tiene tres valores reales (⚠️ no existe "Dynamic"):

| `Type` | Significado | Ejemplos de Clave |
|---|---|---|
| **`File`** | Plantilla **estática**: un PDF fijo. `Valor` = ID de archivo Drive. | `TPL_CODIFICADO`, `TPL_COC`, `TPL_CHECKLIST`, `TPL_ENTREGA_QA`, ... |
| **`Folder`** | Carpeta de Drive. `Valor` = ID de carpeta. | `DOC_ORDENES`, `DOC_ANALISIS` (dinámicas), `DOC_COMPLETO` (destino) |
| **`Coordinate`** | Coordenadas x,y para estampar texto. `Valor` = `x: 360, y: 495`. | `COORD_FABRICANTE`, `COORD_EXP`, `COORD_NoANALISIS` |

**Claves especiales:**
- `DOC_ORDENES` (Folder) → carpeta donde se busca el PDF de la orden **por número de orden**. Es **dinámica**.
- `DOC_ANALISIS` (Folder) → carpeta donde se busca el certificado **por NoAnalisis**. Es **dinámica**.
- `DOC_COMPLETO` (Folder) → carpeta **destino** donde se guarda el PDF unificado final.
- `COORD_*` (Coordinate) → dónde se estampan Fabricante / Exp / NoAnalisis sobre el PDF de la orden.
- `TPL_*` (File) → las 8 plantillas estáticas (ver `STATIC_TEMPLATE_KEYS_` en `Config.gs`).
- `TPL_ORDEN` → excluida del listado de plantillas del cliente.

### Hoja `Ordenes` — datos de las órdenes
`Proceso | Codigo | Descripcion | Lote | Exp | Cantidad | NoAnalisis | NoOrden | Fabricante | AdjuntoCOA | AdjuntoOA | EstadoCarga | ConsecutivoImp | ImpresoPor | ReimpresoPor | NoPags | Reimpresion | TotalPags | STATUS | HistorialImpresion`

Columnas de trazabilidad clave:
- `ConsecutivoImp` — contador **monótono** de impresiones por orden (siempre incrementa).
- `NoPags` / `Reimpresion` / `TotalPags` — páginas acumuladas (`TotalPags = NoPags + Reimpresion`).
- `ImpresoPor` / `ReimpresoPor` — firmas acumuladas de quién imprimió (append, nunca sobrescribe).
- `STATUS` — `Impreso | Reimpreso | RecibidaQA | DevueltaQA | Cerrada`.
- `HistorialImpresion` — bitácora textual por orden (log de guardados/errores).

### Hoja `Usuarios` — identidades
`UserID | Nombre Completo | NombreCorto | Email | Rol`

- `Email` es el **puente** con la sesión de Google.
- `UserID` es la **identidad operativa real** (aparece en firmas y logs).
- Un mismo `Email` puede tener **varios** `UserID` (multi-perfil).
- `Rol` ∈ `ADMIN | QA | STANDARD` (o vacío).

### Hojas `Logs` y `RegistroNovedad`
- `Logs`: `Fecha | Usuario | TipoCambio | DescripcionCambio` — auditoría global de ediciones y eventos del sistema (`logChange`).
- `RegistroNovedad`: `FechaNovedad | NoOrden | Codigo | TipoNovedad | Comentario | TotalPags | NoPagDevueltas | RealizadoPor | STATUS`.

> **Dos niveles de auditoría:** la hoja global `Logs` (eventos/ediciones) y la columna `HistorialImpresion` (bitácora por orden).

---

## 4. Flujo del módulo de impresión (`Index.html`)

```
Abrir modal → getInitialData() [1 round-trip: templates + users + identidad]
   │
   ├─ Validar identidad por email → hoja Usuarios
   │     • 1 match      → badge "Ingresaste como…", oculta loader
   │     • >1 match     → selector de perfil (saveUserProfileSelection)
   │     • 0 match      → "Acceso Denegado"
   │
   ├─ startBackgroundStaticPreload()  ← precarga en PARALELO las plantillas
   │     Type==='File' (no bloquea la apertura del modal)
   │
   ├─ Usuario teclea No. de Orden (≥3 chars, debounce 600ms)
   │     → preloadOrderData() → fetchOrderData()
   │        busca PDF de la orden (DOC_ORDENES) + análisis (DOC_ANALISIS)
   │        [control de race condition: descarta respuestas obsoletas]
   │
   ├─ Botón "Generar" se habilita cuando: orden lista + usuario válido + ≥1 copia
   │
   ├─ run() → processPdfGeneration()
   │     1. Merge: estáticas (de memoria o on-demand) + dinámicas (del payload)
   │     2. pdf-lib: inyecta campos, coordenadas, AcroForm
   │     3. Página en blanco tras cada plantilla con nº impar de páginas (dúplex)
   │     4. Pie de página en todas (orientación dinámica): "Impreso por… | No. Orden…"
   │     5. Aplana AcroForm, optimiza, genera blobURL
   │     → botón cambia a "👉 Ver PDF Generado"
   │
   └─ Click "Ver PDF Generado":
         1. window.open(blobURL)  [abre el PDF en pestaña nueva]
         2. processAndSavePdfBackgroundForUser()  ← SIEMPRE (guarda + registra)
         3. Libera UI para la siguiente orden
```

### Precarga de plantillas estáticas (`startBackgroundStaticPreload`)
Filtra **solo `t.type === 'File' && t.hasAccess && t.fileId`** y las descarga en paralelo al abrir el modal, llenando `preloadedStaticPdfs`. Al generar, si una no alcanzó a precargarse, se baja **on-demand** como respaldo. Esto da la percepción de velocidad: el modal abre al instante y las plantillas se cargan de fondo.

### Generación del PDF (`processPdfGeneration`)
- **Clasificación:** `type === 'File'` → estática; `DOC_ORDENES`/`DOC_ANALISIS` → dinámicas (del payload); `DOC_COMPLETO` → se omite.
- **Inyección de datos:** en `DOC_ORDENES` se estampa texto en coordenadas absolutas (`payload.coords`); en otras plantillas se rellena el AcroForm; `DOC_ANALISIS` se copia tal cual.
- **Páginas en blanco:** tras cada plantilla con nº impar de páginas, para impresión a doble cara.
- **Pie de página:** en cada página, con detección de orientación (rota +90° si es horizontal) y traducción de coordenadas visuales→lógicas para los 4 ángulos.

---

## 5. Reglas críticas y trampas (⚠️ LEER antes de tocar el modal)

Estos son aprendizajes de bugs reales. Ignorarlos reintroduce fallos difíciles de diagnosticar.

### 5.1 Popup: NUNCA usar `newWindow.closed`
En el iframe sandbox **cross-origin** de Apps Script, `newWindow.closed` se lee como `undefined` **aunque el popup se haya abierto bien**. Usarlo daba un **falso positivo** de "popup bloqueado" que hacía `return` y **se saltaba el guardado/registro de impresión** (el PDF se abría pero nunca se guardaba en Drive ni se actualizaba el consecutivo).

**Regla:**
```js
var newWindow = window.open(blobURL, "_blank");
var popupBloqueado = !newWindow;   // ÚNICO indicador confiable
// Disparar SIEMPRE el guardado, independientemente del popup:
google.script.run.processAndSavePdfBackgroundForUser(...);
```
El registro de impresión **nunca** debe depender de que la pestaña abra. Si el popup se bloquea, mostrar un link inline clickeable, no un `alert()+return`.

### 5.2 Clasificar plantillas por `Type === 'File'`, no por "Dynamic"
La columna `Type` es `File | Folder | Coordinate`. No existe "Dynamic". Estática = `type === 'File'`. `DOC_ORDENES`/`DOC_ANALISIS` (Folder) van al payload dinámico; tratarlas como estáticas hace que se intente descargarlas con un ID de carpeta y falla ("No se pudo obtener el PDF de la plantilla…").

### 5.3 `<meta charset="UTF-8">` obligatorio en cada modal
Todo `.html` de modal servido por `HtmlService` **debe** declarar `<meta charset="UTF-8">` como primer elemento del `<head>`. El HTML está lleno de acentos y emojis; sin charset, Apps Script puede corromper la codificación al reinyectar el markup vía `document.write` y romper el parseo.

### 5.4 Mapeo de filas por nombre de columna
Regla general del proyecto: leer/escribir celdas **siempre** por nombre de encabezado (`getColumnIndexByNameCaseInsensitive`), nunca por índice fijo `row[N]`. Los usuarios reordenan columnas.

### 5.5 Re-inicializar tras cambios de columnas/permisos
Después de cambiar columnas, permisos o protecciones, correr **🚀 Inicializar Sistema Completo** para que la estructura, validaciones y protecciones queden consistentes.

---

## 6. Modelo de trazabilidad e integridad de impresión

La operación de guardado es **atómica**: `processAndSavePdfBackgroundForUser` (PrintLogic.gs) ejecuta en una sola llamada:

1. **Guardar PDF** (`saveFinalUnifiedPDF`): incrementa `ConsecutivoImp`, crea `Orden_<orderNo>_<consecutivo>.pdf` en `DOC_COMPLETO`.
2. **Trazabilidad** (`internalUpdateTraceability`): según `printType`:
   - `Adicional`/inicial → STATUS `Impreso`, suma a `NoPags`, firma en `ImpresoPor`.
   - `Reimpresion` → STATUS `Reimpreso`, suma a `Reimpresion`, firma en `ReimpresoPor`.
   - Recalcula `TotalPags = NoPags + Reimpresion`.
   - Firma: `<consecutivo>-<nombreCorto> <dd/MM/yyyy HH:mm> (<páginas>)`, **anexada** (nunca sobrescribe).
3. **Post-guardado** (`finalizeFinalPdfPostSave`): log en `Logs` + `setShareableByEditors(false)`.
4. **Historial** (`logHistorialImpresion_`): entrada en `HistorialImpresion` (éxito o error) + toast al usuario.

**Bloqueo por STATUS:** `fetchOrderData` bloquea la impresión si el STATUS es `RecibidaQA`, `DevueltaQA` o `Cerrada` — salvo bypass para rol `ADMIN` (registra advertencia).

---

## 7. Autenticación y permisos

- **Identidad:** `Session.getActiveUser().getEmail()` → match en hoja `Usuarios` (columna `Email`) → `UserID` operativo. La validación ocurre **inline en cada modal** al cargar (no en el opener; `checkAuthAndRunModal_` está inactivo).
- **Multi-perfil:** un email con varios `UserID` muestra un selector; la elección se cachea (`saveUserProfileSelection`, 6h).
- **Autorización de escritura:** los wrappers `*ForUser` (backend) validan `isUserAuthorized(userId)` antes de cualquier operación privilegiada y lanzan `ACCESS_DENIED` si falla. ⚠️ `isUserAuthorized` concede acceso si el rol está **vacío** (comportamiento permisivo).
- **Contraseña admin:** `withAdminAuth` re-pide **siempre** la contraseña (`LOCK_PASSWORD` en Script Properties) para operaciones administrativas. No hay caché para ella.

---

## 8. Setup y despliegue

### Requisitos de configuración (Script Properties)
- `LOCK_PASSWORD` — contraseña de administrador.
- `WEB_APP_URL` — URL de la webapp desplegada (termina en `/exec`). Se auto-configura en la inicialización.

### Inicializar el sistema
Menú **🔒 Opciones Admin → 🚀 Inicializar Sistema Completo** (pide contraseña admin). Ejecuta:
1. Limpia caché de plantillas.
2. Valida/crea hojas y columnas (`REQUIRED_SHEETS`), incluida `ConsecutivoImp`.
3. Configura la URL de la webapp.
4. Aplica el esquema de protecciones (oculta hojas de sistema, protege columnas críticas de `Ordenes`, protege `templates`/`Usuarios`/`Logs`/`RegistroNovedad`).
5. Crea el trigger de auditoría `onEditInstalled` (idempotente).
6. Aplica validaciones de datos y formato condicional en STATUS/EstadoCarga.

### Sincronización con GAS
El código se sincroniza con el proyecto de Apps Script mediante el **GAS ↔ GitHub assistant** (no vía `clasp push`). Tras un cambio en `Impresion_V2`, sincronizar antes de probar en la hoja.

---

## 9. Convenciones de diseño (UI)

El design system está documentado en **`DESIGN_SYSTEM_RULES.md`** (obligatorio para nuevos modales). Puntos clave:
- Todo el CSS vive en `Theme.html`; no duplicar estilos en cada modal.
- Modales operativos con `showModelessDialog` (no bloquean la hoja); el de identidad con `showModalDialog`.
- Título del modal en blanco (`' '`) para no duplicar con la barra nativa gris de Sheets.
- Paleta: azul `#1976d2`/`#1565c0`, grises slate, verde éxito, rojo error.
- Drag/resize de ventana vía `google.script.host.moveBy/setWidth/setHeight`.

---

## 10. Documentos relacionados

- `DESIGN_SYSTEM_RULES.md` — reglas de diseño UI (obligatorio para modales).
- `ARQUITECTURA_IMPRESION.md` — detalle técnico profundo del módulo de impresión.
- `MIGRATION_GUIDE.md` — guía de migración de estados de carga.
- `ROLLBACK.md` — procedimiento de rollback.
