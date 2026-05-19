/**
 * MIT OCW Pipeline — Main Entry Point
 * 
 * Usage:
 *   node src/scrape.js discover --query "machine learning"
 *   node src/scrape.js screen --all
 *   node src/scrape.js screen 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
 */

import { discoverViaSearch, discoverAllDepartments, discoverAllCourses } from './discovery/crawl.js';
import { screenCourse, screenCourses, screenDiscovered } from './screening/screen.js';
import { getShortlist, getShortlistOptions, printShortlist } from './curation/shortlist.js';
import { getSimilarCourses, getSimilarOptions, printSimilarCourses } from './curation/similar.js';
import { exportCourseUnits, getCourseUnitOptions, printCourseUnitResults } from './curation/units.js';
import { getLocalImportOptions, importLocalLibrary, printLocalImportResults } from './local/import-library.js';
import {
  approveCourseForNotebookLm,
  exportNotebookLmManifest,
  getNotebookLmOptions,
  getReadyNotebookLmCourses,
  indexNotebookLmAssets,
  printNotebookLmAssetIndex,
  printReadyNotebookLmCourses,
  printNotebookLmSyncResult,
  syncNotebookLmCourses,
  uploadNotebookLmManifest
} from './notebooklm/manifest.js';
import { getDb, getCoursesByStatus } from './lib/db.js';
import { SCREENING_STATUS } from './lib/schema.js';
import { parseCliArgs } from './lib/cli.js';

const args = process.argv.slice(2);
const command = args[0];
const arg = args[1];

const DISCOVER_SCHEMA = {
  stringFlags: ['--query'],
  intFlags: ['--max', '--offset', '--batch-size'],
  booleanFlags: ['--all', '--depts', '--headless', '--headed', '--dry-run', '--help', '-h']
};

const SCREEN_SCHEMA = {
  stringFlags: ['--deep-tier'],
  intFlags: ['--limit', '--batch-size'],
  booleanFlags: ['--all', '--fast', '--deep', '--help', '-h']
};

function printUsage() {
  console.log(`
MIT OCW Pipeline

Usage:
  node src/scrape.js discover --query "machine learning" [--max 5] [--headless|--headed] [--dry-run]
  node src/scrape.js discover --all [--max 3000] [--offset 0] [--batch-size 250] [--dry-run]
  node src/scrape.js discover --depts [--max 5] [--headless|--headed] [--dry-run]
  node src/scrape.js screen --all [--fast|--deep] [--deep-tier 1,2] [--limit 1000] [--batch-size 100]
  node src/scrape.js screen <course-id> [--fast|--deep] [--deep-tier 1,2]
  node src/scrape.js shortlist [--limit 5] [--topic "Economics"] [--department 18] [--material psets] [--min-videos 10] [--min-pdfs 5] [--include-hold] [--sort score|videos|pdfs|notes|psets|exams|title]
  node src/scrape.js similar <course-id> [--limit 5] [--include-hold]
  node src/scrape.js units <course-id...> [--assigned-only] [--out-root output/notebooklm]
  node src/scrape.js local import [--root ../library] [--course-id id] [--rescreen] [--fast] [--dry-run]
  node src/scrape.js notebooklm ready [--limit 10] [--include-hold]
  node src/scrape.js notebooklm approve <course-id>
  node src/scrape.js notebooklm export <course-id> [--max-sources 50] [--out ocw-pipeline/output/notebooklm/<course-id>] [--mark-ready] [--notebook-id id]
  node src/scrape.js notebooklm upload <course-id> [--notebook-id id|--create] [--max-sources 50] [--wait] [--dry-run] [--stop-on-error]
  node src/scrape.js notebooklm sync [--dry-run] [--with-metadata]
  node src/scrape.js notebooklm assets [course-id] [--download] [--dry-run] [--types video,audio,report]
  node src/scrape.js test [course-id]
  node src/scrape.js status
      `);
}

const topLevel = parseCliArgs(args, {
  booleanFlags: ['--help', '-h'],
  allowUnknownFlags: true
});

function getDiscoverOptions() {
  // Discover-CLI: positional[0] = command, [1+] = optionale Query.
  const parsed = parseCliArgs(args.slice(1), DISCOVER_SCHEMA);
  return {
    maxCourses: parsed.getPositiveInt('--max', undefined),
    offset: parsed.getPositiveInt('--offset', 0) || 0,
    batchSize: parsed.getPositiveInt('--batch-size', undefined),
    headless: parsed.has('--headless') ? true : !parsed.has('--headed'),
    dryRun: parsed.has('--dry-run'),
    queryFromPositional: parsed.positional[0],
    queryFlag: parsed.getString('--query'),
    isAll: parsed.has('--all'),
    isDepts: parsed.has('--depts')
  };
}

function getScreenOptions() {
  const parsed = parseCliArgs(args.slice(1), SCREEN_SCHEMA);
  const deepTiers = parsed
    .getList('--deep-tier')
    ?.map(value => Number.parseInt(value, 10))
    .filter(value => Number.isInteger(value));

  const selectedDeepTiers = deepTiers && deepTiers.length > 0 ? deepTiers : null;
  const isFast = parsed.has('--fast');

  return {
    deep: !isFast || selectedDeepTiers !== null,
    deepTiers: isFast ? selectedDeepTiers : null,
    limit: parsed.getPositiveInt('--limit', null),
    batchSize: parsed.getPositiveInt('--batch-size', null),
    courseIdFromPositional: parsed.positional[0],
    isAll: parsed.has('--all')
  };
}

async function main() {
  if (!command || topLevel.has('--help') || topLevel.has('-h')) {
    printUsage();
    return;
  }

  switch (command) {
    case 'discover': {
      // discover --query "machine learning"
      // discover --depts
      const options = getDiscoverOptions();

      if (options.isAll) {
        console.log('[MAIN] Starte Vollkatalog-Discovery...');
        await discoverAllCourses(options);
      } else if (options.isDepts) {
        console.log('[MAIN] Starte Department-Discovery...');
        await discoverAllDepartments(options);
      } else {
        const query = options.queryFlag || options.queryFromPositional || 'computer science';
        console.log(`[MAIN] Starte Search-Discovery für: "${query}"...`);
        await discoverViaSearch(query, options);
      }
      break;
    }

    case 'screen': {
      const options = getScreenOptions();
      const courseId = options.courseIdFromPositional;
      let results;

      if (options.isAll) {
        console.log('[MAIN] Screene alle discovered Kurse...');
        results = await screenDiscovered(options);
      } else if (courseId) {
        console.log(`[MAIN] Screene Kurs: ${courseId}`);
        results = [await screenCourse(courseId, options)];
      } else {
        console.log('[MAIN] Screene alle discovered Kurse...');
        results = await screenDiscovered(options);
      }

      const failed = results.filter(result => result.error);
      if (failed.length > 0) {
        throw new Error(`Screening fehlgeschlagen: ${failed.length}/${results.length} Kurse mit Fehler.`);
      }
      break;
    }
    
    case 'status': {
      const db = getDb();
      const statuses = [
        SCREENING_STATUS.DISCOVERED,
        SCREENING_STATUS.SCREENED,
        SCREENING_STATUS.SELECTED,
        SCREENING_STATUS.READY_FOR_NOTEBOOKLM,
        SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM,
        SCREENING_STATUS.UPLOADED_TO_NOTEBOOKLM,
        SCREENING_STATUS.NOTEBOOKLM_VALIDATED,
        SCREENING_STATUS.NEEDS_FIX,
        SCREENING_STATUS.HOLD,
        SCREENING_STATUS.REJECTED
      ];
      
      console.log('\n=== Library Status ===\n');
      for (const status of statuses) {
        const courses = getCoursesByStatus(status);
        console.log(`${status}: ${courses.length}`);
      }
      
      const total = db.prepare('SELECT COUNT(*) as count FROM courses').get();
      console.log(`\nTotal: ${total.count}`);
      break;
    }

    case 'shortlist': {
      const options = getShortlistOptions(args.slice(1));
      const courses = getShortlist(options);
      printShortlist(courses, options);
      break;
    }

    case 'similar': {
      const options = getSimilarOptions(args.slice(1));
      const { seed, courses } = getSimilarCourses(options);
      printSimilarCourses(seed, courses, options);
      break;
    }

    case 'units': {
      const options = getCourseUnitOptions(args.slice(1));
      if (options.courseIds.length === 0) throw new Error('Bitte mindestens eine course-id angeben: units <course-id...>');
      const results = await exportCourseUnits(options.courseIds, options);
      printCourseUnitResults(results);
      break;
    }

    case 'local': {
      const action = args[1] || 'import';
      if (action === 'import') {
        const options = getLocalImportOptions(args.slice(2));
        const results = await importLocalLibrary(options);
        printLocalImportResults(results);
      } else {
        printUsage();
      }
      break;
    }

    case 'notebooklm': {
      const action = args[1] || 'ready';
      const options = getNotebookLmOptions(args.slice(1));

      if (action === 'ready') {
        const courses = getReadyNotebookLmCourses(options);
        printReadyNotebookLmCourses(courses);
      } else if (action === 'approve') {
        if (!options.courseId) throw new Error('Bitte course-id angeben: notebooklm approve <course-id>');
        const course = approveCourseForNotebookLm(options.courseId);
        console.log(`[NOTEBOOKLM] Freigegeben: ${course.course_id} (${course.title})`);
      } else if (action === 'export') {
        if (!options.courseId) throw new Error('Bitte course-id angeben: notebooklm export <course-id>');
        const result = await exportNotebookLmManifest(options.courseId, options);
        console.log(`[NOTEBOOKLM] Manifest: ${result.manifestPath}`);
        console.log(`[NOTEBOOKLM] Upload Queue: ${result.queuePath}`);
        console.log(`[NOTEBOOKLM] Status: ${result.status}; Quellen: ${result.sourceCount}`);
        if (result.qa.blocking.length > 0) {
          console.log(`[NOTEBOOKLM] Blocker: ${result.qa.blocking.join('; ')}`);
        }
      } else if (action === 'upload') {
        if (!options.courseId) throw new Error('Bitte course-id angeben: notebooklm upload <course-id>');
        const result = await uploadNotebookLmManifest(options.courseId, options);
        console.log(`[NOTEBOOKLM] Manifest: ${result.manifestPath}`);
        console.log(`[NOTEBOOKLM] Upload Log: ${result.uploadLogPath}`);
        console.log(`[NOTEBOOKLM] ${result.dryRun ? 'Dry Run' : 'Upload'}: ${result.uploadedSources} Quellen${result.notebookId ? ` → ${result.notebookId}` : ''}`);
        if (result.failedSources > 0) {
          console.log(`[NOTEBOOKLM] Fehlgeschlagen: ${result.failedSources} Quellen, Details im Upload Log.`);
        }
      } else if (action === 'sync') {
        const result = syncNotebookLmCourses(options);
        printNotebookLmSyncResult(result);
      } else if (action === 'assets') {
        const assetOptions = getNotebookLmOptions(['assets', ...args.slice(2)]);
        const result = await indexNotebookLmAssets(assetOptions);
        printNotebookLmAssetIndex(result);
      } else {
        printUsage();
      }
      break;
    }
    
    case 'test': {
      // Teste einen einzelnen Kurs
      const courseId = arg || '6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016';
      console.log(`[TEST] Screene Test-Kurs: ${courseId}`);
      const result = await screenCourse(courseId, getScreenOptions());
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    default:
      printUsage();
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
