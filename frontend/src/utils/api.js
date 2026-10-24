// Centralized HTTP client using fetch with automatic credentials and clean JSON errors
export async function apiRequest(endpoint, options = {}) {
  const config = {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  };

  if (options.body && !(options.body instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(endpoint, config);

  // If response is download binary
  const contentType = response.headers.get('content-type') || '';
  if (response.ok && !contentType.includes('application/json')) {
    return response;
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = { error: response.statusText || 'An unexpected error occurred' };
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Compute client-side SHA-256 using native Web Crypto API
export async function computeFileSha256(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
