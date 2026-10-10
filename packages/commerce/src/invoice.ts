/** GST money math. All amounts in paise (integers) to avoid float drift. */

export const DEFAULT_GST_PERCENT = 18;

export interface Totals {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstPercent: number;
}

export function computeTotals(
  unitPricePaise: number,
  quantity: number,
  gstPercent: number = DEFAULT_GST_PERCENT,
): Totals {
  const subtotalPaise = Math.round(unitPricePaise * quantity);
  const taxPaise = Math.round((subtotalPaise * gstPercent) / 100);
  return {
    subtotalPaise,
    taxPaise,
    totalPaise: subtotalPaise + taxPaise,
    gstPercent,
  };
}

export function paiseToInr(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}
