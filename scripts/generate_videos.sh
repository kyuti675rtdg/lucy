#!/usr/bin/env bash
# Generate 30 original procedural vertical videos for Project Lucy.
# 540x960, 30fps, H.264 + AAC. Duration contract: D = 10 + ((n-1) % 6).
# Re-runnable: ffmpeg -y overwrites. Run: bash scripts/generate_videos.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/videos

VENC=(-c:v libx264 -pix_fmt yuv420p -crf 28 -preset veryfast -r 30)
AENC=(-c:a aac -b:a 96k -ar 44100 -ac 2)

# Per-index musical base frequency (Hz): chromatic climb 110 -> ~624
basefreq() { awk -v n="$1" 'BEGIN{printf "%.1f", 110*2^(n/12)}'; }

simple_av() { # $1=n $2=NN $3=D $4=video_input $5=vf $6=audio_expr
  local n=$1 NN=$2 D=$3 VIN=$4 VF=$5 AEXPR=$6
  ffmpeg -y -loglevel error \
    -f lavfi -i "$VIN" \
    -f lavfi -i "aevalsrc='$AEXPR':s=44100:d=$D" \
    -vf "$VF" -af "volume=0.25,lowpass=f=5000" \
    -map 0:v -map 1:a \
    "${VENC[@]}" "${AENC[@]}" -t "$D" -movflags +faststart \
    "assets/videos/v${NN}.mp4"
}

hats_av() { # same but mixes a pink-noise hat track (dance/comedy)
  local n=$1 NN=$2 D=$3 VIN=$4 VF=$5 AEXPR=$6
  ffmpeg -y -loglevel error \
    -f lavfi -i "$VIN" \
    -f lavfi -i "aevalsrc='$AEXPR':s=44100:d=$D" \
    -f lavfi -i "anoisesrc=color=pink:d=$D:amplitude=0.025" \
    -vf "$VF" \
    -filter_complex "[1:a][2:a]amix=inputs=2:duration=shortest,volume=0.25,lowpass=f=6000[aout]" \
    -map 0:v -map "[aout]" \
    "${VENC[@]}" "${AENC[@]}" -t "$D" -movflags +faststart \
    "assets/videos/v${NN}.mp4"
}

coffee_av() { # dark brown base + translucent slow gradients overlay + vignette
  local n=$1 NN=$2 D=$3
  local F; F=$(basefreq "$n")
  local SPD="0.0$((3 + n % 4))"
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=0x2a1a10:s=540x960:r=30:d=$D" \
    -f lavfi -i "gradients=s=540x960:r=30:speed=$SPD" \
    -f lavfi -i "aevalsrc='(sin(2*PI*110*t)+0.5*sin(2*PI*165*t)+0.25*sin(2*PI*$F*t))*min(1,t/3)':s=44100:d=$D" \
    -filter_complex "[1:v]format=rgba,colorchannelmixer=aa=0.35[ov];[0:v][ov]overlay=0:0,vignette=PI/5,format=yuv420p[vout];[2:a]volume=0.25,lowpass=f=3000[aout]" \
    -map "[vout]" -map "[aout]" \
    "${VENC[@]}" "${AENC[@]}" -t "$D" -movflags +faststart \
    "assets/videos/v${NN}.mp4"
}

gen_one() {
  local n=$1 NN D F H
  NN=$(printf "%02d" "$n")
  D=$((10 + (n - 1) % 6))
  F=$(basefreq "$n")
  echo "gen v$NN (dur=${D}s)"

  if (( n >= 1 && n <= 4 )); then
    # Tech: testsrc2, cool blue/cyan tint, varied per index
    H=$((100 + (n * 23) % 80))
    simple_av "$n" "$NN" "$D" "testsrc2=s=540x960:r=30:d=$D" \
      "hue=h=$H,eq=saturation=1.3" \
      "sin(2*PI*(200+150*sin(2*PI*0.2*t))*t)"

  elif (( n >= 5 && n <= 8 )); then
    # Comedy: rgbtestsrc, fast hue spin, hot saturation + hats
    local SPD=$((40 + n * 12))
    hats_av "$n" "$NN" "$D" "rgbtestsrc=s=540x960:r=30:d=$D" \
      "hue='h=t*$SPD',eq=saturation=1.8" \
      "sin(2*PI*(330+220*sin(2*PI*1.5*t))*t)"

  elif (( n >= 9 && n <= 12 )); then
    # Music: fast gradients + edgedetect (even) or negate (odd), melodic arp
    local SPD="0.$((2 + n % 4))"
    local FX
    if (( n % 2 == 0 )); then FX="edgedetect=mode=colormix,eq=saturation=1.6"
    else FX="negate,eq=saturation=1.4"; fi
    simple_av "$n" "$NN" "$D" "gradients=s=540x960:r=30:speed=$SPD" \
      "$FX" \
      "sin(2*PI*$F*pow(2,floor(t*2.5)/12)*t)*0.8"

  elif (( n >= 13 && n <= 16 )); then
    # Lifestyle: yuvtestsrc warm colorbalanced
    local RS; RS=$(awk -v n="$n" 'BEGIN{printf "%.2f", 0.20+0.03*(n%4)}')
    simple_av "$n" "$NN" "$D" "yuvtestsrc=s=540x960:r=30:d=$D" \
      "colorbalance=rs=$RS:gs=0.08:bs=-0.20" \
      "(sin(2*PI*261.6*t)+sin(2*PI*329.6*t)+sin(2*PI*392*t))*0.4"

  elif (( n >= 17 && n <= 20 )); then
    # Coffee: brown base + gradients overlay + vignette, warm pads
    coffee_av "$n" "$NN" "$D"

  elif (( n >= 21 && n <= 23 )); then
    # Dance: testsrc2, hue spin over time, contrast, rhythmic pulse + hats
    local SPD=$((50 + n * 15))
    hats_av "$n" "$NN" "$D" "testsrc2=s=540x960:r=30:d=$D" \
      "hue='h=t*$SPD',eq=contrast=1.2:saturation=1.4" \
      "sin(2*PI*$F*t)*(0.55+0.45*sin(2*PI*4*t))"

  elif (( n >= 24 && n <= 26 )); then
    # Education: slow gradients + drawgrid
    local GW=$((5 + n % 3)) GH=$((8 + n % 4))
    simple_av "$n" "$NN" "$D" "gradients=s=540x960:r=30:speed=0.1" \
      "drawgrid=w=iw/$GW:h=ih/$GH:t=2:c=white@0.25,eq=saturation=1.2" \
      "(sin(2*PI*196*t)+0.6*sin(2*PI*294*t))*0.5"

  else
    # Art (27-30): mandelbrot slow zoom (odd) or life cellular (even), vivid
    local VF
    if (( n % 2 == 1 )); then
      local SX SY
      SX=$(awk -v n="$n" 'BEGIN{printf "%.4f", -0.74+0.01*n}')
      SY=$(awk -v n="$n" 'BEGIN{printf "%.4f", -0.13+0.008*n}')
      VF="eq=saturation=2"
      simple_av "$n" "$NN" "$D" \
        "mandelbrot=s=540x960:r=30:maxiter=50:start_x=$SX:start_y=$SY:start_scale=2.5:end_scale=0.15:end_pts=$((D*30))" \
        "$VF" \
        "sin(2*PI*(180+120*sin(2*PI*0.15*t))*t)*0.7"
    else
      VF="hue='h=t*20',eq=saturation=2"
      simple_av "$n" "$NN" "$D" \
        "life=s=540x960:r=30:seed=$n:death_color=#101014:life_color=#8B5CF6" \
        "$VF" \
        "sin(2*PI*(180+120*sin(2*PI*0.15*t))*t)*0.7"
    fi
  fi
}
export -f gen_one basefreq simple_av hats_av coffee_av

seq 1 30 | xargs -P4 -I{} bash -c 'gen_one {}'
echo "ALL DONE"
