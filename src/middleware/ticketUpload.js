import multer from 'multer';
import { AppError } from './errorHandler.js';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5, parts: 6 },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) return callback(new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'Allowed file types are JPG, PNG, PDF, DOCX, XLSX, and TXT'));
    callback(null, true);
  }
});

export function uploadTicketAttachment(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'FILE_TOO_LARGE', 'Attachments must not exceed 10 MB'));
    }
    if (error instanceof multer.MulterError) {
      return next(new AppError(400, 'INVALID_UPLOAD', 'Upload must contain one supported file'));
    }
    next(error);
  });
}
