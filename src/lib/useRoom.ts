import { useEffect, useState } from "react";
import { db } from "./client";
import type { Member, Roll, Room, RoomMap, Token } from "./types";

export function useRoom(room: Room | null) {
  const [tokens, setTokens] = useState<Token[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [rolls, setRolls] = useState<Roll[]>([]),
    [map, setMap] = useState<RoomMap | null>(null);
  const [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    setTokens([]);
    setMembers([]);
    setRolls([]);
    setMap(null);
    setConnected(false);
    setError("");
    if (!room || !db) return;
    const client = db;
    let active = true,
      loading = false,
      again = false;
    let cachedMapPath = "";
    let cachedMapUrl = "";
    // Serialize snapshots. A change arriving during a fetch schedules another fetch.
    const refresh = async () => {
      if (loading) {
        again = true;
        return;
      }
      loading = true;
      do {
        again = false;
        const responses = await Promise.all([
          client.from("tokens").select("*").eq("room_id", room.id).order("id"),
          client
            .from("room_members")
            .select("user_id,name,last_seen")
            .eq("room_id", room.id),
          client
            .from("rolls")
            .select("*")
            .eq("room_id", room.id)
            .order("created_at", { ascending: false })
            .limit(60),
          client
            .from("rooms")
            .select("map_path,map_name,map_width,map_height,grid_enabled,grid_size,grid_opacity")
            .eq("id", room.id)
            .maybeSingle(),
        ]);
        if (!active) break;
        const problem = responses.find((r) => r.error)?.error;
        if (problem) {
          setError(problem.message);
          setConnected(false);
        } else {
          const roomMap = responses[3].data as {
            map_path: string | null;
            map_name: string | null;
            map_width: number | null;
            map_height: number | null;
            grid_enabled: boolean;
            grid_size: number;
            grid_opacity: number;
          } | null;
          let nextMap: RoomMap | null = null;
          if (
            roomMap?.map_path &&
            roomMap.map_name &&
            roomMap.map_width &&
            roomMap.map_height
          ) {
            if (cachedMapPath !== roomMap.map_path || !cachedMapUrl) {
              const signed = await client.storage
                .from("maps")
                .createSignedUrl(roomMap.map_path, 3600);
              if (signed.error) {
                setError(signed.error.message);
                setConnected(false);
                break;
              }
              cachedMapPath = roomMap.map_path;
              cachedMapUrl = signed.data.signedUrl;
            }
            nextMap = {
              path: roomMap.map_path,
              name: roomMap.map_name,
              width: roomMap.map_width,
              height: roomMap.map_height,
              gridEnabled: roomMap.grid_enabled,
              gridSize: roomMap.grid_size,
              gridOpacity: roomMap.grid_opacity,
              imageUrl: cachedMapUrl,
            };
          } else {
            cachedMapPath = "";
            cachedMapUrl = "";
          }
          setTokens(responses[0].data as Token[]);
          setMembers(responses[1].data as Member[]);
          setRolls(responses[2].data as Roll[]);
          setMap(nextMap);
          setError("");
        }
      } while (again && active);
      loading = false;
    };
    const beat = async () => {
      const { error } = await client.rpc("heartbeat", { p_room: room.id });
      if (active && error) setError(error.message);
    };
    const channel = client.channel(`room:${room.id}`);
    for (const table of ["tokens", "rolls", "room_members", "rooms"])
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${table === "rooms" ? "id" : "room_id"}=eq.${room.id}`,
        },
        () => {
          void refresh();
        },
      );
    channel.subscribe((status) => {
      if (!active) return;
      setConnected(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") {
        void refresh();
        void beat();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        setError("Conexão interrompida. Tentando reconectar…");
    });
    const timer = window.setInterval(() => {
      setClock(Date.now());
      void beat();
    }, 20000);
    const focus = () => {
      void refresh();
      void beat();
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      void client.removeChannel(channel);
    };
  }, [room?.id]);
  return {
    tokens,
    members: members.filter((m) => clock - Date.parse(m.last_seen) < 65000),
    rolls,
    map,
    connected,
    error,
  };
}
