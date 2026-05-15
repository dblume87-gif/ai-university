/**
 * MIT OCW Course Screening Schema
 * 
 * Screening-Ergebnis für library.db
 */

export const RESOURCE_TYPES = [
  'Lecture Notes',
  'Lecture Videos',
  'Problem Sets',
  'Programming Assignments',
  'Exams',
  'Solutions',
  'Readings',
  'Projects',
  'Instructor Insights',
  'Problem-solving Videos'
];

export const SCREENING_STATUS = {
  DISCOVERED: 'discovered',
  SCREENED: 'screened',
  SELECTED: 'selected',
  HOLD: 'hold',
  REJECTED: 'rejected'
};

export const TIER = {
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3
};

/**
 * Berechnet vorläufigen Tier-Score aus data.json + content_map.json
 * 
 * Regeln (aus INGESTION_PLAN_TECHNICAL.md):
 * - Minimum Gate: ableitbare Unterrichtseinheiten + mindestens 2 Quellen/Einheit
 * - Materialqualität: PDFs, Videos, Lecture Notes
 * - Einheitenstruktur: Lectures/Sessions/Module klar ableitbar
 * - Automatisierbarkeit: strukturiert + stabil
 * - NotebookLM-Tauglichkeit: Quellenmix sinnvoll
 */
export function calculateTier(dataJson, contentMap) {
  let score = 0;
  const warnings = [];

  // 1. Minimum Gate prüfen
  const resourceTypes = dataJson.learning_resource_types || [];
  const hasLectures = resourceTypes.includes('Lecture Notes') || 
                      resourceTypes.includes('Lecture Videos');
  const hasAssignments = resourceTypes.includes('Problem Sets') || 
                         resourceTypes.includes('Programming Assignments');
  
  if (!hasLectures) {
    return { tier: TIER.TIER_3, score: 0, warnings: ['Keine Lecture Materials'], reason: 'Keine Lecture Materials' };
  }

  // 2. Materialqualität (0-30 Punkte)
  if (resourceTypes.includes('Lecture Notes')) score += 10;
  if (resourceTypes.includes('Lecture Videos')) score += 10;
  if (resourceTypes.includes('Problem Sets') || resourceTypes.includes('Programming Assignments')) score += 5;
  if (resourceTypes.includes('Exams')) score += 3;
  if (resourceTypes.includes('Readings')) score += 2;

  // 3. Level (0-10 Punkte)
  if (dataJson.level?.includes('Undergraduate')) score += 5;
  if (dataJson.level?.includes('Graduate')) score += 3;

  // 4. Content Map Analyse (0-20 Punkte)
  if (contentMap) {
    const resourceCount = Object.keys(contentMap).length;
    if (resourceCount >= 20) score += 10;
    else if (resourceCount >= 10) score += 5;
    
    // PDF-URLs suchen
    const pdfKeys = Object.keys(contentMap).filter(k => 
      contentMap[k]?.toLowerCase().includes('.pdf')
    );
    if (pdfKeys.length >= 5) score += 10;
    else if (pdfKeys.length >= 2) score += 5;
    else warnings.push('Wenige PDFs gefunden');
  }

  // 5. Themen-Relevanz (0-15 Punkte)
  const topics = (dataJson.topics || []).flat();
  const relevantTopics = ['Artificial Intelligence', 'Machine Learning', 
    'Deep Learning', 'Computer Science', 'Algorithms', 'Programming Languages'];
  const topicMatches = topics.filter(t => 
    relevantTopics.some(rt => t.toLowerCase().includes(rt.toLowerCase()))
  );
  score += Math.min(topicMatches.length * 3, 15);

  // 6. Instructors (0-5 Punkte)
  if (dataJson.instructors?.length >= 1) score += 3;
  if (dataJson.instructors?.length >= 3) score += 2;

  // Tier zuordnung
  let tier, reason;
  if (score >= 50) {
    tier = TIER.TIER_1;
    reason = 'Starke Materialbasis, gute Automatisierbarkeit';
  } else if (score >= 30) {
    tier = TIER.TIER_2;
    reason = 'Braucht Normalisierung oder manuelle Prüfung';
  } else {
    tier = TIER.TIER_3;
    reason = 'Spezialmodul oder späterer Zusatz';
  }

  return { tier, score, warnings, reason };
}
