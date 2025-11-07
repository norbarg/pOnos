import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    createEvent,
    listCalendarEvents,
    getEvent,
    updateEvent,
    deleteEvent,
    listParticipants,
    addParticipant,
    removeParticipant,
    setMyPlacement,
    leaveEvent,
    inviteByEmail,
    listEventInvites,
    resendEventInvite,
    revokeEventInvite,
} from '../controllers/event.controller.js';
import {
    loadEvent,
    canAccessCalendar,
} from '../middlewares/eventAcl.middleware.js';

const router = Router();
router.use(requireAuth);

// в рамках календаря
router.get('/calendars/:calId/events', canAccessCalendar, listCalendarEvents);
router.post('/calendars/:calId/events', canAccessCalendar, createEvent);

// по id
router.get('/events/:id', loadEvent, getEvent);
router.put('/events/:id', loadEvent, updateEvent);
router.delete('/events/:id', loadEvent, deleteEvent);

// участники и размещения
router.get('/events/:id/participants', loadEvent, listParticipants);
router.post('/events/:id/participants', loadEvent, addParticipant); // body: { userId, calendarId? }
router.delete('/events/:id/participants/:userId', loadEvent, removeParticipant);

router.post('/events/:id/placement', loadEvent, setMyPlacement); // body: { calendarId }
router.post('/events/:id/leave', loadEvent, leaveEvent);

router.post('/events/:id/invite', loadEvent, inviteByEmail); // body: { email }
router.get('/events/:id/invites', loadEvent, listEventInvites);
router.post(
    '/events/:id/invites/:inviteId/resend',
    loadEvent,
    resendEventInvite
);
router.delete('/events/:id/invites/:inviteId', loadEvent, revokeEventInvite);

export default router;
