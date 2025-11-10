// chronos-backend/src/app.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';

import authRouter from './routes/auth.routes.js';
import calendarRouter from './routes/calendar.routes.js';
import inviteRouter from './routes/invite.routes.js';
import categoryRoutes from './routes/category.routes.js';
import eventRoutes from './routes/event.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();

app.use(
    cors({
        origin: process.env.CORS_ORIGIN?.split(',') || true,
        credentials: true,
    })
);

app.use(express.json());
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.get('/', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/calendars', calendarRouter);
app.use('/invites', inviteRouter);
app.use('/categories', categoryRoutes);
app.use('/', eventRoutes);
app.use('/users', userRoutes);

export default app;
