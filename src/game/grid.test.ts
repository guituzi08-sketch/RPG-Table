import { describe, expect, it } from "vitest";
import { snap } from "./grid";
describe("Grid coordinates", () => {
  it("snaps a point to the cell containing it", () => {
    expect(snap(9 * 64 + 31, 12 * 64 + 31)).toEqual({ x: 9, y: 12 });
  });
  it("clamps drags outside map bounds", () => {
    expect(snap(-50, 99999)).toEqual({ x: 0, y: 23 });
  });
});
