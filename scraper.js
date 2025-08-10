const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

async function scrapeYouTube(channelUrl) {
    console.log('Starting YouTube scraper function');
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Try to determine if we're on Render
    const isRender = process.env.RENDER === 'true';
    console.log(`Environment: ${isProduction ? 'Production' : 'Development'}${isRender ? ' (Render)' : ''}`);
    
    // Add a default viewport that mimics a typical browser window
    const browser = await puppeteer.launch({
        executablePath: isProduction 
            ? process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath()
            : await chromium.executablePath(),
        args: [
            ...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--single-process",
            "--no-zygote",
            "--window-size=1920,1080",
            "--hide-scrollbars",
            "--disable-notifications"
        ],
        headless: "new",
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();
    
    // Set a more realistic user agent - use latest Chrome version
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    // Add extra headers to make the request look more like a real browser
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive'
    });
    
    console.log(`Navigating to: ${channelUrl}`);
    
    // Try to load page with networkidle2 - wait until network is mostly idle
    await page.goto(channelUrl, { 
        waitUntil: ["domcontentloaded", "networkidle2"],
        timeout: 90000  // Longer timeout to ensure page loads
    });
    
    console.log(`Page loaded: ${await page.title()}`);
    
    // Wait for some time to ensure JavaScript runs and content renders
    await page.waitFor(5000);

    console.log('Starting to scroll the page to load more content...');
    // More robust scrolling that mimics human behavior
    try {
        // First, check if we even need to scroll (some channels may have few videos)
        let initialVideos = await page.$$eval('ytd-rich-item-renderer, ytd-grid-video-renderer', els => els.length);
        console.log(`Initial video count before scrolling: ${initialVideos}`);
        
        // Try a different scrolling pattern - more human-like
        const maxScrolls = 10; // Limit scrolling to avoid infinite loops
        let scrollCount = 0;
        let prevHeight = 0;
        
        while (scrollCount < maxScrolls) {
            // Get current height
            prevHeight = await page.evaluate('document.documentElement.scrollHeight');
            
            // Scroll down in chunks to mimic human behavior
            await page.evaluate(() => {
                // Scroll in smaller steps
                const scrollHeight = document.documentElement.scrollHeight;
                const viewportHeight = window.innerHeight;
                const scrollSteps = 4; // Number of steps to divide the scroll into
                
                for (let i = 1; i <= scrollSteps; i++) {
                    const targetScroll = (scrollHeight / scrollSteps) * i;
                    window.scrollTo(0, targetScroll);
                }
            });
            
            // Wait for content to load
            await page.waitFor(2000);
            
            // Get new height and check video count
            const newHeight = await page.evaluate('document.documentElement.scrollHeight');
            const currentVideos = await page.$$eval('ytd-rich-item-renderer, ytd-grid-video-renderer', els => els.length);
            
            console.log(`Scroll #${scrollCount+1}: Height ${prevHeight} → ${newHeight}, Videos: ${currentVideos}`);
            
            // If height didn't change or we didn't get more videos, we're probably at the bottom
            if (newHeight === prevHeight || (scrollCount > 2 && currentVideos <= initialVideos)) {
                console.log('Page height or video count stopped increasing, ending scroll');
                break;
            }
            
            initialVideos = currentVideos;
            scrollCount++;
        }
        
        // Final scroll to ensure we're at the bottom
        await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
        
        // Wait a moment for any final loading
        await page.waitFor(2000);
        
    } catch (err) {
        console.error("Scrolling error:", err);
    }

    // Add debug logging
console.log('Page HTML structure check beginning...');
await page.waitForSelector('ytd-rich-grid-renderer', { timeout: 30000 })
  .catch(e => console.log('Could not find ytd-rich-grid-renderer: ', e.message));

// Check if we can find any video items
const hasVideos = await page.evaluate(() => {
    const items = document.querySelectorAll('ytd-rich-item-renderer');
    console.log(`Found ${items.length} video elements`);
    return items.length > 0;
});

console.log(`Video elements found on page: ${hasVideos}`);

// Try different selectors that YouTube might be using
const videos = await page.evaluate(() => {
    // Try multiple selectors as YouTube's structure might change
    const elements = Array.from(
        document.querySelectorAll("ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer")
    );
    
    console.log(`Found ${elements.length} potential video elements`);
    
    if (elements.length === 0) {
        // For debugging: Return some info about what's on the page
        const pageContent = {
            title: document.title,
            bodyText: document.body.innerText.substring(0, 500),
            availableTags: Array.from(document.querySelectorAll('*'))
                .map(el => el.tagName)
                .filter((v, i, a) => a.indexOf(v) === i)
                .slice(0, 20)
        };
        return { debug: true, pageContent };
    }
    
    return elements.map((el) => {
        // Title can be in various places depending on YouTube's current layout
        const titleEl = el.querySelector("#video-title");
        const titleText = titleEl?.innerText || titleEl?.textContent || titleEl?.getAttribute("title") || "";
        const titleArray = titleText.split(" | ");
        let title = titleText;
        let creator = "JUSST Tamil";
        let batch = "";
        let subject = "";
        if (titleArray.length > 1) {
            title = titleArray[0];
            creator = titleArray[titleArray.length - 1];
            batch = titleArray[1] || "";
            subject = titleArray[2] || "";
        }
        
        // Find URL from various possible elements
        const urlEl = el.querySelector("a#thumbnail, a.yt-simple-endpoint, a[href*='/watch']");
        const url = urlEl?.href || "";

        let videoId = "";
        if (url.includes("watch?v=")) {
            videoId = url.split("watch?v=")[1]?.split("&")[0] || "";
        } else if (url.includes("/shorts/")) {
            videoId = url.split("/shorts/")[1]?.split("?")[0] || "";
        }
        
        // Try multiple selectors for duration
        const durationEl = el.querySelector(
            "span.ytd-thumbnail-overlay-time-status-renderer, span.ytp-time-duration, .duration-text"
        );
        const duration = durationEl?.innerText?.trim() || durationEl?.textContent?.trim() || "";
        
        // Handle image differently as YouTube often uses lazy loading
        const imgEl = el.querySelector("img");
        const image =
            imgEl?.getAttribute("data-thumb") ||
            imgEl?.src ||
            imgEl?.getAttribute("src") ||
            (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

        // Try multiple metadata selectors
        const metadataItems = el.querySelectorAll("#metadata-line span, .metadata-line span, .ytd-video-meta-block span");
        const views = metadataItems[0]?.innerText?.split(' ')[0] || 
                      metadataItems[0]?.textContent?.split(' ')[0] || "";
                      
        const uploadTime = metadataItems[1]?.innerText || metadataItems[1]?.textContent || "";

        return {
            title,
            url,
            duration,
            image,
            creator,
            batch,
            subject,
            views,
            uploadTime,
        };
    });
});

    await browser.close();
    return videos;
}

module.exports = scrapeYouTube;
