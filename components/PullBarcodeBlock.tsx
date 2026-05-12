import { Barcode } from 'expo-barcode-generator';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type PullBarcodeBlockProps = {
  label: string;
  /** Valor completo del código (incluye MX1 002 …). */
  value: string;
};

export function PullBarcodeBlock({ label, value }: PullBarcodeBlockProps) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.barcodeScrollInner}>
        <Barcode
          value={trimmed}
          options={{
            format: 'CODE128',
            displayValue: false,
            background: '#ffffff',
            lineColor: '#000000',
            width: 2,
            height: 72,
            marginTop: 10,
            marginBottom: 10,
            marginLeft: 10,
            marginRight: 10,
          }}
        />
      </ScrollView>
      <Text style={styles.mono} selectable>
        {trimmed}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#2a2a32',
    paddingBottom: 10,
  },
  label: {
    color: '#9a9aa3',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingTop: 10,
    letterSpacing: 0.3,
  },
  barcodeScrollInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  mono: {
    color: '#ffffff',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingTop: 4,
  },
});
