export interface Capabilities {
  opfs: boolean;
  fileSystemAccess: boolean;
  shareTarget: boolean;
  contactPicker: boolean;
  barcodeDetector: boolean;
  declarativePush: boolean;
  appBadging: boolean;
  screenWakeLock: boolean;
  viewTransitions: boolean;
  webCodecs: boolean;
  pipVideo: boolean;
  pipDocument: boolean;
  appShortcuts: boolean;
  virtualKeyboard: boolean;
  backgroundSync: boolean;
  windowControlsOverlay: boolean;
  storagePersist: boolean;
}

let _caps: Capabilities | null = null;

export function detectCapabilities(): Capabilities {
  if (_caps) return _caps;

  _caps = {
    opfs: typeof navigator !== 'undefined' && 
      'storage' in navigator && 
      'getDirectory' in (navigator as any).storage,

    fileSystemAccess: typeof window !== 'undefined' && 
      'showOpenFilePicker' in window,

    shareTarget: typeof window !== 'undefined' && 
      location.search.includes('shared_'),

    contactPicker: typeof navigator !== 'undefined' && 
      'contacts' in navigator && 
      'ContactsManager' in window,

    barcodeDetector: typeof window !== 'undefined' && 
      'BarcodeDetector' in window,

    declarativePush: false,

    appBadging: typeof navigator !== 'undefined' && 
      'setAppBadge' in navigator,

    screenWakeLock: typeof navigator !== 'undefined' && 
      'wakeLock' in navigator,

    viewTransitions: typeof document !== 'undefined' && 
      'startViewTransition' in document,

    webCodecs: typeof window !== 'undefined' && 
      'VideoEncoder' in window && 
      'VideoDecoder' in window,

    pipVideo: typeof document !== 'undefined' && 
      'pictureInPictureEnabled' in document,

    pipDocument: typeof window !== 'undefined' && 
      'documentPictureInPicture' in window,

    appShortcuts: typeof window !== 'undefined' && 
      /Chrome/.test(navigator.userAgent),

    virtualKeyboard: typeof navigator !== 'undefined' && 
      'virtualKeyboard' in navigator,

    backgroundSync: typeof window !== 'undefined' && 
      'SyncManager' in window,

    windowControlsOverlay: typeof navigator !== 'undefined' && 
      'windowControlsOverlay' in navigator,

    storagePersist: typeof navigator !== 'undefined' && 
      'storage' in navigator && 
      'persist' in navigator.storage,
  };

  return _caps;
}

export function logCapabilities() {
  const caps = detectCapabilities();
  console.group("🧪 PWA Capabilities Detection");
  console.table(
    Object.entries(caps).map(([key, val]) => ({
      API: key,
      Supported: val ? '✅' : '❌'
    }))
  );
  console.groupEnd();
}
