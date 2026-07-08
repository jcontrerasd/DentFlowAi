import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import * as bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { user, sessions } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { getSessionTimeoutConfig, isAbsoluteExpired } from "@/lib/db/sessionTimeouts"

const isGoogleOAuthEnabled = process.env.GOOGLE_OAUTH_ENABLED === 'true';

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
    // Fase 2 (ajuste login): solo se agrega el provider si el flag está activo — con el flag
    // off, el array de providers queda exactamente igual que hoy (solo Credentials).
    ...(isGoogleOAuthEnabled ? [Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google ya verificó el email — permitimos vincular con una cuenta existente (Credentials)
      // que use el mismo email, en vez de fallar con OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    })] : []),
  ],
  // Sin esto, errores de OAuth (ej. cuenta bloqueada) caen en la página de error genérica de
  // NextAuth en vez de quedarse en la UI de la app. Con Credentials puro esto nunca importó
  // porque signIn('credentials', { redirect: false }) nunca navega a una página de NextAuth.
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  callbacks: {
    // Fase 2 (ajuste login): solo aplica a Google — Credentials ya resuelve todo esto dentro de
    // su propio authorize() de arriba. Replica las mismas 3 reglas para que el método de login
    // no abra una vía de bypass: bloqueo de cuenta inactiva, reset de rol admin para el dueño/
    // dominio @dentflow.ai, y lastLoginAt (lo usa el cron de inactividad de disponibilidad).
    async signIn({ user: authUser, account }) {
      if (account?.provider !== 'google') return true;
      if (!authUser.email) return false;

      // En este punto del flujo de Auth.js, `authUser.id` es un id generado a partir del
      // perfil de Google (todavía no resuelto/vinculado contra la DB) — el id real de la
      // fila en `user` recién se asigna DESPUÉS de que este callback aprueba. Por eso la
      // búsqueda debe ser por email, no por id.
      const [existingUser] = await db
        .select()
        .from(user)
        .where(sql`LOWER(${user.email}) = ${authUser.email.toLowerCase()}`)
        .limit(1);
      // Usuario nuevo (sin fila todavía): el adapter la creará después de este callback con
      // role:'dentista' (placeholder, ver auth.ts) — nada que validar/bloquear aquí todavía.
      if (!existingUser) return true;

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
      } else if (existingUser.onboardingStep === 0) {
        // Usuario nuevo creado recién por el adapter (createUser en auth.ts ya le puso
        // role:'dentista' como placeholder) — avanza al paso de selección de rol del wizard.
        const [updated] = await db
          .update(user)
          .set({ onboardingStep: 20, updatedAt: new Date() })
          .where(eq(user.id, existingUser.id))
          .returning();
        currentUser = updated;
      }

      if (!currentUser.isActive) return false;

      await db.update(user)
        .set({ lastLoginAt: new Date() })
        .where(eq(user.id, currentUser.id));

      // No es necesario mutar `authUser` aquí: Auth.js vuelve a resolver el usuario por email
      // (handleLoginOrRegister) después de que este callback aprueba, así que el callback `jwt`
      // recibe automáticamente los valores ya actualizados (role/onboardingStep/lastLoginAt).
      return true;
    },
    async jwt({ token, user: authUser }) {
      if (authUser) {
        token.id = authUser.id;
        token.email = authUser.email; // Aseguramos el email en el token
        token.role = (authUser as any).role;
        token.organizationId = (authUser as any).organizationId;
        // Provider-agnóstico (Credentials ya lo trae en authUser.isSystemAdmin desde authorize();
        // Google no, así que lo recalculamos aquí para los dos por igual — mismo criterio).
        const isMasterOrAdminDomain = authUser.email === 'jaime.contreras.d@gmail.com'
          || !!authUser.email?.endsWith('@dentflow.ai');
        token.isSystemAdmin = (authUser as any).isSystemAdmin ?? isMasterOrAdminDomain;

        // Fase 1 (ajuste login): tracking de sesión propia. NextAuth nunca toca la tabla
        // `sessions` en modo jwt (eso solo ocurre con strategy:"database", que es incompatible
        // con Credentials) — la gestionamos a mano para habilitar Fase 4 (single session) y
        // Fase 5 (logout real al cerrar pestaña) sin depender del adapter.
        try {
          if (process.env.SINGLE_SESSION_ENABLED === 'true') {
            await db.delete(sessions).where(eq(sessions.userId, authUser.id as string));
          }
          const sid = crypto.randomUUID();
          await db.insert(sessions).values({
            sessionToken: sid,
            userId: authUser.id as string,
            expires: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h — informativo; el ancla autoritativa es createdAt (v5.29)
          });
          token.sid = sid;
        } catch (e) {
          console.error("[Auth] Error registrando sesión propia:", e);
        }
        // v5.29 — ancla del timeout absoluto (8h por defecto, ver SESSION_ABSOLUTE_TIMEOUT_HOURS).
        token.loginAt = Date.now();
      } else if (typeof token.loginAt !== 'number') {
        // Token emitido antes del rollout v5.29 (sin loginAt): gracia — el reloj arranca ahora,
        // no forzamos un logout inmediato por una columna que no existía al hacer login.
        token.loginAt = Date.now();
      } else {
        const cfg = await getSessionTimeoutConfig();
        if (cfg.enabled && isAbsoluteExpired(token.loginAt, Date.now(), cfg.absoluteMs)) {
          return null;
        }
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
        (session.user as any).sid = token.sid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig
