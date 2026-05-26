# Sprint 4 — Adaptación del UCH y Flujo de Diseño

**Duración estimada:** 1–2 semanas  
**Objetivo:** Adaptar el UnifiedCaseHub (chat/eventos) al nuevo modelo: ocultar identidad del técnico al dentista, simplificar el feed, mantener el flujo iterativo de diseño intacto (entregas, revisiones, aprobaciones).  
**Prerrequisito:** Sprint 3 completado (caso llega a `enEjecucion`).

---

## Contexto

El `UnifiedCaseHub` es el sistema de comunicación más complejo de la app. **Se reutiliza en su mayoría**, pero requiere ajustes significativos:

1. **Eliminar**: selector de técnico en la vista del dentista (ahora hay un solo técnico asignado, invisible)
2. **Eliminar**: botones y lógica de gestión de ofertas (aceptar/rechazar bids)
3. **Mantener intacto**: flujo de entregas versionadas (submitReviewAction), aprobación, solicitud de cambios, anotaciones 3D, descarga de archivos
4. **Ajustar**: el feed de eventos para no revelar el nombre/identidad del técnico al dentista

---

## Tareas

### S4-01 — Eliminar selector de técnico del UCH (vista dentista)
**Tipo:** UI — modificación de `UnifiedCaseHub.tsx`  
**Dependencias:** Ninguna  
**Descripción:**  
En el modelo marketplace, el dentista tenía un dropdown para seleccionar qué técnico ver. En el nuevo modelo, hay exactamente un técnico asignado (invisible). Eliminar:

- El dropdown `selectedTechnicianId`
- La lista `interactingTechnicians`
- Las tabs "Ganador / Perdedor"
- La lógica de filtro por hilo de técnico en `filteredEvents`

**Nuevo comportamiento:** El dentista ve todos los eventos del caso sin filtro por técnico. El feed es el historial del caso.

**Criterio de Done:** Dropdown eliminado. Feed muestra todos los eventos sin filtro de técnico.

---

### S4-02 — Ocultar identidad del técnico en el feed del dentista
**Tipo:** UI + Backend  
**Dependencias:** S4-01  
**Descripción:**  
Actualmente, los eventos del tipo `REVISION_ENVIADA`, `COMENTARIO_TECNICO`, etc. muestran el nombre y avatar del autor. En el nuevo modelo, el dentista NO debe ver la identidad del técnico.

**Cambios en `UnifiedCaseHub.tsx`:**
- Para el rol `dentista`: cuando el evento es de un técnico (`event.user.role === 'tecnico'`), reemplazar nombre con **"Laboratorio DentFlow"** y avatar con un ícono genérico de laboratorio.
- El técnico sigue viendo su propio nombre normalmente.

**Cambios en `getCaseEventsAction()`:**
- Antes de retornar eventos al dentista: si el autor es técnico, anonimizar `event.user.fullName` y `event.user.image`.

```typescript
// En getCaseEventsAction, antes de retornar:
if (identity.role === 'dentista') {
  events.forEach(e => {
    if (e.user?.role === 'tecnico') {
      e.user.fullName = 'Laboratorio DentFlow';
      e.user.image = null; // usar ícono genérico en UI
    }
  });
}
```

**Criterio de Done:** El dentista nunca ve el nombre real del técnico. El técnico sí ve su propio nombre.

---

### S4-03 — Eliminar acciones de gestión de ofertas del UCH
**Tipo:** UI  
**Dependencias:** Ninguna  
**Descripción:**  
Eliminar del UCH los botones y paneles relacionados con el marketplace:
- Botón "Hacer oferta" (técnico en caso publicado)
- Panel de gestión de ofertas (dentista viendo offers)
- Eventos tipo `OFERTA_RECIBIDA`, `OFERTA_ACEPTADA`, `OFERTA_RECHAZADA` del feed visible

**Nota:** Estos eventos pueden seguir existiendo en DB (historial), pero simplemente no se mostrarán en el feed del nuevo modelo.

**Filtro sugerido en `filteredEvents`:**
```typescript
const HIDDEN_ACTIONS = new Set(['OFERTA_RECIBIDA', 'OFERTA_ACEPTADA', 'OFERTA_RECHAZADA', 'OFERTA_RETIRADA']);
// Excluir estos del feed en el nuevo modelo
```

**Criterio de Done:** Ningún botón ni evento de oferta aparece en el UCH.

---

### S4-04 — Adaptar estados de acción contextual del UCH
**Tipo:** UI  
**Dependencias:** S0-09 (nuevas constantes de estado)  
**Descripción:**  
El UCH muestra acciones según el estado. Actualizar la tabla de acciones con los nuevos estados:

| Estado | Dentista ve | Técnico ve |
|---|---|---|
| `enEvaluacion` | "Tu caso está siendo evaluado..." (solo lectura) | — |
| `propuestaLista` | `ProposalCard` (viene de S3) | — |
| `enEjecucion` | Historial de eventos. Mensaje "El técnico está trabajando en tu caso." | Botón "Enviar entrega" |
| `enRevision` | Panel de aprobación (existente) + visor 3D | "Esperando revisión..." |
| `disenoAprobado` | Confirmación visual del diseño aprobado | — |
| `enFabricacion` | "Tu trabajo está en producción" | Botón "Registrar despacho" |
| `enviado` | Botón "Confirmar recepción" | — |

**Criterio de Done:** Cada estado muestra la UI correcta sin acciones del modelo anterior.

---

### S4-05 — Mantener flujo de entregas (`submitReviewAction`) intacto
**Tipo:** Backend / Verificación  
**Dependencias:** S3-01 (caso en `enEjecucion`)  
**Descripción:**  
Verificar que `submitReviewAction()` funciona correctamente con el nuevo estado `enEjecucion` (que reemplaza a `enProgreso`).

**Ajustes necesarios en `submitReviewAction()`:**
- Cambiar guard: `case.status === 'enEjecucion'` (en vez de `'enProgreso'`)
- Transición de estado: `enEjecucion` → `enRevision`
- Log: `REVISION_ENVIADA` — sin cambios

**Criterio de Done:** Técnico puede enviar entregas cuando caso está en `enEjecucion`.

---

### S4-06 — Mantener `approveWorkAction()` y `requestRevisionAction()` intactos
**Tipo:** Backend / Verificación  
**Dependencias:** S4-05  
**Descripción:**  
Verificar guards y transiciones:

- `approveWorkAction()`: `enRevision` → `disenoAprobado` (si sin fabricación) o `enFabricacion` (si con fabricación)
- `requestRevisionAction()`: `enRevision` → `enEjecucion` (antes era `enProgreso`)

**Ajuste en `approveWorkAction()`:**
```typescript
// Cambiar:
// terminado → disenoAprobado (si sin fabricación)
// fabricacion → enFabricacion (si con fabricación)
```

**Criterio de Done:** Aprobación y solicitud de cambios funcionan con los nuevos estados.

---

### S4-07 — Mantener `registerDispatchAction()` y `confirmReceptionAction()` intactos
**Tipo:** Backend / Verificación  
**Dependencias:** S4-06  
**Descripción:**  
- `registerDispatchAction()`: guard `case.status === 'enFabricacion'` → transición a `enviado`
- `confirmReceptionAction()`: guard `case.status === 'enviado'` → transición a `completado`

**Criterio de Done:** Despacho y confirmación funcionan con nuevos nombres de estado.

---

### S4-08 — Actualizar `getSignedUrlAction()` para desbloquear STL al técnico
**Tipo:** Backend  
**Dependencias:** S3-01 (acceptProposalAction desbloquea)  
**Descripción:**  
En el nuevo modelo, el técnico NO debe poder ver los archivos STL del caso hasta que el dentista acepte la propuesta. Actualmente el técnico puede ver archivos de casos "publicados".

**Nueva lógica de acceso:**
```typescript
// Para técnico accediendo a archivos de un caso ajeno:
// 1. Verificar que existe case_invitation con status='confirmed' (aceptado por dentista)
//    WHERE technician_id = identity.id AND clinical_case_id = caseId
// 2. Si existe → acceso permitido
// 3. Si solo 'accepted' (preseleccionado, dentista no ha aceptado) → DENEGAR acceso
// 4. Si status='pending'|'quoted' → DENEGAR acceso
```

**Criterio de Done:** Técnico solo accede a archivos STL después de la aceptación del dentista.

---

### S4-09 — Adaptar el tab "Negociación" del UCH
**Tipo:** UI  
**Dependencias:** S4-03  
**Descripción:**  
El tab de "Negociación" en el UCH mostraba ofertas y contraofertas. En el nuevo modelo:

- **Para el dentista:** Este tab se renombra a "Propuesta" y muestra el resumen de la propuesta aceptada (precio, plazo, fecha de aceptación). Sin detalle de técnico.
- **Para el técnico:** Este tab muestra el resumen de la invitación respondida (su cotización enviada) y la confirmación de la propuesta.

**Criterio de Done:** Tab renombrado y contenido actualizado para ambos roles.

---

### S4-10 — Ajustar el `addTechnicalCommentAction()` para el nuevo flujo
**Tipo:** Backend  
**Dependencias:** S4-04  
**Descripción:**  
Actualmente `addTechnicalCommentAction()` puede cambiar el estado a `enProgreso`. En el nuevo modelo:

- Si `isRevisionRequest=true`: estado → `enEjecucion` (no `enProgreso`)
- Si `isRevisionRequest=false`: comentario libre — sin cambio de estado

**Criterio de Done:** Action transiciona al estado correcto.

---

## Criterio de Done del Sprint Completo

- [ ] UCH sin selector de técnico ni acciones de marketplace
- [ ] Identidad del técnico anonimizada para el dentista
- [ ] Flujo completo de entregas funciona: enviar → revisar → aprobar/rechazar
- [ ] Despacho y recepción funcionan con nuevos estados
- [ ] STL bloqueados hasta aceptación del dentista
- [ ] Tab de negociación reconvertida a "Propuesta"
- [ ] Test manual del flujo completo: crear caso → propuesta → aceptar → entregar → aprobar

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Anonimización no consistente en todos los puntos del feed | Medio | Centralizar la anonimización en `getCaseEventsAction()` |
| Acciones existentes con guards del estado anterior | Alto | Revisar TODOS los guards de acciones relacionadas con el caso |
| UCH complejo con muchos conditional renders | Medio | Agregar tests de snapshots de UI por estado y rol |
