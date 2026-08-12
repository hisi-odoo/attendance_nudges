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
  "./options.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("./utils/storage.js");
const odoo_client_1 = require("./services/odoo_client.js");
document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settingsForm');
    const inputOdooUrl = document.getElementById('odooUrl');
    const inputCheckInTime = document.getElementById('checkInTime');
    const inputCheckOutTime = document.getElementById('checkOutTime');
    const toggleCheckIn = document.getElementById('checkInEnabled');
    const toggleCheckOut = document.getElementById('checkOutEnabled');
    const selectDefaultSnooze = document.getElementById('defaultSnooze');
    const btnAutoDetect = document.getElementById('btnAutoDetect');
    const btnTestConnection = document.getElementById('btnTestConnection');
    const connectionResult = document.getElementById('connectionResult');
    const toastMessage = document.getElementById('toastMessage');
    const workingDayBoxes = document.querySelectorAll('input[name="workingDay"]');
    // Load existing settings
    const settings = await (0, storage_1.getSettings)();
    inputOdooUrl.value = settings.odooUrl || '';
    inputCheckInTime.value = settings.checkInTime || '10:00';
    inputCheckOutTime.value = settings.checkOutTime || '19:00';
    toggleCheckIn.checked = settings.checkInEnabled !== false;
    toggleCheckOut.checked = settings.checkOutEnabled !== false;
    selectDefaultSnooze.value = String(settings.defaultSnoozeMinutes || 10);
    workingDayBoxes.forEach((checkbox) => {
        const val = parseInt(checkbox.value, 10);
        checkbox.checked = settings.workingDays.includes(val);
    });
    // Auto Detect URL from open browser tabs
    btnAutoDetect.addEventListener('click', async () => {
        btnAutoDetect.textContent = 'Detecting...';
        btnAutoDetect.disabled = true;
        try {
            const detected = await (0, odoo_client_1.detectOdooUrlFromTabs)();
            if (detected) {
                inputOdooUrl.value = detected;
                showConnectionMessage(`Found open Odoo tab: ${detected}`, 'success');
            }
            else {
                showConnectionMessage('No open Odoo tab found. Please make sure your Odoo tab is open.', 'error');
            }
        }
        catch (err) {
            showConnectionMessage(`Tab detection error: ${err.message}`, 'error');
        }
        finally {
            btnAutoDetect.textContent = 'Auto-Detect Open Tab';
            btnAutoDetect.disabled = false;
        }
    });
    // Test Connection
    btnTestConnection.addEventListener('click', async () => {
        const url = (0, odoo_client_1.normalizeUrl)(inputOdooUrl.value);
        if (!url) {
            showConnectionMessage('Please enter an Odoo URL first.', 'error');
            return;
        }
        btnTestConnection.textContent = 'Testing...';
        btnTestConnection.disabled = true;
        try {
            const data = await (0, odoo_client_1.fetchUserAttendanceData)(url);
            if (data.authenticated) {
                showConnectionMessage(`Connected as ${data.name || 'User'} (Status: ${data.attendance_state}).`, 'success');
            }
            else {
                showConnectionMessage(`Connection failed: ${data.error || 'User not logged into Odoo in Chrome.'}`, 'error');
            }
        }
        catch (err) {
            showConnectionMessage(`Error: ${err.message}`, 'error');
        }
        finally {
            btnTestConnection.textContent = 'Test Connection';
            btnTestConnection.disabled = false;
        }
    });
    // Save Settings Form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedDays = [];
        workingDayBoxes.forEach((cb) => {
            if (cb.checked) {
                selectedDays.push(parseInt(cb.value, 10));
            }
        });
        const updatedSettings = {
            odooUrl: (0, odoo_client_1.normalizeUrl)(inputOdooUrl.value),
            checkInTime: inputCheckInTime.value || '10:00',
            checkOutTime: inputCheckOutTime.value || '19:00',
            checkInEnabled: toggleCheckIn.checked,
            checkOutEnabled: toggleCheckOut.checked,
            workingDays: selectedDays,
            defaultSnoozeMinutes: parseInt(selectDefaultSnooze.value, 10),
        };
        await (0, storage_1.saveSettings)(updatedSettings);
        // Notify Service Worker to update Chrome Alarms
        try {
            await chrome.runtime.sendMessage({ action: 'SETTINGS_UPDATED' });
        }
        catch (err) {
            console.log('Background worker not active yet:', err);
        }
        showToast('Settings saved.');
    });
    function showConnectionMessage(msg, type) {
        connectionResult.textContent = msg;
        connectionResult.className = `connection-result ${type}`;
        connectionResult.classList.remove('hidden');
    }
    function showToast(msg) {
        toastMessage.textContent = msg;
        toastMessage.classList.remove('hidden');
        setTimeout(() => {
            toastMessage.classList.add('hidden');
        }, 3000);
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
  require("./options.js");
})();
