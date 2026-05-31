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
      topic_fit: ({ input }) => reviewTopicFit(input)
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

const STOPWORDS = new Set(['ich', 'will', 'lernen', 'verstehen', 'bauen', 'und', 'oder', 'the', 'and', 'for', 'mit']);
