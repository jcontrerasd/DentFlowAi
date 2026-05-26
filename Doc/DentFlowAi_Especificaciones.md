# DentFlowAi — Especificación Técnica y Funcional Completa

## Documento de Requerimientos para Desarrollo (v1.0 — Beta)
**Preparado para:** Antigravity (desarrollo con Gemini Pro)
**Fecha:** Abril 2026
**Clasificación:** Confidencial

---

## 1. Resumen Ejecutivo

### 1.1 Contexto del Problema
El flujo de trabajo odontológico digital para restauraciones protésicas involucra una fase crítica de diseño CAD que representa el cuello de botella más frecuente en clínicas y laboratorios. El proceso completo sigue esta secuencia:
1. El dentista evalúa clínicamente al paciente y planifica la restauración
2. El diente es preparado con geometría específica (tallado)
3. Se realiza un escaneo intraoral digital que genera archivos `.STL` del arco preparado, el arco antagonista y el registro de mordida (bite scan)
4. Esos archivos se importan a un software CAD dental (Exocad, 3Shape, CEREC, etc.)
5. Un operador diseña la restauración ajustando morfología, oclusión y márgenes
6. El diseño se aprueba
7. El archivo aprobado se envía a fabricación (fresado CNC o impresión 3D)
8. La pieza es post-procesada (sinterización, caracterización, glaseado)
9. Se cita al paciente para prueba, ajuste y cementación definitiva

**El problema ocurre en el paso 5. Existen dos modalidades con sus respectivas limitaciones:**
- **Chairside:** el dentista no tiene tiempo ni la persona capacitada para diseñar con calidad
- **Labside:** los laboratorios se ven sobrepasados en capacidad, son lentos o poco competitivos

### 1.2 La Solución
**DentFlowAi** es una plataforma SaaS B2B de intermediación especializada que conecta dentistas con Técnicos Dentales certificados (diseñadores CAD y/o fabricantes), digitalizando y estandarizando la fase de diseño y fabricación protésica con un flujo estructurado, trazable y legalmente seguro.

La plataforma opera como un marketplace bidireccional donde:
- Los **Dentistas** publican casos clínicos con archivos de escaneo y especificaciones
- Los **Técnicos Dentales** ofrecen servicios de diseño, fabricación o ambos
- La interacción se da por asignación directa o por licitación/remate
- Todo el flujo — comunicación, revisiones, aprobaciones y pagos — ocurre dentro de la plataforma

### 1.3 Alcance Versión Beta
- Rol Dentista completo
- Rol Técnico Dental: Diseñador CAD, Fabricante y Técnico Integral (diseño + fabricación)
- Un único fabricante habilitado: **Odontotecnia** (opera con Vevi Dental)
- Flujo completo: caso → diseño → aprobación → (opcional) fabricación → entrega
- Visor 3D integrado en browser
- Sistema de pagos con escrow
- Tablero Kanban para Técnicos
- Integración básica con Vevi Dental vía Odontotecnia

---

## 2. Actores del Sistema

### 2.1 Dentista
Profesional odontológico o clínica dental que necesita restauraciones diseñadas y/o fabricadas. Sube archivos de escaneo, define especificaciones, visualiza y aprueba diseños en 3D, gestiona pagos y mantiene historial de casos.

### 2.2 Técnico Dental
Profesional o empresa que ofrece servicios de diseño CAD y/o fabricación. Puede tener uno, dos o los tres sub-perfiles activos simultáneamente, tratados como capacidades verificadas dentro de un único perfil:

| Sub-perfil | Capacidad | Qué hace en la plataforma |
|---|---|---|
| **Diseñador CAD** | Solo diseño digital | Recibe `.STL`, entrega archivos de diseño finales |
| **Fabricante** | Solo fabricación física | Recibe archivos aprobados y produce la pieza física |
| **Técnico Integral** | Diseño + Fabricación | Ofrece el flujo completo en una sola contratación |

### 2.3 Administrador de Plataforma
Equipo interno con acceso total para verificar técnicos, resolver disputas, gestionar suscripciones, monitorear calidad y gestionar la integración con Odontotecnia/Vevi Dental.

---

## 3. Modelo de Negocio

### 3.1 Fuentes de Ingreso
| Fuente | Descripción |
|---|---|
| **Fee por transacción** | 10–15% sobre cada pago liquidado (fase diseño y/o fabricación) |
| **Suscripción Dentista Free** | Hasta 3 casos activos, visor 3D básico, sin acceso a licitaciones |
| **Suscripción Dentista Pro** | Casos ilimitados, visor 3D completo, licitaciones, integración Vevi Clinic |
| **Suscripción Técnico Free** | Hasta 5 postulaciones a licitaciones/mes, perfil básico |
| **Suscripción Técnico Pro** | Postulaciones ilimitadas, badge verificado, posición destacada, analíticas |

### 3.2 Lógica del Escrow
1. Al confirmar asignación, el dentista realiza el pago que queda retenido en la plataforma
2. El dinero permanece en custodia mientras el trabajo está en curso
3. Al aprobar el diseño y/o confirmar recepción física, el sistema libera el pago al técnico descontando el fee
4. En caso de disputa, el administrador puede bloquear, liberar parcialmente o reembolsar

---

## 4. Flujo de Trabajo Principal

### 4.1 Fase 1 — Creación del Caso (Dentista)
El dentista crea un nuevo caso desde su dashboard. El formulario contiene:

**Información general del caso:**
- Nombre interno del caso (texto libre, ej. "Paciente JP — Corona 46") — nunca incluye nombre real del paciente
- ID anonimizado del paciente (generado automáticamente o ingresado manualmente por la clínica)
- Urgencia: lista desplegable → `Normal (5–7 días hábiles)` / `Prioritario (2–3 días hábiles)` / `Urgente (24–48 hrs)`

**Información clínica:**
- Diente(s) involucrado(s): selector visual de odontograma interactivo (notación FDI) — el dentista hace clic sobre los dientes en un diagrama visual de la boca
- Tipo de restauración: lista desplegable → `Corona unitaria` / `Inlay` / `Onlay` / `Carilla` / `Puente (indicar número de unidades)` / `Corona sobre implante` / `Prótesis parcial removible` / `Prótesis total` / `Guía quirúrgica` / `Otro (texto libre)`
- Material requerido: lista desplegable → `Zirconio monocapa` / `Zirconio multicapa` / `Zirconio ultra-translúcido` / `Disilicato de litio (e.max)` / `PMMA (provisorio)` / `Resina compuesta` / `Titanio` / `Cromo-Cobalto` / `A definir por técnico` / `Otro (texto libre)`
- Shade (color): lista desplegable con escala VITA Classical → `A1` / `A2` / `A3` / `A3.5` / `A4` / `B1` / `B2` / `B3` / `B4` / `C1` / `C2` / `C3` / `C4` / `D2` / `D3` / `D4` / `Otro (texto libre)` + campo para foto de referencia de color
- Notas oclusales: área de texto libre (ej. "paciente bruxista, priorizar grosor oclusal mínimo 1.5mm")
- Notas estéticas: área de texto libre (ej. "paciente solicita forma cuadrada, ver foto adjunta")
- ¿Requiere fabricación además del diseño?: radio button → `Solo diseño` / `Diseño + Fabricación`

**Carga de archivos:**
Zona de drag & drop con las siguientes sub-categorías de carga:
- Arco principal con preparación — **obligatorio**
- Arco antagonista — **obligatorio**
- Registro de mordida (bite scan) — **obligatorio**
- Fotografías intraorales de referencia — opcional
- Fotografías extraorales / estéticas — opcional
- Otros archivos — opcional

*Formatos aceptados: `.STL`, `.3MF`, `.OBJ`, `.jpg`, `.png`, `.pdf`. El sistema rechaza automáticamente cualquier otro formato con mensaje de error descriptivo. Se muestra barra de progreso de carga para archivos grandes.*

**Preferencias de asignación:**
- Modalidad: radio button → `Elegir un técnico del catálogo` / `Publicar como licitación`
- Si elige licitación: plazo para recibir ofertas → lista desplegable `12 horas` / `24 horas` / `48 horas`
- Presupuesto máximo (opcional): campo numérico con símbolo de moneda local

**Consentimiento (checkbox obligatorio antes de publicar):**
> "Confirmo que cuento con el consentimiento informado del paciente para el procesamiento de sus datos biométricos en esta plataforma, conforme a la Ley 20.584 y Ley 19.628 (Chile) o normativa local aplicable."
*Enlace a plantilla de consentimiento descargable en PDF.*

### 4.2 Fase 2 — Asignación del Técnico

**Modalidad A — Asignación directa:**
- El dentista navega al catálogo de técnicos filtrado por: tipo de servicio, especialidad, calificación mínima, precio máximo, tiempo de entrega, disponibilidad
- Cada tarjeta muestra: foto/avatar, nombre, badge de verificación, calificación promedio, tiempo de respuesta promedio, precio base para el tipo de restauración del caso, disponibilidad
- El dentista hace clic en `Ver perfil` para revisar portafolio 3D y detalles completos
- El dentista hace clic en `Asignar a este caso` → se genera el micro-contrato y se solicita el pago en escrow

**Modalidad B — Licitación:**
- El caso publicado aparece en el tablero de licitaciones disponibles para todos los técnicos con los sub-perfiles compatibles (diseño, fabricación o integral, según lo que requiera el caso)
- El técnico ve el resumen del caso (tipo, material, urgencia, presupuesto máximo si fue indicado) pero **NO** los archivos `.STL` hasta ser asignado
- El técnico envía una oferta con: precio propuesto, plazo de entrega, nota opcional (máx. 300 caracteres)
- El dentista recibe notificaciones de cada oferta y puede compararlas en una vista de tabla
- El dentista selecciona la oferta ganadora → se genera el micro-contrato y se solicita el pago en escrow

### 4.3 Fase 3 — Contrato Digital y Escrow
Al confirmar la asignación, la plataforma genera automáticamente un micro-contrato digital que incluye:
- Identificación de las partes (dentista y técnico con datos de perfil verificado)
- Descripción del trabajo (tipo de restauración, diente FDI, material, urgencia)
- Precio acordado y fee de plataforma
- Número máximo de revisiones incluidas
- Plazo de entrega (fecha límite calculada desde la confirmación)
- Precio por revisión adicional si se supera el límite
- Condiciones de cancelación y reembolso
- Cláusula de responsabilidad clínica
- Firma digital implícita por aceptación de ambas partes con timestamp

*Los archivos `.STL` del caso se desbloquean para el técnico únicamente tras la confirmación del pago en escrow.*

### 4.4 Fase 4 — Diseño y Ciclo de Revisiones

**Acciones del técnico:**
- Descarga los archivos `.STL` originales y trabaja en su software CAD externo (Exocad, 3Shape, etc.)
- Sube iteraciones del diseño: `.STL`, `.3MF`, `.OBJ` o renders (`PNG`/`JPG`)
- Agrega nota técnica a cada versión (texto libre)
- Cambia el estado a `En revisión` cuando está listo para evaluación del dentista

**Acciones del dentista:**
- Visualiza el diseño en el Visor 3D integrado (ver Sección 6)
- Deja anotaciones ancladas en puntos específicos del modelo 3D
- `Aprobar diseño` → pasa al estado `Aprobado`
- `Solicitar cambios` → el técnico recibe notificación con las anotaciones; el caso vuelve a `En progreso`
- Chat en tiempo real con el técnico dentro del caso

**Control de revisiones:**
- El sistema muestra contador: "Revisión 2 de 3 incluidas"
- Si el dentista solicita más revisiones de las incluidas, se despliega un modal de cotización adicional que el técnico puede aceptar o rechazar

### 4.5 Estados del Caso — Fase Diseño
| Estado | Color | Actor que avanza | Descripción |
|---|---|---|---|
| `Borrador` | Gris | Dentista | Caso creado, no publicado aún |
| `Buscando técnico` | Azul | Sistema | En licitación o esperando aceptación |
| `En progreso` | Amarillo | Técnico | Técnico asignado, diseñando |
| `En revisión` | Naranja | Dentista | Técnico subió diseño, dentista evalúa |
| `Cambios solicitados` | Rojo claro | Técnico | Dentista solicitó modificaciones |
| `Aprobado` | Verde claro | Sistema | Dentista aprobó el diseño |
| `Listo para descargar` | Verde | Dentista | Pago confirmado, archivos desbloqueados |
| `Cerrado` | Gris oscuro | Sistema | Caso completado y archivado |

### 4.6 Decisión Post-Aprobación del Diseño
Una vez aprobado el diseño, el dentista ve tres opciones presentadas en pantalla:
1. **Descargar y cerrar:** descarga los archivos finales y gestiona fabricación por su cuenta. La transacción termina aquí.
2. **Fabricar con el mismo técnico** (visible solo si el técnico tiene sub-perfil Fabricante o Integral): se genera una segunda orden de trabajo vinculada al mismo caso, con su propio precio, plazo y escrow independiente.
3. **Contratar a un fabricante distinto** (en beta: solo disponible con Odontotecnia): el dentista selecciona al fabricante del catálogo. Los archivos de diseño aprobados se comparten de forma controlada, sin exponer datos del paciente.

### 4.7 Estados del Caso — Fase Fabricación
| Estado | Color | Actor | Descripción |
|---|---|---|---|
| `Fabricación solicitada` | Azul | Dentista/Sistema | Orden enviada al fabricante |
| `Archivos recibidos` | Azul claro | Fabricante | Confirmó recepción y viabilidad |
| `En producción` | Amarillo | Fabricante | Fresado/impresión/sinterización en curso |
| `Control de calidad` | Naranja | Fabricante | Verificación dimensional y estética |
| `Listo para despacho` | Verde claro | Fabricante | Pieza terminada, fotos subidas |
| `Enviado` | Verde | Sistema | Número de seguimiento registrado |
| `Entregado` | Verde oscuro | Dentista | Dentista confirmó recepción física |
| `Cerrado` | Gris | Sistema | Pago liberado, caso archivado |

---

## 5. Registro y Creación de Perfiles

### 5.1 Registro General (Ambos Roles)
La pantalla de registro inicial presenta dos opciones claramente diferenciadas con iconografía distinta:
- "Soy Dentista / Clínica"
- "Soy Técnico Dental" (diseñador, fabricante o ambos)

**Campos comunes a ambos roles:**
- Nombre completo (texto libre)
- Correo electrónico (validación de formato)
- Contraseña (mínimo 8 caracteres, 1 mayúscula, 1 número — indicador visual de fortaleza)
- Confirmar contraseña
- País: lista desplegable con todos los países, valor por defecto: Chile
- Checkbox de aceptación de Términos y Condiciones y Política de Privacidad (con enlace a cada documento)
- Botón `Crear cuenta`

*Tras el registro se envía un correo de verificación de email. El acceso queda limitado hasta verificarlo.*

### 5.2 Perfil Dentista — Onboarding por Etapas
El onboarding del dentista está dividido en etapas progresivas. Las etapas 1 y 3 son obligatorias para crear el primer caso.

**Etapa 1 — Datos Profesionales**
- Nombre completo del dentista (pre-cargado desde el registro)
- Nombre de la clínica o consulta (texto libre)
- Foto de perfil: subida de imagen `JPG`/`PNG` (máx. 5MB) o avatar generado automáticamente con iniciales
- Logo de la clínica: subida de imagen `JPG`/`PNG`/`SVG` (máx. 5MB) — se usa en documentos y facturas
- Especialidad principal: lista desplegable → `Odontología General` / `Rehabilitación Oral` / `Implantología` / `Ortodoncia` / `Endodoncia` / `Periodoncia` / `Cirugía Maxilofacial` / `Odontopediatría` / `Otra (texto libre)`
- Número de matrícula profesional / colegio odontológico (texto libre — en beta es declarativo, con revisión manual posterior)
- Teléfono de contacto (campo con código de país prefijado según país seleccionado)
- Dirección de la clínica: calle, número, ciudad, región/estado, código postal
- Datos de facturación: RUT o identificación tributaria, Giro o actividad económica, Razón social, Dirección tributaria (checkbox `Usar misma dirección de la clínica` o ingreso manual)

**Etapa 2 — Preferencias de Trabajo (recomendada, desbloquea funciones avanzadas)**
- Software de escaneo intraoral utilizado habitualmente: Lista desplegable de selección múltiple → `iTero (Align Technology)` / `Trios (3Shape)` / `Primescan / Omnicam (Dentsply Sirona)` / `Medit i700 / i900` / `Planmeca Emerald` / `Carestream CS 3600` / `Dental Wings` / `Vatech EZScan` / `Otro (texto libre)`
- Tipo de casos más frecuentes (Lista de checkboxes de selección múltiple): ☑ Coronas unitarias, ☑ Puentes, ☑ Coronas sobre implantes, ☑ Inlays / Onlays, ☑ Carillas, ☑ Prótesis total, ☑ Prótesis parcial removible, ☑ Guías quirúrgicas
- Preferencia de idioma: lista desplegable → `Español` / `Inglés` / `Portugués`
- Configuración de notificaciones (Checkboxes individuales para Email / Push): Cambio de estado del caso, Nueva oferta recibida en licitación, Nuevo mensaje del técnico, Recordatorio de aprobación pendiente, Resumen semanal de actividad

**Etapa 3 — Privacidad y Consentimiento (obligatoria)**
- Aceptación explícita del tratamiento de datos de pacientes conforme a Ley 20.584 y Ley 19.628 (Chile)
- Selección del método de gestión de consentimiento informado: Radio button → `Usaré la plantilla de consentimiento informado de DentFlowAi` (descarga PDF) / `Cuento con mi propio sistema de consentimiento informado` (campo de declaración texto libre)
- Checkbox de responsabilidad clínica (obligatorio): *"Entiendo que soy el responsable clínico final de cada restauración aprobada en esta plataforma."*

**Etapa 4 — Método de Pago**
- Selección de método: radio button → `Tarjeta de crédito/débito` / `Transferencia bancaria`
- Si tarjeta: formulario de ingreso (integración con pasarela de pago: Stripe, Kushki o equivalente local)
- Si transferencia: instrucciones de cuenta bancaria de DentFlowAi con referencia única por transacción

### 5.3 Perfil Técnico Dental — Onboarding por Etapas

**Etapa 1 — Selección de Tipo de Técnico (define el flujo del onboarding)**
Checkboxes de selección múltiple, debe seleccionar al menos uno:
- ☑ **Diseño CAD** — diseño digital de restauraciones en software especializado
- ☑ **Fabricación** — producción física de restauraciones (fresado, impresión 3D, post-proceso)
- ☑ **Técnico Integral** — ofrezco diseño y fabricación completos

**Etapa 2 — Datos Generales**
- Nombre completo o nombre comercial del laboratorio (texto libre)
- Foto de perfil o logo del laboratorio (`JPG`/`PNG`/`SVG`, máx. 5MB)
- País: lista desplegable | Ciudad: texto libre
- Teléfono de contacto
- Sitio web o red social (opcional, validación de URL)
- Descripción profesional: área de texto libre, máximo 500 caracteres — aparece en el perfil público
- Años de experiencia: lista desplegable → `Menos de 1 año` / `1–3 años` / `3–5 años` / `5–10 años` / `Más de 10 años`
- Idiomas de trabajo: lista desplegable de selección múltiple → `Español` / `Inglés` / `Portugués` / `Otro`
- RUT o identificación tributaria, razón social, cuenta bancaria para recibir pagos del escrow

**Etapa 3 — Perfil de Diseño CAD (si aplica)**
- Software CAD que domina (Lista desplegable múltiple): `Exocad DentalCAD` / `3Shape Dental Designer` / `Dentsply Sirona inLab` / `CEREC` / `Zirkonzahn Modellier` / `DentalCAD (Dental Wings)` / `Planmeca Romexis` / `Medit Design` / `Otro`
- Especialidades de diseño (Checkboxes): ☑ Coronas unitarias sobre diente natural, ☑ Coronas sobre implante (con análogo digital), ☑ Puentes hasta 3 unidades, ☑ Puentes 4 o más unidades, ☑ Inlays / Onlays, ☑ Carillas, ☑ Prótesis parcial removible (estructura metálica), ☑ Prótesis total CAD, ☑ Sobredentadura sobre implantes, ☑ Barra sobre implantes, ☑ Guías quirúrgicas para implantes, ☑ Alineadores / Ortodoncia digital, ☑ Otro
- Tarifas base de diseño: Tabla editable con columnas (Tipo de restauración | Precio local | Activo). Filas por defecto: Corona unitaria, Por elemento de puente, Inlay / Onlay, Carilla, Guía quirúrgica unitaria, Prótesis total, (+ Agregar tipo personalizado)
- Disponibilidad semanal: Número máximo de casos activos simultáneos (slider numérico de 1 a 20)
- Tiempo de entrega estándar: Tabla editable (Tipo de restauración | Días hábiles estándar | Días hábiles urgente)

**Etapa 4 — Perfil de Fabricación (si aplica)**
- Equipamiento — Fresadoras (Botón `+ Agregar fresadora`): Marca (lista desplegable), Modelo (texto libre), Número de ejes (4 ejes / 5 ejes), Foto del equipo
- Equipamiento — Impresoras 3D (Botón `+ Agregar impresora`): Marca, Modelo, Tecnología (`DLP` / `SLA` / `LCD` / `FDM` / `Otro`)
- Equipamiento — Horno de sinterización: Marca, Modelo, Temperatura máxima (°C)
- Materiales con los que trabaja (Checkboxes): Zirconio monocapa, Zirconio multicapa, Zirconio ultra-translúcido, Disilicato de litio, PMMA, Resina compuesta CAD, Titanio, Cromo-Cobalto, PEEK/PEKK, Otro
- Servicios de acabado disponibles (Checkboxes): Pulido, Glaseado dental, Caracterización con colorantes, Estratificación de cerámica, Sandblasting, Cementado provisional para prueba, Otro
- Zona de despacho: lista desplegable → `Solo retiro en laboratorio` / `Despacho local` / `Despacho regional` / `Despacho nacional` / `Despacho internacional`
- Tarifas base de fabricación: Tabla editable (Material | Tipo de restauración | Precio base | Activo)
- Tiempos de producción estándar: Tabla editable (Material | Días hábiles estándar | Días hábiles urgente)
- **Integración Vevi Dental (habilitado solo para Odontotecnia en beta):** Campo de API Key, Botón `Verificar conexión`, Indicador de estado

**Etapa 5 — Portafolio de Casos (hasta 10 casos)**
Por cada caso: Tipo de restauración, Material usado, Software CAD utilizado, Archivo del diseño (`.STL` o `.3MF`), Imágenes de referencia (hasta 5 fotos), Nota técnica (máx 300 caracteres).
- Checkbox obligatorio: *"Confirmo que cuento con autorización para publicar este caso y que no contiene datos identificables del paciente."*

**Etapa 6 — Verificación y Badge "Técnico Verificado"**
- Para Diseñadores CAD: El sistema asigna un caso de evaluación con archivos y especificaciones. El revisor de la plataforma evalúa ajuste, morfología y cumplimiento.
- Para Fabricantes: Fotografía de cada equipo con número de serie visible. Certificado de proveedor (opcional). Revisión manual (Beta Odontotecnia).
- Pérdida automática del badge si: Promedio < 3.5 durante 60 días, o 3+ disputas en contra en 6 meses.

---

## 6. Visor 3D Integrado — Especificación Técnica y Funcional

El visor 3D es el componente central de la plataforma y el principal diferenciador de experiencia. Funciona directamente en el browser sin instalación de software adicional.

### 6.1 Tecnología Base
- **Motor de renderizado:** Three.js + WebGL
- **Parseo de archivos:** STLLoader de Three.js con soporte para `.STL` binario y ASCII; soporte para `.OBJ` y `.3MF`.
- **Optimización:** Pipeline LOD con decimación por Quadric Edge Collapse (reduce triángulos hasta un 85–95% manteniendo distancia de Hausdorff bajo 0.05 mm).
- **Carga en streaming:** Carga por chunks con barra de progreso.

### 6.2 Controles de Navegación
- **Rotación:** Clic izquierdo + arrastre (Mouse) / Un dedo (Touch)
- **Paneo:** Clic derecho + arrastre / Dos dedos desplazando
- **Zoom:** Rueda del mouse / Pellizco (pinch)
- **Vistas estándar:** Oclusal (arriba) / Vestibular (frente) / Lingual (atrás) / Proximal Mesial / Proximal Distal

### 6.3 Modos de Visualización
- **Material de Renderizado (Lista desplegable):** `Clay mate` (gris neutro), `Zirconio translúcido`, `Disilicato de litio (e.max)`, `Titanio`, `PMMA provisorio`, `Personalizado` (rueda de colores + translucidez).
- **Iluminación:** Preset (`Estudio` / `Clínica` / `HDRI exterior` / `Luz dramática lateral`), Intensidad de luz ambiental (0-100%), Intensidad direccional (0-100%), Rotación de luz direccional (0-360°).
- **1. Modo Transparencia:** Permite ver el diente preparado "a través" de la corona. Slider de opacidad 0-100%.
- **2. Mapa de Calor Oclusal:** Colorización indicando contactos. Rojo (sobrecarga), Amarillo (adecuado), Verde (suave), Azul (sin contacto).
- **3. Modo Sección (Cross-Section):** Plano de corte horizontal o vertical manipulable.
- **4. Vista Comparativa (Split View):** Pantalla dividida sincronizada entre versión anterior vs actual.
- **5. Vista Multi-modelo:** Visualización de los 3 archivos (principal, antagonista, restauración) con toggles de opacidad individuales.

### 6.4 Sistema de Anotaciones Ancladas
- **Activación:** Botón `+ Agregar anotación`. Cursor cambia a crosshair.
- **Funcionamiento:** Al hacer clic en la superficie del modelo 3D, se ancla un "pin" numerado en la coordenada 3D exacta.
- **Comentarios:** Popover en el pin con texto libre.
- **Visualización:** Pines (Pin 1, Pin 2, etc.) sobre la superficie. Panel lateral muestra la lista de anotaciones. Botón `Ir a pin` hace zoom automático.
- **Historial e Hilos:** Anotaciones de versiones anteriores quedan en gris. El técnico puede responder a cada pin en un hilo de conversación.

### 6.5 Funcionalidades del Visor por Plan
| Función | Plan Free | Plan Pro |
|---|---|---|
| Rotación, zoom, paneo | ✓ | ✓ |
| Vistas estándar | ✓ | ✓ |
| Material renderizado | Solo Clay mate | Todos los materiales |
| Iluminación | Solo preset Estudio | Todos los presets + sliders |
| Modo Transparencia | ✗ | ✓ |
| Mapa de calor oclusal | ✗ | ✓ |
| Modo Sección | ✗ | ✓ |
| Vista Comparativa | ✗ | ✓ |
| Vista Multi-modelo | Solo arco principal | Los 3 modelos |
| Anotaciones ancladas | Máx. 3 por caso | Ilimitadas |

---

## 7. Módulos y Vistas de la Plataforma

### 7.1 Dashboard Principal — Dentista
- **Barra superior:** Logo DentFlowAi, Búsqueda global, Notificaciones, Menú de usuario.
- **Sidebar:** Dashboard, Mis Casos, Catálogo de Técnicos, Licitaciones, Historial, Facturación, Configuración.
- **KPIs:** Casos activos, Pendientes de aprobación, Casos en fabricación, Gasto del mes.
- **Lista de Casos Activos:** Tabla ordenable/filtrable con ID, Nombre, Diente, Restauración, Técnico, Fase, Estado, Días restantes, Acción rápida.
- **Feed de actividad:** Eventos cronológicos en el lateral derecho.

### 7.2 Vista Detalle de Caso — Dentista / Técnico
- Layout de dos columnas: Izquierda (40%) para ficha clínica, historial y chat; Derecha (60%) para el Visor 3D.
- **Botones contextuales Dentista:** `Aprobar diseño`, `Solicitar cambios`, `Continuar a fabricación`, `Descargar y cerrar`, `Confirmar recepción`.
- **Botones contextuales Técnico:** `Subir nueva versión`, `Marcar como listo para revisión`, `Registrar envío`.
- Chat en tiempo real asociado al caso.

### 7.3 Catálogo de Técnicos — Dentista
- **Filtros:** Servicio, Especialidad, Software, Material, Calificación, Precio, Tiempo de entrega, Despacho, Disponibilidad.
- **Tarjetas:** Foto, Nombre, Badge Verificado, Chips de sub-perfiles, Calificación, Precio base, Tiempo, Botones (`Ver perfil` / `Asignar a un caso`).
- **Perfil Técnico:** Tabs para Portafolio (con visor 3D), Especializaciones, Equipamiento, Tarifas, Reseñas.

### 7.4 Tablero Kanban — Técnico Dental
- **Tab 1 (Diseño):** `Nuevas solicitudes` / `En progreso` / `Esperando revisión` / `Cambios solicitados` / `Aprobados` / `Completados`.
- **Tab 2 (Fabricación):** `Archivos recibidos` / `En producción` / `Control de calidad` / `Listo para despacho` / `Enviado` / `Entregado`.
- Personalización de columnas, Drag & Drop, Tarjetas con indicadores visuales de urgencia y mensajes. Panel lateral de métricas para Plan Pro.

### 7.5 Vista de Licitaciones
- **Dentista:** Lista de licitaciones activas, vista comparativa de ofertas, selección de ganador para activar escrow.
- **Técnico:** Feed de casos disponibles (sin ver los `.STL`). Botón `Enviar oferta` (Precio, Plazo, Nota).

### 7.6 Historial y Analíticas
- **Historial Dentista:** Listado filtrable de casos cerrados con acceso permanente a archivos, chat, contratos y facturas.
- **Analíticas Técnico Pro:** Dashboard de ingresos, casos por mes/tipo, calificación, tasa de aprobación sin revisiones, tiempos promedio, Top 5 dentistas.

### 7.7 Sistema de Calificaciones
- **Dentista al Técnico (Pública 1-5 estrellas):** Calidad técnica, Plazo, Comunicación, Facilidad para cambios.
- **Técnico al Dentista (Interna 1-5 estrellas):** Claridad de especificaciones, Calidad de escaneo, Tiempo de feedback, Pago oportuno.

---

## 8. Privacidad, Seguridad y Marco Legal

### 8.1 Privacidad del Paciente — Marco Legal Chile
Los archivos `.STL` son datos biométricos (Ley 19.628 y Ley 20.584).
- **Anonimización:** Archivos e IDs desprovistos de identidad del paciente.
- **Consentimiento:** Obligatorio mediante checkbox. Plantilla PDF provista.
- **Acceso:** Técnico accede solo tras confirmación de pago escrow.
- **Cifrado:** TLS 1.3 en tránsito, AES-256 en reposo. Retención mínima 15 años o según solicitud de eliminación (Habeas Data).
- **Portafolio Técnico:** Requiere un segundo nivel de consentimiento explícito del dentista para publicar.

### 8.2 Responsabilidad por el Diseño y Fabricación
- **Técnico Diseñador/Fabricante:** Responsabilidad por precisión técnica, viabilidad clínica del diseño y calidad física de la pieza.
- **Dentista:** Responsable clínico final de la restauración. Al aprobar, firma digitalmente la asunción de esta responsabilidad.
- **DentFlowAi:** Intermediario tecnológico. No asume responsabilidad médica.

### 8.3 Propiedad Intelectual
Los diseños generados son propiedad del técnico hasta el pago y aprobación final, momento en que se transfieren los derechos de uso al dentista.

---

## 9. Integración con Vevi Dental y Vevi Clinic

### 9.1 Integración Vevi Dental ↔ DentFlowAi (Beta — Odontotecnia)
1. Dentista aprueba diseño y selecciona Odontotecnia.
2. DentFlowAi envía vía API a Vevi Dental: Archivo `.STL` aprobado, ficha anonimizada, parámetros de producción, ID del caso, dirección.
3. Odontotecnia recibe la orden directamente en Vevi Dental.
4. **Webhooks bidireccionales** sincronizan cambios de estado (`En producción`, `Listo para despacho`, `Enviado`) en DentFlowAi en tiempo real.

### 9.2 Integración Vevi Clinic ↔ DentFlowAi (Post-Beta)
Integración bidireccional: sincronización automática de casos y estados con la ficha del paciente en Vevi Clinic (SSO, deep link).

---

## 10. Diseño Visual — Look & Feel

### 10.1 Filosofía de Diseño
Plataforma B2B profesional: precisión, confianza, eficiencia y modernidad digital. UI limpia que organiza la densidad de datos sin abrumar. No estética lúdica o "AI-generated".

### 10.2 Paleta de Colores
- **Color principal:** Teal profundo (`#01696F` claro / `#4F98A3` oscuro).
- **Superficies (Claro):** Fondo `#F7F6F2`, Tarjetas `#F9F8F5`, Bordes `#D4D1CA`.
- **Superficies (Oscuro):** Fondo `#171614`, Tarjetas `#1C1B19`.
- **Estados:** Rojo (`#A12C7B`), Naranja (`#DA7101`), Verde (`#437A22`), Azul (`#006494`).
*Ambos modos (claro/oscuro) obligatorios con toggle.*

### 10.3 Tipografía
- **Display (h1, h2):** `Instrument Serif` (Google Fonts) para hero/marketing.
- **Body:** `General Sans` (Fontshare) para UI y datos. Tamaños: 16px base, 14px labels/botones, 12px mínimo (badges).

### 10.4 Componentes UI Clave
- **Botones:** Teal primario, transition 180ms, touch target 44x44px min.
- **Tarjetas:** Border-radius 0.75rem, borde alpha-blended sutil (no sólido), sombra `--shadow-sm`.
- **Badges:** Pill shape, fondo semitransparente (15%) con texto al 100% color del estado.
- **Sidebar:** Ancho 240px desktop, colapsable a 64px, drawer móvil.
- **Visor 3D:** Fondo casi negro (`#1A1A1A`), Pines en Teal, Toolbar con glassmorphism funcional (blur). Shimmer skeleton al cargar.

### 10.5 Animaciones y Mobile
- Transiciones de estado suaves (180ms).
- Drag & Drop Kanban con efecto escala sutil (`1.02`).
- Modales slide-in.
- Diseño Mobile-first: 375px min, un solo layout columnar, tablas con scroll horizontal.

---

## 11. Especificaciones Técnicas Generales

### 11.1 Arquitectura Recomendada
- **Frontend:** React (Next.js) + Tailwind CSS v4 + TypeScript.
- **Visor 3D:** Three.js standalone (lazy load).
- **Backend:** Node.js (API REST/GraphQL).
- **Base de Datos:** PostgreSQL + Object Storage (S3) para archivos `.STL`.
- **Tiempo real:** WebSockets (Socket.io).
- **Pagos / Escrow:** Stripe Connect o Kushki.
- **Autenticación:** JWT + refresh tokens.

### 11.2 Formatos Soportados
- Archivos 3D: `.STL` (binario/ASCII), `.3MF`, `.OBJ` (Máx 150MB por archivo).
- Imágenes/Documentos: `.JPG`, `.PNG`, `.PDF` (Máx 20MB).

### 11.3 Notificaciones
Notificaciones push/email automáticas para cambios de estado, licitaciones, mensajes, alertas de plazo, confirmaciones de envío y disputas.
