// Apply the saved theme before first paint (avoids a light/dark flash). Kept external for a strict CSP.
try { var t = localStorage.getItem('gk-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
