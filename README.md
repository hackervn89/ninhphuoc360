# NINH PHƯỚC 360° — HỆ THỐNG TOUR THỰC TẾ ẢO VÀ BỘ BIÊN TẬP 360 INTERACTIVE

> **Phiên bản:** 2.1.0 (Cập nhật: 07/2026)  
> **Tác giả:** Viet Design  
> **Repository:** [https://github.com/hackervn89/ninhphuoc360](https://github.com/hackervn89/ninhphuoc360)  
> **Website Live (GitHub Pages):** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)  
> **Mục đích:** Tài liệu tổng quan toàn bộ dự án dành cho Đội ngũ phát triển (Developers), Người quản trị (Admins) và AI Agents.

---

## 📖 1. TỔNG QUAN DỰ ÁN

**Ninh Phước 360°** là hệ thống Web VR Tour thực tế ảo 360° cao cấp giới thiệu cảnh quan, văn hóa và di sản huyện Ninh Phước, tỉnh Ninh Thuận (Làng gốm Bàu Trúc, Tháp Po Klong Garai, Nhà sinh hoạt cộng đồng Chăm...).

Hệ thống được thiết kế theo mô hình **Tách biệt 2 tầng độc lập**:

1. **Trải nghiệm Người xem (Public Web Tour - `index.html`)**: Web tĩnh thuần HTML5/CSS3/JS + KrPano 360 Engine. Chạy siêu nhanh, tối ưu SEO, giao diện Glassmorphic hiện đại, tương thích 100% Mobile & VR Devices. **Hỗ trợ chạy tĩnh 100% trên GitHub Pages** nhờ cơ chế nạp dữ liệu địa điểm tĩnh (`tours/locations.json`).
2. **Bộ biên tập Đồ họa Trực quan (Visual Editor - `_dev/editor.html` & `_dev/server.js`)**: Trình biên tập WYSIWYG chạy local/nội bộ qua NodeJS Express Server. Cho phép kéo thả hotspot, tạo multires tiles tự động, thêm/sửa/xóa cảnh, kéo thả di chuyển địa điểm và xuất mã KrPano XML tự động 100%.

---

## 🏗️ 2. KIẾN TRÚC HỆ THỐNG (MÔ HÌNH DỮ LIỆU TĨNH SẠCH - JAMSTACK)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🌐 LỚP 1: WEB FRONTEND (Public Tour - index.html / GitHub Pages)            │
│    ├── UI Glassmorphic Overlay (Logo, Menu Địa điểm, Thanh điều khiển)      │
│    ├── core/css/style.css (Design System, Responsive, Auto-wrap title)      │
│    └── core/js/app.js (Tự động nạp tours/locations.json + Leaflet Minimap) │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📜 LỚP 2: KRPANO 360 ENGINE & STATIC DATA SCHEMAS                           │
│    ├── tour.xml (Master XML: Định nghĩa Hotspots style: muiten, vitri...)   │
│    ├── tours/locations.json (Ánh xạ ID thư mục → Tên hiển thị Tiếng Việt)  │
│    └── tours/<dia_diem>/scenes.xml (Scene XML, view, image, hotspots)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ LỚP 3: VISUAL EDITOR & NODEJS BACKEND SERVER (_dev/ - LOCAL ONLY)         │
│    ├── _dev/editor.html (WYSIWYG Editor: Drag Hotspot, Tree View, Drag Drop)│
│    └── _dev/server.js (NodeJS Express API + KrPano CLI Makepano Tiling)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 3. CÁC TÍNH NĂNG NỔI BẬT

### 📱 Giao diện Trải nghiệm (`index.html`)
- **Menu Địa điểm Phân cấp Tự động (Static Data Driven)**: Nạp phân nhóm từ `tours/locations.json` và đường dẫn ảnh `thumburl`, hiển thị chính xác 100% trên cả Localhost lẫn **GitHub Pages** mà không cần server backend.
- **Tự động xuống dòng mềm mại**: Hiển thị tên địa điểm tiếng Việt đầy đủ 100% không bị cắt chữ. Tự động thu gọn khi click ra ngoài màn hình 360°.
- **Bản đồ Thu nhỏ Minimap (Leaflet)**: Hiển thị vị trí thực tế và hướng nhìn nón Radar xoay theo camera 360° theo thời gian thực.
- **Tương thích Đa thiết bị**: Hỗ trợ PC, Mobile, Máy tính bảng và Chế độ kính VR Headset.

### 🛠️ Bộ Biên Tập Visual Editor (`_dev/editor.html`)
- **Thư mục Cây Phân cấp (Hierarchical Tree View)**: Hiển thị các Địa điểm thành từng Thư mục dạng cây (Accordion), kèm biểu tượng, số lượng cảnh và nút thao tác.
- **Kéo Thả Di chuyển Cảnh (Drag & Drop Scene Relocation)**: Nhấn giữ biểu tượng ⠿ và kéo thả cảnh từ địa điểm này sang địa điểm khác. Hệ thống tự động di chuyển đĩa cứng, XML và dọn dẹp `tour.xml`.
- **Upload Ảnh 360° Hàng loạt & Tự động Cắt Tiles (Batch Multi-Resolution Tiling)**: Chọn nhiều ảnh Panorama (`.jpg`, `.png`), chọn hoặc nhập tên Địa điểm đích -> Server tự động chạy `krpanotools` tạo ảnh cắt nhỏ tiles 4 cấp độ phân giải (`l1`, `l2`, `l3`, `l4`) siêu nét.
- **Visual Hotspot Creator (Kéo thả Hotspot)**: Click chuột vào không gian 360° để đặt Hotspot mới (Mũi tên, Ghim vị trí, Trực thăng, Thuyết minh). Nhấn giữ kéo rê Hotspot trên màn hình để cập nhật tọa độ `ath`, `atv` realtime.
- **Lưu Khung Nhìn Mặc Định (Save Default View)**: Xoay camera đến góc nhìn mong muốn -> Nhấn "LƯU GÓC NHÌN MẶC ĐỊNH", tự động cập nhật thẻ `<view hlookat="..." vlookat="..." fov="..." />` vào `scenes.xml`.
- **Đổi tên & Xóa Cảnh / Địa điểm An toàn**: Đổi tên hiển thị mà không gãy đường dẫn. Xóa cảnh tự động xóa file tiles trên đĩa cứng và dọn dẹp dòng `<include>` trong `tour.xml`.

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
git commit -m "Mô tả thay đổi của bạn"
git push
```
GitHub Pages sẽ tự động xây dựng và xuất bản phiên bản mới nhất sau ~1 phút.

### 📦 4. Bàn giao Dự án (Production Deployment)
Dự án được thiết kế hoàn hảo để bàn giao sản phẩm:
- **Tất cả dữ liệu Tour** được lưu tại root (`index.html`, `tour.xml`, `core/`, `engine/`, `tours/`).
- **Khi bàn giao cho khách hàng:** Bạn chỉ cần **XÓA THƯ MỤC `_dev/`** là xong! Toàn bộ website vẫn chạy 100% độc lập trên bất kỳ Hosting/Web Server nào (Nginx, Apache, GitHub Pages, Netlify, Vercel...).

---

## 🛠️ 5. QUY TRÌNH SỬA CODE VÀ NÂNG CẤP

### 🎨 Thêm Loại Hotspot Style Mới
1. Mở `tour.xml`, thêm đoạn thẻ `<style name="ten_style_moi" url="..." />`.
2. Mở `_dev/editor.html`, thêm thẻ `<option value="ten_style_moi">` vào dropdown `#hs-style`.
3. Mở `core/js/app.js` nếu muốn bổ sung xử lý sự kiện click riêng.

### 📍 Đổi tên Địa điểm hiển thị
- **Cách 1:** Mở `http://localhost:3600/editor.html`, bấm biểu tượng chiếc bút ✏️ bên cạnh tên Địa điểm để đổi tên trực tiếp.
- **Cách 2:** Mở file `tours/locations.json`, chỉnh sửa cặp giá trị `"ma_thu_muc": "Tên Hiển Thị Mới"`.

### 🔄 Di chuyển Cảnh từ Địa điểm này sang Địa điểm khác
- **Cách 1:** Mở `editor.html`, nhấn giữ biểu tượng ⠿ cạnh cảnh và Kéo Thả vào Thư mục Địa điểm mong muốn.
- **Cách 2:** Bấm nút chuyển đổi ↔ trên thẻ cảnh, chọn số thứ tự địa điểm đích.

---

## ⚠️ 6. CÁC LƯU Ý KỸ THUẬT QUAN TRỌNG

1. **Cơ chế Dữ liệu Tĩnh cho Menu Địa điểm**: `core/js/app.js` tự động đọc `tours/locations.json` tĩnh và bóc tách ID địa điểm từ `thumburl`. Không bắt buộc phải có Node.js backend để hiển thị phân nhóm menu.
2. **Case-Sensitivity (Phân biệt chữ hoa/thường)**: Mã ID của Scene (`scene_xxx`) và Hotspot (`hs_xxx`) cũng như tên ảnh tile trên Linux (GitHub Pages) phải viết nhất quán, chính xác 100%.
3. **Không đặt Hotspot trong thẻ `<image>`**: Mã XML chuẩn của KrPano yêu cầu thẻ `<hotspot>` phải nằm ngoài thẻ `<image>` và nằm trực tiếp trong `<scene>`.
4. **Smart Preload bị tắt vĩnh viễn**: Không gọi `loadscene(..., PRELOAD)` vì bản KrPano 1.19 có lỗi tự động nhảy scene ngầm.
5. **Dọn dẹp Tour XML**: Khi một địa điểm không còn cảnh nào, hệ thống sẽ tự động gỡ thẻ `<include url="tours/x/scenes.xml" />` khỏi `tour.xml` để tránh lỗi `404 Fatal Error: loading failed!`.
