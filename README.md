<p align="center">
  <img alt="Attendance Nudges" src="./assets/icon128.png" width="128" height="128"/>
</p>

<h1 align="center">Attendance Nudges</h1>

<p align="center">
  <i>A tiny Chrome extension for people who somehow always forget to check in.</i> 😅
</p>

**Attendance Nudges** is a simple Chrome extension for Odoo that reminds you when it's time to check in or check out. It checks your current attendance status and only nudges you when you actually need it.

No separate login, no password storage -- just use your existing Odoo session and let it do its thing.

## ✨ Features

* **Check-in reminders** : Get a reminder if you haven't checked in by your usual start time.
* **Check-out remindersr** : Get a reminder if you're still checked in when it's time to leave.
* **Snooze it** : Not ready yet? Snooze the reminder for `10m`, `30m`, or `1h`.
* **Knows when you're done** : Already checked in or out? It'll figure that out and leave you alone. 😌
* **Finds your Odoo automatically** : Detects your Odoo URL from an open tab, so you don't have to type it in.
* **Works with your timezone** : Handles Odoo's UTC timestamps and shows everything in your local time.
* **Simple dark UI** : Shows the stuff you actually care about: attendance status, hours worked, and your last check-in.

## 🚀 Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/hisi-odoo/attendance-nudges.git
   ```

2. Open Chrome and go to `chrome://extensions/`.

3. Turn on **Developer mode**.

4. Click **Load unpacked**.

5. Select the cloned `attendance-nudges` folder.

6. That's it. The extension should now show up in Chrome.

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center"> Built with ☕ and the pain of realizing at evening that you never checked in. <br/> <i>One less thing to forget during the workday.</i> </p>
