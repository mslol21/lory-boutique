const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { get, query, run, transaction } = require('../db');
const { authenticate, logAudit } = require('../middleware/auth');

// Process Return (partial or full)
router.post('/process', authenticate, (req, res) => {
  const {
    sale_id,
    items, // array of { sale_item_id, quantity, restock: boolean }
    reason
  } = req.body;

  if (!sale_id || !items || !Array.isArray(items) || items.length === 0 || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Informe a venda, os itens devolvidos e o motivo.' });
  }

  const sale = get('SELECT * FROM sales WHERE id = ?', [sale_id]);
  if (!sale) {
    return res.status(404).json({ error: 'Venda não encontrada.' });
  }

  if (sale.status === 'cancelled') {
    return res.status(400).json({ error: 'Não é possível devolver itens de uma venda já cancelada.' });
  }

  const now = new Date().toISOString();
  const returnId = uuidv4();

  try {
    const result = transaction(() => {
      let totalRefundCents = 0;
      const processedItems = [];

      for (const reqItem of items) {
        const saleItem = get('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [reqItem.sale_item_id, sale_id]);
        if (!saleItem) {
          throw new Error('Item da venda não encontrado.');
        }

        const returnQty = parseInt(reqItem.quantity, 10);
        if (isNaN(returnQty) || returnQty <= 0) {
          throw new Error('Quantidade de devolução inválida.');
        }

        const maxAvailableToReturn = saleItem.quantity - saleItem.returned_quantity;
        if (returnQty > maxAvailableToReturn) {
          throw new Error(
            `Tentativa de estorno duplicado ou excedente para "${saleItem.product_name}". Disponível para devolver: ${maxAvailableToReturn}, Solicitado: ${returnQty}`
          );
        }

        const lineRefund = saleItem.unit_price_cents * returnQty;
        totalRefundCents += lineRefund;

        // Update returned quantity on the sale item
        run(
          'UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?',
          [returnQty, saleItem.id]
        );

        const shouldRestock = reqItem.restock ? 1 : 0;

        // If user wants to return item to inventory
        if (shouldRestock) {
          const variation = get('SELECT stock FROM product_variations WHERE id = ?', [saleItem.variation_id]);
          if (variation) {
            const currentStock = variation.stock;
            const newStock = currentStock + returnQty;

            run('UPDATE product_variations SET stock = ?, updated_at = ? WHERE id = ?', [newStock, now, saleItem.variation_id]);

            run(
              `INSERT INTO stock_movements (
                id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
              ) VALUES (?, ?, 'return', ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(),
                saleItem.variation_id,
                returnQty,
                currentStock,
                newStock,
                `Devolução Venda #${sale.code}: ${reason.trim()}`,
                returnId,
                req.user.id,
                now
              ]
            );
          }
        }

        // Record return item
        run(
          `INSERT INTO return_items (
            id, return_id, sale_item_id, variation_id, quantity, unit_price_cents, restocked
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), returnId, saleItem.id, saleItem.variation_id, returnQty, saleItem.unit_price_cents, shouldRestock]
        );

        processedItems.push({
          saleItem,
          returnQty,
          lineRefund,
          restocked: shouldRestock
        });
      }

      // Check if all items in sale are now fully returned
      const allItems = query('SELECT quantity, returned_quantity FROM sale_items WHERE sale_id = ?', [sale_id]);
      const allReturned = allItems.every(i => i.quantity === i.returned_quantity);

      run(
        'UPDATE sales SET status = ? WHERE id = ?',
        [allReturned ? 'returned_full' : 'returned_partial', sale_id]
      );

      // Record return
      run(
        `INSERT INTO returns (
          id, sale_id, user_id, type, return_amount_cents, restock_items, reason, difference_cents, created_at
        ) VALUES (?, ?, ?, 'return', ?, 1, ?, 0, ?)`,
        [returnId, sale_id, req.user.id, totalRefundCents, reason.trim(), now]
      );

      return {
        returnId,
        totalRefundCents,
        status: allReturned ? 'returned_full' : 'returned_partial'
      };
    });

    logAudit(req.user.id, 'PROCESS_RETURN', 'return', result.returnId, {
      sale_code: sale.code,
      total_refund_cents: result.totalRefundCents,
      reason
    });

    return res.status(201).json({
      message: 'Devolução processada com sucesso.',
      return_id: result.returnId,
      refund_amount_cents: result.totalRefundCents,
      sale_status: result.status
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Process Exchange (troca: devolve itens antigos + adiciona novas peças com diferença)
router.post('/exchange', authenticate, (req, res) => {
  const {
    sale_id,
    returned_items, // [ { sale_item_id, quantity, restock: boolean } ]
    new_items,      // [ { variation_id, quantity } ]
    payment_method, // used if difference > 0 (customer pays)
    reason
  } = req.body;

  if (!sale_id || !returned_items || !Array.isArray(returned_items) || returned_items.length === 0 || !new_items || !Array.isArray(new_items) || new_items.length === 0) {
    return res.status(400).json({ error: 'Informe a venda original, os itens devolvidos e as novas peças selecionadas.' });
  }

  const sale = get('SELECT * FROM sales WHERE id = ?', [sale_id]);
  if (!sale) {
    return res.status(404).json({ error: 'Venda não encontrada.' });
  }

  const now = new Date().toISOString();
  const exchangeId = uuidv4();

  try {
    const exchangeResult = transaction(() => {
      // 1. Process returned items
      let totalCreditCents = 0;

      for (const reqItem of returned_items) {
        const saleItem = get('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [reqItem.sale_item_id, sale_id]);
        if (!saleItem) throw new Error('Item da venda original não encontrado.');

        const returnQty = parseInt(reqItem.quantity, 10);
        const maxAvailable = saleItem.quantity - saleItem.returned_quantity;
        if (returnQty > maxAvailable) {
          throw new Error(`Quantidade a devolver de "${saleItem.product_name}" é maior do que o comprado ou já devolvido.`);
        }

        totalCreditCents += saleItem.unit_price_cents * returnQty;

        run('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?', [returnQty, saleItem.id]);

        const shouldRestock = reqItem.restock ? 1 : 0;
        if (shouldRestock) {
          const variation = get('SELECT stock FROM product_variations WHERE id = ?', [saleItem.variation_id]);
          if (variation) {
            const currentStock = variation.stock;
            const newStock = currentStock + returnQty;
            run('UPDATE product_variations SET stock = ?, updated_at = ? WHERE id = ?', [newStock, now, saleItem.variation_id]);
            run(
              `INSERT INTO stock_movements (
                id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
              ) VALUES (?, ?, 'exchange_in', ?, ?, ?, ?, ?, ?, ?)`,
              [uuidv4(), saleItem.variation_id, returnQty, currentStock, newStock, `Entrada de Troca #${sale.code}`, exchangeId, req.user.id, now]
            );
          }
        }

        run(
          `INSERT INTO return_items (
            id, return_id, sale_item_id, variation_id, quantity, unit_price_cents, restocked
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), exchangeId, saleItem.id, saleItem.variation_id, returnQty, saleItem.unit_price_cents, shouldRestock]
        );
      }

      // 2. Process new items
      let totalNewItemsCents = 0;

      for (const newItem of new_items) {
        const qty = parseInt(newItem.quantity, 10);
        if (isNaN(qty) || qty <= 0) throw new Error('Quantidade do novo produto inválida.');

        const variation = get(
          `SELECT pv.*, p.name as prod_name, p.reference as prod_ref, p.sale_price_cents, p.promo_price_cents, p.status as prod_status
           FROM product_variations pv
           JOIN products p ON pv.product_id = p.id
           WHERE pv.id = ?`,
          [newItem.variation_id]
        );

        if (!variation) throw new Error('Nova peça selecionada não encontrada.');
        if (variation.prod_status !== 'active') throw new Error(`O produto "${variation.prod_name}" está inativo.`);
        if (variation.stock < qty) {
          throw new Error(`Estoque insuficiente para nova peça "${variation.prod_name}". Disponível: ${variation.stock}`);
        }

        const effectivePrice = variation.promo_price_cents || variation.sale_price_cents;
        totalNewItemsCents += effectivePrice * qty;

        // Decrement stock
        const updateRes = run(
          'UPDATE product_variations SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?',
          [qty, now, variation.id, qty]
        );
        if (updateRes.changes === 0) {
          throw new Error(`Disputa de estoque na nova peça "${variation.prod_name}".`);
        }

        run(
          `INSERT INTO stock_movements (
            id, variation_id, type, quantity, previous_stock, new_stock, reason, reference_id, user_id, created_at
          ) VALUES (?, ?, 'exchange_out', ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), variation.id, -qty, variation.stock, variation.stock - qty, `Saída de Troca #${sale.code}`, exchangeId, req.user.id, now]
        );
      }

      // Difference: positive = customer pays extra, negative = store refunds customer
      const differenceCents = totalNewItemsCents - totalCreditCents;

      run(
        `INSERT INTO returns (
          id, sale_id, user_id, type, return_amount_cents, restock_items, reason, difference_cents, created_at
        ) VALUES (?, ?, ?, 'exchange', ?, 1, ?, ?, ?)`,
        [exchangeId, sale_id, req.user.id, totalCreditCents, reason ? reason.trim() : 'Troca de peças', differenceCents, now]
      );

      return {
        exchangeId,
        totalCreditCents,
        totalNewItemsCents,
        differenceCents
      };
    });

    logAudit(req.user.id, 'PROCESS_EXCHANGE', 'exchange', exchangeResult.exchangeId, {
      sale_code: sale.code,
      difference_cents: exchangeResult.differenceCents
    });

    return res.status(201).json({
      message: 'Troca realizada com sucesso.',
      exchange_id: exchangeResult.exchangeId,
      credit_cents: exchangeResult.totalCreditCents,
      new_items_cents: exchangeResult.totalNewItemsCents,
      difference_cents: exchangeResult.differenceCents
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// List returns/exchanges history
router.get('/history', authenticate, (req, res) => {
  const { sale_id } = req.query;

  let sql = `
    SELECT r.*, s.code as sale_code, u.name as user_name
    FROM returns r
    JOIN sales s ON r.sale_id = s.id
    JOIN users u ON r.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (sale_id) {
    sql += ' AND r.sale_id = ?';
    params.push(sale_id);
  }

  sql += ' ORDER BY r.created_at DESC';

  const history = query(sql, params);

  const enriched = history.map(h => {
    const items = query(
      `SELECT ri.*, si.product_name, si.size, si.color
       FROM return_items ri
       JOIN sale_items si ON ri.sale_item_id = si.id
       WHERE ri.return_id = ?`,
      [h.id]
    );
    return {
      ...h,
      items
    };
  });

  return res.json(enriched);
});

module.exports = router;
