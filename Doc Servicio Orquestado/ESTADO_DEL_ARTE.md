# DentFlowAi — Estado del Arte
## Documentación técnica del sistema actual (v1)
> Generado: 2026-04-28 | Base para rediseño de modelo de negocio

---

## Índice

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Arquitectura Técnica](#2-arquitectura-técnica)
3. [Schema de Base de Datos](#3-schema-de-base-de-datos)
4. [Roles y Autenticación](#4-roles-y-autenticación)
5. [Ciclo de Vida de un Caso Clínico](#5-ciclo-de-vida-de-un-caso-clínico)
6. [Sistema de Marketplace y Ofertas](#6-sistema-de-marketplace-y-ofertas)
7. [Flujo Iterativo de Diseño](#7-flujo-iterativo-de-diseño)
8. [Unified Case Hub (UCH) — Sistema de Eventos](#8-unified-case-hub-uch--sistema-de-eventos)
9. [Sistema de Archivos y Almacenamiento GCS](#9-sistema-de-archivos-y-almacenamiento-gcs)
10. [Notificaciones](#10-notificaciones)
11. [Páginas y Navegación](#11-páginas-y-navegación)
12. [Constantes, Enums y Tipos](#12-constantes-enums-y-tipos)
13. [Panel de Administración](#13-panel-de-administración)
14. [Componentes Clave](#14-componentes-clave)
15. [Seguridad e Invariantes](#15-seguridad-e-invariantes)
16. [Decisiones Técnicas y Deuda](#16-decisiones-técnicas-y-deuda)

---

## 1. Visión General del Sistema

DentFlowAi es un **marketplace B2B SaaS** que conecta **clínicas dentales** (dentistas) con **laboratorios técnicos** para la gestión digital de prótesis dentales CAD/CAM.

### Propuesta de Valor Actual
- Dentista crea un caso clínico con especificaciones (material, restauración, dientes, scans 3D)
- Publica el caso al marketplace para recibir ofertas de laboratorios
- Selecciona el laboratorio ganador y gestiona el flujo de diseño iterativo
- Laboratorio entrega archivos versionados; dentista aprueba o solicita cambios
- Flujo de fabricación y despacho físico (si aplica)

### Stack Tecnológico
- **Frontend + Backend:** Next.js 15 App Router (fullstack)
- **Base de Datos:** PostgreSQL con Drizzle ORM
- **Autenticación:** NextAuth.js v5 (credentials provider + JWT)
- **Almacenamiento:** Google Cloud Storage (GCS) con URLs firmadas v4
- **3D Rendering:** Three.js + React Three Fiber
- **UI:** Tailwind CSS + Framer Motion
- **Despliegue:** Vercel (inferido)

---

## 2. Arquitectura Técnica

### Patrón de Acceso a Datos
```
Client Component → Server Action → Drizzle ORM → PostgreSQL
                                ↓
                           getServerIdentity()  ← NextAuth session + cookie impersonación
```

Todos los datos se acceden exclusivamente via **Server Actions** (`'use server'`). No hay endpoints REST/API excepto `/api/auth/[...nextauth]` y `/api/telemetry`.

### Resolución de Identidad
Todas las Server Actions usan `getServerIdentity()` como primer paso de autorización:

```typescript
// lib/db/actions/impersonation.ts
async function getServerIdentity(): Promise<Identity | null> {
  const session = await auth();           // NextAuth session
  const impersonateCookie = cookies().get('dentflow_impersonate_id');

  if (impersonateCookie && session?.user?.role === 'admin') {
    // Admin simulando otro usuario
    return buildIdentity(impersonateCookie.value, { isSimulating: true });
  }
  return buildIdentity(session.user.id);
}

// Retorna:
{
  id: string;            // ID del usuario activo (real o simulado)
  orgId: string;         // UUID de organización
  role: 'dentista' | 'tecnico' | 'admin';
  fullName: string;
  email: string;
  isSimulating: boolean;
  isSystemAdmin: boolean;
  adminId?: string;      // ID real del admin si está simulando
}
```

### Patrón de Retorno de Acciones
```typescript
// lib/types/actions.ts
type ActionResult<T = undefined> =
  | (T extends undefined ? { success: true } : { success: true } & T)
  | { success: false; error: string };

// Ejemplo de uso:
async function acceptBidAction(...): Promise<ActionResult>
async function createBidAction(...): Promise<ActionResult<{ id: string }>>
```

---

## 3. Schema de Base de Datos

### Tabla: `organization`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | Generado automático |
| name | text | Nombre de la organización |
| rut | text UNIQUE | Identificador fiscal (RUT chileno) |
| type | text | `'clinica'` \| `'laboratorio'` (default: `'clinica'`) |
| logoUrl | text | URL del logo |
| isActive | boolean | Controla acceso (default: true) |
| address | jsonb | `{street, city, region, country}` |
| phone | text | Teléfono de contacto |
| billingEmail | text | Email de facturación |
| giro | text | Giro comercial |
| legalAddress | text | Domicilio legal |
| technicalCapabilities | jsonb | Array `['CAM', 'digital_scan', ...]` |
| createdAt / updatedAt | timestamp | Auditoría temporal |

**Índice:** `organization_rut_uidx` (unique)

---

### Tabla: `user`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | text PK | ID manual (NextAuth compatible) |
| organizationId | uuid FK | → organization.id |
| email | text UNIQUE | Email de acceso |
| fullName | text | Nombre completo |
| hashedPassword | text | bcrypt hash |
| isActive | boolean | Permite bloquear acceso |
| role | text | `'dentista'` \| `'tecnico'` \| `'admin'` |
| onboardingStep | integer | Progreso 0-100 |
| phone | text | Teléfono |
| specialty | text | Especialidad profesional |
| registrationNumber | text | Nº de registro profesional |
| experienceYears | integer | Años de experiencia |
| bio | text | Descripción breve |
| image | text | Ruta GCS del avatar |
| subRoles | jsonb | Roles secundarios |
| emailVerified | timestamp | Fecha de verificación |

**Índices:** `user_email_uidx`, `user_organizationId_idx`

---

### Tabla: `clinical_case` (tabla central)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| organizationId | uuid FK | Org propietaria (cascade delete) |
| doctorId | text FK | → user.id (dentista propietario) |
| caseNumber | text UNIQUE | `DF-XXXX` generado con secuencia |
| internalName | text | Nombre interno del caso |
| patientIdAnon | text | ID anonimizado del paciente |
| status | text | Estado actual (ver sección 5) |
| urgency | text | `baja \| normal \| alta \| urgente \| prioritario` |
| restorationType | text | Tipo de restauración dental |
| material | text | Material de fabricación |
| shade | text | Color VITA |
| teeth | jsonb | Array de números de dientes seleccionados |
| needsFabrication | boolean | Si requiere fabricación física |
| doctorNotes | text | Instrucciones del dentista |
| notesEsthetic | text | Notas estéticas |
| notesOclusal | text | Notas oclusales |
| labNotes | text | Notas internas del laboratorio |
| assignedTechnicianId | text FK | → user.id del técnico ganador |
| currentResponsibility | text | `'dentista'` \| `'tecnico'` — turno actual |
| commercialVersion | integer | Nº de ronda comercial (default: 1) |
| changeSummary | text | Resumen de cambios en republicación |
| isArchived | boolean | Caso archivado operativamente |
| canBeDeleted | boolean | Flag de control de deleción |
| dispatchInfo | jsonb | `{courier, trackingId, status, photos[], shippedAt}` |
| pendingActionRequest | text | Tipo de solicitud de flujo pendiente |
| pendingActionActor | text | Quién solicita el cambio |
| assignedAt | timestamp | Cuando se asignó el técnico |
| startedAt | timestamp | Cuando técnico inició trabajo |
| completedAt | timestamp | Cuando se marcó como terminado |
| lastActivityAt | timestamp | Última modificación |
| createdAt / updatedAt | timestamp | Auditoría |

**Índices:** `clinical_case_case_number_uidx`, `clinical_case_assignedTechnicianId_idx`, `clinical_case_organizationId_idx`

---

### Tabla: `commercial_round`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id |
| roundNumber | integer | Número secuencial de ronda (1, 2, 3...) |
| version | integer | `commercialVersion` del caso al abrir esta ronda |
| versionAtStart | integer | Versión del caso cuando inició |
| status | text | `'active'` \| `'closed'` \| `'withdrawn'` |
| startDate | timestamp | Inicio de la ronda |
| endDate | timestamp | Cierre (si aplica) |
| specsSnapshot | jsonb | Fotografía de specs al abrir ({internalName, teeth, material, shade, restorationType, urgency, ...}) |
| createdAt | timestamp | Auditoría |

**Propósito:** Garantiza que las especificaciones del caso no cambien mientras hay una ronda de licitación activa. El snapshot permite auditar qué specs tenía cada oferta.

**Índice:** `commercial_round_clinicalCaseId_idx`

---

### Tabla: `bid`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id |
| technicianId | text FK | → user.id del técnico |
| roundId | uuid FK | → commercial_round.id |
| price | doublePrecision | Precio ofertado en CLP |
| deliveryDays | integer | Plazo en días/horas |
| deliveryType | text | `'days'` \| `'hours'` |
| notes | text | Nota técnica del laboratorio |
| status | text | `'pending'` \| `'accepted'` \| `'rejected'` |
| rejectionReason | text | Motivo de rechazo (si aplica) |
| createdAt / updatedAt | timestamp | Auditoría |

**Índices:** `bid_clinicalCaseId_idx`, `bid_technicianId_idx`

---

### Tabla: `clinical_case_delivery`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id (cascade) |
| technicianId | text FK | → user.id |
| version | integer | Número de entrega (1, 2, 3...) |
| notes | text | Nota del técnico con la entrega |
| files | jsonb | Array de rutas GCS `["organizations/.../file.stl"]` |
| status | text | `'pending'` \| `'approved'` \| `'rejected'` |
| reviewedAt | timestamp | Cuándo el dentista la revisó |
| reviewComment | text | Comentario del dentista al revisar |
| createdAt | timestamp | Cuándo se envió |

> **Decisión de diseño:** `files` es JSONB (array de strings) en lugar de tabla separada. Esta decisión se tomó porque los archivos de entrega son inmutables y siempre se acceden como conjunto. No usar FK permite mayor flexibilidad pero no hay integridad referencial.

---

### Tabla: `clinical_case_event` (Unified Case Hub)
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id (cascade) |
| userId | text FK | → user.id (autor del evento) |
| type | text | `'negociacion'` \| `'tecnico'` \| `'sistema'` |
| action | text | Acción específica (ver tabla de eventos §8) |
| content | text | Descripción legible para el usuario |
| payload | jsonb | Datos técnicos del evento |
| stateChange | jsonb | `{from?: string, to?: string}` |
| createdAt | timestamp | Timestamp del evento |

**Índice compuesto:** `clinical_case_event_case_created_idx` en `(clinical_case_id, created_at DESC)` — optimiza la query más común.

---

### Tabla: `file`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id (SET NULL on delete) |
| organizationId | uuid FK | → organization.id (cascade) |
| uploaderId | text FK | → user.id (cascade) |
| filename | text | Nombre original del archivo |
| gcsPath | text | Ruta en GCS: `organizations/{orgId}/cases/{caseId}/...` |
| category | text | `'scan'` \| `'photo'` \| `'reference'` \| `'delivery'` |
| subType | text | `'superior'` \| `'inferior'` \| `'bite'` (para scans) |
| size | integer | Tamaño en bytes |
| mimeType | text | MIME type del archivo |
| thumbnailPath | text | Ruta GCS de miniatura WebP (si existe) |
| createdAt / updatedAt | timestamp | Auditoría |

**Índices:** `file_clinicalCaseId_idx`, `file_organizationId_idx`

---

### Tabla: `annotation`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id (cascade) |
| userId | text FK | → user.id (cascade) |
| text | text | Contenido de la anotación |
| coordinates | jsonb | `{x: float, y: float, z: float}` — posición 3D |
| isResolved | boolean | Si fue marcada como resuelta |
| versionNum | integer | Versión de entrega donde se hizo |
| createdAt / updatedAt | timestamp | Auditoría |

**Índice:** `annotation_clinicalCaseId_idx`

---

### Tabla: `review`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| clinicalCaseId | uuid FK | → clinical_case.id (cascade) |
| reviewerId | text FK | → user.id |
| revieweeId | text FK | → user.id |
| rating | integer | 1–5 |
| comment | text | Comentario |
| createdAt | timestamp | |

---

### Tabla: `audit_log`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | uuid PK | |
| organizationId | uuid FK | → organization.id |
| userId | text FK | → user.id |
| action | text | `'FILE_DOWNLOADED'`, etc. |
| payload | jsonb | Datos del evento |
| createdAt / updatedAt | timestamp | |

**Índices:** `audit_log_organizationId_idx`, `audit_log_userId_idx`

---

### Tablas NextAuth Estándar
- `accounts`: Cuentas OAuth (no usadas actualmente)
- `sessions`: Sesiones JWT
- `verificationTokens`: Tokens de verificación de email

---

### Secuencia `case_number_seq`
Genera números DF-XXXX. Empieza en 1000. Accedida via `nextval('case_number_seq')`.

---

## 4. Roles y Autenticación

### Definición de Roles

#### **dentista**
- Pertenece a una `organization` de tipo `'clinica'`
- Puede: crear casos, publicarlos, gestionar ofertas, aprobar/rechazar entregas
- No puede: ver ofertas de técnicos competidores en el mismo caso, acceder a marketplace
- Restricción: Solo ve casos de su propia organización (por `orgId`)

#### **tecnico**
- Pertenece a una `organization` de tipo `'laboratorio'`
- Puede: ver casos publicados en marketplace, hacer ofertas, entregar archivos
- No puede: ver hilos de comunicación de técnicos competidores
- Restricción: Solo ve sus propios eventos cuando un caso está asignado a otro técnico

#### **admin**
- Detectado por: `role === 'admin'` en DB, O email `jaime.contreras.d@gmail.com`, O email `@dentflow.ai`
- Puede: Todo. Acceso completo, impersonación, purga de datos
- Impersonación via cookie `dentflow_impersonate_id` (httpOnly, secure, 1 día)

### Flujo de Autenticación

```
1. POST /api/auth/signin (credentials)
   ↓ auth.config.ts
2. Busca user por email (case-insensitive LOWER())
3. bcrypt.compare(password, hashedPassword)
4. Verifica isActive (bloqueo)
5. Normaliza rol admin (fuerza role='admin' si es master o @dentflow.ai)
6. Retorna JWT: { id, email, role, organizationId, isSystemAdmin }

7. Client-side: AuthContext.tsx
   - useSession() → userProfile
   - Verifica cookie dentflow_simulated_id (localStorage) → simulatedProfile
   - Expone el perfil activo (real o simulado)
```

### Registro de Usuarios
- **Dentista:** Crea nueva organización con RUT único, tipo='clinica'
- **Técnico:** Busca organización existente por RUT o crea nueva con tipo='laboratorio'
- Email único requerido
- Contraseña hasheada con bcrypt (salt rounds: 12)
- `onboardingStep=0` → redirige a `/onboarding`

---

## 5. Ciclo de Vida de un Caso Clínico

### Diagrama de Estados

```
[borrador] ──Publicar──→ [publicado] ──Aceptar Oferta──→ [aceptado]
    ↑                         │                               │
    │                    Retirar                        Iniciar Diseño
    └────────────────────────┘                               │
                                                         [enProgreso]
                                                             │
                                               ┌─── Enviar Entrega ───┐
                                               │                       ↓
                                               │                  [enRevision]
                                               │                       │
                                               │              ┌────────┴────────┐
                                         Solicitar        Aprobar         Solicitar
                                         Revisión (←)    Diseño           Ajustes
                                                              │                │
                                                              ↓                └──→ [enProgreso]
                                                        [terminado] ← (sin fabricación)
                                                              ↓ (con fabricación)
                                                        [fabricacion]
                                                              │
                                                         Despachar
                                                              ↓
                                                        [despachado]
                                                              │
                                                      Confirmar Recepción
                                                              ↓
                                                        [completado]

Paralelo (en cualquier estado activo):
[* ] ──Solicitar Pausa──→ [pausado] ──Reanudar──→ [enProgreso]
[* ] ──Solicitar Cancelación──→ [cancelado]
```

---

### Estado: `borrador`

**Acción de creación:** `createClinicalCaseAction(data)`

```typescript
// Entrada:
{
  organizationId, patientIdAnon, internalName, urgency,
  restorationType, material, shade, teeth, needsFabrication,
  doctorNotes, notesEsthetic, notesOclusal
}

// Efectos:
1. INSERT INTO clinical_case { status='borrador', commercialVersion=1, caseNumber='DF-XXXX' }
2. INSERT INTO commercial_round { roundNumber=1, status='active', specsSnapshot={...} }
3. logCaseEvent { type='negociacion', action='CREACION', payload={dentistOnly:true} }
   // dentistOnly=true → técnicos NUNCA ven este evento
```

**Transiciones disponibles:**
- → `publicado` via `updateClinicalCaseAction({status: 'publicado'})`
- Eliminar via `deleteClinicalCaseAction()` (si `canDeleteCase()` = true)
- Archivar via `archiveClinicalCaseAction()` (si no se puede eliminar)

**Edición de especificaciones:**
- `updateClinicalCaseAction(data)`: Actualiza cualquier campo clínico
- Si hay ronda activa: La edición NO invalida la ronda (specs fueron snapshotted)
- Si `data.status === 'publicado'`: logCaseEvent adicional `PUBLICACION`

---

### Estado: `publicado`

**Visibilidad:** Caso aparece en `getAvailableCasesMarketplace()` para técnicos que NO tienen bid activa.

**Acciones disponibles:**

#### `createBidAction(bidData)` — Solo técnicos
```typescript
// Guard: role === 'tecnico'
// Guard: caso en status='publicado'
// Entrada: { clinicalCaseId, price, deliveryDays, deliveryType, notes }

// Efectos:
1. INSERT INTO bid { status='pending', roundId=activeRound.id }
2. logCaseEvent { type='negociacion', action='OFERTA_RECIBIDA',
                  payload={bidId, technicianId, price, deliveryDays, deliveryType, notes} }
```

#### `rejectBidAction(bidId, reason?)` — Solo dentistas
```typescript
// Guard: dentista propietario del caso

// Efectos:
1. UPDATE bid SET status='rejected', rejectionReason=reason
2. logCaseEvent { type='negociacion', action='OFERTA_RECHAZADA', payload={bidId, technicianId} }
```

#### `deleteBidAction(bidId)` — Solo el técnico que la creó
```typescript
// Guard: bid.technicianId == identity.id AND bid.status == 'pending'

// Efectos:
1. DELETE FROM bid WHERE id=bidId
2. logCaseEvent { type='negociacion', action='OFERTA_RETIRADA', payload={bidId} }
```

#### `withdrawCaseAction()` — Solo dentista propietario
```typescript
// Guard: status === 'publicado' AND case.organizationId === identity.orgId

// Efectos (transacción):
1. GET active commercial_round
2. UPDATE commercial_round SET status='withdrawn', endDate=now
3. UPDATE bids SET status='rejected', rejectionReason='Caso retirado' WHERE status='pending' AND roundId=round.id
4. UPDATE clinical_case SET status='borrador'
5. logCaseEvent { type='sistema', action='RETIRO_PUBLICACION', stateChange={from:'publicado', to:'borrador'} }
```

---

### Estado: `aceptado`

**Transición:** `acceptBidAction(caseId, bidId, technicianId)` — Solo dentista

```typescript
// Toda la operación es atómica (db.transaction)

// Efectos:
1. UPDATE bid SET status='accepted'                    // Bid ganadora
2. GET bid.roundId → UPDATE commercial_round SET status='closed', endDate=now
3. GET all pending bids for this case (except winner)
4. UPDATE those bids SET status='rejected', rejectionReason='Caso asignado a otro técnico'
5. logCaseEvent { action='OFERTA_ACEPTADA',            // Mensaje al ganador
                  content='¡Tu oferta fue seleccionada! Inicia el proceso de diseño.',
                  payload={bidId, technicianId},
                  stateChange={from:'publicado', to:'aceptado'} }
6. FOR EACH rejected bid:
   logCaseEvent { action='OFERTA_RECHAZADA',           // Mensaje a cada perdedor
                  content='Gracias por tu propuesta. El caso fue asignado a otro laboratorio.',
                  payload={bidId: rb.id, technicianId: rb.technicianId} }
7. UPDATE clinical_case SET {
     status='aceptado',
     assignedTechnicianId=technicianId,
     assignedAt=now,
     currentResponsibility='tecnico'
   }
```

**En este estado:**
- Solo el técnico ganador puede actuar
- Los técnicos perdedores ven su propio evento `OFERTA_RECHAZADA` vía `payload.technicianId`
- El dentista espera que el técnico inicie diseño

---

### Estado: `enProgreso`

**Transición:** `startWorkAction(caseId)` — Solo técnico asignado

```typescript
// Guard: case.assignedTechnicianId === identity.id OR isSystemAdmin

// Efectos:
1. UPDATE clinical_case SET { status='enProgreso', startedAt=now, currentResponsibility='tecnico' }
2. logCaseEvent { type='sistema', action='TRABAJO_INICIADO',
                  content='El laboratorio ha iniciado el proceso de diseño.',
                  stateChange={from:'aceptado', to:'enProgreso'} }
```

**Acciones disponibles:**

#### `submitReviewAction(caseId, notes, files[])` — Técnico asignado
```typescript
// Guard: case.assignedTechnicianId === identity.id OR isSystemAdmin

// Efectos (transacción):
1. SELECT MAX(version) FROM clinical_case_delivery WHERE clinicalCaseId=caseId
   → nextVersion = max + 1 (o 1 si no hay)
2. INSERT INTO clinical_case_delivery { version=nextVersion, notes, files, status='pending' }
3. UPDATE clinical_case SET { status='enRevision', currentResponsibility='dentista' }
4. logCaseEvent { type='tecnico', action='REVISION_ENVIADA',
                  content=notes || `Entrega v${nextVersion} lista para revisión.`,
                  payload={deliveryVersion: nextVersion, files} }
5. notifyUser(doctorId, 'REVISION_PENDIENTE', {caseId, version: nextVersion})
```

#### `addTechnicalCommentAction(caseId, comment, isRevisionRequest, targetTechnicianId?)` — Ambos roles
```typescript
// Efectos:
// Si isRevisionRequest=true:
1. UPDATE clinical_case SET { status='enProgreso', currentResponsibility='tecnico', doctorNotes=comment }
2. logCaseEvent { action='REVISION_SOLICITADA' }

// Si isRevisionRequest=false (comentario libre):
logCaseEvent { action='COMENTARIO_TECNICO' }
```

#### `transitionToManufacturingAction(caseId)` — Técnico asignado
```typescript
// Transición a fabricación (cuando needsFabrication=true)
// Efectos:
1. UPDATE clinical_case SET status='fabricacion'
2. logCaseEvent { type='tecnico', action='FABRICACION_INICIADA' }
```

---

### Estado: `enRevision`

**Situación:** Técnico envió entrega, dentista debe revisar.

**Acciones disponibles:**

#### `approveWorkAction(caseId)` — Solo dentista
```typescript
// Guard: case.organizationId === identity.orgId OR isSystemAdmin

// Efectos (transacción):
1. UPDATE clinical_case_delivery SET status='approved', reviewedAt=now WHERE status='pending'
2. Determina siguiente estado:
   // Por defecto en la app actual: siempre → 'terminado'
   // (El flujo de fabricación puede activarse via transitionToManufacturingAction)
3. UPDATE clinical_case SET { status='terminado', completedAt=now, currentResponsibility=null }
4. logCaseEvent { type='sistema', action='TRABAJO_APROBADO',
                  stateChange={from:'enRevision', to:'terminado'} }
5. notifyUser(assignedTechnicianId, 'TRABAJO_APROBADO', {caseId})
```

#### `requestRevisionAction(caseId, reason)` — Solo dentista
```typescript
// Guard: case.organizationId === identity.orgId OR isSystemAdmin

// Efectos (transacción):
1. UPDATE clinical_case_delivery SET status='rejected', reviewedAt=now, reviewComment=reason
   WHERE status='pending'
2. UPDATE clinical_case SET {
     status='enProgreso',
     doctorNotes=reason,
     currentResponsibility='tecnico'
   }
3. logCaseEvent { type='sistema', action='REVISION_SOLICITADA',
                  content=reason,
                  payload={reason},
                  stateChange={from:'enRevision', to:'enProgreso'} }
4. notifyUser(assignedTechnicianId, 'CAMBIOS_SOLICITADOS', {caseId, reason})
```

---

### Estado: `fabricacion`

**Transición:** `transitionToManufacturingAction()` (manual) o desde `approveWorkAction()` si `needsFabrication=true`.

#### `registerDispatchAction(caseId, dispatchData)` — Técnico asignado
```typescript
// Entrada: { courier: string, trackingId: string, photos?: string[] }

// Efectos:
1. UPDATE clinical_case SET {
     status='despachado',
     dispatchInfo={courier, trackingId, status:'shipped', shippedAt:now, photos}
   }
2. logCaseEvent { type='tecnico', action='CASO_DESPACHADO' }
3. notifyUser(doctorId, 'CASO_DESPACHADO', {caseId})
```

---

### Estado: `despachado`

#### `confirmReceptionAction(caseId)` — Solo dentista
```typescript
// Guard: case.doctorId === identity.id

// Efectos:
1. UPDATE clinical_case SET { status='completado', dispatchInfo.status='delivered' }
2. logCaseEvent { type='sistema', action='RECEPCION_CONFIRMADA' }
3. notifyUser(assignedTechnicianId, 'RECEPCION_CONFIRMADA', {caseId})
```

---

### Estado: `terminado` / `completado`

**Acciones disponibles:**
- `submitUserRatingAction(caseId, revieweeId, rating, comment?)`: Ambos pueden calificar
- `archiveClinicalCaseAction()`: Mover a archivo operativo

---

### Estados `pausado` y `cancelado` (flujo bilateral)

#### `requestFlowChangeAction(caseId, type, reason)` — Cualquier parte
```typescript
// type: 'pausa' | 'cancelacion'

// Efectos:
UPDATE clinical_case SET {
  pendingActionRequest = type,   // 'pausa' | 'cancelacion'
  pendingActionActor = identity.id
}
// La otra parte ve en UCH: "Solicitud pendiente: {type}"
```

#### `resolveFlowRequestAction(caseId, approved)` — La otra parte
```typescript
// Guard: identity.id !== pendingActionActor (no puedes aprobar tu propia solicitud)

// Si approved=true:
UPDATE clinical_case SET {
  status = pendingActionRequest === 'pausa' ? 'pausado' : 'cancelado',
  pendingActionRequest = null,
  pendingActionActor = null
}
logCaseEvent { type='sistema', action='PAUSADO' | 'CANCELADO' }

// Si approved=false:
UPDATE clinical_case SET { pendingActionRequest=null, pendingActionActor=null }
```

#### `resumeWorkAction(caseId, comment)` — Técnico
```typescript
// Guard: status === 'pausado'
UPDATE clinical_case SET { status='enProgreso', currentResponsibility='tecnico' }
logCaseEvent { type='sistema', action='REANUDADO' }
```

---

### Control de Deleción (`canDeleteCase`)
```typescript
// Retorna false si:
// 1. Hay bids de cualquier tipo (COUNT(bids) > 0)
// 2. Tiene técnico asignado (assignedTechnicianId IS NOT NULL)
// 3. isArchived = true
// 4. Status en: ['aceptado', 'enProgreso', 'enRevision', 'fabricacion', 'terminado', 'pagado']
// Retorna true si:
// Status es 'borrador' o 'publicado' sin bids ni asignaciones
```

---

## 6. Sistema de Marketplace y Ofertas

### Vista del Técnico: `getAvailableCasesMarketplace()`

**Filtros aplicados:**
```sql
WHERE status = 'publicado'
  AND assignedTechnicianId IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM bid
    WHERE bid.clinicalCaseId = clinical_case.id
    AND bid.technicianId = {currentTechnicianId}
  )
ORDER BY createdAt DESC
```

**Optimización:** Two-step query (primero IDs elegibles, luego datos completos con relaciones).

**Post-procesamiento:** Firma miniaturas para cada caso con URLs GCS válidas 5 min (caché en memoria).

### Vista del Catálogo (técnico): `getAllCatalogCasesAction()`

Devuelve casos donde el técnico:
- Tiene una oferta activa (cualquier estado)
- Está asignado como ganador
- El caso está publicado sin asignación

### Rondas Comerciales
Cada vez que un caso se publica, tiene una ronda comercial activa (`commercial_round.status='active'`). Propósito:
1. **Trazabilidad:** Cada oferta referencia la ronda exacta en que se hizo
2. **Specs garantizadas:** `specsSnapshot` congela las specs al abrir la ronda
3. **Cierre limpio:** Al aceptar/retirar, todas las bids de esa ronda se cierran

---

## 7. Flujo Iterativo de Diseño

Este es el ciclo central entre dentista y técnico una vez asignado:

```
Estado inicial: aceptado, currentResponsibility='tecnico'

ITERACIÓN:
1. [Técnico] Inicia diseño → startWorkAction()
   → enProgreso, currentResponsibility='tecnico'

2. [Técnico] Sube archivos vía UCH
   → XHR PUT a GCS con signed URL
   → submitReviewAction(notes, gcsFilePaths[])
   → Crea delivery v1 (v2, v3...) status='pending'
   → enRevision, currentResponsibility='dentista'

3a. [Dentista] Aprueba diseño → approveWorkAction()
   → delivery.status='approved'
   → terminado (o fabricacion si needsFabrication)
   → FIN

3b. [Dentista] Solicita ajustes → requestRevisionAction(reason)
   → delivery.status='rejected', reviewComment=reason
   → enProgreso, currentResponsibility='tecnico'
   → VUELTA A PASO 2 (nueva versión)
```

**Blocking de envío:** Cuando `status='enRevision'`, el técnico NO puede enviar otra entrega. El botón de entrega solo aparece en `status='enProgreso'`.

**Versionado:** `clinical_case_delivery.version` incrementa automáticamente. En la sección de Adjuntos del UCH, se muestran ordenadas de más reciente a más antigua.

---

## 8. Unified Case Hub (UCH) — Sistema de Eventos

### Función `logCaseEvent()`

Motor central de trazabilidad. Todos los cambios de estado y comunicaciones generan un evento.

```typescript
logCaseEvent({
  caseId: string,
  userId: string,          // Quién genera el evento
  type: EventType,         // Categoría
  action: string,          // Acción específica
  content?: string,        // Descripción legible
  payload?: any,           // Datos técnicos (dentistOnly, technicianId, files, etc.)
  stateChange?: {from?: string, to?: string},
  tx?: DrizzleTransaction  // Opcional: participar en tx existente
})
```

### Catálogo Completo de Eventos

| Action | Type | Quién | Cuándo |
|--------|------|-------|--------|
| `CREACION` | negociacion | dentista | Al crear el caso |
| `PUBLICACION` | sistema | dentista | Al publicar al marketplace |
| `RETIRO_PUBLICACION` | sistema | dentista | Al retirar del marketplace |
| `REPUBLICACION` | negociacion | dentista | Al volver a publicar |
| `CASO_ACTUALIZADO` | negociacion | dentista | Al editar specs (sin cambio status) |
| `OFERTA_RECIBIDA` | negociacion | técnico | Al hacer una oferta |
| `OFERTA_ACEPTADA` | negociacion | dentista | Al aceptar la oferta ganadora |
| `OFERTA_RECHAZADA` | negociacion | dentista | Al rechazar oferta individual o al aceptar otra |
| `OFERTA_RETIRADA` | negociacion | técnico | Al retirar su propia oferta |
| `TRABAJO_INICIADO` | sistema | técnico | Al iniciar proceso de diseño |
| `REVISION_ENVIADA` | tecnico | técnico | Al enviar entrega |
| `REVISION_SOLICITADA` | sistema | dentista | Al solicitar ajustes |
| `COMENTARIO_TECNICO` | tecnico | cualquiera | Mensaje libre en el chat |
| `TRABAJO_APROBADO` | sistema | dentista | Al aprobar el diseño final |
| `FABRICACION_INICIADA` | tecnico | técnico | Al iniciar fabricación |
| `CASO_DESPACHADO` | tecnico | técnico | Al registrar el despacho |
| `RECEPCION_CONFIRMADA` | sistema | dentista | Al confirmar recepción |
| `REANUDADO` | sistema | técnico | Al reanudar desde pausa |

### Filtro de Privacidad (`getCaseEventsAction`)

El servidor filtra eventos según identidad antes de retornarlos:

```typescript
// DENTISTA: ve TODOS los eventos del caso
if (identity.role === 'dentista' || identity.role === 'admin') return true;

// Bloqueo explícito: eventos marcados solo para dentista
if (event.payload?.dentistOnly) return false;

// TÉCNICO PERDEDOR (caso asignado a otro):
if (isAssignedToOther) {
  // Solo ve sus propios eventos O eventos dirigidos a él
  return event.userId === identity.id || event.payload?.technicianId === identity.id;
}

// TÉCNICO GANADOR (o en marketplace):
if (event.type === 'sistema') return true;         // Eventos del sistema: siempre visibles
if (event.userId === identity.id) return true;     // Sus propios eventos
if (event.payload?.technicianId === identity.id) return true; // Eventos dirigidos a él
return false;
```

**Caso especial `dentistOnly`:** El evento `CREACION` tiene `payload.dentistOnly=true` para que nunca sea visible a técnicos, independientemente de cómo cambie el `type` en el futuro.

### Fases del UCH (Tabs)

| Tab | Acciones incluidas |
|-----|-------------------|
| Todos | Todas |
| Negociación | OFERTA_RECIBIDA, OFERTA_ENVIADA, OFERTA_ACEPTADA, OFERTA_RECHAZADA |
| Diseño | TRABAJO_INICIADO, REVISION_ENVIADA, REVISION_SOLICITADA, TRABAJO_APROBADO, COMENTARIO_TECNICO |
| Producción | FABRICACION_INICIADA, CASO_DESPACHADO, RECEPCION_CONFIRMADA |

### Gestión de Hilos por Técnico (Vista Dentista)

- Dropdown muestra lista de técnicos que han ofertado
- **Técnico ganador siempre primero**, con badge "GANADOR"
- Al seleccionar un técnico, el feed filtra por su ID (excepto eventos `sistema`)
- **Al ver hilo de un perdedor:** Se excluyen eventos de flujo del ganador (`WINNER_ONLY_ACTIONS`)
- **Sección Adjuntos:** Solo visible en el hilo del técnico ganador
- Conteo de no leídos: Almacenado en `localStorage['lastRead_{caseId}']`

### Acciones del UCH por Estado

| Estado | Dentista | Técnico |
|--------|----------|---------|
| publicado | Aceptar/Rechazar ofertas | Hacer oferta, retirar oferta |
| aceptado | — | Iniciar diseño |
| enProgreso | — | Enviar entrega (con archivos y nota) |
| enRevision | Aprobar diseño / Solicitar ajustes | Esperar revisión (bloqueado) |
| fabricacion | — | Registrar despacho |
| despachado | Confirmar recepción | — |

---

## 9. Sistema de Archivos y Almacenamiento GCS

### Google Cloud Storage

**Configuración:**
- Bucket: env `GCP_BUCKET_NAME` (default: `dentflowai-assets-prod`)
- Credenciales: `GOOGLE_APPLICATION_CREDENTIALS` (key file path)
- Proyecto: `GCP_PROJECT_ID`

**URLs firmadas:** Validas 15 minutos, tipo v4. Caché en memoria: 5 min TTL.

### Estructura de Rutas

```
organizations/{orgId}/
  cases/{caseId}/
    scans/
      {timestamp}_{filename}.stl    # Escaneo dental
      {timestamp}_{filename}.ply
    thumbnails/
      {filename}.jpg
    deliveries/
      {timestamp}_{filename}.stl    # Entregas del técnico
  avatars/
    {filename}

users/{userId}/
  avatar.jpg
```

### Subida de Archivos (Flujo)

```
1. [Client] Solicita upload URL: getUploadUrlAction(gcsPath, mimeType)
   → Valida autorización (org match o ruta autorizada)
   → Genera signed URL v4 para PUT

2. [Client] PUT directo a GCS (XHR para tracking de progreso)
   → Evento onprogress → actualiza barra de progreso

3. [Client] Llama Server Action con la ruta GCS resultante
   → ej: submitReviewAction(caseId, notes, [gcsPath1, gcsPath2])
   → O: registerFileAction(caseId, {gcsPath, category, ...})
```

### Control de Acceso a Archivos

```typescript
// getSignedUrlAction(fileName) — Lectura
1. Si isSystemAdmin → acceso total
2. Si fileName.startsWith(`organizations/${orgId}/`) → acceso (su org)
3. Si fileName.startsWith(`users/${userId}/`) → acceso (su perfil)
4. Si técnico Y archivo en caso asignado a él → acceso
5. Si técnico Y caso publicado → acceso (marketplace)
6. Bloqueo: throw "Acceso denegado a recurso ajeno"
```

### Tipos de Archivo Soportados en Viewer 3D
- `.stl` (STLLoader)
- `.ply` (PLYLoader)
- `.obj` (OBJLoader)
- Imágenes (jpg, jpeg, png) como referencias visuales

---

## 10. Notificaciones

**Archivo:** `lib/services/notifications.ts`

**Estado actual:** Implementación stub — las llamadas a `notifyUser()` retornan `{success: true}` sin enviar ninguna notificación real. La infraestructura está diseñada para ser extendida.

### Tipos de Notificación Definidos
```typescript
type NotificationType =
  | 'REVISION_PENDIENTE'       // Dentista: técnico envió entrega
  | 'TRABAJO_APROBADO'         // Técnico: dentista aprobó
  | 'CAMBIOS_SOLICITADOS'      // Técnico: dentista pide ajustes
  | 'NUEVA_OFERTA'             // Dentista: técnico ofertó
  | 'FABRICACION_INICIADA'     // Dentista: técnico inicia fabricación
  | 'CASO_DESPACHADO'          // Dentista: caso enviado
  | 'RECEPCION_CONFIRMADA'     // Técnico: dentista confirmó recepción
  | 'OFERTA_ACEPTADA'          // Técnico: su oferta fue ganadora
  | 'OFERTA_RECHAZADA'         // Técnico: su oferta fue rechazada
```

### Invocaciones en el Código
| Evento | Destinatario | Llamada |
|--------|-------------|---------|
| Entrega enviada | Dentista | `notifyUser(doctorId, 'REVISION_PENDIENTE', {caseId, version})` |
| Diseño aprobado | Técnico | `notifyUser(assignedTechnicianId, 'TRABAJO_APROBADO', {caseId})` |
| Ajustes solicitados | Técnico | `notifyUser(assignedTechnicianId, 'CAMBIOS_SOLICITADOS', {caseId, reason})` |
| Caso despachado | Dentista | `notifyUser(doctorId, 'CASO_DESPACHADO', {caseId})` |
| Recepción confirmada | Técnico | `notifyUser(techId, 'RECEPCION_CONFIRMADA', {caseId})` |

---

## 11. Páginas y Navegación

### Rutas Públicas
| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | `app/page.tsx` | Landing page |
| `/auth/login` | | Login credentials |
| `/auth/register` | | Registro con creación/búsqueda de organización |
| `/auth/forgot-password` | | Reset password |
| `/auth/verify` | | Verificación de email |

### Rutas Protegidas (requieren sesión)
| Ruta | Acceso | Descripción |
|------|--------|-------------|
| `/onboarding` | Todos | Setup inicial post-registro |
| `/dashboard` | Todos | Panel principal con KPIs |
| `/dashboard/cases` | dentista/tecnico | Listado de casos propios |
| `/dashboard/cases/new` | dentista | Wizard de creación de caso |
| `/dashboard/cases/[id]` | Todos | Detalle de caso + UCH |
| `/dashboard/marketplace` | tecnico | Casos publicados disponibles |
| `/dashboard/bids` | tecnico | Mis Ofertas (Disponibles / Mis Ofertas / En Progreso) |
| `/dashboard/kanban` | Todos | Vista Kanban de casos |
| `/dashboard/finance` | Todos | Finanzas (mock actual) |
| `/dashboard/profile` | Todos | Perfil de usuario |
| `/dashboard/admin` | admin | Panel de administración |

### Dashboard de Técnico (`/dashboard/bids`)
Implementado con 3 tabs:
- **Disponibles:** Casos publicados sin oferta propia → lleva al marketplace
- **Mis Ofertas:** Casos donde el técnico tiene bid activa (cualquier estado)
- **En Progreso:** Casos asignados al técnico con estados activos (`aceptado, enProgreso, enRevision, fabricacion, despachado`)

Cada tab tiene indicator de cantidad + animación layoutId (Framer Motion).

### Dashboard Principal (`/dashboard`)
- **Dentista:** KPIs (borradores, publicados, en licitación, en progreso, terminados), lista de casos recientes
- **Técnico:** KPIs (disponibles en marketplace, mis ofertas, activos, completados), galería de casos del marketplace

---

## 12. Constantes, Enums y Tipos

### `CASE_STATUSES` (lib/constants/dental.ts)
```typescript
{
  BORRADOR: 'borrador',
  PUBLICADO: 'publicado',
  ACEPTADO: 'aceptado',
  EN_PROGRESO: 'enProgreso',
  EN_REVISION: 'enRevision',
  FABRICACION: 'fabricacion',
  PAUSADO: 'pausado',
  TERMINADO: 'terminado',
  PAGADO: 'pagado',
  CANCELADO: 'cancelado',
  RECHAZADO: 'rechazado',
}
```

### `URGENCY_LEVELS`
```
baja | normal | alta | urgente | prioritario
```

### `RESTORATION_TYPES`
```
Corona Unitaria | Inlay | Onlay | Carilla | Puente |
Corona sobre implante | Denture | Guía Quirúrgica | Otro
```

### `DENTAL_MATERIALS`
```
Zirconio Multicapa (Premium) | Zirconio Monolítico | Disilicato de Litio (E-max) |
Metal-Cerámica | PMMA (Provisional) | PEEK / BioHPP | Titanio |
Cromo-Cobalto (Laser) | Composite HD | Cerámica Feldespática | Otro
```

### `VITA_SHADES`
```
A1 | A2 | A3 | A3.5 | A4 | B1 | B2 | B3 | B4 | C1 | C2 | C3 | C4 | D2 | D3 | D4 | Otro
```

### `ActionResult<T>` (lib/types/actions.ts)
```typescript
type ActionResult<T = undefined> =
  | (T extends undefined ? { success: true } : { success: true } & T)
  | { success: false; error: string };
```

### Helpers de Rol (lib/auth-helpers.ts)
```typescript
canActAsTecnico(role) → role === 'tecnico' || role === 'admin'
canActAsDentista(role) → role === 'dentista' || role === 'admin'
isAdmin(role) → role === 'admin'
```

---

## 13. Panel de Administración

**Archivo:** `lib/db/actions/admin.ts`

**Guard:** `ensureAdmin()` — verifica `role === 'admin'` O email master.

### Operaciones Disponibles

| Función | Descripción |
|---------|-------------|
| `listAllUsersAdmin()` | Lista todos los usuarios con su organización |
| `toggleUserStatusAdmin(userId, active)` | Bloquea/desbloquea acceso de usuario |
| `changeUserPasswordAdmin(userId, newPassword)` | Cambia contraseña con bcrypt |
| `deleteUserAdmin(userId)` | Elimina usuario y sus archivos en GCS |
| `createCoAdminAction(password)` | Crea Admin001, Admin002... |
| `switchMyRoleAdmin(newRole)` | Admin cambia su rol temporalmente |
| `purgeAllBusinessDataAdmin()` | **PURGA TOTAL** — elimina casos, archivos GCS, usuarios no-admin |
| `startSimulationAction(userId)` | Activa impersonación via cookie httpOnly |
| `stopSimulationAction()` | Desactiva impersonación |

---

## 14. Componentes Clave

### `CaseCreationWizard`
**Archivo:** `components/cases/CaseCreationWizard.tsx`

Multi-paso para crear casos:
1. **Identificación:** nombre interno, ID paciente anonimizado, urgencia, tipo de restauración
2. **Dientes:** selector dental visual (TeethSelector)
3. **Material:** material, color VITA
4. **Scans 3D:** subida de superior, inferior, bite (STL/PLY/OBJ/JPG/PNG, max 20MB)
5. **Revisión:** resumen y confirmación

**Persistencia:** Draft en `sessionStorage['df_case_wizard_draft']` — se limpia al completar.

### `UnifiedCaseHub`
**Archivo:** `components/cases/UnifiedCaseHub.tsx`

Panel de comunicación central. Contiene:
- Selector de técnico (dentista) o vista única (técnico)
- Sección de Adjuntos colapsable (solo hilo del ganador)
- Tabs de fase: Todos / Negociación / Diseño / Producción
- Feed de eventos con burbujas de chat diferenciadas por rol (estilo WhatsApp)
- Panel de revisión fijo para dentista cuando `enRevision`
- Action panel contextual según estado y rol
- Input de mensaje + adjunto de archivos

### `DentalViewer3D`
**Archivo:** `components/DentalViewer3D.tsx`

Renderiza archivos 3D directamente en el browser:
- Soporta STL, PLY, OBJ
- Toggle de visibilidad por modelo
- Control de opacidad por layer
- Anotaciones en coordenadas 3D
- Error boundary con reintentos
- Modo de anotación (click para añadir punto)

### `CaseWorkflowStepper`
**Archivo:** `components/cases/CaseWorkflowStepper.tsx`

7 pasos visuales del flujo:
`Borrador → Licitación → Asignado → En Diseño → Revisión → Fabricación → Terminado`

### `MarketplaceCaseCard`
**Archivo:** `components/cases/MarketplaceCaseCard.tsx`

Tarjeta de caso para el marketplace/catálogo. Muestra:
- Miniatura (foto, thumbnail estático, o render del scan)
- Status badge, material, dientes
- Estado de la oferta del técnico (si aplica)
- Botón de oferta / retiro de oferta

### `StatusBadge`
**Archivo:** `components/ui/StatusBadge.tsx`

Mapea todos los estados a label + color Tailwind. Centralizado.

### `Button`
**Archivo:** `components/ui/Button.tsx`

Variantes: `primary | secondary | ghost | destructive`. Con loading spinner, icon prop.

### `FocusTrap`
**Archivo:** `components/ui/FocusTrap.tsx`

Trampa de foco para accesibilidad en modales. Captura Tab/Shift+Tab, cierra con Escape.

### `ToastContext`
**Archivo:** `context/ToastContext.tsx`

Toast global (no por página). `useToast()` → `showSuccess(msg)` / `showError(msg)`. Portal a `document.body`, monted después de hidratación.

---

## 15. Seguridad e Invariantes

### Reglas de Acceso

1. **Aislamiento por organización:** Todo acceso a datos verifica `organizationId === identity.orgId` (excepto admin)
2. **Acceso a archivos GCS:** URLs firmadas generadas server-side, validando pertenencia
3. **Privacidad de ofertas:** Técnicos NO ven ofertas ni comunicaciones de competidores
4. **Impersonación:** Solo admins via cookie httpOnly — no falsificable desde client
5. **Bloqueo de usuario:** `isActive=false` impide login aunque las credenciales sean correctas
6. **dentistOnly events:** `payload.dentistOnly=true` filtra eventos antes de llegar a técnicos

### Invariantes de Negocio

1. Un caso solo puede tener **un técnico ganador** (`acceptBidAction` es atómica y cierra todas las demás)
2. La `commercialRound` activa garantiza specs inmutables durante licitación
3. El técnico **no puede enviar entregas** cuando `status !== 'enProgreso'`
4. El dentista **no puede aprobar/rechazar** cuando `status !== 'enRevision'`
5. `canDeleteCase()` previene eliminar casos con historial transaccional

### Trazabilidad
- Toda acción de negocio genera un `clinical_case_event` (auditado)
- Los cambios de estado siempre incluyen `{stateChange: {from, to}}`
- Las descargas de archivos se registran en `audit_log`

---

## 16. Decisiones Técnicas y Deuda

### Decisiones Confirmadas

| Decisión | Razón |
|----------|-------|
| `clinicalCaseDelivery.files` como JSONB (no tabla) | Los archivos de entrega son inmutables y siempre se acceden como conjunto. Flexibilidad > integridad referencial |
| GCS signed URLs con caché en memoria | Evita regenerar URLs para el mismo archivo durante 5 min |
| Two-step query en marketplace | `notExists` con `db.query` relational API da N+1; dos queries son más limpias |
| Server Actions en lugar de API REST | Next.js 15 App Router; simplifica auth, elimina serialización manual |
| `getServerIdentity()` en todas las acciones | Punto único de resolución de identidad + soporte impersonación |
| Cursor pagination en `getCaseEventsAction` | Evita cargar todos los eventos; default limit=50 |
| Index compuesto `(clinical_case_id, created_at DESC)` | Optimiza la query más común (fetch events por caso) |

### Deuda Técnica Conocida

| Item | Descripción | Prioridad |
|------|-------------|-----------|
| Notificaciones stub | `notifyUser()` no envía nada real | Alta |
| Finance page mock | Datos hardcodeados, sin backend real | Media |
| Tests de integración limitados | Solo 18 tests cubren 2-3 acciones críticas | Media |
| `commercial_round.version` legacy | Campo `version` redundante con `roundNumber`; migración pendiente | Baja |
| Strings de negocio dispersos | Mensajes de eventos hardcodeados en cada Server Action | Baja |
| Mobile layout básico | Alturas responsivas pero sin layout específico para móvil | Baja |

---

## Apéndice: Flujo Completo de Usuario Tipo

### Dentista — Crear y Adjudicar un Caso
```
1. /auth/register → crea cuenta + organización clínica
2. /onboarding → completa perfil
3. /dashboard/cases/new → CaseCreationWizard (5 pasos)
   - Sube scans STL a GCS via signed URLs
   - Registra archivos en DB
4. /dashboard/cases → ve su caso en estado 'borrador'
5. Abre caso → botón "Publicar" → modal de confirmación con resumen
   → caso pasa a 'publicado'
6. Espera ofertas (dashboard muestra contador)
7. Abre Centro de Control (UCH) → ve ofertas de técnicos
8. Selecciona técnico → modal de confirmación → "Confirmar y Asignar"
   → caso pasa a 'aceptado', técnico notificado
9. Espera que técnico inicie y entregue
10. En UCH, sección "Revisión pendiente" aparece automáticamente al recibir entrega
11. Escribe comentario → "Solicitar Ajustes" o "Aprobar Diseño"
12. Ciclo hasta aprobación → caso pasa a 'terminado'
```

### Técnico — Ofertar y Entregar
```
1. /auth/register → crea cuenta + laboratorio
2. /onboarding → completa perfil + capacidades técnicas
3. /dashboard/marketplace → ve casos publicados
4. Abre caso → ve specs y scans 3D en visor
5. UCH → formulario de oferta (precio, plazo, notas)
6. Espera respuesta del dentista
7. Al ser seleccionado → UCH muestra "Iniciar Diseño"
8. Hace click → caso pasa a 'enProgreso'
9. Trabaja el diseño, cuando listo:
   UCH → "Enviar Diseño para Revisión" → adjunta archivos + nota
   → barras de progreso XHR → caso pasa a 'enRevision'
10. Espera revisión del dentista (UCH muestra "Esperando revisión...")
11. Si hay ajustes → repite paso 9 con nueva versión
12. Si aprueba → caso 'terminado', técnico puede calificar al dentista
```

---

*Este documento fue generado para capturar el estado del arte completo del sistema antes del rediseño del modelo de marketplace. Fecha: 2026-04-28.*
