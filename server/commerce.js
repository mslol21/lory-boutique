const { randomUUID, createHash } = require("node:crypto");
const { get, query, run } = require("./db");
const { integer, method, todaySP } = require("./validation");
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function register() {
  const r = get("SELECT * FROM cash_registers WHERE status='open'");
  if (!r) throw new Error("Abra o caixa para registrar esta operação.");
  return r;
}
function prepareItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 200)
    throw new Error("Selecione as peças.");
  const grouped = new Map();
  for (const item of items) {
    if (typeof item.variation_id !== "string")
      throw new Error("Variação inválida.");
    const qty = integer(item.quantity, "Quantidade", 1);
    grouped.set(
      item.variation_id,
      integer((grouped.get(item.variation_id) || 0) + qty, "Quantidade", 1),
    );
  }
  return [...grouped].map(([id, qty]) => {
    const v = get(
      `SELECT pv.*,p.name AS product_name,p.reference AS product_reference,p.cost_price_cents,p.sale_price_cents,p.promo_price_cents,p.status FROM product_variations pv JOIN products p ON p.id=pv.product_id WHERE pv.id=?`,
      [id],
    );
    if (!v || v.status !== "active")
      throw new Error("Produto inexistente ou arquivado.");
    if (v.stock < qty)
      throw new Error(
        `Estoque insuficiente para ${v.product_name} (${v.size}/${v.color}). Disponível: ${v.stock}.`,
      );
    const price = integer(
      v.promo_price_cents ?? v.sale_price_cents,
      "Preço",
      1,
    );
    return { ...v, qty, price, total: integer(price * qty, "Total", 1) };
  });
}
function validatePayments(payments, total) {
  if (!Array.isArray(payments) || payments.length > 10)
    throw new Error("Pagamentos inválidos.");
  let paid = 0,
    cash = 0,
    digital = 0;
  for (const p of payments) {
    method(p.method);
    integer(p.amount_cents, "Pagamento", 1);
    paid = integer(paid + p.amount_cents, "Total pago");
    if (p.method === "money") cash += p.amount_cents;
    else digital += p.amount_cents;
  }
  if (paid < total) throw new Error("Valor pago insuficiente.");
  const change = paid - total;
  if (digital > total || change > cash)
    throw new Error(
      "O troco não pode exceder o dinheiro recebido. Corrija os pagamentos digitais.",
    );
  return change;
}
function stock(id, delta, type, reason, reference, user) {
  const v = get("SELECT stock FROM product_variations WHERE id=?", [id]);
  if (!v) throw new Error("Variação inexistente.");
  const next = integer(v.stock + delta, "Estoque");
  run("UPDATE product_variations SET stock=?,updated_at=? WHERE id=?", [
    next,
    new Date().toISOString(),
    id,
  ]);
  run(
    "INSERT INTO stock_movements(id,variation_id,type,quantity,previous_stock,new_stock,reason,reference_id,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      randomUUID(),
      id,
      type,
      delta,
      v.stock,
      next,
      reason,
      reference,
      user,
      new Date().toISOString(),
    ],
  );
}
function ledger(reg, sale, returnId, kind, payMethod, amount) {
  method(payMethod);
  if (!Number.isSafeInteger(amount))
    throw new Error("Movimento financeiro inválido.");
  if (
    amount < 0 &&
    payMethod === "money" &&
    -amount >
      require("./cash-summary").summary(reg).expected_physical_cash_cents
  )
    throw new Error(
      "Dinheiro insuficiente no caixa para restituição. Registre um suprimento.",
    );
  if (amount)
    run(
      "INSERT INTO financial_entries(id,register_id,sale_id,return_id,kind,payment_method,amount_cents,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [
        randomUUID(),
        reg,
        sale,
        returnId,
        kind,
        payMethod,
        amount,
        new Date().toISOString(),
      ],
    );
}
function netPayments(payments, change) {
  let remaining = change;
  return payments.map((p) => {
    const deduct =
      p.method === "money" ? Math.min(remaining, p.amount_cents) : 0;
    remaining -= deduct;
    return { ...p, net: p.amount_cents - deduct };
  });
}
function createSale({
  items,
  payments,
  discount = 0,
  user,
  reg,
  key = null,
  requestHash = null,
  customerName = null,
  customerPhone = null,
  credit = 0,
}) {
  const prepared = prepareItems(items),
    subtotal = integer(
      prepared.reduce((a, v) => a + v.total, 0),
      "Subtotal",
    );
  integer(discount, "Desconto");
  if (discount > subtotal) throw new Error("Desconto superior ao subtotal.");
  const total = subtotal - discount;
  integer(credit, "Crédito");
  if (credit > total) throw new Error("Crédito superior à nova compra.");
  const change = validatePayments(payments, total - credit),
    id = randomUUID(),
    now = new Date().toISOString();
  const ym = todaySP().slice(0, 7).replace("-", "");
  const seq =
    get("SELECT COUNT(*) AS n FROM sales WHERE code LIKE ?", [`LB-${ym}-%`]).n +
    1;
  const code = `LB-${ym}-${String(seq).padStart(6, "0")}`;
  run(
    "INSERT INTO sales(id,code,register_id,user_id,customer_name,customer_phone,subtotal_cents,discount_cents,total_cents,change_cents,status,idempotency_key,request_hash,exchange_credit_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'completed',?,?,?,?)",
    [
      id,
      code,
      reg.id,
      user.id,
      customerName,
      customerPhone,
      subtotal,
      discount,
      total,
      change,
      key,
      requestHash,
      credit,
      now,
    ],
  );
  let allocated = 0,
    cumulative = 0;
  for (let i = 0; i < prepared.length; i++) {
    const v = prepared[i];
    cumulative += v.total;
    const target = Number(
      (BigInt(discount) * BigInt(cumulative)) / BigInt(subtotal),
    );
    const lineDiscount = target - allocated;
    allocated = target;
    run(
      "INSERT INTO sale_items(id,sale_id,variation_id,product_name,product_reference,size,color,cost_price_cents,unit_price_cents,quantity,total_cents,net_total_cents,returned_quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)",
      [
        randomUUID(),
        id,
        v.id,
        v.product_name,
        v.product_reference,
        v.size,
        v.color,
        v.cost_price_cents,
        v.price,
        v.qty,
        v.total,
        v.total - lineDiscount,
      ],
    );
    stock(v.id, -v.qty, "sale", `Venda ${code}`, id, user.id);
  }
  for (const p of payments)
    run(
      "INSERT INTO sale_payments(id,sale_id,payment_method,amount_cents) VALUES (?,?,?,?)",
      [randomUUID(), id, p.method, p.amount_cents],
    );
  for (const p of netPayments(payments, change))
    ledger(reg.id, id, null, "sale", p.method, p.net);
  return {
    saleId: id,
    saleCode: code,
    id,
    code,
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: total,
    change_cents: change,
    exchange_credit_cents: credit,
    created_at: now,
  };
}
function refundForItem(item, qty) {
  const before = Number(
    (BigInt(item.net_total_cents) * BigInt(item.returned_quantity)) /
      BigInt(item.quantity),
  );
  const after = Number(
    (BigInt(item.net_total_cents) * BigInt(item.returned_quantity + qty)) /
      BigInt(item.quantity),
  );
  return after - before;
}
function saleDetails(id, role) {
  const s = get(
    "SELECT s.*,u.name AS seller_name FROM sales s JOIN users u ON u.id=s.user_id WHERE s.id=? OR s.code=?",
    [id, id],
  );
  if (!s) return null;
  const items = query("SELECT * FROM sale_items WHERE sale_id=?", [s.id]);
  if (role !== "admin") items.forEach((i) => delete i.cost_price_cents);
  return {
    ...s,
    items,
    payments: query("SELECT * FROM sale_payments WHERE sale_id=?", [s.id]),
  };
}
module.exports = {
  hash,
  register,
  prepareItems,
  validatePayments,
  stock,
  ledger,
  netPayments,
  createSale,
  refundForItem,
  saleDetails,
};
