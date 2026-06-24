'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMyAvailabilityStatusAction } from '@/lib/db/actions/availability';

type Status = Awaited<ReturnType<typeof getMyAvailabilityStatusAction>>;

interface AvailabilityContextValue {
  status: Status | null;
  refresh: () => Promise<void>;
}

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);

export function AvailabilityProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await getMyAvailabilityStatusAction());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AvailabilityContext.Provider value={{ status, refresh }}>
      {children}
    </AvailabilityContext.Provider>
  );
}

export function useAvailability() {
  const ctx = useContext(AvailabilityContext);
  if (!ctx) throw new Error('useAvailability must be used inside AvailabilityProvider');
  return ctx;
}
