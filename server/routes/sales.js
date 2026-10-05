const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { get, query, run, transaction } = require("../db");
const { authenticate, requireRole, logAudit } = require("../middleware/auth");
const { integer, text, dateBounds } = require("../validation");
const {
  hash,
  register,
  createSale,
  saleDetails,
  ledger,
  netPayments,
  stock,
} = require("../commerce");

// Generate sequential readable sale code like LB-202610-0001
function generateSaleCode() {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `LB-${yearMonth}-`;

  const lastSale = get(
    "SELECT code FROM sales WHERE code LIKE ? ORDER BY code DESC LIMIT 1",
    [`${prefix}%`],
  );

  let seq = 1;
  if (lastSale && lastSale.code) {
    const parts = lastSale.code.split("-");
    if (parts.length === 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num)) seq = num + 1;
    }
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// Search products specifically optimized for POS barcode scanner or fast search
router.get("/pos/search", authenticate, (req, res) => {
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

    const result = items.map((p) => {
      const variations = query(
        "SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC",
        [p.id],
      );
      return {
        ...p,
        images: p.images ? JSON.parse(p.images) : [],
        variations,
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
    [wildcard, wildcard, clean, clean, wildcard, wildcard],
  );

  const result = items.map((p) => {
    const variations = query(
      "SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC",
      [p.id],
    );
    return {
      ...p,
      images: p.images ? JSON.parse(p.images) : [],
      variations,
    };
  });

  return res.json(result);
});

router.post("/checkout", authenticate, (req, res) => {
  try {
    const key = text(
      req.body.idempotency_key,
      "Identificador da operação",
      160,
    );
    const discount = integer(req.body.discount_cents ?? 0, "Desconto");
    const requestHash = hash(req.body);
    const result = transaction(() => {
      const existing = get("SELECT * FROM sales WHERE idempotency_key=?", [
        key,
      ]);
      if (existing) {
        if (existing.request_hash !== requestHash)
          throw new Error("Identificador já utilizado com outra compra.");
        return {
          duplicate: true,
          sale: { ...existing, saleId: existing.id, saleCode: existing.code },
        };
      }
      if (req.user.role !== "admin" && discount > 0)
        throw new Error(
          "Desconto precisa ser autorizado por um administrador.",
        );
      const sale = createSale({
        items: req.body.items,
        payments: req.body.payments,
        discount,
        user: req.user,
        reg: register(),
        key,
        requestHash,
        customerName: req.body.customer_name
          ? text(req.body.customer_name, "Cliente", 120)
          : null,
        customerPhone: req.body.customer_phone
          ? text(req.body.customer_phone, "Telefone", 30)
          : null,
      });
      logAudit(req.user.id, "SALE_COMPLETED", "sale", sale.id, {
        code: sale.code,
        total_cents: sale.total_cents,
      });
      return { duplicate: false, sale };
    });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.get("/checkout/key/:key", authenticate, (req, res) => {
  const sale = get("SELECT id FROM sales WHERE idempotency_key=?", [
    req.params.key,
  ]);
  if (!sale)
    return res.status(404).json({ error: "Operação ainda não confirmada." });
  return res.json(saleDetails(sale.id, req.user.role));
});
router.get("/", authenticate, (req, res) => {
  try {
    const { start_date, end_date, seller_id, payment_method, status } =
      req.query;
    const { start, end } = dateBounds(start_date, end_date);
    const page = integer(Number(req.query.page ?? 1), "Página", 1),
      limit = Math.min(
        integer(Number(req.query.limit ?? 50), "Limite", 1),
        100,
      );
    let where = " WHERE 1=1";
    const params = [];
    for (const [clause, value] of [
      ["s.created_at>=?", start],
      ["s.created_at<=?", end],
      ["s.user_id=?", seller_id],
      ["s.status=?", status],
    ])
      if (value) {
        where += " AND " + clause;
        params.push(value);
      }
    if (payment_method) {
      where +=
        " AND s.id IN (SELECT sale_id FROM sale_payments WHERE payment_method=?)";
      params.push(payment_method);
    }
    const total = get("SELECT COUNT(*) AS n FROM sales s" + where, params).n;
    const rows = query(
      "SELECT s.id FROM sales s" +
        where +
        " ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?",
      [...params, limit, (page - 1) * limit],
    );
    return res.json({
      sales: rows.map((s) => saleDetails(s.id, req.user.role)),
      total,
      page,
      page_size: limit,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.get("/:id", authenticate, (req, res) => {
  const sale = saleDetails(req.params.id, req.user.role);
  return sale
    ? res.json(sale)
    : res.status(404).json({ error: "Venda não encontrada." });
});
router.post("/:id/cancel", authenticate, requireRole("admin"), (req, res) => {
  try {
    const reason = text(req.body.reason, "Justificativa", 500);
    transaction(() => {
      const sale = get("SELECT * FROM sales WHERE id=?", [req.params.id]);
      if (!sale) throw new Error("Venda não encontrada.");
      if (
        sale.status !== "completed" ||
        sale.exchange_credit_cents > 0 ||
        get("SELECT id FROM returns WHERE sale_id=?", [sale.id])
      )
        throw new Error(
          "Esta venda já foi cancelada ou possui devoluções/trocas. Use devolução para os itens restantes.",
        );
      const reg = register();
      for (const item of query("SELECT * FROM sale_items WHERE sale_id=?", [
        sale.id,
      ]))
        stock(
          item.variation_id,
          item.quantity,
          "cancel",
          reason,
          sale.id,
          req.user.id,
        );
      const payments = query(
        "SELECT payment_method AS method,amount_cents FROM sale_payments WHERE sale_id=?",
        [sale.id],
      );
      for (const p of netPayments(payments, sale.change_cents))
        ledger(reg.id, sale.id, null, "cancel", p.method, -p.net);
      run(
        "UPDATE sales SET status='cancelled',cancellation_reason=?,cancelled_by=?,cancelled_at=? WHERE id=?",
        [reason, req.user.id, new Date().toISOString(), sale.id],
      );
      logAudit(req.user.id, "CANCEL_SALE", "sale", sale.id, {
        reason,
        register_id: reg.id,
      });
    });
    return res.json({
      message:
        "Cancelamento registrado com devolução de peças e estorno dos recebimentos.",
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
module.exports = router;
