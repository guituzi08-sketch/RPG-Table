import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { RoomMap, Token } from "../lib/types";
import { mapPosition } from "./grid";

type Props = {
  tokens: Token[];
  map: RoomMap | null;
  gridEnabled: boolean;
  gridSize: number;
  userId: string;
  ownerId: string;
  disabled: boolean;
  onMove: (id: string, x: number, y: number) => Promise<boolean>;
};

type Point = { x: number; y: number };

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
  const loadMapRef = useRef<(map: RoomMap | null) => void>(() => {});
  const gridDrawRef = useRef<() => void>(() => {});
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [selectedName, setSelectedName] = useState("");
  latest.current = props;

  useEffect(() => repaint.current(), [props.tokens, props.disabled]);

  useEffect(() => {
    const app = new Application();
    let disposed = false;
    let initialized = false;
    let cleanup = () => {};
    let drawGrid = () => {};
    let loadMap = (_map: RoomMap | null) => {};
    let updateSize = () => {};
    let activeMapUrl = "";

    void (async () => {
      await app.init({
        resizeTo: host.current!,
        background: "#151b17",
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
      const mapLayer = new Container();
      const gridLayer = new Graphics();
      const characters = new Container();
      characters.sortableChildren = true;
      const hoverEffects = new Graphics();
      const selectionEffects = new Graphics();
      const mapSprite = new Sprite(Texture.EMPTY);
      const characterViews = new Map<string, Container>();
      mapSprite.visible = false;
      mapLayer.addChild(mapSprite);
      app.stage.addChild(world);
      world.addChild(mapLayer, gridLayer, characters, selectionEffects, hoverEffects);

      let mapWidth = 0;
      let mapHeight = 0;
      let miniatureScale = 1;
      let activeMapPath = "";
      let loadSequence = 0;
      let drag: { id: string; view: Container } | null = null;
      let pan: Point | null = null;
      let selectedId = "";
      let releasing: {
        view: Container;
        id: string;
        from: Point;
        to: Point;
        elapsed: number;
        nextX: number;
        nextY: number;
      } | null = null;

      const local = (event: PointerEvent | WheelEvent) => ({
        x: event.clientX - app.canvas.getBoundingClientRect().left,
        y: event.clientY - app.canvas.getBoundingClientRect().top,
      });
      const applyZoom = (scale: number, point?: Point) => {
        const center = point ?? { x: app.screen.width / 2, y: app.screen.height / 2 };
        const before = world.toLocal(center);
        const nextScale = Math.max(0.025, Math.min(4, scale));
        world.scale.set(nextScale);
        world.position.set(center.x - before.x * nextScale, center.y - before.y * nextScale);
        setZoom(nextScale);
      };
      const centerMap = () => {
        if (!mapWidth || !mapHeight) return;
        const scale = Math.min(app.screen.width / mapWidth, app.screen.height / mapHeight) * 0.96;
        world.scale.set(scale);
        world.position.set(
          (app.screen.width - mapWidth * scale) / 2,
          (app.screen.height - mapHeight * scale) / 2,
        );
        setZoom(scale);
      };
      reset.current = centerMap;
      zoomBy.current = (factor) => applyZoom(world.scale.x * factor);

      drawGrid = () => {
        gridLayer.clear();
        const currentMap = latest.current.map;
        if (!currentMap?.gridEnabled) return;
        const size = currentMap.gridSize;
        for (let x = 0; x <= mapWidth; x += size)
          gridLayer.moveTo(x, 0).lineTo(x, mapHeight);
        for (let y = 0; y <= mapHeight; y += size)
          gridLayer.moveTo(0, y).lineTo(mapWidth, y);
        gridLayer.stroke({
          color: "#f4e5bc",
          width: Math.max(1, mapWidth / currentMap.width),
          alpha: currentMap.gridOpacity,
        });
      };
      gridDrawRef.current = drawGrid;

      const drawCharacters = () => {
        if (drag || releasing || !mapWidth || !mapHeight) return;
        characters.removeChildren().forEach((child) => child.destroy({ children: true }));
        characterViews.clear();
        latest.current.tokens.forEach((token) => {
          const node = new Container();
          node.position.set(token.map_x * mapWidth, token.map_y * mapHeight);
          node.zIndex = selectedId === token.id ? 1 : 0;
          const baseRadius = 21 * miniatureScale;
          const shadow = new Graphics()
            .ellipse(2 * miniatureScale, 12 * miniatureScale, baseRadius * 1.12, baseRadius * 0.52)
            .fill({ color: "#0b100c", alpha: 0.76 });
          const base = new Graphics()
            .circle(0, 4 * miniatureScale, baseRadius)
            .fill("#32291f")
            .stroke({ color: "#bd995b", width: 2.8 * miniatureScale })
            .circle(0, 1 * miniatureScale, baseRadius * 0.82)
            .fill("#716043")
            .stroke({ color: "#e0c27e", width: 1.7 * miniatureScale })
            .circle(0, -2 * miniatureScale, baseRadius * 0.63)
            .fill("#464c3c")
            .stroke({ color: "#f3dfaa", width: 1.1 * miniatureScale, alpha: 0.8 })
            .ellipse(-5 * miniatureScale, -9 * miniatureScale, 7 * miniatureScale, 3 * miniatureScale)
            .fill({ color: "#fff4ce", alpha: 0.42 });
          const figure = createMiniature(token);
          figure.scale.set(miniatureScale);
          const label = new Text({
            text: token.name,
            style: {
              fontFamily: "Georgia",
              fontSize: 13 * miniatureScale,
              fontWeight: "bold",
              fill: "#fff0cf",
              stroke: { color: "#1c241c", width: 4 * miniatureScale },
            },
          });
          label.anchor.set(0.5, 0);
          label.y = 25 * miniatureScale;
          node.addChild(shadow, base, figure, label);
          characterViews.set(token.id, node);
          characters.addChild(node);
        });
      };
      const drawSelectionAt = (x: number, y: number) => {
        selectionEffects.clear();
        if (!selectedId) return;
        selectionEffects
          .circle(x, y + 1 * miniatureScale, 28 * miniatureScale)
          .stroke({ color: "#f1d188", width: 2.6 * miniatureScale, alpha: 0.92 });
      };
      const drawSelection = () => {
        if (!selectedId) {
          selectionEffects.clear();
          return;
        }
        const token = latest.current.tokens.find((item) => item.id === selectedId);
        if (!token) return;
        drawSelectionAt(token.map_x * mapWidth, token.map_y * mapHeight);
      };
      repaint.current = () => {
        drawCharacters();
        drawSelection();
      };
      const drawHover = (position: Point | null) => {
        hoverEffects.clear();
        if (!position || !mapWidth || !mapHeight) {
          setHoverPoint(null);
          return;
        }
        const map = latest.current.map;
        if (map?.gridEnabled) {
          const left = Math.floor(position.x / map.gridSize) * map.gridSize;
          const top = Math.floor(position.y / map.gridSize) * map.gridSize;
          hoverEffects
            .rect(left + 1, top + 1, map.gridSize - 2, map.gridSize - 2)
            .fill({ color: "#f1d797", alpha: 0.11 })
            .stroke({ color: "#f1d797", width: 2, alpha: 0.7 });
        } else {
          hoverEffects
            .circle(position.x, position.y, 15 * miniatureScale)
            .fill({ color: "#f1d797", alpha: 0.1 })
            .stroke({ color: "#f1d797", width: 1.5 * miniatureScale, alpha: 0.5 });
        }
        setHoverPoint((current) =>
          current && Math.floor(current.x) === Math.floor(position.x) && Math.floor(current.y) === Math.floor(position.y)
            ? current
            : position,
        );
      };

      loadMap = async (map) => {
        const sequence = ++loadSequence;
        if (!map) {
          const previousUrl = activeMapUrl;
          mapSprite.visible = false;
          mapSprite.texture = Texture.EMPTY;
          activeMapPath = "";
          activeMapUrl = "";
          mapWidth = 0;
          mapHeight = 0;
          gridLayer.clear();
          characters.removeChildren().forEach((child) => child.destroy({ children: true }));
          selectionEffects.clear();
          drawHover(null);
          if (previousUrl) void Assets.unload(previousUrl);
          return;
        }
        if (activeMapPath === map.path && mapSprite.visible) {
          drawGrid();
          return;
        }
        try {
          const texture = await Assets.load<Texture>(map.imageUrl);
          if (disposed || sequence !== loadSequence) {
            void Assets.unload(map.imageUrl);
            return;
          }
          const previousUrl = activeMapUrl;
          mapWidth = map.width;
          mapHeight = map.height;
          miniatureScale = Math.max(0.65, Math.min(1.2, Math.min(mapWidth, mapHeight) / 1536));
          mapSprite.texture = texture;
          mapSprite.width = mapWidth;
          mapSprite.height = mapHeight;
          mapSprite.visible = true;
          activeMapPath = map.path;
          activeMapUrl = map.imageUrl;
          drawGrid();
          drawCharacters();
          drawSelection();
          centerMap();
          setError("");
          if (previousUrl && previousUrl !== activeMapUrl) void Assets.unload(previousUrl);
        } catch (cause) {
          if (sequence === loadSequence)
            setError(`Não foi possível carregar o mapa: ${String(cause)}`);
        }
      };
      loadMapRef.current = (map) => { void loadMap(map); };
      updateSize = () => {
        if (mapWidth && mapHeight) centerMap();
      };
      void loadMap(latest.current.map);
      drawCharacters();

      const down = (event: PointerEvent) => {
        if (event.button !== 0 || !mapSprite.visible) return;
        const point = local(event);
        const position = world.toLocal(point);
        const token = [...latest.current.tokens]
          .reverse()
          .find((item) => {
            const x = item.map_x * mapWidth;
            const y = item.map_y * mapHeight;
            return Math.hypot(position.x - x, position.y - y) < 29 * miniatureScale;
          });
        selectedId = token?.id ?? "";
        setSelectedName(token?.name ?? "");
        drawCharacters();
        drawSelection();
        if (token) {
          if (
            latest.current.disabled ||
            (token.owner_id !== latest.current.userId && latest.current.userId !== latest.current.ownerId)
          ) return;
          const view = characterViews.get(token.id);
          if (!view) return;
          drag = { id: token.id, view };
          view.scale.set(1.08);
          view.zIndex = 2;
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
        if (!mapSprite.visible) return;
        const position = world.toLocal(point);
        const inside = position.x >= 0 && position.y >= 0 && position.x <= mapWidth && position.y <= mapHeight;
        drawHover(inside ? position : null);
        if (drag) {
          drag.view.position.set(position.x, position.y);
          drag.view.scale.set(1.08);
          drawSelectionAt(position.x, position.y);
          const shadow = drag.view.children[0];
          shadow.scale.set(1.3, 1.2);
          shadow.alpha = 0.96;
        }
      };
      const up = (event: PointerEvent) => {
        if (drag) {
          const { id, view } = drag;
          const position = world.toLocal(local(event));
          const snapped = mapPosition(
            position.x,
            position.y,
            mapWidth,
            mapHeight,
            latest.current.gridEnabled ? latest.current.gridSize : undefined,
          );
          const target = { x: snapped.x * mapWidth, y: snapped.y * mapHeight };
          const nextX = snapped.x;
          const nextY = snapped.y;
          releasing = {
            view,
            id,
            from: { x: view.x, y: view.y },
            to: target,
            elapsed: 0,
            nextX,
            nextY,
          };
          drag = null;
        }
        pan = null;
        app.canvas.style.cursor = "grab";
        if (app.canvas.hasPointerCapture(event.pointerId)) app.canvas.releasePointerCapture(event.pointerId);
      };
      const cancel = () => {
        drag = null;
        releasing = null;
        pan = null;
        app.canvas.style.cursor = "grab";
        drawCharacters();
        drawSelection();
      };
      const wheel = (event: WheelEvent) => {
        if (!mapSprite.visible) return;
        event.preventDefault();
        applyZoom(world.scale.x * Math.exp(-event.deltaY * 0.001), local(event));
      };
      const leave = () => {
        if (!drag) drawHover(null);
      };
      const ticker = (ticker: { deltaMS: number }) => {
        if (selectedId)
          selectionEffects.alpha = 0.82 + Math.sin(performance.now() / 260) * 0.15;
        if (releasing) {
          releasing.elapsed = Math.min(150, releasing.elapsed + ticker.deltaMS);
          const amount = releasing.elapsed / 150;
          const eased = 1 - (1 - amount) ** 3;
          releasing.view.position.set(
            releasing.from.x + (releasing.to.x - releasing.from.x) * eased,
            releasing.from.y + (releasing.to.y - releasing.from.y) * eased,
          );
          releasing.view.scale.set(1.08 - 0.08 * eased);
          const shadow = releasing.view.children[0];
          shadow.scale.set(1.3 - 0.3 * eased, 1.2 - 0.2 * eased);
          shadow.alpha = 0.96 - 0.2 * eased;
          drawSelectionAt(releasing.view.x, releasing.view.y);
          if (amount >= 1) {
            const move = releasing;
            releasing = null;
            void latest.current.onMove(move.id, move.nextX, move.nextY).then((saved) => {
              if (!saved) {
                drawCharacters();
                drawSelection();
              }
            });
          }
        }
      };
      app.ticker.add(ticker);
      app.canvas.style.cursor = "grab";
      app.canvas.addEventListener("pointerdown", down);
      app.canvas.addEventListener("pointermove", move);
      app.canvas.addEventListener("pointerup", up);
      app.canvas.addEventListener("pointercancel", cancel);
      app.canvas.addEventListener("wheel", wheel, { passive: false });
      app.canvas.addEventListener("pointerleave", leave);
      const observer = new ResizeObserver(updateSize);
      if (host.current) observer.observe(host.current);
      cleanup = () => {
        observer.disconnect();
        app.ticker.remove(ticker);
        app.canvas.removeEventListener("pointerdown", down);
        app.canvas.removeEventListener("pointermove", move);
        app.canvas.removeEventListener("pointerup", up);
        app.canvas.removeEventListener("pointercancel", cancel);
        app.canvas.removeEventListener("wheel", wheel);
        app.canvas.removeEventListener("pointerleave", leave);
      };
    })().catch((cause) => setError(`Não foi possível abrir o tabuleiro: ${String(cause)}`));

    return () => {
      disposed = true;
      repaint.current = () => {};
      cleanup();
      if (activeMapUrl) void Assets.unload(activeMapUrl);
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    void loadMapRef.current(props.map);
  }, [props.map]);

  useEffect(() => {
    gridDrawRef.current();
  }, [props.map?.gridEnabled, props.map?.gridSize, props.map?.gridOpacity]);

  return (
    <div className="board-shell">
      <div ref={host} className="canvas-host" />
      {error && <p role="alert" className="board-error">{error}</p>}
      <div className="board-tools" aria-label="Ferramentas do mapa">
        <button aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => zoomBy.current(1 / 1.2)} disabled={!props.map}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => zoomBy.current(1.2)} disabled={!props.map}>+</button>
        <button aria-label="Centralizar mapa" title="Centralizar mapa" onClick={() => reset.current()} disabled={!props.map}>⌖</button>
        {hoverPoint && props.map && (
          <small className="map-coordinate">{Math.round(hoverPoint.x / props.map.width * 100)}%, {Math.round(hoverPoint.y / props.map.height * 100)}%</small>
        )}
        {selectedName && <small className="selected-character">{selectedName}</small>}
      </div>
    </div>
  );
}