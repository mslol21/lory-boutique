const express = require("express");
const router = express.Router();
const { randomUUID } = require("node:crypto");
const { get, query, run, transaction } = require("../db");
const { authenticate, requireRole, logAudit } = require("../middleware/auth");
const { integer, text, method } = require("../validation");
const {
  hash,
  register,
  refundForItem,
  stock,
  ledger,
  createSale,
  prepareItems,
} = require("../commerce");
function processReturn(req, exchange) {
  const body = req.body,
    key = text(body.idempotency_key, "Identificador da operação", 160),
    requestHash = hash(body);
  return transaction(() => {
    const previous = get("SELECT * FROM returns WHERE idempotency_key=?", [
      key,
    ]);
    if (previous) {
      if (previous.request_hash !== requestHash)
        throw new Error("Identificador utilizado com outros itens.");
      return {
        duplicate: true,
        return_id: previous.id,
        exchange_id: previous.id,
        refund_amount_cents: previous.return_amount_cents,
        difference_cents: previous.difference_cents,
        exchange_sale_id: previous.exchange_sale_id,
      };
    }
    const sale = get("SELECT * FROM sales WHERE id=?", [body.sale_id]);
    if (!sale || !["completed", "returned_partial"].includes(sale.status))
      throw new Error("Venda inexistente, cancelada ou já devolvida.");
    const reg = register(),
      reason = text(body.reason, "Motivo", 500);
    const requests = exchange ? body.returned_items : body.items;
    if (!Array.isArray(requests) || !requests.length || requests.length > 200)
      throw new Error("Selecione os itens devolvidos.");
    const seen = new Set(),
      verified = [];
    let refund = 0;
    for (const r of requests) {
      if (seen.has(r.sale_item_id))
        throw new Error("Item repetido na devolução.");
      seen.add(r.sale_item_id);
      const item = get("SELECT * FROM sale_items WHERE id=? AND sale_id=?", [
        r.sale_item_id,
        sale.id,
      ]);
      if (!item) throw new Error("Item inválido.");
      const qty = integer(r.quantity, "Quantidade devolvida", 1);
      if (qty > item.quantity - item.returned_quantity)
        throw new Error("Quantidade excede o saldo devolvível.");
      if (typeof r.restock !== "boolean")
        throw new Error("Informe se a peça retorna ao estoque.");
      const amount = refundForItem(item, qty);
      refund = integer(refund + amount, "Restituição");
      verified.push({ item, qty, amount, restock: r.restock });
    }
    const id = randomUUID(),
      now = new Date().toISOString();
    run(
      "INSERT INTO returns(id,sale_id,user_id,type,return_amount_cents,reason,created_at,idempotency_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        id,
        sale.id,
        req.user.id,
        exchange ? "exchange" : "return",
        refund,
        reason,
        now,
        key,
        requestHash,
      ],
    );
    for (const v of verified) {
      run(
        "UPDATE sale_items SET returned_quantity=returned_quantity+? WHERE id=?",
        [v.qty, v.item.id],
      );
      run(
        "INSERT INTO return_items(id,return_id,sale_item_id,variation_id,quantity,unit_price_cents,restocked) VALUES (?,?,?,?,?,?,?)",
        [
          randomUUID(),
          id,
          v.item.id,
          v.item.variation_id,
          v.qty,
          v.item.unit_price_cents,
          v.restock ? 1 : 0,
        ],
      );
      if (v.restock)
        stock(
          v.item.variation_id,
          v.qty,
          exchange ? "exchange_in" : "return",
          reason,
          id,
          req.user.id,
        );
    }
    let difference = -refund,
      newSale = null;
    if (exchange) {
      const prepared = prepareItems(body.new_items),
        newTotal = prepared.reduce((s, i) => s + i.total, 0);
      difference = newTotal - refund;
      const payments = body.payments ?? [];
      if (difference <= 0 && payments.length)
        throw new Error("Esta troca não tem diferença a receber.");
      newSale = createSale({
        items: body.new_items,
        payments,
        discount: 0,
        user: req.user,
        reg,
        key: `exchange-${key}`,
        requestHash,
        credit: Math.min(refund, newTotal),
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
      });
      run(
        "UPDATE returns SET exchange_sale_id=?,difference_cents=? WHERE id=?",
        [newSale.id, difference, id],
      );
    }
    if (difference < 0) {
      const refundMethod = method(body.refund_method);
      ledger(reg.id, sale.id, id, "refund", refundMethod, difference);
    }
    const outstanding = get(
      "SELECT COALESCE(SUM(quantity-returned_quantity),0) AS n FROM sale_items WHERE sale_id=?",
      [sale.id],
    ).n;
    const status = outstanding ? "returned_partial" : "returned_full";
    run("UPDATE sales SET status=? WHERE id=?", [status, sale.id]);
    logAudit(
      req.user.id,
      exchange ? "PROCESS_EXCHANGE" : "PROCESS_RETURN",
      "return",
      id,
      {
        sale_id: sale.id,
        refund_cents: refund,
        difference_cents: difference,
        register_id: reg.id,
      },
    );
    return {
      return_id: id,
      exchange_id: id,
      refund_amount_cents: refund,
      credit_cents: refund,
      difference_cents: difference,
      exchange_sale_id: newSale?.id,
      sale_status: status,
    };
  });
}
for (const [route, exchange] of [
  ["/process", false],
  ["/exchange", true],
])
  router.post(route, authenticate, requireRole("admin"), (req, res) => {
    try {
      const result = processReturn(req, exchange);
      return res
        .status(result.duplicate ? 200 : 201)
        .json({
          message: "Operação registrada no estoque e no caixa.",
          ...result,
        });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });
router.get("/history", authenticate, (req, res) => {
  let sql =
    "SELECT r.*,s.code AS sale_code,u.name AS user_name FROM returns r JOIN sales s ON s.id=r.sale_id JOIN users u ON u.id=r.user_id";
  const params = [];
  if (req.query.sale_id) {
    sql += " WHERE r.sale_id=?";
    params.push(req.query.sale_id);
  }
  const rows = query(sql + " ORDER BY r.created_at DESC", params);
  return res.json(
    rows.map((r) => ({
      ...r,
      items: query(
        "SELECT ri.*,si.product_name,si.size,si.color FROM return_items ri JOIN sale_items si ON si.id=ri.sale_item_id WHERE return_id=?",
        [r.id],
      ),
    })),
  );
});
module.exports = router;
