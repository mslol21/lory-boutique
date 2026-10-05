-- LORY BOUTIQUE: estrutura inicial PostgreSQL / Supabase
-- Projeto: gnvvntwhoejliemcaqsf
-- Executar uma única vez no SQL Editor, usando o papel postgres.
-- Não cria produtos, vendas, caixa ou contas/senhas de exemplo.
-- Não migra dados SQLite e não conecta a API Express automaticamente.
-- Se já houver tabelas com estes nomes, a transação falha sem apagá-las.
-- Acesso direto pela chave pública permanece bloqueado; usar API autorizada.

BEGIN;
SET LOCAL search_path = public, pg_catalog;

CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL CHECK(role IN ('admin', 'attendant')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category_id TEXT,
      reference TEXT,
      cost_price_cents INTEGER NOT NULL DEFAULT 0,
      sale_price_cents INTEGER NOT NULL DEFAULT 0,
      promo_price_cents INTEGER,
      images TEXT,
      is_showcase INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

CREATE TABLE product_variations (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      sku TEXT UNIQUE,
      barcode TEXT,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      min_stock INTEGER NOT NULL DEFAULT 1 CHECK(min_stock >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

CREATE TABLE stock_movements (
      id TEXT PRIMARY KEY,
      variation_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out', 'adjust', 'sale', 'cancel', 'return', 'exchange_in', 'exchange_out')),
      quantity INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(variation_id) REFERENCES product_variations(id)
    );

CREATE TABLE cash_registers (
      id TEXT PRIMARY KEY,
      opened_by TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      initial_amount_cents INTEGER NOT NULL DEFAULT 0,
      closed_by TEXT,
      closed_at TEXT,
      counted_cash_cents INTEGER,
      expected_cash_cents INTEGER,
      difference_cents INTEGER,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
      FOREIGN KEY(opened_by) REFERENCES users(id)
    );

CREATE TABLE cash_movements (
      id TEXT PRIMARY KEY,
      register_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bleed', 'supply')),
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(register_id) REFERENCES cash_registers(id)
    );

CREATE TABLE sales (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      register_id TEXT,
      user_id TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      subtotal_cents INTEGER NOT NULL,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL,
      change_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'cancelled', 'returned_partial', 'returned_full')),
      cancellation_reason TEXT,
      cancelled_by TEXT,
      cancelled_at TEXT,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY(register_id) REFERENCES cash_registers(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

CREATE TABLE sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      variation_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_reference TEXT,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      cost_price_cents INTEGER NOT NULL DEFAULT 0,
      unit_price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK(returned_quantity >= 0 AND returned_quantity <= quantity),
      net_total_cents INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(variation_id) REFERENCES product_variations(id)
    );

CREATE TABLE sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('money', 'pix', 'debit', 'credit')),
      amount_cents INTEGER NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id)
    );

CREATE TABLE returns (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('return', 'exchange')),
      return_amount_cents INTEGER NOT NULL,
      restock_items INTEGER NOT NULL DEFAULT 1,
      reason TEXT NOT NULL,
      difference_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id)
    );

CREATE TABLE return_items (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL,
      sale_item_id TEXT NOT NULL,
      variation_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      restocked INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(return_id) REFERENCES returns(id),
      FOREIGN KEY(sale_item_id) REFERENCES sale_items(id)
    );

CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

CREATE TABLE store_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

ALTER TABLE sales ADD COLUMN request_hash TEXT;

ALTER TABLE sales ADD COLUMN exchange_credit_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE returns ADD COLUMN idempotency_key TEXT;

ALTER TABLE returns ADD COLUMN request_hash TEXT;

ALTER TABLE returns ADD COLUMN exchange_sale_id TEXT REFERENCES sales(id);

CREATE TABLE financial_entries (
    id TEXT PRIMARY KEY, register_id TEXT NOT NULL REFERENCES cash_registers(id),
    sale_id TEXT NOT NULL REFERENCES sales(id), return_id TEXT REFERENCES returns(id),
    kind TEXT NOT NULL CHECK(kind IN ('sale','refund','cancel','exchange_credit')),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('money','pix','debit','credit')),
    amount_cents INTEGER NOT NULL ,
    created_at TEXT NOT NULL
  );

CREATE UNIQUE INDEX idx_returns_key ON returns(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX idx_one_open_cash ON cash_registers(status) WHERE status='open';

CREATE INDEX idx_variations_product ON product_variations(product_id);

CREATE INDEX idx_variations_sku ON product_variations(sku);

CREATE INDEX idx_variations_barcode ON product_variations(barcode);

CREATE INDEX idx_sales_code ON sales(code);

CREATE INDEX idx_sales_created ON sales(created_at);

CREATE INDEX idx_sales_register ON sales(register_id);

CREATE INDEX idx_stock_mov_var ON stock_movements(variation_id);

-- Apenas configurações da loja.
INSERT INTO public.store_settings (key, value) VALUES
  ('store_name', 'Lory Boutique'),
  ('segment', 'Roupas Femininas'),
  ('address', 'Rua Hipólito de Camargo, 45 — Guaianases, São Paulo/SP'),
  ('whatsapp', '(11) 94961-1902'),
  ('whatsapp_raw', '5511949611902'),
  ('instagram', 'https://www.instagram.com/loryboutiquel/'),
  ('instagram_handle', '@loryboutiquel'),
  ('operation_model', 'Retirada na loja física (sem entregas no momento)'),
  ('cnpj', ''),
  ('cep', ''),
  ('business_hours', ''),
  ('attendant_discount_percent', '0'),
  ('demo_mode', '0');

-- Sem permissões de leitura ou escrita para visitantes e sessões do navegador.
-- Custos, senhas, clientes, caixa e relatórios só devem passar pela API.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.categories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.products FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.products TO service_role;

ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_variations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_variations TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stock_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_movements TO service_role;

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cash_registers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cash_registers TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cash_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cash_movements TO service_role;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales TO service_role;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sale_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_items TO service_role;

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sale_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_payments TO service_role;

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.returns FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.returns TO service_role;

ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.return_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.return_items TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_settings TO service_role;

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financial_entries TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Resultado esperado em banco novo: 15 tabelas protegidas, 0 produtos,
-- 0 variações, 0 vendas, 0 caixas e 0 usuários operacionais.
SELECT
  (SELECT count(*) FROM public.products) AS produtos,
  (SELECT count(*) FROM public.product_variations) AS variacoes,
  (SELECT count(*) FROM public.sales) AS vendas,
  (SELECT count(*) FROM public.cash_registers) AS caixas,
  (SELECT count(*) FROM public.users) AS usuarios,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('users','categories','products','product_variations','stock_movements','cash_registers','cash_movements','sales','sale_items','sale_payments','returns','return_items','audit_logs','store_settings','financial_entries')
   AND c.relkind='r' AND c.relrowsecurity) AS tabelas_com_rls;
