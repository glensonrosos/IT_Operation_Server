export const assetStatuses = ['PURCHASED', 'RECEIVED', 'IN_STOCK', 'AVAILABLE', 'ASSIGNED', 'IN_USE', 'BORROWED', 'UNDER_REPAIR', 'LOST', 'DAMAGED', 'RETIRED', 'DISPOSED'];
export const assetConditions = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'];

export const defaultAssetTypes = [
  ['LAP', 'Laptop'], ['DES', 'Desktop'], ['MON', 'Monitor'], ['SRV', 'Server'], ['PRT', 'Printer'],
  ['SWI', 'Switch'], ['RTR', 'Router'], ['FWL', 'Firewall'], ['AP', 'Access Point'], ['UPS', 'UPS'],
  ['NAS', 'NAS'], ['PHN', 'Phone'], ['TAB', 'Tablet'], ['PRJ', 'Projector'], ['CCTV', 'CCTV Equipment'],
  ['PBX', 'PABX'], ['KEY', 'Keyboard'], ['MOU', 'Mouse'], ['HDS', 'Headset'], ['DOC', 'Docking Station'],
  ['EXT', 'External HDD'], ['TOOL', 'IT Tool'], ['CAB', 'Cable'], ['ADP', 'Adapter'], ['OTH', 'Other IT Equipment']
].map(([code, name]) => ({ code, name, description: '', isActive: true }));
