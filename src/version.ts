/**
 * App version shown in Einstellungen → Über Deutschly.
 *
 * - `APP_VERSION` is the store binary version. Keep it equal to `version` in
 *   app.json (it doubles as the EAS `runtimeVersion`).
 * - `OTA_BUILD` counts JS-only updates published with `eas update` on top of
 *   that binary. Bump it by one for every OTA publish; reset it to 0 when
 *   APP_VERSION changes.
 */
export const APP_VERSION = '1.0.10';
export const OTA_BUILD = 2;

/** Human-readable label, e.g. "1.0.10 (OTA 2)". */
export const VERSION_LABEL = OTA_BUILD > 0 ? `${APP_VERSION} (OTA ${OTA_BUILD})` : APP_VERSION;
