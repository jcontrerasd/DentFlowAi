# Sprint 6 — Panel Admin: Configuración del Algoritmo

**Duración estimada:** 1–2 semanas  
**Objetivo:** El administrador puede ver, modificar y guardar los parámetros del algoritmo de selección desde una interfaz visual, con validación en tiempo real y log inmutable de cambios.  
**Prerrequisito:** Sprint 2 (tabla `algorithm_config` y `algorithm_config_log` en DB).

---

## Contexto

Este es el primer sprint enteramente del lado del Admin. El panel de administración actual (`/dashboard/admin`) tiene funciones básicas de gestión de usuarios. Este sprint lo extiende con un nuevo módulo: **"Motor de Selección"**.

La interfaz debe ser precisa y segura: un parámetro mal configurado puede afectar a todos los técnicos del sistema.

---

## Tareas

### S6-01 — Server Action `getAlgorithmConfigAction()`
**Tipo:** Backend  
**Dependencias:** S0-02  
**Descripción:**

```typescript
// Guard: ensureAdmin()
// Query: SELECT * FROM algorithm_config WHERE is_active = true LIMIT 1

// Retorna todos los parámetros actuales + metadata:
type AlgorithmConfigFull = {
  id: string;
  version: number;
  // Pesos del score
  alphaQuality: number;     // α₁
  alphaPunctuality: number; // α₂
  alphaExperience: number;  // α₃
  alphaLoad: number;        // α₄
  alphaBonus: number;       // α₅
  // Ventanas
  wQualityDays: number;
  wLoadDays: number;
  cMax: number;
  dBonusMaxDays: number;
  // Filtros
  tCooldownHours: number;
  dInactivityDays: number;
  // Selección
  nInvited: number;
  nFloor: number;
  // Cotización
  tQuoteMinutes: number;
  tProposalHours: number;
  // Fee
  platformFee: number;
  // Liga
  lMinRating: number;
  lCasesEvaluated: number;
  lMinPunctuality: number;
  lCasesCompleted: number;
  lCasesTransition: number;
  lPenaltyTransition: number;
  lDescentRating: number;
  lDescentDays: number;
  // Meta
  updatedAt: Date;
  updatedBy: string; // nombre del admin que lo cambió
};
```

**Criterio de Done:** Action retorna config completa.

---

### S6-02 — Server Action `updateAlgorithmParamsAction(params)`
**Tipo:** Backend  
**Dependencias:** S0-02, S0-03  
**Descripción:**

```typescript
// Guard: ensureAdmin()
// Validaciones:
// 1. α₁ + α₂ + α₃ + α₄ + α₅ = 1.00 (±0.001 de tolerancia)
// 2. Cada α entre 0.0 y 0.50
// 3. N_invitados entre 3 y 10
// 4. T_cotizacion entre 30 y 480 minutos
// 5. Platform_fee entre 0.05 (5%) y 0.50 (50%)
// 6. Todos los parámetros dentro de sus rangos definidos en la tabla de parámetros

// Efectos (transacción):
// 1. UPDATE algorithm_config SET {...params, version=version+1, updated_by=identity.id, updated_at=now}
// 2. INSERT INTO algorithm_config_log por cada parámetro que cambió:
//    { config_id, changed_by, parameter_key, old_value, new_value }

// Retorna: { success: true, newVersion: number } | { success: false, error: string }
```

**Criterio de Done:** Validación de suma=1 activa. Log inmutable por cada cambio de parámetro.

---

### S6-03 — Server Action `getAlgorithmConfigLogAction(limit?)`
**Tipo:** Backend  
**Dependencias:** S0-03  
**Descripción:**

```typescript
// Guard: ensureAdmin()
// Query: SELECT * FROM algorithm_config_log
//        JOIN "user" ON algorithm_config_log.changed_by = "user".id
//        ORDER BY changed_at DESC
//        LIMIT limit (default 100)

// Retorna: array de { parameterKey, oldValue, newValue, changedAt, changedByName }
```

**Criterio de Done:** Log retorna historial cronológico con nombres de admins.

---

### S6-04 — Componente `AlgorithmWeightsPanel`
**Tipo:** UI — nuevo componente  
**Dependencias:** S6-01, S6-02  
**Descripción:**  
Panel interactivo para los 5 pesos del algoritmo (α₁ al α₅).

**Diseño:**
- 5 sliders (0.0 a 0.50 con paso 0.01) uno para cada α
- Etiquetas descriptivas: "Calidad Histórica (Q)", "Puntualidad (P)", "Experiencia (E)", "Penalización Carga (C)", "Bono Infrautilización (B)"
- **Indicador de suma en tiempo real:** "Suma actual: 0.97 / 1.00" — en rojo si ≠ 1.00, verde si = 1.00
- Botón "Guardar pesos" deshabilitado si suma ≠ 1.00
- Tooltip con explicación de cada factor

**Archivo:** `components/admin/algorithm/AlgorithmWeightsPanel.tsx`

**Criterio de Done:** Suma se valida en tiempo real. Botón solo habilitado con suma=1. Guarda correctamente.

---

### S6-05 — Componente `AlgorithmFiltersPanel`
**Tipo:** UI — nuevo componente  
**Dependencias:** S6-01, S6-02  
**Descripción:**  
Panel para parámetros de filtro y selección:

**Grupos de parámetros:**

**Ventanas temporales:**
- W_quality_days (30–365): "Ventana de calidad histórica (días)"
- W_load_days (7–90): "Ventana de carga reciente (días)"
- C_max (1.0–5.0): "Techo del índice de carga"
- D_bonus_max_days (7–60): "Días máx. para acumular bono"

**Filtros de exclusión:**
- T_cooldown_hours (1–72): "Cooldown entre invitaciones del mismo tipo (horas)"
- D_inactivity_days (3–30): "Días de inactividad para excluir del pool"

**Selección:**
- N_invitados (3–10): "Técnicos invitados por caso"
- N_floor (0–3): "Mínimo del cuartil inferior"

**Cotización:**
- T_quote_minutes (30–480): "Tiempo máx. para cotizar (minutos)"
- T_proposal_hours (1–24): "Validez de propuesta para el dentista (horas)"

**Fee:**
- Platform_fee (5%–50%): "Margen de la plataforma (%)"

**Archivo:** `components/admin/algorithm/AlgorithmFiltersPanel.tsx`

**Criterio de Done:** Cada parámetro tiene slider o input numérico con su rango. Botón "Guardar" por sección o único al final.

---

### S6-06 — Componente `LeagueConfigPanel`
**Tipo:** UI — nuevo componente  
**Dependencias:** S6-01, S6-02  
**Descripción:**  
Panel para los parámetros del sistema de ligas:

- L_min_rating (3.5–5.0): "Calificación mínima para ascender"
- L_cases_evaluated (5–20): "Últimos N casos evaluados para ascenso"
- L_min_punctuality (0.70–1.0): "Puntualidad mínima para ascender (%)"
- L_cases_completed (5–30): "Casos completados mínimos para ascender"
- L_cases_transition (1–5): "Casos en período de transición"
- L_penalty_transition (5–40%): "Penalización de score en transición"
- L_descent_rating (2.0–3.5): "Calificación que inicia descenso"
- L_descent_days (30–120): "Días en baja calificación para descender"

**Archivo:** `components/admin/algorithm/LeagueConfigPanel.tsx`

**Criterio de Done:** Parámetros de liga configurables y guardables.

---

### S6-07 — Componente `ConfigChangeLog`
**Tipo:** UI — nuevo componente  
**Dependencias:** S6-03  
**Descripción:**  
Timeline de cambios de parámetros:

- Tabla cronológica: Fecha/Hora | Admin | Parámetro | Valor anterior | Valor nuevo
- Filtro por parámetro o por admin
- Exportar a CSV (opcional para v1)

**Archivo:** `components/admin/algorithm/ConfigChangeLog.tsx`

**Criterio de Done:** Log visible y correcto. Al menos los últimos 100 cambios.

---

### S6-08 — Página `/dashboard/admin/algorithm`
**Tipo:** UI — nueva página  
**Dependencias:** S6-04, S6-05, S6-06, S6-07  
**Descripción:**  
Página principal del módulo de algoritmo en el panel admin. Organizada en tabs:

- **Tab "Pesos del Score":** `AlgorithmWeightsPanel`
- **Tab "Filtros y Selección":** `AlgorithmFiltersPanel`
- **Tab "Sistema de Ligas":** `LeagueConfigPanel`
- **Tab "Historial de Cambios":** `ConfigChangeLog`

**Encabezado de la página:**
- Nombre: "Motor de Selección de Técnicos"
- Versión actual de configuración (ej. "Versión 4")
- Última modificación (fecha + admin)

**Archivo:** `app/dashboard/admin/algorithm/page.tsx`

**Criterio de Done:** Página accesible solo para admins. Tabs funcionando. Datos reales.

---

### S6-09 — Agregar acceso al módulo desde el Panel Admin principal
**Tipo:** UI  
**Dependencias:** S6-08  
**Descripción:**  
Agregar en `/dashboard/admin` una nueva tarjeta/sección:

**"⚙️ Motor de Selección"**  
*Configura los parámetros del algoritmo de asignación de técnicos.*  
[Botón: "Gestionar Algoritmo" → `/dashboard/admin/algorithm`]

**Criterio de Done:** Card visible en el admin principal. Navegación funcional.

---

## Criterio de Done del Sprint Completo

- [ ] Lectura y escritura de `algorithm_config` funcional
- [ ] Validación de suma=1 en tiempo real
- [ ] Log inmutable de cambios operativo
- [ ] Los 4 paneles (pesos, filtros, ligas, log) funcionales
- [ ] Página `/dashboard/admin/algorithm` accesible y funcional
- [ ] Acceso restringido solo a admins

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Admin configura pesos que degradan el algoritmo | Alto | Validaciones de rango en backend. Log inmutable para revertir |
| Suma de α no llega exactamente a 1.0 por flotantes | Medio | Usar tolerancia ±0.001. Redondear a 3 decimales en DB |
| Cambios en `platform_fee` afectan propuestas en curso | Medio | Los cambios aplican solo a nuevas propuestas (leer fee al momento de buildProposalAction) |
