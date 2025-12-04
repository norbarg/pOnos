# Chronos Backend API Documentation (EN)

Base URL (dev):

    http://localhost:8000

All responses are JSON unless stated otherwise.  
Authentication is via JWT in the header `Authorization: Bearer <token>`.

---

## Contents

1. Healthcheck & Static
2. Auth
3. Calendars
4. Categories
5. Events
6. Invites (accept)
7. Users

---

## 1. Healthcheck & Static

### GET /

Simple healthcheck.

Response 200:

    { "ok": true }

---

### GET /uploads/...

Serves static files (avatars, etc.) from the `uploads` folder.

Examples:

-   `/uploads/avatars/abc123.png`

---

## 2. Auth

Router: `app.use('/auth', authRouter)`  
Base path: `/auth`

---

### POST /auth/register

Register a new user.

Auth: not required.

Example body:

    {
      "email": "user@example.com",
      "password": "secret123",
      "passwordConfirm": "secret123",
      "name": "John Doe"
    }

What it does:

-   creates a new user;
-   hashes the password;
-   may create related entities (e.g. default calendar) according to controller logic;
-   returns user data and/or token.

---

### POST /auth/login

Login with email + password.

Auth: not required.

Example body:

    {
      "email": "user@example.com",
      "password": "secret123"
    }

Typical 200 response (simplified):

    {
      "token": "jwt-token-here",
      "user": {
        "_id": "....",
        "email": "user@example.com",
        "name": "John Doe",
        "avatarUrl": "/uploads/avatars/...",
        ...
      }
    }

---

### GET /auth/me

Get current user data.

Auth: required (Bearer token).

200 response (simplified):

    {
      "_id": "....",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": "/uploads/avatars/...",
      ...
    }

---

## 3. Calendars

Router: `app.use('/calendars', calendarRouter)`  
Base path: `/calendars`  
All routes under this router use `requireAuth`.

---

### GET /calendars/

List calendars for the current user.

Auth: required.

Description:

-   returns calendars where the user is:
    -   the owner, or
    -   a member/editor (has any access role).

---

### POST /calendars/

Create a new calendar.

Auth: required.

Example body:

    {
      "name": "My Calendar",
      "color": "#ffb3d3",
      "description": "Personal calendar"
    }

Description:

-   creates a new calendar;
-   the current user becomes the owner.

---

### GET /calendars/:id

Get calendar info by id.

Auth: required.  
ACL: `loadCalendar`, `canAccessCalendar`.

Description:

-   returns full information about the calendar;
-   accessible to anyone who has access to this calendar.

---

### PUT /calendars/:id

Update calendar.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwnerOrEditor`.

Example body:

    {
      "name": "Updated name",
      "color": "#00ff00",
      "description": "New description"
    }

Description:

-   updates basic calendar fields (name, color, description, etc.);
-   accessible for owner and editors.

---

### DELETE /calendars/:id

Delete calendar.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Description:

-   deletes the calendar completely;
-   only the owner can perform this action.

---

### GET /calendars/:id/status

Get personal notification status for this calendar (for the current user).

Auth: required.  
ACL: `loadCalendar`, `canAccessCalendar`.

Description:

-   returns per-user notification preferences for this calendar (e.g. whether email notifications are enabled).

---

### PATCH /calendars/:id/status

Update personal notification status for this calendar.

Auth: required.  
ACL: `loadCalendar`, `canAccessCalendar`.

Example body (exact fields depend on implementation):

    {
      "muted": true,
      "emailNotifications": false
    }

Description:

-   updates notification settings for the _current_ user for the given calendar.

---

### POST /calendars/:id/share

Send a sharing invitation for a calendar by email.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Example body:

    {
      "email": "friend@example.com",
      "role": "member"   // or "editor"
    }

Description:

-   creates an invite for the calendar;
-   sends an email invitation.

---

### GET /calendars/:id/members

List calendar members.

Auth: required.  
ACL: `loadCalendar`, `canAccessCalendar`.

Description:

-   returns an array of members with their roles (owner / member / editor).

---

### PATCH /calendars/:id/members/:userId

Change a member’s role in the calendar.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Example body:

    {
      "role": "editor"
    }

Description:

-   updates the member role (e.g. from `member` to `editor`).

---

### DELETE /calendars/:id/members/:userId

Remove a member from the calendar.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Description:

-   removes the specified user from the calendar members.

---

### GET /calendars/:id/invites

List invites for the calendar.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Description:

-   returns all active calendar invites (email, status, sent at, etc.).

---

### POST /calendars/:id/invites/:inviteId/resend

Resend a calendar invite.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Description:

-   re-sends an invite email for the given invite.

---

### DELETE /calendars/:id/invites/:inviteId

Revoke a calendar invite.

Auth: required.  
ACL: `loadCalendar`, `isCalendarOwner`.

Description:

-   makes the invite invalid (user can no longer accept it).

---

### POST /calendars/:id/leave

Leave a calendar.

Auth: required.  
ACL: `loadCalendar`, `canAccessCalendar`.

Description:

-   the current user leaves the calendar (is removed from members);
-   usually not allowed for the owner (by controller logic).

---

## 4. Categories

Router: `app.use('/categories', categoryRoutes)`  
Base path: `/categories`  
All routes use `requireAuth`.

---

### GET /categories/

List categories of the current user.

Auth: required.

Description:

-   returns event categories (like “Work”, “Personal”, etc.).

---

### POST /categories/

Create a category.

Auth: required.

Example body:

    {
      "name": "Work",
      "color": "#ff0000"
    }

---

### PUT /categories/:id

Update a category.

Auth: required.

Example body:

    {
      "name": "Updated name",
      "color": "#00ff00"
    }

---

### DELETE /categories/:id

Delete a category.

Auth: required.

Description:

-   deletes the user’s category;
-   handling of existing events with this category depends on controller implementation.

---

## 5. Events

Router: `app.use('/', eventRoutes)`  
Base path: `/`  
All routes use `requireAuth`.

---

### GET /calendars/:calId/events

List events for a calendar.

Auth: required.  
ACL: `canAccessCalendar`.

Description:

-   returns events attached to calendar `:calId`;
-   may support filtering by date range, etc. (depends on implementation).

---

### POST /calendars/:calId/events

Create an event in a calendar.

Auth: required.  
ACL: `canAccessCalendar`.

Example body:

    {
      "title": "Meeting",
      "description": "Team sync",
      "start": "2025-12-10T10:00:00.000Z",
      "end": "2025-12-10T11:00:00.000Z",
      "categoryId": "...."
    }

Description:

-   creates a new event in the given calendar;
-   the current user is the creator/organizer (according to controller logic).

---

### GET /events/:id

Get event by id.

Auth: required.  
ACL: `loadEvent`.

Description:

-   returns full event information.

---

### PUT /events/:id

Update event.

Auth: required.  
ACL: `loadEvent`.

Example body:

    {
      "title": "Updated title",
      "description": "New description",
      "start": "2025-12-10T12:00:00.000Z",
      "end": "2025-12-10T13:00:00.000Z",
      "categoryId": "...."
    }

---

### DELETE /events/:id

Delete event.

Auth: required.  
ACL: `loadEvent`.

Description:

-   deletes the event completely.

---

### GET /events/:id/participants

List event participants.

Auth: required.  
ACL: `loadEvent`.

Description:

-   returns all users attached to the event.

---

### POST /events/:id/participants

Add a participant to the event.

Auth: required.  
ACL: `loadEvent`.

Example body:

    {
      "userId": "....",
      "calendarId": "...."   // optional
    }

Description:

-   adds the specified user as a participant of the event;
-   optionally sets a calendar where the user will see this event.

---

### DELETE /events/:id/participants/:userId

Remove a participant from the event.

Auth: required.  
ACL: `loadEvent`.

Description:

-   removes `:userId` from event participants.

---

### POST /events/:id/placement

Set “my placement” of the event (which calendar I want it in).

Auth: required.  
ACL: `loadEvent`.

Example body:

    {
      "calendarId": "...."
    }

Description:

-   binds the event to the chosen calendar of the current user.

---

### POST /events/:id/leave

Leave an event.

Auth: required.  
ACL: `loadEvent`.

Description:

-   the current user removes themselves from the event participants.

---

### POST /events/:id/invite

Invite a participant to the event by email.

Auth: required.  
ACL: `loadEvent`.

Example body:

    {
      "email": "user@example.com"
    }

Description:

-   creates an event invite;
-   sends an invitation email.

---

### GET /events/:id/invites

List event invites.

Auth: required.  
ACL: `loadEvent`.

Description:

-   returns all active invites for this event.

---

### POST /events/:id/invites/:inviteId/resend

Resend an event invite.

Auth: required.  
ACL: `loadEvent`.

---

### DELETE /events/:id/invites/:inviteId

Revoke an event invite.

Auth: required.  
ACL: `loadEvent`.

---

## 6. Invites (accept)

Router: `app.use('/invites', inviteRouter)`  
Base path: `/invites`  
All routes use `requireAuth`.

---

### POST /invites/accept

Accept an invite by token.

Auth: required.

Example body:

    {
      "token": "invite-token-here"
    }

Description:

-   resolves the invite by token (calendar or event invite);
-   adds the current user to the corresponding calendar/event;
-   may create any necessary membership/placement links.

---

## 7. Users

Router: `app.use('/users', userRoutes)`  
Base path: `/users`  
All routes use `requireAuth`.

---

### PATCH /users/me

Update profile of the current user.

Auth: required.  
Content-Type: `multipart/form-data`.

Description:

-   uses `uploadAvatar` middleware:
    -   expects a file field (e.g. `avatar`);
    -   saves it to `/uploads/avatars`.
-   updates user fields such as name, avatar, etc.

Example payload (form):

-   `avatar` — file;
-   other text fields — usual inputs (`name`, etc.).

---

### DELETE /users/me

Delete the current user.

Auth: required.

Description:

-   deletes the current user account;
-   behavior for related entities depends on controller implementation.

---
