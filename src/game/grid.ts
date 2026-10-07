export const CELL = 64,
  COLS = 32,
  ROWS = 24;
export function snap(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))),
    y: Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))),
  };
}

export function mapPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  gridSize?: number,
) {
  if (width <= 0 || height <= 0) return { x: 0.5, y: 0.5 };
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  let mapX = clamp(x, width);
  let mapY = clamp(y, height);
  if (gridSize && gridSize > 0) {
    mapX = Math.min(width, Math.floor(mapX / gridSize) * gridSize + gridSize / 2);
    mapY = Math.min(height, Math.floor(mapY / gridSize) * gridSize + gridSize / 2);
  }
  return { x: mapX / width, y: mapY / height };
}
