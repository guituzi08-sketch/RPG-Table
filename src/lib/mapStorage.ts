import { db } from "./client";
import type { RoomMap } from "./types";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MAP_PIXELS = 16_777_216;
const MAX_MAP_SIDE = 4096;

export type MapImageDetails = {
  mime: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
};

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => {
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    });
  }

  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("O arquivo não contém uma imagem válida."));
    };
    image.src = url;
  });
}

export async function inspectMapFile(file: File): Promise<MapImageDetails> {
  if (file.size === 0 || file.size > MAX_FILE_BYTES)
    throw new Error("O mapa deve ter até 20 MB.");

  const extension = file.name.split(".").pop()?.toLowerCase();
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  let mime: MapImageDetails["mime"];
  let normalizedExtension: MapImageDetails["extension"];

  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    mime = "image/png";
    normalizedExtension = "png";
  } else if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    mime = "image/jpeg";
    normalizedExtension = "jpg";
  } else if (
    header.length >= 12 &&
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP"
  ) {
    mime = "image/webp";
    normalizedExtension = "webp";
  } else {
    throw new Error("O conteúdo não corresponde a PNG, JPG ou WEBP.");
  }

  const validExtension =
    extension === normalizedExtension ||
    (normalizedExtension === "jpg" && extension === "jpeg");
  if (!validExtension)
    throw new Error("A extensão do arquivo não corresponde ao formato da imagem.");
  if (file.type && file.type !== mime)
    throw new Error("O tipo informado pelo arquivo não corresponde ao seu conteúdo.");

  const { width, height } = await imageDimensions(file);
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_MAP_SIDE ||
    height > MAX_MAP_SIDE ||
    width * height > MAX_MAP_PIXELS
  )
    throw new Error("O mapa deve ter até 4096 px por lado e 16,7 megapixels.");

  return { mime, extension: normalizedExtension, width, height };
}

export async function uploadRoomMap(
  roomId: string,
  file: File,
  details: MapImageDetails,
  previousMap: RoomMap | null,
) {
  if (!db) throw new Error("O Supabase não está conectado.");
  const path = `${roomId}/${crypto.randomUUID()}.${details.extension}`;
  const storage = db.storage.from("maps");
  const upload = await storage.upload(path, file, {
    cacheControl: "3600",
    contentType: details.mime,
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const { error } = await db.rpc("set_room_map", {
    p_room: roomId,
    p_map_path: path,
    p_map_name: file.name,
    p_map_width: details.width,
    p_map_height: details.height,
  });
  if (error) {
    await storage.remove([path]);
    throw error;
  }

  if (previousMap) {
    const removed = await storage.remove([previousMap.path]);
    if (removed.error)
      throw new Error(`Mapa atualizado, mas não foi possível limpar o arquivo anterior: ${removed.error.message}`);
  }
}

export async function removeRoomMap(map: RoomMap, roomId: string) {
  if (!db) throw new Error("O Supabase não está conectado.");
  const { error } = await db.rpc("clear_room_map", { p_room: roomId });
  if (error) throw error;
  const removed = await db.storage.from("maps").remove([map.path]);
  if (removed.error)
    throw new Error(`Mapa removido da sala, mas não foi possível limpar o arquivo: ${removed.error.message}`);
}