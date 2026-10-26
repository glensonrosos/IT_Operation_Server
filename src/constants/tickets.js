export const ticketTypes = ['INCIDENT', 'SERVICE_REQUEST', 'ASSET_REQUEST', 'ACCESS_REQUEST', 'SECURITY_INCIDENT', 'CHANGE_REQUEST', 'MAINTENANCE', 'OTHER'];
export const ticketPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING', 'CLOSED', 'CANCELLED', 'DUPLICATED'];

export const defaultTicketCategories = [
  'Hardware', 'Software', 'Network & Internet', 'User Accounts & Access', 'Email & Collaboration',
   'Printing & Scanning', 'Security', 'Servers & Infrastructure', 
   'IT Assets & Equipment', 'Other / General Support',
].map((name) => ({ name, nameKey: name.toLocaleLowerCase('en'), description: '', isActive: true, isArchived: false }));

export const defaultSlaPolicies = [
  { priority: 'LOW', resolutionTargetHours: 72 },
  { priority: 'MEDIUM', resolutionTargetHours: 24 },
  { priority: 'HIGH', resolutionTargetHours: 8 },
  { priority: 'CRITICAL', resolutionTargetHours: 4 }
].map((policy) => ({ ...policy, responseTargetMinutes: null, riskThresholdPercent: 20, isActive: true }));
