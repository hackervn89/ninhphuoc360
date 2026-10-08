/**
 * NINH PHƯỚC 360 — MODULE BỘ ĐẾM KHÁCH THAM QUAN THỜI GIAN THỰC
 * ============================================================================
 * Công nghệ: Firebase v10 Realtime Database SDK (Presence System + Increment)
 * Hỗ trợ 2 chế độ:
 *   1. Chế độ Live Cloud: Khi đã cấu hình Firebase hợp lệ trong firebase-config.js
 *   2. Chế độ Demo Simulator: Tự động chạy khi chưa cấu hình để đảm bảo giao diện
 *      luôn sinh động, mượt mà và không báo lỗi.
 * ============================================================================
 */

import { firebaseConfig } from './firebase-config.js';

(function () {
    const BASE_VIEWS_OFFSET = 1500;  // 1.500 lượt tham quan

    // Bảng mốc cơ sở người xem theo 24 khung giờ trong ngày (0h -> 23h)
    // - Khung giờ khuya (0h - 5h): khoảng 10 - 20 người
    // - Khung ban ngày (7h - 17h): khoảng 22 - 34 người
    // - Khung cao điểm tối (19h - 22h): khoảng 33 - 40 người
    const HOURLY_BASELINE = [
        13, // 00:00 (Đêm khuya)
        12, // 01:00
        11, // 02:00
        10, // 03:00 (Thấp nhất đêm khuya)
        11, // 04:00
        13, // 05:00
        17, // 06:00 (Bắt đầu sáng)
        22, // 07:00
        26, // 08:00
        30, // 09:00 (Giờ làm việc)
        33, // 10:00
        31, // 11:00
        27, // 12:00 (Nghỉ trưa)
        26, // 13:00
        30, // 14:00 (Buổi chiều)
        33, // 15:00
        32, // 16:00
        28, // 17:00
        27, // 18:00 (Tan tầm)
        32, // 19:00 (Tối)
        36, // 20:00 (GIỜ CAO ĐIỂM)
        38, // 21:00 (Đỉnh điểm cao nhất)
        34, // 22:00
        21  // 23:00 (Hạ dần trước nửa đêm)
    ];

    /**
     * Tính toán số khách cơ sở biến thiên mượt mà theo từng giờ và từng phút
     */
    function getHourlyBase() {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        const s = now.getSeconds();
        const nextH = (h + 1) % 24;

        const currentHourBase = HOURLY_BASELINE[h];
        const nextHourBase = HOURLY_BASELINE[nextH];

        // 1. Nội suy tuyến tính theo phút và giây (chuyển giờ mượt mà không bị giật số)
        const progress = (m * 60 + s) / 3600;
        const interpolated = currentHourBase + (nextHourBase - currentHourBase) * progress;

        // 2. Vi dao động sóng tự nhiên (±1.5) theo chu kỳ thời gian
        const wave = Math.sin((m * 6 + s / 10) * Math.PI / 180) * 1.5;

        return Math.max(10, Math.round(interpolated + wave));
    }

    function computeCurrentOnline() {
        return getHourlyBase() + realOnlineCount;
    }

    let realTotalCount = 0;
    let realOnlineCount = 1;
    let currentOnline = computeCurrentOnline();
    let currentTotal = BASE_VIEWS_OFFSET;
    let currentToday = 0;
    let isRealFirebase = false;

    // Các phần tử DOM
    let badgeEl = null;
    let onlineEl = null;
    let totalEl = null;
    let popoverEl = null;

    document.addEventListener("DOMContentLoaded", () => {
        badgeEl = document.getElementById("visitor-badge");
        onlineEl = document.getElementById("online-count");
        totalEl = document.getElementById("total-count");

        if (!badgeEl || !onlineEl || !totalEl) {
            console.warn("[VisitorCounter] Không tìm thấy phần tử HTML của bộ đếm.");
            return;
        }

        initPopover();
        initCounter();
    });

    /**
     * Khởi tạo bộ đếm: Kiểm tra cấu hình và chạy Live Cloud hoặc Demo
     */
    async function initCounter() {
        const isConfigured = firebaseConfig && 
                             firebaseConfig.apiKey && 
                             firebaseConfig.apiKey !== "YOUR_API_KEY" && 
                             firebaseConfig.databaseURL && 
                             !firebaseConfig.databaseURL.includes("YOUR_PROJECT_ID");

        if (isConfigured && window.location.protocol !== "file:") {
            try {
                await startFirebaseLive();
                isRealFirebase = true;
                console.log("🟢 [VisitorCounter] Đã kết nối Firebase Realtime Database thành công!");
                return;
            } catch (err) {
                console.warn("⚠️ [VisitorCounter] Lỗi kết nối Firebase, chuyển sang chế độ dự phòng:", err.message);
            }
        } else {
            console.info("ℹ️ [VisitorCounter] Đang chạy ở chế độ Demo (chưa cấu hình Firebase). Xem hướng dẫn tại FIREBASE_COUNTER_GUIDE.md.");
        }

        startDemoSimulation();
    }

    /**
     * 1. KẾT NỐI FIREBASE REALTIME DATABASE TRỰC TIẾP
     */
    async function startFirebaseLive() {
        // Nạp động Firebase SDK v10 từ CDN của Google
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
        const { getDatabase, ref, onValue, set, push, onDisconnect, increment } = 
            await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js");

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);

        // A. QUẢN LÝ NGƯỜI ĐANG ONLINE (Presence System)
        const connectedRef = ref(db, ".info/connected");
        const onlineListRef = ref(db, "presence");

        onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                const myPresenceRef = push(onlineListRef);
                set(myPresenceRef, {
                    ts: Date.now(),
                    ua: navigator.userAgent.substring(0, 60)
                });

                // Khi tab bị đóng hoặc mất kết nối -> máy chủ tự động hủy node này
                onDisconnect(myPresenceRef).remove();
            }
        });

        // Lắng nghe cập nhật số người online theo thời gian thực (Cơ sở theo giờ + số thực tế)
        onValue(onlineListRef, (snap) => {
            realOnlineCount = snap.exists() ? snap.size : 1;
            updateOnline(computeCurrentOnline());
        });

        // Định kỳ mỗi 20 giây tự động cập nhật số người online theo nhịp biến thiên thời gian
        setInterval(() => {
            updateOnline(computeCurrentOnline());
        }, 20000);

        // B. QUẢN LÝ TỔNG LƯỢT XEM VÀ LƯỢT XEM HÔM NAY (LƯU SỐ THỰC TẾ TRÊN FIREBASE)
        const totalRef = ref(db, "stats/total_views");
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
        const todayRef = ref(db, `stats/daily_views/${todayStr}`);

        // Chỉ cộng 1 lượt mỗi phiên duyệt web (Session) để tránh F5 liên tục
        const sessionKey = "np360_counted_visit";
        if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, "1");
            set(totalRef, increment(1)).catch(e => console.warn(e));
            set(todayRef, increment(1)).catch(e => console.warn(e));
        }

        // Lắng nghe tổng lượt xem thời gian thực (Hiển thị = 1.500 + Số thực tế trên Firebase)
        onValue(totalRef, (snap) => {
            realTotalCount = Number(snap.val() || 0);
            const displayTotal = BASE_VIEWS_OFFSET + realTotalCount;
            updateTotal(displayTotal);
        });

        // Lắng nghe lượt xem hôm nay
        onValue(todayRef, (snap) => {
            currentToday = Number(snap.val() || 0);
            updatePopoverContent();
        });
    }

    /**
     * 2. CHẾ ĐỘ DEMO SIMULATION (Tự nhiên, sống động khi chưa có Firebase)
     */
    function startDemoSimulation() {
        // Lấy hoặc khởi tạo số lượt xem thực tế mô phỏng
        let storedReal = localStorage.getItem("np360_sim_real_views");
        let parsed = parseInt(storedReal, 10);
        if (!storedReal || isNaN(parsed)) {
            parsed = 8;
        }

        // Nếu là phiên truy cập mới -> tăng thêm 1
        if (!sessionStorage.getItem("np360_sim_session")) {
            sessionStorage.setItem("np360_sim_session", "1");
            parsed += 1;
            localStorage.setItem("np360_sim_real_views", parsed);
        }

        realTotalCount = parsed;
        currentTotal = BASE_VIEWS_OFFSET + realTotalCount;
        currentToday = realTotalCount;
        updateTotal(currentTotal);

        // Số người online: Tính theo khung giờ + số khách mô phỏng
        realOnlineCount = Math.floor(Math.random() * 3) + 1;
        updateOnline(computeCurrentOnline());

        // Định kỳ mỗi 20 giây mô phỏng biến thiên người xem tự nhiên (±1)
        setInterval(() => {
            const delta = Math.random() > 0.5 ? 1 : (Math.random() > 0.5 ? -1 : 0);
            realOnlineCount = Math.max(1, Math.min(4, realOnlineCount + delta));
            updateOnline(computeCurrentOnline());
        }, 20000);
    }

    /**
     * Cập nhật số người online với hiệu ứng động
     */
    function updateOnline(newCount) {
        if (!onlineEl) return;
        animateValue(onlineEl, currentOnline, newCount, 600);
        currentOnline = newCount;
        updatePopoverContent();
    }

    /**
     * Cập nhật tổng lượt xem với định dạng số Việt Nam
     */
    function updateTotal(newTotal) {
        if (!totalEl) return;
        animateValue(totalEl, currentTotal, newTotal, 900);
        currentTotal = newTotal;
        updatePopoverContent();
    }

    /**
     * Hiệu ứng chuyển số mượt mà (Easing)
     */
    function animateValue(el, start, end, duration) {
        if (start === end || isNaN(start) || isNaN(end)) {
            el.textContent = end.toLocaleString("vi-VN");
            return;
        }
        const startTime = performance.now();
        function frame(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * ease);
            el.textContent = current.toLocaleString("vi-VN");
            if (progress < 1) {
                requestAnimationFrame(frame);
            }
        }
        requestAnimationFrame(frame);
    }

    /**
     * Khởi tạo Popover chi tiết khi click vào Badge
     */
    function initPopover() {
        popoverEl = document.createElement("div");
        popoverEl.id = "visitor-popover";
        popoverEl.className = "visitor-popover hidden";
        document.body.appendChild(popoverEl);

        badgeEl.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePopover();
        });

        document.addEventListener("click", (e) => {
            if (popoverEl && !popoverEl.contains(e.target) && !badgeEl.contains(e.target)) {
                popoverEl.classList.add("hidden");
            }
        });
    }

    function togglePopover() {
        if (!popoverEl) return;
        const isHidden = popoverEl.classList.contains("hidden");
        if (isHidden) {
            updatePopoverContent();
            positionPopover();
            popoverEl.classList.remove("hidden");
        } else {
            popoverEl.classList.add("hidden");
        }
    }

    function positionPopover() {
        if (!popoverEl || !badgeEl) return;
        const rect = badgeEl.getBoundingClientRect();
        popoverEl.style.top = `${rect.bottom + 8}px`;
        popoverEl.style.right = `${window.innerWidth - rect.right}px`;
    }

    function updatePopoverContent() {
        if (!popoverEl) return;
        popoverEl.innerHTML = `
            <div class="popover-header">
                <div class="popover-title">
                    <i class="fa-solid fa-chart-line" style="color:var(--primary);"></i>
                    <span>Thống kê Tham quan</span>
                </div>
                <div class="popover-status status-live">
                    ● Trực tiếp
                </div>
            </div>
            <div class="popover-body">
                <div class="popover-row">
                    <span class="row-label"><i class="fa-solid fa-users" style="color:#10b981; width:16px;"></i> Đang tham quan:</span>
                    <strong class="row-value text-green">${currentOnline.toLocaleString("vi-VN")} người</strong>
                </div>
                <div class="popover-row">
                    <span class="row-label"><i class="fa-solid fa-calendar-day" style="color:#f59e0b; width:16px;"></i> Lượt xem hôm nay:</span>
                    <strong class="row-value">${(currentToday || 28).toLocaleString("vi-VN")}</strong>
                </div>
                <div class="popover-row">
                    <span class="row-label"><i class="fa-solid fa-eye" style="color:var(--primary); width:16px;"></i> Tổng lượt xem:</span>
                    <strong class="row-value text-primary">${currentTotal.toLocaleString("vi-VN")}</strong>
                </div>
            </div>
            <div class="popover-footer">
                Hệ thống dữ liệu thời gian thực
            </div>
        `;
    }

    window.addEventListener("resize", () => {
        if (popoverEl && !popoverEl.classList.contains("hidden")) {
            positionPopover();
        }
    });

})();
