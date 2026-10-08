# 🟢 HƯỚNG DẪN KÍCH HOẠT BỘ ĐẾM KHÁCH THAM QUAN THỜI GIAN THỰC (FIREBASE)

Tài liệu hướng dẫn kết nối **Google Firebase Realtime Database** để bộ đếm khách tham quan của **Ninh Phước 360°** hoạt động thời gian thực trên toàn cầu (hoàn toàn **miễn phí 100%**, không cần thẻ tín dụng).

---

## ⚡ TẠI SAO DÙNG FIREBASE CHO WEB TĨNH GITHUB PAGES?

1. **Chuẩn W3C Presence**: Tự động nhận diện khi người dùng đóng tab trình duyệt qua hàm `onDisconnect()` để trừ số người online tức thì.
2. **Realtime Websocket**: Tự nhảy số ngay khi có khách mới vào tham quan mà không cần F5 tải lại trang.
3. **Miễn phí trọn đời (Gói Spark)**: Hỗ trợ tới **100 người dùng online cùng một lúc**, 1GB dung lượng lưu trữ (bộ đếm chỉ dùng vài KB) và 10GB băng thông/tháng — quá thừa cho website du lịch địa phương.

---

## 🚀 3 BƯỚC THIẾT LẬP (MẤT CHƯA ĐẦY 3 PHÚT)

### 📌 BƯỚC 1: Tạo dự án Firebase

1. Truy cập [Firebase Console](https://console.firebase.google.com/) và đăng nhập bằng tài khoản Google của bạn.
2. Bấm **Add project** (Tạo dự án mới).
3. Đặt tên dự án: ví dụ `ninhphuoc360`.
4. Mục *Google Analytics*: Có thể Bật hoặc Tắt (Tùy chọn) $\rightarrow$ Bấm **Create project** $\rightarrow$ Chờ vài giây rồi bấm **Continue**.

---

### 📌 BƯỚC 2: Tạo Realtime Database

1. Ở thanh menu bên trái, tìm mục **Build** $\rightarrow$ chọn **Realtime Database**.
2. Bấm nút **Create Database**.
3. **Chọn vị trí Database (Location)**: 
   - Khuyên chọn: `Singapore (asia-southeast1)` để có tốc độ truy xuất nhanh nhất tại Việt Nam.
4. **Chọn chế độ bảo mật (Security Rules)**:
   - Chọn **Start in test mode** $\rightarrow$ Bấm **Enable**.
5. Sau khi database được tạo, chuyển sang tab **Rules** và dán đoạn mã phân quyền chuẩn sau đây:

```json
{
  "rules": {
    "presence": {
      ".read": true,
      "$uid": {
        ".write": true
      }
    },
    "stats": {
      ".read": true,
      "total_views": {
        ".write": true
      },
      "daily_views": {
        ".write": true
      }
    }
  }
}
```
6. Bấm nút **Publish** để lưu cấu hình phân quyền.

---

### 📌 BƯỚC 3: Lấy thông tin cấu hình và dán vào dự án

1. Tại góc trên bên trái màn hình Firebase Console, bấm vào biểu tượng bánh răng ⚙️ (bên cạnh Project Overview) $\rightarrow$ chọn **Project settings**.
2. Cuộn xuống mục **Your apps**, bấm vào biểu tượng Web `</>` (HTML/JS).
3. Đặt tên App nickname: `ninhphuoc360-web` $\rightarrow$ Bấm **Register app**.
4. Bạn sẽ thấy một đoạn mã `firebaseConfig` dạng:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxx",
  authDomain: "ninhphuoc360.firebaseapp.com",
  databaseURL: "https://ninhphuoc360-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ninhphuoc360",
  storageBucket: "ninhphuoc360.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

5. Mở tệp tin `core/js/firebase-config.js` trong thư mục dự án và dán các thông số của bạn vào:

```javascript
export const firebaseConfig = {
    apiKey: "AIzaSyD-xxxxxxxxxxxxxxxxxxxxx",
    databaseURL: "https://ninhphuoc360-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ninhphuoc360"
};
```

6. Lưu tệp tin lại $\rightarrow$ Xong!

---

## 🎯 CÁCH KIỂM TRA BỘ ĐẾM HOẠT ĐỘNG

1. Mở website trên 2 trình duyệt khác nhau (hoặc 1 tab thường và 1 tab ẩn danh):
   - Số **đang xem** sẽ nhảy ngay lập tức thành `2 đang xem`.
   - Khi đóng 1 tab $\rightarrow$ số lập tức giảm về `1 đang xem`.
2. Bấm trực tiếp vào huy hiệu (Badge) bộ đếm góc trên bên phải:
   - Hiển thị bảng chi tiết:
     - 🟢 Số khách đang trực tuyến
     - 📅 Lượt xem hôm nay
     - 👁️ Tổng lượt xem tích lũy
     - Trạng thái `● Live Cloud` xác nhận đang kết nối trực tiếp với Firebase.

> [!TIP]
> **Chế độ Demo thông minh:** Nếu bạn chưa kịp tạo Firebase, hệ thống vẫn tự động chạy ở chế độ Demo mô phỏng sinh động (hiển thị trạng thái `● Demo`), đảm bảo giao diện luôn mượt mà và không bao giờ xuất hiện lỗi gián đoạn trải nghiệm người dùng!
