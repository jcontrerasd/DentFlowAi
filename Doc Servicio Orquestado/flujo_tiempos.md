# Flujo de tiempos, disponibilidad y sanciones — Especificación funcional

> Documento de diseño funcional. Define cómo opera la disponibilidad del técnico, las sanciones por no-respuesta, los countdowns del flujo comercial y el comportamiento de Fauchard cuando hay falta de oferta. No es un plan de implementación técnica; es la fuente de verdad de las **reglas de negocio**. El esquema BD detallado y los mockups de UI se especifican aparte.

---

## 1. Modelo de disponibilidad del técnico (3 niveles)

### 1.1 Estructura

- **Nivel 1 — Global**: switch maestro del técnico. OFF = no recibe ninguna invitación, sin importar niveles inferiores.
- **Nivel 2 — Capacidad**: dos switches independientes, **CAD** (diseño) y **CAM** (fabricación). Un técnico puede tener cualquier combinación: solo CAD, solo CAM o ambos.
- **Nivel 3 — Categoría**: switch por cada una de las cinco categorías de trabajo, **en CAD y en CAM por separado**. Hasta 10 switches de nivel 3 por técnico (5 categorías × 2 capacidades).

### 1.2 Las cinco categorías canónicas

1. Coronas
2. Inlays, Onlays y Carillas
3. Puentes y Full Arch
4. Prótesis Removible
5. Guías Quirúrgicas

### 1.3 Regla de elegibilidad (AND triple)

```
elegible(técnico, categoría, capacidad) =
    switch_global == ON
  AND switch_capacidad[capacidad] == ON
  AND switch_categoria[categoría][capacidad] == ON
```

- Padre pisa hijo. Cualquier OFF arriba anula el efecto de los hijos.
- **Sin caché del estado efectivo**: se calcula en tiempo real al evaluar Fauchard. Evita inconsistencias por updates parciales.

### 1.4 Mapeo `WORK_TYPES` (15) → 5 categorías

| Categoría | `work_type` cubiertos |
|---|---|
| **Coronas** | `corona_anterior`, `corona_posterior`, `corona_implante` |
| **Inlays, Onlays y Carillas** | `inlay_onlay`, `carilla_unitaria`, `carillas_multiples` |
| **Puentes y Full Arch** | `puente_3u`, `puente_4mas`, `full_arch` |
| **Prótesis Removible** | `protesis_parcial_removible`, `protesis_total`, `sobredentadura`, `barra_implantes` |
| **Guías Quirúrgicas** | `guia_quirurgica_simple`, `guia_quirurgica_compleja` |

- Se conserva `WORK_TYPES` (15) sin cambios — Fauchard sigue scoreando experiencia con esa granularidad.
- Se agrega `WORK_CATEGORIES` (5) + constante `WORK_TYPE_TO_CATEGORY` para traducir caso → categoría → switch.
- El técnico declara disponibilidad **por categoría**, no por `work_type`. La granularidad de 5 es clínicamente coherente y reduce fricción de UI.
- **Caveat**: el grupo "Inlays, Onlays y Carillas" agrupa restauraciones que algunos técnicos podrían diferenciar. Si emergen casos reales, se puede dividir más adelante sin migración disruptiva (agregar una 6ª categoría).

### 1.5 UI del panel de disponibilidad

- Padres OFF → hijos deshabilitados visualmente (no editables), con leyenda explicativa ("Activa CAD para gestionar estas categorías").
- Valores de los hijos **se preservan en BD** aunque el padre esté OFF. Al reactivar el padre, los hijos recuperan su estado declarado.
- Cambiar el padre **no propaga** modificación a los hijos.

### 1.6 Switch global persistente — visibilidad

El switch global del técnico vive en dos lugares simultáneos:

- **Header / topbar** siempre visible cuando el rol es técnico: badge con color (verde = ON / gris = OFF) + texto corto ("Activo" / "En pausa").
- **Click en el badge → menú rápido**: toggle global directo + atajo "Ir a panel de disponibilidad" para gestión fina (CAD/CAM y categorías).
- Toggle directo desde el badge desencadena el flujo de invitaciones in-flight (sección 3).
- **Aviso contextual**: si lleva más de 7d ON sin actividad (heartbeat), el badge muestra un punto suave de aviso.

Objetivo: el técnico que termina trabajo un sábado 23:30 y decide descansar el domingo puede cambiar a OFF desde cualquier pantalla con un click, sin tener que navegar a su perfil.

---

## 2. Sanción por no-respuesta

### 2.1 Evento sancionable

**Sanciona únicamente**: invitación `pending → expired` por timeout sin acción del técnico (sin cotizar y sin rechazar explícitamente).

**No sanciona**:

- Técnico cotizó y perdió contra otro (`quoted`).
- Técnico **rechazó explícitamente la invitación** (acción individual con motivo desde catálogo — ver sección 3.2). El rechazo explícito es decisión informada, no ausencia.
- Caso cancelado por el dentista antes de expirar.

**Sin excepciones por urgencia ni por estado del switch al momento de recibir la invitación**: una vez enviada, el técnico es responsable de responder. La urgencia no tiene comportamiento distinto al resto del flujo.

### 2.2 Curva escalonada (rolling, parametrizable)

| No-respuestas en ventana | Acción |
|---|---|
| `level1Threshold` (default **1**) | **Nivel 1** — Warning visible al técnico (notificación + indicador en panel). Sin penalización al score. |
| `level2Threshold` (default **2**) | **Nivel 2** — Penalización al score Fauchard + notificación: "Has dejado de responder N invitaciones recientes." |
| `level3Threshold` (default **3**) | **Nivel 3** — **Auto-OFF del switch global** + penalización mayor al score + email/notificación: "Te pusimos en pausa. Reactivar cuando estés disponible." |
| 4ª tras reactivar | Marca para revisión manual del admin. No más acciones automáticas. |

**Los umbrales son parámetros de `fauchard_config`** (`level1Threshold`, `level2Threshold`, `level3Threshold`). Defaults: 1, 2, 3 respectivamente.

> ⚠️ **Cuidado al ajustar**: configuraciones absurdas degradan el sistema sin avisar. Mantener siempre:
> - `level1Threshold < level2Threshold < level3Threshold` (orden estricto).
> - Valores positivos enteros chicos (recomendado: ≤ 10). Subir `level3Threshold` a 50 vuelve la sanción virtualmente inalcanzable y vacía el mecanismo.
> - Bajar `level1Threshold` a 0 dispararía warnings sin que ocurra ninguna no-respuesta. No tiene sentido.
> - El admin tiene un selector con validación de UI; no permitir guardar combinaciones inválidas.

La curva 1/2/3 es la **decisión de producto** recomendada. La parametrización existe para calibración en producción, no para reinventar el modelo.

### 2.3 Ventana rolling — semántica

Una no-respuesta no se borra al sancionarse: queda registrada con su `fecha_evento`. La ventana rolling significa que **solo cuentan para el cálculo del nivel actual las no-respuestas ocurridas en los últimos `noResponseWindowDays` días** (parámetro de `fauchard_config`, default **14 días**).

**Ejemplo**:
- 1-jun: no-respuesta #1 → nivel 1.
- 5-jun: no-respuesta #2 → nivel 2 (ambas en ventana).
- 16-jun: nueva no-respuesta. La del 1-jun cumplió 15 días, sale de la ventana. Quedan #2 (5-jun) + la nueva → **nivel 2**, no nivel 3.
- 20-jun: otra. En ventana: 5-jun, 16-jun, 20-jun → **nivel 3, auto-OFF**.

**Memoria post auto-OFF**:
- El evento auto-OFF queda en historial permanente (no se borra).
- El contador rolling sigue funcionando igual tras la reactivación.
- `noResponseRehabilitationDays` días (default **30**) sin nuevas no-respuestas → técnico considerado **"rehabilitado"** (status interno, útil para reporting y para admin).

**Decaimiento del score**: alineado con la ventana rolling. La penalización no es permanente; baja sola cuando los eventos salen de los 14 días.

### 2.4 Heartbeat anti-olvido (no sancionable)

- **`inactivityAutoOffDays` días con switch ON sin login** (default **30**) → auto-OFF preventivo. No es sanción, es housekeeping.
- **`inactivityReminderDays` días ON sin actividad** (default **7**, recibir o responder invitaciones) → recordatorio suave en login + punto de aviso en el badge global.

Ambos valores son parámetros de `fauchard_config`. Misma advertencia general que en 2.2: combinaciones absurdas (ej. `inactivityReminderDays > inactivityAutoOffDays`) deben rechazarse en la validación de UI del panel admin.

### 2.5 Pesos en el score Fauchard — antes / después

**Antes** (estado actual del sistema, `fauchard_config` defaults):

```
score = 0.25·Q + 0.20·P + 0.20·E − 0.20·C + 0.15·B
```

Donde Q = calidad (rating/5), P = puntualidad, E = experiencia, C = carga actual, B = bonus por inactividad. Rango típico observado: 0.3–0.7.

La no-respuesta hoy se trata con un **filtro de exclusión binario**: si `consecutiveNoResponse >= 3`, el técnico queda fuera del pool. No hay gradación, no hay reset automático, no hay penalización proporcional. Todo o nada.

**Después** (con la curva de niveles, **re-normalizado** para mantener `|Σα| = 1.00`):

```
score = 0.20·Q + 0.15·P + 0.15·E − 0.15·C + 0.10·B − 0.25·N

αN = 0.25
N ∈ {0.0, 0.5, 1.0}
```

**Re-normalización**: el diseño original mantenía la suma de valores absolutos de coeficientes en 1.00 (`|0.25|+|0.20|+|0.20|+|0.20|+|0.15| = 1.00`). Al agregar el nuevo término N, todos los coeficientes se reducen proporcionalmente para preservar esa propiedad, evitando que el score sobre-pondere arbitrariamente.

Comparación antes / después:

| Coef. | Antes | Después | Notas |
|---|---|---|---|
| αQ (calidad) | 0.25 | **0.20** | Sigue siendo el factor dominante |
| αP (puntualidad) | 0.20 | **0.15** | |
| αE (experiencia) | 0.20 | **0.15** | |
| αC (carga, negativo) | 0.20 | **0.15** | |
| αB (bonus inactividad) | 0.15 | **0.10** | |
| **αN (no-respuesta, negativo)** | — | **0.25** | **Nuevo. Segundo lugar tras Q.** |
| **\|Σα\|** | 1.00 | **1.00** | ✓ |

| Nivel | N | Impacto en score | Acción adicional |
|---|---|---|---|
| 1 (1 no-respuesta) | 0.0 | 0.000 | Warning visible |
| 2 (2 no-respuestas) | 0.5 | **−0.125** | Notificación |
| 3 (3+ no-respuestas) | 1.0 | **−0.250** | **Auto-OFF** del switch global |

**Justificación de los pesos**:

- `αN = 0.25` queda en segundo lugar tras `αQ` (calidad). La no-respuesta es señal directa de no compromiso y debe pesar fuerte, pero la calidad histórica sigue siendo el factor dominante de selección.
- Nivel 2 baja el score 0.125 puntos absolutos (≈20–25% del score típico observado): empuja al técnico al final del pool sin sacarlo. Sigue elegible.
- Nivel 3 combina −0.250 con auto-OFF: estructuralmente excluido por el switch; si reactiva, parte con score castigado hasta que la ventana lo olvide.
- N decae solo con el tiempo (no requiere intervención): cuando salen no-respuestas viejas, N baja y el score se recupera.
- El **rango dinámico del score se contrae** (max teórico cae de ~0.80 a ~0.60) pero el **ranking relativo entre técnicos se preserva**, que es lo único que importa para la selección Fauchard (es una transformación lineal monótona).

**Reemplazo del modelo binario**:

- El filtro `consecutiveNoResponse >= 3 → excluded` se **retira** (lo absorbe el auto-OFF de nivel 3).
- El campo `consecutiveNoResponse` se sustituye por tabla nueva `technician_no_response_event` con timestamps individuales (necesario para soportar ventana rolling).

**Calibración**: los valores `αN=0.25` (re-normalizado), ventana 14d, umbrales {1, 2, 3} son punto de partida. Hay que validar antes de producción según política de sección 11.

### 2.6 Visibilidad del estado de la ventana rolling para el técnico

**Principio**: el técnico tiene derecho a entender por qué su score se ve afectado o por qué fue puesto en auto-OFF. La opacidad de la sanción genera frustración y mala percepción del marketplace. La ventana rolling debe ser **explícita, comprensible y predecible**: el técnico sabe en qué nivel está, por qué, y cuándo (exactamente) saldrá la próxima no-respuesta del cómputo.

**Tres puntos de visibilidad complementarios**, de más permanente a más detallado:

#### 2.6.1 Indicador compacto — panel de disponibilidad (siempre visible)

En la pantalla principal del panel de disponibilidad del técnico, un bloque resumen al ingresar:

```
Estado de respuesta
──────────────────────────────────────────────
Nivel actual: Nivel 2 — Atención requerida
No-respuestas en ventana (últimos 14 días): 2

  ○ ────── ● ────── ○
  Nivel 1    Nivel 2   Nivel 3
  Sin        Score      Auto-OFF
  impacto    penalizado del switch
  (0–1)      (2)        (3+)

Próxima salida de ventana: el 16-jun-2026 (en 4 días)
                           → bajarás a Nivel 1

Ventana rolling: solo cuentan las no-respuestas
ocurridas en los últimos 14 días. Las viejas
salen automáticamente. [Ver historial completo →]
```

**Reglas del indicador de curva (stepper de 3 nodos)**:

- Los **tres nodos siempre se muestran**, en el mismo orden (Nivel 1 → 2 → 3). El técnico siempre ve la curva completa, no solo dónde está parado.
- El nodo activo se rellena (●) en el color del nivel actual (verde / ámbar / rojo). Los inactivos quedan como círculo vacío (○).
- Bajo cada nodo va una etiqueta corta de qué pasa en ese nivel: "Sin impacto" / "Score penalizado" / "Auto-OFF del switch", y entre paréntesis el rango de no-respuestas que lo dispara.
- En Nivel 3, el último nodo se pinta rojo y el bloque incluye el CTA "Reactivar disponibilidad" (que abre el modal de la sección 2.6.5).
- En Nivel 1 (caso limpio o con 1 no-respuesta), el mensaje de próxima salida puede omitirse si no hay eventos activos; el stepper sigue presente para que el técnico entienda el modelo desde el primer día.

**Reglas de presentación**:

- Color del punto / borde del bloque:
  - Nivel 1 → verde suave (informativo, no alarma)
  - Nivel 2 → ámbar
  - Nivel 3 (auto-OFF activo) → rojo, con CTA "Reactivar disponibilidad"
- "Próxima salida de ventana" se calcula como la fecha de la no-respuesta **más antigua dentro de la ventana** + 14 días.
- Si no hay no-respuestas activas, el bloque muestra "Sin no-respuestas registradas. Estás en Nivel 1." (estado limpio, mensaje positivo).
- Texto explicativo breve siempre presente — el técnico no debería tener que buscar en otro lado qué significa "rolling".

#### 2.6.2 Popover desde el badge global (acceso rápido desde cualquier pantalla)

El badge global persistente en el header (sección 1.6) ya muestra ON/OFF + punto de aviso si lleva 7d ON sin actividad. Se le agrega un segundo motivo de aviso:

- Si el técnico está en **Nivel 2 o Nivel 3**, el badge muestra el punto de aviso con color ámbar (Nivel 2) o rojo (Nivel 3).
- Click en el badge → menú rápido extendido:
  - Toggle ON/OFF (ya existente).
  - Atajo "Ir a panel de disponibilidad".
  - **Bloque "Estado de respuesta"** resumido (idéntico al de 2.6.1, una versión condensada de 3–4 líneas).

Esto permite que el técnico se entere de su situación sin tener que navegar a perfil, especialmente útil tras recibir notificación de Nivel 2 o auto-OFF.

#### 2.6.3 Vista expandida — historial de respuesta

Dentro del panel de disponibilidad, pestaña/sección **"Historial de respuesta"** con detalle cronológico (últimos 90 días o configurable):

| Fecha | Caso | Acción | Estado en ventana |
|---|---|---|---|
| 20-jun-2026 | `#A4521` | No-respuesta | **Activa** — sale el 04-jul-2026 (en 12 días) |
| 16-jun-2026 | `#A4488` | No-respuesta | **Activa** — sale el 30-jun-2026 (en 8 días) |
| 14-jun-2026 | `#A4471` | Rechazo individual ("Plazo demasiado corto") | No aplica (no cuenta) |
| 10-jun-2026 | `#A4435` | Cotización enviada (perdió) | No aplica (no cuenta) |
| 05-jun-2026 | `#A4402` | No-respuesta | **Fuera de ventana** desde el 19-jun-2026 |
| 28-may-2026 | `#A4361` | No-respuesta | Perdonada por admin el 30-may-2026 — motivo: "técnico avisó por WhatsApp que estuvo enfermo" |

**Reglas de presentación**:

- Filtros: "Solo no-respuestas activas" / "Todo el historial".
- Etiquetas visuales claras: **Activa** (cuenta para nivel), **Fuera de ventana** (ya no cuenta), **Perdonada** (admin reset), **No aplica** (eventos que nunca contaron, como rechazo explícito o cotización perdedora).
- Para cada no-respuesta activa, mostrar fecha exacta de salida + días restantes (helper "en X días").
- Eventos de **auto-OFF** y **rehabilitación** también aparecen en el historial, como hitos.

#### 2.6.4 Notificaciones puntuales

Independiente de la visualización en panel, el técnico recibe notificaciones en los eventos clave de la curva (ya definido en sección 2.2):

- Al pasar a Nivel 1 (warning): **solo in-app** (sin email, para no spamear con eventos informativos puntuales).
- Al pasar a Nivel 2: **in-app + email**.
- Al pasar a Nivel 3 (auto-OFF): **in-app + email** (severidad alta).

Cada notificación incluye un enlace directo a la vista expandida 2.6.3 ("Ver mi historial de respuesta") para que el técnico tenga contexto inmediato sin tener que buscarlo.

**Importante para evitar mala UX**: las notificaciones nunca son punitivas en tono. Son informativas. "Has dejado de responder 2 invitaciones recientes en los últimos 14 días. Esto puede afectar la prioridad con la que recibes nuevas invitaciones. [Ver detalle →]". No: "Estás siendo sancionado".

#### 2.6.5 Modal informativo al reactivar tras auto-OFF (Nivel 3)

Cuando el técnico hace click en el CTA **"Reactivar disponibilidad"** desde un estado de auto-OFF (Nivel 3), aparece un modal de confirmación **informativo, no bloqueante**:

```
¿Reactivar tu disponibilidad?

Tu situación actual:
 • 3 no-respuestas activas en los últimos 14 días
 • Tu score Fauchard está penalizado en −0.25 hasta que
   estas no-respuestas salgan de la ventana
 • La próxima salida es el 16-jun-2026 (en 4 días),
   ahí bajarás a Nivel 2

⚠ Importante: si reactivas y dejas pasar UNA invitación más
sin responder, tu cuenta queda en revisión manual del admin
(no se reactivará automáticamente).

       [ Cancelar ]   [ Reactivar igualmente ]
```

**Principios del modal**:

- **No bloquea agencia**: el técnico siempre puede reactivar si insiste. Es educativo, no restrictivo.
- **No hay cooldown obligatorio** entre auto-OFF y reactivación. Reactivar antes o después no afecta cuándo las no-respuestas salen de la ventana — solo afecta si el técnico está en el pool durante ese período (y por tanto, si arriesga sumar una 4ª).
- **Reactivar NO limpia el score ni el contador**: la penalización (−0.25) y las no-respuestas activas **siguen vigentes** hasta que envejezcan naturalmente en la ventana rolling o sean perdonadas por admin (sección 2.7). Reactivar el switch es decisión de disponibilidad, no perdón de historial. Si reactivar borrara N, el sistema sería trivialmente esquivable (apaga y prende para limpiar).
- **Datos siempre actualizados**: los números mostrados en el modal (cantidad de no-respuestas, penalización, fecha de próxima salida) se calculan en tiempo real al abrir el diálogo.

**Mensaje clave**: la fecha "próxima salida" indica cuándo la ventana se aliviana sola, **no** cuándo el técnico "debería" esperar para reactivar. El usuario decide.

#### 2.6.6 Por qué tres puntos y no uno solo

- El **badge** captura al técnico que está usando la app para otra cosa y le da contexto sin fricción.
- El **panel de disponibilidad** es donde un técnico va deliberadamente a entender su situación.
- El **historial expandido** es para auditoría personal y para responder preguntas concretas ("¿de qué caso fue esa no-respuesta?").

Tres capas de detalle creciente. El técnico nunca necesita escribir a soporte para saber por qué quedó en Nivel 2 o cuándo va a salir.

### 2.7 Reset manual del admin

**Botón en panel admin del técnico**: "Resetear contador de no-respuestas".

**Flujo de UI**:

- Al hacer click, se abre un modal de confirmación con un **campo de texto libre obligatorio** para el motivo del reset. El botón "Confirmar" permanece deshabilitado mientras el campo esté vacío.
- El admin puede ver, en el mismo modal, la lista de no-respuestas activas que serán perdonadas (fecha, caso) antes de confirmar.
- Una vez confirmado, los eventos activos pasan a `pardoned` (no se borran; mantienen historial). Salen del cómputo N inmediatamente.

**Auditoría completa**:

Cada reset queda registrado con:

- `admin_user_id` — quién ejecutó el perdón.
- `technician_user_id` — sobre quién se aplicó.
- `pardoned_at` — timestamp.
- `reason_text` — motivo libre escrito por el admin (obligatorio, no acepta vacío).
- Lista de `no_response_event_ids` perdonados en esa acción.

**Visibilidad**:

- El registro de cada reset es visible para el admin (historial de acciones administrativas, panel de auditoría).
- El **técnico** ve en su historial de respuesta (sección 2.6.3) que la no-respuesta fue "Perdonada" con la fecha del perdón y el motivo registrado por el admin. Esto le da transparencia sobre por qué su contador bajó.
- El técnico **también recibe notificación in-app + email** al aplicarse el perdón (mismo canal que el resto de transiciones; ver sección 9.4), con tono informativo: *"Un administrador perdonó N no-respuestas en tu historial. Tu nivel actual es ahora X."*

**Casos de uso típicos**:

- Técnico avisó por canal externo (WhatsApp, llamada) que estuvo enfermo / hospitalizado.
- Problema técnico verificado de la plataforma que impidió la respuesta (ej. falla de notificaciones push).
- Caso de fuerza mayor (corte eléctrico regional, catástrofe).
- Error operativo del admin (ej. el técnico sí respondió por canal interno pero el sistema no lo registró).

**No es para uso casual**: el motivo libre obligatorio existe precisamente para que el admin justifique cada reset y que esa justificación sea consultable después. Resets sin motivo claro son señal de mal uso de la herramienta.

---

## 3. Apagar el switch con invitaciones in-flight

Cuando el técnico pulsa OFF global y tiene invitaciones `pending`, el sistema muestra un diálogo de decisión informada:

> **Tienes N invitaciones pendientes. ¿Qué quieres hacer?**
> - **Mantenerlas activas** (default) — el switch OFF afecta solo invitaciones nuevas; las pendientes siguen vivas con su deadline. Si no respondes, cuentan como no-respuesta.
> - **Rechazarlas todas** — decisión explícita con motivo. No cuentan como no-respuesta.

### 3.1 Rechazo masivo — registro doble (auditoría + normalización)

Si el técnico elige "Rechazarlas todas":

- **Motivo obligatorio** (selector poblado desde catálogo BD `bulk_rejection_reason`, administrable — ver detalle abajo).
- **Comentario libre** (auditoría): opcional, **obligatorio si el motivo es "Otro"**.

#### Catálogo de motivos en BD

Tabla nueva: **`bulk_rejection_reason`**. Permite agregar / modificar motivos en el futuro sin redeploy, igual que el catálogo de rechazo individual (sección 3.2) y los catálogos UI existentes (`vita_shade`, `restoration_type`, etc.).

Estructura (idéntica al patrón general de catálogos):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | Opaco, system-generated (`brej_001`, `brej_002`, ...). Estable. |
| `label` | text | Único campo editable por admin. Es lo que ve el técnico en el selector. |
| `description` | text nullable | Texto auxiliar para tooltip en UI (opcional). |
| `sort_order` | int | Orden en el selector. |
| `is_active` | boolean | Soft-delete. |

**Seed inicial sugerido** (puede ampliarse en cualquier momento por admin):

| `code` | `label` |
|---|---|
| `brej_001` | Vacaciones |
| `brej_002` | Carga de trabajo alta |
| `brej_003` | Pausa temporal |
| `brej_004` | Problema personal |
| `brej_005` | Otro |

Si el técnico elige `brej_005` (Otro), el comentario libre se vuelve **obligatorio** (consistente con el catálogo de rechazo individual).

#### Persistencia

Los datos del rechazo masivo se persisten asociados al evento (columna o tabla auxiliar, según diseño BD del plan técnico):

- `bulk_rejection_reason_id` → FK a `bulk_rejection_reason` (ON DELETE RESTRICT).
- `bulk_rejection_comment` → texto libre, nullable salvo cuando el motivo es `brej_005`.

#### Admin

- CRUD del catálogo `bulk_rejection_reason` en `/dashboard/admin/catalogos`, mismo patrón que `invitation_rejection_reason`.
- Admin solo edita `label` y `description`; `code` se genera automáticamente.
- Borrar un motivo activo devuelve error de FK si está en uso; admin solo desactiva.

#### Caso especial — auto-rechazo por auto-OFF Nivel 3

Cuando el sistema rechaza automáticamente invitaciones por auto-OFF Nivel 3 (sección 3.2.bis), usa el motivo `brej_003` (Pausa temporal) por convención. El comentario interno "Auto-rechazo por auto-OFF Nivel 3 (sanción)" se persiste como `bulk_rejection_comment` y es visible solo al admin (no al dentista). Si el admin renombra el label de `brej_003` desde el panel, el código del motivo no cambia y la lógica sigue funcionando.

### 3.2 Rechazo explícito de invitación individual (acción nueva)

**Contexto**: hoy la aplicación web no implementa la función "rechazar invitación". El técnico solo puede cotizar o dejar expirar. Esto fuerza no-respuestas que el sistema interpreta como falta de compromiso, cuando muchas veces el técnico simplemente no quiere ese caso por un motivo legítimo (carga, materiales que no maneja, plazo imposible, etc.).

**Decisión**: agregar una acción explícita **"Rechazar invitación"** disponible en el UCH del técnico mientras la invitación está `pending`. El rechazo individual es distinto del **rechazo masivo** del switch OFF (sección 3.1): aquí el técnico permanece activo, solo descarta esta invitación puntual.

#### Comportamiento

- Al rechazar, el técnico debe **seleccionar un motivo de un catálogo** (selector obligatorio).
- Opcionalmente puede agregar un comentario libre (auditoría adicional).
- La invitación pasa de `pending` → `rejected` (estado ya existente en `caseInvitation`).
- **No cuenta como no-respuesta**: no alimenta el contador rolling 14d ni penaliza score (sección 2.1).
- Fauchard registra el rechazo para análisis. Si la categoría/capacidad acumula muchos rechazos por el mismo motivo, es señal para admin (precio bajo, plazos cortos, materiales escasos, etc.).

#### Catálogo de motivos en BD

Tabla nueva: **`invitation_rejection_reason`**. Permite agregar motivos en el futuro sin redeploy y estandariza la auditoría / analytics.

Estructura propuesta (alineada con el patrón de catálogos UI existente — `vita_shade`, `restoration_type`, etc.):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | Opaco, system-generated (`rej_001`, `rej_002`, ...). Estable. |
| `label` | text | Único campo editable por admin. Es lo que ve el técnico en el selector. |
| `description` | text nullable | Texto auxiliar para tooltip en UI (opcional). |
| `sort_order` | int | Orden en el selector. |
| `is_active` | boolean | Soft-delete; admin nunca borra, solo desactiva. |

**Seed inicial sugerido** (puede ampliarse en cualquier momento por admin):

| `code` | `label` |
|---|---|
| `rej_001` | Carga de trabajo alta |
| `rej_002` | Plazo demasiado corto |
| `rej_003` | Precio sugerido fuera de rango |
| `rej_004` | No manejo el material requerido |
| `rej_005` | Caso fuera de mi especialidad clínica |
| `rej_006` | Información del caso insuficiente |
| `rej_007` | Otro |

Si el técnico elige `rej_007` (Otro), el comentario libre se vuelve **obligatorio** (consistente con la regla del rechazo masivo del switch).

#### Persistencia en la invitación

Cuando una invitación pasa a `rejected` por acción explícita del técnico:

- `caseInvitation.rejectionReasonId` → FK al catálogo `invitation_rejection_reason` (ON DELETE RESTRICT).
- `caseInvitation.rejectionComment` → texto libre, nullable salvo cuando el motivo es `rej_007`.
- `caseInvitation.rejectedAt` → timestamp del rechazo.
- Evento UCH `OFERTA_RECHAZADA_POR_TECNICO` (o equivalente) con `visibleTo: 'sistema'` — el dentista **no** ve esto (consistente con sección 4.5).

#### Admin

- CRUD del catálogo `invitation_rejection_reason` en panel admin (mismo patrón que catálogos UI existentes en `/dashboard/admin/catalogos`).
- Admin solo edita `label` y `description`; `code` se genera automáticamente.
- Borrar un motivo activo devuelve error de FK si está en uso; admin solo desactiva.
- Dashboard analítico: distribución de rechazos por motivo, por categoría/capacidad, por técnico. Útil para detectar problemas estructurales del marketplace.

#### Diferencia clara entre los dos tipos de rechazo

| Aspecto | Rechazo individual (3.2) | Rechazo masivo al apagar (3.1) |
|---|---|---|
| Disparador | Acción del técnico sobre **una** invitación específica | Toggle OFF del switch con pendientes |
| Estado del switch | Sigue activo | Pasa a OFF |
| Motivo | Catálogo `invitation_rejection_reason` (BD, ampliable) | Catálogo `bulk_rejection_reason` (BD, ampliable) |
| Comentario libre | Opcional (obligatorio si motivo es "Otro") | Opcional (obligatorio si código es `otro`) |
| Cuenta para sanción | No | No |
| Visible al dentista | No | No |

Ambos coexisten. El rechazo individual es la herramienta del día a día; el masivo es para cuando el técnico se va por un período.

### 3.2.bis Caso especial — auto-OFF por Nivel 3 con invitaciones pendientes

Cuando el sistema fuerza el switch a OFF automáticamente por alcanzar Nivel 3 de sanción (sección 2.2), el técnico **no participa** del diálogo de "Mantenerlas activas / Rechazarlas todas" (sección 3): el cambio fue automático, no decisión informada.

**Política**: el sistema **rechaza automáticamente** todas las invitaciones `pending` del técnico al momento del auto-OFF, con:

- Motivo del catálogo = `brej_003` (Pausa temporal por convención).
- Comentario interno (no editable, visible solo a admin): "Auto-rechazo por auto-OFF Nivel 3 (sanción)".
- Mismo comportamiento que el rechazo masivo voluntario: **no cuenta como no-respuesta** (no agrava la sanción), y **dispara reemplazo automático** (sección 3.3) si el cutoff temporal lo permite.

**Razón**: si las invitaciones se mantuvieran activas, el técnico ya penalizado sumaría 4ª y 5ª no-respuestas sin posibilidad real de responder (su switch está OFF, su sesión probablemente inactiva). El sistema lo protege de empeorar su situación mientras decide qué hacer.

El técnico al reactivar (sección 2.6.5) ve en su historial que esas invitaciones fueron auto-rechazadas con el motivo registrado, en línea con el principio de transparencia.

### 3.3 Reemplazo automático tras rechazo

Cuando una invitación pasa a `rejected` por acción explícita del técnico — sea individual (3.2) o como parte de un rechazo masivo al apagar el switch (3.1) — Fauchard intenta **enviar una invitación de reemplazo** al siguiente técnico del pool scoreado original que siga siendo elegible.

#### 3.3.1 Cuándo se dispara y cuándo no

Reemplazo **se dispara** cuando:

- La invitación pasó a `rejected` (acción explícita del técnico, individual o masiva).
- Queda tiempo suficiente en la ronda de cotización del caso (ver 3.3.2).
- Hay candidatos disponibles en el pool scoreado original que aún no fueron invitados.
- El pool de invitaciones vivas (`pending` + `quoted`) sigue por debajo de `nInvited`.

Reemplazo **NO se dispara** cuando:

- La invitación expiró por no-respuesta (`pending → expired`). Las no-respuestas alimentan el contador de sanción (sección 2) y no generan reemplazo. Reemplazar a un no-respondedor con otro técnico podría iniciar cascada de no-respuestas en horarios de baja actividad.
- Se está dentro de la ventana de cutoff del deadline (ver 3.3.2).
- El pool scoreado original ya se agotó (todos los candidatos fueron invitados en algún momento de la ronda).
- Algún candidato sobreviviente del pool dejó de ser elegible (cambió su switch a OFF entre publicación y ahora). Se salta y se evalúa el siguiente.

#### 3.3.2 Cutoff temporal — `replacementCutoffMinutes`

Una invitación de reemplazo enviada con muy poco margen es inútil: el técnico no alcanza a cotizar antes de que se cierre la ronda. Para evitar esto:

- Nuevo parámetro en `fauchard_config`: **`replacementCutoffMinutes`**, default **10 min**.
- Regla: si el deadline efectivo de la ronda de cotización del caso menos `now` es **menor o igual** a `replacementCutoffMinutes`, **no se envía reemplazo**. La ronda se cierra con el pool actual.
- **Deadline efectivo del caso** = `max(expiresAt)` entre las invitaciones `pending` o `quoted` activas en ese momento (sigue la lógica ya existente en `caseDeadlines.ts`).

Ejemplo: la ronda cierra a las 18:00. Un técnico rechaza a las 17:55 (5 min antes). Como `5 min < 10 min` (cutoff), Fauchard **no** envía reemplazo. El caso procede a evaluación con el pool actual.

#### 3.3.3 Duración de la invitación de reemplazo

La invitación de reemplazo lleva su propio `expiresAt`:

```
expiresAt_reemplazo = min(now + tQuoteMinutes, deadline_caso)
```

- Si `now + tQuoteMinutes ≤ deadline_caso`, la invitación tiene su ventana completa.
- Si excedería el deadline del caso, se **trunca al deadline del caso** para no extender la ronda artificialmente. El técnico de reemplazo recibe la invitación con la advertencia "Tiempo restante: 18 min" en su UCH.
- Combinado con el cutoff de 10 min, el reemplazante siempre tiene al menos `replacementCutoffMinutes` para cotizar (10 min por default).

#### 3.3.4 Cascada de rechazos y composición del pool

Cada nuevo rechazo dispara una nueva evaluación de reemplazo. No hay límite explícito de iteraciones: el límite implícito es **el pool scoreado original** (cada técnico aparece una sola vez, así que la cascada se detiene cuando se agota el pool o cuando se cruza el cutoff temporal).

**Composición del pool scoreado original**: Fauchard al publicar scorea a **todos los técnicos elegibles** que cumplen el filtro AND triple (sección 1.3), no solo a los `nInvited` con mejor score. Los `nInvited` con mejor score reciben las primeras invitaciones; el resto queda en banco como candidatos disponibles para reemplazo. No hay cap adicional sobre el tamaño del pool — la lista entera de elegibles es el universo de reemplazos posibles.

#### 3.3.5 Re-verificación de elegibilidad al reemplazar

Antes de invitar a un candidato del pool original, Fauchard **re-verifica su AND triple** (`elegible(...)`, sección 1.3). El switch del técnico pudo cambiar entre la publicación y este momento. Si ya no es elegible, se salta al siguiente del ranking.

Esto preserva la integridad del modelo de disponibilidad declarada: un técnico que apagó su switch después de la publicación no recibe invitaciones nuevas, aunque hubiera estado en el pool original.

#### 3.3.6 Interacción con `evaluateQuotesAction`

La evaluación del comparativo dispara cuando ya no hay invitaciones vivas (todas resolvieron a `quoted`, `rejected` o `expired`) o cuando se alcanza el umbral mínimo configurado de cotizaciones (`minQuotesToEvaluate`, si existe). Los reemplazos cuentan como invitaciones vivas hasta que resuelvan. Esto significa que la evaluación **espera** a los reemplazos siempre que el cutoff temporal permita seguir enviándolos.

#### 3.3.7 Diferencia con re-pool por escenario C

No confundir con el re-encolado a `pendiente_pool` del escenario C (sección 5.4): el reemplazo de 3.3 ocurre **dentro de la misma ronda de cotización**, mientras el caso sigue en `enEvaluacion` con invitaciones vivas. El re-encolado del escenario C ocurre **después** de que toda la ronda expiró sin cotizaciones, y arranca una ronda nueva con un TTL nuevo.

### 3.4 Visibilidad al dentista

**El dentista nunca ve** estos motivos. La información vive en el dominio Fauchard / admin:

- Fauchard puede usar el código como señal opcional para futuras decisiones de reinvitación.
- Admin obtiene reporting de patrones (ej. muchos rechazos por `carga_alta` indican marketplace saturado).
- El propio técnico ve su historial de rechazos.

---

## 4. Modelo temporal — qué reloj usa cada countdown

### 4.1 Countdowns de la ronda comercial — **wall-clock puro**

| Countdown | Cuándo arranca | Cuándo termina | Existe hoy |
|---|---|---|---|
| `tQuoteMinutes` — técnico cotiza | `sendInvitationsAction` | técnico cotiza / rechaza / expira | sí |
| `tProposalHours` — dentista elige oferta | `buildProposalAction` | dentista acepta / rechaza / expira | sí |
| **`tDentistReviewHours` — dentista revisa entrega** | `submitRevisionAction` | `approveWorkAction` o `requestRevisionAction` | **no — parámetro nuevo** |

**Sin businessTime, sin feriados** en los tres. HMS visible en UCH y en los dashboards de la parte involucrada.

### 4.2 `tDentistReviewHours` — countdown nuevo para la revisión del dentista

**Es un parámetro nuevo** en `fauchard_config`. Hoy no existe: el dentista que recibe una entrega del técnico no tiene plazo formal para aprobar o pedir cambios; el técnico podría quedar esperando indefinidamente.

- Default sugerido: **48h wall-clock** (a calibrar).
- Configurable por admin desde el panel Fauchard.
- Visible como HMS en el UCH del dentista y del técnico que entregó.
- **Múltiples entregas (versiones)**: cada `submitRevisionAction` **reinicia** el countdown desde cero. Si el técnico entrega versión 2 después de un `requestRevisionAction`, el dentista vuelve a tener `tDentistReviewHours` completos para responder. Cada versión es una ronda independiente.

**Política al expirar (sin auto-acción)**:

- **No se auto-aprueba ni se auto-rechaza**: aprobar trabajo clínico automáticamente es legalmente delicado.
- **Notificación escalonada al dentista**: recordatorio antes del vencimiento; segundo aviso al vencer.
- **Marca visible** para ambas partes: dentista ve "respuesta vencida" en dashboard; técnico ve "esperando respuesta — plazo vencido" en UCH.
- **Métrica interna**: tiempo medio de respuesta del dentista entra en su panel y es visible para admin. No genera sanción al score (es cliente, no proveedor), pero sí presión social blanda.

### 4.3 `workDeadline` — sigue con businessTime

- Es el plazo de ejecución del contrato aceptado por el técnico. Sí necesita marco temporal compartido (es bilateral, dura días, atraviesa fines de semana).
- Sigue usando `addBusinessTime()` sobre `businessHoursStart/End` + `businessDaysMask` + `fauchard_holiday`.
- **Sin cambios respecto al estado actual**.
- **Feriados siempre aplican**. No hay flag por feriado para deshabilitar caso a caso (se puede agregar más adelante si hay necesidad real).
- **Tensión asumida**: un técnico que opera sábados se beneficia con un plazo más largo del que cotizó. Aceptable porque favorece al técnico y nunca perjudica al dentista (recibe a tiempo o antes).
- **Técnico ganador que entra en auto-OFF Nivel 3 durante un trabajo activo**: el caso **sigue asignado al técnico**, `workDeadline` corre normal, el técnico mantiene acceso al UCH del caso para gestionarlo y entregar. El auto-OFF solo bloquea **invitaciones futuras**, no rompe contratos en curso. Si el técnico no entrega, aplica la lógica de plazo vencido habitual (sin sanción adicional por la sanción ya activa).

### 4.4 Panel admin "Calendario laboral" — relabel

- Se **conserva** porque sus parámetros alimentan `workDeadline`.
- Se **relabela** como "Calendario para plazos de ejecución".
- Texto explícito en la UI: *"Estos parámetros NO afectan los countdowns de cotización, propuesta ni revisión del dentista. Aplican únicamente al cálculo del plazo de entrega del trabajo."*
- Documentación del repo (`frontend/lib/db/CLAUDE.md`) se **actualiza** para corregir la frase "Reloj de feriado/horario aplica también a expiración de invitaciones y propuestas" — esa afirmación queda obsoleta.

### 4.5 Visibilidad del dentista

Nunca ve:

- Disponibilidad / switch de los técnicos.
- Motivos de rechazo masivo.
- Conteo de invitaciones enviadas / técnicos consultados.

Solo ve:

- Su oferta final (comparativo de Fauchard cuando hay cotizaciones).
- "No se recibieron ofertas para este caso" en el peor escenario (sección 5).
- Su propio countdown `tProposalHours` cuando hay propuesta lista.
- Su propio countdown `tDentistReviewHours` cuando recibe entrega.

---

## 5. Pool de elegibles — comportamiento de Fauchard cuando hay falta de oferta

### 5.1 Tres escenarios

| Escenario | Cuándo | Política |
|---|---|---|
| **A** — Pool inicial vacío | Al publicar, 0 técnicos cumplen `(categoría, capacidad)` | Cola `pendiente_pool` con TTL + check-in |
| **B** — Pool parcial | `0 < elegibles < nInvited` | Invitar a los disponibles y cerrar selección |
| **C** — 0 cotizaciones tras invitar | Todas las invitaciones expiraron sin acción | **Vuelve a `pendiente_pool`** (consistente con A) |

### 5.2 Escenario A — Cola `pendiente_pool` con check-in al dentista

**Estado del caso**: `enEvaluacion` con marca interna `pendienteDePool` (o sub-status interno; nombre exacto a definir en implementación). Sin invitaciones enviadas.

**Reloj**: nuevo parámetro `tNoEligiblePoolHours` en `fauchard_config`. **Default: 24h** (wall-clock). Configurable por admin.

**Ningún countdown comercial corre durante esta fase**: `tQuoteMinutes` arranca solo al enviar una invitación específica. La cola es pre-invitación.

**Check-in al dentista** (estilo "¿sigues necesitándolo?"):

- A 50% del TTL transcurrido (default 24h → consulta a las 12h): notificación + indicador en ficha.
  > "Tu caso lleva esperando técnicos disponibles. ¿Sigues necesitándolo?"
  > → Seguir esperando (default si ignora)
  > → Cancelar caso ahora (pasa a `cerrado`)
- Una sola consulta intermedia por ciclo de cola, no múltiples.
- Cancelación es limpia: ningún técnico fue invitado, no hay nadie que liberar.

**Cancelación en cualquier momento**: el botón "Cancelar publicación" está disponible **siempre** en el banner de espera de la ficha (ver mockup 10.7), no solo en el diálogo de check-in. El dentista puede cancelar antes, durante o después del check-in.

**Trigger de salida**:

- Algún técnico hace ON elegible (cualquier nivel de switch) → evento dispara re-evaluación → Fauchard corre selección completa → invita normalmente.
- TTL se cumple sin aparición → caso pasa a `sin_cotizaciones_fallo` con motivo `no_eligible_pool_timeout`.
- Dentista cancela explícitamente → caso pasa a `cerrado`.

**No se puede editar el caso durante `pendiente_pool`**: solo cancelar o esperar. Si quiere editar, cancela y publica nuevo.

**Reactivación de cola**:

- **Event-driven** al cambio de switch del técnico (no cron).
- Fauchard **re-corre selección completa**, no solo invita al técnico recién encendido. El switch es trigger; la selección la decide Fauchard.

**Visibilidad**:

- **Dentista**: banner "Buscando técnicos disponibles..." en la ficha y listado. Nunca se le revela que el pool está vacío.
- **Admin**: dashboard de "Casos en espera de pool" con tiempo en cola, categoría y capacidad bloqueada. Métrica: tasa de casos que entran a `pendiente_pool` por categoría/capacidad → señal directa de falta de oferta estructural.

### 5.3 Escenario B — Pool parcial

- Fauchard invita a todos los elegibles disponibles, **aunque sean menos de `nInvited`**.
- No espera a llenar pool. Selección se cierra de inmediato.
- Es válido tener **1 sola invitación**. El dentista verá esa única oferta en comparativo y decide aceptar o rechazar normalmente.
- Flujo posterior idéntico: `tQuoteMinutes`, `tProposalHours`, `tDentistReviewHours` aplican igual.

### 5.4 Escenario C — 0 cotizaciones tras invitar (consistente con A)

- Hubo invitaciones; todas expiraron como `expired` por no-respuesta.
- **El caso vuelve automáticamente a `pendiente_pool`** con un nuevo TTL `tNoEligiblePoolHours` (24h), check-in al 50% incluido.
- Cada no-respuesta de los técnicos invitados alimenta su contador rolling 14d (sección 2). El sistema absorbe la señal de no-compromiso aunque la baja oferta haya sido el factor principal.
- La nueva ronda de Fauchard se dispara igual que en A: event-driven al cambio de switch de cualquier técnico, o por reset admin.
- Si el TTL del re-encolado expira sin éxito → caso pasa a `sin_cotizaciones_fallo` (esta vez sí terminal).

**Implicación**: el caso solo muere en estado terminal cuando un ciclo completo de espera (24h) no logra atraer técnicos elegibles. Antes de eso, siempre hay un intento adicional de matching.

**Límite de ciclos** (parametrizable): para evitar bucles de re-encolado infinito (caso vuelve a la cola, otra vez se invita, otra vez nadie responde, otra vez vuelve...), existe un máximo de ciclos por caso definido por el parámetro `maxPoolCycles` (default **2**). Al alcanzar el límite, el caso pasa a `sin_cotizaciones_fallo` (estado terminal real). Esto cierra la ambigüedad y evita zombies en la cola.

### 5.5 Mensaje final al dentista en `sin_cotizaciones_fallo`

Cuando el caso llega a `sin_cotizaciones_fallo` (tras agotar `maxPoolCycles` ciclos de espera):

- Mensaje claro: **"No se recibieron ofertas para este caso."**
- **Botón "Republicar"** en la ficha del caso: dispara un **modal de doble confirmación** antes de actuar (la acción es significativa: levanta una ronda Fauchard completa). Una vez confirmado, el caso pasa **directo a publicación** (estado `enEvaluacion`), **sin pasar por `borrador`**. Arranca una ronda Fauchard nueva desde cero: nuevo pool scoreado, nuevos ciclos `maxPoolCycles`, nuevos contadores.
  - El modal debe mostrar:
    > **¿Republicar este caso?**
    >
    > Se invitará a un nuevo grupo de técnicos disponibles y arrancará una ronda completa de búsqueda de ofertas.
    > El caso no vuelve a borrador: si confirmas, queda publicado de inmediato.
    >
    >       [ Cancelar ]   [ Sí, republicar ]
  - El caso conserva su `id` y todos sus archivos; no se crea un duplicado.
  - El historial UCH refleja la republicación como un evento `CASO_REPUBLICADO` con timestamp y `userId` del dentista que la disparó.
  - **No hay límite** sobre cuántas veces se puede republicar; cada republicación arranca un ciclo nuevo y depende del marketplace volver a evaluar.
  - Si el dentista quiere **editar** el caso antes de reintentar, no debe usar Republicar — debe usar la alternativa de archivar + crear copia, que sí permite modificación.
- Alternativas equivalentes ya existentes (siguen disponibles para el dentista):
  - Archivar el caso y crear una copia con cambios (`cloneCaseFromTerminalAction`) — útil si el dentista quiere modificar parámetros antes de reintentar.
  - Publicar un caso completamente nuevo desde cero.
- "Republicar" es el atajo de un click cuando el dentista quiere intentar el mismo caso sin cambios.

### 5.6 Sin override por urgencia

Caso urgente con pool vacío entra a `pendiente_pool` como cualquier otro. La urgencia no genera comportamiento especial en ninguna fase del sistema (consistente con el resto de las decisiones).

### 5.7 Parámetros relacionados

Los parámetros que gobiernan el pool y el reemplazo (`tNoEligiblePoolHours`, `maxPoolCycles`, `replacementCutoffMinutes`) se listan en detalle en la **sección 6.1** con sus defaults, cotas (sección 11.2) y tooltips funcionales (10.9). Todos siguen el patrón copy-on-write estándar de Fauchard.

---

## 6. Resumen de parámetros nuevos y cambios

### 6.1 Parámetros nuevos en `fauchard_config`

> Esta sección lista los parámetros **nuevos** que se agregan. Los plazos existentes `tQuoteMinutes` y `tProposalHours` siguen en `fauchard_config` sin cambios estructurales, pero ahora tienen **cotas formales en 11.2 y tooltips funcionales en 10.9** (antes eran inputs libres). El plan técnico debe extender la UI admin existente con esa información.

**Plazos (wall-clock)**:

| Parámetro | Default | Notas |
|---|---|---|
| `tDentistReviewHours` | 48h | Plazo del dentista para responder entregas del técnico |
| `tNoEligiblePoolHours` | 24h | Tiempo máximo de espera buscando técnicos disponibles antes de que el caso falle; check-in al dentista al 50% |
| `maxPoolCycles` | 2 | Cantidad máxima de ciclos de espera de `tNoEligiblePoolHours` antes de pasar a fallo terminal |
| `replacementCutoffMinutes` | 10 min | Margen mínimo antes del cierre de la ronda de cotización para enviar invitación de reemplazo tras un rechazo (sección 3.3) |

**Sanción por no-respuesta (días)**:

| Parámetro | Default | Notas |
|---|---|---|
| `noResponseWindowDays` | 14 | Ventana rolling para el cómputo del nivel del técnico |
| `noResponseRehabilitationDays` | 30 | Días sin nuevas no-respuestas para considerar "rehabilitado" |

**Umbrales de niveles (cantidad de no-respuestas)**:

| Parámetro | Default | Notas |
|---|---|---|
| `level1Threshold` | 1 | Disparador de Nivel 1 (warning, sin penalización) |
| `level2Threshold` | 2 | Disparador de Nivel 2 (penalización score) |
| `level3Threshold` | 3 | Disparador de Nivel 3 (auto-OFF + penalización mayor) |

> ⚠ Validar siempre `level1Threshold < level2Threshold < level3Threshold`, todos enteros positivos. UI admin rechaza combinaciones inválidas.

**Heartbeat (días)**:

| Parámetro | Default | Notas |
|---|---|---|
| `inactivityAutoOffDays` | 30 | Días con switch ON sin login antes de auto-OFF preventivo |
| `inactivityReminderDays` | 7 | Días ON sin actividad antes de recordatorio suave + aviso en badge |

> ⚠ Validar `inactivityReminderDays < inactivityAutoOffDays`.

**Score Fauchard (coeficientes)**:

| Parámetro | Default actual | Nuevo default | Notas |
|---|---|---|---|
| `alphaQuality` | 0.250 | **0.200** | Re-normalización por inclusión de αN |
| `alphaPunctuality` | 0.200 | **0.150** | |
| `alphaExperience` | 0.200 | **0.150** | |
| `alphaLoad` | 0.200 | **0.150** | |
| `alphaBonus` | 0.150 | **0.100** | |
| `alphaNoResponse` | — | **0.250** | Nuevo coeficiente para el término `−αN·N` |

> ⚠ `|Σα| = 1.00` debe mantenerse como invariante; validar al guardar.
>
> **UX de edición de coeficientes α**: dado que la suma absoluta debe ser exactamente 1.00, modificar un coeficiente desbalancea automáticamente los demás. El panel admin (sección 10.9) muestra **en tiempo real** la suma absoluta mientras el admin edita y resalta el desvío respecto a 1.00 con un indicador (`Suma absoluta: 1.03 ✗`). El botón "Guardar cambios" queda deshabilitado hasta que `|Σα| = 1.00` exacto. Si admin lleva un α a su cap individual (ej. `αN=0.40`), debe ajustar los otros hacia abajo manualmente; el sistema no auto-balancea por defecto (decisión consciente del admin).

### 6.1.bis UX del panel admin de configuración Fauchard

El panel admin que expone los parámetros del motor Fauchard debe diseñarse para que un operador no técnico (dueño del marketplace, soporte) pueda entender qué hace cada control sin leer código. Reglas obligatorias:

#### Orden visual

Agrupar los parámetros en bloques con encabezado claro, en el siguiente orden:

1. **Tiempos de la ronda comercial** (cotización, propuesta, revisión del dentista).
2. **Espera de técnicos disponibles** (cuando no hay oferta para un caso).
3. **Reemplazo automático** tras rechazo de invitación.
4. **Disponibilidad e inactividad de técnicos** (heartbeat, auto-pausa).
5. **Sanción por no responder** invitaciones (ventana, umbrales, rehabilitación).
6. **Reglas de selección y score** (coeficientes α y filtros).

#### Lenguaje funcional, no técnico

**Nunca usar nombres de estado interno** del sistema en labels o tooltips visibles al admin. El admin no debería ver "pendiente_pool", "enEvaluacion", "consecutiveNoResponse", `tQuoteMinutes`, etc.

Tabla de equivalencias para uso en labels/tooltips:

| Concepto interno | Cómo se llama en la UI admin |
|---|---|
| `pendiente_pool` | "En espera de técnicos disponibles" |
| `tQuoteMinutes` | "Tiempo que tiene el técnico para cotizar" |
| `tProposalHours` | "Tiempo que tiene el dentista para elegir oferta" |
| `tDentistReviewHours` | "Tiempo que tiene el dentista para revisar la entrega" |
| `tNoEligiblePoolHours` | "Tiempo máximo buscando técnicos disponibles" |
| `maxPoolCycles` | "Cantidad de intentos antes de declarar el caso sin ofertas" |
| `replacementCutoffMinutes` | "Margen mínimo para invitar a un técnico de reemplazo" |
| `noResponseWindowDays` | "Periodo de evaluación de no-respuestas (ventana móvil)" |
| `noResponseRehabilitationDays` | "Tiempo sin no-respuestas para considerar al técnico rehabilitado" |
| `inactivityAutoOffDays` | "Días sin actividad antes de poner al técnico en pausa automática" |
| `inactivityReminderDays` | "Días sin actividad antes de enviar un recordatorio al técnico" |
| `level1/2/3Threshold` | "Cantidad de no-respuestas que dispara aviso / penalización / pausa automática" |
| `αQ, αP, αE, αC, αB, αN` | "Peso de calidad / puntualidad / experiencia / carga / antigüedad / no-respuesta en el score" |

#### Tooltips e impacto

Cada control lleva un tooltip o nota debajo que explica:

- **Qué hace** en términos del flujo del marketplace.
- **Qué pasa si se sube** y **qué pasa si se baja** (impacto direccional concreto, no abstracto).
- **Rango recomendado** o valores típicos.

Ejemplo para "Tiempo que tiene el técnico para cotizar":

> Cuánto tiempo tiene cada técnico invitado para enviar su oferta antes de que la invitación expire.
>
> **Si lo subes**: los técnicos tienen más tiempo de respuesta y aumenta la probabilidad de recibir ofertas; el dentista espera más.
>
> **Si lo bajas**: las rondas cierran más rápido y el dentista decide antes; aumentan las no-respuestas si el plazo se vuelve impracticable.
>
> Valores típicos: 60 a 240 minutos.

Ejemplo para "Cantidad de intentos antes de declarar el caso sin ofertas":

> Si al publicar un caso no hay técnicos disponibles, el sistema espera un periodo (ver "Tiempo máximo buscando técnicos disponibles"). Si tras ese periodo aparece un técnico, intenta. Si no, repite el ciclo hasta este límite.
>
> **Si lo subes**: el caso espera más oportunidades antes de fallar; mejor experiencia para el dentista en categorías con poca oferta.
>
> **Si lo bajas**: el caso falla antes; el dentista debe republicar manualmente.
>
> Valores típicos: 1 a 3 ciclos.

#### Validaciones de UI

Bloquear al guardar combinaciones inválidas con mensaje claro:

- Umbrales de niveles no ordenados.
- `inactivityReminderDays ≥ inactivityAutoOffDays`.
- `|Σα| ≠ 1.00`.
- Valores negativos o cero en parámetros que requieren positivo.

#### Cambios con copy-on-write

El panel mantiene el patrón actual de copy-on-write: cada guardado crea una nueva fila `is_active=true` en `fauchard_config` y desactiva la anterior. Casos publicados antes del cambio mantienen su `fauchardConfigId` original (anclado al caso) y no se ven afectados.

### 6.2 Cambios en el modelo de datos (alto nivel)

- Tabla nueva: **`technician_availability`** — almacena los niveles 1 (global), 2 (CAD/CAM) y 3 (categoría × capacidad) por técnico.
- Tabla nueva: **`technician_no_response_event`** — timestamps individuales por no-respuesta, soporta ventana rolling 14d. Reemplaza el uso de `consecutiveNoResponse`.
- Tabla nueva: **`invitation_rejection_reason`** — catálogo de motivos para **rechazo individual** de invitaciones, administrable desde admin (patrón idéntico a los catálogos UI existentes). Campos: `id`, `code` opaco, `label`, `description`, `sort_order`, `is_active`. Seed inicial con 7 motivos canónicos.
- Tabla nueva: **`bulk_rejection_reason`** — catálogo de motivos para **rechazo masivo** al apagar el switch (sección 3.1). Mismo patrón estructural que `invitation_rejection_reason`. Seed inicial con 5 motivos canónicos.
- Columnas nuevas en `case_invitation`:
  - Para rechazo individual: `rejection_reason_id` (FK a `invitation_rejection_reason`, ON DELETE RESTRICT), `rejection_comment` (text nullable), `rejected_at` (timestamp).
  - Para rechazo masivo: `bulk_rejection_reason_id` (FK a `bulk_rejection_reason`, ON DELETE RESTRICT, nullable), `bulk_rejection_comment` (text nullable). El plan técnico decide si estas columnas viven en `case_invitation` o en una tabla auxiliar `bulk_rejection_event` (asociada al toggle OFF que generó múltiples rechazos).
- Marca interna en `clinical_case` para `pendienteDePool` (sub-status o flag, según implementación).
- Columnas nuevas en `fauchard_config` (lista completa según sección 6.1):
  - **Plazos**: `tDentistReviewHours`, `tNoEligiblePoolHours`, `maxPoolCycles`, `replacementCutoffMinutes`.
  - **Sanción**: `noResponseWindowDays`, `noResponseRehabilitationDays`.
  - **Umbrales**: `level1Threshold`, `level2Threshold`, `level3Threshold`.
  - **Heartbeat**: `inactivityAutoOffDays`, `inactivityReminderDays`.
  - **Score**: `alphaNoResponse`.
- Campos de auditoría en cada fila de `fauchard_config` (consistente con copy-on-write): `created_by`, `created_at`, `change_reason` (texto obligatorio).

### 6.3 Cambios en lógica Fauchard

- Filtro `elegible()` con AND triple integrado en `runFauchardAction` antes del score.
- Nueva ruta `pendiente_pool` cuando el pool elegible es 0.
- Re-evaluación event-driven al cambio de switch del técnico.
- Score: agregar término `−αN·N`; retirar exclusión binaria por `consecutiveNoResponse`.
- Límite parametrizable de ciclos de `pendiente_pool` por caso (`maxPoolCycles`, default 2) para re-encolado tras escenario C.

### 6.4 Cambios en UI / UX

- **Panel de disponibilidad jerárquico** (3 niveles) en el perfil del técnico.
- **Badge global persistente** en header del técnico, con menú rápido.
- **Bloque "Estado de respuesta"** en el panel de disponibilidad (indicador permanente: nivel actual, no-respuestas en ventana, fecha de próxima salida).
- **Popover extendido del badge global** con resumen del estado de respuesta cuando el técnico está en Nivel 2 o 3.
- **Vista "Historial de respuesta"** dentro del panel de disponibilidad: lista cronológica de cotizaciones, rechazos, no-respuestas (activas / fuera de ventana / perdonadas) y eventos de auto-OFF.
- **Notificaciones in-app + email** en cada transición de nivel (1/2/3), con enlace directo al historial. Tono informativo, no punitivo.
- **Acción "Rechazar invitación"** en el UCH del técnico (rechazo individual) con selector de motivo desde catálogo BD + comentario libre opcional (obligatorio si motivo es "Otro").
- **Diálogo de rechazo masivo** al apagar con invitaciones pendientes (selector desde catálogo BD + campo libre).
- **CRUD admin de los catálogos `invitation_rejection_reason` y `bulk_rejection_reason`** en `/dashboard/admin/catalogos` (mismo patrón que catálogos UI existentes).
- **Nuevo countdown** `tDentistReviewHours` con HMS en UCH dentista + técnico.
- **Marca "respuesta vencida"** cuando expira `tDentistReviewHours`.
- **Banner "Buscando técnicos disponibles..."** en ficha del dentista durante `pendiente_pool`.
- **Diálogo de check-in** al 50% del TTL ("¿sigues necesitándolo?").
- **Relabel** del panel admin "Calendario laboral" → "Calendario para plazos de ejecución" + texto aclaratorio.
- **Dashboard admin** "Casos en espera de pool" + métricas de cobertura por categoría/capacidad.
- **Inputs admin** para los dos parámetros nuevos.
- **Botón admin** "Resetear contador de no-respuestas" con campo motivo obligatorio.

---

## 7. Decisiones cerradas (resumen ejecutivo)

| # | Decisión | Estado |
|---|---|---|
| 1 | Modelo de disponibilidad jerárquico 3 niveles con AND triple | Cerrada |
| 2 | 5 categorías canónicas + mapeo desde `WORK_TYPES` (15) | Cerrada |
| 3 | Switch global persistente en header del técnico | Cerrada |
| 4 | Sanción solo a `pending → expired` sin acción | Cerrada |
| 5 | Curva escalonada 1/2/3 con auto-OFF en nivel 3 | Cerrada |
| 6 | Ventana rolling 14d, sin permanencia | Cerrada |
| 7 | Heartbeat: auto-OFF 30d sin login, recordatorio 7d sin actividad | Cerrada |
| 8 | Score re-normalizado (`|Σα|=1`): `0.20·Q + 0.15·P + 0.15·E − 0.15·C + 0.10·B − 0.25·N`; retirar exclusión binaria | Cerrada |
| 9 | Reset manual admin con motivo libre obligatorio | Cerrada |
| 9b | Visibilidad del estado de ventana rolling para el técnico (3 puntos: indicador en panel + popover en badge + historial expandido) con cálculo de fecha de salida por evento | Cerrada |
| 9c | Modal informativo al reactivar tras auto-OFF (Nivel 3): no bloqueante, no limpia score ni contador, sin cooldown | Cerrada |
| 9d | Parametrizar plazos (ventana rolling, rehabilitación, heartbeats) y umbrales de la curva (1/2/3) en `fauchard_config`, con validaciones de UI admin para evitar valores absurdos | Cerrada |
| 10 | Opción (c) al apagar con pendientes + código + texto libre | Cerrada |
| 10b | Rechazo individual de invitación con motivo desde catálogo BD `invitation_rejection_reason` (administrable, no cuenta como no-respuesta) | Cerrada |
| 10c | Reemplazo automático tras rechazo (individual o masivo): Fauchard invita al siguiente del pool scoreado original que siga elegible, con cutoff de `replacementCutoffMinutes` (10 min) y duración truncada al deadline del caso. No-respuestas NO disparan reemplazo | Cerrada |
| 11 | Sin override por urgencia en ningún flujo | Cerrada |
| 12 | Tres countdowns wall-clock: cotización, propuesta, **revisión** | Cerrada |
| 13 | `tDentistReviewHours` nuevo, default 48h, sin auto-acción al expirar | Cerrada |
| 14 | `workDeadline` mantiene `addBusinessTime` con feriados | Cerrada |
| 15 | Relabel del panel "Calendario laboral" | Cerrada |
| 16 | Cola `pendiente_pool` con TTL 24h + check-in al 50% | Cerrada |
| 17 | Pool parcial: invitar y cerrar (puede ser 1 sola invitación) | Cerrada |
| 18 | 0 cotizaciones tras invitar → vuelve a `pendiente_pool` | Cerrada |
| 19 | Cantidad máxima de ciclos de espera parametrizable (`maxPoolCycles`, default 2) antes de fallo terminal | Cerrada |
| 19b | Botón "Republicar" en la ficha del caso terminal `sin_cotizaciones_fallo`: modal de doble confirmación, transición directa a publicación (sin pasar por borrador), nuevo pool y nuevos ciclos, sin duplicar; para editar antes de reintentar usar archivar + crear copia | Cerrada |
| 19c | UX del panel admin Fauchard: orden por bloques funcionales, labels y tooltips en lenguaje no técnico (sin nombres de estado interno), validaciones al guardar, impacto direccional explícito en cada control | Cerrada |
| 20 | Envío de emails vía EmailJS con template único `te60drn`, variables `{{subject}}`, `{{to_email}}`, `{{body}}`, sender fijo "DentFlowAi"; credenciales en variables de entorno; in-app siempre acompaña al email | Cerrada |
| 21 | Migración inicial: global ON, CAD/CAM inferidos de `technicianSkill`, categorías todo ON; sin importar no-respuestas históricas; comunicación previa y banner in-app post-rollout; reversible vía feature flag | Cerrada |
| 22 | Calibración local con seed; defaults pre-tuneados a prod; ajuste fino manual desde panel admin sin período obligatorio | Cerrada |
| 23 | Cotas (floors/caps) por parámetro documentadas en código; UI admin bloquea valores fuera de rango con mensaje claro | Cerrada |
| 24 | Dashboard de observabilidad con 13 métricas para guiar ajustes (no son parámetros; son termómetro vs perilla) | Cerrada |
| 25 | Auditoría obligatoria de cambios Fauchard: usuario, timestamp, valor anterior/nuevo, motivo libre obligatorio; copy-on-write permite reversión rápida | Cerrada |
| 26 | Métricas catastróficas → alerta admin, sin rollback automático | Cerrada |
| 27 | No se puede editar el caso durante `pendiente_pool`; cancelación disponible en cualquier momento | Cerrada |
| 28 | Reactivación event-driven al cambio de switch + selección completa | Cerrada |
| 29 | Dentista nunca ve disponibilidad ni motivos internos | Cerrada |
| 30 | Auto-OFF Nivel 3 con invitaciones pendientes: auto-rechazo con motivo del catálogo `brej_003` (Pausa temporal); no agrava sanción; dispara reemplazo | Cerrada |
| 31 | Técnico ganador en auto-OFF Nivel 3 mantiene su caso activo: `workDeadline` corre normal, sigue con acceso al UCH del caso | Cerrada |
| 32 | `tDentistReviewHours` reinicia con cada nueva entrega del técnico (versión 2, 3, etc.) | Cerrada |
| 33 | Nivel 1 (warning) solo notifica in-app; Nivel 2 y 3 + auto-OFF preventivo + perdón admin envían email + in-app | Cerrada |
| 34 | Pool scoreado para reemplazos = todos los técnicos elegibles, sin cap adicional | Cerrada |
| 35 | Ambos catálogos de rechazo (individual `invitation_rejection_reason` y masivo `bulk_rejection_reason`) viven en BD, administrables desde `/dashboard/admin/catalogos`, mismo patrón que el resto de catálogos UI | Cerrada |
| 36 | Auditoría de cambios Fauchard vive en cada fila de `fauchard_config` (`created_by`, `created_at`, `change_reason`), no en tabla separada | Cerrada |

---

## 8. Migración del estado inicial al desplegar

Al activar el modelo de disponibilidad para usuarios existentes, cada técnico recibe un estado inicial automático calculado al momento de la migración. **No se les pide acción previa**: el sistema arranca con valores razonables y el técnico ajusta después si quiere.

### 8.1 Política de inicialización

| Nivel | Valor inicial | Lógica |
|---|---|---|
| **Nivel 1 — Global** | `ON` | Todos los técnicos existentes arrancan disponibles. Si no quieren recibir invitaciones, apagan su switch desde el badge global del header (visible desde el primer login post-rollout). |
| **Nivel 2 — CAD** | `ON` si el técnico tiene al menos una fila en `technicianSkill` con `designLevel > 0` | Inferido del estado actual de habilidades del técnico. |
| **Nivel 2 — CAM** | `ON` si el técnico tiene al menos una fila en `technicianSkill` con `fabricationLevel > 0` | Igual lógica que CAD. |
| **Nivel 3 — Categoría × Capacidad** | `ON` en todas las 10 combinaciones | Estado totalmente abierto. El técnico ajusta luego desde el panel de disponibilidad si quiere desactivar categorías puntuales. |

Caso degenerado: si un técnico no tiene **ninguna** fila en `technicianSkill` (situación inusual, ej. cuenta recién creada sin onboarding completo), su estado inicial será **global ON, CAD OFF, CAM OFF** — efectivamente inelegible hasta que complete su perfil. Esto evita invitarlo a casos para los que no declaró habilidad.

### 8.2 Sanciones y contadores

- **`technician_no_response_event`** parte vacía. Las invitaciones expiradas históricas **no se importan** como no-respuestas — sería injusto retroactivar sanciones por un modelo que no existía. Todos los técnicos parten en Nivel 1 limpio.
- **`consecutiveNoResponse` (campo legacy)** se desprecia tras la migración. Se mantiene la columna por compatibilidad mínima si hay queries históricas, pero la lógica nueva no la consulta. Se puede dropear en una migración posterior.

### 8.3 Seed inicial de datos requeridos

Al desplegar, además del estado de cada técnico, se siembran datos base:

- **Catálogo `invitation_rejection_reason`** — los 7 motivos canónicos definidos en sección 3.2 (`rej_001` a `rej_007`). Sin esto el técnico no puede usar la acción "Rechazar invitación" porque el selector queda vacío.
- **Catálogo `bulk_rejection_reason`** — los 5 motivos canónicos definidos en sección 3.1 (`brej_001` a `brej_005`). Sin esto el diálogo de rechazo masivo no muestra opciones y el auto-rechazo por auto-OFF Nivel 3 (sección 3.2.bis) falla porque no encuentra `brej_003`.
- **Fila activa de `fauchard_config` con todos los parámetros nuevos** poblados con sus defaults (sección 6.1). Si la fila activa existente carece de las columnas nuevas, la migración runtime las agrega con los valores default y mantiene `is_active=true` en esa misma fila (no genera fila nueva, para preservar `fauchardConfigId` anclado en casos ya publicados).
- **`technician_availability`** se poblada según la política de 8.1 para cada usuario con rol `tecnico` existente.

### 8.4 Comunicación al técnico

Antes y durante el rollout:

- **Email previo** (3–7 días antes del despliegue): "Próximamente vas a tener más control sobre cuándo recibes invitaciones. Te avisaremos cuando esté disponible."
- **Email en el despliegue**: "Ya puedes gestionar tu disponibilidad desde [link al panel]. Por defecto estás activo en todas las categorías que ya manejas."
- **Banner in-app** durante las primeras N sesiones post-rollout: "Nuevo: gestiona tu disponibilidad. [Ver panel →]"

### 8.5 Reversibilidad

Si el rollout muestra problemas inesperados, la migración debe ser reversible: en caso de rollback, se elimina la tabla `technician_availability` y el sistema vuelve a usar el filtro anterior (todos los técnicos activos = ON implícito). Esto se logra con feature flag (ver plan de implementación cuando corresponda).

---

## 9. Envío de notificaciones por email

El sistema emite múltiples notificaciones por email a lo largo del flujo definido en este documento (transiciones de nivel de sanción, auto-OFF, plazos vencidos, check-ins del dentista, comunicaciones de rollout, etc.). Esta sección define el contrato funcional de esos envíos; los detalles de instalación, configuración de variables y manejo de errores van al plan de implementación técnica.

### 9.1 Proveedor

Las notificaciones por email se envían a través de **EmailJS** (servicio externo). La integración usa el SDK oficial del proveedor.

### 9.2 Credenciales y configuración

EmailJS requiere tres credenciales que se almacenan en variables de entorno (no en código):

| Variable | Propósito |
|---|---|
| `EMAILJS_SERVICE_ID` | Identificador del servicio EmailJS (canal de correo configurado en la cuenta del proveedor). Valor a configurar: `service_dentflowai`. |
| `EMAILJS_TEMPLATE_ID` | Identificador del template visual del correo. Valor a configurar: `te60drn`. |
| `EMAILJS_PUBLIC_KEY` | Public key del proveedor para identificar la cuenta. Valor a configurar: `IWyP-7o2SB3zInN01`. |
| `EMAILJS_PRIVATE_KEY` | **Access token (private key)** requerido por el strict mode de EmailJS al enviar desde server. Se genera en https://dashboard.emailjs.com/admin/account/security y debe tratarse como secreto (no comitearlo). |

> Las 4 variables son **server-only** (sin prefijo `NEXT_PUBLIC_`): el envío se hace desde server actions usando la API REST de EmailJS (`POST https://api.emailjs.com/api/v1.0/email/send`), no desde el navegador. El payload incluye `user_id` (public key) y `accessToken` (private key) para satisfacer el strict mode del proveedor, que bloquea calls desde non-browser environments sin token. La misma key sirve para local, staging y producción.

### 9.3 Contrato del template

Un único template estándar (`te60drn`) acepta los siguientes parámetros y los renderiza con el branding del producto:

| Variable | Origen | Notas |
|---|---|---|
| `{{subject}}` | Definido por el sistema según el tipo de notificación (ej. "Te pusimos en pausa", "Tu caso lleva 12h esperando técnicos"). | Debe ser corto, claro, sin tono punitivo en las notificaciones de sanción (ver 2.6.4). |
| `{{to_email}}` | Email registrado en el perfil del usuario destinatario (técnico o dentista). | Si el email no está verificado o falla el envío, el sistema registra el error y reintenta según política del plan técnico. |
| `{{body}}` | Cuerpo del mensaje generado por el sistema. Puede contener texto plano o markup soportado por el template. | Debe incluir contexto + acción esperada o enlace directo al lugar donde resolver. |

**Remitente fijo**: el sender visible para el destinatario se identifica siempre como **`DentFlowAi`** (configurado en el template). El usuario no necesita ver una dirección técnica; la respuesta a emails del sistema no está soportada (one-way notifications).

### 9.4 Catálogo de notificaciones cubiertas por este mecanismo

Todas las notificaciones por email mencionadas en otras secciones del documento se canalizan por EmailJS. Resumen:

| Disparador | Sección | Destinatario | Asunto sugerido |
|---|---|---|---|
| Nivel 1 alcanzado (warning) | 2.2 | — (solo in-app, sin email) | n/a |
| Nivel 2 alcanzado | 2.2 | Técnico | "Tu prioridad de invitaciones se redujo" |
| Nivel 3 + auto-OFF | 2.2 | Técnico | "Te pusimos en pausa" |
| Auto-OFF preventivo por inactividad (30d) | 2.4 | Técnico | "Pusimos tu cuenta en pausa por inactividad" (canal único = email, el técnico no está activo en la app) |
| Recordatorio de actividad (7d) | 2.4 | Técnico | "¿Sigues disponible?" |
| Check-in al dentista (50% del TTL de `pendiente_pool`) | 5.2 | Dentista | "Tu caso sigue buscando técnicos" |
| Caso pasa a `sin_cotizaciones_fallo` | 5.5 | Dentista | "No recibimos ofertas para tu caso" |
| Plazo de revisión del dentista próximo a vencer / vencido | 4.2 | Dentista | "Tienes una entrega pendiente de revisar" |
| Reset manual por admin | 2.7 | Técnico | "Un administrador perdonó no-respuestas en tu cuenta" |
| Comunicaciones de rollout (migración) | 8.3 | Técnico | "Nuevo control de disponibilidad" |

Esta tabla es indicativa — los subjects exactos se definen al implementar cada notificación, manteniendo el tono y reglas establecidas en cada sección.

### 9.5 Notificaciones in-app vs. email

Las notificaciones in-app (badge, banners, indicadores en panel) siempre acompañan al email, **no lo reemplazan**. La regla general:

- **Acciones que requieren respuesta del usuario** (check-in al dentista, recordatorio de actividad al técnico) → email + in-app.
- **Cambios de estado relevantes** (transición de nivel, auto-OFF) → email + in-app.
- **Eventos informativos puntuales** (no-respuesta registrada en Nivel 1, perdón admin aplicado) → in-app obligatorio, email opcional según severidad.

Esto evita que el usuario se pierda información por revisar solo un canal y permite cumplir con el principio de transparencia definido en 2.6.

### 9.6 Internacionalización y branding

Por ahora todos los emails se envían en **español**. Si en el futuro se incorpora multi-idioma, se requerirá un template por idioma en EmailJS o un enrutamiento por idioma del usuario.

El branding del email (logo, colores, footer) vive en el template `te60drn` y se mantiene fuera del código de la aplicación. Modificaciones de diseño se hacen en EmailJS sin redeploy.

---

## 10. Mockups de UI

Representaciones conceptuales ASCII para alinear comportamiento. La traducción a componentes React + Tailwind se hace en el plan técnico, respetando los affordances y receta de hover/focus del proyecto ([frontend/CLAUDE.md](../frontend/CLAUDE.md)).

### 10.1 Badge global de disponibilidad (header del técnico)

Visible persistentemente en el topbar mientras el rol activo es técnico. Estados:

```
Estado "Activo" (Nivel 1, sin alertas):
┌────────────────────────────────────┐
│  ●  Activo                      ▾  │
└────────────────────────────────────┘
   (punto verde)

Estado "Activo, Nivel 2":
┌────────────────────────────────────┐
│  ●  Activo  ⚠                   ▾  │
└────────────────────────────────────┘
   (punto verde + alerta ámbar)

Estado "En pausa" (auto-OFF Nivel 3 o manual):
┌────────────────────────────────────┐
│  ○  En pausa                    ▾  │
└────────────────────────────────────┘
   (punto gris)

Estado "Inactividad 7d":
┌────────────────────────────────────┐
│  ●  Activo  ·                   ▾  │
└────────────────────────────────────┘
   (punto verde + punto azul de aviso)
```

Click → menú desplegable:

```
┌────────────────────────────────────────┐
│  ◉  Activo                             │
│  ○  En pausa                           │
├────────────────────────────────────────┤
│  Estado de respuesta                   │
│    Nivel 2 — Atención requerida        │
│    2 no-respuestas en ventana          │
│    Próxima salida: en 4 días           │
├────────────────────────────────────────┤
│  → Ir a panel de disponibilidad        │
│  → Ver historial de respuesta          │
└────────────────────────────────────────┘
```

### 10.2 Panel de disponibilidad (técnico)

Estructura: cabecera con estado de respuesta, switch global, dos columnas (CAD y CAM), cada una con sus 5 categorías.

```
┌──────────────────────────────────────────────────────────────────────┐
│  DISPONIBILIDAD                                                       │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                       │
│  Estado de respuesta                                                  │
│  ───────────────────────────────────                                  │
│  Nivel actual: Nivel 2 — Atención requerida                           │
│  No-respuestas en ventana (últimos 14 días): 2                        │
│                                                                       │
│    ○ ────── ● ────── ○                                                │
│    Nivel 1   Nivel 2   Nivel 3                                        │
│    Sin       Score     Auto-OFF                                       │
│    impacto   penalizado                                               │
│    (0–1)     (2)       (3+)                                           │
│                                                                       │
│  Próxima salida: 16-jun-2026 (en 4 días) → bajarás a Nivel 1          │
│  [Ver historial completo →]                                           │
│                                                                       │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                       │
│  Disponibilidad global               [ ●━━○  Activo ]                 │
│  Recibir invitaciones de Fauchard                                     │
│                                                                       │
│  ───────────────────────────────────────────────────────────────────  │
│                                                                       │
│  ┌──────────────────────────┐   ┌──────────────────────────┐          │
│  │  CAD (diseño)            │   │  CAM (fabricación)       │          │
│  │  [ ●━━○  Activo ]        │   │  [ ●━━○  Activo ]        │          │
│  │                          │   │                          │          │
│  │  Coronas         [●━○]   │   │  Coronas         [●━○]   │          │
│  │  Inlays/On./Car. [●━○]   │   │  Inlays/On./Car. [○━●]   │          │
│  │  Puentes y FA    [●━○]   │   │  Puentes y FA    [●━○]   │          │
│  │  Prót. Removible [○━●]   │   │  Prót. Removible [●━○]   │          │
│  │  Guías Quirúrg.  [●━○]   │   │  Guías Quirúrg.  [○━●]   │          │
│  └──────────────────────────┘   └──────────────────────────┘          │
│                                                                       │
│  Padre OFF deshabilita los hijos. Los valores de hijos se preservan.  │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.3 Modal de reactivación tras auto-OFF (Nivel 3)

Aparece al click "Reactivar disponibilidad" desde el badge o panel cuando el técnico está en auto-OFF.

```
┌──────────────────────────────────────────────────────┐
│  ¿Reactivar tu disponibilidad?                       │
│  ──────────────────────────────────────────────────  │
│                                                      │
│  Tu situación actual:                                │
│                                                      │
│  • 3 no-respuestas activas en los últimos 14 días    │
│  • Tu score Fauchard está penalizado en −0.25 hasta  │
│    que estas no-respuestas salgan de la ventana      │
│  • Próxima salida: el 16-jun-2026 (en 4 días),       │
│    ahí bajarás a Nivel 2                             │
│                                                      │
│  ⚠ Importante: si reactivas y dejas pasar UNA        │
│  invitación más sin responder, tu cuenta queda en    │
│  revisión manual del admin (no se reactivará         │
│  automáticamente).                                   │
│                                                      │
│              [ Cancelar ]   [ Reactivar ]            │
└──────────────────────────────────────────────────────┘
```

### 10.4 Modal Republicar caso

Aparece al click "Republicar" desde la ficha de un caso terminal en `sin_cotizaciones_fallo`. El botón "Republicar" está disponible solo si el caso está en ese estado; otros terminales (`rechazado`, `cerrado`) muestran únicamente "Archivar / Crear copia" (flujo existente).

```
┌──────────────────────────────────────────────────────┐
│  ¿Republicar este caso?                              │
│  ──────────────────────────────────────────────────  │
│                                                      │
│  Se invitará a un nuevo grupo de técnicos            │
│  disponibles y arrancará una ronda completa de       │
│  búsqueda de ofertas.                                │
│                                                      │
│  El caso NO vuelve a borrador: si confirmas, queda   │
│  publicado de inmediato.                             │
│                                                      │
│  Si necesitas modificar el caso antes de reintentar, │
│  cancela aquí y usa "Crear copia" en la ficha.       │
│                                                      │
│           [ Cancelar ]   [ Sí, republicar ]          │
└──────────────────────────────────────────────────────┘
```

### 10.5 Diálogo de rechazo individual de invitación

Aparece al click "Rechazar invitación" desde el UCH del técnico.

```
┌──────────────────────────────────────────────────────┐
│  Rechazar invitación al caso #A4521                  │
│  ──────────────────────────────────────────────────  │
│                                                      │
│  Motivo del rechazo *                                │
│  ┌────────────────────────────────────────────────┐  │
│  │  Selecciona un motivo                       ▾  │  │
│  └────────────────────────────────────────────────┘  │
│     • Carga de trabajo alta                          │
│     • Plazo demasiado corto                          │
│     • Precio sugerido fuera de rango                 │
│     • No manejo el material requerido                │
│     • Caso fuera de mi especialidad clínica          │
│     • Información del caso insuficiente              │
│     • Otro                                           │
│                                                      │
│  Comentario (opcional)                               │
│  ┌────────────────────────────────────────────────┐  │
│  │                                                │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│  (obligatorio si el motivo es "Otro")                │
│                                                      │
│  ℹ El rechazo explícito no cuenta como no-respuesta. │
│                                                      │
│              [ Cancelar ]   [ Rechazar ]             │
└──────────────────────────────────────────────────────┘
```

### 10.6 Diálogo de rechazo masivo (apagar switch con pendientes)

Aparece al pulsar OFF en el switch global cuando hay invitaciones `pending`.

```
┌──────────────────────────────────────────────────────┐
│  Tienes 3 invitaciones pendientes                    │
│  ──────────────────────────────────────────────────  │
│                                                      │
│  ¿Qué quieres hacer con ellas al pausarte?           │
│                                                      │
│  ◉  Mantenerlas activas (default)                    │
│     El switch OFF solo afectará invitaciones         │
│     nuevas. Las pendientes siguen su curso. Si no    │
│     respondes, contarán como no-respuesta.           │
│                                                      │
│  ○  Rechazarlas todas                                │
│     Decisión explícita. No contarán como             │
│     no-respuesta.                                    │
│                                                      │
│  ┌──── (si elige "Rechazarlas todas") ─────────────┐ │
│  │ Motivo * (desde catálogo `bulk_rejection_reason`)│ │
│  │ [ Selecciona un motivo                      ▾ ] │ │
│  │   • Vacaciones                                   │ │
│  │   • Carga de trabajo alta                        │ │
│  │   • Pausa temporal                               │ │
│  │   • Problema personal                            │ │
│  │   • Otro                                         │ │
│  │                                                  │ │
│  │ Comentario (opcional)                            │ │
│  │ [_________________________________________]      │ │
│  │ (obligatorio si motivo es "Otro")                │ │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│           [ Cancelar ]   [ Confirmar pausa ]         │
└──────────────────────────────────────────────────────┘
```

### 10.7 Banner de espera (dentista) — caso en `pendiente_pool`

Aparece en la ficha del caso y en el listado mientras el caso está en cola.

```
┌──────────────────────────────────────────────────────┐
│  ⏳  Buscando técnicos disponibles…                  │
│                                                      │
│  Te avisaremos por correo y en la app cuando         │
│  recibamos las primeras ofertas.                     │
│                                                      │
│  [ Cancelar publicación ]                            │
└──────────────────────────────────────────────────────┘
```

A la mitad del TTL (default 12h), aparece el check-in:

```
┌──────────────────────────────────────────────────────┐
│  Tu caso lleva 12 horas esperando técnicos           │
│  ──────────────────────────────────────────────────  │
│                                                      │
│  ¿Sigues necesitándolo?                              │
│                                                      │
│  [ Seguir esperando ]   [ Cancelar caso ahora ]      │
└──────────────────────────────────────────────────────┘
```

### 10.8 Dashboard admin — Casos en espera de pool

```
┌─────────────────────────────────────────────────────────────────────┐
│  CASOS EN ESPERA DE TÉCNICOS DISPONIBLES                            │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  [ Filtrar por categoría ▾ ]  [ Capacidad ▾ ]  [ Ciclo ▾ ]          │
│                                                                     │
│  ┌─────────┬───────────────────────┬──────────┬───────┬──────────┐  │
│  │ Caso    │ Categoría / Capacidad │ En cola  │ Ciclo │ TTL rest.│  │
│  ├─────────┼───────────────────────┼──────────┼───────┼──────────┤  │
│  │ #A4521  │ Guías Quirúrgicas/CAD │ 18h 22m  │ 1/2   │ 5h 38m   │  │
│  │ #A4498  │ Prót. Removible/CAM   │ 9h 12m   │ 2/2   │ 14h 48m  │  │
│  │ #A4471  │ Coronas/CAD+CAM       │ 2h 04m   │ 1/2   │ 21h 56m  │  │
│  └─────────┴───────────────────────┴──────────┴───────┴──────────┘  │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  Cobertura por categoría (últimos 30 días)                          │
│                                                                     │
│  Coronas / CAD         ███████████████████░  92% activos elegibles  │
│  Coronas / CAM         ████████████████░░░░  78%                    │
│  Inlays/Onlays / CAD   ███████████████░░░░░  72%                    │
│  Puentes y FA / CAD    ██████████░░░░░░░░░░  48%  ← baja cobertura  │
│  Prót. Removible /CAM  ████████░░░░░░░░░░░░  40%  ← baja cobertura  │
│  Guías Quirúrg. / CAD  ███░░░░░░░░░░░░░░░░░  15%  ← crítico         │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.9 Panel admin de configuración Fauchard (con tooltips funcionales)

Patrón visual: bloques colapsables agrupados según orden definido en 6.1.bis. Cada control con tooltip al hover.

```
┌─────────────────────────────────────────────────────────────────┐
│  CONFIGURACIÓN DEL MOTOR DE ASIGNACIÓN                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ▼ Tiempos de la ronda comercial                                │
│  ─────────────────────────────────                              │
│                                                                 │
│   Tiempo que tiene el técnico para cotizar     [  120  ] min    │
│   ⓘ Si lo subes: más probabilidad de ofertas; el dentista       │
│      espera más. Si lo bajas: rondas más rápidas; aumentan      │
│      no-respuestas. Valores típicos: 60–240 min.                │
│                                                                 │
│   Tiempo que tiene el dentista para elegir oferta [  24 ] hrs   │
│   ⓘ Si lo subes: el dentista decide con calma; el técnico       │
│      espera más. Si lo bajas: cierre rápido pero más            │
│      propuestas expiran. Valores típicos: 12–48 hrs.            │
│                                                                 │
│   Tiempo que tiene el dentista para revisar la entrega [  48 ] h│
│   ⓘ Si lo subes: el técnico espera más por aprobación.          │
│      Si lo bajas: más casos con "respuesta vencida".            │
│      Valores típicos: 24–72 hrs.                                │
│                                                                 │
│  ▼ Espera de técnicos disponibles                               │
│  ──────────────────────────────────                             │
│                                                                 │
│   Tiempo máximo buscando técnicos disponibles  [  24 ] hrs      │
│   ⓘ Si lo subes: más oportunidad de encontrar técnicos;         │
│      el dentista espera más. Si lo bajas: el caso falla         │
│      antes; el dentista debe republicar. Típicos: 12–48 hrs.    │
│                                                                 │
│   Cantidad de intentos antes de declarar sin ofertas [ 2 ] ciclos│
│   ⓘ Si lo subes: el caso espera más oportunidades. Si lo bajas: │
│      falla antes. Valores típicos: 1–3 ciclos.                  │
│                                                                 │
│  ▼ Reemplazo automático                                         │
│  ───────────────────────                                        │
│                                                                 │
│   Margen mínimo para enviar reemplazo          [  10  ] min     │
│   ⓘ Si un técnico rechaza, se intenta invitar a otro. Este es   │
│      el tiempo mínimo que debe quedar en la ronda para que      │
│      tenga sentido enviar el reemplazo. Típico: 5–15 min.       │
│                                                                 │
│  ▼ Disponibilidad e inactividad de técnicos                     │
│  ───────────────────────────────────────────                    │
│                                                                 │
│   Días sin actividad antes de recordatorio     [   7 ] días     │
│   Días sin actividad antes de pausa automática [  30 ] días     │
│   ⓘ El recordatorio debe ser menor que la pausa.                │
│                                                                 │
│  ▼ Sanción por no responder invitaciones                        │
│  ──────────────────────────────────────────                     │
│                                                                 │
│   Periodo de evaluación (ventana móvil)         [  14 ] días    │
│   Tiempo sin no-respuestas para rehabilitar     [  30 ] días    │
│                                                                 │
│   Umbral Nivel 1 (aviso)                        [   1 ]         │
│   Umbral Nivel 2 (penalización)                 [   2 ]         │
│   Umbral Nivel 3 (pausa automática)             [   3 ]         │
│   ⓘ Los umbrales deben ir en orden creciente. Valores grandes   │
│      vacían el mecanismo. Recomendado: 1, 2, 3.                 │
│                                                                 │
│  ▼ Reglas de selección y score                                  │
│  ──────────────────────────────                                 │
│                                                                 │
│   Peso de calidad           [ 0.20 ]                            │
│   Peso de puntualidad       [ 0.15 ]                            │
│   Peso de experiencia       [ 0.15 ]                            │
│   Peso de carga (negativo)  [ 0.15 ]                            │
│   Peso de antigüedad        [ 0.10 ]                            │
│   Peso de no-respuesta (negativo) [ 0.25 ]                      │
│   ─────────────                                                 │
│   Suma absoluta: 1.00  ✓                                        │
│                                                                 │
│   ⓘ La suma absoluta de los pesos debe ser exactamente 1.00.    │
│      Si modificas uno, ajusta otros. El sistema bloquea         │
│      guardar si la suma no es válida.                           │
│                                                                 │
│   ─────────────────────────────────────────────────────────     │
│                                                                 │
│   Última actualización: 12-may-2026 14:32 por admin@dentflowai  │
│                                                                 │
│             [ Cancelar ]   [ Guardar cambios ]                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.10 Reglas de aplicación de los mockups

- Los mockups son **conceptuales**, no pixel-perfect. Definen layout, contenido textual y comportamiento.
- Componentes reutilizables existentes (`Toast`, `ThemeToggleButton`, paneles del UCH) se reusan en lugar de reinventar.
- Recetas de hover/focus seguir [frontend/CLAUDE.md](../frontend/CLAUDE.md) sección "Affordances accionables":
  - Tarjetas accionables → receta A.
  - Links inline → receta B.
  - Filas de tabla / dashboard → receta C.
- **Modales con consecuencia que cambian estado del sistema** son bloqueantes: Republicar (cambia un caso terminal a publicado), Rechazo masivo (rechaza N invitaciones).
- **Modal de Reactivación** (sección 2.6.5) es **informativo, no bloqueante**: el técnico siempre puede confirmar para reactivar; el modal solo expone consecuencias para decisión informada.
- Confirmaciones suaves (sin cambio de estado importante) usan toasts.
- Dashboards admin usan datos en tiempo real (refresh manual + indicador "Última actualización HH:MM") — no necesitan polling agresivo.

---

## 11. Calibración

Política para validar y ajustar los parámetros Fauchard antes y después de producción.

### 11.1 Entorno de calibración

La calibración inicial se hace en **entorno local con Docker** (Postgres + fake-gcs configurados en `docker-compose.yml`). Se usan datos de seed (`scripts/seed-uat.ts`) para validar que la lógica nueva no rompe nada (transiciones de estado, integridad de invitaciones, expiración de countdowns, comportamiento de la cola de espera de técnicos).

Los **defaults llegan a producción ya pre-tuneados** con los valores documentados en sección 6.1. La **calibración fina** se hace luego **manualmente en producción**, observando datos reales desde el panel admin de configuración Fauchard (sección 10.9).

No se requiere un período obligatorio de calibración post-rollout. El admin ajusta cuando lo decida, basado en lo que ve en el dashboard de observabilidad (11.3).

### 11.2 Cotas de seguridad (floors y caps)

Cada parámetro Fauchard tiene un rango válido documentado en código como constantes. Si el admin intenta guardar un valor fuera de rango, la UI **bloquea** con mensaje claro indicando el valor mínimo o máximo permitido.

**Propósito**: proteger contra configuraciones absurdas que cumplen las reglas formales (orden estricto, suma de α, etc.) pero rompen el propósito del mecanismo (ej. `level3Threshold = 500` deja el auto-OFF prácticamente inalcanzable).

| Parámetro | Floor | Cap | Notas |
|---|---|---|---|
| `level1Threshold` | 1 | 3 | Floor 1: no warning sin causa. Cap 3: el warning debe ser temprano para cumplir su función educativa. |
| `level2Threshold` | 2 | 5 | Debe ser > level1. Cap 5: más allá el sistema tolera demasiado antes de penalizar. |
| `level3Threshold` | 2* | 10 | Debe ser > level2 (efectivo mínimo 3). Cap 10: más allá auto-OFF queda inalcanzable. |
| `noResponseWindowDays` | 7 | 60 | |
| `noResponseRehabilitationDays` | 14 | 90 | |
| `inactivityReminderDays` | 1 | 30 | Debe ser < `inactivityAutoOffDays`. |
| `inactivityAutoOffDays` | 7 | 90 | |
| `αN` (`alphaNoResponse`) | 0.05 | 0.40 | Evita que la no-respuesta sea irrelevante o dominante absoluta. |
| `maxPoolCycles` | 1 | 5 | |
| `replacementCutoffMinutes` | 1 | 60 | |
| `tNoEligiblePoolHours` | 1 | 168 (7 días) | |
| `tDentistReviewHours` | 1 | 168 (7 días) | |
| `tQuoteMinutes` | 15 | 1440 (24h) | |
| `tProposalHours` | 1 | 168 (7 días) | |

*El cap real de `level3Threshold` está acoplado a `level2Threshold + 1` por la regla de orden.

Reglas relacionales que se validan en conjunto al guardar:

- `level1Threshold < level2Threshold < level3Threshold` (orden estricto).
- `inactivityReminderDays < inactivityAutoOffDays`.
- `|Σα| = 1.00` exacto.
- Todos los valores positivos.

### 11.3 Dashboard de observabilidad

Panel admin con **13 métricas** que sirven como brújula para decidir cuándo y cómo ajustar los parámetros. Las métricas son **observaciones del comportamiento real del sistema** (outputs), no se ajustan: se leen.

> **Métricas = termómetro. Parámetros = perilla.**

| # | Métrica | Acción si está fuera de rango |
|---|---|---|
| 1 | % técnicos en Nivel 2 o 3 en cualquier momento | Si > 30%, suavizar `αN` o subir umbrales |
| 2 | % invitaciones que terminan en no-respuesta | Si crece tras rollout, plazos cortos o sanción mal calibrada |
| 3 | % auto-OFF preventivos (heartbeat 30d) | Si > 20%, bajar `inactivityAutoOffDays` |
| 4 | Tasa de reactivación post auto-OFF dentro de 7 días | Si < 10%, sanción demasiado dura |
| 5 | % casos en `pendiente_pool` por categoría/capacidad | Si > 20% en alguna, problema de oferta (no de parámetros) |
| 6 | % reemplazos exitosos (rechazo → reemplaza → cotiza) | Si < 20%, ajustar `replacementCutoffMinutes` o lógica |
| 7 | Tiempo medio de respuesta del dentista (`tDentistReviewHours`) | Si > 70% responde < 24h, bajar default |
| 8 | Distribución del score | Si > 80% queda en franja angosta, re-tunear coeficientes α |
| 9 | % invitaciones rechazadas explícitamente vs % expiradas por no-respuesta | Si rechazo explícito es bajo, el botón "Rechazar" no es lo bastante visible o entendible |
| 10 | Tiempo medio del técnico para cotizar desde la recepción | Promedio muy bajo = sobre-compromiso; muy alto = saturación. Ayuda a calibrar `tQuoteMinutes` |
| 11 | Cantidad promedio de cotizaciones por caso publicado | Si la mayoría recibe 1 sola, el dentista no tiene comparativo — problema de oferta o `nInvited` bajo |
| 12 | Tasa de check-ins respondidos (50% del TTL de `pendiente_pool`) | Si > 80% ignora, el check-in no aporta y se puede simplificar |
| 13 | Funnel de caso completo: `publicado → propuesta lista → aceptada → completado` con % en cada etapa | Métrica global de salud del marketplace. Caídas grandes señalan dónde está el problema sistémico |

Visualización: tablero con tarjetas numéricas + gráficos básicos (línea para tendencias temporales, barras para distribuciones por categoría/capacidad). Refresh manual con indicador "Última actualización HH:MM" (sin polling agresivo).

### 11.4 Auditoría obligatoria de cambios

Toda modificación de cualquier parámetro Fauchard queda registrada de forma permanente con:

| Campo | Contenido |
|---|---|
| `changed_by_user_id` | Admin que ejecutó el cambio. |
| `changed_at` | Timestamp del cambio. |
| `parameter_name` | Nombre del parámetro modificado. |
| `previous_value` | Valor anterior. |
| `new_value` | Valor nuevo. |
| `reason_text` | Motivo del cambio, **campo de texto libre obligatorio** (UI no permite guardar vacío). |

Esto encaja con el patrón **copy-on-write** ya definido: cada guardado crea una nueva fila `is_active=true` en `fauchard_config` y desactiva la anterior. La fila vieja queda como registro histórico permanente, consultable para reversión rápida si un cambio resulta perjudicial.

**Sin distinción** entre cambios "estructurales" (coeficientes α, umbrales) y cambios "operativos" (plazos): **todos requieren motivo**. Más simple y más trazable.

### 11.5 Política ante métricas catastróficas

Si las métricas se disparan tras un rollout o un cambio de parámetro (ej. % de técnicos en Nivel 3 supera 40% en las primeras 48h), el sistema:

- **Alerta al admin** vía email + indicador prominente en el dashboard.
- **NO ejecuta rollback automático**.
- Espera intervención manual del admin (revertir el cambio desde el panel — la copy-on-write hace que la fila previa siga disponible y baste con marcarla `is_active=true`).

**Razón**: rollback automático es complejo y muchas veces el "outlier" tiene causa legítima (semana con feriados largos, masa crítica de casos urgentes, etc.). Alerta + decisión humana es más robusto que automatizar.

---

## 12. Lo que queda fuera de este documento

**Plan de implementación técnica**: orden de migraciones runtime, feature flags, rollout local → prod, DDL exacto (tipos, índices, FKs, ON DELETE), wrapper de EmailJS, tests automatizados, comunicación al técnico. Se construye **bajo instrucción explícita** una vez aprobado este documento funcional. Incluirá como sub-bloque el **esquema BD detallado** (el diseño funcional ya establece tablas, columnas conceptuales y relaciones; el DDL fino vive en el plan técnico).

---

> **Documento funcional cerrado**. Las 43 decisiones del resumen ejecutivo (sección 7), los mockups (sección 10) y la política de calibración (sección 11) constituyen la fuente de verdad de las reglas de negocio del sistema. A partir de aquí, el siguiente paso bajo instrucción es la construcción del plan técnico.
