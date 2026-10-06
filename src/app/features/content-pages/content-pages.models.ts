import { IconName } from '../../shared/components/icon/icon.component';

/**
 * Static pages shown inside the mobile apps — "من نحن" and "سياسة الخصوصية".
 * Each is a single document: read from the public endpoint, replaced from
 * the admin one. Content is plain text; the apps keep its line breaks.
 */

export type ContentPageKind = 'about' | 'privacy';

export interface ContentImage {
  id: string;
  /** Absolute URL. */
  url: string;
}

export interface ContentPage {
  content: string;
  /** ISO timestamp; `null` = never published. */
  updatedAt: string | null;
  /** Always empty for pages without a gallery. */
  images: ContentImage[];
}

export const EMPTY_CONTENT_PAGE: ContentPage = { content: '', updatedAt: null, images: [] };

export interface ContentPageMeta {
  title: string;
  subtitle: string;
  icon: IconName;
  /** Title of the screen inside the app (the preview's app bar). */
  appTitle: string;
  /** The page carries an image gallery (about-us). */
  images: boolean;
  placeholder: string;
}

export const CONTENT_PAGE_META: Record<ContentPageKind, ContentPageMeta> = {
  about: {
    title: 'من نحن',
    subtitle: 'تعريف المستخدمين بالمنصة وخدماتها كما يظهر في صفحة «من نحن» داخل التطبيق',
    icon: 'heart',
    appTitle: 'من نحن',
    images: true,
    placeholder: 'اكتب نبذة عن المنصة ورسالتها والخدمات التي تقدمها…',
  },
  privacy: {
    title: 'سياسة الخصوصية',
    subtitle: 'كيف تجمع المنصة بيانات المستخدمين وتستخدمها وتحميها — تظهر للمستخدمين داخل التطبيق',
    icon: 'shield',
    appTitle: 'سياسة الخصوصية',
    images: false,
    placeholder: 'اكتب بنود سياسة الخصوصية: البيانات التي نجمعها، وكيف نستخدمها، ومع من نشاركها، وحقوق المستخدم…',
  },
};

// ─────────── image uploads ───────────

export const CONTENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const CONTENT_IMAGE_MAX_MB = 5;

export interface ImageFilesCheck {
  accepted: File[];
  /** One readable reason per rejected file. */
  rejected: string[];
}

/** Splits picked files into uploadable images and readable rejections. */
export function checkImageFiles(files: readonly File[]): ImageFilesCheck {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (!(CONTENT_IMAGE_TYPES as readonly string[]).includes(f.type)) rejected.push(`«${f.name}» ليست صورة مدعومة (PNG أو JPG أو WEBP)`);
    else if (f.size > CONTENT_IMAGE_MAX_MB * 1024 * 1024) rejected.push(`«${f.name}» أكبر من ${CONTENT_IMAGE_MAX_MB} ميجابايت`);
    else accepted.push(f);
  }
  return { accepted, rejected };
}

// ─────────── text stats ───────────

export interface TextStats {
  characters: number;
  words: number;
  paragraphs: number;
  /** Whole minutes, at least 1 for any text. */
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 180;

export function textStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    characters: trimmed.length,
    words,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/).length : 0,
    readingMinutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0,
  };
}
