// AI Sharks entry: /shark/ picks the version. v2 is the default (SHARK_V2 unset or 1); SHARK_V2=0 serves v1.
// Classic script (no module) so it runs before anything renders. Query string is kept (?c=3, ?demo=hero ...).
(function () {
  var q = location.search || '';
  fetch('/api/shark/config').then(function (r) { return r.json(); }).catch(function () { return { v2: true }; }).then(function (c) {
    location.replace((c && ((c.v2 && c.v2ready) || c.safetyMode !== 'live') ? '/shark/v2/' : '/shark/v1/') + q + location.hash);
  });
})();
