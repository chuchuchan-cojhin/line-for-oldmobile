# [Bug] Extension shows a blank/white screen on Firefox for Android (`chrome.tabs.getZoom is not a function`)

## Summary

On **Firefox for Android**, opening the extension's popup/page (`index.html`) results in a **completely blank white screen**, with no visible error to the end user. The extension installs correctly and the manifest is accepted, but the UI never renders.

This was reproduced on a very old, low-end Android 7 device (repurposed as a "kid's phone"), running a recent Firefox for Android build (tested on 143.0.4), but the root cause is not device-specific — it's a missing WebExtension API on Android.

## Environment

- Extension version: `3.7.0`
- Browser: Firefox for Android 143.0.4
- OS: Android 7 (API 24), low-memory device
- Install method: sideloaded signed `.xpi` (also reproduced via `web-ext run --target=firefox-android`)

## Steps to reproduce

1. Install the extension on Firefox for Android (via the Add-ons page or a signed `.xpi`).
2. Tap the extension in the "Extensions" menu to open its page.
3. Observe: a new tab opens, but the content area stays completely white. No crash, no error banner — just blank.

## Root cause

Using `about:debugging` on desktop Firefox (connected to the Android device over USB) to inspect the extension's page console, the following error appears immediately on load:

```
Uncaught TypeError: chrome.tabs.getZoom is not a function
    at .../static/js/main.js:38
```

The same error also occurs in the sandbox pages (e.g. the file that references `ltsmSandbox.js`), which appears to be involved in initializing the app before it can render anything.

**`chrome.tabs.getZoom` / `chrome.tabs.setZoom` are not implemented in Firefox for Android's WebExtension API surface** (they exist on desktop Firefox and Chrome, but not on Android). Because the code calls this API synchronously and does not guard against it being undefined, the resulting `TypeError` happens early enough in the app's startup sequence that React never mounts anything into `#root` — hence the blank screen with no visible error to the user.

This also explains why the page looks "idle" rather than "loading": the script isn't hung or waiting on a slow network — it throws and stops executing almost immediately.

## Suggested fix

Guard the zoom-related calls so they degrade gracefully when the API is unavailable, e.g.:

```js
function safeGetZoom(tabId, callback) {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.getZoom) {
    return chrome.tabs.getZoom(tabId, callback);
  }
  // Not available on Firefox for Android — assume default zoom.
  if (typeof callback === "function") callback(1);
  return Promise.resolve(1);
}

function safeSetZoom(tabId, zoomFactor, callback) {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.setZoom) {
    return chrome.tabs.setZoom(tabId, zoomFactor, callback);
  }
  if (typeof callback === "function") callback();
  return Promise.resolve();
}
```

...and use these wrappers anywhere `chrome.tabs.getZoom` / `setZoom` are currently called directly (both in the main app bundle and in the sandbox pages).

As a workaround, I confirmed this actually solves the problem: injecting a small polyfill script **before** `main.js` (and before the sandbox scripts) that stubs out `chrome.tabs.getZoom`/`setZoom` with no-op implementations returning a fixed zoom factor of `1` is enough to let the app continue past this point and render normally.

## Additional notes / secondary issues seen (non-blocking)

After applying the workaround above, the extension became fully usable on Firefox for Android — login, two-factor authentication, sending messages, and sync with the official mobile app all worked correctly. Two cosmetic issues remained in the console but did **not** affect functionality:

- Repeated `XML Parsing Error: not well-formed` for requests to `https://ci.line-apps.com/R4?...` (looks like a non-XML/analytics response being parsed as XML somewhere; harmless but noisy).
- A manifest validation warning on Firefox for Android about `permissions` containing `"system.display"`, which isn't a recognized permission value there. This didn't block installation, just logged a warning.

## Why this matters

Firefox for Android is one of the few ways to keep using LINE on older Android devices that can no longer run the official native LINE app (e.g. because of Android version restrictions on the app itself). This extension is likely the main way to do that, so a small compatibility fix here would meaningfully extend the useful life of a lot of older hardware.

Happy to test a patch if useful, or submit a PR with the polyfill wrapper approach above if that's preferred over a fix in the main bundle build.
