import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { hasPermission } from '../src/middleware/auth.js';
import { createUserSchema, userListQuerySchema } from '../src/validators/userValidators.js';
import Employee from '../src/models/Employee.js';
import Department from '../src/models/Department.js';
import { createDepartmentSchema } from '../src/validators/departmentValidators.js';
import { createTicketSchema, ticketQuerySchema, transitionTicketSchema, troubleshootingSchema } from '../src/validators/ticketValidators.js';
import { getTicketSlaStatus } from '../src/utils/ticketSla.js';
import { validateTicketFile } from '../src/services/ticketAttachmentService.js';
import { canTransitionTicket } from '../src/services/ticketService.js';
import Asset from '../src/models/Asset.js';
import { assetQuerySchema, createAssetSchema } from '../src/validators/assetValidators.js';
import AssetAssignment from '../src/models/AssetAssignment.js';
import { canTransitionAsset, formatAssetId } from '../src/services/assetService.js';
import AssetTransfer from '../src/models/AssetTransfer.js';
import AssetReturn from '../src/models/AssetReturn.js';
import { assetReturnSchema, createAssetTransferSchema, transferDecisionSchema } from '../src/validators/assetLifecycleValidators.js';
import Borrowing from '../src/models/Borrowing.js';
import { deriveBorrowingStatus } from '../src/services/borrowingService.js';
import AssetMaintenance from '../src/models/AssetMaintenance.js';
import { createMaintenanceSchema, warrantyQuerySchema } from '../src/validators/maintenanceValidators.js';
import AuditLog from '../src/models/AuditLog.js';
import { auditQuerySchema } from '../src/validators/auditValidators.js';
import KnowledgeArticle from '../src/models/KnowledgeArticle.js';
import { createKnowledgeSchema } from '../src/validators/knowledgeValidators.js';
import { updateSettingsSchema } from '../src/validators/settingsValidators.js';
import { exportReport } from '../src/services/exportService.js';
import { borrowingCheckinSchema, borrowingCheckoutSchema, createBorrowingSchema } from '../src/validators/borrowingValidators.js';

test('protected identity endpoint rejects unauthenticated requests', async () => {
  const response = await request(app).get('/api/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'UNAUTHENTICATED');
});

test('login validates input before accessing the database', async () => {
  const response = await request(app).post('/api/auth/login').send({ username: 'x', password: '' });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'VALIDATION_FAILED');
});

test('logout clears the cookie even when no session is present', async () => {
  const response = await request(app).post('/api/auth/logout');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.match(response.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/);
});

test('cookie-authenticated mutations enforce the configured origin', async () => {
  const response = await request(app).post('/api/auth/logout').set('Cookie', 'itms_session=placeholder').set('Origin', 'https://untrusted.example');
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'CSRF_REJECTED');
});

test('IT user validation rejects non-IT fields and malformed role IDs', () => {
  const base = { username: 'tech.user', email: 'tech@example.local', firstName: 'Tech', lastName: 'User', roleId: '507f1f77bcf86cd799439011', password: 'long-enough-test-password' };
  assert.equal(createUserSchema.safeParse(base).success, true);
  assert.equal(createUserSchema.safeParse({ ...base, employeePassword: 'should-not-be-accepted' }).success, false);
  assert.equal(createUserSchema.safeParse({ ...base, roleId: 'not-an-object-id' }).success, false);
  assert.equal(userListQuerySchema.safeParse({ status: 'DELETED' }).success, false);
});

test('employee and department models derive normalized display/search fields', async () => {
  const department = new Department({ departmentCode: ' acct ', departmentName: 'Accounting' });
  await department.validate();
  assert.equal(department.departmentCode, 'ACCT');
  assert.equal(department.departmentNameKey, 'accounting');

  const employee = new Employee({ employeeId: 'e-100', firstName: 'Ari', middleName: 'M', lastName: 'Reyes', department: new Department()._id });
  await employee.validate();
  assert.equal(employee.employeeId, 'E-100');
  assert.equal(employee.fullName, 'Ari M Reyes');
  assert.equal(createDepartmentSchema.safeParse({ departmentCode: 'OPS', departmentName: 'Operations', managerPassword: 'not-an-account' }).success, false);
});

test('employee and department APIs require IT authentication', async () => {
  const [employees, departments] = await Promise.all([
    request(app).get('/api/employees'),
    request(app).get('/api/departments')
  ]);
  assert.equal(employees.status, 401);
  assert.equal(departments.status, 401);
});

test('ticket APIs require IT authentication', async () => {
  const [list, categories, assignable, slaPolicies, troubleshooting] = await Promise.all([
    request(app).get('/api/tickets'),
    request(app).get('/api/ticket-categories'),
    request(app).get('/api/tickets/assignable-users'),
    request(app).get('/api/sla-policies'),
    request(app).get('/api/tickets/507f1f77bcf86cd799439011/troubleshooting')
  ]);
  assert.equal(list.status, 401);
  assert.equal(categories.status, 401);
  assert.equal(assignable.status, 401);
  assert.equal(slaPolicies.status, 401);
  assert.equal(troubleshooting.status, 401);
});

test('ticket validation rejects client-controlled numbers and malformed filters', () => {
  const input = {
    requester: '507f1f77bcf86cd799439011', title: 'No network connectivity', description: 'The workstation cannot reach the internet.',
    type: 'INCIDENT', category: '507f1f77bcf86cd799439012', priority: 'HIGH', estimatedResolutionHours: 1
  };
  assert.equal(createTicketSchema.safeParse(input).success, true);
  assert.equal(createTicketSchema.safeParse({ ...input, ticketNumber: 'TKT-2026-000001' }).success, false);
  assert.equal(createTicketSchema.safeParse({ ...input, status: 'CLOSED' }).success, false);
  assert.equal(ticketQuerySchema.safeParse({ status: 'NOT_A_STATUS' }).success, false);
  assert.equal(transitionTicketSchema.safeParse({ status: 'INVALID' }).success, false);
  assert.equal(troubleshootingSchema.safeParse({ problem: 'Device will not boot', unexpectedStatus: 'CLOSED' }).success, false);
});

test('ticket workflow permits only supported status transitions', () => {
  assert.equal(canTransitionTicket('NEW', 'OPEN'), true);
  assert.equal(canTransitionTicket('IN_PROGRESS', 'CLOSED'), true);
  assert.equal(canTransitionTicket('CANCELLED', 'OPEN'), true);
  assert.equal(canTransitionTicket('NEW', 'CLOSED'), false);
  assert.equal(canTransitionTicket('CANCELLED', 'IN_PROGRESS'), false);
});

test('SLA status derives met, at-risk, breached, and cancelled states', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  const base = { status: 'IN_PROGRESS', resolutionTargetHours: 10, slaRiskThresholdPercent: 20, responseTargetMinutes: null, responseDueAt: null, firstResponseAt: null, resolvedAt: null, closedAt: null };
  assert.equal(getTicketSlaStatus({ ...base, resolutionDueAt: new Date('2026-09-30T15:00:00.000Z') }, now), 'SLA_MET');
  assert.equal(getTicketSlaStatus({ ...base, resolutionDueAt: new Date('2026-09-30T13:00:00.000Z') }, now), 'SLA_AT_RISK');
  assert.equal(getTicketSlaStatus({ ...base, resolutionDueAt: new Date('2026-09-30T11:00:00.000Z') }, now), 'SLA_BREACHED');
  assert.equal(getTicketSlaStatus({ ...base, status: 'CANCELLED', resolutionDueAt: new Date('2026-09-30T11:00:00.000Z') }, now), 'SLA_MET');
});

test('ticket uploads require matching allowed file content and declared type', () => {
  assert.equal(validateTicketFile({ originalname: 'notes.txt', mimetype: 'text/plain', size: 5, buffer: Buffer.from('hello') }), '.txt');
  assert.throws(() => validateTicketFile({ originalname: 'fake.jpg', mimetype: 'image/jpeg', size: 5, buffer: Buffer.from('hello') }), { code: 'FILE_CONTENT_INVALID' });
  assert.throws(() => validateTicketFile({ originalname: 'fake.exe', mimetype: 'text/plain', size: 5, buffer: Buffer.from('hello') }), { code: 'FILE_TYPE_NOT_ALLOWED' });
});

test('asset validation keeps IDs server-generated and validates filters', () => {
  const input = { assetType: '507f1f77bcf86cd799439011', assetName: 'ThinkPad laptop' };
  assert.equal(createAssetSchema.safeParse(input).success, true);
  assert.equal(createAssetSchema.safeParse({ ...input, assetId: 'IT-LAP-000001' }).success, false);
  assert.equal(createAssetSchema.safeParse({ ...input, currentCustodian: '507f1f77bcf86cd799439012' }).success, false);
  assert.equal(assetQuerySchema.safeParse({ status: 'NOT_A_STATUS' }).success, false);
  const activeAssetIndex = AssetAssignment.schema.indexes().find(([, options]) => options.unique && options.partialFilterExpression?.isActive === true);
  assert.ok(activeAssetIndex);
});

test('asset APIs require IT authentication', async () => {
  const [list, types] = await Promise.all([
    request(app).get('/api/assets'),
    request(app).get('/api/asset-types')
  ]);
  assert.equal(list.status, 401);
  assert.equal(types.status, 401);
});

test('asset IDs are generated server-side and lifecycle transitions are constrained', () => {
  assert.equal(formatAssetId('lap', 1), 'IT-LAP-000001');
  assert.equal(formatAssetId('tool', 1000000), 'IT-TOOL-1000000');
  assert.equal(canTransitionAsset('AVAILABLE', 'UNDER_REPAIR'), true);
  assert.equal(canTransitionAsset('AVAILABLE', 'ASSIGNED'), false);
  assert.equal(canTransitionAsset('RETIRED', 'DISPOSED'), true);
  assert.equal(canTransitionAsset('DISPOSED', 'AVAILABLE'), false);
});

test('asset IDs are server-controlled and asset model normalizes serial identifiers', async () => {
  const assetType = '507f1f77bcf86cd799439011';
  const assetInput = { assetType, assetName: 'Workstation laptop' };
  assert.equal(createAssetSchema.safeParse(assetInput).success, true);
  assert.equal(createAssetSchema.safeParse({ ...assetInput, assetId: 'IT-LAP-000001' }).success, false);
  assert.equal(createAssetSchema.safeParse({ ...assetInput, currentCustodian: '507f1f77bcf86cd799439012' }).success, false);
  assert.equal(assetQuerySchema.safeParse({ status: 'INVALID' }).success, false);

  const actorId = '507f1f77bcf86cd799439013';
  const asset = new Asset({ assetId: 'IT-LAP-000001', assetType, assetTypeCode: 'LAP', assetName: 'Laptop', serialNumber: ' sn-100 ', createdBy: actorId, updatedBy: actorId });
  await asset.validate();
  assert.equal(asset.serialNumber, 'SN-100');
  assert.equal(asset.isBorrowable, false);
});

test('asset transfer and return validation protects lifecycle decisions', () => {
  const transfer = { toEmployee: '507f1f77bcf86cd799439011', newCondition: 'GOOD', reason: 'Employee changed departments' };
  assert.equal(createAssetTransferSchema.safeParse(transfer).success, true);
  assert.equal(createAssetTransferSchema.safeParse({ ...transfer, assetId: 'IT-LAP-000001' }).success, false);
  assert.equal(transferDecisionSchema.safeParse({ decision: 'REJECTED' }).success, false);
  assert.equal(transferDecisionSchema.safeParse({ decision: 'APPROVED' }).success, true);
  assert.equal(assetReturnSchema.safeParse({ conditionAfter: 'GOOD', result: 'RETURNED_GOOD', inspectionResult: 'PASS' }).success, true);
  assert.equal(assetReturnSchema.safeParse({ conditionAfter: 'GOOD', result: 'RETURNED_INCOMPLETE', inspectionResult: 'INCOMPLETE' }).success, false);
  const openTransferIndex = AssetTransfer.schema.indexes().find(([, options]) => options.unique && options.partialFilterExpression?.isOpen === true);
  const openReturnIndex = AssetReturn.schema.indexes().find(([, options]) => options.unique && options.partialFilterExpression?.isOpen === true);
  assert.ok(openTransferIndex);
  assert.ok(openReturnIndex);
});

test('asset lifecycle APIs require IT authentication', async () => {
  const [transfers, returns, requestTransfer, recordReturn, resumeReturn] = await Promise.all([
    request(app).get('/api/asset-transfers'),
    request(app).get('/api/asset-returns'),
    request(app).post('/api/assets/507f1f77bcf86cd799439011/transfers'),
    request(app).post('/api/assets/507f1f77bcf86cd799439011/returns'),
    request(app).post('/api/assets/507f1f77bcf86cd799439011/returns/resume')
  ]);
  assert.equal(transfers.status, 401);
  assert.equal(returns.status, 401);
  assert.equal(requestTransfer.status, 401);
  assert.equal(recordReturn.status, 401);
  assert.equal(resumeReturn.status, 401);
});

test('borrowing validation enforces unique equipment lines and return evidence', () => {
  const employee = '507f1f77bcf86cd799439011';
  const assetOne = '507f1f77bcf86cd799439012';
  const assetTwo = '507f1f77bcf86cd799439013';
  const requestData = { borrower: employee, assets: [assetOne, assetTwo], requestReason: 'Temporary project equipment', dueAt: new Date(Date.now() + 86_400_000).toISOString() };
  assert.equal(createBorrowingSchema.safeParse(requestData).success, true);
  assert.equal(createBorrowingSchema.safeParse({ ...requestData, assets: [assetOne, assetOne] }).success, false);
  assert.equal(borrowingCheckoutSchema.safeParse({ items: [{ itemId: assetOne, condition: 'GOOD' }] }).success, true);
  assert.equal(borrowingCheckinSchema.safeParse({ items: [{ itemId: assetOne, result: 'LOST' }] }).success, false);
  assert.equal(borrowingCheckinSchema.safeParse({ items: [{ itemId: assetOne, result: 'LOST', damageDescription: 'Not returned after contact' }] }).success, true);
  const item = new Borrowing({
    borrowingNumber: 'BRW-2026-000001', borrower: employee, borrowerSnapshot: { employeeId: 'E-100', fullName: 'Employee User' },
    department: '507f1f77bcf86cd799439014', requestedBy: '507f1f77bcf86cd799439015', requestReason: 'Test', dueAt: new Date(),
    items: [{ asset: assetOne, assetIdSnapshot: 'IT-TOOL-000001', assetNameSnapshot: 'Tool', assetStatusSnapshot: 'AVAILABLE' }]
  });
  assert.equal(item.items.length, 1);
  assert.equal(deriveBorrowingStatus({ status: 'BORROWED', items: [{ status: 'RELEASED' }] }), 'BORROWED');
  assert.equal(deriveBorrowingStatus({ status: 'BORROWED', items: [{ status: 'RETURNED' }, { status: 'RELEASED' }] }), 'PARTIALLY_RETURNED');
  assert.equal(deriveBorrowingStatus({ status: 'BORROWED', items: [{ status: 'LOST' }] }), 'LOSS_REVIEW');
  assert.equal(deriveBorrowingStatus({ status: 'BORROWED', items: [{ status: 'RETURNED' }] }), 'RETURNED');
});

test('borrowing APIs require IT authentication', async () => {
  const [list, detail, requestBorrowing] = await Promise.all([
    request(app).get('/api/borrowings'),
    request(app).get('/api/borrowings/BRW-2026-000001'),
    request(app).post('/api/borrowings')
  ]);
  assert.equal(list.status, 401);
  assert.equal(detail.status, 401);
  assert.equal(requestBorrowing.status, 401);
});

test('maintenance and warranty validation enforces asset lifecycle and date windows', () => {
  const input = { asset: '507f1f77bcf86cd799439011', type: 'REPAIR', title: 'Replace fan', issueDescription: 'Cooling fan is noisy' };
  assert.equal(createMaintenanceSchema.safeParse(input).success, true);
  assert.equal(createMaintenanceSchema.safeParse({ ...input, assetId: 'IT-LAP-000001' }).success, false);
  assert.equal(warrantyQuerySchema.safeParse({ days: '30', includeExpired: 'true' }).success, true);
  assert.equal(warrantyQuerySchema.safeParse({ days: '500' }).success, false);
  const openMaintenanceIndex = AssetMaintenance.schema.indexes().find(([, options]) => options.unique && options.partialFilterExpression?.isOpen === true);
  assert.ok(openMaintenanceIndex);
});

test('maintenance and warranty APIs require IT authentication', async () => {
  const [records, warranties, create] = await Promise.all([
    request(app).get('/api/maintenance'),
    request(app).get('/api/warranties'),
    request(app).post('/api/maintenance')
  ]);
  assert.equal(records.status, 401);
  assert.equal(warranties.status, 401);
  assert.equal(create.status, 401);
});

test('audit validation and append-only schema protections are present', () => {
  assert.equal(auditQuerySchema.safeParse({ page: '1', limit: '50' }).success, true);
  assert.equal(auditQuerySchema.safeParse({ from: 'not-a-date' }).success, false);
  assert.ok(AuditLog.schema.indexes().some(([fields]) => fields.occurredAt === -1));
});

test('audit API requires IT authentication', async () => {
  const response = await request(app).get('/api/audit-logs');
  assert.equal(response.status, 401);
});

test('report export validation rejects unknown types', async () => {
  await assert.rejects(() => exportReport('unknown'), /Unsupported report export/);
});

test('report export API requires authentication', async () => {
  const response = await request(app).get('/api/reports/export/assets.csv');
  assert.equal(response.status, 401);
});

test('knowledge article validation generates model defaults and rejects client IDs', async () => {
  assert.equal(createKnowledgeSchema.safeParse({ title: 'Printer setup', content: 'Install the approved driver.' }).success, true);
  assert.equal(createKnowledgeSchema.safeParse({ title: 'Printer setup', content: 'Guide', id: '507f1f77bcf86cd799439011' }).success, false);
  const article = new KnowledgeArticle({ title: 'Guide', slug: 'guide', content: 'Content', createdBy: '507f1f77bcf86cd799439011', updatedBy: '507f1f77bcf86cd799439011' });
  await article.validate();
  assert.equal(article.status, 'DRAFT');
});

test('knowledge API requires IT authentication', async () => {
  const response = await request(app).get('/api/knowledge');
  assert.equal(response.status, 401);
});

test('system settings validation excludes secrets and validates operational defaults', () => {
  const settings = { companyName: 'IT', companyTimezone: 'Asia/Manila', supportEmail: 'it@example.local', warrantyAlertDays: 30, borrowingDefaultDays: 7, lowStockAlertEnabled: true };
  assert.equal(updateSettingsSchema.safeParse(settings).success, true);
  assert.equal(updateSettingsSchema.safeParse({ ...settings, JWT_SECRET: 'secret' }).success, false);
});

test('system settings API requires IT authentication', async () => {
  const response = await request(app).get('/api/settings');
  assert.equal(response.status, 401);
});

test('permission checks honor explicit grants and deny missing grants', () => {
  assert.equal(hasPermission({ role: { permissionKeys: ['tickets.create'] } }, 'tickets.create'), true);
  assert.equal(hasPermission({ role: { permissionKeys: ['tickets.view'] } }, 'tickets.create'), false);
  assert.equal(hasPermission({ role: { permissionKeys: ['*'] } }, 'settings.update'), true);
});
