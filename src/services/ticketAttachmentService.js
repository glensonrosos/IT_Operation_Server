import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../middleware/errorHandler.js';
import TicketAttachment from '../models/TicketAttachment.js';
import TicketHistory from '../models/TicketHistory.js';
import { env } from '../config/env.js';
import { assertCanModifyTicket } from './ticketService.js';
import { getAccessibleTicket } from './ticketAccess.js';

const serverRoot = fileURLToPath(new URL('../../', import.meta.url));
const storageRoot = path.resolve(serverRoot, env.UPLOAD_DIR);
const mimeByExtension = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain'
};

function hasSignature(buffer, bytes, offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function inspectOfficeZip(buffer, extension) {
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = buffer.lastIndexOf(eocdSignature);
  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) return false;
  if (buffer.readUInt16LE(eocdOffset + 4) !== 0 || buffer.readUInt16LE(eocdOffset + 6) !== 0) return false;
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const centralEnd = offset + centralSize;
  if (!entryCount || entryCount > 5000 || centralSize > buffer.length || centralEnd > eocdOffset) return false;

  const names = new Set();
  let uncompressedTotal = 0;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== 0x02014b50) return false;
    const flags = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) || entryEnd > centralEnd) return false;
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name.startsWith('/') || name.split('/').includes('..')) return false;
    if (uncompressedSize > 50 * 1024 * 1024) return false;
    if (uncompressedSize > 1024 * 1024 && (!compressedSize || uncompressedSize / compressedSize > 200)) return false;
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > 100 * 1024 * 1024) return false;
    names.add(name.toLowerCase());
    offset = entryEnd;
  }

  if (offset !== centralEnd) return false;
  const contentTypes = names.has('[content_types].xml');
  const isWord = names.has('word/document.xml') && ![...names].some((name) => name.includes('vbaproject.bin') || name.startsWith('word/activex/') || name.startsWith('word/embeddings/'));
  const isExcel = names.has('xl/workbook.xml') && ![...names].some((name) => name.includes('vbaproject.bin') || name.startsWith('xl/activex/') || name.startsWith('xl/embeddings/'));
  return contentTypes && (extension === '.docx' ? isWord : isExcel);
}

export function validateTicketFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size < 1) throw new AppError(400, 'FILE_REQUIRED', 'Select a file to upload');
  const extension = path.extname(file.originalname).toLowerCase();
  if (!mimeByExtension[extension] || file.mimetype !== mimeByExtension[extension]) {
    throw new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'Allowed file types are JPG, PNG, PDF, DOCX, XLSX, and TXT');
  }

  const { buffer } = file;
  let valid = false;
  if (extension === '.jpg' || extension === '.jpeg') valid = hasSignature(buffer, [0xff, 0xd8, 0xff]);
  else if (extension === '.png') valid = hasSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  else if (extension === '.pdf') valid = buffer.subarray(0, 5).toString() === '%PDF-';
  else if (extension === '.docx' || extension === '.xlsx') valid = hasSignature(buffer, [0x50, 0x4b, 0x03, 0x04]) && inspectOfficeZip(buffer, extension);
  else if (extension === '.txt') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      valid = !text.includes('\u0000');
    } catch {
      valid = false;
    }
  }
  if (!valid) throw new AppError(422, 'FILE_CONTENT_INVALID', 'File content does not match its allowed file type');
  return extension;
}

function safeOriginalName(name, extension) {
  const basename = path.basename(name.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255);
  return basename || `attachment${extension}`;
}

export async function listTicketAttachments(identifier, user) {
  const ticket = await getAccessibleTicket(identifier, user);
  return TicketAttachment.find({ ticket: ticket._id }).select('originalName mimeType size uploadedBy createdAt').populate('uploadedBy', 'firstName lastName username').sort({ createdAt: -1 }).limit(100).lean();
}

export async function storeTicketAttachment(identifier, file, user) {
  const extension = validateTicketFile(file);
  const ticket = await getAccessibleTicket(identifier, user);
  assertCanModifyTicket(ticket, user);
  if (['CLOSED', 'CANCELLED'].includes(ticket.status)) throw new AppError(409, 'TICKET_FINAL', 'Attachments cannot be added to closed or cancelled tickets');

  const storageName = `${randomUUID()}${extension}`;
  const filePath = path.join(storageRoot, storageName);
  const originalName = safeOriginalName(file.originalname, extension);
  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  let attachment;
  await mkdir(storageRoot, { recursive: true, mode: 0o750 });
  await writeFile(filePath, file.buffer, { flag: 'wx', mode: 0o640 });

  try {
    attachment = await TicketAttachment.create({
      ticket: ticket._id,
      ticketNumber: ticket.ticketNumber,
      originalName,
      storageName,
      mimeType: mimeByExtension[extension],
      size: file.size,
      sha256,
      uploadedBy: user._id
    });
    await TicketHistory.create({
      ticket: ticket._id,
      ticketNumber: ticket.ticketNumber,
      actor: user._id,
      action: 'ATTACHMENT',
      description: `Attachment added: ${originalName}`
    });
  } catch (error) {
    if (attachment) await TicketAttachment.deleteOne({ _id: attachment._id });
    await unlink(filePath).catch(() => {});
    throw error;
  }
  return { id: attachment.id, originalName, mimeType: attachment.mimeType, size: attachment.size, createdAt: attachment.createdAt };
}

export async function streamTicketAttachment(identifier, attachmentId, user, res, next) {
  const ticket = await getAccessibleTicket(identifier, user);
  const attachment = await TicketAttachment.findOne({ _id: attachmentId, ticket: ticket._id }).lean();
  if (!attachment) throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found');
  const filePath = path.join(storageRoot, attachment.storageName);
  res.set({
    'Content-Type': attachment.mimeType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`, 
    'Content-Length': attachment.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  const stream = createReadStream(filePath);
  stream.on('error', (error) => {
    if (res.headersSent) return res.destroy(error);
    if (error.code === 'ENOENT') return next(new AppError(404, 'ATTACHMENT_FILE_NOT_FOUND', 'Attachment file not found'));
    next(error);
  });
  stream.pipe(res);
}
