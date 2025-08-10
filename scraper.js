const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

async function scrapeYouTube(channelUrl) {
    const browser = await puppeteer.launch({
        executablePath: await chromium.executablePath(),
        args: [
            ...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
        headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    );
    await page.goto(channelUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Auto-scroll to load more videos
    let prevHeight;
    try {
        while (true) {
            prevHeight = await page.evaluate(
                "document.documentElement.scrollHeight"
            );
            await page.evaluate(
                "window.scrollTo(0, document.documentElement.scrollHeight)"
            );
            await page.waitForTimeout(1000);
            const newHeight = await page.evaluate(
                "document.documentElement.scrollHeight"
            );
            if (newHeight === prevHeight) break;
        }
    } catch (err) {
        console.error("Scrolling error:", err);
    }

    const videos = await page.evaluate(() => {
        const elements = Array.from(
            document.querySelectorAll("ytd-rich-item-renderer")
        );
        return elements.map((el) => {
            const titleEl = el.querySelector("#video-title");
            const titleText = titleEl?.innerText || "";
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
            const url = el.querySelector("a#thumbnail")?.href || "";
            // Extract videoId from /watch?v=... or /shorts/...
            let videoId = "";
            if (url.includes("watch?v=")) {
                videoId = url.split("watch?v=")[1]?.split("&")[0] || "";
            } else if (url.includes("/shorts/")) {
                videoId = url.split("/shorts/")[1]?.split("?")[0] || "";
            }
            const duration =
                el
                    .querySelector(
                        "span.ytd-thumbnail-overlay-time-status-renderer"
                    )
                    ?.innerText.trim() || "";
            const imgEl = el.querySelector("img");
            const image =
                imgEl?.getAttribute("data-thumb") ||
                imgEl?.src ||
                (videoId
                    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                    : "");

            const metadataItems = el.querySelectorAll("#metadata-line span");
            const views =
                (metadataItems[0]?.innerText || "").split(" ")[0] || "";
            const uploadTime = metadataItems[1]?.innerText || "";

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
