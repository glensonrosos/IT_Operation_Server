import { AppError } from '../middleware/errorHandler.js';
import { listWarrantyAssets } from '../services/maintenanceService.js';
import { warrantyQuerySchema } from '../validators/maintenanceValidators.js';

export async function getWarrantyAssets(req, res, next) {
  const result = warrantyQuerySchema.safeParse(req.query);
  if (!result.success) return next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
  try {
    const items = await listWarrantyAssets({ ...result.data, includeExpired: result.data.includeExpired === 'true' });
    res.json({ success: true, data: { items, total: items.length } });
  } catch (error) {
    next(error);
  }
}
