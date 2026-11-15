#!/usr/bin/env python3
"""
把實車錄音切成「可以無縫循環」的固定轉速片段，輸出到 public/sounds/engine/ 並更新 manifest.json。

用法（每段一次）：
  python3 scripts/prep_engine_loops.py --in 錄音.m4a --start 12.3 --len 1.5 --rpm 2500 --name rpm2500

步驟：
  1. ffmpeg 解碼成單聲道 44.1 kHz
  2. 從 start 取 len 秒，長度取整到「整數個引擎循環」（四行程一個循環 = 曲軸兩圈 = 120 / rpm 秒），
     這樣循環接起來時排氣脈衝的節拍不會亂
  3. 尾巴 XFADE 秒與開頭交叉淡化 → 波形首尾相接
  4. 前後各補 PAD 秒「接續的聲音」（循環的延伸），解碼器多出的幾毫秒空白落在緩衝裡
  5. 響度正規化、AAC 64 kbps 單聲道 .m4a（iPhone Safari 也能解）
  6. 寫進 manifest：{ rpm, file, loop: [PAD, PAD + 循環長度] }

         PAD        循環區間（播放時只重複這段）        PAD
  ├──────┼────────────────────────────────────────┼──────┤
"""
import argparse, json, os, subprocess, sys
import numpy as np

SR = 44100
PAD = 0.1
XFADE = 0.08
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds', 'engine')


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def make_loop(x: np.ndarray, start: float, length: float, rpm: float) -> np.ndarray:
    cycle = 120.0 / rpm
    cycles = max(1, round(length / cycle))
    L = int(round(cycles * cycle * SR))
    F = int(XFADE * SR)
    a = int(start * SR)
    seg = x[a:a + L + F]
    if len(seg) < L + F:
        sys.exit(f'錄音不夠長：需要 {(L + F) / SR:.2f} 秒')
    loop = seg[:L].copy()
    t = np.linspace(0, 1, F, endpoint=False)
    # 等功率淡化：尾巴延伸的 F 個樣本淡出，開頭淡入
    loop[:F] = seg[L:L + F] * np.cos(t * np.pi / 2) + seg[:F] * np.sin(t * np.pi / 2)
    return loop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True)
    ap.add_argument('--start', type=float, required=True)
    ap.add_argument('--len', type=float, default=1.5)
    ap.add_argument('--rpm', type=float, required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--gain', type=float, default=1.0)
    a = ap.parse_args()

    loop = make_loop(decode(a.src), a.start, a.len, a.rpm)
    P = int(PAD * SR)
    if len(loop) <= P:
        sys.exit('循環太短，--len 至少要 0.3 秒')
    out = np.concatenate([loop[-P:], loop, loop[:P]])
    rms = float(np.sqrt(np.mean(loop ** 2))) or 1.0
    out = np.clip(out * (0.18 / rms), -0.98, 0.98).astype(np.float32)

    os.makedirs(ROOT, exist_ok=True)
    fn = f'{a.name}.m4a'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'aac', '-b:a', '64k', os.path.join(ROOT, fn)], input=out.tobytes(), check=True)

    mp = os.path.join(ROOT, 'manifest.json')
    m = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {'samples': []}
    m['samples'] = [s for s in m['samples'] if s['file'] != fn]
    entry = {'rpm': int(a.rpm) if a.rpm.is_integer() else a.rpm, 'file': fn, 'loop': [round(PAD, 4), round(PAD + len(loop) / SR, 4)]}
    if a.gain != 1.0:
        entry['gain'] = a.gain
    m['samples'].append(entry)
    m['samples'].sort(key=lambda s: s['rpm'])
    json.dump(m, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'{fn}: {len(loop) / SR:.3f} s loop, {os.path.getsize(os.path.join(ROOT, fn)) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
