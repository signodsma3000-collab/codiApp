import type { PullLocationBundle, PullSnapshot } from '@/lib/pullTypes';

import { locationMatchKey } from '@/lib/pullLookup';

const EMPTY_DN_KEY = '__EMPTY_DN__';

export type PullFlatRow = {
  locationDisplay: string;
  locationKey: string;
  dnRaw: string;
  itemRaw: string;
  boxRaw: string;
};

export function groupPullFlatRows(rows: PullFlatRow[], sourceLabel?: string): PullSnapshot {
  const locations: PullLocationBundle[] = [];
  const locIndex = new Map<string, number>();

  for (const row of rows) {
    const lk = row.locationKey;
    if (!lk) continue;

    let idx = locIndex.get(lk);
    if (idx === undefined) {
      idx = locations.length;
      locIndex.set(lk, idx);
      locations.push({
        matchKey: lk,
        locationDisplay: row.locationDisplay.trim() || row.locationDisplay,
        dns: [],
      });
    }
    const loc = locations[idx];

    const dnTrim = row.dnRaw.trim();
    const dnKey = dnTrim ? dnTrim : EMPTY_DN_KEY;

    let bundle = loc.dns.find((d) => d.dnKey === dnKey);
    if (!bundle) {
      bundle = { dnKey, dnDisplay: dnTrim, lines: [] };
      loc.dns.push(bundle);
    }
    bundle.lines.push({
      item: row.itemRaw.trim(),
      box: row.boxRaw.trim(),
    });
  }

  return {
    version: 1,
    importedAt: Date.now(),
    sourceLabel,
    locations,
  };
}

/** Convierte filas sueltas de Excel en filas con clave de ubicación. */
export function flatRowsFromParsed(
  parsed: { location: string; dn: string; item: string; box: string }[],
): PullFlatRow[] {
  const out: PullFlatRow[] = [];
  for (const p of parsed) {
    const locDisp = p.location.trim();
    if (!locDisp) continue;
    const lk = locationMatchKey(locDisp);
    if (!lk) continue;
    out.push({
      locationDisplay: locDisp,
      locationKey: lk,
      dnRaw: p.dn,
      itemRaw: p.item,
      boxRaw: p.box,
    });
  }
  return out;
}
