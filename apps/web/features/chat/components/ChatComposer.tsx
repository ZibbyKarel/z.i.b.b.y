import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stack, TextAreaField } from "@zibby/design-system";

export enum ChatComposerTestId {
  Root = "chat-composer",
  Input = "chat-composer-input",
  Send = "chat-composer-send",
}

export interface ChatComposerProps {
  /** Send the composed text. Called only with non-empty, trimmed input. */
  onSend: (text: string) => void;
  /** Disable input + send while a turn is in flight. */
  disabled?: boolean;
  /**
   * Fired whenever the trimmed draft flips between empty and non-empty (including
   * the clear-on-send) — never on every keystroke. Lets a parent (e.g. ChatScreen)
   * derive a "listening" state without owning the draft text itself.
   */
  onDraftChange?: (hasDraft: boolean) => void;
}

/**
 * The chat text input — a textarea as the PRIMARY input plus a Send button. Enter
 * sends (the headline text-first interaction); Shift+Enter inserts a newline. The
 * field clears on send and ignores empty/whitespace-only submissions.
 */
export function ChatComposer({ onSend, disabled, onDraftChange }: ChatComposerProps) {
  const t = useTranslations("chat.composer");
  const [value, setValue] = useState("");
  const hasDraftRef = useRef(false);

  const notifyDraftChange = (text: string) => {
    const hasDraft = text.trim().length > 0;
    if (hasDraft !== hasDraftRef.current) {
      hasDraftRef.current = hasDraft;
      onDraftChange?.(hasDraft);
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    notifyDraftChange("");
  };

  return (
    <Stack align="end" data-testid={ChatComposerTestId.Root} direction="row" gap="100">
      <Stack grow style={{ minWidth: 0 }}>
        <TextAreaField
          autoFocus
          data-testid={ChatComposerTestId.Input}
          disabled={disabled}
          label={t("label")}
          onChange={(e) => {
            setValue(e.target.value);
            notifyDraftChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("placeholder")}
          rows={2}
          value={value}
        />
      </Stack>
      <Button
        data-testid={ChatComposerTestId.Send}
        disabled={disabled || value.trim().length === 0}
        icon="arrow"
        intent="primary"
        onClick={submit}
        size="sm"
      >
        {t("send")}
      </Button>
    </Stack>
  );
}
