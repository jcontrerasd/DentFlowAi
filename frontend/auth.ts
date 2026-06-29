import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
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
  session: { strategy: "jwt" }, // Obligatorio: NextAuth no permite Credentials + strategy "database"
  ...authConfig,
})
