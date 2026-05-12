import { normalizeVoiceToLocation } from '@/lib/normalizeVoiceLocation';

import { BARCODE_PREFIX } from '@/lib/codiBarcode';

/**
 * Clave para agrupar la misma ubicación aunque venga con guiones o espacios distintos.
 */
export function locationMatchKey(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t) return '';
  return normalizeVoiceToLocation(t).replace(/-/g, '');
}

/**
 * Normaliza lo que llega del pistole o del campo de búsqueda para comparar con matchKey.
 */
export function scanOrQueryToLocationKey(input: string): string {
  let s = input.trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  const prefix = `${BARCODE_PREFIX.toUpperCase()} `;
  if (upper.startsWith(prefix)) {
    s = s.slice(prefix.length).trim();
  } else if (/^MX1\s+002\s+/i.test(s)) {
    s = s.replace(/^MX1\s+002\s+/i, '').trim();
  }
  return locationMatchKey(s);
}
