# DentFlowAi — Descripción Funcional (Nivel Requerimientos)
## Visión del producto y cómo opera hoy

> Complemento al documento técnico `ESTADO_DEL_ARTE.md`
> Redactado: 2026-04-29 | Base para rediseño de modelo de negocio

---

## 1. ¿Qué es DentFlowAi?

DentFlowAi es una **plataforma SaaS B2B** que digitaliza el flujo de trabajo entre **clínicas dentales** y **laboratorios de prótesis dentales**. Actúa como un intermediario digital que permite:

1. Que los dentistas publiquen sus requerimientos de trabajo dental (casos clínicos) con todas las especificaciones técnicas necesarias.
2. Que los laboratorios técnicos vean esos requerimientos, coticen y compitan por obtener el trabajo.
3. Que una vez seleccionado el laboratorio, ambas partes gestionen el proceso completo de diseño CAD/CAM hasta la entrega del trabajo físico, todo dentro de la misma plataforma.

El producto se posiciona en el segmento de prótesis CAD/CAM, donde el flujo de trabajo involucra archivos digitales 3D (scans intraorales), diseño por computadora y, dependiendo del laboratorio, fabricación física del material.

---

## 2. Actores del Sistema

### 2.1 Dentista

El dentista es quien **inicia y controla el flujo** de cada caso clínico. Sus responsabilidades en la plataforma son:

- Crear casos clínicos con especificaciones técnicas completas (tipo de restauración, material, dientes, color, urgencia).
- Subir archivos de escaneo dental en formatos 3D (.STL, .PLY, .OBJ) o fotográficos.
- Publicar el caso al marketplace para recibir cotizaciones.
- Evaluar las ofertas recibidas y seleccionar al laboratorio ganador.
- Revisar los entregables digitales del técnico y aprobarlos o solicitar modificaciones.
- Confirmar la recepción del trabajo físico cuando aplica.

El dentista **siempre pertenece a una organización de tipo "clínica"**. Puede haber múltiples dentistas dentro de la misma clínica (misma organización), pero en la versión actual cada dentista gestiona sus propios casos de manera independiente.

### 2.2 Técnico (Laboratorio)

El técnico es quien **recibe y ejecuta** el trabajo clínico. Puede actuar como:

- **Solo Diseñador (CAD):** Realiza el diseño digital en software CAD y entrega archivos digitales. El flujo termina con la entrega digital aprobada.
- **Diseñador y Fabricante (CAD + CAM):** Además del diseño, produce físicamente el material dental y lo despacha a la clínica.

El técnico pertenece a una organización de tipo "laboratorio". Un laboratorio puede tener múltiples técnicos. Las **capacidades técnicas** (CAD / CAM) se definen a nivel de organización mediante el campo `technical_capabilities` y determinan qué fases del flujo son aplicables.

### 2.3 Administrador del Sistema

El administrador tiene acceso total a la plataforma. Puede:

- Ver y gestionar todos los usuarios y organizaciones.
- Bloquear o desbloquear cuentas.
- **Simular la identidad de cualquier usuario** para diagnóstico (impersonación).
- Cambiar contraseñas, eliminar usuarios, y purgar datos de prueba.
- Cambiar su propio rol temporalmente para probar experiencias de otros roles.

---

## 3. Registro y Onboarding

### 3.1 Registro de Dentista

El dentista ingresa sus datos personales y crea su organización (clínica). El sistema exige un **RUT único** por organización. Si el RUT ya existe, el sistema detecta la clínica y permite que el nuevo usuario se una a ella (útil para clínicas con múltiples dentistas).

Los datos recopilados incluyen: nombre completo, email, contraseña, RUT de la organización, nombre de la clínica, teléfono, dirección y giro comercial.

### 3.2 Registro de Técnico

El proceso de registro del técnico incluye pasos adicionales respecto al dentista, ya que el sistema necesita conocer las **capacidades del laboratorio**:

1. Datos personales básicos.
2. Definición del tipo de organización (nueva o existente por RUT).
3. Datos del laboratorio: nombre, dirección, teléfono, giro.
4. **Selección de capacidades técnicas:** El técnico indica si el laboratorio realiza diseño CAD, fabricación CAM, o ambos. Esto queda registrado en la organización y determina el flujo de trabajo futuro.
5. Datos de facturación (para fines comerciales).

### 3.3 Onboarding Post-Registro

Tras el registro, ambos tipos de usuario son dirigidos a un proceso de onboarding donde completan su perfil profesional: especialidad, años de experiencia, número de registro profesional, bio y foto de perfil.

---

## 4. Gestión de Casos Clínicos

### 4.1 Creación de un Caso

El dentista crea casos clínicos a través de un **asistente de 5 pasos** (wizard):

1. **Identificación:** Nombre interno del trabajo, ID anonimizado del paciente, nivel de urgencia (baja, normal, alta, urgente, prioritario) y tipo de restauración (Corona, Inlay, Onlay, Carilla, Puente, etc.).
2. **Dientes:** Selector visual de la arcada dental donde el dentista marca los dientes involucrados.
3. **Material y color:** Selección del material (ej. Zirconio, Disilicato de Litio, E-max, PMMA, etc.) y el color VITA correspondiente.
4. **Archivos 3D:** Subida de escaneos digitales (mandíbula superior, inferior y mordida). El sistema acepta archivos STL, PLY, OBJ y JPG/PNG.
5. **Revisión y confirmación:** Resumen del caso antes de guardarlo.

Al crear el caso, el sistema le asigna automáticamente un número único en formato `DF-XXXX` y lo guarda en estado **Borrador**.

El dentista puede editar las especificaciones del caso mientras está en Borrador. Si el caso ya fue publicado, también puede editarlo, aunque en ese caso el sistema registra el cambio en el historial.

### 4.2 Publicación al Marketplace

Desde el estado Borrador, el dentista puede **publicar el caso al marketplace**. Esto lo hace visible para todos los técnicos registrados en la plataforma. Al publicar, el sistema:

- Cambia el estado a **Publicado**.
- Crea una "ronda comercial" que congela las especificaciones del caso en ese momento (para que los técnicos que oferten sepan exactamente para qué están cotizando).

### 4.3 Retirada del Marketplace

Si el dentista decide que no quiere continuar con la licitación, puede **retirar el caso** del marketplace. El sistema regresa el caso a Borrador, rechaza automáticamente todas las ofertas pendientes y cierra la ronda comercial activa.

### 4.4 Republicación

Si un caso fue retirado y se vuelve a publicar con cambios en las especificaciones, el sistema lo trata como una **nueva versión del caso** (v2, v3, etc.) y abre una nueva ronda comercial. Los técnicos ven un banner indicando que el caso fue republicado y cuál es el resumen de los cambios.

---

## 5. Sistema de Marketplace y Ofertas

### 5.1 Vista del Técnico

Los técnicos ven en su **Marketplace** todos los casos publicados disponibles, es decir:

- Casos en estado "publicado".
- Casos donde el técnico aún no ha enviado una oferta.

Cada tarjeta de caso muestra: miniatura de los scans, tipo de restauración, material, dientes involucrados, urgencia y el estado de la oferta del técnico (si aplica).

### 5.2 Envío de Oferta

Al abrir un caso del marketplace, el técnico puede ver las especificaciones completas y los archivos 3D. Para participar, envía una **oferta** que incluye:

- Precio en CLP.
- Plazo de entrega (en días o en horas).
- Notas técnicas opcionales para el dentista.

Un técnico solo puede tener **una oferta activa por caso por ronda**. Si quiere modificar su oferta, debe retirar la anterior y enviar una nueva.

### 5.3 Gestión de Ofertas por el Dentista

El dentista recibe las ofertas directamente en el **Centro de Control** del caso. Las ofertas aparecen como mensajes en el chat del hilo del técnico correspondiente. El dentista puede:

- **Aceptar una oferta:** El técnico seleccionado es asignado al caso, el estado cambia a "Aceptado" y todas las demás ofertas pendientes son rechazadas automáticamente.
- **Rechazar una oferta individualmente:** Con o sin motivo de rechazo. El técnico es notificado.

La privacidad está garantizada: **ningún técnico puede ver las ofertas de los demás**. Cada técnico solo ve su propio hilo de comunicación.

---

## 6. Flujo de Trabajo Clínico (Post-Adjudicación)

Una vez que el dentista selecciona un laboratorio, comienza el flujo de trabajo real. Este flujo varía según las capacidades del técnico.

### 6.1 Inicio del Diseño

El técnico recibe la notificación de que ganó el caso. Desde el Centro de Control del caso, inicia el proceso de diseño. El estado del caso cambia a **En Progreso**.

### 6.2 Entregas de Diseño (Ciclo Iterativo)

El técnico trabaja el diseño en su software CAD y, cuando tiene algo para revisar, **envía una entrega** desde la plataforma:

1. Adjunta los archivos de diseño (STL, PLY, etc.).
2. Escribe una nota explicativa para el dentista.
3. Los archivos se suben directamente a Google Cloud Storage.
4. El estado del caso cambia a **En Revisión**.

El dentista recibe la entrega y debe:

- **Aprobar el diseño:** El flujo continúa al siguiente estado.
- **Solicitar ajustes:** El dentista escribe el motivo. El caso regresa a "En Progreso" y el técnico debe enviar una nueva versión.

Este ciclo puede repetirse tantas veces como sea necesario. Cada entrega tiene un número de versión (v1, v2, v3...) y todas quedan registradas en el historial.

### 6.3 Aprobación y Flujo Según Capacidades del Técnico

Cuando el dentista aprueba el diseño, el sistema **determina automáticamente el siguiente paso** basándose en las capacidades del laboratorio:

**Técnico solo diseñador (CAD únicamente):**
- El flujo termina aquí. El estado cambia directamente a **Terminado**.
- La etapa de fabricación aparece visualmente deshabilitada (gris) en el indicador de progreso del caso.

**Técnico con capacidad de fabricación (CAD + CAM):**
- El sistema verifica si el caso requería fabricación física (`needsFabrication = true`).
- Si requiere fabricación, el estado avanza a **Fabricación**.
- Si no requiere fabricación (caso solo digital), termina en **Terminado**.

### 6.4 Fase de Fabricación y Despacho

Si aplica, el técnico realiza la fabricación física del material dental. Cuando está listo, **registra el despacho** con:

- Empresa de courier (ej. Chilexpress, Starken).
- Número de seguimiento.
- Fotos del paquete (opcional).

El estado cambia a **Despachado**. El dentista recibe notificación y puede confirmar la recepción cuando le llega el paquete físico. Al confirmar, el estado cambia a **Completado**.

---

## 7. Centro de Control (Unified Case Hub — UCH)

El Centro de Control es la **interfaz central de comunicación** para cada caso. Es accesible tanto para dentistas como para técnicos desde la vista de detalle del caso.

### 7.1 Funcionalidad General

El UCH funciona como un **chat contextual inteligente** que combina:

- Mensajes de conversación libre entre dentista y técnico.
- Eventos del sistema (cambios de estado, acciones realizadas).
- Entregas de archivos versionadas.
- Acciones contextuales según el estado del caso.

### 7.2 Vista del Dentista

El dentista ve todos los técnicos que han interactuado con su caso en un **selector de hilo**. El técnico ganador aparece primero, marcado con "Ganador". Al seleccionar un técnico, el feed muestra solo los mensajes y acciones de ese hilo.

Características especiales para el dentista:
- **Sección de Adjuntos:** Panel colapsable que muestra todas las entregas del técnico con botón de descarga en ZIP por versión.
- **Panel de Revisión:** Cuando el caso está en "En Revisión", aparece automáticamente un panel fijo con opciones para aprobar o solicitar ajustes, con campo de texto para comentarios.
- **Privacidad:** Los eventos de negociación y trabajo de un técnico son invisibles para los demás técnicos.

### 7.3 Vista del Técnico

El técnico ve únicamente **su propio hilo de comunicación** con el dentista. Accede a:
- Historial completo de sus ofertas y respuestas.
- Historial de entregas y comentarios del dentista.
- **Sección de Adjuntos** con sus entregas versionadas y opción de descarga (igual que el dentista).
- Acciones disponibles según el estado del caso (iniciar diseño, enviar entrega, registrar despacho).

### 7.4 Tabs de Fase

El UCH organiza los eventos en 4 pestañas:
- **Todos:** Feed completo cronológico.
- **Negociación:** Ofertas, aceptaciones, rechazos.
- **Diseño:** Entregas, revisiones, comentarios técnicos.
- **Producción:** Fabricación, despacho, recepción.

### 7.5 Flujo Bilateral (Pausa y Cancelación)

Cualquiera de las partes puede solicitar pausar o cancelar un caso en curso. La otra parte debe aceptar o rechazar la solicitud. Este mecanismo de **doble confirmación** evita que una parte actúe unilateralmente sobre un caso activo.

---

## 8. Gestión de Archivos 3D

### 8.1 Tipos de Archivos

La plataforma maneja dos tipos principales de archivos:

**Archivos de especificación (subidos por el dentista):**
- Escaneos intraorales: `.STL`, `.PLY`, `.OBJ`
- Fotos de referencia: `.JPG`, `.PNG`

**Archivos de entrega (subidos por el técnico):**
- Archivos de diseño CAD: `.STL`, `.PLY`, generalmente.

### 8.2 Visor 3D

La plataforma incluye un **visor 3D integrado** que permite ver los archivos directamente en el browser sin necesidad de software externo. El visor soporta:
- Toggle de visibilidad por modelo.
- Control de opacidad por capa.
- Anotaciones en 3D: el usuario puede hacer click sobre el modelo y anclar un comentario en ese punto exacto del espacio 3D.

### 8.3 Almacenamiento y Acceso Seguro

Todos los archivos se almacenan en **Google Cloud Storage**. El acceso a los archivos se realiza mediante URLs firmadas temporales (válidas 15 minutos). El sistema verifica que:
- Un dentista solo puede acceder a archivos de sus propios casos.
- Un técnico solo puede acceder a archivos de casos que le han sido asignados o que están en el marketplace público.
- Ningún técnico puede acceder a archivos de otro técnico.

---

## 9. Indicador de Progreso del Caso

Cada caso muestra visualmente su progreso mediante un **indicador de 7 etapas**:

`Borrador → Licitación → Asignado → En Diseño → Revisión → Fabricación → Terminado`

El indicador es **inteligente** y se adapta al perfil del técnico:
- Si el técnico es solo diseñador (CAD sin CAM), la etapa "Fabricación" se muestra en gris e itálica, indicando que fue omitida en este flujo específico.
- Las etapas completadas se muestran con check verde.
- La etapa actual se resalta con un indicador de reloj.

---

## 10. Calificaciones

Al finalizar un caso (estado "Terminado" o "Completado"), ambas partes pueden **calificarse mutuamente** con una nota del 1 al 5 y un comentario opcional. Esta funcionalidad está implementada en el backend pero la interfaz de calificaciones está pendiente de desarrollo completo.

---

## 11. Dashboard y KPIs

### 11.1 Dashboard del Dentista

El panel principal del dentista muestra:
- **Indicadores clave:** Número de casos en borrador, publicados (en licitación), en progreso y terminados.
- **Lista de casos recientes** con estado y última actividad.
- Acceso rápido a crear nuevos casos.

### 11.2 Dashboard del Técnico

El técnico tiene un panel especial (`/dashboard/bids`) con 3 pestañas:
- **Disponibles:** Casos publicados en el marketplace donde aún no ha ofertado. Indicador de cantidad.
- **Mis Ofertas:** Casos donde el técnico tiene una oferta activa en cualquier estado.
- **En Progreso:** Casos asignados al técnico que están activos (diseño, revisión, fabricación, despacho).

---

## 12. Panel de Administración

El administrador accede a un panel exclusivo (`/dashboard/admin`) con las siguientes capacidades:

- **Gestión de usuarios:** Ver todos los usuarios, bloquear/desbloquear cuentas, cambiar contraseñas, eliminar usuarios.
- **Simulación de usuarios:** El admin puede activar la identidad de cualquier usuario para ver exactamente lo que ese usuario ve, facilitando el diagnóstico de problemas. La simulación se activa mediante un selector de usuarios y se desactiva con un botón de "Volver a mi cuenta".
- **Limpieza de datos de prueba:** Opción de purga total que elimina todos los casos, archivos en GCS y usuarios no-admin. Útil para entornos de desarrollo.
- **Creación de co-administradores:** El admin puede crear cuentas administrativas adicionales.

---

## 13. Notificaciones (Estado Actual: Pendiente)

El sistema tiene definida la infraestructura de notificaciones y todos los puntos donde se deben enviar, pero **actualmente no envía notificaciones reales**. Los eventos para los que se enviarían notificaciones son:

- Dentista recibe nueva oferta.
- Técnico recibe entrega para revisar.
- Técnico es notificado de su selección (oferta aceptada).
- Técnico recibe solicitud de ajustes.
- Dentista recibe confirmación de inicio de fabricación.
- Dentista recibe aviso de despacho.
- Técnico recibe confirmación de recepción.

---

## 14. Finanzas (Estado Actual: Mock)

La sección de finanzas (`/dashboard/finance`) existe como página pero muestra datos hardcodeados. **No hay integración real con ningún sistema de pago ni generación de documentos tributarios.** Es un placeholder para una funcionalidad futura.

---

## 15. Reglas de Negocio Vigentes

Las siguientes reglas están implementadas y activas en el sistema:

1. **Un técnico no puede ver las ofertas de sus competidores.** Cada técnico solo ve su propio hilo.
2. **Un caso solo puede tener un técnico ganador.** Al aceptar una oferta, todas las demás se rechazan automáticamente en una transacción atómica.
3. **Las especificaciones del caso se congelan durante una licitación activa.** La "ronda comercial" captura un snapshot de las specs al momento de publicación.
4. **El técnico no puede enviar entregas si el caso no está en "En Progreso".** El botón de entrega está bloqueado en otros estados.
5. **El dentista no puede aprobar ni rechazar entregas si el caso no está en "En Revisión".**
6. **Un caso con historial transaccional no puede eliminarse.** Solo se puede archivar. Un caso puede eliminarse únicamente si está en Borrador o Publicado sin ofertas ni técnico asignado.
7. **La fase de fabricación se omite automáticamente para técnicos que solo tienen capacidad de diseño (CAD).** Al aprobar el diseño, el caso pasa directamente a "Terminado".
8. **Ningún técnico puede aprobar su propia solicitud de pausa o cancelación.** Siempre requiere confirmación de la otra parte.
9. **El acceso a archivos está restringido por organización y rol.** No se puede acceder a archivos de otras organizaciones a menos que el sistema haya otorgado permisos explícitos (ej. técnico asignado accede a scans de la clínica).

---

## 16. Limitaciones y Brechas Funcionales Actuales

Las siguientes funcionalidades están parcialmente implementadas o son deuda técnica conocida:

| Área | Estado actual | Brecha |
|------|--------------|--------|
| Notificaciones | Infraestructura lista, sin envío real | No hay alertas por email, push, ni SMS |
| Finanzas | Página mock con datos estáticos | No hay facturación, pagos ni reportes reales |
| Calificaciones | Backend implementado | UI de calificación incompleta |
| Mobile | Responsive básico | No hay diseño optimizado para móvil |
| Tests | 18 tests de integración | Cobertura muy limitada |
| Números de versión de ronda | Campo legacy `version` y `roundNumber` | Redundancia pendiente de limpiar |
| Mensajes de eventos | Hardcodeados en cada Server Action | Sin sistema de i18n ni plantillas centralizadas |

---

*Este documento describe el estado funcional de DentFlowAi v1 a la fecha 2026-04-29, como base para la planificación de cambios al modelo de negocio y la plataforma.*
