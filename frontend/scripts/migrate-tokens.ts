/**
 * Codemod one-shot para migrar clases hard-coded a tokens del design system v2.
 * Uso: npx tsx scripts/migrate-tokens.ts <file-or-glob> [...]
 *
 * Reemplazos basados en Doc/dentflowai-design-system-migracion.md §7.
 * Idempotente. Reporta cambios por archivo.
 */
import fs from 'node:fs';
import path from 'node:path';

type Rep = [pattern: RegExp, replacement: string];

// Orden importa: las reglas más específicas (con alpha) primero.
const REPLACEMENTS: Rep[] = [
  // Selección de texto
  [/\bselection:bg-teal-500\/30\b/g, 'selection:bg-primary/25'],

  // Backgrounds slate
  [/\bbg-slate-950\b/g, 'bg-background'],
  [/\bbg-slate-900\/50\b/g, 'bg-surface'],
  [/\bbg-slate-900\/80\b/g, 'bg-surface'],
  [/\bbg-slate-900\b/g, 'bg-surface'],
  [/\bbg-slate-800\/80\b/g, 'bg-surface-2'],
  [/\bbg-slate-800\/50\b/g, 'bg-surface-2'],
  [/\bbg-slate-800\b/g, 'bg-surface-2'],
  [/\bbg-slate-700\/60\b/g, 'bg-surface-off'],
  [/\bbg-slate-700\/50\b/g, 'bg-surface-off'],
  [/\bbg-slate-700\b/g, 'bg-surface-off'],
  [/\bbg-slate-600\/60\b/g, 'bg-surface-off'],
  [/\bbg-slate-600\b/g, 'bg-surface-off'],

  // White overlays (hover/fondos sutiles)
  [/\bbg-white\/\[0\.04\]\b/g, 'bg-surface-off/60'],
  [/\bbg-white\/\[0\.06\]\b/g, 'bg-surface-off'],
  [/\bbg-white\/5\b/g, 'bg-surface-off'],
  [/\bbg-white\/10\b/g, 'bg-surface-off'],
  [/\bbg-white\/20\b/g, 'bg-surface-off'],

  // Borders white
  [/\bborder-white\/10\b/g, 'border-divider'],
  [/\bborder-white\/20\b/g, 'border-border'],
  [/\bborder-white\/5\b/g, 'border-divider'],

  // Borders slate
  [/\bborder-slate-700\/50\b/g, 'border-divider'],
  [/\bborder-slate-700\b/g, 'border-divider'],
  [/\bborder-slate-600\/50\b/g, 'border-divider'],
  [/\bborder-slate-600\b/g, 'border-divider'],
  [/\bborder-slate-500\/50\b/g, 'border-divider'],
  [/\bborder-slate-500\b/g, 'border-divider'],
  [/\bborder-slate-400\b/g, 'border-border'],

  // Text
  [/\btext-white\b/g, 'text-foreground'],
  [/\btext-slate-200\b/g, 'text-foreground'],
  [/\btext-slate-300\b/g, 'text-muted'],
  [/\btext-slate-400\b/g, 'text-muted'],
  [/\btext-slate-500\b/g, 'text-faint'],
  [/\btext-slate-600\b/g, 'text-faint'],
  [/\btext-slate-700\b/g, 'text-faint'],

  // Teal → primary
  [/\btext-teal-200\b/g, 'text-primary'],
  [/\btext-teal-300\b/g, 'text-primary'],
  [/\btext-teal-400\b/g, 'text-primary'],
  [/\btext-teal-500\b/g, 'text-primary'],
  [/\bhover:text-teal-200\b/g, 'hover:text-primary'],
  [/\bhover:text-teal-300\b/g, 'hover:text-primary'],
  [/\bhover:text-teal-400\b/g, 'hover:text-primary'],
  [/\bbg-teal-500\/30\b/g, 'bg-primary/25'],
  [/\bbg-teal-500\/20\b/g, 'bg-primary-hl'],
  [/\bbg-teal-500\/15\b/g, 'bg-primary-hl'],
  [/\bbg-teal-500\/10\b/g, 'bg-primary-hl'],
  [/\bbg-teal-500\b/g, 'bg-primary'],
  [/\bbg-teal-600\b/g, 'bg-primary'],
  [/\bhover:bg-teal-500\b/g, 'hover:opacity-90'],
  [/\bhover:bg-teal-400\b/g, 'hover:opacity-90'],
  [/\bborder-teal-500\/40\b/g, 'border-primary/30'],
  [/\bborder-teal-500\/35\b/g, 'border-primary/30'],
  [/\bborder-teal-500\/30\b/g, 'border-primary/30'],
  [/\bborder-teal-500\/20\b/g, 'border-primary/20'],
  [/\bborder-teal-500\/50\b/g, 'border-primary/30'],
  [/\bring-teal-400\/40\b/g, 'ring-primary/30'],
  [/\bring-teal-500\/40\b/g, 'ring-primary/30'],
  [/\bfocus:border-teal-500\/50\b/g, 'focus:border-primary'],
  [/\bfocus-visible:ring-teal-400\/40\b/g, 'focus-visible:ring-primary/30'],
  [/\bfocus-visible:ring-teal-400\b/g, 'focus-visible:ring-primary'],
  [/\baccent-teal-500\b/g, 'accent-primary'],
  [/\baccent-teal-400\b/g, 'accent-primary'],
  [/\bhover:accent-teal-400\b/g, ''],

  // Rose (stepper terminal negativo) → error
  [/\bbg-rose-500\/15\b/g, 'bg-error-hl'],
  [/\bbg-rose-500\/20\b/g, 'bg-error-hl'],
  [/\btext-rose-300\b/g, 'text-error'],
  [/\btext-rose-400\b/g, 'text-error'],
  [/\bborder-rose-500\/30\b/g, 'border-error/20'],
  [/\bborder-rose-500\/40\b/g, 'border-error/20'],

  // Amber/yellow semánticos → warning
  [/\bbg-amber-500\/15\b/g, 'bg-warning-hl'],
  [/\bbg-amber-500\/20\b/g, 'bg-warning-hl'],
  [/\btext-amber-300\b/g, 'text-warning'],
  [/\btext-amber-400\b/g, 'text-warning'],
  [/\bborder-amber-500\/30\b/g, 'border-warning/20'],
  [/\bborder-amber-500\/40\b/g, 'border-warning/20'],
  [/\bbg-yellow-500\/15\b/g, 'bg-warning-hl'],
  [/\bbg-yellow-500\/20\b/g, 'bg-warning-hl'],
  [/\btext-yellow-300\b/g, 'text-warning'],
  [/\btext-yellow-400\b/g, 'text-warning'],
  [/\bborder-yellow-500\/30\b/g, 'border-warning/20'],
  [/\bborder-yellow-500\/40\b/g, 'border-warning/20'],

  // Red → error
  [/\bbg-red-500\/15\b/g, 'bg-error-hl'],
  [/\bbg-red-500\/10\b/g, 'bg-error-hl'],
  [/\bbg-red-500\/5\b/g, 'bg-error-hl'],
  [/\bbg-red-500\b/g, 'bg-error'],
  [/\bbg-red-600\b/g, 'bg-error'],
  [/\bbg-red-700\b/g, 'bg-error'],
  [/\bhover:bg-red-600\b/g, 'hover:opacity-90'],
  [/\bhover:bg-red-500\b/g, 'hover:opacity-90'],
  [/\btext-red-300\b/g, 'text-error'],
  [/\btext-red-400\b/g, 'text-error'],
  [/\btext-red-500\b/g, 'text-error'],
  [/\bborder-red-500\/50\b/g, 'border-error/30'],
  [/\bborder-red-500\/30\b/g, 'border-error/20'],

  // Emerald (completado) → jade
  [/\bbg-emerald-500\/15\b/g, 'bg-jade-hl'],
  [/\bbg-emerald-500\/20\b/g, 'bg-jade-hl'],
  [/\btext-emerald-300\b/g, 'text-jade'],
  [/\btext-emerald-400\b/g, 'text-jade'],
  [/\bborder-emerald-500\/30\b/g, 'border-jade/20'],
  [/\bborder-emerald-500\/40\b/g, 'border-jade/20'],

  // Otros decorativos (sky/indigo/violet/cyan) → primary genérico
  [/\bbg-sky-500\/15\b/g, 'bg-primary-hl'],
  [/\btext-sky-300\b/g, 'text-primary'],
  [/\bborder-sky-500\/30\b/g, 'border-primary/20'],
  [/\bbg-indigo-500\/15\b/g, 'bg-primary-hl'],
  [/\btext-indigo-300\b/g, 'text-primary'],
  [/\bborder-indigo-500\/30\b/g, 'border-primary/20'],
  [/\bbg-violet-500\/15\b/g, 'bg-primary-hl'],
  [/\btext-violet-300\b/g, 'text-primary'],
  [/\bborder-violet-500\/30\b/g, 'border-primary/20'],
  [/\bbg-cyan-500\/15\b/g, 'bg-primary-hl'],
  [/\btext-cyan-300\b/g, 'text-primary'],
  [/\bborder-cyan-500\/30\b/g, 'border-primary/20'],
  [/\bbg-orange-500\/15\b/g, 'bg-warning-hl'],
  [/\btext-orange-300\b/g, 'text-warning'],
  [/\bborder-orange-500\/30\b/g, 'border-warning/20'],

  // Residuales finales
  [/\bbg-slate-50\b/g, 'bg-surface'],
  [/\bbg-slate-500\/15\b/g, 'bg-surface-off'],
  [/\bbg-slate-500\/10\b/g, 'bg-surface-off'],
  [/\bbg-white\/\[0\.03\]\b/g, 'bg-surface-off/40'],
  [/\bborder-white\/8\b/g, 'border-divider'],
  [/\btext-amber-100(?:\/\d+)?\b/g, 'text-warning'],
  [/\btext-rose-200(?:\/\d+)?\b/g, 'text-error'],
  [/\btext-cyan-400\b/g, 'text-primary'],
  [/\btext-amber-700\b/g, 'text-warning'],
  [/\bbg-amber-900(?:\/\d+)?\b/g, 'bg-warning-hl'],

  // Variantes 400 (saturadas) — pasaron desapercibidas
  [/\bbg-teal-400\b/g, 'bg-primary'],
  [/\btext-teal-400\b/g, 'text-primary'],
  [/\bbg-amber-400\b/g, 'bg-warning'],
  [/\btext-amber-400\b/g, 'text-warning'],
  [/\bbg-rose-400\b/g, 'bg-error'],
  [/\btext-rose-500\b/g, 'text-error'],
  [/\btext-rose-400\b/g, 'text-error'],
  [/\btext-slate-950\b/g, 'text-inverse'],
  [/\bbg-white\/\[0\.03\]\b/g, 'bg-surface-off/60'],
  [/\bborder-white\/30\b/g, 'border-border'],

  // Residuales no cubiertos en primera pasada
  [/\btext-slate-100\b/g, 'text-foreground'],
  [/\btext-slate-50\b/g, 'text-foreground'],
  [/\bbg-slate-100\b/g, 'bg-surface'],
  [/\bbg-slate-200\b/g, 'bg-surface-2'],
  [/\bbg-slate-300\b/g, 'bg-surface-off'],
  [/\bbg-slate-400\b/g, 'bg-surface-off'],
  [/\btext-cyan-50(?:\/\d+)?\b/g, 'text-foreground'],
  [/\btext-cyan-100(?:\/\d+)?\b/g, 'text-foreground'],
  [/\btext-cyan-200(?:\/\d+)?\b/g, 'text-primary'],
  [/\btext-cyan-300(?:\/\d+)?\b/g, 'text-primary'],
  [/\btext-cyan-700(?:\/\d+)?\b/g, 'text-primary'],
  [/\bborder-cyan-\d+(?:\/\d+)?\b/g, 'border-primary/30'],
  [/\bbg-cyan-\d+(?:\/\d+)?\b/g, 'bg-primary-hl'],
  [/\bbg-teal-950\b/g, 'bg-surface-2'],
  [/\bbg-teal-900\/?\d*\b/g, 'bg-surface-2'],
  [/\btext-teal-100(?:\/\d+)?\b/g, 'text-foreground'],
  [/\btext-teal-600\b/g, 'text-primary'],
  [/\btext-teal-700\b/g, 'text-primary'],
  [/\bshadow-teal-\d+\/\d+\b/g, 'shadow-sm'],
  [/\bshadow-red-\d+\/\d+\b/g, 'shadow-sm'],
  [/\btext-amber-200(?:\/\d+)?\b/g, 'text-warning'],
  [/\btext-amber-500\b/g, 'text-warning'],
  [/\btext-amber-600\b/g, 'text-warning'],
  [/\bbg-amber-500(?:\/\d+)?\b/g, 'bg-warning-hl'],
  [/\bbg-amber-600(?:\/\d+)?\b/g, 'bg-warning'],
  [/\bborder-amber-400(?:\/\d+)?\b/g, 'border-warning/30'],
  [/\bborder-amber-500(?:\/\d+)?\b/g, 'border-warning/20'],
  [/\bborder-rose-500(?:\/\d+)?\b/g, 'border-error/20'],
  [/\bbg-rose-500(?:\/\d+)?\b/g, 'bg-error'],
  [/\bbg-rose-600(?:\/\d+)?\b/g, 'bg-error'],
  [/\bhover:bg-rose-(?:500|600)(?:\/\d+)?\b/g, 'hover:opacity-90'],
  [/\bbg-green-\d+(?:\/\d+)?\b/g, 'bg-jade-hl'],
  [/\btext-green-\d+(?:\/\d+)?\b/g, 'text-jade'],
  [/\bborder-green-\d+(?:\/\d+)?\b/g, 'border-jade/20'],
  [/\bbg-emerald-\d+(?:\/\d+)?\b/g, 'bg-jade-hl'],
  [/\btext-emerald-\d+(?:\/\d+)?\b/g, 'text-jade'],
  [/\bborder-emerald-\d+(?:\/\d+)?\b/g, 'border-jade/20'],

  // Tipografía heredada
  [/\btext-\[9px\]\b/g, 'text-[11px]'],
  [/\bfont-black uppercase tracking-widest\b/g, 'font-bold uppercase tracking-wider'],

  // Glass-effect → surface + sombra (best-effort; revisar TODOs)
  [/\bglass-effect\b/g, 'bg-surface shadow-sm border border-divider'],

  // Gradientes decorativos: eliminar utilidad
  [/\bgradient-teal(?!-marketing)\b/g, 'bg-surface'],
  [/\bgradient-amber\b/g, 'bg-warning-hl'],
];

function migrate(filePath: string): { changed: boolean; count: number } {
  const src = fs.readFileSync(filePath, 'utf8');
  let out = src;
  let count = 0;
  for (const [pat, rep] of REPLACEMENTS) {
    out = out.replace(pat, (m) => { count++; return rep; });
  }
  if (out !== src) {
    fs.writeFileSync(filePath, out);
    return { changed: true, count };
  }
  return { changed: false, count: 0 };
}

function walkArg(arg: string): string[] {
  if (!fs.existsSync(arg)) return [];
  const st = fs.statSync(arg);
  if (st.isFile()) return [arg];
  if (st.isDirectory()) {
    const out: string[] = [];
    for (const entry of fs.readdirSync(arg)) {
      const p = path.join(arg, entry);
      const s = fs.statSync(p);
      if (s.isDirectory()) out.push(...walkArg(p));
      else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(p);
    }
    return out;
  }
  return [];
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: npx tsx scripts/migrate-tokens.ts <file-or-dir> [...]');
  process.exit(1);
}

let totalFiles = 0;
let totalReps = 0;
for (const arg of args) {
  const files = walkArg(arg);
  for (const f of files) {
    const r = migrate(f);
    if (r.changed) {
      totalFiles++;
      totalReps += r.count;
      console.log(`  ✓ ${f}  (${r.count} reemplazos)`);
    }
  }
}
console.log(`\nTotal: ${totalFiles} archivos, ${totalReps} reemplazos.`);
