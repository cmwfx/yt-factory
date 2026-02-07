# YT Factory: Strategic Audit & Future Roadmap

**Document Version:** 1.0
**Date:** 2026-02-06
**Status:** Audit Complete - Ready for Implementation

---

## Executive Summary

YT Factory is a sophisticated video automation platform with a 9-step pipeline generating videos at **$1.73-4.37 each**. This audit reveals strong foundations but identifies critical opportunities for quality improvement, multi-language expansion, and scaling to multiple channels.

### Key Findings

- **88% profit margin** at target scale (400 videos/month × 4 languages)
- Translation architecture can reduce per-language costs by **70%** ($0.92 vs $2.42)
- VPS 40 ($20.80/mo) enables **3× concurrent generation** (150 videos/day capacity)
- **15 hard-coded prompts** ready for extraction to frontend editor
- Scene classification system enables intelligent image reuse across languages

### Business Viability

| Metric | Current | At Scale (400 videos/mo) |
|--------|---------|--------------------------|
| Monthly Cost | $125 | $551 |
| Videos/Month | 50 (EN only) | 400 (100 × 4 languages) |
| Revenue (@ $4 CPM, 3K views) | $600 | $4,800 |
| Profit Margin | 79% | **88%** |
| Breakeven | 1,750 views/video | 1,750 views/video |

---

## Table of Contents

1. [Current System Architecture](#1-current-system-architecture)
2. [Cost Analysis](#2-cost-analysis)
3. [Quality Improvement Opportunities](#3-quality-improvement-opportunities)
4. [Multi-Language Strategy](#4-multi-language-strategy)
5. [Multi-Channel Management](#5-multi-channel-management)
6. [Infrastructure Scaling](#6-infrastructure-scaling)
7. [Editable Prompt System](#7-editable-prompt-system)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Risk Assessment](#9-risk-assessment)
10. [Success Metrics](#10-success-metrics)

---

## 1. Current System Architecture

### 1.1 Video Generation Pipeline

**9 Sequential Steps:**

1. **Generate Ideas** → Gemini creates 10 video ideas with deduplication
2. **Pick Idea** → Selects unused idea, creates Video record
3. **Generate Script** → 5-section narrative (1500 words target)
   - Hook (150-200 words)
   - Villain Reveal (250-320 words)
   - Mechanism (410-500 words)
   - Consequence (310-390 words)
   - Takeaway (180-250 words)
4. **Break Into Scenes** → ~40 scenes with visual prompts
5. **Generate Images** → 40 PNG files (1920×1080, stick figures on crumpled paper)
6. **Generate Audio** → Single TTS call for entire script (Gemini voice: Charon)
7. **Transcribe** → AssemblyAI word-level timestamps
8. **Align Scenes** → Sequential word consumption with fuzzy matching (75% threshold)
9. **Render Video** → FFmpeg assembly, final.mp4 output

**Timing:** 5-15 minutes per video
**Architecture:** Sequential (no parallelization), blocking API calls

### 1.2 Current Tech Stack

```
Backend:
- Next.js 16.1.6 (App Router)
- React 19.2.3
- Prisma 5 + PostgreSQL
- TypeScript 5

AI Services:
- Google Generative AI (Gemini)
- AssemblyAI (transcription)

Frontend:
- Tailwind CSS 4 (PostCSS)
- SSE for real-time progress

Workers:
- scriptWorker.ts
- sceneWorker.ts
- imageWorker.ts
- audioWorker.ts
- transcribeWorker.ts
- alignWorker.ts
- renderWorker.ts
- pipeline.ts (orchestration)
```

### 1.3 Database Schema (Current)

```prisma
model Video {
  id              String      @id @default(uuid())
  ideaId          String?
  title           String
  status          VideoStatus
  script          String?
  costCents       Int?
  costBreakdown   Json?       // { geminiText, geminiTTS, geminiImage, assemblyAI }
  reviewData      Json?       // { adjustments, regeneratedImages, averageConfidence }
  createdAt       DateTime
  updatedAt       DateTime
}

model Step {
  videoId    String
  step       StepName
  status     StepStatus
  error      String?
  startedAt  DateTime?
  finishedAt DateTime?
}
```

**Missing:** Channel support, language tracking, prompt versioning, quality metrics storage

---

## 2. Cost Analysis

### 2.1 Cost Breakdown Per Video (English)

| Component | Cost Model | Estimate | % of Total |
|-----------|-----------|----------|------------|
| **Gemini Text** (script + scenes) | $1.25/1M in, $5/1M out | $0.18-0.42 | 10-12% |
| **Gemini TTS** | $0.15/1M in, $3.50/1M out | $0.15-0.25 | 9-11% |
| **Gemini Images** | $0.04/image + tokens | **$1.20-3.20** | **70-75%** ⚠️ |
| **AssemblyAI** | $0.00025/second | $0.015-0.50 | 1-14% |
| **TOTAL** | | **$1.73-4.37** | 100% |

**Critical Insight:** Images are 70-75% of total cost. This is the highest ROI target for optimization.

### 2.2 Translation Cost Model

**English Source Video (40 scenes):**
- Text: $0.20
- TTS: $0.20
- Images: $2.00 (40 × $0.05)
- Transcribe: $0.015
- **Total: $2.415**

**Translation (with intelligent scene reuse - 30% text-heavy):**
- Script translation: $0.10 (batched, 10 scenes per API call)
- TTS (target language): $0.20
- Images (12 text-heavy scenes only): **$0.60**
- Images reused (28 visual-only): **$0** ✅
- Transcribe: $0.015
- **Total: $0.915** ✅ **62% savings vs full regeneration**

**4-Language Set (EN + ES + FR + DE):**
- 1× English: $2.415
- 3× Translations: $2.745
- **Total: $5.16** ✅ **Under $7 target**

### 2.3 Cost Optimization Opportunities

1. **Reduce Scene Count** (40 → 35 scenes)
   - Savings: $0.20-0.25 per video
   - Trade-off: Slightly less granular visuals

2. **Image Reuse Cache** (10-20% reusable scenes)
   - Savings: $0.08-0.40 per video
   - Implementation: Perceptual hashing + prompt normalization

3. **Translation Caching** (10-15% scene overlap in similar videos)
   - Savings: $0.10-0.15 per translation
   - Implementation: MD5 hash lookup

4. **Lazy Translation** (only translate winners)
   - Savings: 20-30% (don't translate flop videos)
   - Trigger: Translate if English video hits 1K views in 24 hours

---

## 3. Quality Improvement Opportunities

### 3.1 Script Quality Enhancements

#### Issue 1: Mechanical Scene Breaks
- **Current:** "Every 8-15 words" regardless of meaning
- **Fix:** Parse sentences first, prioritize clause boundaries
- **Impact:** More natural pacing, better visual coherence

#### Issue 2: Section Coherence
- **Current:** 5 sections generated independently, then concatenated
- **Fix:** Add final "coherence pass" prompt to smooth transitions
- **Impact:** Reduces jarring tone shifts between sections

#### Issue 3: Metadata Comes Last
- **Current:** CTR-optimized titles generated after script
- **Fix:** Generate metadata first, use keywords to guide script
- **Impact:** Better alignment with search intent

#### Issue 4: No Retry Context
- **Current:** Section retries restart from scratch (lose creative direction)
- **Fix:** Pass previous attempt as "what didn't work" context
- **Impact:** Better output on retry attempts

### 3.2 Image Quality Improvements

#### Issue 1: Text-in-Image Not Tracked
- **Current:** Can't identify which scenes have overlay text
- **Fix:** Make `overlayText` field required (not nullable), force Gemini to decide
- **Impact:** Enables intelligent translation (only regen text scenes)

#### Issue 2: Static Character Library
- **Current:** Same 3 characters for all niches
- **Fix:** Per-channel character definitions in database
- **Impact:** "Tech Teardown" channel uses different visual metaphors than "Scam Exposer"

#### Issue 3: Background Texture Inconsistency
- **Current:** ~60-70% compliance with paper texture requirement
- **Fix:** Use vision model to validate texture, auto-retry if flat
- **Impact:** Consistent brand aesthetic

#### Issue 4: No Quality Scoring
- **Current:** Can't identify failed generations automatically
- **Fix:** Run lightweight classifier on images, flag scores <80%
- **Impact:** Catch visual issues before render step

### 3.3 Audio-Visual Sync Optimization

#### Issue 1: Early Drift Compounds
- **Current:** No backtracking if alignment fails
- **Fix:** Sliding window backtrack (try N-2 or N+2 words)
- **Impact:** Recover from transcription errors mid-video

#### Issue 2: Confidence Scores Lost
- **Current:** `averageMatchScore` calculated but not stored
- **Fix:** Save to `Video.reviewData` in database
- **Impact:** Track alignment quality over time, identify problem videos

#### Issue 3: No Transcription Caching
- **Current:** Re-transcribe identical audio
- **Fix:** Cache by audio MD5 hash
- **Impact:** Free transcriptions for regenerated scenes

### 3.4 Workflow Efficiency Gains

**Bottleneck 1: Sequential Step Execution**
- **Fix:** Parallelize independent operations (metadata generation during render)
- **Impact:** 20-30% faster overall pipeline

**Bottleneck 2: Image Generation (3-5 minutes)**
- **Fix 1:** Optimize scene count (30-35 instead of 40 → saves $0.40-0.60)
- **Fix 2:** Image reuse cache (10-20% reusable → saves $0.08-0.40)
- **Impact:** Primary cost driver, highest ROI target

**Bottleneck 3: No Job Queue**
- **Fix:** Implement BullMQ (Redis-backed queue)
- **Impact:** Enables concurrent generation, graceful failure handling

**Bottleneck 4: Local Filesystem Storage**
- **Fix:** Migrate to S3/Cloudflare R2
- **Impact:** Cloud-ready, CDN integration, automatic backups

---

## 4. Multi-Language Strategy

### 4.1 Scene Classification System

**Goal:** Identify which scenes need regeneration vs reuse

**Approach (Recommended):**
```typescript
// Modify geminiScenes.ts schema:
interface Scene {
  sceneIndex: number;
  text: string;                    // Narration (LANGUAGE-SPECIFIC)
  wordCount: number;
  nanoPrompt: string;              // Image generation instructions
  referenceImageIndex: number;     // Points to earlier scene
  overlayText: string;             // REQUIRED: "2-5 word text" OR "NONE"
  visualType: "NEW_SCENE" | "CHARACTER_REACTION" | "OBJECT_FOCUS";
  characters: string[];
}

// Then classify in sceneWorker:
textHeavyScenes = scenes
  .filter(s => s.overlayText !== "NONE")
  .map(s => s.sceneIndex);

// Store in Video.textHeavyScenes JSON field: [0, 5, 12, 18, ...]
```

**Visual Type Distribution:**
- **NEW_SCENE (30%):** Full scene generation
- **CHARACTER_REACTION (60%):** Edit previous image (expression/pose only)
- **OBJECT_FOCUS (10%):** Zoom into detail

### 4.2 Translation Workflow

**New Worker: translationWorker.ts**

```typescript
async function translateVideo(sourceVideoId: string, targetLang: string) {
  // Step 1: Load source video + scenes
  const sourceVideo = await getVideo(sourceVideoId);
  const scenes = await loadJson(sourceVideoId, 'scene_meta.json');

  // Step 2: Translate script in batches (10 scenes per API call)
  const translatedScenes = await batchTranslateScenes(scenes, targetLang);

  // Step 3: Identify text-heavy scenes from classification
  const textHeavyIndices = sourceVideo.textHeavyScenes || [];

  // Step 4: Copy visual-only images (no API calls)
  for (const scene of scenes) {
    if (!textHeavyIndices.includes(scene.sceneIndex)) {
      await copyImage(sourceVideoId, newVideoId, scene.sceneIndex);
    }
  }

  // Step 5: Regenerate only text-heavy scenes
  for (const idx of textHeavyIndices) {
    await generateImage(translatedScenes[idx], newVideoId);
  }

  // Step 6: Generate audio in target language
  const audioResult = await runAudioWorker({
    videoId: newVideoId,
    script: translatedScenes.map(s => s.text).join('\n\n'),
    scenes: translatedScenes,
    voiceId: getVoiceForLanguage(targetLang),
  });

  // Step 7: Continue normal pipeline (transcribe, align, render)
  // ...
}
```

### 4.3 Script Translation Strategy

**Batch Translation (Recommended):**
```typescript
async function batchTranslateScenes(
  scenes: Scene[],
  targetLang: string
): Promise<Scene[]> {
  const batchSize = 10;
  const translatedScenes: Scene[] = [];

  for (let i = 0; i < scenes.length; i += batchSize) {
    const batch = scenes.slice(i, i + batchSize);

    const prompt = `Translate these ${batchSize} scenes to ${targetLang}:
- Maintain same word count (±10%)
- Preserve tone and emotion
- Keep [SCENE_BREAK] markers
- Translate overlayText separately

Scenes:
${batch.map((s, idx) => `
Scene ${i + idx}:
Text: ${s.text}
OverlayText: ${s.overlayText}
`).join('\n')}

Return JSON array with same structure.`;

    const result = await gemini.generateContent(prompt);
    translatedScenes.push(...JSON.parse(result));

    // Rate limiting
    if (i + batchSize < scenes.length) {
      await sleep(1500);
    }
  }

  return translatedScenes;
}
```

### 4.4 Language Configuration

**Database Schema (New):**
```prisma
model Language {
  id              String   @id @default(uuid())
  code            String   @unique // "en", "es", "fr", "de"
  name            String   // "English", "Spanish", "French", "German"
  voiceId         String   // TTS voice ID for this language
  wordsPerSecond  Float    @default(2.5) // Language-specific pacing
  personaPrompt   String?  @db.Text // Translated PERSONA_PROMPT
  isActive        Boolean  @default(true)
  videos          Video[]
}
```

**Voice Mapping:**
- English: Charon (current)
- Spanish: es-US-Neural2-A
- French: fr-FR-Neural2-A
- German: de-DE-Neural2-A

---

## 5. Multi-Channel Management

### 5.1 Database Schema (New Tables)

```prisma
model Channel {
  id                String          @id @default(uuid())
  name              String
  slug              String          @unique
  niche             String          // e.g., "financial scams", "tech teardowns"
  targetAudience    String          // e.g., "18-35 skeptics"
  toneProfile       String          // e.g., "savage", "moderate", "educational"
  styleReferenceUrl String?         // custom paper texture URL
  characterLibrary  Json?           // custom character definitions
  colorPalette      Json?           // brand colors
  isActive          Boolean         @default(true)
  prompts           ChannelPrompt[]
  videos            Video[]
}

model ChannelPrompt {
  id             String   @id @default(uuid())
  channelId      String
  promptType     String   // HOOK, VILLAIN_REVEAL, MECHANISM, etc.
  content        String   @db.Text // template with {{variables}}
  version        Int      @default(1)
  isActive       Boolean  @default(true)
  usageCount     Int      @default(0)
  avgCTR         Float?   // Average click-through rate
  avgRetention   Float?   // Average viewer retention
}
```

### 5.2 Per-Channel Customization

**Level 1: Brand Identity**
- Custom logo, colors, style reference image
- Different character libraries (e.g., tech channel uses robots instead of stick figures)

**Level 2: Content Strategy**
- Tone profile affects PERSONA_PROMPT rendering
- Target audience influences hook style selection
- Niche-specific section templates

**Level 3: Workflow Customization**
- Some channels skip manual review (auto-publish)
- Test mode for experimental channels (3 scenes only)
- Different scene count targets (tech = 50 scenes, finance = 40)

### 5.3 Resource Allocation

**Priority Queue:**
- High-priority channels (established, profitable) → priority 10
- Mid-priority (testing, growing) → priority 5
- Low-priority (experimental) → priority 1

**Quota System:**
- Channel A: 20 videos/day, $100 daily budget
- Channel B: 10 videos/day, $50 daily budget
- Auto-pause if quota exceeded

---

## 6. Infrastructure Scaling

### 6.1 VPS Hosting Recommendation

**Recommended: Cloud VPS 40 ($20.80/month)**

**Specifications:**
- **12 vCPU cores** → 3 workers × 4 cores each
- **48GB RAM** → 16GB per worker (generous headroom)
- **250GB NVMe** → ~500 videos local storage
- **800 Mbit/s port** → sufficient for API traffic

**Concurrent Video Target:** 3 simultaneous generations
- 50 videos/day ÷ 3 concurrent = 17 batches
- 17 batches × 15 min = ~6 hours generation time
- Leaves 18 hours buffer

**Why Not VPS 30 ($12/month)?**
- 8 vCPU = only 2 concurrent videos
- 24GB RAM = tighter margins (12GB/worker)
- Good for MVP, but will need upgrade soon

**Why Not VPS 50/60 ($36-47/month)?**
- Overkill for current scale
- Better to scale horizontally (2× VPS 40) at 100+ videos/day

### 6.2 BullMQ Job Queue Architecture

**Why BullMQ:**
- Redis-backed (persistent, survives crashes)
- Built-in retry logic with exponential backoff
- Rate limiting per queue
- Progress tracking (integrates with existing SSE)
- Horizontal scaling (add more workers)

**Queue Structure:**
```typescript
videoQueue (orchestration)
├─ scriptQueue (text generation)
├─ imageQueue (image generation, rate-limited to 1/sec)
├─ audioQueue (TTS)
└─ renderQueue (FFmpeg)
```

**Worker Configuration:**
```typescript
const worker = new Worker('imageQueue', async (job) => {
  // Process image generation
}, {
  concurrency: 3,           // 3 videos simultaneously
  limiter: {
    max: 1,                 // 1 image at a time
    duration: 1500,         // every 1.5 seconds
  },
  settings: {
    maxRetries: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
```

**Gemini API Limits:**
- Text: 1000 req/min → no concern at 50 videos/day
- **Image: 60 req/min** → **BOTTLENECK** (needs rate limiting)
- TTS: 300 req/min → no concern

**Image Queue Solution:**
- Max: 1 image at a time
- Duration: 1500ms (safety margin)
- Result: 40 images/min sustained
- Supports: 3 concurrent videos (120 images/min) ✅

### 6.3 Infrastructure Stack

**Required Services:**
- **Redis:** BullMQ job queue ($5-10/month managed, or self-hosted)
- **PostgreSQL:** Database (can run on same VPS initially)
- **S3/R2:** Cloud storage ($1-2/month for 100 videos)

**Total Monthly Cost:** $20.80 (VPS) + $10 (Redis) + $2 (storage) = **$32.80**

---

## 7. Editable Prompt System

### 7.1 Hard-Coded Prompts Inventory

**15 Prompts Found:**

| # | Prompt Name | Location | Purpose |
|---|-------------|----------|---------|
| 1 | PERSONA_PROMPT | ai/geminiScript.ts:12-38 | Core voice/tone (cynical journalist) |
| 2 | Tone & Angle Brief | ai/geminiScript.ts:113-135 | Villain/metaphor/emotional arc |
| 3 | Section Generation | ai/geminiScript.ts:177-207 | Per-section instructions (5×) |
| 4 | Ideas Generation | ai/geminiScript.ts:353-372 | New video ideation |
| 5 | Metadata Prompt | ai/geminiScript.ts:439-456 | CTR optimization |
| 6 | Scene Breakdown | ai/geminiScenes.ts:79-118 | Visual planning |
| 7 | Character Bible | ai/geminiScenes.ts:14-25 | 3 characters (VICTIM, SUIT, SYSTEM) |
| 8 | NanoBanana Style | lib/channelBrief.ts:70-85 | Paper texture instructions |
| 9-11 | Image Prompts | ai/nanoBanana.ts:75-125 | NEW_SCENE/CHARACTER_REACTION/OBJECT_FOCUS |
| 12 | Thumbnail Gen | ai/nanoBanana.ts:424-430 | Realistic bg + stick figures |
| 13 | Clickbait Titles | ai/geminiMeta.ts:14-38 | 5 CTR patterns |
| 14 | SEO Description | ai/geminiMeta.ts:102-122 | Hook-first story format |
| 15 | Thumbnail Prompts | ai/geminiMeta.ts:183-201 | 3 visual archetypes |

**All prompts are editable candidates** for frontend management system.

### 7.2 Template Variable System

**Available Variables:**
```typescript
{{channel.name}}           // "Scam Exposer"
{{channel.niche}}          // "financial scams"
{{channel.toneProfile}}    // "savage"
{{channel.targetAudience}} // "18-35 skeptics"
{{idea.title}}             // Video topic
{{idea.description}}       // Topic details
{{brief.villain}}          // From tone analysis
{{brief.centralMetaphor}}  // Visual analogy
{{section.type}}           // Hook, Villain Reveal, etc.
{{section.targetWordRange.0}} // Min words
{{section.targetWordRange.1}} // Max words
```

**PromptRenderer Class:**
```typescript
class PromptRenderer {
  render(template: string, context: any): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
  }
}
```

### 7.3 Frontend Prompt Editor

**Page:** `/channels/[slug]/prompts`

**Components:**

1. **Prompt Library Grid**
   - 15 cards (one per prompt type)
   - Shows: name, version, last edited, usage count
   - Status badge: Active / Testing / Archived

2. **Prompt Editor Modal**
   - Monaco Editor (syntax highlighting)
   - Variable autocomplete ({{channel.}} → dropdown)
   - Live preview pane (inject sample video data)
   - Save draft / Publish buttons

3. **A/B Test Manager**
   - Create variant button
   - Traffic allocation slider
   - Performance chart: CTR/retention/cost over time
   - "Promote winner" action

4. **Version History**
   - Timeline of edits
   - Diff view (show changes)
   - Rollback button

### 7.4 A/B Testing Framework

**Workflow:**
1. Create prompt variant (version 2)
2. Set traffic split (80% control, 20% variant)
3. Generate 30+ videos per variant
4. Compare metrics: CTR, avg retention, cost
5. Statistical significance test (95% confidence)
6. Promote winner → 100% traffic

**Example:**
```
Control (80% traffic):
"Open with a lie vs truth contrast. Make it personal with 'you'."

Variant (20% traffic):
"Start with a shocking dollar amount. Connect to viewer's wallet."

After 30 videos each:
- Control: 4.2% CTR, 45% avg retention
- Variant: 5.8% CTR, 52% avg retention
→ Promote variant to 100%
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**P0 - Critical:**
- ✅ BullMQ job queue setup
- ✅ Multi-channel database schema
- ✅ Scene classification system (overlayText tracking)
- ✅ VPS 40 migration

**Deliverables:**
- 3 concurrent videos generating
- Scene metadata distinguishes text vs visual-only
- Channel isolation ready

**Files to Modify:**
- `prisma/schema.prisma` - Add Channel, Language, ChannelPrompt, TranslationCache tables
- `ai/geminiScenes.ts` - Make overlayText required field
- `workers/sceneWorker.ts` - Classify and store textHeavyScenes
- New: `lib/queue.ts` - BullMQ configuration
- New: `workers/queueWorker.ts` - Queue-based pipeline

### Phase 2: Translation MVP (Week 3-6)

**P1 - High Priority:**
- ✅ Translation worker
- ✅ Batch script translation (10 scenes/call)
- ✅ Image copy logic for visual-only scenes
- ✅ Cloud storage migration (S3/R2)

**Deliverables:**
- Spanish translation working end-to-end
- Cost per translation < $1.00
- Storage cloud-ready

**Files to Create:**
- `workers/translationWorker.ts` - Main translation logic
- `ai/geminiTranslate.ts` - Batch translation functions
- `utils/imageCache.ts` - Image copy/reuse logic
- `lib/storage.ts` - S3/R2 adapter

### Phase 3: Prompt System (Week 7-12)

**P2 - Medium Priority:**
- ✅ Extract prompts to database
- ✅ Frontend prompt editor (Monaco)
- ✅ Template variable system
- ✅ A/B testing framework

**Deliverables:**
- All 15 prompts editable from UI
- Channel-specific overrides working
- A/B test on one channel

**Files to Create:**
- `lib/promptRenderer.ts` - Template variable engine
- `lib/promptService.ts` - Database CRUD + versioning
- `src/app/channels/[slug]/prompts/page.tsx` - Editor UI
- `src/components/PromptEditor.tsx` - Monaco component
- `src/components/ABTestManager.tsx` - A/B testing UI

**Files to Modify:**
- All files in `ai/` folder - Replace hard-coded prompts with `getPrompt()` calls

### Phase 4: Optimization (Week 13+)

**P3 - Nice to Have:**
- ✅ Image reuse cache
- ✅ Quality monitoring dashboard
- ✅ Translation caching
- ✅ Read replicas

**Deliverables:**
- 10-20% cost reduction via reuse
- Automated quality alerts
- Database performance optimized

**Files to Create:**
- `utils/imageHash.ts` - Perceptual hashing
- `workers/qualityWorker.ts` - Image quality validation
- `src/app/admin/quality/page.tsx` - Quality dashboard
- `lib/translationCache.ts` - Translation cache service

---

## 9. Risk Assessment

### Technical Risks

**Risk 1: API Rate Limits**
- Gemini image API limited to 60/min
- **Mitigation:** Queue-based rate limiting, exponential backoff
- **Severity:** Medium

**Risk 2: Translation Quality**
- Automated translation may lose nuance
- **Mitigation:** Human review for first 10 per language, spot-check thereafter
- **Severity:** Medium

**Risk 3: Storage Costs**
- 400 videos/month × 200MB = 80GB/month growth
- **Mitigation:** Lifecycle policy (delete after 90 days), compression
- **Severity:** Low

**Risk 4: Database Performance**
- Concurrent writes may bottleneck
- **Mitigation:** Connection pooling, read replicas at scale
- **Severity:** Low (future concern)

### Business Risks

**Risk 1: Video Flop Rate**
- Not all videos hit 3K views
- **Mitigation:** Lazy translation (only translate winners)
- **Severity:** Medium

**Risk 2: YouTube Algorithm Changes**
- CTR strategies may become less effective
- **Mitigation:** A/B testing framework adapts quickly
- **Severity:** Medium

**Risk 3: Niche Saturation**
- Scam exposé videos may saturate market
- **Mitigation:** Multi-channel strategy diversifies risk
- **Severity:** Low

---

## 10. Success Metrics

### Technical KPIs

1. **Alignment Score > 70%** per video
2. **Image Quality Score > 80%** per scene
3. **Cost < $3** per source video
4. **Translation < $1** per language
5. **Pipeline Time < 15 min** per video
6. **Queue Success Rate > 95%**

### Business KPIs

1. **CTR > 4%** average per channel
2. **Avg Retention > 45%** per video
3. **Cost per 1K views < $2.50**
4. **Profit margin > 70%** sustained
5. **Videos/day: 50** (Phase 1) → **150** (Phase 4)

### Quality Gates

- ✅ All prompts editable from UI
- ✅ Spanish translation live with <$1 cost
- ✅ 3 concurrent videos generating
- ✅ Quality alerts working
- ✅ A/B test framework deployed

---

## Appendix: Cost Projections

### Current State (50 videos/month, English-only)
- Videos: 50 × $2.50 = **$125**
- Infrastructure: $0 (local)
- **Total: $125/month**

### After Multi-Language (50 × 4 languages = 200 videos/month)
- Source videos: 50 × $2.42 = $121
- Translations: 150 × $0.92 = $138
- VPS 40: $21
- Redis: $10
- S3 Storage: $2
- **Total: $292/month**
- **Cost per video-language: $1.46**

### At Scale (100 source × 4 languages = 400 videos/month)
- Source: 100 × $2.42 = $242
- Translations: 300 × $0.92 = $276
- Infrastructure: $33
- **Total: $551/month**

### Revenue Model (Conservative)
- 400 videos × 3K views = 1.2M views/month
- YouTube CPM: $4 average
- Revenue: 1,200 × $4 = **$4,800/month**
- Costs: $551
- **Profit: $4,249/month (88% margin)** ✅

### Breakeven Analysis
- Cost per video: $1.38 average
- Breakeven views: $1.38 ÷ $0.004 CPM = **345 views per video**
- Target: 3K views (87% margin at target)

---

**End of Document**

For implementation questions, refer to the relevant section above. Each phase includes specific file paths and code examples to guide development.
