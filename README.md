# Lory Boutique — PDV e vitrine

Sistema para a loja de roupas femininas da Rua Hipólito de Camargo, 45, Guaianases/SP. WhatsApp (11) 94961-1902; Instagram @loryboutiquel. Operação de balcão e consulta de peças para retirada, sem entrega ou pagamento online.

## Instalação sem produtos

Uma instalação nova começa com **zero produtos, zero variações, zero vendas e zero sessões de caixa**. Não existem seeds de mercadorias ou contas com senhas públicas. Os produtos precisam ser cadastrados pela loja.

Requisito: **Node.js >=22.16**, recomendado Node.js 24 LTS. O banco utiliza `node:sqlite` diretamente em disco, WAL, `synchronous=FULL`, transações e chaves estrangeiras.

```bash
npm ci
npm --prefix client ci
npm run setup
npm run build
npm start
```

`npm run setup` cria um segredo privado em `.env` e, se necessário, um administrador. A senha aleatória inicial é exibida **apenas no terminal dessa configuração**: guarde-a em um gerenciador de senhas. Não publique `.env`, logs de configuração ou arquivos do banco. Para definir credenciais próprias antes de executar setup, use `ADMIN_USERNAME`, `ADMIN_NAME` e `ADMIN_PASSWORD` (mínimo 12 caracteres). Não há login rápido de demonstração.

Depois, acesse http://localhost:3001 e clique em Área da Equipe. Em Produtos, crie categorias, cadastre peças e envie fotos. Estoque inicial começa em zero; preencha somente quantidades conferidas. Abra o caixa antes de vender.

Se já existe administrador com senha própria, setup preserva seu acesso. Contas antigas com as senhas públicas de demonstração são desativadas. `npm run admin:create` também permite provisionar um administrador a partir das variáveis de ambiente, sem criar produtos.

## Conversão da versão antiga

Se um banco existente estiver explicitamente marcado como `demo_mode=1`, a primeira inicialização cria um backup privado em `data/backups/` e remove os produtos, estoque, vendas, devoluções e caixas demonstrativos. Depois grava `demo_mode=0`. Essa limpeza ocorre uma vez; **cadastros feitos posteriormente não são apagados no reinício**.

Dados operacionais não ficam no Git. O arquivo antigo removido continua presente em commits históricos; não use versões antigas para operar a loja. Esta migração foi projetada para o banco demonstrativo do repositório. Um banco legado com operações reais precisa de backup e conciliação antes de adotar o novo livro financeiro; não marque dados reais como demonstração.

## Operação e permissões

- Administrador: cadastrar/editar produtos e grade, fotos, categorias, movimentações de estoque, usuários, descontos, cancelamentos e devoluções/trocas.
- Atendente: vender sem desconto, consultar produtos sem custo, consultar vendas e operar caixa.
- Pagamentos são registrados manualmente. Selecionar Pix/cartão **não confirma uma cobrança externa**.
- Restituições e diferenças de troca exigem conferência manual, método de pagamento e caixa aberto. A troca cria uma nova venda vinculada e preserva preços/custos históricos.
- Uma devolução considera o desconto efetivamente aplicado. Restituições em dinheiro não podem exceder o saldo físico disponível; registre um suprimento quando necessário.
- Cancelamento restitui os recebimentos nas formas registradas, no caixa atual, e exige conferência do operador. Vendas com troca/devolução devem usar o fluxo de devolução, para evitar estorno duplicado.
- Vendas e ajustes usam chave estável; uma retentativa recupera a mesma operação. Rascunhos locais não substituem o banco.
- Comprovantes são não fiscais; impressão e consulta de histórico não processam pagamentos.
- Receita líquida do painel se refere às vendas do período após suas devoluções. Recebimentos líquidos se referem aos movimentos financeiros ocorridos no período; os dois podem diferir por restituições de vendas antigas.

## Persistência e backup

Banco e fotos ficam em `data/`, excluído do versionamento. É necessário servidor Node e **disco persistente**. Não use discos efêmeros nem cópias independentes do banco em diferentes servidores. Conexões no mesmo arquivo usam bloqueio transacional do SQLite.

```bash
npm run backup
```

O comando cria uma cópia consistente do banco em `data/backups/`. Copie também `data/uploads/` para proteger as fotos. Guarde os backups fora do servidor. Para restaurar: pare o servidor, preserve os arquivos atuais, remova os arquivos WAL/SHM antigos da instalação parada, restaure o banco e as fotos, reinicie e confira os saldos. Banco corrompido bloqueia a inicialização; não é sobrescrito por um banco vazio.

## Desenvolvimento e testes

```bash
npm run server
npm run client
```

Frontend em http://localhost:3000 com proxy para a API em 3001.

```bash
npm test
npm run test:ui
npm run build
npm --prefix client run lint
```

A suíte cria exclusivamente um banco temporário, credenciais aleatórias e fixtures efêmeras; depois remove tudo. Nunca popula o banco da loja. Verifica inicialização vazia, permissões, última unidade simultânea, centavos, descontos, troco, devoluções, trocas, retentativas e leitura da venda confirmada por outro processo.

Antes da operação real, confira as informações comerciais, configure HTTPS e backup externo e faça um teste no balcão com os equipamentos utilizados. Nenhuma integração fiscal ou de adquirente está incluída.

## Publicação online: Vercel + Supabase PostgreSQL

O frontend usa `/api` no mesmo domínio. A API Express agora é publicada pela
função `api/index.js`; ela acessa diretamente o PostgreSQL via `pg` e mantém as
mesmas contas de usuário/senha do PDV. Não usa contas do painel **Supabase Auth**.
As chaves públicas do Supabase não substituem a conexão PostgreSQL do servidor.

1. No SQL Editor do projeto `gnvvntwhoejliemcaqsf`, execute
   `supabase/sql/01_initial.sql` **uma única vez** em banco novo. Caso já tenha
   executado o arquivo `Lory_Boutique_Supabase.sql`, pule esta etapa.
2. Execute `supabase/sql/02_online.sql`. Esse complemento pode ser repetido:
   adiciona fotos persistentes e o controle de tentativas de login, sem inserir
   produtos ou contas de exemplo.
3. Na Vercel, use a raiz do repositório (Root Directory vazio), Node.js 24,
   Framework **Other**, instalação `npm ci && npm --prefix client ci`, build
   `npm run build` e output `client/dist`. O arquivo `vercel.json` configura as
   rotas para `/api`, `/uploads` e o frontend.
4. Em **Settings → Environment Variables**, configure somente no ambiente
   **Production**:

   | Variável         | Valor                                                                                                                                                                                                     |
   | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`   | Supabase **Connect → Session pooler → URI** (porta 5432), substituindo o marcador da senha pela senha do banco; codifique caracteres especiais da senha para URL. O Transaction pooler também é compatível. |
   | `JWT_SECRET`     | Segredo aleatório com pelo menos 32 caracteres. Gere no terminal com `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.                                                     |
   | `ADMIN_USERNAME` | `admin` (ou outro usuário escolhido).                                                                                                                                                                     |
   | `ADMIN_PASSWORD` | Sua senha inicial, com pelo menos 12 caracteres.                                                                                                                                                          |
   | `ADMIN_NAME`     | `Administrador Lory` (opcional).                                                                                                                                                                          |

   Essas variáveis são privadas do servidor. **Nunca** coloque prefixos
   `VITE_`/`NEXT_PUBLIC_` nelas, nem salve os valores no GitHub. Preview deve
   usar outro banco se desejar testar a API sem afetar a loja.

5. Faça **Redeploy**. A primeira inicialização cria o administrador definido
   no ambiente, se ele ainda não existir, e preserva administradores reais
   existentes. Alterar `ADMIN_PASSWORD` depois não redefine contas existentes;
   use a gestão de usuários para mudar senhas.
6. Confira `https://loryboutique.vercel.app/api/health`. Quando o banco e os
   scripts estiverem configurados, deve responder
   `{"status":"ok","database":"postgresql"}`. Depois entre na Área da Equipe
   com o usuário e a senha definidos no passo 4.

As tabelas operacionais permanecem protegidas por RLS e sem acesso direto para
`anon` e `authenticated`. A API verifica a conta e o perfil antes de expor dados
ou alterar a loja. Não resolva erros de acesso liberando custos, clientes,
caixa ou hashes de senha para a chave pública.

Cada operação comercial usa uma transação no mesmo cliente PostgreSQL. Um lock
transacional da loja serializa vendas, estoque e caixa entre instâncias da
Vercel. Respostas de sucesso só são enviadas após o commit. Falhas de conexão
retornam erro temporário, preservando a chave da operação pendente no PDV.
Fotos de até 2,5 MB ficam no PostgreSQL, de forma persistente; versões antigas
SQLite continuam lendo os arquivos de fotos existentes. Para volumes maiores,
planeje migrar imagens para Storage. Não há preenchimento automático de produtos.

O servidor inclui o certificado público **Supabase Root 2021 CA** para conexões
com domínios `*.supabase.com` e `*.supabase.co`, com validação de certificado e
nome do servidor ativa. Fonte: [certificado oficial](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt),
usado pelo painel do Supabase. Validade até 26/04/2031. Para substituir o CA,
configure `DATABASE_CA_CERT` com o conteúdo PEM completo e faça Redeploy.
Nenhuma chave privada acompanha esse certificado.

`npm test` usa SQLite temporário e nunca utiliza `DATABASE_URL` real. A CI também
executa a suíte com um PostgreSQL 17 descartável em localhost através de
`LORY_TEST_DATABASE_URL`; bancos remotos são rejeitados nesse modo. Para backup
online, use `pg_dump`/backups do Supabase. `npm run backup` é apenas para SQLite.


## Gestão no painel

- **Produtos e estoque:** cadastro/edição, preços, custos, fotos, tamanhos, cores, estoque mínimo, entrada/ajuste com histórico e arquivamento.
- **Categorias:** criar e renomear em Ajustes → Categorias sem perder produtos vinculados.
- **Equipe:** criar, editar nome/login/perfil, redefinir senha e ativar/desativar acessos. Senha vazia na edição preserva a atual. Alterações revogam sessões anteriores; ao editar o próprio usuário, entre novamente. Não é permitido remover o próprio acesso de administrador nem deixar a loja sem administrador ativo.
- **Loja:** nome, endereço, WhatsApp, Instagram, CNPJ, CEP e horários. Dados opcionais preenchidos aparecem na vitrine.
- **Painel:** hoje, últimos 7/30 dias ou datas personalizadas; receita líquida, ticket, margem estimada, recebimentos e alertas. Exportação de vendas segue o período selecionado; estoque exporta a posição atual.
- **Vendas e caixa:** pagamentos, descontos conforme permissão, abertura/fechamento, suprimentos/sangrias, devoluções e trocas. Vendas concluídas preservam o histórico; correções financeiras passam por cancelamento/devolução/troca.

O escopo é PDV e estoque de uma loja. Não inclui contas a pagar/receber independentes, compras de fornecedores, folha de pagamento ou emissão de nota fiscal.

## Aplicativo para computador e celular (PWA)

Abra https://loryboutique.vercel.app e toque em **Instalar app**.
No computador, use Chrome/Edge; no Android, Chrome; no iPhone/iPad,
Safari → Compartilhar → Adicionar à Tela de Início. A disponibilidade da
instalação automática depende do navegador. O app abre em janela própria,
usa a logo da boutique e mantém o mesmo login e banco do site.

O service worker guarda somente a interface e os recursos estáticos.
APIs, sessões e operações comerciais não são armazenadas no cache do app.
Vendas, caixa e alterações de estoque exigem internet; não há sincronização
posterior de vendas offline. Ao receber uma atualização, feche e abra o app.
