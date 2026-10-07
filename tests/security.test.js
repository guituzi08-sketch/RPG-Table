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
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner_id uuid,unique(bucket_id,name));
 create function storage.foldername(object_name text) returns text[] language sql immutable as $$ select (string_to_array(object_name,'/'))[1:1] $$;
 grant usage on schema storage to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated;
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
  await sql.exec(
    readFileSync(
      new URL("../database/002_character_appearance.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql.exec(
    readFileSync(
      new URL("../database/003_custom_maps.sql", import.meta.url),
      "utf8",
    ).replace(
      /do \$\$\s*begin\s*if not exists\s*\(\s*select 1 from pg_publication_tables[\s\S]*?\$\$;/,
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
  token = await one("select * from public.add_token($1,$2,$3,$4)", [
    room.id,
    "Rafael",
    "#ddb876",
    "feminine",
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
  it("migrates old token coordinates to normalized map positions", async () => {
    expect(gmToken.map_x).toBeCloseTo(4 / 31);
    expect(gmToken.map_y).toBeCloseTo(4 / 23);
  });
  it("persists maps for the room, shares them with members, and keeps tokens on removal", async () => {
    await as(gm);
    await one(
      "insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)",
      ["maps", `${room.id}/test-map.webp`, gm],
    );
    const mapped = await one(
      "select * from public.set_room_map($1,$2,$3,$4,$5)",
      [room.id, `${room.id}/test-map.webp`, "Dungeon.webp", 1600, 900],
    );
    expect(mapped.map_path).toBe(`${room.id}/test-map.webp`);
    expect(mapped.map_width).toBe(1600);
    await as(player);
    expect(
      await one("select map_name from public.rooms where id=$1", [room.id]),
    ).toEqual({ map_name: "Dungeon.webp" });
    expect(
      (await sql.query("select * from storage.objects where bucket_id='maps'")).rows,
    ).toHaveLength(1);
    await as(outsider);
    expect(
      (await sql.query("select * from storage.objects where bucket_id='maps'")).rows,
    ).toHaveLength(0);
    await as(gm);
    const configured = await one(
      "select * from public.set_room_grid($1,$2,$3,$4)",
      [room.id, true, 80, 0.4],
    );
    expect(configured.grid_enabled).toBe(true);
    expect(configured.grid_size).toBe(80);
    const cleared = await one("select * from public.clear_room_map($1)", [room.id]);
    expect(cleared.map_path).toBeNull();
    expect(cleared.grid_enabled).toBe(false);
    expect(
      (await sql.query("select * from public.tokens where room_id=$1", [room.id])).rows,
    ).toHaveLength(2);
  });
  it("restricts map uploads and map mutations to the room owner", async () => {
    await as(player);
    await expect(
      sql.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('maps',$1,$2)",
        [`${room.id}/not-master.png`, player],
      ),
    ).rejects.toThrow();
    await expect(
      one("select * from public.clear_room_map($1)", [room.id]),
    ).rejects.toThrow();
    await as(outsider);
    await expect(
      sql.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('maps',$1,$2)",
        [`${room.id}/outsider.png`, outsider],
      ),
    ).rejects.toThrow();
  });
  it("moves a token using normalized map coordinates", async () => {
    await as(player);
    const moved = await one(
      "select * from public.move_token_on_map($1,$2,$3)",
      [token.id, 0.45, 0.62],
    );
    expect(moved.map_x).toBeCloseTo(0.45);
    expect(moved.map_y).toBeCloseTo(0.62);
    await expect(
      one("select * from public.move_token_on_map($1,$2,$3)", [token.id, 1.1, 0.5]),
    ).rejects.toThrow();
  });
  it("persists the selected silhouette and defaults older RPC calls", async () => {
    expect(token.silhouette).toBe("feminine");
    expect(gmToken.silhouette).toBe("masculine");
    await as(player);
    await expect(
      one("select * from public.add_token($1,$2,$3,$4)", [
        room.id,
        "Inválido",
        "#ffffff",
        "other",
      ]),
    ).rejects.toThrow();
  });
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
