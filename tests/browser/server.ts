// Test-only HTTP boundary. Never uses hosted Supabase or changes environment files.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRoomDatabase, fixtureAuthorIds } from "../helpers/room-database";

async function main() {
  const db = await createRoomDatabase();
  const user = { id: fixtureAuthorIds[0], aud: "authenticated", email: "fan@example.test", app_metadata: { provider: "email" }, user_metadata: { username: "courtside_fan" }, created_at: "2026-09-09T00:00:00Z" };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp, aud: user.aud })}.${Buffer.from("test-signature").toString("base64url")}`;
  const userB = { ...user, id: fixtureAuthorIds[1], email: "fanb@example.test", user_metadata: { username: "knicks_fan" } };
  const tokenB = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userB.id, exp, aud: userB.aud })}.${Buffer.from("test-signature").toString("base64url")}`;
  let mode = "normal";
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3101");
    res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,accept-profile,x-retry-count,x-client-info,x-supabase-api-version");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    const send = (data: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (req.method === "OPTIONS") { res.end(); return; }
    const url = new URL(req.url!, "http://localhost:55331");
    try {
      if (url.pathname === "/mode") { mode = url.searchParams.get("value") ?? "normal"; send({}); return; }
      if (url.pathname === "/test-room") {
        send((await db.query("insert into games (league_id,home_team_id,away_team_id,starts_at) select league_id,home_team_id,away_team_id,now() from games limit 1 returning id")).rows[0]); return;
      }
      if (url.pathname === "/test-messages") { send((await db.query("select * from messages where content=$1", [url.searchParams.get("content")])).rows); return; }
      if (url.pathname === "/auth/v1/token") {
        let body = ""; for await (const chunk of req) body += chunk;
        const second = JSON.parse(body).email === userB.email;
        send({ user: second ? userB : user, access_token: second ? tokenB : token, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp }); return;
      }
      const currentUser = req.headers.authorization === `Bearer ${tokenB}` ? userB : req.headers.authorization === `Bearer ${token}` ? user : null;
      if (!currentUser) { send({ message: "Unauthorized" }, 401); return; }
      if (url.pathname === "/auth/v1/user") { send(mode === "expired" ? { message: "Expired" } : currentUser, mode === "expired" ? 401 : 200); return; }
      if (url.pathname === "/auth/v1/logout") { send({}); return; }
      if (req.method === "POST" && url.pathname === "/rest/v1/messages") {
        if (mode === "write-error") { send({ code: "42501", message: "Private database detail" }, 403); return; }
        if (mode === "slow") await new Promise(resolve => setTimeout(resolve, 1000));
        let body = ""; for await (const chunk of req) body += chunk;
        const value = JSON.parse(body);
        const rows = await db.transaction(async tx => {
          await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [currentUser.id]);
          await tx.exec("set local role authenticated");
          return (await tx.query("insert into messages (room_id,user_id,content) values ($1,$2,$3) returning id", [value.room_id, value.user_id, value.content])).rows;
        });
        send(rows[0], 201); return;
      }
      if (req.method !== "GET") { send({ message: "Unexpected write" }, 405); return; }
      if (url.pathname === "/rest/v1/profiles") { send({ username: "courtside_fan" }); return; }
      if (url.pathname === "/rest/v1/games") {
        const id = url.searchParams.get("id")?.replace(/^eq\./, "");
        const result = await db.query<{ game: Record<string, unknown> }>(`select json_build_object('id',g.id,'starts_at',g.starts_at,'status',g.status,'home_score',g.home_score,'away_score',g.away_score,'league',row_to_json(l),'home_team',row_to_json(h),'away_team',row_to_json(a),'room',json_build_object('id',r.id)) as game from games g join leagues l on l.id=g.league_id join teams h on h.id=g.home_team_id join teams a on a.id=g.away_team_id join game_rooms r on r.game_id=g.id where ($1::uuid is null or g.id=$1::uuid) order by g.starts_at,g.id`, [id ?? null]);
        send(result.rows.map(({ game }) => mode === "missing-room" ? { ...game, room: null } : game)); return;
      }
      if (url.pathname === "/rest/v1/messages") {
        if (mode === "error") { send({ message: "Private database detail" }, 500); return; }
        const result = await db.query<Record<string, unknown>>(`select m.*,json_build_object('username',p.username) as author from messages m join profiles p on p.id=m.user_id where room_id=$1 and ($3::uuid is null or m.id=$3::uuid) order by created_at desc,id desc limit $2`, [url.searchParams.get("room_id")!.replace(/^eq\./, ""), Number(url.searchParams.get("limit") ?? 101), url.searchParams.get("id")?.slice(3) ?? null]);
        send(mode === "long" ? Array.from({ length: 101 }, (_, i) => ({ ...result.rows[i % result.rows.length], id: String(i), content: `Message ${i} ${"longword".repeat(100)}` })) : result.rows); return;
      }
      send({ message: "Unknown endpoint" }, 404);
    } catch (error) { console.error(error); send({ message: "Fixture server failure" }, 500); }
  });
  await new Promise<void>(resolve => server.listen(55331, "127.0.0.1", resolve));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3101"], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, SPORTS_TALK_BROWSER_TEST: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55331", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key" },
  });
  const stop = () => { child.kill(); server.close(); void db.close(); };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  child.on("exit", code => { server.close(); void db.close(); process.exitCode = code ?? 0; });
}
void main();
