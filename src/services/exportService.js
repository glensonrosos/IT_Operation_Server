import Asset from '../models/Asset.js';
import AssetMaintenance from '../models/AssetMaintenance.js';
import Borrowing from '../models/Borrowing.js';
import Ticket from '../models/Ticket.js';

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

const limit = 5000;

export async function exportReport(type) {
  if (type === 'assets') {
    const rows = await Asset.find({ isArchived: false }).populate('assetType', 'code name').populate('department', 'departmentName').populate('currentCustodian currentBorrower', 'employeeId fullName').sort({ assetId: 1 }).limit(limit).lean();
    return { filename: 'assets.csv', content: csv(['Asset ID', 'Name', 'Type', 'Status', 'Condition', 'Serial Number', 'Department', 'Custodian', 'Borrower', 'Warranty End'], rows.map((row) => [row.assetId, row.assetName, row.assetType?.name ?? row.assetTypeCode, row.status, row.condition, row.serialNumber, row.department?.departmentName, row.currentCustodian?.fullName, row.currentBorrower?.fullName, row.warrantyEnd?.toISOString()])) };
  }
  if (type === 'tickets') {
    const rows = await Ticket.find({ isArchived: false }).sort({ createdAt: -1 }).limit(limit).lean();
    return { filename: 'tickets.csv', content: csv(['Ticket Number', 'Title', 'Requester', 'Department', 'Priority', 'Status', 'Created', 'Resolution Due'], rows.map((row) => [row.ticketNumber, row.title, row.requesterSnapshot?.fullName, row.requesterSnapshot?.departmentName, row.priority, row.status, row.createdAt?.toISOString(), row.resolutionDueAt?.toISOString()])) };
  }
  if (type === 'borrowings') {
    const rows = await Borrowing.find().sort({ createdAt: -1 }).limit(limit).lean();
    return { filename: 'borrowings.csv', content: csv(['Borrowing Number', 'Borrower', 'Department', 'Status', 'Requested', 'Due', 'Item Count'], rows.map((row) => [row.borrowingNumber, row.borrowerSnapshot?.fullName, row.borrowerSnapshot?.departmentName, row.status, row.requestedAt?.toISOString(), row.dueAt?.toISOString(), row.items?.length])) };
  }
  if (type === 'maintenance') {
    const rows = await AssetMaintenance.find().populate('asset', 'assetId assetName').sort({ reportedAt: -1 }).limit(limit).lean();
    return { filename: 'maintenance.csv', content: csv(['Maintenance Number', 'Asset ID', 'Asset', 'Type', 'Title', 'Status', 'Vendor', 'Cost', 'Reported', 'Completed', 'Next Maintenance'], rows.map((row) => [row.maintenanceNumber, row.asset?.assetId ?? row.assetId, row.asset?.assetName, row.type, row.title, row.status, row.vendor, row.cost, row.reportedAt?.toISOString(), row.completedAt?.toISOString(), row.nextMaintenanceAt?.toISOString()])) };
  }
  throw new Error('Unsupported report export');
}
