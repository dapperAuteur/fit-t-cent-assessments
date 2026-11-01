#!/bin/sh
# Synthetic clips that mimic what iOS Photos hands a web page for a slow-motion video: H.264
# 1080p in a QuickTime .mov, rotation 90 (portrait), an AAC track, Apple metadata keys, and
# every frame timestamped at 30 fps (a 240 fps capture stretched 8x). The picture is MediaPipe's pose.jpg
# drifting with per-frame noise, slowed 8x so each 30 fps frame moves as far as one 240 fps frame.
#   slomo-unique.mov      1,200 distinct frames (5 s of 240 fps capture, 40 s file)
#   slomo-dup-ramps.mov   same, but the first and last 60 frames each repeat 4 times (90 duplicates)
#   slomo-drop-ramps.mov  ends at normal speed (every 8th capture frame kept), slow middle
#   orig-240.mov          the same capture as a 240 fps original with the same creation date
#   long-100s.mov         100 s, 3,000 distinct frames, about 96 MB (memory and chunking test)
# Usage: sh dev/make-iphone-clips.sh <outdir>   (needs ffmpeg with libx264)
set -e
OUT=${1:-clips}; mkdir -p "$OUT"
[ -f "$OUT/pose.jpg" ] || curl -sSL -o "$OUT/pose.jpg" https://storage.googleapis.com/mediapipe-assets/pose.jpg
# x and y follow capture time c (seconds at 240 fps), so frame k of a 240 fps capture sits at c = k/240.
# The picture drifts in two sine waves, up to about 4 px per 240 fps frame (about walking speed for
# a side-on subject); a slower drift gets skip-coded by the encoder and looks like repeated frames.
pan() { echo "scale=2400:1600,crop=1920:1080:'240+240*sin(2*PI*($1)/1.9)':'260+250*sin(2*PI*($1)/2.7)',noise=alls=12:allf=t,format=yuv420p"; }
META="-movflags use_metadata_tags+faststart -metadata com.apple.quicktime.make=Synthetic -metadata com.apple.quicktime.full-frame-rate-playback-intent=0"
ENC="-c:v libx264 -preset veryfast -profile:v high -b:v 7500k -g 30 -bf 0 -c:a aac -b:a 64k -shortest"
AUD="-f lavfi -i sine=frequency=440:sample_rate=44100"
# Rotation and Apple keys go on in a final stream-copy remux (display_rotation is an input option).
fin() { # tmp out creationdate
  ffmpeg -y -loglevel error -display_rotation:v:0 -90 -i "$1" -map 0 -c copy $META -metadata com.apple.quicktime.creationdate="$3" "$2"; rm -f "$1"
}

# 1,200 distinct frames at 30 fps: file time t, capture time t/8.
ffmpeg -y -loglevel error -loop 1 -framerate 30 -t 40 -i "$OUT/pose.jpg" $AUD -vf "$(pan t/8)" -r 30 $ENC "$OUT/t1.mov"
fin "$OUT/t1.mov" "$OUT/slomo-unique.mov" 2026-10-31T12:00:00-0400

# The same capture as a 240 fps original (what a Files pick of the camera file would look like),
# with the same creation date, so the page can match it to slomo-unique.mov.
ffmpeg -y -loglevel error -loop 1 -framerate 240 -t 5 -i "$OUT/pose.jpg" $AUD -vf "$(pan t)" -r 240 $ENC "$OUT/t5.mov"
fin "$OUT/t5.mov" "$OUT/orig-240.mov" 2026-10-31T12:00:00-0400

# Duplicated ramps: decode the unique clip, hold every 4th frame for frames 0-59 and 1140-1199.
ffmpeg -y -loglevel error -noautorotate -i "$OUT/slomo-unique.mov" $AUD -filter_complex \
  "[0:v]split=3[a][b][c];[a]trim=start_frame=0:end_frame=60,setpts=PTS-STARTPTS,fps=7.5,fps=30[a2];[b]trim=start_frame=60:end_frame=1140,setpts=PTS-STARTPTS[b2];[c]trim=start_frame=1140:end_frame=1200,setpts=PTS-STARTPTS,fps=7.5,fps=30[c2];[a2][b2][c2]concat=n=3:v=1:a=0,format=yuv420p[v]" \
  -map "[v]" -map 1:a -r 30 $ENC "$OUT/t2.mov"
fin "$OUT/t2.mov" "$OUT/slomo-dup-ramps.mov" 2026-10-31T12:01:00-0400

# Dropped ramps: 2,000 capture frames; keep every 8th of frames 0-479 and 1520-1999, all of 480-1519.
ffmpeg -y -loglevel error -loop 1 -framerate 240 -t 8.3333 -i "$OUT/pose.jpg" $AUD -filter_complex \
  "[0:v]$(pan t),select='lt(n\,480)*not(mod(n\,8))+between(n\,480\,1519)+gte(n\,1520)*not(mod(n\,8))',setpts=N/30/TB[v]" \
  -map "[v]" -map 1:a -r 30 $ENC "$OUT/t3.mov"
fin "$OUT/t3.mov" "$OUT/slomo-drop-ramps.mov" 2026-10-31T12:02:00-0400

# 100 s long clip.
ffmpeg -y -loglevel error -loop 1 -framerate 30 -t 100 -i "$OUT/pose.jpg" $AUD -vf "$(pan t/8)" -r 30 $ENC "$OUT/t4.mov"
fin "$OUT/t4.mov" "$OUT/long-100s.mov" 2026-10-31T12:03:00-0400

for f in "$OUT"/slomo-*.mov "$OUT"/orig-240.mov "$OUT"/long-100s.mov; do
  printf '%s ' "$(basename "$f")"; ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=codec_name,r_frame_rate,nb_read_packets:stream_side_data=rotation -of csv=p=0 "$f" | tr '\n' ' '; ls -lh "$f" | awk '{print $5}'
done
