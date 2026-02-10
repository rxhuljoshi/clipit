import asyncio
import subprocess
import json

QUALITY_MAP = {
    # Video qualities
    "2160p": "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
    "1440p": "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "360p": "bestvideo[height<=360]+bestaudio/best[height<=360]",
    # Audio qualities
    "320kbps": "bestaudio[abr>=256]/bestaudio/best",
    "256kbps": "bestaudio[abr>=192]/bestaudio/best",
    "192kbps": "bestaudio[abr>=128]/bestaudio/best",
    "128kbps": "bestaudio[abr<=128]/bestaudio/best",
}


async def download_video(video_id: str, output_path: str, media_type: str = "video", quality: str = "720p"):
    """Download video or audio using yt-dlp."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    # Use quality map for both video and audio
    # Default to 'best' if quality not found
    format_selector = QUALITY_MAP.get(quality, "best")
    
    cmd = [
        "yt-dlp",
        url,
        "-f", format_selector,
        "-o", output_path,
        "--no-playlist",
        "--no-warnings",
        "--prefer-free-formats",
        "--add-header", "referer:youtube.com",
        "--add-header", "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ]
    
    if media_type == "video":
        cmd.extend(["--merge-output-format", "mp4"])
    
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        raise Exception(f"yt-dlp failed: {stderr.decode()}")
    
    return output_path


async def get_video_formats(video_id: str) -> dict:
    """Get available formats for a video."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    proc = await asyncio.create_subprocess_exec(
        "yt-dlp", "-J", "--no-playlist", url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        raise Exception(f"Failed to get formats: {stderr.decode()}")
    
    info = json.loads(stdout.decode())
    
    # Extract unique qualities
    video_heights = sorted(set(
        f["height"] for f in info.get("formats", [])
        if f.get("vcodec") != "none" and f.get("height")
    ), reverse=True)
    
    audio_bitrates = sorted(set(
        int(f["abr"]) for f in info.get("formats", [])
        if f.get("acodec") != "none" and f.get("abr") and not f.get("vcodec")
    ), reverse=True)
    
    return {
        "title": info.get("title"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "video": [f"{h}p" for h in video_heights],
        "audio": [f"{b}kbps" for b in audio_bitrates]
    }


async def check_ytdlp() -> bool:
    """Check if yt-dlp is available."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        return proc.returncode == 0
    except:
        return False
