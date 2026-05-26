# Sprint 0 — Fundación y Limpieza de Base de Datos

**Duración estimada:** 1–2 semanas  
**Objetivo:** Dejar el schema de DB y el código limpio para construir el nuevo modelo encima. No se modifica ninguna UI funcional todavía.  
**Prerrequisito:** DB vacía de casos (solo usuarios existentes). Bucket de GCS limpiado.

---

## Contexto

La DB actual tiene tablas y relaciones del modelo marketplace (`bid`, `commercial_round`) que serán reemplazadas. Este sprint crea las nuevas tablas y migra los datos de perfil de técnicos existentes al nuevo modelo, sin romper el login ni el acceso de los usuarios actuales.

---

## Tareas

### S0-01 — Crear tabla `technician_skill`
**Tipo:** DB Migration  
**Dependencias:** Ninguna  
**Descripción:**  
Nueva tabla que reemplaza el campo `technicalCapabilities` (JSONB en `organization`) con una estructura granular por tipo de trabajo y sub-perfil.

```sql
CREATE TABLE technician_skill (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  work_type   TEXT NOT NULL,       -- ej: 'corona_anterior', 'puente_3u', etc.
  design_level     INTEGER DEFAULT 0,  -- 0 = no aplica, 1–7
  fabrication_level INTEGER DEFAULT 0, -- 0 = no aplica, 1–7
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, work_type)
);
CREATE INDEX ts_user_id_idx ON technician_skill(user_id);
```

**Tipos de trabajo (`work_type`) — 15 valores:**
`corona_anterior`, `corona_posterior`, `corona_implante`, `inlay_onlay`, `carilla_unitaria`, `carillas_multiples`, `puente_3u`, `puente_4mas`, `full_arch`, `protesis_parcial_removible`, `protesis_total`, `sobredentadura`, `barra_implantes`, `guia_quirurgica_simple`, `guia_quirurgica_compleja`

**Criterio de Done:** Migración corre sin errores. Tabla existe en DB.

---

### S0-02 — Crear tabla `algorithm_config`
**Tipo:** DB Migration  
**Dependencias:** Ninguna  
**Descripción:**  
Tabla de fila única que almacena todos los parámetros del algoritmo de selección.

```sql
CREATE TABLE algorithm_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version     INTEGER NOT NULL DEFAULT 1,
  -- Pesos del score
  alpha_quality       NUMERIC(4,3) DEFAULT 0.250,
  alpha_punctuality   NUMERIC(4,3) DEFAULT 0.200,
  alpha_experience    NUMERIC(4,3) DEFAULT 0.200,
  alpha_load          NUMERIC(4,3) DEFAULT 0.200,
  alpha_bonus         NUMERIC(4,3) DEFAULT 0.150,
  -- Ventanas temporales (días)
  w_quality_days      INTEGER DEFAULT 90,
  w_load_days         INTEGER DEFAULT 30,
  c_max               NUMERIC(3,1) DEFAULT 2.0,
  d_bonus_max_days    INTEGER DEFAULT 30,
  -- Filtros de exclusión
  t_cooldown_hours    INTEGER DEFAULT 12,
  d_inactivity_days   INTEGER DEFAULT 15,
  -- Selección
  n_invited           INTEGER DEFAULT 5,
  n_floor             INTEGER DEFAULT 1,
  -- Cotización y propuesta
  t_quote_minutes     INTEGER DEFAULT 90,
  t_proposal_hours    INTEGER DEFAULT 2,
  -- Fee de plataforma (%)
  platform_fee        NUMERIC(5,4) DEFAULT 0.1500,  -- 15%
  -- Liga
  l_min_rating        NUMERIC(3,2) DEFAULT 4.20,
  l_cases_evaluated   INTEGER DEFAULT 10,
  l_min_punctuality   NUMERIC(3,2) DEFAULT 0.85,
  l_cases_completed   INTEGER DEFAULT 15,
  l_cases_transition  INTEGER DEFAULT 3,
  l_penalty_transition NUMERIC(3,2) DEFAULT 0.20,
  l_descent_rating    NUMERIC(3,2) DEFAULT 3.00,
  l_descent_days      INTEGER DEFAULT 60,
  -- Metadatos
  is_active           BOOLEAN DEFAULT TRUE,
  updated_by          TEXT REFERENCES "user"(id),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Criterio de Done:** Tabla existe. Se inserta la fila inicial con valores por defecto.

---

### S0-03 — Crear tabla `algorithm_config_log`
**Tipo:** DB Migration  
**Dependencias:** S0-02  
**Descripción:**  
Log inmutable de cambios a los parámetros del algoritmo.

```sql
CREATE TABLE algorithm_config_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id     UUID NOT NULL REFERENCES algorithm_config(id),
  changed_by    TEXT NOT NULL REFERENCES "user"(id),
  parameter_key TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  changed_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX acl_config_idx ON algorithm_config_log(config_id);
CREATE INDEX acl_changed_by_idx ON algorithm_config_log(changed_by);
```

**Criterio de Done:** Tabla existe.

---

### S0-04 — Crear tabla `case_invitation`
**Tipo:** DB Migration  
**Dependencias:** Ninguna (solo referencia `clinical_case` y `user`)  
**Descripción:**  
Reemplaza a `bid`. Es interna — el dentista NUNCA ve esta tabla directamente.

```sql
CREATE TABLE case_invitation (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
  technician_id   TEXT NOT NULL REFERENCES "user"(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending | quoted | accepted | rejected | expired | withdrawn
  invited_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at      TIMESTAMP WITH TIME ZONE,   -- invited_at + T_cotizacion
  quoted_price    DOUBLE PRECISION,
  quoted_days     INTEGER,
  tech_notes      TEXT,                        -- máx 200 chars, solo interno
  responded_at    TIMESTAMP WITH TIME ZONE,
  score_at_invite NUMERIC(6,4),               -- score del técnico al momento de invitar
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX ci_case_idx ON case_invitation(clinical_case_id);
CREATE INDEX ci_tech_idx ON case_invitation(technician_id);
CREATE INDEX ci_status_idx ON case_invitation(status);
```

**Criterio de Done:** Tabla existe en DB.

---

### S0-05 — Agregar campos nuevos a `clinical_case`
**Tipo:** DB Migration  
**Dependencias:** Ninguna  
**Descripción:**

```sql
ALTER TABLE clinical_case
  ADD COLUMN proposed_price        DOUBLE PRECISION,
  ADD COLUMN proposed_delivery_days INTEGER,
  ADD COLUMN proposal_expires_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN platform_fee          NUMERIC(5,4),
  ADD COLUMN internal_status       TEXT,        -- estado granular para admin
  ADD COLUMN case_complexity       TEXT,        -- basico | intermedio | avanzado | critico
  ADD COLUMN service_type          TEXT,        -- solo_diseno | integral | solo_fabricacion
  ADD COLUMN dentist_rejection_reason TEXT;     -- si el dentista rechaza la propuesta
```

**Criterio de Done:** Columnas existen. No hay error en queries existentes.

---

### S0-06 — Agregar campos nuevos a `user`
**Tipo:** DB Migration  
**Dependencias:** Ninguna  
**Descripción:**

```sql
ALTER TABLE "user"
  ADD COLUMN is_available       BOOLEAN DEFAULT TRUE,
  ADD COLUMN league_level       TEXT DEFAULT 'bronce',
  ADD COLUMN league_transition_count INTEGER DEFAULT 0,
  ADD COLUMN last_invited_at    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN suspended_until    TIMESTAMP WITH TIME ZONE,
  ADD COLUMN consecutive_no_response INTEGER DEFAULT 0;
```

**Criterio de Done:** Columnas existen. Los técnicos existentes tienen `is_available=true`, `league_level='bronce'`.

---

### S0-07 — Script de migración: poblar `technician_skill` desde `organization.technical_capabilities`
**Tipo:** Script SQL / TypeScript one-shot  
**Dependencias:** S0-01, S0-06  
**Descripción:**  
Los técnicos existentes tienen `organization.technical_capabilities` como array JSONB (`['CAD', 'CAM']` o similar). Este script los migra al nuevo modelo:

- Si `CAD` en capabilities → insertar todos los `work_type` con `design_level = 3` (nivel medio como base)
- Si `CAM` en capabilities → setear `fabrication_level = 3` para los mismos tipos
- Si `CAD` sin `CAM` → `fabrication_level = 0` en todos

**Nota:** Los niveles exactos serán refinados por cada técnico en Sprint 1 (su perfil mostrará la skill matrix para completar).

**Criterio de Done:** Tabla `technician_skill` tiene al menos 1 fila por cada técnico existente.

---

### S0-08 — Actualizar Drizzle ORM schema + generar migración
**Tipo:** Código (schema.ts)  
**Dependencias:** S0-01 al S0-07  
**Descripción:**  
- Agregar definiciones de las 3 nuevas tablas a `schema.ts`
- Agregar relaciones (`skillsRelations`, `invitationsRelations`, etc.)
- Correr `drizzle-kit generate` y `drizzle-kit migrate`
- Actualizar tipos TypeScript exportados

**Archivos:** `frontend/lib/db/schema.ts`, `frontend/drizzle/`

**Criterio de Done:** `npm run db:migrate` sin errores. App levanta sin errores de tipo.

---

### S0-09 — Actualizar constantes de estados del caso
**Tipo:** Código  
**Dependencias:** S0-05  
**Descripción:**  
Actualizar `lib/constants/dental.ts`:

```typescript
// NUEVOS ESTADOS VISIBLES AL DENTISTA
export const CASE_STATUSES = {
  BORRADOR: 'borrador',
  EN_EVALUACION: 'enEvaluacion',      // reemplaza 'publicado'
  PROPUESTA_LISTA: 'propuestaLista',  // nuevo
  EN_EJECUCION: 'enEjecucion',        // reemplaza 'enProgreso' (vista dentista)
  EN_REVISION: 'enRevision',          // se mantiene
  DISENO_APROBADO: 'disenoAprobado',  // nuevo
  EN_FABRICACION: 'enFabricacion',    // renombre de 'fabricacion'
  ENVIADO: 'enviado',                 // renombre de 'despachado'
  COMPLETADO: 'completado',
  CERRADO: 'cerrado',
  CANCELADO: 'cancelado',
  PAUSADO: 'pausado',
  RECHAZADO: 'rechazado',             // dentista rechazó propuesta
} as const;

// ESTADOS INTERNOS (solo admin y sistema)
export const INTERNAL_CASE_STATUSES = {
  CASO_RECIBIDO: 'caso_recibido',
  CLASIFICANDO: 'clasificando',
  SELECCIONANDO_TECNICOS: 'seleccionandoTecnicos',
  COTIZACIONES_ABIERTAS: 'cotizacionesAbiertas',
  EVALUANDO_OFERTAS: 'evaluandoOfertas',
  PROPUESTA_GENERADA: 'propuestaGenerada',
  PROPUESTA_PRESENTADA: 'propuestaPresentada',
  // ... etc.
} as const;
```

**Criterio de Done:** Constantes actualizadas. `StatusBadge` actualizado con labels y colores para nuevos estados.

---

### S0-10 — Deshabilitar (no eliminar) páginas de marketplace en navegación
**Tipo:** UI / Código  
**Dependencias:** Ninguna  
**Descripción:**  
No eliminar las páginas todavía (Sprint 5 las reemplazará). Solo removerlas del menú lateral y redirigir `/dashboard/marketplace` y `/dashboard/bids` a `/dashboard` con un mensaje de "En mantenimiento".

**Objetivo:** Evitar que los técnicos existentes accedan a UI rota mientras se construye el nuevo modelo.

**Criterio de Done:** Menú no muestra las rutas. Redirección activa.

---

## Criterio de Done del Sprint Completo

- [ ] 5 nuevas tablas en DB con índices correctos
- [ ] Técnicos existentes migrados a `technician_skill`
- [ ] Schema Drizzle actualizado y sincronizado
- [ ] App levanta sin errores
- [ ] Nuevos estados de caso definidos en constantes
- [ ] Marketplace no accesible desde UI (pero código aún existe)
- [ ] Backup realizado antes y después de las migraciones

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Migración rompe relaciones existentes | Alto | Backup antes. Las tablas `bid` y `commercial_round` NO se eliminan aún |
| Técnicos con `technicalCapabilities` en formato inesperado | Medio | Revisar todos los registros antes de ejecutar S0-07 |
| Errores de tipo en acciones que usan `bid` | Bajo | Las acciones de `bid` se mantienen en el código pero no se exponen en UI |
