// Tax rate is configured via the TAX_RATE env var (a percent, e.g. "8.5") so ops
// can change it without a code deploy. It is intentionally never hardcoded here.
export function getTaxRate() {
  const raw = process.env.TAX_RATE;
  if (raw === undefined || raw === '') return 0;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error(`Invalid TAX_RATE env var: "${raw}". Expected a non-negative percent, e.g. "8.5".`);
  }
  return rate;
}

// Currency conversion is out of scope for now; all amounts are assumed to be
// in a single currency's smallest unit (cents).
export function calculateInvoiceTotals(items) {
  const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const taxRate = getTaxRate();
  const taxCents = Math.round(subtotalCents * (taxRate / 100));
  return { subtotalCents, taxRate, taxCents, totalCents: subtotalCents + taxCents };
}
