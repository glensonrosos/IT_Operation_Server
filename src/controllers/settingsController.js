import { AppError } from '../middleware/errorHandler.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { updateSettingsSchema } from '../validators/settingsValidators.js';

export async function getSystemSettings(req, res, next) {
  try { res.json({ success: true, data: { settings: await getSettings() } }); } catch (error) { next(error); }
}

export async function patchSystemSettings(req, res, next) {
  const result = updateSettingsSchema.safeParse(req.body);
  if (!result.success) return next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
  try { res.json({ success: true, message: 'System settings updated', data: { settings: await updateSettings(result.data, req.user._id) } }); } catch (error) { next(error); }
}
