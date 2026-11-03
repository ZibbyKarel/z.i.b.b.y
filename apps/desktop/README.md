# ZibbyOS desktop

Electron shell that runs the packaged API and web app as child processes.

## Install

Build (from the repo root):

```bash
pnpm desktop:dist
# = pnpm --filter @zibby/desktop stage:resources && pnpm --filter @zibby/desktop build && pnpm --filter @zibby/desktop dist
```

Artifacts land in `apps/desktop/release/`: `ZibbyOS-<version>-arm64.dmg` and `mac-arm64/ZibbyOS.app`.

1. Open the DMG and drag **ZibbyOS** to **Applications**.
2. The app is ad-hoc signed, not notarized. On first launch right-click the app and choose **Open** (then confirm), or run `xattr -cr /Applications/ZibbyOS.app`.

### Where things live

- Data: `~/Library/Application Support/ZibbyOS/data`
- Vault: `~/AI/Vault`
- Logs: `~/Library/Logs/ZibbyOS/{api,web}.log`
- Source checkout: the repo the app was built from (baked into `Contents/Resources/build-info.json`)

### Ports

The app always starts its own API on **4333** and web on **4000**. The dev servers (`pnpm api:dev` on 3333, `pnpm web:dev` on 3000) can run at the same time. If 4333 or 4000 is taken, the app shows an error and quits. Only one instance owns background work: if a live instance on another port holds `data/.instance.lock`, the app refuses to start until that one is stopped. Start order matters: start ZibbyOS first, then the dev server, which then joins as secondary (a dev server started first takes the lock itself).

Closing the window keeps ZibbyOS running in the Dock; Cmd+Q quits it and stops its servers.
