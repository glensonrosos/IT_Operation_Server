import { createSchedule, listSchedules, setScheduleActive } from '../services/maintenanceScheduleService.js';
import { scheduleSchema } from '../validators/maintenanceScheduleValidators.js';
import { AppError } from '../middleware/errorHandler.js';
export async function getSchedules(req, res, next) { try { res.json({ success: true, data: { schedules: await listSchedules(req.query.asset) } }); } catch (error) { next(error); } }
export async function postSchedule(req, res, next) { const parsed = scheduleSchema.safeParse(req.body); if (!parsed.success) return next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', parsed.error.issues)); try { res.status(201).json({ success: true, data: { schedule: await createSchedule(parsed.data, req.user._id) } }); } catch (error) { next(error); } }
export async function patchSchedule(req, res, next) { try { res.json({ success: true, data: { schedule: await setScheduleActive(req.params.id, req.body.status ?? req.body.isActive, req.user._id) } }); } catch (error) { next(error); } }
