// Browser shim for chess.js CJS build
// This creates a fake `exports` object so the CJS build can attach to it,
// then exposes Chess as a global.
(function() {
    if (typeof exports === 'undefined') {
        window.exports = {};
    }
})();
