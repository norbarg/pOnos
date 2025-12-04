# Chronos — Collaborative Calendar (Timely)

Chronos is a collaborative calendar application that lets users:

-   create and manage personal calendars
-   add, edit and delete events
-   share calendars with other users with different access levels
-   receive email invites and reminders
-   see holidays from a separate “holiday” calendar
-   switch between **Week / Month / Year** views
-   use a responsive UI (desktop + mobile)

This repository is a monorepo with **backend (Node.js + Express + MongoDB)** and **frontend (React + Vite + Redux)**.  
Everything can be started together via **Docker Compose** or manually.

---

## Table of Contents

1. Project Structure
2. Tech Stack
3. Features Overview
4. Configuration & Environment Variables
    - Backend `.env`
    - Frontend `.env`
5. Running with Docker (recommended)
6. Running Locally without Docker
    -   1. MongoDB / Database
    -   2. Backend
    -   3. Frontend
7. API Overview
8. Development Notes
9. Troubleshooting
10. Summary

---

## Project Structure

    pOnos/
    ├─ chronos-backend/        # Node.js + Express API
    │  ├─ src/
    │  │  ├─ config/           # DB connection
    │  │  ├─ controllers/      # route handlers
    │  │  ├─ middlewares/      # auth, ACL, uploads
    │  │  ├─ models/           # Mongoose models (User, Calendar, Event, etc.)
    │  │  ├─ routes/           # Express routers (auth, calendars, events, invites, users)
    │  │  ├─ services/         # mail, holidays, reminders, invites, etc.
    │  │  ├─ app.js            # Express app + middleware + routes
    │  │  └─ server.js         # HTTP server + Mongo connection + scheduler bootstrap
    │  ├─ uploads/             # user-uploaded avatars
    │  ├─ Dockerfile
    │  ├─ package.json
    │  └─ .env                 # backend configuration (local dev)
    │
    ├─ chronos-frontend/       # React + Vite SPA
    │  ├─ public/              # static assets (logo, etc.)
    │  ├─ src/
    │  │  ├─ api/              # axios instance
    │  │  ├─ assets/           # images/icons (Timely logo, icons, etc.)
    │  │  ├─ components/       # Calendar components, ProtectedRoute, profile components
    │  │  ├─ config/           # API origin config
    │  │  ├─ features/         # Redux features (auth)
    │  │  ├─ layouts/          # AppShell (main layout)
    │  │  ├─ pages/            # Login, Register, Calendars, EventPage, Profile, AcceptInvite
    │  │  ├─ shared/           # Sidebar
    │  │  ├─ store/            # Redux store
    │  │  ├─ styles/           # CSS files
    │  │  ├─ App.jsx           # routes
    │  │  └─ main.jsx          # ReactDOM root
    │  ├─ Dockerfile
    │  ├─ package.json
    │  └─ .env                 # frontend configuration (local dev)
    │
    ├─ docker-compose.yml      # mongo + backend + frontend
    ├─ package-lock.json
    └─ README.md               # (this file)

---

## Tech Stack

### Backend

-   Node.js, Express
-   MongoDB, Mongoose
-   JWT-based authentication (`jsonwebtoken`)
-   Password hashing (`bcryptjs`)
-   Nodemailer (SMTP / Gmail) for emails
-   `rrule` for recurring reminders
-   `date-holidays` for holiday calendar
-   CORS, Multer for avatar uploads, Morgan for logging

### Frontend

-   React (SPA)
-   Vite as dev server / bundler
-   React Router
-   Redux + Redux Thunk
-   Axios for HTTP
-   Custom CSS (no UI library)

### Infrastructure

-   Docker & Docker Compose
-   MongoDB official image

---

## Features Overview

### Authentication & Profile

-   Register with **email + password + name**
-   Login via JWT
-   Protected routes using `ProtectedRoute` + Redux
-   Profile page with:
    -   change name
    -   upload avatar (stored under `/uploads/avatars` on backend)

### Calendars

-   Each user has their own main calendar automatically created after registration
-   Create multiple custom calendars with:
    -   name
    -   color
    -   description
-   Sharing:
    -   invite other users by **email**
    -   roles: `member` / `editor` (and owner)
    -   invitations via email with accept link

### Events

-   Create, edit, delete events in a calendar
-   Fields: title, description, start/end, category, calendar binding, etc.
-   Events displayed in **Week / Month / Year** views on the frontend
-   Separate page for a single event (`/event`)

### Categories

-   Manage event categories per user/calendar (color, name)
-   Filter events by category

### Invites

-   Calendar invites (sharing access)
-   Event invites (invite specific users to an event)
-   Each invite has TTL (time-to-live) in days (`INVITE_TTL_DAYS`, default `7`)
-   Accept page on frontend: `/invite/accept?token=...`

### Holidays & Reminders

-   A holiday calendar is created & seeded for user country (default **UA**)
-   Email notifications for upcoming / starting / finished events via scheduler:
    -   scheduler interval controlled by `REMINDERS_INTERVAL_SEC`
    -   uses `rrule` to scan events and `nodemailer` to send emails

---

## Configuration & Environment Variables

### Backend `.env`

Backend environment variables are read through `process.env`.  
Below is a complete list (with typical defaults):

    # Basic
    PORT=8000
    MONGO_URI=mongodb://root:example@localhost:27017/chronos?authSource=admin

    # CORS
    CORS_ORIGIN=http://localhost:5173

    # JWT auth
    JWT_SECRET=your-super-secret-jwt-key
    JWT_EXPIRES_IN=7d

    # Email / SMTP (option 1: URL)
    # SMTP_URL=smtp://user:pass@smtp.gmail.com:465

    # Email / SMTP (option 2: separate fields)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_SECURE=true
    SMTP_SERVICE=gmail
    SMTP_USER=your_email@gmail.com
    SMTP_PASS=your_app_password
    SMTP_FROM="Chronos <your_email@gmail.com>"

    # Frontend URL for links in emails (invites, event reminders)
    APP_URL=http://localhost:5173

    # Invites
    INVITE_TTL_DAYS=7

    # Event reminders scheduler
    REMINDERS_ENABLED=true
    REMINDERS_INTERVAL_SEC=60     # how often the worker scans for notifications
    REMINDERS_LEEWAY_SEC=5       # small extra time window

Note: In the repository there is already a `.env` used for local development.  
For production or your own local setup, create your own `.env` based on the template above and keep secrets private.

### Frontend `.env`

Frontend uses Vite env variables (`import.meta.env`):

    # chronos-frontend/.env
    VITE_API_ORIGIN=http://localhost:8000

`src/config/apiOrigin.js` uses:

-   `VITE_API_ORIGIN` or `VITE_API_URL`.
-   If nothing is provided, it falls back to `http://localhost:8000`.

---

## Running with Docker (recommended)

This is the simplest way to run **MongoDB + backend + frontend** in one command.

### 1. Requirements

-   Docker
-   Docker Compose (or `docker compose` CLI)

### 2. Check / adjust `.env` files

-   `chronos-backend/.env` — adjust `MONGO_URI`, `JWT_SECRET`, SMTP settings, `APP_URL`, etc.  
    For Docker, a typical `MONGO_URI` is:

          MONGO_URI=mongodb://root:example@mongo:27017/chronos?authSource=admin

    where `mongo` is the service name in `docker-compose.yml`.

-   `chronos-frontend/.env` — set backend origin:

          VITE_API_ORIGIN=http://localhost:8000

### 3. Start services

From the root of the repo (`Chronos/`):

    docker compose up --build
    # or (older versions)
    docker-compose up --build

What happens:

-   `mongo` service starts:
    -   Image: `mongo:7`
    -   Port: `27017`
    -   DB name: `chronos` (via `MONGO_INITDB_DATABASE`)
    -   User: `root` / `example` (via `MONGO_INITDB_ROOT_*`)
-   `backend` service builds from `chronos-backend/Dockerfile` and runs on port `8000`
-   `frontend` service builds from `chronos-frontend/Dockerfile` and runs Vite dev server on `5173`

### 4. Open the app

-   Backend API: <http://localhost:8000>
-   Frontend (UI): <http://localhost:5173>

From there you can:

-   Register new user
-   Login
-   Create calendars and events
-   Test invites and reminders (if SMTP is configured)

To stop all containers:

    docker compose down
    # or
    docker-compose down

---

## Running Locally without Docker

If you prefer to run everything manually:

### 1. MongoDB / Database

#### Option A: Local MongoDB (no auth)

1.  Install MongoDB locally (Community Edition).
2.  Start MongoDB on the default port `27017`.
3.  Set in `chronos-backend/.env`:

        MONGO_URI=mongodb://localhost:27017/chronos

MongoDB will automatically create the `chronos` database the first time data is written,  
so you do not need to manually create collections.

If you need a “create DB” step for documentation, in `mongosh`:

        use chronos
        // DB appears after the first insert, but this is enough as a "create" step

#### Option B: Local MongoDB with auth (like Docker)

If you want the same user/password as in Docker:

1.  Start Mongo with authentication.
2.  Create root user:

        use admin
        db.createUser({
          user: "root",
          pwd: "example",
          roles: [{ role: "root", db: "admin" }]
        })

3.  Then in `chronos-backend/.env`:

        MONGO_URI=mongodb://root:example@localhost:27017/chronos?authSource=admin

### 2. Backend

From the root of the repo:

    cd chronos-backend
    npm install

Create (or edit) `.env` as described above.

To run in development mode (with automatic restart via `nodemon`):

    npm run dev

To run in production mode:

    npm start

Backend will listen on `PORT` (default `8000`) and expose:

-   health check at `/` → `{ ok: true }`
-   main routes (see “API Overview” ниже)

### 3. Frontend

In another terminal:

    cd chronos-frontend
    npm install

Check/create `chronos-frontend/.env`:

    VITE_API_ORIGIN=http://localhost:8000

Then run the dev server:

    npm run dev

Vite will show something like:

    Local:   http://localhost:5173/

Open it in the browser.  
Login/register will work against the backend at `http://localhost:8000`.

---

## API Overview

(Only a short overview — for full curl examples see `chronos-backend/documentation.md`.)

Base URL (dev):

    http://localhost:8000

### Auth

`POST /auth/register`  
Body:

    { "email", "password", "passwordConfirm", "name" }

Creates user + main calendar + holidays calendar.

`POST /auth/login`  
Body:

    { "email", "password" }

Response:

    { "token", "user" }

Frontend saves token to `localStorage.chronos_token`.

### Calendars

-   `GET /calendars` — list calendars of current user
-   `POST /calendars` — create calendar (name, color, description, etc.)
-   `PATCH /calendars/:id` — update calendar
-   `DELETE /calendars/:id` — delete calendar (with ACL check)

### Events

-   `GET /events` — list events for user (filters by calendar, date range, etc.)
-   `POST /events` — create new event
-   `GET /events/:id` — single event
-   `PATCH /events/:id` — update
-   `DELETE /events/:id` — delete

There are also endpoints related to:

-   event invitations
-   event placement into calendars (after accepting invite)
-   notifications

### Categories

-   `GET /categories`
-   `POST /categories`
-   `PATCH /categories/:id`
-   `DELETE /categories/:id`

### Invites

-   `POST /invites` — create calendar invite (invites user by email)
-   `GET /invites` — list pending invites
-   `POST /invites/:token/accept` — accept invite (also handled by frontend via `/invite/accept` page).

---

## Development Notes

### Auth flow on frontend

-   On successful login, JWT token is stored in `localStorage` under key `chronos_token`.
-   `axios` instance (`src/api/axios.js`) attaches header `Authorization: Bearer <token>`.
-   If backend responds with `401` on non-auth endpoints, interceptor:
    -   clears token from `localStorage`
    -   redirects to `/login`.

### Static files

-   Backend serves `/uploads` folder:
    -   avatars are stored in `/uploads/avatars`
-   Frontend can use `absUrl()` helper to build absolute URLs to backend.

### Scheduler / reminders

-   Started in `src/server.js` via `startEventReminderScheduler`.
-   Controlled by:
    -   `REMINDERS_ENABLED`
    -   `REMINDERS_INTERVAL_SEC`
    -   `REMINDERS_LEEWAY_SEC`
-   Uses `EventNotification` model to avoid duplicate emails.

### Holidays

-   On first user login/register, backend ensures holiday calendar exists  
    and seeds holidays using `date-holidays`.

---

## Troubleshooting

### 1. MongoDB connection errors

Example error:

    MongooseServerSelectionError: read ECONNRESET
    ❌ Missing MONGO_URI in .env

Check:

-   `chronos-backend/.env`:
    -   `MONGO_URI` is set correctly (host, port, auth, db name, `authSource`).
-   MongoDB is running:
    -   `docker ps` (for Docker)
    -   or `mongosh` / services on your OS.

### 2. CORS errors in browser

If you see something like **CORS policy** in DevTools:

-   Make sure `CORS_ORIGIN` in backend `.env` matches the frontend URL, e.g.:

          CORS_ORIGIN=http://localhost:5173

-   Restart backend after changing `.env`.

### 3. Emails not sending

-   Check SMTP config in backend `.env`:
    -   either `SMTP_URL` or `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` etc.
-   For Gmail:
    -   Use app password or configured credentials with “less secure apps” (если ещё доступно).
-   Check backend logs for `[MAIL]` messages.

### 4. JWT-related issues (frequent logouts)

-   Ensure `JWT_SECRET` is set and not changed while the server is running.
-   If you change `JWT_SECRET`, old tokens become invalid → re-login in the UI.

---

## Summary

You now have **one README** that:

-   describes the project (Chronos calendar)
-   explains tech stack & structure
-   lists all important environment variables
-   shows how to:
    -   set up MongoDB (with / without auth)
    -   run backend & frontend manually
    -   or start full stack via Docker Compose
-   gives a brief overview of API endpoints and main behavior.
