export const permissionDefinitions = [
  ['users.view', 'View IT users'],
  ['users.create', 'Create IT users'],
  ['users.update', 'Update IT users'],
  ['users.archive', 'Archive IT users'],
  ['roles.view', 'View roles and permissions'],
  ['roles.update', 'Update role permissions'],
  ['employees.view', 'View employees'],
  ['employees.create', 'Create employees'],
  ['employees.update', 'Update employees'],
  ['employees.archive', 'Archive employees'],
  ['departments.view', 'View departments'],
  ['departments.create', 'Create departments'],
  ['departments.update', 'Update departments'],
  ['departments.delete', 'Delete departments'],
  ['departments.archive', 'Archive departments (legacy)'],
  ['tickets.view', 'View all tickets'],
  ['tickets.view.assigned', 'View assigned tickets'],
  ['tickets.create', 'Create tickets'],
  ['tickets.update', 'Update tickets'],
  ['tickets.assign', 'Assign tickets'],
  ['tickets.resolve', 'Resolve tickets'],
  ['tickets.reopen', 'Reopen tickets'],
  ['tickets.close', 'Close tickets'],
  ['ticketCategories.manage', 'Manage ticket categories'],
  ['sla.manage', 'Manage SLA policies'],
  ['assets.view', 'View assets'],
  ['assets.create', 'Create assets'],
  ['assets.update', 'Update assets'],
  ['assets.assign', 'Assign assets'],
  ['assets.transfer', 'Transfer assets'],
  ['assets.return', 'Return assets'],
  ['assets.archive', 'Archive assets'],
  ['assetTypes.manage', 'Manage asset types'],
  ['borrowing.view', 'View borrowings'],
  ['borrowing.view.assigned', 'View relevant borrowings'],
  ['borrowing.create', 'Create borrowings'],
  ['borrowing.approve', 'Approve borrowings'],
  ['borrowing.checkout', 'Check out equipment'],
  ['borrowing.checkin', 'Check in equipment'],
  ['borrowing.update', 'Update borrowings'],
  ['borrowing.cancel', 'Cancel borrowings'],
  ['maintenance.view', 'View maintenance records'],
  ['maintenance.create', 'Create maintenance records'],
  ['maintenance.update', 'Update maintenance records'],
  ['spareParts.view', 'View spare parts'],
  ['spareParts.manage', 'Manage spare parts'],
  ['spareParts.stock', 'Record spare-part stock movements'],
  ['reports.view', 'View reports']
  ['reports.view.relevant', 'View relevant reports'],
  ['reports.export', 'Export reports'],
  ['knowledge.view', 'View knowledge base'],
  ['knowledge.create', 'Create knowledge articles'],
  ['knowledge.update', 'Update knowledge articles'],
  ['audit.view', 'View audit logs'],
  ['settings.view', 'View system settings'],
  ['settings.update', 'Update system settings']
].map(([key, description]) => ({ key, description }));

export const roleDefinitions = [
  {
    key: 'SUPER_IT_ADMIN',
    name: 'Super IT Admin',
    description: 'Full system administration access.',
    permissionKeys: ['*']
  },
  {
    key: 'IT_SUPERVISOR',
    name: 'IT Supervisor',
    description: 'Manages IT service and asset operations.',
    permissionKeys: [
      'employees.view', 'departments.view', 'tickets.view', 'tickets.create', 'tickets.update',
      'tickets.assign', 'tickets.resolve', 'tickets.reopen', 'tickets.close', 'assets.view',
      'assets.create', 'assets.update', 'assets.assign', 'assets.transfer', 'assets.return',
      'borrowing.view', 'borrowing.create', 'borrowing.approve', 'borrowing.checkout',
      'borrowing.checkin', 'borrowing.update', 'borrowing.cancel', 'maintenance.view',
      'maintenance.create', 'maintenance.update', 'reports.view', 'reports.export',
      'knowledge.view', 'knowledge.create', 'knowledge.update', 'audit.view'
    ]
  },
  {
    key: 'IT_STAFF',
    name: 'IT Staff / Technician',
    description: 'Handles assigned tickets and permitted IT operations.',
    permissionKeys: [
      'employees.view', 'tickets.view', 'tickets.view.assigned', 'tickets.create',
      'tickets.update', 'tickets.resolve', 'tickets.close', 'tickets.assign', 'assets.view', 'assets.update', 'assets.return', 'spareParts.view',
      'borrowing.view.assigned', 'borrowing.create', 'borrowing.checkout', 'borrowing.checkin',
      'maintenance.view', 'maintenance.create', 'reports.view.relevant',
      'knowledge.view'
    ]
  }
];
