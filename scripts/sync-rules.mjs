/**
 * Injects rules.json into lib/client.js between the rules-data markers.
 *
 * The browser bundle is loaded through DSH's module loader, which cannot read
 * a JSON file at runtime, so the rules are compiled into the bundle instead.
 * rules.json stays the single source of truth: edit it, run this, and both
 * the shipped bundle and the self-test pick up the change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const rulesPath = fileURLToPath(new URL('../rules.json', import.meta.url))
const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

const OPEN = '//<rules-data>'
const CLOSE = '//</rules-data>'

const rules = JSON.parse(readFileSync(rulesPath, 'utf8'))

// Fail loudly on a malformed file rather than shipping a broken bundle.
const assertShape = (condition, message) => {
  if (!condition) throw new Error('rules.json: ' + message)
}
assertShape(Array.isArray(rules.peakWindows) && rules.peakWindows.length > 0, 'peakWindows must be a non-empty array')
assertShape(Array.isArray(rules.midWindows), 'midWindows must be an array')
assertShape(Array.isArray(rules.holidays), 'holidays must be an array')
assertShape(Array.isArray(rules.makeupWorkdays), 'makeupWorkdays must be an array')
assertShape(rules.prices && rules.prices.flash && rules.prices.pro, 'prices must define flash and pro')
assertShape(Array.isArray(rules.coverage?.years) && rules.coverage.years.length > 0, 'coverage.years must be a non-empty array')
assertShape(Number(rules.priceMaxAgeDays) > 0, 'priceMaxAgeDays must be a positive number')

const literal = JSON.stringify(rules, null, 2)
  .split('\n')
  .map((line, index) => (index === 0 ? line : '    ' + line))
  .join('\n')

const block = OPEN + '\n    const RULES = ' + literal + '\n    ' + CLOSE

const source = readFileSync(clientPath, 'utf8')
const start = source.indexOf(OPEN)
const end = source.indexOf(CLOSE)

if (start < 0 || end < 0) {
  throw new Error('lib/client.js is missing the ' + OPEN + ' / ' + CLOSE + ' markers')
}

const next = source.slice(0, start) + block + source.slice(end + CLOSE.length)
writeFileSync(clientPath, next, 'utf8')

console.log('rules.json synced into lib/client.js (' + rules.coverage.years.join(', ') + ')')
