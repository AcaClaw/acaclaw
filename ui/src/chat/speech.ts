/**
 * Browser-native speech: STT via SpeechRecognition, TTS via SpeechSynthesis.
 */

type SpeechRecognitionEvent = Event & { results: SpeechRecognitionResultList; resultIndex: number };
type SpeechRecognitionErrorEvent = Event & { error: string; message?: string };

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = globalThis as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionCtor | null;
}

export function isSttSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export type SttCallbacks = {
  onTranscript: (text: string, isFinal: boolean) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
};

let activeRecognition: SpeechRecognitionInstance | null = null;

export function startStt(callbacks: SttCallbacks): boolean {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    callbacks.onError?.("Speech recognition is not supported in this browser");
    return false;
  }

  stopStt();

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.addEventListener("start", () => callbacks.onStart?.());

  recognition.addEventListener("result", (event) => {
    const e = event as unknown as SpeechRecognitionEvent;
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (!result?.[0]) continue;
      if (result.isFinal) final += result[0].transcript;
      else interim += result[0].transcript;
    }
    if (final) callbacks.onTranscript(final, true);
    else if (interim) callbacks.onTranscript(interim, false);
  });

  recognition.addEventListener("error", (event) => {
    const e = event as unknown as SpeechRecognitionErrorEvent;
    if (e.error === "aborted" || e.error === "no-speech") return;
    callbacks.onError?.(e.error);
  });

  recognition.addEventListener("end", () => {
    if (activeRecognition === recognition) activeRecognition = null;
    callbacks.onEnd?.();
  });

  activeRecognition = recognition;
  recognition.start();
  return true;
}

export function stopStt(): void {
  if (activeRecognition) {
    const r = activeRecognition;
    activeRecognition = null;
    try { r.stop(); } catch { /* already stopped */ }
  }
}

export function isSttActive(): boolean {
  return activeRecognition !== null;
}

// TTS
export function isTtsSupported(): boolean {
  return "speechSynthesis" in globalThis;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speakText(text: string, opts?: { onEnd?: () => void }): boolean {
  if (!isTtsSupported()) return false;
  stopTts();

  const cleaned = stripMarkdown(text);
  if (!cleaned.trim()) return false;

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.addEventListener("end", () => {
    if (currentUtterance === utterance) currentUtterance = null;
    opts?.onEnd?.();
  });
  utterance.addEventListener("error", () => {
    if (currentUtterance === utterance) currentUtterance = null;
  });

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
  return true;
}

export function stopTts(): void {
  currentUtterance = null;
  if (isTtsSupported()) speechSynthesis.cancel();
}

export function isTtsSpeaking(): boolean {
  return isTtsSupported() && speechSynthesis.speaking;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}(.*?)\*{1,3}/g, "$1")
    .replace(/_{1,3}(.*?)_{1,3}/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
