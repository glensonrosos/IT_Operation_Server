export const assetStatuses = ['AVAILABLE', 'ASSIGNED', 'BORROWED', 'UNDER_REPAIR', 'LOST', 'DAMAGED', 'RETIRED', 'DISPOSED'];
export const assetConditions = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'];

export const defaultAssetTypes = [
  ['LAP', 'Laptop'], ['DES', 'Desktop'], ['MON', 'Monitor'], ['SRV', 'Server'], ['PRT', 'Printer'],
  ['SWI', 'Switch'], ['FWL', 'Firewall'], ['AP', 'Access Point'], ['UPS', 'UPS'],
  ['NAS', 'NAS'], ['PHN', 'Phone'], ['TAB', 'Tablet'], ['PRJ', 'Projector'], ['CCTV', 'CCTV Equipment'],
  ['PBX', 'PABX'], ['EXT', 'External HDD'], ['TOOL', 'IT Tool'],['OTH', 'Other IT Equipment']
].map(([code, name]) => ({ code, name, description: '', isActive: true }));
