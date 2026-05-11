import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';

export type SpeechWebBridgeHandle = {
  start: () => void;
};

type Props = {
  onTranscript: (text: string) => void;
  onSpeechError: (code: string) => void;
  onSessionEnd: () => void;
  onEngineReady?: () => void;
};

const SPEECH_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
<script>
(function () {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    window.__expoSpeechAvailable = false;
    return;
  }
  window.__expoSpeechAvailable = true;
  var active = null;
  window.__startExpoSpeech = function () {
    try {
      if (active) {
        try { active.abort(); } catch (e) {}
        active = null;
      }
      var rec = new SpeechRecognition();
      active = rec;
      rec.lang = 'es-MX';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = function (e) {
        var t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'result', transcript: t }));
        }
      };
      rec.onerror = function (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: (e && e.error) || 'unknown' }));
        }
      };
      rec.onend = function () {
        active = null;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'end' }));
        }
      };
      rec.start();
    } catch (err) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: String(err) }));
      }
    }
  };
})();
</script>
</body>
</html>`;

export const SpeechWebBridge = forwardRef<SpeechWebBridgeHandle, Props>(function SpeechWebBridge(
  { onTranscript, onSpeechError, onSessionEnd, onEngineReady },
  ref,
) {
  const webRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    start: () => {
      const code = `
        (function () {
          try {
            if (!window.__expoSpeechAvailable) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: 'unsupported' }));
              return;
            }
            if (typeof window.__startExpoSpeech === 'function') {
              window.__startExpoSpeech();
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: 'not-ready' }));
            }
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', code: String(e) }));
          }
        })();
        true;
      `;
      webRef.current?.injectJavaScript(code);
    },
  }));

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as { type: string; transcript?: string; code?: string };
        if (data.type === 'result' && typeof data.transcript === 'string') {
          onTranscript(data.transcript);
          return;
        }
        if (data.type === 'error' && data.code) {
          onSpeechError(data.code);
          return;
        }
        if (data.type === 'end') {
          onSessionEnd();
        }
      } catch {
        onSpeechError('parse');
      }
    },
    [onSpeechError, onSessionEnd, onTranscript],
  );

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View
      style={styles.host}
      pointerEvents="none"
      accessibilityElementsHidden={true}
      importantForAccessibility="yes">
      <WebView
        ref={webRef}
        style={styles.web}
        source={{ html: SPEECH_HTML, baseUrl: 'https://localhost' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onLoadEnd={() => onEngineReady?.()}
        javaScriptEnabled
        domStorageEnabled
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        cacheEnabled={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    overflow: 'hidden',
    left: 0,
    top: 0,
  },
  web: {
    width: 1,
    height: 1,
  },
});
