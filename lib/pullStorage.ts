import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCodiOverlay } from '@/lib/codiOverlayNative';

import type { PullSnapshot } from '@/lib/pullTypes';

const STORAGE_KEY = 'codi_pull_snapshot_v1';

async function pushPullSnapshotToNative(snapshot: PullSnapshot | null): Promise<void> {
  const overlay = getCodiOverlay();
  if (!overlay?.syncPullSnapshotJson) {
    return;
  }
  try {
    await overlay.syncPullSnapshotJson(snapshot ? JSON.stringify(snapshot) : null);
  } catch {
    // Overlay puede no estar enlazado en desarrollo web u otros entornos.
  }
}

export async function loadPullSnapshot(): Promise<PullSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PullSnapshot;
    if (data?.version !== 1 || !Array.isArray(data.locations)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function savePullSnapshot(snapshot: PullSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  await pushPullSnapshotToNative(snapshot);
}

export async function clearPullSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await pushPullSnapshotToNative(null);
}

/** Al iniciar la app: vuelve a enviar el pull guardado al overlay nativo (p. ej. tras reinicio). */
export async function ensurePullSyncedToNative(): Promise<void> {
  const s = await loadPullSnapshot();
  await pushPullSnapshotToNative(s);
}
