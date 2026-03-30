(function (global) {
  var STORAGE_KEYS = {
    token: "pogo.auth.token",
    userId: "pogo.auth.userId"
  };

  function trim(value) {
    return (value || "").toString().trim();
  }

  function getRuntimeConfig() {
    return {
      token: trim(localStorage.getItem(STORAGE_KEYS.token)),
      userId: trim(localStorage.getItem(STORAGE_KEYS.userId))
    };
  }

  function saveSession(session) {
    if (session && session.token) {
      localStorage.setItem(STORAGE_KEYS.token, session.token);
    }
    if (session && session.userId) {
      localStorage.setItem(STORAGE_KEYS.userId, session.userId);
    }
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.userId);
  }

  global.AppConfig = {
    getRuntimeConfig: getRuntimeConfig,
    saveSession: saveSession,
    clearSession: clearSession
  };
})(window);
