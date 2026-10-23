export const defaultDepartments = [
  ['IT', 'IT'],
  ['ACC', 'Accounting'],
  ['FIN', 'Finance'],
  ['HR', 'HR'],
  ['PUR', 'Purchasing'],
  ['SALES', 'Sales'],
  ['LOG', 'Logistics'],
  ['WH', 'Warehouse'],
  ['PROD', 'Production'],
  ['MGMT', 'Management']
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
