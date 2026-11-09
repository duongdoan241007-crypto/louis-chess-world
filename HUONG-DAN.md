# HƯỚNG DẪN — LOUIS CHESS WORLD

Website được làm cho một giáo viên và đúng một học viên LOUIS.

## Cách dễ nhất: deploy online, không cài Node.js trên Windows

Đọc file **[DEPLOY-ONLINE.md](./DEPLOY-ONLINE.md)**. Cần có tài khoản GitHub, Vercel và Supabase. Có thể thao tác GitHub hoàn toàn trong trình duyệt. Node.js được Vercel cài trên cloud trong lúc build; máy tính giáo viên không cần chạy website.

## Cài cơ sở dữ liệu

Với Supabase project mới, mở SQL Editor và chạy toàn bộ `supabase/SETUP-ALL.sql` đúng một lần. File này gộp migrations 0001–0008. Không chạy thêm từng migration riêng nếu đã chạy file tổng hợp.

## Biến môi trường dùng trên Vercel

| Biến | Vai trò |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Khóa publishable công khai |
| `SUPABASE_SECRET_KEY` | Secret key chỉ ở máy chủ |
| `PUZZLE_SESSION_SECRET` | Bí mật ký tiến trình câu đố, tối thiểu 32 ký tự |

Mã nguồn vẫn hỗ trợ biến cũ `SUPABASE_SERVICE_ROLE_KEY` như fallback tạm thời, nhưng dự án mới nên dùng `SUPABASE_SECRET_KEY` (`sb_secret_...`).

## Điểm thưởng của LOUIS

- Câu đố Dễ mặc định 100 XP, Vừa 150 XP, Khó 200 XP. Giáo viên chỉnh được điểm khi tạo câu đố.
- Sao vàng và XP là hai phần thưởng riêng. Câu đố chỉ cộng thưởng một lần; thử sai và dùng gợi ý không làm mất điểm.
- Nếu project đã cài các migration 0001–0007, chỉ chạy `supabase/migrations/0008_xp_points_and_rewards.sql`. Không chạy lại `SETUP-ALL.sql` trên project đã có dữ liệu.

## Đăng nhập và tạo LOUIS

1. Tạo user giáo viên trong Supabase Auth.
2. Chạy `CREATE-TEACHER-PROFILE.sql` sau khi thay email mẫu.
3. Đăng nhập Teacher Studio tại `/teacher`.
4. Tạo duy nhất hồ sơ LOUIS; mã/PIN hiển thị một lần.
5. Tải ảnh lên private Storage sau khi có đồng ý phù hợp của phụ huynh/người giám hộ.

## Lưu ý chi phí

Vercel cấp URL `*.vercel.app` để bắt đầu; domain riêng cần mua. Supabase Free có thể pause sau 7 ngày ít hoạt động, nên cần cân nhắc gói Pro nếu muốn tránh pause. Vercel Hobby chỉ dành cho trường hợp cá nhân/phi thương mại; xem điều khoản nếu triển khai cho hoạt động thương mại hoặc dạy học thu phí.
