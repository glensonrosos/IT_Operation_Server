export const defaultDepartments = [
  ['ACCT', 'Accounting'],
  ['AM', 'Account Management'],
  ['HR', 'Human Resources'],
  ['PD', 'Product Development'],
  ['COST', 'Costing'],
  ['PURC', 'Purchasing'],  
  ['QMS', 'Quality Management System'],
  ['LOAD', 'Loading'],
  ['LOG', 'Logistics'],
  ['MEL', 'Melamine'],  
  ['PRD', 'PRD Finishing'],
  ['PRAD', 'Production Admin'],
  ['PROC', 'Processor'],
  ['PRLN', 'Production Line'],
  ['PROF', 'Production Office'],
  ['PCO', 'PCO'],
  ['BASE', 'Basecoat'],
  ['PSI', 'PSI'],
  ['MAIN', 'Maintenance'],
  ['PACK', 'Packaging Materials'],
  ['IQC', 'Incoming Quality Control'],
  ['QA', 'Quality Assurance'],
  ['RD', 'RD Laboratory'],
  ['SG', 'Security Guard'],
  ['STOC', 'Stockroom'],
  

  
].map(([departmentCode, departmentName]) => ({
  departmentCode,
  departmentName,
  departmentNameKey: departmentName.toLocaleLowerCase('en'),
  description: '',
  departmentHead: null,
  location: '',
  status: 'ACTIVE',
  isArchived: false
}));
