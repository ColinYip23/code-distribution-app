import { describe, expect, it } from 'vitest';
import { calculateInvoice } from '@/features/invoices/calculate';

describe('invoice calculation', () => {
  it('uses exact decimal values', () => {
    expect(calculateInvoice([{ description: '5GB', quantity: 3, unitPrice: '0.10', discount: '0', taxRate: '0' }], '0').total).toBe('0.30');
  });
  it('applies discount before tax and an explicit final adjustment', () => {
    expect(calculateInvoice([{ description: '20GB', quantity: 2, unitPrice: '10', discount: '1', taxRate: '6' }], '-0.14')).toEqual({ subtotal: '20.00', discount: '1.00', tax: '1.14', adjustment: '-0.14', total: '20.00' });
  });
  it.each([
    { quantity: 0, unitPrice: '10', discount: '0', taxRate: '0' },
    { quantity: 1.5, unitPrice: '10', discount: '0', taxRate: '0' },
    { quantity: 1, unitPrice: '10', discount: '11', taxRate: '0' },
    { quantity: 1, unitPrice: '-1', discount: '0', taxRate: '0' },
    { quantity: 1, unitPrice: 'NaN', discount: '0', taxRate: '0' },
  ])('rejects invalid billing inputs %j', line => {
    expect(() => calculateInvoice([{ description: 'Code', ...line }], '0')).toThrow();
  });
  it('rejects a negative invoice total', () => {
    expect(() => calculateInvoice([{ description: 'Code', quantity: 1, unitPrice: '1', discount: '0', taxRate: '0' }], '-2')).toThrow();
  });
});
