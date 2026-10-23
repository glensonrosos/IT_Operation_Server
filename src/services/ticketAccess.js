import { AppError } from '../middleware/errorHandler.js';
import { hasPermission } from '../middleware/auth.js';
import Ticket from '../models/Ticket.js';

export function ticketReadFilter(user) {
  if (hasPermission(user, 'tickets.view')) return {};
  return { $or: [{ assignedTo: user._id }, { createdBy: user._id }, { askedForHelp: user._id }] };
}

export async function getAccessibleTicket(identifier, user) {
  const lookup = /^[a-f0-9]{24}$/i.test(identifier) ? { _id: identifier } : { ticketNumber: identifier.toUpperCase() };
  const filter = { ...lookup, isArchived: false, ...ticketReadFilter(user) };
  const ticket = await Ticket.findOne(filter);
  if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found');
  return ticket;
}
