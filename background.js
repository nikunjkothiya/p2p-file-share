if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

browser.action.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL("app.html")
  });
});
