import { AppError } from '../middleware/errorHandler.js';
import { cancelMaintenance, completeMaintenance, createMaintenance, getMaintenance, listMaintenance, startMaintenance, updateMaintenanceNotes, waitForMaintenanceVendor } from '../services/maintenanceService.js';
import { completeMaintenanceSchema, createMaintenanceSchema, maintenanceNotesSchema, maintenanceQuerySchema, maintenanceVendorSchema } from '../validators/maintenanceValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getMaintenanceRecords(req, res, next) {
  const filters = parseOrFail(maintenanceQuerySchema, req.query, next);
  if (!filters) return;
  try {
    const data = await listMaintenance(filters);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getMaintenanceById(req, res, next) {
  try {
    const maintenance = await getMaintenance(req.params.id);
    res.json({ success: true, data: { maintenance } });
  } catch (error) {
    next(error);
  }
}

export async function postMaintenance(req, res, next) {
  const input = parseOrFail(createMaintenanceSchema, req.body, next);
  if (!input) return;
  try {
    const maintenance = await createMaintenance(input, req.user._id);
    res.status(201).json({ success: true, message: 'Maintenance record created', data: { maintenance } });
  } catch (error) {
    next(error);
  }
}

export async function postMaintenanceStart(req, res, next) {
  try {
    const maintenance = await startMaintenance(req.params.id, req.user._id);
    res.json({ success: true, message: 'Maintenance started or resumed', data: { maintenance } });
  } catch (error) {
    next(error);
  }
}

export async function postMaintenanceWaitingVendor(req, res, next) {
  const input = parseOrFail(maintenanceVendorSchema, req.body, next);
  if (!input) return;
  try {
    const maintenance = await waitForMaintenanceVendor(req.params.id, req.user._id, input.vendor);
    res.json({ success: true, message: 'Maintenance marked as waiting for vendor', data: { maintenance } });
  } catch (error) {
    next(error);
  }
}

export async function patchMaintenanceNotes(req, res, next) {
  const input = parseOrFail(maintenanceNotesSchema, req.body, next);
  if (!input) return;
  try {
    const maintenance = await updateMaintenanceNotes(req.params.id, input.notes, req.user._id);
    res.json({ success: true, message: 'Maintenance notes updated', data: { maintenance } });
  } catch (error) {
    next(error);
  }
}

export async function postMaintenanceComplete(req, res, next) {
  const input = parseOrFail(completeMaintenanceSchema, req.body, next);
  if (!input) return;
  try {
    const maintenance = await completeMaintenance(req.params.id, input, req.user._id);
    res.json({ success: true, message: 'Maintenance completed', data: { maintenance } });
  } catch (error) {
    next(error);
  }
}

export async function postMaintenanceCancel(req, res, next) {
  try {
    const maintenance = await cancelMaintenance(req.params.id, req.user._id);
    res.json({ success: true, message: 'Maintenance cancelled', data: { maintenance } });
  } catch (error) {
    next(error);
  }
}
