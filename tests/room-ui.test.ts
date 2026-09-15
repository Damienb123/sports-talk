import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageHistory } from "../components/rooms/message-history";
import { MessageComposer } from "../components/rooms/message-composer";
import { validateDraft } from "../lib/rooms/composer";
import { authorName, messageTime } from "../lib/rooms/display";

test("message history shows readable authors, chronological content and semantic UTC timestamps", () => {
  const html = renderToStaticMarkup(createElement(MessageHistory, { historyLimited: false, messages: [
    { id: "1", room_id: "room", user_id: "fan", content: "First play", created_at: "2026-10-19T01:32:00Z", author: { username: "courtside_fan" } },
    { id: "2", room_id: "room", user_id: "fan", content: "<img src=x onerror=alert(1)>\nNext play", created_at: "2026-10-19T01:33:00Z", author: { username: "courtside_fan" } },
  ] }));
  assert.ok(html.indexOf("First play") < html.indexOf("Next play"));
  assert.match(html, /courtside_fan/);
  assert.match(html, /dateTime="2026-10-19T01:32:00Z"/);
  assert.match(html, /1:32 AM/);
  assert.match(html, /October 19, 2026/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  assert.equal(messageTime("2026-10-18T20:32:00-05:00"), "1:32 AM");
  assert.equal(authorName(null), "Sports fan");
  assert.equal(authorName({ username: " " }), "Sports fan");
});

test("empty room is inviting without fabricated messages, and composer starts disabled", () => {
  const empty = renderToStaticMarkup(createElement(MessageHistory, { messages: [], historyLimited: false }));
  assert.match(empty, /No messages yet/);
  assert.doesNotMatch(empty, /<article/);
  const composer = renderToStaticMarkup(createElement(MessageComposer, { sendAction: async () => ({ ok: true as const }) }));
  assert.match(composer, /<textarea/);
  assert.match(composer, /for="room-message"/);
  assert.match(composer, /disabled=""/);
  assert.match(composer, /Enter adds a new line/);
});

test("draft validation rejects whitespace/overlength and counts Unicode like PostgreSQL", () => {
  for (const text of ["", " \n\t", "\u00a0\ufeff", "a".repeat(1001)]) assert.equal(validateDraft(text).valid, false);
  assert.equal(validateDraft("A good play.").valid, true);
  assert.equal(validateDraft("🏀".repeat(1000)).valid, true);
  assert.equal(validateDraft("🏀".repeat(1000)).length, 1000);
  assert.equal(validateDraft("🏀".repeat(1001)).valid, false);
});
