const jwt = require('jsonwebtoken');
const { get } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'lory-boutique-secret-key-2026-secure';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado: Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user is still active in database
    const user = get('SELECT id, name, username, role, active FROM users WHERE id = ?', [decoded.id]);
    if (!user || user.active !== 1) {
      return res.status(401).json({ error: 'Usuário inativo ou inexistente.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido.' });
  }
}

// Check role: allows 'admin' or checks if role matches
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Acesso negado: Seu perfil não possui permissão para esta operação.'
      });
    }

    next();
  };
}

// Log audit action
function logAudit(userId, action, entity, entityId, details) {
  const { v4: uuidv4 } = require('uuid');
  const { run } = require('../db');
  try {
    run(
      'INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        userId,
        action,
        entity,
        entityId ? String(entityId) : null,
        typeof details === 'object' ? JSON.stringify(details) : details,
        new Date().toISOString()
      ]
    );
  } catch (e) {
    console.error('Falha ao gravar log de auditoria:', e);
  }
}

module.exports = {
  authenticate,
  requireRole,
  logAudit,
  JWT_SECRET
};
