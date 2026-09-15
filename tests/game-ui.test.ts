import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GameList } from "../components/games/game-list";
import { GameSummaryContent } from "../components/games/game-summary";
import { formatGameTime, GAME_STATUS_LABELS, teamName } from "../lib/games/display";
import type { GameSummary } from "../lib/games/queries";

const game: GameSummary = {
  id: "30000000-0000-4000-8000-000000000001", starts_at: "2026-10-20T23:00:00Z",
  status: "scheduled", home_score: null, away_score: null,
  league: { name: "National Basketball Association", abbreviation: "NBA" },
  home_team: { name: "Lakers", city: "Los Angeles", abbreviation: "LAL" },
  away_team: { name: "Warriors", city: "Golden State", abbreviation: "GSW" },
};

test("game cards show home/away teams, time, status and a keyboard-accessible detail link", () => {
  const html = renderToStaticMarkup(createElement(GameList, { games: [game] }));
  assert.match(html, new RegExp(`href="/games/${game.id}"`));
  assert.match(html, /View Golden State Warriors at Los Angeles Lakers/);
  assert.match(html, />Away</);
  assert.match(html, />Home</);
  assert.match(html, /Golden State Warriors/);
  assert.match(html, /Los Angeles Lakers/);
  assert.match(html, />Scheduled</);
  assert.match(html, /dateTime="2026-10-20T23:00:00Z"/);
  assert.match(html, /Oct 20, 2026, 11:00 PM UTC/);
  assert.doesNotMatch(html, /score:/);
});

test("detail content renders all supported statuses and scores, including zero", () => {
  for (const status of Object.keys(GAME_STATUS_LABELS) as (keyof typeof GAME_STATUS_LABELS)[]) {
    const html = renderToStaticMarkup(createElement(GameSummaryContent, {
      game: { ...game, status, home_score: 0, away_score: 7 },
    }));
    assert.ok(html.includes(GAME_STATUS_LABELS[status]));
    assert.match(html, /Home score: 0/);
    assert.match(html, /Away score: 7/);
  }
});

test("partial scores remain visible without inventing a missing score", () => {
  const html = renderToStaticMarkup(createElement(GameSummaryContent, { game: { ...game, home_score: 0 } }));
  assert.match(html, /Home score: 0/);
  assert.doesNotMatch(html, /Away score:/);
});

test("empty games list has a useful empty state", () => {
  const html = renderToStaticMarkup(createElement(GameList, { games: [] }));
  assert.match(html, /No games yet/);
  assert.doesNotMatch(html, /href="\/games\//);
});

test("UTC formatting preserves the instant across date boundaries and explicit offsets", () => {
  assert.equal(formatGameTime("2026-10-20T23:00:00Z"), formatGameTime("2026-10-20T18:00:00-05:00"));
  assert.equal(formatGameTime("2026-10-20T23:30:00-05:00"), "Oct 21, 2026, 4:30 AM UTC");
  assert.equal(teamName({ name: "Celtics", city: null }), "Celtics");
});
