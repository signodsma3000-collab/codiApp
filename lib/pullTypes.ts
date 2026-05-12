export type PullLineRef = {
  item: string;
  box: string;
};

export type PullDnBundle = {
  /** Clave interna (p. ej. "__EMPTY_DN__"). */
  dnKey: string;
  /** Texto tal como en la hoja; vacío si no hay DN. */
  dnDisplay: string;
  lines: PullLineRef[];
};

export type PullLocationBundle = {
  /** Clave estable para coincidir escaneos/búsqueda. */
  matchKey: string;
  /** Texto mostrado (primera aparición en importación). */
  locationDisplay: string;
  dns: PullDnBundle[];
};

export type PullSnapshot = {
  version: 1;
  importedAt: number;
  /** Nombre de archivo o nota opcional. */
  sourceLabel?: string;
  locations: PullLocationBundle[];
};
