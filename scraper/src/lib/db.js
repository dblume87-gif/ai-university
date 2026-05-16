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
      departments          TEXT,
      department_numbers   TEXT,
      as_taught_in         TEXT,
      term                 TEXT,
      year                 TEXT,
      level                TEXT,
      topics               TEXT,
      instructors          TEXT,
      learning_resource_types TEXT,
      course_page_metadata TEXT,
      status               TEXT NOT NULL DEFAULT 'discovered',
      tier                 INTEGER,
      tier_score           INTEGER,
      screening_reason     TEXT,
      warnings             TEXT,
      notebooklm_status    TEXT,
      notebooklm_manifest_path TEXT,
      notebooklm_notebook_id TEXT,
      notebooklm_source_count INTEGER,
      notebooklm_uploaded_at TEXT,
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
      title             TEXT,
      material_type     TEXT,
      media_type        TEXT,
      source_kind       TEXT,
      resource_id       TEXT,
      resource_path     TEXT,
      source_url        TEXT,
      local_path        TEXT,
      extraction_status TEXT,
      metadata_json     TEXT,
      created_at        TEXT DEFAULT CURRENT_TIMESTAMP
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

  migrateSchema();
}

function migrateSchema() {
  const courseColumns = new Set(db.prepare('PRAGMA table_info(courses)').all().map(column => column.name));
  const courseMigrations = [
    ['departments', 'ALTER TABLE courses ADD COLUMN departments TEXT'],
    ['department_numbers', 'ALTER TABLE courses ADD COLUMN department_numbers TEXT'],
    ['as_taught_in', 'ALTER TABLE courses ADD COLUMN as_taught_in TEXT'],
    ['course_page_metadata', 'ALTER TABLE courses ADD COLUMN course_page_metadata TEXT'],
    ['notebooklm_status', 'ALTER TABLE courses ADD COLUMN notebooklm_status TEXT'],
    ['notebooklm_manifest_path', 'ALTER TABLE courses ADD COLUMN notebooklm_manifest_path TEXT'],
    ['notebooklm_notebook_id', 'ALTER TABLE courses ADD COLUMN notebooklm_notebook_id TEXT'],
    ['notebooklm_source_count', 'ALTER TABLE courses ADD COLUMN notebooklm_source_count INTEGER'],
    ['notebooklm_uploaded_at', 'ALTER TABLE courses ADD COLUMN notebooklm_uploaded_at TEXT']
  ];

  for (const [column, sql] of courseMigrations) {
    if (!courseColumns.has(column)) {
      db.exec(sql);
    }
  }

  const materialColumns = new Set(db.prepare('PRAGMA table_info(materials)').all().map(column => column.name));
  const materialMigrations = [
    ['title', 'ALTER TABLE materials ADD COLUMN title TEXT'],
    ['material_type', 'ALTER TABLE materials ADD COLUMN material_type TEXT'],
    ['media_type', 'ALTER TABLE materials ADD COLUMN media_type TEXT'],
    ['source_kind', 'ALTER TABLE materials ADD COLUMN source_kind TEXT'],
    ['resource_id', 'ALTER TABLE materials ADD COLUMN resource_id TEXT'],
    ['resource_path', 'ALTER TABLE materials ADD COLUMN resource_path TEXT'],
    ['metadata_json', 'ALTER TABLE materials ADD COLUMN metadata_json TEXT'],
    ['created_at', 'ALTER TABLE materials ADD COLUMN created_at TEXT']
  ];

  for (const [column, sql] of materialMigrations) {
    if (!materialColumns.has(column)) {
      db.exec(sql);
    }
  }
}

export function upsertCourse(courseId, data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO courses (
      course_id,
      title,
      source_url,
      departments,
      department_numbers,
      as_taught_in,
      term,
      year,
      level,
      topics,
      instructors,
      learning_resource_types,
      course_page_metadata
    )
    VALUES (
      @course_id,
      @title,
      @source_url,
      @departments,
      @department_numbers,
      @as_taught_in,
      @term,
      @year,
      @level,
      @topics,
      @instructors,
      @learning_resource_types,
      @course_page_metadata
    )
    ON CONFLICT(course_id) DO UPDATE SET
      title = excluded.title,
      source_url = excluded.source_url,
      departments = excluded.departments,
      department_numbers = excluded.department_numbers,
      as_taught_in = excluded.as_taught_in,
      term = excluded.term,
      year = excluded.year,
      level = excluded.level,
      topics = excluded.topics,
      instructors = excluded.instructors,
      learning_resource_types = excluded.learning_resource_types,
      course_page_metadata = excluded.course_page_metadata
  `);
  stmt.run({
    course_id: courseId,
    title: data.course_title || data.title || 'Unknown',
    source_url: data.source_url,
    departments: JSON.stringify(data.departments || []),
    department_numbers: JSON.stringify(data.department_numbers || []),
    as_taught_in: data.as_taught_in || [data.term, data.year].filter(Boolean).join(' ') || null,
    term: data.term,
    year: data.year,
    level: JSON.stringify(data.level || []),
    topics: JSON.stringify(data.topics || []),
    instructors: JSON.stringify(data.instructors || []),
    learning_resource_types: JSON.stringify(data.learning_resource_types || []),
    course_page_metadata: JSON.stringify(data.course_page_metadata || {})
  });
}

export function upsertDiscoveredCourse(courseId, data) {
  const db = getDb();
  const insertCourse = db.prepare(`
    INSERT INTO courses (course_id, title, source_url)
    VALUES (@course_id, @title, @source_url)
    ON CONFLICT(course_id) DO UPDATE SET
      source_url = excluded.source_url
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

export function replaceCourseMaterials(courseId, materials) {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM materials WHERE course_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO materials (
      course_id,
      lecture_id,
      type,
      title,
      material_type,
      media_type,
      source_kind,
      resource_id,
      resource_path,
      source_url,
      local_path,
      extraction_status,
      metadata_json,
      created_at
    )
    VALUES (
      @course_id,
      @lecture_id,
      @type,
      @title,
      @material_type,
      @media_type,
      @source_kind,
      @resource_id,
      @resource_path,
      @source_url,
      @local_path,
      @extraction_status,
      @metadata_json,
      CURRENT_TIMESTAMP
    )
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(courseId);
    for (const material of materials) {
      insertStmt.run({
        course_id: courseId,
        lecture_id: material.lecture_id || null,
        type: material.type || material.material_type || null,
        title: material.title || null,
        material_type: material.material_type || material.type || 'Other',
        media_type: material.media_type || 'other',
        source_kind: material.source_kind || null,
        resource_id: material.resource_id || null,
        resource_path: material.resource_path || null,
        source_url: material.source_url || null,
        local_path: material.local_path || null,
        extraction_status: material.extraction_status || 'linked',
        metadata_json: JSON.stringify(material.metadata || {})
      });
    }
  });

  tx();
}

export function getCoursesByStatus(status) {
  const db = getDb();
  return db.prepare('SELECT * FROM courses WHERE status = ?').all(status);
}

export function getCourse(courseId) {
  const db = getDb();
  return db.prepare('SELECT * FROM courses WHERE course_id = ?').get(courseId);
}

export function getAllCourses() {
  const db = getDb();
  return db.prepare('SELECT * FROM courses ORDER BY course_id').all();
}

export function getCourseMaterials(courseId) {
  const db = getDb();
  return db.prepare(`
    SELECT *
    FROM materials
    WHERE course_id = ?
    ORDER BY
      CASE media_type
        WHEN 'pdf' THEN 1
        WHEN 'youtube' THEN 2
        WHEN 'video' THEN 3
        WHEN 'html' THEN 4
        ELSE 5
      END,
      id
  `).all(courseId);
}

export function updateCourseStatus(courseId, status) {
  const db = getDb();
  const approvedAtSql = status === 'approved_for_notebooklm'
    ? ', approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)'
    : '';

  const result = db.prepare(`
    UPDATE courses
    SET status = @status${approvedAtSql}
    WHERE course_id = @course_id
  `).run({ course_id: courseId, status });

  return result.changes;
}

export function updateNotebookLmExport(courseId, { status, manifestPath, sourceCount, notebookId = null }) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE courses
    SET
      notebooklm_status = @status,
      notebooklm_manifest_path = @manifest_path,
      notebooklm_source_count = @source_count,
      notebooklm_notebook_id = COALESCE(@notebook_id, notebooklm_notebook_id),
      notebooklm_uploaded_at = CASE
        WHEN @status = 'uploaded_to_notebooklm' THEN CURRENT_TIMESTAMP
        ELSE notebooklm_uploaded_at
      END
    WHERE course_id = @course_id
  `).run({
    course_id: courseId,
    status,
    manifest_path: manifestPath,
    source_count: sourceCount,
    notebook_id: notebookId
  });

  return result.changes;
}

export function markNotebookLmUploaded(courseId, { notebookId, sourceCount = null, manifestPath = null }) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE courses
    SET
      status = 'uploaded_to_notebooklm',
      notebooklm_status = 'uploaded_to_notebooklm',
      notebooklm_notebook_id = @notebook_id,
      notebooklm_source_count = COALESCE(@source_count, notebooklm_source_count),
      notebooklm_manifest_path = COALESCE(@manifest_path, notebooklm_manifest_path),
      notebooklm_uploaded_at = COALESCE(notebooklm_uploaded_at, CURRENT_TIMESTAMP)
    WHERE course_id = @course_id
  `).run({
    course_id: courseId,
    notebook_id: notebookId,
    source_count: sourceCount,
    manifest_path: manifestPath
  });

  return result.changes;
}

export function markNotebookLmValidated(courseId) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE courses
    SET
      status = 'notebooklm_validated',
      notebooklm_status = 'notebooklm_validated'
    WHERE course_id = @course_id
  `).run({ course_id: courseId });

  return result.changes;
}

export default {
  getDb,
  upsertCourse,
  upsertDiscoveredCourse,
  updateScreening,
  replaceCourseMaterials,
  getCoursesByStatus,
  getCourse,
  getAllCourses,
  getCourseMaterials,
  updateCourseStatus,
  updateNotebookLmExport,
  markNotebookLmUploaded,
  markNotebookLmValidated
};
