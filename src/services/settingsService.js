import SystemSetting from '../models/SystemSetting.js';

const defaults = {
  companyName: 'Internal IT Management System',
  companyTimezone: 'Asia/Manila',
  supportEmail: 'it-support@company.local',
  warrantyAlertDays: 30,
  borrowingDefaultDays: 7,
  lowStockAlertEnabled: true
};

export async function getSettings() {
  const items = await SystemSetting.find().lean();
  return items.reduce((result, item) => ({ ...result, [item.key]: item.value }), { ...defaults });
}

export async function updateSettings(values, actorId) {
  for (const [key, value] of Object.entries(values)) {
    await SystemSetting.updateOne({ key }, { $set: { value, updatedBy: actorId, updatedAt: new Date(), description: key } }, { upsert: true });
  }
  return getSettings();
}
