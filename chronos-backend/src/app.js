import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

app.use('/health', healthRoutes);
app.use('/auth', authRoutes);

// если хочешь, можешь удалить файл debug.routes.js и его import из проекта
export default app;
