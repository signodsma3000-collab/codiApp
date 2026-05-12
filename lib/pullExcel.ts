import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normHeader(h: unknown): string {
  return stripDiacritics(String(h ?? '').trim().toLowerCase());
}

const LOCATION_HEADERS = new Set([
  'ubicacion',
  'ubicación',
  'location',
  'sitio',
  'slot',
  'rack',
  'bin',
  'lugar',
]);

const DN_HEADERS = new Set(['dn', 'delivery', 'delivery note', 'entrega', 'albaran', 'albarán', 'remito', 'pedido']);

const ITEM_HEADERS = new Set(['item', 'material', 'sku', 'producto', 'articulo', 'artículo', 'codigo', 'código']);

const BOX_HEADERS = new Set(['box', 'caja', 'bulto', 'carton', 'cartón', 'cajas']);

function pickColumnIndex(headers: string[], candidates: Set<string>): number {
  for (let i = 0; i < headers.length; i++) {
    const n = normHeader(headers[i]);
    if (!n) continue;
    if (candidates.has(n)) return i;
    for (const c of candidates) {
      if (n.includes(c) || c.includes(n)) return i;
    }
  }
  return -1;
}

export type ParsedPullCellRow = {
  location: string;
  dn: string;
  item: string;
  box: string;
};

function cellToString(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'string' || typeof cell === 'number') return String(cell);
  if (typeof cell === 'object' && cell !== null && 'w' in cell && typeof (cell as { w?: unknown }).w === 'string') {
    return (cell as { w: string }).w;
  }
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

/**
 * Lee la primera hoja de un .xlsx / .xls y devuelve filas { location, dn, item, box }.
 * La primera fila debe contener encabezados reconocibles (Ubicación, DN, Item, Box o alias).
 */
export async function parsePullExcelFromUri(uri: string): Promise<ParsedPullCellRow[]> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (matrix.length === 0) return [];

  const headerRowRaw = matrix[0];
  if (!Array.isArray(headerRowRaw)) return [];
  const headerRow = headerRowRaw.map((c) => cellToString(c));
  const iLoc = pickColumnIndex(headerRow, LOCATION_HEADERS);
  const iDn = pickColumnIndex(headerRow, DN_HEADERS);
  const iItem = pickColumnIndex(headerRow, ITEM_HEADERS);
  const iBox = pickColumnIndex(headerRow, BOX_HEADERS);

  if (iLoc < 0) {
    throw new Error(
      'No encontré una columna de ubicación. Usa un encabezado como: Ubicación, Location o Sitio.',
    );
  }

  const rows: ParsedPullCellRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const lineRaw = matrix[r];
    if (!Array.isArray(lineRaw)) continue;
    const line = lineRaw;
    const location = cellToString(line[iLoc]);
    const dn = iDn >= 0 ? cellToString(line[iDn]) : '';
    const item = iItem >= 0 ? cellToString(line[iItem]) : '';
    const box = iBox >= 0 ? cellToString(line[iBox]) : '';
    if (!location.trim()) continue;
    rows.push({ location, dn, item, box });
  }
  return rows;
}
