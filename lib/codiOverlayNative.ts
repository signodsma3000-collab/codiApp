import { NativeModules, Platform } from 'react-native';

export type CodiOverlayNative = {
  canDrawOverlays(): Promise<boolean>;
  requestOverlayPermission(): void;
  showFloatingWindow(): Promise<boolean>;
  hideFloatingWindow(): Promise<boolean>;
  minimizeFloatingWindow(): Promise<boolean>;
  restoreFloatingWindow(): Promise<boolean>;
  /** Sincroniza JSON del pull con SharedPreferences del overlay (Android). */
  syncPullSnapshotJson(json: string | null): Promise<boolean>;
};

type NativeModulesShape = {
  CodiOverlay?: CodiOverlayNative;
};

export function getCodiOverlay(): CodiOverlayNative | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  return (NativeModules as NativeModulesShape).CodiOverlay ?? null;
}
