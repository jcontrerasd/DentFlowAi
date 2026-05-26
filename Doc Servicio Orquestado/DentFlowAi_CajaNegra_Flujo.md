# DentFlowAi — Flujo de Caja Negra y Algoritmo de Selección de Técnicos

## Módulo: Motor de Orquestación Interno (v1.0 — Beta)
**Preparado para:** Antigravity (desarrollo con Gemini Pro)
**Fecha:** Abril 2026
**Clasificación:** Confidencial

---

## 1. Visión General del Nuevo Modelo

### 1.1 Cambio de Paradigma
DentFlowAi abandona el modelo de marketplace visible (donde el dentista elige técnico) y adopta un modelo de **servicio orquestado**. La plataforma actúa como un operador invisible que gestiona toda la complejidad interna.

**Desde la perspectiva del dentista:**
1. Crea un caso con archivos y especificaciones clínicas
2. La plataforma devuelve una propuesta: **tiempo estimado + costo total**
3. El dentista **acepta o rechaza** — sin negociación
4. Si acepta, la plataforma ejecuta el trabajo y va actualizando el estado
5. El dentista recibe el resultado final (diseño aprobado y/o pieza fabricada)

El dentista nunca sabe quién ejecuta el trabajo, cuántos técnicos cotizaron, ni cómo se tomó la decisión interna.

### 1.2 Qué es la Caja Negra
La **Caja Negra** es el motor interno de DentFlowAi que opera entre el momento en que el dentista publica un caso y el momento en que recibe la propuesta de tiempo y costo. Dentro de ella ocurren:

- Clasificación automática del caso por complejidad y tipo
- Selección de técnicos elegibles mediante algoritmo ponderado
- Solicitud de cotización a los técnicos seleccionados
- Evaluación y selección de la mejor oferta
- Construcción de la propuesta final para el dentista (con margen de la plataforma incluido)

Todo esto ocurre de forma **asíncrona y transparente para el dentista**, dentro de un tiempo máximo configurable.

---

## 2. Flujo Completo del Dentista (Vista Externa)

### 2.1 Paso 1 — Creación del Caso
El dentista completa el formulario de caso (ver especificación de formulario en documento principal) y hace clic en **Publicar caso**.

En ese momento:
- El caso queda en estado `En evaluación`
- Se muestra al dentista: *"Estamos analizando tu caso. Recibirás una propuesta en los próximos [X minutos/horas]."*
- El tiempo estimado de respuesta se calcula dinámicamente según la complejidad del caso y la disponibilidad actual del pool de técnicos

### 2.2 Paso 2 — Recepción de la Propuesta
Cuando la Caja Negra completa su proceso, el dentista recibe una notificación (push + email) y ve en su dashboard:

**Tarjeta de propuesta:**
- Tipo de trabajo: diseño / diseño + fabricación
- Tiempo de entrega estimado (ej. "3 días hábiles")
- Costo total (precio único, IVA incluido, sin desglose interno)
- Validez de la propuesta: countdown visible (ej. "Esta propuesta vence en 2 horas")
- Botón `Aceptar propuesta`
- Botón `Rechazar`

> El dentista no ve el precio del técnico, el margen de la plataforma, ni la identidad del técnico asignado.

### 2.3 Paso 3a — Rechazo
Si el dentista rechaza:
- El caso pasa a estado `Cerrado — rechazado por dentista`
- No se genera ningún cargo
- El técnico preseleccionado es liberado y su disponibilidad se restaura
- La plataforma puede registrar el motivo de rechazo (campo opcional de texto libre) para analítica interna

### 2.4 Paso 3b — Aceptación
Si el dentista acepta:
- Se genera el cobro en escrow automáticamente
- El técnico asignado recibe notificación de confirmación e inicio del trabajo
- El caso pasa a estado `En ejecución`
- Los archivos `.STL` se desbloquean para el técnico

### 2.5 Paso 4 — Seguimiento del Estado
El dentista ve en su dashboard el estado actualizado del caso en tiempo real. Los estados visibles para el dentista son intencionalmente simples:

| Estado visible (Dentista) | Descripción |
|---|---|
| `En evaluación` | La plataforma está procesando el caso |
| `Propuesta lista` | Hay una propuesta de tiempo y costo esperando respuesta |
| `En ejecución` | El trabajo está en curso |
| `En revisión` | Hay un diseño listo para que el dentista lo revise |
| `Cambios en proceso` | El técnico está aplicando ajustes solicitados |
| `Diseño aprobado` | El dentista aprobó — continúa a fabricación si aplica |
| `En fabricación` | La pieza está siendo producida |
| `Enviado` | La pieza fue despachada (con número de seguimiento) |
| `Completado` | Trabajo terminado, archivos disponibles |
| `Cerrado` | Caso archivado |

### 2.6 Paso 5 — Revisión del Diseño
Cuando el técnico sube una versión del diseño, el dentista recibe notificación y puede:
- Visualizar en el Visor 3D integrado
- Dejar anotaciones ancladas con observaciones
- **Aprobar** → continúa al siguiente paso (descarga o fabricación)
- **Solicitar cambios** → el técnico recibe las anotaciones y ajusta

> Este es el único punto de interacción directa del dentista con el resultado del trabajo. El dentista sigue sin saber la identidad del técnico.

---

## 3. La Caja Negra — Flujo Interno Detallado

### 3.1 Diagrama de Flujo Interno

```
[Caso publicado por dentista]
        ↓
[1. Clasificación automática del caso]
        ↓
[2. Filtro duro — pool de técnicos elegibles]
        ↓
[3. Algoritmo de selección ponderada → N técnicos invitados]
        ↓
[4. Envío de solicitud de cotización a N técnicos]
        ↓
[5. Ventana de tiempo para recibir cotizaciones]
        ↓
     ¿Cotizaciones recibidas?
      /              \
    SÍ               NO
     ↓                ↓
[6. Evaluación   [Reintentar con
 y selección      pool ampliado o
 de mejor         notificar fallo
 oferta]          al dentista]
     ↓
[7. Cálculo de propuesta final
 (precio técnico + fee plataforma)]
        ↓
[8. Presentación de propuesta al dentista]
        ↓
   ¿Dentista acepta?
    /           \
  SÍ             NO
   ↓              ↓
[9. Confirmar   [Cerrar caso,
 técnico,        liberar técnico]
 cobrar escrow,
 iniciar trabajo]
```

### 3.2 Etapa 1 — Clasificación Automática del Caso

El sistema analiza los datos del formulario del caso y asigna:

**Nivel de complejidad del caso** (determina qué liga de técnicos puede ejecutarlo):

| Nivel de Complejidad | Tipos de trabajo incluidos |
|---|---|
| **Básico** | Corona unitaria anterior/posterior, Inlay simple, Onlay simple, Carilla unitaria |
| **Intermedio** | Puente 3 unidades, Corona sobre implante unitaria, Carillas múltiples (hasta 4) |
| **Avanzado** | Puente 4+ unidades, Full arch, Prótesis parcial removible, Sobredentadura |
| **Crítico** | Casos con múltiples restauraciones combinadas, Guías quirúrgicas complejas, Alta exigencia estética |

**Tipo de servicio requerido** (determina qué sub-perfil de técnico es necesario):
- Solo diseño CAD
- Diseño + Fabricación (caso integral)
- Solo fabricación (si el dentista ya tiene diseño aprobado externo — flujo futuro)

### 3.3 Etapa 2 — Filtro Duro (Pool Elegible)

Se excluye a cualquier técnico que cumpla al menos una de estas condiciones:

| Condición de exclusión | Criterio |
|---|---|
| Disponibilidad | Marcó capacidad llena |
| Nivel insuficiente | Nivel declarado para este tipo < nivel mínimo requerido por la complejidad del caso |
| Sanción activa | Disputa en curso, suspensión temporal o revisión de calidad activa |
| Cooldown activo | Fue invitado a cotizar el mismo tipo de caso hace menos de `T_cooldown` horas |
| Inactividad prolongada | Sin sesión en la plataforma hace más de `D_inactividad` días |
| Sub-perfil incompatible | No tiene habilitado el sub-perfil requerido (diseño / fabricación / integral) |

El resultado es el **pool elegible**: todos los técnicos que pueden ejecutar este caso en este momento.

### 3.4 Etapa 3 — Algoritmo de Selección Ponderada

#### 3.4.1 El Sistema de Ligas

Los técnicos están organizados en ligas según su nivel declarado y validado para cada tipo de trabajo. Cada caso solo convoca técnicos de la liga compatible con su complejidad:

| Liga | Nivel declarado | Complejidad de casos que recibe |
|---|---|---|
| **Bronce** | Nivel 1–2 | Básico |
| **Plata** | Nivel 3–4 | Básico + Intermedio |
| **Oro** | Nivel 5–6 | Intermedio + Avanzado |
| **Élite** | Nivel 7 | Avanzado + Crítico |

Un técnico puede estar en ligas distintas para distintos tipos de trabajo (ej. Oro en coronas unitarias, Plata en puentes).

#### 3.4.2 Mecanismo de Ascenso de Liga

Un técnico sube de liga cuando cumple **los tres criterios simultáneamente**:
1. Calificación acumulada ≥ `L_calificacion_minima` en los últimos `L_casos_evaluados` casos de su liga actual
2. Tasa de entrega en plazo ≥ `L_puntualidad_minima`
3. Mínimo de `L_casos_completados` casos completados en su liga actual

Al cumplir los criterios, el técnico entra en un **período de transición** de `L_casos_transicion` casos donde compite en la liga superior con una penalización de score del `L_penalizacion_transicion`%. Esto lo expone a trabajos de mayor nivel con una red de seguridad para el dentista.

El descenso de liga ocurre si la calificación cae por debajo de `L_calificacion_descenso` durante `L_dias_descenso` días consecutivos.

#### 3.4.3 Fórmula del Score de Selección

```
S = α₁·Q + α₂·P + α₃·E - α₄·C + α₅·B
```

Restricción: `α₁ + α₂ + α₃ + α₄ + α₅ = 1`

**Definición de cada componente:**

**Q — Calidad Histórica** *(impulsa mérito)*
Promedio ponderado de calificaciones recibidas de dentistas. Las calificaciones recientes tienen mayor peso mediante decaimiento exponencial controlado por `W_calidad`.
```
Q = promedio_ponderado(calificaciones, ventana = W_calidad días)
Rango: 0.0 a 1.0
```

**P — Puntualidad** *(impulsa confiabilidad)*
Porcentaje de casos entregados dentro del plazo acordado sobre el total de casos completados.
```
P = casos_en_plazo / total_casos_completados
Rango: 0.0 a 1.0
```

**E — Experiencia en el Tipo de Caso** *(impulsa especialización)*
Nivel declarado por el técnico para el tipo específico de trabajo del caso actual, normalizado sobre 7.
```
E = nivel_declarado_para_este_tipo / 7
Rango: 0.0 a 1.0
```

**C — Índice de Carga Reciente** *(penaliza concentración)*
Mide cuántas invitaciones a cotizar recibió el técnico en los últimos `W_carga` días, normalizado contra el promedio de su liga. Si está por encima del promedio, su score baja proporcionalmente. Se aplica un techo `C_max` para evitar penalización infinita.
```
C = min(invitaciones_ultimos_W_carga_dias / promedio_liga, C_max)
Rango: 0.0 a C_max
```

**B — Bono de Infrautilización** *(impulsa equidad activa)*
Bono creciente para técnicos que llevan tiempo sin recibir invitaciones. Crece linealmente por día y tiene techo en 1.0 para evitar acumulación infinita. Solo aplica a técnicos con disponibilidad activa.
```
B = min(dias_sin_invitacion / D_bono_max, 1.0)
Rango: 0.0 a 1.0
```

#### 3.4.4 Selección Final: Probabilística Ponderada

Una vez calculado el score de cada técnico del pool elegible, **no se seleccionan simplemente los top N**. Se usa selección probabilística ponderada:

```
Probabilidad_i = S_i / Σ(S_j) para todo j en el pool elegible
```

Se sortean `N_invitados` técnicos sin reemplazo usando esas probabilidades. Esto garantiza que:
- Un técnico con score alto tiene alta probabilidad, pero no certeza absoluta
- Un técnico con score bajo tiene oportunidad real, proporcional a su score
- El sistema no es 100% predecible, evitando que los técnicos lo "optimicen" artificialmente

**Cuota de piso garantizada (`N_piso`):**
Si después del sorteo ningún técnico del cuartil inferior de actividad reciente quedó seleccionado, se reemplaza al técnico de menor score del resultado por el mejor del cuartil inferior. Esto garantiza que ningún técnico activo sea ignorado indefinidamente.

### 3.5 Tabla Completa de Parámetros Configurables

| Parámetro | Descripción | Valor inicial sugerido | Rango permitido |
|---|---|---|---|
| **Pesos del Score** | | | |
| `α₁` | Peso de Calidad Histórica | 0.25 | 0.0 – 0.50 |
| `α₂` | Peso de Puntualidad | 0.20 | 0.0 – 0.50 |
| `α₃` | Peso de Experiencia en tipo | 0.20 | 0.0 – 0.50 |
| `α₄` | Peso penalización Carga Reciente | 0.20 | 0.0 – 0.50 |
| `α₅` | Peso Bono de Infrautilización | 0.15 | 0.0 – 0.50 |
| **Ventanas temporales** | | | |
| `W_calidad` | Ventana de calificaciones (días) | 90 | 30 – 365 |
| `W_carga` | Ventana de carga reciente (días) | 30 | 7 – 90 |
| `C_max` | Techo del índice de carga | 2.0 | 1.0 – 5.0 |
| `D_bono_max` | Días máximos para acumular bono | 30 | 7 – 60 |
| **Filtros de exclusión** | | | |
| `T_cooldown` | Horas de cooldown entre invitaciones del mismo tipo | 12 | 1 – 72 |
| `D_inactividad` | Días sin sesión para excluir del pool | 15 | 3 – 30 |
| **Selección** | | | |
| `N_invitados` | Técnicos invitados a cotizar por caso | 5 | 3 – 10 |
| `N_piso` | Mínimo técnicos del cuartil inferior incluidos | 1 | 0 – 3 |
| **Sistema de ligas** | | | |
| `L_calificacion_minima` | Calificación mínima para subir de liga | 4.2 | 3.5 – 5.0 |
| `L_casos_evaluados` | Últimos N casos considerados para subir | 10 | 5 – 20 |
| `L_puntualidad_minima` | % puntualidad mínima para subir | 0.85 | 0.70 – 1.0 |
| `L_casos_completados` | Mínimo de casos completados para subir | 15 | 5 – 30 |
| `L_casos_transicion` | Casos en período de transición al subir | 3 | 1 – 5 |
| `L_penalizacion_transicion` | % penalización de score en transición | 20 | 5 – 40 |
| `L_calificacion_descenso` | Calificación bajo la cual se inicia descenso | 3.0 | 2.0 – 3.5 |
| `L_dias_descenso` | Días con baja calificación para descender | 60 | 30 – 120 |
| **Cotización** | | | |
| `T_cotizacion` | Tiempo máximo para que técnico envíe cotización (minutos) | 90 | 30 – 480 |
| `T_propuesta_dentista` | Validez de la propuesta para el dentista (horas) | 2 | 1 – 24 |

### 3.6 Protecciones Adicionales

- **Penalización por no responder:** Si un técnico es invitado a cotizar y no responde dentro de `T_cotizacion` minutos, su bono de infrautilización se congela temporalmente y su score baja en 0.05 puntos. Si esto ocurre 3 veces consecutivas, entra en modo **"revisión de disponibilidad"** y se excluye del pool hasta que el técnico confirme su disponibilidad manualmente.
- **Reintentos por falla:** Si el pool elegible tiene menos de `N_invitados` técnicos disponibles, el sistema amplía automáticamente los criterios de liga en un nivel hacia abajo e intenta nuevamente. Si sigue sin haber suficientes, notifica al administrador y al dentista con el mensaje: *"Estamos buscando disponibilidad. Te notificaremos en breve."*

### 3.7 Etapa 4 — Solicitud de Cotización al Técnico

Los `N_invitados` técnicos seleccionados reciben simultáneamente una notificación con:
- Tipo de restauración y complejidad del caso
- Material requerido
- Urgencia declarada por el dentista
- Plazo máximo de entrega esperado
- Solicitud: *"Envía tu cotización antes de [timestamp = ahora + T_cotizacion]"*

El técnico **NO recibe**:
- Nombre ni identidad del dentista
- Identidad de los otros técnicos invitados
- Los archivos `.STL` del caso (se desbloquean solo si es seleccionado y el dentista acepta)

El técnico responde con:
- Precio propuesto (campo numérico)
- Plazo de entrega propuesto (días hábiles — lista desplegable)
- Nota opcional (máx. 200 caracteres, solo visible internamente)

### 3.8 Etapa 5 — Evaluación y Selección de la Mejor Oferta

Una vez cerrada la ventana de cotización (`T_cotizacion`), el sistema evalúa las ofertas recibidas con la siguiente lógica de ordenamiento:

**Criterio de selección de la mejor oferta:**

```
Mejor oferta = menor costo, dado menor o igual tiempo de entrega al promedio de ofertas
```

En caso de empate exacto en precio Y plazo:
```
Desempate = técnico con mayor antigüedad de registro en la plataforma (FIFO)
```

El sistema **no selecciona automáticamente** una oferta si ninguna cumple un umbral mínimo de calidad del técnico (calificación histórica < `Q_minima_seleccion`, configurable). En ese caso, notifica al administrador para revisión manual.

### 3.9 Etapa 6 — Construcción de la Propuesta Final para el Dentista

Una vez seleccionada la mejor oferta técnica:

```
Precio final dentista = precio_tecnico × (1 + fee_plataforma)
```

El `fee_plataforma` es configurable por el administrador y puede variar según liga, tipo de servicio o plan de suscripción del dentista.

La propuesta presentada al dentista incluye:
- Tiempo de entrega (el ofertado por el técnico seleccionado)
- Precio total (con fee incluido, sin desglose)
- Countdown de validez (`T_propuesta_dentista` horas)

El técnico seleccionado queda en estado **"preseleccionado"**: su disponibilidad está marcada como reservada pero no comprometida hasta que el dentista acepte.

---

## 4. Panel de Tuning y Monitoreo — Administrador

### 4.1 Panel de Parámetros del Algoritmo
- Sliders en tiempo real para todos los parámetros `α` y ventanas temporales
- Validación en tiempo real: el sistema verifica que `α₁ + α₂ + α₃ + α₄ + α₅ = 1` antes de guardar
- **Simulador:** dado el estado actual del pool y un caso hipotético de tipo/complejidad configurables, muestra cómo quedaría la distribución de probabilidades y qué técnicos serían invitados con los parámetros actuales vs. los nuevos — sin ejecutar el proceso real
- **Log de cambios:** registro inmutable con timestamp, autor y valores anteriores/nuevos de cada modificación de parámetro

### 4.2 Panel de Equidad y Distribución
- Histograma de invitaciones recibidas por técnico (últimos 30/90/365 días)
- Distribución por liga: % de invitaciones captadas por cada cuartil de score
- **Alerta automática de concentración:** si el 20% superior de técnicos acapara más del 60% de las invitaciones en los últimos 30 días, el sistema alerta al administrador y sugiere incrementar `α₄` o `α₅`
- Ranking de técnicos por liga con score actual, casos completados, calificación y días sin invitación
- Lista de técnicos activos con 0 invitaciones en los últimos `D_alerta_sin_invitacion` días (configurable)

### 4.3 Panel de Cotizaciones
- Tasa de respuesta a cotizaciones por técnico y liga
- Tiempo promedio de respuesta a solicitudes de cotización
- Tasa de aceptación de propuestas por el dentista (por tipo de caso y precio)
- Casos sin cotizaciones suficientes: lista con motivo (pool vacío, cooldowns activos, inactividad)

---

## 5. Registro Técnico Dental — Campos Actualizados

### 5.1 Tabla de Niveles por Tipo de Trabajo
Durante el onboarding y en cualquier momento desde su perfil, el técnico declara su nivel de competencia para cada tipo de trabajo, tanto para diseño como para fabricación.

**Escala: 1 (básico) a 7 (experto absoluto)**

| Tipo de Trabajo | Nivel Diseño (1-7) | Nivel Fabricación (1-7) |
|---|---|---|
| Corona unitaria anterior | __ | __ |
| Corona unitaria posterior | __ | __ |
| Corona sobre implante unitaria | __ | __ |
| Inlay / Onlay | __ | __ |
| Carilla unitaria | __ | __ |
| Carillas múltiples (hasta 4) | __ | __ |
| Puente 3 unidades | __ | __ |
| Puente 4 o más unidades | __ | __ |
| Full arch / rehabilitación completa | __ | __ |
| Prótesis parcial removible | __ | __ |
| Prótesis total | __ | __ |
| Sobredentadura sobre implantes | __ | __ |
| Barra sobre implantes | __ | __ |
| Guía quirúrgica simple | __ | __ |
| Guía quirúrgica compleja (múltiples implantes) | __ | __ |

**Reglas de la declaración:**
- El nivel declarado es **autoinforme inicial** — válido para comenzar a recibir invitaciones
- El sistema cruza el nivel declarado con el desempeño real: si la calificación promedio en un tipo específico cae consistentemente, el sistema puede reducir el nivel efectivo automáticamente (con notificación al técnico)
- El técnico puede actualizar su nivel en cualquier momento desde su perfil, pero reducciones son inmediatas y aumentos requieren validación por desempeño o prueba técnica
- Para sub-perfiles no habilitados (ej. técnico solo diseño), los campos de fabricación quedan bloqueados en 0

---

## 6. Estados Internos del Caso (Vista Administrador)

El administrador ve un conjunto de estados más granular que el dentista:

| Estado interno | Descripción |
|---|---|
| `Caso recibido` | Formulario completado y publicado por el dentista |
| `Clasificando` | Sistema analizando tipo y complejidad del caso |
| `Seleccionando técnicos` | Algoritmo ejecutándose sobre el pool elegible |
| `Cotizaciones abiertas` | Solicitudes enviadas, esperando respuestas |
| `Evaluando ofertas` | Ventana cerrada, comparando cotizaciones |
| `Propuesta generada` | Propuesta calculada, pendiente de presentar al dentista |
| `Propuesta presentada` | Dentista notificado, esperando decisión |
| `Rechazada por dentista` | Dentista rechazó la propuesta — caso cerrado |
| `Aceptada — configurando` | Dentista aceptó, procesando escrow y notificando técnico |
| `En ejecución — diseño` | Técnico trabajando en el diseño |
| `En revisión — diseño` | Técnico subió versión, esperando aprobación del dentista |
| `Cambios solicitados — diseño` | Dentista solicitó modificaciones |
| `Diseño aprobado` | Dentista aprobó el diseño |
| `En ejecución — fabricación` | Fabricante produciendo la pieza |
| `Control de calidad` | Fabricante verificando la pieza |
| `Despachado` | Pieza enviada con tracking |
| `Entregado` | Dentista confirmó recepción |
| `Completado — liberando pago` | Sistema liberando escrow al técnico |
| `Cerrado` | Caso archivado, pagos liquidados |
| `En disputa` | Conflicto activo, bloqueado para revisión manual |
| `Sin cotizaciones — fallo` | Pool vacío o sin respuestas — requiere intervención admin |

