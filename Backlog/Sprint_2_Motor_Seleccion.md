# Sprint 2 — Motor de Selección (Backend: Algoritmo + Invitaciones + Cotizaciones)

**Duración estimada:** 2 semanas  
**Objetivo:** Implementar el núcleo de la Caja Negra: clasificación del caso, algoritmo de selección de técnicos, envío de invitaciones y recolección de cotizaciones.  
**Prerrequisito:** Sprint 0 (tablas), Sprint 1 (skills de técnicos).

---

## Contexto

Este sprint es el corazón del nuevo modelo. Toda la lógica es **backend puro** — no hay UI para el dentista todavía (eso es Sprint 3). El técnico tampoco tiene UI aún (Sprint 5). Sin embargo, se necesita una ruta mínima para que el técnico pueda responder a invitaciones durante las pruebas.

El flujo implementado en este sprint:
```
Dentista crea caso → submitCaseToBlackBoxAction() 
  → classifyCaseAction() 
  → runSelectionAlgorithmAction() 
  → sendInvitationsAction()
  → [técnicos responden via submitQuoteAction()]
  → evaluateQuotesAction()
  → buildProposalAction()  ← resultado: propuesta lista para Sprint 3
```

---

## Tareas

### S2-01 — Server Action `classifyCaseAction(caseId)`
**Tipo:** Backend  
**Dependencias:** S0-05 (campo `caseComplexity`, `serviceType`)  
**Descripción:**  
Analiza los datos del caso y asigna complejidad y tipo de servicio. Se ejecuta automáticamente al crear el caso.

```typescript
// Guard: isSystemAdmin OR caseId pertenece a organización del dentista autenticado

function classifyCase(caso: ClinicalCase): { complexity: string, serviceType: string } {
  // Reglas de complejidad:
  // 'basico': restorationType IN ('corona_anterior', 'corona_posterior', 'inlay', 'onlay', 'carilla')
  //           AND teeth.length === 1
  // 'intermedio': restorationType IN ('puente', 'corona_implante') AND teeth.length <= 3
  //              OR 'carilla' AND teeth.length <= 4
  // 'avanzado': teeth.length >= 4 OR restorationType IN ('full_arch', 'protesis_parcial', 'sobredentadura', 'barra')
  // 'critico': múltiples tipos combinados OR 'guia_quirurgica_compleja' OR alta_exigencia_estetica

  // Tipo de servicio:
  // 'solo_diseno': needsFabrication === false
  // 'integral': needsFabrication === true
}

// Efectos:
// UPDATE clinical_case SET case_complexity=..., service_type=..., internal_status='clasificando'
// logCaseEvent { type='sistema', action='CASO_CLASIFICADO', payload={complexity, serviceType}, dentistOnly: true }
```

**Criterio de Done:** Función clasifica correctamente los 4 niveles de complejidad con los tipos de restauración existentes.

---

### S2-02 — Server Action `calculateTechnicianScore(technicianId, caseId)`
**Tipo:** Backend — función interna (no expuesta como Server Action directa)  
**Dependencias:** S0-01 (technician_skill), S0-06 (user fields)  
**Descripción:**  
Implementa la fórmula: `S = α₁·Q + α₂·P + α₃·E - α₄·C + α₅·B`

```typescript
async function calculateTechnicianScore(
  technicianId: string,
  caseWorkType: string,
  serviceType: 'solo_diseno' | 'integral',
  config: AlgorithmConfig
): Promise<number> {
  
  // Q — Calidad Histórica
  // Promedio ponderado de review.rating del técnico en los últimos config.w_quality_days días
  // Normalizado a 0.0–1.0 (rating es 1–5, dividir por 5)
  
  // P — Puntualidad
  // casos con delivery en plazo / total casos completados
  // "en plazo" = clinical_case.completedAt <= assignedAt + (offerta de días × 86400 seg)
  // Fuente: case_invitation WHERE status='accepted' AND responded = true
  
  // E — Experiencia en el tipo de caso
  // FROM technician_skill WHERE user_id=technicianId AND work_type=caseWorkType
  // level = design_level (si solo_diseno) OR MIN(design_level, fabrication_level) (si integral)
  // E = level / 7
  
  // C — Índice de Carga Reciente
  // Invitaciones recibidas en los últimos config.w_load_days días
  // C = MIN(count_invitations / avg_invitations_liga, config.c_max)
  
  // B — Bono de Infrautilización
  // Días desde last_invited_at / config.d_bonus_max_days, máx 1.0
  
  return (
    config.alpha_quality * Q +
    config.alpha_punctuality * P +
    config.alpha_experience * E -
    config.alpha_load * C +
    config.alpha_bonus * B
  );
}
```

**Criterio de Done:** Función retorna un número entre 0 y 1.2 (aprox). Tests unitarios para cada componente (Q, P, E, C, B).

---

### S2-03 — Server Action `runSelectionAlgorithmAction(caseId)`
**Tipo:** Backend  
**Dependencias:** S2-01, S2-02, S0-02 (algorithm_config)  
**Descripción:**  
Ejecuta el filtro duro + algoritmo de selección probabilística.

```typescript
// 1. Leer algorithm_config (fila activa)
// 2. Obtener TODOS los técnicos activos (is_available=true, role='tecnico')
// 3. Aplicar FILTRO DURO — excluir técnicos que:
//    - is_available = false
//    - suspended_until > now
//    - No tienen skill para el work_type del caso con level suficiente para la liga requerida
//    - Fueron invitados para el mismo work_type hace menos de T_cooldown horas
//    - No han iniciado sesión en más de D_inactividad días
//    - consecutive_no_response >= 3 (modo revisión de disponibilidad)
// 4. Para cada técnico del pool elegible: calculateTechnicianScore()
// 5. Selección probabilística ponderada (N_invitados técnicos)
//    - Probabilidad_i = S_i / Σ(S_j)
//    - Sorteo sin reemplazo
// 6. Cuota de piso: si ninguno del cuartil inferior quedó, reemplazar el de menor score
// 7. Si pool < N_invitados: ampliar criterio de liga 1 nivel hacia abajo y reintentar
// 8. Si pool = 0: internal_status = 'sin_cotizaciones_fallo' + notificar admin

// Efectos:
// UPDATE clinical_case SET internal_status='seleccionandoTecnicos'
// Retorna: array de technician_ids seleccionados
```

**Criterio de Done:** Función retorna lista de IDs. El algoritmo probabilístico es reproducible con seed conocida (para debugging).

---

### S2-04 — Server Action `sendInvitationsAction(caseId, technicianIds[])`
**Tipo:** Backend  
**Dependencias:** S0-04 (case_invitation), S2-03  
**Descripción:**

```typescript
// Para cada technicianId:
// 1. INSERT INTO case_invitation {
//      clinical_case_id, technician_id, status='pending',
//      invited_at=now, expires_at=now + T_cotizacion minutos,
//      score_at_invite = score calculado
//    }
// 2. UPDATE user SET last_invited_at=now WHERE id=technicianId
// 3. logCaseEvent { type='sistema', action='INVITACION_ENVIADA',
//                   payload={technicianId, expiresAt}, dentistOnly:true }
// 4. notifyUser(technicianId, 'NUEVA_INVITACION', {caseId, expiresAt})

// UPDATE clinical_case SET internal_status='cotizacionesAbiertas', 
//                           internalStatus='cotizacionesAbiertas'
```

**Criterio de Done:** Invitaciones creadas en DB. Técnicos notificados (stub por ahora).

---

### S2-05 — Server Action `submitQuoteAction(invitationId, price, deliveryDays, notes?)`
**Tipo:** Backend (técnico)  
**Dependencias:** S0-04  
**Descripción:**

```typescript
// Guard: invitation.technician_id === identity.id
// Guard: invitation.status === 'pending'
// Guard: now < invitation.expires_at

// Efectos:
// UPDATE case_invitation SET {
//   status='quoted', quoted_price=price, quoted_days=deliveryDays,
//   tech_notes=notes, responded_at=now
// }
// logCaseEvent { type='sistema', action='COTIZACION_RECIBIDA', 
//                payload={invitationId, technicianId}, dentistOnly:true }

// Si es la última cotización pendiente O la ventana expiró:
// → llamar evaluateQuotesAction(caseId)
```

**Criterio de Done:** Cotización guardada. Validaciones de tiempo y estado correctas.

---

### S2-06 — Job/Cron: Cerrar ventana de cotizaciones al expirar
**Tipo:** Backend — lógica de expiración  
**Dependencias:** S2-04  
**Descripción:**  
En ausencia de un job scheduler real (no hay Cron en Next.js sin infraestructura adicional), implementar como verificación lazy:

- Al llamar cualquier Server Action relacionada con el caso, verificar si `case_invitation.expires_at < now` para invitaciones pendientes.
- Si expiradas: llamar `evaluateQuotesAction()`.
- Alternatizar: `/api/cron/evaluate-quotes` endpoint que puede llamarse desde un cron externo (Vercel Cron Jobs o similar).

**Nota:** Esta es deuda técnica aceptada para v1. En producción real se necesita un job scheduler.

**Criterio de Done:** La evaluación se dispara cuando la ventana expira, sea por verificación lazy o endpoint de cron.

---

### S2-07 — Server Action `evaluateQuotesAction(caseId)`
**Tipo:** Backend — sistema  
**Dependencias:** S2-05  
**Descripción:**

```typescript
// Leer todas las cotizaciones: case_invitation WHERE clinical_case_id=caseId AND status='quoted'
// Si ninguna:
//   internal_status = 'sin_cotizaciones_fallo'
//   Notificar admin
//   return

// Leer Q_minima_seleccion (configurable, default 0.60)
// Filtrar: excluir técnicos con Q < Q_minima_seleccion

// Ordenar por: menor precio, dado menor o igual plazo al promedio
// Promedio de plazos = AVG(quoted_days) de todas las cotizaciones

// Desempate precio+plazo exacto: mayor antigüedad (created_at ASC)

// Técnico ganador:
// UPDATE case_invitation SET status='accepted' WHERE id=winner.id
// UPDATE case_invitation SET status='rejected' WHERE clinical_case_id=caseId AND id != winner.id

// UPDATE clinical_case SET {
//   assigned_technician_id = winner.technician_id,
//   assigned_at = now,
//   internal_status = 'propuestaGenerada'
// }

// → llamar buildProposalAction(caseId, winner)
```

**Criterio de Done:** Técnico ganador seleccionado. Invitaciones perdedoras marcadas como rejected.

---

### S2-08 — Server Action `buildProposalAction(caseId)`
**Tipo:** Backend — sistema  
**Dependencias:** S2-07, S0-02 (algorithm_config.platform_fee)  
**Descripción:**

```typescript
// Leer la cotización aceptada
// Calcular: proposed_price = quoted_price × (1 + platform_fee)
// Calcular: proposal_expires_at = now + T_propuesta_dentista horas

// UPDATE clinical_case SET {
//   proposed_price = ...,
//   proposed_delivery_days = winner.quoted_days,
//   platform_fee = config.platform_fee,
//   proposal_expires_at = ...,
//   status = 'propuestaLista',           // ← primer estado VISIBLE al dentista
//   internal_status = 'propuestaPresentada',
//   current_responsibility = 'dentista'
// }

// logCaseEvent { type='sistema', action='PROPUESTA_GENERADA',
//                content='Tu caso fue evaluado. Hay una propuesta lista para revisión.',
//                stateChange={from:'enEvaluacion', to:'propuestaLista'} }

// notifyUser(doctorId, 'PROPUESTA_LISTA', { caseId, expiresAt })
```

**Criterio de Done:** Caso tiene `status='propuestaLista'` con precio y plazo correctos. El técnico preseleccionado permanece en estado reservado (`case_invitation.status='accepted'` pero caso aún no en ejecución).

---

### S2-09 — Modificar `createClinicalCaseAction()` para disparar la caja negra
**Tipo:** Backend  
**Dependencias:** S2-01, S2-03, S2-04  
**Descripción:**  
Actualmente `createClinicalCaseAction()` crea el caso en `borrador`. El nuevo flujo:

```typescript
// Al llamar createClinicalCaseAction():
// 1. INSERT clinical_case { status='enEvaluacion', internal_status='caso_recibido' }
// 2. (En background o en la misma transacción):
//    → classifyCaseAction(caseId)
//    → runSelectionAlgorithmAction(caseId)
//    → sendInvitationsAction(caseId, selectedTechIds)

// NOTA: El paso de "Borrador" YA NO EXISTE en el nuevo flujo.
// El dentista crea el caso completo en el wizard y lo envía directamente.
```

**Importante:** El wizard `CaseCreationWizard` debe ajustarse: el botón final ya no dice "Guardar borrador" ni "Publicar" — dice **"Enviar caso"**.

**Criterio de Done:** Al crear un caso, se dispara automáticamente el pipeline de la caja negra.

---

### S2-10 — Penalización por no responder a invitación
**Tipo:** Backend  
**Dependencias:** S2-06  
**Descripción:**

```typescript
// Cuando una invitación expira con status='pending' (técnico no respondió):
// UPDATE user SET consecutive_no_response = consecutive_no_response + 1
// Si consecutive_no_response >= 3:
//   UPDATE user SET suspended_until = now + 48h (configurable)
//   notifyUser(technicianId, 'SUSPENSION_TEMPORAL', {reason: 'no_response', until: ...})
// Resetear consecutive_no_response = 0 cuando el técnico responde exitosamente
```

**Criterio de Done:** Contador incrementa. Suspensión temporal activa al tercer incumplimiento.

---

## Criterio de Done del Sprint Completo

- [ ] Pipeline completo: crear caso → clasificar → seleccionar → invitar → cotizar → evaluar → propuesta
- [ ] `algorithm_config` se lee desde DB (no hardcodeado)
- [ ] Fórmula de score implementada con todos los componentes (Q, P, E, C, B)
- [ ] Selección probabilística funcionando
- [ ] Caso llega a `status='propuestaLista'` al final del pipeline
- [ ] Tests unitarios para `calculateTechnicianScore()` con casos borde
- [ ] Penalización por no responder activa

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pool de técnicos vacío en ambiente de prueba | Alto | Crear técnicos de prueba con skills declaradas |
| Métricas Q y P no tienen datos históricos aún | Medio | Valores por defecto neutrales (Q=0.5, P=0.8) para técnicos nuevos |
| Expiración de invitaciones sin scheduler real | Alto para producción | Implementar endpoint de cron + verificación lazy como fallback |
| Platform fee puede dar precios inesperados | Bajo | Logs detallados de cada cálculo en `internal_status` |
