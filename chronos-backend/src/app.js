import express from "express";
import morgan from "morgan";
import cors from "cors";

import authRouter from "./routes/auth.routes.js";
import healthRouter from "./routes/health.routes.js";
import calendarRouter from "./routes/calendar.routes.js";

const app = express();


app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || true,
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/health", healthRouter);

// 🔗 календари (ACL внутри самих роутов)
app.use("/calendars", calendarRouter);

export default app;