import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { RoomMap, Token } from "../lib/types";
import { mapPosition } from "./grid";
import { createMiniature } from "./miniature";

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
type CharacterView = {
  node: Container;
  miniature: Container;
  shadow: Graphics;
  signature: string;
};

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
      const characterViews = new Map<string, CharacterView>();
      mapSprite.visible = false;
      mapLayer.addChild(mapSprite);
      app.stage.addChild(world);
      world.addChild(mapLayer, gridLayer, characters, selectionEffects, hoverEffects);

      let mapWidth = 0;
      let mapHeight = 0;
      let miniatureScale = 1;
      let activeMapPath = "";
      let loadSequence = 0;
      let drag: { id: string; view: Container; shadow: Graphics } | null = null;
      let pan: Point | null = null;
      let selectedId = "";
      let hoveredId = "";
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const hoverTransitions = new Map<string, { from: number; value: number; target: number; elapsed: number }>();
      let releasing: {
        view: Container;
        shadow: Graphics;
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
        const activeIds = new Set<string>();
        latest.current.tokens.forEach((token) => {
          activeIds.add(token.id);
          const selected = selectedId === token.id;
          const signature = [
            token.name,
            token.color,
            token.silhouette,
            token.map_x,
            token.map_y,
            selected,
          ].join("|");
          const current = characterViews.get(token.id);
          if (current?.signature === signature) {
            current.node.position.set(token.map_x * mapWidth, token.map_y * mapHeight - (selected ? 1.5 : 0));
            current.node.zIndex = selected ? 1 : 0;
            return;
          }
          if (current) {
            characters.removeChild(current.node);
            current.node.destroy({ children: true });
          }
          const node = new Container();
          node.position.set(token.map_x * mapWidth, token.map_y * mapHeight - (selected ? 1.5 : 0));
          node.zIndex = selected ? 1 : 0;
          const miniature = createMiniature(token, {
            scale: miniatureScale,
            showName: true,
            selected,
          });
          const shadow = miniature.children[0] as Graphics;
          node.addChild(miniature);
          characterViews.set(token.id, { node, miniature, shadow, signature });
          characters.addChild(node);
        });
        for (const [id, view] of characterViews) {
          if (activeIds.has(id)) continue;
          characters.removeChild(view.node);
          view.node.destroy({ children: true });
          characterViews.delete(id);
        }
        characters.sortChildren();
      };
      const drawSelectionAt = (x: number, y: number) => {
        selectionEffects.clear();
        if (!selectedId) return;
        selectionEffects
          .ellipse(x, y + 14 * miniatureScale, 26 * miniatureScale, 13 * miniatureScale)
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
      const setHovered = (nextId: string) => {
        if (nextId === hoveredId) return;
        const previousId = hoveredId;
        if (previousId) {
          const previous = hoverTransitions.get(previousId);
          const value = previous?.value ?? 1;
          const oldToken = latest.current.tokens.find((token) => token.id === previousId);
          const oldView = characterViews.get(previousId);
          if (oldToken && oldView) {
            if (reducedMotion) {
              oldView.node.scale.set(1);
              oldView.node.y = oldToken.map_y * mapHeight - (selectedId === previousId ? 1.5 : 0);
              oldView.miniature.alpha = 0.94;
            } else hoverTransitions.set(previousId, { from: value, value, target: 0, elapsed: 0 });
          }
        }
        hoveredId = nextId;
        if (!nextId) return;
        const nextToken = latest.current.tokens.find((token) => token.id === nextId);
        const nextView = characterViews.get(nextId);
        if (!nextToken || !nextView) return;
        if (reducedMotion) {
          nextView.node.scale.set(1.045);
          nextView.node.y = nextToken.map_y * mapHeight - (selectedId === nextId ? 1.5 : 0) - 3;
          nextView.miniature.alpha = 1;
        } else {
          const previous = hoverTransitions.get(nextId);
          const value = previous?.value ?? 0;
          hoverTransitions.set(nextId, { from: value, value, target: 1, elapsed: 0 });
        }
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
        setHovered("");
        drawCharacters();
        setHovered(token?.id ?? "");
        setSelectedName(token?.name ?? "");
        drawSelection();
        if (token) {
          if (
            latest.current.disabled ||
            (token.owner_id !== latest.current.userId && latest.current.userId !== latest.current.ownerId)
          ) return;
          const view = characterViews.get(token.id);
          if (!view) return;
          drag = { id: token.id, view: view.node, shadow: view.shadow };
          view.node.scale.set(1.08);
          view.node.zIndex = 2;
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
        if (!drag && !pan && inside) {
          const hovered = [...latest.current.tokens]
            .reverse()
            .find((token) => Math.hypot(position.x - token.map_x * mapWidth, position.y - token.map_y * mapHeight) < 29 * miniatureScale);
          setHovered(hovered?.id ?? "");
        } else if (drag || pan || !inside) setHovered("");
        if (drag) {
          drag.view.position.set(position.x, position.y);
          drag.view.scale.set(1.08);
          drawSelectionAt(position.x, position.y);
          drag.shadow.scale.set(1.3, 1.2);
          drag.shadow.alpha = 0.96;
        }
      };
      const up = (event: PointerEvent) => {
        if (drag) {
          const { id, view, shadow } = drag;
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
            shadow,
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
        hoverTransitions.clear();
        hoveredId = "";
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
        if (!drag) {
          drawHover(null);
          setHovered("");
        }
      };
      const ticker = (ticker: { deltaMS: number }) => {
        if (selectedId)
          selectionEffects.alpha = reducedMotion ? 0.92 : 0.82 + Math.sin(performance.now() / 260) * 0.15;
        for (const [id, transition] of hoverTransitions) {
          const view = characterViews.get(id);
          const token = latest.current.tokens.find((item) => item.id === id);
          if (!view || !token || drag?.id === id || releasing?.id === id) {
            hoverTransitions.delete(id);
            continue;
          }
          transition.elapsed = Math.min(80, transition.elapsed + ticker.deltaMS);
          const amount = Math.min(1, transition.elapsed / 80);
          const eased = amount * amount * (3 - 2 * amount);
          transition.value = transition.from + (transition.target - transition.from) * eased;
          view.node.scale.set(1 + 0.045 * transition.value);
          view.node.y = token.map_y * mapHeight - (selectedId === id ? 1.5 : 0) - 3 * transition.value;
          view.miniature.alpha = 0.94 + 0.06 * transition.value;
          if (amount >= 1) {
            transition.value = transition.target;
            hoverTransitions.delete(id);
          }
        }
        if (releasing) {
          releasing.elapsed = Math.min(reducedMotion ? 1 : 150, releasing.elapsed + ticker.deltaMS);
          const amount = releasing.elapsed / (reducedMotion ? 1 : 150);
          const eased = 1 - (1 - amount) ** 3;
          releasing.view.position.set(
            releasing.from.x + (releasing.to.x - releasing.from.x) * eased,
            releasing.from.y + (releasing.to.y - releasing.from.y) * eased,
          );
          releasing.view.scale.set(1.08 - 0.08 * eased);
          releasing.shadow.scale.set(1.3 - 0.3 * eased, 1.2 - 0.2 * eased);
          releasing.shadow.alpha = 0.96 - 0.2 * eased;
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