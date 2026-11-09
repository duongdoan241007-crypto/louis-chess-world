                  Mã OTP 6 chữ số
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) =>
                      setOtp(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    placeholder="123456"
                    required
                    minLength={6}
                    maxLength={6}
                  />
                </label>

                <label>
                  Mật khẩu mới
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(event.target.value)
                    }
                    placeholder="Ít nhất 8 ký tự"
                    required
                    minLength={8}
                  />
                </label>

                <label>
                  Nhập lại mật khẩu mới
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Nhập lại mật khẩu mới"
                    required
                    minLength={8}
                  />
                </label>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                >
                  {loading ? "Đang cập nhật..." : "Xác nhận mật khẩu mới"}
                  <ShieldCheck size={17} />
                </button>

                <button
                  type="button"
                  onClick={sendRecoveryCode}
                  disabled={loading}
                  style={{
                    display: "block",
                    margin: "12px auto 0",
                    border: 0,
                    background: "transparent",
                    color: "#4361ee",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  Gửi lại mã OTP
                </button>

                <button
                  type="button"
                  onClick={backToTeacherLogin}
                  style={{
                    display: "block",
                    margin: "10px auto 0",
                    border: 0,
                    background: "transparent",
                    color: "#666",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Quay lại đăng nhập
                </button>
              </form>
            )}

            {error && (
              <p
                className="auth-error"
                role="alert"
                aria-live="polite"
              >
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                aria-live="polite"
                style={{
                  marginTop: "14px",
                  color: "#247a45",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                {notice}
              </p>
            )}
          </>
        )}

        <div className="auth-foot">Học vui · Nghĩ sâu · Chơi đẹp</div>
      </section>
    </main>
  );
}
