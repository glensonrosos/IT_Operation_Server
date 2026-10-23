import { AppError } from '../middleware/errorHandler.js';
import { archiveAsset, assignAsset, createAsset, getAsset, getCurrentAssignment, listAssetAssignments, listAssetHistory, listAssetImages, listAssetSpareParts, listAssets, listEmployeeAssetAssignments, storeAssetImages, streamAssetImage, updateAsset } from '../services/assetService.js';
import { assetQuerySchema, assignAssetSchema, createAssetSchema, updateAssetSchema } from '../validators/assetValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

function canViewArchived(user) {
  return user.role.permissionKeys.includes('*') || user.role.permissionKeys.includes('assets.archive');
}

export async function getAssets(req, res, next) {
  const query = parseOrFail(assetQuerySchema, req.query, next);
  if (!query) return;
  if (query.includeArchived === 'true' && !canViewArchived(req.user)) return next(new AppError(403, 'FORBIDDEN', 'You cannot view archived assets'));
  try {
    const data = await listAssets({ ...query, includeArchived: query.includeArchived === 'true' });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAssetById(req, res, next) {
  try {
    const asset = await getAsset(req.params.id, canViewArchived(req.user));
    res.json({ success: true, data: { asset } });
  } catch (error) {
    next(error);
  }
}

export async function postAsset(req, res, next) {
  const input = parseOrFail(createAssetSchema, req.body, next);
  if (!input) return;
  try {
    const asset = await createAsset(input, req.user._id);
    res.status(201).json({ success: true, message: 'Asset created', data: { asset } });
  } catch (error) {
    next(error);
  }
}

export async function getAssetSpareParts(req, res, next) { try { res.json({ success: true, data: { items: await listAssetSpareParts(req.params.id) } }); } catch (error) { next(error); } }

export async function getAssetImages(req, res, next) {
  try {
    const images = await listAssetImages(req.params.id, req.query.borrowing);
    res.json({ success: true, data: { images } });
  } catch (error) {
    next(error);
  }
}

export async function getAssetImage(req, res, next) {
  try {
    await streamAssetImage(req.params.id, req.params.imageId, res, next);
  } catch (error) {
    next(error);
  }
}

export async function postAssetImages(req, res, next) {
  try {
    const images = await storeAssetImages(req.params.id, req.files, req.user._id, { transferFrom: req.body.transferFrom, transferTo: req.body.transferTo, returnBy: req.body.returnBy, uploadedVia: req.body.uploadedVia, borrowing: req.body.borrowing });
    res.status(201).json({ success: true, message: 'Asset images uploaded', data: { images } });
  } catch (error) {
    next(error);
  }
}

export async function patchAsset(req, res, next) {
  const updates = parseOrFail(updateAssetSchema, req.body, next);
  if (!updates) return;
  try {
    const asset = await updateAsset(req.params.id, updates, req.user._id);
    res.json({ success: true, message: 'Asset updated', data: { asset } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetAssignment(req, res, next) {
  const input = parseOrFail(assignAssetSchema, req.body, next);
  if (!input) return;
  try {
    const data = await assignAsset(req.params.id, input, req.user._id);
    res.status(201).json({ success: true, message: 'Asset assigned', data });
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeAssetAssignments(req, res, next) {
  try {
    const items = await listEmployeeAssetAssignments(req.params.employeeId);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getAssetHistory(req, res, next) {
  try {
    const items = await listAssetHistory(req.params.id);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getAssetAssignments(req, res, next) {
  try {
    const items = await listAssetAssignments(req.params.id);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getAssetCurrentAssignment(req, res, next) {
  try {
    const assignment = await getCurrentAssignment(req.params.id);
    res.json({ success: true, data: { assignment } });
  } catch (error) {
    next(error);
  }
}

async function changeArchiveState(req, res, next, restore) {
  try {
    const asset = await archiveAsset(req.params.id, req.user._id, restore);
    res.json({ success: true, message: `Asset ${restore ? 'restored' : 'archived'}`, data: { asset } });
  } catch (error) {
    next(error);
  }
}

export function postAssetArchive(req, res, next) {
  return changeArchiveState(req, res, next, false);
}

export function postAssetRestore(req, res, next) {
  return changeArchiveState(req, res, next, true);
}
