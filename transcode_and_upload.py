#!/usr/bin/env python3
"""
transcode_and_upload.py - Transcode VP9 MP4 videos to Apple-compatible H.264/AAC and upload to Cloudflare R2.
"""

import os
import sys
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path

VIDEO_DIR = Path(r"C:\working\git-repos\coco-video-player\videos")
OUT_DIR = Path(r"C:\working\git-repos\coco-video-player\videos\h264_transcoded")
OUT_DIR.mkdir(parents=True, exist_ok=True)

CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "96b24243a76db7fd830f7c2dc6568d0e")
R2_BUCKET = "coco-dance-videos"

VP9_VIDEOS = [
    "PXL_20250625_194342335.TS.mp4",
    "PXL_20250528_194505329.TS.mp4",
    "PXL_20250528_190856971.TS.mp4",
    "PXL_20250514_193032889.TS.mp4",
    "Coco Dance App 2 of 2 - Dance.mp4"
]


def transcode_to_h264(input_file, output_file):
    print(f"[*] Transcoding {input_file.name} -> H.264 (yuv420p / aac)...")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_file),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(output_file)
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {res.stderr.decode()[-500:]}")
    print(f"    [OK] Transcoded: {output_file.name} ({output_file.stat().st_size / (1024*1024):.2f} MB)")


def upload_to_r2(local_file, remote_key):
    print(f"[*] Uploading {remote_key} to Cloudflare R2 ({R2_BUCKET})...")
    encoded_key = urllib.parse.quote(remote_key)
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{encoded_key}"

    with open(local_file, "rb") as f:
        data = f.read()

    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
            "Content-Type": "video/mp4"
        }
    )

    resp = urllib.request.urlopen(req)
    if resp.status == 200:
        print(f"    [OK] Uploaded {remote_key} successfully ({len(data) / (1024*1024):.2f} MB)")
    else:
        raise RuntimeError(f"Upload failed: status {resp.status}")


def main():
    for filename in VP9_VIDEOS:
        src = VIDEO_DIR / filename
        out = OUT_DIR / filename

        if not src.exists():
            print(f"[-] Warning: Source not found: {src}")
            continue

        # 1. Transcode
        transcode_to_h264(src, out)

        # 2. Upload to R2 replacing the old VP9 payload
        upload_to_r2(out, filename)

    print("\n[OK] All videos transcoded to H.264 and updated on Cloudflare R2!")


if __name__ == "__main__":
    main()
