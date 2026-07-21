const modifierCodes = new Set([
  "AltLeft",
  "AltRight",
  "CapsLock",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const namedKeyTokens: Record<string, string> = {
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  Backquote: "Backquote",
  Backslash: "Backslash",
  Backspace: "Backspace",
  BracketLeft: "BracketLeft",
  BracketRight: "BracketRight",
  Comma: "Comma",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Equal: "=",
  Home: "Home",
  Minus: "-",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Period: "Period",
  Quote: "Quote",
  Semicolon: "Semicolon",
  Slash: "Slash",
  Space: "Space",
  Tab: "Tab",
};

const displayTokens: Record<string, string> = {
  Alt: "⌥",
  Backspace: "⌫",
  Command: "⌘",
  Control: "⌃",
  Delete: "⌦",
  Down: "↓",
  Enter: "↩",
  Left: "←",
  PageDown: "PgDn",
  PageUp: "PgUp",
  Right: "→",
  Shift: "⇧",
  Space: "Space",
  Tab: "⇥",
  Up: "↑",
};

const keyTokenFromCode = (code: string) => {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad[0-9]$/.test(code)) {
    return code;
  }
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code;
  }
  return namedKeyTokens[code];
};

export type ShortcutCapture =
  | { kind: "cancelled" }
  | { kind: "incomplete" }
  | { kind: "invalid"; error: string }
  | { kind: "captured"; shortcut: string };

export const captureShortcut = (
  event: Pick<
    KeyboardEvent,
    "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
  >
): ShortcutCapture => {
  if (event.code === "Escape") {
    return { kind: "cancelled" };
  }
  if (modifierCodes.has(event.code)) {
    return { kind: "incomplete" };
  }

  const modifiers = [
    event.metaKey ? "Command" : null,
    event.ctrlKey ? "Control" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
  ].filter((modifier): modifier is string => modifier !== null);

  if (modifiers.length === 0) {
    return {
      kind: "invalid",
      error: "Include at least one modifier key.",
    };
  }

  const key = keyTokenFromCode(event.code);
  if (!key) {
    return {
      kind: "invalid",
      error: "That key cannot be used as a global shortcut.",
    };
  }

  return {
    kind: "captured",
    shortcut: [...modifiers, key].join("+"),
  };
};

export const displayShortcut = (shortcut: string | null) => {
  if (!shortcut) {
    return "Not set";
  }

  return shortcut
    .split("+")
    .map((token) => displayTokens[token] ?? token)
    .join("");
};
