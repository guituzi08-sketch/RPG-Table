import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createMiniature, miniatureVariant, type MiniatureAppearance } from "./miniature";

const appearance: MiniatureAppearance = {
  name: "Gabriel",
  color: "#934640",
  silhouette: "masculine",
};

describe("RPG miniature renderer", () => {
  it("builds independent shadow, oval base, and layered figure objects", () => {
    const miniature = createMiniature(appearance);
    expect(miniature).toBeInstanceOf(Container);
    expect(miniature.children).toHaveLength(3);
    expect(miniature.children[0]).toBeInstanceOf(Graphics);
    expect(miniature.children[1]).toBeInstanceOf(Graphics);
    expect(miniature.children[2]).toBeInstanceOf(Container);
    expect(miniature.children[2].children.length).toBeGreaterThanOrEqual(9);
  });

  it("changes the figure silhouette and derives stable detail variations", () => {
    const masculine = createMiniature(appearance);
    const feminine = createMiniature({
      ...appearance,
      silhouette: "feminine",
    });
    const masculineBounds = masculine.children[2].getLocalBounds();
    const feminineBounds = feminine.children[2].getLocalBounds();
    expect(masculineBounds.width).not.toBe(feminineBounds.width);
    expect(miniatureVariant(appearance)).toBe(miniatureVariant(appearance));
    const variants = new Set(
      ["Gabriel", "Liora", "Tarin", "Mira", "Eldrin", "Sora"].map((name) =>
        miniatureVariant({ ...appearance, name }),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it("shows the shared nameplate more strongly when selected", () => {
    const idle = createMiniature(appearance, { showName: true });
    const selected = createMiniature(appearance, { showName: true, selected: true });
    expect(idle.children).toHaveLength(4);
    expect(selected.children[3].alpha).toBeGreaterThan(idle.children[3].alpha);
  });
});