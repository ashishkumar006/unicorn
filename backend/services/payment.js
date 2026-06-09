/**
 * PAYMENT SERVICE STUB
 *
 * Placeholder for future payment integration.
 * Default implementation: no-op and not-configured response.
 */

function initiatePayment({ userId, amount, currency = 'INR', method = '', reference = '' } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Payment service is not configured.',
    meta: {
      userId,
      amount,
      currency,
      method,
      reference,
    },
  };
}

function verifyPayment({ paymentId, status = '', payload = {} } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Payment verification is not configured.',
    meta: {
      paymentId,
      status,
      payload,
    },
  };
}

function getPaymentMethods() {
  return {
    success: false,
    configured: false,
    error: 'Payment service is not configured.',
    methods: [],
  };
}

module.exports = {
  initiatePayment,
  verifyPayment,
  getPaymentMethods,
};
