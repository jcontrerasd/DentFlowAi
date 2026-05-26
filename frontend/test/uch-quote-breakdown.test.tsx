import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';

describe('UchQuoteBreakdown', () => {
  it('muestra desglose integral y total', () => {
    render(
      <UchQuoteBreakdown
        quote={{
          totalPrice: 100_000,
          totalDays: 5,
          designPrice: 40_000,
          designDays: 2,
          fabricationPrice: 60_000,
          fabricationDays: 3,
        }}
        variant="compact"
      />,
    );
    expect(screen.getByTestId('uch-quote-breakdown')).toBeInTheDocument();
    expect(screen.getByText(/Diseño/i)).toBeInTheDocument();
    expect(screen.getByText(/Fabricación/i)).toBeInTheDocument();
    expect(screen.getByText(/Total/i)).toBeInTheDocument();
    expect(screen.getByText(/\$100\.000/)).toBeInTheDocument();
  });

  it('flat: solo total sin bloques de diseño/fabricación', () => {
    render(
      <UchQuoteBreakdown
        quote={{ totalPrice: 45_000, totalDays: 3 }}
        variant="compact"
      />,
    );
    expect(screen.queryByText(/^Diseño$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/\$45\.000/)).toBeInTheDocument();
  });
});
