// 导入配置
// 注意：在 Manifest V3 service worker 中，我们可以使用 importScripts
importScripts('config.js', 'lib/crypto-js.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true;
    }

    if (request.action === 'uploadToCOS') {
        uploadToCOS(request.data, request.filename)
            .then(url => sendResponse({ success: true, url: url }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

/**
 * 上传文件到腾讯云 COS
 */
async function uploadToCOS(data, filename) {
    const { SecretId, SecretKey, Bucket, Region } = COS_CONFIG;
    const host = `${Bucket}.cos.${Region}.myqcloud.com`;
    const key = `shares/${filename}`;
    const url = `https://${host}/${key}`;
    const method = 'PUT';

    // 生成签名
    const signature = getCOSSignature(method, `/${key}`, SecretId, SecretKey, host);

    const response = await fetch(url, {
        method: method,
        headers: {
            'Authorization': signature,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`COS 上传失败: ${response.status} ${errorText}`);
    }

    return url;
}

/**
 * 腾讯云 COS 签名算法 (简化版)
 * 详情参考: https://cloud.tencent.com/document/product/436/7778
 */
function getCOSSignature(method, pathname, secretId, secretKey, host) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // 1小时过期
    const keyTime = `${now};${exp}`;

    const signKey = CryptoJS.HmacSHA1(keyTime, secretKey).toString();

    const lowerMethod = method.toLowerCase();
    const httpString = `${lowerMethod}\n${pathname}\n\nhost=${host}\n`;
    const sha1HttpString = CryptoJS.SHA1(httpString).toString();

    const stringToSign = `sha1\n${keyTime}\n${sha1HttpString}\n`;
    const signature = CryptoJS.HmacSHA1(stringToSign, signKey).toString();

    return `q-sign-algorithm=sha1&q-ak=${secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;
}
