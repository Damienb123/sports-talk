"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HistoryViewport({ children, roomId, historyVersion }: { children: ReactNode; roomId: string; historyVersion: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (viewport.current && follow.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [roomId, historyVersion]);

  return (
    <div
      ref={viewport}
      onScroll={() => {
        const node = viewport.current;
        if (node) follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}
      role="region"
      aria-label="Message history"
      tabIndex={0}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
    >
      {children}
    </div>
  );
}
