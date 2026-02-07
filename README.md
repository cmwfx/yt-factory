# AI YouTube Video Factory

A production-ready Next.js 14 application that fully automates AI-powered YouTube video creation. The system handles idea generation, script writing, scene planning, image generation, audio synthesis, transcription, and video rendering.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup Guide](#detailed-setup-guide)
  - [1. PostgreSQL Database Setup](#1-postgresql-database-setup)
  - [2. FFmpeg Installation](#2-ffmpeg-installation)
  - [3. API Keys](#3-api-keys)
  - [4. Style Reference Image](#4-style-reference-image)
  - [5. Environment Configuration](#5-environment-configuration)
  - [6. Initialize Database](#6-initialize-database)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Idea Generation**: AI generates unique video topics based on channel theme
- **Script Writing**: ~1600 word scripts with scene breaks using Gemini
- **Scene Breakdown**: Converts script to structured visual scenes with image prompts
- **Image Generation**: Creates consistent editorial-style illustrations using Gemini image generation
- **Voice Synthesis**: Natural TTS narration using Gemini TTS
- **Transcription**: Word-level timestamps via AssemblyAI
- **Video Rendering**: FFmpeg-powered rendering with Ken Burns zoom effects and captions
- **Retry & Resume**: Recover from any failed step without restarting

---

## Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- PostgreSQL 14+ ([Download](https://www.postgresql.org/download/))
- FFmpeg ([Download](https://ffmpeg.org/download.html))
- Google AI (Gemini) API key
- AssemblyAI API key
- Style reference image (PNG/JPEG)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your settings (see detailed guide below)

# 4. Initialize database
npm run db:push

# 5. Start development server
npm run dev

# 6. Open http://localhost:3000
```

---

## Detailed Setup Guide

### 1. PostgreSQL Database Setup

#### Option A: Install PostgreSQL on Windows

1. **Download PostgreSQL installer**
   - Go to: https://www.postgresql.org/download/windows/
   - Click "Download the installer"
   - Choose the latest version (e.g., PostgreSQL 16)

2. **Run the installer**
   - Run the downloaded `.exe` file
   - Click "Next" through the wizard
   - **Installation Directory**: Keep default or choose your own
   - **Select Components**: Keep all selected (PostgreSQL Server, pgAdmin 4, Stack Builder, Command Line Tools)
   - **Data Directory**: Keep default
   - **Password**: Set a password for the `postgres` superuser (REMEMBER THIS!)
   - **Port**: Keep default `5432`
   - **Locale**: Keep default
   - Click "Next" and "Finish"

3. **Create the database**

   Open **pgAdmin 4** (installed with PostgreSQL) or use command line:

   **Using pgAdmin 4:**
   - Open pgAdmin 4 from Start Menu
   - Enter your master password if prompted
   - Expand "Servers" → Right-click "PostgreSQL 16" → "Connect"
   - Enter the password you set during installation
   - Right-click "Databases" → "Create" → "Database..."
   - Database name: `youtube_factory`
   - Click "Save"

   **Using Command Line (PowerShell as Admin):**
   ```powershell
   # Open psql
   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

   # Enter password when prompted, then run:
   CREATE DATABASE youtube_factory;
   \q
   ```

4. **Update your .env file**
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/youtube_factory"
   ```
   Replace `YOUR_PASSWORD` with the password you set during installation.

#### Option B: Use Docker (Alternative)

If you have Docker installed:

```bash
# Start PostgreSQL container
docker run --name youtube-factory-db \
  -e POSTGRES_PASSWORD=mysecretpassword \
  -e POSTGRES_DB=youtube_factory \
  -p 5432:5432 \
  -d postgres:16

# Your DATABASE_URL will be:
# DATABASE_URL="postgresql://postgres:mysecretpassword@localhost:5432/youtube_factory"
```

#### Option C: Use a Cloud Database

You can use a managed PostgreSQL service:
- [Supabase](https://supabase.com/) (Free tier available)
- [Neon](https://neon.tech/) (Free tier available)
- [Railway](https://railway.app/)
- [Render](https://render.com/)

Copy the connection string they provide into your `.env` file.

---

### 2. FFmpeg Installation

FFmpeg is required for video rendering.

#### Windows Installation

**Option A: Using winget (Recommended)**
```powershell
winget install FFmpeg
```

**Option B: Using Chocolatey**
```powershell
choco install ffmpeg
```

**Option C: Manual Installation**
1. Download from: https://www.gyan.dev/ffmpeg/builds/
2. Download "ffmpeg-release-essentials.zip"
3. Extract to `C:\ffmpeg`
4. Add `C:\ffmpeg\bin` to your PATH:
   - Search "Environment Variables" in Windows
   - Click "Environment Variables..."
   - Under "System variables", find "Path"
   - Click "Edit" → "New"
   - Add `C:\ffmpeg\bin`
   - Click "OK" on all dialogs
5. Restart your terminal

**Verify installation:**
```powershell
ffmpeg -version
```

---

### 3. API Keys

#### Google AI (Gemini) API Key

1. Go to: https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy the key to your `.env` file:
   ```env
   GOOGLE_GENAI_API_KEY=your-api-key-here
   ```

#### AssemblyAI API Key

1. Go to: https://www.assemblyai.com/
2. Sign up for a free account
3. Go to your dashboard
4. Copy your API key to your `.env` file:
   ```env
   ASSEMBLYAI_API_KEY=your-assemblyai-key-here
   ```

---

### 4. Style Reference Image

The style reference image ensures visual consistency across all generated scene images.

1. **Create or find a reference image** that represents your desired visual style:
   - Editorial minimalist illustration
   - Textured paper background
   - Thin black ink lines
   - Muted, desaturated colors

2. **Save the image** to the `assets` folder:
   ```
   yt-factory/assets/style-reference.png
   ```
   (or `.jpeg` - update the path in `.env` accordingly)

3. **Update .env**:
   ```env
   STYLE_REFERENCE_PATH=./assets/style-reference.png
   ```

---

### 5. Environment Configuration

Create your `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` with all your settings:

```env
# Database - Update with your PostgreSQL credentials
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/youtube_factory"

# Google AI - Your Gemini API key
GOOGLE_GENAI_API_KEY=your-gemini-api-key

# AssemblyAI - Your AssemblyAI API key
ASSEMBLYAI_API_KEY=your-assemblyai-key

# Assets - Path to your style reference image
STYLE_REFERENCE_PATH=./assets/style-reference.png

# Configuration
GENERATE_IDEAS=0
TEST_MODE=true
JOBS_OUTPUT_DIR=./public/jobs
```

---

### 6. Initialize Database

After PostgreSQL is running and your `.env` is configured:

```bash
# Push the Prisma schema to create tables
npm run db:push
```

You should see:
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "youtube_factory"

Your database is now in sync with your Prisma schema.
```

**Optional: View your database**
```bash
npm run db:studio
```
This opens Prisma Studio at http://localhost:5555 where you can browse your data.

---

## Usage

### Web Interface

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000

3. Click "Check Health" to verify all systems are working:
   - **Database**: Should show "ok"
   - **FFmpeg**: Should show "ok"

4. To generate a video:
   - Check "Generate new ideas first" (if you have no ideas yet)
   - Check "Test mode" for a quick 3-scene test
   - Click "Start Job"

### CLI Commands

```bash
# Run with existing idea
npm run job

# Generate ideas first, then run
npm run job:ideas

# Test mode (3 scenes only - faster)
npm run job:test

# Retry a failed job from a specific step
npx tsx scripts/runJob.ts --retry VIDEO_ID --from images
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/jobs/start` | POST | Start a new video job |
| `/api/jobs/retry` | POST | Retry a failed job |
| `/api/ideas/generate` | POST | Generate new video ideas |
| `/api/ideas/generate` | GET | List all ideas |

---

## Troubleshooting

### Database Connection Error (503)

**Symptoms:** Health check shows database error, 503 status

**Solutions:**
1. Make sure PostgreSQL is running:
   - Windows: Check "Services" app for "postgresql-x64-16"
   - Or run: `pg_isready -h localhost -p 5432`

2. Verify your DATABASE_URL in `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/youtube_factory"
   ```

3. Make sure the database exists:
   ```bash
   npm run db:push
   ```

4. Test the connection:
   ```bash
   npx prisma db pull
   ```

### FFmpeg Not Found

**Symptoms:** Health check shows FFmpeg "missing"

**Solutions:**
1. Verify FFmpeg is installed:
   ```bash
   ffmpeg -version
   ```

2. If not found, install it (see [FFmpeg Installation](#2-ffmpeg-installation))

3. Restart your terminal after adding to PATH

### API Key Errors

**Symptoms:** Jobs fail at script/image/audio generation

**Solutions:**
1. Verify your API keys are correct in `.env`
2. Check you have API access/credits:
   - Gemini: https://aistudio.google.com/
   - AssemblyAI: https://www.assemblyai.com/app

### Style Reference Not Found

**Symptoms:** Image generation fails

**Solutions:**
1. Make sure the image exists at the path in `STYLE_REFERENCE_PATH`
2. Use an absolute path if relative path doesn't work:
   ```env
   STYLE_REFERENCE_PATH=C:/Users/william/Desktop/Projects/YT automation/yt-factory/assets/style-reference.png
   ```

---

## Pipeline Steps

1. **Ideas** (optional): Generate 10 unique video topics
2. **Pick Idea**: Select oldest unused idea
3. **Scripting**: Generate ~1600 word script with [SCENE_BREAK] markers
4. **Scenes**: Convert script to structured scene array with image prompts
5. **Images**: Generate images for each scene (1920x1080, 16:9)
6. **Audio**: Generate TTS narration (24kHz WAV)
7. **Transcribe**: Get word-level timestamps
8. **Align**: Match scene timings to transcript (1-6s per scene)
9. **Render**: FFmpeg compositing with zoom effects and burned-in captions

---

## Output

Each job creates a directory at `public/jobs/{videoId}/` containing:

- `script.txt` - Full narration script
- `scene_meta.json` - Scene breakdown
- `scene_XXX.png` - Scene images
- `audio.wav` - TTS narration
- `captions.json` - Word timestamps
- `scene_meta_aligned.json` - Aligned scenes with timings
- `final.mp4` - Rendered video

---

## License

MIT
