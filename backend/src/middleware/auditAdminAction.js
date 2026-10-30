const AuditLog = require('../models/AuditLog');

function auditAdminAction(action, targetType) {
  return function auditAdminActionMiddleware(req, res, next) {
    const sendJson = res.json.bind(res);
    let auditStarted = false;

    res.json = function auditedJson(body) {
      if (auditStarted || res.statusCode < 200 || res.statusCode >= 400 ||
          !req.user || req.user.role !== 'admin') {
        return sendJson(body);
      }
      auditStarted = true;
      const targetId = req.params.lotId || req.params.userId || req.params.id || null;
      AuditLog.create({
        action,
        actor: req.user.id,
        targetType,
        targetId: targetId ? String(targetId) : null,
        method: req.method,
        path: req.path,
        occurredAt: new Date()
      }).then(() => sendJson(body)).catch(next);
      return res;
    };

    next();
  };
}

module.exports = auditAdminAction;
