const express = require('express');
const router = express.Router();
const { query, get } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// Dashboard summary metrics
router.get('/dashboard', authenticate, (req, res) => {
  const { period = 'today' } = req.query;
  const isAdmin = req.user.role === 'admin';

  let dateFilter = '';
  const params = [];
  const now = new Date();

  if (period === 'today') {
    const todayStr = now.toISOString().split('T')[0];
    dateFilter = ' AND s.created_at >= ?';
    params.push(`${todayStr}T00:00:00.000Z`);
  } else if (period === '7days') {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = ' AND s.created_at >= ?';
    params.push(d.toISOString());
  } else if (period === '30days') {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = ' AND s.created_at >= ?';
    params.push(d.toISOString());
  }

  // 1. Sales summary (only completed or partial returns)
  const salesSummary = get(
    `SELECT
       COUNT(*) as sales_count,
       COALESCE(SUM(s.total_cents), 0) as gross_revenue_cents,
       COALESCE(SUM(s.discount_cents), 0) as total_discount_cents
     FROM sales s
     WHERE s.status != 'cancelled' ${dateFilter}`,
    params
  );

  const salesCount = salesSummary ? salesSummary.sales_count : 0;
  const grossRevenue = salesSummary ? salesSummary.gross_revenue_cents : 0;
  const averageTicketCents = salesCount > 0 ? Math.round(grossRevenue / salesCount) : 0;

  // 2. Payments breakdown
  const paymentsBreakdown = query(
    `SELECT sp.payment_method, SUM(sp.amount_cents) as total_cents
     FROM sale_payments sp
     JOIN sales s ON sp.sale_id = s.id
     WHERE s.status != 'cancelled' ${dateFilter}
     GROUP BY sp.payment_method`,
    params
  );

  // 3. Margin & Cost Calculation (admin only)
  let marginEstimatedCents = null;
  let totalCostCents = null;

  if (isAdmin) {
    const marginData = get(
      `SELECT
         COALESCE(SUM(si.total_cents), 0) as items_revenue,
         COALESCE(SUM(si.cost_price_cents * (si.quantity - si.returned_quantity)), 0) as items_cost,
         COALESCE(SUM(CASE WHEN si.cost_price_cents > 0 THEN si.total_cents ELSE 0 END), 0) as items_revenue_with_cost
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.status != 'cancelled' ${dateFilter}`,
      params
    );

    if (marginData && marginData.items_revenue_with_cost > 0) {
      totalCostCents = marginData.items_cost;
      marginEstimatedCents = marginData.items_revenue_with_cost - marginData.items_cost;
    }
  }

  // 4. Best selling products
  const bestSellers = query(
    `SELECT
       si.product_name,
       SUM(si.quantity - si.returned_quantity) as total_quantity_sold,
       SUM(si.total_cents) as total_cents
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE s.status != 'cancelled' ${dateFilter}
     GROUP BY si.product_name
     ORDER BY total_quantity_sold DESC
     LIMIT 5`,
    params
  );

  // 5. Low stock alerts (variations at or below min_stock)
  const lowStockItems = query(
    `SELECT
       pv.id, pv.size, pv.color, pv.sku, pv.stock, pv.min_stock,
       p.name as product_name, p.reference
     FROM product_variations pv
     JOIN products p ON pv.product_id = p.id
     WHERE p.status = 'active' AND pv.stock <= pv.min_stock
     ORDER BY pv.stock ASC
     LIMIT 10`
  );

  // 6. Current cash register status
  const openRegister = get("SELECT * FROM cash_registers WHERE status = 'open' LIMIT 1");

  return res.json({
    period,
    sales_count: salesCount,
    gross_revenue_cents: grossRevenue,
    average_ticket_cents: averageTicketCents,
    total_discount_cents: salesSummary ? salesSummary.total_discount_cents : 0,
    payments_breakdown: paymentsBreakdown,
    margin_estimated_cents: marginEstimatedCents,
    total_cost_cents: totalCostCents,
    best_sellers: bestSellers,
    low_stock_items: lowStockItems,
    cash_register_open: !!openRegister
  });
});

// CSV Export for Sales
router.get('/export/sales', authenticate, requireRole('admin'), (req, res) => {
  const { start_date, end_date } = req.query;

  let sql = `
    SELECT
      s.code, s.created_at, s.status, s.customer_name, s.customer_phone,
      s.subtotal_cents, s.discount_cents, s.total_cents, s.change_cents,
      u.name as seller_name
    FROM sales s
    JOIN users u ON s.user_id = u.id
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

  sql += ' ORDER BY s.created_at DESC';

  const rows = query(sql, params);

  let csv = 'Código;Data/Hora;Status;Atendente;Cliente;Telefone;Subtotal (R$);Desconto (R$);Total (R$);Troco (R$)\n';

  rows.forEach(r => {
    const dateFormatted = new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const subtotal = (r.subtotal_cents / 100).toFixed(2).replace('.', ',');
    const discount = (r.discount_cents / 100).toFixed(2).replace('.', ',');
    const total = (r.total_cents / 100).toFixed(2).replace('.', ',');
    const change = (r.change_cents / 100).toFixed(2).replace('.', ',');
    const customer = (r.customer_name || 'Não informado').replace(/;/g, ' ');
    const phone = (r.customer_phone || '').replace(/;/g, ' ');

    csv += `${r.code};${dateFormatted};${r.status};${r.seller_name};${customer};${phone};${subtotal};${discount};${total};${change}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vendas_lory_boutique.csv');
  return res.send('\uFEFF' + csv); // Include BOM for Excel
});

// CSV Export for Inventory / Stock
router.get('/export/inventory', authenticate, requireRole('admin'), (req, res) => {
  const rows = query(`
    SELECT
      p.name as product_name, p.reference, c.name as category_name,
      pv.size, pv.color, pv.sku, pv.barcode, pv.stock, pv.min_stock,
      p.cost_price_cents, p.sale_price_cents, p.promo_price_cents
    FROM product_variations pv
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'active'
    ORDER BY p.name ASC, pv.size ASC
  `);

  let csv = 'Produto;Referência;Categoria;Tamanho;Cor;SKU;Código de Barras;Estoque Atual;Estoque Mínimo;Preço Custo (R$);Preço Venda (R$);Preço Promo (R$)\n';

  rows.forEach(r => {
    const cost = (r.cost_price_cents / 100).toFixed(2).replace('.', ',');
    const sale = (r.sale_price_cents / 100).toFixed(2).replace('.', ',');
    const promo = r.promo_price_cents ? (r.promo_price_cents / 100).toFixed(2).replace('.', ',') : '';

    csv += `"${r.product_name.replace(/"/g, '""')}";${r.reference || ''};${r.category_name || ''};${r.size};${r.color};${r.sku || ''};${r.barcode || ''};${r.stock};${r.min_stock};${cost};${sale};${promo}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=estoque_lory_boutique.csv');
  return res.send('\uFEFF' + csv);
});

module.exports = router;
