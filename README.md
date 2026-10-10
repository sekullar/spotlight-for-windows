# Spotlight Clone

A macOS Spotlight-style launcher for Windows and macOS, built with Electron. Press a hotkey, type, and open apps, files and folders, run quick calculations, or search the web.

<!-- Add a screenshot: ![Screenshot](docs/screenshot.png) -->
<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/eb37ea3d-c841-4800-b422-3b323d5d8a75" />


[Türkçe README](README.tr.md)

## Features

- **Spotlight look and feel:** a frameless, translucent search bar with a pop-in animation, light and dark themes that follow the system, and acrylic blur on Windows 11 (vibrancy on macOS).
- **System scan on first launch:** the bar appears with a live progress indicator while apps and files are indexed. The index is cached, so later launches are instant, and a rescan runs in the background.
- **What gets indexed:** applications (Start menu and Microsoft Store apps on Windows, `/Applications` on macOS), desktop shortcuts including game launchers, and files in Desktop, Documents, Downloads, Pictures, Music and Videos.
- **Fuzzy search** that ignores accents and case, grouped results (Top Hit, Applications, Folders, Documents, …), real file icons, and ranking that learns from what you open.
- **Calculator:** type `12*8+4` and press Enter to copy the result.
- **Commands:** type `quit` to exit or `rescan` to rebuild the index.
- **Runs in the background** from the system tray, with an optional launch-at-startup setting.
- **Languages:** English and Türkçe, switchable from the tray menu.

## Requirements

- Node.js 18 or newer
- Windows 11 (primary target) or macOS. Windows 10 is untested, and the blur effect needs Windows 11.

## Getting started

```bash
git clone https://github.com/<your-user>/spotlight-clone.git
cd spotlight-clone
npm install
npm start
```

On first launch the bar opens by itself while it scans your system. After that, press **Alt+Space** at any time.

To start the app without a terminal window on Windows, double-click `Spotlight-Launch.vbs`.

### Installation troubleshooting

`npm install` downloads the Electron binary (about 100 MB) after the packages, and it prints nothing while it does. If it hangs or fails:

- **Keep the project out of OneDrive** or any synced folder. Syncing locks files inside `node_modules` and causes `EPERM` errors.
- **Use a mirror** if GitHub downloads are slow or blocked:
  ```bat
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  npm install
  ```
- **Download Electron manually.** Install the packages without the binary, then unpack the release zip yourself:
  ```bat
  set ELECTRON_SKIP_BINARY_DOWNLOAD=1
  npm install
  node -p "require('./node_modules/electron/package.json').version"
  ```
  Download `electron-v<version>-win32-x64.zip` from the [Electron releases](https://github.com/electron/electron/releases), then:
  ```bat
  mkdir node_modules\electron\dist
  tar -xf electron-v<version>-win32-x64.zip -C node_modules\electron\dist
  <nul set /p="electron.exe" > node_modules\electron\path.txt
  ```
- Antivirus real-time scanning can slow the install. Excluding the project folder temporarily helps.

## Usage

| Key | Action |
| --- | --- |
| `Alt+Space` | Show or hide the bar |
| `↑` / `↓` | Move through results |
| `Enter` | Open the selected result |
| `Ctrl+Enter` (`⌘+Enter` on macOS) | Show the item in its folder |
| `Alt+1` … `Alt+9` (`⌥` on macOS) | Open the Nth result |
| `Esc` | Clear the query, then close the bar |

Click the tray icon to toggle the bar. Right-click it for the menu: open, rescan, launch at startup, language, quit.

## Configuration

- **Hotkey:** change `SHORTCUT` at the top of `main.js`. On macOS, disable the system Spotlight shortcut first if you want to use `Command+Space`.
- **Indexed folders:** edit the folder list in `scan()` in `main.js`.
- **Launch at startup:** enabled on first run. Turn it off from the tray menu.
- **Language:** choose it from the tray menu. The choice is stored in the app's user data folder.

### Adding a language

Open `i18n.js`, copy the `en` entry, change the key (for example `de`) and translate the strings. The new language appears in the tray menu automatically.

## Building an installer

```bash
npm run dist
```

The installer is written to `dist/`. Packaging uses [electron-builder](https://www.electron.build/); adjust the `build` section of `package.json` as needed.

## Project layout

```
main.js            Window, tray, indexer, search and IPC
preload.js         Safe bridge between the UI and the main process
i18n.js            UI strings for each language
renderer/          Search bar UI (HTML, CSS, JS)
Spotlight-Launch.vbs   Windows launcher without a console window
```

## Known limitations

- Developed mainly on Windows. macOS support is untested.
- Microsoft Store apps may show a generic icon.
- There is no preview pane, and no email or message search.
- Indexing runs at startup and on demand. It does not watch the file system for changes.

## License

[MIT](LICENSE)
