/**
 * Make Uzbek text read correctly aloud: right apostrophes in oʻ/gʻ, numbers,
 * times and percentages as words, and no markdown, links or emoji.
 */
const ONES = ['nol', 'bir', 'ikki', 'uch', 'toʻrt', 'besh', 'olti', 'yetti', 'sakkiz', 'toʻqqiz']
const TENS = ['', 'oʻn', 'yigirma', 'oʻttiz', 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', 'toʻqson']
const SCALES = [[1e12, 'trillion'], [1e9, 'milliard'], [1e6, 'million'], [1e3, 'ming']]

export function numberWords(n) {
  if (n < 0) return 'minus ' + numberWords(-n)
  if (n < 10) return ONES[n]
  const out = []
  for (const [v, w] of SCALES) {
    if (n >= v) {
      const q = Math.floor(n / v)
      n -= q * v
      out.push(q === 1 && v === 1e3 ? w : `${numberWords(q)} ${w}`)
    }
  }
  if (n >= 100) {
    const q = Math.floor(n / 100)
    n -= q * 100
    out.push((q > 1 ? ONES[q] + ' ' : '') + 'yuz')
  }
  if (n >= 10) {
    const q = Math.floor(n / 10)
    n -= q * 10
    out.push(TENS[q])
  }
  if (n) out.push(ONES[n])
  return out.join(' ')
}

export function speakableUz(text, maxChars = 700) {
  let t = String(text ?? '')
  t = t.replace(/```[\s\S]*?```/g, ' ')
  t = t.replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, '$1').replace(/https?:\/\/\S+/g, 'havola')
  t = t.replace(/`([^`]*)`/g, '$1').replace(/[*_#>~|]+/g, ' ')
  t = t.replace(/[\u{1F000}-\u{1FAFF}☀-➿️‍]/gu, '')
  // o' g' with a plain apostrophe is read as "o" / "g"; the modifier letter is read right.
  t = t.replace(/([oOgG])['`‘’ʼ´]/g, '$1ʻ')
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) =>
    `soat ${numberWords(+h)}${+m ? ' ' + numberWords(+m) : ''}`)
  t = t.replace(/(\d+)\s*%/g, (_, n) => `${numberWords(+n)} foiz`)
  t = t.replace(/\b\d{1,15}\b/g, (n) => numberWords(+n))
  t = t.replace(/\s*\n+\s*/g, '. ').replace(/\s+/g, ' ').trim()
  if (t.length > maxChars) {
    const cut = Math.max(t.lastIndexOf('. ', maxChars), t.lastIndexOf('? ', maxChars))
    t = t.slice(0, cut > maxChars / 3 ? cut + 1 : maxChars)
  }
  return t
}
