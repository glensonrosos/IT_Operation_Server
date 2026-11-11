import multer from 'multer';
import { AppError } from './errorHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, parts: 4 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) return callback(new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'Employee photos must be JPG or PNG files'));
    callback(null, true);
  }
});

export function uploadEmployeePhoto(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'Employee photo must not exceed 10 MB'));
    if (error instanceof multer.MulterError) return next(new AppError(400, 'INVALID_UPLOAD', 'Upload a single JPG or PNG image'));
    next(error);
  });
}
