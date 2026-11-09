# ĐƯA LOUIS CHESS WORLD LÊN INTERNET — KHÔNG CẦN NODE.JS TRÊN MÁY

## Mục tiêu

Sau khi hoàn tất, website chạy trên máy chủ Vercel và dữ liệu ở Supabase. Thầy và LOUIS mở cùng một địa chỉ HTTPS trên máy tính/điện thoại; máy tính của thầy không cần bật.

Luồng triển khai: **GitHub Private → Vercel → Supabase → địa chỉ website**.

> Không tải ảnh thật của LOUIS lên GitHub. Ảnh được tải từ Teacher Studio sau khi đã có đồng ý phù hợp của phụ huynh/người giám hộ và được lưu vào Supabase Storage riêng tư.

## Phần A — Đưa mã nguồn lên GitHub hoàn toàn bằng trình duyệt

1. Tạo tài khoản hoặc đăng nhập tại https://github.com/.
2. Tạo repository mới tại https://github.com/new với tên `louis-chess-world` và chọn **Private**. Không tạo README, .gitignore hoặc license tự động.
3. Tải gói `LOUIS-CHESS-WORLD-v0.4.0-GITHUB.zip` trong cuộc trò chuyện và giải nén trên Windows bằng 7-Zip/Extract All. Không cần cài phần mềm lập trình.
4. Mở thư mục dự án có `package.json`, `app/`, `components/`, `lib/` và `supabase/`.
5. Trong GitHub repository, chọn **Add file → Upload files**. Kéo các tệp và thư mục *bên trong* thư mục dự án vào trang upload, không kéo chính thư mục cha hoặc file ZIP.
6. Bật hiển thị file ẩn trong File Explorer để chắc chắn chọn cả `.gitignore`. Không tải `.env.local`, ảnh riêng tư, mật khẩu, PIN hoặc khóa Supabase lên GitHub.
7. Nhập commit message `Initial upload LOUIS Chess World` và nhấn **Commit changes**.
8. Kiểm tra `package.json` nằm ngay ở thư mục gốc repository, không nằm trong thư mục con lồng thêm. GitHub Actions sẽ tự chạy kiểm tra câu đố và production build khi mã nguồn được push lên nhánh `main`.

Không đưa `.env.local`, mật khẩu, PIN hoặc bất kỳ khóa Supabase nào lên GitHub. `.gitignore` đã loại trừ các tệp môi trường này.

## Phần B — Tạo cơ sở dữ liệu riêng cho LOUIS

1. Mở https://supabase.com/dashboard và tạo một project mới.
2. Đợi project provision xong, mở **SQL Editor → New query**.
3. Mở file `supabase/SETUP-ALL.sql` trong gói mã nguồn, sao chép toàn bộ và chạy một lần trong SQL Editor của project mới.
4. File này gộp đủ tám migration theo đúng thứ tự. Nếu đã chạy từng file trong thư mục `supabase/migrations`, không chạy lại file tổng hợp.
5. Vào **Project Settings → API Keys**. Tạo/lấy:
   - Project URL.
   - Publishable key (`sb_publishable_...`) — khóa công khai, dùng trong trình duyệt.
   - Secret key (`sb_secret_...`) — khóa bí mật, chỉ dùng ở máy chủ.
6. Không gửi Secret key cho người khác, không chụp màn hình có lộ khóa, không dán khóa vào file mã nguồn hoặc chat công khai.

### Tạo hồ sơ giáo viên

1. Mở **Authentication → Users → Add user** để tạo email và mật khẩu giáo viên.
2. Mở file `CREATE-TEACHER-PROFILE.sql`, thay `teacher@example.com` bằng đúng email vừa tạo rồi chạy trong SQL Editor.
3. Tài khoản LOUIS sẽ được tạo từ Teacher Studio sau khi deploy; hệ thống chỉ cho phép một hồ sơ học viên toàn cục và tự chuẩn hóa tên thành LOUIS.

## Phần C — Deploy trên Vercel

1. Mở https://vercel.com/ và chọn đăng nhập bằng GitHub.
2. Chọn **Add New → Project**.
3. Import repository riêng tư `louis-chess-world` vừa Publish trên GitHub.
4. Framework phải tự nhận là **Next.js**. Root Directory để `./` vì `package.json` nằm ngay thư mục gốc.
5. Trong **Environment Variables**, thêm năm biến sau cho môi trường **Production** (có thể thêm Preview/Development nếu cần):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL của Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key `sb_publishable_...` |
   | `NEXT_PUBLIC_SITE_URL` | URL production do Vercel cấp, ví dụ `https://ten-du-an.vercel.app` |
   | `SUPABASE_SECRET_KEY` | Secret key `sb_secret_...` |
   | `PUZZLE_SESSION_SECRET` | Một chuỗi ngẫu nhiên riêng, tối thiểu 32 ký tự |

   `SUPABASE_SECRET_KEY` và `PUZZLE_SESSION_SECRET` là bí mật: tuyệt đối không thêm tiền tố `NEXT_PUBLIC_`.

6. Nhấn **Deploy**. Vercel tự cài dependencies và chạy production build trên máy chủ — thầy không cần cài Node.js trên Windows.
7. Khi deployment hoàn tất, Vercel tạo một URL dạng `https://ten-du-an.vercel.app`. URL chính xác sẽ hiện ở màn hình deployment.
8. Mở URL đó để kiểm tra trang chủ. Mở thêm `/api/health`; kết quả mong đợi gồm `status: "ok"` và `supabaseConfigured: true`.

Nếu đã thêm hoặc thay đổi Environment Variables sau deploy, vào Deployments và chọn **Redeploy** để bản build mới nhận giá trị đó.

## Phần D — Cấu hình Supabase cho URL đã deploy

Sau khi có URL Vercel:

1. Trong Supabase → **Authentication → URL Configuration**.
2. Đặt **Site URL** thành URL production chính xác, ví dụ `https://ten-du-an.vercel.app`.
3. Thêm URL đó vào Redirect URLs. Khi có domain riêng thì thêm cả domain riêng và các đường dẫn cần thiết.
4. Không dùng wildcard quá rộng nếu không cần.

## Phần E — Tạo LOUIS và đưa ảnh lên đúng hồ sơ

1. Truy cập `https://ten-du-an.vercel.app/login`.
2. Chọn tab Thầy/Cô giáo và đăng nhập bằng tài khoản vừa tạo.
3. Mở Teacher Studio `/teacher` và tạo tài khoản LOUIS. Mã học viên và PIN chỉ hiện một lần; lưu lại và chia sẻ riêng với gia đình.
4. Chỉ xác nhận đồng ý ảnh khi phụ huynh/người giám hộ đã đồng ý phù hợp. Sau đó tải ảnh gốc từ máy tính lên hồ sơ LOUIS trong Teacher Studio.
5. Nhập 7 câu đố mẫu hoặc tạo câu đố mới. Kiểm tra FEN và lời giải trước khi giao cho LOUIS.
6. LOUIS đăng nhập tại `/login` bằng mã học viên và PIN được cấp.

## Phần F — Địa chỉ riêng như louis-chess.com

- Trước tiên dùng URL `*.vercel.app` do Vercel cấp; không cần mua domain để thử nghiệm.
- Nếu muốn địa chỉ riêng như `louis-chess.com`, cần tự mua domain (tên miền phải còn khả dụng và có phí gia hạn).
- Trong Vercel → Project → **Settings → Domains**, nhập domain đã sở hữu. Vercel sẽ hiện các bản ghi DNS cần thêm tại nơi mua domain. Thực hiện đúng các bản ghi được Vercel chỉ định rồi chờ xác minh.
- Không mặc định `louis-chess.com` còn trống; cần tra cứu trước khi mua.

## Chi phí và giới hạn cần biết

- Vercel Hobby hiện miễn phí cho dự án cá nhân/phi thương mại. Nếu website dùng cho hoạt động dạy học thu phí hoặc mục đích thương mại, cần xem điều khoản và cân nhắc Vercel Pro; bảng giá hiện hành ghi Pro từ 20 USD/tháng, chưa gồm thuế.
- Supabase Free có thể dùng để thử nghiệm. Theo tài liệu hiện hành, project Free có thể bị tự động pause khi hoạt động thấp trong 7 ngày; muốn tránh pause do không hoạt động cần gói trả phí, Supabase Pro hiện bắt đầu từ 25 USD/tháng. Đây là phí của Supabase, độc lập với Vercel.
- Domain riêng có phí mua/gia hạn riêng. Vercel không cấp miễn phí tên miền `.com`.
- URL Vercel vẫn truy cập khi máy tính thầy tắt; riêng cơ sở dữ liệu Supabase Free có giới hạn pause nêu trên.

## Kiểm tra trước khi đưa LOUIS dùng

- [ ] Repository GitHub đặt Private.
- [ ] GitHub Actions có workflow `LOUIS Chess World quality check` và kết thúc thành công.
- [ ] Chạy file `supabase/SETUP-ALL.sql` thành công trên project mới.
- [ ] Tài khoản giáo viên đăng nhập được.
- [ ] `/api/health` báo `supabaseConfigured: true`.
- [ ] Tạo được duy nhất tài khoản LOUIS.
- [ ] LOUIS đăng nhập bằng mã + PIN.
- [ ] Ảnh nằm trong private Storage bucket và không truy cập được khi chưa đăng nhập.
- [ ] Câu đố được giao, nước đi hợp lệ được xác nhận, câu trả lời hoàn thành cộng sao và XP đúng một lần.
- [ ] Kiểm tra đăng xuất và đăng nhập lại trên điện thoại.

## Nếu Vercel Build Failed

Trong Vercel → Project → Deployments → chọn deployment lỗi → Build Logs. Sao chép dòng lỗi đầu tiên có ý nghĩa (không gửi API key/Secret key) và dùng làm thông tin xử lý. Không đoán nguyên nhân chỉ từ dòng cuối.


## Hệ thống điểm thưởng XP (v0.4.0)

- Mỗi câu đố có hai phần thưởng độc lập: **sao vàng** và **điểm XP**.
- Mặc định: Dễ = 100 XP, Vừa = 150 XP, Khó = 200 XP. Giáo viên có thể chỉnh XP khi tạo câu đố mới (0–5.000).
- Không trừ điểm khi Louis đi sai hoặc dùng gợi ý. Cách này khuyến khích em tiếp tục thử.
- Server dùng RPC transaction và unique successful-attempt index để một câu đố chỉ cộng thưởng một lần.
- `student_point_ledger` lưu lịch sử điểm; `student_progress.points_total` lưu tổng điểm để hiển thị nhanh.
- Nếu đã cài Supabase từ bản cũ, chạy migration 0008 mới trong SQL Editor rồi redeploy Vercel.

## Visual hint API added in v0.3.0

Two server routes support the visual-first learner experience:

- `/api/demo/hint` for the public demo puzzle set.
- `/api/puzzles/hint` for the authenticated single-student portal.

The routes return only the origin square and, for later hint stages, the destination square. They do not return the full UCI solution line. The authenticated route verifies the student's Supabase session, teacher ownership, assignment/publication state, and signed puzzle-session token before returning a hint.
