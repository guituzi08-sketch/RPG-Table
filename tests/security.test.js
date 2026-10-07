import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const sql = new PGlite();
const gm = "00000000-0000-4000-8000-000000000001",
  player = "00000000-0000-4000-8000-000000000002",
  outsider = "00000000-0000-4000-8000-000000000003";
let room, other, token, gmToken;
async function as(id) {
  await sql.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function one(query, params = []) {
  return (await sql.query(query, params)).rows[0];
}
beforeAll(async () => {
  await sql.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon;
 insert into auth.users values('${gm}'),('${player}'),('${outsider}');`);
  // PGlite validates the actual PostgreSQL schema/RPC/RLS logic, but cannot host Supabase Realtime.
  await sql.exec(
    readFileSync(
      new URL("../database/001_initial.sql", import.meta.url),
      "utf8",
    ).replace(
      "alter publication supabase_realtime add table public.tokens,public.rolls,public.room_members;",
      "",
    ),
  );
  await as(gm);
  room = await one("select * from public.create_room($1,$2)", [
    "Valdora",
    "Mestre",
  ]);
  gmToken = await one("select * from public.add_token($1,$2,$3)", [
    room.id,
    "NPC",
    "#ffffff",
  ]);
  await as(player);
  await one("select * from public.join_room($1,$2)", [room.code, "Rafael"]);
  token = await one("select * from public.add_token($1,$2,$3)", [
    room.id,
    "Rafael",
    "#ddb876",
  ]);
  await as(outsider);
  other = await one("select * from public.create_room($1,$2)", [
    "Outra sala",
    "Visitante",
  ]);
}, 30000);
afterAll(async () => {
  await sql.close();
});
describe("Room security and persisted gameplay", () => {
  it("hides all rows in another room", async () => {
    await as(outsider);
    for (const table of ["tokens", "room_members", "rolls"])
      expect(
        (
          await sql.query(`select * from public.${table} where room_id=$1`, [
            room.id,
          ])
        ).rows,
      ).toHaveLength(0);
    expect(
      (await sql.query("select * from public.rooms where id=$1", [room.id]))
        .rows,
    ).toHaveLength(0);
  });
  it("blocks outsiders from mutating tokens or rolling", async () => {
    await as(outsider);
    await expect(
      one("select * from public.move_token($1,9,12)", [token.id]),
    ).rejects.toThrow();
    await expect(
      one("select * from public.add_token($1,$2,$3)", [
        room.id,
        "Intruso",
        "#ffffff",
      ]),
    ).rejects.toThrow();
    await expect(
      one("select * from public.roll_die($1,20,5)", [room.id]),
    ).rejects.toThrow();
  });
  it("persists a player move and makes it readable to the GM", async () => {
    await as(player);
    await one("select * from public.move_token($1,9,12)", [token.id]);
    await as(gm);
    expect(
      await one("select x,y from public.tokens where id=$1", [token.id]),
    ).toEqual({ x: 9, y: 12 });
  });
  it("allows GM movement but blocks movement of another player token", async () => {
    await as(player);
    await expect(
      one("select * from public.move_token($1,9,12)", [gmToken.id]),
    ).rejects.toThrow();
    await as(gm);
    expect(
      (await one("select * from public.move_token($1,10,12)", [token.id])).x,
    ).toBe(10);
  });
  it("rejects out-of-grid moves and invalid dice", async () => {
    await as(player);
    await expect(
      one("select * from public.move_token($1,32,-1)", [token.id]),
    ).rejects.toThrow();
    await expect(
      one("select * from public.roll_die($1,3,0)", [room.id]),
    ).rejects.toThrow();
  });
  it("creates server-side dice with the authenticated member name", async () => {
    await as(player);
    const roll = await one("select * from public.roll_die($1,20,5)", [room.id]);
    expect(roll.player_name).toBe("Rafael");
    expect(roll.result).toBeGreaterThanOrEqual(1);
    expect(roll.result).toBeLessThanOrEqual(20);
    expect(roll.modifier).toBe(5);
    await as(gm);
    expect(
      (
        await sql.query("select * from public.rolls where room_id=$1", [
          room.id,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("blocks direct writes that could change ownership or forge rolls", async () => {
    await as(player);
    await expect(
      sql.query("update public.tokens set owner_id=$1 where id=$2", [
        player,
        gmToken.id,
      ]),
    ).rejects.toThrow();
    await expect(
      sql.query(
        "insert into public.room_members(room_id,user_id,name) values($1,$2,$3)",
        [other.id, player, "Intruso"],
      ),
    ).rejects.toThrow();
    await expect(
      sql.query("update public.rolls set result=20 where room_id=$1", [
        room.id,
      ]),
    ).rejects.toThrow();
  });
  it("denies unauthenticated RPC calls and invalid room codes", async () => {
    await as(player);
    await expect(
      one("select * from public.join_room($1,$2)", ["INVALID", "Rafael"]),
    ).rejects.toThrow();
    await sql.exec("reset role;set role anon;");
    await expect(
      one("select * from public.create_room($1,$2)", ["Bad", "Anon"]),
    ).rejects.toThrow();
  });
});
