import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = readFileSync(clientPath, 'utf8')
const core = source.split('//<tier-core>')[1].split('//</tier-core>')[0]
assert.ok(core && core.length > 500, 'tier core block not found in lib/client.js')

const api = new Function(
  core +
  '\nreturn { partsOf, tierAt, tierFor, nextChange, nextOffPeakWindow, segmentsOfDay, statsOfSegments,' +
  ' holidayOf, weekdayOfKey, isMakeupWorkday, isCovered, yearOfKey, billingOf, costOf, budgetTokensOf,' +
  ' priceAgeDays, priceStale, RULES };'
)()

const at = (iso) => Date.parse(iso)
const beijing = (ms) => new Date(ms + 8 * 3600 * 1000).toISOString()

// ---- rules sanity ----
assert.ok(api.RULES && api.RULES.coverage, 'rules data missing from tier core')
assert.equal(api.RULES.peakWindows.length, 2, 'two official peak windows expected')
assert.ok(api.RULES.coverage.years.length > 0, 'coverage.years must be filled')
assert.ok(api.RULES.coverage.verifiedAt, 'coverage.verifiedAt must be filled')
assert.ok(api.RULES.priceMaxAgeDays > 0, 'priceMaxAgeDays must be positive')

// ---- day-of-week and key mapping ----
assert.equal(api.partsOf(at('2026-11-25T10:00:00+08:00')).weekday, 3)
assert.equal(api.partsOf(at('2026-11-25T10:00:00+08:00')).key, '2026-11-25')

// ---- weekday windows ----
assert.equal(api.tierAt(at('2026-11-25T08:00:00+08:00')), 'low')
assert.equal(api.tierAt(at('2026-11-25T09:00:00+08:00')), 'peak')
assert.equal(api.tierAt(at('2026-11-25T11:59:00+08:00')), 'peak')
assert.equal(api.tierAt(at('2026-11-25T12:00:00+08:00')), 'mid')
assert.equal(api.tierAt(at('2026-11-25T14:00:00+08:00')), 'peak')
assert.equal(api.tierAt(at('2026-11-25T18:00:00+08:00')), 'mid')
assert.equal(api.tierAt(at('2026-11-25T22:00:00+08:00')), 'low')
assert.equal(api.tierAt(at('2026-11-26T00:30:00+08:00')), 'low')

// ---- weekend, holiday, make-up workday ----
assert.equal(api.tierAt(at('2026-11-28T10:00:00+08:00')), 'low', 'Saturday must be low')
assert.equal(api.holidayOf('2027-02-08'), '春节')
assert.equal(api.tierAt(at('2027-02-08T10:00:00+08:00')), 'low', 'Spring Festival Monday must be low')
assert.equal(api.tierAt(at('2027-02-16T10:00:00+08:00')), 'peak', 'regular Tuesday after holiday must be peak')
assert.equal(api.tierAt(at('2027-02-14T10:00:00+08:00')), 'low', 'make-up Sunday stays off-peak by the weekday rule')
assert.equal(api.isMakeupWorkday('2027-10-09'), true)
assert.equal(api.holidayOf('2027-01-02'), '元旦')
assert.equal(api.tierAt(at('2027-01-02T10:00:00+08:00')), 'low', 'holiday on Saturday')
assert.equal(api.holidayOf('2027-10-02'), '国庆')
assert.equal(api.tierAt(at('2027-10-02T10:00:00+08:00')), 'low', 'National Day on Saturday')
assert.equal(api.tierAt(at('2027-02-13T10:00:00+08:00')), 'low', 'Spring Festival Saturday')
assert.equal(api.tierAt(at('2027-02-19T10:00:00+08:00')), 'peak', 'Friday after Spring Festival')

// ---- coverage gate: uncovered years must surface as unknown, not a guessed tier ----
assert.equal(api.isCovered('2027-06-01'), true)
assert.equal(api.isCovered('2028-01-01'), false, '2028 is outside the rules file')
assert.equal(api.yearOfKey('2027-12-31'), 2027)
assert.equal(api.tierAt(at('2028-03-01T10:00:00+08:00')), 'unknown', 'uncovered year must not be guessed')
assert.equal(api.billingOf('peak'), 'peak')
assert.equal(api.billingOf('mid'), 'off')
assert.equal(api.billingOf('low'), 'off')
assert.equal(api.billingOf('unknown'), 'unknown')

// ---- next change boundaries ----
const c1 = api.nextChange(at('2026-11-25T11:30:00+08:00'))
assert.equal(c1.to, 'mid')
assert.equal(c1.at, at('2026-11-25T12:00:00+08:00'))

const c2 = api.nextChange(at('2026-11-27T23:00:00+08:00'))
assert.equal(c2.to, 'peak')
assert.equal(beijing(c2.at), '2026-11-30T09:00:00.000Z')

const c3 = api.nextChange(at('2027-12-31T23:00:00+08:00'))
assert.equal(c3.to, 'unknown')

// ---- next off-peak window: duration of the contiguous off-peak block ahead ----
const w1 = api.nextOffPeakWindow(at('2026-11-25T09:30:00+08:00'))
assert.equal(beijing(w1.at), '2026-11-25T12:00:00.000Z')
assert.equal(w1.minutes, 120, 'mid band 12:00–14:00 before the next peak')
assert.equal(api.nextOffPeakWindow(at('2026-11-25T18:30:00+08:00')), null, 'already off-peak')

// ---- whole-day accounting ----
const segments = api.segmentsOfDay('2026-11-25')
const stats = api.statsOfSegments(segments)
assert.deepEqual(stats, { peak: 420, mid: 360, low: 660, unknown: 0 })
assert.equal(segments.reduce((sum, s) => sum + (s.end - s.start), 0), 1440)
for (let i = 1; i < segments.length; i++) {
  assert.equal(segments[i - 1].end, segments[i].start, 'segments must be contiguous')
}

// Uncovered day: every minute is unknown and still accounts for 1440.
const leap = api.segmentsOfDay('2028-02-29')
assert.equal(api.statsOfSegments(leap).unknown, 1440)
assert.equal(leap.reduce((sum, s) => sum + (s.end - s.start), 0), 1440)

// ---- price maths ----
const flash = api.RULES.prices.flash
const pro = api.RULES.prices.pro
assert.equal(api.costOf({ hit: 0, miss: 0, out: 0 }, flash.peak), 0, 'zero tokens cost nothing')
assert.equal(api.costOf({ hit: 1000000, miss: 0, out: 0 }, flash.peak), flash.peak[0])
assert.equal(api.costOf({ hit: 0, miss: 0, out: 1000000 }, pro.off), pro.off[2])
for (const key of Object.keys(api.RULES.prices)) {
  const row = api.RULES.prices[key]
  for (let i = 0; i < 3; i++) {
    assert.equal(row.off[i] * 2, row.peak[i], key + ' off-peak price must be exactly half of peak')
  }
}

const mix = { hit: 1e6, miss: 2e5, out: 1e5 }
const budget = api.budgetTokensOf(10, mix, flash.peak)
const unit = api.costOf(mix, flash.peak) / (mix.hit + mix.miss + mix.out)
assert.equal(budget, 10 / unit, 'budget tokens = budget / unit price')
assert.equal(api.budgetTokensOf(0, mix, flash.peak), 0)

// ---- price freshness ----
assert.equal(api.priceAgeDays('2026-11-25', at('2026-11-25T12:00:00+08:00')), 0)
assert.equal(api.priceStale(api.RULES, at('2026-12-20T12:00:00+08:00')), false)
assert.equal(api.priceStale(api.RULES, at('2027-01-01T12:00:00+08:00')), true)

console.log('dsh-token-peak tier core: all checks passed (' + api.RULES.coverage.years.join(',') + ')')
console.log('2026-11-25 segments:', segments.map((s) => `${s.tier} ${s.start}-${s.end}`).join(', '))
