/**
 * Source-Auswahl und -Klassifikation für NotebookLM-Manifeste.
 *
 * Entscheidet, ob ein Material als NotebookLM-Quelle geeignet ist, wählt die
 * besten N nach Priorität aus und bestimmt CLI-/MIME-Typen für den Upload.
 */
import { existsSync } from 'fs';
import { extname, resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_ROOT = join(__dirname, '../..');
const WORKSPACE_ROOT = join(SCRAPER_ROOT, '..');

const VIDEO_SOURCE_MEDIA_TYPES = new Set(['youtube', 'video']);

export const DOCUMENT_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.md',
  '.markdown',
  '.ods',
  '.odp',
  '.odt',
  '.pdf',
  '.ppt',
  '.pptx',
  '.rst',
  '.rtf',
  '.tsv',
  '.txt',
  '.xls',
  '.xlsx'
]);

const SOURCE_PRIORITY = {
  pdf: 1,
  youtube: 2,
  video: 3,
  markdown: 4,
  slides: 5,
  data: 6,
  captions: 7,
  html: 8,
  external: 9,
  code: 9,
  archive: 10,
  other: 11
};

const MIME_TYPES = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.pdf': 'application/pdf',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rst': 'text/plain',
  '.rtf': 'application/rtf',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export function selectNotebookLmSources(materials, maxSources) {
  return materials
    .filter(isNotebookLmAllowedSource)
    .sort((a, b) => {
      const priorityA = getSourcePriority(a);
      const priorityB = getSourcePriority(b);
      if (priorityA !== priorityB) return priorityA - priorityB;
      const lectureA = getLectureNumber(a);
      const lectureB = getLectureNumber(b);
      if (lectureA !== null && lectureB !== null && lectureA !== lectureB) return lectureA - lectureB;
      return a.id - b.id;
    })
    .slice(0, maxSources)
    .map((material, index) => ({
      order: index + 1,
      title: material.title,
      source_url: material.source_url,
      content: getSourceContent(material),
      source_kind: material.source_kind,
      material_type: material.material_type,
      media_type: material.media_type,
      local_path: material.local_path,
      extraction_status: material.extraction_status,
      notebooklm_source_type: mapNotebookLmSourceType(material),
      metadata: parseJson(material.metadata_json)
    }));
}

export function buildSourceAddArgs(source, notebookId) {
  const content = getSourceContent(source);
  if (!content) throw new Error(`Quelle ohne content/source_url/local_path: ${source.title || '(untitled)'}`);

  const args = ['source', 'add', content, '--json'];
  if (notebookId) args.push('--notebook', notebookId);

  const title = getSourceTitle(source);
  if (title) args.push('--title', title);

  const sourceType = getNotebookLmCliSourceType(source);
  if (sourceType) args.push('--type', sourceType);

  const mimeType = getSourceMimeType(source, content);
  if (mimeType) args.push('--mime-type', mimeType);

  return args;
}

export function isNotebookLmAllowedSource(material) {
  if (!hasSourceContent(material)) return false;
  if (['archive', 'code'].includes(material.media_type)) return false;
  if (VIDEO_SOURCE_MEDIA_TYPES.has(material.media_type)) return true;
  return isDocumentSource(material);
}

export function hasSourceContent(material) {
  return Boolean(getSourceContent(material));
}

export function isDocumentSource(source) {
  if (source.media_type === 'pdf') return true;
  const extension = getContentExtension(getSourceContent(source));
  return DOCUMENT_EXTENSIONS.has(extension);
}

export function getSourceContent(source) {
  if (source.local_path && isUsableLocalPath(source.local_path)) {
    return source.local_path;
  }

  if (source.source_url) return source.source_url;

  if (source.content && source.content !== source.local_path) {
    return source.content;
  }

  return null;
}

export function isUsableLocalPath(localPath) {
  if (!localPath) return false;
  return existsSync(resolve(WORKSPACE_ROOT, localPath));
}

export function hasUsableLocalSource(source) {
  return Boolean(source.local_path && isUsableLocalPath(source.local_path));
}

export function mapNotebookLmSourceType(material) {
  if (hasUsableLocalSource(material)) return 'file';
  if (material.media_type === 'pdf') return 'file_or_url';
  if (material.media_type === 'youtube') return 'youtube';
  if (material.media_type === 'video') return 'video_url';
  if (isDocumentSource(material)) return 'document';
  return 'unsupported';
}

function getSourcePriority(material) {
  let priority = SOURCE_PRIORITY[material.media_type] || SOURCE_PRIORITY.other;
  const title = String(material.title || '').toLowerCase();
  const materialType = String(material.material_type || '').toLowerCase();

  if (material.media_type === 'pdf') {
    if (materialType.includes('lecture slides') || title.includes('lecture ')) priority -= 0.4;
    if (materialType.includes('lecture notes') || title.includes('notes')) priority -= 0.3;
    if (title.includes('transcript') || title.includes('3play')) priority += 1.5;
  }

  return priority;
}

function getLectureNumber(material) {
  const match = String(material.title || '').match(/\blecture\s+(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function getContentExtension(content) {
  const value = String(content || '');
  if (!value) return '';

  try {
    return extname(new URL(value).pathname).toLowerCase();
  } catch {
    return extname(value).toLowerCase();
  }
}

function getSourceTitle(source) {
  return source.title || source.resource_path || source.local_path || source.source_url || null;
}

function getNotebookLmCliSourceType(source) {
  if (source.media_type === 'youtube') return 'youtube';
  if (hasUsableLocalSource(source)) return 'file';
  if (isYoutubeUrl(source.source_url)) return 'youtube';
  if (source.source_url?.startsWith('http')) return 'url';
  return null;
}

function getSourceMimeType(source, content) {
  if (!hasUsableLocalSource(source) || getNotebookLmCliSourceType(source) !== 'file') return null;
  const extension = getContentExtension(content);
  return MIME_TYPES[extension] || null;
}

function isYoutubeUrl(url) {
  return Boolean(url && /(?:youtube\.com|youtu\.be)/i.test(url));
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
