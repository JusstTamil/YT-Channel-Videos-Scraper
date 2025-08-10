const { json } = require('express');
const puppeteer = require('puppeteer');

async function scrapeYouTube(channelUrl) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(channelUrl, { waitUntil: 'networkidle2' });

  // Auto-scroll to load more videos
  let prevHeight;
  try {
    while (true) {
      prevHeight = await page.evaluate('document.documentElement.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
      await page.waitForTimeout(1000);
      const newHeight = await page.evaluate('document.documentElement.scrollHeight');
      if (newHeight === prevHeight) break;
    }
  } catch (err) {
    console.error('Scrolling error:', err);
  }

const videos = await page.evaluate(async () => {
  const elements = Array.from(document.querySelectorAll('ytd-rich-item-renderer'));

  return elements.map((el) => {
    const titleEl = el.querySelector('#video-title');
    const titleText = titleEl?.innerText || '';
    const titleArray = titleText.split(' | ');
    let title = titleText
    let creator = 'JUSST Tamil'
    let batch = ''
    let subject = ''
    if (titleArray.length > 1) {
        title = titleArray[0];
        creator = titleArray[titleArray.length - 1];
        try {
            batch = titleArray[1];
            subject = titleArray[2];
        } catch (err) {
            console.log("An error has occured: ", err.message);
            return json({
              code: 400,
              message: "The fields batch and subject are not present in your title"
            })
        }
    }
    const url = el.querySelector('a#thumbnail')?.href;
    const videoId = url.split('v=')[1]?.split('&')[0] || '';
    const duration = el.querySelector('span.ytd-thumbnail-overlay-time-status-renderer')?.innerText.trim() || '';
    const imgEl = el.querySelector('img');
    const image =
        imgEl?.getAttribute('data-thumb') || (
            videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''
        );

    const metadataItems = el.querySelectorAll('#metadata-line span');
    const views = (metadataItems[0]?.innerText).split(' ')[0] || '';
    const uploadTime = metadataItems[1]?.innerText || '';

    return {
      title,
      url,
      duration,
      image,
      creator,
      batch,
      subject,
      views,
      uploadTime
    };
  });
});


  await browser.close();
  return videos;
}

module.exports = scrapeYouTube;
