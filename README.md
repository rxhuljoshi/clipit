~# ClipIt

Fast, modern Chrome extension for downloading YouTube videos as MP3 or MP4 with quality selection.

## Features

- 🎵 Download as MP3 (128-320kbps)
- 🎬 Download as MP4 (360p-4K)
- 🎨 Dark glassmorphism UI
- 📊 Usage analytics
- ⏱️ Rate limiting (5/day free)

## Project Structure

```
├── extension/           # Chrome extension
│   ├── manifest.json    # Extension config
│   ├── popup.html/css/js # Popup UI
│   ├── background.js    # Service worker
│   ├── content.js       # YouTube page script
│   └── icons/           # Extension icons
├── backend/             # FastAPI Python
│   ├── main.py          # FastAPI server
│   ├── services/        # yt-dlp & FFmpeg
│   ├── requirements.txt # Python deps
│   └── render.yaml      # Deployment config
└── supabase/            # Database
    └── schema.sql       # Tables & analytics
```

## Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Supabase credentials

# Run server
uvicorn main:app --reload --port 3000
```

### 2. Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in SQL Editor
3. Copy URL and anon key to `.env`

### 3. Load Extension

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/` folder

## Deployment

### Backend (Render)

1. Push to GitHub
2. Create new Web Service on Render
3. Connect repo, set root to `backend`
4. Add environment variables
5. Deploy

### Extension (Chrome Web Store)

1. Update API URL in `popup.js` and `background.js`
2. Zip `extension/` folder
3. Upload to Chrome Web Store Developer Dashboard

## Tech Stack

- **Extension**: Manifest V3, Chrome APIs
- **Backend**: Python, FastAPI, yt-dlp, FFmpeg
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Render (free tier)

## License

MIT
