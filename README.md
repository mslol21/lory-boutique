# 🌸 Lory Boutique — Sistema de Gestão de Vendas PDV & Vitrine Online

Sistema completo e integrado desenvolvido para a **Lory Boutique**, boutique de roupas femininas localizada em Guaianases, São Paulo/SP.

---

## 📌 Dados Oficiais Confirmados da Loja

- **Nome Fantasia:** Lory Boutique
- **Segmento:** Roupas Femininas
- **Endereço:** Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP
- **WhatsApp:** (11) 94961-1902
- **Link WhatsApp:** [https://wa.me/5511949611902](https://wa.me/5511949611902)
- **Instagram:** [@loryboutiquel](https://www.instagram.com/loryboutiquel/)
- **Canal Principal:** Venda no balcão da loja física
- **Operação:** Retirada na loja física (sem entregas ou frete nesta versão)
- **Campos Ausentes:** CNPJ, CEP e horários permanecem configuráveis pelo painel administrativo e ficam ocultos na vitrine pública até serem preenchidos.

---

## 🛠️ Arquitetura e Tecnologias

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide Icons.
- **Backend:** Node.js + Express 5 com arquitetura RESTful modular.
- **Banco de Dados Persistente:** SQLite com persistência em disco físico (`data/loryboutique.db`) via `sql.js`, garantindo integridade ACID, transações atômicas e portabilidade sem necessidade de compiladores externos C++/Python.
- **Autenticação e Segurança:** JWT com expiração de 12h, hash seguro de senhas com `bcryptjs`, controle de permissões por perfil (*RBAC*) e trilha de auditoria (*Audit Log*).

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- Node.js v18 ou superior instalado (testado no Node.js v20 LTS).

### Execução em Produção / Completa
```bash
# Na raiz do projeto:
npm start
```
O servidor Express inicializará em **`http://localhost:3001`**, servindo a API backend e a aplicação frontend React compilada em alta performance.

### Execução em Desenvolvimento (Opcional)
Se desejar rodar frontend e backend com *hot-reload*:
```bash
# Terminal 1 - Backend:
npm run server

# Terminal 2 - Frontend:
npm run client
```

### Executar Testes Automatizados
O projeto conta com uma suíte de testes de ponta a ponta que valida os 12 cenários de negócio exigidos:
```bash
npm test
```

---

## 🔑 Credenciais Padrão de Acesso

O banco de dados é inicializado automaticamente com duas contas pré-configuradas:

| Perfil | Usuário | Senha | Permissões |
|---|---|---|---|
| **Administrador** | `admin` | `admin123` | Acesso total: Vendas, Estoque, Preço de Custo, Margens, Cancelamentos, Usuários e Configurações |
| **Atendente** | `atendente` | `atendente123` | Frente de Caixa (PDV), Abertura/Fechamento de Caixa, Vendas e Catálogo. Preços de custo e relatórios estratégicos ficam protegidos. |

### Como Criar Novos Usuários
1. Faça login como **Administrador** (`admin`).
2. Acesse a aba **Ajustes** no menu superior.
3. Clique em **Equipe & Usuários** > **Novo Usuário**.
4. Defina nome, login, senha e o perfil desejado (*Atendente* ou *Administrador*).

---

## 📋 Módulos e Funcionalidades Implementadas

### 1. Frente de Caixa (PDV Balcão)
- **Busca Rápida:** Por nome, referência, SKU ou leitura de código de barras (leitor óptico compatível).
- **Seleção de Grade:** Escolha de tamanho e cor antes de inserir a peça no carrinho, com indicação visual de estoque.
- **Carrinho Dinâmico:** Ajuste de quantidades, aplicação de descontos em valor (R$) ou percentual (%), cliente opcional (sem cadastro obrigatório).
- **Múltiplas Formas de Pagamento:** Suporte a pagamentos divididos entre Dinheiro, Pix, Cartão de Débito e Cartão de Crédito.
- **Cálculo de Troco:** Calculado automaticamente apenas para pagamentos em dinheiro.
- **Proteção de Estoque & Concorrência:**
  - Travamento atômico no backend: impede estoque negativo mesmo em disputas simultâneas pela última unidade.
  - Idempotência: chave única por finalização para impedir duplicações por clique duplo.
  - Em caso de falha, o carrinho é mantido intacto com mensagem explicativa.
- **Comprovante Não Fiscal:** Layout formatado para impressora térmica (80mm) ou folha A4 com todos os detalhes da compra, peças, grade, discriminação de pagamento e dados da loja.

### 2. Gestão de Produtos & Estoque
- Cadastro completo: Nome, descrição, categoria, referência, fotos em alta resolução.
- Preço de custo protegido e visível **somente** para administradores.
- Grade flexível: Tamanhos por letras (P, M, G, GG) ou numeração (36, 38, 40, etc.) e cores personalizadas.
- Estoque mínimo configurável por variação com alerta visual.
- Histórico completo de movimentações com tipo (entrada, saída, ajuste de inventário), data, quantidade, responsável e justificativa.
- Proteção de histórico: Produtos com vendas associadas são arquivados para preservar os relatórios passados.

### 3. Controle de Caixa
- Abertura de caixa com valor inicial em dinheiro.
- Vendas da sessão atreladas automaticamente ao caixa aberto.
- Registro de **Sangrias** (retiradas) e **Suprimentos** (aportes) com motivo obrigatório.
- Fechamento com apuração detalhada: valor físico esperado em dinheiro vs valor contado pelo operador, indicando sobra ou falta.
- Separação clara entre saldo físico em espécie e entradas digitais (Pix, Débito e Crédito).

### 4. Vendas, Cancelamentos & Trocas
- Histórico com filtros por período, atendente, status e forma de pagamento.
- Reimpressão a qualquer momento do comprovante não fiscal.
- Cancelamento de vendas restrito ao administrador, com justificativa obrigatória e retorno automático das peças ao estoque.
- **Fluxo de Troca e Devolução:** Permite selecionar itens específicos da venda original, escolher se a peça retornará ao estoque vendável e selecionar novas peças, calculando a diferença a pagar ou a restituir sem risco de duplicidade de estorno.

### 5. Painel Gerencial (Dashboard)
- Faturamento bruto do dia, últimos 7 dias ou últimos 30 dias.
- Quantidade de atendimentos e ticket médio.
- **Margem Bruta Estimada:** Calculada com base no custo congelado no momento da venda, claramente diferenciada de faturamento.
- Gráfico de distribuição por meios de pagamento.
- Ranking das 5 peças mais vendidas.
- Alertas em tempo real de produtos com estoque baixo ou esgotado.
- Exportação de relatórios em formato CSV (compatível com Excel) para Vendas e Inventário de Estoque.

### 6. Vitrine Online
- Identidade visual feminina com paleta em tons de rosa suave, detalhes dourados discretos e fundo claro.
- Catálogo com filtros instantâneos por categoria, tamanho, cor e faixa de preço.
- Modal com galeria de fotos, especificações e disponibilidade de tamanhos e cores em estoque.
- **Lista de Peças de Interesse:** O cliente reúne peças de interesse e gera com 1 clique a consulta formatada para o WhatsApp oficial `(11) 94961-1902`.
- Aviso claro de que o contato via WhatsApp não reserva peças nem realiza cobrança, com orientação para retirada na loja física.
