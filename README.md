# LOUIS CHESS WORLD — Vương quốc 64 ô

Website cờ vua trực tuyến dành riêng cho **một học viên: LOUIS** và giáo viên quản trị.

## Kiến trúc triển khai

- **Next.js 16 / React 19 / TypeScript** — ứng dụng web và API phía máy chủ.
- **Vercel** — hosting production, tự build từ GitHub; không cần bật máy tính của giáo viên.
- **Supabase** — PostgreSQL, Auth và private Storage cho ảnh học viên.
- **chess.js** — kiểm tra luật cờ vua.

## Chức năng

- Hành trình và hồ sơ riêng của LOUIS.
- Bản đồ phiêu lưu tám vùng cờ vua.
- Đấu trường câu đố với kiểm tra nước đi phía máy chủ.
- Teacher Studio để tạo/giao câu đố, quản lý PIN và ảnh duy nhất của LOUIS.
- Sao vàng, điểm XP, nhật ký cộng điểm và tiến trình được lưu trong Supabase; có thanh XP lên cấp hiển thị cho LOUIS.
- Đáp án câu đố không được gửi sẵn xuống trình duyệt học viên.

## Triển khai không cần Node.js trên máy cá nhân

Làm theo **[DEPLOY-ONLINE.md](./DEPLOY-ONLINE.md)**. Có thể tải mã nguồn lên GitHub bằng trình duyệt, sau đó import repository vào Vercel. Vercel sẽ cài dependencies và build trên cloud.

## Chạy local (tùy chọn)

Cần Node.js 22.x:

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## Kiểm tra mã nguồn

Mỗi lần build production, `prebuild` tự kiểm tra tính hợp lệ của toàn bộ câu đố mẫu và xác nhận đáp án không bị đưa vào metadata công khai. GitHub Actions cũng chạy lại kiểm tra này và production build khi push lên nhánh `main`.


```bash
npm run lint
npm run verify:puzzles
npm run build
```

## Bảo mật

- Không đưa `.env.local` hoặc bất kỳ khóa Supabase bí mật nào lên GitHub.
- Repository phải để **Private** vì dự án chứa dữ liệu câu đố mẫu.
- `SUPABASE_SECRET_KEY` chỉ dùng phía máy chủ; `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` là khóa công khai có quyền giới hạn theo RLS.
- Không đưa ảnh trẻ em vào Git repository; tải ảnh lên private Storage từ Teacher Studio sau khi xác nhận đồng ý phù hợp của phụ huynh/người giám hộ.
- Website có `noindex` để yêu cầu công cụ tìm kiếm không lập chỉ mục portal này.

## Supabase database

- Có thể chạy từng migration trong `supabase/migrations/` theo thứ tự 0001–0008.
- Với Supabase project mới, cách dễ hơn là chạy **một lần** file [`supabase/SETUP-ALL.sql`](./supabase/SETUP-ALL.sql). Không chạy cả file tổng hợp và các migration riêng lẻ cùng nhau.

## API health check

Sau khi deploy, mở `/api/health`. API chỉ trả trạng thái ứng dụng và việc Supabase đã cấu hình hay chưa; không trả về khóa bí mật.


## Visual-first Puzzle Arena (v0.3.0)

The puzzle screen now supports three pre-reader-friendly controls:

- **Tự chơi**: clear visual overlays and let Louis explore.
- **Gợi ý hình**: progressive hint stages show the source square, then the destination and arrow, then a move preview.
- **Xem mẫu**: asks the server for the current solution move coordinates and animates a translucent piece across the board; Louis then repeats the move himself.

Optional Vietnamese speech prompts use the browser's Speech Synthesis API when audio/voice is enabled and when a Vietnamese voice is available on the device. The full solution line remains server-side; hint endpoints return only the squares required for the requested stage.


## Điểm XP và sao thưởng

- Mỗi câu đố cộng XP theo độ khó: Dễ 100, Vừa 150, Khó 200 (giáo viên có thể chỉnh).
- Sao vàng là phần thưởng riêng, tách biệt với XP.
- Không trừ điểm khi trả lời sai hoặc cần gợi ý.
- Server lưu lịch sử trong `student_point_ledger` và chặn cộng thưởng trùng cho cùng một câu đố.
- Chạy migration `0008_xp_points_and_rewards.sql` nếu project Supabase đã được tạo từ phiên bản trước.


## Phiên bản 0.4.0 — XP & cấp độ

- Tách **điểm XP** khỏi **sao vàng**; cả hai phần thưởng được lưu riêng.
- Mặc định: Dễ 100 XP, Vừa 150 XP, Khó 200 XP; giáo viên có thể chỉnh từ 0 đến 5.000 XP.
- Mỗi câu đố chỉ được trao thưởng một lần; các lần thử sai hoặc dùng gợi ý không trừ XP.
- Cấp độ học viên được tính từ tổng XP và thanh tiến trình cho biết còn bao nhiêu XP để lên cấp: Cấp 1 từ 0 XP, Cấp 2 từ 300 XP, Cấp 3 từ 800 XP, Cấp 4 từ 1.600 XP và Cấp 5 từ 3.000 XP trở lên.
- Migration `0008_xp_points_and_rewards.sql` tạo sổ cái điểm thưởng để lưu lịch sử cộng điểm.
