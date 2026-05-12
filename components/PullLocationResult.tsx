import { StyleSheet, Text, View } from 'react-native';

import { PullBarcodeBlock } from '@/components/PullBarcodeBlock';
import { buildBarcodeValue } from '@/lib/codiBarcode';
import type { PullLocationBundle } from '@/lib/pullTypes';

type PullLocationResultProps = {
  bundle: PullLocationBundle;
};

export function PullLocationResult({ bundle }: PullLocationResultProps) {
  const locBarcode = buildBarcodeValue(bundle.locationDisplay);

  return (
    <View style={styles.card}>
      <Text style={styles.locTitle}>Ubicación</Text>
      <Text style={styles.locValue} selectable>
        {bundle.locationDisplay}
      </Text>
      <PullBarcodeBlock label="Código de barras (ubicación)" value={locBarcode} />

      {bundle.dns.length === 0 ? (
        <Text style={styles.muted}>No hay líneas agrupadas para esta ubicación.</Text>
      ) : (
        bundle.dns.map((dn, i) => (
          <View key={`${dn.dnKey}-${i}`} style={styles.dnBlock}>
            <Text style={styles.dnTitle}>DN</Text>
            <Text style={styles.dnValue} selectable>
              {dn.dnDisplay.trim().length > 0 ? dn.dnDisplay : '—'}
            </Text>
            {dn.dnDisplay.trim().length > 0 ? (
              <PullBarcodeBlock label="Código de barras (DN)" value={buildBarcodeValue(dn.dnDisplay)} />
            ) : (
              <Text style={styles.hint}>Sin DN en la hoja: no se genera código para DN.</Text>
            )}

            {dn.lines.length > 0 ? (
              <View style={styles.linesWrap}>
                <Text style={styles.linesHeader}>Referencia (texto)</Text>
                {dn.lines.map((line, j) => (
                  <View key={j} style={styles.lineRow}>
                    <Text style={styles.lineText}>
                      <Text style={styles.lineKey}>Item: </Text>
                      {line.item.trim().length > 0 ? line.item : '—'}
                    </Text>
                    <Text style={styles.lineText}>
                      <Text style={styles.lineKey}>Box: </Text>
                      {line.box.trim().length > 0 ? line.box : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#121216',
    borderWidth: 1,
    borderColor: '#2a2a32',
    padding: 16,
    marginTop: 16,
  },
  locTitle: {
    color: '#9a9aa3',
    fontSize: 12,
    fontWeight: '600',
  },
  locValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  muted: {
    color: '#6b6b6b',
    fontSize: 13,
    marginTop: 14,
  },
  dnBlock: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2a2a32',
  },
  dnTitle: {
    color: '#64d2ff',
    fontSize: 12,
    fontWeight: '600',
  },
  dnValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  hint: {
    color: '#7a7a82',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  linesWrap: {
    marginTop: 12,
  },
  linesHeader: {
    color: '#9a9aa3',
    fontSize: 11,
    marginBottom: 8,
    fontWeight: '600',
  },
  lineRow: {
    marginBottom: 10,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#3a3a44',
  },
  lineText: {
    color: '#e4e4ea',
    fontSize: 14,
    marginTop: 2,
  },
  lineKey: {
    color: '#9a9aa3',
    fontWeight: '600',
  },
});
