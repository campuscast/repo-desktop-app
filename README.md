# CampusCast Desktop Player

Electron-based digital signage player for the CampusCast distributed media CMS.

This is a **PLAYER runtime only** — it does NOT manage content, schedules, zones, or users. Those are managed in the CMS web interface. The player receives published schedules, downloads content, and renders it on one or more displays.

## Architecture

```
┌────────────────────────────────────────────────────┐
│ Electron Main Process                              │
│                                                    │
│  ┌──────────────┐  ┌────────────────────────────┐  │
│  │ Window Mgr   │  │ Services                   │  │
│  │ ─ control    │  │ ─ persistence (JSON/fs)    │  │
│  │ ─ playback[] │  │ ─ backend-client (HTTP)    │  │
│  └──────────────┘  │ ─ mqtt-client (MQTT 5)     │  │
│                    │ ─ heartbeat (telemetry)    │  │
│  ┌──────────────┐  │ ─ content-cache (download) │  │
│  │ Display Mgr  │  └────────────────────────────┘  │
│  │ ─ detection  │                                  │
│  │ ─ topology   │  ┌────────────────────────────┐  │
│  └──────────────┘  │ IPC Handlers               │  │
│                    │ (typed channel contracts)  │  │
│                    └────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│ Preload (contextBridge)                            │
│ Exposes narrow, typed electronAPI to renderer      │
├────────────────────────────────────────────────────┤
│ Renderer (React + Vite)                            │
│                                                    │
│  ┌─────────────────┐  ┌────────────────────────┐   │
│  │ Control Window  │  │ Playback Window(s)     │   │
│  │ ─ Setup         │  │ ─ Schedule evaluator   │   │
│  │ ─ Activation    │  │ ─ Content renderer     │   │
│  │ ─ Diagnostics   │  │ ─ Image / Video        │   │
│  │ ─ Display Select│  │ ─ Fullscreen / kiosk   │   │
│  └─────────────────┘  └────────────────────────┘   │
│                                                    │
│  State: Zustand (app, playback)                    │
│  UI: Tailwind CSS v4 + shadcn/ui + lucide-react    │
└────────────────────────────────────────────────────┘
```

### Security Model

- `contextIsolation: true` — renderer has no direct Node.js access
- `nodeIntegration: false` — no `require()` in renderer
- Preload exposes only explicitly typed IPC methods via `contextBridge`
- Content Security Policy in HTML blocks external scripts
- All backend communication goes through `electron.net` in main process

### Multi-Window Playback

- **Control window**: Settings, diagnostics, display selection
- **Playback window(s)**: One per selected display, fullscreen, frameless
- Both windows load the same React app but with different URL params (`?mode=control` vs `?mode=playback&displayId=X`)
- Playback windows are positioned on specific displays using Electron's `screen` API
- Schedule evaluation runs per-window, synchronized via shared manifest

## Project Structure

```
repo-desktop-app/
├── electron/                    # Main process (Node.js)
│   ├── main/
│   │   ├── index.ts             # App entry, lifecycle
│   │   ├── windows.ts           # Window creation & management
│   │   ├── display-manager.ts   # Display detection & monitoring
│   │   ├── ipc-handlers.ts      # All IPC handler registrations
│   │   └── services/
│   │       ├── persistence.ts   # JSON file persistence
│   │       ├── backend-client.ts# HTTP client (electron.net)
│   │       ├── mqtt-client.ts   # MQTT subscription & events
│   │       ├── heartbeat.ts     # Telemetry reporting timer
│   │       └── content-cache.ts # Content download & cache
│   ├── preload/
│   │   └── index.ts             # contextBridge API
│   └── shared/
│       ├── ipc-channels.ts      # Channel name constants
│       └── ipc-types.ts         # Shared TypeScript types
├── src/                         # Renderer (React)
│   ├── main.tsx                 # React entry
│   ├── App.tsx                  # Root — mode detection + routing
│   ├── globals.css              # Tailwind v4 theme
│   ├── components/
│   │   ├── layout/
│   │   │   └── control-shell.tsx
│   │   └── ui/                  # shadcn/ui components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── checkbox.tsx
│   │       ├── scroll-area.tsx
│   │       ├── separator.tsx
│   │       └── switch.tsx
│   ├── features/
│   │   ├── activation/          # Code-based device activation
│   │   ├── boot/                # Loading/splash screen
│   │   ├── diagnostics/         # Status & sync controls
│   │   ├── displays/            # Display selection
│   │   ├── offline/             # Offline banner
│   │   ├── playback/            # Fullscreen content playback
│   │   └── setup/               # First-run device ID entry
│   ├── hooks/
│   │   ├── use-displays.ts
│   │   └── use-ipc.ts
│   ├── lib/
│   │   └── utils.ts
│   ├── store/
│   │   ├── app-store.ts         # UI state (Zustand)
│   │   └── playback-store.ts    # Schedule/playback state
│   └── types/
│       └── electron.d.ts
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / .node.json / .web.json
└── index.html
```

## Setup & Run

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
cd repo-desktop-app
pnpm install
```

### Development

```bash
pnpm dev
```

Opens the Electron app with HMR for the renderer. Changes to `src/` hot-reload instantly.

### Type Check

```bash
pnpm typecheck
```

### Build

```bash
pnpm build          # Compile only
pnpm package        # Build + create unpacked app
pnpm dist           # Build + create installer
```

## Player Lifecycle

```
1. Boot
   ├── Load persisted config from disk
   ├── Check activation state
   └── Determine starting screen

2. Setup (first run)
   ├── Enter Device ID (from CMS)
   ├── Configure API / MQTT URLs
   └── Save → transition to Activation

3. Activation
   ├── POST /enrollment/request-code → get 6-digit code
   ├── Display code prominently
   ├── Poll GET /enrollment/credentials every 3s
   ├── User enters code in CMS → device activated
   ├── Receive device_token, mqtt_client_id, topic_prefix
   └── Save credentials → transition to Diagnostics

4. Operational
   ├── Connect MQTT (subscribe to releases topic)
   ├── Fetch latest release → download manifest
   ├── Download content assets to local cache
   ├── Start heartbeat/telemetry reporting (30s interval)
   ├── Open playback windows on selected displays
   └── Evaluate schedule every 1s → render active content

5. Offline Recovery
   ├── Detect MQTT disconnect
   ├── Show offline banner in control window
   ├── Continue playback using last-known-good manifest + cached content
   ├── Auto-reconnect with backoff
   └── Re-sync on reconnect
```

## Connecting to CMS Backend

### API Endpoints Used

| Endpoint                   | Method | Auth       | Purpose                 |
| -------------------------- | ------ | ---------- | ----------------------- |
| `/enrollment/request-code` | POST   | None       | Request activation code |
| `/enrollment/credentials`  | GET    | None       | Poll for credentials    |
| `/player/release`          | GET    | Device JWT | Get latest release      |
| `/player/manifest/:id`     | GET    | Device JWT | Get release manifest    |
| `/player/telemetry`        | POST   | Device JWT | Report status           |

### MQTT Topics

| Topic                                      | Direction | Purpose                   |
| ------------------------------------------ | --------- | ------------------------- |
| `zones/{zoneId}/groups/{groupId}/releases` | Subscribe | New release notifications |
| `zones/{zoneId}/groups/{groupId}/updates`  | Subscribe | Config updates            |

### Plugging in Real Backend

1. Update API Base URL in Setup screen or directly in `player-data/config.json`
2. Update MQTT Broker URL similarly
3. All HTTP calls go through `electron/main/services/backend-client.ts`
4. All MQTT handling is in `electron/main/services/mqtt-client.ts`
5. Response types match the proto contracts in `repo-contracts/`

## Persistence

Data is stored in `{userData}/player-data/`:

| File                  | Contents                                                    |
| --------------------- | ----------------------------------------------------------- |
| `config.json`         | Device ID, token, URLs, activation state, selected displays |
| `last-manifest.json`  | Last received release manifest (offline fallback)           |
| `cache-status.json`   | Cache lifecycle/health counters for diagnostics + telemetry  |
| `playback-state.json` | Current playback state (for telemetry)                      |
| `content/`            | Downloaded media files (images, videos)                     |

## Display Management (Windows/Linux/macOS)

- Uses Electron's `screen.getAllDisplays()` to detect connected monitors
- Monitors `display-added`, `display-removed`, `display-metrics-changed` events
- Each display mapped to a `DisplayInfo` with id, resolution, position, scale factor
- User selects target displays in the Display Selection screen
- Playback windows are created per-display at exact screen coordinates
- If a selected display disconnects, the playback window is orphaned and can be reassigned
