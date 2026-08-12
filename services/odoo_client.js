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
