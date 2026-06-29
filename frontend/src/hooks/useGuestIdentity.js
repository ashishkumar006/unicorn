import { useState, useEffect } from 'react';

const STORAGE_KEY = 'wanderlust-guest-identity';

function generateGuestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useGuestIdentity() {
  const [identity, setIdentity] = useState(() => {
    if (typeof window === 'undefined') {
      return { userId: generateGuestId(), createdAt: new Date().toISOString() };
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.userId) {
          return parsed;
        }
      }
    } catch {
      // ignore corrupted storage and create a new identity
    }

    const next = { userId: generateGuestId(), createdAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // ignore storage failures for guest identity
    }
  }, [identity]);

  return identity;
}
