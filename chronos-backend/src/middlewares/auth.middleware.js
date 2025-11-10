// auth.middleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
    try {
        const hdr = req.headers.authorization || '';
        const [, token] = hdr.split(' ');
        if (!token)
            return res
                .status(401)
                .json({ error: 'Missing Authorization header' });

        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(payload.sub).lean();
        if (!user) return res.status(401).json({ error: 'User not found' });

        req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            avatar: user.avatar || null, // <- добавили
        };
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
