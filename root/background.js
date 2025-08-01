// Board API 設定とキャッシュ設定
const BOARD_API_BASE = 'https://api.the-board.jp/v1';
const CACHE_DURATION = 60 * 60 * 1000; // 1時間

let clientCache = null;
let projectCache = null;
let cacheTimestamp = null;

// API認証情報の取得
async function getApiCredentials() {
  const { apiKey = '', apiToken = '' } = await chrome.storage.sync.get(['apiKey', 'apiToken']);
  return { apiKey, apiToken };
}

// APIからデータを取得する共通関数
async function fetchFromBoard(endpoint, pageLimit = 10) {
  const { apiKey, apiToken } = await getApiCredentials();
  if (!apiKey || !apiToken) throw new Error('API認証情報が設定されていません');

  let allData = [];
  let page = 1, hasMore = true;

  while (hasMore && page <= pageLimit) {
    const url = new URL(`${BOARD_API_BASE}/${endpoint}`);
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', '100');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Authorization': `Bearer ${apiToken}`
      }
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    const items = data.clients || data.projects || data.items || data.data || data;

    allData.push(...items);
    hasMore = items.length === 100;
    page++;
  }

  return allData;
}

// 顧客名と案件番号のマッピング作成
async function createClientMapping(clients, projects) {
  const clientById = Object.fromEntries(
    clients.filter(c => c.id && c.name).map(c => [c.id, c.name])
  );
  return Object.fromEntries(
    projects.map(p => [String(p.project_no), clientById[p.client?.id] || p.client?.name || '未登録'])
  );
}

// キャッシュ対応マッピング取得
async function getClientMappingWithCache() {
  if (clientCache && projectCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return createClientMapping(clientCache, projectCache);
  }

  const { clientMapping, lastFetched } = await chrome.storage.local.get(['clientMapping', 'lastFetched']);
  if (clientMapping && lastFetched && Date.now() - lastFetched < CACHE_DURATION) {
    return clientMapping;
  }

  try {
    const [clients, projects] = await Promise.all([
      fetchFromBoard('clients'),
      fetchFromBoard('projects', 20)
    ]);

    clientCache = clients;
    projectCache = projects;
    cacheTimestamp = Date.now();

    const mapping = await createClientMapping(clients, projects);

    await chrome.storage.local.set({ clientMapping: mapping, lastFetched: cacheTimestamp });
    return mapping;
  } catch (error) {
    if (clientMapping) return clientMapping;
    throw error;
  }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === 'getClientMapping') {
        const mapping = await getClientMappingWithCache();
        sendResponse({ success: true, data: mapping });
      } else if (request.action === 'clearCache') {
        clientCache = projectCache = cacheTimestamp = null;
        await chrome.storage.local.remove(['clientMapping', 'lastFetched']);
        sendResponse({ success: true });
      } else if (request.action === 'saveApiCredentials') {
        await chrome.storage.sync.set({ apiKey: request.apiKey, apiToken: request.apiToken });
        clientCache = projectCache = cacheTimestamp = null;
        sendResponse({ success: true });
      } else if (request.action === 'testApi') {
        const { apiKey, apiToken } = await getApiCredentials();
        const testFetch = async (endpoint) => {
          const res = await fetch(`${BOARD_API_BASE}/${endpoint}`, {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'Authorization': `Bearer ${apiToken}`
            }
          });
          return res.ok ? await res.json() : await res.text();
        };
        const result = {
          credentials: { hasApiKey: !!apiKey, hasApiToken: !!apiToken },
          clients: await testFetch('clients'),
          projects: await testFetch('projects')
        };
        sendResponse({ success: true, data: result });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // async
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Board拡張機能がインストールされました');
});