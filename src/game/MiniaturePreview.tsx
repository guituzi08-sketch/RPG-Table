import { useEffect, useRef } from "react";
import { Application, Container } from "pixi.js";
import { createMiniature, type MiniatureAppearance } from "./miniature";

type Props = MiniatureAppearance;

export default function MiniaturePreview(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const redraw = useRef<() => void>(() => {});
  latest.current = props;

  useEffect(() => {
    const app = new Application();
    let disposed = false;
    let initialized = false;
    let cleanup = () => {};

    void (async () => {
      await app.init({
        width: 120,
        height: 104,
        backgroundAlpha: 0,
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
      const scene = new Container();
      app.stage.addChild(scene);
      redraw.current = () => {
        scene.removeChildren().forEach((child) => child.destroy({ children: true }));
        const miniature = createMiniature(latest.current, { scale: 0.98 });
        miniature.position.set(app.screen.width / 2, app.screen.height / 2 + 11);
        scene.addChild(miniature);
      };
      redraw.current();
      cleanup = () => {
        redraw.current = () => {};
      };
    })();

    return () => {
      disposed = true;
      cleanup();
      if (initialized) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    redraw.current();
  }, [props.name, props.color, props.silhouette]);

  return (
    <div
      ref={host}
      className="miniature-preview-canvas"
      role="img"
      aria-label={`Prévia da miniatura ${props.name}, roupa ${props.color}, silhueta ${props.silhouette === "masculine" ? "homem" : "mulher"}`}
    />
  );
}