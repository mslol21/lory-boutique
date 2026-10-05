const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { get, query, run, transaction } = require('../db');
const { authenticate, requireRole, logAudit } = require('../middleware/auth');

// List categories
router.get('/categories', authenticate, (req, res) => {
  const cats = query('SELECT * FROM categories ORDER BY name ASC');
  return res.json(cats);
});

// Create category
router.post('/categories', authenticate, requireRole('admin'), (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
  }

  const existing = get('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', [name.trim()]);
  if (existing) {
    return res.status(409).json({ error: 'Categoria já existe.' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  run('INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)', [
    id, name.trim(), description || '', now
  ]);

  return res.status(201).json({ id, name: name.trim(), description, created_at: now });
});

// List products (for internal POS / Inventory)
router.get('/', authenticate, (req, res) => {
  const { search, category_id, status } = req.query;
  const isAdmin = req.user.role === 'admin';

  let sql = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'all') {
    sql += ' AND p.status = ?';
    params.push(status);
  } else if (!status) {
    sql += " AND p.status = 'active'";
  }

  if (category_id) {
    sql += ' AND p.category_id = ?';
    params.push(category_id);
  }

  if (search) {
    sql += ` AND (p.name LIKE ? OR p.reference LIKE ? OR p.id IN (
      SELECT product_id FROM product_variations WHERE sku LIKE ? OR barcode LIKE ?
    ))`;
    const searchWildcard = `%${search.trim()}%`;
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  sql += ' ORDER BY p.created_at DESC';

  const products = query(sql, params);

  // Attach variations to each product
  const productsWithVariations = products.map(prod => {
    const variations = query(
      'SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC',
      [prod.id]
    );

    const images = prod.images ? JSON.parse(prod.images) : [];
    const totalStock = variations.reduce((sum, v) => sum + v.stock, 0);
    const hasLowStock = variations.some(v => v.stock <= v.min_stock);

    const result = {
      ...prod,
      images,
      variations,
      total_stock: totalStock,
      has_low_stock: hasLowStock
    };

    // If attendant, do not expose cost price
    if (!isAdmin) {
      delete result.cost_price_cents;
    }

    return result;
  });

  return res.json(productsWithVariations);
});

// Get single product
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'admin';

  const prod = get(
    `SELECT p.*, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE p.id = ?`,
    [id]
  );

  if (!prod) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  const variations = query(
    'SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC',
    [prod.id]
  );
  const images = prod.images ? JSON.parse(prod.images) : [];

  const result = {
    ...prod,
    images,
    variations
  };

  if (!isAdmin) {
    delete result.cost_price_cents;
  }

  return res.json(result);
});

// Create product (admin only)
router.post('/', authenticate, requireRole('admin'), (req, res) => {
  const {
    name,
    description,
    category_id,
    reference,
    cost_price_cents,
    sale_price_cents,
    promo_price_cents,
    images,
    is_showcase,
    variations
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
  }

  if (sale_price_cents === undefined || sale_price_cents <= 0) {
    return res.status(400).json({ error: 'Preço de venda deve ser maior que zero.' });
  }

  if (!variations || !Array.isArray(variations) || variations.length === 0) {
    return res.status(400).json({ error: 'O produto deve ter pelo menos uma variação (tamanho/cor).' });
  }

  const prodId = uuidv4();
  const now = new Date().toISOString();
  const imagesJson = JSON.stringify(Array.isArray(images) ? images : []);

  try {
    transaction(() => {
      run(
        `INSERT INTO products (
          id, name, description, category_id, reference, cost_price_cents,
          sale_price_cents, promo_price_cents, images, is_showcase, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          prodId,
          name.trim(),
          description || '',
          category_id || null,
          reference ? reference.trim() : null,
          cost_price_cents || 0,
          sale_price_cents,
          promo_price_cents || null,
          imagesJson,
          is_showcase !== undefined ? (is_showcase ? 1 : 0) : 1,
          now,
          now
        ]
      );

      for (const v of variations) {
        if (!v.size || !v.color) {
          throw new Error('Cada variação precisa de tamanho e cor informados.');
        }

        const varId = uuidv4();
        const initialStock = parseInt(v.stock, 10) || 0;
        const minStock = parseInt(v.min_stock, 10) || 1;

        run(
          `INSERT INTO product_variations (
            id, product_id, size, color, sku, barcode, stock, min_stock, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            varId,
            prodId,
            v.size.trim(),
            v.color.trim(),
            v.sku ? v.sku.trim() : null,
            v.barcode ? v.barcode.trim() : null,
            initialStock,
            minStock,
            now,
            now
          ]
        );

        if (initialStock > 0) {
          run(
            `INSERT INTO stock_movements (
              id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
            ) VALUES (?, ?, 'in', ?, 0, ?, 'Estoque Inicial no Cadastro', NULL, ?, ?)`,
            [uuidv4(), varId, initialStock, initialStock, req.user.id, now]
          );
        }
      }
    });

    logAudit(req.user.id, 'CREATE_PRODUCT', 'product', prodId, { name, reference });

    return res.status(201).json({ id: prodId, message: 'Produto cadastrado com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Update product
router.put('/:id', authenticate, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    category_id,
    reference,
    cost_price_cents,
    sale_price_cents,
    promo_price_cents,
    images,
    is_showcase,
    status
  } = req.body;

  const prod = get('SELECT id FROM products WHERE id = ?', [id]);
  if (!prod) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  const now = new Date().toISOString();
  const imagesJson = images ? JSON.stringify(images) : undefined;

  run(
    `UPDATE products SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      category_id = COALESCE(?, category_id),
      reference = COALESCE(?, reference),
      cost_price_cents = COALESCE(?, cost_price_cents),
      sale_price_cents = COALESCE(?, sale_price_cents),
      promo_price_cents = ?,
      images = COALESCE(?, images),
      is_showcase = COALESCE(?, is_showcase),
      status = COALESCE(?, status),
      updated_at = ?
    WHERE id = ?`,
    [
      name ? name.trim() : null,
      description,
      category_id,
      reference ? reference.trim() : null,
      cost_price_cents,
      sale_price_cents,
      promo_price_cents,
      imagesJson,
      is_showcase !== undefined ? (is_showcase ? 1 : 0) : null,
      status,
      now,
      id
    ]
  );

  logAudit(req.user.id, 'UPDATE_PRODUCT', 'product', id, { name, sale_price_cents, status });

  return res.json({ message: 'Produto atualizado com sucesso.' });
});

// Archive product or delete if no sales
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  const { id } = req.params;

  const prod = get('SELECT id, name FROM products WHERE id = ?', [id]);
  if (!prod) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  // Check if product has sales
  const salesCount = get(
    `SELECT COUNT(*) as count FROM sale_items si
     JOIN product_variations pv ON si.variation_id = pv.id
     WHERE pv.product_id = ?`,
    [id]
  );

  if (salesCount && salesCount.count > 0) {
    // Cannot delete permanently: archive it!
    run("UPDATE products SET status = 'archived', is_showcase = 0 WHERE id = ?", [id]);
    logAudit(req.user.id, 'ARCHIVE_PRODUCT', 'product', id, { reason: 'Has sales associated' });
    return res.json({
      message: 'O produto possui histórico de vendas e foi arquivado com segurança para preservar a integridade dos relatórios.',
      archived: true
    });
  }

  // If no sales, allow permanent removal
  transaction(() => {
    run('DELETE FROM stock_movements WHERE variation_id IN (SELECT id FROM product_variations WHERE product_id = ?)', [id]);
    run('DELETE FROM product_variations WHERE product_id = ?', [id]);
    run('DELETE FROM products WHERE id = ?', [id]);
  });

  logAudit(req.user.id, 'DELETE_PRODUCT', 'product', id, { name: prod.name });

  return res.json({ message: 'Produto excluído com sucesso.', archived: false });
});

// Add variation to existing product
router.post('/:id/variations', authenticate, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { size, color, sku, barcode, stock, min_stock } = req.body;

  if (!size || !color) {
    return res.status(400).json({ error: 'Tamanho e cor são obrigatórios.' });
  }

  const prod = get('SELECT id FROM products WHERE id = ?', [id]);
  if (!prod) {
    return res.status(404).json({ error: 'Produto não encontrado.' });
  }

  const varId = uuidv4();
  const now = new Date().toISOString();
  const initialStock = parseInt(stock, 10) || 0;
  const minStockVal = parseInt(min_stock, 10) || 1;

  try {
    transaction(() => {
      run(
        `INSERT INTO product_variations (
          id, product_id, size, color, sku, barcode, stock, min_stock, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          varId, id, size.trim(), color.trim(),
          sku ? sku.trim() : null,
          barcode ? barcode.trim() : null,
          initialStock, minStockVal, now, now
        ]
      );

      if (initialStock > 0) {
        run(
          `INSERT INTO stock_movements (
            id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
          ) VALUES (?, ?, 'in', ?, 0, ?, 'Entrada Inicial de Variação', NULL, ?, ?)`,
          [uuidv4(), varId, initialStock, initialStock, req.user.id, now]
        );
      }
    });

    logAudit(req.user.id, 'ADD_VARIATION', 'product_variation', varId, { product_id: id, size, color });

    return res.status(201).json({ id: varId, message: 'Variação adicionada com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Stock movement (Adjust / Inventory / Entrada de mercadorias)
router.post('/stock/movement', authenticate, requireRole('admin'), (req, res) => {
  const { variation_id, type, quantity, reason } = req.body;

  if (!variation_id || !type || quantity === undefined || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Variação, tipo, quantidade e motivo são obrigatórios.' });
  }

  if (!['in', 'out', 'adjust'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido (permitidos: in, out, adjust).' });
  }

  const variation = get(
    `SELECT pv.*, p.name as product_name
     FROM product_variations pv
     JOIN products p ON pv.product_id = p.id
     WHERE pv.id = ?`,
    [variation_id]
  );

  if (!variation) {
    return res.status(404).json({ error: 'Variação não encontrada.' });
  }

  const qty = parseInt(quantity, 10);
  const currentStock = variation.stock;
  let newStock = currentStock;

  if (type === 'in') {
    if (qty <= 0) return res.status(400).json({ error: 'Quantidade de entrada deve ser maior que zero.' });
    newStock = currentStock + qty;
  } else if (type === 'out') {
    if (qty <= 0) return res.status(400).json({ error: 'Quantidade de saída deve ser maior que zero.' });
    if (currentStock - qty < 0) {
      return res.status(400).json({ error: `Estoque insuficiente para saída. Atual: ${currentStock}, Solicitado: ${qty}` });
    }
    newStock = currentStock - qty;
  } else if (type === 'adjust') {
    if (qty < 0) return res.status(400).json({ error: 'Novo estoque de inventário não pode ser negativo.' });
    newStock = qty;
  }

  const now = new Date().toISOString();
  const movementQty = type === 'adjust' ? (newStock - currentStock) : qty;

  transaction(() => {
    run('UPDATE product_variations SET stock = ?, updated_at = ? WHERE id = ?', [newStock, now, variation_id]);
    run(
      `INSERT INTO stock_movements (
        id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [uuidv4(), variation_id, type, movementQty, currentStock, newStock, reason.trim(), req.user.id, now]
    );
  });

  logAudit(req.user.id, 'STOCK_MOVEMENT', 'product_variation', variation_id, {
    product: variation.product_name,
    variation: `${variation.size} / ${variation.color}`,
    type,
    movementQty,
    previousStock: currentStock,
    newStock,
    reason: reason.trim()
  });

  return res.json({
    message: 'Movimentação registrada com sucesso.',
    previous_stock: currentStock,
    new_stock: newStock
  });
});

// Stock movement history
router.get('/stock/history', authenticate, (req, res) => {
  const { variation_id, limit = 50 } = req.query;

  let sql = `
    SELECT sm.*, pv.size, pv.color, pv.sku, p.name as product_name, u.name as user_name
    FROM stock_movements sm
    JOIN product_variations pv ON sm.variation_id = pv.id
    JOIN products p ON pv.product_id = p.id
    JOIN users u ON sm.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (variation_id) {
    sql += ' AND sm.variation_id = ?';
    params.push(variation_id);
  }

  sql += ' ORDER BY sm.created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10));

  const history = query(sql, params);
  return res.json(history);
});

module.exports = router;
