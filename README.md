# RPG-Table

VTT em português para a campanha **O Rio que Não Deveria Correr**. React + TypeScript + Vite + PixiJS + Supabase. A voz fica no Discord.

## Estado do Milestone 1

Implementação inicial: criar/entrar em sala com código, autenticação anônima, mapa esquemático de Valdora, grid 32×24, tokens com dono, arraste com encaixe, zoom, câmera, posições persistentes, sincronização pelo Supabase Realtime, presença aproximada e rolagens compartilhadas d4–d100 com modificador.

**O milestone só estará concluído após configurar um projeto Supabase e passar no teste de dois navegadores abaixo.** Build e testes locais não comprovam uma conexão Realtime real. O mapa é um desenho esquemático original em PixiJS; a imagem da campanha ainda não foi incorporada.

## Arquitetura

- `src/App.tsx`: entrada, controles da mesa e rolagens.
- `src/game/Board.tsx`: desenho PixiJS, câmera e interação com tokens.
- `src/lib/client.ts`: autenticação e cliente Supabase.
- `src/lib/useRoom.ts`: assinatura Realtime, recuperação de snapshots e presença.
- `database/001_initial.sql`: quatro tabelas, RLS, funções de mutação e publicação Realtime.
- `tests/security.test.js`: testes PostgreSQL de permissões e persistência usando PGlite.

O banco é a fonte de verdade. Ao soltar um token, `move_token` verifica a permissão, salva a posição e o Realtime notifica os participantes. O arraste intermediário é local; a posição final é compartilhada. Na assinatura/reconexão, o cliente carrega novamente o estado salvo. Snapshots são serializados para evitar que respostas antigas sobrescrevam as novas. Em movimentos simultâneos autorizados, prevalece a última gravação.

Salas e dados só podem ser lidos por membros. Escrita direta é bloqueada: funções verificam a identidade e os parâmetros. O dono da sala move qualquer token; jogadores movem seus próprios tokens. Rolagens são geradas no PostgreSQL, sem aceitar um resultado informado pelo cliente. O código da sala funciona como convite: compartilhe apenas com o grupo.

Presença usa heartbeat no banco a cada 20 segundos e expira após 65 segundos; não é um indicador instantâneo de desconexão. Uma mesma identidade em várias abas aparece uma vez. Cada navegador mantém sua identidade anônima; limpar dados do site ou mudar de navegador perde esse acesso, inclusive o papel de mestre. Recuperação de conta e transferência de mestre ficam para uma próxima etapa.

## 1. Criar o Supabase

1. Abra https://supabase.com/dashboard e entre/crie sua conta.
2. Clique **New project**. Se necessário, crie uma organização no plano **Free**.
3. Nome: `rpg-table`. Gere e guarde a senha do banco; ela **não** entra no frontend.
4. Escolha a região disponível mais próxima do grupo e clique **Create new project**. Aguarde a criação.
5. Abra **Authentication → Sign In / Providers** (em algumas versões, **Providers**). Abra **Anonymous Sign-Ins**, ative **Allow anonymous sign-ins** e salve. Não é necessário login Google nem SMTP para este MVP.
6. Abra **SQL Editor → New query**. Copie TODO o conteúdo de [`database/001_initial.sql`](database/001_initial.sql), cole e clique **Run**. Execute uma vez, em um projeto novo. O script é transacional e cria tabelas, regras e a publicação Realtime. Não execute em um banco existente sem revisar conflitos.
7. Em **Project Settings → API Keys**, copie a chave **Publishable** (`sb_publishable_...`). Se o projeto só oferecer chaves antigas, a chave pública `anon` também funciona. **Nunca use `service_role`, `sb_secret_...` ou senha do banco.**
8. No diálogo **Connect** ou em **Project Settings → Data API**, copie **Project URL**, no formato `https://....supabase.co`.

As duas informações utilizadas pela aplicação são públicas por definição. A segurança depende do SQL e da autenticação, não de esconder essas duas variáveis. Não desative RLS.

## 2. Publicar no GitHub Pages

Depois de incorporar a branch de implementação na `main`:

1. Abra https://github.com/guituzi08-sketch/RPG-Table/settings/variables/actions . Se não tiver acesso a Settings, peça ao proprietário do repositório para fazer esta etapa.
2. Em **Variables → New repository variable**, crie:
   - `VITE_SUPABASE_URL` = Project URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave Publishable (ou pública `anon`).
3. Abra **Settings → Pages → Build and deployment → Source** e selecione **GitHub Actions**.
4. Abra **Actions → Publish GitHub Pages → Run workflow**, escolha `main` e confirme **Run workflow**.
5. Aguarde `build` e `deploy` ficarem verdes. Abra o endereço apresentado pelo job `deploy`. O endereço esperado é `https://guituzi08-sketch.github.io/RPG-Table/`.
6. Se alterar as variáveis, execute o workflow de novo: o Vite incorpora os valores durante o build.

O deploy é manual, para você escolher quando publicar. O workflow Validate MVP verifica testes e build em pull requests e pushes na main. Não há API paga de IA, servidor de voz nem domínio comprado. Verifique os limites do plano Free no painel Supabase antes de ampliar o público; não habilite cobrança sem necessidade.

## 3. Executar no computador ou Codespaces

Instale Node.js 22 ou superior. Na pasta do projeto:

```sh
npm ci
cp .env.example .env.local
```

No Windows, você pode duplicar `.env.example` pelo editor e renomear a cópia para `.env.local`. Preencha somente os dois valores públicos e execute:

```sh
npm run dev
```

Abra o endereço mostrado no terminal. No Codespaces, use **Ports → 5173 → Open in Browser**. Codespaces pode consumir a franquia/créditos da conta; ele não é necessário para jogar pelo Pages. Arquivos `.env*` reais são ignorados pelo Git.

## 4. Teste de aceitação com Rafael e Pestana

Use dois computadores ou dois perfis distintos do navegador. Duas abas do mesmo perfil compartilham a identidade anônima e não representam dois jogadores.

1. Rafael abre o site, informa o nome e clica **Criar uma nova mesa**.
2. Aguarda **Conectado**, copia o código de oito caracteres e envia ao Pestana.
3. Pestana abre o mesmo site, informa outro nome, cola o código e clica **Entrar na aventura**.
4. Ambos aparecem na lista. Cada um cria seu token, com nome e cor próprios.
5. Rafael arrasta o token e solta em outra casa. Pestana deve ver a posição final atualizar sem recarregar. Repita na direção oposta.
6. Pestana tenta mover um token do Rafael: não deve conseguir. Rafael, como mestre, pode mover ambos.
7. Pestana define modificador `5` e clica `d20`. Os dois veem o MESMO dado, modificador e total.
8. Recarregue o navegador, entre novamente pelo código e confira a persistência de posições e rolagens.
9. Desconecte a rede de um navegador, reconecte e confira se o estado é recuperado. Não considere alterações offline como salvas.
10. Um terceiro perfil cria outra sala: não deve receber tokens, participantes nem rolagens da primeira.

Somente após esse teste a conexão multiplayer está validada. Zoom com roda do mouse, câmera arrastando o fundo, centralização pelo botão. Rolagens exibem as 60 entradas mais recentes, preservando as anteriores no banco.

## Verificação automatizada

```sh
npm test
npm run build
```

PGlite executa o SQL real e verifica isolamento entre salas, bloqueio de escrita direta, permissões de tokens, limites do grid e rolagens. Ele simula `auth.uid()` e os papéis do Supabase; não emula Auth HTTP, WebSocket, replicação ou restrições específicas do serviço. O teste real acima continua obrigatório.

## Se algo falhar

- **Anonymous sign-ins are disabled:** habilite Anonymous Sign-Ins no Authentication.
- **Could not find the function / tabela inexistente:** execute a migration SQL no projeto correto.
- **Invalid API key / Failed to fetch:** confira URL/chave e refaça o deploy. Não inclua aspas nas variáveis do GitHub.
- **Conectando… / sala sem atualizar:** confira a rede e se `tokens`, `rolls`, `room_members` constam na publicação `supabase_realtime` em Database → Publications. O script já faz essa inclusão.
- **Projeto pausado:** reative-o no dashboard Supabase e recarregue o jogo.
- **Limite de requisições de login:** aguarde e reutilize a sessão existente. Não crie novas identidades continuamente.
- **Pages não aparece:** confirme que o PR foi incorporado na main e a fonte do Pages é GitHub Actions.

O MVP destina-se a um grupo privado. Não inclui moderação, expulsão, recuperação de conta ou proteção completa contra criação abusiva de identidades/salas. Há limites de 10 salas por identidade e 100 tokens por sala. Para abrir ao público, planeje proteção contra abuso/CAPTCHA e contas recuperáveis.

## Fora desta versão

Fichas, combate/iniciativa, inventário, fog of war, magias, upload/troca de mapa e IA integrada. O Discord funciona separadamente; nenhuma chave de Discord/OpenAI é necessária.
