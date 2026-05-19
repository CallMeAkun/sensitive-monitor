const keywordsInput = document.getElementById('keywordsInput');
const saveBtn = document.getElementById('saveBtn');
const rescanBtn = document.getElementById('rescanBtn');
const resultBox = document.getElementById('resultBox');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getActiveTab() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return activeTab;
}

function isInjectableUrl(url = '') {
  return /^(https?|file):\/\//i.test(url);
}

async function loadKeywords() {
  const storage = await chrome.storage.local.get(['sensitiveKeywords']);
  const keywords = Array.isArray(storage.sensitiveKeywords)
    ? storage.sensitiveKeywords
    : [];

  keywordsInput.value = keywords
    .map(item => (item.isRegex ? `/${item.word}/` : item.word))
    .join('\n');
}

async function saveKeywords() {
  const lines = keywordsInput.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const keywordList = lines.map(line => {
    if (line.startsWith('/') && line.endsWith('/') && line.length > 1) {
      return { word: line.slice(1, -1), isRegex: true };
    }
    return { word: line, isRegex: false };
  });

  await chrome.storage.local.set({ sensitiveKeywords: keywordList });
  await rescanActiveTab();
  await refreshHits();
  alert('关键字保存成功。');
}

async function rescanActiveTab() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id || !isInjectableUrl(activeTab.url)) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'FORCE_RESCAN' });
    return true;
  } catch (_error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(activeTab.id, { type: 'FORCE_RESCAN' });
      return true;
    } catch (injectError) {
      console.warn('当前页面无法注入扫描脚本:', injectError);
      return false;
    }
  }
}

async function refreshHits() {
  resultBox.innerHTML = '扫描中...';

  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id || !isInjectableUrl(activeTab.url)) {
      resultBox.innerHTML = '<div class="no-hit">此页面不支持扩展扫描</div>';
      return;
    }

    const hits = await chrome.runtime.sendMessage({
      type: 'GET_HITS',
      tabId: activeTab.id
    });

    const items = Array.isArray(hits?.items) ? hits.items : [];

    if (items.length === 0) {
      resultBox.innerHTML = '<div class="no-hit">暂无命中关键字</div>';
      return;
    }

    resultBox.innerHTML = items
      .map((item, index) => `
        <button class="hit-item" data-hit-id="${escapeHtml(item.id)}" type="button">
          <span class="hit-title">${index + 1}. &lt;${escapeHtml(item.tagName)}&gt; ${escapeHtml(item.label)}</span>
          <span class="hit-keywords">规则：${escapeHtml((item.keywords || []).join(', '))}</span>
          <span class="hit-snippet">${escapeHtml(item.snippet || '')}</span>
        </button>
      `)
      .join('');
  } catch (error) {
    resultBox.innerHTML = '<div class="no-hit">请刷新页面后重试</div>';
    console.error('扫描失败:', error);
  }
}

async function focusHit(hitId) {
  const activeTab = await getActiveTab();
  if (!activeTab?.id || !isInjectableUrl(activeTab.url)) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: 'FOCUS_HIT',
      hitId
    });
  } catch (error) {
    console.error('定位命中标签失败:', error);
  }
}

saveBtn.addEventListener('click', saveKeywords);

rescanBtn.addEventListener('click', async () => {
  await rescanActiveTab();
  await refreshHits();
  alert('扫描完成。');
});

resultBox.addEventListener('click', event => {
  const hitItem = event.target.closest('.hit-item');
  if (!hitItem) return;
  focusHit(hitItem.dataset.hitId);
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadKeywords();
  await rescanActiveTab();
  await refreshHits();
});
