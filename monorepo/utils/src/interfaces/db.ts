// TODO IA: no novo worker-db, "_id" fixo em "profile" para ProfileConfig
 export interface ProfileConfig {
   name: string;
   email: string;
   vapidPublicKey: JsonWebKey;
   vapidPrivateKeyJwk: JsonWebKey;
   vapidPrivateKeyEnvelope: string;
   e2ePublicKey: JsonWebKey;
   e2ePrivateKeyJwk: JsonWebKey;
   subscription: {
     endpoint: string;
     keys: {
       p256dh: string;
       auth: string;
     };
     proxyserver?: string;
   };
   createdAt: number;
   updatedAt: number;
 }
 
 // TODO IA: no novo worker-db, "id" deverá ser "_id" para chat
 export interface Chat {
   id: string;
   contatoHash: string;
   conteudo: string;
   tipo: 'in' | 'out';
   readAt?: number;
   notifiedAt?: number;
   receivedAt?: number;
   sentAt?: number;
   createdAt: number;
   updatedAt?: number;
   errorAt?: number;
   handshake: string;
   // 🔥 ARQUITETURA: Ponteiro opcional para a Pasta/Coleção no OPFS
   metadataId?: string;
 }
 
 export type MeStatus = 'trusted' | 'none' | 'wrong' | 'saved' | 'deleted';
 
 // TODO IA: no novo worker-db, "id" deverá ser "_id" para contato
 export interface Contato {
   id: string;
   email: string;
   name: string;
   vapidPublicKey: JsonWebKey;
   e2ePublicKey: JsonWebKey;
   subscription: {
     endpoint: string;
     keys: { p256dh: string; auth: string };
     proxyserver?: string;
   };
   vapidPrivateKeyEnvelope: string;
   trusted: boolean;
   me: MeStatus;
   createdAt: number;
   updatedAt: number;
 }
 
 // TODO IA: no novo worker-db, função opfs(), usar interface OpfsFileInfo que já tem em db.ts
 // 🔥 ARQUITETURA: Nova Estrutura Baseada em Pastas/Manifestos P2P
 export interface FileMetadata {
   name: string;
   size: number;
   type: string;
   createdAt: number;
   modifiedAt: number;
 }
 
 // TODO IA: no novo worker-db, função opfs(), "id" deverá ser "_id" para pasta meta data
 export interface PastaMetadata {
   id: string;
   name: string;
   magnetURI?: string;
   infoHash?: string;
   status: 'seeding' | 'downloading' | 'standby';
   complete: number;
   permission: 'public' | 'listed' | 'trusted';
   contatos: string[];
   files: FileMetadata[];
   createdAt: number;
   modifiedAt: number;
 }
 
 export interface ProfileRouteData {
   campos?: string[];
   data?: Record<string, unknown>;
   id?: string;
 }
 
 export interface MensagemRouteData {
   recebida?: string;
   enviada?: string;
   conteudo?: string;
   excluida?: string;
   limparHistorico?: boolean;
   campos?: string[];
   data?: Record<string, unknown>;
 }
 
 export interface ContatoRouteData {
   id?: string;
   removerContato?: boolean;
   campos?: string[];
   data?: Record<string, unknown>;
   sync?: Record<string, unknown>;
 }
 
 export interface HandshakeRotas {
   profile?: ProfileRouteData;
   mensagem?: MensagemRouteData;
   contato?: ContatoRouteData;
   [key: string]: unknown;
 }
 
 export type StatusIn = 'recebido' | 'processando' | 'processado' | 'falha';
 export type StatusOut = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
 
 export interface FluxoIn {
   status: StatusIn;
   rotas: HandshakeRotas;
   tentativas: number;
   erro?: string;
 }
 
 export interface FluxoOut {
   status: StatusOut;
   rotas: HandshakeRotas;
   tentativas: number;
   erro?: string;
 }
 
 // TODO IA: no novo worker-db, "id" deverá ser "_id" para handshake
 export interface Handshake {
   id: string;
   aud: string;
   in?: FluxoIn;
   out?: FluxoOut;
   createdAt: number;
   updatedAt: number;
 }
 