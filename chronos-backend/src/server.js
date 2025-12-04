import 'dotenv/config';

import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDB } from './config/db.js';
import { startEventReminderScheduler } from './services/eventReminder.service.js';

const PORT = Number(process.env.PORT) || 8000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error(' Missing MONGO_URI in .env');
    process.exit(1);
}

async function bootstrap() {
    try {
        await connectDB(MONGO_URI);
        console.log(' MongoDB connected:', mongoose.connection.name);

        const server = http.createServer(app);
        server.listen(PORT, () => {
            console.log(` Server listening on http://localhost:${PORT}`);
        });

        startEventReminderScheduler();

        const shutdown = (signal) => {
            console.log(`\n Received ${signal}. Closing server...`);
            server.close(async () => {
                try {
                    await mongoose.connection.close();
                    console.log(' Server closed. MongoDB disconnected.');
                    process.exit(0);
                } catch (e) {
                    console.error('Error during shutdown:', e);
                    process.exit(1);
                }
            });
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    } catch (err) {
        console.error(' Failed to start:', err);
        process.exit(1);
    }
}

bootstrap();
