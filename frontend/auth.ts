import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./lib/db"
import { accounts, sessions, user, verificationToken } from "./lib/db/schema"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: user as any,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationToken,
  }),
  session: { strategy: "jwt" }, // We use JWT for faster sessions in Cloud Run
  ...authConfig,
})
