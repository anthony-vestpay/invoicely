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
//
// discountPercent is applied to the subtotal before tax, so tax is only owed
// on the discounted amount.
export function calculateInvoiceTotals(items, { discountPercent = 0 } = {}) {
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error(`Invalid discountPercent: "${discountPercent}". Expected a number between 0 and 100.`);
  }
  const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const discountCents = Math.round((subtotalCents * discountPercent) / 100);
  const discountedSubtotalCents = subtotalCents - discountCents;
  const taxRate = getTaxRate();
  const taxCents = Math.round((discountedSubtotalCents * taxRate) / 100);
  return {
    subtotalCents,
    discountPercent,
    discountCents,
    taxRate,
    taxCents,
    totalCents: discountedSubtotalCents + taxCents,
  };
}
