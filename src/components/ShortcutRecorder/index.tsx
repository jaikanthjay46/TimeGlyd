import { useEffect, useId, useRef, useState } from "react";
import {
  captureShortcut,
  displayShortcut,
} from "./shortcut";
import "./ShortcutRecorder.scss";

type Props = {
  value: string | null;
  disabled?: boolean;
  error?: string;
  onChange: (shortcut: string | null) => Promise<void>;
};

const ShortcutRecorder = ({
  value,
  disabled = false,
  error,
  onChange,
}: Props) => {
  const recorderRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const valueId = useId();
  const helpId = useId();
  const errorId = useId();
  const [isRecording, setIsRecording] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [captureError, setCaptureError] = useState<string>();

  useEffect(() => {
    if (isRecording) {
      recorderRef.current?.focus();
    }
  }, [isRecording]);

  const applyShortcut = async (shortcut: string | null) => {
    setIsRecording(false);
    setIsPending(true);
    setCaptureError(undefined);

    try {
      await onChange(shortcut);
    } finally {
      setIsPending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isRecording) {
      return;
    }

    if (
      event.code === "Tab" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      setIsRecording(false);
      setCaptureError(undefined);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const capture = captureShortcut(event.nativeEvent);
    switch (capture.kind) {
      case "cancelled":
        setIsRecording(false);
        setCaptureError(undefined);
        break;
      case "incomplete":
        break;
      case "invalid":
        setCaptureError(capture.error);
        break;
      case "captured":
        void applyShortcut(capture.shortcut);
        break;
    }
  };

  const visibleError = captureError ?? error;
  const isDisabled = disabled || isPending;

  return (
    <div className="shortcut-setting">
      <span id={labelId} className="shortcut-label">
        Keyboard Shortcut
      </span>
      <div className="shortcut-controls">
        <button
          ref={recorderRef}
          type="button"
          className={`shortcut-recorder${
            isRecording ? " recording" : ""
          }`}
          disabled={isDisabled}
          aria-labelledby={`${labelId} ${valueId}`}
          aria-describedby={visibleError ? errorId : helpId}
          onClick={() => {
            setCaptureError(undefined);
            setIsRecording(true);
          }}
          onBlur={() => setIsRecording(false)}
          onKeyDown={handleKeyDown}
        >
          <span id={valueId}>
            {isRecording ? "Press shortcut..." : displayShortcut(value)}
          </span>
        </button>
        {value ? (
          <button
            type="button"
            className="shortcut-clear"
            disabled={isDisabled}
            aria-label="Clear keyboard shortcut"
            onClick={() => void applyShortcut(null)}
          >
            Clear
          </button>
        ) : null}
      </div>
      <span id={helpId} className="shortcut-help">
        Supports Command, Control, Option, Shift, and Hyper combinations.
      </span>
      {visibleError ? (
        <span id={errorId} className="shortcut-error" role="alert">
          {visibleError}
        </span>
      ) : null}
    </div>
  );
};

export default ShortcutRecorder;
