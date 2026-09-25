   (function () {
     if (typeof chrome === "undefined" || !chrome.tabs) return;
     if (!chrome.tabs.getZoom) {
       chrome.tabs.getZoom = function (tabId, callback) {
         if (typeof tabId === "function") callback = tabId;
         if (typeof callback === "function") callback(1);
         return Promise.resolve(1);
       };
     }
     if (!chrome.tabs.setZoom) {
       chrome.tabs.setZoom = function () {
         var cb = arguments[arguments.length - 1];
         if (typeof cb === "function") cb();
         return Promise.resolve();
       };
     }
   })();