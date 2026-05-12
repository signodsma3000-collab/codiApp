import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CodiPanel } from '@/components/CodiPanel';
import { getCodiOverlay } from '@/lib/codiOverlayNative';
import { ensurePullSyncedToNative } from '@/lib/pullStorage';

export default function HomeScreen() {
  const title = useMemo(() => 'CODI APP', []);
  const overlay = useMemo(() => getCodiOverlay(), []);
  const router = useRouter();

  const pendingAutoShow = useRef(false);
  const [overlayHint, setOverlayHint] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    void ensurePullSyncedToNative();
  }, []);

  useEffect(() => {
    if (!overlay) {
      return;
    }
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') {
        return;
      }
      if (Platform.OS === 'android') {
        void ensurePullSyncedToNative();
      }
      try {
        const can = await overlay.canDrawOverlays();
        if (can && pendingAutoShow.current) {
          pendingAutoShow.current = false;
          await overlay.showFloatingWindow();
          setOverlayHint(null);
        } else if (!can) {
          setOverlayHint('Activa “Mostrar sobre otras apps” para CODI APP en los ajustes.');
        }
      } catch {
        // ignore
      }
    });
    return () => sub.remove();
  }, [overlay]);

  const onShowFloating = async () => {
    if (!overlay) {
      return;
    }
    try {
      const can = await overlay.canDrawOverlays();
      if (!can) {
        pendingAutoShow.current = true;
        setOverlayHint('Se abrirán los ajustes. Concede “Mostrar sobre otras apps” y vuelve a la app.');
        overlay.requestOverlayPermission();
        return;
      }
      await overlay.showFloatingWindow();
      setOverlayHint(null);
    } catch {
      setOverlayHint('No se pudo mostrar la ventana flotante.');
    }
  };

  const onHideFloating = async () => {
    if (!overlay) {
      return;
    }
    try {
      await overlay.hideFloatingWindow();
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.centered}>
            <CodiPanel title={title} />

            <View style={styles.pullSection}>
              <Pressable
                style={({ pressed }) => [styles.pullLink, pressed && styles.overlayButtonPressed]}
                accessibilityRole="button"
                accessibilityLabel="Abrir hoja de pull"
                onPress={() => {
                  // Route app/pull.tsx — si typedRoutes no lo incluye aún, forzar navegación.
                  (router.push as (href: string) => void)('/pull');
                }}>
                <Text style={styles.pullLinkLabel}>Hoja de pull</Text>
              </Pressable>
            </View>

            {Platform.OS === 'android' && overlay ? (
              <View style={styles.overlaySection}>
                <Pressable
                  style={({ pressed }) => [styles.overlayButton, pressed && styles.overlayButtonPressed]}
                  onPress={onShowFloating}
                  accessibilityRole="button"
                  accessibilityLabel="Activar ventana flotante">
                  <Text style={styles.overlayButtonLabel}>Ventana flotante</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.overlayButtonSecondary, pressed && styles.overlayButtonPressed]}
                  onPress={onHideFloating}
                  accessibilityRole="button"
                  accessibilityLabel="Ocultar ventana flotante">
                  <Text style={styles.overlayButtonSecondaryLabel}>Ocultar flotante</Text>
                </Pressable>
                {overlayHint ? <Text style={styles.overlayHint}>{overlayHint}</Text> : null}
                <Text style={styles.overlayCredit}>orlando mercado</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0c0e',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  centered: {
    alignItems: 'center',
    paddingHorizontal: 28,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  pullSection: {
    width: '100%',
    marginTop: 20,
  },
  overlaySection: {
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  pullLink: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: '#ffffff10',
  },
  pullLinkLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  overlayButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#64d2ff',
    backgroundColor: '#64d2ff22',
  },
  overlayButtonSecondary: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  overlayButtonPressed: {
    opacity: 0.88,
  },
  overlayButtonLabel: {
    color: '#64d2ff',
    fontSize: 15,
    fontWeight: '600',
  },
  overlayButtonSecondaryLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  overlayHint: {
    marginTop: 6,
    color: '#9a9aa3',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  overlayCredit: {
    marginTop: 8,
    alignSelf: 'flex-end',
    fontSize: 10,
    color: '#6a6a70',
    letterSpacing: 0.3,
  },
});
