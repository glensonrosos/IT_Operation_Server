import Permission from '../models/Permission.js';

export function listPermissions() {
  return Permission.find().select('key description').sort({ key: 1 }).lean();
}
