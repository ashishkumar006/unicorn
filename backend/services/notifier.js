/**
 * NOTIFIER SERVICE STUB
 *
 * Placeholder for future email/in-app notification integration.
 * Default implementation: no-op and not-configured response.
 */

function sendEmail({ to = '', subject = '', body = '', attachments = [] } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Notification service is not configured.',
    meta: {
      to,
      subject,
      body,
      attachments,
    },
  };
}

function sendGroupInvite({ groupId, invites = [], message = '' } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Notification service is not configured.',
    meta: {
      groupId,
      invites,
      message,
    },
  };
}

function sendBookingConfirmation({ userId, bookingId, summary = {} } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Notification service is not configured.',
    meta: {
      userId,
      bookingId,
      summary,
    },
  };
}

module.exports = {
  sendEmail,
  sendGroupInvite,
  sendBookingConfirmation,
};
