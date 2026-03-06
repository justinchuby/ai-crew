# Mobile PWA

Flightdeck is a Progressive Web App (PWA) that works on mobile devices with native-like features: offline support, install-to-homescreen, and touch-optimized UI.

## Installation

### iOS
1. Open Flightdeck in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

### Android
1. Open Flightdeck in Chrome
2. Tap the install banner (or menu → "Install app")

An in-app install prompt also appears for supported browsers.

## Mobile Layout

On screens under 768px, the layout automatically adapts:

### Bottom Tab Bar
Replaces the sidebar with a 5-tab bottom navigation:

| Tab | Icon | Destination |
|-----|------|-------------|
| Home | 🏠 | Overview dashboard |
| Tasks | 📋 | Task DAG view |
| Agents | 👥 | Agent list |
| Timeline | 📊 | Coordination timeline |
| More | ⋯ | All other routes (sheet menu) |

The tab bar is 56px tall with safe-area padding for devices with home indicators.

### Mobile Pulse
A compact horizontal status bar replacing the full Pulse strip. Shows the same metrics in a scrollable single-line format.

## Swipe-to-Approve

The Mobile Approval Stack presents pending approvals as swipeable cards:

| Gesture | Action |
|---------|--------|
| Swipe right | Approve |
| Swipe left | Reject |
| Swipe up | Skip / defer |

Cards require a 30% swipe threshold before triggering. Haptic feedback (vibration) confirms the action on supported devices.

> [!TIP]
> Swipe actions can be undone immediately after — a brief "Undo" toast appears.

## Mobile Agent Cards

Full-width agent cards display the same information as Canvas nodes:
- Role, name, status
- Current task
- Context usage bar
- Token counts
- Action buttons (message, pause, restart)

Zero information loss compared to the desktop view — just a different layout.

## Mobile Command Sheet

The ⌘K Command Palette adapts to a bottom sheet on mobile:
- Triggered by a floating action button (FAB)
- Slides up from the bottom
- Full NL command support
- Touch-optimized result list

## Offline Support

The PWA caches the app shell (HTML, CSS, JS) for offline access:
- **Cache-first** for static assets (app shell)
- **Network-first** for API calls (data)

When offline, an OfflineBanner appears indicating limited functionality. Previously loaded data remains visible.

## Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| < 768px | Mobile (bottom tabs, cards, sheets) |
| 768–1024px | Tablet (sidebar, adapted panels) |
| > 1024px | Desktop (full layout) |
