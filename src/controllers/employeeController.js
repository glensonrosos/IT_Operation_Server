import { AppError } from '../middleware/errorHandler.js';
import { archiveEmployee, createEmployee, getEmployee, listEmployees, updateEmployee } from '../services/employeeService.js';
import { createEmployeeSchema, employeeQuerySchema, updateEmployeeSchema } from '../validators/employeeValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

function canViewArchived(user) {
  return user.role.permissionKeys.includes('*') || user.role.permissionKeys.includes('employees.archive');
}

export async function getEmployees(req, res, next) {
  const query = parseOrFail(employeeQuerySchema, req.query, next);
  if (!query) return;
  if (query.includeArchived === 'true' && !canViewArchived(req.user)) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to view archived employees'));
  }
  try {
    const data = await listEmployees({ ...query, includeArchived: query.includeArchived === 'true' });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getEmployeeById(req, res, next) {
  try {
    const employee = await getEmployee(req.params.id, canViewArchived(req.user));
    res.json({ success: true, data: { employee } });
  } catch (error) {
    next(error);
  }
}

export async function postEmployee(req, res, next) {
  const input = parseOrFail(createEmployeeSchema, req.body, next);
  if (!input) return;
  try {
    const employee = await createEmployee(input, req.user._id);
    res.status(201).json({ success: true, message: 'Employee created', data: { employee } });
  } catch (error) {
    next(error);
  }
}

export async function patchEmployee(req, res, next) {
  const updates = parseOrFail(updateEmployeeSchema, req.body, next);
  if (!updates) return;
  try {
    const employee = await updateEmployee(req.params.id, updates, req.user._id);
    res.json({ success: true, message: 'Employee updated', data: { employee } });
  } catch (error) {
    next(error);
  }
}

async function changeArchiveState(req, res, next, restore) {
  try {
    const employee = await archiveEmployee(req.params.id, req.user._id, restore);
    res.json({ success: true, message: 'Employee archive state updated', data: { employee } });
  } catch (error) {
    next(error);
  }
}

export function archiveEmployeeRecord(req, res, next) {
  return changeArchiveState(req, res, next, false);
}

export function restoreEmployeeRecord(req, res, next) {
  return changeArchiveState(req, res, next, true);
}
