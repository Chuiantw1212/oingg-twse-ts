/**
 * 民國年日期字串轉為 UTC 午夜的 Date（前三碼 + 1911）。
 * 用 Date.UTC 建構，避免存進 Postgres @db.Date 欄位時因時區被 Prisma 序列化成前一天。
 */
export function rocDateToISO(rocDate: string): Date {
  const year = Number(rocDate.slice(0, 3)) + 1911;
  const month = Number(rocDate.slice(3, 5));
  const day = Number(rocDate.slice(5, 7));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 清理 TWSE 回傳的數值字串："1,234.56" 去逗號；"--"、""、"+"、"-"、"X" 等特殊註記轉 null。
 */
export function parseTwseNumber(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '--') return null;
  if (/^[+\-xX]$/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/,/g, '');
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null;
  return cleaned;
}

/**
 * 跟 parseTwseNumber 一樣的清理規則，但轉成 bigint——Prisma 的 BigInt 欄位（volume/turnover/transaction
 * 這類整數量）吃 bigint | number，不吃 string，不能直接沿用 parseTwseNumber 的回傳值。
 */
export function parseTwseBigInt(value: string | null | undefined): bigint | null {
  const cleaned = parseTwseNumber(value);
  if (cleaned === null) return null;
  return BigInt(cleaned);
}

/**
 * 取得 Asia/Taipei 當地的今天日期（YYYY-MM-DD）。用 Intl 取得該時區的曆法日期，
 * 不能用 new Date() 直接取值，因為容器 TZ=UTC，本地時間不等於台北時間。
 */
export function getTaipeiTodayISO(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' });
  return formatter.format(new Date());
}