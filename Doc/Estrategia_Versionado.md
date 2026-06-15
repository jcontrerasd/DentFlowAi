# Estrategia de Versionado — DentFlowAi

Documento de referencia para gestionar cambios estructurales mayores sin perder la versión anterior.

## Estructura de ramas

| Rama / Tag | Commit | Propósito |
|---|---|---|
| `main` | `d9a9f5a` | Producción estable. Avanza solo al validar `v2` en staging. |
| `v1` | `d9a9f5a` | Snapshot permanente de la versión actual. Nunca se borra. |
| `v1.0-produccion` (tag) | `d9a9f5a` | Marcador inmutable. No se mueve con ningún merge ni reset. |
| `develop` | `d9a9f5a` | Rama de trabajo diario de v1 (congelada mientras dure v2). |
| `v2` | `d9a9f5a` (base) | Nueva versión en desarrollo. Todo el trabajo nuevo va aquí. |

## Regla de oro

> **Nunca ejecutar `git merge v2` ni `git rebase` estando en `main` o `v1`** hasta que `v2` esté completamente validado en staging (GCP dev).

Las ramas son aisladas por defecto. La mezcla solo ocurre cuando se ordena explícitamente.

## Comandos de restore

### Volver a la versión actual (v1)

```bash
# Opción A — desde la rama v1 (recomendado para deploy)
git checkout v1

# Opción B — desde el tag inmutable (garantía absoluta)
git checkout v1.0-produccion

# Opción C — desde el hash directo
git checkout d9a9f5a
```

### Retomar trabajo en la nueva versión

```bash
git checkout v2
```

### Ver el estado de todas las ramas

```bash
git branch -a
git log --oneline --graph --all -10
```

## Deploy por versión

`deploy_gui.py` detecta la **rama Git actual** y aplica política de advertencia/bloqueo antes de desplegar.

| Línea | GCP dev (pestaña STAGING) | GCP prod (pestaña PRODUCTION) |
|-------|---------------------------|-------------------------------|
| **v1 (antigua)** | `git checkout develop` → GUI STAGING | merge `develop→main` → `git checkout main` → GUI PRODUCTION |
| **v2 (nueva)** | `git checkout v2` → GUI STAGING | merge `v2→main` → `git checkout main` → GUI PRODUCTION |
| **Rollback** | — | `git checkout v1` (o tag `v1.0-produccion`) → GUI PRODUCTION *(advertencia)* |

**Bloqueos en GUI:** no se puede desplegar a PRODUCTION desde `develop` ni `v2` (debe mergearse a `main` primero).

### Qué muestra `deploy_gui.py`

- Barra superior: rama, commit corto, tag (si aplica), cambios sin commit
- Banner por pestaña STAGING/PRODUCTION según línea (v1 vs v2)
- Resumen unificado antes de confirmar (servicio, flags, política de rama)
- Botón **Versionado** → abre este documento

## Flujo de merge final (cuando v2 esté listo)

Cuando `v2` esté validado en staging y listo para reemplazar a `v1`:

```bash
# 1. Crear tag de seguridad adicional antes del merge (opcional pero recomendado)
git checkout main
git tag v1.1-pre-merge-v2
git push origin v1.1-pre-merge-v2

# 2. Merge de v2 a main
git merge v2

# 3. Push a producción
git push origin main
```

Después del merge, `v1` y `v1.0-produccion` **siguen existiendo** en GitHub. En cualquier momento futuro se puede hacer `git checkout v1` para volver.

## Qué NO hacer

- `git push --force` sobre `main` o `v1` — destruye el historial.
- Borrar el tag `v1.0-produccion` — es el seguro final.
- Hacer merge parcial de `v2` en `main` — solo merge cuando todo esté validado.
- Trabajar directamente en `main` — usar `v2` para el nuevo sistema y `develop` para hotfixes de v1.
