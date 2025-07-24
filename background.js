// Import the utils script so we can use its functions
importScripts('utils.js');

console.log("Background script (v5 - with Auth & Logging) loaded.");

/**
 * Handles opening a tab, waiting for it to load, and closing it.
 * It now calls a `sendResponse` callback to signal completion.
 * @param {string} url The URL to open.
 * @param {object} sender The sender object from the content script message.
 * @param {function} sendResponse The callback function to signal completion.
 */
const openWaitAndCloseTab = (url, sender, sendResponse) => {
  let newTab;
  chrome.tabs.create({
    url: url,
    index: sender.tab.index + 1,
    active: true
  }).then(tab => {
    newTab = tab;
    console.log(`Opened new tab #${newTab.id}`);
  }).catch(error => {
    console.error(`Error creating tab:`, error);
    sendResponse({ status: "error", message: error.message });
  });

  const listener = (tabId, changeInfo) => {
    if (tabId === newTab.id && changeInfo.status === 'complete') {
      console.log(`Tab #${tabId} has finished loading.`);
      setTimeout(() => {
        chrome.tabs.remove(tabId).then(() => {
          console.log(`Automatically closed tab #${tabId}.`);
        }).catch(e => {
          console.warn(`Could not remove tab #${tabId}. It might have been closed already.`, e);
        }).finally(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          console.log("Sending completion signal back to content script.");
          sendResponse({ status: "success" });
        });
      }, 2000); // 2-second viewing time
    }
  };

  chrome.tabs.onUpdated.addListener(listener);
};

/**
 * Handles logging a statistic to the API.
 * @param {string} sender The sender name to log.
 */
const handleLogging = async (access_token,mysender,email, sender, sendResponse) => {
  if (access_token) {
    console.log(`Logging stat for sender: ${mysender}`);
    const success = await logStat(access_token, mysender,email);
    if (success) {
      console.log("Stat logged successfully.");
      sendResponse({ status: "success" });
    } else {
      sendResponse({ status: "error" });
      console.error("Failed to log stat to API.");
    }
  } else {
    sendResponse({ status: "error"});
    console.error("Cannot log stat: No access token found.");
  }
};


// --- MAIN MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openAndWait" && message.url) {
    openWaitAndCloseTab(message.url, sender, sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.action === "logger") {
    handleLogging(message.access_token ,message.sender, message.email, sender, sendResponse)
    return true;
  }
});
