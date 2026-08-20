import "preact";

declare global {
  interface Window {
    ui?: (selector?: string, options?: unknown) => Promise<string> | void;
  }
}

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      page: HTMLAttributes<HTMLElement>;
    }
  }
}