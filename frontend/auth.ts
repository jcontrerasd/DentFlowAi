import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { eq } from "drizzle-orm"
import { db } from "./lib/db"
import { accounts, sessions, user, verificationToken } from "./lib/db/schema"
import authConfig from "./auth.config"

const baseAdapter = DrizzleAdapter(db, {
  usersTable: user as any,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationToken,
})

// Fase 2 (ajuste login, Google OAuth): `user.role` e `is_active` son NOT NULL pero no tienen
// DEFAULT real en la DB ya migrada (desfase con schema.ts, que sí declara default(true) para
// is_active — drizzle-kit nunca corrió ese ALTER en este entorno). Ninguno de los dos forma
// parte de la forma estándar que NextAuth pasa a adapter.createUser ({id, name, email,
// emailVerified, image}) — sin este wrapper, el INSERT del adapter viola el NOT NULL y el primer
// login de cualquier usuario nuevo de Google falla. 'dentista' es un placeholder seguro: el guard
// de onboardingStep<100 en dashboard/layout.tsx bloquea cualquier pantalla real hasta que el
// usuario elija su rol verdadero en el wizard (mismo onboardingStep:0 que ya trae por default).
const adapter = {
  ...baseAdapter,
  createUser: (data: any) => baseAdapter.createUser!({ ...data, role: 'dentista', isActive: true }),
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  session: {
    strategy: "jwt", // Obligatorio: NextAuth no permite Credentials + strategy "database"
    // v5.29 — techo de la cookie (defensa en profundidad; el tope autoritativo de 8h/2h
    // vive en la tabla `sessions`, ver getServerIdentity). Rollback total al comportamiento
    // pre-v5.29 (30 días): env SESSION_JWT_MAXAGE_SECONDS=2592000.
    maxAge: Number(process.env.SESSION_JWT_MAXAGE_SECONDS) || 8 * 60 * 60,
  },
  events: {
    // v5.29 — fix del gap histórico: signOut nunca borraba la fila de `sessions`, así que
    // "cerrar sesión en otros dispositivos" o el timeout server-side no se reflejaban hasta
    // que el cron de limpieza pasara. `token` viene disponible en el evento con strategy jwt.
    async signOut(message) {
      try {
        const sid = "token" in message ? (message.token as any)?.sid : undefined
        if (sid) await db.delete(sessions).where(eq(sessions.sessionToken, sid))
      } catch (e) {
        console.error("[Auth] Error limpiando sessions en signOut:", e)
      }
    },
  },
  ...authConfig,
})
