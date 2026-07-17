# Arquitectura del Módulo de Impresión

Detalle técnico profundo de `Index.html` + `PrintLogic.gs` + `Cache.gs` + `Traceability.gs`. Complementa el `README.md`.

> **Este documento es la referencia obligatoria antes de modificar el flujo de impresión.** Contiene la lógica interna y la historia de bugs reales cuya recurrencia hay que evitar.

---

## 1. Componentes y responsabilidades

| Capa | Archivo | Piezas clave |
|---|---|---|
| UI / cliente | `Index.html` | `window.onload`, `startBackgroundStaticPreload`, `preloadOrderData`, `run`, `processPdfGeneration`, `updateGoButtonState` |
| Servidor — datos | `Cache.gs` | `getInitialData`, `getStaticTemplateBase64`, caché chunked |
| Servidor — impresión | `PrintLogic.gs` | `fetchOrderData`, `saveFinalUnifiedPDF`, `processAndSavePdfBackgroundForUser`, wrappers `*ForUser` |
| Servidor — trazabilidad | `Traceability.gs` | `internalUpdateTraceability`, `onEditInstalled`, `logChange` |
| Config | `Config.gs` | `STATIC_TEMPLATE_KEYS_`, `REQUIRED_SHEETS`, `VALORES_STATUS` |

---

## 2. Estado del cliente (`Index.html`)

```js
let globalTemplates    = [];   // metadatos: {key, name, type, fileId, hasAccess, description, formOrder}
let preloadedStaticPdfs = {};  // key → base64 (plantillas Type==='Estatica' ya en memoria)
let preloadState = {           // máquina de estados de la precarga dinámica por orden
  orderNo, status,             // status: 'idle' | 'loading' | 'ready' | 'error'
  data, pdfsByKey, errors
};
```

- `globalTemplates` viene de `getInitialData()` (un solo round-trip).
- `preloadedStaticPdfs` se llena en background (`startBackgroundStaticPreload`) y/o on-demand.
- `preloadState` rastrea la búsqueda de los PDFs **dinámicos** de la orden tecleada.

---

## 3. Carga inicial: `window.onload → getInitialData()`

`getInitialData()` (Cache.gs L81) devuelve en una sola llamada:
```
{ templates, users, webAppUrl, activeEmail, savedProfileIdx }
```
Cacheado en `ScriptCache` bajo `initialData_v2` por **600 s**. **Optimización clave (Fase 6):** el `base64` de las plantillas **siempre se envía como `null`** — no se precarga en el servidor para no bloquear la UI; se descarga on-demand/lazy.

En el success handler del cliente:
1. Guarda `globalTemplates`; si alguna plantilla trae `base64` (no debería, por la optimización), la vuelca a `preloadedStaticPdfs`.
2. Renderiza `#tplList`: una fila por plantilla con contador (−/input/+). Defaults: `1` general, `0` para `TPL_ESTUCHADO`/`TPL_TERMO`, `2` para `TPL_CONTROLES`. `hasAccess===false` → fila en rojo/itálica, controles `disabled`.
3. **Resuelve identidad** por `activeEmail` contra la hoja Usuarios:
   - **1 match** → `onUserValidated()` (fija `window.currentUserIdentity = "userId - nombreCompleto"`, muestra badge), oculta loader, dispara `startBackgroundStaticPreload()`.
   - **>1 match** sin `savedProfileIdx` → selector de perfil; al confirmar → `saveUserProfileSelection(idx)` → valida.
   - **0 match** → reemplaza el `body` por "Acceso Denegado".
4. Cablea `#orderNo`: `debounce(600ms)` → `preloadOrderData()` con ≥3 caracteres; Enter simula click en Generar.

---

## 4. Precarga en paralelo de plantillas estáticas

```js
function startBackgroundStaticPreload() {
  const staticTemplates = globalTemplates.filter(t =>
    t.type === 'Estatica' && t.hasAccess && t.fileId   // ← SOLO Type==='Estatica'
  );
  staticTemplates.forEach(t => {
    if (preloadedStaticPdfs[t.key]) return;
    google.script.run
      .withSuccessHandler(base64 => { if (base64) preloadedStaticPdfs[t.key] = base64; })
      .withFailureHandler(err => { /* no crítico: se reintenta on-demand */ })
      .getStaticTemplateBase64(t.key, t.fileId);
  });
}
```

- Se dispara **después** de validar el usuario, **sin bloquear** la apertura del modal.
- Solo procesa `Type === 'Estatica'`. **NO** toca `DOC_ORDENES`/`DOC_ANALISIS` (Dinamica), `DOC_COMPLETO` (destino) ni `COORD_*`.
- Si una falla, no es crítico: `processPdfGeneration` la baja on-demand al generar.

### Caché chunked (servidor, `Cache.gs`)
`CacheService` limita ~100 KB por entrada. Las plantillas se guardan partidas en chunks de `STATIC_TEMPLATE_CHUNK_SIZE_` (80 000 chars), con TTL de `STATIC_TEMPLATE_CACHE_TTL_` (6 h):
- `staticPdf_<key>_meta` → `{ chunkCount }`
- `staticPdf_<key>_0`, `_1`, … → los pedazos del base64
- Lectura: recompone con `chunks.join('')`; si falta algún chunk → cache miss → descarga de Drive y re-cachea.

---

## 5. Precarga dinámica por orden: `preloadOrderData → fetchOrderData`

Al teclear el No. de orden, `fetchOrderData(orderNo)` (PrintLogic.gs L170):
1. Busca la fila de la orden en `Ordenes` por `NoOrden`.
2. **Valida STATUS** (ver §8): bloquea si `RecibidaQA`/`DevueltaQA`/`Cerrada` (bypass ADMIN).
3. Extrae `formData` (Proceso, Codigo, Descripcion, Lote, Exp, Cantidad, NoAnalisis, NoOrden, Fabricante).
4. Busca el **PDF de la orden** en `DOC_ORDENES` (`findOrderPdfInFolder`) → base64.
5. Busca el **certificado** en `DOC_ANALISIS` por `NoAnalisis` (`findAnalysisPdfInFolder`) → base64.
6. Devuelve `{ status, ready, orderNo, noAnalisis, formData, coords, pdfs, errors }`.

**Control de race condition (cliente):** al llegar la respuesta, se compara el `orderNo` actual del input contra el de la respuesta; si difieren, se descarta (el usuario ya cambió de orden). Aplica en success y failure.

`isPreloadReadyForOrder()` → true solo si `status==='ready'` **y** existen `pdfsByKey.DOC_ORDENES` **y** `DOC_ANALISIS`.

`updateGoButtonState()` habilita el botón "Generar" solo con: **orden lista + usuario válido + ≥1 copia**.

---

## 6. Generación del PDF: `run → processPdfGeneration`

`run()` valida entradas y construye el payload con `buildPayloadFromPreload(config)`. Luego `processPdfGeneration`:

### 6.1 Merge de plantillas (el punto donde vivían los bugs)
```js
for (const cfg of config) {
  const templateMeta = globalTemplates.find(t => t.key === cfg.key);
  const isStatic = templateMeta && templateMeta.type === 'Estatica';   // ← criterio correcto

  if (cfg.key === 'DOC_COMPLETO') { continue; }                    // carpeta destino: omitir

  if (isStatic) {
    // usar preloadedStaticPdfs[cfg.key], o descargar on-demand (await getStaticTemplateBase64)
  } else {
    // dinámica (DOC_ORDENES / DOC_ANALISIS): tomar del payload.pdfs
  }
}
```
Respeta el **orden** y las **copias** de `config`.

### 6.2 Inyección de datos (pdf-lib)
Por cada item, por cada copia:
- **`DOC_ORDENES`**: `drawText` en coordenadas absolutas de `payload.coords` (Fabricante/Exp/NoAnalisis) sobre la primera página.
- **Otras plantillas** (excepto `DOC_ANALISIS`): rellena el AcroForm (`getTextField().setText()` + `enableReadOnly()`).
- **`DOC_ANALISIS`**: se copia tal cual, sin inyección.

### 6.3 Páginas en blanco (dúplex)
Si una plantilla aporta un número **impar** de páginas, se añade una página en blanco (612×792) con el texto "Esta página fue dejada en blanco de manera intencional". Garantiza bloques pares para impresión a doble cara.

### 6.4 Pie de página (orientación dinámica)
En **todas** las páginas: si `width > height` (horizontal), rota +90° y swappea dimensiones. `drawVisualText` traduce coordenadas *visuales* → *lógicas* según el ángulo (0/90/180/270).
- Izquierda: `Impreso por: {nombre} el {fecha} | No. Orden: {n}`
- Derecha: `Pág. ____ de ____`

### 6.5 Optimización y salida
Aplana el AcroForm final (`form.flatten()`), purga el diccionario `AcroForm` del catálogo, guarda con `useObjectStreams:true`, `objectsPerTick:50`, `updateFieldAppearances:false`. Convierte a base64 chunked (`uint8ArrayToBase64`) y crea `blobURL` con `URL.createObjectURL`. El botón pasa a **"👉 Ver PDF Generado"**.

---

## 7. Botón "Ver PDF Generado" + guardado (⚠️ el corazón de la integridad)

```js
btn.onclick = function() {
  // 1) Intentar abrir el PDF. ÚNICO indicador confiable de bloqueo: window.open()===null.
  //    NUNCA usar newWindow.closed (falso positivo cross-origin en el iframe de GAS).
  var newWindow = window.open(blobURL, "_blank");
  var popupBloqueado = !newWindow;

  // 2) SIEMPRE registrar la impresión — NO depende de que el popup abra.
  google.script.run
    .processAndSavePdfBackgroundForUser(base64Data, orderNo, userId, totalPages, printType);

  // 3) Liberar UI para la siguiente orden.
  // 4) Feedback: si popupBloqueado → link inline al blobURL; si no → "Guardando…".
};
```

**Por qué el paso 2 va SIEMPRE e independiente del paso 1:** el PDF ya se generó; la impresión debe registrarse en trazabilidad sin importar si el navegador dejó abrir la pestaña. Ver §9 (historia del bug).

---

## 8. Validación de STATUS (bloqueo de impresión)

En `fetchOrderData` (PrintLogic.gs L211+):
- Si `STATUS` ∈ {`RecibidaQA`, `DevueltaQA`, `Cerrada`} → impresión bloqueada.
- Resuelve rol del usuario. Si `rol === 'ADMIN'` → **bypass** (permite, añade advertencia `STATUS_WARNING`, lo loguea). STANDARD/QA → `STATUS_BLOCKED` (retorna error, no imprime).

---

## 9. Historia del bug (para NO reintroducirlo)

En julio 2026 el modal empezó a colgarse / fallar. La cadena de causas y correcciones:

| # | Síntoma | Causa real | Corrección |
|---|---|---|---|
| 1 | El PDF se abría pero **no se guardaba** en Drive ni se actualizaba el consecutivo | `if (!newWindow \|\| newWindow.closed \|\| typeof newWindow.closed === 'undefined')` daba **falso positivo** cross-origin y hacía `return`, saltándose `processAndSavePdfBackgroundForUser` | Detectar bloqueo **solo** por `window.open()===null`; disparar el guardado **siempre** |
| 2 | "No se pudo obtener el PDF de la plantilla … (DOC_ORDENES)" | Se clasificaba estática = `type !== 'Dynamic'` (valor inexistente); `DOC_ORDENES`/`DOC_ANALISIS` (Type=`Folder`) se trataban como estáticas y se intentaba bajarlas con un ID de carpeta | Estática = `type === 'Estatica'`; las Dinamica van al payload |
| 3 | Modal colgado / `SyntaxError` en `document.write` | Intentos previos de "arreglar" añadieron un `<script>` inline en el `<head>`, carga async de pdf-lib, watchdog y overlay que rompían el arranque | Se reconstruyó `Index.html` sobre la última versión buena y se re-aplicó **solo** la precarga estática |
| — | (medida preventiva) | Sin `<meta charset>`, GAS puede corromper acentos/emojis al reinyectar el HTML | Añadido `<meta charset="UTF-8">` como primer elemento del `<head>` |

**Lección general:** el `document.write` que aparece en el stack trace (`userCodeAppPanel`, `mae_html_user_bin...js`) es **de Google**, no nuestro. `node --check`/jsdom leen UTF-8 por defecto y no reproducen problemas de encoding del navegador. Ante un cuelgue, comparar contra la última versión buena (`git`) en lugar de parchear a ciegas.

---

## 10. Contrato de las funciones servidor (referencia rápida)

| Función (pública) | Firma | Devuelve |
|---|---|---|
| `getInitialData()` | — | `{templates, users, webAppUrl, activeEmail, savedProfileIdx}` |
| `getStaticTemplateBase64(key, fileId)` | key, fileId | `base64` (string) |
| `fetchOrderData(orderNo)` | orderNo | `{status, ready, orderNo, noAnalisis, formData, coords, pdfs, errors}` |
| `saveUserProfileSelection(idx)` | idx | — (cachea 6h) |
| `processAndSavePdfBackgroundForUser(base64, orderNo, userId, totalPages, printType)` | … | `true` / lanza error |

Todos los wrappers `*ForUser` validan `isUserAuthorized(userId)` y lanzan `ACCESS_DENIED` si falla.
