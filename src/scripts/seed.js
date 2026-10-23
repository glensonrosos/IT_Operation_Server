import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { permissionDefinitions, roleDefinitions } from '../constants/permissions.js';
import { defaultDepartments } from '../constants/departments.js';
import { defaultAssetTypes } from '../constants/assets.js';
import AssetType from '../models/AssetType.js';
import { defaultSlaPolicies, defaultTicketCategories } from '../constants/tickets.js';
import SlaPolicy from '../models/SlaPolicy.js';
import TicketCategory from '../models/TicketCategory.js';
import Department from '../models/Department.js';
import Permission from '../models/Permission.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

async function seed() {
  await mongoose.connect(env.MONGO_URI);

  for (const permission of permissionDefinitions) {
    await Permission.updateOne({ key: permission.key }, { $setOnInsert: permission }, { upsert: true });
  }

  for (const role of roleDefinitions) {
    await Role.updateOne({ key: role.key }, { $setOnInsert: { ...role, isSystemRole: true } }, { upsert: true });
  }

  for (const department of defaultDepartments) {
    await Department.updateOne({ departmentCode: department.departmentCode }, { $setOnInsert: department }, { upsert: true });
  }

  for (const category of defaultTicketCategories) {
    await TicketCategory.updateOne({ nameKey: category.nameKey }, { $setOnInsert: category }, { upsert: true });
  }

  for (const policy of defaultSlaPolicies) {
    await SlaPolicy.updateOne({ priority: policy.priority }, { $setOnInsert: policy }, { upsert: true });
  }

  for (const assetType of defaultAssetTypes) {
    await AssetType.updateOne({ code: assetType.code }, { $setOnInsert: assetType }, { upsert: true });
  }

  const existingAdmin = await User.exists({ role: await Role.findOne({ key: 'SUPER_IT_ADMIN' }).then((role) => role._id) });
  if (!existingAdmin) {
    const { INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_FIRST_NAME, INITIAL_ADMIN_LAST_NAME, INITIAL_ADMIN_PASSWORD } = env;
    if (!INITIAL_ADMIN_USERNAME || !INITIAL_ADMIN_EMAIL || !INITIAL_ADMIN_FIRST_NAME || !INITIAL_ADMIN_LAST_NAME || !INITIAL_ADMIN_PASSWORD) {
      throw new Error('Set all INITIAL_ADMIN_* variables before creating the first Super IT Admin.');
    }
    if (INITIAL_ADMIN_PASSWORD.length < 12 || Buffer.byteLength(INITIAL_ADMIN_PASSWORD, 'utf8') > 72) {
      throw new Error('INITIAL_ADMIN_PASSWORD must be at least 12 characters and no more than 72 UTF-8 bytes.');
    }
    const role = await Role.findOne({ key: 'SUPER_IT_ADMIN' });
    await User.create({
      username: INITIAL_ADMIN_USERNAME,
      email: INITIAL_ADMIN_EMAIL,
      firstName: INITIAL_ADMIN_FIRST_NAME,
      lastName: INITIAL_ADMIN_LAST_NAME,
      passwordHash: await bcrypt.hash(INITIAL_ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
      passwordChangedAt: null,
      mustChangePassword: true,
      role: role._id,
      status: 'ACTIVE'
    });
    logger.info({ username: INITIAL_ADMIN_USERNAME }, 'Initial Super IT Admin created; password change is required on first login');
  } else {
    logger.info('IT roles and permissions are seeded; existing administrator accounts were preserved');
  }
}

seed()
  .catch((error) => {
    logger.error({ err: error }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
