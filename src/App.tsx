import { lazy, Suspense, useState } from "react";
import { db, identify } from "./lib/client";
import { useRoom } from "./lib/useRoom";
import type { Room, TokenSilhouette } from "./lib/types";
import MapManager from "./game/MapManager";
const Board = lazy(() => import("./game/Board"));
const MiniaturePreview = lazy(() => import("./game/MiniaturePreview"));
const outfitPalette = [
  { name: "Vermelho", color: "#934640" },
  { name: "Azul", color: "#4e738a" },
  { name: "Verde", color: "#54774f" },
  { name: "Roxo", color: "#765477" },
  { name: "Preto", color: "#292b2a" },
  { name: "Branco", color: "#e1d6b8" },
  { name: "Dourado", color: "#c8a45e" },
  { name: "Marrom", color: "#76533a" },
] as const;
const silhouettes: { value: TokenSilhouette; name: string }[] = [
  { value: "masculine", name: "Homem" },
  { value: "feminine", name: "Mulher" },
];

export default function App() {
  const [name, setName] = useState(localStorage.getItem("rpg-name") || ""),
    [code, setCode] = useState(localStorage.getItem("rpg-room") || ""),
    [title, setTitle] = useState("O Rio que Não Deveria Correr");
  const [room, setRoom] = useState<Room | null>(null),
    [userId, setUserId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tokenName, setTokenName] = useState(""),
    [color, setColor] = useState("#c8a45e"),
    [silhouette, setSilhouette] = useState<TokenSilhouette>("masculine"),
    [modifier, setModifier] = useState(0);
  const [rollingSides, setRollingSides] = useState<number | null>(null);
  const live = useRoom(room);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message ||
              "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const enter = (create: boolean) =>
    perform(async () => {
      if (!name.trim()) throw new Error("Digite seu nome.");
      const uid = await identify();
      setUserId(uid);
      const { data, error } = await db!.rpc(
        create ? "create_room" : "join_room",
        create
          ? { p_title: title.trim(), p_name: name.trim() }
          : { p_code: code.trim(), p_name: name.trim() },
      );
      if (error) throw error;
      const joined = (Array.isArray(data) ? data[0] : data) as Room | undefined;
      if (!joined?.id)
        throw new Error(
          "O servidor não retornou a sala. Confira a configuração do banco.",
        );
      localStorage.setItem("rpg-name", name.trim());
      localStorage.setItem("rpg-room", joined.code);
      setCode(joined.code);
      setRoom(joined);
    });
  const move = async (id: string, x: number, y: number): Promise<boolean> => {
    // Do not retry a move automatically: a later player move may already be committed.
    try {
      const { error } = await db!.rpc("move_token_on_map", {
        p_token: id,
        p_x: x,
        p_y: y,
      });
      if (error) throw error;
      setError("");
      return true;
    } catch (e) {
      setError(
        (e as { message: string }).message ||
          "Movimento não salvo. Tente novamente.",
      );
      return false;
    }
  };
  const roll = (sides: number) => {
    setRollingSides(sides);
    void perform(async () => {
      const { error } = await db!.rpc("roll_die", {
        p_room: room!.id,
        p_sides: sides,
        p_modifier: modifier,
      });
      if (error) throw error;
    }).finally(() => {
      window.setTimeout(() => {
        setRollingSides((current) => (current === sides ? null : current));
      }, 850);
    });
  };
  return (
    <div className="app">
      <header>
        <a className="brand" href="./">
          <span className="brand-mark">⬡</span> RPG TABLE
        </a>
        <span className="edition">UMA MESA. MUITAS HISTÓRIAS.</span>
        {room && (
          <button
            onClick={() => {
              setRoom(null);
              setError("");
            }}
          >
            Sair da mesa
          </button>
        )}
      </header>
      {!room ? (
        <main className="lobby">
          <section className="intro">
            <p className="eyebrow">SEU PRÓXIMO CAPÍTULO</p>
            <h1>
              A aventura começa
              <br />
              <em>à sua mesa.</em>
            </h1>
            <p className="lede">
              Reúna o grupo. Cruze o Eren. Descubra o que espera sob Valdora.
            </p>
            <div className="map-art">
              <div className="river" />
              <span className="map-label">V A L D O R A</span>
              <i className="pin one">R</i>
              <i className="pin two">P</i>
              <span className="map-note">O RIO QUE NÃO DEVERIA CORRER</span>
            </div>
            <p className="small">
              Tabuleiro compartilhado · Dados ao vivo · Voz pelo Discord
            </p>
          </section>
          <section className="entry">
            <p className="eyebrow">PREPARE SUA JORNADA</p>
            <h2>Um lugar para o seu grupo.</h2>
            <label>
              Como podemos chamar você?
              <input
                maxLength={32}
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome de aventureiro"
              />
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enter(false);
              }}
            >
              <label>
                Código da sala
                <input
                  className="code-input"
                  maxLength={8}
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value.toUpperCase().replace(/[^A-F0-9]/g, ""),
                    )
                  }
                  placeholder="Ex.: A7C12F90"
                />
              </label>
              <button
                className="primary"
                disabled={busy || !db || code.length !== 8}
              >
                Entrar na aventura <span>↗</span>
              </button>
            </form>
            <div className="divider">OU INICIE SUA HISTÓRIA</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enter(true);
              }}
            >
              <label>
                Nome da campanha
                <input
                  maxLength={80}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <button disabled={busy || !db} className="secondary">
                Criar uma nova mesa +
              </button>
            </form>
            {!db && (
              <p className="notice">
                Falta conectar o Supabase. Siga o guia de configuração no README
                do repositório. As salas ficarão disponíveis depois dessa etapa.
              </p>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <p className="small">
              Seu acesso é salvo neste navegador. Guarde o código da sala e
              evite limpar os dados do site.
            </p>
          </section>
        </main>
      ) : (
        <main className="table">
          <div className="table-heading">
            <div>
              <p className="eyebrow">
                {room.owner_id === userId ? "MESTRE DA MESA" : "AVENTUREIRO"}
              </p>
              <h1>{room.title}</h1>
            </div>
            <div className="room-code">
              <span>CÓDIGO DA SALA</span>
              <strong>{room.code}</strong>
              <button
                onClick={() =>
                  void perform(async () => {
                    await navigator.clipboard.writeText(room.code);
                  })
                }
              >
                Copiar
              </button>
            </div>
          </div>
          <div className="table-layout">
            <aside>
              <div className="panel-heading">
                <span className="panel-symbol" aria-hidden="true">♟</span>
                <div>
                  <p className="eyebrow">AO REDOR DA MESA</p>
                  <small>{live.members.length} na mesa</small>
                </div>
              </div>
              <div className={live.connected ? "status" : "status waiting"}>
                {live.connected ? "● Conectado" : "○ Conectando…"}
              </div>
              <ul className="members">
                {live.members.map((m) => (
                  <li
                    key={m.user_id}
                    className={m.user_id === userId ? "is-current-player" : undefined}
                  >
                    <span
                      className="avatar"
                      style={{
                        borderColor: live.tokens.find((token) => token.owner_id === m.user_id)?.color,
                      }}
                    >
                      {m.name.slice(0, 1)}
                    </span>
                    <span>
                      {m.name}
                      {m.user_id === userId ? " (você)" : ""}
                      <small>
                        {m.user_id === room.owner_id ? "Mestre" : "Jogador"}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="small">
                Presença atualizada a cada 20 s; a saída pode levar até 65 s.
              </p>
              <hr />
              <div className="panel-heading">
                <span className="panel-symbol" aria-hidden="true">◉</span>
                <div>
                  <p className="eyebrow">SEU PERSONAGEM</p>
                  <small>Miniatura da mesa</small>
                </div>
              </div>
              <div className="character-preview-card">
                <Suspense fallback={<div className="miniature-preview-canvas" aria-hidden="true" />}>
                  <MiniaturePreview
                    name={tokenName.trim() || "Aventureiro"}
                    color={color}
                    silhouette={silhouette}
                  />
                </Suspense>
                <div>
                  <span>PRÉVIA DA PEÇA</span>
                  <strong>{tokenName.trim() || "Aventureiro"}</strong>
                  <small>{silhouette === "masculine" ? "Homem" : "Mulher"} · acabamento pintado</small>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(async () => {
                    const { error } = await db!.rpc("add_token", {
                      p_room: room.id,
                      p_name: tokenName.trim(),
                      p_color: color,
                      p_silhouette: silhouette,
                    });
                    if (error) throw error;
                    setTokenName("");
                  });
                }}
              >
                <label>
                  Nome do personagem
                  <input
                    maxLength={32}
                    required
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="Ex.: Aragorn"
                  />
                </label>
                <fieldset className="character-fieldset">
                  <legend>Aparência</legend>
                  <div className="silhouette-options">
                    {silhouettes.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`silhouette-option${silhouette === option.value ? " is-selected" : ""}`}
                        aria-pressed={silhouette === option.value}
                        onClick={() => setSilhouette(option.value)}
                      >
                        <span
                          className={`silhouette-icon silhouette-icon-${option.value}`}
                          aria-hidden="true"
                        >
                          <i className="silhouette-head" />
                          <i className="silhouette-body" />
                          <i className="silhouette-arm silhouette-arm-left" />
                          <i className="silhouette-arm silhouette-arm-right" />
                          <i className="silhouette-leg silhouette-leg-left" />
                          <i className="silhouette-leg silhouette-leg-right" />
                        </span>
                        {option.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="character-fieldset outfit-fieldset">
                  <legend>Cor da roupa</legend>
                  <div className="outfit-palette" aria-label="Cores disponíveis">
                    {outfitPalette.map((option) => (
                      <button
                        key={option.name}
                        type="button"
                        className={`outfit-swatch${color === option.color ? " is-selected" : ""}`}
                        aria-label={option.name}
                        aria-pressed={color === option.color}
                        title={option.name}
                        onClick={() => setColor(option.color)}
                      >
                        <span style={{ backgroundColor: option.color }} />
                      </button>
                    ))}
                  </div>
                  <label className="color-row">
                    Personalizar cor
                    <input
                      type="color"
                      aria-label="Personalizar cor da roupa"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </label>
                </fieldset>
                <button
                  className="secondary"
                  disabled={busy || !live.connected}
                >
                  + Adicionar token
                </button>
              </form>
              <p className="small">
                Arraste seu token. Use a roda do mouse para ampliar e arraste o
                fundo para mover a câmera.
              </p>
            </aside>
            <section className="map-column">
              <div className="board-stage">
                <Suspense fallback={<div className="board-shell">Preparando o tabuleiro…</div>}>
                  <Board
                    tokens={live.tokens}
                    map={live.map}
                    gridEnabled={live.map?.gridEnabled ?? false}
                    gridSize={live.map?.gridSize ?? 64}
                    userId={userId}
                    ownerId={room.owner_id}
                    disabled={!live.connected}
                    onMove={move}
                  />
                </Suspense>
                <MapManager
                  roomId={room.id}
                  map={live.map}
                  canManage={room.owner_id === userId}
                  disabled={!live.connected}
                />
              </div>
              <section className="dice-bar" aria-label="Dados da mesa">
                <div className="dice-heading">
                  <p className="eyebrow">ROLE O DESTINO</p>
                  <h2>Dados da mesa</h2>
                </div>
                <div className="dice-buttons">
                  {[4, 6, 8, 10, 12, 20, 100].map((d) => (
                    <button
                      key={d}
                      className={`die-button${rollingSides === d ? " is-rolling" : ""}`}
                      disabled={busy || !live.connected}
                      onClick={() => void roll(d)}
                      aria-label={`Rolar d${d}`}
                      title={`Rolar d${d}`}
                    >
                      <span className={`die-shape die-${d}`} aria-hidden="true" />
                      <span className="die-caption">d{d}</span>
                    </button>
                  ))}
                </div>
                <label className="modifier-control">
                  <span>Modificador</span>
                  <input
                    aria-label="Modificador da rolagem"
                    type="number"
                    min={-100}
                    max={100}
                    value={modifier}
                    onChange={(e) =>
                      setModifier(
                        Math.max(
                          -100,
                          Math.min(
                            100,
                            Math.trunc(Number(e.target.value) || 0),
                          ),
                        ),
                      )
                    }
                  />
                </label>
                {live.rolls[0] && (
                  <div
                    className={`last-roll${
                      live.rolls[0].sides === 20 && live.rolls[0].result === 20
                        ? " is-critical"
                        : live.rolls[0].sides === 20 && live.rolls[0].result === 1
                          ? " is-fumble"
                          : ""
                    }`}
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span>
                      {live.rolls[0].sides === 20 && live.rolls[0].result === 20
                        ? "CRÍTICO · D20"
                        : live.rolls[0].sides === 20 && live.rolls[0].result === 1
                          ? "FALHA CRÍTICA · D20"
                          : "ÚLTIMO RESULTADO"}
                    </span>
                    <strong>{live.rolls[0].result + live.rolls[0].modifier}</strong>
                    <small>
                      {live.rolls[0].player_name} · d{live.rolls[0].sides} · face {live.rolls[0].result}
                      {live.rolls[0].modifier === 0
                        ? ""
                        : ` ${live.rolls[0].modifier > 0 ? "+" : "−"} ${Math.abs(live.rolls[0].modifier)}`}
                    </small>
                  </div>
                )}
              </section>
            </section>
            <aside className="log">
              <p className="eyebrow">DIÁRIO DA MESA</p>
              <h2>Livro de rolagens</h2>
              {live.rolls.length === 0 ? (
                <p className="small">
                  As rolagens de todos aparecem aqui. Que os dados estejam a seu
                  favor.
                </p>
              ) : (
                <ol>
                  {live.rolls.map((r) => (
                    <li key={r.id}>
                      <div>
                        <strong>{r.player_name}</strong>
                        <time>
                          {new Date(r.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p>
                        1d{r.sides} {r.modifier < 0 ? "−" : "+"}{" "}
                        {Math.abs(r.modifier)} <b>→ {r.result + r.modifier}</b>
                      </p>
                      <small>Dado: {r.result}</small>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </div>
          {(error || live.error) && (
            <p role="alert" className="notice error">
              {error || live.error}
            </p>
          )}
        </main>
      )}
      <footer>
        RPG TABLE <span>Fantasia compartilhada. Histórias de verdade.</span>
        <span>MILESTONE 01</span>
      </footer>
    </div>
  );
}
