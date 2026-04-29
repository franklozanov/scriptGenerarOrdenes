# 🚀 Guía de Despliegue - Cloud Function de Compresión PDF

## Requisitos Previos

1. **Cuenta de Google Cloud** (gratis)
2. **Google Cloud SDK** instalado
3. **Proyecto de Google Cloud** creado

---

## 📋 Paso a Paso de Despliegue

### 1. Instalar Google Cloud SDK

**Windows:**
```powershell
# Descargar instalador desde:
# https://cloud.google.com/sdk/docs/install

# O usar PowerShell:
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

### 2. Inicializar Google Cloud SDK

```powershell
# Abrir PowerShell y ejecutar:
gcloud init

# Seleccionar o crear proyecto
# Ejemplo: proyecto-qms-pdf-compression
```

### 3. Habilitar APIs Necesarias

```powershell
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
```

### 4. Desplegar Cloud Function

```powershell
# Navegar a la carpeta cloud-function
cd "c:\Users\hacal022\Documents\ProyectoQMS\scriptGenerarOrdenes\cloud-function"

# Desplegar función (Gen 2 - más rápida y barata)
gcloud functions deploy compress-pdf `
  --gen2 `
  --runtime=python311 `
  --region=us-central1 `
  --source=. `
  --entry-point=compress_pdf `
  --trigger-http `
  --allow-unauthenticated `
  --memory=512MB `
  --timeout=60s `
  --max-instances=10
```

**Nota:** El despliegue toma 2-3 minutos la primera vez.

### 5. Obtener URL de la Función

Después del despliegue, verás algo como:

```
httpsTrigger:
  url: https://us-central1-tu-proyecto.cloudfunctions.net/compress-pdf
```

**Copia esta URL** - la necesitarás para configurar Apps Script.

---

## ⚙️ Configuración en Apps Script

1. Abre tu archivo `Code.gs`
2. Busca la línea donde se define `CLOUD_FUNCTION_URL`
3. Pega la URL de tu Cloud Function

```javascript
var CLOUD_FUNCTION_URL = 'https://us-central1-tu-proyecto.cloudfunctions.net/compress-pdf';
```

---

## 💰 Costos (Plan Gratuito)

**Límites Gratuitos Mensuales:**
- ✅ 2,000,000 invocaciones
- ✅ 400,000 GB-segundos
- ✅ 200,000 GHz-segundos

**Para tu caso:**
- ~50-100 impresiones/día = 1,500-3,000/mes
- **100% GRATIS** (muy por debajo del límite)

---

## 🧪 Probar la Función

```powershell
# Probar localmente antes de desplegar
cd cloud-function
pip install -r requirements.txt
functions-framework --target=compress_pdf --debug
```

Luego en otro terminal:

```powershell
# Enviar PDF de prueba
curl -X POST http://localhost:8080 `
  -H "Content-Type: application/json" `
  -d '{"pdf_base64":"JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+Pj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDY0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoyMDQKJSVFT0YK"}'
```

---

## 🔧 Comandos Útiles

```powershell
# Ver logs de la función
gcloud functions logs read compress-pdf --gen2 --region=us-central1 --limit=50

# Ver detalles de la función
gcloud functions describe compress-pdf --gen2 --region=us-central1

# Actualizar función después de cambios
gcloud functions deploy compress-pdf --gen2 --runtime=python311 --region=us-central1 --source=. --entry-point=compress_pdf --trigger-http --allow-unauthenticated

# Eliminar función (si es necesario)
gcloud functions delete compress-pdf --gen2 --region=us-central1
```

---

## ⚠️ Solución de Problemas

### Error: "Ghostscript not found"

La imagen de Cloud Functions Gen2 ya incluye Ghostscript. Si falla, agrega al `requirements.txt`:

```
ghostscript==10.0.0
```

### Error: "Permission denied"

Asegúrate de que la función esté configurada como `--allow-unauthenticated`

### Error: "Timeout"

Aumenta el timeout:

```powershell
--timeout=120s
```

---

## ✅ Verificación de Despliegue Exitoso

Después del despliegue, deberías ver:

```
✓ Deploying function (may take a while - up to 2 minutes)...done.
✓ Function is ready to serve requests.
```

**¡Listo!** Ahora copia la URL y configúrala en Apps Script.
