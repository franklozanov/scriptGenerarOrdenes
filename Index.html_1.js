
      let globalTemplates = [];
      let preloadedStaticPdfs = {}; // Store preloaded static template base64 strings
      let preloadState = { orderNo: null, status: 'idle', data: null, pdfsByKey: {}, errors: [] }; // Background preloading state

      // Función debounce() ahora viene de GlobalScripts.html

      function setPreloadBanner(type, message) {
        const banner = document.getElementById('preloadBanner');
        if (!banner) return;
        if (!message) {
          banner.className = 'preload-banner';
          banner.innerHTML = '';
          return;
        }
        banner.className = 'preload-banner ' + type;
        banner.innerHTML = message;
      }

      function resetPreloadState() {
        preloadState = { orderNo: null, status: 'idle', data: null, pdfsByKey: {}, errors: [] };
        updateGoButtonState();
      }

      function buildPdfsByKey(pdfs) {
        const pdfsByKey = {};
        (pdfs || []).forEach(pdf => {
          pdfsByKey[pdf.key] = pdf;
        });
        return pdfsByKey;
      }

      function isPreloadReadyForOrder(orderNo) {
        return preloadState.orderNo === orderNo &&
          preloadState.status === 'ready' &&
          preloadState.data &&
          preloadState.pdfsByKey.DOC_ORDENES &&
          preloadState.pdfsByKey.DOC_ANALISIS;
      }

      function renderPreloadResult(response) {
        if (response.ready) {
          setPreloadBanner('success', '✅ DOC_ORDENES listo.<br>✅ DOC_ANALISIS listo.<br>✅ Documentos listos para impresión.');
          updateGoButtonState();
          return;
        }
        const messages = (response.errors || []).map(err => '⚠️ ' + err.message);
        setPreloadBanner('error', messages.join('<br>') || '⚠️ No fue posible preparar los documentos dinámicos.');
        updateGoButtonState();
      }

      function hasAnyCopiesSelected() {
        return globalTemplates.some(t => {
          const input = document.getElementById('val_' + t.key);
          return input && (parseInt(input.value) || 0) > 0;
        });
      }

      function isUserSelectionValid() {
        const userNameInput = document.getElementById('userName');
        if (!userNameInput || !window.QMSContext.users) return false;
        const val = userNameInput.value.trim();
        if (!val) return false;
        return window.QMSContext.users.some(u => u.nombreCompleto === val);
      }

      function updateGoButtonState() {
        const btn = document.getElementById('goBtn');
        const orderInput = document.getElementById('orderNo');
        const status = document.getElementById('status');
        if (!btn || !orderInput) return;
        
        const isOrderReady = isPreloadReadyForOrder(orderInput.value.trim());
        const isUserValid = isUserSelectionValid();
        const hasCopies = hasAnyCopiesSelected();
        
        const isEnabled = isOrderReady && isUserValid && hasCopies;
        btn.disabled = !isEnabled;

        // Feedback visual si el orden está listo pero el botón sigue bloqueado
        if (isOrderReady && !isEnabled && !status.innerText.includes("Impresión registrada")) {
          if (!isUserValid) {
            status.innerText = "⚠️ Seleccione un usuario válido de la lista";
            status.className = "error-text";
          } else if (!hasCopies) {
            status.innerText = "⚠️ Seleccione al menos 1 copia para imprimir";
            status.className = "error-text";
          }
        } else if (isOrderReady && isEnabled && status.innerText.includes("⚠️")) {
          // Limpiar aviso si ya todo está correcto
          status.innerText = "✅ Documentos listos para impresión";
          status.className = "success-text";
        }
      }

      // Background preloading function
      function preloadOrderData(orderNo) {
        const currentOrderNo = orderNo.trim();
        if (!currentOrderNo) {
          resetPreloadState();
          setPreloadBanner('', '');
          return;
        }
        
        // If already fetching for this order, don't start another request
        if (preloadState.status === 'loading' && preloadState.orderNo === currentOrderNo) {
          return;
        }
        
        // If already loaded for this order, no need to fetch again
        if (isPreloadReadyForOrder(currentOrderNo)) {
          return;
        }
        
        // Start fetching
        preloadState.orderNo = currentOrderNo;
        preloadState.status = 'loading';
        preloadState.data = null;
        preloadState.pdfsByKey = {};
        preloadState.errors = [];
        updateGoButtonState();
        
        // Show subtle status message
        const status = document.getElementById('status');
        setPreloadBanner('info', '🔍 Buscando documentos de la orden...');
        if (status && !status.innerText.includes("Impresión registrada")) {
          status.innerText = "🔍 Buscando datos de la orden...";
          status.className = "info-text";
        }
        
        google.script.run
          .withSuccessHandler(response => {
            // Race condition control: only accept response if it matches current orderNo
            const currentInput = document.getElementById('orderNo').value.trim();
            if (currentInput !== currentOrderNo) {
              console.log(`⚠️ Descartando respuesta obsoleta para orden ${currentOrderNo} (actual: ${currentInput})`);
              return;
            }

            preloadState.status = response.ready ? 'ready' : 'error';
            preloadState.data = response;
            preloadState.pdfsByKey = buildPdfsByKey(response.pdfs);
            preloadState.errors = response.errors || [];

            console.log(`✓ Datos precargados para orden ${currentOrderNo}, STATUS: ${response.orderStatus}`);
            renderPreloadResult(response);

            // --- LÓGICA DE BLOQUEO DE IMPRESIÓN SEGÚN STATUS ---
            const goBtn = document.getElementById('goBtn');
            const panelSolicitudExtra = document.getElementById('panelSolicitudExtra');

            // --- VERIFICAR SI HAY SOLICITUD APROBADA (DESBLOQUEO CONDICIONAL) ---
            if (response.approvedRequest && response.approvedRequest.id) {
              // Solicitud aprobada: ignorar bloqueo de orden "Impresa", permitir impresión autorizada
              goBtn.style.display = 'block';
              goBtn.disabled = false;
              panelSolicitudExtra.style.display = 'none';
              setPreloadBanner('success', '✅ Solicitud ' + response.approvedRequest.id + ' Aprobada. Proceda con la impresión autorizada.');

              // Parsear JSON de plantillas aprobadas
              let plantillasAprobadas = [];
              try {
                plantillasAprobadas = JSON.parse(response.approvedRequest.plantillas);
              } catch (e) {
                console.error('Error parseando plantillas aprobadas:', e);
                plantillasAprobadas = [];
              }

              // Deshabilitar todos los inputs de plantillas y botones +/-
              globalTemplates.forEach(t => {
                const input = document.getElementById('val_' + t.key);
                const btnMinus = document.querySelector(`button[onclick="decrementCounter('${t.key}', false)"]`);
                const btnPlus = document.querySelector(`button[onclick="incrementCounter('${t.key}', false)"]`);

                if (input) {
                  input.value = '0';
                  input.disabled = true;
                }
                if (btnMinus) btnMinus.disabled = true;
                if (btnPlus) btnPlus.disabled = true;
              });

              // Inyectar cantidades aprobadas en los inputs correspondientes
              plantillasAprobadas.forEach(t => {
                const input = document.getElementById('val_' + t.key);
                if (input && t.copies > 0) {
                  input.value = t.copies;
                  console.log(`✓ Plantilla ${t.key} autorizada con ${t.copies} copia(s)`);
                }
              });

              console.log(`✓ Orden ${currentOrderNo} con solicitud aprobada ${response.approvedRequest.id} - Desbloqueo condicional activado`);
              updateGoButtonState();
            } else if (response.orderStatus === 'Impreso' || response.orderStatus === 'Reimpreso') {
              // Orden ya impresa sin aprobación: bloquear impresión normal, mostrar solicitud extraordinaria
              goBtn.style.display = 'none';
              goBtn.disabled = true;
              panelSolicitudExtra.style.display = 'block';
              console.log(`🔒 Orden ${currentOrderNo} con STATUS '${response.orderStatus}' - Bloqueando impresión libre`);
            } else if (response.orderStatus === 'Autorizada') {
              // Orden autorizada: permitir impresión normal
              goBtn.style.display = 'block';
              panelSolicitudExtra.style.display = 'none';
              console.log(`✓ Orden ${currentOrderNo} con STATUS 'Autorizada' - Permitiendo impresión`);
            } else {
              // Otros estados: mantener comportamiento por defecto
              goBtn.style.display = 'block';
              panelSolicitudExtra.style.display = 'none';
            }

            // Update status to show data is ready
            if (status && !status.innerText.includes("Impresión registrada")) {
              status.innerText = response.ready ? "✅ Documentos listos para impresión" : "⚠️ Faltan documentos requeridos";
              status.className = response.ready ? "success-text" : "error-text";
            }
          })
          .withFailureHandler(error => {
            // Race condition control: only accept error if it matches current orderNo
            const currentInput = document.getElementById('orderNo').value.trim();
            if (currentInput !== currentOrderNo) {
              console.log(`⚠️ Descartando error obsoleto para orden ${currentOrderNo} (actual: ${currentInput})`);
              return;
            }
            
            preloadState.status = 'error';
            preloadState.data = null;
            preloadState.pdfsByKey = {};
            preloadState.errors = [{ key: 'server', message: error.message }];
            updateGoButtonState();
            
            console.error(`Error precargando orden ${currentOrderNo}:`, error.message);
            setPreloadBanner('error', `⚠️ Error: ${error.message}`);
            
            // Show error in status
            if (status) {
              status.innerText = `⚠️ Error: ${error.message}`;
              status.className = "error-text";
            }
          })
          .fetchOrderData(currentOrderNo);
      }

      // Counter control functions
      function decrementCounter(key, noAccess) {
        if (noAccess) return;
        const input = document.getElementById('val_' + key);
        let value = parseInt(input.value) || 0;
        if (value > 0) {
          input.value = value - 1;
        }
        updateGoButtonState();
      }

      function incrementCounter(key, noAccess) {
        if (noAccess) return;
        const input = document.getElementById('val_' + key);
        let value = parseInt(input.value) || 0;
        if (value < 999) {
          input.value = value + 1;
        }
        updateGoButtonState();
      }

      function zeroAllCopies() {
        const inputs = document.querySelectorAll('#tplList .counter-input');
        inputs.forEach(input => {
          if (!input.disabled) {
            input.value = "0";
          }
        });
        updateGoButtonState();
      }

      function validateCounter(input) {
        // Permitir que el campo esté temporalmente vacío mientras se borra/escribe
        if (input.value === '') {
          updateGoButtonState();
          return;
        }
        
        let value = parseInt(input.value);
        if (isNaN(value)) {
          input.value = ''; // Borra caracteres no numéricos
          updateGoButtonState();
          return;
        }
        
        if (value < 0) {
          value = 0;
        } else if (value > 999) {
          value = 999;
        }
        input.value = value;
        updateGoButtonState();
      }

      function buildPayloadFromPreload(config) {
        const pdfs = [];
        config.forEach(cfg => {
          if (cfg.key === "DOC_ORDENES" || cfg.key === "DOC_ANALISIS") {
            const dynamicPdf = preloadState.pdfsByKey[cfg.key];
            if (!dynamicPdf) {
              throw new Error(`Falta el archivo para ${cfg.key}.`);
            }
            pdfs.push({
              key: cfg.key,
              base64: dynamicPdf.base64,
              copies: cfg.copies
            });
          }
        });

        return {
          formData: preloadState.data.formData,
          coords: preloadState.data.coords,
          pdfs: pdfs
        };
      }

      function gsRun(fnName, args) {
        return new Promise((resolve, reject) => {
          let runner = google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(e => reject(new Error(e.message || String(e))));
          runner[fnName].apply(runner, args);
        });
      }

      function saveFinalUnifiedPdfAsync(base64Data, orderNo, userId) {
        if (!userId) return Promise.reject(new Error("No se pudo identificar el UserID del usuario seleccionado."));
        return gsRun('saveFinalUnifiedPDFForUser', [base64Data, orderNo, userId]);
      }

      function updateTraceabilityAsync(orderNo, userId, totalPages, printType) {
        if (!userId) return Promise.reject(new Error("No se pudo identificar el UserID del usuario seleccionado."));
        return gsRun('updateTraceabilityForUser', [orderNo, userId, totalPages, printType]);
      }

      function finalizeFinalPdfPostSaveAsync(orderNo, fileId, archivoReemplazado, userId) {
        if (!userId) return Promise.reject(new Error("No se pudo identificar el UserID del usuario seleccionado."));
        return gsRun('finalizeFinalPdfForUser', [orderNo, fileId, archivoReemplazado, userId]);
      }

      // Transacción atómica: genera el PDF, avanza el contador y registra trazabilidad en una
      // sola llamada de servidor (reemplaza save + finalize + updateTraceability por separado).
      function processPrintAsync(base64Data, orderNo, userId, printType, totalPages) {
        if (!userId) return Promise.reject(new Error("No se pudo identificar el UserID del usuario seleccionado."));
        return gsRun('processPrintForUser', [base64Data, orderNo, userId, printType, totalPages]);
      }

      function uint8ArrayToBase64(bytes) {
        const chunkSize = 0x8000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      }

      function openSavedPdfPreview(saveResult) {
        const viewerUrl = saveResult.viewerUrl
          || ('https://drive.google.com/file/d/' + saveResult.fileId + '/view');
        const opened = window.open(viewerUrl, '_blank');
        if (!opened) {
          throw new Error('POPUP_BLOCKED:' + viewerUrl);
        }
      }

      window.onload = () => {
        // Inyección de variables de servidor para carga instantánea
        var serverInitialData = null;
        var serverOrdenesValidas = null;
        <? try { ?>
          serverInitialData = <?!= typeof initialData !== 'undefined' ? initialData : 'null' ?>;
        <? } catch(e) {} ?>
        <? try { ?>
          serverOrdenesValidas = <?!= typeof ordenesValidas !== 'undefined' ? ordenesValidas : 'null' ?>;
        <? } catch(e) {} ?>

        function processInitialData(data) {
          console.log('🚀 Inicializando modal - data recibida:', data);
          globalTemplates = data.templates;

          // Store preloaded static template base64 strings in memory
          data.templates.forEach(t => {
            if (t.base64) {
              preloadedStaticPdfs[t.key] = t.base64;
              console.log(`✓ Precargada en memoria: ${t.key}`);
            }
          });

          document.getElementById('tplList').innerHTML = data.templates.map(t => {
            let defVal = "1"; // Valor por defecto general
            if (t.key === "TPL_ESTUCHADO" || t.key === "TPL_TERMO") {
              defVal = "0";
            } else if (t.key === "TPL_CONTROLES") {
              defVal = "2";
            }
            
            const noAccess = t.hasAccess === false;
            const rowStyle = noAccess ? 'opacity: 0.5;' : '';
            const nameStyle = noAccess ? 'color: #dc2626; font-style: italic;' : '';
            return `
              <div class="tpl-row" style="${rowStyle}">
                <span class="tpl-name" title="${t.description ? t.description : t.name}" style="${nameStyle}">${t.name}</span>
                <div class="counter-control">
                  <button type="button" class="counter-btn" tabindex="-1" onclick="decrementCounter('${t.key}', ${noAccess})" ${noAccess ? 'disabled' : ''}>−</button>
                  <input type="text" class="counter-input" id="val_${t.key}" value="${defVal}" maxlength="3" ${noAccess ? 'disabled' : ''} oninput="validateCounter(this)">
                  <button type="button" class="counter-btn" tabindex="-1" onclick="incrementCounter('${t.key}', ${noAccess})" ${noAccess ? 'disabled' : ''}>+</button>
                </div>
              </div>
            `;
          }).join('');

          // Guardar usuarios globalmente para acceder después
          window.QMSContext.users = data.users;
          
          // Inicializar URL de la WebApp para peticiones Fetch
          if (data && data.webAppUrl) {
            window.QMSContext.webAppUrl = data.webAppUrl;
          }
          document.getElementById('usersList').innerHTML = data.users.map(u => `<option value="${u.nombreCompleto}">`).join('');
          document.getElementById('userName').addEventListener('input', updateGoButtonState);

          const noAccessCount = data.templates.filter(t => t.hasAccess === false).length;
          if (noAccessCount > 0) {
            const status = document.getElementById('status');
            status.innerHTML = `⚠️ ${noAccessCount} plantilla(s) sin acceso. Use el menú "Diagnosticar Plantillas" para más detalles.`;
            status.className = "error-text";
          }

          document.getElementById('loader').style.display = 'none';
          updateGoButtonState();

          // Add event listener for background preloading on orderNo input
          const orderNoInput = document.getElementById('orderNo');
          const debouncedPreload = debounce((value) => {
            if (value.trim().length >= 3) { // Only preload if at least 3 characters
              preloadOrderData(value);
            } else {
              resetPreloadState();
              setPreloadBanner('', '');
            }
          }, 600);

          orderNoInput.addEventListener('input', (e) => {
            if (preloadState.orderNo && preloadState.orderNo !== e.target.value.trim()) {
              resetPreloadState();
              setPreloadBanner('', '');
            }
            updateGoButtonState();
            debouncedPreload(e.target.value);
          });

          orderNoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('goBtn').click();
            }
          });
        }

        if (serverInitialData) {
          // Carga ultrarrápida (0 segs)
          processInitialData(serverInitialData);
          if (serverOrdenesValidas) {
            populateOrdenesList(serverOrdenesValidas);
          } else {
            // Fallback para las órdenes
            google.script.run
              .withSuccessHandler(populateOrdenesList)
              .withFailureHandler(e => console.error('Error cargando órdenes válidas:', e.message))
              .getOrdenesValidasParaImpresion();
          }
        } else {
          // Fallback a carga tradicional con google.script.run
          google.script.run.withSuccessHandler(data => {
            processInitialData(data);
            
            // Cargar lista de órdenes válidas para impresión (sin caché)
            google.script.run
              .withSuccessHandler(populateOrdenesList)
              .withFailureHandler(e => console.error('Error cargando órdenes válidas:', e.message))
              .getOrdenesValidasParaImpresion();

          }).withFailureHandler(e => {
            document.getElementById('loader').innerHTML = `<span class="error-text">Error al cargar: ${e.message}</span>`;
          }).getInitialData();
        }
      };

      function populateOrdenesList(ordenes) {
        const datalist = document.getElementById('ordenesList');
        if (!datalist) return;

        datalist.innerHTML = '';

        if (!ordenes || ordenes.length === 0) {
          console.log('No hay órdenes válidas para mostrar en datalist');
          return;
        }

        ordenes.forEach(orden => {
          const option = document.createElement('option');
          option.value = orden.noOrden;
          option.textContent = orden.label;
          datalist.appendChild(option);
        });

        console.log(`✓ Datalist poblado con ${ordenes.length} órdenes válidas`);
      }

      // PDF generation processing function (extracted for reuse)
      async function processPdfGeneration(payload, config, orderNo, userName, userId, printType, btn, status) {
        try {
          status.innerText = "⏳ Paso 2/4: Preparando motor PDF...";

          // Merge dynamic templates from payload with preloaded static templates
          // Respect the original order and copies from config
          const staticTemplateKeys = ["TPL_CODIFICADO", "TPL_ESTUCHADO", "TPL_TERMO", "TPL_INSPECCION", "TPL_COC", "TPL_CONTROLES"];
          
          // Build the final pdfs array by iterating through config (which has correct order and copies)
          const finalPdfs = [];
          config.forEach(cfg => {
            if (staticTemplateKeys.includes(cfg.key)) {
              // Static template - use preloaded base64
              if (preloadedStaticPdfs[cfg.key]) {
                finalPdfs.push({
                  key: cfg.key,
                  base64: preloadedStaticPdfs[cfg.key],
                  copies: cfg.copies
                });
                console.log(`✓ Usando plantilla estática precargada: ${cfg.key}`);
              } else if (cfg.key === 'DOC_COMPLETO') {
                // DOC_COMPLETO es solo carpeta de destino, no plantilla - omitir
                console.log(`✓ Omitiendo DOC_COMPLETO (carpeta de destino)`);
              } else {
                throw new Error(`Falta el archivo para ${cfg.key}. Verifique que el PDF de la orden exista en la carpeta de Drive o que la orden tenga asignado un NoAnalisis válido.`);
              }
            } else {
              // Dynamic template - use from payload
              const dynamicPdf = payload.pdfs.find(p => p.key === cfg.key);
              if (dynamicPdf) {
                finalPdfs.push({
                  key: cfg.key,
                  base64: dynamicPdf.base64,
                  copies: cfg.copies
                });
                console.log(`✓ Usando plantilla dinámica del servidor: ${cfg.key}`);
              } else {
                throw new Error(`Falta el archivo para ${cfg.key}. Verifique que el PDF de la orden exista en la carpeta de Drive o que la orden tenga asignado un NoAnalisis válido.`);
              }
            }
          });
          
          // Replace payload.pdfs with the merged array
          payload.pdfs = finalPdfs;

          showPdfProgress('Generando Documentos', 'Paso 1: Iniciando motor PDF...', 10);
          await new Promise(r => setTimeout(r, 50)); // Yield para mostrar UI

          const { PDFDocument, rgb, degrees } = PDFLib;
          const finalPdf = await PDFDocument.create();
          
          // Configurar documento para máxima compatibilidad con impresoras
          finalPdf.setTitle('');
          finalPdf.setAuthor('');
          finalPdf.setSubject('');
          finalPdf.setKeywords([]);
          finalPdf.setProducer('');
          finalPdf.setCreator('Sistema QMS');
          
          let totalPages = 0;

          const now = new Date();
          const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          // Yield to unblock UI
          const yieldToMain = () => new Promise(r => setTimeout(r, 20));

          for (let itemIdx = 0; itemIdx < payload.pdfs.length; itemIdx++) {
            const item = payload.pdfs[itemIdx];
            let progressPct = 20 + (50 * (itemIdx / payload.pdfs.length));
            showPdfProgress('Combinando Plantillas', `Paso 2: Procesando ${item.key} (${itemIdx + 1}/${payload.pdfs.length})...`, progressPct);
            status.innerText = `⏳ Procesando ${item.key}...`;
            await yieldToMain();

            const bytes = Uint8Array.from(atob(item.base64), c => c.charCodeAt(0));
            for (let i = 0; i < item.copies; i++) {
              // Cargar PDF sin preservar objetos innecesarios
              const doc = await PDFDocument.load(bytes, { 
                ignoreEncryption: true,
                updateMetadata: false 
              });
              const pages = doc.getPages();

              if (item.key === "DOC_ORDENES") {
                const firstPage = pages[0];
                Object.keys(payload.coords).forEach(k => {
                  firstPage.drawText(payload.formData[k] || "", { 
                    x: payload.coords[k].x, 
                    y: payload.coords[k].y, 
                    size: 10, 
                    color: rgb(0,0,0),
                    opacity: 1.0  // Asegurar opacidad completa
                  });
                });
              } else if (item.key !== "DOC_ANALISIS") {
                try {
                  const form = doc.getForm();
                  Object.keys(payload.formData).forEach(k => { 
                    try { 
                      const field = form.getTextField(k);
                      field.setText(payload.formData[k]);
                      field.enableReadOnly();  // Marcar como solo lectura antes de aplanar
                    } catch(e){} 
                  });
                } catch(e) { 
                  console.log(`No hay formularios en ${item.key}`);
                }
              }
              
              // Eliminar metadatos innecesarios del documento fuente
              doc.setTitle('');
              doc.setAuthor('');
              doc.setSubject('');
              doc.setKeywords([]);
              doc.setProducer('');

              const copied = await finalPdf.copyPages(doc, doc.getPageIndices());
              copied.forEach(p => finalPdf.addPage(p));
              totalPages += copied.length;
              await yieldToMain();

              // --- AGREGAR PÁGINA EN BLANCO SI ESTA PLANTILLA TIENE NÚMERO IMPAR DE PÁGINAS ---
              console.log(`Plantilla: ${item.key}, Copia: ${i+1}, Páginas: ${copied.length}, Es impar: ${copied.length % 2 !== 0}`);
              if (copied.length % 2 !== 0) {
                const blankPage = finalPdf.addPage([612, 792]);
                const blankText = "Esta página fue dejada en blanco de manera intencional";
                const textWidth = blankText.length * 5.5;
                const pageWidth = blankPage.getWidth();
                const pageHeight = blankPage.getHeight();
                
                blankPage.drawText(blankText, {
                  x: (pageWidth - textWidth) / 2,
                  y: pageHeight / 2,
                  size: 11,
                  color: rgb(0.4, 0.4, 0.4),
                  opacity: 1.0
                });
                totalPages += 1;
                console.log(`✓ Página en blanco añadida después de ${item.key}`);
              }
            }
          }

          // --- INYECCIÓN DE PIE DE PÁGINA (Orientación Dinámica + Espacio Fijo) ---
          const allPages = finalPdf.getPages();

          showPdfProgress('Añadiendo Detalles', 'Paso 3: Añadiendo pie de página...', 75);
          status.innerText = "⏳ Añadiendo pie de página...";
          await yieldToMain();

          for (let pIdx = 0; pIdx < allPages.length; pIdx++) {
            const p = allPages[pIdx];
            
            // Unblock UI every 10 pages
            if (pIdx % 10 === 0) await yieldToMain();
            let { width, height } = p.getSize();
            let currentRotation = p.getRotation().angle || 0;

            if (width > height) {
              currentRotation = (currentRotation + 90) % 360;
              p.setRotation(degrees(currentRotation));

              const temp = width;
              width = height;
              height = temp;
            }

            // Extraer solo el nombre si viene con el formato "ID - Nombre"
            const nombreParaPie = userName.includes(" - ") ? userName.split(" - ")[1].trim() : userName;
            const footerLeftText = `Impreso por: ${nombreParaPie} el ${formattedDate}   |   No. Orden: ${orderNo}`;
            const footerRightText = "Pág. ____ de ____";

            const drawVisualText = (text, vX, vY, size) => {
              let normAngle = ((currentRotation % 360) + 360) % 360;
              let mW = (normAngle === 90 || normAngle === 270) ? height : width;
              let mH = (normAngle === 90 || normAngle === 270) ? width : height;

              let lX, lY, tRot;
              if (normAngle === 0) { lX = vX; lY = vY; tRot = 0; }
              else if (normAngle === 90) { lX = mW - vY; lY = vX; tRot = 90; }
              else if (normAngle === 180) { lX = mW - vX; lY = mH - vY; tRot = 180; }
              else if (normAngle === 270) { lX = vY; lY = mH - vX; tRot = 270; }

              p.drawText(text, {
                x: lX, y: lY, size: size,
                rotate: degrees(tRot),
                color: rgb(0,0,0),
                opacity: 1.0
              });
            };

            drawVisualText(footerLeftText, 35, 20, 8);
            drawVisualText(footerRightText, width - 130, 20, 8);
          } // End for loop for pages

          showPdfProgress('Optimizando', 'Paso 4: Optimizando PDF para impresión...', 85);
          status.innerText = "⏳ Optimizando PDF para impresión...";
          await yieldToMain();

          // OPTIMIZACIÓN FINAL: Aplanar todos los formularios del documento unificado
          try {
            const finalForm = finalPdf.getForm();
            if (finalForm.getFields().length > 0) {
              console.log(`✓ Aplanando ${finalForm.getFields().length} campos de formulario en documento final`);
              finalForm.flatten();
            }
          } catch(e) {
            console.log('No hay formularios en documento final o ya están aplanados');
          }

          // Purgar el diccionario AcroForm para evitar saturación de memoria en impresoras
          try {
            finalPdf.catalog.delete(PDFLib.PDFName.of('AcroForm'));
            console.log('✓ Diccionario AcroForm purgado del catálogo maestro');
          } catch(e) {
            console.log('No se pudo purgar AcroForm:', e);
          }

          console.time('pdf-save');
          console.log('✓ Guardando PDF con configuración optimizada para impresión');
          const pdfData = await finalPdf.save({
            useObjectStreams: true,         // Activa compresión de objetos (FlateDecode)
            addDefaultPage: false,          // No agregar páginas adicionales
            objectsPerTick: 50,             // Procesar objetos en lotes pequeños
            updateFieldAppearances: false   // No actualizar apariencias (ya están aplanadas)
          });
          console.timeEnd('pdf-save');
          console.log(`✓ PDF generado: ${(pdfData.length / 1024 / 1024).toFixed(2)} MB, ${totalPages} páginas`);
          
          const base64Data = uint8ArrayToBase64(new Uint8Array(pdfData));
          console.timeEnd('base64-conversion');

          showPdfProgress('Guardando', 'Guardando en Drive y registrando...', 95);
          status.innerText = "🔄 Guardando en Drive y registrando impresión...";
          await yieldToMain();

          // Paso 1: Transacción atómica en el servidor (genera PDF, avanza contador y registra
          // trazabilidad juntos, con rollback si algo falla).
          console.time('drive-save');
          let saveResult;
          try {
            saveResult = await processPrintAsync(base64Data, orderNo, userId, printType, totalPages);
            console.timeEnd('drive-save');
          } catch (saveErr) {
            console.timeEnd('drive-save');
            console.error('Error en processPrintForUser:', saveErr.message);
            hidePdfProgress();
            status.innerText = "⚠️ Error al registrar la impresión: " + saveErr.message;
            status.className = "error-text";
            btn.disabled = false;
            return;
          }

          const normalizedResult = typeof saveResult === 'string'
            ? { fileId: saveResult }
            : saveResult;

          // Paso 2: Abrir visualizador. La impresión YA quedó registrada de forma atómica en el
          // servidor, por lo que un bloqueo de popup no produce inconsistencia de contadores.
          try {
            openSavedPdfPreview(normalizedResult);
          } catch (previewErr) {
            const url = previewErr.message.replace('POPUP_BLOCKED:', '');
            hidePdfProgress();
            status.innerHTML = '✅ Impresión registrada. Las ventanas emergentes están bloqueadas: '
              + '<a href="' + url + '" target="_blank">Abrir PDF</a>';
            status.className = "success-text";
            btn.disabled = false;
            resetPreloadState();
            document.getElementById('orderNo').value = '';
            return;
          }

          hidePdfProgress();
          status.innerText = "✅ PDF guardado en Drive e impresión registrada. Listo para la siguiente orden.";
          status.className = "success-text";
          document.getElementById('orderNo').value = '';
          resetPreloadState();
          setPreloadBanner('', '');
          document.getElementById('orderNo').focus();
          setTimeout(() => {
            if (status.innerText.includes("Listo para la siguiente orden")) {
              status.innerText = '';
            }
          }, 3000);

        } catch (pdfError) {
          hidePdfProgress();
          showToast("Error generando PDF: " + pdfError.message, 'error');
          status.innerText = "❌ Error: " + pdfError.message;
          status.className = "error-text";
          btn.disabled = false;
        }
      }

      async function run() {
        const orderNo = document.getElementById('orderNo').value.trim();
        const userName = document.getElementById('userName').value.trim();
        const printType = document.querySelector('input[name="printType"]:checked').value;
        const btn = document.getElementById('goBtn');
        const status = document.getElementById('status');

        status.className = "";

        const config = globalTemplates.map(t => ({
          key: t.key, fileId: t.fileId, hasAccess: t.hasAccess,
          copies: parseInt(document.getElementById('val_' + t.key).value) || 0
        })).filter(c => c.copies > 0);

        if (!orderNo || !userName) { showToast("Error: Complete los campos No. de Orden y Usuario.", 'error'); return; }

        // Verificar si hay plantillas sin acceso seleccionadas
        const noAccessSelected = config.filter(c => c.hasAccess === false);
        if (noAccessSelected.length > 0) {
          const names = noAccessSelected.map(c => globalTemplates.find(t => t.key === c.key).name).join('\n- ');
          showToast("Error: Las siguientes plantillas no tienen acceso:\n\n- " + names + "\n\nPor favor, use el menú 'Diagnosticar Plantillas' para resolver este problema.", 'error');
          return;
        }

        // Buscar el UserID correspondiente al Nombre Completo seleccionado
        const userObj = window.QMSContext.users.find(u => u.nombreCompleto === userName);
        if (!userObj) {
          showToast("Error: El usuario \"" + userName + "\" no es válido. Debe seleccionar un nombre completo de la lista.", 'error');
          document.getElementById('userName').focus();
          return;
        }
        const userId = userObj.userId;

        if (config.length === 0) { showToast("Error: Seleccione al menos 1 copia de alguna plantilla.", 'error'); return; }

        if (preloadState.status === 'loading' && preloadState.orderNo === orderNo) {
          setPreloadBanner('info', '⏳ Aún se están preparando los documentos. Espere a que aparezca "Documentos listos para impresión".');
          status.innerText = "⏳ Esperando documentos dinámicos...";
          status.className = "info-text";
          return;
        }

        if (!isPreloadReadyForOrder(orderNo)) {
          const messages = (preloadState.orderNo === orderNo && preloadState.errors.length)
            ? preloadState.errors.map(err => '⚠️ ' + err.message).join('<br>')
            : '⚠️ Ingrese un No. de Orden válido y espere a que DOC_ORDENES y DOC_ANALISIS estén listos.';
          setPreloadBanner('error', messages);
          status.innerText = "Proceso bloqueado: faltan documentos requeridos.";
          status.className = "error-text";
          return;
        }

        btn.disabled = true;

        status.innerText = "⏳ Paso 2/4: Preparando motor PDF (datos precargados)...";
        status.className = "info-text";
        console.log(`✓ Usando documentos dinámicos precargados para orden ${orderNo}`);
        const payload = buildPayloadFromPreload(config);
        processPdfGeneration(payload, config, orderNo, userName, userId, printType, btn, status);
      }

      async function enviarSolicitudExtraordinaria() {
        const orderNo = document.getElementById('orderNo').value.trim();
        const userName = document.getElementById('userName').value.trim();
        const tipoSolicitud = document.getElementById('solicitudTipo').value;
        const motivo = document.getElementById('solicitudMotivo').value.trim();
        const btn = document.getElementById('btnSolicitarExtra');
        const status = document.getElementById('status');
        const panelSolicitudExtra = document.getElementById('panelSolicitudExtra');

        // Recopilar plantillas requeridas (igual que run())
        const config = globalTemplates.map(t => ({
          key: t.key, fileId: t.fileId, hasAccess: t.hasAccess,
          copies: parseInt(document.getElementById('val_' + t.key).value) || 0
        })).filter(c => c.copies > 0);

        // Validaciones
        if (!orderNo || !userName) {
          showToast("Error: Complete los campos No. de Orden y Usuario.", 'error');
          return;
        }

        if (config.length === 0) {
          showToast("Error: Seleccione al menos 1 copia de alguna plantilla para solicitar.", 'error');
          return;
        }

        if (!motivo) {
          showToast("Error: El motivo de la solicitud es obligatorio.", 'error');
          document.getElementById('solicitudMotivo').focus();
          return;
        }

        // Buscar el UserID correspondiente al Nombre Completo seleccionado
        const userObj = window.QMSContext.users.find(u => u.nombreCompleto === userName);
        if (!userObj) {
          showToast("Error: El usuario \"" + userName + "\" no es válido. Debe seleccionar un nombre completo de la lista.", 'error');
          document.getElementById('userName').focus();
          return;
        }
        const userId = userObj.userId;

        // Mostrar loading
        btn.disabled = true;
        btn.innerText = "⏳ Enviando...";
        status.innerText = "📨 Enviando solicitud a QA...";
        status.className = "info-text";

        // Solicitar PIN de firma si no está predefinido en el contexto
        let pin = window.QMSContext.userPin || '';
        if (!pin) {
          try {
            pin = await promptSecurityPin("Por favor, ingrese su PIN de autorización para enviar esta solicitud:");
          } catch (e) {
            showToast(e.message, 'warning');
            return;
          }
        }

        try {
          const result = await gsRun('registrarSolicitudImpresion', [{
            noOrden: orderNo,
            tipoSolicitud: tipoSolicitud,
            motivo: motivo,
            plantillas: JSON.stringify(config),
            pinFirma: pin
          }, userId]);

          if (result.status === 'success') {
            // Éxito: ocultar panel, resetear formulario y mostrar mensaje
            panelSolicitudExtra.style.display = 'none';
            document.getElementById('solicitudMotivo').value = '';
            document.getElementById('solicitudTipo').value = 'Reimpresión';
            status.innerText = "✅ " + result.message;
            status.className = "success-text";
            console.log(`✓ Solicitud enviada exitosamente: ${result.idSolicitud}`);
          } else {
            // Error: mostrar alerta
            showToast("Error al enviar solicitud: " + result.message, 'error');
            status.innerText = "❌ Error: " + result.message;
            status.className = "error-text";
          }
        } catch (error) {
          showToast("Error de comunicación: " + error.message, 'error');
          status.innerText = "❌ Error de comunicación: " + error.message;
          status.className = "error-text";
          console.error("Error en enviarSolicitudExtraordinaria:", error);
        } finally {
          btn.disabled = false;
          btn.innerText = "📨 Enviar Solicitud a QA";
        }
      }

      // --- Inicializar sistema de drag y resize ---
      initializeModalDragResize({
        title: 'Panel de Impresión',  // No se mostrará - drag handle oculto
        enableDrag: true,
        enableResize: true,
        minWidth: 400,
        minHeight: 500,
        maxWidth: 1200,
        maxHeight: 1000
      });
    