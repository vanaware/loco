export interface PushKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: PushKeys;
}

export interface VapidKeyPair {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

export interface Identity {
  id: string;
  displayName: string;
  subscription: PushSubscription;
  vapidPublicJwk: JsonWebKey;
  vapidPrivateJwk: JsonWebKey;
}

export interface Contact {
  id: string;
  displayName: string;
  subscription: PushSubscription;
  vapidPublicJwk: JsonWebKey;
  vapidPrivateJwk: JsonWebKey;
}

export interface Message {
  text: string;
  fromId: string;
  toId: string;
  timestamp: number;
}

export interface PushPayload {
  title?: string;
  text?: string;
  fromId?: string;
}
