import { AppError } from '../middleware/errorHandler.js';
import { createAssetType, deleteAssetType, listAssetTypes, updateAssetType } from '../services/assetService.js';
import { createAssetTypeSchema, updateAssetTypeSchema } from '../validators/assetTypeValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getAssetTypes(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true' && req.user.role.permissionKeys.includes('*');
    const items = await listAssetTypes(includeInactive);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetType(req, res, next) {
  const input = parseOrFail(createAssetTypeSchema, req.body, next);
  if (!input) return;
  try {
    const assetType = await createAssetType(input);
    res.status(201).json({ success: true, message: 'Asset type created', data: { assetType } });
  } catch (error) {
    next(error);
  }
}

export async function deleteAssetTypeRecord(req, res, next) {
  try {
    await deleteAssetType(req.params.id);
    res.json({ success: true, message: 'Asset type deleted' });
  } catch (error) {
    next(error);
  }
}

export async function patchAssetType(req, res, next) {
  const updates = parseOrFail(updateAssetTypeSchema, req.body, next);
  if (!updates) return;
  try {
    const assetType = await updateAssetType(req.params.id, updates);
    res.json({ success: true, message: 'Asset type updated', data: { assetType } });
  } catch (error) {
    next(error);
  }
}
