/**
 * Smart Filler Words & Disfluency Filter
 * Khử các từ đệm, tiếng ậm ừ, ngập ngừng (hesitations, speech disfluencies)
 * trong các cuộc hội thoại tiếng Anh và tiếng Việt.
 */

// Danh sách các từ đệm tiếng Anh đứng độc lập hoặc lặp đi lặp lại
const EN_FILLERS = [
  'um', 'uh', 'er', 'ah', 'aah', 'umm', 'uhh', 'err', 'ahh',
  'like', 'you know', 'i mean', 'hmm', 'mhm', 'huh', 'eh',
  'so yeah', 'yeah so', 'kind of', 'sort of'
];

// Danh sách các từ đệm tiếng Việt
const VI_FILLERS = [
  'ừm', 'ờ', 'à', 'ừ', 'a', 'aaa', 'ờm', 'hả', 'hử',
  'kiểu', 'kiểu như', 'kiểu là', 'thì là', 'ý là', 'dạ vâng', 'vâng ạ'
];

// Regex kiểm tra xem toàn bộ chuỗi có chỉ chứa các từ đệm, tiếng thở, tiếng ngập ngừng hay không
const PURE_FILLER_REGEX = new RegExp(
  `^[\\s.,!?;:…\\-–—"'\`()[\\]{}|/~]*` +
  `(?:${[
    'u+[hm]+', 'u+h+', 'e+r+', 'a+h*', 'h+m+', 'm+h+m+', 'o+h+',
    'ừ+m*', 'ờ+m*', 'à+', 'ừ+', 'kiểu(?:\\s+như|\\s+là)?', 'thì\\s+là', 'ý\\s+là',
    'you\\s+know', 'i\\s+mean', 'like', 'so\\s+yeah', 'yeah'
  ].join('|')})` +
  `[\\s.,!?;:…\\-–—"'\`()[\\]{}|/~]*$`,
  'i'
);

// Regex tìm từ đệm nằm ở đầu câu để dọn dẹp
const LEADING_FILLER_REGEX = new RegExp(
  `^(?:[\\s.,!?;:…\\-–—"'\`()[\\]{}|/~]|` +
  `\\b(?:um+|uh+|er+|ah+|hmm+|like|you\\s+know|ừm|ờ|à|kiểu\\s+như)\\b)+[,\\s:;–—]+`,
  'i'
);

/**
 * Kiểm tra xem một chuỗi văn bản có thuần túy là từ đệm rác hoặc tiếng ậm ừ hay không.
 * Nếu trả về true -> nên loại bỏ hoàn toàn, không lưu thành subtitle segment.
 */
export function isPureFillerText(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // Lọc các chuỗi quá ngắn chỉ gồm 1-2 ký tự không mang ngữ nghĩa (như 'a', 'uh', 'ah', 'ừ')
  if (trimmed.length <= 2 && /^[a-zA-Zà-ỹÀ-Ỹ\s.,!?-]+$/.test(trimmed)) {
    const lower = trimmed.toLowerCase().replace(/[^a-zà-ỹ]/g, '');
    if (['a', 'u', 'e', 'o', 'ừ', 'ờ', 'à', 'ừm'].includes(lower)) {
      return true;
    }
  }

  // Kiểm tra bằng regex tổng hợp
  if (PURE_FILLER_REGEX.test(trimmed)) {
    return true;
  }

  // Kiểm tra xem tất cả các từ trong chuỗi có phải đều là từ đệm không
  const cleanTokens = trimmed
    .toLowerCase()
    .replace(/[.,!?;:…\-–—"'`()[\]{}|\\/~]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (cleanTokens.length === 0) return true;

  const allFillers = cleanTokens.every((token) => {
    return EN_FILLERS.includes(token) || VI_FILLERS.includes(token) || /^(u+m+|u+h+|a+h*|e+r+|ừ+m*|ờ+)$/.test(token);
  });

  return allFillers;
}

/**
 * Làm sạch từ đệm nằm ở đầu câu hoặc dạng ngập ngừng lặp lại.
 * Ví dụ:
 * - "Um, so today we will begin..." -> "So today we will begin..."
 * - "Ừm, hôm nay chúng ta sẽ bắt đầu..." -> "Hôm nay chúng ta sẽ bắt đầu..."
 */
export function cleanFillerWords(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Khử các từ đệm đứng đầu câu
  const match = cleaned.match(LEADING_FILLER_REGEX);
  if (match && match[0].length < cleaned.length) {
    cleaned = cleaned.slice(match[0].length).trim();
    // Viết hoa chữ cái đầu tiên sau khi cắt từ đệm nếu cần
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }

  return cleaned;
}
