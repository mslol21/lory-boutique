# Lory Boutique — migração controlada do Supabase para Neon

## Estado inicial (2026-11-11)
- Repositório: `mslol21/lory-boutique`; API Node/Express usa `pg`, sem dependência de Supabase Auth.
- Origem: Supabase `gnvvntwhoejliemcaqsf` (projeto identificado como INACTIVE ao consultar a API).
- Destino: Neon projeto `spring-glitter-36478742`, banco `lory_boutique` (17 tabelas criadas).
- Estrutura no Neon criada a partir de `supabase/sql/01_initial.sql` e `02_online.sql`, sem comandos específicos de permissões Supabase.
- Ainda NÃO foram importados dados operacionais, criadas contas ou modificadas variáveis de produção.

## Preservação de dados: etapa obrigatória
1. Reativar temporariamente o Supabase de origem e realizar um backup íntegro, incluindo dados, índices, tabelas e imagens em `uploaded_images`.
2. Registrar contagens por tabela e conciliar usuários, categorias, produtos, variações, estoque, vendas, itens, pagamentos, devoluções, caixa, registros financeiros, auditoria e fotos.
3. Importar em uma janela sem novas vendas, para evitar divergência de estoque/caixa. Não executar o seed de uma instalação nova sobre um banco que possua dados reais.
4. Fazer comparação tabela a tabela e testar o login administrativo, consulta da vitrine, abertura de caixa e venda de teste reversível em ambiente de homologação.
5. Apenas depois, ajustar `DATABASE_URL` na Vercel para a URI **pooled** do Neon com TLS. Não expor a URI no Git ou no frontend. Preservar `JWT_SECRET` existente para manter a validação dos tokens e as credenciais de usuários.
6. Validar `GET /api/health` (deve retornar `postgresql`), catálogos públicos, imagens, login, rotinas de estoque e fechamento de caixa.
7. Manter origem e backup intactos por um período de observação. Não excluir o Supabase antes de confirmar que os dados e o funcionamento estão corretos.

## Compatibilidade técnica
- O driver `pg` já é utilizado em `server/db.js`. O código seleciona PostgreSQL quando `DATABASE_URL` existe, independentemente de ser Neon ou Supabase.
- A conexão Neon utiliza TLS; não configure `DATABASE_CA_CERT` apontando para o certificado antigo do Supabase.
- Em Vercel, nunca operar o SQLite local: arquivos em disco são efêmeros.
- O banco Neon é de um cliente: não misture as tabelas com outros produtos da Konnexy.

## Bloqueio de conclusão
Quando a origem estiver INACTIVE, não é possível certificar uma migração de dados reais. O banco Neon com 0 usuários, 0 produtos e 0 vendas representa uma estrutura pronta, **não** uma migração concluída.
