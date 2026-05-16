/**
 * MIT OCW Discovery — Playwright/Crawlee
 * 
 * Scraped JS-gerenderte Seiten:
 * - Kurssuche
 * - Department-Übersichten
 * 
 * Output: Liste von course-ids → library.db
 */

import { PlaywrightCrawler } from 'crawlee';
import { upsertDiscoveredCourse } from '../lib/db.js';

const BASE_URL = 'https://ocw.mit.edu';

function recordDiscoveredCourse(courseId, sourceUrl, { dryRun }) {
  if (dryRun) {
    console.log(`[DRY-RUN] + ${courseId} (${sourceUrl})`);
    return;
  }

  upsertDiscoveredCourse(courseId, {
    course_title: 'Unknown (pending scrape)',
    source_url: sourceUrl
  });
}

async function collectCourseLinks(page, discovered, maxCourses) {
  const remaining = maxCourses - discovered.size;
  if (remaining <= 0) return [];

  return page.$$eval('a[href*="/courses/"]', links =>
    links
      .map(a => a.href)
      .filter(h => h.includes('/courses/') && !h.includes('/search'))
      .filter((v, i, a) => a.indexOf(v) === i)
  ).then(links => links.filter(link => {
    const courseId = extractCourseId(link);
    return courseId && !discovered.has(courseId);
  }).slice(0, remaining));
}

async function scrollAndCollectCourseLinks(page, discovered, maxCourses) {
  const links = [];
  let lastHeight = 0;
  let idleRounds = 0;

  while (discovered.size + links.length < maxCourses && idleRounds < 5) {
    const before = links.length;
    const freshLinks = await collectCourseLinks(page, new Set([...discovered, ...links.map(extractCourseId).filter(Boolean)]), maxCourses);
    links.push(...freshLinks);

    const height = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    const nextHeight = await page.evaluate(() => document.body.scrollHeight);
    if (links.length === before && nextHeight === lastHeight) {
      idleRounds++;
    } else {
      idleRounds = 0;
    }
    lastHeight = nextHeight || height;
  }

  return links.slice(0, maxCourses - discovered.size);
}

/**
 * Extrahiert course-id aus einer Kurs-URL
 * z.B. /courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/
 * → 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
 */
export function extractCourseId(url) {
  const pathname = new URL(url, BASE_URL).pathname;
  const match = pathname.match(/^\/courses\/([^/]+)\/?$/);
  const slug = match ? match[1] : null;
  return slug && /\d/.test(slug) ? slug : null;
}

/**
 * Sucht nach Kursen über die MIT OCW Search
 */
export async function discoverViaSearch(searchQuery, options = {}) {
  const { maxCourses = 100, headless = true, dryRun = false } = options;
  const discovered = new Set();
  
  const crawler = new PlaywrightCrawler({
    headless,
    maxConcurrency: 2,
    maxRequestRetries: 3,
    
    async requestHandler({ page, request, enqueueLinks }) {
      console.log(`[DISCOVERY] Scraping: ${request.url}`);
      
      // Warte auf JS-gerenderte Kurslinks
      await page.waitForSelector('a[href*="/courses/"]', { timeout: 30000 }).catch(() => {
        console.log('[WARN] Keine Kurslinks gefunden');
      });
      
      // Extrahiere Kurs-Links; die Suche lädt weitere Treffer per Infinite Scroll.
      const courseLinks = await scrollAndCollectCourseLinks(page, discovered, maxCourses);
      
      console.log(`[DISCOVERY] ${courseLinks.length} Kurs-Links gefunden`);
      
      // Kurse zur DB hinzufügen
      for (const link of courseLinks) {
        const courseId = extractCourseId(link);
        if (courseId) {
          recordDiscoveredCourse(courseId, link, { dryRun });
          discovered.add(courseId);
          console.log(`[DISCOVERY] + ${courseId}`);
        }
      }
      
      // Pagination: Nächste Seite
      const nextUrl = await page.$eval(
        'a[rel="next"], a.next, .pagination .next a, .pagination a[aria-label*="Next"]',
        a => a.href
      ).catch(() => null);
      if (nextUrl && discovered.size < maxCourses) {
        await enqueueLinks({ urls: [nextUrl] });
      }
    }
  });
  
  const searchUrl = `${BASE_URL}/search/?q=${encodeURIComponent(searchQuery)}&s=-runs.best_start_date`;
  
  await crawler.run([searchUrl]);
  
  console.log('[DISCOVERY] Crawling abgeschlossen');
  return [...discovered];
}

/**
 * Sucht nach Kursen in einem Department
 */
export async function discoverViaDepartment(departmentSlug, options = {}) {
  const { maxCourses = 200, headless = true, dryRun = false } = options;
  const discovered = new Set();
  
  const crawler = new PlaywrightCrawler({
    headless,
    maxConcurrency: 2,
    maxRequestRetries: 3,
    
    async requestHandler({ page, request, enqueueLinks }) {
      console.log(`[DISCOVERY] Department: ${request.url}`);
      
      await page.waitForSelector('a[href*="/courses/"]', { timeout: 30000 }).catch(() => {
        console.log('[WARN] Keine Kurslinks gefunden');
      });
      
      const courseLinks = await scrollAndCollectCourseLinks(page, discovered, maxCourses);
      
      for (const link of courseLinks) {
        const courseId = extractCourseId(link);
        if (courseId) {
          recordDiscoveredCourse(courseId, link, { dryRun });
          discovered.add(courseId);
          console.log(`[DISCOVERY] + ${courseId}`);
        }
      }

      const nextUrl = await page.$eval(
        'a[rel="next"], a.next, .pagination .next a, .pagination a[aria-label*="Next"]',
        a => a.href
      ).catch(() => null);
      if (nextUrl && discovered.size < maxCourses) {
        await enqueueLinks({ urls: [nextUrl] });
      }
    }
  });
  
  const deptUrl = `${BASE_URL}/courses/${departmentSlug}/`;
  
  try {
    await crawler.run([deptUrl]);
  } catch (err) {
    console.log(`[WARN] Department nicht gefunden: ${departmentSlug}`);
  }

  return [...discovered];
}

/**
 * Batch-Discovery für bekannte Departments
 */
export async function discoverAllDepartments(options = {}) {
  const departments = [
    'electrical-engineering-and-computer-science',
    'mathematics',
    'brain-and-cognitive-sciences',
    'physics',
    'chemistry',
    'biology'
  ];
  
  for (const dept of departments) {
    console.log(`[DISCOVERY] --- ${dept} ---`);
    await discoverViaDepartment(dept, options);
  }
}

export default { discoverViaSearch, discoverViaDepartment, discoverAllDepartments };
