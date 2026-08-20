// Extensão de tipos JSX para Preact para reconhecer Custom Elements do BeerCSS v5
import "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "ui-button": any;
      "ui-icon": any;
      "ui-field": any;
      "ui-badge": any;
      "ui-list": any;
      "ui-item": any;
      "ui-nav": any;
    }
  }
}