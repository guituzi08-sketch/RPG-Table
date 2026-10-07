import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { Token } from "../lib/types";
import { CELL, COLS, ROWS, snap } from "./grid";

type Props = {
  tokens: Token[];
  userId: string;
  ownerId: string;
  disabled: boolean;
  onMove: (id: string, x: number, y: number) => Promise<void>;
};

type CellPosition = { x: number; y: number };

function createMiniature(token: Token) {
  const figure = new Graphics();
  const outfit = token.color;
  const leather = "#493529";
  const skin = "#c39a79";
  const hair = "#35261f";

  if (token.silhouette === "feminine") {
    figure.ellipse(0, -10, 7.5, 11).fill(hair);
    figure
      .ellipse(-4.5, 10, 3.1, 6)
      .fill(leather)
      .ellipse(4.5, 10, 3.1, 6)
      .fill(leather)
      .ellipse(-7, -2, 3.2, 6)
      .fill(outfit)
      .ellipse(7, -2, 3.2, 6)
      .fill(outfit)
      .poly([-4, -8, 4, -8, 6, -3, 5, 2, 10, 11, 0, 16, -10, 11, -5, 2, -6, -3])
      .fill(outfit)
      .stroke({ color: "#e2c78d", width: 1.4, alpha: 0.9 })
      .moveTo(-6, 2)
      .lineTo(6, 2)
      .stroke({ color: "#dbbd7f", width: 2, alpha: 0.9 })
      .ellipse(-8, 4, 2.1, 2.7)
      .fill(skin)
      .ellipse(8, 4, 2.1, 2.7)
      .fill(skin);
  } else {
    figure
      .ellipse(-4, 10, 3.3, 6)
      .fill(leather)
      .ellipse(4, 10, 3.3, 6)
      .fill(leather)
      .ellipse(-8, -2, 3.5, 6)
      .fill(outfit)
      .ellipse(8, -2, 3.5, 6)
      .fill(outfit)
      .poly([-7, -9, -3, -12, 3, -12, 7, -9, 6, -3, 5, 5, 3, 10, -3, 10, -5, 5, -6, -3])
      .fill(outfit)
      .stroke({ color: "#e2c78d", width: 1.4, alpha: 0.9 })
      .moveTo(-5, 2)
      .lineTo(5, 2)
      .stroke({ color: "#dbbd7f", width: 2, alpha: 0.9 })
      .ellipse(-9, 4, 2.2, 2.7)
      .fill(skin)
      .ellipse(9, 4, 2.2, 2.7)
      .fill(skin);
  }

  figure
    .circle(0, -14, 5.4)
    .fill(skin)
    .stroke({ color: "#36271f", width: 1.2 })
    .ellipse(0, -17.2, 5.1, 2.5)
    .fill(hair)
    .moveTo(-2.5, -4)
    .lineTo(-1, -7)
    .stroke({ color: "#fff1ca", width: 1.5, alpha: 0.52 });
  return figure;
}

export default function Board(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const repaint = useRef<() => void>(() => {});
  const reset = useRef<() => void>(() => {});
  const zoomBy = useRef<(factor: number) => void>(() => {});
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [hoverCell, setHoverCell] = useState<CellPosition | null>(null);
  const [selectedName, setSelectedName] = useState("");
  latest.current = props;

  useEffect(() => {
    repaint.current();
  }, [props.tokens, props.disabled]);

  useEffect(() => {
    const app = new Application();
    let disposed = false;
    let initialized = false;
    let cleanup = () => {};

    void (async () => {
      await app.init({
        resizeTo: host.current!,
        background: "#151d19",
        antialias: true,
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
      });
      initialized = true;
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      host.current!.appendChild(app.canvas);

      const world = new Container();
      const ground = new Container();
      const relief = new Container();
      const rivers = new Container();
      const roads = new Container();
      const structures = new Container();
      const grid = new Container();
      const effects = new Graphics();
      const pieces = new Container();
      pieces.sortableChildren = true;
      app.stage.addChild(world);
      world.addChild(ground, relief, rivers, roads, structures, grid, effects, pieces);

      const mapWidth = COLS * CELL;
      const mapHeight = ROWS * CELL;
      ground.addChild(
        new Graphics()
          .rect(0, 0, mapWidth, mapHeight)
          .fill("#53614c")
          .stroke({ color: "#aa9468", width: 18 }),
      );
      ground.addChild(
        new Graphics()
          .poly([0, 0, 1350, 0, 1500, 330, 1270, 610, 1460, 980, 1300, 1536, 0, 1536])
          .fill({ color: "#627050", alpha: 0.52 })
          .poly([1160, 0, 2048, 0, 2048, 1536, 1400, 1536, 1510, 1030, 1350, 650, 1530, 320])
          .fill({ color: "#6d654d", alpha: 0.72 }),
      );

      const addRise = (
        x: number,
        y: number,
        width: number,
        height: number,
        base: string,
        surface: string,
      ) => {
        relief.addChild(
          new Graphics()
            .ellipse(x + 8, y + 15, width, height)
            .fill({ color: "#17231c", alpha: 0.62 })
            .ellipse(x, y + 5, width, height)
            .fill(base)
            .stroke({ color: "#b3a078", width: 3, alpha: 0.56 })
            .ellipse(x, y, width - 8, height - 9)
            .fill(surface)
            .stroke({ color: "#d0bd8b", width: 1, alpha: 0.36 })
            .ellipse(x - width * 0.18, y - height * 0.16, width * 0.43, height * 0.28)
            .fill({ color: "#e0d09b", alpha: 0.11 }),
        );
      };
      addRise(400, 1080, 320, 210, "#4c6347", "#70845a");
      addRise(620, 280, 230, 135, "#4b6047", "#71845b");
      addRise(1510, 940, 350, 230, "#655c45", "#887751");
      addRise(1720, 1280, 290, 170, "#4b6048", "#71815a");
      addRise(1760, 70, 250, 150, "#645943", "#827552");

      const mountains = new Graphics();
      for (let index = 0; index < 7; index++) {
        const x = 1520 + (index % 4) * 125;
        const y = 280 + Math.floor(index / 4) * 118;
        const height = 95 + (index % 3) * 18;
        mountains
          .poly([x - 68, y + 55, x, y - height + 14, x + 77, y + 55])
          .fill({ color: "#27332d", alpha: 0.62 })
          .poly([x - 65, y + 42, x - 3, y - height, x + 73, y + 42])
          .fill("#687064")
          .stroke({ color: "#c0b796", width: 3, alpha: 0.68 })
          .poly([x - 3, y - height, x + 18, y - 42, x + 73, y + 42, x + 10, y + 22])
          .fill({ color: "#414b45", alpha: 0.9 })
          .poly([x - 3, y - height, x - 31, y - 30, x + 9, y - 44])
          .fill({ color: "#d4ceb7", alpha: 0.62 });
      }
      relief.addChild(mountains);

      const trees = new Graphics();
      for (let index = 0; index < 66; index++) {
        const x = 40 + ((index * 137) % 720);
        const y = 885 + ((index * 173) % 600);
        const radius = 18 + (index % 4) * 4;
        trees
          .ellipse(x + 5, y + 12, radius + 3, radius * 0.54)
          .fill({ color: "#17251b", alpha: 0.48 })
          .circle(x, y - 5, radius)
          .fill(index % 3 === 0 ? "#304c35" : "#3d5a3a")
          .stroke({ color: "#83906a", width: 2, alpha: 0.4 })
          .circle(x - radius * 0.25, y - radius * 0.35, radius * 0.52)
          .fill({ color: "#8a9866", alpha: 0.23 });
      }
      relief.addChild(trees);

      const riverPath = (graphics: Graphics, width: number, color: string, alpha = 1) => {
        graphics
          .moveTo(1030, -40)
          .bezierCurveTo(1140, 230, 1160, 390, 1030, 570)
          .bezierCurveTo(890, 760, 800, 850, 930, 1050)
          .bezierCurveTo(1080, 1280, 1030, 1440, 940, 1580)
          .stroke({ color, width, alpha, cap: "round", join: "round" });
      };
      const riverbed = new Graphics();
      riverPath(riverbed, 160, "#18373a");
      riverPath(riverbed, 132, "#315d60");
      riverPath(riverbed, 112, "#47777a");
      riverPath(riverbed, 4, "#a8c1a2", 0.46);
      rivers.addChild(riverbed);
      rivers.addChild(
        new Graphics()
          .ellipse(1190, 1370, 95, 45)
          .fill("#315d60")
          .stroke({ color: "#a3b39a", width: 4, alpha: 0.52 })
          .ellipse(1190, 1363, 67, 16)
          .fill({ color: "#a8c1a2", alpha: 0.25 }),
      );

      roads.addChild(
        new Graphics()
          .moveTo(610, 670)
          .quadraticCurveTo(815, 590, 1008, 652)
          .quadraticCurveTo(1180, 720, 1350, 600)
          .stroke({ color: "#493e2f", width: 45, alpha: 0.72, cap: "round" })
          .moveTo(610, 670)
          .quadraticCurveTo(815, 590, 1008, 652)
          .quadraticCurveTo(1180, 720, 1350, 600)
          .stroke({ color: "#a68a5e", width: 34, alpha: 0.92, cap: "round" })
          .moveTo(630, 664)
          .quadraticCurveTo(815, 590, 1008, 652)
          .quadraticCurveTo(1180, 720, 1350, 600)
          .stroke({ color: "#d0b786", width: 2, alpha: 0.5, cap: "round" }),
      );

      structures.addChild(
        new Graphics()
          .roundRect(880, 624, 228, 52, 9)
          .fill({ color: "#1a2924", alpha: 0.62 })
          .roundRect(875, 612, 224, 42, 7)
          .fill("#684e35")
          .stroke({ color: "#c3a26e", width: 4 })
          .moveTo(890, 619)
          .lineTo(890, 647)
          .moveTo(934, 619)
          .lineTo(934, 647)
          .moveTo(978, 619)
          .lineTo(978, 647)
          .moveTo(1022, 619)
          .lineTo(1022, 647)
          .moveTo(1066, 619)
          .lineTo(1066, 647)
          .stroke({ color: "#d3b57e", width: 3, alpha: 0.78 }),
      );

      structures.addChild(
        new Graphics()
          .roundRect(88, 145, 650, 700, 20)
          .fill({ color: "#1b2821", alpha: 0.54 })
          .roundRect(82, 132, 650, 700, 20)
          .fill({ color: "#807a62", alpha: 0.62 })
          .stroke({ color: "#c3b28c", width: 12, alpha: 0.84 })
          .roundRect(112, 161, 590, 646, 16)
          .stroke({ color: "#d1c398", width: 2, alpha: 0.62 }),
      );
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
          const x = 145 + column * 132;
          const y = 210 + row * 140;
          structures.addChild(
            new Graphics()
              .rect(x + 7, y + 13, 94, 80)
              .fill({ color: "#1d2820", alpha: 0.62 })
              .rect(x, y + 7, 94, 80)
              .fill("#6c6855")
              .stroke({ color: "#c5b68d", width: 3 })
              .poly([x - 8, y + 8, x + 47, y - 23, x + 102, y + 8])
              .fill("#594638")
              .stroke({ color: "#b28d5c", width: 2 })
              .rect(x + 40, y + 49, 18, 38)
              .fill("#302d24")
              .rect(x + 13, y + 30, 15, 18)
              .fill("#a5a276"),
          );
        }
      }

      const ruins = new Graphics();
      ruins
        .roundRect(1336, 186, 416, 386, 15)
        .fill({ color: "#1b241f", alpha: 0.58 })
        .roundRect(1328, 174, 416, 386, 15)
        .fill("#66685b")
        .stroke({ color: "#c0b694", width: 9 })
        .roundRect(1364, 211, 344, 312, 9)
        .fill({ color: "#655e4d", alpha: 0.8 })
        .stroke({ color: "#9d9a7f", width: 5, alpha: 0.72 });
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
          const x = 1390 + column * 98;
          const y = 238 + row * 85;
          ruins
            .rect(x + 5, y + 7, 65, 53)
            .fill({ color: "#333a32", alpha: 0.54 })
            .rect(x, y, 65, 53)
            .fill(column % 2 ? "#55594f" : "#73715e")
            .stroke({ color: "#aba58a", width: 2, alpha: 0.8 });
        }
      }
      structures.addChild(ruins);

      const stones = new Graphics();
      for (let index = 0; index < 35; index++) {
        const x = 1270 + ((index * 163) % 710);
        const y = 650 + ((index * 109) % 810);
        const size = 9 + (index % 5) * 4;
        stones
          .ellipse(x + 3, y + 5, size + 3, size * 0.6)
          .fill({ color: "#1e2922", alpha: 0.55 })
          .ellipse(x, y, size, size * 0.6)
          .fill(index % 2 ? "#777361" : "#625f50")
          .stroke({ color: "#b0a98c", width: 1, alpha: 0.42 });
      }
      relief.addChild(stones);

      const fineGrid = new Graphics();
      for (let x = 0; x <= COLS; x++)
        fineGrid.moveTo(x * CELL, 0).lineTo(x * CELL, mapHeight);
      for (let y = 0; y <= ROWS; y++)
        fineGrid.moveTo(0, y * CELL).lineTo(mapWidth, y * CELL);
      fineGrid.stroke({ color: "#e7dfc2", width: 1, alpha: 0.2 });
      const majorGrid = new Graphics();
      for (let x = 0; x <= COLS; x += 4)
        majorGrid.moveTo(x * CELL, 0).lineTo(x * CELL, mapHeight);
      for (let y = 0; y <= ROWS; y += 4)
        majorGrid.moveTo(0, y * CELL).lineTo(mapWidth, y * CELL);
      majorGrid.stroke({ color: "#e7dfc2", width: 1.5, alpha: 0.26 });
      grid.addChild(fineGrid, majorGrid);

      for (const [label, x, y] of [
        ["VALDORA", 240, 105],
        ["RIO EREN", 790, 1105],
        ["ERETH-KHAL", 1390, 116],
        ["COLINAS DE VIGIA", 1480, 805],
      ] as const) {
        const text = new Text({
          text: label,
          style: {
            fontFamily: "Georgia",
            fontSize: label.length > 12 ? 17 : 24,
            fontWeight: "bold",
            fill: "#e0d7b9",
            stroke: { color: "#28332b", width: 4 },
            letterSpacing: 3,
          },
        });
        text.position.set(x, y);
        structures.addChild(text);
      }

      const applyZoom = (scale: number, point?: { x: number; y: number }) => {
        const center = point ?? { x: app.screen.width / 2, y: app.screen.height / 2 };
        const before = world.toLocal(center);
        const nextScale = Math.max(0.15, Math.min(2.5, scale));
        world.scale.set(nextScale);
        world.position.set(center.x - before.x * nextScale, center.y - before.y * nextScale);
        setZoom(nextScale);
      };
      reset.current = () => {
        const scale = Math.min(app.screen.width / mapWidth, app.screen.height / mapHeight) * 0.96;
        world.scale.set(scale);
        world.position.set(
          (app.screen.width - mapWidth * scale) / 2,
          (app.screen.height - mapHeight * scale) / 2,
        );
        setZoom(scale);
      };
      zoomBy.current = (factor) => applyZoom(world.scale.x * factor);
      reset.current();

      let drag: { id: string; view: Container } | null = null;
      let pan: { x: number; y: number } | null = null;
      let selectedId = "";
      const local = (event: PointerEvent | WheelEvent) => ({
        x: event.clientX - app.canvas.getBoundingClientRect().left,
        y: event.clientY - app.canvas.getBoundingClientRect().top,
      });
      const drawHover = (cell: CellPosition | null) => {
        effects.clear();
        if (!cell) {
          setHoverCell(null);
          return;
        }
        const left = cell.x * CELL;
        const top = cell.y * CELL;
        effects
          .rect(left + 2, top + 2, CELL - 4, CELL - 4)
          .fill({ color: "#f1d797", alpha: 0.13 })
          .stroke({ color: "#f1d797", width: 2, alpha: 0.82 })
          .circle(left + CELL / 2, top + CELL / 2, 8)
          .fill({ color: "#fff0bf", alpha: 0.36 });
        setHoverCell((current) =>
          current?.x === cell.x && current.y === cell.y ? current : cell,
        );
      };
      const draw = () => {
        if (drag) return;
        pieces.removeChildren().forEach((child) => child.destroy({ children: true }));
        latest.current.tokens.forEach((token) => {
          const node = new Container();
          node.position.set((token.x + 0.5) * CELL, (token.y + 0.5) * CELL);
          node.zIndex = selectedId === token.id ? 1 : 0;
          const shadow = new Graphics()
            .ellipse(2, 17, 28, 14)
            .fill({ color: "#101913", alpha: 0.74 });
          const selection = new Graphics()
            .circle(0, 1, 32)
            .stroke({ color: "#f4d890", width: 3, alpha: 0.94 });
          selection.visible = selectedId === token.id;
          const base = new Graphics()
            .circle(0, 5, 25)
            .fill("#33291e")
            .stroke({ color: "#d6b775", width: 3 })
            .circle(0, 1, 21)
            .fill("#75603c")
            .stroke({ color: "#f0d397", width: 2 })
            .circle(0, -4, 16)
            .fill("#4f4938")
            .stroke({ color: "#fff0c5", width: 2, alpha: 0.86 })
            .ellipse(-5, -10, 8, 4)
            .fill({ color: "#fff6d9", alpha: 0.42 });
          node.addChild(shadow, selection, base, createMiniature(token));
          const label = new Text({
            text: token.name,
            style: {
              fontFamily: "Georgia",
              fontSize: 13,
              fontWeight: "bold",
              fill: "#f7edcf",
              stroke: { color: "#202a23", width: 4 },
            },
          });
          label.anchor.set(0.5, 0);
          label.y = 30;
          node.addChild(label);
          pieces.addChild(node);
        });
      };
      repaint.current = draw;
      draw();

      const down = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const point = local(event);
        const position = world.toLocal(point);
        const token = [...latest.current.tokens]
          .reverse()
          .find(
            (item) =>
              Math.hypot(
                position.x - (item.x + 0.5) * CELL,
                position.y - (item.y + 0.5) * CELL,
              ) < 30,
          );
        selectedId = token?.id ?? "";
        setSelectedName(token?.name ?? "");
        draw();
        if (token) {
          if (
            latest.current.disabled ||
            (token.owner_id !== latest.current.userId &&
              latest.current.userId !== latest.current.ownerId)
          )
            return;
          drag = {
            id: token.id,
            view: pieces.children[latest.current.tokens.indexOf(token)] as Container,
          };
          drag.view.scale.set(1.08);
          drag.view.zIndex = 2;
        } else pan = point;
        app.canvas.style.cursor = "grabbing";
        app.canvas.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        const point = local(event);
        if (pan) {
          world.x += point.x - pan.x;
          world.y += point.y - pan.y;
          pan = point;
        }
        const position = world.toLocal(point);
        const inside =
          position.x >= 0 &&
          position.y >= 0 &&
          position.x < mapWidth &&
          position.y < mapHeight;
        drawHover(inside ? snap(position.x, position.y) : null);
        if (drag) {
          drag.view.position.set(position.x, position.y);
          drag.view.scale.set(1.08);
          const shadow = drag.view.children[0];
          shadow.scale.set(1.28, 1.18);
          shadow.alpha = 0.94;
        }
      };
      const up = (event: PointerEvent) => {
        if (drag) {
          const { id, view } = drag;
          const position = world.toLocal(local(event));
          const cell = snap(position.x, position.y);
          view.scale.set(1);
          drag = null;
          draw();
          void latest.current.onMove(id, cell.x, cell.y);
        }
        pan = null;
        app.canvas.style.cursor = "grab";
        if (app.canvas.hasPointerCapture(event.pointerId))
          app.canvas.releasePointerCapture(event.pointerId);
      };
      const cancel = () => {
        drag = null;
        pan = null;
        app.canvas.style.cursor = "grab";
        draw();
      };
      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        applyZoom(
          world.scale.x * Math.exp(-event.deltaY * 0.001),
          local(event),
        );
      };
      const ticker = () => {
        const selected = pieces.children.find((child) => child.zIndex === 1);
        if (selected?.children[1])
          selected.children[1].alpha = 0.76 + Math.sin(performance.now() / 260) * 0.2;
      };
      app.ticker.add(ticker);
      app.canvas.style.cursor = "grab";
      app.canvas.addEventListener("pointerdown", down);
      app.canvas.addEventListener("pointermove", move);
      app.canvas.addEventListener("pointerup", up);
      app.canvas.addEventListener("pointercancel", cancel);
      app.canvas.addEventListener("wheel", wheel, { passive: false });
      cleanup = () => {
        app.ticker.remove(ticker);
        app.canvas.removeEventListener("pointerdown", down);
        app.canvas.removeEventListener("pointermove", move);
        app.canvas.removeEventListener("pointerup", up);
        app.canvas.removeEventListener("pointercancel", cancel);
        app.canvas.removeEventListener("wheel", wheel);
      };
    })().catch((cause) =>
      setError(`Não foi possível abrir o tabuleiro: ${String(cause)}`),
    );

    return () => {
      disposed = true;
      repaint.current = () => {};
      cleanup();
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div className="board-shell">
      <div ref={host} className="canvas-host" />
      {error && <p role="alert">{error}</p>}
      <div className="board-tools" aria-label="Ferramentas do mapa">
        <button aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => zoomBy.current(1 / 1.2)}>
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => zoomBy.current(1.2)}>
          +
        </button>
        <button aria-label="Centralizar mapa" title="Centralizar mapa" onClick={() => reset.current()}>
          ⌖
        </button>
      </div>
      <div className="board-caption">
        <span>
          VALDORA <i /> 32 × 24 CASAS
          {hoverCell && <small>CASA {hoverCell.x + 1}:{hoverCell.y + 1}</small>}
          {selectedName && <small>PEÇA: {selectedName}</small>}
        </span>
        <span className="map-scale">TERRENO DE VALDORA</span>
      </div>
    </div>
  );
}