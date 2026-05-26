import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('framer-motion', () => {
  const stripMotionProps = (props: Record<string, unknown>) => {
    const domProps = { ...props };
    delete domProps.animate;
    delete domProps.exit;
    delete domProps.initial;
    delete domProps.layout;
    delete domProps.layoutId;
    delete domProps.transition;
    delete domProps.variants;
    delete domProps.whileHover;
    delete domProps.whileTap;
    delete domProps.whileInView;
    return domProps;
  };

  const createMotionComponent = (tag: keyof React.JSX.IntrinsicElements) => {
    const MotionComponent = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      return React.createElement(tag, stripMotionProps(props as Record<string, unknown>), children);
    };

    MotionComponent.displayName = `motion.${String(tag)}`;
    return MotionComponent;
  };

  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => createMotionComponent(tag as keyof React.JSX.IntrinsicElements),
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
  SessionProvider: ({ children }: any) => children,
  signIn: vi.fn(),
  signOut: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() })
}));
