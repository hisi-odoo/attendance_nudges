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
