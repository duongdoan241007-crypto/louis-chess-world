async function handleTeacherSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendTeacherOtp();
  }

  async function sendTeacherOtp() {
    if (loading || verifyingOtp) return;
    clearMessages();

    const normalizedEmail = teacherEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Vui lòng nhập địa chỉ email giáo viên hợp lệ.");
      return;
    }

    setLoading(true);
    setNotice("Đang gửi mã xác nhận...");

    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error("Chưa kết nối được Supabase. Hãy kiểm tra Project URL và Publishable Key trong Vercel.");
      }

      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
        },
      });

      if (sendError) throw sendError;

      setTeacherEmail(normalizedEmail);
      setOtp("");
      setOtpSent(true);
      setNotice("Mã OTP đã được yêu cầu gửi đến email. Hãy kiểm tra hộp thư đến và Spam.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      console.error("Teacher OTP request failed:", caught);
      setNotice("");
      setError(friendlyOtpError(message));
    } finally {
      setLoading(false);
    }
  }
