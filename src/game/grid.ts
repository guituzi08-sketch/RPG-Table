export const CELL = 64,
  COLS = 32,
  ROWS = 24;
export function snap(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))),
    y: Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))),
  };
}
