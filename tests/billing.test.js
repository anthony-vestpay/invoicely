import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTaxRate, calculateInvoiceTotals } from '../src/billing.js';

function withTaxRate(rate, fn) {
  const prev = process.env.TAX_RATE;
  process.env.TAX_RATE = String(rate);
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TAX_RATE;
    else process.env.TAX_RATE = prev;
  }
}

test('getTaxRate returns 0 when TAX_RATE is unset', () => {
  const prev = process.env.TAX_RATE;
  delete process.env.TAX_RATE;
  try {
    assert.equal(getTaxRate(), 0);
  } finally {
    if (prev !== undefined) process.env.TAX_RATE = prev;
  }
});

test('getTaxRate throws on an invalid value', () => {
  withTaxRate('bogus', () => {
    assert.throws(() => getTaxRate());
  });
});

test('calculateInvoiceTotals sums item amounts into a subtotal', () => {
  withTaxRate(0, () => {
    const totals = calculateInvoiceTotals([{ amountCents: 1000 }, { amountCents: 2550 }]);
    assert.equal(totals.subtotalCents, 3550);
    assert.equal(totals.taxCents, 0);
    assert.equal(totals.totalCents, 3550);
  });
});

test('calculateInvoiceTotals rounds an exact half-cent up (regression: order of operations)', () => {
  withTaxRate(20.5, () => {
    const totals = calculateInvoiceTotals([{ amountCents: 4700 }]);
    // 4700 * 20.5% = 963.5 cents exactly, should round up to 964.
    assert.equal(totals.taxCents, 964);
    assert.equal(totals.totalCents, 4700 + 964);
  });
});

test('calculateInvoiceTotals is exact across a range of amounts and rates', () => {
  const cases = [
    [10620, 17.5, 1859],
    [12100, 14.5, 1755],
    [21720, 8.75, 1901],
    [38000, 5.125, 1948],
  ];
  for (const [subtotalCents, rate, expectedTaxCents] of cases) {
    withTaxRate(rate, () => {
      const totals = calculateInvoiceTotals([{ amountCents: subtotalCents }]);
      assert.equal(
        totals.taxCents,
        expectedTaxCents,
        `subtotal=${subtotalCents} rate=${rate}% expected tax=${expectedTaxCents} got=${totals.taxCents}`
      );
    });
  }
});
