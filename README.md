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
