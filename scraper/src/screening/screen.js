/**
 * MIT OCW Screening — HTTP-basiert
 * 
 * Fetzt pro Kurs:
 * 1. data.json → Kurs-Metadaten
 * 2. content_map.json → Alle Resources + Material-Analyse
 * 3. Tier-Score berechnen
 * 4. library.db updaten
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { upsertCourse, updateScreening, replaceCourseMaterials, getCoursesByStatus } from '../lib/db.js';
import { calculateTier, SCREENING_STATUS } from '../lib/schema.js';

const BASE_URL = 'https://ocw.mit.edu';
const TIMEOUT = 10000;
const DELAY_MS = 200; // Rate limiting

const http = axios.create({
  timeout: TIMEOUT,
  headers: {
    'User-Agent': 'MIT-OCW-Scraper/1.0 (educational research)'
  }
});

const RESOURCE_DETAIL_CONCURRENCY = 5;
const RESOURCE_BATCH_DELAY_MS = 200;

/**
 * Fetcht und parst data.json für einen Kurs
 */
export async function fetchCourseData(courseId) {
  const url = `${BASE_URL}/courses/${courseId}/data.json`;
  const response = await http.get(url);
  return response.data;
}

/**
 * Fetcht die Kursseite und extrahiert die sichtbaren Sidebar-Metadaten.
 * Diese Felder sind maßgeblich für Kategorisierung und Relevanzprüfung.
 */
export async function fetchCoursePageMetadata(courseId) {
  const url = `${BASE_URL}/courses/${courseId}/`;
  const { data: html } = await http.get(url);
  return parseCoursePageMetadata(html);
}

export function parseCoursePageMetadata(html) {
  const $ = cheerio.load(html);
  const getSection = label => {
    const heading = $('.course-info-section-label').filter((_, element) =>
      normalizeText($(element).text()).toLowerCase() === label.toLowerCase()
    ).first();
    if (!heading.length) return [];

    const section = heading.closest('div');
    const content = section.find('.course-info-content, .panel-course-info-text').first();
    const values = content.find('a').map((_, a) => normalizeText($(a).text())).get();
    if (values.length > 0) return unique(values.filter(Boolean));

    const text = normalizeText(content.text());
    return text ? [text] : [];
  };

  const topics = unique($('.course-info-topic').map((_, a) => normalizeText($(a).text())).get().filter(Boolean));

  return {
    departments: getSection('Departments'),
    as_taught_in: getSection('As Taught In')[0] || null,
    level: getSection('Level'),
    topics
  };
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Fetcht die externe Course Website und parst den Schedule
 * Nur wenn ein external-resources/course-website Eintrag in der content_map vorhanden ist
 */
export async function fetchCourseWebsite(contentMap) {
  if (!contentMap) return null;

  const websiteEntry = Object.values(contentMap).find(v =>
    v?.includes('/external-resources/course-website/')
  );
  if (!websiteEntry) return null;

  try {
    const { data: resourceData } = await http.get(`${BASE_URL}${websiteEntry}`);
    const externalUrl = resourceData.external_url;
    if (!externalUrl) return null;

    const scheduleUrl = externalUrl.replace(/\/?$/, '/') + 'schedule/';
    console.log(`[SCREEN] Course Website gefunden: ${scheduleUrl}`);
    const { data: html } = await http.get(scheduleUrl, { timeout: 15000 });

    return parseScheduleHtml(html, scheduleUrl);
  } catch (err) {
    console.log(`[WARN] Course Website fetch fehlgeschlagen: ${err.message}`);
    return null;
  }
}

function parseScheduleHtml(html, pageUrl = BASE_URL) {
  const $ = cheerio.load(html);
  let sessions = 0;
  let slides = 0;
  let videos = 0;
  const materials = [];

  $('table tr').each((i, row) => {
    if (i === 0) return; // Header überspringen
    const text = $(row).text().trim();
    if (!text) return;
    sessions++;

    $(row).find('a').each((_, a) => {
      const rawHref = $(a).attr('href') || '';
      const sourceUrl = toAbsoluteUrl(rawHref, pageUrl);
      if (!sourceUrl) return;

      const label = normalizeText($(a).text()) || sourceUrl;
      const href = sourceUrl.toLowerCase();
      const labelLower = label.toLowerCase();
      const materialType = classifyMaterialType({
        title: label,
        url: sourceUrl
      });
      const mediaType = classifyMediaType({
        url: sourceUrl,
        materialType
      });

      if (mediaType === 'youtube' || mediaType === 'video' || labelLower.includes('video')) {
        videos++;
      } else if (mediaType === 'slides' || labelLower.includes('slides') || href.endsWith('.pdf')) {
        slides++;
      }

      materials.push(createMaterial({
        title: label,
        materialType,
        mediaType,
        sourceKind: 'external_course_website',
        sourceUrl,
        metadata: { session_text: text, schedule_url: pageUrl }
      }));
    });
  });

  return { sessions, slides, videos, materials };
}

/**
 * Fetcht content_map.json für einen Kurs
 */
export async function fetchContentMap(courseId) {
  try {
    const url = `${BASE_URL}/courses/${courseId}/content_map.json`;
    const response = await http.get(url);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      return null; // Manche Kurse haben kein content_map
    }
    throw err;
  }
}

async function fetchResourceData(resourcePath) {
  const url = toAbsoluteUrl(resourcePath, BASE_URL);
  const response = await http.get(url);
  return response.data;
}

export async function extractMaterialsFromContentMap(courseId, contentMap) {
  if (!contentMap) return [];

  const entries = Object.entries(contentMap).filter(([, resourcePath]) => {
    const path = String(resourcePath || '');
    return path.includes('/resources/') || path.includes('/external-resources/');
  });

  const materials = [];

  for (let i = 0; i < entries.length; i += RESOURCE_DETAIL_CONCURRENCY) {
    const batch = entries.slice(i, i + RESOURCE_DETAIL_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(async ([resourceId, resourcePath]) => {
      const data = await fetchResourceData(resourcePath);
      return extractMaterialsFromResourceData(courseId, resourceId, resourcePath, data);
    }));

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        materials.push(...result.value);
      } else {
        console.log(`[WARN] Resource-Detail fetch fehlgeschlagen: ${result.reason.message}`);
      }
    }

    if (i + RESOURCE_DETAIL_CONCURRENCY < entries.length) {
      await sleep(RESOURCE_BATCH_DELAY_MS);
    }
  }

  return dedupeMaterials(materials);
}

export function extractMaterialsFromResourceData(courseId, resourceId, resourcePath, data) {
  const materials = [];
  const sourceKind = String(resourcePath || '').includes('/external-resources/')
    ? 'ocw_external_resource_data'
    : 'ocw_resource_data';
  const materialType = classifyMaterialType({
    resourceData: data,
    title: data.title,
    parentTitle: data.parent_title,
    description: data.description || data.content,
    url: data.file || data.external_url
  });
  const title = data.title || data.optional_tab_title || data.external_url || resourcePath;
  const baseMetadata = {
    content_type: data.content_type,
    file_type: data.file_type,
    learning_resource_types: data.learning_resource_types || [],
    parent_title: data.parent_title,
    parent_type: data.parent_type,
    resourcetype: data.resourcetype,
    uid: data.uid || resourceId
  };

  if (data.file) {
    const sourceUrl = toAbsoluteUrl(data.file, BASE_URL);
    materials.push(createMaterial({
      title,
      materialType,
      mediaType: classifyMediaType({ url: sourceUrl, resourceData: data, materialType }),
      sourceKind,
      resourceId: data.uid || resourceId,
      resourcePath,
      sourceUrl,
      metadata: baseMetadata
    }));
  }

  if (data.external_url) {
    const sourceUrl = toAbsoluteUrl(data.external_url, BASE_URL);
    materials.push(createMaterial({
      title,
      materialType,
      mediaType: classifyMediaType({ url: sourceUrl, resourceData: data, materialType }),
      sourceKind,
      resourceId: data.uid || resourceId,
      resourcePath,
      sourceUrl,
      metadata: baseMetadata
    }));
  }

  const youtubeId = data.video_metadata?.youtube_id;
  if (youtubeId) {
    materials.push(createMaterial({
      title,
      materialType: 'Lecture Videos',
      mediaType: 'youtube',
      sourceKind,
      resourceId: data.uid || resourceId,
      resourcePath,
      sourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      metadata: { ...baseMetadata, youtube_id: youtubeId }
    }));
  }

  const archiveUrl = data.video_files?.archive_url;
  if (archiveUrl) {
    materials.push(createMaterial({
      title,
      materialType: 'Lecture Videos',
      mediaType: 'video',
      sourceKind,
      resourceId: data.uid || resourceId,
      resourcePath,
      sourceUrl: archiveUrl,
      metadata: { ...baseMetadata, archive_url: archiveUrl }
    }));
  }

  for (const [key, value] of Object.entries(data.video_files || {})) {
    if (!value || key === 'archive_url' || key === 'video_thumbnail_file') continue;
    const sourceUrl = toAbsoluteUrl(value, BASE_URL);
    materials.push(createMaterial({
      title: `${title} (${key.replaceAll('_', ' ')})`,
      materialType: 'Lecture Videos',
      mediaType: classifyMediaType({ url: sourceUrl, materialType: 'Lecture Videos' }),
      sourceKind,
      resourceId: data.uid || resourceId,
      resourcePath,
      sourceUrl,
      metadata: { ...baseMetadata, video_file_kind: key }
    }));
  }

  if (materials.length === 0 && resourcePath) {
    const sourceUrl = toAbsoluteUrl(resourcePath, BASE_URL);
    materials.push(createMaterial({
      title,
      materialType,
      mediaType: 'html',
      sourceKind,
      resourceId: data.uid || resourceId,
      resourcePath,
      sourceUrl,
      metadata: baseMetadata
    }));
  }

  return dedupeMaterials(materials);
}

function createMaterial({
  title,
  materialType,
  mediaType,
  sourceKind,
  resourceId = null,
  resourcePath = null,
  sourceUrl,
  metadata = {}
}) {
  return {
    type: materialType,
    title: normalizeText(title || sourceUrl || 'Untitled material'),
    material_type: materialType || 'Other',
    media_type: mediaType || 'other',
    source_kind: sourceKind,
    resource_id: resourceId,
    resource_path: resourcePath,
    source_url: sourceUrl,
    extraction_status: 'linked',
    metadata
  };
}

function classifyMaterialType({ resourceData = {}, title = '', parentTitle = '', description = '', url = '' }) {
  const explicitTypes = resourceData.learning_resource_types || [];
  const explicitType = explicitTypes.find(type => normalizeMaterialType(type) !== 'Other');
  if (explicitType) return normalizeMaterialType(explicitType);

  const haystack = [
    title,
    parentTitle,
    description,
    resourceData.parent_title,
    resourceData.resourcetype,
    resourceData.file_type,
    url
  ].filter(Boolean).join(' ').toLowerCase();

  if (haystack.includes('slides') || haystack.includes('slide deck')) return 'Lecture Slides';
  if (haystack.includes('lecture notes') || /\bnotes?\b/.test(haystack)) return 'Lecture Notes';
  if (haystack.includes('youtube') || haystack.includes('video') || resourceData.video_metadata?.youtube_id || resourceData.video_files?.archive_url) return 'Lecture Videos';
  if (haystack.includes('reading')) return 'Readings';
  if (haystack.includes('problem set') || haystack.includes('pset') || haystack.includes('assignment')) return 'Problem Sets';
  if (haystack.includes('exercise') || haystack.includes('in-class question') || haystack.includes('recitation')) return 'Exercises';
  if (haystack.includes('exam') || haystack.includes('quiz')) return 'Exams';
  if (haystack.includes('project')) return 'Projects';

  return 'Other';
}

function normalizeMaterialType(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('lecture video') || value.includes('problem-solving video')) return 'Lecture Videos';
  if (value.includes('lecture note')) return 'Lecture Notes';
  if (value.includes('slide')) return 'Lecture Slides';
  if (value.includes('reading') || value.includes('open textbook')) return 'Readings';
  if (value.includes('problem set') || value.includes('assignment')) return 'Problem Sets';
  if (value.includes('exercise') || value.includes('recitation')) return 'Exercises';
  if (value.includes('exam') || value.includes('quiz')) return 'Exams';
  if (value.includes('project')) return 'Projects';
  return type || 'Other';
}

function classifyMediaType({ url = '', resourceData = {}, materialType = '' }) {
  const source = String(url || '').toLowerCase();
  if (source.includes('youtube.com') || source.includes('youtu.be') || resourceData.video_metadata?.youtube_id) return 'youtube';
  if (source.endsWith('.mp4') || source.includes('archive.org/download') || resourceData.video_files?.archive_url) return 'video';
  if (source.includes('docs.google.com/presentation') || source.includes('slides')) return 'slides';
  if (source.endsWith('.pdf') || resourceData.file_type === 'application/pdf') return 'pdf';
  if (source.endsWith('.vtt') || source.endsWith('.srt')) return 'captions';
  if (source.endsWith('.py') || source.endsWith('.ipynb') || source.endsWith('.m') || source.endsWith('.r')) return 'code';
  if (source.endsWith('.zip') || source.endsWith('.gz') || source.endsWith('.tar')) return 'archive';
  if (source.endsWith('.csv') || source.endsWith('.tsv') || source.endsWith('.xlsx')) return 'data';
  if (source.endsWith('.html') || source.endsWith('/')) return 'html';
  if (source.startsWith('http') && !source.includes('ocw.mit.edu')) return 'external';
  if (materialType === 'Lecture Slides') return 'slides';
  if (source.includes('/data.json') || source.includes('/resources/')) return 'html';
  return 'other';
}

function toAbsoluteUrl(url, baseUrl) {
  if (!url) return null;
  return new URL(url, baseUrl).href;
}

function dedupeMaterials(materials) {
  const seen = new Set();
  return materials.filter(material => {
    const key = [
      material.source_url,
      material.material_type,
      material.media_type,
      material.title
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Screent einen einzelnen Kurs
 */
export async function screenCourse(courseId) {
  console.log(`[SCREEN] ${courseId}`);
  
  try {
    // 1. data.json fetchen
    const data = await fetchCourseData(courseId);

    // 1b. Sichtbare Kursseiten-Metadaten fetchen
    const pageMetadata = await fetchCoursePageMetadata(courseId);
    
    // 2. content_map.json fetchen (optional)
    const contentMap = await fetchContentMap(courseId);

    // 3. Course Website fetchen falls verlinkt
    const courseWebsite = await fetchCourseWebsite(contentMap);

    const materials = dedupeMaterials([
      ...await extractMaterialsFromContentMap(courseId, contentMap),
      ...(courseWebsite?.materials || [])
    ]);

    // 4. Tier-Score berechnen
    const { tier, score, warnings, reason } = calculateTier(data, contentMap, courseWebsite);

    // 5. DB updaten
    const dbData = {
      course_title: data.course_title,
      source_url: `${BASE_URL}/courses/${courseId}/`,
      departments: pageMetadata.departments,
      department_numbers: data.department_numbers,
      as_taught_in: pageMetadata.as_taught_in,
      term: data.term,
      year: data.year,
      level: pageMetadata.level.length > 0 ? pageMetadata.level : data.level,
      topics: data.topics,
      instructors: data.instructors,
      learning_resource_types: data.learning_resource_types,
      course_page_metadata: pageMetadata
    };
    upsertCourse(courseId, dbData);
    replaceCourseMaterials(courseId, materials);
    
    // 6. Screening-Status setzen
    const status = tier === 3 ? SCREENING_STATUS.HOLD : SCREENING_STATUS.SCREENED;
    updateScreening(courseId, { tier, score, warnings, reason, status });
    
    console.log(`[SCREEN] ${courseId} → Tier ${tier} (${score}p) - ${reason}; ${materials.length} Materialien`);
    
    return { courseId, tier, score, warnings, reason, status };
    
  } catch (err) {
    console.error(`[ERROR] ${courseId}: ${err.message}`);
    return { courseId, error: err.message };
  }
}

/**
 * Screent mehrere Kurse nacheinander mit Delay
 */
export async function screenCourses(courseIds, { delayMs = DELAY_MS } = {}) {
  const results = [];

  for (let i = 0; i < courseIds.length; i++) {
    const result = await screenCourse(courseIds[i]);
    results.push(result);
    if (delayMs > 0 && i < courseIds.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}

/**
 * Screent alle 'discovered' Kurse aus der DB
 */
export async function screenDiscovered() {
  const discovered = getCoursesByStatus(SCREENING_STATUS.DISCOVERED);
  const courseIds = discovered.map(c => c.course_id);
  
  console.log(`[SCREEN] ${courseIds.length} entdeckte Kurse zum Screenen...`);
  return screenCourses(courseIds);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { screenCourse, screenCourses, screenDiscovered };
