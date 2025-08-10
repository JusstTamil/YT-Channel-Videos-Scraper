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
  const startTime = Date.now();
  try {
    const channelUrl = req.query.channel || 'https://www.youtube.com/@jusst1523/videos';
    console.log(`Starting scrape for: ${channelUrl}`);
    
    // Set a reasonable timeout for the entire request
    const timeout = setTimeout(() => {
      console.error('Request timed out after 120 seconds');
      if (!res.headersSent) {
        res.status(504).json({ 
          error: 'Request timed out',
          message: 'The scraping operation took too long to complete'
        });
      }
    }, 120000); // 2 minute timeout
    
    const data = await scrapeYouTube(channelUrl);
    
    // Clear the timeout since we completed successfully
    clearTimeout(timeout);
    
    // Handle debug info if returned
    if (data && data.debug) {
      console.log('Debug info received instead of videos:');
      console.log(JSON.stringify(data.pageContent, null, 2));
      return res.status(200).json({ 
        message: 'No videos found, but page loaded', 
        debug: true,
        pageInfo: data.pageContent,
        processingTime: `${(Date.now() - startTime)/1000} seconds`
      });
    }
    
    // Check if we got an array
    if (!Array.isArray(data)) {
      console.log(`Unexpected data format returned:`, typeof data);
      return res.status(200).json({ 
        message: 'Invalid data format returned',
        data,
        processingTime: `${(Date.now() - startTime)/1000} seconds`
      });
    }
    
    console.log(`Scraping complete. Found ${data.length} videos`);
    
    // Filter out items without title or URL
    const validVideos = data.filter(video => video.title && video.url);
    console.log(`Valid videos with title and URL: ${validVideos.length}`);
    
    res.json({
      videos: validVideos.length > 0 ? validVideos : data,
      count: validVideos.length,
      processingTime: `${(Date.now() - startTime)/1000} seconds`
    });
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ 
      error: 'Scraping failed.', 
      message: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
      processingTime: `${(Date.now() - startTime)/1000} seconds`
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force close after 30s
  setTimeout(() => {
    console.log('Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force close after 30s
  setTimeout(() => {
    console.log('Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Keep the process running but log the error
});

