# Sprint 5 — Dashboard del Técnico: Invitaciones y Cotizaciones

**Duración estimada:** 1–2 semanas  
**Objetivo:** Reemplazar el marketplace del técnico con el nuevo flujo de invitaciones. El técnico recibe invitaciones, las ve en su dashboard y responde con su cotización dentro de la ventana de tiempo.  
**Prerrequisito:** Sprint 2 (invitaciones en DB), Sprint 4 (UCH adaptado).

---

## Contexto

El técnico ya no navega un marketplace. En cambio, recibe **invitaciones selectivas** enviadas por el algoritmo. Su dashboard principal es ahora una bandeja de invitaciones activas. El flujo de diseño (enviar entregas, etc.) permanece igual que antes — lo que cambia es la fase previa.

**Ruta nueva:** `/dashboard/invitations` reemplaza a `/dashboard/bids` y `/dashboard/marketplace`.

---

## Tareas

### S5-01 — Server Action `getMyInvitationsAction()`
**Tipo:** Backend  
**Dependencias:** S0-04 (case_invitation)  
**Descripción:**

```typescript
// Guard: role === 'tecnico'
// Query: case_invitation WHERE technician_id = identity.id
//        JOIN clinical_case ON case_invitation.clinical_case_id = clinical_case.id
//        ORDER BY invited_at DESC

// Retorna:
type InvitationItem = {
  id: string;                   // invitation id
  caseId: string;
  caseNumber: string;
  restorationType: string;
  material: string;
  urgency: string;
  caseComplexity: string;       // basico | intermedio | avanzado | critico
  serviceType: string;          // solo_diseno | integral
  status: string;               // pending | quoted | accepted | rejected | expired
  invitedAt: Date;
  expiresAt: Date;
  quotedPrice?: number;         // si ya respondió
  quotedDays?: number;          // si ya respondió
  isWinner?: boolean;           // si status=accepted O confirmed
};
```

**Criterio de Done:** Action retorna lista completa y tipada.

---

### S5-02 — Server Action `getInvitationDetailsAction(invitationId)`
**Tipo:** Backend  
**Dependencias:** S0-04, S5-01  
**Descripción:**

```typescript
// Guard: invitation.technician_id === identity.id
// Retorna:
// - Datos de la invitación
// - Datos del caso (specs completas: dientes, material, notas, urgencia)
// - Thumbnails de los scans (URLs firmadas) — SOLO si caso status='enEjecucion' o más avanzado
//   (antes de aceptación del dentista: solo metadatos, sin acceso a STL)
// - Si invitation.status='confirmed': acceso completo a archivos
```

**Criterio de Done:** Técnico puede ver detalles del caso en la invitación. STL bloqueados hasta confirmación.

---

### S5-03 — Crear página `/dashboard/invitations`
**Tipo:** UI — nueva página  
**Dependencias:** S5-01  
**Descripción:**  
Página principal del técnico. Organizada en 3 pestañas:

**Tab 1: "Nuevas" (invitaciones pending)**
- Lista de invitaciones pendientes de respuesta
- Cada tarjeta muestra: tipo de restauración, material, complejidad, countdown de expiración
- Badge urgente si `urgency === 'urgente' | 'prioritario'`
- Botón "Ver detalles y cotizar"

**Tab 2: "Mis cotizaciones" (quoted + accepted/rejected/expired)**
- Historial de cotizaciones enviadas
- Estado de cada una: Pendiente / Seleccionado / No seleccionado / Expirada
- Si "Seleccionado": badge verde + enlace al caso

**Tab 3: "En progreso" (casos en ejecución asignados al técnico)**
- Casos donde el técnico está activo (enEjecucion, enRevision, enFabricacion, enviado)
- Igual a la pestaña "En Progreso" del anterior `/dashboard/bids`

**Archivo:** `app/dashboard/invitations/page.tsx`

**Criterio de Done:** Las 3 pestañas muestran datos correctos. Navegación desde el menú lateral.

---

### S5-04 — Componente `InvitationCard`
**Tipo:** UI — nuevo componente  
**Dependencias:** S5-01  
**Descripción:**  
Tarjeta de invitación para la pestaña "Nuevas":

- Encabezado: tipo de restauración (con ícono)
- Info: material, urgencia badge, complejidad badge (Básico/Intermedio/Avanzado/Crítico)
- **Countdown visible**: "Tienes HH:MM:SS para responder"
- Color del countdown: verde → amarillo → rojo según tiempo restante
- Botón "Cotizar" → abre drawer/modal `QuoteFormDrawer`

**Archivo:** `components/invitations/InvitationCard.tsx`

**Criterio de Done:** Countdown animado funcional. Colores según urgencia temporal.

---

### S5-05 — Componente `QuoteFormDrawer`
**Tipo:** UI — nuevo componente  
**Dependencias:** S2-05 (submitQuoteAction)  
**Descripción:**  
Drawer lateral (o modal) que aparece al hacer clic en "Cotizar":

**Contenido:**
- Specs resumidas del caso (tipo, material, dientes, urgencia, notas del dentista)
- **Campo precio:** input numérico en CLP (mínimo 0, sin decimales)
- **Campo plazo:** select de días (1, 2, 3, 5, 7, 10, 15, 20, 30 días hábiles)
- **Nota técnica:** textarea de máx 200 caracteres (opcional) — texto de ayuda: *"Solo visible internamente para DentFlow"*
- Botón "Enviar cotización" → `submitQuoteAction()`
- Texto de advertencia: *"Tiempo restante para cotizar: HH:MM:SS"*

**Archivo:** `components/invitations/QuoteFormDrawer.tsx`

**Criterio de Done:** Formulario submite correctamente. Validaciones de precio mínimo y plazo. Estado de carga en botón.

---

### S5-06 — Actualizar menú lateral para el técnico
**Tipo:** UI  
**Dependencias:** S5-03  
**Descripción:**  
Reemplazar en el menú lateral del técnico:
- Eliminar: "Marketplace" y "Mis Ofertas"
- Agregar: "Invitaciones" → `/dashboard/invitations`

**Badge de no leídos:** Mostrar contador de invitaciones pendientes en el ícono del menú.

```typescript
// En el componente del menú:
// Llamar getMyInvitationsAction() y contar status='pending'
// Mostrar badge si count > 0
```

**Criterio de Done:** Menú actualizado. Badge de invitaciones pendientes visible.

---

### S5-07 — Vista de detalle de invitación con specs del caso
**Tipo:** UI  
**Dependencias:** S5-02, S5-04  
**Descripción:**  
Al hacer clic en "Ver detalles" de una invitación, navegar a una página de detalle:

`/dashboard/invitations/[invitationId]`

Mostrar:
- Specs completas del caso (restorationType, material, shade, teeth, urgency, notas del dentista)
- Si tiene scans disponibles: `DentalViewer3D` con los archivos (solo si están desbloqueados)
- Si no tiene acceso aún: mensaje "Los archivos serán accesibles una vez confirmado como ejecutor"
- `QuoteFormDrawer` o formulario inline para cotizar

**Criterio de Done:** Página de detalle funcional. Visor 3D condicional.

---

### S5-08 — Actualizar Dashboard del Técnico (KPIs nuevos)
**Tipo:** UI  
**Dependencias:** S5-01  
**Descripción:**  
Actualizar `/dashboard` para técnicos con los nuevos KPIs:

| KPI | Descripción |
|---|---|
| "Invitaciones pendientes" | Requieren cotización — destacar con badge |
| "Cotizaciones enviadas" | En espera de selección |
| "Casos activos" | En ejecución, revisión o fabricación |
| "Completados (mes)" | Casos cerrados en los últimos 30 días |

**Criterio de Done:** Dashboard actualizado. KPI de invitaciones es el más prominente.

---

### S5-09 — Notificación visual cuando el técnico es seleccionado ganador
**Tipo:** UI  
**Dependencias:** S3-01 (acceptProposalAction)  
**Descripción:**  
Cuando el dentista acepta la propuesta, el técnico debe ver en su dashboard:
- En la pestaña "Mis cotizaciones": la invitación marcada como "¡Seleccionado!" con badge verde
- Toast de bienvenida si está conectado al momento

El técnico ve el estado del caso como `enEjecucion` en la pestaña "En progreso" y puede acceder al caso para iniciar el trabajo.

**Criterio de Done:** Técnico puede identificar claramente cuándo fue seleccionado.

---

### S5-10 — Eliminar páginas de marketplace (limpieza final)
**Tipo:** Código  
**Dependencias:** S5-03 (nueva página de invitaciones lista)  
**Descripción:**  
Ahora que la nueva UI está lista, eliminar (o archivar) las páginas antiguas:
- `app/dashboard/marketplace/` → eliminar
- `app/dashboard/bids/` → eliminar

Redirigir cualquier URL antigua a `/dashboard/invitations`.

**Criterio de Done:** Rutas antiguas retornan 404 o redirect. No hay referencias huérfanas en el código.

---

## Criterio de Done del Sprint Completo

- [ ] `/dashboard/invitations` funcional con las 3 pestañas
- [ ] `InvitationCard` con countdown animado
- [ ] `QuoteFormDrawer` funcional con validaciones
- [ ] Menú lateral actualizado con badge de pendientes
- [ ] Dashboard del técnico con nuevos KPIs
- [ ] Técnico seleccionado como ganador ve indicador claro
- [ ] Páginas de marketplace eliminadas

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Técnicos activos desconcertados al no encontrar el marketplace | Alto | Comunicación previa al deploy. Banner de transición |
| Countdown no sincronizado con el servidor | Medio | Usar `expires_at` del servidor, actualizar al cargar la página |
| Técnico cotiza fuera del plazo (race condition) | Medio | Guard en `submitQuoteAction()` verifica `now < expires_at` |
