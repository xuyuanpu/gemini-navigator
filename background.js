/**
 * Gemini Navigator - Service Worker
 * 处理文件下载等需要高权限的操作
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
        // 使用 chrome.downloads API 下载文件
        // 这可以绕过页面的 CSP 限制，并且可以指定文件名
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: true // 强制弹出"另存为"对话框，确保用户知道文件存在
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('Download failed:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log('Download started, ID:', downloadId);
                sendResponse({ success: true, downloadId: downloadId });
            }
        });

        // 返回 true 表示将异步发送响应
        return true;
    }
});
