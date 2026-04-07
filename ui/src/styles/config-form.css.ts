/**
 * Config form styles — ported from OpenClaw ui/src/styles/config.css (cfg-* classes).
 * CSS variables mapped from OpenClaw's design tokens → AcaClaw's --ac-* tokens.
 *
 * Import in any LitElement that renders config-form.node.ts output:
 *   import { configFormStyles } from "../styles/config-form.css.js";
 *   static override styles = [configFormStyles, css`...`];
 */
import { css } from "lit";

export const configFormStyles = css`
  /* ===========================================
     Section Cards (config-form.render.ts)
     =========================================== */

  .config-form--modern {
    display: grid;
    gap: 14px;
    width: 100%;
    min-width: 0;
  }

  .config-section-card {
    width: 100%;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-lg, 16px);
    background: var(--ac-bg-elevated, #fff);
    overflow: hidden;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
    animation: section-card-enter 0.25s ease-out backwards;
  }

  @keyframes section-card-enter {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .config-section-card:hover {
    border-color: var(--ac-border-strong);
    box-shadow: var(--ac-shadow-sm);
  }

  .config-section-card__header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    border-bottom: 1px solid var(--ac-border);
  }

  .config-section-card__icon {
    width: 30px;
    height: 30px;
    color: var(--ac-primary);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-primary-bg);
    padding: 6px;
  }

  .config-section-card__icon svg {
    width: 100%;
    height: 100%;
  }

  .config-section-card__titles {
    flex: 1;
    min-width: 0;
  }

  .config-section-card__title {
    margin: 0;
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.015em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-section-card__desc {
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--ac-text-muted);
    line-height: 1.45;
  }

  .config-section-card__content {
    padding: 16px 18px;
    min-width: 0;
  }

  /* Staggered entrance */
  .config-form--modern .config-section-card:nth-child(1) { animation-delay: 0ms; }
  .config-form--modern .config-section-card:nth-child(2) { animation-delay: 40ms; }
  .config-form--modern .config-section-card:nth-child(3) { animation-delay: 80ms; }
  .config-form--modern .config-section-card:nth-child(4) { animation-delay: 120ms; }
  .config-form--modern .config-section-card:nth-child(5) { animation-delay: 160ms; }
  .config-form--modern .config-section-card:nth-child(n+6) { animation-delay: 200ms; }

  /* ===========================================
     Form Fields
     =========================================== */

  .cfg-fields {
    display: grid;
    gap: 14px;
  }

  .cfg-fields--inline {
    gap: 10px;
  }

  .cfg-field {
    display: grid;
    gap: 6px;
  }

  .cfg-field--error {
    padding: 14px;
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-error-bg, #fef2f2);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .cfg-field--error .cfg-input,
  .cfg-field--error .cfg-textarea,
  .cfg-field--error .cfg-select,
  .cfg-field--error .cfg-number {
    border-color: transparent;
    box-shadow: none;
  }

  .cfg-field--error .cfg-input:focus,
  .cfg-field--error .cfg-textarea:focus,
  .cfg-field--error .cfg-select:focus {
    border-color: var(--ac-border);
    box-shadow: none;
  }

  .cfg-field__label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ac-text);
    letter-spacing: -0.005em;
  }

  .cfg-field__help {
    font-size: 11.5px;
    color: var(--ac-text-muted);
    line-height: 1.45;
  }

  .cfg-field__error {
    font-size: 12px;
    color: var(--ac-error, #dc2626);
  }

  /* Tags */
  .cfg-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cfg-tag {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--ac-border);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--ac-text-muted);
    background: var(--ac-bg-elevated, #fff);
    white-space: nowrap;
  }

  /* ===========================================
     Text Input
     =========================================== */

  .cfg-input-wrap {
    display: flex;
    gap: 10px;
  }

  .cfg-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    font-size: 13px;
    color: var(--ac-text);
    outline: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease;
  }

  .cfg-input::placeholder {
    color: var(--ac-text-muted);
    opacity: 0.6;
  }

  .cfg-input:hover:not(:focus) {
    border-color: var(--ac-border-strong);
  }

  .cfg-input:focus {
    border-color: var(--ac-primary);
    box-shadow: var(--ac-shadow-focus, 0 0 0 3px rgba(13, 148, 136, 0.15));
    background: var(--ac-bg-hover);
  }

  .cfg-input--sm {
    padding: 6px 10px;
    font-size: 12px;
  }

  .cfg-input__reset {
    padding: 9px 12px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-elevated, #fff);
    color: var(--ac-text-muted);
    font-size: 13px;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .cfg-input__reset:hover:not(:disabled) {
    background: var(--ac-bg-hover);
    color: var(--ac-text);
  }

  .cfg-input__reset:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===========================================
     Textarea
     =========================================== */

  .cfg-textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    font-family: monospace;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ac-text);
    resize: vertical;
    outline: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .cfg-textarea:hover:not(:focus) {
    border-color: var(--ac-border-strong);
  }

  .cfg-textarea:focus {
    border-color: var(--ac-primary);
    box-shadow: var(--ac-shadow-focus, 0 0 0 3px rgba(13, 148, 136, 0.15));
  }

  .cfg-textarea--sm {
    padding: 8px 12px;
    font-size: 12px;
  }

  /* Redacted (click-to-reveal) */
  .cfg-input--redacted,
  .cfg-textarea--redacted {
    cursor: pointer;
    opacity: 0.7;
  }

  /* ===========================================
     Number Input
     =========================================== */

  .cfg-number {
    display: inline-flex;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    overflow: hidden;
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    transition: border-color 0.15s ease;
  }

  .cfg-number:hover {
    border-color: var(--ac-border-strong);
  }

  .cfg-number__btn {
    width: 38px;
    border: none;
    background: var(--ac-bg-elevated, #fff);
    color: var(--ac-text);
    font-size: 16px;
    font-weight: 300;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cfg-number__btn:hover:not(:disabled) {
    background: var(--ac-bg-hover);
  }

  .cfg-number__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cfg-number__input {
    width: 72px;
    padding: 9px;
    border: none;
    border-left: 1px solid var(--ac-border);
    border-right: 1px solid var(--ac-border);
    background: transparent;
    font-size: 13px;
    color: var(--ac-text);
    text-align: center;
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .cfg-number__input::-webkit-outer-spin-button,
  .cfg-number__input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* ===========================================
     Select
     =========================================== */

  .cfg-select {
    padding: 8px 36px 8px 12px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background-color: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    font-size: 13px;
    color: var(--ac-text);
    cursor: pointer;
    outline: none;
    appearance: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .cfg-select:hover:not(:focus) {
    border-color: var(--ac-border-strong);
  }

  .cfg-select:focus {
    border-color: var(--ac-primary);
    box-shadow: var(--ac-shadow-focus, 0 0 0 3px rgba(13, 148, 136, 0.15));
  }

  /* ===========================================
     Segmented Control
     =========================================== */

  .cfg-segmented {
    display: inline-flex;
    padding: 3px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    gap: 1px;
  }

  .cfg-segmented__btn {
    padding: 6px 14px;
    border: none;
    border-radius: calc(var(--ac-radius-md, 12px) - 3px);
    background: transparent;
    color: var(--ac-text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .cfg-segmented__btn:hover:not(:disabled):not(.active) {
    color: var(--ac-text);
    background: var(--ac-bg-hover);
  }

  .cfg-segmented__btn.active {
    background: var(--ac-primary);
    color: white;
    box-shadow: 0 1px 3px var(--ac-primary-bg);
  }

  .cfg-segmented__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===========================================
     Toggle Row (Boolean)
     =========================================== */

  .cfg-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .cfg-toggle-row:hover:not(.disabled) {
    background: var(--ac-bg-hover);
    border-color: var(--ac-border-strong);
  }

  .cfg-toggle-row.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .cfg-toggle-row__content {
    flex: 1;
    min-width: 0;
  }

  .cfg-toggle-row__label {
    display: block;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ac-text);
  }

  .cfg-toggle-row__help {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: var(--ac-text-muted);
    line-height: 1.45;
  }

  /* Toggle Switch */
  .cfg-toggle {
    position: relative;
    flex-shrink: 0;
  }

  .cfg-toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .cfg-toggle__track {
    display: block;
    width: 40px;
    height: 22px;
    background: var(--ac-bg-elevated, #fff);
    border: 1px solid var(--ac-border-strong);
    border-radius: 999px;
    position: relative;
    transition:
      background 0.2s ease-out,
      border-color 0.2s ease-out;
  }

  .cfg-toggle__track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--ac-text);
    border-radius: 999px;
    box-shadow: var(--ac-shadow-sm);
    transition:
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
      background 0.2s ease;
  }

  .cfg-toggle input:checked + .cfg-toggle__track {
    background: var(--ac-success-bg, #ecfdf5);
    border-color: rgba(34, 197, 94, 0.4);
  }

  .cfg-toggle input:checked + .cfg-toggle__track::after {
    transform: translateX(18px);
    background: var(--ac-success, #059669);
  }

  .cfg-toggle input:focus + .cfg-toggle__track {
    box-shadow: var(--ac-shadow-focus, 0 0 0 3px rgba(13, 148, 136, 0.15));
  }

  /* ===========================================
     Object (Collapsible Section)
     =========================================== */

  .cfg-object {
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: transparent;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .cfg-object:hover {
    border-color: var(--ac-border-strong);
  }

  .cfg-object__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    cursor: pointer;
    list-style: none;
    transition: background 0.15s ease;
    border-radius: calc(var(--ac-radius-md, 12px) - 1px);
  }

  .cfg-object__header:hover {
    background: var(--ac-bg-hover);
  }

  .cfg-object__header::-webkit-details-marker {
    display: none;
  }

  .cfg-object__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ac-text);
  }

  .cfg-object__title-wrap {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .cfg-object__chevron {
    width: 18px;
    height: 18px;
    color: var(--ac-text-muted);
    transition: transform 0.2s ease-out;
  }

  .cfg-object__chevron svg {
    width: 100%;
    height: 100%;
  }

  .cfg-object[open] .cfg-object__chevron {
    transform: rotate(180deg);
  }

  .cfg-object__help {
    padding: 0 12px 10px;
    font-size: 12px;
    color: var(--ac-text-muted);
  }

  .cfg-object__content {
    padding: 12px;
    display: grid;
    gap: 12px;
    border-top: 1px solid var(--ac-border);
  }

  /* ===========================================
     Array
     =========================================== */

  .cfg-array {
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-lg, 16px);
    overflow: hidden;
  }

  .cfg-array__header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    border-bottom: 1px solid var(--ac-border);
  }

  .cfg-array__label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ac-text);
  }

  .cfg-array__title {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .cfg-array__count {
    font-size: 12px;
    color: var(--ac-text-muted);
    padding: 4px 10px;
    background: var(--ac-bg-elevated, #fff);
    border-radius: 999px;
  }

  .cfg-array__add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-elevated, #fff);
    color: var(--ac-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cfg-array__add:hover:not(:disabled) {
    background: var(--ac-bg-hover);
  }

  .cfg-array__add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cfg-array__add-icon {
    width: 14px;
    height: 14px;
  }

  .cfg-array__add-icon svg {
    width: 100%;
    height: 100%;
  }

  .cfg-array__help {
    padding: 10px 12px;
    font-size: 12px;
    color: var(--ac-text-muted);
    border-bottom: 1px solid var(--ac-border);
  }

  .cfg-array__empty {
    padding: 36px 18px;
    text-align: center;
    color: var(--ac-text-muted);
    font-size: 13px;
  }

  .cfg-array__items {
    display: grid;
    gap: 1px;
    background: var(--ac-border);
  }

  .cfg-array__item {
    background: var(--ac-bg-surface, #fff);
  }

  .cfg-array__item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    border-bottom: 1px solid var(--ac-border);
  }

  .cfg-array__item-index {
    font-size: 11px;
    font-weight: 600;
    color: var(--ac-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .cfg-array__item-remove {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--ac-radius-md, 12px);
    background: transparent;
    color: var(--ac-text-muted);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .cfg-array__item-remove svg {
    width: 16px;
    height: 16px;
  }

  .cfg-array__item-remove:hover:not(:disabled) {
    background: var(--ac-error-bg, #fef2f2);
    color: var(--ac-error, #dc2626);
  }

  .cfg-array__item-remove:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cfg-array__item-content {
    padding: 12px;
  }

  /* ===========================================
     Map (Custom Entries)
     =========================================== */

  .cfg-map {
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-lg, 16px);
    overflow: hidden;
  }

  .cfg-map__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 12px;
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
    border-bottom: 1px solid var(--ac-border);
  }

  .cfg-map__label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ac-text-muted);
  }

  .cfg-map__add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-elevated, #fff);
    color: var(--ac-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cfg-map__add:hover:not(:disabled) {
    background: var(--ac-bg-hover);
  }

  .cfg-map__add-icon {
    width: 14px;
    height: 14px;
  }

  .cfg-map__add-icon svg {
    width: 100%;
    height: 100%;
  }

  .cfg-map__empty {
    padding: 28px 18px;
    text-align: center;
    color: var(--ac-text-muted);
    font-size: 13px;
  }

  .cfg-map__items {
    display: grid;
    gap: 8px;
    padding: 10px 12px 12px;
  }

  .cfg-map__item {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-inset, var(--ac-bg, #f4f4f5));
  }

  .cfg-map__item-header {
    display: grid;
    grid-template-columns: minmax(0, 300px) auto;
    gap: 8px;
    align-items: center;
  }

  .cfg-map__item-key {
    min-width: 0;
  }

  .cfg-map__item-value {
    min-width: 0;
  }

  .cfg-map__item-value > .cfg-fields {
    gap: 10px;
  }

  .cfg-map__item-remove {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--ac-radius-md, 12px);
    background: transparent;
    color: var(--ac-text-muted);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .cfg-map__item-remove svg {
    width: 16px;
    height: 16px;
  }

  .cfg-map__item-remove:hover:not(:disabled) {
    background: var(--ac-error-bg, #fef2f2);
    color: var(--ac-error, #dc2626);
  }

  /* ===========================================
     Btn icon (sensitive toggle)
     =========================================== */

  .btn--icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius-md, 12px);
    background: var(--ac-bg-elevated, #fff);
    color: var(--ac-text-muted);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .btn--icon:hover:not(:disabled) {
    background: var(--ac-bg-hover);
    color: var(--ac-text);
  }

  .btn--icon.active {
    color: var(--ac-primary);
  }

  .btn--icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn--icon svg {
    width: 16px;
    height: 16px;
  }

  /* ===========================================
     Empty state
     =========================================== */

  .config-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 80px 24px;
    text-align: center;
    animation: fade-in 0.3s ease-out;
  }

  .config-empty__icon {
    font-size: 48px;
    opacity: 0.25;
  }

  .config-empty__text {
    color: var(--ac-text-muted);
    font-size: 14px;
    max-width: 320px;
    line-height: 1.5;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ===========================================
     Mobile
     =========================================== */

  @media (max-width: 768px) {
    .config-section-card__header {
      padding: 14px 16px;
    }

    .config-section-card__content {
      padding: 14px 16px;
    }

    .cfg-toggle-row {
      padding: 12px 14px;
    }

    .cfg-map__item {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .cfg-map__item-header {
      grid-template-columns: 1fr auto;
    }

    .cfg-map__item-remove {
      justify-self: end;
    }
  }

  @media (max-width: 480px) {
    .config-section-card__icon {
      width: 30px;
      height: 30px;
    }

    .config-section-card__title {
      font-size: 16px;
    }

    .cfg-segmented {
      flex-wrap: wrap;
    }

    .cfg-segmented__btn {
      flex: 1 0 auto;
      min-width: 70px;
    }
  }
`;
