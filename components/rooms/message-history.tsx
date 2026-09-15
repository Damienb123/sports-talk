import type { RoomMessage } from "@/lib/rooms/queries";
import { HISTORY_LIMIT } from "@/lib/rooms/queries";
import { authorName, messageDay, messageTime } from "@/lib/rooms/display";

export function MessageHistory({ messages, historyLimited }: { messages: RoomMessage[]; historyLimited: boolean }) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-full flex-col justify-end pb-4">
        <p className="mb-3 text-4xl font-semibold text-muted-foreground" aria-hidden="true">#</p>
        <h2 className="text-xl font-semibold">The conversation starts here</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">No messages yet. This is the place to talk about the game.</p>
      </div>
    );
  }
  return (
    <>
      <ol aria-label="Messages" className="space-y-1">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const day = messageDay(message.created_at);
          const newDay = !previous || messageDay(previous.created_at) !== day;
          const sameAuthor = !newDay && previous.user_id === message.user_id;
          const username = authorName(message.author);
          return (
            <li key={message.id} className="min-w-0">
              {newDay && (
                <div className="mb-5 mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  <span>{day} · UTC</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <article className={`flex min-w-0 gap-3 rounded-lg py-1 ${sameAuthor ? "" : "pt-3"}`}>
                <div aria-hidden="true" className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${sameAuthor ? "invisible" : "bg-secondary text-secondary-foreground"}`}>
                  {Array.from(username).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="break-all text-sm font-semibold">{username}</span>
                    <time dateTime={message.created_at} title={`${day}, ${messageTime(message.created_at)} UTC`} className="shrink-0 text-xs text-muted-foreground">
                      {messageTime(message.created_at)}
                    </time>
                  </header>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.content}</p>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      {historyLimited && <p className="mt-5 text-center text-xs text-muted-foreground">Only the latest {HISTORY_LIMIT} messages are shown.</p>}
    </>
  );
}
