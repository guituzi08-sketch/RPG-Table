export type Room = {
  id: string;
  code: string;
  title: string;
  owner_id: string;
};
export type Token = {
  id: string;
  room_id: string;
  owner_id: string;
  name: string;
  color: string;
  silhouette: TokenSilhouette;
  x: number;
  y: number;
};
export type TokenSilhouette = "masculine" | "feminine";
export type Member = { user_id: string; name: string; last_seen: string };
export type Roll = {
  id: string;
  player_name: string;
  sides: number;
  modifier: number;
  result: number;
  created_at: string;
};
