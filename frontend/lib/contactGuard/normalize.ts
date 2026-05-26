/**
 * ContactGuard — Capa 2: Normalización anti-evasión.
 * Convierte el texto a una forma canónica para que las capas de detección
 * (regex/keyword) encuentren intentos disfrazados.
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  'А': 'a', 'Е': 'e', 'О': 'o', 'Р': 'p', 'С': 'c', 'У': 'y', 'Х': 'x',
  'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's',
};

function mapHomoglyphs(s: string): string {
  let out = '';
  for (const ch of s) out += CYRILLIC_TO_LATIN[ch] ?? ch;
  return out;
}

function spelledOutToSymbols(s: string): string {
  return s
    .replace(/\barroba\b/gi, '@')
    .replace(/\s+punto\s+/gi, '.')
    .replace(/\bguion\s+bajo\b/gi, '_')
    .replace(/\bguión\s+bajo\b/gi, '_');
}

/** Quita espacios/puntos/guiones internos en secuencias de dígitos (+56 9 1234 5678 → +56912345678). */
function collapseDigitSeparators(s: string): string {
  return s.replace(/(\+?\d[\d\s\-\.]{6,}\d)/g, (m) => m.replace(/[\s\-\.]/g, ''));
}

/** Leet básico: solo cuando el dígito está rodeado de letras (evita romper teléfonos reales). */
function deleet(s: string): string {
  return s.replace(/([a-z])([01345$])(?=[a-z])/gi, (_, a, n) => {
    const map: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '$': 's' };
    return a + (map[n] ?? n);
  });
}

export function normalizeForGuard(input: string): string {
  if (!input) return '';
  let s = input;
  s = mapHomoglyphs(s);
  s = s.toLowerCase();
  s = spelledOutToSymbols(s);
  s = deleet(s);
  s = collapseDigitSeparators(s);
  return s;
}
