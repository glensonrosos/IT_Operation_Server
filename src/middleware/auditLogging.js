import { recordAuditEvent } from '../services/auditService.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function auditLogging(req, res, next) {
  if (safeMethods.has(req.method) || !req.user) return next();
  res.on('finish', () => {
    if (req.path === '/auth/login') return;
    void recordAuditEvent({ req, statusCode: res.statusCode });
  });
  next();
}
