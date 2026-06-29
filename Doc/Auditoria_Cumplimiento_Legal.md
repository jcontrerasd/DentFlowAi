# Auditoría de cumplimiento legal — DentFlowAi

Fecha de la auditoría: 29-jun-2026.

> ⚠️ **Alcance**: evaluación **técnica del código** (qué hace y qué no hace el sistema hoy), no una opinión legal. Verificar con asesoría jurídica antes de tomar decisiones de cumplimiento.
>
> La Ley 21.719 entra en vigencia plena el **1-dic-2026** (~5 meses desde la fecha de esta auditoría).

Leyes evaluadas (las mismas referenciadas en el wizard de registro, `frontend/app/auth/register/page.tsx`):
- **Ley 21.719** — Protección de datos personales.
- **Ley 19.628** — Protección de la vida privada (vigente hoy).
- **Ley 20.584** — Derechos y deberes de los pacientes.

---

## Resumen ejecutivo (scorecard)

| Ley | Nivel de cumplimiento | Estado |
|---|---|---|
| **19.628** (vida privada — vigente hoy) | 🟡 Medio | Fuerte en seguridad/confidencialidad; débil en transparencia y derechos del titular |
| **21.719** (datos personales — rige dic-2026) | 🔴 Bajo / no preparado | Faltan consentimiento demostrable, derechos ARCO+, política y registro de tratamiento |
| **20.584** (derechos del paciente) | 🟢 Bueno | Confidencialidad clínica sólida; consentimiento del paciente delegado al dentista (offline) |

**Lo que está bien resuelto:** la **confidencialidad y el control de acceso** son la mayor fortaleza del sistema. **La mayor brecha** es el ciclo de **consentimiento + derechos del titular + transparencia**, justo lo que la 21.719 endurece.

---

## 1. Ley 21.719 — Protección de datos personales 🔴

La app trata **datos sensibles** (escaneos 3D dentales = datos de salud/biométricos en `frontend/lib/db/schema.ts:67-103`; el caso guarda `notesEsthetic`, `doctorNotes`, `teeth`, archivos STL).

| Requisito 21.719 | Estado | Evidencia en código |
|---|---|---|
| **Consentimiento explícito y demostrable** para datos sensibles | 🔴 No cumple | El checkbox de registro **no se persiste**: `handleFinalize` solo hace `if (!consent) return` (`frontend/app/auth/register/page.tsx:700-723`). No hay timestamp, versión del texto ni registro de quién/cuándo aceptó. |
| **Derecho de acceso** (obtener copia de sus datos) | 🔴 No cumple | No existe ninguna acción de exportación/descarga de datos personales. |
| **Rectificación** | 🟢 Cumple | `dashboard/profile` permite editar todos los campos personales y de organización (`frontend/app/dashboard/profile/page.tsx:168-197`). |
| **Cancelación / supresión** | 🟡 Parcial | `deleteUserAdmin` solo borra si el usuario **no tiene actividad**; si tiene casos/eventos, obliga a bloquear y **retiene los datos** (`frontend/lib/db/actions/admin.ts:94-199`). No hay solicitud de borrado iniciada por el usuario. La retención por motivos legales es legítima, pero no hay política de retención documentada ni proceso para gestionar la solicitud. |
| **Oposición / opt-out** | 🟡 Parcial | `emailNotificationPrefs` permite desactivar categorías de correo (`frontend/lib/services/notifications.ts:130-175`), pero todas son transaccionales/operativas. No hay un mecanismo general de oposición al tratamiento. |
| **Portabilidad** | 🔴 No cumple | Sin export en formato estructurado. |
| **Bloqueo** | 🔴 No cumple | No implementado como derecho del titular (existe `isActive`, pero es control admin). |
| **Registro de actividades de tratamiento** (Art. 14 ter) | 🔴 No cumple | `audit_log` existe pero solo registra eventos de archivos (`frontend/lib/db/actions/files.ts:113`) y es purgable en la zona de peligro admin. No hay inventario de tratamientos. |
| **Deber de transparencia** (política de privacidad accesible) | 🔴 No cumple | No existe página de política de privacidad ni de términos. El registro solo enlaza a las 3 leyes citadas. |
| **Seguridad desde el diseño** | 🟢 Mayormente | bcrypt (10 rounds) para contraseñas; URLs firmadas GCS de vida corta (15 min); minimización del dato del paciente (solo ID anónimo); redacción de PII en telemetría. |

---

## 2. Ley 19.628 — Protección de la vida privada 🟡 (vigente hoy)

| Requisito | Estado | Nota |
|---|---|---|
| Tratamiento con finalidad e información al titular | 🟡 Parcial | Sin política publicada que declare finalidad/base legal. |
| Calidad y rectificación de datos | 🟢 Cumple | Edición de perfil. |
| Derecho de acceso | 🔴 No cumple | Sin export. |
| Cancelación | 🟡 Parcial | Igual que la 21.719: admin-only con retención por actividad. |
| Seguridad y confidencialidad | 🟢 Cumple bien | Ver sección 3. |

La 19.628 **ya rige**: las brechas de transparencia, acceso y consentimiento son exigibles **hoy**, no solo desde diciembre.

---

## 3. Ley 20.584 — Derechos y deberes del paciente 🟢

| Requisito | Estado | Evidencia |
|---|---|---|
| **Confidencialidad de la información clínica** | 🟢 Cumple bien | Identidad autoritativa server-side (`getServerIdentity()`); reglas de anonimato (dentista nunca ve al técnico, técnico nunca ve a otros técnicos) vía `sanitizeUchPayloadForViewer`; gate de dirección en 3 niveles (`getDoctorAddressDisclosure`); ContactGuard modera campos libres para evitar fuga de contacto/datos (`frontend/lib/db/actions/cases.ts`, aplicado en notas/despacho). |
| **Minimización de identidad del paciente** | 🟢 Cumple | El paciente se almacena solo como `patientIdAnon` (`frontend/lib/db/schema.ts:76`) — no se guarda nombre ni RUT del paciente. Buena decisión de diseño. |
| **Consentimiento informado del paciente** | 🟡 Delegado | El sistema **no captura** el consentimiento del paciente; se asume que el dentista lo obtiene fuera de la plataforma. Arquitectónicamente aceptable, pero no queda registro de que ese consentimiento existió. |

---

## Recomendaciones priorizadas

**🔴 Crítico (antes de dic-2026, y varios exigibles ya por la 19.628):**
1. **Persistir el consentimiento**: guardar `consentAcceptedAt` + versión del texto legal aceptado en `user` (o tabla `consent_log`). Hoy no hay prueba de consentimiento.
2. **Publicar política de privacidad y términos** como páginas accesibles; enlazarlas desde el registro y el footer.
3. **Derecho de acceso + portabilidad**: una acción "Descargar mis datos" (JSON/CSV del perfil + casos del usuario).
4. **Proceso de supresión iniciado por el titular** + **política de retención documentada** (qué se conserva, por cuánto tiempo y por qué base legal).

**🟡 Importante:**
5. **Registro de actividades de tratamiento** (Art. 14 ter) — documentar qué datos, finalidad, base legal, destinatarios, plazos.
6. **Captura opcional de consentimiento del paciente** (o al menos una casilla donde el dentista declare haberlo obtenido, con registro).
7. Confirmar **cifrado en tránsito a la BD** (`sslmode=require` en `DATABASE_URL` / conector Cloud SQL) — no es verificable desde el código (`frontend/lib/db/index.ts` no fija `ssl` explícitamente).

**🟢 Refuerzos menores:**
8. Considerar `argon2id` para nuevas contraseñas (bcrypt-10 es aceptable hoy).
9. Hacer el `audit_log` no purgable o exportable antes de purgar (trazabilidad de cumplimiento).
