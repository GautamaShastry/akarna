chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, _sendResponse) => {
  if (
    typeof message === 'object' && message !== null &&
    'type' in message && (message as { type: unknown }).type === 'open_panel'
  ) {
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      chrome.sidePanel.open({ tabId }).catch(() => {
        // Fallback: the user can click the toolbar action, which opens the panel via setPanelBehavior.
        void chrome.action.setBadgeText({ text: '1', tabId });
        void chrome.action.setBadgeBackgroundColor({ color: '#4f46e5', tabId });
      });
    }
  }
  return false;
});
