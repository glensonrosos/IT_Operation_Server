import { AppError } from '../middleware/errorHandler.js';
import { acknowledgeAssetTransfer, cancelAssetTransfer, completeAssetTransfer, decideAssetTransfer, getAssetReturn, getAssetTransfer, listAssetReturns, listAssetTransfers, processAssetTransfer, requestAssetTransfer, resumeAssetReturn, returnAsset } from '../services/assetLifecycleService.js';
import { assetReturnQuerySchema, assetReturnSchema, assetTransferQuerySchema, createAssetTransferSchema, transferAcknowledgementSchema, transferDecisionSchema } from '../validators/assetLifecycleValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getAssetTransfers(req, res, next) {
  const filters = parseOrFail(assetTransferQuerySchema, req.query, next);
  if (!filters) return;
  try {
    const data = await listAssetTransfers(filters);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAssetTransferById(req, res, next) {
  try {
    const transfer = await getAssetTransfer(req.params.id);
    res.json({ success: true, data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetTransferRequest(req, res, next) {
  const input = parseOrFail(createAssetTransferSchema, req.body, next);
  if (!input) return;
  try {
    const transfer = await requestAssetTransfer(req.params.id, input, req.user._id);
    res.status(201).json({ success: true, message: 'Asset transfer requested', data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetTransferDecision(req, res, next) {
  const input = parseOrFail(transferDecisionSchema, req.body, next);
  if (!input) return;
  try {
    const transfer = await decideAssetTransfer(req.params.id, input.decision, input.rejectionReason ?? '', req.user._id);
    res.json({ success: true, message: `Asset transfer ${input.decision.toLowerCase()}`, data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetTransferProcess(req, res, next) {
  try {
    const transfer = await processAssetTransfer(req.params.id, req.user._id);
    res.json({ success: true, message: 'Asset transfer processed', data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetTransferAcknowledgement(req, res, next) {
  const input = parseOrFail(transferAcknowledgementSchema, req.body, next);
  if (!input) return;
  try {
    const transfer = await acknowledgeAssetTransfer(req.params.id, input, req.user._id);
    res.json({ success: true, message: 'Asset transfer acknowledgement recorded', data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetTransferComplete(req, res, next) {
  try {
    const transfer = await completeAssetTransfer(req.params.id, req.user._id);
    res.json({ success: true, message: 'Asset transfer completed', data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetTransferCancel(req, res, next) {
  try {
    const transfer = await cancelAssetTransfer(req.params.id, req.user._id);
    res.json({ success: true, message: 'Asset transfer cancelled', data: { transfer } });
  } catch (error) {
    next(error);
  }
}

export async function getAssetReturns(req, res, next) {
  const filters = parseOrFail(assetReturnQuerySchema, req.query, next);
  if (!filters) return;
  try {
    const data = await listAssetReturns(filters);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAssetReturnById(req, res, next) {
  try {
    const record = await getAssetReturn(req.params.id);
    res.json({ success: true, data: { record } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetReturn(req, res, next) {
  const input = parseOrFail(assetReturnSchema, req.body, next);
  if (!input) return;
  try {
    const record = await returnAsset(req.params.id, input, req.user._id);
    res.status(201).json({ success: true, message: 'Asset return recorded', data: { record } });
  } catch (error) {
    next(error);
  }
}

export async function postAssetReturnResume(req, res, next) {
  try {
    const record = await resumeAssetReturn(req.params.id, req.user._id);
    res.json({ success: true, message: 'Pending asset return reconciled', data: { record } });
  } catch (error) {
    next(error);
  }
}
