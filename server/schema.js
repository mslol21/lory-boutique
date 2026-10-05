const { run, query } = require('./db');

function createSchema() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'attendant')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS products (
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
    );`,

    `CREATE TABLE IF NOT EXISTS product_variations (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      sku TEXT UNIQUE,
      barcode TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS stock_movements (
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
    );`,

    `CREATE TABLE IF NOT EXISTS cash_registers (
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
    );`,

    `CREATE TABLE IF NOT EXISTS cash_movements (
      id TEXT PRIMARY KEY,
      register_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bleed', 'supply')),
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(register_id) REFERENCES cash_registers(id)
    );`,

    `CREATE TABLE IF NOT EXISTS sales (
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
    );`,

    `CREATE TABLE IF NOT EXISTS sale_items (
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
      returned_quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(variation_id) REFERENCES product_variations(id)
    );`,

    `CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('money', 'pix', 'debit', 'credit')),
      amount_cents INTEGER NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id)
    );`,

    `CREATE TABLE IF NOT EXISTS returns (
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
    );`,

    `CREATE TABLE IF NOT EXISTS return_items (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL,
      sale_item_id TEXT NOT NULL,
      variation_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      restocked INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(return_id) REFERENCES returns(id),
      FOREIGN KEY(sale_item_id) REFERENCES sale_items(id)
    );`,

    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );`
  ];

  for (const tableSql of tables) {
    run(tableSql);
  }

  // Create indexes for high performance
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_variations_product ON product_variations(product_id);`,
    `CREATE INDEX IF NOT EXISTS idx_variations_sku ON product_variations(sku);`,
    `CREATE INDEX IF NOT EXISTS idx_variations_barcode ON product_variations(barcode);`,
    `CREATE INDEX IF NOT EXISTS idx_sales_code ON sales(code);`,
    `CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);`,
    `CREATE INDEX IF NOT EXISTS idx_sales_register ON sales(register_id);`,
    `CREATE INDEX IF NOT EXISTS idx_stock_mov_var ON stock_movements(variation_id);`
  ];

  for (const idxSql of indexes) {
    run(idxSql);
  }
}

module.exports = { createSchema };
