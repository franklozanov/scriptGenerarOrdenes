# Procedimiento de Rollback Universal

## Si algo falla durante la refactorización

### Opción 1: Rollback Total (volver a main)
```bash
git checkout main
```
Luego en el editor de Google Apps Script:
1. Copiar el contenido de `Code.gs` desde la rama main
2. Eliminar todos los archivos `.gs` nuevos creados durante la refactorización
3. Guardar en GAS
4. Sistema restaurado al estado original

### Opción 2: Rollback Quirúrgico (volver N commits atrás)
```bash
# Ver historial de commits
git log --oneline

# Volver a un commit específico
git checkout <commit-hash>

# O volver N commits atrás
git checkout HEAD~3  # 3 commits atrás
```

### Opción 3: Rollback por Fase
Cada fase tiene su punto de rollback documentado en el plan:

| Fase | Comando de Rollback |
|---|---|
| Fase 1 | Eliminar archivos vacíos del editor GAS |
| Fase 2 | `git checkout refactor~3` |
| Fase 3 | `git checkout refactor~6` |
| Fase 4 | `git checkout refactor~10` |
| Fase 5 | `git checkout main` |
| Fase 6 | Revertir los 3 archivos HTML |

## Verificación Post-Rollback
Después de cualquier rollback:
1. Abrir el libro de pruebas de Google Sheets
2. Recargar la página (F5)
3. Verificar que el menú "Gestionar OA" aparece
4. Abrir el Panel de Impresión
5. Verificar que carga la lista de usuarios y plantillas

## Contacto de Emergencia
Si el rollback no funciona, el código original está en:
- Rama: `main`
- Archivo: `Code.gs` (3,003 líneas completas)
