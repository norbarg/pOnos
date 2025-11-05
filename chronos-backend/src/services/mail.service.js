// Простой "почтовый" стаб — пишет в консоль.
// Позже можно заменить на Nodemailer / SMTP по .env.

export async function sendInviteEmail({ to, calendarName, role, link }) {
  // eslint-disable-next-line no-console
  console.log(
    `[MAIL] Invite → ${to}\n` +
    `  Calendar: ${calendarName}\n` +
    `  Role: ${role}\n` +
    `  Link: ${link}\n`
  );
}