// Content script - runs on YouTube pages
// Extracts video information from the page

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getVideoInfo') {
        const info = extractVideoInfo();
        sendResponse(info);
    }
    return true;
});

function extractVideoInfo() {
    try {
        // Get video title
        const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')
            || document.querySelector('h1.ytd-watch-metadata yt-formatted-string')
            || document.querySelector('h1.title');

        const title = titleElement?.textContent?.trim() || document.title.replace(' - YouTube', '');

        // Get channel name
        const channelElement = document.querySelector('#channel-name a')
            || document.querySelector('ytd-channel-name a')
            || document.querySelector('.ytd-video-owner-renderer #text a');

        const channel = channelElement?.textContent?.trim() || '';

        // Get duration
        const durationElement = document.querySelector('.ytp-time-duration');
        const duration = durationElement?.textContent?.trim() || '';

        // Get video ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');

        // Get thumbnail
        const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '';

        return {
            success: true,
            title,
            channel,
            duration,
            thumbnail,
            videoId
        };
    } catch (err) {
        console.error('Error extracting video info:', err);
        return { success: false, error: err.message };
    }
}

// Also inject when navigating within YouTube (SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        // URL changed, video info might be different now
    }
}).observe(document, { subtree: true, childList: true });
