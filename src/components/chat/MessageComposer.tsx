import { useId, useRef, type Ref } from "react";
import { Send } from "lucide-react";
import { Button } from "../ui/button";

interface MessageComposerProps {
  ref: Ref<HTMLTextAreaElement>;
  draft: string;
  pending: boolean;
  disabled?: boolean;
  onChange: (draft: string) => void;
  onSubmit: () => void;
}

export function MessageComposer({
  ref,
  draft,
  pending,
  disabled = false,
  onChange,
  onSubmit
}: MessageComposerProps) {
  const id = useId();
  const composing = useRef(false);
  return (
    <form
      className="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && !disabled && draft.trim() && !composing.current)
          onSubmit();
      }}
    >
      <label htmlFor={id}>Message the Agent</label>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        value={draft}
        readOnly={pending || disabled}
        aria-describedby={`${id}-hint`}
        placeholder="Describe what you want to accomplish…"
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            composing.current ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          event.preventDefault();
          if (!pending && !disabled && draft.trim()) onSubmit();
        }}
      />
      <div className="composer-actions">
        <p id={`${id}-hint`}>Enter to send · Shift+Enter for a new line</p>
        <Button type="submit" disabled={pending || disabled || !draft.trim()}>
          <Send aria-hidden="true" />
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
