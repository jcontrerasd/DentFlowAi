import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...(args as [string])),
}));

describe('OnboardingPage', () => {
  it('redirige a registro', async () => {
    vi.resetModules();
    const { default: OnboardingPage } = await import('@/app/onboarding/page');
    expect(() => OnboardingPage()).toThrow('REDIRECT:/auth/register');
    expect(redirectMock).toHaveBeenCalledWith('/auth/register');
  });
});
