import mongoose from 'mongoose';

export async function getHealth(req, res) {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const dbState = states[mongoose.connection.readyState] ?? 'unknown';
    res.json({
        ok: true,
        db: dbState,
        uptime: process.uptime(),
    });
}
