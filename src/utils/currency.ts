/** Formats money with the symbol configured for the active store. */
export function formatCurrency(amount: number, currencySymbol?: string): string {
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `${String(currencySymbol || 'PKR').trim() || 'PKR'} ${value.toFixed(2)}`;
}
