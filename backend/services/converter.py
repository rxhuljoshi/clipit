import asyncio

BITRATE_MAP = {
    "320kbps": "320k",
    "256kbps": "256k",
    "192kbps": "192k",
    "128kbps": "128k",
}


async def convert_to_mp3(input_path: str, output_path: str, quality: str = "320kbps"):
    """Convert audio to MP3 using ffmpeg."""
    bitrate = BITRATE_MAP.get(quality, "192k")
    
    cmd = [
        "ffmpeg",
        "-i", input_path,
        "-vn",
        "-acodec", "libmp3lame",
        "-ab", bitrate,
        "-ar", "44100",
        "-ac", "2",
        "-y",
        output_path
    ]
    
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    stdout, stderr = await proc.communicate()
    
    if proc.returncode != 0:
        raise Exception(f"ffmpeg failed: {stderr.decode()[-200:]}")
    
    return output_path


async def check_ffmpeg() -> bool:
    """Check if ffmpeg is available."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        return proc.returncode == 0
    except:
        return False
