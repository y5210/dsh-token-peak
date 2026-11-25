/**
 * dsh-token-peak — browser half.
 *
 * Shows which DeepSeek pricing window DeepSeek Harness token usage falls into:
 * 高峰 (peak, full price) / 中峰 (busy daytime hint, off-peak price) /
 * 低峰 (night + weekend + holidays, off-peak price). Years outside the rules
 * file are reported as `unknown` instead of guessing a tier.
 *
 * Surfaces:
 *   - sidebar panel entry + main page  (sidebar.panellist / main)
 *   - compact chip in the session header (conversation.session.header.utilities)
 *
 * Pricing rules follow the official DeepSeek API pricing page (CNY, Beijing time):
 *   高峰: Mon–Fri 09:00–12:00 and 14:00–18:00, excluding Chinese public holidays
 *   闲时: everything else (weekends, holidays, nights); priced at half of peak
 */
window.__ModuleLoader__.load({
  id: 'dsh-token-peak',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const PLUGIN_ID = 'dsh-token-peak'
    const STYLE_ID = 'dsh-token-peak-styles'

    /** Pricing tier presentation. `weak` marks a hint tier that shares billing with off-peak. */
    const TIER_META = {
      peak: {
        key: 'peak',
        letter: 'P',
        label: '高峰',
        rate: '×1.0 全价',
        short: '全价',
        color: '#e0524b',
        soft: 'rgba(224, 82, 75, 0.14)',
        hint: '当前按高峰价计费，是闲时价格的 2 倍',
      },
      mid: {
        key: 'mid',
        letter: 'M',
        label: '中峰',
        rate: '×0.5 闲时',
        short: '5 折',
        weak: true,
        color: '#c98a25',
        soft: 'rgba(201, 138, 37, 0.12)',
        hint: '工作日的午间与傍晚，只是活跃度提示；官方只分高峰 / 闲时，本档仍按闲时价（5 折）计费',
      },
      low: {
        key: 'low',
        letter: 'O',
        label: '低峰',
        rate: '×0.5 闲时',
        short: '5 折',
        color: '#2e9e63',
        soft: 'rgba(46, 158, 99, 0.14)',
        hint: '夜间、周末或法定节假日，按闲时价（5 折）计费',
      },
      unknown: {
        key: 'unknown',
        letter: '?',
        label: '规则未覆盖',
        rate: '—',
        short: '未知',
        color: '#8a8f98',
        soft: 'rgba(138, 143, 152, 0.16)',
        hint: '该年份的法定节假日表尚未录入，档位仅按工作日粗略估算，请先更新 rules.json',
      },
    }

    /** Minutes before a tier switch where the panel starts warning. */
    const ALERT_LEAD_MIN = 10
    const ALERT_STORAGE_KEY = 'dsh-token-peak:alert'

    //<tier-core>
    //<rules-data>
    const RULES = {
      "coverage": {
        "years": [
          2026,
          2027
        ],
        "holidayYears": [
          2027
        ],
        "verifiedAt": "2026-11-25",
        "note": "节假日表按《国务院办公厅关于 2027 年部分节假日安排的通知》（国办发明电〔2026〕10号）录入；2026 年节假日已过，未重复录入。2028 年起需补充本级数据。",
        "sourceUrl": "https://api-docs.deepseek.com/zh-cn/quick_start/pricing"
      },
      "priceMaxAgeDays": 30,
      "timezoneOffsetMin": 480,
      "peakWindows": [
        [
          540,
          720
        ],
        [
          840,
          1080
        ]
      ],
      "midWindows": [
        [
          720,
          840
        ],
        [
          1080,
          1320
        ]
      ],
      "holidays": [
        {
          "from": "2027-01-01",
          "to": "2027-01-03",
          "name": "元旦"
        },
        {
          "from": "2027-02-05",
          "to": "2027-02-13",
          "name": "春节"
        },
        {
          "from": "2027-04-03",
          "to": "2027-04-05",
          "name": "清明"
        },
        {
          "from": "2027-05-01",
          "to": "2027-05-05",
          "name": "劳动节"
        },
        {
          "from": "2027-06-09",
          "to": "2027-06-09",
          "name": "端午"
        },
        {
          "from": "2027-09-15",
          "to": "2027-09-15",
          "name": "中秋"
        },
        {
          "from": "2027-10-01",
          "to": "2027-10-07",
          "name": "国庆"
        }
      ],
      "makeupWorkdays": [
        "2027-01-31",
        "2027-02-14",
        "2027-05-08",
        "2027-09-26",
        "2027-10-09"
      ],
      "prices": {
        "flash": {
          "id": "flash",
          "label": "deepseek-flash",
          "peak": [
            0.04,
            2,
            8
          ],
          "off": [
            0.02,
            1,
            4
          ]
        },
        "pro": {
          "id": "pro",
          "label": "deepseek-v4-pro",
          "peak": [
            0.3,
            9,
            27
          ],
          "off": [
            0.15,
            4.5,
            13.5
          ]
        }
      }
    }
    //</rules-data>

    /** Beijing is UTC+8 all year; tier logic never depends on the host timezone. */
    const BEIJING_OFFSET_MIN = RULES.timezoneOffsetMin

    /** Official peak windows, minutes from midnight (Beijing time). */
    const PEAK_WINDOWS = RULES.peakWindows

    /** Daytime "busy" band inside the off-peak price (plugin hint, not billing). */
    const MID_WINDOWS = RULES.midWindows

    /** Chinese statutory holidays; ranges are inclusive, dates are Beijing-time keys. */
    const HOLIDAY_RANGES = RULES.holidays.map(function (item) {
      return [item.from, item.to, item.name]
    })

    /** 调休上班日: weekends turned into workdays. Billing still follows the weekday rule. */
    const MAKEUP_WORKDAYS = RULES.makeupWorkdays

    function pad2(n) {
      return n < 10 ? '0' + n : '' + n
    }

    function dayKeyOf(dateObj) {
      return dateObj.getUTCFullYear() + '-' + pad2(dateObj.getUTCMonth() + 1) + '-' + pad2(dateObj.getUTCDate())
    }

    /** Split an epoch millisecond into Beijing-time calendar fields. */
    function partsOf(ms) {
      const shifted = new Date(ms + BEIJING_OFFSET_MIN * 60000)
      return {
        key: dayKeyOf(shifted),
        weekday: shifted.getUTCDay(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
        minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
      }
    }

    function weekdayOfKey(key) {
      const d = new Date(key + 'T00:00:00Z')
      return d.getUTCDay()
    }

    function addDaysKey(key, days) {
      const d = new Date(key + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + days)
      return dayKeyOf(d)
    }

    function holidayOf(key) {
      for (let i = 0; i < HOLIDAY_RANGES.length; i++) {
        const range = HOLIDAY_RANGES[i]
        if (key >= range[0] && key <= range[1]) return range[2]
      }
      return ''
    }

    function isMakeupWorkday(key) {
      return MAKEUP_WORKDAYS.indexOf(key) >= 0
    }

    function yearOfKey(key) {
      return Number(key.slice(0, 4))
    }

    /**
     * Whether rules.json carries that calendar year's holiday list. Uncovered
     * years surface as `unknown`; the UI must NOT claim a concrete peak/off tier.
     */
    function isCovered(key) {
      return RULES.coverage.years.indexOf(yearOfKey(key)) >= 0
    }

    /** Billing side: only peak is full price; mid/low are off-peak; unknown stays unknown. */
    function billingOf(tier) {
      if (tier === 'peak') return 'peak'
      if (tier === 'unknown') return 'unknown'
      return 'off'
    }

    /** Cost of a token mix (tokens) at the given price row (CNY per 1M tokens). */
    function costOf(tokens, prices) {
      return (tokens.hit * prices[0] + tokens.miss * prices[1] + tokens.out * prices[2]) / 1e6
    }

    /** Tokens a CNY budget buys at the unit price implied by the current mix. */
    function budgetTokensOf(budgetCny, tokens, prices) {
      const total = tokens.hit + tokens.miss + tokens.out
      if (total <= 0) return 0
      const unit = costOf(tokens, prices) / total
      if (!(unit > 0)) return 0
      return budgetCny / unit
    }

    function inWindows(minuteOfDay, windows) {
      for (let i = 0; i < windows.length; i++) {
        if (minuteOfDay >= windows[i][0] && minuteOfDay < windows[i][1]) return true
      }
      return false
    }

    /**
     * Price tier for a Beijing-time day key + minute of day.
     * Billing tier is peak / off-peak only; `mid` is an off-peak sub-band used
     * by this plugin to describe busy weekday daytime. `unknown` means the rules
     * file does not cover that year and we must not guess.
     */
    function tierFor(key, weekday, minuteOfDay) {
      if (!isCovered(key)) return 'unknown'
      if (holidayOf(key)) return 'low'
      if (weekday === 0 || weekday === 6) return 'low'
      if (inWindows(minuteOfDay, PEAK_WINDOWS)) return 'peak'
      if (inWindows(minuteOfDay, MID_WINDOWS)) return 'mid'
      return 'low'
    }

    function tierAt(ms) {
      const p = partsOf(ms)
      return tierFor(p.key, p.weekday, p.minuteOfDay)
    }

    /** Contiguous tier segments of one Beijing-time day (minutes 0..1440). */
    function segmentsOfDay(key) {
      const weekday = weekdayOfKey(key)
      const out = []
      let current = null
      let start = 0
      for (let m = 0; m < 1440; m++) {
        const t = tierFor(key, weekday, m)
        if (current === null) {
          current = t
          start = m
        } else if (t !== current) {
          out.push({ tier: current, start: start, end: m })
          current = t
          start = m
        }
      }
      out.push({ tier: current, start: start, end: 1440 })
      return out
    }

    function statsOfSegments(segments) {
      const stats = { peak: 0, mid: 0, low: 0, unknown: 0 }
      for (let i = 0; i < segments.length; i++) {
        stats[segments[i].tier] += segments[i].end - segments[i].start
      }
      return stats
    }

    /** First minute in the next 7 days whose tier differs from now. */
    function nextChange(ms) {
      const current = tierAt(ms)
      let t = (Math.floor(ms / 60000) + 1) * 60000
      for (let i = 0; i < 7 * 1440; i++) {
        const q = partsOf(t)
        const nextTier = tierFor(q.key, q.weekday, q.minuteOfDay)
        if (nextTier !== current) {
          return { from: current, to: nextTier, at: t, remaining: t - ms }
        }
        t += 60000
      }
      return null
    }

    /**
     * Next contiguous off-peak (mid or low) block after a peak moment.
     * Returns how long that block lasts — the useful number for queueing batch jobs.
     */
    function nextOffPeakWindow(ms) {
      if (billingOf(tierAt(ms)) !== 'peak') return null
      let t = (Math.floor(ms / 60000) + 1) * 60000
      for (let i = 0; i < 7 * 1440; i++) {
        if (billingOf(tierAt(t)) === 'off') {
          const start = t
          let end = t
          let j = i
          while (j < 7 * 1440 && billingOf(tierAt(end)) === 'off') {
            end += 60000
            j += 1
          }
          return { at: start, minutes: Math.round((end - start) / 60000), to: tierAt(start) }
        }
        t += 60000
      }
      return null
    }

    /** Age in days since the price/holiday table was verified. */
    function priceAgeDays(verifiedAt, nowMs) {
      const day = new Date(verifiedAt + 'T00:00:00Z').getTime()
      if (!Number.isFinite(day)) return Infinity
      return Math.floor((nowMs - day) / 86400000)
    }

    /** Prices older than the configured max age should be labelled "待复核". */
    function priceStale(rules, nowMs) {
      const max = Number(rules.priceMaxAgeDays) || 30
      return priceAgeDays(rules.coverage.verifiedAt, nowMs) > max
    }
    //</tier-core>

    /** Unit prices, defined in rules.json. */
    const PRICE_TABLE = RULES.prices

    const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    function fmtClock(ms) {
      const p = partsOf(ms)
      return pad2(p.hour) + ':' + pad2(p.minute)
    }

    /** Minutes from midnight -> "HH:MM" (no timezone shifting). */
    function minToClock(minutes) {
      return pad2(Math.floor(minutes / 60)) + ':' + pad2(minutes % 60)
    }

    function fmtClockFull(ms) {
      const p = partsOf(ms)
      return pad2(p.hour) + ':' + pad2(p.minute) + ':' + pad2(p.second)
    }

    function fmtDate(key) {
      return key.slice(5)
    }

    function fmtDuration(ms) {
      let seconds = Math.max(0, Math.round(ms / 1000))
      const days = Math.floor(seconds / 86400)
      seconds -= days * 86400
      const hours = Math.floor(seconds / 3600)
      seconds -= hours * 3600
      const minutes = Math.floor(seconds / 60)
      const secs = seconds % 60
      if (days > 0) return days + ' 天 ' + pad2(hours) + ':' + pad2(minutes)
      return hours + ':' + pad2(minutes) + ':' + pad2(secs)
    }

    function fmtMinutes(minutes) {
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      if (!hours) return rest + 'm'
      return hours + 'h' + (rest ? ' ' + rest + 'm' : '')
    }

    function fmtMoney(value) {
      if (!isFinite(value)) return '—'
      if (value === 0) return '¥0'
      if (value >= 100) return '¥' + value.toFixed(0)
      if (value >= 10) return '¥' + value.toFixed(1)
      return '¥' + value.toFixed(2)
    }

    function fmtTokenCount(value) {
      if (value >= 1e8) return (value / 1e8).toFixed(1) + ' 亿'
      if (value >= 1e4) return (value / 1e4).toFixed(value >= 1e6 ? 0 : 1) + ' 万'
      return String(Math.round(value))
    }

    function tierStyle(meta) {
      return { '--dtp-accent': meta.color, '--dtp-soft': meta.soft }
    }

    /** Re-render on a fixed cadence; pause the timer while the tab is hidden. */
    function useNow(interval) {
      const [now, setNow] = React.useState(function () { return Date.now() })
      React.useEffect(function () {
        let timer = null
        const tick = function () { setNow(Date.now()) }
        const start = function () { if (timer === null) timer = setInterval(tick, interval) }
        const stop = function () { if (timer !== null) { clearInterval(timer); timer = null } }
        start()
        if (typeof document !== 'undefined' && document.addEventListener) {
          const onVis = function () {
            if (document.hidden) { stop() } else { tick(); start() }
          }
          document.addEventListener('visibilitychange', onVis)
          return function () {
            stop()
            document.removeEventListener('visibilitychange', onVis)
          }
        }
        return stop
      }, [interval])
      return now
    }

    /** nextChange scans minute-by-minute; cache per wall-clock minute instead of per render. */
    const changeCache = { minute: -1, value: null }
    function nextChangeCached(ms) {
      const minute = Math.floor(ms / 60000)
      if (changeCache.minute !== minute) {
        changeCache.minute = minute
        changeCache.value = nextChange(ms)
      }
      return changeCache.value
    }

    /** Render boundary: a broken panel must not take the whole sidebar down. */
    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() { return { failed: true } }
      componentDidCatch(error) {
        try { console.warn('[dsh-token-peak] render failed:', error) } catch (e) { /* noop */ }
      }
      render() {
        if (this.state.failed) {
          return this.props.fallback || h('div', { className: 'dtp-boundary', role: 'alert' }, '峰谷时段组件暂时不可用，不影响其他插件。')
        }
        return this.props.children
      }
    }

    function copyText(text) {
      try {
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).catch(function () { /* clipboard best effort */ })
        }
      } catch (error) { /* noop */ }
    }

    function Strip(props) {
      const segments = props.segments
      return h(
        'div',
        { className: 'dtp-strip', role: 'img', 'aria-label': props.ariaLabel || '时段分布' },
        segments.map(function (segment, index) {
          return h('div', {
            key: index,
            className: 'dtp-seg',
            'data-tier': segment.tier,
            style: { flexGrow: segment.end - segment.start, flexBasis: 0 },
            title: TIER_META[segment.tier].label + ' ' + minToClock(segment.start) + '–' + (segment.end === 1440 ? '24:00' : minToClock(segment.end)),
          })
        }),
        props.markerPercent != null
          ? h('div', { className: 'dtp-marker', style: { left: props.markerPercent + '%' } })
          : null
      )
    }

    function LegendItem(props) {
      const meta = TIER_META[props.tier]
      return h(
        'span',
        { className: 'dtp-legend-item' },
        h('span', { className: 'dtp-letter', 'aria-hidden': 'true' }, meta.letter),
        h('span', { className: 'dtp-dot', style: { background: meta.color, boxShadow: 'none' } }),
        h('span', { className: 'dtp-legend-label' }, meta.label),
        props.duration ? h('span', { className: 'dtp-legend-duration' }, props.duration) : null
      )
    }

    function DayRow(props) {
      const holiday = holidayOf(props.dayKey)
      const makeup = isMakeupWorkday(props.dayKey)
      const stats = statsOfSegments(props.segments)
      const uncovered = stats.unknown > 0
      return h(
        'div',
        { className: props.isToday ? 'dtp-dayrow dtp-dayrow-today-row' : 'dtp-dayrow' },
        h(
          'div',
          { className: 'dtp-dayrow-name' },
          h('span', { className: props.isToday ? 'dtp-dayrow-today' : 'dtp-dayrow-weekday' }, props.label),
          h('span', { className: 'dtp-dayrow-date' }, fmtDate(props.dayKey)),
          holiday ? h('span', { className: 'dtp-dayrow-tag' }, holiday) : null,
          makeup ? h('span', { className: 'dtp-dayrow-tag' }, '调休上班') : null,
          uncovered ? h('span', { className: 'dtp-dayrow-tag dtp-dayrow-tag-warn' }, '年份未覆盖') : null
        ),
        h(Strip, {
          segments: props.segments,
          markerPercent: props.isToday ? props.markerPercent : null,
          ariaLabel: props.dayKey + ' 时段分布',
        }),
        h('div', { className: 'dtp-dayrow-stat' }, uncovered ? '规则未覆盖' : (stats.peak ? '高峰 ' + fmtMinutes(stats.peak) : '全天闲时'))
      )
    }

    function PriceTable() {
      const table = PRICE_TABLE.flash
      const rows = [
        ['输入 · 缓存命中', table.peak[0], table.off[0]],
        ['输入 · 缓存未命中', table.peak[1], table.off[1]],
        ['输出', table.peak[2], table.off[2]],
      ]
      return h(
        'table',
        { className: 'dtp-price' },
        h('thead', null,
          h('tr', null,
            h('th', null, table.label + '（元 / 百万 tokens）'),
            h('th', null, '高峰'),
            h('th', null, '闲时')
          )
        ),
        h('tbody', null,
          rows.map(function (row) {
            return h('tr', { key: row[0] },
              h('td', null, row[0]),
              h('td', null, String(row[1])),
              h('td', null, String(row[2]))
            )
          })
        )
      )
    }

    function WeekSummary(props) {
      const minutes = props.minutes
      const total = minutes.peak + minutes.mid + minutes.low
      const peakShare = total ? minutes.peak / total : 0
      const saveShare = peakShare * 0.5
      return h(
        'section',
        { className: 'dtp-card' },
        h('div', { className: 'dtp-card-head' },
          h('div', { className: 'dtp-card-title' }, '本周小结 · 接下来 7 天'),
          h('div', { className: 'dtp-card-meta' }, '共 ' + Math.round(total / 60) + ' 小时')
        ),
        h('div', { className: 'dtp-stat-grid' },
          h('div', { className: 'dtp-stat' },
            h('div', { className: 'dtp-stat-label' }, h('span', { className: 'dtp-dot', style: { background: TIER_META.peak.color, boxShadow: 'none' } }), '高峰'),
            h('div', { className: 'dtp-stat-value' }, fmtMinutes(minutes.peak)),
            h('div', { className: 'dtp-stat-note' }, '全价')
          ),
          h('div', { className: 'dtp-stat' },
            h('div', { className: 'dtp-stat-label' }, h('span', { className: 'dtp-dot', style: { background: TIER_META.mid.color, boxShadow: 'none' } }), '中峰'),
            h('div', { className: 'dtp-stat-value' }, fmtMinutes(minutes.mid)),
            h('div', { className: 'dtp-stat-note' }, '5 折 · 提示档')
          ),
          h('div', { className: 'dtp-stat' },
            h('div', { className: 'dtp-stat-label' }, h('span', { className: 'dtp-dot', style: { background: TIER_META.low.color, boxShadow: 'none' } }), '低峰'),
            h('div', { className: 'dtp-stat-value' }, fmtMinutes(minutes.low)),
            h('div', { className: 'dtp-stat-note' }, '5 折')
          ),
          h('div', { className: 'dtp-stat dtp-stat-accent' },
            h('div', { className: 'dtp-stat-label' }, '高峰占比'),
            h('div', { className: 'dtp-stat-value' }, (peakShare * 100).toFixed(0) + '%'),
            h('div', { className: 'dtp-stat-note' }, '按小时算')
          )
        ),
        h('div', { className: 'dtp-stat-tip' },
          peakShare > 0
            ? '高峰时段占 ' + (peakShare * 100).toFixed(0) + '%：如果这 ' + fmtMinutes(minutes.peak) + ' 的用量改在闲时跑，同量可省约 ' + (saveShare * 100).toFixed(0) + '% 的费用（按用量各时段均匀分布估算）。'
            : '本周没有高峰时段，怎么跑都是 5 折。'
        )
      )
    }

    function CostCalculator() {
      const [model, setModel] = React.useState('flash')
      const [hit, setHit] = React.useState('1000000')
      const [miss, setMiss] = React.useState('200000')
      const [out, setOut] = React.useState('100000')
      const now = useNow(5000)
      const tier = tierAt(now)
      const table = PRICE_TABLE[model]
      const tokens = {
        hit: Math.max(0, Number(hit) || 0),
        miss: Math.max(0, Number(miss) || 0),
        out: Math.max(0, Number(out) || 0),
      }
      const peakCost = costOf(tokens, table.peak)
      const offCost = costOf(tokens, table.off)
      const billing = billingOf(tier)
      const currentCost = billing === 'peak' ? peakCost : offCost
      const totalTokens = tokens.hit + tokens.miss + tokens.out
      const change = nextChangeCached(now)
      const [budget, setBudget] = React.useState('10')
      const budgetValue = Math.max(0, Number(budget) || 0)
      const price = billing === 'peak' ? table.peak : table.off
      const budgetTokens = budgetTokensOf(budgetValue, tokens, price)
      const moneyOf = function (mix) { return fmtMoney(costOf(mix, price)) }

      const field = function (label, value, onChange) {
        return h('label', { className: 'dtp-field' },
          h('span', { className: 'dtp-field-label' }, label),
          h('input', {
            className: 'dtp-input',
            type: 'text',
            inputMode: 'numeric',
            value: value,
            'aria-label': label,
            onChange: function (event) { onChange(event.target.value) },
          })
        )
      }

      return h(
        'section',
        { className: 'dtp-card' },
        h('div', { className: 'dtp-card-head' },
          h('div', { className: 'dtp-card-title' }, '花费换算'),
          h('div', { className: 'dtp-model-switch' },
            Object.keys(PRICE_TABLE).map(function (key) {
              return h('button', {
                key: key,
                type: 'button',
                className: key === model ? 'dtp-model-btn dtp-model-btn-on' : 'dtp-model-btn',
                onClick: function () { setModel(key) },
              }, PRICE_TABLE[key].label)
            })
          )
        ),

        h('div', { className: 'dtp-live dtp-live-off' }, '未检测到可读的实时用量，下面按手填比例估算。'),

        h('div', { className: 'dtp-fields' },
          field('缓存命中 tokens', hit, setHit),
          field('缓存未命中 tokens', miss, setMiss),
          field('输出 tokens', out, setOut)
        ),
        h('div', { className: 'dtp-cost' },
          h('div', { className: 'dtp-cost-row' },
            h('span', { className: 'dtp-cost-key' }, '高峰价'),
            h('span', { className: 'dtp-cost-val' }, fmtMoney(peakCost))
          ),
          h('div', { className: 'dtp-cost-row' },
            h('span', { className: 'dtp-cost-key' }, '闲时价（5 折）'),
            h('span', { className: 'dtp-cost-val' }, fmtMoney(offCost))
          ),
          h('div', { className: 'dtp-cost-row dtp-cost-row-now' },
            h('span', { className: 'dtp-cost-key' }, '现在发送'),
            h('span', { className: 'dtp-cost-val' }, fmtMoney(currentCost)),
            h('span', { className: 'dtp-cost-tag', style: tierStyle(TIER_META[tier]) }, TIER_META[tier].label + ' · ' + TIER_META[tier].short)
          )
        ),
        h('div', { className: 'dtp-cost-tip' },
          totalTokens > 0
            ? (billing === 'peak'
                ? '现在是高峰价：同一批 tokens 挪到闲时，能省 ' + fmtMoney(peakCost - offCost) + '（约 50%）' + (change ? '，距闲时还有 ' + fmtDuration(change.remaining) : '')
                : '现在已是闲时价，跑就对了；同样一批 tokens 在高峰要多花 ' + fmtMoney(peakCost - offCost) + '。')
            : '填入 token 数量即可换算。'
        ),

        h('div', { className: 'dtp-budget' },
          h('span', { className: 'dtp-budget-label' }, '给多少预算'),
          h('span', { className: 'dtp-budget-currency' }, '¥'),
          h('input', {
            className: 'dtp-input dtp-budget-input',
            type: 'text',
            inputMode: 'decimal',
            'aria-label': '预算金额（元）',
            value: budget,
            onChange: function (event) { setBudget(event.target.value) },
          }),
          h('span', { className: 'dtp-budget-arrow' }, '→'),
          h('span', { className: 'dtp-budget-value' },
            budgetTokens > 0 ? '约 ' + fmtTokenCount(budgetTokens) + ' tokens' : '—'
          ),
          h('span', { className: 'dtp-budget-note' }, '按上面比例 · ' + (billing === 'peak' ? '高峰价' : '闲时价'))
        ),

        h('div', { className: 'dtp-ref' },
          h('div', { className: 'dtp-ref-title' }, '100 万 token 大概能做多少事'),
          h('ul', { className: 'dtp-ref-list' },
            h('li', null, '约 50–70 万汉字的阅读或写作（1 个汉字大致 1–1.5 token）'),
            h('li', null, '约 1000–1500 页 A4 文字（按每页 800 字估）'),
            h('li', null, '约 250–300 轮中等对话（每轮输入 + 输出合计 3–4k token）')
          ),
          h('div', { className: 'dtp-ref-note' },
            '同样 100 万 token，按' + TIER_META[tier].label + '价：全命中缓存 ' + moneyOf({ hit: 1e6, miss: 0, out: 0 }) +
            ' / 全未命中 ' + moneyOf({ hit: 0, miss: 1e6, out: 0 }) +
            ' / 全输出 ' + moneyOf({ hit: 0, miss: 0, out: 1e6 }) +
            '。上面三行是经验估算，不是官方口径。'
          )
        )
      )
    }

    function AgentHint({ now, tier, change }) {
      const meta = TIER_META[tier]
      const billing = billingOf(tier)
      const line = '当前 DeepSeek 计价时段：' + meta.label +
        (billing === 'peak' ? '（高峰全价）' : billing === 'off' ? '（闲时 5 折）' : '（规则未覆盖）') +
        (change ? '；' + fmtDuration(change.remaining) + '后切换' : '') +
        '。非紧急的批量任务、归档和整理建议安排到闲时窗口。'
      return h(
        'section',
        { className: 'dtp-card' },
        h('div', { className: 'dtp-card-head' },
          h('div', { className: 'dtp-card-title' }, '给 Agent 的一句话'),
          h('button', {
            type: 'button',
            className: 'dtp-copy-btn',
            onClick: function () { copyText(line) },
            'aria-label': '复制时段提示',
          }, '复制')
        ),
        h('div', { className: 'dtp-hint-line' }, line)
      )
    }

    function PeakPanel() {
      const now = useNow(1000)
      const parts = partsOf(now)
      const tier = tierFor(parts.key, parts.weekday, parts.minuteOfDay)
      const meta = TIER_META[tier]
      const billing = billingOf(tier)
      const change = nextChangeCached(now)
      const offWindow = nextOffPeakWindow(now)
      const segments = React.useMemo(function () { return segmentsOfDay(parts.key) }, [parts.key])
      const stats = React.useMemo(function () { return statsOfSegments(segments) }, [segments])
      const upcoming = React.useMemo(function () {
        const list = []
        for (let i = 0; i < 7; i++) {
          const key = addDaysKey(parts.key, i)
          list.push({ key: key, segments: segmentsOfDay(key), isToday: i === 0 })
        }
        return list
      }, [parts.key])

      const weekStats = React.useMemo(function () {
        const total = { peak: 0, mid: 0, low: 0, unknown: 0 }
        for (let i = 0; i < upcoming.length; i++) {
          const dayStats = statsOfSegments(upcoming[i].segments)
          total.peak += dayStats.peak
          total.mid += dayStats.mid
          total.low += dayStats.low
          total.unknown += dayStats.unknown
        }
        return total
      }, [upcoming])

      const uncoveredYears = React.useMemo(function () {
        const years = []
        const probe = function (key) {
          const year = yearOfKey(key)
          if (!isCovered(key) && years.indexOf(year) < 0) years.push(year)
        }
        probe(parts.key)
        for (let i = 0; i < upcoming.length; i++) probe(upcoming[i].key)
        return years
      }, [parts.key, upcoming])

      const stale = priceStale(RULES, now)

      const [alertOn, setAlertOn] = React.useState(function () {
        try {
          return window.localStorage.getItem(ALERT_STORAGE_KEY) !== '0'
        } catch (error) {
          return true
        }
      })
      const notifiedRef = React.useRef(0)

      React.useEffect(function () {
        try {
          window.localStorage.setItem(ALERT_STORAGE_KEY, alertOn ? '1' : '0')
        } catch (error) {
          // Storage unavailable: the toggle still works for this session.
        }
      }, [alertOn])

      const alerting = !!(change && change.remaining <= ALERT_LEAD_MIN * 60000)

      React.useEffect(function () {
        if (!alertOn || !alerting || !change) return
        if (notifiedRef.current === change.at) return
        notifiedRef.current = change.at
        if (typeof Notification === 'undefined') return
        try {
          new Notification('DeepSeek 峰谷时段', {
            body: '还有 ' + Math.max(1, Math.round(change.remaining / 60000)) + ' 分钟切换到「' +
              TIER_META[change.to].label + '」（' + TIER_META[change.to].rate + '）',
          })
        } catch (error) {
          // Notification is best effort; the in-page banner already warns.
        }
      }, [alertOn, alerting, change && change.at])

      const markerPercent = ((parts.hour * 60 + parts.minute + parts.second / 60) / 1440) * 100
      const holiday = holidayOf(parts.key)
      const tickLabels = [0, 6, 9, 12, 14, 18, 22, 24]

      return h(
        'div',
        { className: 'dtp-page' },
        h(
          'div',
          { className: 'dtp-wrap' },
          h(
            'header',
            { className: 'dtp-head' },
            h('div', null,
              h('h1', { className: 'dtp-title' }, 'DeepSeek 峰谷时段'),
              h('div', { className: 'dtp-sub' }, '按北京时间判断当前 Token 计价档位：高峰 / 中峰 / 低峰')
            ),
            h('div', { className: 'dtp-head-right' },
              h('div', { className: 'dtp-clock' },
                '北京时间 ' + parts.key + ' ' + WEEKDAY_NAMES[parts.weekday] + ' ' + fmtClockFull(now)
              ),
              h('button', {
                type: 'button',
                className: alertOn ? 'dtp-toggle dtp-toggle-on' : 'dtp-toggle',
                title: '换档前 10 分钟在页面与系统通知里提醒',
                onClick: function () { setAlertOn(!alertOn) },
              },
                h('span', { className: 'dtp-toggle-dot' }),
                '换档提醒 ' + (alertOn ? '开' : '关')
              )
            )
          ),

          h(
            'section',
            { className: alerting ? 'dtp-hero dtp-hero-alert' : 'dtp-hero', style: tierStyle(meta) },
            h('div', { className: 'dtp-hero-main' },
              h('div', { className: 'dtp-hero-tier' },
                h('span', { className: 'dtp-dot' }),
                h('span', { className: 'dtp-tier' }, meta.label),
                h('span', { className: 'dtp-rate' }, meta.rate),
                alerting ? h('span', { className: 'dtp-alert-badge' }, '换档提醒') : null
              ),
              h('div', { className: 'dtp-hero-hint' }, meta.hint),
              h('div', { className: 'dtp-hero-now' },
                '现在发送请求 → ',
                h('strong', null, billing === 'peak' ? '高峰价' : billing === 'off' ? '闲时价（5 折）' : '无法确定档位')
              )
            ),
            h('div', { className: 'dtp-hero-side' },
              change
                ? h('div', { className: 'dtp-next-label' }, '距「' + TIER_META[change.to].label + '」还有')
                : null,
              change ? h('div', { className: 'dtp-next-time' }, fmtDuration(change.remaining)) : null,
              change ? h('div', { className: 'dtp-next-at' }, '将于 ' + fmtClock(change.at) + ' 切换为 ' + TIER_META[change.to].rate) : null,
              offWindow
                ? h('div', { className: 'dtp-next-offpeak' }, '下一段闲时连享 ' + fmtMinutes(offWindow.minutes))
                : null
            )
          ),

          uncoveredYears.length
            ? h('div', { className: 'dtp-warn', role: 'alert' },
                '⚠ 节假日表只覆盖 ' + RULES.coverage.years.join(' / ') + ' 年，' +
                uncoveredYears.join('、') + ' 年没有录入节假日数据：当前档位标记为「规则未覆盖」，请勿据此安排计费敏感任务。' +
                '请更新 rules.json 后执行 node scripts/sync-rules.mjs。'
              )
            : null,

          stale
            ? h('div', { className: 'dtp-warn dtp-warn-amber', role: 'alert' },
                '⚠ 价格表已超过 ' + (RULES.priceMaxAgeDays || 30) + ' 天未复核，金额仅供参考，以官方账单为准。'
              )
            : null,

          h(
            'section',
            { className: 'dtp-card' },
            h('div', { className: 'dtp-card-head' },
              h('div', { className: 'dtp-card-title' }, '今天 · ' + parts.key + ' ' + WEEKDAY_NAMES[parts.weekday] + (holiday ? ' · ' + holiday : '')),
              h('div', { className: 'dtp-card-meta' }, '高峰 ' + fmtMinutes(stats.peak) + ' / 中峰 ' + fmtMinutes(stats.mid) + ' / 低峰 ' + fmtMinutes(stats.low))
            ),
            h(Strip, { segments: segments, markerPercent: markerPercent, ariaLabel: '今天的时段分布' }),
            h('div', { className: 'dtp-ticks' },
              tickLabels.map(function (value) {
                return h('span', { key: value, className: 'dtp-tick', style: { left: (value / 24) * 100 + '%' } }, pad2(value) + ':00')
              })
            ),
            h('div', { className: 'dtp-legend' },
              h(LegendItem, { tier: 'peak', duration: fmtMinutes(stats.peak) }),
              h(LegendItem, { tier: 'mid', duration: fmtMinutes(stats.mid) }),
              h(LegendItem, { tier: 'low', duration: fmtMinutes(stats.low) })
            )
          ),

          h(
            'section',
            { className: 'dtp-card' },
            h('div', { className: 'dtp-card-head' },
              h('div', { className: 'dtp-card-title' }, '未来 7 天'),
              h('div', { className: 'dtp-card-meta' }, '周末与法定节假日全天闲时')
            ),
            upcoming.map(function (day, index) {
              return h(DayRow, {
                key: day.key,
                dayKey: day.key,
                isToday: day.isToday,
                markerPercent: markerPercent,
                label: index === 0 ? '今天' : index === 1 ? '明天' : WEEKDAY_NAMES[weekdayOfKey(day.key)],
                segments: day.segments,
              })
            })
          ),

          h(WeekSummary, { minutes: weekStats }),

          h(CostCalculator, null),

          h(AgentHint, { now: now, tier: tier, change: change }),

          h(
            'section',
            { className: 'dtp-card' },
            h('div', { className: 'dtp-card-head' },
              h('div', { className: 'dtp-card-title' }, '计费规则'),
              h('div', { className: 'dtp-card-meta' }, '官方峰谷定价')
            ),
            h('div', { className: 'dtp-rule' },
              h('span', { className: 'dtp-rule-tag', style: tierStyle(TIER_META.peak) }, '高峰'),
              h('span', { className: 'dtp-rule-text' }, '工作日 09:00–12:00、14:00–18:00（北京时间，法定节假日除外），全价计费。')
            ),
            h('div', { className: 'dtp-rule dtp-rule-weak' },
              h('span', { className: 'dtp-rule-tag dtp-rule-tag-weak', style: tierStyle(TIER_META.mid) }, '中峰'),
              h('span', { className: 'dtp-rule-text' }, '工作日 12:00–14:00、18:00–22:00。这是本插件补充的活跃度提示档，不是官方计费档位，计费与低峰相同（5 折）。')
            ),
            h('div', { className: 'dtp-rule' },
              h('span', { className: 'dtp-rule-tag', style: tierStyle(TIER_META.low) }, '低峰'),
              h('span', { className: 'dtp-rule-text' }, '22:00–次日 09:00，以及周末、法定节假日全天，按闲时价计费（高峰价的一半）。')
            ),
            h('div', { className: 'dtp-rule-note' }, '周末遇调休上班日时，官方高峰界定仍是「周一至周五」，因此本插件按闲时计价并标注「调休上班」。节假日表覆盖 ' + RULES.coverage.years.join(' / ') + ' 年。'),
            stale ? h('div', { className: 'dtp-warn dtp-warn-amber' }, '价格已超过 ' + (RULES.priceMaxAgeDays || 30) + ' 天未复核，下表数字请对照官方页面确认。') : null,
            h(PriceTable, null)
          ),

          h('div', { className: 'dtp-foot' },
            '规则核对于 ' + RULES.coverage.verifiedAt + ' · ' + RULES.coverage.note + ' 官方价格页：' + RULES.coverage.sourceUrl
          )
        )
      )
    }

    function PeakChip() {
      const now = useNow(20000)
      const tier = tierAt(now)
      const meta = TIER_META[tier]
      const change = nextChangeCached(now)
      return h(
        'div',
        {
          className: 'dtp-chip' + (meta.weak ? ' dtp-chip-weak' : ''),
          style: tierStyle(meta),
          title: '当前' + meta.label + '（' + meta.rate + '）' +
            (change ? '，' + fmtDuration(change.remaining) + '后转为' + TIER_META[change.to].label : ''),
        },
        h('span', { className: 'dtp-dot' }),
        h('span', { className: 'dtp-chip-label' }, meta.label),
        h('span', { className: 'dtp-chip-rate' }, meta.short)
      )
    }

    function PeakNavIcon(props) {
      const now = useNow(30000)
      const tier = tierAt(now)
      const meta = TIER_META[tier]
      const size = props && typeof props.size === 'number' ? props.size : 16
      return h(
        'span',
        { className: 'dtp-navicon', title: 'DeepSeek 峰谷时段：' + meta.label },
        h(
          'svg',
          { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
          h('circle', { cx: 12, cy: 12, r: 8.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
          h('path', { d: 'M12 7.4V12l3.2 1.9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' })
        ),
        h('span', { className: 'dtp-navdot', style: { background: meta.color } })
      )
    }

    const CSS = `
.dtp-page{box-sizing:border-box;height:100%;overflow-y:auto;padding:26px 26px 64px;font-size:14px;line-height:1.55;
  color:var(--dsw-alias-label-primary,#1f2328);-webkit-font-smoothing:antialiased}
.dtp-page *{box-sizing:border-box}
.dtp-wrap{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.dtp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:2px}
.dtp-title{margin:0;font-size:23px;line-height:1.25;font-weight:600;letter-spacing:-.2px}
.dtp-sub{margin-top:4px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-clock{font-size:12px;color:var(--dsw-alias-label-secondary,#4a505a);font-variant-numeric:tabular-nums}
.dtp-hero{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;
  padding:18px 20px;border-radius:16px;background:var(--dsw-alias-bg-l1,#fff);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.09));box-shadow:0 1px 2px rgba(0,0,0,.04)}
.dtp-hero::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(115deg,var(--dtp-soft),transparent 64%)}
.dtp-hero-main{position:relative;display:flex;flex-direction:column;gap:5px;min-width:min(100%,320px)}
.dtp-hero-tier{display:flex;align-items:center;gap:10px}
.dtp-dot{width:9px;height:9px;border-radius:50%;background:var(--dtp-accent,#888);box-shadow:0 0 0 3px var(--dtp-soft);flex:none}
.dtp-tier{font-size:26px;font-weight:650;line-height:1.15;letter-spacing:-.02em;color:var(--dsw-alias-label-primary,#1f2328)}
.dtp-rate{font-size:11px;font-weight:500;padding:3px 8px;border-radius:999px;color:var(--dtp-accent,#333);
  background:var(--dtp-soft);border:1px solid var(--dtp-soft)}
.dtp-hero-hint{font-size:12px;color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-hero-now{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-hero-now strong{color:var(--dtp-accent,#333);font-weight:600}
.dtp-hero-side{position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right}
.dtp-next-label{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-next-time{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.01em;
  color:var(--dsw-alias-label-primary,#1f2328);line-height:1.2}
.dtp-next-at{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-next-offpeak{font-size:11px;color:var(--dsw-alias-label-secondary,#4a505a);margin-top:2px}
.dtp-card{display:flex;flex-direction:column;gap:12px;padding:16px 18px;border-radius:14px;
  background:var(--dsw-alias-bg-l1,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.09))}
.dtp-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dtp-card-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328)}
.dtp-card-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums}
.dtp-strip{position:relative;display:flex;height:10px;border-radius:6px;overflow:hidden;background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-seg{height:100%;min-width:0}
.dtp-seg[data-tier=peak]{background:var(--dtp-peak,#e0524b)}
.dtp-seg[data-tier=mid]{background:var(--dtp-mid,#c98a25);opacity:.75}
.dtp-seg[data-tier=low]{background:var(--dtp-low,#2e9e63)}
.dtp-seg[data-tier=unknown]{background:#b6bac1}
.dtp-marker{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;
  box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 5px rgba(0,0,0,.3);pointer-events:none;border-radius:1px;
  animation:dtp-breathe 2.6s ease-in-out infinite}
.dtp-ticks{position:relative;height:15px;margin-top:-4px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-tick{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap}
.dtp-tick:first-child{transform:none}
.dtp-tick:last-child{transform:translateX(-100%)}
.dtp-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,#4a505a);align-items:center}
.dtp-legend-item{display:inline-flex;align-items:center;gap:6px}
.dtp-letter{width:15px;height:15px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;
  font-size:9.5px;font-weight:700;color:#fff;background:var(--dtp-accent,#888);flex:none}
.dtp-legend-duration{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;font-variant-numeric:tabular-nums}
.dtp-dayrow{display:grid;grid-template-columns:132px minmax(0,1fr) 96px;gap:12px;align-items:center;padding:3px 0}
.dtp-dayrow-name{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dsw-alias-label-secondary,#4a505a);min-width:0}
.dtp-dayrow-today{color:var(--dsw-alias-label-primary,#1f2328);font-weight:600}
.dtp-dayrow-weekday{color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-dayrow-date{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums}
.dtp-dayrow-tag{flex:none;font-size:10px;padding:1px 5px;border-radius:5px;background:var(--dsw-alias-bg-l2,#f2f3f5);
  color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-dayrow-tag-warn{background:rgba(201,138,37,.14);color:#8a5a00}
.dtp-dayrow .dtp-strip{height:8px;border-radius:5px}
.dtp-dayrow-stat{font-size:11px;text-align:right;color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums}
.dtp-rule{display:grid;grid-template-columns:52px minmax(0,1fr);gap:10px;align-items:start;font-size:12.5px;
  color:var(--dsw-alias-label-secondary,#4a505a);line-height:1.65}
.dtp-rule-tag{display:inline-flex;justify-content:center;padding:1px 0;border-radius:6px;font-size:11px;font-weight:600;
  color:var(--dtp-accent,#333);background:var(--dtp-soft);border:1px solid var(--dtp-soft)}
.dtp-rule-tag-weak{border-style:dashed;color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-rule-weak .dtp-rule-text{color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-rule-note{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a8f98);line-height:1.6}
.dtp-price{width:100%;border-collapse:collapse;font-size:11.5px;color:var(--dsw-alias-label-secondary,#4a505a);font-variant-numeric:tabular-nums}
.dtp-price th,.dtp-price td{padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));text-align:right}
.dtp-price th:first-child,.dtp-price td:first-child{text-align:left}
.dtp-price thead th{color:var(--dsw-alias-label-tertiary,#8a8f98);font-weight:500}
.dtp-price tbody tr:last-child td{border-bottom:0}
.dtp-foot{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98);line-height:1.6;padding:2px 2px 0}
.dtp-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));background:var(--dtp-soft);
  font-size:12px;color:var(--dsw-alias-label-primary,#1f2328);white-space:nowrap;cursor:default;user-select:none}
.dtp-chip-weak{border-style:dashed;color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-chip .dtp-dot{width:7px;height:7px;box-shadow:none}
.dtp-chip-rate{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-navicon{position:relative;display:inline-flex;align-items:center;justify-content:center;
  color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-navdot{position:absolute;right:-3px;top:-2px;width:6px;height:6px;border-radius:50%;pointer-events:none}
.dtp-head-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.dtp-toggle{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:11.5px;padding:4px 10px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));background:transparent;
  color:var(--dsw-alias-label-secondary,#4a505a);cursor:pointer;line-height:1.4}
.dtp-toggle:hover{background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-toggle-dot{width:7px;height:7px;border-radius:50%;background:#c9ced6;flex:none}
.dtp-toggle-on{color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.16))}
.dtp-toggle-on .dtp-toggle-dot{background:#2e9e63;box-shadow:0 0 0 3px rgba(46,158,99,.16)}
.dtp-hero-alert{border-color:var(--dtp-accent,#888);box-shadow:0 2px 12px rgba(0,0,0,.06)}
.dtp-alert-badge{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;color:#fff;
  background:var(--dtp-accent,#888);animation:dtp-pulse 1.8s ease-in-out infinite;white-space:nowrap}
@keyframes dtp-pulse{0%,100%{opacity:.72}50%{opacity:1}}
@keyframes dtp-breathe{0%,100%{opacity:.45}50%{opacity:1}}
.dtp-dayrow-today-row{background:var(--dsw-alias-bg-l2,#f2f3f5);border-radius:10px;padding:6px 8px;margin:0 -8px}
.dtp-tick::before{content:"";position:absolute;left:50%;top:-7px;width:1px;height:5px;
  background:var(--dsw-alias-border-l2,rgba(0,0,0,.18))}
.dtp-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.dtp-stat{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-stat-accent{background:var(--dtp-soft,rgba(0,0,0,.05))}
.dtp-stat-label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-stat-label .dtp-dot{width:6px;height:6px;box-shadow:none}
.dtp-stat-value{font-size:17px;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums}
.dtp-stat-note{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-stat-tip{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a8f98);
  padding:8px 10px;border-radius:8px;background:var(--dtp-soft,rgba(0,0,0,.035))}
.dtp-model-switch{display:inline-flex;gap:2px;padding:2px;border-radius:999px;background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-model-btn{border:0;background:transparent;font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;
  cursor:pointer;color:var(--dsw-alias-label-tertiary,#8a8f98);line-height:1.4}
.dtp-model-btn-on{background:var(--dsw-alias-bg-l1,#fff);color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dtp-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.dtp-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.dtp-field-label{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-input{width:100%;padding:7px 10px;border-radius:8px;font:inherit;font-size:13px;font-variant-numeric:tabular-nums;
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:var(--dsw-alias-bg-l1,#fff);color:inherit}
.dtp-input:focus{outline:none;border-color:var(--dtp-accent,#888)}
.dtp-cost{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-cost-row{display:flex;align-items:baseline;gap:10px;font-size:12.5px}
.dtp-cost-key{min-width:96px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-cost-val{font-weight:600;font-variant-numeric:tabular-nums}
.dtp-cost-row-now .dtp-cost-val{font-size:15px}
.dtp-cost-tag{margin-left:auto;font-size:10.5px;padding:2px 7px;border-radius:999px;
  background:var(--dtp-soft,rgba(0,0,0,.05));color:var(--dtp-accent,#333);white-space:nowrap}
.dtp-cost-tip{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-live{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-live-off{color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-budget{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border-radius:10px;
  border:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.14));font-size:12.5px}
.dtp-budget-label{color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-budget-currency{color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-budget-input{width:74px;padding:4px 8px;font-size:13px}
.dtp-budget-arrow{color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-budget-value{font-weight:600;font-variant-numeric:tabular-nums}
.dtp-budget-note{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-ref{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-ref-title{font-size:12px;font-weight:600}
.dtp-ref-list{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:3px;
  font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-ref-note{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8a8f98)}
.dtp-hint-line{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#4a505a)}
.dtp-copy-btn{border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:transparent;font:inherit;
  font-size:11px;padding:3px 10px;border-radius:8px;color:var(--dsw-alias-label-secondary,#4a505a);cursor:pointer}
.dtp-copy-btn:hover{background:var(--dsw-alias-bg-l2,#f2f3f5)}
.dtp-warn{display:flex;gap:8px;align-items:flex-start;padding:9px 12px;border-radius:10px;font-size:11.5px;
  line-height:1.6;color:#8a5a00;background:rgba(201,138,37,.12);border:1px solid rgba(201,138,37,.28)}
.dtp-warn-amber{color:#8a5a00}
.dtp-boundary{padding:16px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8f98)}
@media (prefers-color-scheme: dark){
  .dtp-page{color:#e6e8eb}
  .dtp-hero,.dtp-card{background:#1c1f24;border-color:rgba(255,255,255,.1)}
  .dtp-strip,.dtp-stat,.dtp-ref,.dtp-cost{background:#26292f}
  .dtp-input{background:#1c1f24;color:#e6e8eb}
  .dtp-dayrow-today-row{background:#26292f}
}
`

    /** The strip colours live on the page root so every strip can read them. */
    const PAGE_TIER_VARS = '.dtp-page{--dtp-peak:#e0524b;--dtp-mid:#c98a25;--dtp-low:#2e9e63}\n'

    function installStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const element = document.createElement('style')
      element.id = STYLE_ID
      element.textContent = PAGE_TIER_VARS + CSS
      document.head.appendChild(element)
    }

    function removeStyles() {
      if (typeof document === 'undefined') return
      const element = document.getElementById(STYLE_ID)
      if (element) element.remove()
    }

    function apply(ctx) {
      installStyles()

      ctx.effect(function () {
        const disposers = []
        const mount = (slotName, definition, component) => {
          const guarded = function (props) {
            return h(Boundary, null, h(component, props))
          }
          disposers.push(
            ctx.slots.inject(slotName, function () {
              return ctx.slots.register(definition, guarded)
            })
          )
        }

        mount(
          'sidebar.panellist',
          { name: 'sidebar.panellist', id: PLUGIN_ID, order: 21, label: function () { return '峰谷时段' } },
          PeakNavIcon
        )

        mount(
          'main',
          { name: 'main', key: PLUGIN_ID },
          PeakPanel
        )

        mount(
          'conversation.session.header.utilities',
          { name: 'conversation.session.header.utilities', id: 'token-peak-chip', order: -10, label: '峰谷时段' },
          PeakChip
        )

        return function () {
          for (let i = 0; i < disposers.length; i++) {
            try {
              if (typeof disposers[i] === 'function') disposers[i]()
            } catch (error) {
              // A stale slot declaration is harmless; keep unloading the rest.
            }
          }
          removeStyles()
        }
      })
    }

    return { name: PLUGIN_ID, inject: ['slots'], apply: apply }
  },
})
