import { AppError } from '../middleware/errorHandler.js';
import { listAuditLogs } from '../services/auditService.js';
import { auditQuerySchema } from '../validators/auditValidators.js';

export async function getAuditLogs(req, res, next) {
  const result = auditQuerySchema.safeParse(req.query);
  if (!result.success) return next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
  try {
    const data = await listAuditLogs(result.data);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
