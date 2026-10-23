import { getRoles } from '../services/authService.js';

export async function listRoles(req, res, next) {
  try {
    const roles = await getRoles();
    res.json({ success: true, data: { items: roles } });
  } catch (error) {
    next(error);
  }
}
