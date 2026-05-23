/**
 * Gemeinsames CLI-Argument-Parsing für die Pipeline.
 *
 * Aufruf-Konvention pro Modul: ein Modul gibt sein bekanntes Flag-Schema an,
 * der Parser klassifiziert jedes Token entweder als Flag (mit/ohne Wert) oder
 * als positionales Argument. So fällt das per-Modul-handgeschriebene
 * "skip-flag-value"-Iterieren weg.
 *
 * Beispiel:
 *   const { positional, getString, getInt, has, getList } = parseCliArgs(args, {
 *     stringFlags: ['--query', '--out'],
 *     intFlags: ['--limit', '--max'],
 *     listFlags: ['--types'],
 *     booleanFlags: ['--dry-run', '--headed']
 *   });
 */
export function parseCliArgs(args, schema = {}) {
  const stringFlags = new Set(schema.stringFlags || []);
  const intFlags = new Set(schema.intFlags || []);
  const listFlags = new Set(schema.listFlags || []);
  const valueFlags = new Set([...stringFlags, ...intFlags, ...listFlags]);
  const booleanFlags = new Set(schema.booleanFlags || []);
  const allKnown = new Set([...valueFlags, ...booleanFlags]);

  const values = new Map();
  const allValues = new Map();
  const flagsPresent = new Set();
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (typeof token !== 'string') continue;

    if (token.startsWith('--')) {
      flagsPresent.add(token);
      if (valueFlags.has(token)) {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          values.set(token, next);
          if (!allValues.has(token)) allValues.set(token, []);
          allValues.get(token).push(next);
          i++;
        }
      } else if (!allKnown.has(token) && !schema.allowUnknownFlags) {
        // Unbekannte Flags ignorieren wir defensiv (Konsumieren des Folgewerts
        // wäre riskant, da wir nicht wissen, ob es ein Wert oder Positional ist).
      }
      continue;
    }

    positional.push(token);
  }

  function getString(flag, fallback = undefined) {
    return values.has(flag) ? values.get(flag) : fallback;
  }

  function getInt(flag, fallback = undefined) {
    if (!values.has(flag)) return fallback;
    const parsed = Number.parseInt(values.get(flag), 10);
    return Number.isInteger(parsed) ? parsed : fallback;
  }

  function getPositiveInt(flag, fallback) {
    const value = getInt(flag);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  function getList(flag, fallback = null) {
    if (!values.has(flag)) return fallback;
    return values
      .get(flag)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  function getAll(flag, fallback = []) {
    return allValues.has(flag) ? [...allValues.get(flag)] : fallback;
  }

  function has(flag) {
    return flagsPresent.has(flag);
  }

  return { positional, getString, getInt, getPositiveInt, getList, getAll, has };
}
