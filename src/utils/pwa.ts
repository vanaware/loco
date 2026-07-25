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
let wakeLockSentinel: any = null;

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
  if (caps.viewTransitions && (document as any).startViewTransition) {
    (document as any).startViewTransition(callback);
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

export async function pickContacts(
  properties: ("name" | "tel" | "email" | "icon")[] = ["name", "tel"],
  multiple: boolean = false
): Promise<PickedContact[]> {
  const caps = detectCapabilities();
  if (!caps.contactPicker) return [];
  try {
    return await (navigator as any).contacts.select(properties, { multiple });
  } catch (e) {
    console.warn("Contact Picker error:", e);
    return [];
  }
}

// ===== BARCODE DETECTOR =====
export async function scanQRFromCamera(
  videoElement: HTMLVideoElement,
  onDetected: (value: string) => void,
  intervalMs: number = 500
): Promise<() => void> {
  const caps = detectCapabilities();
  if (!caps.barcodeDetector) return () => {};

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  videoElement.srcObject = stream;
  await videoElement.play();

  const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
  
  const timer = setInterval(async () => {
    try {
      const results = await detector.detect(videoElement);
      if (results.length > 0) {
        onDetected(results[0].rawValue);
        stop();
      }
    } catch {}
  }, intervalMs);

  function stop() {
    clearInterval(timer);
    stream.getTracks().forEach(t => t.stop());
    videoElement.srcObject = null;
  }

  return stop;
}

// ===== PICTURE IN PICTURE =====
export async function enterPiP(videoElement: HTMLVideoElement): Promise<boolean> {
  const caps = detectCapabilities();
  if (!caps.pipVideo) return false;
  try {
    await (videoElement as any).requestPictureInPicture();
    return true;
  } catch (e) {
    console.warn("PiP error:", e);
    return false;
  }
}

export function exitPiP() {
  if ((document as any).pictureInPictureElement) {
    (document as any).exitPictureInPicture();
  }
}

// ===== VIRTUAL KEYBOARD =====
export function setupVirtualKeyboard(
  onGeometryChange: (rect: { height: number }) => void
) {
  const caps = detectCapabilities();
  if (!caps.virtualKeyboard) return;
  try {
    (navigator as any).virtualKeyboard.overlaysContent = true;
    (navigator as any).virtualKeyboard.addEventListener(
      "geometrychange",
      (event: any) => onGeometryChange({ height: event.target.boundingRect.height })
    );
  } catch (e) {
    console.warn("VirtualKeyboard error:", e);
  }
}

// ===== BACKGROUND SYNC =====
export async function registerPeriodicSync(
  tag: string,
  minIntervalMs: number = 3600000
): Promise<boolean> {
  const caps = detectCapabilities();
  if (!caps.backgroundSync) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ("periodicSync" in reg) {
      await (reg as any).periodicSync.register(tag, { minInterval: minIntervalMs });
      return true;
    }
  } catch (e) {
    console.warn("Periodic Sync error:", e);
  }
  return false;
}
