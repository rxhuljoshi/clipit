-- YT Downloader Database Schema
-- Run this in Supabase SQL Editor

-- Downloads tracking table
CREATE TABLE IF NOT EXISTS downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  video_id TEXT NOT NULL,
  video_title TEXT,
  format TEXT NOT NULL CHECK (format IN ('mp3', 'mp4')),
  quality TEXT NOT NULL,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_downloads_fingerprint ON downloads(fingerprint);
CREATE INDEX IF NOT EXISTS idx_downloads_video_id ON downloads(video_id);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  fingerprint TEXT PRIMARY KEY,
  download_count INT DEFAULT 0,
  reset_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 day'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to check and update rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(p_fingerprint TEXT)
RETURNS TABLE(allowed BOOLEAN, remaining INT, reset_at TIMESTAMPTZ) AS $$
DECLARE
  v_record rate_limits%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get or create rate limit record
  SELECT * INTO v_record FROM rate_limits WHERE rate_limits.fingerprint = p_fingerprint;
  
  IF NOT FOUND THEN
    -- Create new record
    INSERT INTO rate_limits (fingerprint, download_count, reset_at)
    VALUES (p_fingerprint, 0, v_now + INTERVAL '1 day')
    RETURNING * INTO v_record;
  END IF;
  
  -- Check if reset needed
  IF v_now > v_record.reset_at THEN
    UPDATE rate_limits 
    SET download_count = 0, reset_at = v_now + INTERVAL '1 day'
    WHERE rate_limits.fingerprint = p_fingerprint
    RETURNING * INTO v_record;
  END IF;
  
  -- Return status
  RETURN QUERY SELECT 
    v_record.download_count < 5,
    5 - v_record.download_count,
    v_record.reset_at;
END;
$$ LANGUAGE plpgsql;

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_download(p_fingerprint TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  SELECT (check_rate_limit).allowed INTO v_allowed FROM check_rate_limit(p_fingerprint);
  
  IF v_allowed THEN
    UPDATE rate_limits 
    SET download_count = download_count + 1
    WHERE fingerprint = p_fingerprint;
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Analytics view: Daily downloads
CREATE OR REPLACE VIEW analytics_daily AS
SELECT 
  DATE(created_at) as date,
  format,
  quality,
  COUNT(*) as download_count,
  COUNT(DISTINCT fingerprint) as unique_users,
  COUNT(DISTINCT video_id) as unique_videos
FROM downloads
GROUP BY DATE(created_at), format, quality
ORDER BY date DESC;

-- Analytics view: Popular videos
CREATE OR REPLACE VIEW analytics_popular_videos AS
SELECT 
  video_id,
  video_title,
  COUNT(*) as download_count,
  MAX(created_at) as last_downloaded
FROM downloads
GROUP BY video_id, video_title
ORDER BY download_count DESC
LIMIT 100;

-- Analytics view: Format distribution
CREATE OR REPLACE VIEW analytics_format_distribution AS
SELECT 
  format,
  quality,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM downloads
GROUP BY format, quality
ORDER BY count DESC;

-- Enable RLS (Row Level Security) - optional for public access
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy to allow inserts from anon key
CREATE POLICY "Allow anon inserts" ON downloads
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon select" ON downloads
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow anon all on rate_limits" ON rate_limits
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
