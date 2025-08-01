// 顧客名マッピング（APIから取得したデータを格納）
let clientMapping = {};

// APIから顧客マッピングを初期化
async function initializeClientMapping() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getClientMapping' }, (response) => {
      if (response && response.success) {
        clientMapping = response.data;
        console.log('顧客データを取得しました。件数:', Object.keys(clientMapping).length);
      } else {
        console.error('顧客データ取得エラー:', response?.error || 'Unknown error');
        clientMapping = {};
      }
      resolve();
    });
  });
}

// ページ遷移を検知してデータを再初期化
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    initializeClientMapping().then(() => {
      startObserver();
      setTimeout(() => {
        addClientNameColumn();
      }, 1000);
    });
  }
});
urlObserver.observe(document, { subtree: true, childList: true });

// ポップアップからのメッセージを受信
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'refreshData') {
    console.log('[拡張機能] 顧客データを更新リクエスト受信');
    
    // キャッシュをクリア（明示的に）
    clientMapping = {};
    
    initializeClientMapping().then(() => {
      console.log('[拡張機能] 顧客データを再取得完了');
      addClientNameColumn();
      sendResponse({ success: true });
    }).catch(err => {
      console.error('[拡張機能] 顧客データ再取得エラー:', err);
      sendResponse({ success: false, error: err.message });
    });

    return true; // 非同期レスポンス
  }
});

function removeClientNameColumns() {
  document.querySelectorAll('.addon-client-header, .addon-client-cell').forEach(el => el.remove());
}

async function addClientNameColumn() {
  if (!clientMapping || Object.keys(clientMapping).length === 0) {
    await initializeClientMapping();
    if (!clientMapping || Object.keys(clientMapping).length === 0) return;
  }

  const modal = document.querySelector('#report_details_dialog');
  if (!modal) return;

  let table = modal.querySelector('.tab-pane.active table.table-striped') || modal.querySelector('table.table-striped');
  if (!table) return;

  const headerRow = table.querySelector('thead tr');
  if (!headerRow) return;

  const headers = Array.from(headerRow.querySelectorAll('th'));
  const hasCostDescription = headers.some(th => th.textContent.trim() === '費用の説明');

  if (!hasCostDescription) {
    removeClientNameColumns();
    return;
  }

  if (headerRow.querySelector('.addon-client-header')) return;

  let projectNameHeaderIndex = -1;
  let costDescriptionHeaderIndex = -1;

  headers.forEach((th, index) => {
    const text = th.textContent.trim();
    if (text === '案件名') projectNameHeaderIndex = index;
    if (text === '費用の説明') costDescriptionHeaderIndex = index;
  });

  if (projectNameHeaderIndex >= 0 && costDescriptionHeaderIndex === projectNameHeaderIndex + 1) {
    const projectNameHeader = headers[projectNameHeaderIndex];

    const clientHeader = document.createElement('th');
    clientHeader.className = 'addon-client-header';
    clientHeader.setAttribute('nowrap', '');
    clientHeader.textContent = '顧客名';
    // clientHeader.style.cssText = 'background-color: #f8f9fa; border-left: 3px solid #007bff; font-weight: bold; color: #007bff;';

    projectNameHeader.insertAdjacentElement('afterend', clientHeader);

    const dataRows = table.querySelectorAll('tbody tr');
    dataRows.forEach(row => {
      if (row.querySelector('.addon-client-cell')) return;

      const cells = row.children;
      if (cells.length > projectNameHeaderIndex + 1) {
        const noCell = cells[0];
        const projectNameCell = cells[projectNameHeaderIndex];

        if (noCell && projectNameCell) {
          const projectNo = noCell.textContent.trim();
          const clientName = clientMapping[projectNo] || '未登録';

          const clientCell = document.createElement('td');
          clientCell.className = 'addon-client-cell';
          clientCell.textContent = clientName;
          // clientCell.style.cssText = 'background-color: #f8f9fa; border-left: 3px solid #007bff; font-style: italic; color: #495057;';

          projectNameCell.insertAdjacentElement('afterend', clientCell);
        }
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await initializeClientMapping();
    addClientNameColumn();
  });
} else {
  initializeClientMapping().then(() => addClientNameColumn());
}

window.addEventListener('focus', async () => {
  if (!clientMapping || Object.keys(clientMapping).length === 0) {
    await initializeClientMapping();
  }
  setTimeout(() => {
    const modal = document.querySelector('#report_details_dialog');
    if (modal) {
      addClientNameColumn();
    }
  }, 500);
});

document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && (!clientMapping || Object.keys(clientMapping).length === 0)) {
    await initializeClientMapping();
  }
});

let observer = null;

function attachCostTabClickEvent(modal) {
  const tabLink = modal.querySelector('.nav-tabs a[aria-controls="report_details_project_costs"]');
  if (tabLink && !tabLink.dataset.addonListenerAttached) {
    tabLink.addEventListener('click', () => {
      console.log('原価タブがクリックされたよ！（モーダル出現監視）');
    });
    tabLink.dataset.addonListenerAttached = 'true';
  }
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(async (mutations) => {
    let shouldRunTable = false;

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.id === 'report_details_dialog' || node.querySelector?.('#report_details_dialog')) {
              shouldRunTable = true;
              const modal = document.querySelector('#report_details_dialog');
              if (modal) attachCostTabClickEvent(modal);
            }
            if (node.classList?.contains('tab-pane') || node.classList?.contains('active') || node.querySelector?.('.table-striped')) {
              shouldRunTable = true;
            }
          }
        });
      }
      if (mutation.type === 'attributes' && mutation.attributeName === 'class' && mutation.target.classList?.contains('tab-pane')) {
        shouldRunTable = true;
      }
    });

    if (shouldRunTable) {
      if (!clientMapping || Object.keys(clientMapping).length === 0) {
        await initializeClientMapping();
      }

      let retryCount = 0;
      const tryAddColumn = () => {
        addClientNameColumn().then(() => {
          const modal = document.querySelector('#report_details_dialog');
          const hasClientColumn = modal?.querySelector('.addon-client-header');

          if (!hasClientColumn && retryCount < 5) {
            retryCount++;
            setTimeout(tryAddColumn, 500);
          }
        });
      };
      setTimeout(tryAddColumn, 300);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

startObserver();