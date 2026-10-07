import { lazy, Suspense, useState } from "react";
import { db, identify } from "./lib/client";
import { useRoom } from "./lib/useRoom";
import type { Room } from "./lib/types";
const Board = lazy(() => import("./game/Board"));

export default function App() {
  const [name, setName] = useState(localStorage.getItem("rpg-name") || ""),
    [code, setCode] = useState(localStorage.getItem("rpg-room") || ""),
    [title, setTitle] = useState("O Rio que Não Deveria Correr");
  const [room, setRoom] = useState<Room | null>(null),
    [userId, setUserId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tokenName, setTokenName] = useState(""),
    [color, setColor] = useState("#ddb876"),
    [modifier, setModifier] = useState(0);
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
  const move = async (id: string, x: number, y: number) => {
    // Do not retry a move automatically: a later player move may already be committed.
    try {
      const { error } = await db!.rpc("move_token", {
        p_token: id,
        p_x: x,
        p_y: y,
      });
      if (error) throw error;
      setError("");
    } catch (e) {
      setError(
        (e as { message: string }).message ||
          "Movimento não salvo. Tente novamente.",
      );
    }
  };
  const roll = (sides: number) =>
    perform(async () => {
      const { error } = await db!.rpc("roll_die", {
        p_room: room!.id,
        p_sides: sides,
        p_modifier: modifier,
      });
      if (error) throw error;
    });
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
              <p className="eyebrow">AO REDOR DA MESA</p>
              <div className={live.connected ? "status" : "status waiting"}>
                {live.connected ? "● Conectado" : "○ Conectando…"}
              </div>
              <ul className="members">
                {live.members.map((m) => (
                  <li key={m.user_id}>
                    <span className="avatar">{m.name.slice(0, 1)}</span>
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
              <p className="eyebrow">SEU PERSONAGEM</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(async () => {
                    const { error } = await db!.rpc("add_token", {
                      p_room: room.id,
                      p_name: tokenName.trim(),
                      p_color: color,
                    });
                    if (error) throw error;
                    setTokenName("");
                  });
                }}
              >
                <label>
                  Nome do token
                  <input
                    maxLength={32}
                    required
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="Ex.: Rafael"
                  />
                </label>
                <label className="color-row">
                  Cor da miniatura
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
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
              <Suspense
                fallback={
                  <div className="board-shell">Preparando o tabuleiro…</div>
                }
              >
                <Board
                  tokens={live.tokens}
                  userId={userId}
                  ownerId={room.owner_id}
                  disabled={!live.connected}
                  onMove={move}
                />
              </Suspense>
              <div className="dice-bar">
                <span>ROLE O DESTINO</span>
                <div className="dice-buttons">
                  {[4, 6, 8, 10, 12, 20, 100].map((d) => (
                    <button
                      key={d}
                      disabled={busy || !live.connected}
                      onClick={() => void roll(d)}
                    >
                      d{d}
                    </button>
                  ))}
                </div>
                <label>
                  Mod.
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
              </div>
            </section>
            <aside className="log">
              <p className="eyebrow">DIÁRIO DE ROLAGENS</p>
              <h2>O destino falou.</h2>
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
