const { get, query } = require("./db");
async function summary(id) {
  const reg = await get("SELECT * FROM cash_registers WHERE id=?", [id]);
  const movements = await query(
    "SELECT * FROM cash_movements WHERE register_id=?",
    [id],
  );
  const payments = await query(
    "SELECT payment_method, SUM(amount_cents) AS amount FROM financial_entries WHERE register_id=? GROUP BY payment_method",
    [id],
  );
  const totals = Object.fromEntries(
    payments.map((p) => [p.payment_method, p.amount]),
  );
  const supply = movements
      .filter((m) => m.type === "supply")
      .reduce((s, m) => s + m.amount_cents, 0),
    bleed = movements
      .filter((m) => m.type === "bleed")
      .reduce((s, m) => s + m.amount_cents, 0);
  const changes = (
    await get(
      "SELECT COALESCE(SUM(change_cents),0) AS n FROM sales WHERE register_id=?",
      [id],
    )
  ).n;
  const count = (
    await get(
      "SELECT COUNT(*) AS n FROM sales WHERE register_id=? AND status!='cancelled'",
      [id],
    )
  ).n;
  return {
    initial_amount_cents: reg.initial_amount_cents,
    cash_sales_gross_cents: (totals.money ?? 0) + changes,
    change_given_cents: changes,
    cash_sales_net_cents: totals.money ?? 0,
    pix_sales_cents: totals.pix ?? 0,
    debit_sales_cents: totals.debit ?? 0,
    credit_sales_cents: totals.credit ?? 0,
    supplies_cents: supply,
    bleeds_cents: bleed,
    expected_physical_cash_cents:
      reg.initial_amount_cents + (totals.money ?? 0) + supply - bleed,
    total_sales_count: count,
    gross_revenue_cents: payments.reduce((s, p) => s + p.amount, 0),
  };
}
module.exports = {
  summary,
};
