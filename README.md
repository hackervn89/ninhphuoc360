# NINH PHƯỚC 360° — HỆ THỐNG TOUR THỰC TẾ ẢO VÀ BỘ BIÊN TẬP 360 INTERACTIVE

> **Phiên bản:** 2.4.0 (Cập nhật: 09/2026)  
> **Tác giả:** Viet Design  
> **Repository:** [https://github.com/hackervn89/ninhphuoc360](https://github.com/hackervn89/ninhphuoc360)  
> **Website Live (GitHub Pages):** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)  
> **Mục đích:** Tài liệu tổng quan toàn bộ dự án dành cho Đội ngũ phát triển (Developers), Người quản trị (Admins) và AI Agents.

---

## 📖 1. TỔNG QUAN DỰ ÁN

**Ninh Phước 360°** là hệ thống Web VR Tour thực tế ảo 360° cao cấp giới thiệu cảnh quan, văn hóa và di sản huyện Ninh Phước, tỉnh Ninh Thuận (Làng gốm Bàu Trúc, Nhà sinh hoạt cộng đồng Chăm, HTX Gốm Chăm, Bia tưởng niệm làng Vạn Phước, Nhà tưởng niệm đồng chí Trần Thi, Đình làng Vạn Phước...).

Hệ thống được thiết kế theo mô hình **Tách biệt 2 tầng độc lập**:

1. **Trải nghiệm Người xem (Public Web Tour - `index.html`)**: Web tĩnh thuần HTML5/CSS3/JS + KrPano 360 Engine + Leaflet Google Maps Module (`gl=VN` chuẩn chủ quyền Hoàng Sa & Trường Sa). Chạy siêu nhanh, tối ưu SEO, giao diện White Glassmorphism & Red Accent hiện đại, tương thích 100% Mobile & VR Devices. **Hỗ trợ chạy tĩnh 100% trên GitHub Pages** nhờ cơ chế nạp dữ liệu địa điểm tĩnh (`tours/locations.json`), ranh giới GeoJSON (`core/data/ninhphuoc-boundary.json`) & bài thuyết minh tĩnh (`tours/infos.json`).
2. **Bộ biên tập Đồ họa Trực quan (Visual Editor - `_dev/editor.html` & `_dev/server.js`)**: Trình biên tập WYSIWYG chạy local/nội bộ qua NodeJS Express Server. Cho phép quản lý tọa độ GPS phân cấp, đặt hotspot liên kết 2 chiều trực quan (Visual Return Hotspot Placement), quản lý góc nhìn mặc định & camera thời gian thực, kéo thả hotspot, tạo multires tiles tự động, thêm/sửa/xóa/sắp xếp cảnh, cân bằng đường chân trời (Horizon Leveling), quản lý bài viết thuyết minh WYSIWYG và đồng bộ mã KrPano XML tự động 100%.

---

## 🏗️ 2. KIẾN TRÚC HỆ THỐNG (MÔ HÌNH DỮ LIỆU TĨNH SẠCH - JAMSTACK)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🌐 LỚP 1: WEB FRONTEND (Public Tour - index.html / GitHub Pages)            │
│    ├── UI Glassmorphic White & Red (Logo, Menu Địa điểm, Thanh điều khiển)  │
│    ├── Google Maps Minimap Module (Leaflet + Google Tile gl=VN, Radar FOV)  │
│    ├── core/css/style.css (Design System, White Glass & Red, Responsive)   │
│    ├── core/data/ninhphuoc-boundary.json (GeoJSON ranh giới hành chính Xã)  │
│    └── core/js/app.js (Tự động nạp locations.json, infos.json, boundary)    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📜 LỚP 2: KRPANO 360 ENGINE & STATIC DATA SCHEMAS                           │
│    ├── tour.xml (Master XML: Styles hotspot, includes, native draghotspot)  │
│    ├── tours/locations.json (Ánh xạ ID thư mục → Tên hiển thị + GPS {lat,lng})│
│    ├── tours/infos.json (Lưu trữ danh sách bài viết thuyết minh thông tin)  │
│    └── tours/<dia_diem>/scenes.xml (Scene XML, view, image, lat/lng riêng)  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ LỚP 3: VISUAL EDITOR & NODEJS BACKEND SERVER (_dev/ - LOCAL ONLY)         │
│    ├── _dev/editor.html (2-Tab GUI: Return Hotspots, Default View, Prealign)│
│    └── _dev/server.js (Express REST API, Return Hotspot Gen, Tiling Engine) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🌟 3. CÁC TÍNH NĂNG NỔI BẬT

### 📱 Giao diện Trải nghiệm (`index.html`)
- **Bản Đồ Google Maps Tương Tác 2 Chiều (Chuẩn Chủ Quyền Quốc Gia)**:
  - Sử dụng tham số máy chủ Google Maps `gl=VN` & `hl=vi` hiển thị rõ nét, đầy đủ **Quần đảo Hoàng Sa & Trường Sa**.
  - **100% Miễn phí**: Không cần API Key, không cần thẻ tín dụng, hoạt động độc lập trên GitHub Pages.
  - **Nón quét Radar**: Xoay thời gian thực theo góc nhìn camera 360° (`view.hlookat`).
  - **Đường viền ranh giới xã Ninh Phước**: Đọc file GeoJSON hiển thị đường viền đỏ đậm sắc nét, tự động `fitBounds` vừa vặn màn hình lớn khi phóng to (`zoomSnap: 0.1`).
  - **Marker Phát Sáng & Popup Card**: Hiển thị ảnh thumbnail xem trước, nút "Xem 360°" và nút "Chỉ đường" (Google Directions) dẫn đường trên điện thoại.
  - **Chuyển đổi 2 Lớp Bản Đồ**: Hỗ trợ chế độ Bản đồ Đường sá (Roadmap) và Bản đồ Vệ tinh (Hybrid Satellite).
- **Hệ Thống Tọa Độ GPS Phân Cấp (Hierarchical GPS System)**:
  - Hỗ trợ tọa độ GPS cấp Địa điểm (dùng chung) và tọa độ GPS riêng cho từng Cảnh (nếu các cảnh cách xa nhau).
  - Tự động di chuyển tâm bản đồ và nón radar bám sát vị trí thực tế của từng bức ảnh.
- **Menu Địa điểm Phân cấp Tự động (Static Data Driven)**: Nạp phân nhóm từ `tours/locations.json` và đường dẫn ảnh `thumburl`, hiển thị chính xác 100% trên cả Localhost lẫn **GitHub Pages** mà không cần server backend.
- **Popup Thuyết minh Thông tin sinh động**: Đọc bài viết phong phú có định dạng HTML/CSS từ `tours/infos.json` khi click hotspot loại `thongtin`.
- **Tự động xuống dòng mềm mại**: Hiển thị tên địa điểm tiếng Việt đầy đủ 100% không bị cắt chữ. Tự động thu gọn khi click ra ngoài màn hình 360°.
- **Tương thích Đa thiết bị**: Hỗ trợ PC, Mobile, Máy tính bảng và Chế độ kính VR Headset.

### 🛠️ Bộ Biên Tập Visual Editor (`_dev/editor.html`)
- **Đặt Hotspot Liên Kết 2 Chiều Trực Quan (Visual Bi-directional Return Hotspot Placement)**:
  - Khi liên kết Cảnh A $\rightarrow$ Cảnh B, hệ thống tự động lưu hotspot ở Cảnh A, chuyển camera sang Cảnh B và cắm sẵn con ghim điều hướng xem trước kèm nhãn nổi `"QUAY VỀ CẢNH A"`.
  - Người biên tập có thể **kéo thả ghim** hoặc **nhấp chuột trực tiếp lên vị trí bất kỳ** trên canvas 360° để đặt điểm quay về chính xác nhất.
  - Camera tự động lia mượt mà hướng vào con ghim vừa đặt.
  - Khi bấm "Xác nhận đặt Hotspot này": Server tự động ghi hotspot quay về vào `scenes.xml` của Cảnh B qua API `/api/scenes/create-return-hotspot` và đưa camera quay lại Cảnh A an toàn với danh sách hotspot Cảnh A được bảo toàn nguyên vẹn.
- **Quản Lý Góc Nhìn Mặc Định & Camera Toàn Diện (Default View Angle Manager)**:
  - Khắc phục triệt để lỗi camera bị reset về `(0, 0)` khi vào Editor (nhờ loại bỏ `loadxml MERGE` và sử dụng action `draghotspot` chuẩn).
  - Tab 2 hiển thị song song: **Góc nhìn mặc định đã lưu** (đọc từ thẻ `<view>`) và **Góc nhìn hiện tại của camera** (realtime tracking).
  - Nút "Quay về góc nhìn mặc định" (xoay mượt mà `lookto`), nút "Đặt góc nhìn hiện tại làm mặc định" (`POST /api/scenes/view`), gán FOV Min/Max nhanh theo mức zoom hiện tại.
  - Click vào cảnh đang xem trên sidebar sẽ tự động lia camera về đúng góc nhìn mặc định đã lưu.
- **Giao Diện Biên Tập Hiện Đại & Tối Ưu (2-Tab GUI, Resizer & Quick Toolbar)**:
  - Sidebar phải chia 2 Tab độc lập: **Tab 1: HOTSPOTS** (quản lý danh sách, thuộc tính, đa giác) và **Tab 2: GÓC NHÌN & CÂN BẰNG** (quản lý view, zoom, cân bằng đường chân trời).
  - **Sidebar Resizer**: Kéo mép thanh bên trái để tùy chỉnh độ rộng linh hoạt, tự động lưu vào `localStorage`. Double-click để reset về độ rộng mặc định.
  - **Mini Quick-Toolbar**: Thanh công cụ nổi mini hiển thị ngay trên canvas cạnh hotspot đang chọn giúp thao tác xóa nhanh hoặc đổi loại icon tức thì.
  - **Tối ưu hiển thị tiêu đề dài**: Bổ sung ellipsis và tooltip hiển thị đầy đủ tiêu đề, các nút thao tác không bị dồn ép hay vỡ layout.
- **Quản Lý Tọa Độ GPS Trực Quan (GPS Manager Modal)**:
  - Cài đặt tọa độ GPS cho từng Địa điểm (nút 📍) hoặc riêng cho từng Cảnh (nút 🎯).
  - Nhập nhanh từ Google Maps, hỗ trợ xóa tọa độ riêng để quay về dùng chung bất cứ lúc nào.
- **Sắp Xếp Lại Thứ Tự Cảnh (Reorder Scenes)**:
  - Cung cấp nút **Lên ↑** và **Xuống ↓** cùng tính năng kéo thả trực quan trên danh sách cảnh.
  - Cập nhật trực tiếp và sắp xếp lại các khối `<scene>` trong file `scenes.xml`.
- **Cân Bằng Đường Chân Trời (Prealign Horizon Leveling)**:
  - Cung cấp thanh trượt điều chỉnh **Roll (Nghiêng trái/phải)**, **Pitch (Ngẩng/Cúi)**, **Yaw (Xoay hướng)** mượt mà theo thời gian thực.
  - Tích hợp **Lưới chỉ la-ze xanh cyan (Grid Guidelines)** hiển thị đè trên ảnh 360° giúp soi căn chỉnh đường chân tường, mép bàn phẳng tuyệt đối.
  - Lưu trực tiếp mã ma trận xoay 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>` trong `scenes.xml`.
- **Hệ thống Quản Lý Bài Viết Thuyết Minh (Info Manager)**:
  - Khung soạn thảo WYSIWYG hiện đại trên nền trắng nét căng, hỗ trợ định dạng Heading (H1, H2, H3), danh sách, đổi màu chữ cơ bản.
  - Quản lý kho bài viết thuyết minh tập trung lưu tại `tours/infos.json`, tự động đồng bộ khi gán vào hotspot loại `thongtin`.
- **Xử lý Tiles Cân bằng Kích thước Thực tế (Exact Tile Dimension Engine)**:
  - Tự động bóc tách kích thước thực của các file tile mép (`l1=640px`, `l2=1280px`, `l3=2560px`, `l4=4864px`) triệt tiêu hoàn toàn viền đen ranh giới và hiện tượng hở 4 bức tường khi zoom.
- **Action Kéo Thả Hotspot Native Chuẩn (`tour.xml`)**:
  - Nhúng action `draghotspot` chuẩn vào `tour.xml`, giúp việc kéo thả định vị hotspot chạy trơn tru, không phụ thuộc vào việc nạp lại XML bằng `loadxml`.

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
git commit -m "Cập nhật tính năng Visual Return Hotspots, Default View Manager và UI Editor v2.4.0"
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
2. **Khắc phục lỗi reset góc nhìn (0,0)**: Tuyệt đối không gọi `loadxml(..., null, MERGE)` trong trình Editor vì KrPano sẽ ghi đè thiết lập `<view>` của scene bằng góc nhìn mặc định toàn cục `(0,0)`. Luôn sử dụng cơ chế `krpanoObj.set("action[...].content", ...)` và nạp sẵn action trong `tour.xml`.
3. **Thuộc tính `prealign` trong KrPano**: Luôn giữ cú pháp `prealign="Pitch|Yaw|Roll"`. Khi thay đổi qua JS, cần gọi `updateobject(true, true)` để nạp lại ma trận WebGL.
4. **Kích thước Tile Level**: `tiledimagewidth` trong `<level>` phải khớp chính xác tổng pixel tile (`(cols-1)*512 + lastTileWidth`) để tránh bị khoảng đen ranh giới.
5. **Smart Preload bị tắt vĩnh viễn**: Không gọi `loadscene(..., PRELOAD)` vì bản KrPano 1.19 có lỗi tự động nhảy scene ngầm.
