import { useEffect, useRef, useState } from "react";
import { db } from "../lib/client";
import type { MapImageDetails } from "../lib/mapStorage";
import { inspectMapFile, removeRoomMap, uploadRoomMap } from "../lib/mapStorage";
import type { RoomMap } from "../lib/types";

type Props = {
  roomId: string;
  map: RoomMap | null;
  canManage: boolean;
  disabled: boolean;
};

export default function MapManager({ roomId, map, canManage, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<MapImageDetails | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [gridSize, setGridSize] = useState(map?.gridSize ?? 64);
  const [gridOpacity, setGridOpacity] = useState(map?.gridOpacity ?? 0.28);

  useEffect(() => {
    setGridSize(map?.gridSize ?? 64);
    setGridOpacity(map?.gridOpacity ?? 0.28);
  }, [map?.path, map?.gridSize, map?.gridOpacity]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = async (candidate?: File) => {
    if (!candidate) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const inspected = await inspectMapFile(candidate);
      setDetails(inspected);
      setFile(candidate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler a imagem.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file || !details) return;
    if (map && !window.confirm("Trocar o mapa desta mesa?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await uploadRoomMap(roomId, file, details, map);
      setFile(null);
      setDetails(null);
      setNotice(map ? "Mapa trocado para todos na mesa." : "Mapa adicionado à mesa.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao enviar o mapa.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!map || !window.confirm("Remover o mapa desta mesa? Os personagens e suas posições serão mantidos."))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await removeRoomMap(map, roomId);
      setNotice("Mapa removido. Os personagens foram mantidos.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao remover o mapa.");
    } finally {
      setBusy(false);
    }
  };

  const saveGrid = async (enabled: boolean, size = gridSize, opacity = gridOpacity) => {
    if (!db || !map) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await db.rpc("set_room_grid", {
        p_room: roomId,
        p_enabled: enabled,
        p_size: size,
        p_opacity: opacity,
      });
      if (error) throw error;
      setNotice(enabled ? "Grade atualizada para todos na mesa." : "Grade ocultada para todos na mesa.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a grade.");
    } finally {
      setBusy(false);
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      className="map-file-input"
      type="file"
      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
      disabled={disabled || busy}
      onChange={(event) => {
        void chooseFile(event.currentTarget.files?.[0]);
        event.currentTarget.value = "";
      }}
      aria-label="Selecionar imagem do mapa"
    />
  );

  return (
    <>
      {fileInput}
      {!map ? (
        <div
          className={`map-empty-state${canManage ? " is-drop-target" : ""}`}
          onDragOver={(event) => {
            if (canManage && !disabled) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!canManage || disabled) return;
            event.preventDefault();
            void chooseFile(event.dataTransfer.files[0]);
          }}
        >
          <div className="map-empty-emblem" aria-hidden="true">▧</div>
          <p className="eyebrow">A MESA ESTÁ PREPARADA</p>
          <h2>Esta mesa ainda não possui um mapa</h2>
          {canManage ? (
            <>
              <button type="button" className="map-picker-button" onClick={() => inputRef.current?.click()} disabled={disabled || busy}>
                Adicionar mapa
                <span>PNG, JPG ou WEBP · até 20 MB</span>
              </button>
              <small>ou arraste uma imagem para esta área</small>
            </>
          ) : (
            <p className="map-waiting">Aguardando o mestre adicionar um mapa.</p>
          )}
        </div>
      ) : (
        <>
          <div className="map-manager-actions">
            <span className="map-name" title={map.name}>{map.name}</span>
            {canManage && (
              <>
                <button type="button" className="map-action-button" onClick={() => inputRef.current?.click()} disabled={disabled || busy}>
                  Trocar mapa
                </button>
                <button type="button" className="map-remove-button" onClick={() => void remove()} disabled={disabled || busy}>
                  Remover mapa
                </button>
              </>
            )}
          </div>
          <div className="map-grid-controls" aria-label="Controles da grade">
            <label className="grid-toggle">
              <input
                type="checkbox"
                checked={map.gridEnabled}
                onChange={(event) => void saveGrid(event.target.checked)}
                disabled={!canManage || disabled || busy}
                aria-label="Mostrar grade no mapa"
              />
              <span aria-hidden="true">▦</span>
              Grade
            </label>
            {canManage && map.gridEnabled && (
              <>
                <label className="grid-setting">
                  Célula
                  <input
                    type="number"
                    min={16}
                    max={512}
                    step={8}
                    value={gridSize}
                    onChange={(event) => setGridSize(Math.max(16, Math.min(512, Number(event.target.value) || 64)))}
                    onBlur={() => void saveGrid(true)}
                    disabled={disabled || busy}
                    aria-label="Tamanho da célula da grade em pixels"
                  />
                </label>
                <label className="grid-setting grid-opacity">
                  Opacidade
                  <input
                    type="range"
                    min={8}
                    max={80}
                    value={Math.round(gridOpacity * 100)}
                    onChange={(event) => setGridOpacity(Number(event.target.value) / 100)}
                    onPointerUp={() => void saveGrid(true)}
                    onKeyUp={() => void saveGrid(true)}
                    disabled={disabled || busy}
                    aria-label="Opacidade da grade"
                  />
                </label>
              </>
            )}
          </div>
        </>
      )}
      {busy && <p className="map-feedback" role="status">{file ? "Enviando mapa…" : "Processando…"}</p>}
      {(error || notice) && !busy && (
        <p className={`map-feedback${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
          {busy && !file ? "Processando mapa…" : error || notice}
        </p>
      )}
      {file && details && (
        <div className="map-dialog-backdrop" role="presentation">
          <section className="map-dialog" role="dialog" aria-modal="true" aria-labelledby="map-preview-title">
            <p className="eyebrow">PRÉVIA DO CENÁRIO</p>
            <h2 id="map-preview-title">{map ? "Trocar mapa" : "Adicionar mapa"}</h2>
            <div className="map-preview-frame">
              <img src={previewUrl} alt={`Prévia do mapa ${file.name}`} />
            </div>
            <p className="map-file-details">
              {file.name} · {details.width} × {details.height} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
            {error && <p className="notice error" role="alert">{error}</p>}
            <div className="map-dialog-actions">
              <button type="button" onClick={() => { setFile(null); setDetails(null); setError(""); }} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="primary" onClick={() => void upload()} disabled={busy || disabled}>
                {busy ? "Enviando…" : map ? "Confirmar troca" : "Usar este mapa"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}