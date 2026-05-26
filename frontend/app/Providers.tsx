'use client';

import { SessionProvider } from "next-auth/react";
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';

export function Providers({
  children,
  session
}: {
  children: React.ReactNode;
  session?: any;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <AuthProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
