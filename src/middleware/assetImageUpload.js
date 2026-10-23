import multer from 'multer';
import { AppError } from './errorHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 2, parts: 12 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) return callback(new AppError(422, 'FILE_TYPE_NOT_ALLOWED', 'Asset images must be JPG or PNG files'));
    callback(null, true);
  }
});

export function uploadAssetImages(req, res, next) {
  upload.array('images', 10)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'Each asset image must not exceed 10 MB'));
    if (error instanceof multer.MulterError) return next(new AppError(400, 'INVALID_UPLOAD', 'Upload up to 10 JPG or PNG images'));
    next(error);
  });
}
