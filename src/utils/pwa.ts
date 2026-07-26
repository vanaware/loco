import { detectCapabilities } from "./capabilities.ts";

// ===== APP BADGING =====
export function setAppBadge(count?: number) {
  const caps = detectCapabilities();
  if (!caps.appBadging) return;
  try {
    if (count && count > 0) navigator.setAppBadge(count);
    else if (count === 0) navigator.clearAppBadge();
    else navigator.setAppBadge();
  } catch (e) {
    console.warn("App Badging error:", e);
  }
}

// ===== SCREEN WAKE LOCK =====
interface WakeLockSentinel {
  release(): Promise<void>;
}

let wakeLockSentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<boolean> {
  const caps = detectCapabilities();
  if (!caps.screenWakeLock) return false;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    return true;
  } catch (e) {
    console.warn("Wake Lock error:", e);
    return false;
  }
}

export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && wakeLockSentinel) {
      await requestWakeLock();
    }
  });
}

// ===== VIEW TRANSITIONS =====
export function navigateWithTransition(callback: () => void) {
  const caps = detectCapabilities();
  if (caps.viewTransitions && (document as unknown as { startViewTransition?: (cb: () => void) => void }).startViewTransition) {
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(callback);
  } else {
    callback();
  }
}

// ===== CONTACT PICKER =====
export interface PickedContact {
  name: string[];
  tel?: string[];
  email?: string[];
  icon?: Blob;
}

interface ContactsManager {
  select: (
    properties: ("name" | "tel" | "email" | "icon")[],
    options: { multiple: boolean },
  ) => Promise<PickedContact[]>;
}

interface NavigatorWithContacts extends Navigator {
  contacts?: ContactsManager;
}

export async function pickContacts(
  properties: ("name" | "tel" | "email" | "icon")[] = ["name", "tel"],
  multiple: boolean = false,
): Promise<PickedContact[]> {
  const caps = detectCapabilities();
  if (!caps.contactPicker) return [];
  try {
    return await (navigator as NavigatorWithContacts).contacts!.select(
      properties,
      { multiple },
    );
  } catch (e) {
    console.warn("Contact Picker error:", e);
    return [];
  }
}

// ===== BARCODE DETECTOR =====
interface BarcodeDetectorOptions {
  formats: string[];
}

interface BarcodeDetectorResult {
  rawValue: string;
}

type BarcodeDetectorClass = {
  new (options: BarcodeDetectorOptions): BarcodeDetectorClass;
  detect(image: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
};

// BarcodeDetector disponível via globalThis no navegador

export async function scanQRFromCamera(
  videoElement: HTMLVideoElement,
  onDetected: (value: string) => void,
  intervalMs: number = 500,
): Promise<() => void> {
  const _caps = detectCapabilities();
  const BarcodeDetector = (globalThis as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (image: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!BarcodeDetector) return () => {};

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
  });
  videoElement.srcObject = stream;
  await videoElement.play();

  const detector = new BarcodeDetector({
    formats: ["qr_code"],
  });

  const timer = setInterval(async () => {
    try {
      const results = await detector.detect(videoElement);
      if (results.length > 0) {
        onDetected(results[0].rawValue);
        stop();
      }
    } catch { /* ignore */ }
  }, intervalMs);

  function stop() {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    videoElement.srcObject = null;
  }

  return stop;
}

// ===== PICTURE IN PICTURE =====
export async function enterPiP(
  videoElement: HTMLVideoElement,
): Promise<boolean> {
  const caps = detectCapabilities();
  if (!caps.pipVideo) return false;
  try {
    await (videoElement as HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> }).requestPictureInPicture?.();
    return true;
  } catch (e) {
    console.warn("PiP error:", e);
    return false;
  }
}

export function exitPiP() {
  const doc = document as unknown as { pictureInPictureElement?: Element; exitPictureInPicture?: () => Promise<void> };
  if (doc.pictureInPictureElement) {
    doc.exitPictureInPicture?.();
  }
}

// ===== VIRTUAL KEYBOARD =====
interface VirtualKeyboardLike {
  overlaysContent: boolean;
  addEventListener(type: string, listener: (e: { target: { boundingRect: { height: number } } }) => void): void;
}

export function setupVirtualKeyboard(
  onGeometryChange: (rect: { height: number }) => void,
) {
  const caps = detectCapabilities();
  const vk = (navigator as unknown as { virtualKeyboard?: VirtualKeyboardLike }).virtualKeyboard;
  if (!caps.virtualKeyboard || !vk) return;
  try {
    vk.overlaysContent = true;
    vk.addEventListener("geometrychange", (event: { target: { boundingRect: { height: number } } }) => {
      onGeometryChange({ height: event.target.boundingRect.height });
    });
  } catch (e) {
    console.warn("VirtualKeyboard error:", e);
  }
}

// ===== BACKGROUND SYNC =====
export async function registerPeriodicSync(
  tag: string,
  minIntervalMs: number = 3600000,
): Promise<boolean> {
  const caps = detectCapabilities();
  if (!caps.backgroundSync) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const regWithSync = reg as unknown as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> } };
    if (regWithSync.periodicSync) {
      await regWithSync.periodicSync.register(tag, { minInterval: minIntervalMs });
      return true;
    }
  } catch (e) {
    console.warn("Periodic Sync error:", e);
  }
  return false;
}
