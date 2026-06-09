/**
 * MEDIA SERVICE STUB
 *
 * Placeholder for future file/media handling.
 * Default implementation: no-op and not-configured response.
 */

function uploadFile({ userId, file = null, folder = '', meta = {} } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Media service is not configured.',
    meta: {
      userId,
      fileName: file?.name || file?.originalname || '',
      folder,
      size: file?.size || 0,
      ...meta,
    },
  };
}

function getSignedUrl({ fileKey, expiresIn = 900 } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Media service is not configured.',
    meta: {
      fileKey,
      expiresIn,
    },
  };
}

function deleteFile({ userId, fileKey } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Media service is not configured.',
    meta: {
      userId,
      fileKey,
    },
  };
}

module.exports = {
  uploadFile,
  getSignedUrl,
  deleteFile,
};
