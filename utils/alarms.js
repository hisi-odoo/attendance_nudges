"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSnooze = exports.scheduleSnooze = exports.setupDailyAlarms = exports.SNOOZE_CHECK_OUT_ALARM_NAME = exports.SNOOZE_CHECK_IN_ALARM_NAME = exports.CHECK_OUT_ALARM_NAME = exports.CHECK_IN_ALARM_NAME = void 0;
const attendance_logic_1 = require("./attendance_logic");
exports.CHECK_IN_ALARM_NAME = 'odoo_check_in_alarm';
exports.CHECK_OUT_ALARM_NAME = 'odoo_check_out_alarm';
exports.SNOOZE_CHECK_IN_ALARM_NAME = 'odoo_snooze_check_in';
exports.SNOOZE_CHECK_OUT_ALARM_NAME = 'odoo_snooze_check_out';
/**
 * Sets up or updates daily recurring alarms for Check-In and Check-Out.
 */
async function setupDailyAlarms(settings) {
    if (typeof chrome === 'undefined' || !chrome.alarms)
        return;
    // Clear existing primary alarms
    await chrome.alarms.clear(exports.CHECK_IN_ALARM_NAME);
    await chrome.alarms.clear(exports.CHECK_OUT_ALARM_NAME);
    const now = new Date();
    // 1. Setup Check-in Alarm if enabled
    if (settings.checkInEnabled && settings.checkInTime) {
        const delayMs = (0, attendance_logic_1.getNextAlarmDelayMs)(settings.checkInTime, now);
        const when = Date.now() + delayMs;
        chrome.alarms.create(exports.CHECK_IN_ALARM_NAME, {
            when,
            periodInMinutes: 24 * 60, // Repeat daily
        });
    }
    // 2. Setup Check-out Alarm if enabled
    if (settings.checkOutEnabled && settings.checkOutTime) {
        const delayMs = (0, attendance_logic_1.getNextAlarmDelayMs)(settings.checkOutTime, now);
        const when = Date.now() + delayMs;
        chrome.alarms.create(exports.CHECK_OUT_ALARM_NAME, {
            when,
            periodInMinutes: 24 * 60, // Repeat daily
        });
    }
}
exports.setupDailyAlarms = setupDailyAlarms;
/**
 * Schedules a one-time snooze alarm for a given duration in minutes.
 */
async function scheduleSnooze(type, delayMinutes) {
    if (typeof chrome === 'undefined' || !chrome.alarms)
        return Date.now();
    const alarmName = type === 'check_in' ? exports.SNOOZE_CHECK_IN_ALARM_NAME : exports.SNOOZE_CHECK_OUT_ALARM_NAME;
    await chrome.alarms.clear(alarmName);
    const expiresAt = Date.now() + delayMinutes * 60 * 1000;
    chrome.alarms.create(alarmName, {
        delayInMinutes: delayMinutes,
    });
    return expiresAt;
}
exports.scheduleSnooze = scheduleSnooze;
/**
 * Clears snooze alarm.
 */
async function clearSnooze(type) {
    if (typeof chrome === 'undefined' || !chrome.alarms)
        return;
    if (!type || type === 'check_in') {
        await chrome.alarms.clear(exports.SNOOZE_CHECK_IN_ALARM_NAME);
    }
    if (!type || type === 'check_out') {
        await chrome.alarms.clear(exports.SNOOZE_CHECK_OUT_ALARM_NAME);
    }
}
exports.clearSnooze = clearSnooze;
