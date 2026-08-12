(function() {
  const modules = {
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
  "./popup.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("./utils/storage.js");
const odoo_client_1 = require("./services/odoo_client.js");
document.addEventListener('DOMContentLoaded', async () => {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusBadge = document.getElementById('statusBadge');
    const employeeName = document.getElementById('employeeName');
    const hoursToday = document.getElementById('hoursToday');
    const lastActionTime = document.getElementById('lastActionTime');
    const errorMessage = document.getElementById('errorMessage');
    const btnToggle = document.getElementById('btnToggleAttendance');
    const toggleText = document.getElementById('toggleText');
    const toggleSpinner = document.getElementById('toggleSpinner');
    const btnOptions = document.getElementById('btnOptions');
    const btnOpenOdoo = document.getElementById('btnOpenOdoo');
    const btnRefresh = document.getElementById('btnRefresh');
    const snoozeStatus = document.getElementById('snoozeStatus');
    const snoozeBtns = document.querySelectorAll('.snooze-btn');
    let currentSettings = await (0, storage_1.getSettings)();
    let currentState = await (0, storage_1.getState)();
    updateSnoozeUI();
    // Load initial attendance data
    await refreshAttendanceData();
    // Refresh button
    btnRefresh.addEventListener('click', async () => {
        await refreshAttendanceData();
    });
    // Settings button
    btnOptions.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        }
        else {
            window.open(chrome.runtime.getURL('options/options.html'));
        }
    });
    // Open Odoo tab
    btnOpenOdoo.addEventListener('click', () => {
        if (currentSettings.odooUrl) {
            chrome.tabs.create({ url: `${currentSettings.odooUrl}/web#action=hr_attendance.hr_attendance_action_my_attendances` });
        }
        else {
            chrome.runtime.openOptionsPage();
        }
    });
    // Toggle Check In / Check Out
    btnToggle.addEventListener('click', async () => {
        setLoadingState(true);
        errorMessage.classList.add('hidden');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'TOGGLE_ATTENDANCE' });
            if (response && response.success && response.data) {
                renderAttendanceData(response.data);
            }
            else {
                showError((response === null || response === void 0 ? void 0 : response.error) || 'Failed to update attendance state.');
            }
        }
        catch (err) {
            showError(err.message || 'Error communicating with background worker.');
        }
        finally {
            setLoadingState(false);
        }
    });
    // Snooze pill buttons
    snoozeBtns.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const target = e.currentTarget;
            const mins = parseInt(target.dataset.mins || '10', 10);
            const isCheckedIn = statusIndicator.classList.contains('checked-in');
            const type = isCheckedIn ? 'check_out' : 'check_in';
            try {
                const res = await chrome.runtime.sendMessage({ action: 'SNOOZE', type, minutes: mins });
                if (res && res.success) {
                    const expiresDate = new Date(res.expiresAt);
                    const timeString = expiresDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    snoozeStatus.textContent = `Snoozed until ${timeString}`;
                    snoozeStatus.classList.remove('hidden');
                }
            }
            catch (err) {
                console.error('Failed to set snooze:', err);
            }
        });
    });
    async function refreshAttendanceData() {
        var _a;
        setLoadingState(true);
        errorMessage.classList.add('hidden');
        currentSettings = await (0, storage_1.getSettings)();
        if (!currentSettings.odooUrl) {
            showError('Odoo URL not configured.');
            statusBadge.textContent = 'Setup Needed';
            statusIndicator.className = 'status-indicator disconnected';
            employeeName.textContent = 'Configure Odoo URL';
            btnToggle.disabled = true;
            setLoadingState(false);
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'REFRESH_ATTENDANCE' });
            if (response && response.success && response.data) {
                renderAttendanceData(response.data);
            }
            else {
                showError(((_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.error) || (response === null || response === void 0 ? void 0 : response.error) || 'Could not fetch attendance status.');
                statusBadge.textContent = 'Offline';
                statusIndicator.className = 'status-indicator disconnected';
                btnToggle.disabled = true;
            }
        }
        catch (err) {
            showError(err.message || 'Background worker error.');
            statusBadge.textContent = 'Offline';
            statusIndicator.className = 'status-indicator disconnected';
            btnToggle.disabled = true;
        }
        finally {
            setLoadingState(false);
        }
    }
    function renderAttendanceData(data) {
        if (!data || !data.authenticated) {
            showError((data === null || data === void 0 ? void 0 : data.error) || 'Please log into Odoo in Chrome.');
            statusBadge.textContent = 'Logged Out';
            statusIndicator.className = 'status-indicator disconnected';
            employeeName.textContent = 'Not Authenticated';
            btnToggle.disabled = true;
            return;
        }
        employeeName.textContent = data.name || 'User';
        const isCheckedIn = data.attendance_state === 'checked_in';
        if (isCheckedIn) {
            statusBadge.textContent = 'Checked In';
            statusIndicator.className = 'status-indicator checked-in';
            toggleText.textContent = 'Check Out';
            btnToggle.className = 'btn primary-btn check-out';
        }
        else {
            statusBadge.textContent = 'Checked Out';
            statusIndicator.className = 'status-indicator checked-out';
            toggleText.textContent = 'Check In';
            btnToggle.className = 'btn primary-btn';
        }
        btnToggle.disabled = false;
        hoursToday.textContent = `${(data.hours_today || 0).toFixed(1)}h`;
        if (data.last_check_in) {
            const parsedDate = (0, odoo_client_1.parseOdooUtcDate)(data.last_check_in);
            lastActionTime.textContent = parsedDate
                ? parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--:--';
        }
        else {
            lastActionTime.textContent = '--:--';
        }
    }
    function updateSnoozeUI() {
        if (currentState.snoozedUntil && currentState.snoozedUntil.expiresAt > Date.now()) {
            const expiresDate = new Date(currentState.snoozedUntil.expiresAt);
            const timeString = expiresDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            snoozeStatus.textContent = `Snoozed until ${timeString}`;
            snoozeStatus.classList.remove('hidden');
        }
        else {
            snoozeStatus.classList.add('hidden');
        }
    }
    function setLoadingState(loading) {
        if (loading) {
            toggleSpinner.classList.remove('hidden');
        }
        else {
            toggleSpinner.classList.add('hidden');
        }
    }
    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
    }
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
  require("./popup.js");
})();
