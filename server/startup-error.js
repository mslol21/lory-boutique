// Return only known configuration guidance. Never expose driver messages or URLs.
function startupError(error) {
  const code = error.code;
  const message = String(error.message || "");
  if (code === "DATABASE_URL_INVALID" || code === "ERR_INVALID_URL")
    return "DATABASE_URL inválida. Use a URI PostgreSQL do Supabase, em Connect > Session pooler, com a senha do banco preenchida.";
  if (["ENETUNREACH", "EHOSTUNREACH", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code) || /timeout|timed out/i.test(message))
    return "Não foi possível conectar ao banco. Confira DATABASE_URL; na Vercel, use a URI de Connect > Session pooler do Supabase (porta 5432).";
  if (["28P01", "28000"].includes(code))
    return "O banco recusou as credenciais. Confira o usuário e a senha do banco na DATABASE_URL.";
  if (["42P01", "42703"].includes(code))
    return "A estrutura do banco está incompleta. Execute os scripts SQL 01_initial.sql e 02_online.sql conforme o README.";
  if (code === "42501")
    return "O usuário da conexão não tem permissão no banco. Confira a URI PostgreSQL do servidor na DATABASE_URL.";
  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code))
    return "Não foi possível validar o certificado do banco. Configure DATABASE_CA_CERT com o certificado CA fornecido pelo Supabase.";
  if (message.startsWith("ADMIN_PASSWORD deve"))
    return "ADMIN_PASSWORD deve ter ao menos 12 caracteres. Atualize a variável na Vercel e faça Redeploy.";
  if (message.startsWith("Defina JWT_SECRET"))
    return "JWT_SECRET precisa ter pelo menos 32 caracteres. Confira a variável e faça Redeploy.";
  return "Sistema não configurado. Confira DATABASE_URL, JWT_SECRET e os scripts SQL no servidor.";
}
module.exports = { startupError };
