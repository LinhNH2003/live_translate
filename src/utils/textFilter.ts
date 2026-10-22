/**
 * Smart Filler Words & Disfluency Filter
 * Khử các từ đệm, tiếng ậm ừ, ngập ngừng (hesitations, speech disfluencies)
 * và xử lý ghép chuỗi chống lặp khi người dùng nói lắp hoặc đính chính.
 */

// Danh sách các từ đệm tiếng Anh
const EN_FILLERS = [
  'um', 'uh', 'er', 'ah', 'aah', 'umm', 'uhh', 'err', 'ahh',
  'like', 'you know', 'i mean', 'hmm', 'mhm', 'huh', 'eh',
  'so yeah', 'yeah so', 'kind of', 'sort of', 'actually', 'basically', 'well'
];

// Danh sách các từ đệm tiếng Việt
const VI_FILLERS = [
  'ừm', 'ờ', 'à', 'ừ', 'a', 'aaa', 'ờm', 'hả', 'hử',
  'kiểu', 'kiểu như', 'kiểu là', 'kiểu như là', 'thì là', 'thì là mà',
  'ý là', 'ý của mình là', 'ờ thì', 'ừ thì', 'dạ vâng', 'vâng ạ', 'dạ vâng thì'
];

// Regex kiểm tra xem toàn bộ chuỗi có chỉ chứa các từ đệm, tiếng thở, tiếng ngập ngừng hay không
const PURE_FILLER_REGEX = new RegExp(
  `^[\\s.,!?;:…\\-–—"'\`()[\\]{}|/~]*` +
  `(?:${[
    'u+[hm]+', 'u+h+', 'e+r+', 'a+h*', 'h+m+', 'm+h+m+', 'o+h+',
    'ừ+m*', 'ờ+m*', 'à+', 'ừ+', 'kiểu(?:\\s+như(?:\\s+là)?|\\s+là)?', 'thì\\s+là(?:\\s+mà)?', 'ý\\s+(?:của\\s+mình\\s+)?là',
    'you\\s+know', 'i\\s+mean', 'like', 'so\\s+yeah', 'yeah', 'actually', 'basically', 'well'
  ].join('|')})` +
  `[\\s.,!?;:…\\-–—"'\`()[\\]{}|/~]*$`,
  'i'
);

// Regex tìm từ đệm nằm ở đầu câu để dọn dẹp
const LEADING_FILLER_REGEX = new RegExp(
  `^(?:[\\s.,!?;:…\\-–—"'\`()[\\]{}|/~]|` +
  `\\b(?:um+|uh+|er+|ah+|hmm+|like|you\\s+know|ừm|ờ|à|kiểu(?:\\s+như)?|thì\\s+là)\\b)+[,\\s:;–—]+`,
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
 * Khử hiện tượng nói lắp hoặc lặp từ liên tiếp do ngập ngừng
 * Ví dụ: "Tôi... tôi muốn đi" -> "Tôi muốn đi", "we we need to" -> "we need to"
 */
export function removeStutters(text: string): string {
  if (!text) return '';
  // Khử từ lặp lại dạng: "\b(từ)\s+...\s+\1\b"
  return text.replace(/\b([a-zA-Zà-ỹÀ-Ỹ0-9]+)(?:[.,…\s-]+)+\1\b/gi, '$1');
}

/**
 * Làm sạch từ đệm nằm ở đầu câu hoặc dạng ngập ngừng lặp lại.
 */
export function cleanFillerWords(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Khử lặp từ do nói lắp
  cleaned = removeStutters(cleaned);

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

/**
 * Ghép chuỗi thông minh (Smart Transcript Merger)
 * Giải quyết triệt để 2 trường hợp:
 * 1. Server gửi full replacement (toàn bộ câu đã sửa/bổ sung) -> thay thế luôn để không bị lặp.
 * 2. Server gửi delta chunk -> nối thông minh, không thừa hoặc thiếu khoảng trắng.
 */
export function mergeStreamTranscript(prev: string | undefined, incoming: string): string {
  if (!prev) return incoming.trimStart();
  if (!incoming) return prev;

  const trimmedPrev = prev.trim();
  const trimmedIncoming = incoming.trim();

  // Nếu chuỗi mới là một câu hoàn chỉnh bao hàm chuỗi cũ (Server gửi full revised string)
  if (trimmedIncoming.startsWith(trimmedPrev) && trimmedIncoming.length > trimmedPrev.length) {
    return trimmedIncoming;
  }

  // Nếu chuỗi mới hoàn toàn giống chuỗi cũ (dup)
  if (trimmedIncoming === trimmedPrev) {
    return prev;
  }

  // Nếu là delta chunk bình thường
  if (/^[\s,.:;!?)]/.test(incoming) || /[\s(]$/.test(prev)) {
    return `${prev}${incoming}`;
  }

  return `${prev} ${incoming}`;
}

// Tập hợp các từ viết tắt phổ biến trong tiếng Anh và tiếng Việt để tránh ngắt nhầm câu
const COMMON_ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'ie', 'eg',
  'tp', 'ths', 'ts', 'gs', 'tt', 'ubnd', 'vnd', 'usd', 'inc', 'corp', 'ltd', 'co',
  'approx', 'dept', 'est', 'govt', 'intl', 'no', 'vol'
]);

export interface SplitResult {
  completed: string[];
  pending: string;
}

/**
 * Tự động nhận diện và tách các câu đã hoàn chỉnh từ luồng văn bản streaming.
 * Đảm bảo:
 * 1. Nhận diện chuẩn xác dấu ngắt câu (. ? ! ...) kèm theo từ câu mới.
 * 2. Không ngắt nhầm số thập phân (VD: 3.5, 4.0) hay từ viết tắt (VD: Mr. Mark, Dr. John).
 * 3. Hỗ trợ ngắt mềm khi câu quá dài (> 120 ký tự) tại các liên từ hoặc dấu phẩy để tránh card phình to.
 */
export function splitStreamingSentences(text: string): SplitResult {
  if (!text || text.trim().length === 0) {
    return { completed: [], pending: '' };
  }

  const completed: string[] = [];
  let remaining = text.trim();

  // Pattern tìm điểm kết thúc câu:
  // Dấu [.?!]+ kèm theo ký tự đóng ngoặc nếu có, theo sau bởi khoảng trắng và ký tự bắt đầu câu tiếp theo (hoặc xuống dòng)
  const sentenceBoundaryRegex = /([.?!]+["')\]}]?)(?:\s+(?=[A-ZÀ-Ỹa-zà-ỹ0-9"'(])|\n+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceBoundaryRegex.exec(remaining)) !== null) {
    const punctWithClosing = match[1];
    const matchIndex = match.index;
    const matchEnd = matchIndex + match[0].length;
    const candidateEnd = matchIndex + punctWithClosing.length;
    const candidate = remaining.slice(lastIndex, candidateEnd).trim();

    // 1. Kiểm tra số thập phân (ví dụ: 3.5, 10.5)
    const charBefore = matchIndex > 0 ? remaining[matchIndex - 1] : '';
    const charAfter = matchIndex + 1 < remaining.length ? remaining[matchIndex + 1] : '';
    if (punctWithClosing.startsWith('.') && /\d/.test(charBefore) && /\d/.test(charAfter)) {
      continue;
    }

    // 2. Kiểm tra từ viết tắt (Mr., Dr., v.v.)
    const words = candidate.split(/\s+/);
    const lastWord = words[words.length - 1]?.replace(/[^a-zA-Zà-ỹÀ-Ỹ]/g, '').toLowerCase();
    if (punctWithClosing.startsWith('.') && lastWord && COMMON_ABBREVIATIONS.has(lastWord)) {
      continue;
    }

    // 3. Đảm bảo phần còn lại của câu kế tiếp có ít nhất 2 ký tự thì mới chốt câu trước
    const rest = remaining.slice(matchEnd).trim();
    if (candidate.length > 0 && rest.length >= 2) {
      completed.push(candidate);
      lastIndex = matchEnd;
    }
  }

  let pending = remaining.slice(lastIndex).trim();

  // 4. Fallback an toàn cho câu nói liền mạch cực dài (> 280 ký tự) không hề có dấu chấm:
  // Chỉ ngắt tại dấu chấm phẩy (;), gạch ngang (–), hoặc hai chấm (:) để bảo vệ các mệnh đề phụ có dấu phẩy.
  if (pending.length > 280) {
    const semicolonIndex = pending.lastIndexOf(';', 220);
    const colonIndex = pending.lastIndexOf(':', 220);
    const dashIndex = pending.lastIndexOf(' - ', 220);
    const splitPoint = Math.max(semicolonIndex, colonIndex, dashIndex);

    if (splitPoint >= 100 && pending.length - splitPoint >= 40) {
      const longPart = pending.slice(0, splitPoint + 1).trim();
      const nextPending = pending.slice(splitPoint + 1).trim();
      if (longPart.length > 0 && nextPending.length > 0) {
        completed.push(longPart);
        pending = nextPending;
      }
    }
  }

  return { completed, pending };
}

export interface BilingualPair {
  vi: string;
  en?: string;
}

export interface BilingualStreamSplitResult {
  completedPairs: BilingualPair[];
  pendingVi: string;
  pendingEn?: string;
}

/**
 * Căn chỉnh và tách câu đồng thời cho luồng song ngữ (Tiếng Việt và Tiếng Anh).
 * Ghép các cặp câu đã hoàn chỉnh tương ứng để đẩy vào danh sách card phụ đề.
 */
export function splitBilingualStream(viText: string, enText?: string): BilingualStreamSplitResult {
  const viSplit = splitStreamingSentences(viText);

  // Nếu không có tiếng Anh (chế độ chỉ tiếng Việt hoặc chưa có input transcript)
  if (!enText || enText.trim().length === 0) {
    return {
      completedPairs: viSplit.completed.map((vi) => ({ vi })),
      pendingVi: viSplit.pending,
      pendingEn: undefined,
    };
  }

  const enSplit = splitStreamingSentences(enText);

  // Số lượng cặp câu đồng bộ hoàn thành
  let commitCount = Math.min(viSplit.completed.length, enSplit.completed.length);

  // Nếu tiếng Việt đã ngắt được từ 2 câu trở lên mà tiếng Anh nói liền hơi chưa ngắt kịp
  // -> giải phóng bớt câu tiếng Việt đầu tiên kèm câu tiếng Anh đầu tiên (hoặc undefined) để tránh nghẽn UI
  if (viSplit.completed.length >= 2 && enSplit.completed.length === 0) {
    commitCount = 1;
  }

  const completedPairs: BilingualPair[] = [];
  for (let i = 0; i < commitCount; i++) {
    completedPairs.push({
      vi: viSplit.completed[i],
      en: enSplit.completed[i] || undefined,
    });
  }

  // Thu gom phần câu chưa commit vào pending
  const uncommittedVi = viSplit.completed.slice(commitCount);
  const pendingViParts = [...uncommittedVi, viSplit.pending].filter(Boolean);
  const pendingVi = pendingViParts.join(' ');

  const uncommittedEn = enSplit.completed.slice(commitCount);
  const pendingEnParts = [...uncommittedEn, enSplit.pending].filter(Boolean);
  const pendingEn = pendingEnParts.join(' ');

  return {
    completedPairs,
    pendingVi,
    pendingEn: pendingEn || undefined,
  };
}

// Regex nhận diện liên từ nối câu ở đầu câu (Conjunctions indicating continuation of previous thought)
const VI_CONJUNCTION_PREFIX_REGEX = /^(?:và|nhưng|mà|bởi vì|vì vậy|do đó|cho nên|tuy nhiên|đồng thời|cũng như|thay vì|nghĩa là|tức là|nên là|để mà|hoặc là|hay là|thế nên|vậy nên|mặt khác)\b/i;
const EN_CONJUNCTION_PREFIX_REGEX = /^(?:and|but|because|so|which|that|although|even though|meanwhile|whereas|therefore|however|furthermore|moreover)\b/i;

/**
 * Kiểm tra xem một segment mới có nên được sáp nhập (stitch) vào segment ngay trước nó hay không.
 * Giúp giải quyết triệt để tình trạng câu dịch bị xé nhỏ, đứt gãy giữa chừng do khoảng dừng âm lượng.
 */
export function shouldStitchWithPrevious(
  prevVi: string,
  incomingVi: string,
  prevEn?: string,
  incomingEn?: string
): boolean {
  if (!prevVi || !incomingVi) return false;

  const trimmedPrevVi = prevVi.trim();
  const trimmedIncomingVi = incomingVi.trim();

  // Đảm bảo sau khi ghép tổng độ dài không bị quá khổ (> 300 ký tự)
  if (trimmedPrevVi.length + trimmedIncomingVi.length > 300) {
    return false;
  }

  // Điều kiện 1: Câu trước kết thúc dở dang, KHÔNG có dấu kết thúc (. ? ! ...)
  const prevEndsWithoutPunctuation = !/[.?!…]["')\]}]*$/.test(trimmedPrevVi);
  if (prevEndsWithoutPunctuation) {
    return true;
  }

  // Kiểm tra nếu câu tiếng Anh trước đó cũng chưa có dấu kết thúc câu
  if (prevEn && !/[.?!…]["')\]}]*$/.test(prevEn.trim())) {
    return true;
  }

  // Điều kiện 2: Câu mới bắt đầu bằng chữ thường (dấu hiệu rõ ràng của việc nối vế câu tiếp theo)
  if (/^[a-zà-ỹ]/.test(trimmedIncomingVi)) {
    return true;
  }

  // Điều kiện 3: Câu mới bắt đầu bằng liên từ nối ý tiếng Việt (kể cả khi viết hoa đầu câu do LLM format)
  if (VI_CONJUNCTION_PREFIX_REGEX.test(trimmedIncomingVi) && trimmedPrevVi.length < 220) {
    return true;
  }

  // Điều kiện 4: Câu gốc tiếng Anh mới bắt đầu bằng liên từ nối hoặc chữ thường
  if (incomingEn) {
    const trimmedIncomingEn = incomingEn.trim();
    if (/^[a-z]/.test(trimmedIncomingEn) || EN_CONJUNCTION_PREFIX_REGEX.test(trimmedIncomingEn)) {
      if (trimmedPrevVi.length < 220) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Hợp nhất (Stitch) 2 cặp câu (VI - EN) thành một câu hoàn chỉnh liền mạch
 */
export function stitchBilingualPair(
  prev: BilingualPair,
  incoming: BilingualPair
): BilingualPair {
  let prevVi = prev.vi.trim();
  let incomingVi = incoming.vi.trim();

  // Hạ chữ cái đầu tiên của câu sau nếu câu trước không có dấu chấm câu hoặc kết thúc bằng dấu phẩy
  if (!/[.?!…]$/.test(prevVi) && /^[A-ZÀ-Ỹ]/.test(incomingVi)) {
    // Nếu bắt đầu bằng liên từ (Và, Nhưng, Mà...) -> chuyển thành chữ thường khi nối
    if (VI_CONJUNCTION_PREFIX_REGEX.test(incomingVi)) {
      incomingVi = incomingVi.charAt(0).toLowerCase() + incomingVi.slice(1);
    }
  }

  const stitchedVi = `${prevVi} ${incomingVi}`.replace(/\s+/g, ' ').trim();

  let stitchedEn: string | undefined = undefined;
  if (prev.en || incoming.en) {
    const prevEn = (prev.en || '').trim();
    let incEn = (incoming.en || '').trim();

    if (!/[.?!…]$/.test(prevEn) && /^[A-Z]/.test(incEn) && EN_CONJUNCTION_PREFIX_REGEX.test(incEn)) {
      incEn = incEn.charAt(0).toLowerCase() + incEn.slice(1);
    }

    stitchedEn = prevEn && incEn 
      ? `${prevEn} ${incEn}`.replace(/\s+/g, ' ').trim() 
      : prevEn || incEn;
  }

  return {
    vi: stitchedVi,
    en: stitchedEn,
  };
}

