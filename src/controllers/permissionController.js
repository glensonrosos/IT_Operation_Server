import { listPermissions } from '../services/permissionService.js';

export async function getPermissions(req, res, next) {
  try {
    const items = await listPermissions();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}
