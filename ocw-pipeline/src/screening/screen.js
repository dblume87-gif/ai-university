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
import { applyScreeningResult, getCourse, getCoursesByStatus } from '../lib/db.js';
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
const PRESERVED_PIPELINE_STATUSES = new Set([
  SCREENING_STATUS.SELECTED,
  SCREENING_STATUS.READY_FOR_NOTEBOOKLM,
  SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM,
  SCREENING_STATUS.UPLOADED_TO_NOTEBOOKLM,
  SCREENING_STATUS.NOTEBOOKLM_VALIDATED
]);

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

    const courseWebsiteUrl = externalUrl.replace(/\/?$/, '/');
    const scheduleUrl = `${courseWebsiteUrl}schedule/`;
    console.log(`[SCREEN] Course Website gefunden: ${scheduleUrl}`);
    const { data: html } = await http.get(scheduleUrl, { timeout: 15000 });
    const results = [parseScheduleHtml(html, scheduleUrl)];

    for (const relatedUrl of collectRelatedCourseWebsiteUrls(html, scheduleUrl, courseWebsiteUrl)) {
      try {
        const { data: relatedHtml } = await http.get(relatedUrl, { timeout: 15000 });
        results.push(parseScheduleHtml(relatedHtml, relatedUrl));
      } catch (err) {
        console.log(`[WARN] Course Website Unterseite fehlgeschlagen: ${relatedUrl} (${err.message})`);
      }
    }

    return mergeCourseWebsiteResults(results);
  } catch (err) {
    console.log(`[WARN] Course Website fetch fehlgeschlagen: ${err.message}`);
    return null;
  }
}

function collectRelatedCourseWebsiteUrls(html, pageUrl, courseWebsiteUrl) {
  const $ = cheerio.load(html);
  const pageOrigin = new URL(pageUrl).origin;
  const currentUrl = new URL(pageUrl).href;
  const urls = $('a[href]').map((_, a) => {
    const label = normalizeText($(a).text()).toLowerCase();
    const href = toAbsoluteUrl($(a).attr('href'), pageUrl);
    if (!href) return null;

    const url = new URL(href);
    const path = `${url.pathname} ${label}`.toLowerCase();
    if (url.origin !== pageOrigin) return null;
    if (href === currentUrl || href === courseWebsiteUrl) return null;
    if (/\.(pdf|pptx?|docx?|xlsx?|zip|mp4|mov|csv|tsv)$/i.test(url.pathname)) return null;
    if (!/(schedule|lecture|slides?|videos?|calendar|sessions?)/i.test(path)) return null;
    return href;
  }).get().filter(Boolean);

  return unique(urls).slice(0, 5);
}

function mergeCourseWebsiteResults(results) {
  const materials = propagateSessionMetadata(dedupeMaterials(results.flatMap(result => result.materials || [])));
  return {
    sessions: results.reduce((sum, result) => sum + (result.sessions || 0), 0),
    slides: materials.filter(material => isMaterialSlide(material)).length,
    videos: materials.filter(material => isMaterialVideo(material)).length,
    materials
  };
}

function propagateSessionMetadata(materials) {
  const byKey = new Map();
  for (const material of materials) {
    const key = material.metadata?.session_key;
    if (!key) continue;
    const current = byKey.get(key) || {
      unitNumbers: [],
      slideUrls: [],
      videoUrls: []
    };
    current.unitNumbers.push(...(material.metadata.session_unit_numbers || []));
    current.slideUrls.push(...(material.metadata.session_slide_urls || []));
    current.videoUrls.push(...(material.metadata.session_video_urls || []));
    byKey.set(key, current);
  }

  return materials.map(material => {
    const key = material.metadata?.session_key;
    const session = key ? byKey.get(key) : null;
    if (!session) return material;
    return {
      ...material,
      metadata: {
        ...material.metadata,
        session_unit_numbers: uniqueNumbers(session.unitNumbers),
        session_slide_urls: unique(session.slideUrls),
        session_video_urls: unique(session.videoUrls)
      }
    };
  });
}

export function parseScheduleHtml(html, pageUrl = BASE_URL) {
  const $ = cheerio.load(html);
  let sessions = 0;
  let slides = 0;
  let videos = 0;
  const materials = [];
  const sessionRows = [];

  $('table tr').each((i, row) => {
    if (i === 0) return; // Header überspringen
    const text = $(row).text().trim();
    if (!text) return;
    sessions++;

    const sessionLinks = $(row).find('a').map((_, a) => {
      const rawHref = $(a).attr('href') || '';
      const sourceUrl = toAbsoluteUrl(rawHref, pageUrl);
      if (!sourceUrl) return null;

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

      return {
        label,
        labelLower,
        href,
        sourceUrl,
        materialType,
        mediaType
      };
    }).get().filter(Boolean);
    const sessionTitle = inferSessionTitle(text);
    const sessionKey = getSessionKey(sessionTitle);
    const sessionSlideUrls = sessionLinks
      .filter(link => isSlideLink(link))
      .map(link => link.sourceUrl);
    const sessionVideoUrls = sessionLinks
      .filter(link => isVideoLink(link))
      .map(link => link.sourceUrl);

    sessionRows.push({
      text,
      sessionIndex: sessions,
      sessionTitle,
      sessionKey,
      links: sessionLinks,
      slideUrls: sessionSlideUrls,
      videoUrls: sessionVideoUrls,
      ownUnitNumbers: inferSessionUnitNumbers(text, sessionLinks)
    });
  });

  const unitNumbersBySessionKey = new Map();
  for (const session of sessionRows) {
    if (!session.sessionKey) continue;
    unitNumbersBySessionKey.set(session.sessionKey, uniqueNumbers([
      ...(unitNumbersBySessionKey.get(session.sessionKey) || []),
      ...session.ownUnitNumbers
    ]));
  }

  for (const session of sessionRows) {
    const sessionUnitNumbers = uniqueNumbers([
      ...session.ownUnitNumbers,
      ...(unitNumbersBySessionKey.get(session.sessionKey) || [])
    ]);

    for (const link of session.links) {
      if (isVideoLink(link)) {
        videos++;
      } else if (isSlideLink(link)) {
        slides++;
      }

      materials.push(createMaterial({
        title: link.label,
        materialType: link.materialType,
        mediaType: link.mediaType,
        sourceKind: 'external_course_website',
        sourceUrl: link.sourceUrl,
        metadata: {
          session_text: session.text,
          session_title: session.sessionTitle,
          session_key: session.sessionKey,
          schedule_url: pageUrl,
          session_index: session.sessionIndex,
          session_unit_numbers: sessionUnitNumbers,
          session_slide_urls: session.slideUrls,
          session_video_urls: session.videoUrls
        }
      }));
    }
  }

  return { sessions, slides, videos, materials };
}

function inferSessionTitle(text) {
  return normalizeText(String(text || '')
    .replace(/\[(?:slides?|videos?)\]/gi, ' ')
    .replace(/\s+/g, ' '));
}

function getSessionKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferSessionUnitNumbers(sessionText, links) {
  const numbers = [
    ...inferLectureNumbersFromText(sessionText),
    ...links
      .filter(link => isSlideLink(link))
      .flatMap(link => inferLectureNumbersFromText(`${link.label} ${link.sourceUrl}`))
  ];
  return uniqueNumbers(numbers);
}

function inferLectureNumbersFromText(text) {
  const value = String(text || '');
  const numbers = [];
  const lectureRange = /\blectures?\s+0*(\d{1,3})(?:\s*(?:,|and|&|-|to)\s*0*(\d{1,3}))?/gi;
  const compactLecture = /(?:^|[._\-/\s])lec(?:ture)?[_\-\s]?0*(\d{1,3})(?:\.\d+)?(?:[a-z])?(?=[._\-/\s%]|$)/gi;

  for (const match of value.matchAll(lectureRange)) {
    numbers.push(...expandRange(match[1], match[2]));
  }

  for (const match of value.matchAll(compactLecture)) {
    numbers.push(Number.parseInt(match[1], 10));
  }

  return numbers;
}

function expandRange(first, second) {
  const start = Number.parseInt(first, 10);
  const end = Number.parseInt(second, 10);
  if (!Number.isInteger(start)) return [];
  if (!Number.isInteger(end) || end === start) return [start];
  if (end < start || end - start > 5) return [start, end];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(value => Number.isInteger(value) && value > 0))];
}

function isSlideLink(link) {
  return link.mediaType === 'slides' ||
    link.materialType === 'Lecture Slides' ||
    link.labelLower.includes('slides') ||
    link.href.endsWith('.pdf');
}

function isVideoLink(link) {
  return link.mediaType === 'youtube' ||
    link.mediaType === 'video' ||
    link.labelLower.includes('video');
}

function isMaterialSlide(material) {
  return material.media_type === 'slides' ||
    material.material_type === 'Lecture Slides' ||
    material.media_type === 'pdf' && /slides?/i.test(material.title || '');
}

function isMaterialVideo(material) {
  return material.media_type === 'youtube' ||
    material.media_type === 'video' ||
    /videos?/i.test(material.title || '');
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
export async function screenCourse(courseId, options = {}) {
  const { deep = true, deepTiers = null } = options;
  console.log(`[SCREEN] ${courseId}`);
  
  try {
    const existingCourse = getCourse(courseId);

    // 1. data.json fetchen
    const data = await fetchCourseData(courseId);

    // 1b. Sichtbare Kursseiten-Metadaten fetchen
    const pageMetadata = await fetchCoursePageMetadata(courseId);
    
    // 2. content_map.json fetchen (optional)
    const contentMap = await fetchContentMap(courseId);

    // 3. Schnellen Tier-Score ohne Resource-Detail-Requests berechnen
    let courseWebsite = null;
    let tierResult = calculateTier(data, contentMap, courseWebsite);
    const shouldDeepScan = deep && shouldRunDeepScan(tierResult.tier, deepTiers);
    let materials = [];

    if (shouldDeepScan) {
      // 4. Course Website fetchen falls verlinkt
      courseWebsite = await fetchCourseWebsite(contentMap);

      materials = dedupeMaterials([
        ...await extractMaterialsFromContentMap(courseId, contentMap),
        ...(courseWebsite?.materials || [])
      ]);

      tierResult = calculateTier(data, contentMap, courseWebsite);
    }

    const { tier, score, warnings, reason } = tierResult;

    // 5. + 6. Atomares Update: Course-Metadaten, optional Materials, Screening-Felder.
    const courseData = {
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
    const screeningStatus = tier === 3 ? SCREENING_STATUS.HOLD : SCREENING_STATUS.SCREENED;
    const status = preservePipelineStatus(existingCourse?.status, screeningStatus);

    applyScreeningResult({
      courseId,
      courseData,
      materials: shouldDeepScan ? materials : null,
      screening: { tier, score, warnings, reason, status }
    });
    
    const mode = shouldDeepScan
      ? `${materials.length} Materialien`
      : deep
        ? `Fast Screening; Deep Scan übersprungen für Tier ${tier}`
        : 'Fast Screening; keine Material-Details geladen';
    console.log(`[SCREEN] ${courseId} → Tier ${tier} (${score}p) - ${reason}; ${mode}`);
    
    return { courseId, tier, score, warnings, reason, status, deepScan: shouldDeepScan, materials: materials.length };
    
  } catch (err) {
    console.error(`[ERROR] ${courseId}: ${err.message}`);
    return { courseId, error: err.message };
  }
}

function preservePipelineStatus(currentStatus, nextStatus) {
  return PRESERVED_PIPELINE_STATUSES.has(currentStatus) ? currentStatus : nextStatus;
}

/**
 * Screent mehrere Kurse nacheinander mit Delay
 */
export async function screenCourses(courseIds, { delayMs = DELAY_MS, deep = true, deepTiers = null } = {}) {
  const results = [];

  for (let i = 0; i < courseIds.length; i++) {
    const result = await screenCourse(courseIds[i], { deep, deepTiers });
    results.push(result);
    if (delayMs > 0 && i < courseIds.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}

function getTermRank(term) {
  if (term === 'Fall') return 4;
  if (term === 'Summer') return 3;
  if (term === 'Spring') return 2;
  if (term === 'January IAP') return 1;
  return 0;
}

function byNewestCourseRun(a, b) {
  return Number(b.year || 0) - Number(a.year || 0) ||
    getTermRank(b.term) - getTermRank(a.term) ||
    a.course_id.localeCompare(b.course_id);
}

function chunk(values, size) {
  if (!size || size <= 0) return [values];
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

/**
 * Screent alle 'discovered' Kurse aus der DB
 */
export async function screenDiscovered(options = {}) {
  const {
    limit = null,
    batchSize = null,
    delayMs = DELAY_MS
  } = options;
  const discovered = getCoursesByStatus(SCREENING_STATUS.DISCOVERED)
    .sort(byNewestCourseRun);
  const courseIds = discovered
    .slice(0, limit || discovered.length)
    .map(c => c.course_id);
  const batches = chunk(courseIds, batchSize);
  const results = [];

  console.log(`[SCREEN] ${courseIds.length} entdeckte Kurse zum Screenen...`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (batches.length > 1) {
      console.log(`[SCREEN] Batch ${i + 1}/${batches.length}: ${batch.length} Kurse`);
    }
    results.push(...await screenCourses(batch, { ...options, delayMs }));
  }

  return results;
}

function shouldRunDeepScan(tier, deepTiers) {
  return !deepTiers || deepTiers.includes(tier);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { screenCourse, screenCourses, screenDiscovered };
