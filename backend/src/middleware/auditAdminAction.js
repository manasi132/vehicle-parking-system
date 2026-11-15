const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

function auditAdminAction(action, targetType) {
  return async function auditAdminActionMiddleware(req, res, next) {
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary'
      });
    } catch (error) {
      if (session) await session.endSession().catch(() => {});
      return next(error);
    }

    const context = { session, afterCommit: [], afterFinalize: [], finishing: null, finished: false };
    req.auditContext = context;

    async function finalize(commit) {
      if (context.finishing) return context.finishing;
      context.finishing = (async () => {
        let committed = false;
        try {
          if (session.inTransaction()) {
            if (commit) { await session.commitTransaction(); committed = true; }
            else await session.abortTransaction();
          } else committed = commit;
        } catch (error) {
          if (session.inTransaction()) await session.abortTransaction().catch(() => {});
          throw error;
        } finally {
          if (committed) {
            for (const callback of context.afterCommit) {
              try { await callback(); }
              catch (error) { console.error('Post-commit action failed:', error && error.message ? error.message : 'unknown error'); }
            }
          }
          for (const callback of context.afterFinalize) {
            try { await callback(); }
            catch (error) { console.error('Transaction cleanup failed:', error && error.message ? error.message : 'unknown error'); }
          }
          context.finished = true;
          await session.endSession().catch(() => {});
        }
      })();
      return context.finishing;
    }

    const sendJson = res.json.bind(res);
    let responseHandled = false;
    res.json = function auditedJson(body) {
      if (responseHandled || context.finished) return sendJson(body);
      responseHandled = true;
      const successful = res.statusCode >= 200 && res.statusCode < 300;
      const shouldAudit = successful && req.user && req.user.role === 'admin';

      (async () => {
        if (shouldAudit) {
          const responseBody = body && typeof body === 'object' ? body : {};
          const targetId = req.params.lotId || req.params.userId || req.params.id ||
            (responseBody.lot && responseBody.lot._id) ||
            (responseBody.user && responseBody.user.id) ||
            responseBody.entryId ||
            (responseBody.slots && responseBody.slots[0] && responseBody.slots[0]._id) || null;
          await AuditLog.create([{
            action, actor: req.user.id, targetType,
            targetId: targetId ? String(targetId) : null,
            method: req.method, path: req.path, occurredAt: new Date()
          }], { session });
        }
        await finalize(successful);
        return sendJson(body);
      })().catch(async (error) => {
        try { await finalize(false); } catch (_finalizeError) {}
        next(error);
      });
      return res;
    };

    res.once('close', () => {
      if (!responseHandled && !context.finished) finalize(false).catch(() => {});
    });
    return next();
  };
}
module.exports = auditAdminAction;
