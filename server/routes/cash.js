const express = require("express");
const router = express.Router();
const { randomUUID } = require("node:crypto");
const { get, query, run, transaction } = require("../db");
const { authenticate, logAudit } = require("../middleware/auth");
const { integer, text } = require("../validation");
const { summary } = require("../cash-summary");
router.get("/current", authenticate, (req, res) => {
  const register = get(
    "SELECT cr.*,u.name AS opener_name FROM cash_registers cr JOIN users u ON u.id=cr.opened_by WHERE status='open'",
  );
  if (!register) return res.json({ open: false, register: null });
  res.json({
    open: true,
    register,
    summary: summary(register.id),
    movements: query(
      "SELECT cm.*,u.name AS user_name FROM cash_movements cm JOIN users u ON u.id=cm.user_id WHERE register_id=? ORDER BY created_at",
      [register.id],
    ),
  });
});
router.post("/open", authenticate, (req, res) => {
  try {
    const amount = integer(req.body.initial_amount_cents, "Valor inicial");
    const result = transaction(() => {
      if (get("SELECT id FROM cash_registers WHERE status='open'"))
        throw new Error("Já existe um caixa aberto.");
      const id = randomUUID(),
        now = new Date().toISOString();
      run(
        "INSERT INTO cash_registers(id,opened_by,opened_at,initial_amount_cents,status) VALUES (?,?,?,?,'open')",
        [id, req.user.id, now, amount],
      );
      logAudit(req.user.id, "OPEN_CASH_REGISTER", "cash_register", id, {
        amount,
      });
      return { id, opened_at: now, initial_amount_cents: amount };
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
router.post("/movement", authenticate, (req, res) => {
  try {
    const { register_id, type } = req.body;
    const amount = integer(req.body.amount_cents, "Valor", 1),
      reason = text(req.body.reason, "Motivo", 500);
    if (!["bleed", "supply"].includes(type))
      throw new Error("Movimento inválido.");
    transaction(() => {
      if (
        !get("SELECT id FROM cash_registers WHERE id=? AND status='open'", [
          register_id,
        ])
      )
        throw new Error("Caixa fechado.");
      if (
        type === "bleed" &&
        amount > summary(register_id).expected_physical_cash_cents
      )
        throw new Error("Sangria excede o dinheiro disponível.");
      const id = randomUUID();
      run(
        "INSERT INTO cash_movements(id,register_id,type,amount_cents,reason,user_id,created_at) VALUES (?,?,?,?,?,?,?)",
        [
          id,
          register_id,
          type,
          amount,
          reason,
          req.user.id,
          new Date().toISOString(),
        ],
      );
      logAudit(req.user.id, "CASH_MOVEMENT", "cash_movement", id, {
        type,
        amount,
        reason,
      });
    });
    res.status(201).json({ message: "Movimento registrado." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
router.post("/close", authenticate, (req, res) => {
  try {
    const counted = integer(req.body.counted_cash_cents, "Valor contado");
    const result = transaction(() => {
      const reg = get(
        "SELECT * FROM cash_registers WHERE id=? AND status='open'",
        [req.body.register_id],
      );
      if (!reg) throw new Error("Caixa aberto não encontrado.");
      const expected = summary(reg.id).expected_physical_cash_cents,
        difference = counted - expected;
      run(
        "UPDATE cash_registers SET closed_by=?,closed_at=?,counted_cash_cents=?,expected_cash_cents=?,difference_cents=?,notes=?,status='closed' WHERE id=?",
        [
          req.user.id,
          new Date().toISOString(),
          counted,
          expected,
          difference,
          req.body.notes ? text(req.body.notes, "Observações", 500) : "",
          reg.id,
        ],
      );
      logAudit(req.user.id, "CLOSE_CASH_REGISTER", "cash_register", reg.id, {
        counted,
        expected,
        difference,
      });
      return {
        counted_cash_cents: counted,
        expected_cash_cents: expected,
        difference_cents: difference,
        status: difference === 0 ? "exato" : difference > 0 ? "sobra" : "falta",
      };
    });
    res.json({ summary: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
router.get("/history", authenticate, (req, res) =>
  res.json(
    query(
      "SELECT cr.*,u.name AS opener_name,c.name AS closer_name FROM cash_registers cr JOIN users u ON u.id=cr.opened_by LEFT JOIN users c ON c.id=cr.closed_by ORDER BY cr.opened_at DESC LIMIT 100",
    ),
  ),
);
module.exports = router;
