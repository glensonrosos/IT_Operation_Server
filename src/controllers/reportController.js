import { AppError } from '../middleware/errorHandler.js';
import { getDashboardSummary, getOperationalReport } from '../services/reportService.js';
import { exportReport } from '../services/exportService.js';
import { recordAuditEvent } from '../services/auditService.js';

export async function getDashboard(req, res, next) {
  try {
    const data = await getDashboardSummary();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function exportReportCsv(req, res, next) {
  try {
    const report = await exportReport(req.params.type);
    await recordAuditEvent({ req, statusCode: 200, action: 'EXPORT', module: 'reports', metadata: { report: req.params.type, format: 'csv' } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.send(`\\uFEFF${report.content}`);
  } catch (error) {
    if (error.message === 'Unsupported report export') return next(new AppError(400, 'UNSUPPORTED_EXPORT', 'Unsupported report export'));
    next(error);
  }
}

export async function getOperational(req, res, next) {
  try {
    const data = await getOperationalReport();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
