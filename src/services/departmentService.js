import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import { logger } from '../utils/logger.js';

const departmentFields = 'departmentCode departmentName description departmentHead location status isArchived archivedAt createdAt updatedAt';

function safeExpression(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export async function listDepartments({ page, limit, search, status, includeArchived, sortBy, sortOrder }) {
  const filter = { isArchived: includeArchived ? { $in: [true, false] } : false };
  if (status) filter.status = status;
  if (search) {
    const expression = safeExpression(search);
    filter.$or = [{ departmentCode: expression }, { departmentName: expression }, { location: expression }];
  }
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1, _id: 1 };
  const [items, total] = await Promise.all([
    Department.find(filter).select(departmentFields).populate('departmentHead', 'employeeId fullName').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Department.countDocuments(filter)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getDepartment(identifier, includeArchived = false) {
  const query = mongoose.isValidObjectId(identifier) ? { _id: identifier } : { departmentCode: identifier.toUpperCase() };
  const department = await Department.findOne({ ...query, ...(includeArchived ? {} : { isArchived: false }) })
    .select(departmentFields)
    .populate('departmentHead', 'employeeId fullName email position')
    .lean();
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found');
  return { ...department, id: department._id.toString() };
}

async function validateDepartmentHead(employeeId) {
  if (!employeeId) return null;
  const employee = await Employee.findOne({ _id: employeeId, status: 'ACTIVE', isArchived: false }).select('_id');
  if (!employee) throw new AppError(422, 'INVALID_DEPARTMENT_HEAD', 'Department head must be an active employee');
  return employee._id;
}

export async function createDepartment(input, actorId) {
  const departmentHead = await validateDepartmentHead(input.departmentHead);
  const department = await Department.create({ ...input, departmentHead });
  logger.info({ action: 'CREATE', module: 'departments', recordId: department.id, userId: actorId }, 'Department created');
  return getDepartment(department.id, true);
}

export async function updateDepartment(identifier, updates, actorId) {
  const query = mongoose.isValidObjectId(identifier) ? { _id: identifier } : { departmentCode: identifier.toUpperCase() };
  const department = await Department.findOne({ ...query, isArchived: false });
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found');

  const nextStatus = updates.status ?? department.status;
  if (nextStatus === 'INACTIVE' && department.status !== 'INACTIVE') {
    const activeEmployees = await Employee.countDocuments({ department: department._id, status: 'ACTIVE', isArchived: false });
    if (activeEmployees) throw new AppError(409, 'DEPARTMENT_HAS_ACTIVE_EMPLOYEES', 'Move or deactivate active employees before deactivating this department');
  }
  if (updates.departmentHead !== undefined) department.departmentHead = await validateDepartmentHead(updates.departmentHead);
  for (const field of ['departmentName', 'description', 'location', 'status']) {
    if (updates[field] !== undefined) department[field] = updates[field];
  }
  await department.save();
  logger.info({ action: 'UPDATE', module: 'departments', recordId: department.id, userId: actorId }, 'Department updated');
  return getDepartment(department.id, true);
}

export async function deleteDepartment(identifier, actorId) {
  const query = mongoose.isValidObjectId(identifier) ? { _id: identifier } : { departmentCode: identifier.toUpperCase() };
  const department = await Department.findOne(query);
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found');
  const activeEmployees = await Employee.countDocuments({ department: department._id, status: 'ACTIVE', isArchived: false });
  if (activeEmployees) throw new AppError(409, 'DEPARTMENT_HAS_ACTIVE_EMPLOYEES', 'Move or deactivate active employees before deleting this department');
  await Department.deleteOne({ _id: department._id });
  logger.info({ action: 'DELETE', module: 'departments', recordId: department.id, userId: actorId }, 'Department deleted');
  return { id: department.id, departmentCode: department.departmentCode };
}

export async function archiveDepartment(identifier, actorId, restore = false) {
  const query = mongoose.isValidObjectId(identifier) ? { _id: identifier } : { departmentCode: identifier.toUpperCase() };
  const department = await Department.findOne({ ...query, isArchived: !restore });
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found');
  if (!restore) {
    const activeEmployees = await Employee.countDocuments({ department: department._id, status: 'ACTIVE', isArchived: false });
    if (activeEmployees) throw new AppError(409, 'DEPARTMENT_HAS_ACTIVE_EMPLOYEES', 'Move or deactivate active employees before archiving this department');
    department.isArchived = true;
    department.archivedAt = new Date();
    department.archivedBy = actorId;
    department.status = 'INACTIVE';
  } else {
    department.isArchived = false;
    department.archivedAt = null;
    department.archivedBy = null;
  }
  await department.save();
  logger.info({ action: restore ? 'RESTORE' : 'ARCHIVE', module: 'departments', recordId: department.id, userId: actorId }, 'Department archive state changed');
  return getDepartment(department.id, true);
}
