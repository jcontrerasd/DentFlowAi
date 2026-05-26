import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import * as bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

export default {
  providers: [
    Credentials({
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const cleanEmail = (credentials.email as string).toLowerCase().trim();
          console.log("[Auth] Intentando login para:", cleanEmail);
          
          const [existingUser] = await db
            .select()
            .from(user)
            .where(sql`LOWER(${user.email}) = ${cleanEmail}`)
            .limit(1);

          if (!existingUser) {
             console.log("[Auth] Usuario no encontrado en DB.");
             return null;
          }
          if (!existingUser.hashedPassword) {
             console.log("[Auth] Usuario encontrado pero no tiene hashedPassword (¿se registró con Google?).");
             return null;
          }

          // 2. Validar password real con bcrypt
          const isValid = await bcrypt.compare(
            credentials.password as string,
            existingUser.hashedPassword
          );

          console.log("[Auth] Validación de password exitosa:", isValid);


          if (!isValid) return null;
          
          // RESET DE SEGURIDAD PARA ADMINS
          // Si es el dueño o un cuenta @dentflow.ai, forzamos el rol de admin al entrar
          const isMaster = existingUser.email === 'jaime.contreras.d@gmail.com';
          const isAdminDomain = existingUser.email?.endsWith('@dentflow.ai');
          const isSystemAdmin = isMaster || isAdminDomain;
          
          let currentUser = existingUser;
          if (isSystemAdmin) {
            const [resetUser] = await db
              .update(user)
              .set({ role: 'admin', onboardingStep: 100, updatedAt: new Date() })
              .where(eq(user.id, existingUser.id))
              .returning();
            currentUser = resetUser;
          }

          if (!currentUser.isActive) {
            throw new Error("BlockedAccount");
          }

          await db.update(user)
            .set({ lastLoginAt: new Date() })
            .where(eq(user.id, currentUser.id));

          return {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.fullName,
            role: currentUser.role,
            organizationId: currentUser.organizationId,
            isSystemAdmin: isSystemAdmin,
          };
        } catch (error: any) {
          if (error.message === "BlockedAccount") throw error;
          console.error("[Auth] Error FATAL en el backend:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user: authUser }) {
      if (authUser) {
        token.id = authUser.id;
        token.email = authUser.email; // Aseguramos el email en el token
        token.role = (authUser as any).role;
        token.organizationId = (authUser as any).organizationId;
        token.isSystemAdmin = (authUser as any).isSystemAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).email = token.email; // Sincronizamos email
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).isSystemAdmin = token.isSystemAdmin;
      }
      return session;
    },
  },
} satisfies NextAuthConfig
