# 📐 Reglas del Sistema de Diseño - scriptGenerarOrdenes

**Versión:** 1.0  
**Última actualización:** Mayo 2026  
**Propósito:** Guía obligatoria para mantener consistencia en el diseño UI de todos los modales y componentes HTML.

> ⚠️ **IMPORTANTE:** Este documento está vinculado a la memoria del sistema de IA. Cualquier cambio de UI debe consultar primero este documento. La memoria del sistema recordará automáticamente estas reglas en futuras sesiones.

---

## 🎯 Principio Fundamental

> **TODA la UI debe venir de Theme.html. Si un componente no existe, créalo en Theme.html, NO en archivos individuales.**

---

## 📋 Reglas Obligatorias

### **Regla #1: Centralización de Estilos**

✅ **CORRECTO:**
```html
<!-- En Theme.html -->
<style>
  .btn-primary {
    background: #1976d2;
    color: white;
    padding: 10px 20px;
  }
</style>

<!-- En cualquier modal -->
<button class="btn-primary">Guardar</button>
```

❌ **INCORRECTO:**
```html
<!-- En UploadCentralModal.html -->
<style>
  .mi-boton-especial {
    background: #1976d2;
    color: white;
  }
</style>
```

### **Regla #2: Jerarquía de Estilos**

```
Theme.html (Estilos base y componentes)
    ↓
Modal Individual (Solo overrides específicos)
```

**Estilos que DEBEN estar en Theme.html:**
- ✅ Estilos de `html`, `body`
- ✅ Reset CSS
- ✅ Tipografía base
- ✅ Colores (paleta completa)
- ✅ Botones (todos los tipos)
- ✅ Inputs y formularios
- ✅ Contenedores (`.container`, `.card`)
- ✅ Utilidades (spacing, layout)
- ✅ Componentes reutilizables

**Estilos que PUEDEN estar en modales individuales:**
- ✅ Layouts específicos del modal
- ✅ Componentes únicos de ese modal
- ✅ Overrides de color de fondo específicos

### **Regla #3: Antes de Crear un Estilo**

**Checklist obligatorio:**

1. ✅ ¿Este estilo se usará en más de un modal? → **Theme.html**
2. ✅ ¿Es un componente UI estándar (botón, input, card)? → **Theme.html**
3. ✅ ¿Afecta a `html`, `body`, o elementos base? → **Theme.html**
4. ✅ ¿Es un color, fuente, o espaciado? → **Theme.html**
5. ✅ ¿Es completamente único de este modal? → **Modal individual**

---

## 🎨 Paleta de Colores Centralizada

**SIEMPRE usar variables CSS definidas en Theme.html:**

```css
/* En Theme.html */
:root {
  /* Colores primarios */
  --color-primary: #1976d2;
  --color-primary-dark: #1565c0;
  --color-primary-light: #42a5f5;
  
  /* Colores de estado */
  --color-success: #4caf50;
  --color-warning: #ff9800;
  --color-error: #f44336;
  --color-info: #2196f3;
  
  /* Grises */
  --color-gray-50: #fafafa;
  --color-gray-100: #f5f5f5;
  --color-gray-200: #eeeeee;
  --color-gray-300: #e0e0e0;
  --color-gray-400: #bdbdbd;
  --color-gray-500: #9e9e9e;
  --color-gray-600: #757575;
  --color-gray-700: #616161;
  --color-gray-800: #424242;
  --color-gray-900: #212121;
  
  /* Texto */
  --color-text-primary: #212121;
  --color-text-secondary: #757575;
  --color-text-disabled: #bdbdbd;
}
```

**Uso:**
```css
.mi-componente {
  background: var(--color-primary);
  color: white;
}
```

---

## 🔘 Componentes de Botones

**Tipos de botones definidos en Theme.html:**

```css
/* Botón primario */
.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-dark);
}

/* Botón secundario */
.btn-secondary {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
}

/* Botón de peligro */
.btn-danger {
  background: var(--color-error);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
}

/* Botón deshabilitado */
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Uso en modales:**
```html
<button class="btn-primary">Guardar</button>
<button class="btn-secondary">Cancelar</button>
<button class="btn-danger">Eliminar</button>
```

---

## 📝 Componentes de Formularios

**Inputs, selects, y labels estandarizados:**

```css
/* En Theme.html */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 14px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
```

---

## 📦 Contenedores y Layout

**Componentes de contenedor:**

```css
/* Contenedor principal */
.container {
  background: white;
  border-radius: 8px;
  padding: 20px;
  width: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Card elevado */
.card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Sección con título */
.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--color-gray-200);
}
```

---

## 📏 Sistema de Espaciado

**Utilidades de spacing (margin y padding):**

```css
/* Margins */
.m-0 { margin: 0; }
.m-1 { margin: 4px; }
.m-2 { margin: 8px; }
.m-3 { margin: 16px; }
.m-4 { margin: 24px; }
.m-5 { margin: 32px; }

.mt-1 { margin-top: 4px; }
.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 16px; }
/* ... etc para mb, ml, mr */

/* Paddings */
.p-0 { padding: 0; }
.p-1 { padding: 4px; }
.p-2 { padding: 8px; }
.p-3 { padding: 16px; }
.p-4 { padding: 24px; }
.p-5 { padding: 32px; }
```

---

## 🎭 Estados Visuales

**Componentes de estado (loading, error, success):**

```css
/* Spinner de carga */
.spinner {
  border: 3px solid var(--color-gray-200);
  border-top: 3px solid var(--color-primary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Mensajes de estado */
.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.alert-success {
  background: #e8f5e9;
  color: #2e7d32;
  border-left: 4px solid var(--color-success);
}

.alert-error {
  background: #ffebee;
  color: #c62828;
  border-left: 4px solid var(--color-error);
}

.alert-warning {
  background: #fff3e0;
  color: #e65100;
  border-left: 4px solid var(--color-warning);
}

.alert-info {
  background: #e3f2fd;
  color: #1565c0;
  border-left: 4px solid var(--color-info);
}
```

---

## 📱 Responsive Design

**Breakpoints estándar:**

```css
/* Mobile first approach */
@media (min-width: 640px) {
  /* Tablet */
}

@media (min-width: 1024px) {
  /* Desktop */
}

@media (min-width: 1280px) {
  /* Large desktop */
}
```

---

## 🔧 Proceso de Implementación

### **Flujo de Trabajo Obligatorio:**

```
1. Necesitas un componente UI
   ↓
2. ¿Existe en Theme.html?
   ├── SÍ → Usar el componente existente
   └── NO → Continuar al paso 3
   ↓
3. ¿Es reutilizable o estándar?
   ├── SÍ → Crear en Theme.html
   └── NO → Crear en modal individual
   ↓
4. Documentar en este archivo
   ↓
5. Implementar en el modal
```

### **Ejemplo Práctico:**

**Necesitas un botón de "Subir Todo":**

1. ✅ Revisar Theme.html → ¿Existe `.btn-primary`?
2. ✅ Sí existe → Usar `<button class="btn-primary">Subir Todo</button>`
3. ✅ No crear estilos nuevos en el modal

**Necesitas un badge de estado:**

1. ✅ Revisar Theme.html → ¿Existe `.badge`?
2. ❌ No existe → Crear en Theme.html:
```css
.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.badge-success {
  background: var(--color-success);
  color: white;
}
```
3. ✅ Documentar en este archivo
4. ✅ Usar en el modal: `<span class="badge badge-success">Activo</span>`

---

## 📚 Estructura de Archivos

```
scriptGenerarOrdenes/
├── Theme.html                    ← ÚNICA fuente de verdad para UI
├── GlobalScripts.html            ← Scripts compartidos
├── UploadCentralModal.html       ← Solo estilos específicos
├── ModalRegistroNovedad.html     ← Solo estilos específicos
├── Index.html                    ← Solo estilos específicos
├── PDFViewer.html                ← Solo estilos específicos
└── DESIGN_SYSTEM_RULES.md        ← Este documento
```

---

## ✅ Checklist de Revisión

Antes de hacer commit de cambios UI, verificar:

- [ ] ¿Los estilos base están en Theme.html?
- [ ] ¿Los colores usan variables CSS?
- [ ] ¿Los botones usan clases estándar?
- [ ] ¿Los formularios usan `.form-group`?
- [ ] ¿No hay duplicación de estilos?
- [ ] ¿Los nuevos componentes están documentados?
- [ ] ¿El código sigue el principio DRY?

---

## 🚫 Anti-Patrones Comunes

### ❌ **NO HACER:**

```html
<!-- En UploadCentralModal.html -->
<style>
  body {
    padding: 20px;
    overflow-y: auto;
  }
  
  .my-button {
    background: #1976d2;
    color: white;
  }
</style>
```

### ✅ **HACER:**

```html
<!-- En Theme.html - una sola vez -->
<style>
  body {
    padding: 20px;
    overflow-y: auto;
  }
  
  .btn-primary {
    background: var(--color-primary);
    color: white;
  }
</style>

<!-- En UploadCentralModal.html - usar componentes -->
<button class="btn-primary">Mi Botón</button>
```

---

## 📖 Referencias Rápidas

### **Incluir Theme.html en un modal:**
```html
<?!= HtmlService.createHtmlOutputFromFile('Theme').getContent(); ?>
```

### **Incluir GlobalScripts.html en un modal:**
```html
<?!= HtmlService.createHtmlOutputFromFile('GlobalScripts').getContent(); ?>
```

### **Estructura básica de un modal:**
```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <title>Mi Modal</title>
  
  <!-- FASE 6: Design System Centralizado -->
  <?!= HtmlService.createHtmlOutputFromFile('Theme').getContent(); ?>
  
  <style>
    /* SOLO estilos específicos de este modal */
  </style>
</head>
<body>
  <div class="container">
    <!-- Contenido -->
  </div>
  
  <?!= HtmlService.createHtmlOutputFromFile('GlobalScripts').getContent(); ?>
</body>
</html>
```

---

## 🎓 Principios de Diseño

1. **Consistencia** - Todos los modales deben verse y comportarse igual
2. **Reutilización** - No reinventar la rueda, usar componentes existentes
3. **Mantenibilidad** - Un cambio en Theme.html afecta a todos
4. **Escalabilidad** - Fácil agregar nuevos modales
5. **Accesibilidad** - Colores con contraste adecuado, focus visible

---

## 📞 Contacto y Soporte

**Antes de implementar cambios UI:**
1. Consultar este documento
2. Revisar Theme.html
3. Verificar que no exista el componente
4. Crear en Theme.html si es reutilizable
5. Documentar el nuevo componente aquí

---

## 🧠 Integración con Memoria del Sistema

Este documento está vinculado a la **memoria permanente del sistema de IA** (Cascade/Windsurf).

### **Cómo Funciona:**

1. **Memoria Automática:** El sistema de IA tiene una memoria que recuerda estas reglas en todas las sesiones futuras
2. **Consulta Obligatoria:** Antes de cualquier cambio UI, el sistema consultará automáticamente este documento
3. **Validación:** El sistema verificará que los cambios cumplan con las reglas establecidas
4. **Recordatorio:** Si se intenta crear estilos duplicados, el sistema recordará usar Theme.html

### **Beneficios:**

- ✅ Consistencia garantizada en todas las sesiones
- ✅ No se olvidan las reglas entre sesiones
- ✅ Validación automática de cambios UI
- ✅ Recordatorios proactivos al desarrollar

### **Actualización de la Memoria:**

Si se actualiza este documento, la memoria del sistema debe actualizarse también:

```
1. Modificar DESIGN_SYSTEM_RULES.md
2. Actualizar la memoria del sistema con los cambios
3. Verificar que ambos estén sincronizados
```

### **Ubicación de la Memoria:**

- **ID de Memoria:** `26aeee41-546e-4b7c-9f71-a73ba9eb44fc`
- **Tags:** `design_system`, `ui_rules`, `mandatory`, `theme`, `css`, `standards`, `documentation`
- **Tipo:** Memoria permanente del sistema

---

**Última actualización:** Mayo 2026  
**Mantenido por:** Equipo de Desarrollo QMS  
**Memoria del Sistema:** Activa y sincronizada ✅
