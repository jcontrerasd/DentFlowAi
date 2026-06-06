# Calibración post-rollout — Modelo de disponibilidad v5.0

Notas operativas para la primera semana tras encender `AVAILABILITY_MODEL_ENABLED` en producción. Complementa el plan ([plan_flujo_tiempos.md](plan_flujo_tiempos.md), Fase 7).

## Métricas a vigilar (dashboard admin → Fauchard → Observabilidad)

| Métrica | Umbral de alerta | Acción si se cruza |
|---|---|---|
| % técnicos en Nivel 2 o 3 | > 30% | Suavizar `αN` (alpha_no_response) o subir umbrales `level_2/3_threshold` |
| Invitaciones sin respuesta (expiradas) | crece tras el rollout | Plazos de cotización cortos o sanción mal calibrada → revisar `tQuoteMinutes` |
| % casos en `pendiente_pool` | > 20% sostenido | Problema de oferta (pocos técnicos elegibles), no de parámetros → revisar disponibilidad declarada |
| Reemplazos exitosos | < 20% | Ajustar `replacementCutoffMinutes` (subir margen) |
| Respuesta media del dentista | mayoría < 24h | Bajar `tDentistReviewHours` |
| Rechazo explícito vs no-respuesta | rechazo muy bajo | El botón "Rechazar" no es visible/claro → revisar UCH |

## Cadencia sugerida

- **Primeras 24–48h**: revisar el dashboard cada 4–6h.
- **Resto de la semana 1**: 1–2 veces al día.
- Confirmar que los 2 crons corren (logs de Cloud Run con `[cron/process-availability]` / `[cron/process-pool-queue]`, o métricas de Cloud Scheduler).

## Parámetros que probablemente se ajusten primero

- `alpha_no_response` (peso de la sanción en el score) — arrancar conservador.
- `level_2_threshold` / `level_3_threshold` — si muchos técnicos llegan a Nivel 3 demasiado rápido.
- `tNoEligiblePoolHours` / `maxPoolCycles` — si los casos esperan demasiado en la cola.

Los cambios de parámetros se hacen desde **`/dashboard/admin/fauchard` → Plazos y Sanciones** (copy-on-write con motivo obligatorio; cada cambio crea una nueva fila activa de `fauchard_config`).

## Incidente / rollback

Apagar `AVAILABILITY_MODEL_ENABLED` (y secundarios) desde Cloud Run + reiniciar instancia. Ver [Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md) §14.
