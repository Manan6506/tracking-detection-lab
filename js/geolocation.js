/**
 * geolocation.js
 * ----------------------------------------------------------------------------
 * A thin, Promise-based wrapper around the Browser Geolocation API
 * (navigator.geolocation.getCurrentPosition).
 *
 * What happens when you call getCurrentPosition():
 *   1. The browser checks the page is a "secure context" (HTTPS or localhost).
 *   2. It checks the saved permission for this site; if none, it shows a prompt.
 *   3. If allowed, the browser asks the operating system / a location service
 *      for an estimate (GPS, Wi-Fi, cell towers, or IP — the page is not told which).
 *   4. It calls our success callback with a GeolocationPosition object,
 *      or our error callback with a GeolocationPositionError.
 *
 * We only ever request ONE reading per click. We deliberately do not use
 * watchPosition(), which would track the device continuously.
 */

// Numeric codes defined by the W3C Geolocation specification.
export const GEO_ERROR = Object.freeze({
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
});

export function isGeolocationSupported() {
  return 'geolocation' in navigator;
}

/**
 * Ask the browser for the current position once.
 * @param {PositionOptions} options  { enableHighAccuracy, timeout, maximumAge }
 * @returns {Promise<GeolocationPosition>}
 */
export function requestBrowserPosition(options) {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({ code: 'UNSUPPORTED', message: 'navigator.geolocation is not available in this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Convert a GeolocationPositionError (or our UNSUPPORTED error) into
 * beginner-friendly text. Returns a title, an explanation, and next steps.
 * @param {{code: number|string, message?: string}} error
 * @param {{ timeoutMs: number, secureContext: boolean }} context
 */
export function explainGeolocationError(error, context) {
  const browserMessage = error && error.message ? error.message : '(no message provided)';

  if (error.code === 'UNSUPPORTED') {
    return {
      title: 'Geolocation is not supported',
      explanation: 'This browser does not provide navigator.geolocation, so the page has no way to ask for your device location.',
      tips: ['Try a current version of Chrome, Safari, Firefox or Edge.', 'You can still use the IP-based estimate or manual coordinates.'],
      browserMessage,
    };
  }

  switch (error.code) {
    case GEO_ERROR.PERMISSION_DENIED: {
      const tips = [];
      if (!context.secureContext) {
        tips.push('This page is NOT a secure context (it is plain HTTP on a non-localhost address). Browsers block geolocation here no matter what you choose. Open it via http://localhost or HTTPS instead.');
      }
      tips.push(
        'If you clicked Block / Don’t Allow: open the site controls next to the address bar, change Location to Allow or Ask (or reset the permission), then click the button again.',
        'If no prompt appeared at all, the decision was probably already saved as “denied”, or your browser is auto-blocking after repeated dismissals. Reset the permission in the browser’s site settings.',
        'On a Mac, also check System Settings → Privacy & Security → Location Services is on for your browser.',
        'A web page cannot reset or override this decision — only you can, in browser settings.'
      );
      return {
        title: 'Permission denied (error code 1)',
        explanation: 'The browser refused to share your location with this page. This happens when you block the prompt, when the block was saved earlier, or when the page is not allowed to ask.',
        tips,
        browserMessage,
      };
    }
    case GEO_ERROR.POSITION_UNAVAILABLE:
      return {
        title: 'Position unavailable (error code 2)',
        explanation: 'Permission was not the problem: the browser tried, but could not work out a position from the signals available.',
        tips: [
          'On a Mac: System Settings → Privacy & Security → Location Services must be on, and enabled for this browser.',
          'Turn Wi-Fi on. MacBooks have no GPS, so they rely mainly on nearby Wi-Fi networks to estimate position.',
          'Check your internet connection — the location lookup usually needs a network location service.',
          'If you set Chrome DevTools → Sensors → Location to “Location unavailable”, this is the expected result.',
        ],
        browserMessage,
      };
    case GEO_ERROR.TIMEOUT:
      return {
        title: 'Timed out (error code 3)',
        explanation: `No position arrived within the ${formatTimeout(context.timeoutMs)} timeout. The timer starts after permission is granted, so this is about how long the device took to find a position.`,
        tips: [
          'Choose a longer timeout and try again.',
          'Turn off “high accuracy” — it can wait for slower signals such as GPS.',
          'Allowing a cached reading (maximum age above 0) can return instantly.',
        ],
        browserMessage,
      };
    default:
      return {
        title: 'Unexpected error',
        explanation: 'The browser reported an error this page does not recognise.',
        tips: ['Try again, or try another browser.'],
        browserMessage,
      };
  }
}

export function formatTimeout(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${ms / 1000} s`;
}
