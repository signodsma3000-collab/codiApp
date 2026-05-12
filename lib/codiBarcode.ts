/** Mismo prefijo que la ventana flotante Android y el flujo CODI existente. */
export const BARCODE_PREFIX = 'MX1 002';

export function buildBarcodeValue(rawInput: string): string {
  return `${BARCODE_PREFIX} ${rawInput.trim()}`;
}
