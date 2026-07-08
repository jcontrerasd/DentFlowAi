# Validación de campos — Creación y mantención de casos

**Para:** Key user
**Objetivo:** Validar qué información se le debe pedir al dentista al crear un caso (y durante su desarrollo), para que el técnico asignado tenga todo lo necesario para entregar un diseño de calidad **a la primera, sin iteraciones**.

## Cómo usar este documento

Cada fila es un campo del formulario. Por favor revisa cada uno y marca en la columna **Tu validación**:

- ✅ **Mantener** — el campo está bien así
- ✏️ **Cambiar** — el campo debe existir pero distinto (anota el cambio en Comentarios)
- ❌ **Eliminar** — no aporta, no debería pedirse

Dos aclaraciones para leer las tablas:

- La columna **Obligatorio** muestra cómo *debería* quedar el campo. Cuando eso difiere de cómo funciona hoy, se indica entre paréntesis (ej: "hoy es opcional — se corrige").
- La columna **Estado** indica si el campo *ya existe hoy* en el sistema o es una *propuesta nueva*.

---

## 1. Identificación del caso

| Campo en pantalla | Descripción | Valores posibles | Obligatorio | Estado | Tu validación | Comentarios |
|---|---|---|---|---|---|---|
| 1.1 Nombre del caso | Nombre interno para que el dentista identifique el caso en su lista | Texto libre. Ej: "Corona molar sup. der. — Sra. M." | Obligatorio | Ya existe | | |
| 1.2 Identificador del paciente | Código anónimo del paciente (nunca el nombre real, por privacidad) | Texto libre. Ej: "PAC-0342" | Obligatorio | Ya existe | | |
| 1.3 Urgencia | Qué tan pronto se necesita el trabajo | Lista: Normal / Alta (según catálogo) | Obligatorio | Ya existe | | |
| 1.4 Fecha de entrega deseada | Cuándo necesita el dentista recibir el diseño | Fecha y hora. Ej: 15-07-2026 10:00 | Obligatorio | Ya existe | | |

## 2. Indicación clínica

| Campo en pantalla | Descripción | Valores posibles | Obligatorio | Estado | Tu validación | Comentarios |
|---|---|---|---|---|---|---|
| 2.1 Piezas dentarias | Dientes involucrados, seleccionados en un odontograma (notación FDI) | Selección en diagrama. Ej: 16, 17 | **Obligatorio** (hoy el sistema permite dejarlo vacío — se corrige) | Ya existe | | |
| 2.2 Tipo de restauración | Qué se va a diseñar | Lista: Corona unitaria / Puente / Incrustación / Carilla… (según catálogo) | Obligatorio | Ya existe | | |
| 2.3 Material | Material en el que se fabricará (condiciona el diseño: espesores, reducciones) | Lista: Zirconia monolítica / Disilicato de litio / Metal-cerámica… (según catálogo) | Obligatorio | Ya existe | | |
| 2.4 ¿Reemplaza dientes ausentes? | Indica si la restauración incluye un póntico (diente flotante de un puente) | Sí / No | **Obligatorio** responder Sí o No (hoy se puede dejar sin responder — se corrige) | Ya existe | | |
| 2.5 Diseño del póntico | Si hay póntico: forma y relación con la encía | Lista: Ovoide / Higiénico / En silla de montar / Modificado. Ej: "Ovoide, sin presión sobre la encía" | Obligatorio si hay póntico | **Propuesta nueva** | | |
| 2.6 Sistema de implante | Si la restauración va sobre implante: marca, plataforma y diámetro (sin esto el técnico no puede diseñar la conexión) | Marca + plataforma + diámetro. Ej: "Straumann BLX Ø4.1 NC" | Obligatorio si es sobre implante | **Propuesta nueva** | | |

## 3. Color

| Campo en pantalla | Descripción | Valores posibles | Obligatorio | Estado | Tu validación | Comentarios |
|---|---|---|---|---|---|---|
| 3.1 Color (escala VITA) | Color del diente. Aunque el servicio es solo diseño, el color condiciona el diseño digital (espesor de reducción, tipo de estratificación) | Lista: A1, A2, A3, A3.5, B1… (escala VITA clásica) | Obligatorio | Ya existe | | |
| 3.2 Color por zonas | Detalle del color en tres zonas del diente, clave en dientes anteriores para un resultado estético | Cervical / Cuerpo / Incisal, cada uno con escala VITA. Ej: A3.5 / A3 / A2 | Opcional (sugerido en anteriores) | **Propuesta nueva** | | |

## 4. Archivos del caso

| Campo en pantalla | Descripción | Valores posibles | Obligatorio | Estado | Tu validación | Comentarios |
|---|---|---|---|---|---|---|
| 4.1 Escaneo arcada superior | Modelo 3D de la arcada superior | Archivo 3D (.stl, .ply, .obj) o foto | Obligatorio | Ya existe | | |
| 4.2 Escaneo arcada antagonista | Modelo 3D de la arcada opuesta — indispensable para que el técnico diseñe la oclusión (mordida) correctamente | Archivo 3D o foto | **Obligatorio** (hoy es opcional — se corrige; confirmar en pregunta 3 si aplica a todos los tipos de restauración) | Ya existe (hoy se llama "arcada inferior") | | |
| 4.3 Registro de mordida | Escaneo de cómo muerden ambas arcadas juntas, más el tipo de registro tomado | Archivo 3D o foto + tipo: Escaneo en oclusión / Silicona / Cera. Ej: "Escaneo en oclusión" | **Obligatorio** (hoy es opcional — se corrige; confirmar en pregunta 3 si aplica a todos los tipos de restauración) | Ya existe el archivo; el "tipo" es **propuesta nueva** | | |
| 4.4 Escaneos laterales (der. / izq.) | Vistas laterales de la mordida, de apoyo | Archivo 3D o foto | Opcional | Ya existe | | |
| 4.5 Fotos clínicas | Fotos del paciente en boca, separadas de los escaneos: dan contexto de color, encía y sonrisa | Solo imágenes (.jpg, .png). Sugeridas: frontal, oclusal, con retractor | Opcional (sugerido en casos estéticos) | **Propuesta nueva** (hoy van mezcladas en "archivos complementarios") | | |
| 4.6 Archivos complementarios | Cualquier otro apoyo: radiografías, documentos, escaneos adicionales | Imágenes, PDF, Word, archivos 3D. Hasta 10 archivos | Opcional | Ya existe | | |
| 4.7 Escaneo del provisional | Modelo 3D del provisional que usa el paciente: si su forma y mordida ya están aprobadas, el técnico las replica | Archivo 3D + nota. Ej: "Mantener la línea de sonrisa del provisional" | Opcional | **Propuesta nueva** | | |

## 5. Indicaciones al técnico

| Campo en pantalla | Descripción | Valores posibles | Obligatorio | Estado | Tu validación | Comentarios |
|---|---|---|---|---|---|---|
| 5.1 Notas de oclusión | Indicaciones de mordida en texto libre | Texto libre. Ej: "Contacto ligero en céntrica, sin interferencias en lateralidad" | Opcional | Ya existe | | |
| 5.2 Notas estéticas | Preferencias de forma y apariencia | Texto libre. Ej: "Translucidez alta en el borde incisal" | Opcional | Ya existe | | |
| 5.3 Instrucciones generales | Cualquier otra indicación clínica relevante | Texto libre. Ej: "Paciente bruxista, reducir altura de cúspides" | Opcional | Ya existe | | |
| 5.4 Puntos de contacto | Cómo deben quedar los contactos con los dientes vecinos | Por pieza: Firme / Ligero / Sin contacto. Ej: "Mesial firme, distal ligero" | Opcional | **Propuesta nueva** (hoy solo se puede escribir en texto libre) | | |
| 5.5 Articulador / dimensión vertical | Si el caso fue montado en articulador o requiere cambio de dimensión vertical | Texto estructurado. Ej: "DVO +1.5 mm, articulador semiajustable" | Opcional | **Propuesta nueva** | | |

## 6. Marcas sobre el modelo 3D (dentro del visor)

Hoy el dentista y el técnico ya pueden marcar el modelo 3D de dos formas: **pines con comentario** (un punto con una nota escrita) y **trazos** (líneas que delimitan una zona). La propuesta es darles significado clínico:

| Campo en pantalla | Descripción | Valores posibles | Obligatorio | Estado | Tu validación | Comentarios |
|---|---|---|---|---|---|---|
| 6.1 Pin con comentario | Marcar un punto exacto del modelo y dejar una nota escrita ahí | Punto + texto. Ej: pin en la cara vestibular con "cuidar este contorno" | Opcional | Ya existe | | |
| 6.2 Comentario en el trazo | Poder agregar una nota escrita al trazo de una zona (hoy el trazo se guarda sin texto) | Texto asociado al trazo. Ej: "profundizar 0.3 mm por vestibular" | Opcional | **Propuesta nueva** | | |
| 6.3 Tipo de marca | Clasificar cada marca según su significado clínico, en vez de que todas sean genéricas | Lista: Línea de margen / Zona de alivio / Nota general. Si es margen: Hombro / Chamfer / Filo de cuchillo | Opcional | **Propuesta nueva** | | |

---

## Resumen para la validación

**Preguntas clave que necesitamos que respondas:**

1. De los campos que **ya existen**, ¿hay alguno que sobre o que hoy se pida de forma confusa?
2. De las **propuestas nuevas**, ¿cuáles son imprescindibles para evitar iteraciones con el técnico y cuáles pueden esperar?
3. La arcada antagonista y el registro de mordida pasan a ser **obligatorios**: ¿aplica para todos los tipos de restauración, o hay casos donde no corresponde exigirlos (ej. carilla sin cambio oclusal)?
4. ¿Falta algún campo que uses en tu práctica y que no aparezca en este documento?
