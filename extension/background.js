// Background service worker
// Handles actual download requests and communication with backend API

const API_BASE = 'http://localhost:8000'; // Update for production

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
        handleDownload(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async response
    }
});

async function handleDownload({ videoId, format, quality, title }) {
    try {
        // Request download URL from backend
        const response = await fetch(`${API_BASE}/api/download-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId, format, quality })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Server error');
        }

        const data = await response.json();

        if (data.downloadUrl) {
            // Sanitize filename
            const safeTitle = title
                .replace(/[<>:"/\\|?*]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 100);

            const filename = `${safeTitle}.${format}`;

            // Start browser download
            await chrome.downloads.download({
                url: `${API_BASE}${data.downloadUrl}`,
                filename: filename,
                saveAs: false
            });

            return { success: true };
        } else {
            throw new Error('No download URL received');
        }
    } catch (err) {
        console.error('Download error:', err);
        return { success: false, error: err.message };
    }
}

// Handle download state changes
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state) {
        if (delta.state.current === 'complete') {
            console.log('Download completed:', delta.id);
        } else if (delta.state.current === 'interrupted') {
            console.error('Download interrupted:', delta.id);
        }
    }
});
