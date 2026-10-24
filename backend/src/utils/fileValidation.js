// File validation: extension and magic byte verification, filename sanitization
const path = require('path');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Allowed document categories allowlist
const ALLOWED_CATEGORIES = [
  'General',
  'Finance',
  'HR',
  'Legal',
  'IT',
  'Education',
  'Personal',
];

// Map of allowed extensions to MIME types
const EXTENSION_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// Check if buffer starts with given byte sequence
function startsWithBytes(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[i] !== bytes[i]) return false;
  }
  return true;
}

// Magic bytes verification
function verifyMagicBytes(ext, buffer) {
  if (ext === '.pdf') {
    // %PDF-
    return startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]);
  }
  if (ext === '.png') {
    // \x89PNG\r\n\x1a\n
    return startsWithBytes(buffer, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    // 0xFF 0xD8 0xFF
    return startsWithBytes(buffer, [0xFF, 0xD8, 0xFF]);
  }
  if (ext === '.docx' || ext === '.xlsx') {
    // PK\x03\x04 (ZIP signature)
    return startsWithBytes(buffer, [0x50, 0x4B, 0x03, 0x04]);
  }
  if (ext === '.txt' || ext === '.csv') {
    // Must be valid text without binary null bytes in the header
    const sampleLength = Math.min(buffer.length, 1024);
    for (let i = 0; i < sampleLength; i++) {
      if (buffer[i] === 0x00) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// Sanitize filename to prevent path traversal and unsafe characters
function sanitizeFilename(originalName) {
  if (!originalName || typeof originalName !== 'string') {
    return 'document.bin';
  }

  // Strip path components
  const base = path.basename(originalName);

  // Remove control characters and directory traversal markers
  const sanitized = base
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/[^a-zA-Z0-9._\s-]/g, '_')
    .trim();

  return sanitized.slice(0, 100) || 'document.bin';
}

function validateFile(file) {
  if (!file || !file.buffer) {
    return { valid: false, error: 'File is required' };
  }

  if (file.buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds 10 MB limit' };
  }

  const rawExt = path.extname(file.originalname || '').toLowerCase();
  const mimeType = EXTENSION_MIME_MAP[rawExt];

  if (!mimeType) {
    return {
      valid: false,
      error: `Unsupported file extension "${rawExt}". Allowed: PDF, TXT, DOCX, XLSX, CSV, PNG, JPG, JPEG`,
    };
  }

  if (!verifyMagicBytes(rawExt, file.buffer)) {
    return {
      valid: false,
      error: 'File contents do not match its declared file type (spoofed magic bytes)',
    };
  }

  const cleanFilename = sanitizeFilename(file.originalname);

  return {
    valid: true,
    mimeType,
    cleanFilename,
    sizeBytes: file.buffer.length,
  };
}

module.exports = {
  validateFile,
  sanitizeFilename,
  ALLOWED_CATEGORIES,
  MAX_FILE_SIZE,
};
