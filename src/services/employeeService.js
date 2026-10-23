import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Counter from '../models/Counter.js';
import { logger } from '../utils/logger.js';

const employeeFields = 'employeeId firstName middleName lastName fullName department position email contactNumber location notes status isArchived archivedAt createdAt updatedAt';

function safeExpression(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function findEmployeeQuery(identifier) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { employeeId: identifier.toUpperCase() };
}

export async function listEmployees({ page, limit, search, department, status, includeArchived, sortBy, sortOrder }) {
  const filter = { isArchived: includeArchived ? { $in: [true, false] } : false };
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (search) {
    const expression = safeExpression(search);
    filter.$or = [{ employeeId: expression }, { fullName: expression }, { firstName: expression }, { middleName: expression }, { lastName: expression }, { email: expression }];
  }
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1, _id: 1 };
  const [items, total] = await Promise.all([
    Employee.find(filter).select(employeeFields).populate('department', 'departmentCode departmentName').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Employee.countDocuments(filter)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getEmployee(identifier, includeArchived = false) {
  const employee = await Employee.findOne({ ...findEmployeeQuery(identifier), ...(includeArchived ? {} : { isArchived: false }) })
    .select(employeeFields)
    .populate('department', 'departmentCode departmentName location')
    .lean();
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  return { ...employee, id: employee._id.toString() };
}

async function validateDepartment(departmentId, status) {
  if (!departmentId) return undefined;
  const department = await Department.findOne({ _id: departmentId, status: 'ACTIVE', isArchived: false }).select('_id');
  if (!department && status === 'ACTIVE') throw new AppError(422, 'INVALID_DEPARTMENT', 'Active employees must belong to an active department');
  if (!department) throw new AppError(422, 'INVALID_DEPARTMENT', 'Department must be active and not archived');
  return department._id;
}

export async function createEmployee(input, actorId) {
  const department = await validateDepartment(input.department, input.status);
  const counter = await Counter.findOneAndUpdate({ key: 'employee' }, { $inc: { sequence: 1 }, $setOnInsert: { key: 'employee' } }, { new: true, upsert: true });
  const employeeId = `EMP-${String(counter.sequence).padStart(6, '0')}`;
  const employee = await Employee.create({ ...input, employeeId, email: input.email || null, department });
  logger.info({ action: 'CREATE', module: 'employees', recordId: employee.id, userId: actorId }, 'Employee created');
  return getEmployee(employee.id, true);
}

export async function updateEmployee(identifier, updates, actorId) {
  const employee = await Employee.findOne({ ...findEmployeeQuery(identifier), isArchived: false });
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  const departmentId = updates.department ?? employee.department;
  const status = updates.status ?? employee.status;
  const departmentChanged = updates.department !== undefined && !employee.department.equals(updates.department);
  if (departmentChanged || status === 'ACTIVE') {
    employee.department = await validateDepartment(departmentId, status);
  }
  for (const field of ['firstName', 'middleName', 'lastName', 'position', 'email', 'contactNumber', 'location', 'notes', 'status']) {
    if (updates[field] !== undefined) employee[field] = field === 'email' && updates[field] === '' ? null : updates[field];
  }
  await employee.save();
  logger.info({ action: 'UPDATE', module: 'employees', recordId: employee.id, userId: actorId }, 'Employee updated');
  return getEmployee(employee.id, true);
}

export async function archiveEmployee(identifier, actorId, restore = false) {
  const employee = await Employee.findOne({ ...findEmployeeQuery(identifier), isArchived: !restore });
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  if (!restore && employee.status === 'ACTIVE') throw new AppError(409, 'ACTIVE_EMPLOYEE', 'An active employee cannot be archived');
  employee.isArchived = !restore;
  employee.archivedAt = restore ? null : new Date();
  employee.archivedBy = restore ? null : actorId;
  await employee.save();
  logger.info({ action: restore ? 'RESTORE' : 'ARCHIVE', module: 'employees', recordId: employee.id, userId: actorId }, 'Employee archive state changed');
  return getEmployee(employee.id, true);
}
