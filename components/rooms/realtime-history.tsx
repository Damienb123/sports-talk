"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mergeMessages, subscribeToRoom, type LiveState } from "@/lib/rooms/realtime";
import { HISTORY_LIMIT, type RoomMessage } from "@/lib/rooms/queries";
import { MessageHistory } from "./message-history";
import { HistoryViewport } from "./history-viewport";

export function RealtimeHistory({ roomId, initialMessages, historyLimited }: {
  roomId: string; initialMessages: RoomMessage[]; historyLimited: boolean;
}) {
  const [incoming, setIncoming] = useState<RoomMessage[]>([]);
  const [state, setState] = useState<LiveState>("connecting");
  useEffect(() => {
    try {
      return subscribeToRoom(createClient(), roomId,
        rows => setIncoming(previous => mergeMessages(roomId, previous, rows)), setState);
    } catch { setState("unavailable"); }
  }, [roomId]);
  const messages = mergeMessages(roomId, incoming, initialMessages);
  const limited = historyLimited || messages.length === HISTORY_LIMIT;
  return (
    <>
      {state === "unavailable" && <p role="status" className="shrink-0 border-b px-3 py-1 text-xs text-muted-foreground">Live updates are unavailable. Refresh to load recent messages.</p>}
      <HistoryViewport roomId={roomId} historyVersion={messages.map(row => row.id).join(",")}>
        <MessageHistory messages={messages} historyLimited={limited} />
      </HistoryViewport>
    </>
  );
}
