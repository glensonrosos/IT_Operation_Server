import { AppError } from '../middleware/errorHandler.js';
import { archiveCategory, createCategory, listCategories, listSlaPolicies, updateCategory, updateSlaPolicy } from '../services/ticketConfigService.js';
import { createTicketCategorySchema, updateSlaPolicySchema, updateTicketCategorySchema } from '../validators/ticketValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getCategories(req, res, next) {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    if (includeArchived && !req.user.role.permissionKeys.includes('*') && !req.user.role.permissionKeys.includes('ticketCategories.manage')) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to view archived categories'));
    }
    const items = await listCategories(includeArchived);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function postCategory(req, res, next) {
  const input = parseOrFail(createTicketCategorySchema, req.body, next);
  if (!input) return;
  try {
    const category = await createCategory(input, req.user._id);
    res.status(201).json({ success: true, message: 'Ticket category created', data: { category } });
  } catch (error) {
    next(error);
  }
}

export async function patchCategory(req, res, next) {
  const updates = parseOrFail(updateTicketCategorySchema, req.body, next);
  if (!updates) return;
  try {
    const category = await updateCategory(req.params.id, updates, req.user._id);
    res.json({ success: true, message: 'Ticket category updated', data: { category } });
  } catch (error) {
    next(error);
  }
}

async function setCategoryArchiveState(req, res, next, restore) {
  try {
    const category = await archiveCategory(req.params.id, req.user._id, restore);
    res.json({ success: true, message: `Ticket category ${restore ? 'restored' : 'archived'}`, data: { category } });
  } catch (error) {
    next(error);
  }
}

export function postCategoryArchive(req, res, next) {
  return setCategoryArchiveState(req, res, next, false);
}

export function postCategoryRestore(req, res, next) {
  return setCategoryArchiveState(req, res, next, true);
}

export async function getSlaPolicies(req, res, next) {
  try {
    const items = await listSlaPolicies();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function patchSlaPolicy(req, res, next) {
  const updates = parseOrFail(updateSlaPolicySchema, req.body, next);
  if (!updates) return;
  try {
    const policy = await updateSlaPolicy(req.params.priority, updates, req.user._id);
    res.json({ success: true, message: 'SLA policy updated; existing tickets retain their SLA snapshot', data: { policy } });
  } catch (error) {
    next(error);
  }
}
