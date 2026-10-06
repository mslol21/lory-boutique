const express = require("express");
const router = express.Router();
const { get, query } = require("../db");
const { authenticate, requireRole } = require("../middleware/auth");
const { dateBounds, todaySP } = require("../validation");
function filter(req) {
  const { start, end } = dateBounds(req.query.start_date, req.query.end_date);
  const params = [];
  let sql = "";
  if (start) {
    sql += " AND s.created_at>=?";
    params.push(start);
  }
  if (end) {
    sql += " AND s.created_at<=?";
    params.push(end);
  }
  return {
    sql,
    params,
  };
}
router.get("/dashboard", authenticate, async (req, res) => {
  try {
    const period = req.query.period ?? "today";
    if (!["today", "7days", "30days", "custom"].includes(period))
      throw new Error("Período inválido.");
    const today = todaySP(),
      start = new Date(today + "T12:00:00-03:00");
    start.setUTCDate(
      start.getUTCDate() -
        (period === "today" ? 0 : period === "7days" ? 6 : 29),
    );
    if (period === "custom" && (!req.query.start_date || !req.query.end_date))
      throw new Error("Informe as datas inicial e final.");
    const range = period === "custom"
      ? dateBounds(req.query.start_date, req.query.end_date)
      : dateBounds(start.toISOString().slice(0, 10), today);
    const startISO = range.start, endISO = range.end;
    const sales = await query(
      "SELECT * FROM sales WHERE status!='cancelled' AND created_at BETWEEN ? AND ?",
      [startISO, endISO],
    );
    let revenue = 0,
      discounts = 0,
      cost = 0,
      margin = 0,
      count = 0,
      knownCost = false;
    const best = new Map();
    for (const sale of sales) {
      const items = await query("SELECT * FROM sale_items WHERE sale_id=?", [
        sale.id,
      ]);
      let saleNet = 0;
      for (const i of items) {
        const remaining = i.quantity - i.returned_quantity,
          refunded = Number(
            (BigInt(i.net_total_cents) * BigInt(i.returned_quantity)) /
              BigInt(i.quantity),
          );
        const net = i.net_total_cents - refunded;
        saleNet += net;
        if (i.cost_price_cents > 0) {
          knownCost = true;
          cost += i.cost_price_cents * remaining;
          margin += net - i.cost_price_cents * remaining;
        }
        const row = best.get(i.product_name) || {
          product_name: i.product_name,
          total_quantity_sold: 0,
          total_cents: 0,
        };
        row.total_quantity_sold += remaining;
        row.total_cents += net;
        best.set(i.product_name, row);
      }
      revenue += saleNet;
      discounts += sale.discount_cents;
      if (saleNet > 0) count++;
    }
    const payments = await query(
      "SELECT payment_method,SUM(amount_cents) AS total_cents FROM financial_entries WHERE created_at BETWEEN ? AND ? GROUP BY payment_method",
      [startISO, endISO],
    );
    const low = await query(
      "SELECT pv.id,pv.size,pv.color,pv.stock,pv.min_stock,p.name AS product_name FROM product_variations pv JOIN products p ON p.id=pv.product_id WHERE p.status='active' AND pv.stock<=pv.min_stock ORDER BY pv.stock LIMIT 10",
    );
    res.json({
      period,
      start_date: startISO.slice(0, 10),
      end_date: period === "custom" ? req.query.end_date : today,
      sales_count: count,
      gross_revenue_cents: revenue,
      net_revenue_cents: revenue,
      average_ticket_cents: count ? Math.round(revenue / count) : 0,
      total_discount_cents: discounts,
      payments_breakdown: payments,
      margin_estimated_cents:
        req.user.role === "admin" && knownCost ? margin : null,
      total_cost_cents: req.user.role === "admin" && knownCost ? cost : null,
      best_sellers: [...best.values()]
        .filter((i) => i.total_quantity_sold > 0)
        .sort((a, b) => b.total_quantity_sold - a.total_quantity_sold)
        .slice(0, 5),
      low_stock_items: low,
      cash_register_open: !!(await get(
        "SELECT id FROM cash_registers WHERE status='open'",
      )),
    });
  } catch (error) {
    res.status(error.databaseFailure ? 503 : 400).json({
      error: error.databaseFailure
        ? "Conexão interrompida. Tente novamente com a mesma operação."
        : error.message,
    });
  }
});
const cell = (value) =>
  '"' +
  String(value ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replace(/"/g, '""') +
  '"';
function csv(res, name, header, rows) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${name}`);
  res.send(
    "\uFEFF" +
      [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n"),
  );
}
const money = (v) => (v / 100).toFixed(2).replace(".", ",");
router.get(
  "/export/sales",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { sql, params } = filter(req);
      const rows = await query(
        "SELECT s.*,u.name AS seller_name FROM sales s JOIN users u ON u.id=s.user_id WHERE 1=1" +
          sql +
          " ORDER BY s.created_at DESC",
        params,
      );
      csv(
        res,
        "vendas_lory_boutique.csv",
        [
          "Código",
          "Data/Hora",
          "Status",
          "Atendente",
          "Cliente",
          "Telefone",
          "Subtotal",
          "Desconto",
          "Total original",
          "Devoluções/crédito",
          "Receita líquida",
          "Troco",
        ],
        await Promise.all(
          rows.map(async (s) => {
            const refund = (
              await get(
                "SELECT COALESCE(SUM(return_amount_cents),0) AS n FROM returns WHERE sale_id=?",
                [s.id],
              )
            ).n;
            return [
              s.code,
              new Date(s.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              }),
              s.status,
              s.seller_name,
              s.customer_name,
              s.customer_phone,
              money(s.subtotal_cents),
              money(s.discount_cents),
              money(s.total_cents),
              money(refund),
              money(s.status === "cancelled" ? 0 : s.total_cents - refund),
              money(s.change_cents),
            ];
          }),
        ),
      );
    } catch (error) {
      res.status(error.databaseFailure ? 503 : 400).json({
        error: error.databaseFailure
          ? "Conexão interrompida. Tente novamente com a mesma operação."
          : error.message,
      });
    }
  },
);
router.get(
  "/export/inventory",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const rows = await query(
      "SELECT p.*,pv.size,pv.color,pv.sku,pv.barcode,pv.stock,pv.min_stock,c.name AS category_name FROM products p JOIN product_variations pv ON pv.product_id=p.id LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='active' ORDER BY p.name",
    );
    csv(
      res,
      "estoque_lory_boutique.csv",
      [
        "Produto",
        "Referência",
        "Categoria",
        "Tamanho",
        "Cor",
        "SKU",
        "Código de barras",
        "Estoque",
        "Estoque mínimo",
        "Custo",
        "Venda",
        "Promoção",
      ],
      rows.map((r) => [
        r.name,
        r.reference,
        r.category_name,
        r.size,
        r.color,
        r.sku,
        r.barcode,
        r.stock,
        r.min_stock,
        money(r.cost_price_cents),
        money(r.sale_price_cents),
        r.promo_price_cents === null ? "" : money(r.promo_price_cents),
      ]),
    );
  },
);
module.exports = router;
