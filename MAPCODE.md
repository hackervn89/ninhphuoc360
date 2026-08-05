# BẢN ĐỒ MÃ NGUỒN CHI TIẾT (MAPCODE) — DỰ ÁN NINH PHƯỚC 360°

> **Cập nhật:** 08/2026 (Phiên bản 2.2.0)  
> **Dành cho:** AI Agents, Lập trình viên, Team Lead.  
> **Repository:** [https://github.com/hackervn89/ninhphuoc360](https://github.com/hackervn89/ninhphuoc360)  
> **Website Live:** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)  
> **Mục đích:** Tra cứu chính xác vị trí dòng code, cấu trúc file, sơ đồ API và luồng dữ liệu mà KHÔNG CẦN đọc lại toàn bộ mã nguồn.

---

## 📂 1. CẤU TRÚC TỆP TIN & THƯ MỤC CHI TIẾT

```
e:\Viet Design\Ninhphuoc360\
├── index.html                           # [PUBLIC UI] Giao diện tour chính cho người dùng
├── tour.xml                             # [MASTER XML] Cấu hình master KrPano, styles hotspot, includes
├── .gitignore                           # [GIT] Cấu hình bỏ qua node_modules, temp, binaries nặng
├── README.md                            # [DOCS] Hướng dẫn tổng quan dự án & cách vận hành
├── MAPCODE.md                           # [DOCS] Bản đồ mã nguồn chi tiết (Tệp tin này)
├── robots.txt                           # [SEO] Cấu hình Robot Search Engine
├── sitemap.xml                          # [SEO] Sơ đồ trang web
│
├── core/                                # [ASSETS & LOGIC PUBLIC TOUR]
│   ├── css/
│   │   └── style.css                    # CSS toàn bộ giao diện public tour (Glassmorphic, Responsive)
│   ├── js/
│   │   └── app.js                       # Logic JS public tour (Static locations.json, infos.json, Leaflet map)
│   ├── assets/                          # Favicon, og-preview.png, logo icon, SVG markers
│   └── data/                            # GeoJSON ranh giới bản đồ
│
├── engine/                              # [KRPANO BINARY ENGINE]
│   ├── tour.js                          # Trình phát KrPano HTML5 Viewer Core (KHÔNG SỬA)
│   ├── tour.swf                          # Flash fallback (legacy)
│   └── plugins/                         # WebVR, gyro2, scroll, sound-interface plugins
│
├── tours/                               # [DỮ LIỆU CÁC ĐỊA ĐIỂM / SCENES & INFOS]
│   ├── locations.json                   # [STATIC DATA] Ánh xạ ID thư mục → Tên hiển thị tiếng Việt
│   ├── infos.json                       # [STATIC DATA] Cơ sở dữ liệu bài viết thuyết minh (HTML/CSS)
│   ├── lang_gom/                        # Địa điểm: Làng Gốm Bàu Trúc
│   │   ├── scenes.xml                   # Thẻ <scene> của các cảnh thuộc Làng Gốm
│   │   └── panos/                       # Ảnh multi-resolution tiles (.tiles/ preview, thumb)
│   ├── nha_sinh_hoat/                   # Địa điểm: Nhà sinh hoạt cộng đồng Chăm
│   │   ├── scenes.xml
│   │   └── panos/
│   └── <ten_dia_diem>/                  # Các địa điểm di tích/du lịch khác...
│
└── _dev/                                # [LOCAL VISUAL EDITOR TOOLING - BÀN GIAO CÓ THỂ XÓA]
    ├── server.js                        # Express Server (REST API, Prealign API, Info API, Makepano Tiling)
    ├── editor.html                      # WYSIWYG Editor GUI (Hotspot Drag, Horizon Leveling, Info Manager)
    └── krpano-tools/                    # KrPano CLI Executable & Templates (Loại trừ khỏi Git)
        ├── krpanotools64.exe            # Executable cắt tiles tự động
        └── templates/
            ├── krpano-editor.config     # Config CLI template với %BASENAME% chống đè file
            └── basicsettings.config     # Thiết lập tiling căn bản (tilesize=512, multires)
```

---

## 🗺️ 2. BẢN ĐỒ CHI TIẾT DÒNG CODE TRONG CÁC FILE CHÍNH

### 📜 A. `_dev/server.js` (Express Server & REST API — ~1286 dòng)

| Khoảng dòng | Tên Hàm / Khối | Chức năng & Luồng xử lý |
|-------------|----------------|--------------------------|
| `L1 - L45`  | `Imports & Setup` | Import `express`, `fs`, `path`, `multer`, `child_process`. Cấu hình cổng `3600`. |
| `L47 - L80` | `sanitizeTourXmlIncludes()` | Tự động quét `tour.xml` khi khởi động server, xóa các dòng `<include>` rỗng. |
| `L177 - L205` | `GET /api/locations` | Đọc `tours/locations.json` và trả về danh sách địa điểm. |
| `L282 - L337` | `POST /api/upload-pano-multi` | **Upload Panorama Hàng loạt**: Gom file vào đúng thư mục Địa điểm chỉ định và cắt tiles. |
| `L712 - L750` | `runKrPanoTiling()` | Thực thi `krpanotools64.exe makepano` tạo tiles 4 cấp độ. |
| `L755 - L850` | `fixScenesXml()` & `getJpgWidth()` | Bóc tách chính xác độ rộng tile mép (`l1=640`, `l2=1280`, `l3=2560`, `l4=4864`), triệt tiêu khoảng đen ranh giới. |
| `L852 - L930` | `GET/POST /api/infos` | API Quản lý kho bài viết thuyết minh (`tours/infos.json`). |
| `L935 - L1040`| `POST /api/scenes/save` | **Lưu Hotspots**: Dọn dẹp hotspot cũ bằng Regex đa dòng, lưu hotspot mới vào `scenes.xml`. |
| `L1045 - L1130`| `POST /api/scenes/view` | **Lưu View Mặc Định**: Lưu thẻ `<view fovtype="MFOV" hlookat="..." vlookat="..." fov="..." fovmin="..." fovmax="..." />`. |
| `L1135 - L1215`| `POST /api/scenes/prealign` | **Lưu Cân Bằng Độ Nghiêng**: Lưu ma trận xoay 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>` trong `scenes.xml`. |

---

### 🎨 B. `_dev/editor.html` (WYSIWYG Visual Editor — ~3195 dòng)

| Khoảng dòng | Tên Khối / Hàm | Chức năng & Giao diện |
|-------------|----------------|-----------------------|
| `L1 - L260` | `CSS Styles` | Cấu hình Dark Theme, Tree View, Slider controls, Laser Grid Overlay, WYSIWYG White Modal. |
| `L985 - L997`| `#pano-wrapper` | Container chứa viewer 360 và lớp phủ **Lưới chỉ la-ze xanh cyan (Grid Guidelines)** căn chân trời. |
| `L998 - L1080`| `Info Manager Modal` | Hộp thoại quản lý thuyết minh WYSIWYG (nền trắng nét căng, bảng chọn màu chữ cơ bản). |
| `L1155 - L1200`| `Prealign UI Panel` | Bảng điều khiển thanh trượt Roll (`-15°..+15°`), Pitch, Yaw, Nút Bật/tắt lưới, Reset 0° và Lưu độ nghiêng. |
| `L1900 - L1930`| `window.onSceneChange` | Đồng bộ các thanh trượt Roll/Pitch/Yaw và FOV khi chuyển đổi cảnh. |
| `L2138 - L2152`| `btn-delete-hotspot` | **Xóa & Đồng bộ tức thì**: Xóa hotspot khỏi canvas và gọi `saveHotspotsToServer()` lưu ngay vào `scenes.xml`. |
| `L2330 - L2360`| `applyLivePrealign()` | Cập nhật `image.prealign` và gọi `updateobject(true, true)` xoay ảnh 360° trực quan realtime. |
| `L2365 - L2415`| `Prealign Save Event` | Gọi API `/api/scenes/prealign` lưu độ nghiêng vào file `scenes.xml` đĩa cứng. |

---

### 🌐 C. `core/js/app.js` (Public Tour Logic — ~750 dòng)

| Khoảng dòng | Tên Hàm | Chức năng |
|-------------|---------|-----------|
| `L107 - L189` | `buildDynamicTourData()` | Nạp `tours/locations.json` & `tours/infos.json` tĩnh (hoạt động 100% trên GitHub Pages / Offline). |
| `L297 - L324` | `Sidebar Click-Outside` | Tự động thu gọn Sidebar khi click/chạm ra ngoài ảnh 360°. |
| `L419 - L530` | `ensureMapInitialized()` | Khởi tạo bản đồ Leaflet, tải GeoJSON ranh giới Ninh Phước và vẽ các marker. |

---

## 🔌 3. SƠ ĐỒ TOÀN BỘ REST API (`_dev/server.js`)

| Phương thức | Endpoint | Tham số Body (JSON) | Tác dụng |
|-------------|----------|---------------------|----------|
| `GET` | `/api/scenes` | — | Lấy mảng tất cả các cảnh từ các file `scenes.xml`. |
| `GET` | `/api/locations` | — | Lấy danh sách địa điểm từ `locations.json`. |
| `GET` | `/api/infos` | — | Lấy kho bài viết thuyết minh từ `tours/infos.json`. |
| `POST` | `/api/infos/save` | `{ id, title, subtitle, content }` | Lưu/cập nhật bài viết thuyết minh vào `tours/infos.json`. |
| `DELETE`| `/api/infos/:id` | — | Xóa bài viết thuyết minh khỏi `tours/infos.json`. |
| `POST` | `/api/upload-pano-multi` | FormData: files, `locationId` | Upload hàng loạt & cắt tiles 4 cấp độ. |
| `POST` | `/api/scenes/save` | `{ sceneId, hotspots: [...] }` | Lưu danh sách hotspot vào thẻ `<scene>` tương ứng. |
| `POST` | `/api/scenes/view` | `{ sceneId, hlookat, vlookat, fov, fovmin, fovmax }` | Lưu góc nhìn camera mặc định vào thẻ `<view>`. |
| `POST` | `/api/scenes/prealign` | `{ sceneId, pitch, yaw, roll }` | Lưu độ nghiêng ma trận 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>`. |

---

## 💡 4. HƯỚNG DẪN AI AGENT / DEV BẮT ĐẦU CÔNG VIỆC MỚI

1. **Đọc `README.md`** để hiểu bức tranh tổng thể và kiến trúc bàn giao.
2. **Đọc `MAPCODE.md` (file này)** để tra cứu chính xác file và số dòng cần sửa.
3. **KHÔNG CẦN QUÉT THƯ MỤC HÌNH ẢNH**: Tuyệt đối không tự động đọc hay liệt kê các file bên trong `tours/*/panos/`.
4. **Kiểm tra Server Status**: Đảm bảo `node _dev/server.js` đang chạy nếu làm việc với trình Visual Editor.
