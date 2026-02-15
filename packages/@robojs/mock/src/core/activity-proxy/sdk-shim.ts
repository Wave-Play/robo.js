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
// Patches Embedded App SDK inbound origin checks to accept local Stage UI origins.
(function() {
  var _spoofOrigin = 'https://discord.com';

  // Patch inbound postMessage origin checks:
  // The Embedded App SDK only accepts messages from a small allowlist of origins,
  // which normally includes Discord client origins (https://discord.com, etc).
  // Our Stage UI runs on localhost, so we intercept RPC tuples from the parent
  // and re-dispatch them as synthetic MessageEvents with an allowlisted origin.
  function _looksLikeEmbeddedSdkTuple(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    var opcode = data[0];
    var payload = data[1];
    if (typeof opcode !== 'number') return false;
    if (payload == null || typeof payload !== 'object') return false;
    // HANDSHAKE
    if (opcode === 0) return typeof payload.client_id === 'string' && typeof payload.frame_id === 'string';
    // FRAME
    if (opcode === 1) return typeof payload.cmd === 'string';
    // CLOSE
    if (opcode === 2) return typeof payload.code === 'number';
    // HELLO (back-compat)
    if (opcode === 3) return true;
    return false;
  }

  window.addEventListener('message', function(event) {
    try {
      if (event.origin === _spoofOrigin) return; // avoid recursion on synthetic replay
      if (event.source !== window.parent) return;
      if (!_looksLikeEmbeddedSdkTuple(event.data)) return;

      // Prevent the SDK (and any other listeners) from seeing the un-allowlisted origin.
      event.stopImmediatePropagation();

      // Re-dispatch with an allowlisted origin so the SDK accepts it.
      var replay = new MessageEvent('message', {
        data: event.data,
        origin: _spoofOrigin,
        source: window.parent
      });
      window.dispatchEvent(replay);
    } catch(e) {
      // Ignore shim errors
    }
  }, true);
})();
</script>`
}
