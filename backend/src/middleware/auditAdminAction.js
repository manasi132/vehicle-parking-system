const AuditLog = require('../models/AuditLog');

function auditAdminAction(action, targetType) {
  return function auditAdminActionMiddleware(req, res, next) {
    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 400 || !req.user || req.user.role !== 'admin') return;
      const targetId = req.params.lotId || req.params.userId || req.params.id || null;
      AuditLog.create({
        action,
        actor: req.user.id,
        targetType,
        targetId: targetId ? String(targetId) : null,
        method: req.method,
        path: req.path,
        occurredAt: new Date()
      }).catch((error) => console.error('Unable to persist admin audit event:', error.message));
    });
    next();
  };
}

module.exports = auditAdminAction;
