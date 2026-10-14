import { useState, useEffect, useRef } from 'react';

/**
 * Hook làm mượt chuỗi văn bản streaming (Fluid Typewriter / Word-by-word streaming).
 * Giải quyết triệt để tình trạng chunk text to nhảy giật cục bằng cách cho text
 * chảy êm ái từng từ với tốc độ thích ứng tự nhiên.
 *
 * @param targetText Chuỗi text đích nhận được từ WebSocket streaming
 * @param baseSpeedMs Khoảng thời gian cơ sở giữa các nhịp nhả từ (mặc định 25ms)
 */
export function useSmoothText(targetText: string, baseSpeedMs: number = 25): string {
  const [displayedText, setDisplayedText] = useState(targetText);
  const targetRef = useRef(targetText);
  const displayedRef = useRef(targetText);
  const timerRef = useRef<number | null>(null);

  targetRef.current = targetText;

  useEffect(() => {
    // 1. Nếu chuỗi đích rỗng (qua turn mới hoặc reset), lập tức reset không chờ
    if (!targetText) {
      setDisplayedText('');
      displayedRef.current = '';
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // 2. Nếu targetText thay đổi đột ngột (không bắt đầu bằng text hiện tại), cập nhật ngay
    if (!targetText.startsWith(displayedRef.current)) {
      setDisplayedText(targetText);
      displayedRef.current = targetText;
      return;
    }

    // 3. Nếu đã bắt kịp, không làm gì thêm
    if (displayedRef.current.length >= targetText.length) {
      return;
    }

    // 4. Nếu chưa có timer, khởi động vòng lặp nhả từ mượt mà
    if (timerRef.current === null) {
      const step = () => {
        const current = displayedRef.current;
        const target = targetRef.current;

        if (current.length >= target.length) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return;
        }

        const remaining = target.slice(current.length);

        // Tìm điểm ngắt từ tiếp theo
        const nextSpaceIdx = remaining.indexOf(' ');
        let charsToAdd = remaining.length;

        if (nextSpaceIdx !== -1) {
          // Lấy đến hết dấu cách của từ tiếp theo
          charsToAdd = nextSpaceIdx + 1;
        }

        // Tốc độ thích ứng (Adaptive): Nếu dồn backlog quá dài (> 25 ký tự),
        // nhả thêm từ tiếp theo để không bị lag xa so với lời nói thật
        if (remaining.length > 25 && nextSpaceIdx !== -1) {
          const secondSpaceIdx = remaining.indexOf(' ', nextSpaceIdx + 1);
          if (secondSpaceIdx !== -1) {
            charsToAdd = secondSpaceIdx + 1;
          }
        }

        const nextText = current + remaining.slice(0, charsToAdd);
        displayedRef.current = nextText;
        setDisplayedText(nextText);
      };

      timerRef.current = window.setInterval(step, baseSpeedMs);
    }
  }, [targetText, baseSpeedMs]);

  // Dọn dẹp timer khi component unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return displayedText;
}
