# Sprint 8 — Notificaciones Reales, Edge Cases y Estabilización

**Duración estimada:** 2 semanas  
**Objetivo:** Implementar notificaciones reales (email), manejar todos los casos borde del algoritmo, y estabilizar el sistema antes de uso en producción.  
**Prerrequisito:** Sprints 0–7 completados.

---

## Contexto

El sistema de notificaciones actual es un stub (`notifyUser()` retorna `{success: true}` sin enviar nada). Este sprint lo hace real. También cubre los edge cases más críticos que pueden romper el flujo: pool vacío, propuesta expirada, técnico suspendido, etc.

---

## Tareas

### S8-01 — Implementar notificaciones por email (Resend / Nodemailer)
**Tipo:** Backend — infraestructura  
**Dependencias:** Ninguna  
**Descripción:**  
Reemplazar el stub de `notifyUser()` con envío real de emails.

**Stack sugerido:** Resend (API simple, buen DX) o Nodemailer con SMTP.

**Plantillas de email a implementar:**

| Evento | Destinatario | Asunto |
|---|---|---|
| `NUEVA_INVITACION` | Técnico | "Tienes una nueva invitación de trabajo — responde antes de [HH:MM]" |
| `TRABAJO_CONFIRMADO` | Técnico | "¡Fuiste seleccionado! El cliente aceptó la propuesta — comienza el trabajo" |
| `PROPUESTA_LISTA` | Dentista | "Tu caso [DF-XXXX] tiene una propuesta lista para revisar" |
| `REVISION_PENDIENTE` | Dentista | "El técnico envió una nueva versión del diseño para [DF-XXXX]" |
| `CAMBIOS_SOLICITADOS` | Técnico | "El cliente solicitó ajustes al diseño de [DF-XXXX]" |
| `TRABAJO_APROBADO` | Técnico | "¡Diseño aprobado! Revisa los próximos pasos en [DF-XXXX]" |
| `CASO_DESPACHADO` | Dentista | "Tu trabajo está en camino — tracking: [número]" |
| `RECEPCION_CONFIRMADA` | Técnico | "El cliente confirmó la recepción. ¡Trabajo completado!" |
| `PROPUESTA_RECHAZADA_DENTISTA` | Técnico | "La propuesta para el caso no fue aceptada por el cliente" |
| `SUSPENSION_TEMPORAL` | Técnico | "Tu cuenta ha sido pausada temporalmente por no responder invitaciones" |
| `SIN_COTIZACIONES_FALLO` | Admin | "⚠️ Caso [DF-XXXX] sin cotizaciones disponibles — requiere intervención" |

**Archivo:** `lib/services/notifications.ts` (reemplazar stub)

**Variables de entorno nuevas:** `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`

**Criterio de Done:** Al menos 5 plantillas enviando emails reales en staging. Resto de plantillas funcionales pero pueden ser texto plano.

---

### S8-02 — Edge Case: Pool vacío o insuficiente
**Tipo:** Backend  
**Dependencias:** S2-03  
**Descripción:**  
Cuando `runSelectionAlgorithmAction()` no encuentra técnicos suficientes, el sistema debe:

1. **Primer intento:** Pool < N_invitados → ampliar criterio de liga 1 nivel hacia abajo
2. **Segundo intento:** Si aún insuficiente → ampliar a todas las ligas
3. **Sin técnicos en absoluto:**
   - `UPDATE clinical_case SET internal_status='sin_cotizaciones_fallo', status='cerrado'`
   - `logCaseEvent { action='FALLO_SIN_TECNICOS', ... }`
   - `notifyUser(adminId, 'SIN_COTIZACIONES_FALLO', {caseId})`
   - `notifyUser(doctorId, 'EVALUACION_FALLIDA', {caseId})`
   - El dentista ve en su dashboard: *"No encontramos laboratorios disponibles para tu caso en este momento. Te contactaremos pronto."*

**Criterio de Done:** El sistema no queda en estado indefinido. El dentista y admin son notificados.

---

### S8-03 — Edge Case: Ninguna cotización recibida
**Tipo:** Backend  
**Dependencias:** S2-07  
**Descripción:**  
Cuando `evaluateQuotesAction()` se ejecuta y no hay cotizaciones (`quoted`):

1. Reintentar: `runSelectionAlgorithmAction()` con parámetros ampliados (excluir los técnicos ya invitados del primer round)
2. Si segundo round también falla → notificar admin + dentista + cerrar caso

**Criterio de Done:** Al menos 1 reintento automático antes de fallar.

---

### S8-04 — Edge Case: Propuesta expirada sin acción del dentista
**Tipo:** Backend  
**Dependencias:** S3-03  
**Descripción:**  
Cuando `proposal_expires_at < now` y caso en `propuestaLista`:

1. Cerrar la propuesta: `status = 'cerrado'`, `internal_status = 'propuestaExpirada'`
2. Liberar técnico preseleccionado: `case_invitation.status = 'withdrawn'`, restablecer disponibilidad
3. Notificar al dentista: "Tu propuesta venció. Puedes crear un nuevo caso si lo deseas."

**Implementación:** Verificación lazy en `getCaseDetails()` + endpoint cron.

**Criterio de Done:** Propuestas expiradas se cierran limpiamente. Técnico liberado.

---

### S8-05 — Edge Case: Técnico seleccionado se vuelve no disponible antes de confirmación
**Tipo:** Backend  
**Dependencias:** S1-03, S3-01  
**Descripción:**  
Si un técnico está preseleccionado (`case_invitation.status='accepted'`) y antes de que el dentista acepte, el técnico cambia su disponibilidad a `false`:

- Opción A (recomendada): Ignorar el cambio de disponibilidad — el técnico ya está comprometido hasta que la propuesta expire o sea aceptada/rechazada. La disponibilidad bloqueada es parte del compromiso de cotizar.
- Implementar: Al cambiar `is_available=false`, verificar si hay `case_invitation` en `accepted`. Si hay, mostrar advertencia al técnico: *"Tienes una cotización en espera de confirmación. Tu disponibilidad se actualizará una vez resuelta."*

**Criterio de Done:** El técnico no puede "escapar" de una preselección cambiando disponibilidad.

---

### S8-06 — Edge Case: Técnico en período de suspensión
**Tipo:** Backend / UI  
**Dependencias:** S2-10  
**Descripción:**  
Cuando `user.suspended_until > now` para un técnico:

- Excluido del pool de selección (ya implementado en S2-03 filtro duro)
- En su dashboard: banner de aviso: *"Tu cuenta está temporalmente pausada hasta [fecha]. Esto ocurrió porque no respondiste 3 invitaciones consecutivas. Para reactivar, actualiza tu disponibilidad."*
- Botón: "Reactivar mi cuenta" → `toggleAvailabilityAction()` + reset `suspended_until=null`

**Criterio de Done:** Técnico suspendido ve el aviso y puede reactivarse.

---

### S8-07 — Edge Case: Técnico sin skills declaradas en el pool
**Tipo:** Backend  
**Dependencias:** S1-01, S2-03  
**Descripción:**  
Un técnico sin filas en `technician_skill` o con todos los niveles en 0 es excluido del pool con razón `'sin_habilidades_declaradas'`.

En la UI del técnico: el banner de "Completa tu perfil" (S1-07) es suficiente para cubrir este caso.

**Criterio de Done:** Técnicos sin skills no reciben invitaciones.

---

### S8-08 — Implementar ajuste de nivel efectivo por desempeño
**Tipo:** Backend  
**Dependencias:** S1-02, S7-01  
**Descripción:**  
Según `DentFlowAi_CajaNegra_Flujo.md §5.1`, si la calificación promedio de un técnico en un tipo específico cae consistentemente, el sistema puede reducir el nivel efectivo.

**Implementación v1 (simplificada):**
- No modificar `technician_skill.design_level` directamente
- Agregar columna `effective_design_level` y `effective_fabrication_level` que el algoritmo usa en vez del declarado
- Job periódico (o cron): Si calificación promedio para un work_type específico < 3.0 en los últimos 10 casos → `effective_level = MAX(declared_level - 1, 1)`
- Notificar al técnico cuando su nivel efectivo cambia

**Criterio de Done:** El algoritmo usa nivel efectivo, no solo el declarado.

---

### S8-09 — Test de integración del flujo completo
**Tipo:** Testing  
**Dependencias:** Sprints 0–8  
**Descripción:**  
Escribir tests de integración para el flujo completo de extremo a extremo:

```
1. Crear técnico con skills
2. Crear caso → verificar que llega a 'enEvaluacion'
3. Verificar que se crea case_invitation
4. Técnico responde cotización → verificar case_invitation.status='quoted'
5. evaluateQuotes → verificar que hay un ganador
6. buildProposal → verificar proposed_price con fee
7. Dentista acepta propuesta → caso en 'enEjecucion'
8. Técnico envía entrega → caso en 'enRevision'
9. Dentista aprueba → caso en 'disenoAprobado' (si sin fabricación)
```

**Criterio de Done:** Test pasa en ambiente de staging.

---

### S8-10 — Documentación del Motor de Selección (README interno)
**Tipo:** Documentación  
**Dependencias:** Sprints 0–8  
**Descripción:**  
Actualizar `ESTADO_DEL_ARTE.md` con:
- Nueva arquitectura del sistema orquestado
- Descripción del algoritmo con ejemplos de cálculo
- Nuevos estados del caso
- Guía de operación del admin (cómo usar el panel de configuración)

También crear `DentFlowAi_Motor_Seleccion_README.md` como referencia técnica para el equipo.

**Criterio de Done:** Documentación actualizada y clara.

---

## Criterio de Done del Sprint Completo

- [ ] Al menos 5 templates de email enviando en staging
- [ ] Pool vacío manejado sin estados indefinidos
- [ ] Propuestas expiradas se cierran limpiamente
- [ ] Técnicos suspendidos ven aviso y pueden reactivarse
- [ ] Test de integración del flujo completo pasa
- [ ] Documentación actualizada

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Resend/SMTP no configurado en producción | Alto | Configurar variables de entorno antes del deploy |
| Edge cases de timing (race conditions en cotizaciones) | Medio | Locks de transacción en DB para operaciones críticas |
| Test de integración lento o frágil | Bajo | Usar base de datos de test separada |

---

## Resumen de Dependencias Entre Sprints

```
Sprint 0 (DB) 
  ↓
Sprint 1 (Skills Técnico) ─────────────────────────────────────┐
  ↓                                                            │
Sprint 2 (Motor Selección Backend) ──────────────┐            │
  ↓                                               │            │
Sprint 3 (Propuesta Dentista)                    │            │
  ↓                                               │            │
Sprint 4 (UCH + Flujo Diseño) ◄──────────────────┘            │
  ↓                                                            │
Sprint 5 (Dashboard Técnico) ◄─────────────────────────────────┘
  ↓
Sprint 6 (Admin: Configuración Algoritmo)
  ↓
Sprint 7 (Admin: Monitoreo + Simulador)
  ↓
Sprint 8 (Notificaciones + Edge Cases + Testing)
```

**Paralelizable:** Sprints 4 y 5 pueden iniciarse en paralelo una vez Sprint 3 esté listo.  
**Paralelizable:** Sprints 6 y 7 pueden trabajarse en paralelo con Sprint 5.
