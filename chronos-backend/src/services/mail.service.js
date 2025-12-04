import nodemailer from 'nodemailer';

let transporter = null;

function buildTransport() {
    if (process.env.SMTP_URL) {
        return nodemailer.createTransport(process.env.SMTP_URL);
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
        const port = Number(process.env.SMTP_PORT || 465);
        const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
        return nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
            tls: { minVersion: 'TLSv1.2' },
        });
    }

    if (
        process.env.SMTP_SERVICE === 'gmail' &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
    ) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }

    return null;
}
(function init() {
    transporter = buildTransport();
    if (!transporter) {
        console.warn(
            '[MAIL] SMTP is not configured. Emails will be logged instead.'
        );
        return;
    }
    transporter.verify((err, ok) => {
        if (err) {
            console.error('[MAIL] SMTP verify failed:', err.message || err);
        } else {
            const from =
                process.env.SMTP_FROM || process.env.SMTP_USER || '(not set)';
            const host =
                process.env.SMTP_HOST ||
                process.env.SMTP_SERVICE ||
                '(service)';
            console.log(
                `[MAIL] SMTP ready. From: ${from}; Host/Service: ${host}`
            );
        }
    });
})();

async function sendMail({ to, subject, text, html }) {
    if (!transporter) {
        console.log('[MAIL:FAKE]', { to, subject, text, html });
        return;
    }
    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
    });
}

export async function sendInviteEmail({ to, calendarName, role, link }) {
    const subject = `You've been invited to "${calendarName}" (${role})`;
    const text = `You were invited to calendar "${calendarName}" as ${role}. Accept: ${link}`;
    const html = `
    <p>You were invited to calendar <b>${calendarName}</b> as <b>${role}</b>.</p>
    <p><a href="${link}">Accept invitation</a></p>`;
    return sendMail({ to, subject, text, html });
}

export async function sendEventInviteEmail({ to, eventTitle, when, link }) {
    const subject = `Event invite: ${eventTitle}`;
    const text = `You've been invited to "${eventTitle}"${
        when ? ` (${when})` : ''
    }. Accept: ${link}`;
    const html = `
    <p>You've been invited to <b>${eventTitle}</b>${
        when ? ` <i>${when}</i>` : ''
    }.</p>
    <p><a href="${link}">Accept invitation</a></p>`;
    return sendMail({ to, subject, text, html });
}
export async function sendEventReminderEmail({
    to,
    eventTitle,
    when,
    kind,
    minutes = 15,
    link,
}) {
    let subject;
    let text;
    let html;

    if (kind === 'before15') {
        subject = `Reminder: "${eventTitle}" starts in ${minutes} min`;
        text = `Event "${eventTitle}" starts in ${minutes} minutes. When: ${when}. Open: ${link}`;
        html = `<p>Event <b>${eventTitle}</b> starts in <b>${minutes} minutes</b>.</p>
<p><i>${when}</i></p>
<p><a href="${link}">Open event</a></p>`;
    } else if (kind === 'start') {
        subject = `Now: "${eventTitle}" is starting`;
        text = `Event "${eventTitle}" is starting now. When: ${when}. Open: ${link}`;
        html = `<p>Event <b>${eventTitle}</b> is <b>starting now</b>.</p>
<p><i>${when}</i></p>
<p><a href="${link}">Open event</a></p>`;
    } else if (kind === 'end') {
        subject = `Finished: "${eventTitle}" has ended`;
        text = `Event "${eventTitle}" has just finished. When: ${when}. Open: ${link}`;
        html = `<p>Event <b>${eventTitle}</b> has <b>just finished</b>.</p>
<p><i>${when}</i></p>
<p><a href="${link}">Open event</a></p>`;
    } else {
        subject = `Reminder: "${eventTitle}"`;
        text = `Reminder for event "${eventTitle}". When: ${when}. Open: ${link}`;
        html = `<p>Reminder for event <b>${eventTitle}</b>.</p>
<p><i>${when}</i></p>
<p><a href="${link}">Open event</a></p>`;
    }

    return sendMail({ to, subject, text, html });
}
