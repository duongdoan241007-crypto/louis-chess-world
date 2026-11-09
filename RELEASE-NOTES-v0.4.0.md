# LOUIS CHESS WORLD — Release 0.4.0

## Điểm thưởng và cấp độ

- Tách XP (điểm kinh nghiệm) khỏi sao vàng.
- Mặc định: Dễ 100 XP, Vừa 150 XP, Khó 200 XP. Giáo viên có thể nhập mức 0–5.000 XP cho từng câu đố.
- Không trừ XP khi đi sai hoặc dùng gợi ý.
- Một câu đố chỉ trao XP và sao vàng một lần cho LOUIS.
- Sổ cái `student_point_ledger` lưu từng lần cộng điểm; tổng điểm nằm trong `student_progress.points_total`.
- Trang học viên có thanh XP lên cấp và nhật ký năm lần cộng điểm gần nhất.

## Cấp độ mặc định

| Cấp | Danh hiệu | XP tối thiểu |
|---:|---|---:|
| 1 | Tốt tập sự | 0 |
| 2 | Nhà thám hiểm | 300 |
| 3 | Chiến thuật gia | 800 |
| 4 | Hiệp sĩ | 1.600 |
| 5 | Đại kiện tướng nhí | 3.000 |

## Kiểm tra và triển khai

- Build tự chạy `npm run verify:puzzles` trước `next build`.
- Bộ kiểm tra xác nhận FEN và chuỗi nước đi mẫu hợp lệ bằng `chess.js`, kiểm tra phần thưởng và bảo đảm không đưa lời giải vào metadata công khai.
- GitHub Actions thực hiện production build mỗi khi cập nhật nhánh `main`.
- Supabase migration mới: `0008_xp_points_and_rewards.sql`. Project mới dùng `supabase/SETUP-ALL.sql`; project đã chạy 0001–0007 chỉ chạy migration 0008.

## Giới hạn kiểm thử lần phát hành này

Trong môi trường tạo gói, npm dependencies không cài được nên không thể chạy `next build`, ESLint hoặc tích hợp Supabase thật tại đây. Đã kiểm tra cú pháp TypeScript/TSX, JSON, cấu trúc import nội bộ, dữ liệu câu đố mẫu bằng kiểm tra luật độc lập và tính toàn vẹn gói ZIP. GitHub Actions/Vercel sẽ thực hiện build thật sau khi repository được đẩy lên.

## Additional validation performed for this package

- XP level boundaries tested at 0, 299, 300, 799, 800, 1,599, 1,600, 2,999 and 3,000 XP; transitions and remaining-XP values matched the configured thresholds.
- Non-finite and negative XP values normalize to zero.
- TypeScript/TSX syntax transpilation: 26 source files, zero syntax diagnostics.
- Full `tsc --noEmit` could not resolve project dependencies because `npm install` timed out; after excluding diagnostics caused by missing packages/types, no additional TypeScript diagnostics were reported.
- All project JSON files parse; all local `@/` imports resolve; the eight ordered migrations are present in `SETUP-ALL.sql`.
- ZIP archive integrity is checked after packaging.

**Important:** No one can responsibly guarantee a completely error-free application without a successful dependency install, production build, browser acceptance tests and a real Supabase deployment. This release includes automated checks for GitHub Actions/Vercel to run once dependencies can be installed.
