import Counter from '../models/Counter.js';
import Ticket from '../models/Ticket.js';

export async function nextTicketNumber(year = new Date().getUTCFullYear()) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { key: `ticket:${year}` },
      { $inc: { sequence: 1 }, $setOnInsert: { key: `ticket:${year}` } },
      { new: true, upsert: true }
    );
    const ticketNumber = `TKT-${year}-${String(counter.sequence).padStart(6, '0')}`;
    if (!(await Ticket.exists({ ticketNumber }))) return ticketNumber;
  }
  throw new Error(`Unable to allocate a unique ticket number for ${year}`);
}
