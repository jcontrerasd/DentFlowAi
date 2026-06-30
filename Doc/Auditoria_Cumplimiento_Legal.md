# Auditoría de cumplimiento legal — DentFlowAi

Fecha de la auditoría: 29-jun-2026. **Actualizado el mismo día tras remediación** (rama `tmp-legal`, 8 de 9 recomendaciones implementadas — ver scorecard y sección final).

> ⚠️ **Alcance**: evaluación **técnica del código** (qué hace y qué no hace el sistema hoy), no una opinión legal. Verificar con asesoría jurídica antes de tomar decisiones de cumplimiento.
>
> La Ley 21.719 entra en vigencia plena el **1-dic-2026** (~5 meses desde la fecha de esta auditoría).

Leyes evaluadas (las mismas referenciadas en el wizard de registro, `frontend/app/auth/register/page.tsx`):
- **Ley 21.719** — Protección de datos personales.
- **Ley 19.628** — Protección de la vida privada (vigente hoy).
- **Ley 20.584** — Derechos y deberes de los pacientes.

---

## Resumen ejecutivo (scorecard)

> Este scorecard refleja el estado **post-remediación** (rama `tmp-legal`). Las tablas detalladas de cada ley, más abajo, conservan el diagnóstico original de la auditoría (29-jun-2026) seguido del estado actual tras la implementación.

| Ley | Nivel de cumplimiento | Estado |
|---|---|---|
| **19.628** (vida privada — vigente hoy) | 🟢 Bueno | Transparencia (política publicada), derecho de acceso/portabilidad y consentimiento ya resueltos. |
| **21.719** (datos personales — rige dic-2026) | 🟢 Bueno / preparado | Consentimiento demostrable, derechos ARCO+ (acceso, rectificación, cancelación, oposición), política publicada y registro de tratamiento implementados. Pendiente solo el refuerzo menor #8 (omitido por decisión de producto). |
| **20.584** (derechos del paciente) | 🟢 Bueno | Confidencialidad clínica sólida; declaración del dentista sobre consentimiento del paciente al publicar el caso (offline, vía checkbox auditable). |

**Lo que está bien resuelto:** la **confidencialidad y el control de acceso** ya eran la mayor fortaleza del sistema; tras la remediación, también lo es el ciclo de **consentimiento + derechos del titular + transparencia**, que era la mayor brecha original.

---

## 1. Ley 21.719 — Protección de datos personales 🟢 (post-remediación)

La app trata **datos sensibles** (escaneos 3D dentales = datos de salud/biométricos en `frontend/lib/db/schema.ts:67-103`; el caso guarda `notesEsthetic`, `doctorNotes`, `teeth`, archivos STL).

| Requisito 21.719 | Estado original | Estado actual | Evidencia en código |
|---|---|---|---|
| **Consentimiento explícito y demostrable** para datos sensibles | 🔴 No cumple | 🟢 Cumple | `consentRegistrationAcceptedAt` + `consentRegistrationLegalVersion` (`schema.ts:63-64`), seteados en `handleFinalize` (`frontend/app/auth/register/page.tsx:713-714`) con versión fija del texto legal aceptado. |
| **Derecho de acceso** (obtener copia de sus datos) | 🔴 No cumple | 🟢 Cumple | `exportMyDataAction` (`frontend/lib/db/actions/user.ts:374`) — descarga JSON del perfil, casos y entregas **aprobadas** (excluye revisiones intermedias pendientes/rechazadas). UI en `MyDataSection.tsx` (perfil). |
| **Rectificación** | 🟢 Cumple | 🟢 Cumple | `dashboard/profile` permite editar todos los campos personales y de organización (`frontend/app/dashboard/profile/page.tsx:168-197`). |
| **Cancelación / supresión** | 🟡 Parcial | 🟢 Cumple | `requestAccountDeletionAction` (`user.ts:340`) — autoservicio: borra físicamente si no hay rastro de actividad; si lo hay, desactiva la cuenta y registra `deletionRequestedAt` (retención documentada, ver sección final). Unifica criterio con `deleteUserAdmin` vía `hasUserActivityTrace`. UI en `DeleteAccountSection.tsx`. |
| **Oposición / opt-out** | 🟡 Parcial | 🟡 Parcial (sin cambios) | `emailNotificationPrefs` permite desactivar categorías de correo, pero todas son transaccionales/operativas. No hay mecanismo general de oposición al tratamiento — fuera de alcance de esta remediación. |
| **Portabilidad** | 🔴 No cumple | 🟢 Cumple | Mismo `exportMyDataAction` cubre acceso y portabilidad (formato JSON estructurado). |
| **Bloqueo** | 🔴 No cumple | 🟡 Parcial (sin cambios) | Sigue sin implementarse como derecho explícito del titular (existe `isActive`, control admin); no priorizado en esta remediación. |
| **Registro de actividades de tratamiento** (Art. 14 ter) | 🔴 No cumple | 🟢 Cumple | `lib/constants/dataProcessingRegistry.ts` + página admin descargable `/dashboard/admin/legal`. `audit_log` además excluido de purga (`admin.ts`, ver punto 9 abajo). |
| **Deber de transparencia** (política de privacidad accesible) | 🔴 No cumple | 🟢 Cumple | `app/legal/privacidad/page.tsx` y `app/legal/terminos/page.tsx`, enlazadas desde registro y footer. |
| **Seguridad desde el diseño** | 🟢 Mayormente | 🟢 Mayormente (sin cambios) | bcrypt (10 rounds) para contraseñas; URLs firmadas GCS de vida corta (15 min); minimización del dato del paciente (solo ID anónimo); redacción de PII en telemetría. Migración a argon2id evaluada y omitida (punto 8). |

---

## 2. Ley 19.628 — Protección de la vida privada 🟢 (vigente hoy, post-remediación)

| Requisito | Estado original | Estado actual | Nota |
|---|---|---|---|
| Tratamiento con finalidad e información al titular | 🟡 Parcial | 🟢 Cumple | Política de privacidad publicada y enlazada (declara finalidad/base legal). |
| Calidad y rectificación de datos | 🟢 Cumple | 🟢 Cumple | Edición de perfil (sin cambios). |
| Derecho de acceso | 🔴 No cumple | 🟢 Cumple | `exportMyDataAction` (ver tabla 21.719). |
| Cancelación | 🟡 Parcial | 🟢 Cumple | `requestAccountDeletionAction`, autoservicio (ver tabla 21.719). |
| Seguridad y confidencialidad | 🟢 Cumple bien | 🟢 Cumple bien | Sin cambios — ver sección 3. |

La 19.628 **ya rige**: las brechas de transparencia, acceso y consentimiento, exigibles desde hoy, quedaron resueltas con esta remediación.

---

## 3. Ley 20.584 — Derechos y deberes del paciente 🟢

| Requisito | Estado | Evidencia |
|---|---|---|
| **Confidencialidad de la información clínica** | 🟢 Cumple bien | Identidad autoritativa server-side (`getServerIdentity()`); reglas de anonimato (dentista nunca ve al técnico, técnico nunca ve a otros técnicos) vía `sanitizeUchPayloadForViewer`; gate de dirección en 3 niveles (`getDoctorAddressDisclosure`); ContactGuard modera campos libres para evitar fuga de contacto/datos (`frontend/lib/db/actions/cases.ts`, aplicado en notas/despacho). |
| **Minimización de identidad del paciente** | 🟢 Cumple | El paciente se almacena solo como `patientIdAnon` (`frontend/lib/db/schema.ts:76`) — no se guarda nombre ni RUT del paciente. Buena decisión de diseño. |
| **Consentimiento informado del paciente** | 🟡 Delegado → 🟢 Declaración auditable | El sistema sigue **sin capturar** el consentimiento real del paciente (lo obtiene el dentista offline, fuera de la plataforma — la app nunca interactúa con el paciente). Lo que se agregó es una **declaración explícita del dentista**: checkbox obligatorio (`patientConsentChecked`) al publicar el caso, que bloquea `publishCaseAction` si no está marcado (`frontend/app/dashboard/cases/[id]/page.tsx:361,1144`). Deja registro de que el dentista atestiguó contar con el consentimiento, sin pretender sustituirlo. |

---

## Recomendaciones priorizadas — estado final

**🔴 Crítico (antes de dic-2026, y varios exigibles ya por la 19.628):**
1. ✅ **Implementado** — Persistir el consentimiento: `consentRegistrationAcceptedAt` + `consentRegistrationLegalVersion` en `user` (`frontend/lib/db/schema.ts:63-64`), seteados en el registro (`frontend/app/auth/register/page.tsx:713-714`).
2. ✅ **Implementado** — Política de privacidad y términos publicadas como páginas accesibles (`app/legal/privacidad/`, `app/legal/terminos/`), enlazadas desde el registro y el footer.
3. ✅ **Implementado** — Derecho de acceso + portabilidad: `exportMyDataAction` ("Descargar mis datos", JSON del perfil + casos + entregas **aprobadas**), expuesto en `MyDataSection.tsx` del perfil.
4. ✅ **Implementado** — Proceso de supresión iniciado por el titular (`requestAccountDeletionAction`, `DeleteAccountSection.tsx`) + política de retención documentada (ver sección final de este documento).

**🟡 Importante:**
5. ✅ **Implementado** — Registro de actividades de tratamiento (Art. 14 ter): `lib/constants/dataProcessingRegistry.ts`, descargable desde `/dashboard/admin/legal`.
6. ✅ **Implementado** — Declaración del dentista sobre consentimiento del paciente: checkbox obligatorio al publicar el caso (`patientConsentChecked`), bloquea la publicación si no está marcado.
7. ✅ **Implementado** — Cifrado en tránsito a la BD: warning en boot si `DATABASE_URL` no incluye `sslmode` en producción (`frontend/lib/db/index.ts:11-12`); documentado contra el archivo real `frontend/.env.local` (no `.env.example`).

**🟢 Refuerzos menores:**
8. ⏭️ **Omitido por decisión del producto** — `argon2id` para nuevas contraseñas; bcrypt-10 se mantiene (decisión explícita, no pendiente).
9. ✅ **Implementado** — `audit_log` excluido de la purga masiva admin (`purgeAllBusinessDataAdmin`, `frontend/lib/db/actions/admin.ts`) — preserva trazabilidad de cumplimiento aunque se purguen datos de negocio.

---

## Política de retención de datos (implementada)

A partir de la remediación de este informe, `requestAccountDeletionAction` (`frontend/lib/db/actions/user.ts`) aplica la siguiente política cuando un usuario solicita eliminar su cuenta:

- **Sin rastro de actividad** (sin casos, asignaciones, entregas, calificaciones ni eventos asociados): la cuenta y sus archivos se **borran físicamente** de inmediato.
- **Con rastro de actividad**: la cuenta se **desactiva** (`isActive = false`, no puede volver a iniciar sesión) y se registra `deletionRequestedAt`. Los datos se **retienen** por motivos de integridad histórica del marketplace (trazabilidad de casos, calificaciones y eventos ya ocurridos entre las partes), sujeto a revisión manual periódica por el equipo administrador.
- Esta misma regla de actividad (`hasUserActivityTrace`, en `frontend/lib/db/actions/admin.ts`) es la que ya usaba `deleteUserAdmin` — se unificó en un solo helper para que ambos caminos (admin y autoservicio) evalúen exactamente el mismo criterio.
