import { AppError } from '../middleware/errorHandler.js';
import { hasPermission } from '../middleware/auth.js';
import { addComment, addTroubleshooting, assignTicket, countTicketNotifications, createTicket, getAssignableUsers, getLiveTicketBoard, getSlaPolicies, getTicket, listComments, listTicketHistory, listTickets, listTroubleshooting, transitionTicket, updateAskedForHelp, updateTicket } from '../services/ticketService.js';

import { listTicketAttachments, storeTicketAttachment, streamTicketAttachment } from '../services/ticketAttachmentService.js';
import { askedForHelpSchema, assignTicketSchema, createCommentSchema, createTicketSchema, ticketQuerySchema, transitionTicketSchema, troubleshootingSchema, updateTicketSchema } from '../validators/ticketValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getLiveTicketBoardData(req, res, next) {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getTime() - 6 * 86_400_000);
    const to = req.query.to ? new Date(req.query.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new AppError(422, 'INVALID_DATE_RANGE', 'The live board date range is invalid');
    }
    const data = await getLiveTicketBoard({ from, to });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTicketNotificationCount(req, res, next) {
  try {
    const data = await countTicketNotifications(req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTickets(req, res, next) {
  const query = parseOrFail(ticketQuerySchema, req.query, next);
  if (!query) return;
  try {
    const data = await listTickets(query, req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function postTicket(req, res, next) {
  const input = parseOrFail(createTicketSchema, req.body, next);
  if (!input) return;
  if (input.assignedTo && !hasPermission(req.user, 'tickets.assign')) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to assign tickets'));
  }
  if (input.assetReferences.length && !hasPermission(req.user, 'assets.view')) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to view linked assets'));
  }
  try {
    const ticket = await createTicket(input, req.user);
    res.status(201).json({ success: true, message: 'Ticket created', data: { ticket } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketById(req, res, next) {
  try {
    const ticket = await getTicket(req.params.id, req.user);
    res.json({ success: true, data: { ticket } });
  } catch (error) {
    next(error);
  }
}

export async function patchTicket(req, res, next) {
  const updates = parseOrFail(updateTicketSchema, req.body, next);
  if (!updates) return;
  if (updates.assetReferences?.length && !hasPermission(req.user, 'assets.view')) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to view linked assets'));
  }
  try {
    const ticket = await updateTicket(req.params.id, updates, req.user);
    res.json({ success: true, message: 'Ticket updated', data: { ticket } });
  } catch (error) {
    next(error);
  }
}

export async function patchTicketAssignment(req, res, next) {
  const input = parseOrFail(assignTicketSchema, req.body, next);
  if (!input) return;
  try {
    const ticket = await assignTicket(req.params.id, input.assignedTo, req.user);
    res.json({ success: true, message: 'Ticket assignment updated', data: { ticket } });
  } catch (error) {
    next(error);
  }
}

export async function patchTicketAskedForHelp(req, res, next) {
  const input = parseOrFail(askedForHelpSchema, req.body, next);
  if (!input) return;
  try {
    const ticket = await updateAskedForHelp(req.params.id, input.askedForHelp, req.user);
    res.json({ success: true, message: 'Asked for help updated', data: { ticket } });
  } catch (error) {
    next(error);
  }
}

export async function patchTicketStatus(req, res, next) {
  const input = parseOrFail(transitionTicketSchema, req.body, next);
  if (!input) return;
  try {
    const ticket = await transitionTicket(req.params.id, input, req.user);
    res.json({ success: true, message: 'Ticket status updated', data: { ticket } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketComments(req, res, next) {
  try {
    const items = await listComments(req.params.id, req.user);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function postTicketComment(req, res, next) {
  const input = parseOrFail(createCommentSchema, req.body, next);
  if (!input) return;
  try {
    const comment = await addComment(req.params.id, input, req.user);
    res.status(201).json({ success: true, message: 'Ticket comment added', data: { comment } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketHistory(req, res, next) {
  try {
    const items = await listTicketHistory(req.params.id, req.user);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketTroubleshooting(req, res, next) {
  try {
    const items = await listTroubleshooting(req.params.id, req.user);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function postTicketTroubleshooting(req, res, next) {
  const input = parseOrFail(troubleshootingSchema, req.body, next);
  if (!input) return;
  try {
    const entry = await addTroubleshooting(req.params.id, input, req.user);
    res.status(201).json({ success: true, message: 'Troubleshooting record added', data: { entry } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketAssignees(req, res, next) {
  try {
    const items = await getAssignableUsers();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketMentionableUsers(req, res, next) {
  try {
    const items = await getAssignableUsers();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketSlaPolicies(req, res, next) {
  try {
    const items = await getSlaPolicies();
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function getTicketAttachments(req, res, next) {
  try {
    const items = await listTicketAttachments(req.params.id, req.user);
    res.json({ success: true, data: { items } });
  } catch (error) {
    next(error);
  }
}

export async function postTicketAttachment(req, res, next) {
  try {
    const attachment = await storeTicketAttachment(req.params.id, req.file, req.user);
    res.status(201).json({ success: true, message: 'Ticket attachment uploaded', data: { attachment } });
  } catch (error) {
    next(error);
  }
}

export async function downloadTicketAttachment(req, res, next) {
  try {
    await streamTicketAttachment(req.params.id, req.params.attachmentId, req.user, res, next);
  } catch (error) {
    next(error);
  }
}
