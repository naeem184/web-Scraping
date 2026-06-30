// ============================================
// DOM REFERENCES
// ============================================
const urlInput = document.getElementById('urlInput');
const urlCount = document.getElementById('urlCount');
const clearUrlsBtn = document.getElementById('clearUrlsBtn');
const sampleUrlsBtn = document.getElementById('sampleUrlsBtn');
const extractBtn = document.getElementById('extractBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearResultsBtn = document.getElementById('clearResultsBtn');
const resultsBody = document.getElementById('resultsBody');
const resultsArea = document.getElementById('resultsArea');
const resultCount = document.getElementById('resultCount');
const progressArea = document.getElementById('progressArea');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

// ============================================
// STATE
// ============================================
let extractedData = [];
let isExtracting = false;
let cancelled = false;

// ============================================
// CORS PROXIES (Multiple Fallbacks)
// ============================================
const CORS_PROXIES = [
    // Primary - Most reliable
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    // Backup 1
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    // Backup 2
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    // Backup 3 - Using a different proxy
    (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
    // Backup 4 - Using cors-anywhere
    (url) => `https://cors-anywhere.herokuapp.com/${url}`
];

// ============================================
// URL COUNTER
// ============================================
urlInput.addEventListener('input', () => {
    const urls = getUrls();
    urlCount.textContent = `${urls.length} URLs added`;
});

function getUrls() {
    return urlInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.startsWith('http'));
}

// ============================================
// SAMPLE URLs
// ============================================
sampleUrlsBtn.addEventListener('click', () => {
    const samples = [
        'https://medium.com',
        'https://www.techcrunch.com',
        'https://www.theverge.com',
        'https://mashable.com',
        'https://www.wired.com',
        'https://gizmodo.com',
        'https://www.engadget.com',
        'https://thenextweb.com',
        'https://techmeme.com',
        'https://www.cnet.com'
    ];
    urlInput.value = samples.join('\n');
    urlInput.dispatchEvent(new Event('input'));
});

// ============================================
// CLEAR URLs
// ============================================
clearUrlsBtn.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.dispatchEvent(new Event('input'));
});

// ============================================
// EXTRACT DATA - WITH RETRY AND DELAY
// ============================================
extractBtn.addEventListener('click', async () => {
    const urls = getUrls();
    
    if (urls.length === 0) {
        alert('Please add at least one valid URL');
        return;
    }
    
    if (isExtracting) return;
    isExtracting = true;
    cancelled = false;
    extractBtn.disabled = true;
    downloadBtn.disabled = true;
    
    progressArea.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = `Processing 0/${urls.length}...`;
    
    loadingOverlay.style.display = 'flex';
    loadingText.textContent = `Extracting data from ${urls.length} websites...`;
    
    extractedData = [];
    resultsBody.innerHTML = '';
    
    const results = [];
    let completed = 0;
    const total = urls.length;
    const startTime = Date.now();
    
    // Process one by one with delay (to avoid rate limiting)
    for (let i = 0; i < urls.length; i++) {
        if (cancelled) break;
        
        const url = urls[i];
        const progress = (i / total) * 100;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `Processing ${i + 1}/${total}...`;
        loadingText.textContent = `Processing ${i + 1}/${total}: ${url.substring(0, 50)}...`;
        
        try {
            const data = await extractWebsiteDataWithRetry(url);
            results.push(data);
        } catch (error) {
            results.push({
                url: url,
                title: '❌ Failed',
                emails: '-',
                status: 'error'
            });
        }
        
        completed++;
        renderResults(results);
        
        const successCount = results.filter(d => d.status === 'success').length;
        const errorCount = results.filter(d => d.status === 'error').length;
        resultCount.textContent = `✅ ${successCount} successful | ❌ ${errorCount} failed | Total: ${results.length}`;
        
        // Delay between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    progressFill.style.width = '100%';
    progressText.textContent = `✅ Completed! ${results.length} websites processed in ${elapsedTime}s`;
    loadingOverlay.style.display = 'none';
    
    extractedData = results;
    renderResults(results);
    
    const successCount = results.filter(d => d.status === 'success').length;
    const errorCount = results.filter(d => d.status === 'error').length;
    resultCount.textContent = `✅ ${successCount} successful | ❌ ${errorCount} failed | Total: ${results.length} | ⏱️ ${elapsedTime}s`;
    
    isExtracting = false;
    extractBtn.disabled = false;
    downloadBtn.disabled = false;
});

// ============================================
// EXTRACT WEBSITE DATA - WITH RETRY
// ============================================
async function extractWebsiteDataWithRetry(url, retryCount = 0) {
    const maxRetries = 2;
    
    // Try each CORS proxy
    for (let proxyIndex = 0; proxyIndex < CORS_PROXIES.length; proxyIndex++) {
        try {
            const proxyUrl = CORS_PROXIES[proxyIndex](url);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(proxyUrl, {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) continue;
            
            const html = await response.text();
            
            if (html.length < 100) continue;
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract Title
            let title = 'No Title';
            const titleTag = doc.querySelector('title');
            if (titleTag) {
                title = titleTag.textContent.trim() || 'No Title';
            }
            
            // Try Open Graph title
            const ogTitle = doc.querySelector('meta[property="og:title"]');
            if (ogTitle && ogTitle.getAttribute('content')) {
                const ogContent = ogTitle.getAttribute('content').trim();
                if (ogContent && ogContent.length > title.length) {
                    title = ogContent;
                }
            }
            
            // Extract Emails
            const emails = extractEmailsFast(html);
            const emailsStr = emails.length > 0 ? emails.join(', ') : 'Not found';
            
            return {
                url: url,
                title: title.substring(0, 200),
                emails: emailsStr,
                status: 'success'
            };
            
        } catch (error) {
            // Try next proxy
            continue;
        }
    }
    
    // If all proxies failed and we have retries left
    if (retryCount < maxRetries) {
        await new Promise(r => setTimeout(r, 2000));
        return extractWebsiteDataWithRetry(url, retryCount + 1);
    }
    
    throw new Error('All proxies failed');
}

// ============================================
// EXTRACT EMAILS
// ============================================
function extractEmailsFast(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    
    const validEmails = [...new Set(matches)]
        .filter(email => {
            if (!email.includes('@')) return false;
            if (!email.includes('.')) return false;
            if (email.length < 5) return false;
            if (email.includes('...')) return false;
            const parts = email.split('@');
            if (parts.length !== 2) return false;
            const domain = parts[1];
            if (!domain.includes('.')) return false;
            if (domain.startsWith('.') || domain.endsWith('.')) return false;
            return true;
        })
        .slice(0, 20);
    
    return validEmails;
}

// ============================================
// RENDER RESULTS
// ============================================
function renderResults(data) {
    resultsArea.style.display = 'block';
    resultsBody.innerHTML = '';
    
    if (data.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">No data found</td></tr>';
        return;
    }
    
    data.forEach((item, index) => {
        const tr = document.createElement('tr');
        const statusClass = item.status === 'success' ? 'status-success' : 'status-error';
        const statusText = item.status === 'success' ? '✅' : '❌';
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><a href="${item.url}" target="_blank" style="color:var(--primary);word-break:break-all;font-size:12px;">${item.url.substring(0, 50)}${item.url.length > 50 ? '...' : ''}</a></td>
            <td style="font-size:13px;"><strong>${item.title || 'No Title'}</strong></td>
            <td style="font-size:12px;word-break:break-all;color:var(--text-muted);">${item.emails || '-'}</td>
            <td class="${statusClass}" style="text-align:center;">${statusText}</td>
        `;
        resultsBody.appendChild(tr);
    });
}

// ============================================
// DOWNLOAD CSV
// ============================================
downloadBtn.addEventListener('click', () => {
    if (extractedData.length === 0) {
        alert('No data to download. Please extract data first.');
        return;
    }
    
    const headers = ['URL', 'Title', 'Emails', 'Status'];
    const rows = extractedData.map(item => [
        item.url,
        `"${(item.title || '').replace(/"/g, '""')}"`,
        `"${(item.emails || '').replace(/"/g, '""')}"`,
        item.status
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `extracted_data_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// ============================================
// CLEAR RESULTS
// ============================================
clearResultsBtn.addEventListener('click', () => {
    resultsBody.innerHTML = '';
    resultsArea.style.display = 'none';
    extractedData = [];
    downloadBtn.disabled = true;
    progressArea.style.display = 'none';
    progressFill.style.width = '0%';
    cancelled = true;
});

// ============================================
// MENU TOGGLE
// ============================================
document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.querySelector('.nav')?.classList.toggle('open');
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        extractBtn.click();
    }
    if (e.key === 'Escape') {
        clearResultsBtn.click();
    }
});