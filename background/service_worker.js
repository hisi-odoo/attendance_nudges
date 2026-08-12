(function() {
  const modules = {
  "./services/odoo_client.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectOdooUrlFromTabs = exports.extractOdooBaseUrl = exports.toggleAttendance = exports.fetchUserAttendanceData = exports.parseOdooUtcDate = exports.normalizeUrl = void 0;
/**
 * Normalizes Odoo Base URL to origin level (e.g., "https://www.odoo.com/odoo/tasks" -> "https://www.odoo.com")
 */
function normalizeUrl(url) {
    if (!url)
        return '';
    let trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        trimmed = 'http://' + trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        return parsed.origin;
    }
    catch (e) {
        return trimmed.replace(/\/+$/, '');
    }
}
exports.normalizeUrl = normalizeUrl;
/**
 * Parses Odoo's UTC datetime string ("YYYY-MM-DD HH:MM:SS") into a valid JavaScript Date object in local browser timezone.
 */
function parseOdooUtcDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string')
        return null;
    // Convert "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ" so Date constructor correctly interprets UTC timezone
    const isoStr = dateStr.includes('T')
        ? (dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
        : dateStr.replace(' ', 'T') + 'Z';
    const parsed = new Date(isoStr);
    return isNaN(parsed.getTime()) ? null : parsed;
}
exports.parseOdooUtcDate = parseOdooUtcDate;
/**
 * Fetches current user's attendance status from Odoo JSON-RPC endpoint.
 * Tries main controller route (/hr_attendance/attendance_user_data) with origin fallback.
 */
async function fetchUserAttendanceData(baseUrl) {
    var _a;
    const cleanUrl = normalizeUrl(baseUrl);
    if (!cleanUrl) {
        return { authenticated: false, error: 'Odoo URL is not configured' };
    }
    // Generate candidate endpoints (clean origin first, then full URL if different)
    const candidateOrigins = [cleanUrl];
    try {
        const rawOrigin = new URL(baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`).origin;
        if (!candidateOrigins.includes(rawOrigin)) {
            candidateOrigins.push(rawOrigin);
        }
    }
    catch (e) { }
    let lastError = 'Failed to connect to Odoo instance';
    for (const origin of candidateOrigins) {
        const endpoint = `${origin}/hr_attendance/attendance_user_data`;
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'call',
                    params: {},
                    id: Math.floor(Math.random() * 100000),
                }),
            });
            if (!response.ok) {
                lastError = `HTTP ${response.status}: ${response.statusText}`;
                continue;
            }
            const resJson = await response.json();
            if (resJson.error) {
                lastError = ((_a = resJson.error.data) === null || _a === void 0 ? void 0 : _a.message) || resJson.error.message || 'Odoo RPC Error';
                continue;
            }
            const data = resJson.result;
            if (!data || typeof data !== 'object') {
                lastError = 'Invalid response from Odoo server (User might not be logged in)';
                continue;
            }
            if (data.id === undefined || data.attendance_state === undefined) {
                lastError = 'Attendance module unavailable or user missing employee record';
                continue;
            }
            return {
                ...data,
                authenticated: true,
            };
        }
        catch (err) {
            lastError = err.message || 'Network error connecting to Odoo';
        }
    }
    return {
        authenticated: false,
        error: lastError,
    };
}
exports.fetchUserAttendanceData = fetchUserAttendanceData;
/**
 * Performs Check-In or Check-Out for the logged-in Odoo user.
 */
async function toggleAttendance(baseUrl) {
    var _a;
    const cleanUrl = normalizeUrl(baseUrl);
    if (!cleanUrl) {
        return { success: false, error: 'Odoo URL is not configured' };
    }
    const endpoint = `${cleanUrl}/hr_attendance/systray_check_in_out`;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    latitude: false,
                    longitude: false,
                },
                id: Math.floor(Math.random() * 100000),
            }),
        });
        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
        const resJson = await response.json();
        if (resJson.error) {
            return { success: false, error: ((_a = resJson.error.data) === null || _a === void 0 ? void 0 : _a.message) || resJson.error.message || 'RPC Error' };
        }
        const data = resJson.result;
        return {
            success: true,
            data: {
                ...data,
                authenticated: true,
            },
        };
    }
    catch (err) {
        return { success: false, error: err.message || 'Network error while checking in/out' };
    }
}
exports.toggleAttendance = toggleAttendance;
/**
 * Strictly extracts and verifies Odoo Base URL (origin level) from a full page URL.
 * Returns null if the URL is not a genuine Odoo instance.
 */
function extractOdooBaseUrl(fullUrl) {
    if (!fullUrl || typeof fullUrl !== 'string')
        return null;
    try {
        const url = new URL(fullUrl);
        if (!url.protocol.startsWith('http'))
            return null;
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname.toLowerCase();
        // Ignore non-Odoo domains explicitly
        if (hostname.includes('google.com') ||
            hostname.includes('gmail.com') ||
            hostname.includes('github.com') ||
            hostname.includes('youtube.com') ||
            hostname.includes('facebook.com') ||
            hostname.includes('twitter.com') ||
            hostname.includes('stackoverflow.com')) {
            return null;
        }
        // Rule 1: Path starting with /odoo or /web (e.g., https://www.odoo.com/odoo/project/1234/tasks)
        if (pathname.startsWith('/odoo') || pathname.startsWith('/web') || pathname.includes('/hr_attendance')) {
            return url.origin;
        }
        // Rule 2: Subdomain on *.odoo.com (e.g., https://mycompany.odoo.com)
        if (hostname.endsWith('.odoo.com') || hostname === 'odoo.com') {
            return url.origin;
        }
        // Rule 3: Localhost or local network IP running Odoo (e.g., http://localhost:8069)
        if ((hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) && (url.port === '8069' || url.port === '8070' || pathname.includes('odoo'))) {
            return url.origin;
        }
        return null;
    }
    catch (e) {
        return null;
    }
}
exports.extractOdooBaseUrl = extractOdooBaseUrl;
/**
 * Searches ALL open browser tabs across windows to detect a genuine Odoo instance tab.
 */
async function detectOdooUrlFromTabs() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
        return null;
    }
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (!tab.url)
                continue;
            const detectedBase = extractOdooBaseUrl(tab.url);
            if (detectedBase) {
                console.log('[Odoo Attendance] Auto-detected Odoo URL from tab:', tab.url, '->', detectedBase);
                return detectedBase;
            }
        }
    }
    catch (e) {
        console.error('Failed to detect Odoo URL from tabs:', e);
    }
    return null;
}
exports.detectOdooUrlFromTabs = detectOdooUrlFromTabs;

  },
  "./utils/storage.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateState = exports.getState = exports.saveSettings = exports.getSettings = exports.DEFAULT_SETTINGS = void 0;
exports.DEFAULT_SETTINGS = {
    odooUrl: '',
    checkInTime: '10:00',
    checkOutTime: '19:00',
    workingDays: [1, 2, 3, 4, 5],
    checkInEnabled: true,
    checkOutEnabled: true,
    snoozeDurations: [10, 30, 60],
    defaultSnoozeMinutes: 10,
};
/**
 * Gets extension settings from chrome.storage.sync
 */
async function getSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        return exports.DEFAULT_SETTINGS;
    }
    return new Promise((resolve) => {
        chrome.storage.sync.get(exports.DEFAULT_SETTINGS, (items) => {
            resolve(items);
        });
    });
}
exports.getSettings = getSettings;
/**
 * Saves extension settings to chrome.storage.sync
 */
async function saveSettings(settings) {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        await new Promise((resolve) => {
            chrome.storage.sync.set(updated, () => resolve());
        });
    }
    return updated;
}
exports.saveSettings = saveSettings;
/**
 * Gets background runtime state from chrome.storage.local
 */
async function getState() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return {};
    }
    return new Promise((resolve) => {
        chrome.storage.local.get({
            snoozedUntil: null,
            lastAttendanceState: undefined,
            lastEmployeeName: undefined,
            lastHoursToday: undefined,
            lastCheckInTime: undefined,
            lastSyncTime: undefined,
            lastError: null,
        }, (items) => {
            resolve(items);
        });
    });
}
exports.getState = getState;
/**
 * Updates background runtime state in chrome.storage.local
 */
async function updateState(newState) {
    const current = await getState();
    const updated = { ...current, ...newState };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise((resolve) => {
            chrome.storage.local.set(updated, () => resolve());
        });
    }
    return updated;
}
exports.updateState = updateState;

  },
  "./utils/attendance_logic.js": function(module, exports, require) {
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

  },
  "./utils/alarms.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSnooze = exports.scheduleSnooze = exports.setupDailyAlarms = exports.SNOOZE_CHECK_OUT_ALARM_NAME = exports.SNOOZE_CHECK_IN_ALARM_NAME = exports.CHECK_OUT_ALARM_NAME = exports.CHECK_IN_ALARM_NAME = void 0;
const attendance_logic_1 = require("./utils/attendance_logic.js");
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

  },
  "./service_worker.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const odoo_client_1 = require("./services/odoo_client.js");
const storage_1 = require("./utils/storage.js");
const attendance_logic_1 = require("./utils/attendance_logic.js");
const alarms_1 = require("./utils/alarms.js");
const NOTIFICATION_CHECK_IN_ID = 'odoo_notification_check_in';
const NOTIFICATION_CHECK_OUT_ID = 'odoo_notification_check_out';
// 1. Initialization and Extension Lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Odoo Attendance SW] Extension installed/updated:', details.reason);
    const settings = await (0, storage_1.getSettings)();
    // If Odoo URL is empty, try to auto-detect from open active tab
    if (!settings.odooUrl) {
        const detectedUrl = await (0, odoo_client_1.detectOdooUrlFromTabs)();
        if (detectedUrl) {
            await (0, storage_1.saveSettings)({ odooUrl: detectedUrl });
        }
    }
    await (0, alarms_1.setupDailyAlarms)(settings);
    await checkAttendanceNow();
});
chrome.runtime.onStartup.addListener(async () => {
    console.log('[Odoo Attendance SW] System / Chrome startup detected...');
    const settings = await (0, storage_1.getSettings)();
    await (0, alarms_1.setupDailyAlarms)(settings);
    await checkAttendanceNow();
});
/**
 * Performs an immediate attendance status check on startup / system wake.
 * If current time is past check-in time and user has not checked in today, notifies user immediately.
 */
async function checkAttendanceNow() {
    const settings = await (0, storage_1.getSettings)();
    if (!settings.odooUrl)
        return;
    const now = new Date();
    const isWorkingDay = (0, attendance_logic_1.isDayActive)(settings.workingDays, now);
    if (!isWorkingDay)
        return;
    const checkIn = (0, attendance_logic_1.parseTime)(settings.checkInTime || '10:00');
    const checkOut = (0, attendance_logic_1.parseTime)(settings.checkOutTime || '19:00');
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const checkInMinutes = checkIn.hour * 60 + checkIn.minute;
    const checkOutMinutes = checkOut.hour * 60 + checkOut.minute;
    // Only auto-check on startup if we are within working hours (past check-in time)
    if (currentMinutes >= checkInMinutes && currentMinutes < checkOutMinutes) {
        const data = await (0, odoo_client_1.fetchUserAttendanceData)(settings.odooUrl);
        if (data.authenticated && (0, attendance_logic_1.shouldRemindCheckIn)(data, isWorkingDay)) {
            console.log('[Odoo Attendance SW] Startup check: User hasn\'t checked in today. Showing notification.');
            showNotification('check_in', settings.defaultSnoozeMinutes);
        }
    }
}
// 2. Alarm Trigger Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('[Odoo Attendance SW] Alarm fired:', alarm.name);
    const settings = await (0, storage_1.getSettings)();
    if (!settings.odooUrl) {
        console.warn('[Odoo Attendance SW] Odoo URL not configured, skipping alarm check.');
        return;
    }
    const isWorkingDay = (0, attendance_logic_1.isDayActive)(settings.workingDays);
    if (!isWorkingDay) {
        console.log('[Odoo Attendance SW] Today is not a working day. Skipping reminder.');
        return;
    }
    const data = await (0, odoo_client_1.fetchUserAttendanceData)(settings.odooUrl);
    await (0, storage_1.updateState)({
        lastAttendanceState: data.attendance_state,
        lastEmployeeName: data.name,
        lastHoursToday: data.hours_today,
        lastSyncTime: Date.now(),
        lastError: data.error || null,
    });
    if (!data.authenticated) {
        console.warn('[Odoo Attendance SW] Could not authenticate with Odoo:', data.error);
        return;
    }
    // Handle Check-in check
    if (alarm.name === alarms_1.CHECK_IN_ALARM_NAME || alarm.name === alarms_1.SNOOZE_CHECK_IN_ALARM_NAME) {
        if ((0, attendance_logic_1.shouldRemindCheckIn)(data, isWorkingDay)) {
            showNotification('check_in', settings.defaultSnoozeMinutes);
        }
        else {
            console.log('[Odoo Attendance SW] User already checked in/recorded attendance. Suppressing notification.');
            await (0, alarms_1.clearSnooze)('check_in');
            await (0, storage_1.updateState)({ snoozedUntil: null });
        }
    }
    // Handle Check-out check
    if (alarm.name === alarms_1.CHECK_OUT_ALARM_NAME || alarm.name === alarms_1.SNOOZE_CHECK_OUT_ALARM_NAME) {
        if ((0, attendance_logic_1.shouldRemindCheckOut)(data, isWorkingDay)) {
            showNotification('check_out', settings.defaultSnoozeMinutes);
        }
        else {
            console.log('[Odoo Attendance SW] User already checked out. Suppressing notification.');
            await (0, alarms_1.clearSnooze)('check_out');
            await (0, storage_1.updateState)({ snoozedUntil: null });
        }
    }
});
// 3. Helper to display Chrome Notification
function showNotification(type, defaultSnoozeMins) {
    const notifId = type === 'check_in' ? NOTIFICATION_CHECK_IN_ID : NOTIFICATION_CHECK_OUT_ID;
    const title = 'Attendance Nudges';
    const message = type === 'check_in'
        ? "You haven't checked in on Odoo today."
        : "You are still checked in on Odoo.";
    const actionButtonTitle = type === 'check_in' ? 'Check In' : 'Check Out';
    chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: '../assets/icon128.png',
        title,
        message,
        buttons: [
            { title: actionButtonTitle },
            { title: `Snooze ${defaultSnoozeMins}m` },
        ],
        priority: 2,
        requireInteraction: true,
    });
}
// 4. Handle Notification Button Clicks
chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
    const settings = await (0, storage_1.getSettings)();
    const type = notifId === NOTIFICATION_CHECK_IN_ID ? 'check_in' : 'check_out';
    if (buttonIndex === 0) {
        // Button 0: Perform Check-in or Check-out RPC action
        const result = await (0, odoo_client_1.toggleAttendance)(settings.odooUrl);
        if (result.success && result.data) {
            await (0, storage_1.updateState)({
                lastAttendanceState: result.data.attendance_state,
                lastHoursToday: result.data.hours_today,
                lastSyncTime: Date.now(),
                snoozedUntil: null,
            });
            await (0, alarms_1.clearSnooze)(type);
            chrome.notifications.clear(notifId);
        }
        else {
            // RPC failed, open Odoo tab so user can complete action manually
            openOdooTab(settings.odooUrl);
            chrome.notifications.clear(notifId);
        }
    }
    else if (buttonIndex === 1) {
        // Button 1: Snooze
        const snoozeMins = settings.defaultSnoozeMinutes || 10;
        const expiresAt = await (0, alarms_1.scheduleSnooze)(type, snoozeMins);
        await (0, storage_1.updateState)({
            snoozedUntil: { type, expiresAt },
        });
        chrome.notifications.clear(notifId);
        console.log(`[Odoo Attendance SW] Snoozed ${type} reminder for ${snoozeMins} minutes.`);
    }
});
// 5. Handle Notification Main Body Click
chrome.notifications.onClicked.addListener(async (notifId) => {
    const settings = await (0, storage_1.getSettings)();
    openOdooTab(settings.odooUrl);
    chrome.notifications.clear(notifId);
});
// 6. Tab Management Helper
async function openOdooTab(baseUrl) {
    const url = (0, odoo_client_1.normalizeUrl)(baseUrl);
    if (!url)
        return;
    const targetUrl = `${url}/web#action=hr_attendance.hr_attendance_action_my_attendances`;
    try {
        const tabs = await chrome.tabs.query({ url: `${url}/*` });
        if (tabs.length > 0 && tabs[0].id) {
            await chrome.tabs.update(tabs[0].id, { active: true, url: targetUrl });
            if (tabs[0].windowId) {
                await chrome.windows.update(tabs[0].windowId, { focused: true });
            }
        }
        else {
            await chrome.tabs.create({ url: targetUrl });
        }
    }
    catch (err) {
        console.error('[Odoo Attendance SW] Failed to open Odoo tab:', err);
    }
}
// 7. Messaging Interface for Popup & Options UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        const settings = await (0, storage_1.getSettings)();
        if (message.action === 'REFRESH_ATTENDANCE') {
            const data = await (0, odoo_client_1.fetchUserAttendanceData)(settings.odooUrl);
            await (0, storage_1.updateState)({
                lastAttendanceState: data.attendance_state,
                lastEmployeeName: data.name,
                lastHoursToday: data.hours_today,
                lastSyncTime: Date.now(),
                lastError: data.error || null,
            });
            sendResponse({ success: true, data });
        }
        else if (message.action === 'TOGGLE_ATTENDANCE') {
            const result = await (0, odoo_client_1.toggleAttendance)(settings.odooUrl);
            if (result.success && result.data) {
                await (0, alarms_1.clearSnooze)();
                await (0, storage_1.updateState)({
                    lastAttendanceState: result.data.attendance_state,
                    lastHoursToday: result.data.hours_today,
                    lastSyncTime: Date.now(),
                    snoozedUntil: null,
                });
            }
            sendResponse(result);
        }
        else if (message.action === 'SNOOZE') {
            const type = message.type || 'check_in';
            const mins = message.minutes || settings.defaultSnoozeMinutes || 10;
            const expiresAt = await (0, alarms_1.scheduleSnooze)(type, mins);
            await (0, storage_1.updateState)({ snoozedUntil: { type, expiresAt } });
            sendResponse({ success: true, expiresAt });
        }
        else if (message.action === 'SETTINGS_UPDATED') {
            await (0, alarms_1.setupDailyAlarms)(settings);
            sendResponse({ success: true });
        }
    })();
    return true; // Keep sendResponse asynchronous channel open
});

  },
  };
  const cache = {};
  function require(id) {
    if (cache[id]) return cache[id].exports;
    const module = { exports: {} };
    cache[id] = module;
    if (!modules[id]) throw new Error("Module not found: " + id);
    modules[id](module, module.exports, require);
    return module.exports;
  }
  require("./service_worker.js");
})();
