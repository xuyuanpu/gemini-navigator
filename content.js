/**
 * Gemini Navigator - 内容脚本 v2.5
 * 为 Gemini 网页版添加对话导航和导出功能
 * 
 * 功能：
 * 1. 对话目录导航
 * 2. 导出对话为 HTML 文档（使用 chrome.downloads API 绕过 CSP 限制）
 */

(function () {
  'use strict';

  // ===== 配置 =====
  const CONFIG = {
    updateInterval: 2000,
    maxTextLength: 60,
  };

  // ===== 状态管理 =====
  let isCollapsed = false;
  let conversations = [];
  let observer = null;
  let isExporting = false;

  // ===== 工具函数 =====

  function showToast(message, duration = 3000) {
    let toast = document.querySelector('.gemini-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'gemini-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  function truncateText(text, maxLength = CONFIG.maxTextLength) {
    if (!text) return '';
    text = text.trim().replace(/\s+/g, ' ');
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  function generateId() {
    return 'gnav-' + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== 对话解析 =====

  function getConversationContainers() {
    let containers = document.querySelectorAll('div.conversation-container');
    if (containers.length > 0) return Array.from(containers);

    const chatHistory = document.querySelector('infinite-scroller.chat-history');
    if (chatHistory && chatHistory.children.length > 0) {
      return Array.from(chatHistory.children);
    }

    return [];
  }

  function extractUserQueryText(container) {
    const queryText = container.querySelector('div.query-text');
    if (queryText) return queryText.textContent.trim();

    const queryContent = container.querySelector('div.query-content');
    if (queryContent) return queryContent.textContent.trim();

    const userQuery = container.querySelector('user-query, .user-query-bubble-with-background');
    if (userQuery) return userQuery.textContent.trim();

    return null;
  }

  function extractUserQueryHTML(container) {
    const queryText = container.querySelector('div.query-text');
    if (queryText) {
      const clone = queryText.cloneNode(true);
      return cleanupHTML(clone).innerHTML;
    }

    const queryContent = container.querySelector('div.query-content');
    if (queryContent) {
      const clone = queryContent.cloneNode(true);
      return cleanupHTML(clone).innerHTML;
    }

    return escapeHtml(extractUserQueryText(container) || '');
  }

  function extractAIResponseHTML(container) {
    const markdown = container.querySelector('div.markdown.markdown-main-panel');
    if (markdown) {
      const clone = markdown.cloneNode(true);
      return cleanupHTML(clone).innerHTML;
    }

    const messageContent = container.querySelector('message-content');
    if (messageContent) {
      const clone = messageContent.cloneNode(true);
      return cleanupHTML(clone).innerHTML;
    }

    return '';
  }

  function cleanupHTML(element) {
    const removeSelectors = [
      'button',
      '[role="button"]',
      '.thoughts-header-button',
      '.thoughts-container',
      '.copy-button',
      '.action-buttons',
      'mat-icon',
      '.code-block-decoration',
      'script',
      'style',
      'svg',
      'img[src*="data:"]',
    ];

    removeSelectors.forEach(selector => {
      element.querySelectorAll(selector).forEach(el => el.remove());
    });

    return element;
  }

  function scanConversations() {
    const newConversations = [];
    const containers = getConversationContainers();

    containers.forEach((container, index) => {
      const userQuery = extractUserQueryText(container);

      if (userQuery && userQuery.length > 5) {
        const id = container.id || generateId();
        if (!container.id) container.id = id;

        newConversations.push({
          id: id,
          index: index + 1,
          text: truncateText(userQuery),
          element: container
        });
      }
    });

    return newConversations;
  }

  // ===== UI 渲染 =====

  function createPanel() {
    if (document.getElementById('gemini-nav-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'gemini-nav-panel';
    panel.innerHTML = `
      <div class="gemini-nav-header">
        <h3>对话目录</h3>
        <div class="gemini-header-btns">
          <button class="gemini-share-btn" title="生成分享链接">分享</button>
          <button class="gemini-export-btn" title="导出为 HTML 文档">导出</button>
        </div>
      </div>
      <div class="gemini-nav-list"></div>
    `;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'gemini-nav-toggle hidden';
    toggleBtn.innerHTML = '📑';
    toggleBtn.title = '显示对话目录';

    document.body.appendChild(panel);
    document.body.appendChild(toggleBtn);

    toggleBtn.addEventListener('click', () => {
      isCollapsed = false;
      panel.classList.remove('collapsed');
      toggleBtn.classList.add('hidden');
    });

    const header = panel.querySelector('.gemini-nav-header h3');
    header.addEventListener('dblclick', () => {
      isCollapsed = true;
      panel.classList.add('collapsed');
      toggleBtn.classList.remove('hidden');
    });

    const exportBtn = panel.querySelector('.gemini-export-btn');
    exportBtn.addEventListener('click', exportDocument);

    const shareBtn = panel.querySelector('.gemini-share-btn');
    shareBtn.addEventListener('click', shareConversation);

    updateNavList();
  }

  function updateNavList() {
    const list = document.querySelector('.gemini-nav-list');
    if (!list) return;

    conversations = scanConversations();

    if (conversations.length === 0) {
      list.innerHTML = `
        <div class="gemini-nav-empty">
          开始对话后，目录会自动生成
        </div>
      `;
      return;
    }

    list.innerHTML = conversations.map(conv => `
      <div class="gemini-nav-item" data-target="${conv.id}">
        <span class="gemini-nav-item-number">${conv.index}</span>
        <span class="gemini-nav-item-text">${escapeHtml(conv.text)}</span>
      </div>
    `).join('');

    list.querySelectorAll('.gemini-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        scrollToConversation(targetId);
        list.querySelectorAll('.gemini-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }

  function scrollToConversation(id) {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      target.style.transition = 'background-color 0.3s ease';
      target.style.backgroundColor = 'rgba(66, 133, 244, 0.15)';
      setTimeout(() => {
        target.style.backgroundColor = '';
      }, 2000);
    }
  }

  // ===== 导出功能 (通过 Background Script) =====

  async function exportDocument() {
    if (isExporting) {
      showToast('正在导出中，请稍候...');
      return;
    }

    isExporting = true;
    showToast('正在收集对话内容...');

    try {
      await delay(100);

      const dialogues = collectStructuredDialogues();

      if (!dialogues || dialogues.length === 0) {
        showToast('未找到对话内容，请确保页面有对话');
        isExporting = false;
        return;
      }

      console.log(`收集到 ${dialogues.length} 轮对话`);

      // 生成 HTML 内容
      const htmlContent = generateExportHTML(dialogues);

      // 创建 Data URL
      // 注意：这里使用 encodeURIComponent 确保特殊字符被正确编码
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);

      const date = new Date().toISOString().slice(0, 10);
      const filename = `Gemini对话_${date}.html`;

      showToast('正在请求下载...');

      // 发送消息给 background script 进行下载
      chrome.runtime.sendMessage({
        action: 'download',
        url: dataUrl,
        filename: filename
      }, (response) => {
        isExporting = false;

        if (chrome.runtime.lastError) {
          console.error('Download message error:', chrome.runtime.lastError);
          showToast('导出失败: 无法连接到扩展后台，请刷新插件');
          return;
        }

        if (response && response.success) {
          showToast('已调起下载，请保存文件');
        } else {
          showToast('导出失败: ' + (response?.error || '未知错误'));
        }
      });

    } catch (error) {
      console.error('导出失败:', error);
      showToast('导出失败: ' + error.message);
      isExporting = false;
    }
  }

  function collectStructuredDialogues() {
    const dialogues = [];
    const containers = getConversationContainers();

    containers.forEach((container, index) => {
      const userQueryHTML = extractUserQueryHTML(container);
      const aiResponseHTML = extractAIResponseHTML(container);

      if (userQueryHTML || aiResponseHTML) {
        dialogues.push({
          index: index + 1,
          userHTML: userQueryHTML || '',
          aiHTML: aiResponseHTML || ''
        });
      }
    });

    return dialogues;
  }

  /**
   * 生成精美的 HTML 文档
   */
  function generateExportHTML(dialogues) {
    const date = new Date().toLocaleString('zh-CN');

    const contentHTML = dialogues.map(d => `
      <div class="dialogue-turn">
        <div class="turn-header">第 ${d.index} 轮对话</div>
        
        ${d.userHTML ? `
        <div class="user-message">
          <div class="message-label">
            <span class="icon">👤</span>
            <span class="role">用户提问</span>
          </div>
          <div class="message-content user-content">${d.userHTML}</div>
        </div>
        ` : ''}
        
        ${d.aiHTML ? `
        <div class="ai-message">
          <div class="message-label">
            <span class="icon">✨</span>
            <span class="role">Gemini 回复</span>
          </div>
          <div class="message-content ai-content markdown-body">${d.aiHTML}</div>
        </div>
        ` : ''}
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini 对话记录 - ${date}</title>
  <style>
    :root {
      --primary-color: #1a73e8;
      --bg-color: #f8f9fa;
      --card-bg: #fff;
      --text-main: #202124;
      --text-secondary: #5f6368;
      --border-color: #dadce0;
      --user-bg: #e8f0fe;
      --user-border: #d2e3fc;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background-color: var(--bg-color);
      color: var(--text-main);
      line-height: 1.6;
    }

    .doc-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .doc-title {
      font-size: 28px;
      font-weight: 600;
      color: var(--primary-color);
      margin: 0 0 10px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .doc-meta {
      color: var(--text-secondary);
      font-size: 14px;
    }

    .action-bar {
      margin-bottom: 20px;
      display: flex;
      justify-content: flex-end;
    }

    .print-btn {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.2s;
    }

    .print-btn:hover {
      background: #f1f3f4;
      color: var(--text-main);
    }

    .dialogue-turn {
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 30px;
      overflow: hidden;
      border: 1px solid var(--border-color);
    }

    .turn-header {
      background: #f8f9fa;
      padding: 10px 20px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .user-message {
      background: var(--user-bg);
      padding: 20px 24px;
      border-bottom: 1px solid var(--user-border);
    }

    .ai-message {
      background: var(--card-bg);
      padding: 20px 24px;
    }

    .message-label {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    
    .user-message .message-label { color: #1967d2; }

    .message-content {
      font-size: 15px;
      word-wrap: break-word;
    }

    /* Markdown Styles */
    .markdown-body h1, .markdown-body h2, .markdown-body h3 { 
      margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.3;
    }
    
    .markdown-body p { margin-bottom: 16px; }
    
    .markdown-body ul, .markdown-body ol { padding-left: 24px; margin-bottom: 16px; }
    .markdown-body li { margin-bottom: 8px; }
    
    .markdown-body blockquote {
      border-left: 4px solid var(--primary-color);
      padding: 12px 20px;
      margin: 16px 0;
      background: #f8f9fa;
      color: #4d5156;
      border-radius: 0 4px 4px 0;
    }
    
    .markdown-body code {
      background: #f1f3f4;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 90%;
      color: #d93025;
    }
    
    .markdown-body pre {
      background: #202124;
      color: #e8eaed;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 16px 0;
    }
    
    .markdown-body pre code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: 13px;
    }

    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      display: block;
      overflow-x: auto;
    }

    .markdown-body th, .markdown-body td {
      padding: 12px;
      border: 1px solid var(--border-color);
      text-align: left;
    }

    .markdown-body th { background: #f8f9fa; font-weight: 600; }
    .markdown-body tr:nth-child(even) { background: #fcfcfc; }
    
    .markdown-body img { max-width: 100%; height: auto; border-radius: 8px; }

    @media print {
      body { background: white; padding: 0; }
      .dialogue-turn { break-inside: avoid; border: 1px solid #ccc; box-shadow: none; margin-bottom: 20px; }
      .action-bar, .gemini-nav-panel { display: none; }
    }
  </style>
</head>
<body>

  <div class="doc-header">
    <h1 class="doc-title">
      <span style="font-size: 32px">✨</span> 
      Gemini 对话记录
    </h1>
    <div class="doc-meta">
      导出时间: ${date} &nbsp; | &nbsp; 共 ${dialogues.length} 轮对话
    </div>
  </div>

  <div class="action-bar">
    <button class="print-btn" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
  </div>

  ${contentHTML}

  <div style="text-align: center; margin-top: 50px; color: #9aa0a6; font-size: 12px;">
    Exported by Gemini Navigator
  </div>

</body>
</html>`;
  }

  // ===== 初始化和监听 =====

  function setupObserver() {
    if (observer) observer.disconnect();

    let debounceTimer = null;
    const debouncedUpdate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateNavList, 500);
    };

    observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some(mutation => {
        if (mutation.target.id === 'gemini-nav-panel' ||
          mutation.target.closest('#gemini-nav-panel')) {
          return false;
        }
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });

      if (hasRelevantChanges) {
        debouncedUpdate();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    console.log('🚀 Gemini Navigator v2.5 已加载');

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(start, 1500);
      });
    } else {
      setTimeout(start, 1500);
    }
  }

  function start() {
    createPanel();
    setupObserver();
    setInterval(updateNavList, CONFIG.updateInterval);
  }

  // ===== 分享功能 =====

  // 分享页面的基础 URL（需要托管 share.html 后替换）
  const SHARE_PAGE_URL = 'https://xuyuanpu.github.io/gemini-navigator/share.html';

  async function shareConversation() {
    if (isExporting) {
      showToast('正在处理中，请稍候...');
      return;
    }

    isExporting = true;
    showToast('正在生成分享链接...');

    try {
      await delay(100);

      const dialogues = collectStructuredDialogues();

      if (!dialogues || dialogues.length === 0) {
        showToast('未找到对话内容');
        isExporting = false;
        return;
      }

      // 构建分享数据
      const shareData = {
        dialogues: dialogues,
        exportTime: new Date().toLocaleString('zh-CN'),
        title: 'Gemini 对话分享'
      };

      // 压缩和编码
      const encoded = compressAndEncode(shareData);

      if (!encoded) {
        showToast('生成链接失败');
        isExporting = false;
        return;
      }

      // 检查 URL 长度
      const shareUrl = `${SHARE_PAGE_URL}#${encoded}`;

      if (shareUrl.length > 8000) {
        showToast('对话内容过长，无法生成分享链接');
        isExporting = false;
        return;
      }

      // 显示分享弹窗
      showShareModal(shareUrl);
      isExporting = false;

    } catch (error) {
      console.error('分享失败:', error);
      showToast('分享失败: ' + error.message);
      isExporting = false;
    }
  }

  function compressAndEncode(data) {
    const jsonStr = JSON.stringify(data);

    // 使用 pako 压缩
    const compressed = pako.deflate(jsonStr);

    // 转为 URL-safe Base64
    let binary = '';
    for (let i = 0; i < compressed.length; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    const base64 = btoa(binary);

    // URL-safe 编码
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function showShareModal(url) {
    // 移除已存在的弹窗
    const existing = document.getElementById('gemini-share-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gemini-share-modal';
    modal.innerHTML = `
      <div class="gemini-modal-overlay"></div>
      <div class="gemini-modal-content">
        <div class="gemini-modal-header">
          <h3>🔗 分享链接已生成</h3>
          <button class="gemini-modal-close">×</button>
        </div>
        <div class="gemini-modal-body">
          <p>复制以下链接分享给朋友：</p>
          <div class="gemini-share-url-box">
            <input type="text" readonly value="${url}" class="gemini-share-url-input">
            <button class="gemini-copy-btn">复制</button>
          </div>
          <p class="gemini-share-tip">💡 链接有效期：永久（无需服务器存储）</p>
        </div>
      </div>
    `;

    // 添加样式
    if (!document.getElementById('gemini-share-modal-style')) {
      const style = document.createElement('style');
      style.id = 'gemini-share-modal-style';
      style.textContent = `
        #gemini-share-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 100001;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .gemini-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
        }
        .gemini-modal-content {
          position: relative;
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        .gemini-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: linear-gradient(135deg, #4285f4 0%, #5e97f6 100%);
          color: white;
        }
        .gemini-modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .gemini-modal-close {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .gemini-modal-body {
          padding: 20px;
        }
        .gemini-modal-body p {
          margin: 0 0 12px 0;
          color: #5f6368;
          font-size: 14px;
        }
        .gemini-share-url-box {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .gemini-share-url-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #dadce0;
          border-radius: 8px;
          font-size: 13px;
          color: #3c4043;
          background: #f8f9fa;
        }
        .gemini-copy-btn {
          padding: 10px 20px;
          background: #4285f4;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        .gemini-copy-btn:hover {
          background: #3367d6;
        }
        .gemini-share-tip {
          color: #9aa0a6 !important;
          font-size: 12px !important;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    // 事件绑定
    modal.querySelector('.gemini-modal-overlay').addEventListener('click', () => modal.remove());
    modal.querySelector('.gemini-modal-close').addEventListener('click', () => modal.remove());

    const copyBtn = modal.querySelector('.gemini-copy-btn');
    const urlInput = modal.querySelector('.gemini-share-url-input');

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = '已复制 ✓';
        copyBtn.style.background = '#34a853';
        setTimeout(() => {
          copyBtn.textContent = '复制';
          copyBtn.style.background = '#4285f4';
        }, 2000);
      } catch (e) {
        urlInput.select();
        document.execCommand('copy');
        copyBtn.textContent = '已复制 ✓';
      }
    });

    // 自动选中链接
    urlInput.addEventListener('click', () => urlInput.select());
  }

  init();

})();
