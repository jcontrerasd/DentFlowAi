import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />,
}));

const authMock = vi.fn();

vi.mock('@/auth', () => ({
  get auth() {
    return authMock;
  },
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

describe('Home (marketing)', () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it('muestra CTA de login y registro cuando no hay sesión', async () => {
    authMock.mockResolvedValue(null);
    const { default: Home } = await import('@/app/page');
    const tree = await Home();
    render(tree);

    expect(screen.getByRole('link', { name: /Iniciar Sesión/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.getByRole('link', { name: /Registro Gratis/i })).toHaveAttribute('href', '/auth/register');
    expect(screen.getByText(/Conectando el/i)).toBeInTheDocument();
  });

  it('redirige al dashboard cuando hay sesión', async () => {
    authMock.mockResolvedValue({ user: { email: 'user@dentflow.ai' } } as never);
    const { default: Home } = await import('@/app/page');
    await expect(Home()).rejects.toThrow('REDIRECT:/dashboard');
  });
});
