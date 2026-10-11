"""Inspect decoded MP4 frames, audio peaks, duration, and faststart metadata."""
from pathlib import Path
import json
import math
import struct
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
project = root.parent.parent
ffmpeg = root / 'tools/ffmpeg-full.exe'
video = project / 'artifacts/credere-launch.mp4'
qa_dir = root / 'qa'
times = [1.8, 5.9, 10.3, 15.9, 21.8, 27.7, 33.6, 37.5, 38.5, 39.8]
frames = []
for index, time in enumerate(times):
    frame = qa_dir / f'decoded-{index:02d}.png'
    subprocess.run([str(ffmpeg), '-y', '-hide_banner', '-loglevel', 'error', '-ss', str(time), '-i', str(video), '-frames:v', '1', '-update', '1', str(frame)], check=True)
    frames.append(frame)

sheet = Image.new('RGB', (1920, 2850), '#1A1A1A')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 22)
for i, frame in enumerate(frames):
    image = Image.open(frame).convert('RGB').resize((960, 540), Image.Resampling.LANCZOS)
    x, y = (i % 2) * 960, (i // 2) * 570
    sheet.paste(image, (x, y))
    draw.text((x + 18, y + 543), f'{times[i]:05.2f}s / FINAL MP4', fill='#F4F1EA', font=font)
sheet.save(root / 'contact-sheet.jpg', quality=93)

volume = subprocess.run([str(ffmpeg), '-hide_banner', '-i', str(video), '-vn', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True, check=True)
(qa_dir / 'volumedetect.txt').write_text(volume.stderr, encoding='utf8')
raw = subprocess.run([str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-i', str(video), '-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', '-'], capture_output=True, check=True).stdout
audio = np.frombuffer(raw, dtype='<f4')
sample_peak = float(np.max(np.abs(audio)))
peak_db = 20 * math.log10(sample_peak)
clipped = int(np.sum(np.abs(audio) >= 1))

atoms = []
with video.open('rb') as f:
    while f.tell() < video.stat().st_size:
        offset = f.tell()
        header = f.read(8)
        if len(header) < 8:
            break
        size, name = struct.unpack('>I4s', header)
        if size == 1:
            size = struct.unpack('>Q', f.read(8))[0]
        if size == 0:
            size = video.stat().st_size - offset
        atoms.append((name.decode('ascii'), offset, size))
        f.seek(offset + size)
faststart = next(x[1] for x in atoms if x[0] == 'moov') < next(x[1] for x in atoms if x[0] == 'mdat')
qa = json.loads((root / 'qa.json').read_text(encoding='utf8'))
qa['decodedExportQA'] = {'audioSamplePeakDbFS': peak_db, 'clippedAudioSamples': clipped, 'faststart': faststart, 'contactSheetFrames': times, 'bytes': video.stat().st_size, 'atoms': atoms}
qa['previewControls'] = json.loads((qa_dir / 'controls.json').read_text(encoding='utf8'))
(root / 'qa.json').write_text(json.dumps(qa, indent=2), encoding='utf8')
assert peak_db <= -1, peak_db
assert clipped == 0
assert faststart
assert abs(float(qa['probe']['format']['duration']) - 40) < .02
assert qa['deterministic']
assert qa['textAudit']['violations'] == 0
assert qa['previewControls']['passed']
print(json.dumps(qa['decodedExportQA'], indent=2))
