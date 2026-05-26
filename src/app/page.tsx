'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface CatInstance {
  id: number
  x: number
  y: number
  size: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  flip: boolean
  scale: number
  scaleDir: number
}

let catIdCounter = 0

// Sensitivity – adjust if needed
const MOTION_THRESH = 12       // Motion above this = hand moving
const STILL_THRESH = 4         // Motion below this = hand held still
const STABLE_FRAMES_REQUIRED = 6  // How many frames of stillness to confirm "closed"

type GestureState = 'waiting_cover' | 'covered' | 'waiting_open'

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const catsRef = useRef<CatInstance[]>([])
  const isActiveRef = useRef(false)
  const prevFrameData = useRef<Uint8ClampedArray | null>(null)
  const motionHistory = useRef<number[]>([])
  const gestureState = useRef<GestureState>('waiting_cover')
  const stableCounter = useRef(0)

  const [isActive, setIsActive] = useState(false)
  const [cats, setCats] = useState<CatInstance[]>([])
  const [flashColor, setFlashColor] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [beatPulse, setBeatPulse] = useState(false)
  const [debugInfo, setDebugInfo] = useState({ motion: 0, state: 'waiting' })
  const showDebug = false // set true to troubleshoot

  const startCamera = useCallback(async (facingMode: 'user' | 'environment') => {
    try {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(t => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (e) {
      console.error('Camera error:', e)
    }
  }, [])

  useEffect(() => {
    startCamera(facing)
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(t => t.stop())
      }
    }
  }, [facing, startCamera])

  const spawnCats = useCallback((count = 4) => {
    const newCats: CatInstance[] = Array.from({ length: count }, () => ({
      id: ++catIdCounter,
      x: Math.random() * 75 + 10,
      y: Math.random() * 70 + 10,
      size: 160 + Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 3,
      flip: Math.random() > 0.5,
      scale: 1,
      scaleDir: 1,
    }))
    catsRef.current = [...catsRef.current, ...newCats]
    setCats([...catsRef.current])
  }, [])

  const activateCats = useCallback(() => {
    if (isActiveRef.current) return
    isActiveRef.current = true
    setIsActive(true)
    setFlashColor('rgba(255,45,120,0.4)')
    setTimeout(() => setFlashColor(null), 150)
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = 4
      audio.play().catch(() => {})
    }
    spawnCats(4)
  }, [spawnCats])

  const deactivateCats = useCallback(() => {
    if (!isActiveRef.current) return
    isActiveRef.current = false
    setIsActive(false)
    audioRef.current?.pause()
    catsRef.current = []
    setCats([])
  }, [])

  // ─── GESTURE: CLOSE THEN OPEN NOSE ────
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      canvas.width = 80
      canvas.height = 120
      ctx.drawImage(video, 0, 0, 80, 120)

      // Center detection zone (nose area)
      const rx = 20, ry = 36, rw = 40, rh = 36
      let imageData: ImageData
      try {
        imageData = ctx.getImageData(rx, ry, rw, rh)
      } catch { return }

      const current = imageData.data

      if (!prevFrameData.current || prevFrameData.current.length !== current.length) {
        prevFrameData.current = new Uint8ClampedArray(current)
        return
      }

      const prev = prevFrameData.current
      let diff = 0
      const total = current.length / 4

      for (let i = 0; i < current.length; i += 4) {
        const dr = Math.abs(current[i] - prev[i])
        const dg = Math.abs(current[i + 1] - prev[i + 1])
        const db = Math.abs(current[i + 2] - prev[i + 2])
        diff += (dr + dg + db) / 3
      }

      const avgMotion = diff / total
      motionHistory.current.push(avgMotion)
      if (motionHistory.current.length > 5) motionHistory.current.shift()
      const smoothMotion = motionHistory.current.reduce((a, b) => a + b, 0) / motionHistory.current.length

      prevFrameData.current = new Uint8ClampedArray(current)

      if (showDebug) {
        setDebugInfo({ motion: Math.round(smoothMotion), state: gestureState.current })
      }

      // Gesture state machine
      switch (gestureState.current) {
        case 'waiting_cover':
          // If strong motion detected → hand moving in to cover
          if (smoothMotion > MOTION_THRESH) {
            gestureState.current = 'covered'
            stableCounter.current = 0
          }
          break

        case 'covered':
          // After motion, wait for hand to become still (holding over nose)
          if (smoothMotion < STILL_THRESH) {
            stableCounter.current++
            if (stableCounter.current >= STABLE_FRAMES_REQUIRED) {
              // Hand is now still covering nose → move to waiting for open
              gestureState.current = 'waiting_open'
              stableCounter.current = 0
            }
          } else {
            stableCounter.current = 0 // still moving, reset counter
          }
          break

        case 'waiting_open':
          // Now waiting for hand to move away (motion again)
          if (smoothMotion > MOTION_THRESH) {
            // Complete gesture: close then open → trigger toggle
            if (isActiveRef.current) {
              deactivateCats()
            } else {
              activateCats()
            }
            gestureState.current = 'waiting_cover'
            stableCounter.current = 0
          }
          break
      }
    }, 80)

    return () => clearInterval(interval)
  }, [activateCats, deactivateCats, showDebug])

  // Animate cats (unchanged)
  useEffect(() => {
    let frame: number
    let lastBeat = 0

    const animate = (time: number) => {
      if (!isActiveRef.current) return

      if (time - lastBeat > 480) {
        lastBeat = time
        setBeatPulse(p => !p)
        if (catsRef.current.length < 12 && Math.random() > 0.6) {
          spawnCats(1)
        }
      }

      catsRef.current = catsRef.current.map(cat => {
        let { x, y, vx, vy, rotation, rotSpeed, scale, scaleDir } = cat
        x += vx; y += vy; rotation += rotSpeed
        if (x < 5 || x > 88) vx *= -1
        if (y < 5 || y > 85) vy *= -1
        x = Math.max(5, Math.min(88, x))
        y = Math.max(5, Math.min(85, y))
        scale += scaleDir * 0.015
        if (scale > 1.25) scaleDir = -1
        if (scale < 0.85) scaleDir = 1
        return { ...cat, x, y, vx, vy, rotation, scale, scaleDir }
      })

      setCats([...catsRef.current])
      frame = requestAnimationFrame(animate)
    }

    if (isActive) frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [isActive, spawnCats])

  // Music loop
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const fn = () => { if (audio.currentTime >= 14) audio.currentTime = 4 }
    audio.addEventListener('timeupdate', fn)
    return () => audio.removeEventListener('timeupdate', fn)
  }, [])

  return (
    <div className="root">
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <audio ref={audioRef} src="/music.mp3" preload="auto" />
      <div className="stars" />

      <div className="cam-wrap">
        <video
          ref={videoRef}
          className="cam-video"
          playsInline muted autoPlay
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        {flashColor && <div className="flash" style={{ background: flashColor }} />}
        <div className={`cam-border ${isActive ? 'active' : ''} ${beatPulse ? 'beat' : ''}`} />

        {cats.map(cat => (
          <div
            key={cat.id}
            className="cat-wrap"
            style={{
              left: `${cat.x}%`,
              top: `${cat.y}%`,
              width: cat.size,
              height: cat.size,
              transform: `rotate(${cat.rotation}deg) scaleX(${cat.flip ? -1 : 1}) scale(${cat.scale})`,
            }}
          >
            <video src="/cat.webm" autoPlay loop muted playsInline className="cat-video" />
          </div>
        ))}

        {showDebug && (
          <div style={{
            position: 'absolute', bottom: 70, left: 10, zIndex: 99,
            background: 'rgba(0,0,0,0.75)', color: 'lime', fontSize: 11,
            padding: '6px 10px', borderRadius: 8, fontFamily: 'monospace'
          }}>
            <div>motion: {debugInfo.motion}</div>
            <div>state: {debugInfo.state}</div>
          </div>
        )}

        <button className="flip-btn" onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
        </button>
      </div>

      <div className={`status-badge ${isActive ? 'on' : 'off'}`}>
        {isActive ? '🐱 AKTIF!' : '😶 Tutup lalu buka hidung'}
      </div>

      <div className="title-wrap">
        <div className="title-main">KICAU MANIA</div>
        <div className="title-sub">Tutup hidung dengan tangan, lalu buka</div>
      </div>

      {isActive && (
        <div className="wave-wrap">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}

      <style jsx>{`
        .root {
          position: fixed; inset: 0; background: #0a0a0f;
          display: flex; align-items: center; justify-content: center; overflow: hidden;
        }
        .stars {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 20%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(2px 2px at 10% 60%, rgba(0,255,225,0.3) 0%, transparent 100%),
            radial-gradient(2px 2px at 90% 40%, rgba(255,45,120,0.3) 0%, transparent 100%);
        }
        .cam-wrap {
          position: relative; width: min(420px, 94vw); height: min(750px, 88vh);
          border-radius: 28px; overflow: hidden;
          box-shadow: 0 0 0 2px rgba(255,45,120,0.3), 0 0 40px rgba(255,45,120,0.2), 0 20px 60px rgba(0,0,0,0.7);
        }
        .cam-video {
          position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
        }
        .flash {
          position: absolute; inset: 0; z-index: 10; pointer-events: none;
          animation: flashFade 0.15s ease-out forwards;
        }
        @keyframes flashFade { from { opacity: 1; } to { opacity: 0; } }
        .cam-border {
          position: absolute; inset: 0; border-radius: 28px;
          pointer-events: none; border: 3px solid transparent;
          transition: border-color 0.2s, box-shadow 0.2s; z-index: 5;
        }
        .cam-border.active {
          border-color: #ff2d78;
          box-shadow: inset 0 0 30px rgba(255,45,120,0.25), 0 0 30px rgba(255,45,120,0.5);
        }
        .cam-border.active.beat {
          box-shadow: inset 0 0 50px rgba(255,45,120,0.45), 0 0 60px rgba(255,45,120,0.8);
        }
        .cat-wrap {
          position: absolute; transform-origin: center center;
          z-index: 20; pointer-events: none;
          filter: drop-shadow(0 0 14px rgba(255,45,120,0.9));
        }
        .cat-video { width: 100%; height: 100%; object-fit: contain; }
        .flip-btn {
          position: absolute; bottom: 18px; right: 18px; z-index: 30;
          background: rgba(255,255,255,0.15); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.25); color: white;
          width: 44px; height: 44px; border-radius: 50%; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s, transform 0.15s;
        }
        .flip-btn:active { transform: scale(0.9); }
        .status-badge {
          position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
          padding: 8px 20px; border-radius: 999px;
          font-family: 'Boogaloo', cursive; font-size: 1.1rem;
          letter-spacing: 0.05em; z-index: 50; transition: all 0.3s; white-space: nowrap;
        }
        .status-badge.off {
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.6);
        }
        .status-badge.on {
          background: linear-gradient(135deg, #ff2d78, #c93fff);
          color: white; box-shadow: 0 0 20px rgba(255,45,120,0.6);
          animation: badgePop 0.3s ease-out;
        }
        @keyframes badgePop {
          0% { transform: translateX(-50%) scale(0.8); }
          60% { transform: translateX(-50%) scale(1.1); }
          100% { transform: translateX(-50%) scale(1); }
        }
        .title-wrap {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          text-align: center; z-index: 50;
        }
        .title-main {
          font-family: 'Boogaloo', cursive; font-size: 1.5rem;
          color: #00ffe1; letter-spacing: 0.15em;
          text-shadow: 0 0 15px rgba(0,255,225,0.7);
        }
        .title-sub { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 2px; }
        .wave-wrap {
          position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 4px; align-items: flex-end; height: 24px; z-index: 50;
        }
        .wave-bar {
          width: 4px; border-radius: 2px;
          background: linear-gradient(to top, #ff2d78, #ffe600);
          animation: waveDance 0.5s ease-in-out infinite alternate;
          box-shadow: 0 0 6px rgba(255,45,120,0.8);
        }
        @keyframes waveDance {
          from { height: 4px; opacity: 0.5; }
          to { height: 24px; opacity: 1; }
        }
      `}</style>
    </div>
  )
}
