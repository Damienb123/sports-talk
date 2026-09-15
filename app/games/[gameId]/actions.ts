"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { persistMessage } from "@/lib/rooms/send";
import { SEND_FAILURE, type SendResult } from "@/lib/rooms/composer";

export async function sendMessage(gameId: string, content: string): Promise<SendResult> {
  let result: SendResult;
  try {
    result = await persistMessage(await createClient(), gameId, content);
  } catch {
    return { ok: false, error: SEND_FAILURE };
  }
  // Uncached server history is refreshed only after a confirmed insert.
  if (result.ok) refresh();
  return result;
}
