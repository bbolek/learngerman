import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';

/**
 * Lazy access to the scanner's native modules (expo-camera + ML Kit text
 * recognition). Both ship only in store binaries ≥ 1.0.9 — an OTA update
 * can land this JS on older binaries, so every import happens inside a
 * try/catch and callers must handle null ("scanner not available") instead
 * of crashing at module load.
 */

export interface ScannerModules {
  CameraView: typeof import('expo-camera').CameraView;
  requestCameraPermission: () => Promise<boolean>;
  recognize: (imageUri: string) => Promise<TextRecognitionResult>;
}

let cached: ScannerModules | null | undefined;

export function loadScanner(): ScannerModules | null {
  if (cached !== undefined) return cached;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const Camera = require('expo-camera') as typeof import('expo-camera');
    // The ML Kit package only throws when *called* without its native side,
    // so probe the native module directly to detect old binaries.
    const { NativeModules } = require('react-native') as typeof import('react-native');
    if (NativeModules.TextRecognition == null) throw new Error('TextRecognition native module missing');
    const TextRecognition = (
      require('@react-native-ml-kit/text-recognition') as typeof import('@react-native-ml-kit/text-recognition')
    ).default;
    /* eslint-enable @typescript-eslint/no-require-imports */
    cached = {
      CameraView: Camera.CameraView,
      requestCameraPermission: async () => (await Camera.Camera.requestCameraPermissionsAsync()).granted,
      recognize: (uri) => TextRecognition.recognize(uri),
    };
  } catch {
    cached = null;
  }
  return cached;
}

/** Whether this binary can scan — gates the entry points in the UI. */
export function scannerAvailable(): boolean {
  return loadScanner() != null;
}
