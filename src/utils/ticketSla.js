export function getTicketSlaStatus(ticket, now = new Date()) {
  if (ticket.status === 'CANCELLED' || ticket.status === 'DUPLICATED') return 'SLA_MET';
  const completedAt = ticket.resolvedAt ?? ticket.closedAt;
  const riskThreshold = (ticket.slaRiskThresholdPercent ?? 20) / 100;
  const breachedResolution = completedAt
    ? completedAt > ticket.resolutionDueAt
    : ticket.resolutionDueAt <= now;
  const breachedResponse = ticket.responseDueAt && (ticket.firstResponseAt
    ? ticket.firstResponseAt > ticket.responseDueAt
    : ticket.responseDueAt <= now);

  if (breachedResolution || breachedResponse) return 'SLA_BREACHED';
  if (completedAt) return 'SLA_MET';

  const resolutionRemaining = ticket.resolutionDueAt.getTime() - now.getTime();
  const resolutionRiskWindow = ticket.resolutionTargetHours * 60 * 60 * 1000 * riskThreshold;
  const responseRemaining = ticket.responseDueAt ? ticket.responseDueAt.getTime() - now.getTime() : Infinity;
  const responseRiskWindow = ticket.responseTargetMinutes ? ticket.responseTargetMinutes * 60_000 * riskThreshold : 0;
  return resolutionRemaining <= resolutionRiskWindow || responseRemaining <= responseRiskWindow ? 'SLA_AT_RISK' : 'SLA_MET';
}
