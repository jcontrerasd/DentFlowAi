import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';

describe('UchQuoteBreakdown', () => {
  it('muestra total y plazo', () => {
    render(
      <UchQuoteBreakdown
        quote={{
          totalPrice: 100_000,
          totalDays: 5,
        }}
        variant="compact"
      />,
    );
    expect(screen.getByTestId('uch-quote-breakdown')).toBeInTheDocument();
    expect(screen.getByText(/Total/i)).toBeInTheDocument();
    expect(screen.getByText(/\$100\.000/)).toBeInTheDocument();
  });

  it('flat: solo total', () => {
    render(
      <UchQuoteBreakdown
        quote={{ totalPrice: 45_000, totalDays: 3 }}
        variant="compact"
      />,
    );
    expect(screen.getByText(/\$45\.000/)).toBeInTheDocument();
  });
});
