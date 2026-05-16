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
  READY_FOR_NOTEBOOKLM: 'ready_for_notebooklm',
  APPROVED_FOR_NOTEBOOKLM: 'approved_for_notebooklm',
  UPLOADED_TO_NOTEBOOKLM: 'uploaded_to_notebooklm',
  NOTEBOOKLM_VALIDATED: 'notebooklm_validated',
  NEEDS_FIX: 'needs_fix',
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
 * Regeln aus der fruehen Ingestion-Planung:
 * - Minimum Gate: ableitbare Unterrichtseinheiten + mindestens 2 Quellen/Einheit
 * - Materialqualität: PDFs, Videos, Lecture Notes
 * - Einheitenstruktur: Lectures/Sessions/Module klar ableitbar
 * - Automatisierbarkeit: strukturiert + stabil
 * - NotebookLM-Tauglichkeit: Quellenmix sinnvoll
 */
export function calculateTier(dataJson, contentMap, courseWebsite = null) {
  let score = 0;
  const warnings = [];

  // 1. Minimum Gate prüfen — course website kann fehlende OCW-Signale ergänzen
  const resourceTypes = [...(dataJson.learning_resource_types || [])];
  if (courseWebsite?.slides > 0 && !resourceTypes.includes('Lecture Notes')) {
    resourceTypes.push('Lecture Notes');
  }
  if (courseWebsite?.videos > 0 && !resourceTypes.includes('Lecture Videos')) {
    resourceTypes.push('Lecture Videos');
  }

  const hasLectures = resourceTypes.includes('Lecture Notes') ||
                      resourceTypes.includes('Lecture Videos');

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

  // 4. Materialdichte (0-10 Punkte) — course website hat Vorrang vor content_map
  if (courseWebsite) {
    if (courseWebsite.sessions >= 10) score += 10;
    else if (courseWebsite.sessions >= 5) score += 5;
    else warnings.push('Wenige Sessions auf Course Website gefunden');
    if (courseWebsite.slides > 0 || courseWebsite.videos > 0) {
      console.log(`[SCREEN] Course Website: ${courseWebsite.sessions} Sessions, ${courseWebsite.slides} Slides, ${courseWebsite.videos} Videos`);
    }
  } else if (contentMap) {
    const resourceEntries = Object.values(contentMap).filter(v => v?.includes('/resources/'));
    if (resourceEntries.length >= 5) score += 10;
    else if (resourceEntries.length >= 2) score += 5;
    else warnings.push('Wenige herunterladbare Materialien gefunden');
  }

  // Tier zuordnung
  let tier, reason;
  if (score >= 35) {
    tier = TIER.TIER_1;
    reason = 'Starke Materialbasis, gute Automatisierbarkeit';
  } else if (score >= 20) {
    tier = TIER.TIER_2;
    reason = 'Braucht Normalisierung oder manuelle Prüfung';
  } else {
    tier = TIER.TIER_3;
    reason = 'Spezialmodul oder späterer Zusatz';
  }

  return { tier, score, warnings, reason };
}
