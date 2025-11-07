import multer from 'multer';
import path from 'path';
import fs from 'fs';

export const AVATARS_PUBLIC_BASE = '/uploads/avatars';

const AVATARS_DIR = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination(_req, _file, cb) {
        cb(null, AVATARS_DIR);
    },
    filename(req, file, cb) {
        const ext =
            path.extname(file.originalname || '').toLowerCase() || '.png';
        cb(null, `${req.user.id}_${Date.now()}${ext}`);
    },
});

function fileFilter(_req, file, cb) {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(
        file.mimetype
    );
    cb(
        ok ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'avatar'),
        ok
    );
}

export const uploadAvatar = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single('avatar');
