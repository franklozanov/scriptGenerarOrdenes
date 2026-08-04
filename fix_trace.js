const fs = require('fs');

let code = fs.readFileSync('Traceability.gs', 'utf8');

const s1_old =       if (startRow > 1) { // Ignorar el encabezado
        // ==========================================
        // FASE 0: LIMPIEZA UNIFICADA DE FILAS
        // ==========================================
        var isClearedArray = []; 
        var procValues = colProceso ? sheet.getRange(startRow, colProceso, processNumRows, 1).getValues() : [];
        var codValues = colCodigo ? sheet.getRange(startRow, colCodigo, processNumRows, 1).getValues() : [];
        var descValues = colDescripcion ? sheet.getRange(startRow, colDescripcion, processNumRows, 1).getValues() : [];
        var anyRowCleared = false;
        
        for (var r = 0; r < processNumRows; r++) {
          var proc = procValues.length > 0 ? procValues[r][0].toString().trim() : \"\";
          var cod = codValues.length > 0 ? codValues[r][0].toString().trim() : \"\";
          var desc = descValues.length > 0 ? descValues[r][0].toString().trim() : \"\";
          
          if (proc === \"\" && cod === \"\" && desc === \"\") {
            isClearedArray.push(true);
            anyRowCleared = true;
          } else {
            isClearedArray.push(false);
          }
        };

const s1_new =       // Obtener índices de las 8 columnas clave para trazabilidad
      var targetHeaders = ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden'];
      var targetColIndices = [];
      var maxColIndex = 0;
      
      for (var h = 0; h < targetHeaders.length; h++) {
        var idx = getColumnIndexByNameCaseInsensitive(headers, targetHeaders[h], false);
        if (idx) {
          targetColIndices.push(idx);
          if (idx > maxColIndex) maxColIndex = idx;
        }
      }

      if (startRow > 1) { // Ignorar el encabezado
        // ==========================================
        // FASE 0: LIMPIEZA UNIFICADA DE FILAS
        // ==========================================
        var isClearedArray = []; 
        var anyRowCleared = false;
        
        if (maxColIndex > 0) {
          // Leer toda la fila hasta la última columna requerida (1 sola llamada API)
          var rowData = sheet.getRange(startRow, 1, processNumRows, maxColIndex).getValues();
          
          for (var r = 0; r < processNumRows; r++) {
            var rowIsEmpty = true;
            // Revisar si las 8 columnas están vacías
            for (var c = 0; c < targetColIndices.length; c++) {
              var val = rowData[r][targetColIndices[c] - 1];
              if (val !== undefined && val !== null && val.toString().trim() !== \"\") {
                rowIsEmpty = false;
                break;
              }
            }
            isClearedArray.push(rowIsEmpty);
            if (rowIsEmpty) anyRowCleared = true;
          }
        } else {
          for (var r = 0; r < processNumRows; r++) isClearedArray.push(false);
        };

const s2_old =         var intersectsSolicitadoPor = (startCol <= colSolicitadoPor && endCol >= colSolicitadoPor);
        var targetHeaders = ['Proceso', 'Codigo', 'Descripcion', 'Lote', 'Exp', 'Cantidad', 'NoAnalisis', 'NoOrden'];
        var targetColIndices = [];
        
        for (var h = 0; h < targetHeaders.length; h++) {
          var idx = getColumnIndexByNameCaseInsensitive(headers, targetHeaders[h], false);
          if (idx) targetColIndices.push(idx);
        }
        
        var tocaColumnasDatos = false;;

const s2_new =         var intersectsSolicitadoPor = (startCol <= colSolicitadoPor && endCol >= colSolicitadoPor);
        
        var tocaColumnasDatos = false;;

const s3_old =             var currentValues = targetRange.getValues();
            var firstColRange = sheet.getRange(iterStartRow, 1, iterNumRows, 3).getValues(); 
            var updateNeeded = false;;

const s3_new =             var currentValues = targetRange.getValues();
            var updateNeeded = false;;

const s4_old =             for (var i = 0; i < iterNumRows; i++) {
              var isClearedIdx = (iterStartRow === 2 && editedRange.getRow() === 1) ? i + 1 : i;
              if (isClearedArray[isClearedIdx]) continue;
              
              var hasData = firstColRange[i].join(\"\").trim() !== \"\";
              var currVal = currentValues[i][0] ? currentValues[i][0].toString() : \"\";
              
              if (!hasData) {
                if (currVal !== \"\") {
                  currentValues[i][0] = \"\";
                  updateNeeded = true;
                }
                continue;
              }
              
              if (currVal === \"\" || intersectsSolicitadoPor) {
                 currentValues[i][0] = \"Crea: \" + baseStamp;
                 updateNeeded = true;
              } else {
                 var lines = currVal.split(\"\\n\");
                 var newLine = lines[0]; 
                 var allowMod = false;
                 
                 if (iterNumRows === 1) {
                   if (e.oldValue !== undefined && e.oldValue !== \"\") {
                     allowMod = true;
                   } else {
                     var creaMatch = newLine.match(/Crea: .* \\((.*?)\\)/);
                     var creaMs = 0;
                     if (creaMatch) {
                       var p = creaMatch[1].split(\" \");
                       if (p.length === 2) {
                         var d = p[0].split(\"/\");
                         var t = p[1].split(\":\");
                         if (d.length === 3 && t.length === 2) {
                           creaMs = new Date(2000 + parseInt(d[2], 10), parseInt(d[1], 10) - 1, parseInt(d[0], 10), parseInt(t[0], 10), parseInt(t[1], 10)).getTime();
                         }
                       }
                     }
                     var nowMs = new Date().getTime();
                     if ((nowMs - creaMs > 1800000) || lines.length > 1) {
                       allowMod = true;
                     }
                   }
                 }
                 
                 if (allowMod) {
                   newLine += \"\\nMod: \" + baseStamp;
                   if (currVal !== newLine) {
                     currentValues[i][0] = newLine;
                     updateNeeded = true;
                   }
                 }
              }
            };

const s4_new =             for (var i = 0; i < iterNumRows; i++) {
              var isClearedIdx = (iterStartRow === 2 && editedRange.getRow() === 1) ? i + 1 : i;
              
              // Si la fila está vacía en las columnas clave (Proceso, Codigo, Descripcion), saltar la firma
              if (isClearedArray[isClearedIdx]) {
                var currVal = currentValues[i][0] ? currentValues[i][0].toString() : \"\";
                if (currVal !== \"\") {
                  currentValues[i][0] = \"\";
                  updateNeeded = true;
                }
                continue;
              }
              
              var currVal = currentValues[i][0] ? currentValues[i][0].toString() : \"\";
              
              if (currVal === \"\" || intersectsSolicitadoPor) {
                 currentValues[i][0] = \"Crea: \" + baseStamp;
                 updateNeeded = true;
              } else {
                 var lines = currVal.split(\"\\n\");
                 var lastLine = lines[lines.length - 1]; 
                 
                 // Validar tiempo desde la ÚLTIMA modificación o creación
                 var timeMatch = lastLine.match(/.* \\((.*?)\\)/);
                 var lastMs = 0;
                 if (timeMatch) {
                   var p = timeMatch[1].split(\" \");
                   if (p.length === 2) {
                     var d = p[0].split(\"/\");
                     var t = p[1].split(\":\");
                     if (d.length === 3 && t.length === 2) {
                       lastMs = new Date(2000 + parseInt(d[2], 10), parseInt(d[1], 10) - 1, parseInt(d[0], 10), parseInt(t[0], 10), parseInt(t[1], 10)).getTime();
                     }
                   }
                 }
                 var nowMs = new Date().getTime();
                 var elapsed = nowMs - lastMs;
                 
                 if (lines.length === 1) {
                   // Solo existe \"Crea:\", agregamos \"Mod:\" preservando la creación
                   lines.push(\"Mod: \" + baseStamp);
                 } else {
                   // Ya existe al menos un \"Mod:\"
                   if (elapsed <= 300000) { // 5 minutos (300,000 ms)
                     // Dentro del periodo de gracia de 5 mins: sobrescribimos la última línea Mod:
                     lines[lines.length - 1] = \"Mod: \" + baseStamp;
                   } else {
                     // Fuera del periodo de 5 mins: acumulamos nueva línea Mod:
                     lines.push(\"Mod: \" + baseStamp);
                   }
                 }
                 
                 var newLineStr = lines.join(\"\\n\");
                 if (currVal !== newLineStr) {
                   currentValues[i][0] = newLineStr;
                   updateNeeded = true;
                 }
              }
            };

code = code.replace(s1_old, s1_new);
code = code.replace(s2_old, s2_new);
code = code.replace(s3_old, s3_new);
code = code.replace(s4_old, s4_new);

fs.writeFileSync('Traceability.gs', code);
