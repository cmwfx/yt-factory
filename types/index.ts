export type VisualType = 'NEW_SCENE' | 'CHARACTER_REACTION' | 'OBJECT_FOCUS';

export type CharacterType = 'THE_VICTIM' | 'THE_SUIT' | 'THE_SYSTEM';

export interface Scene {
  sceneIndex: number;
  text: string;
  wordCount: number;
  suggestedDuration: number;
  nanoPrompt: string;
  referenceImageIndex: number | null;
  overlayText: string | null;
  visualType: VisualType;
  characters: CharacterType[];
}

export interface AlignedScene extends Scene {
  startTime: number;
  endTime: number;
  duration: number;
  imagePath: string;
  audioPath?: string;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface TranscriptionResult {
  words: WordTimestamp[];
  text: string;
}

export interface JobOptions {
  generateIdeas: boolean;
  testMode: boolean;
  enableManualReview: boolean;
}

export interface IdeaInput {
  title: string;
  description: string;
}

export interface ScriptResult {
  script: string;
  wordCount: number;
}

export interface ImageGenerationResult {
  imagePath: string;
  sceneIndex: number;
}

export interface AudioGenerationResult {
  audioPath: string;
  duration: number;
}

export interface RenderResult {
  videoPath: string;
  duration: number;
}

export type StepName =
  | 'ideas'
  | 'pick_idea'
  | 'scripting'
  | 'scenes'
  | 'images'
  | 'images_batch1'
  | 'images_batch2'
  | 'audio'
  | 'transcribe'
  | 'align'
  | 'review'
  | 'render';

export type VideoStatus =
  | 'queued'
  | 'scripting'
  | 'scenes'
  | 'images'
  | 'images_batch1'
  | 'images_batch2'
  | 'audio'
  | 'align'
  | 'review'
  | 'render'
  | 'render_queued'
  | 'done'
  | 'failed';

// Section-chained script generation types (6-section retention-optimized structure)
export type ScriptSectionType = 'cold_open' | 'stakes' | 'villain_reveal' | 'mechanism' | 'twist' | 'takeaway';

export interface ScriptSection {
  type: ScriptSectionType;
  title: string;
  content: string;
  wordCount: number;
  targetWordRange: [number, number];
}

export interface ToneAngleBrief {
  villain: string;
  coldOpen: string;
  lieTruthContrast: { lie: string; truth: string };
  shockFacts: [string, string, string];
  twist: string;
  emotionalJourney: { q1: string; q2: string; q3: string; q4: string };
  cynicismLevel: 'mild' | 'moderate' | 'savage';
}

export interface SectionPromptConfig {
  type: ScriptSectionType;
  title: string;
  targetWordRange: [number, number];
  instructions: string;
  endingGuidance: string;
}

export interface VideoMetadata {
  titles: string[];           // Exactly 5 high-CTR titles
  description: string;        // Story-driven, narrative style
  thumbnailPrompts: string[]; // Exactly 3 nanobanana prompts
}

export interface ReviewSceneData {
  sceneIndex: number;
  text: string;
  audioPath: string;
  imagePath: string;
  imagePrompt: string;
  startTime: number;
  endTime: number;
  duration: number;
  wordCount: number;
  confidence?: number;
  alignmentMethod: 'duration' | 'transcription';
}

export interface SceneAdjustment {
  sceneIndex: number;
  wordDelta: number;
  newImagePrompt?: string;
}

export interface AlignmentResult {
  failedScenes?: number[];
  averageMatchScore?: number;
}
