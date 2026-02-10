import os
import asyncio
import uuid
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from services.downloader import download_video, get_video_formats, check_ytdlp
from services.converter import convert_to_mp3, check_ffmpeg

load_dotenv()

import tempfile

# Temp directory
# Use a dedicated subdirectory in the system temp location to ensure we don't accidentally delete other apps' files
TEMP_DIR = Path(tempfile.gettempdir()) / "song_downloader_temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Supabase (optional)
supabase = None
try:
    from supabase import create_client
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY")
    if url and key:
        supabase = create_client(url, key)
except Exception as e:
    print(f"⚠️ Supabase not configured: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    has_ytdlp = await check_ytdlp()
    has_ffmpeg = await check_ffmpeg()
    
    print("\n🎵 ClipIt Backend (FastAPI)")
    print("─" * 35)
    print(f"✅ yt-dlp:   {'Available' if has_ytdlp else '❌ NOT FOUND'}")
    print(f"✅ ffmpeg:   {'Available' if has_ffmpeg else '❌ NOT FOUND'}")
    print(f"✅ Supabase: {'Connected' if supabase else '⚠️ Not configured'}")
    print(f"📁 Temp dir: {TEMP_DIR}")
    print("─" * 35 + "\n")
    
    if not has_ytdlp:
        print("❌ yt-dlp is required! Install with: brew install yt-dlp")
    if not has_ffmpeg:
        print("❌ ffmpeg is required! Install with: brew install ffmpeg")
    
    yield
    
    # Cleanup temp files on shutdown
    for f in TEMP_DIR.glob("*"):
        try:
            f.unlink()
        except:
            pass


app = FastAPI(
    title="ClipIt API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Models
class DownloadRequest(BaseModel):
    videoId: str
    format: str  # 'mp3' or 'mp4'
    quality: str  # '720p', '320kbps', etc.


class TrackRequest(BaseModel):
    fingerprint: str
    videoId: str
    videoTitle: Optional[str] = None
    format: str
    quality: str


# Cleanup helper
def cleanup_file(path: Path):
    async def _cleanup():
        await asyncio.sleep(300)  # 5 minutes
        if path.exists():
            path.unlink()
    asyncio.create_task(_cleanup())


def remove_file(path: Path):
    try:
        if path.exists():
            path.unlink()
    except Exception:
        pass


# Endpoints
@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/formats/{video_id}")
async def get_formats(video_id: str):
    try:
        formats = await get_video_formats(video_id)
        return formats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/download-url")
async def download_url(req: DownloadRequest, background_tasks: BackgroundTasks):
    file_id = f"{req.videoId}_{uuid.uuid4().hex[:8]}"
    
    try:
        if req.format == "mp3":
            # Download audio and convert
            audio_path = TEMP_DIR / f"{file_id}.m4a"
            mp3_path = TEMP_DIR / f"{file_id}.mp3"
            
            await download_video(req.videoId, str(audio_path), "audio", req.quality)
            await convert_to_mp3(str(audio_path), str(mp3_path), req.quality)
            
            # Cleanup intermediate
            if audio_path.exists():
                audio_path.unlink()
            
            output_path = mp3_path
        else:
            # Download video
            output_path = TEMP_DIR / f"{file_id}.mp4"
            await download_video(req.videoId, str(output_path), "video", req.quality)
        
        if not output_path.exists():
            raise HTTPException(status_code=500, detail="Download failed")
        
        # Schedule cleanup
        cleanup_file(output_path)
        
        return {
            "success": True,
            "downloadUrl": f"/api/file/{output_path.name}"
        }
    except Exception as e:
        # Cleanup on error
        for ext in [".m4a", ".mp3", ".mp4"]:
            p = TEMP_DIR / f"{file_id}{ext}"
            if p.exists():
                p.unlink()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/file/{file_id}")
async def serve_file(file_id: str, background_tasks: BackgroundTasks):
    file_path = TEMP_DIR / file_id
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found or expired")
    
    # Schedule clean up after serving
    background_tasks.add_task(remove_file, file_path)
    
    media_type = "audio/mpeg" if file_id.endswith(".mp3") else "video/mp4"
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=file_id
    )


@app.post("/api/track")
async def track_download(req: TrackRequest):
    if not supabase:
        return {"success": True, "message": "Analytics disabled"}
    
    try:
        supabase.table("downloads").insert({
            "fingerprint": req.fingerprint,
            "video_id": req.videoId,
            "video_title": req.videoTitle,
            "format": req.format,
            "quality": req.quality
        }).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rate-limit/{fingerprint}")
async def check_rate_limit(fingerprint: str):
    if not supabase:
        return {"remaining": 5, "resetAt": None}
    
    try:
        result = supabase.table("rate_limits") \
            .select("*") \
            .eq("fingerprint", fingerprint) \
            .single() \
            .execute()
        
        if not result.data:
            return {"remaining": 5, "resetAt": None}
        
        from datetime import datetime, timezone
        data = result.data
        reset_at = datetime.fromisoformat(data["reset_at"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        
        if now > reset_at:
            # Reset quota
            new_reset = now.isoformat()
            supabase.table("rate_limits") \
                .update({"download_count": 0, "reset_at": new_reset}) \
                .eq("fingerprint", fingerprint) \
                .execute()
            return {"remaining": 5, "resetAt": None}
        
        return {
            "remaining": max(0, 5 - data["download_count"]),
            "resetAt": data["reset_at"]
        }
    except Exception as e:
        return {"remaining": 5, "resetAt": None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
