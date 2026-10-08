/**
 * CẤU HÌNH FIREBASE REALTIME DATABASE — NINH PHƯỚC 360
 * ============================================================================
 * Hướng dẫn 3 bước kích hoạt bộ đếm thời gian thực đồng bộ toàn cầu:
 * 1. Truy cập https://console.firebase.google.com và tạo 1 Project (vd: ninhphuoc360)
 * 2. Vào Build -> Realtime Database -> Bấm "Create Database" -> Chọn Singapore (asia-southeast1)
 * 3. Vào Project Settings (biểu tượng bánh răng) -> Copy các thông số dán vào bên dưới:
 * 
 * Xem tài liệu chi tiết tại: FIREBASE_COUNTER_GUIDE.md
 * ============================================================================
 */

export const firebaseConfig = {
    apiKey: "AIzaSyAgGBtxnNAtWV45tUN5-3Tv6WQDfOTv0rc",
    databaseURL: "https://ninhphuoc360-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ninhphuoc360"
};
