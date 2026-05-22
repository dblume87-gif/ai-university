/**
 * Matching von Online-NotebookLM-Notebooks zu Kursen in library.db.
 *
 * Bewertet pro Notebook/Course-Paar eine Confidence aus Course-Code, Title
 * und Source-Titeln, wählt das beste Match pro Course aus und meldet
 * Duplikate.
 */

export function matchNotebooksToCourses(notebooks, courses) {
  return notebooks.map(notebook => {
    const ranked = courses
      .map(course => scoreNotebookCourseMatch(notebook, course))
      .filter(match => match.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence);

    return ranked[0] || {
      notebook,
      course: null,
      confidence: 0,
      reasons: []
    };
  });
}

export function scoreNotebookCourseMatch(notebook, course) {
  const title = normalizeMatchText(notebook.title);
  const courseTitle = normalizeMatchText(course.title);
  const courseCode = getCourseCode(course.course_id);
  const codeVariants = getCourseCodeVariants(courseCode);
  const sourceText = normalizeMatchText((notebook.sources || [])
    .map(source => [source.title, source.url].filter(Boolean).join(' '))
    .join(' '));
  const sourceSlugText = (notebook.sources || [])
    .map(source => [source.title, source.url].filter(Boolean).join(' '))
    .join(' ');
  const sourceCodeVariants = getSourceCodeVariants(courseCode);
  let confidence = 0;
  const reasons = [];

  if (hasCourseSlug(sourceSlugText, course.course_id) ||
      (course.source_url && hasCourseSlug(sourceSlugText, extractCourseSlug(course.source_url)))) {
    confidence += 0.65;
    reasons.push('source-slug');
  }

  for (const variant of codeVariants) {
    if (variant && hasNormalizedCode(title, variant)) {
      confidence += 0.65;
      reasons.push(`code:${variant}`);
      break;
    }
  }

  for (const variant of sourceCodeVariants) {
    if (variant && hasNormalizedSourceCode(sourceText, variant)) {
      confidence += 0.65;
      reasons.push(`source-code:${variant}`);
      break;
    }
  }

  if (courseTitle && title.includes(courseTitle)) {
    confidence += 0.45;
    reasons.push('title:exact');
  } else {
    const overlap = wordOverlap(title, courseTitle);
    if (overlap >= 0.8) {
      confidence += 0.35;
      reasons.push('title:strong');
    } else if (overlap >= 0.55) {
      confidence += 0.2;
      reasons.push('title:partial');
    }
  }

  if (title.includes('mit')) {
    confidence += 0.05;
    reasons.push('mit');
  }

  if (reasons.some(reason => reason.startsWith('source-code:') || reason === 'source-slug') &&
      !reasons.some(reason => reason.startsWith('code:') || reason.startsWith('title:')) &&
      (notebook.sources?.length || 0) < 2) {
    confidence = Math.min(confidence, 0.5);
    reasons.push('too-few-sources');
  }

  return {
    notebook,
    course,
    confidence: Number(Math.min(confidence, 1).toFixed(2)),
    reasons
  };
}

export function choosePrimaryMatches(matches) {
  const byCourse = new Map();
  for (const match of matches) {
    const current = byCourse.get(match.course.course_id);
    if (!current || compareMatch(match, current) < 0) {
      byCourse.set(match.course.course_id, match);
    }
  }

  return [...byCourse.values()].sort((a, b) => a.course.course_id.localeCompare(b.course.course_id));
}

export function findDuplicateMatches(matches) {
  const byCourse = new Map();
  for (const match of matches.filter(item => item.course)) {
    const id = match.course.course_id;
    byCourse.set(id, [...(byCourse.get(id) || []), match]);
  }

  return [...byCourse.entries()]
    .filter(([, courseMatches]) => courseMatches.length > 1)
    .map(([courseId, courseMatches]) => ({
      course_id: courseId,
      matches: courseMatches.sort(compareMatch)
    }));
}

function compareMatch(a, b) {
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  const aHasCode = a.reasons.some(reason => reason.startsWith('code:'));
  const bHasCode = b.reasons.some(reason => reason.startsWith('code:'));
  if (aHasCode !== bHasCode) return aHasCode ? -1 : 1;
  return String(a.notebook.created_at || '').localeCompare(String(b.notebook.created_at || ''));
}

function getCourseCode(courseId) {
  const parts = String(courseId || '').split('-');
  if (parts[0] === 'mas' && parts[1]) return `MAS.${parts[1].toUpperCase()}`;
  if (parts[0] === 'res' && parts[1] && parts[2]) return `RES.${parts[1]}.${parts[2]}`;
  if (/^\d+$/.test(parts[0]) && parts[1]) return `${parts[0]}.${parts[1].toUpperCase()}`;
  return parts.slice(0, 2).join('-').toUpperCase();
}

function getCourseCodeVariants(code) {
  if (!code) return [];
  const variants = new Set([code, code.replace('.', '-'), code.replace('.', ' ')]);

  if (/^\d+\.\d{4}$/.test(code)) {
    variants.add(code.replace(/\.0+/, '.'));
    variants.add(code.replace(/\.0+/, '-'));
  }

  return [...variants];
}

function getSourceCodeVariants(code) {
  if (!code) return [];
  const compact = code.replace('.', '_').replace('-', '_');
  return [
    `MIT${compact}`
  ];
}

function hasCourseSlug(text, courseId) {
  if (!text || !courseId) return false;
  return normalizeSlugText(text).includes(normalizeSlugText(courseId));
}

function extractCourseSlug(value) {
  const match = String(value || '').match(/\/courses\/([^/?#]+)/);
  return match?.[1] || value;
}

function normalizeSlugText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/%2f/g, '/')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function hasNormalizedSourceCode(text, value) {
  const normalizedValue = normalizeMatchText(value);
  const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${escaped}[a-z0-9]*( |$)`).test(text);
}

function hasNormalizedCode(text, value) {
  const normalizedValue = normalizeMatchText(value);
  const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${escaped}( |$)`).test(text);
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const ignore = new Set(['mit', 'the', 'and', 'of', 'to', 'in', 'for', 'with', 'an', 'a']);
  const wordsA = new Set(a.split(' ').filter(word => word && !ignore.has(word)));
  const wordsB = b.split(' ').filter(word => word && !ignore.has(word));
  if (wordsB.length === 0) return 0;
  return wordsB.filter(word => wordsA.has(word)).length / wordsB.length;
}
