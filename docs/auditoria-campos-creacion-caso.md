# Auditoría de campos — Creación de caso vs. mejores prácticas de laboratorio digital

Fecha: 2026-07-06

## Tabla unificada

| Campo | Acción | Descripción | Modificación propuesta | Ejemplo |
|---|---|---|---|---|
| internalName | Se mantiene | Nombre/etiqueta interna del caso | — | "Corona Molar Sup Der - Paciente 0342" |
| patientIdAnon | Se mantiene | Identificador anonimizado del paciente | — | "PAC-0342" |
| urgency | Se mantiene | Nivel de urgencia del catálogo | — | "Alta" |
| teeth (FDI) | Se mantiene | Piezas seleccionadas en notación FDI (11-48), ya implementada en `TeethSelector.tsx`; se almacena tal cual en `teeth` jsonb, sin conversión | — | "16" |
| restorationType | Se mantiene | Tipo de restauración del catálogo | — | "Corona unitaria" |
| material | Se mantiene | Material del catálogo | — | "Zirconia monolítica" |
| shade | Se modifica | Hoy es un solo `shade` enum (un VITA shade único). Sigue siendo relevante aunque el servicio sea `solo_diseno`: el color condiciona el diseño de reducción/cutback en restauraciones estratificadas y la selección de librería de material en el software CAD, no es solo dato de fabricación física | Pasar a mapa multi-zona: cervical / cuerpo / incisal | Cervical: A3.5 · Cuerpo: A3 · Incisal: A2 |
| notesOclusal | Se mantiene | Notas oclusales en texto libre | — | "Contacto ligero en céntrica" |
| notesEsthetic | Se mantiene | Notas estéticas en texto libre | — | "Preferencia por translucidez alta en borde incisal" |
| doctorNotes / specialInstructions | Se mantiene | Instrucciones generales del dentista | — | "Ajustar altura cuspídea por bruxismo" |
| desiredDeliveryAt | Se mantiene | Fecha/hora de entrega deseada | — | "2026-07-15 10:00" |
| replacesMissingTeeth | Se mantiene | Indicador booleano de póntico | — | true/false |
| Escaneo superior [imagen o 3D] | Se mantiene | Slot único, acepta .stl/.ply/.obj o .jpg/.jpeg/.png (mixto) | — | archivo .stl |
| Escaneo inferior [imagen o 3D] | Se renombra/reetiqueta | Mismo tipo de slot mixto | Relabelear en UI como "Arcada antagonista" para que el técnico lo use como referencia oclusal explícita | archivo .stl con label "Antagonista" |
| Escaneo bite [imagen o 3D] | Se modifica | Hoy es un slot de archivo genérico sin metadata | Agregar sub-tipo estructurado (ej. "hard-to-hard", "silicona", "cera") junto al archivo | tipo: "Hard-to-hard" + archivo .stl |
| Escaneos laterales der/izq [imagen o 3D] | Se mantiene | Slots mixtos, apoyo oclusal lateral | — | archivo .stl o .jpg |
| complementary files [imagen + documento + 3D] | Se modifica | Bucket amplio: .jpg/.jpeg/.png/.pdf/.docx/.stl/.ply/.obj, hasta 10 archivos, 20MB c/u, almacenado en la carpeta GCS `complementary/` (junto a `scans/` y `deliveries/` como carpetas de alto nivel) | **No implica nueva carpeta de almacenamiento** — la separación es solo lógica/de metadata: agregar un tag `kind: photo \| document` por archivo dentro de la misma carpeta `complementary/`, y agrupar visualmente en el formulario | Fotos: "sonrisa.jpg" (kind: photo) · Otros: "radiografia.pdf" (kind: document) |
| labNotes | Se mantiene | Notas del técnico, editables desde el detalle del caso | — | "Ajustado contorno proximal" |
| Anotación de línea de margen | Se modifica | El visor ya soporta dos modos independientes: **pin con comentario** (`NewAnnotationOverlay.tsx`, punto + texto obligatorio) y **polilínea** (`PolylineNodeEditor.tsx`, trazo de zona, pero sin campo de texto — se guarda `text: ''`). Ninguno de los dos es un tipo *tipado* de "línea de margen": ambos son genéricos y sirven para cualquier propósito | No se agrega la función pin-comentario (ya existe); se agrega: (1) campo de texto opcional en la polilínea, y (2) un tipo/categoría de anotación (ej. "margen", "zona de alivio", "nota general") con selector de diseño de margen (shoulder/chamfer/feather edge) cuando el tipo = margen | Trazo tipo "margen cervical" sobre pieza 16, diseño chamfer, comentario: "profundizar 0.3mm bucal" |
| Sistema/librería de implante | Se agrega | No existe ningún campo hoy; `replacesMissingTeeth` es solo un booleano de póntico, no cubre implantes | Nuevo grupo de campos condicional (visible solo si restorationType = implante): marca, plataforma, diámetro | "Straumann BLX Ø4.1 - NC" |
| Fotos clínicas dedicadas [imagen] | Se agrega | Hoy no existe un campo exclusivo de imágenes; las fotos comparten slot con escaneos 3D o con "complementary" | Nueva sección solo .jpg/.jpeg/.png, con sub-slots sugeridos (frontal, oclusal, retracción) | Foto frontal, foto oclusal, foto retracción |
| Instrucciones de póntico/puente | Se agrega | No existe hoy; solo el booleano `replacesMissingTeeth` | Campo condicional visible si replacesMissingTeeth = true: tipo de póntico y contacto tisular | "Póntico ovoide, sin contacto tisular" |
| Info de articulador/montaje | Se agrega | No existe ningún campo | Nuevo campo opcional: dimensión vertical (DVO) y tipo de articulador | "DVO +1.5mm, articulador semi-ajustable" |
| Referencia a provisional | Se agrega | No existe ningún campo | Nuevo slot de archivo (STL del provisional) + nota asociada | archivo .stl del provisional + nota "mantener línea de sonrisa" |
| Instrucciones de IPR/puntos de contacto | Se agrega | Hoy solo cubierto informalmente por texto libre | Nuevo campo estructurado (o subcampo de notesOclusal) para contacto interproximal por pieza | "Contacto firme mesial, ligero distal" |

## Nota clave sobre imágenes

Actualmente **ningún campo es exclusivamente de imágenes**: todos los slots de escaneo (superior, inferior, bite, laterales) aceptan indistintamente `.stl/.ply/.obj` **o** `.jpg/.jpeg/.png` en el mismo campo, y `complementary` mezcla imágenes + PDF/DOCX + escaneos 3D. El campo propuesto "Fotos clínicas dedicadas" sería el único restringido estrictamente a imagen.

## Nota sobre anotaciones en el visor 3D

Ya existen dos modos independientes en el visor, ambos toggle en la toolbar:

- **"Anotar" (pin)** — clic en un punto → abre un textarea (`NewAnnotationOverlay.tsx`) → guarda `{x,y,z}` + texto obligatorio. El pin-con-comentario **ya está implementado**.
- **"Trazar" (polilínea)** — traza una zona/línea sobre la superficie, pero **sin campo de texto** (se guarda `text: ''` hardcodeado).

La tabla `annotation` (`schema.ts:280-294`) es plana, sin columna de tipo: distingue pin vs. polilínea solo por la forma del campo `coordinates` (punto único vs. arreglo), no por un enum de tipo. El gap real no es la falta de comentarios en anotaciones (ya existen para pines), sino: (1) la polilínea no permite comentario, y (2) ninguna de las dos tiene semántica tipada (margen, zona de alivio, nota general, etc.) — son genéricas para cualquier propósito.

## Fuentes de la investigación de código

- `frontend/components/cases/CaseCreationWizard.tsx` — wizard, tipos de archivo aceptados, `CaseFiles`, `SCAN_SLOTS`, `ALLOWED_FILE_EXTENSIONS`
- `frontend/components/cases/TeethSelector.tsx` — numeración FDI (grid 18→11, 21→28, 48→41, 31→38)
- `frontend/lib/db/schema.ts` — columnas de `clinical_case` (`teeth`, `shade`, `notesOclusal`, `replacesMissingTeeth`, etc.) y tabla `annotation` (líneas 280-294)
- `frontend/app/dashboard/cases/[id]/page.tsx` — vista compartida dentista/técnico
- `frontend/lib/db/actions/annotations.ts` — `createAnnotationAction` (pin+texto), `createPolylineAnnotationAction` (polilínea sin texto)
- `frontend/components/cases/NewAnnotationOverlay.tsx` — UI del pin con comentario
- `frontend/components/viewer3d/PolylineNodeEditor.tsx` — edición de la polilínea (zona/margen)
- `frontend/components/DentalViewer3D.tsx` — toggles de modo "Anotar" vs. "Trazar" (línea ~1819)
