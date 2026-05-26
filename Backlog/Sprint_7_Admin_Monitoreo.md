# Sprint 7 — Panel Admin: Monitoreo, Equidad y Simulador

**Duración estimada:** 2 semanas  
**Objetivo:** El administrador puede monitorear la salud del algoritmo: distribución de invitaciones, concentración por técnico, alertas automáticas, ranking de técnicos y simulador de selección.  
**Prerrequisito:** Sprint 6 (panel de configuración), Sprint 2 (invitaciones en DB).

---

## Contexto

La configuración del algoritmo no es suficiente. El administrador necesita **observabilidad**: saber si el sistema está siendo justo, si hay técnicos acaparando trabajo, si hay técnicos activos sin invitaciones, y poder simular cambios antes de aplicarlos.

---

## Tareas

### S7-01 — Server Action `getAlgorithmMetricsAction(dateRange)`
**Tipo:** Backend  
**Dependencias:** S0-04 (case_invitation)  
**Descripción:**

```typescript
// Guard: ensureAdmin()
// Parámetros: { days: 30 | 90 | 365 }

// Retorna:
type AlgorithmMetrics = {
  // Distribución de invitaciones
  invitationsByTechnician: {
    technicianId: string;
    fullName: string;
    leagueLevel: string;
    invitationsCount: number;
    quotedCount: number;
    acceptedCount: number;
    responseRate: number;       // quoted / invited
    winRate: number;            // accepted / quoted
    avgQuotedPrice: number;
    avgDeliveryDays: number;
    currentScore: number;       // score actual calculado
    daysWithoutInvitation: number;
  }[];
  
  // Distribución por cuartil de score
  topQuartileShare: number;     // % de invitaciones del 25% superior de técnicos
  
  // Alertas
  alerts: {
    type: 'concentration' | 'inactive_technician' | 'empty_pool';
    message: string;
    severity: 'warning' | 'critical';
  }[];
  
  // Casos fallidos
  failedCases: {
    caseId: string;
    reason: string;
    createdAt: Date;
  }[];
  
  // Tasa de respuesta global
  globalResponseRate: number;
  globalAcceptanceRate: number; // dentistas que aceptan propuesta
};
```

**Criterio de Done:** Action retorna datos reales desde case_invitation y user.

---

### S7-02 — Server Action `simulateAlgorithmAction(params)`
**Tipo:** Backend  
**Dependencias:** S2-02, S2-03, S6-01  
**Descripción:**  
Simula cómo quedaría la distribución de probabilidades para un caso hipotético **sin ejecutar el proceso real** (no crea invitaciones).

```typescript
// Guard: ensureAdmin()
// Entrada:
type SimulationParams = {
  restorationType: string;     // tipo de trabajo hipotético
  caseComplexity: string;      // basico | intermedio | avanzado | critico
  serviceType: string;         // solo_diseno | integral
  configOverride?: Partial<AlgorithmConfig>; // parámetros alternativos a los actuales
};

// Lógica:
// 1. Correr classifyCaseAction() con los params (sin guardar)
// 2. Correr filtro duro sobre pool real de técnicos
// 3. Calcular scores para cada técnico del pool
// 4. Calcular probabilidades normalizadas
// 5. Retornar ranking con scores y probabilidades (sin sorteo)

// Retorna:
type SimulationResult = {
  eligiblePool: number;          // técnicos que pasan el filtro duro
  invitedCount: number;          // N_invitados según config
  distribution: {
    technicianId: string;
    fullName: string;
    leagueLevel: string;
    score: number;
    probability: number;         // Probabilidad_i = S_i / Σ(S_j)
    excluded: boolean;           // si fue filtrado
    exclusionReason?: string;    // por qué fue excluido
    components: {                // desglose del score
      Q: number; P: number; E: number; C: number; B: number;
    };
  }[];
};
```

**Criterio de Done:** Simulación retorna distribución correcta. No ejecuta acciones reales.

---

### S7-03 — Componente `InvitationDistributionChart`
**Tipo:** UI — nuevo componente (puede usar una librería de gráficos simple o CSS puro)  
**Dependencias:** S7-01  
**Descripción:**  
Histograma horizontal de invitaciones por técnico en los últimos N días.

**Opciones visuales alternativas si no hay librería de gráficos:**
- Barras de progreso CSS con anchor al 100% (máximo de cualquier técnico)
- Color por liga: Bronce=#CD7F32, Plata=#C0C0C0, Oro=#FFD700, Élite=#E0E0FF

**Filtros:** Selector 30/90/365 días.

**Archivo:** `components/admin/algorithm/InvitationDistributionChart.tsx`

**Criterio de Done:** Visualización correcta de distribución. Actualiza al cambiar rango.

---

### S7-04 — Componente `ConcentrationAlert`
**Tipo:** UI  
**Dependencias:** S7-01  
**Descripción:**  
Alerta visual cuando el 20% superior de técnicos acapara más del 60% de invitaciones:

```
⚠️ Alerta de Concentración
El 20% superior de técnicos recibió el 72% de las invitaciones en los últimos 30 días.
Considera incrementar los pesos de Penalización de Carga (C) o Bono de Infrautilización (B).
[Ir a configuración del algoritmo →]
```

**También alertar:**
- Si hay técnicos activos (`is_available=true`) con 0 invitaciones en los últimos `D_alerta` días
- Si hubo casos fallidos (pool vacío) en el período

**Archivo:** `components/admin/algorithm/ConcentrationAlert.tsx`

**Criterio de Done:** Alerta aparece con datos reales. Link a configuración funcional.

---

### S7-05 — Componente `TechnicianRankingTable`
**Tipo:** UI  
**Dependencias:** S7-01  
**Descripción:**  
Tabla completa de técnicos activos con:

| Columna | Descripción |
|---|---|
| Técnico | Nombre + liga badge (Bronce/Plata/Oro/Élite) |
| Score actual | Número calculado por el algoritmo |
| Invitaciones (30d) | Recibidas / Respondidas / Ganadas |
| Tasa respuesta | % |
| Calificación prom. | Últimos 30/90/365 días |
| Días sin invitación | Counter desde `last_invited_at` |
| Disponible | Toggle (admin puede cambiar) |
| Estado | Activo / Suspendido / Sin Skills |

**Filtros:**
- Por liga
- Solo disponibles
- Solo con 0 invitaciones recientes

**Acciones inline:**
- Ver perfil completo del técnico (modal o nueva pestaña)
- Cambiar `is_available` manualmente

**Archivo:** `components/admin/algorithm/TechnicianRankingTable.tsx`

**Criterio de Done:** Tabla con datos reales. Filtros funcionales. Toggle de disponibilidad actualiza DB.

---

### S7-06 — Componente `SimulatorPanel`
**Tipo:** UI  
**Dependencias:** S7-02  
**Descripción:**  
Interfaz de simulación del algoritmo:

**Paso 1 — Configurar caso hipotético:**
- Select: Tipo de restauración
- Select: Complejidad (Básico/Intermedio/Avanzado/Crítico)
- Select: Tipo de servicio (Solo diseño / Integral)

**Paso 2 — Configuración alternativa (opcional):**
- Toggle: "Usar configuración actual" vs "Comparar con configuración alternativa"
- Si alternativa: sliders para α₁–α₅ (copia del AlgorithmWeightsPanel)

**Resultado:**
- Pool elegible: "X técnicos pasan el filtro"
- Tabla de distribución de probabilidades (los primeros N_invitados tendrían mayor probabilidad)
- Técnicos excluidos y por qué

**Botón:** "Ejecutar simulación" → llama `simulateAlgorithmAction()`

**Archivo:** `components/admin/algorithm/SimulatorPanel.tsx`

**Criterio de Done:** Simulación funcional. Resultados claros. No ejecuta proceso real.

---

### S7-07 — Componente `QuotationMetricsPanel`
**Tipo:** UI  
**Dependencias:** S7-01  
**Descripción:**  
Panel de métricas de cotización:

- **Tasa de respuesta global:** % de invitaciones respondidas antes de expirar
- **Tasa de aceptación de propuestas:** % de propuestas aceptadas por dentistas
- **Tiempo promedio de respuesta:** Desde invitación hasta cotización enviada
- **Casos fallidos:** Lista de casos donde el pool fue vacío o sin respuestas, con motivo

**Archivo:** `components/admin/algorithm/QuotationMetricsPanel.tsx`

**Criterio de Done:** Métricas correctas y útiles para diagnóstico.

---

### S7-08 — Página `/dashboard/admin/algorithm/monitor`
**Tipo:** UI — nueva página  
**Dependencias:** S7-03 al S7-07  
**Descripción:**  
Página de monitoreo organizada en secciones:

1. **Resumen ejecutivo:** KPIs principales (tasa respuesta, tasa aceptación, alertas activas)
2. **Alertas activas:** `ConcentrationAlert`
3. **Distribución de invitaciones:** `InvitationDistributionChart`
4. **Ranking de técnicos:** `TechnicianRankingTable`
5. **Métricas de cotización:** `QuotationMetricsPanel`

**Selector de período:** 30 / 90 / 365 días (afecta todos los paneles)

**Archivo:** `app/dashboard/admin/algorithm/monitor/page.tsx`

**Criterio de Done:** Página completa con datos reales. Período selector funcional.

---

### S7-09 — Página `/dashboard/admin/algorithm/simulate`
**Tipo:** UI — nueva página  
**Dependencias:** S7-06  
**Descripción:**  
Página dedicada al simulador con:
- `SimulatorPanel` a pantalla completa
- Explicación del funcionamiento del algoritmo para el admin

**Archivo:** `app/dashboard/admin/algorithm/simulate/page.tsx`

**Criterio de Done:** Simulador funcional en página propia.

---

### S7-10 — Ampliar menú de admin con sub-navegación del algoritmo
**Tipo:** UI  
**Dependencias:** S7-08, S7-09  
**Descripción:**  
El módulo del algoritmo ahora tiene 3 sub-páginas. Agregar sub-menú o tabs:

- "Configuración" → `/dashboard/admin/algorithm`
- "Monitoreo" → `/dashboard/admin/algorithm/monitor`
- "Simulador" → `/dashboard/admin/algorithm/simulate`

**Criterio de Done:** Navegación entre las 3 sub-páginas sin recargar la app.

---

## Criterio de Done del Sprint Completo

- [ ] Métricas reales de distribución de invitaciones
- [ ] Alertas de concentración automáticas
- [ ] Ranking de técnicos con datos reales y filtros
- [ ] Simulador funcional (sin ejecutar proceso real)
- [ ] Las 3 páginas del módulo de algoritmo completas
- [ ] Admin puede cambiar disponibilidad de técnicos manualmente

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Queries de métricas lentas sin datos suficientes | Bajo al inicio | Considerar vistas materializadas en producción |
| Admin usa el simulador para "adivinar" la selección y avisar a técnicos | Bajo | El simulador no muestra a quién se invitaría exactamente (es probabilístico) |
| Datos insuficientes en las primeras semanas de operación | Medio | Mostrar mensaje "Aún sin datos suficientes" cuando hay < 10 casos procesados |
