import Counter from '../models/Counter.js';

export async function nextTicketNumber(year = new Date().getUTCFullYear()) {
  const counter = await Counter.findOneAndUpdate(
    { key: `ticket:${year}` },
    { $inc: { sequence: 1 }, $setOnInsert: { key: `ticket:${year}` } },
    { new: true, upsert: true }
  );
  return `TKT-${year}-${String(counter.sequence).padStart(6, '0')}`;
}
