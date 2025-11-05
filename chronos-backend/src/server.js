import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ Missing MONGO_URI in .env');
    process.exit(1);
}

async function bootstrap() {
    try {
        await connectDB(MONGO_URI);
        console.log('✅ MongoDB connected');

        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
        });

        const shutdown = async (signal) => {
            console.log(`\n${signal} received. Shutting down...`);
            server.close(async () => {
                await mongoose.connection.close();
                console.log('🛑 Server closed. MongoDB disconnected.');
                process.exit(0);
            });
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    } catch (err) {
        console.error('❌ Failed to start:', err);
        process.exit(1);
    }
}

bootstrap();
