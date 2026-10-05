const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { get, query, run, transaction } = require('../db');
const { authenticate, requireRole, logAudit } = require('../middleware/auth');

// Generate sequential readable sale code like LB-202610-0001
function generateSaleCode() {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `LB-${yearMonth}-`;

  const lastSale = get(
    "SELECT code FROM sales WHERE code LIKE ? ORDER BY code DESC LIMIT 1",
    [`${prefix}%`]
  );

  let seq = 1;
  if (lastSale && lastSale.code) {
    const parts = lastSale.code.split('-');
    if (parts.length === 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num)) seq = num + 1;
    }
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// Search products specifically optimized for POS barcode scanner or fast search
router.get('/pos/search', authenticate, (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    // Return most popular/recent active products
    const items = query(`
      SELECT p.id, p.name, p.reference, p.sale_price_cents, p.promo_price_cents, p.images, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'active'
      ORDER BY p.name ASC
      LIMIT 30
    `);

    const result = items.map(p => {
      const variations = query(
        'SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC',
        [p.id]
      );
      return {
        ...p,
        images: p.images ? JSON.parse(p.images) : [],
        variations
      };
    });

    return res.json(result);
  }

  const clean = q.trim();
  const wildcard = `%${clean}%`;

  // Search by exact barcode, exact SKU, product reference, or product name
  const items = query(
    `SELECT DISTINCT p.id, p.name, p.reference, p.sale_price_cents, p.promo_price_cents, p.images, c.name as category_name
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN product_variations pv ON pv.product_id = p.id
     WHERE p.status = 'active' AND (
       p.name LIKE ? OR
       p.reference LIKE ? OR
       pv.sku = ? OR
       pv.barcode = ? OR
       pv.sku LIKE ? OR
       pv.barcode LIKE ?
     )
     ORDER BY p.name ASC
     LIMIT 30`,
    [wildcard, wildcard, clean, clean, wildcard, wildcard]
  );

  const result = items.map(p => {
    const variations = query(
      'SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC',
      [p.id]
    );
    return {
      ...p,
      images: p.images ? JSON.parse(p.images) : [],
      variations
    };
  });

  return res.json(result);
});

// Create Sale (POS Checkout with atomic inventory validation & idempotency)
router.post('/checkout', authenticate, (req, res) => {
  const {
    items,
    payments,
    discount_cents = 0,
    customer_name,
    customer_phone,
    idempotency_key
  } = req.body;

  // 1. Validate Idempotency
  if (idempotency_key) {
    const existingSale = get('SELECT id, code, total_cents FROM sales WHERE idempotency_key = ?', [idempotency_key]);
    if (existingSale) {
      return res.json({
        duplicate: true,
        message: 'Esta venda já foi processada com sucesso.',
        sale_id: existingSale.id,
        code: existingSale.code
      });
    }
  }

  // 2. Validate Open Cash Register
  const openRegister = get("SELECT id FROM cash_registers WHERE status = 'open' LIMIT 1");
  if (!openRegister) {
    return res.status(400).json({
      error: 'Não há caixa aberto no momento. É necessário abrir o caixa antes de realizar vendas.'
    });
  }

  // 3. Validate Cart Items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'O carrinho está vazio.' });
  }

  // 4. Validate Payments
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: 'Nenhuma forma de pagamento foi selecionada.' });
  }

  const validMethods = ['money', 'pix', 'debit', 'credit'];
  for (const p of payments) {
    if (!validMethods.includes(p.method) || !p.amount_cents || p.amount_cents <= 0) {
      return res.status(400).json({ error: 'Forma ou valor de pagamento inválido.' });
    }
  }

  const discount = Math.max(0, parseInt(discount_cents, 10) || 0);

  // Execute in strict atomic transaction
  try {
    const result = transaction(() => {
      let calculatedSubtotal = 0;
      const verifiedItems = [];

      // Step A: Lock and verify stock for each item atomically
      for (const item of items) {
        const qty = parseInt(item.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Quantidade inválida para o item selecionado.`);
        }

        // Query variation with product data
        const variation = get(
          `SELECT pv.*, p.name as prod_name, p.reference as prod_ref, p.cost_price_cents,
                  p.sale_price_cents, p.promo_price_cents, p.status as prod_status
           FROM product_variations pv
           JOIN products p ON pv.product_id = p.id
           WHERE pv.id = ?`,
          [item.variation_id]
        );

        if (!variation) {
          throw new Error('Variação de produto não encontrada.');
        }

        if (variation.prod_status !== 'active') {
          throw new Error(`O produto "${variation.prod_name}" não está ativo para venda.`);
        }

        // Concurrency check: does database currently have enough units?
        if (variation.stock < qty) {
          throw new Error(
            `Estoque insuficiente para "${variation.prod_name} (${variation.size} / ${variation.color})". Disponível em estoque: ${variation.stock} unidade(s). Solicitado: ${qty}.`
          );
        }

        // Determine effective price per unit
        const effectivePrice = variation.promo_price_cents || variation.sale_price_cents;
        const lineTotal = effectivePrice * qty;
        calculatedSubtotal += lineTotal;

        verifiedItems.push({
          variation,
          qty,
          effectivePrice,
          lineTotal
        });
      }

      // Calculate Total
      const calculatedTotal = Math.max(0, calculatedSubtotal - discount);

      // Verify payment sum
      const totalPaid = payments.reduce((sum, p) => sum + p.amount_cents, 0);

      // Change calculation (only for money payments)
      const moneyPayment = payments.find(p => p.method === 'money');
      let changeCents = 0;

      if (totalPaid < calculatedTotal) {
        throw new Error(
          `Valor pago insuficiente. Total: R$ ${(calculatedTotal / 100).toFixed(2)}, Pago: R$ ${(totalPaid / 100).toFixed(2)}`
        );
      }

      if (totalPaid > calculatedTotal) {
        if (!moneyPayment) {
          throw new Error('Pagamentos via cartão ou Pix não permitem troco ou valor superior ao total.');
        }
        changeCents = totalPaid - calculatedTotal;
      }

      const saleId = uuidv4();
      const saleCode = generateSaleCode();
      const now = new Date().toISOString();

      // Step B: Atomically decrement stock and insert stock movement
      for (const vItem of verifiedItems) {
        const { variation, qty } = vItem;

        // Atomic update with race condition prevention
        const updateRes = run(
          `UPDATE product_variations
           SET stock = stock - ?, updated_at = ?
           WHERE id = ? AND stock >= ?`,
          [qty, now, variation.id, qty]
        );

        if (updateRes.changes === 0) {
          // Race condition caught! Another user bought the last unit in this millisecond!
          throw new Error(
            `Disputa de estoque: A última unidade de "${variation.prod_name} (${variation.size} / ${variation.color})" acabou de ser vendida em outro atendimento.`
          );
        }

        const newStock = variation.stock - qty;

        // Record stock movement
        run(
          `INSERT INTO stock_movements (
            id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
          ) VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            variation.id,
            -qty,
            variation.stock,
            newStock,
            `Venda PDV Balcão #${saleCode}`,
            saleId,
            req.user.id,
            now
          ]
        );

        // Record sale item (freezing historic values!)
        run(
          `INSERT INTO sale_items (
            id, sale_id, variation_id, product_name, product_reference, size, color,
            cost_price_cents, unit_price_cents, quantity, total_cents, returned_quantity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            uuidv4(),
            saleId,
            variation.id,
            variation.prod_name,
            variation.prod_ref,
            variation.size,
            variation.color,
            variation.cost_price_cents,
            vItem.effectivePrice,
            qty,
            vItem.lineTotal
          ]
        );
      }

      // Step C: Record Sale
      run(
        `INSERT INTO sales (
          id, code, register_id, user_id, customer_name, customer_phone,
          subtotal_cents, discount_cents, total_cents, change_cents,
          status, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
        [
          saleId,
          saleCode,
          openRegister.id,
          req.user.id,
          customer_name ? customer_name.trim() : null,
          customer_phone ? customer_phone.trim() : null,
          calculatedSubtotal,
          discount,
          calculatedTotal,
          changeCents,
          idempotency_key || null,
          now
        ]
      );

      // Step D: Record Payments
      for (const p of payments) {
        run(
          `INSERT INTO sale_payments (id, sale_id, payment_method, amount_cents)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), saleId, p.method, p.amount_cents]
        );
      }

      return {
        saleId,
        saleCode,
        subtotal_cents: calculatedSubtotal,
        discount_cents: discount,
        total_cents: calculatedTotal,
        change_cents: changeCents,
        created_at: now
      };
    });

    logAudit(req.user.id, 'SALE_COMPLETED', 'sale', result.saleId, {
      code: result.saleCode,
      total_cents: result.total_cents
    });

    return res.status(201).json({
      message: 'Venda finalizada com sucesso!',
      sale: result
    });
  } catch (err) {
    return res.status(400).json({
      error: err.message || 'Erro ao processar a venda.'
    });
  }
});

// List Sales (with date range, seller, payment method filters)
router.get('/', authenticate, (req, res) => {
  const { start_date, end_date, seller_id, payment_method, status, limit = 50 } = req.query;

  let sql = `
    SELECT s.*, u.name as seller_name, cr.opened_at as register_opened_at
    FROM sales s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN cash_registers cr ON s.register_id = cr.id
    WHERE 1=1
  `;
  const params = [];

  if (start_date) {
    sql += ' AND s.created_at >= ?';
    params.push(`${start_date}T00:00:00.000Z`);
  }

  if (end_date) {
    sql += ' AND s.created_at <= ?';
    params.push(`${end_date}T23:59:59.999Z`);
  }

  if (seller_id) {
    sql += ' AND s.user_id = ?';
    params.push(seller_id);
  }

  if (status) {
    sql += ' AND s.status = ?';
    params.push(status);
  }

  if (payment_method) {
    sql += ` AND s.id IN (SELECT sale_id FROM sale_payments WHERE payment_method = ?)`;
    params.push(payment_method);
  }

  sql += ' ORDER BY s.created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10));

  const sales = query(sql, params);

  // Attach items & payments to each sale
  const enriched = sales.map(s => {
    const items = query('SELECT * FROM sale_items WHERE sale_id = ?', [s.id]);
    const payments = query('SELECT * FROM sale_payments WHERE sale_id = ?', [s.id]);

    // Strip cost price if not admin
    if (req.user.role !== 'admin') {
      items.forEach(it => delete it.cost_price_cents);
    }

    return {
      ...s,
      items,
      payments
    };
  });

  return res.json(enriched);
});

// Get single sale details (for view or receipt)
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  const sale = get(
    `SELECT s.*, u.name as seller_name
     FROM sales s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ? OR s.code = ?`,
    [id, id]
  );

  if (!sale) {
    return res.status(404).json({ error: 'Venda não encontrada.' });
  }

  const items = query('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
  const payments = query('SELECT * FROM sale_payments WHERE sale_id = ?', [sale.id]);

  if (req.user.role !== 'admin') {
    items.forEach(it => delete it.cost_price_cents);
  }

  return res.json({
    ...sale,
    items,
    payments
  });
});

// Cancel Sale (admin only, with reason & full inventory restoration)
router.post('/:id/cancel', authenticate, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Justificativa do cancelamento é obrigatória.' });
  }

  const sale = get('SELECT * FROM sales WHERE id = ?', [id]);
  if (!sale) {
    return res.status(404).json({ error: 'Venda não encontrada.' });
  }

  if (sale.status === 'cancelled') {
    return res.status(400).json({ error: 'Esta venda já está cancelada.' });
  }

  const now = new Date().toISOString();

  try {
    transaction(() => {
      // 1. Mark sale as cancelled
      run(
        `UPDATE sales SET
          status = 'cancelled',
          cancellation_reason = ?,
          cancelled_by = ?,
          cancelled_at = ?
        WHERE id = ?`,
        [reason.trim(), req.user.id, now, id]
      );

      // 2. Return items back to inventory
      const items = query('SELECT * FROM sale_items WHERE sale_id = ?', [id]);
      for (const item of items) {
        // Only return remaining unreturned quantity
        const qtyToReturn = item.quantity - item.returned_quantity;
        if (qtyToReturn > 0) {
          const variation = get('SELECT stock FROM product_variations WHERE id = ?', [item.variation_id]);
          if (variation) {
            const currentStock = variation.stock;
            const newStock = currentStock + qtyToReturn;

            run('UPDATE product_variations SET stock = ?, updated_at = ? WHERE id = ?', [newStock, now, item.variation_id]);

            run(
              `INSERT INTO stock_movements (
                id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
              ) VALUES (?, ?, 'cancel', ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(),
                item.variation_id,
                qtyToReturn,
                currentStock,
                newStock,
                `Estorno Venda #${sale.code}: ${reason.trim()}`,
                sale.id,
                req.user.id,
                now
              ]
            );
          }
        }
      }
    });

    logAudit(req.user.id, 'CANCEL_SALE', 'sale', id, { code: sale.code, reason: reason.trim() });

    return res.json({ message: 'Venda cancelada e peças retornadas ao estoque com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
