'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Cat overlay type ────────────────────────────────────────────────────────
interface CatInstance {
  id: number
  x: number      // % from left
  y: number      // % from top
  size: number   // px
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  flip: boolean
  scale: number
  scaleDir: number
}

let catIdCounter = 0

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const animRef = useRef<number>(0)
  const catsRef = useRef<CatInstance[]>([])
  const isActiveRef = useRef(false)
  const [isActive, setIsActive] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [cats, setCats] = useState<CatInstance[]>([])
  const [flashColor, setFlashColor] = useState<string | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [beatPulse, setBeatPulse] = useState(false)

  // ─── Nose detection via MediaPipe landmark heuristic ──────────────────────
  // We detect if a hand is near the nose region using skin tone + position
  const noseClosed = useRef(false)
  const lastNoseState = useRef(false)
  const baselineSkin = useRef<number | null>(null)
  const calibrationFrames = useRef(0)

  // ─── Start camera ─────────────────────────────────────────────────────────
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
        setIsReady(true)
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
  }, [facing])

  // ─── Nose detection: sample center region for skin + hand presence ─────────
  const detectNose = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
  
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
  
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  
    const w = canvas.width
    const h = canvas.height
    const rx = Math.floor(w * 0.35)
    const ry = Math.floor(h * 0.35)
    const rw = Math.floor(w * 0.30)
    const rh = Math.floor(h * 0.22)
  
    let imageData: ImageData
    try {
      imageData = ctx.getImageData(rx, ry, rw, rh)
    } catch { return }
  
    const data = imageData.data
    let brightness = 0
    const total = data.length / 4
  
    for (let i = 0; i < data.length; i += 4) {
      brightness += (data[i] + data[i + 1] + data[i + 2]) / 3
    }
    const avgBrightness = brightness / total
  
    // Build stable baseline over first 40 frames (no touching)
    if (calibrationFrames.current < 40) {
      calibrationFrames.current++
      if (baselineSkin.current === null) {
        baselineSkin.current = avgBrightness
      } else {
        baselineSkin.current = baselineSkin.current * 0.9 + avgBrightness * 0.1
      }
      return
    }
  
    // Slowly update baseline when NOT covered (prevents drift)
    const baseline = baselineSkin.current ?? avgBrightness
    
    // Hand covering nose = brightness DROPS significantly (darker)
    const nowClosed = avgBrightness < baseline - 30
  
    // Update baseline slowly only when not triggered
    if (!nowClosed) {
      baselineSkin.current = baseline * 0.98 + avgBrightness * 0.02
    }
  
    noseClosed.current = nowClosed
  
    if (nowClosed !== lastNoseState.current) {
      lastNoseState.current = nowClosed
      if (nowClosed) {
        activateCats()
      } else {
        deactivateCats()
      }
    }
  }, [])

  // ─── Spawn cats ─────────────────────────────────────────────────────────────
  const spawnCats = useCallback((count = 5) => {
    const newCats: CatInstance[] = Array.from({ length: count }, () => ({
      id: ++catIdCounter,
      x: Math.random() * 80 + 10,
      y: Math.random() * 70 + 10,
      size: 160 + Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
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

    // Flash effect
    setFlashColor('rgba(255,45,120,0.4)')
    setTimeout(() => setFlashColor(null), 150)

    // Music
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = 4
      audio.play().catch(() => {})
    }

    // Spawn initial cats
    spawnCats(4)

    // Keep spawning more while active
  }, [spawnCats])

  const deactivateCats = useCallback(() => {
    isActiveRef.current = false
    setIsActive(false)
    audioRef.current?.pause()
    catsRef.current = []
    setCats([])
  }, [])

  // ─── Animate cats ────────────────────────────────────────────────────────
  useEffect(() => {
    let frame: number
    let lastBeat = 0

    const animate = (time: number) => {
      if (!isActiveRef.current) { animRef.current = 0; return }

      // Beat pulse every ~500ms
      if (time - lastBeat > 480) {
        lastBeat = time
        setBeatPulse(p => !p)

        // Occasionally spawn more cats
        if (catsRef.current.length < 12 && Math.random() > 0.6) {
          spawnCats(1)
        }
      }

      // Move cats
      catsRef.current = catsRef.current.map(cat => {
        let { x, y, vx, vy, rotation, rotSpeed, scale, scaleDir } = cat

        x += vx
        y += vy
        rotation += rotSpeed

        // Bounce off walls
        if (x < 5 || x > 90) vx *= -1
        if (y < 5 || y > 85) vy *= -1
        x = Math.max(5, Math.min(90, x))
        y = Math.max(5, Math.min(85, y))

        // Pulse scale (jedug!)
        scale += scaleDir * 0.015
        if (scale > 1.25) scaleDir = -1
        if (scale < 0.85) scaleDir = 1

        return { ...cat, x, y, vx, vy, rotation, scale, scaleDir }
      })

      setCats([...catsRef.current])
      frame = requestAnimationFrame(animate)
    }

    if (isActive) {
      frame = requestAnimationFrame(animate)
    }
    return () => cancelAnimationFrame(frame)
  }, [isActive, spawnCats])

  // ─── Detection loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(detectNose, 80)
    return () => clearInterval(interval)
  }, [detectNose])

  // ─── Music loop at 0:04–0:14 ─────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      if (audio.currentTime >= 14) {
        audio.currentTime = 4
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [])

  const toggleCamera = () => {
    setFacing(f => f === 'user' ? 'environment' : 'user')
  }

  return (
    <div className="root">
      {/* Hidden canvas for detection */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Audio */}
      <audio ref={audioRef} src="/music.mp3" preload="auto" />

      {/* Background stars */}
      <div className="stars" />

      {/* Camera feed */}
      <div className="cam-wrap">
        <video
          ref={videoRef}
          className="cam-video"
          playsInline
          muted
          autoPlay
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        {/* Flash overlay */}
        {flashColor && (
          <div className="flash" style={{ background: flashColor }} />
        )}

        {/* Beat border pulse */}
        <div className={`cam-border ${isActive ? 'active' : ''} ${beatPulse ? 'beat' : ''}`} />

        {/* Dancing cats */}
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
            <video
              src="/cat.webm"
              autoPlay
              loop
              muted
              playsInline
              className="cat-video"
            />
            <div className="cat-glow" />
          </div>
        ))}

        {/* Camera flip button */}
        <button className="flip-btn" onClick={toggleCamera} title="Flip camera">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
        </button>
      </div>

      {/* Status badge */}
      <div className={`status-badge ${isActive ? 'on' : 'off'}`}>
        {isActive ? '🐱 AKTIF!' : '😶 Tutup hidung...'}
      </div>

      {/* Title */}
      <div className="title-wrap">
        <div className="title-main">KICAU MANIA</div>
        <div className="title-sub">Tutup hidungmu 👃→🤫</div>
      </div>

      {/* Wave visualizer when active */}
      {isActive && (
        <div className="wave-wrap">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .root {
          position: fixed;
          inset: 0;
          background: #0a0a0f;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .stars {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 20%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.2) 0%, transparent 100%),
            radial-gradient(2px 2px at 10% 60%, rgba(0,255,225,0.3) 0%, transparent 100%),
            radial-gradient(2px 2px at 90% 40%, rgba(255,45,120,0.3) 0%, transparent 100%);
          pointer-events: none;
        }

        .cam-wrap {
          position: relative;
          width: min(420px, 94vw);
          height: min(750px, 88vh);
          border-radius: 28px;
          overflow: hidden;
          box-shadow:
            0 0 0 2px rgba(255,45,120,0.3),
            0 0 40px rgba(255,45,120,0.2),
            0 20px 60px rgba(0,0,0,0.7);
        }

        .cam-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .flash {
          position: absolute;
          inset: 0;
          z-index: 10;
          pointer-events: none;
          animation: flashFade 0.15s ease-out forwards;
        }

        @keyframes flashFade {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        .cam-border {
          position: absolute;
          inset: 0;
          border-radius: 28px;
          pointer-events: none;
          border: 3px solid transparent;
          transition: border-color 0.2s, box-shadow 0.2s;
          z-index: 5;
        }

        .cam-border.active {
          border-color: #ff2d78;
          box-shadow: inset 0 0 30px rgba(255,45,120,0.25), 0 0 30px rgba(255,45,120,0.5);
        }

        .cam-border.active.beat {
          box-shadow: inset 0 0 50px rgba(255,45,120,0.45), 0 0 60px rgba(255,45,120,0.8);
        }

        .cat-wrap {
          position: absolute;
          transform-origin: center center;
          z-index: 20;
          pointer-events: none;
          filter: drop-shadow(0 0 12px rgba(255,45,120,0.8));
        }

        .cat-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .cat-glow {
          position: absolute;
          inset: 20%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,230,0,0.15) 0%, transparent 70%);
          animation: glow 0.5s alternate infinite;
        }

        @keyframes glow {
          from { opacity: 0.4; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1.1); }
        }

        .flip-btn {
          position: absolute;
          bottom: 18px;
          right: 18px;
          z-index: 30;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.25);
          color: white;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, transform 0.15s;
        }

        .flip-btn:active {
          transform: scale(0.9);
          background: rgba(255,255,255,0.25);
        }

        .status-badge {
          position: fixed;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 20px;
          border-radius: 999px;
          font-family: 'Boogaloo', cursive;
          font-size: 1.1rem;
          letter-spacing: 0.05em;
          z-index: 50;
          transition: all 0.3s;
          white-space: nowrap;
        }

        .status-badge.off {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.6);
        }

        .status-badge.on {
          background: linear-gradient(135deg, #ff2d78, #c93fff);
          border: none;
          color: white;
          box-shadow: 0 0 20px rgba(255,45,120,0.6);
          animation: badgePop 0.3s ease-out;
        }

        @keyframes badgePop {
          0% { transform: translateX(-50%) scale(0.8); }
          60% { transform: translateX(-50%) scale(1.1); }
          100% { transform: translateX(-50%) scale(1); }
        }

        .title-wrap {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          z-index: 50;
        }

        .title-main {
          font-family: 'Boogaloo', cursive;
          font-size: 1.5rem;
          color: #00ffe1;
          letter-spacing: 0.15em;
          text-shadow: 0 0 15px rgba(0,255,225,0.7);
        }

        .title-sub {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.4);
          margin-top: 2px;
          letter-spacing: 0.08em;
        }

        .wave-wrap {
          position: fixed;
          bottom: 72px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 4px;
          align-items: flex-end;
          height: 24px;
          z-index: 50;
        }

        .wave-bar {
          width: 4px;
          border-radius: 2px;
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
