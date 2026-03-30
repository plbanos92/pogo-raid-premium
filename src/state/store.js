(function (global) {
  function createStore(initialState) {
    var state = Object.assign({}, initialState);
    var listeners = [];

    function getState() {
      return state;
    }

    function setState(patch) {
      state = Object.assign({}, state, patch);
      listeners.forEach(function (listener) { listener(state); });
    }

    function subscribe(listener) {
      listeners.push(listener);
      return function unsubscribe() {
        listeners = listeners.filter(function (l) { return l !== listener; });
      };
    }

    return {
      getState: getState,
      setState: setState,
      subscribe: subscribe
    };
  }

  global.AppStore = {
    createStore: createStore
  };
})(window);
