const tabState = new Map();
const updateDebounce = new Map();

function normalizeHits(hits = {}) {
  const items = Array.isArray(hits.items) ? hits.items : [];
  const keywords = Array.isArray(hits.keywords)
    ? hits.keywords
    : [...new Set(items.flatMap(item => item.keywords || []))];

  return {
    keywords,
    items,
    count: Number.isFinite(hits.count) ? hits.count : items.length
  };
}

function clearDebounce(tabId) {
  if (updateDebounce.has(tabId)) {
    clearTimeout(updateDebounce.get(tabId));
    updateDebounce.delete(tabId);
  }
}

function sameItems(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.signature === right[index]?.signature);
}

function updateBadgeNow(tabId, hits) {
  const safeHits = normalizeHits(hits);
  const currentState = tabState.get(tabId);

  if (
    currentState &&
    currentState.count === safeHits.count &&
    sameItems(currentState.items, safeHits.items)
  ) {
    return;
  }

  tabState.set(tabId, safeHits);
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#f03e3e' });
  chrome.action.setBadgeText({
    tabId,
    text: safeHits.count > 0 ? String(safeHits.count) : ''
  });
}

function updateBadge(tabId, hits) {
  clearDebounce(tabId);
  updateDebounce.set(tabId, setTimeout(() => {
    updateDebounce.delete(tabId);
    updateBadgeNow(tabId, hits);
  }, 300));
}

function clearTab(tabId) {
  clearDebounce(tabId);
  tabState.delete(tabId);
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
}

chrome.tabs.onRemoved.addListener(clearTab);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearTab(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SENSITIVE_HITS') {
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') {
      updateBadge(tabId, normalizeHits(message));
    }
    return false;
  }

  if (message?.type === 'GET_HITS') {
    const tabId = message.tabId;
    const state = tabState.get(tabId) || { keywords: [], items: [], count: 0 };
    sendResponse({
      keywords: state.keywords,
      items: state.items,
      count: state.count
    });
    return false;
  }

  return false;
});
