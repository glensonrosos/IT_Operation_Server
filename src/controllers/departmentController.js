import { AppError } from '../middleware/errorHandler.js';
import { createDepartment, deleteDepartment, getDepartment, listDepartments, updateDepartment } from '../services/departmentService.js';
import { createDepartmentSchema, departmentQuerySchema, updateDepartmentSchema } from '../validators/departmentValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getDepartments(req, res, next) {
  const query = parseOrFail(departmentQuerySchema, req.query, next);
  if (!query) return;
  try {
    const data = await listDepartments({ ...query, includeArchived: false });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDepartmentById(req, res, next) {
  try {
    const department = await getDepartment(req.params.id, false);
    res.json({ success: true, data: { department } });
  } catch (error) {
    next(error);
  }
}

export async function postDepartment(req, res, next) {
  const input = parseOrFail(createDepartmentSchema, req.body, next);
  if (!input) return;
  try {
    const department = await createDepartment(input, req.user._id);
    res.status(201).json({ success: true, message: 'Department created', data: { department } });
  } catch (error) {
    next(error);
  }
}

export async function patchDepartment(req, res, next) {
  const updates = parseOrFail(updateDepartmentSchema, req.body, next);
  if (!updates) return;
  try {
    const department = await updateDepartment(req.params.id, updates, req.user._id);
    res.json({ success: true, message: 'Department updated', data: { department } });
  } catch (error) {
    next(error);
  }
}

export async function deleteDepartmentRecord(req, res, next) {
  try {
    const department = await deleteDepartment(req.params.id, req.user._id);
    res.json({ success: true, message: 'Department deleted', data: { department } });
  } catch (error) {
    next(error);
  }
}

