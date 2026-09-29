import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/**
 * The group's hotels. Every enquiry, venue, session and menu belongs to one;
 * the code prefixes its document numbers (HCP.EP…, CPA.EP…).
 */
export const PROPERTY_CODES = ['HCP', 'CPA', 'CPNM'];

let cache = null;
let inflight = null;
const listeners = new Set();

/** The properties with their details, fetched once and shared. */
export function loadProperties({ force = false } = {}) {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) {
    inflight = api
      .get('/properties')
      .then((res) => {
        cache = res?.data?.data?.properties || [];
        listeners.forEach((fn) => fn(cache));
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Re-reads the properties after an edit, updating every screen using them. */
export function refreshProperties() {
  return loadProperties({ force: true });
}

/** @returns {Array|null} the properties (null while loading) */
export function useProperties() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    let alive = true;
    listeners.add(setList);
    loadProperties()
      .then((l) => alive && setList(l))
      .catch(() => alive && setList((prev) => prev || PROPERTY_CODES.map((code) => ({ code }))));
    return () => {
      alive = false;
      listeners.delete(setList);
    };
  }, []);
  return list;
}

/** All the rooms a property has, across its categories. */
export function totalRooms(property) {
  return (property?.roomTypes || []).reduce((sum, t) => sum + (Number(t.count) || 0), 0);
}

/** "CPA — Centre Point Amravati", or just the code until a name is set. */
export function propertyLabel(property) {
  if (!property) return '';
  return property.name ? `${property.code} — ${property.name}` : property.code;
}

/**
 * A page's property choice, remembered in this browser so the calendar or
 * Banquet Setup opens on the hotel last looked at.
 */
export function useRememberedProperty(key, fallback = 'HCP', allowed = PROPERTY_CODES) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return allowed.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (next) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Storage unavailable (private window) — the choice lasts for this visit.
    }
  };
  return [allowed.includes(value) ? value : fallback, set];
}
