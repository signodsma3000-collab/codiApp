import { Ionicons } from '@expo/vector-icons';
import { Barcode } from 'expo-barcode-generator';
import { Audio } from 'expo-av';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { SpeechWebBridgeHandle } from '@/components/SpeechWebBridge';
import { SpeechWebBridge } from '@/components/SpeechWebBridge';
import { buildBarcodeValue } from '@/lib/codiBarcode';
import { normalizeVoiceToLocation } from '@/lib/normalizeVoiceLocation';

async function ensureMicrophoneAccess(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const { granted, status } = await Audio.requestPermissionsAsync();
  return granted === true || status === 'granted';
}

function speechErrorMessage(code: string): string {
  const map: Record<string, string> = {
    'not-allowed': 'El micrófono no está permitido. Revisa los ajustes del dispositivo.',
    'audio-capture': 'No se pudo acceder al micrófono.',
    unsupported:
      'En muchos Android el micrófono por voz dentro de la app no está disponible (WebView). Escribe la ubicación o usa la ventana flotante, que usa el reconocimiento nativo.',
    'not-ready': 'El reconocimiento de voz aún no está listo. Inténtalo de nuevo.',
    network: 'Error de red en el reconocimiento de voz.',
    parse: 'No se pudo procesar la respuesta del reconocimiento de voz.',
  };
  return map[code] ?? `No se pudo transcribir la voz (${code}).`;
}

type WebSpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type WebSpeechWindow = Window & {
  SpeechRecognition?: WebSpeechCtor;
  webkitSpeechRecognition?: WebSpeechCtor;
};

export type CodiPanelProps = {
  title?: string;
  compact?: boolean;
};

export function CodiPanel({ title, compact = false }: CodiPanelProps) {
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [generatedValue, setGeneratedValue] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const speechBridgeRef = useRef<SpeechWebBridgeHandle>(null);
  const speechEngineReady = useRef(false);

  const handleGenerate = () => {
    const trimmed = warehouseLocation.trim();
    if (trimmed.length === 0) {
      return;
    }
    Keyboard.dismiss();
    setGeneratedValue(buildBarcodeValue(warehouseLocation));
  };

  const applyVoiceTranscript = useCallback((raw: string) => {
    const normalized = normalizeVoiceToLocation(raw);
    if (normalized.length === 0) {
      return;
    }
    setWarehouseLocation(normalized);
    Keyboard.dismiss();
    setGeneratedValue(buildBarcodeValue(normalized));
  }, []);

  const finishListening = useCallback(() => {
    setListening(false);
  }, []);

  const reportSpeechError = useCallback((code: string) => {
    if (code === 'aborted' || code === 'no-speech') {
      return;
    }
    Alert.alert('Dictado', speechErrorMessage(code));
  }, []);

  const startWebRecognition = useCallback(() => {
    if (typeof window === 'undefined') {
      finishListening();
      return;
    }
    const w = window as WebSpeechWindow;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      finishListening();
      Alert.alert('Dictado', 'Tu navegador no admite reconocimiento de voz.');
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = 'es-MX';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        applyVoiceTranscript(transcript);
      };
      rec.onerror = (event) => {
        reportSpeechError(event.error ?? 'unknown');
      };
      rec.onend = () => {
        finishListening();
      };
      rec.start();
    } catch {
      finishListening();
      Alert.alert('Dictado', 'No se pudo iniciar el reconocimiento de voz.');
    }
  }, [applyVoiceTranscript, finishListening, reportSpeechError]);

  const handleMicPress = useCallback(async () => {
    if (listening) {
      return;
    }
    const allowed = await ensureMicrophoneAccess();
    if (!allowed) {
      Alert.alert(
        'Permiso de micrófono',
        'CODI APP necesita acceso al micrófono para dictar la ubicación. Activa el permiso en los ajustes del dispositivo.',
      );
      return;
    }
    setListening(true);
    if (Platform.OS === 'web') {
      startWebRecognition();
      return;
    }
    if (!speechEngineReady.current) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    speechBridgeRef.current?.start();
  }, [listening, startWebRecognition]);

  const onBridgeTranscript = useCallback(
    (text: string) => {
      applyVoiceTranscript(text);
    },
    [applyVoiceTranscript],
  );

  const onBridgeSpeechError = useCallback(
    (code: string) => {
      reportSpeechError(code);
      finishListening();
    },
    [finishListening, reportSpeechError],
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <SpeechWebBridge
        ref={speechBridgeRef}
        onEngineReady={() => {
          speechEngineReady.current = true;
        }}
        onTranscript={onBridgeTranscript}
        onSpeechError={onBridgeSpeechError}
        onSessionEnd={finishListening}
      />

      {title ? <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={warehouseLocation}
          onChangeText={setWarehouseLocation}
          placeholder="Ubicación"
          placeholderTextColor="#6b6b6b"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Pressable
          style={({ pressed }) => [
            styles.micButton,
            pressed && styles.micButtonPressed,
            listening && styles.micButtonActive,
          ]}
          onPress={handleMicPress}
          disabled={listening}
          accessibilityRole="button"
          accessibilityLabel="Dictado por voz"
          accessibilityState={{ busy: listening }}>
          {listening ? (
            <ActivityIndicator color="#64d2ff" size="small" />
          ) : (
            <Ionicons name="mic-outline" size={24} color="#ffffff" />
          )}
        </Pressable>
      </View>

      <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={handleGenerate}>
        <Text style={styles.buttonLabel}>Generar Código</Text>
      </Pressable>

      <View style={[styles.barcodePreview, compact && styles.barcodePreviewCompact]} accessibilityLabel="Vista previa del código">
        {generatedValue != null ? (
          <>
            <Text style={styles.previewSubtitle}>Código generado</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.barcodeScrollInner}>
              <Barcode
                value={generatedValue}
                options={{
                  format: 'CODE128',
                  displayValue: false,
                  background: '#ffffff',
                  lineColor: '#000000',
                  width: 2,
                  height: 96,
                  marginTop: 12,
                  marginBottom: 12,
                  marginLeft: 12,
                  marginRight: 12,
                }}
              />
            </ScrollView>
            <Text style={styles.generatedLabel} selectable>
              {generatedValue}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  containerCompact: {
    paddingHorizontal: 0,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 36,
  },
  titleCompact: {
    fontSize: 18,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#1a1a1f',
    color: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a32',
  },
  micButton: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  micButtonPressed: {
    backgroundColor: '#ffffff14',
  },
  micButtonActive: {
    borderColor: '#64d2ff',
  },
  button: {
    width: '100%',
    marginTop: 16,
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  buttonPressed: {
    backgroundColor: '#ffffff14',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  barcodePreview: {
    width: '100%',
    minHeight: 140,
    marginTop: 28,
    borderRadius: 14,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#2a2a32',
    overflow: 'hidden',
  },
  barcodePreviewCompact: {
    marginTop: 14,
    minHeight: 120,
  },
  barcodeScrollInner: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSubtitle: {
    color: '#9a9aa3',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
    paddingTop: 14,
    paddingBottom: 6,
    letterSpacing: 0.4,
  },
  generatedLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 2,
    letterSpacing: 0.3,
  },
});

