(function () {
  if (window.__SENSITIVE_MONITOR__) {
    window.__SENSITIVE_MONITOR__.forceRescan();
    return;
  }

  const state = {
    keywordList: [],
    regexPatterns: [],
    domObserver: null,
    scanDebounceTimer: null,
    lastHitHash: '',
    hitElements: new Map(),
    hitIdSeed: 1,
    highlightTimer: null
  };

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildRegexPatterns() {
    state.regexPatterns = state.keywordList
      .map(item => {
        const word = String(item?.word || '').trim();
        if (!word) return null;

        try {
          const pattern = item.isRegex ? word : escapeRegExp(word);
          return {
            label: item.isRegex ? `/${word}/` : word,
            regex: new RegExp(pattern, 'gi')
          };
        } catch (error) {
          console.warn('无效的敏感信息规则:', word, error);
          return null;
        }
      })
      .filter(Boolean);
  }

  async function initMonitor() {
    const storage = await chrome.storage.local.get(['sensitiveKeywords']);
    state.keywordList = Array.isArray(storage.sensitiveKeywords)
      ? storage.sensitiveKeywords
      : [];
    buildRegexPatterns();
    startWatch();
  }

  function getElementLabel(element) {
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const className = [...element.classList].slice(0, 3).map(name => `.${name}`).join('');
    return `${tagName}${id}${className}`;
  }

  function getElementText(element) {
    const attributes = [...element.attributes]
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(' ');
    const directText = [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim())
      .filter(Boolean)
      .join(' ');
    return `<${element.tagName.toLowerCase()} ${attributes}> ${directText}`.trim();
  }

  function getSnippet(source, keywords) {
    const lowerSource = source.toLowerCase();
    const firstKeyword = keywords.find(keyword => lowerSource.includes(keyword.toLowerCase()));
    const index = firstKeyword ? lowerSource.indexOf(firstKeyword.toLowerCase()) : 0;
    const start = Math.max(0, index - 40);
    const end = Math.min(source.length, index + 90);
    return source.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  function getHitId(element) {
    for (const [hitId, storedElement] of state.hitElements.entries()) {
      if (storedElement === element) return hitId;
    }

    const hitId = `hit-${state.hitIdSeed++}`;
    state.hitElements.set(hitId, element);
    return hitId;
  }

  function reportHits(items) {
    const currentHash = items.map(item => item.signature).join('|');
    if (currentHash === state.lastHitHash) return;
    state.lastHitHash = currentHash;

    chrome.runtime.sendMessage({
      type: 'SENSITIVE_HITS',
      keywords: [...new Set(items.flatMap(item => item.keywords))].sort(),
      items,
      count: items.length
    }).catch(() => {
      // The extension may have been reloaded while this page was still open.
    });
  }

  function scanPage() {
    if (!document.documentElement) return;

    if (state.regexPatterns.length === 0) {
      state.hitElements.clear();
      reportHits([]);
      return;
    }

    const items = [];
    const nextHitElements = new Map();
    const elements = [...document.querySelectorAll('*')];

    for (const element of elements) {
      if (element.closest('[data-sensitive-monitor-ui="true"]')) {
        continue;
      }

      const source = getElementText(element);
      const matchedKeywords = [];

      state.regexPatterns.forEach(({ label, regex }) => {
        regex.lastIndex = 0;
        if (regex.test(source)) {
          matchedKeywords.push(label);
        }
      });

      if (matchedKeywords.length === 0) {
        continue;
      }

      const hitId = getHitId(element);
      nextHitElements.set(hitId, element);

      const label = getElementLabel(element);
      const signature = `${label}|${matchedKeywords.join(',')}|${getSnippet(source, matchedKeywords)}`;
      items.push({
        id: hitId,
        tagName: element.tagName.toLowerCase(),
        label,
        keywords: matchedKeywords,
        snippet: getSnippet(source, matchedKeywords),
        signature
      });
    }

    state.hitElements = nextHitElements;
    reportHits(items);
  }

  function debouncedScan() {
    if (state.scanDebounceTimer) {
      clearTimeout(state.scanDebounceTimer);
    }
    state.scanDebounceTimer = setTimeout(scanPage, 200);
  }

  function startWatch() {
    scanPage();

    if (state.domObserver) {
      state.domObserver.disconnect();
    }

    state.domObserver = new MutationObserver(debouncedScan);
    state.domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  async function forceRescan() {
    state.lastHitHash = '';
    await initMonitor();
    scanPage();
  }

  function removeHighlight() {
    const existing = document.getElementById('__sensitive_monitor_highlight__');
    if (existing) existing.remove();
    if (state.highlightTimer) {
      clearTimeout(state.highlightTimer);
      state.highlightTimer = null;
    }
  }

  function focusHit(hitId) {
    const element = state.hitElements.get(hitId);
    if (!element || !document.contains(element)) {
      scanPage();
      return false;
    }

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });

    setTimeout(() => {
      removeHighlight();
      const rect = element.getBoundingClientRect();
      const highlight = document.createElement('div');
      highlight.id = '__sensitive_monitor_highlight__';
      highlight.dataset.sensitiveMonitorUi = 'true';
      highlight.style.cssText = [
        'position: fixed',
        `left: ${Math.max(0, rect.left)}px`,
        `top: ${Math.max(0, rect.top)}px`,
        `width: ${Math.max(1, rect.width)}px`,
        `height: ${Math.max(1, rect.height)}px`,
        'z-index: 2147483647',
        'pointer-events: none',
        'box-sizing: border-box',
        'border: 3px solid #f03e3e',
        'background: rgba(240, 62, 62, 0.12)',
        'box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.08)'
      ].join(';');
      (document.body || document.documentElement).appendChild(highlight);
      console.log('敏感信息命中元素:', element);
      state.highlightTimer = setTimeout(removeHighlight, 5000);
    }, 350);

    return true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'FORCE_RESCAN') {
      forceRescan()
        .then(() => sendResponse({ ok: true }))
        .catch(error => {
          console.error('重新扫描失败:', error);
          sendResponse({ ok: false, error: String(error?.message || error) });
        });
      return true;
    }

    if (message?.type === 'FOCUS_HIT') {
      sendResponse({ ok: focusHit(message.hitId) });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.sensitiveKeywords) {
      forceRescan();
    }
  });

  window.__SENSITIVE_MONITOR__ = { forceRescan };
  initMonitor();
})();
