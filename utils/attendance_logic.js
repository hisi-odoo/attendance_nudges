"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextAlarmDelayMs = exports.parseTime = exports.isDayActive = exports.shouldRemindCheckOut = exports.shouldRemindCheckIn = void 0;
/**
 * Determines whether a Morning Check-in reminder should be issued.
 *
 * Rules:
 * 1. Must be a configured working day.
 * 2. User must be authenticated in Odoo.
 * 3. User is currently checked out (`attendance_state === 'checked_out'`).
 * 4. User has recorded 0 attendance entries for today (`today_attendance_ids.length === 0`).
 */
function shouldRemindCheckIn(data, isWorkingDay = true) {
    if (!isWorkingDay)
        return false;
    if (!data || !data.authenticated)
        return false;
    const isCheckedIn = data.attendance_state === 'checked_in';
    const hasAttendancesToday = Boolean(data.today_attendance_ids && data.today_attendance_ids.length > 0);
    // If user is already checked in or already has an attendance record for today, no check-in reminder needed
    if (isCheckedIn || hasAttendancesToday) {
        return false;
    }
    return true;
}
exports.shouldRemindCheckIn = shouldRemindCheckIn;
/**
 * Determines whether an Evening Check-out reminder should be issued.
 *
 * Rules:
 * 1. Must be a configured working day.
 * 2. User must be authenticated in Odoo.
 * 3. User is currently still checked in (`attendance_state === 'checked_in'`).
 */
function shouldRemindCheckOut(data, isWorkingDay = true) {
    if (!isWorkingDay)
        return false;
    if (!data || !data.authenticated)
        return false;
    return data.attendance_state === 'checked_in';
}
exports.shouldRemindCheckOut = shouldRemindCheckOut;
/**
 * Checks if a given Date corresponds to an active working day (0 = Sun, 1 = Mon, ..., 6 = Sat).
 */
function isDayActive(workingDays, date = new Date()) {
    if (!Array.isArray(workingDays) || workingDays.length === 0)
        return true;
    const dayOfWeek = date.getDay();
    return workingDays.includes(dayOfWeek);
}
exports.isDayActive = isDayActive;
/**
 * Parses "HH:MM" string into hour and minute integers.
 */
function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
        return { hour: 10, minute: 0 };
    }
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    return {
        hour: isNaN(hour) ? 10 : Math.max(0, Math.min(23, hour)),
        minute: isNaN(minute) ? 0 : Math.max(0, Math.min(59, minute)),
    };
}
exports.parseTime = parseTime;
/**
 * Calculates milliseconds from `now` to the next occurrence of `timeStr` (HH:MM).
 */
function getNextAlarmDelayMs(timeStr, now = new Date()) {
    const { hour, minute } = parseTime(timeStr);
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
        // If target time has already passed today, schedule for tomorrow
        target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
}
exports.getNextAlarmDelayMs = getNextAlarmDelayMs;
