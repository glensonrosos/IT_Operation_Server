import AuditLog from '../models/AuditLog.js';

const moduleForPath = (path) => path.split('/')[2] || 'system';
const actionForMethod = (method) => ({ POST: 'CREATE_OR_ACTION', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE_ATTEMPT' }[method] ?? method);

export async function recordAuditEvent({ req, statusCode, action, module, recordId = '', metadata = null }) {
  try {
    await AuditLog.create({
      actor: req.user?._id ?? null,
      actorUsername: req.user?.username ?? '',
      action: action ?? actionForMethod(req.method),
      module: module ?? moduleForPath(req.path),
      method: req.method,
      path: req.path,
      statusCode,
      recordId: recordId?.toString() ?? '',
      ipAddress: req.ip ?? '',
      userAgent: req.get('user-agent')?.slice(0, 500) ?? '',
      metadata
    });
  } catch {
    // Audit failures must not turn a completed business operation into an API error.
  }
}

export async function listAuditLogs({ page, limit, module, actor, action, from, to }) {
  const filter = {};
  if (module) filter.module = module;
  if (actor) filter.actor = actor;
  if (action) filter.action = action;
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from);
    if (to) filter.occurredAt.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'username firstName lastName').sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
