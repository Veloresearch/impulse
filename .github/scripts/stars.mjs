// Draws the README's star history from the repository's own stargazers, in the README's style:
// one chart for light mode, one for dark. Run by .github/workflows/stars.yml on every new star.
//
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node .github/scripts/stars.mjs

import { writeFileSync } from 'node:fs'

const repo = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed')

async function stargazers() {
  const dates = []
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/stargazers?per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github.star+json', Authorization: `Bearer ${token}`, 'User-Agent': 'stars-chart' },
    })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const batch = await res.json()
    for (const s of batch) dates.push(new Date(s.starred_at))
    if (batch.length < 100) break
  }
  return dates.sort((a, b) => a - b)
}

const THEMES = {
  light: { card: '#FAFAF9', title: '#1B1C1E', meta: '#6E6E76', grid: '#E9E5EC', line: '#D99A6C', fill: '#D99A6C' },
  dark: { card: '#1F1F22', title: '#F2F1F4', meta: '#9A99A2', grid: '#2E2D33', line: '#E3A97C', fill: '#E3A97C' },
}

const W = 880, H = 300
const L = 70, R = 840, T = 60, B = 240
const DAY = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`

/** A round step for the y axis: 1, 2, 5, 10, 20, 50... with at most four lines. */
function step(max) {
  for (let p = 1; ; p *= 10) for (const m of [1, 2, 5]) if (max / (m * p) <= 4) return m * p
}

function chart(dates, theme) {
  const c = THEMES[theme]
  const total = dates.length
  const start = new Date(Math.floor((dates[0]?.getTime() ?? Date.now()) / DAY) * DAY)
  const end = new Date(Math.max(Date.now(), start.getTime() + 7 * DAY))
  const span = end - start
  const s = step(Math.max(4, total))
  const top = Math.max(s, Math.ceil(total / s) * s)
  // Time runs on a curve that gives recent days more room when most stars are recent (otherwise
  // a launch is a vertical line against the right edge), and straightens out as they spread: the
  // median star sits near the middle, within limits. The dates along the bottom follow the curve.
  const median = dates.length ? (dates[Math.floor(dates.length / 2)] - start) / span : 0.5
  const k = Math.min(4, Math.max(1, Math.log(0.5) / Math.log(Math.min(0.999, Math.max(0.001, median)))))
  const x = t => L + Math.pow(Math.min(1, Math.max(0, (t - start) / span)), k) * (R - L)
  const at = f => new Date(start.getTime() + span * Math.pow(f, 1 / k))
  const y = n => B - (n / top) * (B - T)

  // A step line: flat between stars, up by one at each.
  let path = `M${x(start).toFixed(1)},${y(0).toFixed(1)}`
  dates.forEach((d, i) => {
    path += ` H${x(d).toFixed(1)} V${y(i + 1).toFixed(1)}`
  })
  path += ` H${x(end).toFixed(1)}`
  const area = `${path} V${y(0).toFixed(1)} Z`

  const out = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  out.push(`<style>text{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif}.l{stroke-dasharray:2400;stroke-dashoffset:2400;animation:d 1.6s cubic-bezier(.2,.8,.2,1) forwards}.a{opacity:0;animation:f .8s .6s ease forwards}@keyframes d{to{stroke-dashoffset:0}}@keyframes f{to{opacity:1}}@media (prefers-reduced-motion:reduce){.l{animation:none;stroke-dashoffset:0}.a{animation:none;opacity:1}}</style>`)
  out.push(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.fill}" stop-opacity=".28"/><stop offset="1" stop-color="${c.fill}" stop-opacity="0"/></linearGradient></defs>`)
  out.push(`<rect width="${W}" height="${H}" rx="22" fill="${c.card}"/>`)
  out.push(`<text x="${L}" y="36" font-size="17" font-weight="650" fill="${c.title}">Stars on GitHub</text>`)
  out.push(`<text x="${R}" y="36" font-size="17" font-weight="650" fill="${c.line}" text-anchor="end">${total.toLocaleString('en-US')}</text>`)
  for (let n = 0; n <= top; n += s) {
    out.push(`<line x1="${L}" x2="${R}" y1="${y(n).toFixed(1)}" y2="${y(n).toFixed(1)}" stroke="${c.grid}"/>`)
    out.push(`<text x="${L - 10}" y="${(y(n) + 4).toFixed(1)}" font-size="11" fill="${c.meta}" text-anchor="end">${n}</text>`)
  }
  // Five dates along the bottom, evenly spaced on the page.
  for (let i = 0; i <= 4; i++) {
    const t = at(i / 4)
    out.push(`<text x="${(L + ((R - L) * i) / 4).toFixed(1)}" y="262" font-size="11" fill="${c.meta}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${label(t)}</text>`)
  }
  out.push(`<path class="a" d="${area}" fill="url(#g)"/>`)
  out.push(`<path class="l" d="${path}" fill="none" stroke="${c.line}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`)
  out.push(`<circle class="a" cx="${x(end).toFixed(1)}" cy="${y(total).toFixed(1)}" r="4.5" fill="${c.line}"/>`)
  out.push('</svg>')
  return out.join('')
}

const dates = await stargazers()
for (const theme of ['light', 'dark']) writeFileSync(`.github/stars-${theme}.svg`, chart(dates, theme) + '\n')
console.log(`${dates.length} stars drawn`)
