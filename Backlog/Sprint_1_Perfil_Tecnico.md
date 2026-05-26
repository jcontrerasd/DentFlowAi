# Sprint 1 — Perfil Técnico: Skill Matrix y Disponibilidad

**Duración estimada:** 1–2 semanas  
**Objetivo:** Los técnicos pueden declarar sus niveles de competencia por tipo de trabajo desde su perfil. Los técnicos existentes son guiados a completar este formulario. Se habilita el control de disponibilidad.  
**Prerrequisito:** Sprint 0 completado (tabla `technician_skill` existe, usuarios migrados con niveles base).

---

## Contexto

El algoritmo de selección usa `E` (Experiencia en el tipo de caso) directamente desde `technician_skill.design_level` o `fabrication_level`. Sin estos datos correctos, el algoritmo no puede funcionar. Este sprint es el requisito de datos del Motor de Orquestación.

---

## Tareas

### S1-01 — Crear Server Action `getMySkillsAction()`
**Tipo:** Backend  
**Dependencias:** S0-01  
**Descripción:**  
Retorna todas las filas de `technician_skill` para el técnico autenticado, formateadas para el formulario.

```typescript
// Retorna:
type SkillRow = {
  workType: string;
  designLevel: number;      // 0–7
  fabricationLevel: number; // 0–7, 0 si no aplica (solo diseño)
};

// Guard: role === 'tecnico'
// Query: SELECT * FROM technician_skill WHERE user_id = identity.id
```

**Criterio de Done:** Action retorna datos correctos para técnicos con y sin skills registradas.

---

### S1-02 — Crear Server Action `updateSkillsAction(skills[])`
**Tipo:** Backend  
**Dependencias:** S0-01  
**Descripción:**

```typescript
// Entrada:
type SkillInput = {
  workType: string;
  designLevel: number;      // 0–7
  fabricationLevel: number; // 0–7
};

// Guard: role === 'tecnico'
// Lógica:
// 1. Para cada skill en el input:
//    - Si fabrication_level > 0 pero organización no tiene CAM → error de validación
//    - UPSERT en technician_skill (ON CONFLICT (user_id, work_type) DO UPDATE)
// 2. Registrar evento en audit_log
```

**Validaciones:**
- `designLevel` entre 0 y 7
- `fabricationLevel` solo > 0 si `organization.technicalCapabilities` incluye `CAM`
- Al menos 1 tipo de trabajo con `designLevel > 0`

**Criterio de Done:** Upsert funciona. Validaciones activas.

---

### S1-03 — Crear Server Action `toggleAvailabilityAction()`
**Tipo:** Backend  
**Dependencias:** S0-06  
**Descripción:**

```typescript
// Guard: role === 'tecnico'
// Toggle user.is_available (true ↔ false)
// Registrar evento con timestamp
```

**Criterio de Done:** Action cambia el campo y retorna el nuevo estado.

---

### S1-04 — Componente `SkillMatrixForm`
**Tipo:** UI — nuevo componente  
**Dependencias:** S1-01, S1-02  
**Descripción:**  
Formulario de grilla que muestra los 15 tipos de trabajo con dos sliders (Diseño 0–7, Fabricación 0–7) por fila.

**Diseño visual:**
- Tabla o grilla con filas por tipo de trabajo
- Columna "Diseño": slider o selector numérico 0–7 con etiquetas (0=No aplico, 1–2=Básico, 3–4=Intermedio, 5–6=Avanzado, 7=Experto)
- Columna "Fabricación": misma lógica, deshabilitada con `disabled` si técnico es solo-diseño
- Badge de la liga calculada (Bronce/Plata/Oro/Élite) basado en promedio de niveles — cálculo local sin servidor
- Botón "Guardar habilidades" → llama `updateSkillsAction()`

**Archivo:** `components/profile/SkillMatrixForm.tsx`

**Criterio de Done:** Formulario renderiza. Guarda correctamente. Muestra feedback de éxito/error con Toast.

---

### S1-05 — Componente `AvailabilityToggle`
**Tipo:** UI — nuevo componente  
**Dependencias:** S1-03  
**Descripción:**  
Toggle simple con estado visual claro: verde "Disponible" / gris "No disponible (pausa)".

**Texto de ayuda:**  
*"Al marcarte como no disponible, no recibirás nuevas invitaciones de trabajo hasta que reactives tu disponibilidad."*

**Archivo:** `components/profile/AvailabilityToggle.tsx`

**Criterio de Done:** Toggle funciona y persiste en DB.

---

### S1-06 — Integrar en página de Perfil del Técnico
**Tipo:** UI  
**Dependencias:** S1-04, S1-05  
**Descripción:**  
Agregar dos nuevas secciones a `/dashboard/profile` (solo visibles para `role === 'tecnico'`):

1. **Sección: Disponibilidad** — `AvailabilityToggle` + explicación
2. **Sección: Mis Habilidades Técnicas** — `SkillMatrixForm` pre-cargado con datos existentes

**Archivo:** `app/dashboard/profile/page.tsx`

**Criterio de Done:** Las secciones aparecen solo para técnicos. Datos precargados correctamente.

---

### S1-07 — Banner de "Completa tu perfil" para técnicos con skills incompletas
**Tipo:** UI  
**Dependencias:** S1-01  
**Descripción:**  
Al cargar el dashboard del técnico, verificar si tiene al menos 1 `technician_skill` con `design_level > 0`. Si no:

- Mostrar un banner prominente (no modal, no bloquear) en `/dashboard`:  
  *"⚠️ Tu perfil técnico está incompleto. Declara tus habilidades para comenzar a recibir invitaciones de trabajo."*  
  [Botón: Completar perfil → `/dashboard/profile`]

**Criterio de Done:** Banner visible para técnicos sin skills. Invisible para técnicos con skills completas.

---

### S1-08 — Actualizar onboarding técnico para incluir SkillMatrixForm
**Tipo:** UI  
**Dependencias:** S1-04  
**Descripción:**  
Agregar un paso al wizard de onboarding del técnico (después del paso de perfil personal):

**Nuevo paso:** "Tus Habilidades Técnicas" — renderiza `SkillMatrixForm` con datos vacíos.

El paso es **obligatorio** — no se puede avanzar sin al menos 1 skill declarada con nivel > 0.

**Archivo:** `app/onboarding/page.tsx` o el componente de onboarding técnico.

**Criterio de Done:** Paso existe en el onboarding técnico. Bloquea avance sin mínimo 1 skill.

---

### S1-09 — Server Action `getAdminTechnicianSkillsAction(userId)`
**Tipo:** Backend  
**Dependencias:** S0-01  
**Descripción:**  
Versión admin de `getMySkillsAction()` — permite que el administrador vea las skills de cualquier técnico.

```typescript
// Guard: ensureAdmin()
// Query: SELECT * FROM technician_skill WHERE user_id = userId
// También retorna: user.is_available, user.league_level, user.last_invited_at
```

**Criterio de Done:** Admin puede ver el perfil técnico completo de cualquier usuario.

---

## Criterio de Done del Sprint Completo

- [ ] `SkillMatrixForm` completo y funcional
- [ ] `AvailabilityToggle` completo y funcional
- [ ] Perfil del técnico muestra ambas secciones
- [ ] Onboarding técnico incluye step de habilidades
- [ ] Banner de perfil incompleto activo en dashboard
- [ ] Admin puede ver skills de cualquier técnico
- [ ] Técnicos existentes pueden refinar sus niveles migrados en Sprint 0

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Técnicos no completan sus habilidades | Alto para el algoritmo | Banner prominente + comunicación directa |
| Técnico sobre-declara niveles | Medio | El sistema ajustará niveles efectivos con el tiempo (regla en CajaNegra §5.1) |
| UX compleja del formulario de 15 tipos | Medio | Agrupar tipos por categoría (coronas / puentes / prótesis / guías) |
