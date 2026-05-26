# Sprint 3 — Propuesta al Dentista: Aceptación y Rechazo

**Duración estimada:** 1 semana  
**Objetivo:** El dentista puede ver la propuesta generada por la caja negra (precio + plazo), aceptarla o rechazarla. Al aceptar, el caso entra en ejecución y el técnico queda confirmado.  
**Prerrequisito:** Sprint 2 completado (caso llega a `status='propuestaLista'`).

---

## Contexto

Este sprint es la primera pieza de UI visible del nuevo modelo para el dentista. El concepto central es simple: el dentista ve una "tarjeta de propuesta" con costo y tiempo. Acepta o rechaza. Sin negociación, sin ver al técnico, sin cotizaciones comparativas.

---

## Tareas

### S3-01 — Server Action `acceptProposalAction(caseId)`
**Tipo:** Backend  
**Dependencias:** S2-08  
**Descripción:**

```typescript
// Guard: case.organizationId === identity.orgId
// Guard: case.status === 'propuestaLista'
// Guard: now < case.proposal_expires_at

// Efectos (transacción):
// 1. UPDATE clinical_case SET {
//      status = 'enEjecucion',
//      internal_status = 'aceptadaConfigurando',
//      current_responsibility = 'tecnico',
//      started_at = now
//    }
// 2. logCaseEvent { type='sistema', action='PROPUESTA_ACEPTADA',
//                   content='Has aceptado la propuesta. El trabajo ha comenzado.',
//                   stateChange={from:'propuestaLista', to:'enEjecucion'} }
// 3. Desbloquear archivos STL para el técnico:
//    → UPDATE case_invitation SET status='confirmed' WHERE clinical_case_id=caseId AND status='accepted'
// 4. notifyUser(assignedTechnicianId, 'TRABAJO_CONFIRMADO', { caseId })
// 5. UPDATE user SET consecutive_no_response=0 WHERE id=assignedTechnicianId
```

**Criterio de Done:** Caso pasa a `enEjecucion`. Técnico notificado. Archivos STL accesibles para el técnico.

---

### S3-02 — Server Action `rejectProposalAction(caseId, reason?)`
**Tipo:** Backend  
**Dependencias:** S2-08  
**Descripción:**

```typescript
// Guard: case.organizationId === identity.orgId
// Guard: case.status === 'propuestaLista'

// Efectos (transacción):
// 1. UPDATE clinical_case SET {
//      status = 'rechazado',
//      internal_status = 'rechazadaPorDentista',
//      dentist_rejection_reason = reason,
//      current_responsibility = null
//    }
// 2. UPDATE case_invitation SET status='withdrawn' 
//    WHERE clinical_case_id=caseId AND status='accepted'
// 3. UPDATE user SET is_available = true WHERE id = liberatedTechId
//    (restablecer disponibilidad del técnico preseleccionado)
// 4. logCaseEvent { type='sistema', action='PROPUESTA_RECHAZADA',
//                   stateChange={from:'propuestaLista', to:'rechazado'} }
// 5. notifyUser(assignedTechnicianId, 'PROPUESTA_RECHAZADA_DENTISTA', { caseId })
```

**Criterio de Done:** Técnico liberado. Caso en `rechazado`. Motivo registrado (análisis interno).

---

### S3-03 — Server Action `checkProposalExpiry(caseId)`
**Tipo:** Backend — lógica lazy  
**Dependencias:** S2-08  
**Descripción:**  
Al cargar el detalle del caso, verificar si `proposal_expires_at < now` y el caso aún está en `propuestaLista`. Si expiró → llamar `rejectProposalAction()` automáticamente con `reason='propuesta_expirada'`.

**Criterio de Done:** Propuestas expiradas se cierran automáticamente.

---

### S3-04 — Componente `ProposalCard`
**Tipo:** UI — nuevo componente  
**Dependencias:** S3-01, S3-02  
**Descripción:**  
Tarjeta prominente que aparece cuando `case.status === 'propuestaLista'`.

**Contenido visual:**
- Encabezado: "💡 Propuesta lista para tu caso [DF-XXXX]"
- **Tiempo de entrega:** "3 días hábiles" (en grande, prominente)
- **Costo total:** "$XX.XXX CLP (IVA incluido)" (en grande)
- **Countdown:** "Esta propuesta vence en HH:MM:SS" — animado
- **Nota informativa:** *"El precio incluye diseño digital [+ fabricación si aplica]. Sin costos adicionales."*
- Botón primario: **"✓ Aceptar propuesta"** → modal de confirmación
- Botón secundario (ghost/outline): "Rechazar" → modal con campo opcional de motivo

**Archivo:** `components/cases/ProposalCard.tsx`

**Criterio de Done:** Countdown actualiza en tiempo real. Botones disparan acciones correctas con estados de carga.

---

### S3-05 — Modal de confirmación de aceptación
**Tipo:** UI  
**Dependencias:** S3-04  
**Descripción:**  
Modal antes de aceptar que muestra:
- Resumen del caso (nombre, tipo de restauración, dientes)
- Precio y plazo confirmados
- Checkbox "Entiendo que esta acción es irreversible y autoriza el trabajo"
- Botón "Confirmar y aceptar" → `acceptProposalAction()`

**Criterio de Done:** Modal funcional. No se puede confirmar sin marcar el checkbox.

---

### S3-06 — Modal de rechazo con motivo opcional
**Tipo:** UI  
**Dependencias:** S3-04  
**Descripción:**  
Modal antes de rechazar con:
- Texto de advertencia: *"Si rechazas la propuesta, el caso quedará cerrado. Podrás crear un nuevo caso si lo necesitas."*
- Campo de texto opcional: "¿Por qué rechazas? (opcional)" — para analítica interna
- Botón "Confirmar rechazo" → `rejectProposalAction()`

**Criterio de Done:** Modal funcional. Motivo se guarda en `dentist_rejection_reason`.

---

### S3-07 — Integrar `ProposalCard` en la página de detalle del caso
**Tipo:** UI  
**Dependencias:** S3-04  
**Descripción:**  
En `app/dashboard/cases/[id]/page.tsx`:

- Si `case.status === 'propuestaLista'`: mostrar `ProposalCard` en posición prominente (por encima del stepper y de otros elementos)
- El `CaseWorkflowStepper` debe reflejar el nuevo estado "Propuesta Lista" como paso activo

**Criterio de Done:** `ProposalCard` visible y funcional en la página de detalle del caso.

---

### S3-08 — Adaptar Dashboard del Dentista (KPIs nuevos)
**Tipo:** UI  
**Dependencias:** S3-01, S3-02  
**Descripción:**  
Actualizar `/dashboard` para el dentista con los nuevos estados:

| KPI nuevo | Descripción |
|---|---|
| "En evaluación" | Casos enviados, procesando propuesta |
| "Propuesta lista" | Requieren acción del dentista — destacar con badge rojo |
| "En ejecución" | Casos activos con técnico trabajando |
| "Completados" | Casos finalizados |

El badge "Propuesta lista" debe ser el más prominente visualmente — es el principal call-to-action del dentista.

**Criterio de Done:** Dashboard muestra KPIs actualizados. Badge de propuesta lista es llamativo.

---

### S3-09 — Actualizar `CaseWorkflowStepper` con nuevo flujo
**Tipo:** UI  
**Dependencias:** S0-09 (constantes)  
**Descripción:**  
Rediseñar el stepper de 7 pasos al nuevo flujo simplificado **para la vista del dentista**:

```
[Enviado] → [En evaluación] → [Propuesta lista] → [En ejecución] → [En revisión] → [Diseño aprobado] → [Completado]
                                                                                         ↓ (si fabricación)
                                                                                   [En fabricación] → [Enviado] → [Completado]
```

**Nota:** El dentista nunca ve "Seleccionando técnico", "Cotizaciones abiertas" ni ningún estado interno.

**Criterio de Done:** Stepper muestra los pasos correctos para cada estado. La bifurcación fabricación/sin-fabricación funciona.

---

## Criterio de Done del Sprint Completo

- [ ] `acceptProposalAction()` y `rejectProposalAction()` funcionando
- [ ] Propuestas expiradas se cierran automáticamente
- [ ] `ProposalCard` con countdown en tiempo real
- [ ] Modales de confirmación y rechazo funcionales
- [ ] Dashboard del dentista con nuevos KPIs
- [ ] Stepper actualizado al nuevo flujo
- [ ] Técnico liberado correctamente al rechazar propuesta

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Dentista no entiende que no puede negociar el precio | Medio | Textos explicativos claros en la ProposalCard |
| Countdown puede desincronizarse con el servidor | Bajo | Usar `proposal_expires_at` del servidor como fuente de verdad, no timer local puro |
| Técnico preseleccionado ocupa un slot mientras dentista decide | Medio | El tiempo de espera está acotado por `T_propuesta_dentista` horas |
