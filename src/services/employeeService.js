import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Counter from '../models/Counter.js';
import { logger } from '../utils/logger.js';

const employeeFields = 'employeeId firstName middleName lastName fullName department position email contactNumber location notes status isArchived archivedAt createdAt updatedAt photo';
const employeePhotoRoot = path.resolve(env.UPLOAD_DIR, 'employee-photos');

function safeExpression(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function findEmployeeQuery(identifier) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { employeeId: identifier.toUpperCase() };
}

function employeeFullName(input) {
  return [input.firstName, input.middleName, input.lastName]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureUniqueEmployeeName(input, excludeId = null) {
  const query = { fullName: new RegExp(`^${employeeFullName(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
  if (excludeId) query._id = { $ne: excludeId };
  if (await Employee.exists(query)) {
    throw new AppError(409, 'DUPLICATE_EMPLOYEE_NAME', 'An employee with this name already exists');
  }
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
  return { items: items.map((item) => ({ ...item, id: item._id.toString(), hasPhoto: Boolean(item.photo?.storageName) })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getEmployee(identifier, includeArchived = false) {
  const employee = await Employee.findOne({ ...findEmployeeQuery(identifier), ...(includeArchived ? {} : { isArchived: false }) })
    .select(employeeFields)
    .populate('department', 'departmentCode departmentName location')
    .lean();
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  return { ...employee, id: employee._id.toString(), hasPhoto: Boolean(employee.photo?.storageName) };
}

async function validateDepartment(departmentId, status) {
  if (!departmentId) return undefined;
  const department = await Department.findOne({ _id: departmentId, status: 'ACTIVE', isArchived: false }).select('_id');
  if (!department && status === 'ACTIVE') throw new AppError(422, 'INVALID_DEPARTMENT', 'Active employees must belong to an active department');
  if (!department) throw new AppError(422, 'INVALID_DEPARTMENT', 'Department must be active and not archived');
  return department._id;
}

async function resyncEmployeeCounter() {
  const [agg] = await Employee.aggregate([
    { $project: { numericId: { $convert: { input: { $substrCP: ['$employeeId', 4, 20] }, to: 'int', onError: 0 } } } },
    { $group: { _id: null, max: { $max: '$numericId' } } }
  ]);
  await Counter.updateOne({ key: 'employee' }, { $set: { sequence: agg?.max ?? 0 } }, { upsert: true });
}

export async function createEmployee(input, actorId) {
  const department = await validateDepartment(input.department, input.status);
  await ensureUniqueEmployeeName(input);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const counter = await Counter.findOneAndUpdate({ key: 'employee' }, { $inc: { sequence: 1 }, $setOnInsert: { key: 'employee' } }, { new: true, upsert: true });
    const employeeId = `EMP-${String(counter.sequence).padStart(6, '0')}`;
    try {
      const employee = await Employee.create({ ...input, employeeId, email: input.email || null, department });
      logger.info({ action: 'CREATE', module: 'employees', recordId: employee.id, userId: actorId }, 'Employee created');
      return getEmployee(employee.id, true);
    } catch (error) {
      if (error?.code !== 11000 || attempt === 1) throw error;
      await resyncEmployeeCounter();
    }
  }
}

export async function updateEmployee(identifier, updates, actorId) {
  const employee = await Employee.findOne({ ...findEmployeeQuery(identifier), isArchived: false });
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  if (updates.firstName !== undefined || updates.lastName !== undefined) {
    await ensureUniqueEmployeeName({
      firstName: updates.firstName ?? employee.firstName,
      middleName: employee.middleName,
      lastName: updates.lastName ?? employee.lastName
    }, employee._id);
  }
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

export async function storeEmployeePhoto(identifier, file, actorId) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size < 1) throw new AppError(400, 'FILE_REQUIRED', 'Select an image to upload');
  const employee = await Employee.findOne(findEmployeeQuery(identifier));
  if (!employee) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  await mkdir(employeePhotoRoot, { recursive: true });
  const extension = file.mimetype === 'image/png' ? '.png' : '.jpg';
  const storageName = `${randomUUID()}${extension}`;
  await writeFile(path.join(employeePhotoRoot, storageName), file.buffer, { flag: 'wx', mode: 0o640 });
  if (employee.photo?.storageName) await unlink(path.join(employeePhotoRoot, employee.photo.storageName)).catch(() => {});
  employee.photo = {
    storageName,
    originalName: path.basename(file.originalname).slice(0, 255),
    mimeType: file.mimetype,
    size: file.size,
    uploadedBy: actorId,
    uploadedAt: new Date()
  };
  await employee.save();
  logger.info({ action: 'PHOTO_UPLOAD', module: 'employees', recordId: employee.id, userId: actorId }, 'Employee photo uploaded');
  return { originalName: employee.photo.originalName, mimeType: employee.photo.mimeType, size: employee.photo.size, uploadedAt: employee.photo.uploadedAt };
}

export async function streamEmployeePhoto(identifier, download, res, next) {
  const employee = await Employee.findOne(findEmployeeQuery(identifier)).select('photo fullName').lean();
  if (!employee?.photo?.storageName) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Employee photo not found');
  const { photo } = employee;
  const filename = photo.originalName || `${employee.fullName ?? 'employee-photo'}${path.extname(photo.storageName)}`;
  res.set({
    'Content-Type': photo.mimeType,
    'Content-Length': photo.size,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  const stream = createReadStream(path.join(employeePhotoRoot, photo.storageName));
  stream.on('error', next);
  stream.pipe(res);
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
