// ポップアップのJavaScript

document.addEventListener('DOMContentLoaded', function() {
  // タブ機能
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // タブの切り替え
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // コンテンツの切り替え
      tabContents.forEach(content => {
        if (content.id === `${targetTab}-tab`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
  
  // メイン機能
  const refreshButton = document.getElementById('refreshData');
  const status = document.getElementById('status');
  
  // 設定機能
  const apiKeyInput = document.getElementById('apiKey');
  const apiTokenInput = document.getElementById('apiToken');
  const saveSettingsButton = document.getElementById('saveSettings');
  const testApiButton = document.getElementById('testApi');
  const clearCacheButton = document.getElementById('clearCache');
  
  // キャッシュ情報表示
  updateCacheInfo();
  
  // 保存された設定を読み込み
  chrome.storage.sync.get(['apiKey', 'apiToken'], function(result) {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    if (result.apiToken) {
      apiTokenInput.value = result.apiToken;
    }
  });
  
  // ステータス表示用の関数
  function showStatus(message, isError = false) {
    status.textContent = message;
    status.className = `status ${isError ? 'error' : 'success'}`;
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
  
  // キャッシュ情報を更新
  async function updateCacheInfo() {
    const cacheStatus = document.getElementById('cacheStatus');
    
    try {
      const stored = await chrome.storage.local.get(['clientMapping', 'lastFetched']);
      
      if (stored.clientMapping && stored.lastFetched) {
        const count = Object.keys(stored.clientMapping).length;
        const date = new Date(stored.lastFetched);
        const formattedDate = date.toLocaleString('ja-JP');
        
        cacheStatus.innerHTML = `
          <strong>キャッシュ状態:</strong> 有効<br>
          <strong>顧客数:</strong> ${count}件<br>
          <strong>最終更新:</strong> ${formattedDate}
        `;
      } else {
        cacheStatus.innerHTML = '<strong>キャッシュ状態:</strong> なし';
      }
    } catch (error) {
      cacheStatus.innerHTML = '<strong>キャッシュ状態:</strong> エラー';
    }
  }
  
  // 顧客データ更新ボタン
  refreshButton.addEventListener('click', async () => {
  showLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearCache' });

    if (response.success) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      chrome.tabs.sendMessage(tab.id, { action: 'refreshData' }, () => {
        setTimeout(updateCacheInfo, 1000);
        showStatus('顧客データを更新しました！');
        showLoading(false);
      });
    } else {
      showStatus('更新に失敗しました', true);
      showLoading(false);
    }
  } catch (error) {
    console.error('エラーが発生しました:', error);
    showStatus('エラーが発生しました', true);
    showLoading(false);
  }
});
  
  // API設定保存ボタン
  saveSettingsButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const apiToken = apiTokenInput.value.trim();
    
    if (!apiKey || !apiToken) {
      showStatus('APIキーとトークンを入力してください', true);
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveApiCredentials',
        apiKey: apiKey,
        apiToken: apiToken
      });
      
      if (response.success) {
        showStatus('設定を保存しました！');
      } else {
        showStatus('保存に失敗しました', true);
      }
    } catch (error) {
      console.error('エラーが発生しました:', error);
      showStatus('エラーが発生しました', true);
    }
  });
  
  // API接続テストボタン
  testApiButton.addEventListener('click', async () => {
    try {
      showStatus('API接続をテスト中...');
      const response = await chrome.runtime.sendMessage({ action: 'testApi' });
      
      if (response.success) {
        console.log('APIテスト結果:', response.data);
        
        let message = 'APIテスト結果:\n';
        const data = response.data;
        
        // 顧客APIの結果
        if (data.endpoints.clients) {
          const client = data.endpoints.clients;
          message += `\n顧客API: ${client.ok ? '✓ 成功' : '✗ 失敗'} (${client.status})`;
          if (!client.ok && client.error) {
            message += `\nエラー: ${client.error.substring(0, 50)}...`;
          }
        }
        
        // 案件APIの結果
        if (data.endpoints.projects) {
          const project = data.endpoints.projects;
          message += `\n案件API: ${project.ok ? '✓ 成功' : '✗ 失敗'} (${project.status})`;
          if (!project.ok && project.error) {
            message += `\nエラー: ${project.error.substring(0, 50)}...`;
          }
        }
        
        alert(message);
        
        if (data.endpoints.clients?.ok || data.endpoints.projects?.ok) {
          showStatus('API接続成功！');
        } else {
          showStatus('API接続に失敗しました', true);
        }
      } else {
        showStatus(`テスト失敗: ${response.error}`, true);
      }
    } catch (error) {
      console.error('APIテストエラー:', error);
      showStatus('テストエラーが発生しました', true);
    }
  });
  
  // キャッシュクリアボタン
  clearCacheButton.addEventListener('click', async () => {
    if (!confirm('キャッシュをクリアしますか？')) {
      return;
    }
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearCache' });
      
      if (response.success) {
        updateCacheInfo();
        showStatus('キャッシュをクリアしました');
      } else {
        showStatus('クリアに失敗しました', true);
      }
    } catch (error) {
      console.error('エラーが発生しました:', error);
      showStatus('エラーが発生しました', true);
    }
  });

  // ローディングの表示/非表示
  function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
  }
});