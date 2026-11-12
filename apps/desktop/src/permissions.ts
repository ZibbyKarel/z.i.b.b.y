import { type Session, systemPreferences } from "electron";

/** What the web app legitimately uses: dictation mic, desktop notifications, copy buttons (no clipboard read — the app renders untrusted inbound content). */
const ALLOWED_PERMISSIONS = new Set(["media", "notifications", "clipboard-sanitized-write"]);

/** Pure decision: is `permission` granted to a requester at `requestingUrl`? */
export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  appOrigin: string,
): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  try {
    return new URL(requestingUrl).origin === appOrigin;
  } catch {
    return false;
  }
}

/** True when a `media` request includes the microphone (or does not say — defaults to audio). */
function wantsMicrophone(mediaTypes: readonly string[] | undefined): boolean {
  return !mediaTypes || mediaTypes.length === 0 || mediaTypes.includes("audio");
}

/**
 * Grants microphone (and the few other permissions the app needs) only to the app's
 * own origin; everything else is denied. On macOS the first `media` request also
 * triggers the system microphone prompt (`NSMicrophoneUsageDescription`).
 */
export function installPermissionHandlers(session: Session, appOrigin: string): void {
  session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    // No NSCameraUsageDescription — macOS kills the process on camera access.
    if (permission === "media" && "mediaType" in details && details.mediaType === "video") {
      return false;
    }
    return isPermissionAllowed(permission, requestingOrigin, appOrigin);
  });
  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (!isPermissionAllowed(permission, details.requestingUrl, appOrigin)) return callback(false);
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    if (permission === "media" && mediaTypes?.includes("video")) return callback(false);
    if (permission === "media" && process.platform === "darwin" && wantsMicrophone(mediaTypes)) {
      systemPreferences.askForMediaAccess("microphone").then(callback, () => callback(false));
      return;
    }
    callback(true);
  });
}
