# Análisis y Rediseño de la Categorización de Worktypes para Asignación de Técnicos Dentales

## Resumen Ejecutivo

La tabla original plantea una lógica razonable pero con dos problemas estructurales: mezcla el *tipo de restauración* (qué se fabrica) con el *recuento de piezas* (cuántas unidades), y luego usa esas dos dimensiones de forma inconsistente para llegar a una categoría operativa. El resultado más cuestionable es que `corona_posterior` con 4–9 piezas sigue siendo **coronas**, pero `puente_4mas` con 4+ piezas salta a **puentes**, cuando en la práctica clínica la distinción no es el número de piezas sino si hay un póntico (diente reemplazado). A continuación se valida lo que está bien, se identifican los problemas y se propone una taxonomía más robusta.

***

## 1. Marco Clínico de Referencia

### 1.1 Corona vs. Puente: la distinción real

Una **corona unitaria** es una restauración que recubre completamente la corona de un diente presente, sin importar cuántas se fabriquen en el mismo caso. Un **puente o prótesis parcial fija (PPF)** es una restauración que *reemplaza uno o más dientes ausentes*, anclándose sobre dientes pilares (abutments) que conectan mediante un póntico. El número de unidades en un puente surge de: `retentores (coronas sobre pilares) + pónticos (dientes reemplazados)`.[^1][^2][^3][^4]

> **Ejemplo canónico:** un puente de 3 unidades reemplaza 1 diente ausente usando 2 coronas pilar. Cuatro coronas individuales sobre 4 dientes presentes **no son un puente** aunque sean 4 piezas.[^5][^6]

Esta distinción es la que hace inconsistente la regla original: el trigger de "4+" no captura si hay dientes ausentes (puente) o simplemente varios dientes dañados (múltiples coronas).

### 1.2 Arco Completo (Full Arch)

La rehabilitación de arco completo involucra de 10 a 14 dientes por arco. Los sistemas clínicos como los implantológicos definen "full arch" como la reposición de todos los dientes de un arco, y los protocolos estándar usan entre 4 y 8 implantes de soporte. El umbral de ≥10 unidades que usa la tabla es coherente con la literatura, pero el problema es que incluye cualquier tipo de restauración, lo que mezcla casos muy distintos (10 coronas individuales por desgaste severo vs. 10 unidades de puente sobre implantes).[^7][^8]

### 1.3 Carillas y su Categoría

Una carilla (veneer) es una restauración laminar adhesiva, preferentemente cerámica, que cubre la cara vestibular del diente. Clínicamente, carillas y inlays/onlays son restauraciones indirectas parciales, pero su proceso de laboratorio es distinto: las carillas requieren cerámica de alta translucidez, ajuste del color y contorno labial; los inlays/onlays restauran cavidades oclusales/proximales. Mapear `carillas_multiples` → categoría **inlays** agrupa a técnicos que en realidad tienen especialidades diferentes: ceramistas estéticos vs. técnicos de restauración oclusal.[^9][^10][^11]

***

## 2. Problemas Identificados en la Tabla Original

| Problema | Regla afectada | Por qué es incorrecto |
|---|---|---|
| Número de piezas como proxy de tipo | `corona_posterior` 4–9 → **coronas** | No distingue si hay ausencias dentales; podrían ser coronas o un puente largo[^2] |
| Trigger ambiguo corona→puente | `puente_4mas` 4+ → **puentes** | El worktype ya dice "puente", entonces el número de piezas es redundante; el criterio real es la *presencia de pónticos*[^1] |
| Carillas → inlays | `carillas_multiples` → **inlays** | Perfil del técnico necesario es diferente: ceramista estético vs. técnico de restauración oclusal[^11] |
| Umbral full arch sin distinción de tipo | 10+ cualquiera → **puentes** | 10 coronas unitarias sobre dientes presentes no es igual a un arco sobre implantes; el técnico requerido puede ser distinto[^8][^7] |
| Sin dimensión de complejidad | — | NHS y literatura clínica describen niveles de complejidad (básico, avanzado, especialista) que determinan qué técnico se asigna[^12] |

***

## 3. Propuesta de Categorización Revisada

La clave está en separar **dos dimensiones independientes**:
1. **Tipo de restauración** (qué se fabrica): corona, puente, carilla, inlay/onlay, overdenture/prótesis total.
2. **Escala del caso** (cuántas unidades): unitario, múltiple, arco completo.

Esto genera una matriz que permite asignar el técnico correcto.

### 3.1 Árbol de Decisión Propuesto

```
¿Hay dientes ausentes a reemplazar (pónticos)?
│
├─ SÍ → ¿Cuántas unidades totales (retentores + pónticos)?
│        ├─ 3–6 unidades → workType: puente_corto → categoría: PUENTES
│        ├─ 7–9 unidades → workType: puente_largo → categoría: PUENTES (técnico senior)
│        └─ ≥10 unidades / arco completo → workType: full_arch → categoría: FULL_ARCH
│
└─ NO (todos los dientes presentes) → ¿Qué tipo de restauración?
         ├─ Cobertura total del diente (corona)
         │    ├─ 1–3 unidades → workType: corona_unitaria → categoría: CORONAS
         │    ├─ 4–9 unidades → workType: corona_multiple → categoría: CORONAS (técnico con mayor capacidad)
         │    └─ ≥10 unidades → workType: full_arch_corona → categoría: FULL_ARCH
         ├─ Carillas (vestibular, adhesivo)
         │    ├─ 1–3 → workType: carilla_simple → categoría: CARILLAS
         │    └─ 4+ → workType: carilla_multiple → categoría: CARILLAS (ceramista especializado)
         └─ Restauración parcial (inlay / onlay / overlay)
              └─ cualquier cantidad → workType: inlay_onlay → categoría: INLAYS
```

### 3.2 Tabla de Worktypes Revisada

| Piezas | Restauración | ¿Póntico? | workType propuesto | Categoría | Perfil de Técnico |
|---|---|---|---|---|---|
| 1 | Corona | No | `corona_unitaria` | **CORONAS** | Técnico corona/puente estándar |
| 2–3 | Corona | No | `corona_multiple_corta` | **CORONAS** | Técnico corona/puente estándar |
| 4–9 | Corona | No | `corona_multiple_larga` | **CORONAS** | Técnico senior o equipo[^13] |
| 3–6 | Puente | Sí | `puente_corto` | **PUENTES** | Técnico corona/puente estándar[^5][^6] |
| 7–9 | Puente | Sí | `puente_largo` | **PUENTES** | Técnico senior |
| ≥10 | Cualquiera | Sí/No | `full_arch` | **FULL ARCH** | Técnico especialista full arch[^8] |
| 1–3 | Carilla | No | `carilla_simple` | **CARILLAS** | Ceramista estético[^11] |
| 4+ | Carilla | No | `carilla_multiple` | **CARILLAS** | Ceramista estético especializado |
| Cualquiera | Inlay/Onlay | No | `inlay_onlay` | **INLAYS/ONLAYS** | Técnico restauraciones parciales[^10] |

### 3.3 Lógica de Prioridad en el Código

Para evitar solapamientos, se recomienda aplicar las reglas en este orden de precedencia:

1. **≥10 unidades** → `full_arch` (prioridad máxima, independientemente del tipo)
2. **Pónticos presentes** → clasificación de puente por longitud
3. **Tipo = carilla** → categoría CARILLAS
4. **Tipo = inlay/onlay** → categoría INLAYS/ONLAYS
5. **Tipo = corona, sin pónticos** → corona por cantidad

***

## 4. Validación contra Estándares del Sector

Los sistemas de gestión de laboratorio modernos (como DentNode) realizan routing automático basado en: *tipo de restauración + número de unidades + especialidad del técnico disponible*. El AI routing descrito en literatura de automatización dental categoriza por complejidad: corona simple (~4 h trabajo), corona sobre implante (~8 h), prótesis total (~24 h). Esto confirma que la variable de tipo y la de escala deben mantenerse separadas hasta el momento de asignar al técnico.[^14][^13]

El estándar de clasificación del NHS para odontología restauradora también divide por nivel de complejidad (Nivel 1, 2 y 3), donde casos más extensos o que involucran rehabilitaciones completas requieren profesionales con competencias adicionales. Esto refuerza que `full_arch` merece su propia categoría separada de `puentes` regulares.[^12]

La AACD (American Academy of Cosmetic Dentistry) en sus criterios de acreditación distingue explícitamente entre *Case Type I* (6+ restauraciones estéticas, tipo carillas) y *Case Type III* (puente o implante), con criterios de evaluación y técnicos completamente distintos, lo que respalda separar las carillas de los inlays.[^15]

***

## 5. Recomendaciones de Implementación

1. **Agregar el campo `tiene_pontico` (booleano)** en el formulario de pedido. Es el dato que realmente discrimina corona de puente.[^2][^1]
2. **Separar la categoría CARILLAS de INLAYS**: aunque ambas son restauraciones indirectas, el perfil del técnico es distinto (ceramista estético vs. técnico de restauraciones oclusales).[^11]
3. **Crear FULL ARCH como categoría independiente** en lugar de mapearlo a PUENTES: la complejidad logística, el tiempo de fabricación y el perfil de técnico son cualitativamente diferentes.[^8][^13]
4. **Mantener el umbral ≥10 para full arch** como regla de prioridad máxima: coincide con la definición clínica estándar y es un corte operativamente claro.[^8]
5. **Documentar el rango 4–9 coronas sin póntico**: estos casos van a la misma categoría CORONAS pero pueden requerir coordinación con un técnico de mayor capacidad o asignación por tiempo estimado.[^13]

---

## References

1. [FIXED PARTIAL DENTURE (F.P.D.) - aim dental care](https://aimdentalcare.wordpress.com/fixed-partial-denture/) - Missing tooth/teeth can be replaced by artificial one(s). Artificial tooth/teeth can be of removable...

2. [Crown and bridge](https://codental.uobaghdad.edu.iq/wp-content/uploads/sites/14/2020/03/lecture-1intropduction-and-termiology-2019-1.pdf)

3. [Parts of Bridge | Fixed Partial Denture (FPD) - YouTube](https://www.youtube.com/watch?v=DpksxfoNFGo) - In this lecture I have discussed about the parts of bridges, with their significance and functions t...

4. [Crowns and Bridges: A Patient's Guide to Dental Restoration ...](https://cedardentalgroup.com/crowns-and-bridges/) - Considering dental crowns and bridges? Our guide explains the process, materials, costs, and alterna...

5. [What Does The Crown & Bridge...](https://www.lakemeadowdental.com/services/restorative-dentistry/dental-crowns-and-bridges/) - A “dental crown” is a term familiar to most people, though some refer to it as a “cap". A bridge use...

6. [Dental Bridges | Evergreen Family Dentistry, P.C.](https://www.troyfoxdds.com/treatment/dental-bridges) - Missing teeth can cause a whole host of problems, from difficulty eating and speaking, to poor nutri...

7. [[PDF] DENTAL IMPLANT GUIDELINES - DoH](https://www.doh.gov.ae/-/media/02836012288743969C7CD04512C4680F.ashx) - Full Arch Implant Rehabilitation. A comprehensive dental treatment involves the replacement of all t...

8. [Full arch restoration - Wikipedia](https://en.wikipedia.org/wiki/Full_arch_restoration)

9. [Understanding the Different Types of Fixed Restorations: Crowns ...](https://panamdl.com/blog/understanding-the-different-types-of-fixed-restorations-crowns-bridges-inlays/) - Choosing the Right Restoration for Each Case ; Crown, Severely damaged teeth, Porcelain, zirconia, P...

10. [Inlay, onlay, overlay: materials and preparation methods](https://magazine.zhermack.com/en/laboratory-en/inlay-onlay-overlay-materials-and-preparations/) - Everything you need to know about indirect partial restorations of posterior teeth: classification, ...

11. [[RTF] Dental Laboratory Technology (H170108)](https://www.fldoe.org/core/fileparse.php/20062/urlt/H170108-2223.rtf)

12. [[PDF] Clinical standard for restorative dentistry | NHS England](https://www.england.nhs.uk/wp-content/uploads/2022/10/B1640-clinical-standard-restorative-dentistry.pdf)

13. [AI Automation for Dental Labs: Case Management, Quality Control ...](https://mewrcreate.com/blog/ai-dental-lab-automation) - Automate case management, reduce turnaround time 30-40%, minimize errors. AI automation increases pr...

14. [DentNode: Dental Lab Management Software for Modern ...](https://www.dentnode.com) - DentNode is the all-in-one operating system for dental labs in India. Auto-receive scans from iTero,...

15. [Is this the right case type for Accreditation?](https://aacd.com/cmsproxy/38/files/Accred_Intro_Case_Guide.pdf)

---

## Estado de implementación (v5.13 — junio 2026)

| Elemento | Estado |
|---|---|
| 7 categorías canónicas (`WORK_CATEGORIES`) | Implementado en `frontend/lib/constants/dental.ts` |
| Campo `replaces_missing_teeth` | Columna BD + wizard + ficha borrador |
| Árbol de decisión único | `frontend/lib/fauchard/caseWorkType.ts` |
| `derived_work_type` / `derived_category` | Poblados en `classifyCaseAction` y `reclassifyCaseDraftAction` |
| Disponibilidad 7 toggles | `cat_carillas_*`, `cat_full_arch_*` + backfill desde inlays/puentes |
| Skills legacy | Lectura dual; sin DELETE hasta validación |
| Simulador admin | Toggle pónticos + labels legibles en paso Clasificación |

