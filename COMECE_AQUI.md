# Comece aqui — RPG Table

A implementação foi criada a partir do repositório `guituzi08-sketch/RPG-Table`, que continha somente `# RPG-Table` no README.

**Este pacote ainda não foi enviado ao GitHub.** A conexão conseguiu ler o repositório, mas a API recusou criar a árvore de arquivos com `403 Resource not accessible by integration`. Não existe pull request desta implementação. Nenhuma chave real foi incluída.

## Colocar o projeto no GitHub pelo navegador

1. Extraia este ZIP no computador.
2. Abra https://github.com/guituzi08-sketch/RPG-Table com uma conta que possa editar o repositório.
3. Na página **Code**, clique no seletor **main**, digite `feat/milestone-1-vtt` e escolha **Create branch**. Confirme que essa branch está selecionada.
4. Clique **Add file → Upload files**.
5. Arraste os arquivos e pastas DE DENTRO da pasta extraída para o upload, incluindo `.github`, `.gitignore` e `.env.example`. Não envie o ZIP nem uma pasta externa envolvendo todos os arquivos. `package.json` deve ficar na raiz, ao lado de README.md.
6. Se aparecerem arquivos novos de outras pessoas no repositório desde a análise, revise antes de substituir qualquer um. Na análise inicial, o único arquivo era README.md com o título.
7. Na mensagem do commit, escreva `Implementar Milestone 1 do VTT`. Clique **Commit changes**.
8. Clique **Compare & pull request**, confira **base: main** e **compare: feat/milestone-1-vtt**, e crie o pull request.
9. Aguarde **Validate MVP** passar. Confira os arquivos e use **Merge pull request → Confirm merge** quando quiser incorporar esta versão.
10. Siga o README: primeiro configure o Supabase; depois as duas variáveis públicas do GitHub e o Pages.

Se o upload web não incluir os arquivos começando com ponto, adicione-os pelo **Add file → Create new file**, usando os nomes exatos e o conteúdo do pacote. Os dois workflows ficam em `.github/workflows/ci.yml` e `.github/workflows/pages.yml`.

## O que foi verificado

- `npm ci` / instalação de dependências concluída.
- `npm run build` passou: TypeScript e build de produção.
- `npm test` passou: 10 testes de grid, permissões, isolamento, persistência e dados no PostgreSQL em PGlite.
- `git diff --check` passou.
- A inspeção visual em navegador não foi concluída: o ambiente não conseguiu instalar o Chromium.
- Auth, Realtime e o teste com dois jogadores em um Supabase real continuam pendentes.

Não marque o milestone como concluído até passar o teste de aceitação do README. A interface usa um mapa esquemático de Valdora, não a imagem da conversa anterior.
