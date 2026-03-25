/** Lightweight i18n module — localStorage-persisted, event-driven reactivity. */
import type { ReactiveControllerHost, ReactiveController } from "lit";
import { en } from "./i18n/en.js";
import { zhCN } from "./i18n/zh-CN.js";

export type Locale = "en" | "zh-CN";

const LOCALE_KEY = "acaclaw-locale";
const dictionaries: Record<Locale, Record<string, string>> = { en, "zh-CN": zhCN };

let _locale: Locale = (localStorage.getItem(LOCALE_KEY) as Locale) ?? "en";
let _dict: Record<string, string> = dictionaries[_locale] ?? dictionaries.en;

export function getLocale(): Locale {
  return _locale;
}

export function setLocale(locale: Locale) {
  _locale = locale;
  _dict = dictionaries[locale] ?? dictionaries.en;
  localStorage.setItem(LOCALE_KEY, locale);
  document.dispatchEvent(new CustomEvent("locale-changed", { detail: locale }));
}

/** Translate a key. Use `{0}`, `{1}`, … for positional args. */
export function t(key: string, ...args: (string | number)[]): string {
  let str = _dict[key] ?? dictionaries.en[key] ?? key;
  for (let i = 0; i < args.length; i++) {
    str = str.replace(`{${i}}`, String(args[i]));
  }
  return str;
}

/** Lit reactive controller — triggers host re-render on locale change. */
export class LocaleController implements ReactiveController {
  private _host: ReactiveControllerHost;
  private _handler = () => { this._host.requestUpdate(); };
  constructor(host: ReactiveControllerHost) {
    this._host = host;
    host.addController(this);
  }
  hostConnected() { document.addEventListener("locale-changed", this._handler); }
  hostDisconnected() { document.removeEventListener("locale-changed", this._handler); }
}
