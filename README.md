# Attendance Nudges

A minimal, automated Chrome Extension (Manifest V3) that monitors your Odoo attendance status and reminds you to check in and check out at configured working hours.

---

## Features

- **Morning Check-in Reminder**: Alerts you at your set morning time (default: `10:00 AM`) if you haven't checked in yet.
- **Evening Check-out Reminder**: Alerts you at your set evening time (default: `07:00 PM`) if you are still checked in.
- **Session-Based Authentication**: Uses your existing browser Odoo session cookies. Zero password storage required.
- **Snooze Support**: Postpone reminders by 10m, 30m, or 1h directly from notification buttons or the extension popup.
- **Auto-Suppression**: If you complete check-in/out before snooze expiry or on another device, pending alerts are automatically suppressed.
- **Auto-Detect Odoo Tab**: One-click URL detection from open Odoo browser tabs across windows.
- **Timezone Aware**: Accurately parses Odoo UTC timestamps into your local browser timezone.
- **Minimal Raycast-Style Dark UI**: Clean, non-intrusive interface showing hours worked today, last check-in timestamp, and quick action controls.

---

## Installation

1. Download or clone this repository:
   ```bash
   git clone https://github.com/hisi-odoo/attendance-nudges.git
   ```

2. Load into Google Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select this unzipped / cloned folder directly!

---

## How Odoo Integration Works

The extension makes authenticated JSON-RPC calls directly to Odoo's built-in web endpoints:
- **Status Retrieval**: `POST /hr_attendance/attendance_user_data`
- **Toggle Action**: `POST /hr_attendance/systray_check_in_out`

---

## License

[MIT](LICENSE)
