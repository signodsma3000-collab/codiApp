declare module 'expo-barcode-generator' {
  import type { ReactElement } from 'react';

  export function Barcode(props: {
    value: string;
    options?: Record<string, unknown>;
    rotation?: number;
  }): ReactElement;
}
