import Asset from '../models/Asset.js';
import AssetMaintenance from '../models/AssetMaintenance.js';
import Borrowing from '../models/Borrowing.js';
import Ticket from '../models/Ticket.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';

const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING', 'CLOSED', 'CANCELLED'];
const borrowingStatuses = ['REQUESTED', 'APPROVED', 'READY_FOR_RELEASE', 'CHECKING_OUT', 'BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW', 'RETURNED', 'REJECTED', 'CANCELLED'];
const maintenanceStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_VENDOR', 'COMPLETING', 'COMPLETED', 'CANCELLED'];
const assetStatuses = ['PURCHASED', 'RECEIVED', 'IN_STOCK', 'AVAILABLE', 'ASSIGNED', 'IN_USE', 'BORROWED', 'UNDER_REPAIR', 'LOST', 'DAMAGED', 'RETIRED', 'DISPOSED'];

async function countMap(Model, field, values, base = {}) {
  const rows = await Model.aggregate([
    { $match: base },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } }
  ]);
  const map = new Map(rows.map((row) => [row._id, row.count]));
  return values.map((value) => ({ key: value, count: map.get(value) ?? 0 }));
}

export async function getDashboardSummary() {
  const now = new Date();
  const [ticketsOpen, ticketsOverdue, borrowingsActive, borrowingsOverdue, assetsAssigned, assetsBorrowed, assetsRepair, maintenanceOpen, warrantyExpiring, employeesActive, departmentsActive] = await Promise.all([
    Ticket.countDocuments({ isArchived: false, status: { $nin: ['CLOSED', 'CANCELLED'] } }),
    Ticket.countDocuments({ isArchived: false, status: { $nin: ['CLOSED', 'CANCELLED'] }, resolutionDueAt: { $lt: now } }),
    Borrowing.countDocuments({ status: { $in: ['REQUESTED', 'APPROVED', 'READY_FOR_RELEASE', 'CHECKING_OUT', 'BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW'] } }),
    Borrowing.countDocuments({ status: { $in: ['BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW'] }, dueAt: { $lt: now } }),
    Asset.countDocuments({ isArchived: false, status: { $in: ['ASSIGNED', 'IN_USE'] }, currentCustodian: { $ne: null } }),
    Asset.countDocuments({ isArchived: false, status: 'BORROWED', currentBorrower: { $ne: null } }),
    Asset.countDocuments({ isArchived: false, status: { $in: ['UNDER_REPAIR', 'DAMAGED'] } }),
    AssetMaintenance.countDocuments({ isOpen: true }),
    Asset.countDocuments({ isArchived: false, warrantyEnd: { $gte: now, $lte: new Date(now.getTime() + 30 * 86_400_000) } }),
    Employee.countDocuments({ isArchived: false, status: 'ACTIVE' }),
    Department.countDocuments({ isArchived: false, status: 'ACTIVE' })
  ]);
  return {
    generatedAt: now,
    kpis: { ticketsOpen, ticketsOverdue, borrowingsActive, borrowingsOverdue, assetsAssigned, assetsBorrowed, assetsRepair, maintenanceOpen, warrantyExpiring, employeesActive, departmentsActive },
    ticketStatus: await countMap(Ticket, 'status', ticketStatuses, { isArchived: false }),
    assetStatus: await countMap(Asset, 'status', assetStatuses, { isArchived: false }),
    borrowingStatus: await countMap(Borrowing, 'status', borrowingStatuses),
    maintenanceStatus: await countMap(AssetMaintenance, 'status', maintenanceStatuses)
  };
}

export async function getOperationalReport() {
  const [ticketsByPriority, maintenanceByType, borrowingByDepartment] = await Promise.all([
    countMap(Ticket, 'priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], { isArchived: false }),
    countMap(AssetMaintenance, 'type', ['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'REPAIR', 'UPGRADE']),
    Borrowing.aggregate([{ $group: { _id: '$borrowerSnapshot.departmentName', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }])
  ]);
  return { generatedAt: new Date(), ticketsByPriority, maintenanceByType, borrowingByDepartment: borrowingByDepartment.map((row) => ({ key: row._id || 'Unknown', count: row.count })) };
}
