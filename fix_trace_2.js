const fs = require('fs');

let code = fs.readFileSync('Traceability.gs', 'utf8');

const s1_old =             if (updateNeeded) targetRange.setValues(currentValues);
          }
        }
      };

const s1_new =             if (updateNeeded) {
              targetRange.setValues(currentValues);
              SpreadsheetApp.flush(); // Forza a que Google Sheets muestre la firma inmediatamente
            }
          }
        }
      };

const s2_old =           // PEGADO MASIVO: No bloquear a los usuarios con validaciones lentas en Drive
          if (processNumRows > 3) {
            var changedMassive = false;
            for (var r = 0; r < processNumRows; r++) {
              var isClearedIdx = (startRow === 2 && editedRange.getRow() === 1) ? r + 1 : r;
              if (isClearedArray[isClearedIdx]) continue;
              
              var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : \"\";
              if (currStatus !== \"Impreso\" && currStatus !== \"Reimpreso\" && currStatus !== \"Anulada\") {
                if (colEstadoDocs) {
                  estadoDocsValues[r][0] = \"? Pendiente Validar\";
                  changedMassive = true;
                }
              } else if (currStatus === \"Anulada\") {
                if (colEstadoDocs && estadoDocsValues[r][0] !== \"?? Orden Anulada\") {
                  estadoDocsValues[r][0] = \"?? Orden Anulada\";
                  changedMassive = true;
                }
              }
            }
            if (changedMassive && colEstadoDocs) {
              sheet.getRange(startRow, colEstadoDocs, processNumRows, 1).setValues(estadoDocsValues);
            };

const s2_new =           // PEGADO MASIVO: No bloquear a los usuarios con validaciones lentas en Drive
          if (processNumRows > 3) {
            var changedMassive = false;
            for (var r = 0; r < processNumRows; r++) {
              var isClearedIdx = (startRow === 2 && editedRange.getRow() === 1) ? r + 1 : r;
              if (isClearedArray[isClearedIdx]) continue;
              
              var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : \"\";
              
              // Si la fila es nueva y no tiene STATUS, asignarle Pendiente por defecto
              if (currStatus === \"\") {
                if (colStatusIdx) {
                  statusValues[r][0] = \"Pendiente\";
                  currStatus = \"Pendiente\";
                  changedMassive = true;
                }
              }
              
              if (currStatus !== \"Impreso\" && currStatus !== \"Reimpreso\" && currStatus !== \"Anulada\") {
                if (colEstadoDocs) {
                  estadoDocsValues[r][0] = \"? Pendiente Validar\";
                  changedMassive = true;
                }
              } else if (currStatus === \"Anulada\") {
                if (colEstadoDocs && estadoDocsValues[r][0] !== \"?? Orden Anulada\") {
                  estadoDocsValues[r][0] = \"?? Orden Anulada\";
                  changedMassive = true;
                }
              }
            }
            if (changedMassive) {
              if (colEstadoDocs) sheet.getRange(startRow, colEstadoDocs, processNumRows, 1).setValues(estadoDocsValues);
              if (colStatusIdx) sheet.getRange(startRow, colStatusIdx, processNumRows, 1).setValues(statusValues);
            };

const s3_old =           // EDICIÓN INDIVIDUAL O PEQUEÑA:
          else {
            for (var r = 0; r < processNumRows; r++) {
              var isClearedIdx = (startRow === 2 && editedRange.getRow() === 1) ? r + 1 : r;
              if (isClearedArray[isClearedIdx]) continue;
              
              var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : \"\";
              var shouldValidate = isRefEdit || isStatusEdit; // Por defecto validar solo si se editó una ref o el STATUS
              
              if (currStatus === \"Impreso\" || currStatus === \"Reimpreso\" || currStatus === \"Anulada\") {;

const s3_new =           // EDICIÓN INDIVIDUAL O PEQUEÑA:
          else {
            for (var r = 0; r < processNumRows; r++) {
              var isClearedIdx = (startRow === 2 && editedRange.getRow() === 1) ? r + 1 : r;
              if (isClearedArray[isClearedIdx]) continue;
              
              var currStatus = (colStatusIdx && statusValues[r] && statusValues[r][0]) ? statusValues[r][0].toString().trim() : \"\";
              var shouldValidate = isRefEdit || isStatusEdit; // Por defecto validar solo si se editó una ref o el STATUS
              
              // Si la fila es nueva y no tiene STATUS, asignarle Pendiente por defecto de inmediato
              if (currStatus === \"\") {
                if (colStatusIdx) {
                  sheet.getRange(startRow + r, colStatusIdx).setValue(\"Pendiente\");
                  currStatus = \"Pendiente\";
                }
              }
              
              if (currStatus === \"Impreso\" || currStatus === \"Reimpreso\" || currStatus === \"Anulada\") {;

code = code.replace(s1_old, s1_new);
code = code.replace(s2_old, s2_new);
code = code.replace(s3_old, s3_new);

fs.writeFileSync('Traceability.gs', code);
