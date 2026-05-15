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
import { upsertCourse, updateScreening, getCoursesByStatus } from '../lib/db.js';
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

/**
 * Fetcht und parst data.json für einen Kurs
 */
export async function fetchCourseData(courseId) {
  const url = `${BASE_URL}/courses/${courseId}/data.json`;
  const response = await http.get(url);
  return response.data;
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

/**
 * Screent einen einzelnen Kurs
 */
export async function screenCourse(courseId) {
  console.log(`[SCREEN] ${courseId}`);
  
  try {
    // 1. data.json fetchen
    const data = await fetchCourseData(courseId);
    
    // 2. content_map.json fetchen (optional)
    const contentMap = await fetchContentMap(courseId);
    
    // 3. Tier-Score berechnen
    const { tier, score, warnings, reason } = calculateTier(data, contentMap);
    
    // 4. DB updaten
    const dbData = {
      course_title: data.course_title,
      source_url: `${BASE_URL}/courses/${courseId}/`,
      term: data.term,
      year: data.year,
      level: data.level,
      topics: data.topics,
      instructors: data.instructors,
      learning_resource_types: data.learning_resource_types
    };
    upsertCourse(courseId, dbData);
    
    // 5. Screening-Status setzen
    const status = tier === 3 ? SCREENING_STATUS.HOLD : SCREENING_STATUS.SCREENED;
    updateScreening(courseId, { tier, score, warnings, reason, status });
    
    console.log(`[SCREEN] ${courseId} → Tier ${tier} (${score}p) - ${reason}`);
    
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
  
  for (const courseId of courseIds) {
    const result = await screenCourse(courseId);
    results.push(result);
    
    if (delayMs > 0 && courseIds.indexOf(courseId) < courseIds.length - 1) {
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
