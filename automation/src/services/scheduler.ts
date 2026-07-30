import type { PhaseInfo, ScheduleCheck } from '../types';
import { CONFIG } from '../config/constants';
import { getConfig, getTodayPublishCount } from './storageService';

// ─── Main Schedule Decision ───────────────────────────────────────

/**
 * Determine whether the automation should publish right now.
 * Checks: is_active, current Turkey time, current phase, today's count, jitter window.
 */
export async function shouldPublishNow(db: D1Database): Promise<ScheduleCheck> {
  const turkeyNow = getTurkeyDate();
  const turkeyTimeStr = formatTurkeyTime(turkeyNow);
  const turkeyDateStr = formatTurkeyDate(turkeyNow);
  const currentHour = turkeyNow.getUTCHours();
  const currentMinute = turkeyNow.getUTCMinutes();

  // Check if active
  const isActive = (await getConfig(db, 'is_active')) === 'true';
  if (!isActive) {
    const phase = await getCurrentPhase(db);
    return {
      shouldPublish: false,
      reason: 'Otomasyon duraklatıldı',
      currentPhase: phase,
      todayPublishCount: 0,
      turkeyTime: turkeyTimeStr,
    };
  }

  const phase = await getCurrentPhase(db);
  const todayCount = await getTodayPublishCount(db, turkeyDateStr);

  // Already published enough for today
  if (todayCount >= phase.postsPerDay) {
    return {
      shouldPublish: false,
      reason: `Bugün ${todayCount}/${phase.postsPerDay} yazı zaten yayınlandı`,
      currentPhase: phase,
      todayPublishCount: todayCount,
      turkeyTime: turkeyTimeStr,
    };
  }

  // Check if current time is at or past the next scheduled time slot (with jitter)
  const jitter = CONFIG.TIME_JITTER_MINUTES;

  if (todayCount < phase.times.length) {
    const scheduledTime = phase.times[todayCount];
    const [schedHour, schedMinute] = scheduledTime.split(':').map(Number);

    const schedTotalMins = schedHour * 60 + schedMinute;
    const currentTotalMins = currentHour * 60 + currentMinute;

    const dateHash = simpleHash(turkeyDateStr + scheduledTime);
    const jitterMins = (dateHash % (jitter * 2 + 1)) - jitter;
    const targetMins = schedTotalMins + jitterMins;

    const targetHour = Math.floor(targetMins / 60);
    const targetMin = targetMins % 60;
    const targetTimeStr = `${String(targetHour).padStart(2, '0')}:${String(targetMin).padStart(2, '0')}`;

    if (currentTotalMins >= targetMins) {
      return {
        shouldPublish: true,
        reason: `Yayın zamanı geldi/geçti: ${scheduledTime} (Hedef: ${targetTimeStr}, Jitter: ${jitterMins > 0 ? '+' : ''}${jitterMins} dk)`,
        currentPhase: phase,
        todayPublishCount: todayCount,
        turkeyTime: turkeyTimeStr,
      };
    }
  }

  return {
    shouldPublish: false,
    reason: `Henüz yayın zamanı gelmedi. Sonraki saatler: ${phase.times.slice(todayCount).join(', ')}`,
    currentPhase: phase,
    todayPublishCount: todayCount,
    turkeyTime: turkeyTimeStr,
  };
}

// ─── Next Publish Time ────────────────────────────────────────────

export async function getNextPublishDate(db: D1Database): Promise<Date | null> {
  const turkeyNow = getTurkeyDate();
  const turkeyDateStr = formatTurkeyDate(turkeyNow);
  const currentHour = turkeyNow.getUTCHours();
  const currentMinute = turkeyNow.getUTCMinutes();
  const currentTotalMins = currentHour * 60 + currentMinute;

  const phase = await getCurrentPhase(db);
  const todayCount = await getTodayPublishCount(db, turkeyDateStr);

  const jitter = CONFIG.TIME_JITTER_MINUTES;

  if (todayCount < phase.times.length) {
    const scheduledTime = phase.times[todayCount];
    const [schedHour, schedMinute] = scheduledTime.split(':').map(Number);
    const schedTotalMins = schedHour * 60 + schedMinute;

    const dateHash = simpleHash(turkeyDateStr + scheduledTime);
    const jitterMins = (dateHash % (jitter * 2 + 1)) - jitter;
    const targetMins = schedTotalMins + jitterMins;

    const h = Math.floor(targetMins / 60);
    const m = targetMins % 60;

    // Construct local ISO string in Turkey timezone (UTC+3)
    const localIso = `${turkeyDateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`;
    return new Date(localIso);
  }

  // All times passed for today, next is tomorrow's first time
  const tomorrow = new Date(turkeyNow.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDateStr = formatTurkeyDate(tomorrow);
  const firstTime = phase.times[0];
  const [schedHour, schedMinute] = firstTime.split(':').map(Number);
  const schedTotalMins = schedHour * 60 + schedMinute;

  const dateHash = simpleHash(tomorrowDateStr + firstTime);
  const jitterMins = (dateHash % (jitter * 2 + 1)) - jitter;
  const targetMins = schedTotalMins + jitterMins;

  const h = Math.floor(targetMins / 60);
  const m = targetMins % 60;

  const localIso = `${tomorrowDateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`;
  return new Date(localIso);
}

export async function getNextPublishTime(db: D1Database): Promise<string | null> {
  const date = await getNextPublishDate(db);
  return date ? date.toISOString() : null;
}

// ─── Phase Calculation ────────────────────────────────────────────

/**
 * Calculate the current publishing phase based on weeks since phase_start_date.
 */
export async function getCurrentPhase(db: D1Database): Promise<PhaseInfo> {
  const mode = await getConfig(db, 'schedule_mode') ?? 'auto';

  if (mode === 'manual') {
    const postsPerDayStr = await getConfig(db, 'posts_per_day') ?? '1';
    const publishTimesStr = await getConfig(db, 'publish_times') ?? '10:23';
    
    let times: string[] = [];
    try {
      if (publishTimesStr.startsWith('[')) {
        times = JSON.parse(publishTimesStr);
      } else {
        times = publishTimesStr.split(',').map((t) => t.trim());
      }
    } catch {
      times = [publishTimesStr];
    }

    return {
      week: 0, // 0 indicates manual override
      postsPerDay: parseInt(postsPerDayStr, 10) || 1,
      times: times.length > 0 ? times : ['10:23'],
    };
  }

  const startDateStr = await getConfig(db, 'phase_start_date');

  if (!startDateStr) {
    // Default to week 1 if no start date
    return CONFIG.PHASES[0] as unknown as PhaseInfo;
  }

  const startDate = new Date(startDateStr);
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const weekNumber = diffWeeks + 1; // 1-indexed

  // Find the matching phase (last defined phase repeats for all subsequent weeks)
  let phase: (typeof CONFIG.PHASES)[number] | undefined;

  for (const p of CONFIG.PHASES) {
    if (weekNumber <= p.week) {
      phase = p;
      break;
    }
  }

  // If past all defined phases, use the last one (month 2+ = 3/day)
  if (!phase) {
    phase = CONFIG.PHASES[CONFIG.PHASES.length - 1];
  }

  return {
    week: weekNumber,
    postsPerDay: phase.postsPerDay,
    times: [...phase.times],
  };
}

// ─── Time Utilities ───────────────────────────────────────────────

/**
 * Get the current date/time shifted to Turkey timezone (UTC+3).
 * Returns a Date where getUTCHours/Minutes/etc. give Turkey local time.
 */
function getTurkeyDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

function formatTurkeyTime(turkeyDate: Date): string {
  const h = String(turkeyDate.getUTCHours()).padStart(2, '0');
  const m = String(turkeyDate.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatTurkeyDate(turkeyDate: Date): string {
  return turkeyDate.toISOString().slice(0, 10);
}

/**
 * Simple deterministic hash for jitter calculation.
 * Produces the same jitter for the same day + time slot.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}
