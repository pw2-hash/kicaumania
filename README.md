# 🐱 Kicau Mania

> Tutup hidungmu — kucing langsung joget! Built with Next.js + love.

## Cara Deploy ke Vercel

### 1. Upload ke GitHub

```bash
# Di folder ini:
git init
git add .
git commit -m "🐱 Initial commit - Kicau Mania"
git branch -M main

# Buat repo baru di github.com, lalu:
git remote add origin https://github.com/USERNAME/kicaumania.git
git push -u origin main
```

### 2. Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → **New Project**
2. Import repo GitHub yang baru dibuat
3. Framework: **Next.js** (auto-detected)
4. Klik **Deploy** — selesai! 🎉

### 3. Cara Pakai

- Buka app di HP
- Izinkan akses kamera
- **Tutup hidung** dengan jari → kucing mulai joget + musik jalan! 🐱🎵
- Lepas tangan → kucing hilang, musik berhenti
- Tombol 🔄 kanan bawah untuk ganti kamera depan/belakang

## Cara Run Lokal

```bash
npm install
npm run dev
# Buka http://localhost:3000
```

> ⚠️ **Penting:** Kamera hanya jalan di HTTPS atau localhost.
> Vercel otomatis pakai HTTPS jadi aman.

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **MediaDevices API** (kamera)
- **Canvas API** (deteksi warna kulit / hidung)
- **WebM video** (kucing green screen yang sudah di-chroma key)
- **Web Audio API** (musik loop 0:04–0:14)

## Kredit

- Kucing joget: green screen cat meme
- Musik: DJ Kicau Mania Remix
