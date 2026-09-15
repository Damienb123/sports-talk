"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { validateDraft, MESSAGE_MAX_LENGTH, SEND_FAILURE, type SendResult } from "@/lib/rooms/composer";

export function MessageComposer({ sendAction }: { sendAction: (content: string) => Promise<SendResult> }) {
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [sendError, setSendError] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const draft = validateDraft(content);
  const showError = content.length > 0 && !!draft.error;

  return (
    <form
      className="shrink-0 border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (inFlight.current || pending || !draft.valid) return;
        inFlight.current = true;
        setSendError(""); setNotice("");
        startTransition(async () => {
          try {
            const result = await sendAction(content);
            if (result.ok) { setContent(""); setNotice("Message sent."); }
            else setSendError(result.error);
          } catch { setSendError(SEND_FAILURE); }
          finally { inFlight.current = false; input.current?.focus(); }
        });
      }}
    >
      <label htmlFor="room-message" className="mb-2 block text-sm font-medium">Message this game room</label>
      <div className="flex items-end gap-2 rounded-xl border bg-muted/30 p-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <textarea
          ref={input}
          readOnly={pending}
          id="room-message"
          name="message"
          rows={2}
          value={content}
          onChange={(event) => { setContent(event.target.value); setNotice(""); setSendError(""); }}
          placeholder="What did you think of that play?"
          aria-describedby="composer-help composer-count composer-error"
          aria-invalid={showError}
          className="max-h-32 min-h-12 min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-base leading-6 outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" disabled={pending || !draft.valid} className="shrink-0">{pending ? "Sending..." : "Send"}</Button>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <p id="composer-help">Enter adds a new line. Use Send to post.</p>
        <p id="composer-count" className="shrink-0 tabular-nums">{draft.length.toLocaleString("en-US")} / {MESSAGE_MAX_LENGTH.toLocaleString("en-US")}</p>
      </div>
      <p id="composer-error" role={showError ? "alert" : undefined} className="mt-1 text-sm font-medium">
        {showError ? draft.error : null}
      </p>
      {notice && <p role="status" className="mt-1 text-sm">{notice}</p>}
      {sendError && <p role="alert" className="mt-1 text-sm">{sendError}</p>}
    </form>
  );
}
