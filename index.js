const express = require('express');
const cors = require('cors');
const scrapeYouTube = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3458;

const allowedOrigins = ['http://localhost:5173', 'https://jusst.netlify.app'];

const corsOptions = {
    origin: function (origin, callback) {
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, 
};

app.use(cors(corsOptions));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('YouTube Channel Videos Scraper API is running!');
});

app.get('/api/videos', async (req, res) => {
  try {
    const channelUrl = req.query.channel || 'https://www.youtube.com/@jusst1523/videos';
    console.log(`Starting scrape for: ${channelUrl}`);
    const data = await scrapeYouTube(channelUrl);
    console.log(`Scraping complete. Found ${data.length} videos`);
    res.json(data);
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: 'Scraping failed.', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

