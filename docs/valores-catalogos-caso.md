# Listas de valores — campos de caso con catálogo en base de datos

**Complemento de:** [validacion-campos-caso-keyuser.md](validacion-campos-caso-keyuser.md)
**Fuente:** base de datos local (`dentflowai_local`), idéntica al seed canónico de `frontend/lib/db/infrastructure.ts` (v3.7/v4.0).

De los campos del documento de validación, **cuatro** tienen su lista de valores en tablas de catálogo administrables (`code` opaco system-generated · `label` editable por admin · `sort_order` · `is_active`, FK desde `clinical_case` con `ON DELETE RESTRICT`):

| Campo del documento | Tabla en BD | FK en `clinical_case` |
|---|---|---|
| 1.3 Urgencia | `urgency_level` | `urgency_id` |
| 2.2 Tipo de restauración | `restoration_type` | `restoration_type_id` |
| 2.3 Material | `dental_material` | `material_id` |
| 3.1 Color (escala VITA) | `vita_shade` | `shade_id` |

Todos los valores listados abajo están activos (`is_active = true`).

---

## 1.3 Urgencia — `urgency_level` (3 valores)

| # | Code | Label |
|---|---|---|
| 1 | `urg_001` | Baja |
| 2 | `urg_002` | Normal |
| 3 | `urg_003` | Alta |

> ⚠️ El documento de validación dice "Normal / Alta", pero el catálogo también incluye **Baja**. La lógica de negocio compara contra el label (`urgency === 'Alta'`).

## 2.2 Tipo de restauración — `restoration_type` (9 valores)

| # | Code | Label |
|---|---|---|
| 1 | `rest_001` | Corona Unitaria |
| 2 | `rest_002` | Inlay |
| 3 | `rest_003` | Onlay |
| 4 | `rest_004` | Carilla |
| 5 | `rest_005` | Puente |
| 6 | `rest_006` | Corona sobre implante |
| 7 | `rest_007` | Denture |
| 8 | `rest_008` | Guía Quirúrgica |
| 9 | `rest_009` | Otro |

> ⚠️ El documento dice "Incrustación"; en el catálogo existe desglosado como **Inlay** y **Onlay**. Además existen **Corona sobre implante**, **Denture**, **Guía Quirúrgica** y **Otro**, no mencionados en el documento.

## 2.3 Material — `dental_material` (11 valores)

| # | Code | Label |
|---|---|---|
| 1 | `mat_001` | Zirconio Multicapa (Premium) |
| 2 | `mat_002` | Zirconio Monolítico |
| 3 | `mat_003` | Disilicato de Litio (E-max) |
| 4 | `mat_004` | Metal-Cerámica |
| 5 | `mat_005` | PMMA (Provisional) |
| 6 | `mat_006` | PEEK / BioHPP |
| 7 | `mat_007` | Titanio |
| 8 | `mat_008` | Cromo-Cobalto (Laser) |
| 9 | `mat_009` | Composite HD |
| 10 | `mat_010` | Cerámica Feldespática |
| 11 | `mat_011` | Otro |

## 3.1 Color (escala VITA) — `vita_shade` (17 valores)

| # | Code | Label |
|---|---|---|
| 1 | `vita_001` | A1 |
| 2 | `vita_002` | A2 |
| 3 | `vita_003` | A3 |
| 4 | `vita_004` | A3.5 |
| 5 | `vita_005` | A4 |
| 6 | `vita_006` | B1 |
| 7 | `vita_007` | B2 |
| 8 | `vita_008` | B3 |
| 9 | `vita_009` | B4 |
| 10 | `vita_010` | C1 |
| 11 | `vita_011` | C2 |
| 12 | `vita_012` | C3 |
| 13 | `vita_013` | C4 |
| 14 | `vita_014` | D2 |
| 15 | `vita_015` | D3 |
| 16 | `vita_016` | D4 |
| 17 | `vita_017` | Otro |

> Escala VITA clásica completa (16 tonos) + **Otro**.

---

## Campos del documento SIN catálogo en base de datos

Para referencia, el resto de los campos del documento de validación **no** tiene lista de valores en BD:

- **Boolean en BD:** 2.4 ¿Reemplaza dientes ausentes? (`clinical_case.replaces_missing_teeth`, hoy nullable — Sí / No / sin responder).
- **Texto libre en BD:** 1.1 Nombre del caso, 1.2 Identificador del paciente, 5.1–5.3 notas/instrucciones.
- **Fecha:** 1.4 Fecha de entrega deseada (`desired_delivery_at`).
- **Selección en odontograma:** 2.1 Piezas dentarias (notación FDI, sin tabla de catálogo).
- **Archivos (GCS):** 4.1–4.6.
- **Propuestas nuevas (aún no existen en BD):** 2.5 Diseño del póntico, 2.6 Sistema de implante, 3.2 Color por zonas, tipo de registro de mordida (4.3), 4.5 Fotos clínicas como campo separado, 4.7 Escaneo del provisional, 5.4 Puntos de contacto, 5.5 Articulador/DVO, 6.2 Comentario en trazo, 6.3 Tipo de marca. Si se aprueban las que llevan lista, seguirían el mismo patrón de catálogo (`code` opaco + `label`).

## Apéndice — otros catálogos en BD (fuera del alcance del documento de validación)

Existen 3 tablas más con el mismo patrón de catálogo, pero pertenecen a otros flujos (no al formulario del dentista) y por eso no figuran en el documento de validación:

**`invitation_rejection_reason`** — motivos del técnico al rechazar una asignación (FK desde `case_assignment`):
Carga de trabajo alta · Plazo demasiado corto · Precio sugerido fuera de rango · No manejo el material requerido · Caso fuera de mi especialidad clínica · Información del caso insuficiente · Otro (`rej_001`–`rej_007`)

**`bulk_rejection_reason`** — motivos de rechazo masivo / auto-OFF de disponibilidad:
Vacaciones · Carga de trabajo alta · Pausa temporal · Problema personal · Otro (`brej_001`–`brej_005`)

**`quality_derivation_reason`** — motivos de derivación en el flujo de calidad:
Requiere más expertise · Carga de trabajo alta · Conflicto de interés · No disponible · Otro (`qdr_001`–`qdr_005`)

## Nota sobre discrepancias con el catálogo "Otro"

`CLAUDE.md` indica que los catálogos UI no llevan texto libre "Otro"; sin embargo, `restoration_type`, `dental_material` y `vita_shade` incluyen un valor **Otro** como opción cerrada (sin campo de texto asociado). Vale la pena decidir en la validación con el key user si esos "Otro" se mantienen.
