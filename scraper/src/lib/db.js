import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../library.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      course_id            TEXT PRIMARY KEY,
      title                TEXT NOT NULL,
      source_url           TEXT,
      term                 TEXT,
      year                 TEXT,
      level                TEXT,
      topics               TEXT,
      instructors          TEXT,
      learning_resource_types TEXT,
      status               TEXT NOT NULL DEFAULT 'discovered',
      tier                 INTEGER,
      tier_score           INTEGER,
      screening_reason     TEXT,
      warnings             TEXT,
      discovered_at        TEXT DEFAULT CURRENT_TIMESTAMP,
      screened_at         TEXT,
      selected_at          TEXT,
      approved_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS lectures (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id        TEXT NOT NULL REFERENCES courses(course_id),
      number           INTEGER,
      title            TEXT,
      source_video_url TEXT,
      source_slides_url TEXT
    );

    CREATE TABLE IF NOT EXISTS materials (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id         TEXT NOT NULL REFERENCES courses(course_id),
      lecture_id        INTEGER REFERENCES lectures(id),
      type              TEXT,
      source_url        TEXT,
      local_path        TEXT,
      extraction_status TEXT
    );

    CREATE TABLE IF NOT EXISTS warnings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id  TEXT NOT NULL REFERENCES courses(course_id),
      lecture_id INTEGER REFERENCES lectures(id),
      severity   TEXT NOT NULL,
      message    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discovery_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id  TEXT NOT NULL,
      source_url TEXT,
      found_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function upsertCourse(courseId, data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO courses (course_id, title, source_url, term, year, level, topics, instructors, learning_resource_types)
    VALUES (@course_id, @title, @source_url, @term, @year, @level, @topics, @instructors, @learning_resource_types)
    ON CONFLICT(course_id) DO UPDATE SET
      title = excluded.title,
      source_url = excluded.source_url,
      term = excluded.term,
      year = excluded.year,
      level = excluded.level,
      topics = excluded.topics,
      instructors = excluded.instructors,
      learning_resource_types = excluded.learning_resource_types
  `);
  stmt.run({
    course_id: courseId,
    title: data.course_title || data.title,
    source_url: data.source_url,
    term: data.term,
    year: data.year,
    level: JSON.stringify(data.level || []),
    topics: JSON.stringify(data.topics || []),
    instructors: JSON.stringify(data.instructors || []),
    learning_resource_types: JSON.stringify(data.learning_resource_types || [])
  });
}

export function upsertDiscoveredCourse(courseId, data) {
  const db = getDb();
  const insertCourse = db.prepare(`
    INSERT INTO courses (course_id, title, source_url)
    VALUES (@course_id, @title, @source_url)
    ON CONFLICT(course_id) DO UPDATE SET
      source_url = COALESCE(courses.source_url, excluded.source_url)
  `);
  const insertLog = db.prepare(`
    INSERT INTO discovery_log (course_id, source_url)
    VALUES (@course_id, @source_url)
  `);

  const course = {
    course_id: courseId,
    title: data.course_title || data.title || 'Unknown (pending scrape)',
    source_url: data.source_url
  };

  const tx = db.transaction(() => {
    insertCourse.run(course);
    insertLog.run({ course_id: courseId, source_url: data.source_url });
  });

  tx();
}

export function updateScreening(courseId, { tier, score, warnings, reason, status }) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE courses SET
      tier = @tier,
      tier_score = @score,
      warnings = @warnings,
      screening_reason = @reason,
      status = @status,
      screened_at = CURRENT_TIMESTAMP
    WHERE course_id = @course_id
  `);
  stmt.run({
    course_id: courseId,
    tier,
    score,
    warnings: JSON.stringify(warnings || []),
    reason,
    status
  });
}

export function getCoursesByStatus(status) {
  const db = getDb();
  return db.prepare('SELECT * FROM courses WHERE status = ?').all(status);
}

export function getCourse(courseId) {
  const db = getDb();
  return db.prepare('SELECT * FROM courses WHERE course_id = ?').get(courseId);
}

export default { getDb, upsertCourse, upsertDiscoveredCourse, updateScreening, getCoursesByStatus, getCourse };
