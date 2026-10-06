const METHODS = ["money", "pix", "debit", "credit"];
function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min)
    throw new Error(
      `${label}: informe um número inteiro válido, mínimo ${min}.`,
    );
  return value;
}
function text(value, label, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new Error(`${label} inválido.`);
  return value.trim();
}
function method(value) {
  if (!METHODS.includes(value)) throw new Error("Forma de pagamento inválida.");
  return value;
}
function dateBounds(start, end) {
  const valid = (d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
  if ((start && !valid(start)) || (end && !valid(end)))
    throw new Error("Data inválida.");
  if (start && end && start > end) throw new Error("A data inicial deve ser anterior ou igual à final.");
  return {
    start: start ? new Date(start + "T00:00:00-03:00").toISOString() : null,
    end: end ? new Date(end + "T23:59:59.999-03:00").toISOString() : null,
  };
}
const todaySP = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
module.exports = { METHODS, integer, text, method, dateBounds, todaySP };
