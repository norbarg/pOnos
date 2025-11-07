// src/services/mail.service.js
import nodemailer from 'nodemailer';

let transporter = null;

function buildTransport() {
    // Вариант 1: единая строка подключения SMTP_URL (например, smtp://user:pass@smtp.gmail.com:465)
    if (process.env.SMTP_URL) {
        return nodemailer.createTransport(process.env.SMTP_URL);
    }

    // Вариант 2: Gmail/любой SMTP по отдельным полям
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
        const port = Number(process.env.SMTP_PORT || 465);
        const secure = String(process.env.SMTP_SECURE || 'true') === 'true'; // 465=true, 587=false
        return nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
            tls: { minVersion: 'TLSv1.2' },
        });
    }

    // Вариант 3: упрощённо через "service: gmail"
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

// Инициализация один раз при первом импорте файла
(function init() {
    transporter = buildTransport();
    if (!transporter) {
        console.warn(
            '[MAIL] SMTP is not configured. Emails will be logged instead.'
        );
        return;
    }
    // Проверим SMTP сразу, чтобы отлавливать ошибки конфигурации
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

// Базовая отправка
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

// === Письмо-инвайт календаря (используется shareCalendar) ===
export async function sendInviteEmail({ to, calendarName, role, link }) {
    const subject = `You've been invited to "${calendarName}" (${role})`;
    const text = `You were invited to calendar "${calendarName}" as ${role}. Accept: ${link}`;
    const html = `
    <p>You were invited to calendar <b>${calendarName}</b> as <b>${role}</b>.</p>
    <p><a href="${link}">Accept invitation</a></p>`;
    return sendMail({ to, subject, text, html });
}

// === Письмо-инвайт события ===
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
