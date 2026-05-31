import { createDeterministicProvider } from '../provider-runtime/index.js';

const TERM_MAP = new Map([
  ['kardiologie', {
    synonyms: ['heart disease'],
    translations: ['cardiology', 'cardiovascular']
  }],
  ['cardiology', {
    synonyms: ['heart disease'],
    translations: ['cardiology', 'cardiovascular']
  }],
  ['accounting', {
    synonyms: ['financial accounting', 'managerial accounting'],
    translations: ['accounting', 'finance']
  }],
  ['buchhaltung', {
    synonyms: ['financial accounting', 'managerial accounting'],
    translations: ['accounting', 'finance']
  }],
  ['computer science', {
    synonyms: ['programming', 'software'],
    translations: ['computer science', 'programming', 'python']
  }],
  ['informatik', {
    synonyms: ['programming', 'software'],
    translations: ['computer science', 'programming', 'python']
  }],
  ['ai', {
    synonyms: ['artificial intelligence', 'generative ai'],
    translations: ['artificial intelligence', 'machine learning', 'python', 'programming']
  }]
]);

const HIGH_SCORE_WITHOUT_TOPIC_CONFIRMATION = 20;

export function createQualityReviewProvider() {
  return createDeterministicProvider({
    handlers: {
      goal_expansion: ({ input }) => reviewGoalExpansion(input),
      topic_fit: ({ input }) => reviewTopicFit(input),
      coverage_review: ({ input }) => reviewSourceCoverage(input),
      plan_review: ({ input }) => reviewPlanQuality(input)
    }
  });
}

export function reviewGoalExpansion(input = {}) {
  const contract = input.normalized_contract || input.contract || input;
  const goal = String(contract.goal || '').trim();
  const domainTerms = tokenize(goal);
  const mapped = collectMappedTerms(goal, domainTerms);

  if (domainTerms.length === 0 || (domainTerms.length < 2 && mapped.synonyms.length === 0 && mapped.translations.length === 0)) {
    return {
      decision: 'ask_user',
      reasons: ['Das Lernziel ist noch zu vage. Bitte beschreibe konkreter, was du lernen willst.'],
      default_action: null,
      proposed_actions: [],
      data: {
        domain_terms: domainTerms,
        synonyms: [],
        translations: [],
        topic_terms: [],
        selector_terms: domainTerms,
        language: contract.language || 'de',
        level: contract.current_level || null,
        exclusions: []
      }
    };
  }

  const synonyms = uniqueTerms(mapped.synonyms);
  const translations = uniqueTerms(mapped.translations);
  const topicTerms = uniqueTerms([...domainTerms, ...synonyms, ...translations]);
  const selectorTerms = uniqueTerms([...topicTerms, ...domainTerms]);

  return {
    decision: 'accepted',
    reasons: ['Such- und Topic-Begriffe wurden deterministisch erweitert.'],
    default_action: null,
    proposed_actions: [],
    data: {
      domain_terms: domainTerms,
      synonyms,
      translations,
      topic_terms: topicTerms,
      selector_terms: selectorTerms,
      language: contract.language || 'de',
      level: contract.current_level || null,
      exclusions: []
    }
  };
}

export function reviewTopicFit(input = {}) {
  const candidates = extractCandidates(input);
  const topicTerms = uniqueTerms(input.topic_terms || input.goal_expansion?.topic_terms || input.expansion?.topic_terms || []);
  const verdicts = candidates.map(candidate => buildCandidateVerdict(candidate, topicTerms));
  const acceptedCandidateIds = verdicts
    .filter(verdict => verdict.verdict === 'accept')
    .map(verdict => verdict.course_id);
  const lowConfidenceIds = verdicts
    .filter(verdict => verdict.verdict === 'low_confidence')
    .map(verdict => verdict.course_id);

  if (acceptedCandidateIds.length > 0) {
    return {
      decision: 'accepted',
      reasons: [`${acceptedCandidateIds.length} Kandidat(en) haben Topic-Bestaetigung.`],
      default_action: null,
      proposed_actions: [],
      data: {
        verdicts,
        accepted_candidate_ids: acceptedCandidateIds,
        low_confidence_candidate_ids: lowConfidenceIds
      }
    };
  }

  if (lowConfidenceIds.length > 0) {
    return {
      decision: 'ask_user',
      reasons: ['Es gibt nur Low-Confidence-Kandidaten ohne bestaetigten Topic-Pfad.'],
      default_action: 'broaden',
      proposed_actions: [
        { action: 'broaden', label: 'Breiter suchen', params: {}, safe_default: true },
        { action: 'refine', label: 'Ziel schaerfen', params: {}, safe_default: false },
        { action: 'continue_anyway', label: 'Low-Confidence-Kandidaten uebernehmen', params: {
          candidate_ids: lowConfidenceIds
        }, safe_default: false }
      ],
      data: {
        verdicts,
        accepted_candidate_ids: [],
        low_confidence_candidate_ids: lowConfidenceIds
      }
    };
  }

  return {
    decision: 'ask_user',
    reasons: ['Kein Kandidat konnte thematisch bestaetigt werden.'],
    default_action: 'broaden',
    proposed_actions: [
      { action: 'broaden', label: 'Breiter suchen', params: {}, safe_default: true },
      { action: 'refine', label: 'Ziel schaerfen', params: {}, safe_default: false }
    ],
    data: {
      verdicts,
      accepted_candidate_ids: [],
      low_confidence_candidate_ids: []
    }
  };
}

export function buildAcceptedCandidateSelection(selection, reviewData, { includeLowConfidence = false } = {}) {
  const candidates = selection.candidate_courses || [];
  const accepted = new Set(reviewData.accepted_candidate_ids || []);
  const lowConfidence = new Set(includeLowConfidence ? reviewData.low_confidence_candidate_ids || [] : []);
  const candidateCourses = candidates.filter(candidate => accepted.has(candidate.course_id) || lowConfidence.has(candidate.course_id));
  return {
    ...selection,
    candidate_courses: candidateCourses,
    agent_review: {
      ...(selection.agent_review || {}),
      topic_fit: reviewData
    },
    no_candidates: candidateCourses.length === 0
  };
}

export function reviewSourceCoverage(input = {}) {
  const overviews = input.course_material_overviews || input.screening?.course_material_overviews || [];
  const courseCoverage = overviews.map(overview => {
    const usableSourceCount = (overview.usable_sources || []).length;
    const unitCount = Number(overview.unit_count || overview.units?.length || 0);
    const coverageRatio = unitCount > 0 ? usableSourceCount / unitCount : (usableSourceCount > 0 ? 1 : 0);
    const gapCodes = (overview.gaps || []).map(gap => gap.code);
    return {
      course_id: overview.course_id,
      title: overview.title || null,
      usable_source_count: usableSourceCount,
      unit_count: unitCount,
      coverage_ratio: Math.round(coverageRatio * 100) / 100,
      gap_codes: gapCodes,
      empty: usableSourceCount === 0 || gapCodes.includes('no_usable_sources'),
      thin: usableSourceCount > 0 && unitCount > 0 && coverageRatio < 0.5
    };
  });

  const emptyCourses = courseCoverage.filter(item => item.empty);
  const thinCourses = courseCoverage.filter(item => item.thin);

  if (courseCoverage.length === 0 || emptyCourses.length === courseCoverage.length) {
    return {
      decision: 'retry',
      reasons: ['Keine akzeptierten Kurse haben nutzbare Quellen.'],
      default_action: 'recover_sources',
      proposed_actions: [
        { action: 'recover_sources', label: 'Deep Scan und Unit Export starten', params: {
          rescreenMissing: true,
          exportMissingUnits: true
        }, safe_default: true }
      ],
      data: {
        course_coverage: courseCoverage,
        empty_course_ids: emptyCourses.map(item => item.course_id),
        thin_course_ids: thinCourses.map(item => item.course_id)
      }
    };
  }

  if (emptyCourses.length > 0 || thinCourses.length > 0) {
    return {
      decision: 'ask_user',
      reasons: ['Einzelne Kurse haben keine oder duenne Source-Coverage.'],
      default_action: 'recover_sources',
      proposed_actions: [
        { action: 'recover_sources', label: 'Deep Scan und Unit Export starten', params: {
          rescreenMissing: true,
          exportMissingUnits: true
        }, safe_default: true },
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {
          empty_course_ids: emptyCourses.map(item => item.course_id),
          thin_course_ids: thinCourses.map(item => item.course_id)
        }, safe_default: false }
      ],
      data: {
        course_coverage: courseCoverage,
        empty_course_ids: emptyCourses.map(item => item.course_id),
        thin_course_ids: thinCourses.map(item => item.course_id)
      }
    };
  }

  return {
    decision: 'accepted',
    reasons: ['Alle akzeptierten Kurse haben nutzbare Source-Coverage.'],
    default_action: null,
    proposed_actions: [],
    data: {
      course_coverage: courseCoverage,
      empty_course_ids: [],
      thin_course_ids: []
    }
  };
}

export function reviewPlanQuality(input = {}) {
  const plan = input.plan || input;
  const selectedCourseIds = new Set((plan.selected_courses || []).map(course => course.course_id));
  const flags = [];

  for (const unit of plan.units || []) {
    if (isRawTitle(unit.title)) {
      flags.push({
        code: 'raw_title',
        unit_id: unit.unit_id || null,
        course_id: unit.course_id || null,
        title: unit.title,
        normalized_title: normalizeUnitTitle(unit.title)
      });
    }
    if ((unit.sources || []).length === 0 && (unit.source_ids || []).length === 0) {
      flags.push({
        code: 'unit_without_sources',
        unit_id: unit.unit_id || null,
        course_id: unit.course_id || null,
        title: unit.title || null
      });
    }
    if (unit.course_id && selectedCourseIds.size > 0 && !selectedCourseIds.has(unit.course_id)) {
      flags.push({
        code: 'course_id_mismatch',
        unit_id: unit.unit_id || null,
        course_id: unit.course_id,
        title: unit.title || null
      });
    }
  }

  if (flags.length > 0) {
    return {
      decision: 'ask_user',
      reasons: [`Der Lernpfad hat ${flags.length} Qualitaets-Flag(s).`],
      default_action: 'normalize_titles',
      proposed_actions: [
        { action: 'normalize_titles', label: 'Titel normalisieren', params: {}, safe_default: true },
        { action: 'drop_unit', label: 'Problematische Unit entfernen', params: {}, safe_default: false },
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
      ],
      data: {
        flags,
        flag_counts: countByCode(flags)
      }
    };
  }

  return {
    decision: 'accepted',
    reasons: ['Der Lernpfad hat keine blockierenden Qualitaets-Flags.'],
    default_action: null,
    proposed_actions: [],
    data: {
      flags: [],
      flag_counts: {}
    }
  };
}

export function normalizeUnitTitle(title) {
  const withoutExtension = String(title || '').replace(/\.(pdf|pptx?|docx?)$/i, '');
  const spaced = withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\blec(?:ture)?\s*0*(\d+)\b/i, 'Lecture $1')
    .replace(/\bsession\s*0*(\d+)\b/i, 'Session $1')
    .replace(/\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{4,}\b/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^\d+$/.test(spaced)) return `Lecture ${Number(spaced)}`;
  return toTitleCase(spaced || String(title || '').trim());
}

function buildCandidateVerdict(candidate, topicTerms) {
  const titleTokens = tokenize(candidate.title || '');
  const topicTokens = tokenize((candidate.signals?.topics || []).flat(Infinity).join(' '));
  const matchedTokens = uniqueTerms(candidate.thematic_fit?.matched_tokens || []);
  const matchedInTitle = matchedTokens.filter(token => titleTokens.includes(token));
  const matchedInTopics = matchedTokens.filter(token => topicTokens.includes(token));
  const topicMatches = topicTerms.filter(term => topicTokens.includes(term));
  const hasTopicConfirmation = topicMatches.length > 0;
  const titleOnly = matchedTokens.length > 0 && matchedInTitle.length > 0 && matchedInTopics.length === 0;
  const highScoreWithoutTopicConfirmation = Number(candidate.score || 0) >= HIGH_SCORE_WITHOUT_TOPIC_CONFIRMATION && !hasTopicConfirmation;

  if (hasTopicConfirmation) {
    return {
      course_id: candidate.course_id,
      verdict: 'accept',
      reasons: ['topic_path_confirmed'],
      matched_terms: topicMatches,
      title_only: false
    };
  }

  if (titleOnly || highScoreWithoutTopicConfirmation) {
    return {
      course_id: candidate.course_id,
      verdict: 'low_confidence',
      reasons: [
        titleOnly ? 'title_only_match' : null,
        highScoreWithoutTopicConfirmation ? 'high_score_without_topic_confirmation' : null
      ].filter(Boolean),
      matched_terms: matchedTokens,
      title_only: titleOnly
    };
  }

  return {
    course_id: candidate.course_id,
    verdict: 'reject',
    reasons: ['no_topic_confirmation'],
    matched_terms: matchedTokens,
    title_only: false
  };
}

function extractCandidates(input) {
  return input.candidate_courses || input.candidates || input.selection?.candidate_courses || [];
}

function isRawTitle(title) {
  const text = String(title || '').trim();
  if (!text) return true;
  const wordTokens = tokenize(text);
  if (/\.(pdf|pptx?|docx?)$/i.test(text)) return true;
  if (/[A-Z]{2,}\d/.test(text)) return true;
  if (/_/.test(text)) return true;
  if (/[a-z][A-Z]/.test(text)) return true;
  if (/^\d+$/.test(text)) return true;
  if (wordTokens.length < 3 && !/^lecture\s+\d+$/i.test(text)) return true;
  return nonLinguisticRatio(text) > 0.35;
}

function nonLinguisticRatio(text) {
  const chars = [...String(text || '')];
  if (chars.length === 0) return 1;
  const nonLinguistic = chars.filter(char => !/[a-zA-Z0-9\s:,'()&/-]/.test(char)).length;
  return nonLinguistic / chars.length;
}

function countByCode(flags) {
  const counts = {};
  for (const flag of flags) counts[flag.code] = (counts[flag.code] || 0) + 1;
  return counts;
}

function collectMappedTerms(goal, domainTerms) {
  const lowerGoal = normalizeText(goal);
  const synonyms = [];
  const translations = [];
  for (const [key, value] of TERM_MAP.entries()) {
    const keyTokens = tokenize(key);
    const tokenMatch = keyTokens.length > 0 && keyTokens.every(token => domainTerms.includes(token));
    if (lowerGoal.includes(key) || tokenMatch) {
      synonyms.push(...value.synonyms);
      translations.push(...value.translations);
    }
  }
  return { synonyms, translations };
}

function uniqueTerms(values) {
  return [...new Set(values.flatMap(value => tokenize(value)))];
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOPWORDS.has(token));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toTitleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (/^\d+$/.test(word)) return word;
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
}

const STOPWORDS = new Set(['ich', 'will', 'lernen', 'verstehen', 'bauen', 'und', 'oder', 'the', 'and', 'for', 'mit']);
