import { signal } from "@preact/signals";

export interface SharedData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export const pendingShare = signal<SharedData | null>(null);

export function processIncomingShare() {
  const params = new URLSearchParams(location.search);
  const sharedTitle = params.get("shared_title");
  const sharedText = params.get("shared_text");
  const sharedUrl = params.get("shared_url");

  if (sharedTitle || sharedText || sharedUrl) {
    pendingShare.value = {
      title: sharedTitle || undefined,
      text: sharedText || undefined,
      url: sharedUrl || undefined,
    };
    history.replaceState(null, "", location.pathname);
  }
}
