import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PullLocationResult } from '@/components/PullLocationResult';
import { flatRowsFromParsed, groupPullFlatRows } from '@/lib/pullGroup';
import { parsePullExcelFromUri } from '@/lib/pullExcel';
import { scanOrQueryToLocationKey } from '@/lib/pullLookup';
import { clearPullSnapshot, loadPullSnapshot, savePullSnapshot } from '@/lib/pullStorage';
import type { PullLocationBundle, PullSnapshot } from '@/lib/pullTypes';

function countLines(snapshot: PullSnapshot): number {
  let n = 0;
  for (const loc of snapshot.locations) {
    for (const dn of loc.dns) {
      n += dn.lines.length;
    }
  }
  return n;
}

export default function PullScreen() {
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<PullSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [match, setMatch] = useState<PullLocationBundle | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await loadPullSnapshot();
      setSnapshot(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    if (!snapshot) return null;
    const lines = countLines(snapshot);
    return {
      locs: snapshot.locations.length,
      lines,
      label: snapshot.sourceLabel,
    };
  }, [snapshot]);

  const runLookup = useCallback(
    (raw: string) => {
      setHasSearched(true);
      if (!snapshot) {
        setMatch(null);
        return;
      }
      const key = scanOrQueryToLocationKey(raw);
      if (!key) {
        setMatch(null);
        return;
      }
      const found = snapshot.locations.find((l) => l.matchKey === key) ?? null;
      setMatch(found);
    },
    [snapshot],
  );

  const onImportExcel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) {
        return;
      }
      const asset = res.assets[0];
      const uri = asset.uri;
      const parsed = await parsePullExcelFromUri(uri);
      if (parsed.length === 0) {
        Alert.alert('Excel', 'No se leyeron filas con ubicación. Revisa la primera hoja y los encabezados.');
        return;
      }
      const flat = flatRowsFromParsed(parsed);
      const next = groupPullFlatRows(flat, asset.name ?? undefined);
      await savePullSnapshot(next);
      setSnapshot(next);
      setMatch(null);
      setHasSearched(false);
      setQuery('');
      Alert.alert('Pull', `Importadas ${next.locations.length} ubicación(es).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Excel', msg);
    } finally {
      setBusy(false);
    }
  };

  const onTakePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Cámara', 'CODI APP necesita permiso de cámara para fotografiar la hoja.');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        allowsEditing: false,
      });
      if (shot.canceled || !shot.assets?.[0]) {
        return;
      }
      setPhotoUri(shot.assets[0].uri);
      Alert.alert(
        'Foto de la hoja',
        'La lectura automática de texto en foto (OCR) aún no está integrada. Por ahora importa el mismo pull como Excel (columnas Ubicación, DN, Item, Box) para usar la vista interactiva.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onPickPhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Galería', 'Activa el permiso de fotos para elegir una imagen de la hoja.');
        return;
      }
      const shot = await ImagePicker.launchImageLibraryAsync({
        quality: 0.85,
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (shot.canceled || !shot.assets?.[0]) {
        return;
      }
      setPhotoUri(shot.assets[0].uri);
      Alert.alert(
        'Imagen',
        'OCR desde imagen no está disponible aún. Usa importar Excel para cargar el pull.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onClearPull = () => {
    Alert.alert('Borrar pull', '¿Quitar todos los datos del pull guardados en el teléfono?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await clearPullSnapshot();
          setSnapshot(null);
          setMatch(null);
          setHasSearched(false);
          setQuery('');
          setPhotoUri(null);
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Hoja de pull',
          headerStyle: { backgroundColor: '#0c0c0e' },
          headerTintColor: '#ffffff',
          headerShadowVisible: false,
        }}
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}>
          <Text style={styles.intro}>
            Herramienta aparte del flujo CODI / SAP: convierte tu hoja de pull en ubicaciones y DN con código de
            barras. Item y Box solo como texto.
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              onPress={onImportExcel}
              disabled={busy}>
              <Ionicons name="document-outline" size={22} color="#64d2ff" />
              <Text style={styles.actionLabel}>Excel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              onPress={onTakePhoto}
              disabled={busy}>
              <Ionicons name="camera-outline" size={22} color="#ffffff" />
              <Text style={styles.actionLabel}>Foto</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              onPress={onPickPhoto}
              disabled={busy}>
              <Ionicons name="images-outline" size={22} color="#ffffff" />
              <Text style={styles.actionLabel}>Galería</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtnDanger, pressed && styles.pressed]}
              onPress={onClearPull}
              disabled={busy || !snapshot}>
              <Ionicons name="trash-outline" size={20} color="#ff6b6b" />
              <Text style={styles.actionLabelDanger}>Borrar</Text>
            </Pressable>
          </View>

          {busy ? <ActivityIndicator color="#64d2ff" style={{ marginVertical: 8 }} /> : null}

          {photoUri ? (
            <View style={styles.photoBox}>
              <Text style={styles.photoCaption}>Última imagen (referencia)</Text>
              <Image source={{ uri: photoUri }} style={styles.photo} contentFit="contain" />
              <Pressable onPress={() => setPhotoUri(null)} style={styles.clearPhoto}>
                <Text style={styles.clearPhotoText}>Quitar imagen</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <Text style={styles.muted}>Cargando…</Text>
          ) : summary ? (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                Pull activo: <Text style={styles.summaryBold}>{summary.locs}</Text> ubicación(es) ·{' '}
                <Text style={styles.summaryBold}>{summary.lines}</Text> bloque(s) de líneas
              </Text>
              {summary.label ? (
                <Text style={styles.summaryFile} numberOfLines={2}>
                  Origen: {summary.label}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.muted}>No hay pull cargado. Importa un Excel para empezar.</Text>
          )}

          <Text style={styles.sectionTitle}>Buscar / escanear ubicación</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (!t.trim()) {
                setHasSearched(false);
                setMatch(null);
              }
            }}
            placeholder="Ubicación o pistole MX1 002 …"
            placeholderTextColor="#6b6b6b"
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={() => runLookup(query)}
            returnKeyType="search"
          />
          <Pressable
            style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed]}
            onPress={() => runLookup(query)}
            disabled={!snapshot}>
            <Text style={styles.searchBtnLabel}>Mostrar</Text>
          </Pressable>

          {match ? (
            <PullLocationResult bundle={match} />
          ) : hasSearched && query.trim().length > 0 && snapshot ? (
            <Text style={styles.noMatch}>No hay datos de pull para esa ubicación.</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0c0e',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  intro: {
    color: '#9a9aa3',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a32',
    backgroundColor: '#141418',
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4a2a2a',
    backgroundColor: '#1a1010',
  },
  pressed: {
    opacity: 0.85,
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionLabelDanger: {
    color: '#ff8a8a',
    fontSize: 14,
    fontWeight: '600',
  },
  photoBox: {
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a32',
    backgroundColor: '#121216',
  },
  photoCaption: {
    color: '#9a9aa3',
    fontSize: 11,
    padding: 10,
  },
  photo: {
    width: '100%',
    height: 180,
    backgroundColor: '#000000',
  },
  clearPhoto: {
    padding: 10,
  },
  clearPhotoText: {
    color: '#64d2ff',
    fontSize: 13,
    fontWeight: '600',
  },
  muted: {
    color: '#6b6b6b',
    fontSize: 13,
    marginVertical: 8,
  },
  summary: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#2a2a32',
    marginBottom: 8,
  },
  summaryText: {
    color: '#c8c8d0',
    fontSize: 14,
  },
  summaryBold: {
    color: '#ffffff',
    fontWeight: '700',
  },
  summaryFile: {
    color: '#7a7a82',
    fontSize: 12,
    marginTop: 6,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1f',
    color: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a32',
  },
  searchBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#64d2ff',
    backgroundColor: '#64d2ff18',
  },
  searchBtnLabel: {
    color: '#64d2ff',
    fontSize: 16,
    fontWeight: '600',
  },
  noMatch: {
    color: '#c9a227',
    fontSize: 14,
    marginTop: 14,
  },
});
