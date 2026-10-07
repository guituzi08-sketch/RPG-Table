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
export default function Board(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props),
    repaint = useRef<() => void>(() => {}),
    reset = useRef<() => void>(() => {});
  const [error, setError] = useState("");
  latest.current = props;
  useEffect(() => {
    repaint.current();
  }, [props.tokens, props.disabled]);
  useEffect(() => {
    const app = new Application();
    let disposed = false,
      initialized = false;
    let cleanup = () => {};
    void (async () => {
      await app.init({
        resizeTo: host.current!,
        background: "#101d21",
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
      const world = new Container(),
        terrain = new Graphics(),
        grid = new Graphics(),
        pieces = new Container();
      app.stage.addChild(world);
      world.addChild(terrain, grid, pieces);
      terrain.rect(0, 0, COLS * CELL, ROWS * CELL).fill("#344943");
      // Original schematic map: Valdora west, river center, ruins east.
      terrain
        .poly([
          850, 0, 1120, 0, 1280, 400, 1100, 800, 1240, 1536, 940, 1536, 850,
          900, 1010, 420,
        ])
        .fill("#254e5b");
      terrain
        .roundRect(100, 160, 620, 690, 20)
        .fill("#687168")
        .stroke({ color: "#bab59b", width: 16 });
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++)
          terrain
            .rect(160 + col * 130, 240 + row * 130, 88, 80)
            .fill("#414e48")
            .stroke({ color: "#929080", width: 3 });
      terrain.rect(690, 650, 520, 90).fill("#968366");
      terrain
        .rect(1350, 200, 380, 350)
        .fill("#5e675e")
        .stroke({ color: "#a5aa91", width: 8 });
      for (let i = 0; i < 30; i++) {
        const x = 1320 + ((i * 137) % 640),
          y = 700 + ((i * 173) % 680);
        terrain.circle(x, y, 25 + (i % 4) * 8).fill("#273e34");
      }
      for (let x = 0; x <= COLS; x++)
        grid.moveTo(x * CELL, 0).lineTo(x * CELL, ROWS * CELL);
      for (let y = 0; y <= ROWS; y++)
        grid.moveTo(0, y * CELL).lineTo(COLS * CELL, y * CELL);
      grid.stroke({ color: "#dce5ce", width: 1, alpha: 0.27 });
      for (const [label, x, y] of [
        ["VALDORA", 260, 100],
        ["RIO EREN", 900, 1100],
        ["ERETH-KHAL", 1380, 130],
      ] as const) {
        const text = new Text({
          text: label,
          style: {
            fontFamily: "Georgia",
            fontSize: 26,
            fill: "#dce1ca",
            letterSpacing: 4,
          },
        });
        text.position.set(x, y);
        world.addChild(text);
      }
      reset.current = () => {
        const scale =
          Math.min(
            app.screen.width / (COLS * CELL),
            app.screen.height / (ROWS * CELL),
          ) * 0.94;
        world.scale.set(scale);
        world.position.set(
          (app.screen.width - COLS * CELL * scale) / 2,
          (app.screen.height - ROWS * CELL * scale) / 2,
        );
      };
      reset.current();
      let drag: { id: string; view: Container } | null = null,
        pan: { x: number; y: number } | null = null;
      const local = (e: PointerEvent | WheelEvent) => ({
        x: e.clientX - app.canvas.getBoundingClientRect().left,
        y: e.clientY - app.canvas.getBoundingClientRect().top,
      });
      const draw = () => {
        if (drag) return;
        pieces.removeChildren().forEach((c) => c.destroy({ children: true }));
        latest.current.tokens.forEach((t) => {
          const node = new Container();
          node.position.set((t.x + 0.5) * CELL, (t.y + 0.5) * CELL);
          node.addChild(
            new Graphics()
              .circle(0, 0, 25)
              .fill(t.color)
              .stroke({ color: "#fff4d3", width: 3 }),
          );
          const letter = new Text({
            text: t.name.slice(0, 2).toUpperCase(),
            style: {
              fontFamily: "Arial",
              fontSize: 18,
              fontWeight: "bold",
              fill: "#101820",
            },
          });
          letter.anchor.set(0.5);
          node.addChild(letter);
          const label = new Text({
            text: t.name,
            style: {
              fontFamily: "Arial",
              fontSize: 14,
              fill: "#ffffff",
              stroke: { color: "#152523", width: 3 },
            },
          });
          label.anchor.set(0.5, 0);
          label.y = 29;
          node.addChild(label);
          pieces.addChild(node);
        });
      };
      repaint.current = draw;
      draw();
      const down = (e: PointerEvent) => {
        if (e.button !== 0) return;
        const p = local(e),
          w = world.toLocal(p);
        const token = [...latest.current.tokens]
          .reverse()
          .find(
            (t) =>
              Math.hypot(w.x - (t.x + 0.5) * CELL, w.y - (t.y + 0.5) * CELL) <
              29,
          );
        if (token) {
          if (
            latest.current.disabled ||
            (token.owner_id !== latest.current.userId &&
              latest.current.userId !== latest.current.ownerId)
          )
            return;
          drag = {
            id: token.id,
            view: pieces.children[latest.current.tokens.indexOf(token)],
          };
        } else pan = p;
        app.canvas.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        const p = local(e);
        if (drag) {
          const w = world.toLocal(p);
          drag.view.position.set(w.x, w.y);
        } else if (pan) {
          world.x += p.x - pan.x;
          world.y += p.y - pan.y;
          pan = p;
        }
      };
      const up = (e: PointerEvent) => {
        if (drag) {
          const id = drag.id,
            p = world.toLocal(local(e)),
            cell = snap(p.x, p.y);
          drag = null;
          draw();
          void latest.current.onMove(id, cell.x, cell.y);
        }
        pan = null;
        if (app.canvas.hasPointerCapture(e.pointerId))
          app.canvas.releasePointerCapture(e.pointerId);
      };
      const cancel = () => {
        drag = null;
        pan = null;
        draw();
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        const p = local(e),
          before = world.toLocal(p),
          scale = Math.max(
            0.15,
            Math.min(2.5, world.scale.x * Math.exp(-e.deltaY * 0.001)),
          );
        world.scale.set(scale);
        world.position.set(p.x - before.x * scale, p.y - before.y * scale);
      };
      app.canvas.addEventListener("pointerdown", down);
      app.canvas.addEventListener("pointermove", move);
      app.canvas.addEventListener("pointerup", up);
      app.canvas.addEventListener("pointercancel", cancel);
      app.canvas.addEventListener("wheel", wheel, { passive: false });
      cleanup = () => {
        app.canvas.removeEventListener("pointerdown", down);
        app.canvas.removeEventListener("pointermove", move);
        app.canvas.removeEventListener("pointerup", up);
        app.canvas.removeEventListener("pointercancel", cancel);
        app.canvas.removeEventListener("wheel", wheel);
      };
    })().catch((e) =>
      setError(`Não foi possível abrir o tabuleiro: ${String(e)}`),
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
      <div className="board-caption">
        <span>VALDORA · 32 × 24 QUADRADOS</span>
        <button onClick={() => reset.current()}>Centralizar mapa</button>
      </div>
    </div>
  );
}
