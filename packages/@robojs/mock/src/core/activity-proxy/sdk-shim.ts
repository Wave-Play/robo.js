/**
 * SDK origin compatibility shim.
 * When injected into the Activity HTML (before other scripts load),
 * this patches the Embedded App SDK's origin checks so it accepts
 * the local proxy origin instead of requiring *.discordsays.com.
 *
 * This is OPT-IN only and clearly marked in DevTools.
 */
export function buildSdkShimScript(proxyOrigin: string): string {
	return `
<script data-mock-sdk-shim="true">
// @robojs/mock SDK origin shim (opt-in)
// Patches Embedded App SDK to accept local proxy origin
(function() {
  var _proxyOrigin = ${JSON.stringify(proxyOrigin)};

  // Override document.referrer to the proxy origin
  // so SDK's sourceOrigin detection picks up the correct value
  try {
    Object.defineProperty(document, 'referrer', {
      get: function() { return _proxyOrigin + '/'; },
      configurable: true
    });
  } catch(e) {
    console.warn('[mock-shim] Could not override document.referrer:', e);
  }

  // Patch postMessage to always use '*' as targetOrigin
  // (in case SDK tries to post to a specific Discord origin)
  var _origPostMessage = window.parent.postMessage.bind(window.parent);
  window.parent.postMessage = function(message, targetOrigin, transfer) {
    _origPostMessage(message, '*', transfer);
  };
})();
</script>`
}
