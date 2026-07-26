import { JSX as _JSX } from "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      // Buttons
      "md-filled-button": unknown;
      "md-outlined-button": unknown;
      "md-text-button": unknown;
      "md-filled-tonal-button": unknown;
      "md-icon-button": unknown;
      "md-fab": unknown;
      "md-extended-fab": unknown;

      // Cards
      "md-elevated-card": unknown;
      "md-filled-card": unknown;
      "md-outlined-card": unknown;

      // Text Fields
      "md-filled-text-field": unknown;
      "md-outlined-text-field": unknown;

      // Selection Controls
      "md-checkbox": unknown;
      "md-radio": unknown;
      "md-switch": unknown;

      // Lists
      "md-list": unknown;
      "md-list-item": unknown;
      "md-divider": unknown;

      // Menus
      "md-menu": unknown;
      "md-menu-item": unknown;

      // Dialogs
      "md-dialog": unknown;

      // Chips
      "md-assist-chip": unknown;
      "md-filter-chip": unknown;
      "md-input-chip": unknown;
      "md-suggestion-chip": unknown;

      // Progress
      "md-circular-progress": unknown;
      "md-linear-progress": unknown;

      // Icons
      "md-icon": unknown;

      // Tabs
      "md-tabs": unknown;
      "md-primary-tab": unknown;
      "md-secondary-tab": unknown;

      // Select
      "md-filled-select": unknown;
      "md-outlined-select": unknown;
      "md-select-option": unknown;
    }
  }
}
