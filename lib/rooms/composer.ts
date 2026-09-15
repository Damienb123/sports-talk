export const MESSAGE_MAX_LENGTH = 1000;
export type SendResult = { ok: true } | { ok: false; error: string };
export const SEND_FAILURE = "Unable to confirm sending. Your draft is saved here; check the conversation before trying again.";

export function validateDraft(content: string) {
  const length = Array.from(content).length; // Match PostgreSQL char_length, including emoji.
  const error = !content.trim()
    ? "Write a message before sending."
    : length > MESSAGE_MAX_LENGTH
      ? `Keep your message to ${MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`
      : null;
  return { length, error, valid: error === null };
}
