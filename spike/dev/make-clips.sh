#!/bin/sh
# Synthetic test clips: a 1920x1080 pan across MediaPipe's pose.jpg (same recipe as
# docs/research/pose-bench). Usage: sh dev/make-clips.sh <outdir>
set -e
OUT=${1:-clips}; mkdir -p "$OUT"
[ -f "$OUT/pose.jpg" ] || curl -sSL -o "$OUT/pose.jpg" https://storage.googleapis.com/mediapipe-assets/pose.jpg
VF="scale=2400:1600,crop=1920:1080:'200+100*t':'200+40*sin(2*PI*t)',noise=alls=12:allf=t,format=yuv420p"
mk() { # fps seconds codec-args ext name
  ffmpeg -y -loglevel error -loop 1 -framerate "$1" -t "$2" -i "$OUT/pose.jpg" -vf "$VF" $3 -r "$1" -g "$1" -movflags +faststart "$OUT/$5.$4"
}
mk 240 5 "-c:v libx264 -preset veryfast -b:v 20M" mp4 h264-240-5s
mk 240 5 "-c:v libx264 -preset veryfast -b:v 20M" mov h264-240-5s
mk 240 5 "-c:v libx265 -preset veryfast -b:v 20M -tag:v hvc1 -x265-params log-level=error" mov hevc-240-5s
mk 120 5 "-c:v libx264 -preset veryfast -b:v 20M" mp4 h264-120-5s
for f in "$OUT"/*.mp4 "$OUT"/*.mov; do
  printf '%s ' "$(basename "$f")"; ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=codec_name,r_frame_rate,nb_read_packets -of csv=p=0 "$f"
done
