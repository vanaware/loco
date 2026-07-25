import { JSX } from "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      // Buttons
      "md-filled-button": any;
      "md-outlined-button": any;
      "md-text-button": any;
      "md-filled-tonal-button": any;
      "md-icon-button": any;
      "md-fab": any;
      "md-extended-fab": any;

      // Cards
      "md-elevated-card": any;
      "md-filled-card": any;
      "md-outlined-card": any;

      // Text Fields
      "md-filled-text-field": any;
      "md-outlined-text-field": any;

      // Selection Controls
      "md-checkbox": any;
      "md-radio": any;
      "md-switch": any;

      // Lists
      "md-list": any;
      "md-list-item": any;
      "md-divider": any;

      // Menus
      "md-menu": any;
      "md-menu-item": any;

      // Dialogs
      "md-dialog": any;

      // Chips
      "md-assist-chip": any;
      "md-filter-chip": any;
      "md-input-chip": any;
      "md-suggestion-chip": any;

      // Progress
      "md-circular-progress": any;
      "md-linear-progress": any;

      // Icons
      "md-icon": any;

      // Tabs
      "md-tabs": any;
      "md-primary-tab": any;
      "md-secondary-tab": any;

      // Select
      "md-filled-select": any;
      "md-outlined-select": any;
      "md-select-option": any;
    }
  }
}
