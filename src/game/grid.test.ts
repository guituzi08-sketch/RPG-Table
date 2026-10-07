import { describe, expect, it } from "vitest";
import { mapPosition, snap } from "./grid";
describe("Grid coordinates", () => {
  it("snaps a point to the cell containing it", () => {
    expect(snap(9 * 64 + 31, 12 * 64 + 31)).toEqual({ x: 9, y: 12 });
  });
  it("clamps drags outside map bounds", () => {
    expect(snap(-50, 99999)).toEqual({ x: 0, y: 23 });
  });
  it("stores map positions independently of image dimensions", () => {
    expect(mapPosition(900, 620, 2000, 1000)).toEqual({ x: 0.45, y: 0.62 });
  });
  it("snaps to optional grid cell centers on portrait and landscape maps", () => {
    expect(mapPosition(149, 155, 2000, 1000, 100)).toEqual({ x: 0.075, y: 0.15 });
    expect(mapPosition(999, 500, 1000, 2000, 100)).toEqual({ x: 0.95, y: 0.275 });
  });
  it("clamps map positions to image edges", () => {
    expect(mapPosition(-15, 1400, 200, 800)).toEqual({ x: 0, y: 1 });
  });
});
