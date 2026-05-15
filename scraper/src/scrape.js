/**
 * MIT OCW Scraper — Main Entry Point
 * 
 * Usage:
 *   node src/scrape.js discover --query "machine learning"
 *   node src/scrape.js screen --all
 *   node src/scrape.js screen 6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016
 */

import { discoverViaSearch, discoverAllDepartments } from './discovery/crawl.js';
import { screenCourse, screenCourses, screenDiscovered } from './screening/screen.js';
import { getDb, getCoursesByStatus } from './lib/db.js';
import { SCREENING_STATUS } from './lib/schema.js';

const args = process.argv.slice(2);
const command = args[0];
const arg = args[1];

function getOptionValue(name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

function hasOption(name) {
  return args.includes(name);
}

function getDiscoverQueryArg() {
  for (let i = 1; i < args.length; i++) {
    const value = args[i];
    if (value === '--query' || value === '--max') {
      i++;
      continue;
    }
    if (value.startsWith('--')) continue;
    return value;
  }

  return undefined;
}

function getDiscoverOptions() {
  const max = Number.parseInt(getOptionValue('--max'), 10);

  return {
    maxCourses: Number.isInteger(max) && max > 0 ? max : undefined,
    headless: hasOption('--headless') ? true : !hasOption('--headed'),
    dryRun: hasOption('--dry-run')
  };
}

async function main() {
  switch (command) {
    case 'discover': {
      // discover --query "machine learning"
      // discover --depts
      const options = getDiscoverOptions();

      if (hasOption('--depts')) {
        console.log('[MAIN] Starte Department-Discovery...');
        await discoverAllDepartments(options);
      } else {
        const query = getOptionValue('--query') || getDiscoverQueryArg() || 'computer science';
        console.log(`[MAIN] Starte Search-Discovery für: "${query}"...`);
        await discoverViaSearch(query, options);
      }
      break;
    }
    
    case 'screen': {
      if (arg === '--all') {
        console.log('[MAIN] Screene alle discovered Kurse...');
        await screenDiscovered();
      } else if (arg) {
        console.log(`[MAIN] Screene Kurs: ${arg}`);
        await screenCourse(arg);
      } else {
        console.log('[MAIN] Screene alle discovered Kurse...');
        await screenDiscovered();
      }
      break;
    }
    
    case 'status': {
      const db = getDb();
      const statuses = [
        SCREENING_STATUS.DISCOVERED,
        SCREENING_STATUS.SCREENED,
        SCREENING_STATUS.SELECTED,
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
    
    case 'test': {
      // Teste einen einzelnen Kurs
      const courseId = arg || '6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016';
      console.log(`[TEST] Screene Test-Kurs: ${courseId}`);
      const result = await screenCourse(courseId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    default:
      console.log(`
MIT OCW Scraper

Usage:
  node src/scrape.js discover --query "machine learning" [--max 5] [--headless|--headed] [--dry-run]
  node src/scrape.js discover --depts [--max 5] [--headless|--headed] [--dry-run]
  node src/scrape.js screen --all
  node src/scrape.js screen <course-id>
  node src/scrape.js test [course-id]
  node src/scrape.js status
      `);
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
