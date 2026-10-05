const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { get, query, run, transaction } = require('../db');
const { authenticate, logAudit } = require('../middleware/auth');

// Get currently open cash register (if any)
router.get('/current', authenticate, (req, res) => {
  const openRegister = get(
    `SELECT cr.*, u.name as opener_name
     FROM cash_registers cr
     JOIN users u ON cr.opened_by = u.id
     WHERE cr.status = 'open'
     ORDER BY cr.opened_at DESC
     LIMIT 1`
  );

  if (!openRegister) {
    return res.json({ open: false, register: null });
  }

  // Calculate movements & totals
  const movements = query(
    `SELECT cm.*, u.name as user_name
     FROM cash_movements cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.register_id = ?
     ORDER BY cm.created_at ASC`,
    [openRegister.id]
  );

  // Sales linked to this register
  const sales = query(
    `SELECT s.*, u.name as seller_name
     FROM sales s
     JOIN users u ON s.user_id = u.id
     WHERE s.register_id = ? AND s.status != 'cancelled'
     ORDER BY s.created_at ASC`,
    [openRegister.id]
  );

  // Payments summary
  const payments = query(
    `SELECT sp.payment_method, SUM(sp.amount_cents) as total_cents
     FROM sale_payments sp
     JOIN sales s ON sp.sale_id = s.id
     WHERE s.register_id = ? AND s.status != 'cancelled'
     GROUP BY sp.payment_method`,
    [openRegister.id]
  );

  let cashSalesTotal = 0;
  let pixSalesTotal = 0;
  let debitSalesTotal = 0;
  let creditSalesTotal = 0;

  payments.forEach(p => {
    if (p.payment_method === 'money') cashSalesTotal = p.total_cents;
    if (p.payment_method === 'pix') pixSalesTotal = p.total_cents;
    if (p.payment_method === 'debit') debitSalesTotal = p.total_cents;
    if (p.payment_method === 'credit') creditSalesTotal = p.total_cents;
  });

  // Total change given in cash
  const changeGiven = sales.reduce((sum, s) => sum + (s.change_cents || 0), 0);

  // Cash movements (supplies and bleeds)
  const suppliesTotal = movements
    .filter(m => m.type === 'supply')
    .reduce((sum, m) => sum + m.amount_cents, 0);

  const bleedsTotal = movements
    .filter(m => m.type === 'bleed')
    .reduce((sum, m) => sum + m.amount_cents, 0);

  // Expected cash in drawer:
  // initial + cash payments - change given + supplies - bleeds
  const netCashFromSales = cashSalesTotal - changeGiven;
  const expectedPhysicalCash = openRegister.initial_amount_cents + netCashFromSales + suppliesTotal - bleedsTotal;

  return res.json({
    open: true,
    register: openRegister,
    summary: {
      initial_amount_cents: openRegister.initial_amount_cents,
      cash_sales_gross_cents: cashSalesTotal,
      change_given_cents: changeGiven,
      cash_sales_net_cents: netCashFromSales,
      pix_sales_cents: pixSalesTotal,
      debit_sales_cents: debitSalesTotal,
      credit_sales_cents: creditSalesTotal,
      supplies_cents: suppliesTotal,
      bleeds_cents: bleedsTotal,
      expected_physical_cash_cents: expectedPhysicalCash,
      total_sales_count: sales.length,
      gross_revenue_cents: cashSalesTotal - changeGiven + pixSalesTotal + debitSalesTotal + creditSalesTotal
    },
    movements,
    sales_count: sales.length
  });
});

// Open cash register
router.post('/open', authenticate, (req, res) => {
  const { initial_amount_cents } = req.body;

  const currentOpen = get("SELECT id FROM cash_registers WHERE status = 'open' LIMIT 1");
  if (currentOpen) {
    return res.status(400).json({ error: 'Já existe um caixa aberto no sistema. Feche-o antes de abrir um novo.' });
  }

  const initialAmount = parseInt(initial_amount_cents, 10);
  if (isNaN(initialAmount) || initialAmount < 0) {
    return res.status(400).json({ error: 'Valor inicial inválido.' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO cash_registers (
      id, opened_by, opened_at, initial_amount_cents, status
    ) VALUES (?, ?, ?, ?, 'open')`,
    [id, req.user.id, now, initialAmount]
  );

  logAudit(req.user.id, 'OPEN_CASH_REGISTER', 'cash_register', id, { initial_amount_cents: initialAmount });

  return res.status(201).json({
    message: 'Caixa aberto com sucesso.',
    id,
    opened_at: now,
    initial_amount_cents: initialAmount
  });
});

// Add cash movement (Bleed / Supply)
router.post('/movement', authenticate, (req, res) => {
  const { register_id, type, amount_cents, reason } = req.body;

  if (!register_id || !type || !amount_cents || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios (tipo, valor e justificativa).' });
  }

  if (!['bleed', 'supply'].includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido (deve ser sangria ou suprimento).' });
  }

  const register = get("SELECT * FROM cash_registers WHERE id = ? AND status = 'open'", [register_id]);
  if (!register) {
    return res.status(400).json({ error: 'Caixa informado não está aberto.' });
  }

  const amount = parseInt(amount_cents, 10);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
  }

  const movId = uuidv4();
  const now = new Date().toISOString();

  run(
    `INSERT INTO cash_movements (
      id, register_id, type, amount_cents, reason, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [movId, register_id, type, amount, reason.trim(), req.user.id, now]
  );

  logAudit(req.user.id, type === 'bleed' ? 'CASH_BLEED' : 'CASH_SUPPLY', 'cash_movement', movId, {
    register_id,
    amount_cents: amount,
    reason: reason.trim()
  });

  return res.status(201).json({
    message: `${type === 'bleed' ? 'Sangria' : 'Suprimento'} registrado com sucesso.`,
    id: movId
  });
});

// Close cash register
router.post('/close', authenticate, (req, res) => {
  const { register_id, counted_cash_cents, notes } = req.body;

  if (!register_id || counted_cash_cents === undefined) {
    return res.status(400).json({ error: 'Informe o caixa e o valor contado em dinheiro.' });
  }

  const register = get("SELECT * FROM cash_registers WHERE id = ? AND status = 'open'", [register_id]);
  if (!register) {
    return res.status(404).json({ error: 'Caixa aberto não encontrado.' });
  }

  const countedCash = parseInt(counted_cash_cents, 10);
  if (isNaN(countedCash) || countedCash < 0) {
    return res.status(400).json({ error: 'Valor contado inválido.' });
  }

  // Calculate expected cash in drawer
  const payments = query(
    `SELECT sp.payment_method, SUM(sp.amount_cents) as total_cents
     FROM sale_payments sp
     JOIN sales s ON sp.sale_id = s.id
     WHERE s.register_id = ? AND s.status != 'cancelled'
     GROUP BY sp.payment_method`,
    [register_id]
  );

  const sales = query(
    `SELECT change_cents FROM sales WHERE register_id = ? AND status != 'cancelled'`,
    [register_id]
  );

  let cashSalesTotal = 0;
  payments.forEach(p => {
    if (p.payment_method === 'money') cashSalesTotal = p.total_cents;
  });

  const changeGiven = sales.reduce((sum, s) => sum + (s.change_cents || 0), 0);

  const movements = query(
    `SELECT type, amount_cents FROM cash_movements WHERE register_id = ?`,
    [register_id]
  );

  const suppliesTotal = movements
    .filter(m => m.type === 'supply')
    .reduce((sum, m) => sum + m.amount_cents, 0);

  const bleedsTotal = movements
    .filter(m => m.type === 'bleed')
    .reduce((sum, m) => sum + m.amount_cents, 0);

  const netCashFromSales = cashSalesTotal - changeGiven;
  const expectedCash = register.initial_amount_cents + netCashFromSales + suppliesTotal - bleedsTotal;
  const difference = countedCash - expectedCash;

  const now = new Date().toISOString();

  run(
    `UPDATE cash_registers SET
      closed_by = ?,
      closed_at = ?,
      counted_cash_cents = ?,
      expected_cash_cents = ?,
      difference_cents = ?,
      notes = ?,
      status = 'closed'
    WHERE id = ?`,
    [req.user.id, now, countedCash, expectedCash, difference, notes || '', register_id]
  );

  logAudit(req.user.id, 'CLOSE_CASH_REGISTER', 'cash_register', register_id, {
    counted_cash_cents: countedCash,
    expected_cash_cents: expectedCash,
    difference_cents: difference,
    notes
  });

  return res.json({
    message: 'Caixa fechado com sucesso.',
    summary: {
      counted_cash_cents: countedCash,
      expected_cash_cents: expectedCash,
      difference_cents: difference,
      status: difference === 0 ? 'exato' : difference > 0 ? 'sobra' : 'falta'
    }
  });
});

// Cash registers history
router.get('/history', authenticate, (req, res) => {
  const { limit = 30 } = req.query;

  const history = query(
    `SELECT cr.*, u1.name as opener_name, u2.name as closer_name
     FROM cash_registers cr
     JOIN users u1 ON cr.opened_by = u1.id
     LEFT JOIN users u2 ON cr.closed_by = u2.id
     ORDER BY cr.opened_at DESC
     LIMIT ?`,
    [parseInt(limit, 10)]
  );

  return res.json(history);
});

module.exports = router;
