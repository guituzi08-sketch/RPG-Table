import { Container, Graphics, Text } from "pixi.js";
import type { TokenSilhouette } from "../lib/types";

export type MiniatureAppearance = {
  name: string;
  color: string;
  silhouette: TokenSilhouette;
};

type Options = {
  scale?: number;
  showName?: boolean;
  selected?: boolean;
};

function shade(hex: string, amount: number) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : 0xc8a45e;
  const channel = (shift: number) => {
    const source = (value >> shift) & 0xff;
    const target = amount < 0 ? 24 : 255;
    return Math.round(source + (target - source) * Math.abs(amount));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function miniatureVariant(appearance: MiniatureAppearance) {
  const seed = `${appearance.name.trim().toLocaleLowerCase()}|${appearance.color.toLowerCase()}|${appearance.silhouette}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++)
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return (hash >>> 0) % 4;
}

export function createMiniature(appearance: MiniatureAppearance, options: Options = {}) {
  const scale = options.scale ?? 1;
  const variant = miniatureVariant(appearance);
  const outfit = shade(appearance.color, variant === 1 ? -0.12 : 0);
  const outfitShadow = shade(appearance.color, -0.34);
  const outfitLight = shade(appearance.color, 0.3);
  const skin = [0xc59878, 0xd1a584, 0xb98265, 0xd5ae91][variant];
  const hair = [0x33251f, 0x49332a, 0x272522, 0x5b4030][variant];
  const leather = [0x46352a, 0x51402e, 0x302d29, 0x5c4230][variant];
  const metal = [0xc0a06a, 0xaeb2a5, 0x98704e, 0xb88e67][variant];

  const miniature = new Container();
  miniature.scale.set(scale);

  const shadow = new Graphics();
  shadow
    .ellipse(0, 24, 26, 11)
    .fill({ color: 0x11140f, alpha: 0.12 })
    .ellipse(1, 22, 22, 8)
    .fill({ color: 0x11140f, alpha: 0.2 })
    .ellipse(1, 20, 18, 6)
    .fill({ color: 0x0b0d0a, alpha: 0.3 });

  const base = new Graphics();
  base
    .ellipse(0, 17, 22, 10)
    .fill(0x28221c)
    .stroke({ color: 0x171713, width: 2 })
    .ellipse(0, 14, 22, 10)
    .fill(0x6f5738)
    .stroke({ color: 0x30251b, width: 2 })
    .ellipse(0, 12, 20, 8.7)
    .fill(0x4e5944)
    .stroke({ color: metal, width: 1.4 })
    .ellipse(-0.5, 10.2, 17.5, 7.2)
    .fill(0x535b42)
    .stroke({ color: 0xd6be83, width: 0.8, alpha: 0.75 })
    .ellipse(-5, 7.8, 7, 2.2)
    .fill({ color: 0xffe6ad, alpha: 0.18 })
    .circle(-10, 12, 1.5)
    .fill(0x958569)
    .circle(8, 13.5, 1.8)
    .fill(0x34392d)
    .circle(2, 7.5, 1.1)
    .fill(0xc0a774);

  const figure = new Container();
  const cape = new Graphics();
  cape
    .poly([-6, -11, 6, -11, 8, -4, 7, 5, 4, 11, -5, 11, -8, 3, -8, -5])
    .fill(outfitShadow)
    .stroke({ color: leather, width: 1.2 })
    .moveTo(-5, -7)
    .lineTo(-6, 6)
    .stroke({ color: outfitLight, width: 1, alpha: 0.4 });
  figure.addChild(cape);

  const legs = new Graphics();
  legs
    .roundRect(-6.5, 1, 5.3, 12, 2)
    .fill(leather)
    .stroke({ color: 0x241d18, width: 0.9 })
    .roundRect(1.2, 1, 5.3, 12, 2)
    .fill(leather)
    .stroke({ color: 0x241d18, width: 0.9 })
    .roundRect(-7, 9.2, 6.5, 4.2, 1.8)
    .fill(0x30231b)
    .stroke({ color: metal, width: 0.7 })
    .roundRect(0.6, 9.2, 6.5, 4.2, 1.8)
    .fill(0x30231b)
    .stroke({ color: metal, width: 0.7 })
    .moveTo(-5.5, 3)
    .lineTo(-2.5, 3)
    .moveTo(2.2, 3)
    .lineTo(5.2, 3)
    .stroke({ color: outfitLight, width: 1, alpha: 0.5 });
  figure.addChild(legs);

  const arms = new Graphics();
  const shoulderWidth = appearance.silhouette === "masculine" ? 9 : 7.5;
  arms
    .roundRect(-shoulderWidth - 1.2, -11, 5.3, 14, 2.2)
    .fill(outfitShadow)
    .stroke({ color: leather, width: 0.8 })
    .roundRect(shoulderWidth - 4.1, -11, 5.3, 14, 2.2)
    .fill(outfitShadow)
    .stroke({ color: leather, width: 0.8 })
    .roundRect(-shoulderWidth, -10, 4.2, 11, 2)
    .fill(outfit)
    .stroke({ color: outfitLight, width: 0.7, alpha: 0.65 })
    .roundRect(shoulderWidth - 4.2, -10, 4.2, 11, 2)
    .fill(outfit)
    .stroke({ color: outfitLight, width: 0.7, alpha: 0.65 })
    .roundRect(-shoulderWidth + 0.5, -1, 3.2, 5.6, 1.4)
    .fill(skin)
    .roundRect(shoulderWidth - 3.7, -1, 3.2, 5.6, 1.4)
    .fill(skin);
  figure.addChild(arms);

  const torso = new Graphics();
  const leftShoulder = appearance.silhouette === "masculine" ? -8 : -6.8;
  const rightShoulder = appearance.silhouette === "masculine" ? 8 : 6.8;
  torso
    .poly([leftShoulder, -12, -4.8, -15, 4.8, -15, rightShoulder, -12, 6, -5, 5, 2, 4, 4, -4, 4, -5, 1, -6, -5])
    .fill(outfitShadow)
    .stroke({ color: 0x2b241c, width: 1.5 })
    .poly([leftShoulder + 1.2, -11.5, -4.2, -13.7, 4.2, -13.7, rightShoulder - 1.2, -11.5, 4.7, -5, 4, 1.2, -4, 1.2, -4.7, -5])
    .fill(outfit)
    .stroke({ color: outfitLight, width: 0.9, alpha: 0.76 })
    .moveTo(-2.8, -12)
    .lineTo(0, -6)
    .lineTo(2.8, -12)
    .stroke({ color: metal, width: 1.1, alpha: 0.95 })
    .roundRect(-4.5, 0, 9, 2.8, 1)
    .fill(leather)
    .stroke({ color: metal, width: 0.8 })
    .circle(0, 1.4, 1)
    .fill(0xe1ca93)
    .moveTo(-3, -8)
    .lineTo(-2, -2)
    .stroke({ color: outfitLight, width: 1.1, alpha: 0.55 });
  figure.addChild(torso);

  const neck = new Graphics()
    .roundRect(-2.4, -18, 4.8, 5.5, 1.6)
    .fill(skin)
    .stroke({ color: 0x52382c, width: 0.8 });
  figure.addChild(neck);

  const headBack = new Graphics();
  if (variant === 1) {
    headBack
      .ellipse(0, -22, 7.1, 7.8)
      .fill(hair)
      .stroke({ color: metal, width: 0.8, alpha: 0.8 });
  } else if (variant === 2) {
    headBack
      .ellipse(-5.3, -21, 2.1, 6.4)
      .fill(hair)
      .ellipse(5.3, -21, 2.1, 6.4)
      .fill(hair)
      .circle(7.1, -16, 2.2)
      .fill(metal);
  } else if (variant === 3) {
    headBack
      .ellipse(0, -22, 7.2, 8.1)
      .fill(leather)
      .stroke({ color: metal, width: 1.1 });
  } else {
    headBack.ellipse(0, -21, 6.8, 7.6).fill(hair);
  }
  figure.addChild(headBack);

  const head = new Graphics()
    .ellipse(0, -22, 5.4, 6.2)
    .fill(skin)
    .stroke({ color: 0x493126, width: 1 });
  figure.addChild(head);

  const hairDetail = new Graphics();
  hairDetail
    .ellipse(0, -25.5, 5.3, 3.2)
    .fill(hair)
    .stroke({ color: shade(`#${hair.toString(16).padStart(6, "0")}`, 0.18), width: 0.7 })
    .moveTo(-4.3, -24)
    .quadraticCurveTo(-1.2, -26.4, 1, -23.1)
    .quadraticCurveTo(3.1, -26.6, 4.4, -23.7)
    .stroke({ color: shade(`#${hair.toString(16).padStart(6, "0")}`, 0.28), width: 1.15 });
  if (variant === 2)
    hairDetail
      .moveTo(5.5, -22)
      .lineTo(7.8, -18)
      .lineTo(6.4, -15)
      .stroke({ color: hair, width: 1.7 });
  figure.addChild(hairDetail);

  const accessories = new Graphics();
  if (variant === 0) {
    accessories
      .poly([-9, -10, -6, -14, -4, -9, -6, -6])
      .fill(metal)
      .stroke({ color: leather, width: 0.7 })
      .circle(-6, -10, 1.1)
      .fill(0xf3dda5);
  } else if (variant === 1) {
    accessories
      .moveTo(-5.8, -22)
      .quadraticCurveTo(0, -29.5, 5.8, -22)
      .stroke({ color: metal, width: 1.15 })
      .circle(0, -28, 1.5)
      .fill(0xe0c27e);
  } else if (variant === 2) {
    accessories
      .poly([5.8, -11, 10, -16, 9, -9])
      .fill(outfitLight)
      .stroke({ color: metal, width: 0.8 })
      .circle(7.8, -11, 1)
      .fill(0xf3dda5);
  } else {
    accessories
      .poly([-1, -27, 3, -35, 4, -27])
      .fill(0x8f493d)
      .stroke({ color: metal, width: 0.7 })
      .moveTo(1, -27)
      .lineTo(3, -33)
      .stroke({ color: 0xe4c683, width: 0.7 });
  }
  figure.addChild(accessories);

  const light = new Graphics()
    .ellipse(-2.4, -16.3, 4.6, 1.2)
    .fill({ color: 0xffe9b8, alpha: 0.38 })
    .moveTo(-4.6, -10.5)
    .lineTo(-2.4, -12.3)
    .stroke({ color: 0xfff0ca, width: 1.1, alpha: 0.45 })
    .moveTo(-1.8, 11)
    .lineTo(-1.2, 5)
    .stroke({ color: 0xffe8b0, width: 1, alpha: 0.45 });
  figure.addChild(light);

  miniature.addChild(shadow, base, figure);
  if (options.showName) {
    const label = new Container();
    const nameText = new Text({
      text: appearance.name,
      style: {
        fontFamily: "Georgia",
        fontSize: 11,
        fontWeight: "bold",
        fill: "#f5e8c9",
        stroke: { color: "#201c16", width: 2.5 },
      },
    });
    nameText.anchor.set(0.5);
    const plaqueWidth = Math.max(36, appearance.name.length * 7 + 12);
    const plaque = new Graphics()
      .roundRect(-plaqueWidth / 2, -3, plaqueWidth, 15, 3)
      .fill({ color: 0x171b16, alpha: 0.8 })
      .stroke({ color: 0xc6a66d, width: 0.7, alpha: options.selected ? 0.75 : 0.28 });
    nameText.position.set(0, 4.5);
    label.addChild(plaque, nameText);
    label.position.set(0, -40);
    label.alpha = options.selected ? 1 : 0.56;
    miniature.addChild(label);
  }
  return miniature;
}