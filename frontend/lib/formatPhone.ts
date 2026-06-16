/** Formato teléfono Chile (+56 9 XXXX XXXX) — compartido registro y perfil. */
export function formatPhone(val: string): string {
  const d = val.replace(/\D/g, '');
  if (!d) return '';
  if (d.length <= 2) return `+${d}`;
  if (d.length <= 3) return `+${d.slice(0, 2)} ${d.slice(2)}`;
  if (d.length <= 7) return `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3)}`;
  return `+${d.slice(0, 2)} ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)}`;
}
