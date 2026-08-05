# NINH PHƯỚC 360° — HỆ THỐNG TOUR THỰC TẾ ẢO VÀ BỘ BIÊN TẬP 360 INTERACTIVE

> **Phiên bản:** 2.2.0 (Cập nhật: 08/2026)  
> **Tác giả:** Viet Design  
> **Repository:** [https://github.com/hackervn89/ninhphuoc360](https://github.com/hackervn89/ninhphuoc360)  
> **Website Live (GitHub Pages):** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)  
> **Mục đích:** Tài liệu tổng quan toàn bộ dự án dành cho Đội ngũ phát triển (Developers), Người quản trị (Admins) và AI Agents.

---

## 📖 1. TỔNG QUAN DỰ ÁN

**Ninh Phước 360°** là hệ thống Web VR Tour thực tế ảo 360° cao cấp giới thiệu cảnh quan, văn hóa và di sản huyện Ninh Phước, tỉnh Ninh Thuận (Làng gốm Bàu Trúc, Tháp Po Klong Garai, Nhà sinh hoạt cộng đồng Chăm...).

Hệ thống được thiết kế theo mô hình **Tách biệt 2 tầng độc lập**:

1. **Trải nghiệm Người xem (Public Web Tour - `index.html`)**: Web tĩnh thuần HTML5/CSS3/JS + KrPano 360 Engine. Chạy siêu nhanh, tối ưu SEO, giao diện Glassmorphic hiện đại, tương thích 100% Mobile & VR Devices. **Hỗ trợ chạy tĩnh 100% trên GitHub Pages** nhờ cơ chế nạp dữ liệu địa điểm tĩnh (`tours/locations.json`) & bài thuyết minh tĩnh (`tours/infos.json`).
2. **Bộ biên tập Đồ họa Trực quan (Visual Editor - `_dev/editor.html` & `_dev/server.js`)**: Trình biên tập WYSIWYG chạy local/nội bộ qua NodeJS Express Server. Cho phép kéo thả hotspot, tạo multires tiles tự động, thêm/sửa/xóa cảnh, cân bằng đường chân trời (Horizon Leveling), quản lý bài viết thuyết minh WYSIWYG và đồng bộ mã KrPano XML tự động 100%.

---

## 🏗️ 2. KIẾN TRÚC HỆ THỐNG (MÔ HÌNH DỮ LIỆU TĨNH SẠCH - JAMSTACK)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🌐 LỚP 1: WEB FRONTEND (Public Tour - index.html / GitHub Pages)            │
│    ├── UI Glassmorphic Overlay (Logo, Menu Địa điểm, Thanh điều khiển)      │
│    ├── core/css/style.css (Design System, Responsive, Auto-wrap title)      │
│    └── core/js/app.js (Tự động nạp tours/locations.json, tours/infos.json) │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📜 LỚP 2: KRPANO 360 ENGINE & STATIC DATA SCHEMAS                           │
│    ├── tour.xml (Master XML: Định nghĩa Hotspots style: muiten, thongtin...)│
│    ├── tours/locations.json (Ánh xạ ID thư mục → Tên hiển thị Tiếng Việt)  │
│    ├── tours/infos.json (Lưu trữ danh sách bài viết thuyết minh thông tin)  │
│    └── tours/<dia_diem>/scenes.xml (Scene XML, view, image, prealign)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ LỚP 3: VISUAL EDITOR & NODEJS BACKEND SERVER (_dev/ - LOCAL ONLY)         │
│    ├── _dev/editor.html (WYSIWYG Editor: Prealign, Info Manager, Hotspots)  │
│    └── _dev/server.js (NodeJS Express REST API + KrPano CLI Tiling Engine)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 3. CÁC TÍNH NĂNG NỔI BẬT

### 📱 Giao diện Trải nghiệm (`index.html`)
- **Menu Địa điểm Phân cấp Tự động (Static Data Driven)**: Nạp phân nhóm từ `tours/locations.json` và đường dẫn ảnh `thumburl`, hiển thị chính xác 100% trên cả Localhost lẫn **GitHub Pages** mà không cần server backend.
- **Popup Thuyết minh Thông tin sinh động**: Đọc bài viết phong phú có định dạng HTML/CSS từ `tours/infos.json` khi click hotspot loại `thongtin`.
- **Tự động xuống dòng mềm mại**: Hiển thị tên địa điểm tiếng Việt đầy đủ 100% không bị cắt chữ. Tự động thu gọn khi click ra ngoài màn hình 360°.
- **Bản đồ Thu nhỏ Minimap (Leaflet)**: Hiển thị vị trí thực tế và hướng nhìn nón Radar xoay theo camera 360° theo thời gian thực.
- **Tương thích Đa thiết bị**: Hỗ trợ PC, Mobile, Máy tính bảng và Chế độ kính VR Headset.

### 🛠️ Bộ Biên Tập Visual Editor (`_dev/editor.html`)
- **Cân Bằng Đường Chân Trời (Prealign Horizon Leveling)**:
  - Cung cấp thanh trượt điều chỉnh **Roll (Nghiêng trái/phải)**, **Pitch (Ngẩng/Cúi)**, **Yaw (Xoay hướng)** mượt mà theo thời gian thực.
  - Tích hợp **Lưới chỉ la-ze xanh cyan (Grid Guidelines)** hiển thị đè trên ảnh 360° giúp soi căn chỉnh đường chân tường, mép bàn phẳng tuyệt đối.
  - Lưu trực tiếp mã ma trận xoay 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>` trong `scenes.xml`.
- **Hệ thống Quản Lý Bài Viết Thuyết Minh (Info Manager)**:
  - Khung soạn thảo WYSIWYG hiện đại trên nền trắng nét căng, hỗ trợ định dạng Heading (H1, H2, H3), danh sách, đổi màu chữ cơ bản (Đen, Đỏ, Vàng, Xanh lá, Xanh dương, Cam...).
  - Quản lý kho bài viết thuyết minh tập trung lưu tại `tours/infos.json`, tự động đồng bộ khi gán vào hotspot loại `thongtin`.
- **Xử lý Tiles Cân bằng Kích thước Thực tế (Exact Tile Dimension Engine)**:
  - Tự động bóc tách kích thước thực của các file tile mép (`l1=640px`, `l2=1280px`, `l3=2560px`, `l4=4864px`) triệt tiêu hoàn toàn viền đen ranh giới và hiện tượng hở 4 bức tường khi zoom.
- **Visual Hotspot Creator & Instantly Auto-Sync**:
  - Click chuột vào không gian 360° để đặt Hotspot mới (Mũi tên, Ghim vị trí, Trực thăng, Thuyết minh).
  - Tự động lưu và đồng bộ tức thì sang file XML khi xóa hotspot hoặc lưu thuộc tính.
- **Tùy biến Độ Zoom Linh Hoạt (Flexible FOV)**:
  - Tự do cấu hình FOV Min, FOV Max cho từng cảnh mà không bị giới hạn cứng.

---

## 🚀 4. HƯỚNG DẪN SỬ DỤNG VÀ CHẠY DỰ ÁN

### 🟢 1. Khởi động Editor Server (Local Development)
Mở Terminal tại thư mục dự án và chạy:
```powershell
node _dev/server.js
```
- **Địa chỉ Editor:** `http://localhost:3600/editor.html`
- **Địa chỉ Tour chính:** `http://localhost:3600/index.html`

### 🔵 2. Xem Tour công khai (Trang người dùng)
- **Truy cập Online (GitHub Pages):** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)
- **Chạy Local:** Mở trực tiếp liên kết `http://localhost:3600/index.html` hoặc chạy web server tĩnh: `npx serve .`

### 🔄 3. Đồng bộ & Cập nhật GitHub
Khi thực hiện chỉnh sửa code hoặc thêm cảnh mới, sử dụng các câu lệnh Git sau:
```powershell
git add .
git commit -m "Cập nhật tính năng Cân bằng đường chân trời và Info Manager"
git push
```
GitHub Pages sẽ tự động xây dựng và xuất bản phiên bản mới nhất sau ~1 phút.

### 📦 4. Bàn giao Dự án (Production Deployment)
Dự án được thiết kế hoàn hảo để bàn giao sản phẩm:
- **Tất cả dữ liệu Tour** được lưu tại root (`index.html`, `tour.xml`, `core/`, `engine/`, `tours/`).
- **Khi bàn giao cho khách hàng:** Bạn chỉ cần **XÓA THƯ MỤC `_dev/`** là xong! Toàn bộ website vẫn chạy 100% độc lập trên bất kỳ Hosting/Web Server nào (Nginx, Apache, GitHub Pages, Netlify, Vercel...).

---

## ⚠️ 5. CÁC LƯU Ý KỸ THUẬT QUAN TRỌNG

1. **Cơ chế Dữ liệu Tĩnh cho Tour**: `core/js/app.js` tự động đọc `tours/locations.json` và `tours/infos.json` tĩnh. Không bắt buộc phải có Node.js backend để hiển thị menu hoặc bài thuyết minh.
2. **Thuộc tính `prealign` trong KrPano**: Luôn giữ cú pháp `prealign="Pitch|Yaw|Roll"`. Khi thay đổi qua JS, cần gọi `updateobject(true, true)` để nạp lại ma trận WebGL.
3. **Kích thước Tile Level**: `tiledimagewidth` trong `<level>` phải khớp chính xác tổng pixel tile (`(cols-1)*512 + lastTileWidth`) để tránh bị khoảng đen ranh giới.
4. **Không đặt `maxpixelzoom` hạn chế**: Để `fovmin` và `fovmax` quản lý góc nhìn tự nhiên.
5. **Smart Preload bị tắt vĩnh viễn**: Không gọi `loadscene(..., PRELOAD)` vì bản KrPano 1.19 có lỗi tự động nhảy scene ngầm.
