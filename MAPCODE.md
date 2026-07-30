# BẢN ĐỒ MÃ NGUỒN CHI TIẾT (MAPCODE) — DỰ ÁN NINH PHƯỚC 360°

> **Cập nhật:** 07/2026  
> **Dành cho:** AI Agents, Lập trình viên, Team Lead.  
> **Mục đích:** Tra cứu chính xác vị trí dòng code, cấu trúc file, sơ đồ API và luồng dữ liệu mà KHÔNG CẦN đọc lại toàn bộ mã nguồn.

---

## 📂 1. CẤU TRÚC TỆP TIN & THƯ MỤC CHI TIẾT

```
e:\Viet Design\Ninhphuoc360\
├── index.html                           # [PUBLIC UI] Giao diện tour chính cho người dùng
├── tour.xml                             # [MASTER XML] Cấu hình master KrPano, styles hotspot, includes
├── README.md                            # [DOCS] Hướng dẫn tổng quan dự án & cách vận hành
├── MAPCODE.md                           # [DOCS] Bản đồ mã nguồn chi tiết (Tệp tin này)
├── robots.txt                           # [SEO] Cấu hình Robot Search Engine
├── sitemap.xml                          # [SEO] Sơ đồ trang web
│
├── core/                                # [ASSETS & LOGIC PUBLIC TOUR]
│   ├── css/
│   │   └── style.css                    # CSS toàn bộ giao diện public tour (Glassmorphic, Responsive)
│   ├── js/
│   │   └── app.js                       # Logic JS public tour (Dynamic tourData, Leaflet map, UI event)
│   ├── assets/                          # Favicon, og-preview.png, logo icon
│   └── data/                            # GeoJSON ranh giới bản đồ
│
├── engine/                              # [KRPANO BINARY ENGINE]
│   ├── tour.js                          # Trình phát KrPano HTML5 Viewer Core (KHÔNG SỬA)
│   ├── tour.swf                          # Flash fallback (legacy)
│   └── plugins/                         # WebVR, gyro2, scroll, sound-interface plugins
│
├── tours/                               # [DỮ LIỆU CÁC ĐỊA ĐIỂM / SCENES]
│   ├── locations.json                   # Ánh xạ ID thư mục → Tên hiển thị tiếng Việt có dấu
│   ├── lang_gom/                        # Địa điểm: Làng Gốm Bàu Trúc
│   │   ├── scenes.xml                   # Thẻ <scene> của các cảnh thuộc Làng Gốm
│   │   └── panos/                       # Ảnh multi-resolution tiles (.tiles/ preview, thumb)
│   ├── nha_sinh_hoat/                   # Địa điểm: Nhà sinh hoạt cộng đồng Chăm
│   │   ├── scenes.xml
│   │   └── panos/
│   └── <ten_dia_diem>/                  # Các địa điểm di tích/du lịch khác...
│
└── _dev/                                # [LOCAL VISUAL EDITOR TOOLING - BÀN GIAO CÓ THỂ XÓA]
    ├── server.js                        # Express Server (REST API, KrPano CLI Makepano, XML Saver)
    ├── editor.html                      # WYSIWYG Editor GUI (Hotspot Drag, Tree View, Drag Drop)
    └── krpano-tools/                    # KrPano CLI Executable & Templates
        ├── krpanotools64.exe            # Executable cắt tiles tự động
        └── templates/
            ├── krpano-editor.config     # Config CLI template với %BASENAME% chống đè file
            └── basicsettings.config     # Thiết lập tiling căn bản (tilesize=512, multires)
```

---

## 🗺️ 2. BẢN ĐỒ CHI TIẾT DÒNG CODE TRONG CÁC FILE CHÍNH

### 📜 A. `_dev/server.js` (Express Server & REST API — ~1173 dòng)

| Khoảng dòng | Tên Hàm / Khối | Chức năng & Luồng xử lý |
|-------------|----------------|--------------------------|
| `L1 - L45`  | `Imports & Setup` | Import `express`, `fs`, `path`, `multer`, `child_process`. Cấu hình cổng `3600`, định nghĩa `PROJECT_ROOT`, `TOURS_DIR`, `KRPANO_CLI`. |
| `L47 - L80` | `sanitizeTourXmlIncludes()` | Tự động quét `tour.xml` khi khởi động server, xóa các dòng `<include>` trỏ tới file không tồn tại hoặc rỗng để chống lỗi `Fatal 404`. |
| `L82 - L175` | `Multer Storage` | Cấu hình upload file tạm vào `_dev/uploads/`. |
| `L177 - L205` | `GET /api/locations` | Đọc `tours/locations.json` và quét thư mục `tours/*/scenes.xml` để trả về danh sách địa điểm và tên hiển thị. |
| `L207 - L230` | `POST /api/locations/rename` | Đổi tên hiển thị địa điểm và lưu trực tiếp vào `tours/locations.json`. |
| `L232 - L280` | `POST /api/locations/create` | Tạo thư mục địa điểm mới trong `tours/<sanitized_id>` và tạo file `scenes.xml` khởi tạo. |
| `L282 - L337` | `POST /api/upload-pano-multi` | **Upload Panorama Hàng loạt**: Nhận mảng file, gom tất cả vào đúng 1 thư mục Địa điểm chỉ định, gọi `processBatchJobs()`. |
| `L338 - L365` | `processBatchJobs()` | Vòng lặp chạy CLI tiling bất đồng bộ cho từng ảnh, cập nhật tiến độ vào `tilingJobs` map. |
| `L367 - L406` | `POST /api/scenes/rename` | Đổi tiêu đề `title="..."` của một `<scene>` trong file `scenes.xml` tương ứng. |
| `L424 - L535` | `POST /api/scenes/move-location` | **Di chuyển Cảnh**: Trích xuất khối `<scene>` XML, di chuyển folder `.tiles` đĩa cứng, xóa ở XML cũ, chèn vào XML mới, tự động cập nhật `tour.xml`. |
| `L537 - L590` | `POST /api/scenes/delete` | **Xóa Cảnh**: Xóa `<scene>` khỏi XML, xóa folder `.tiles`, nếu địa điểm rỗng thì xóa `<include>` khỏi `tour.xml`. |
| `L592 - L650` | `POST /api/scenes/save` | **Lưu Hotspots**: Lưu danh sách `<hotspot>` được chỉnh sửa từ Editor vào file `scenes.xml`. |
| `L652 - L710` | `POST /api/scenes/view` | **Lưu View Mặc Định**: Lưu thông số `<view hlookat="..." vlookat="..." fov="..." />` vào `scenes.xml`. |
| `L712 - L780` | `runKrPanoTiling()` | Thực thi `krpanotools64.exe makepano` với `cwd` đúng thư mục config để tự động sinh tiles. |
| `L782 - L850` | `fixScenesXml()` | Đánh lại đường dẫn `thumburl` và `preview` chuẩn trong XML sau khi cắt tiles. |
| `L852 - L890` | `addIncludeToTourXml()` | Thêm dòng `<include url="tours/x/scenes.xml" />` vào `tour.xml` nếu chưa có. |

---

### 🎨 B. `_dev/editor.html` (WYSIWYG Visual Editor — ~2275 dòng)

| Khoảng dòng | Tên Khối / Hàm | Chức năng & Giao diện |
|-------------|----------------|-----------------------|
| `L1 - L260` | `CSS Styles` | Cấu hình theme Dark Gold, Sidebar tree view, Drag-over dashed highlight, Visual Hotspot form controls, Modal dialogs. |
| `L262 - L980` | `HTML Layout` | Cấu hình Sidebar trái (cây thư mục), Viewport 360° chính, Sidebar phải (Thuộc tính Hotspot, Lưu View, Nút Xuất XML), Upload Modal. |
| `L989 - L1075` | `injectEditorXML()` | Tiêm (Inject) action KrPano `draghotspot` để cho phép kéo rê Hotspot trên màn hình 360° bằng chuột và gửi tọa độ `ath`, `atv` về JS realtime. |
| `L1077 - L1170` | `detectScenesAndData()` | Quét toàn bộ cảnh từ KrPano + Gọi API `/api/scenes` & `/api/locations` để xây dựng danh sách cảnh phân cấp. |
| `L1172 - L1280` | `renderSceneList()` | **Hiển thị Cây Thư mục Phân cấp (Tree View)**: Gom nhóm theo Địa điểm, render Nút thu gọn, Nút Đổi tên, Nút Chuyển địa điểm, Nút Xóa và gán sự kiện HTML5 Drag & Drop (`draggable="true"`). |
| `L1197 - L1240` | `Drag & Drop Handlers` | `handleSceneDragStart`, `handleSceneDragEnd`, `handleLocationDragOver`, `handleLocationDrop` xử lý kéo thả di chuyển cảnh giữa các địa điểm. |
| `L1258 - L1320` | `promptMoveSceneLocation()` | Bật hộp thoại chọn số thứ tự địa điểm đích để chuyển cảnh. |
| `L1322 - L1350` | `promptRenameLocation()` | Hộp thoại đổi tên hiển thị tiếng Việt của Địa điểm. |
| `L1352 - L1385` | `promptRenameScene()` | Hộp thoại đổi tên cảnh (`title`). |
| `L1387 - L1440` | `confirmDeleteScene()` | Hộp thoại xác nhận xóa cảnh vĩnh viễn. |
| `L1475 - L1520` | `window.onHotspotSelected` | Callback khi click chọn 1 Hotspot trên màn hình 360° hoặc danh sách -> Bật form chỉnh sửa thuộc tính bên phải. |
| `L1522 - L1536` | `window.onHotspotDrag` | Callback cập nhật tọa độ `ath`, `atv` realtime khi kéo rê Hotspot trên màn hình. |
| `L1740 - L1770` | `saveCurrentViewAsDefault()` | Gọi API `/api/scenes/view` để lưu góc nhìn camera hiện tại làm góc nhìn ban đầu khi vào cảnh. |
| `L1795 - L1821` | `saveHotspotsToServer()` | Gọi API `/api/scenes/save` lưu danh sách hotspot vào file `scenes.xml` đĩa cứng. |
| `L1908 - L2150` | `Upload System JS` | Quản lý Upload Modal, nạp danh sách địa điểm, hiển thị danh sách file chọn và theo dõi tiến độ cắt tiles qua SSE `EventSource`. |

---

### 🌐 C. `core/js/app.js` (Public Tour Logic — ~730 dòng)

| Khoảng dòng | Tên Hàm | Chức năng |
|-------------|---------|-----------|
| `L12 - L22`  | `tourData` | Khởi tạo Object chứa dữ liệu Tour (tự động nạp động bởi `buildDynamicTourData()`). |
| `L51 - L105` | `krpanoReady()` | Khởi tạo KrPano, ẩn skin mặc định, lắng nghe sự kiện `onnewscene` và `onloadcomplete`, đồng bộ góc nhìn nón Radar. |
| `L107 - L145` | `buildDynamicTourData()` | **Quét dữ liệu Động**: Tự động gọi API `/api/scenes` & `/api/locations` (hoặc quét trực tiếp KrPano XML nếu offline) để xây dựng menu địa điểm động. |
| `L147 - L183` | `onSceneChange()` | Đồng bộ UI khi đổi cảnh: Cập nhật tiêu đề địa điểm `[Tên Địa Điểm] - [Tên Cảnh]`, cuộn thumbnail hoạt động, lưu lịch sử nút Quay lại (Back). |
| `L212 - L285` | `initUI()` | Đăng ký sự kiện click Nút Bắt đầu, Nút Tự động xoay (Autorotate), Chế độ VR, Toàn màn hình, Chia sẻ, Nút Quay lại. |
| `L297 - L324` | `Sidebar Click-Outside` | **Tự động thu gọn Menu**: Đăng ký `mousedown` và `touchstart` trên `document`, tự động ẩn Sidebar khi click/chạm ra ngoài ảnh 360°. |
| `L326 - L416` | `Minimap Controls` | Thu nhỏ / Phóng to bản đồ Leaflet Minimap. |
| `L419 - L530` | `ensureMapInitialized()` | Khởi tạo bản đồ Leaflet, tải GeoJSON ranh giới Ninh Phước và vẽ các marker vị trí di tích. |
| `L532 - L595` | `renderSidebar()` | Render danh sách địa điểm dạng Accordion lên Sidebar trái, tự động mở nhóm chứa cảnh hiện tại và thêm huy hiệu số lượng cảnh. |

---

### 🎨 D. `core/css/style.css` (Public Tour Styles — ~1468 dòng)

| Khoảng dòng | Tên Khối CSS | Chi tiết Giao diện |
|-------------|--------------|--------------------|
| `L1 - L44`   | CSS Variables | Định nghĩa bảng màu Glassmorphism (`--glass-bg`, `--primary`, `--text-muted`). |
| `L45 - L244` | Intro Screen | Giao diện màn hình chào mừng hoành tráng (Intro Card, Loading Bar). |
| `L547 - L579`| Logo Compact | Khung logo góc trên bên phải hiển thị Tiêu đề Tour & Tiêu đề Cảnh hiện tại. |
| `L581 - L660`| Sidebar Base | Nút bấm "Địa điểm" góc trên bên trái và khung Sidebar chứa danh sách. |
| `L661 - L730`| Accordion Titles | Tiêu đề nhóm địa điểm (`.tour-title` & `.title-text`): Cấu hình **xuống dòng tự động mềm mại (Auto Word-wrap)** không bị mất chữ khi tên địa điểm dài. |
| `L732 - L810`| Thumbnails | Các thẻ ảnh thu nhỏ 360° trong Sidebar (`.sidebar-thumb`). |
| `L812 - L1050`| Nav Bar Controls | Thanh công cụ điều hướng dưới cùng màn hình (Ẩn/Hiện nút, VR, Toàn màn hình, Quay lại). |
| `L1052 - L1120`| Minimap Panel | Khung bản đồ Leaflet thu nhỏ góc dưới bên phải. |

---

### 📜 E. `tour.xml` (Master KrPano XML — ~400 dòng)

| Thẻ XML / ID | Vai trò & Quy định |
|--------------|----------------────|
| `<include url="..." />` | Chứa danh sách các file `scenes.xml` của từng địa điểm trong `tours/`. Được tự động duy trì bởi Server. |
| `<style name="muiten" ... />` | Biểu tượng Mũi tên xanh di chuyển nội bộ mặt đất (dùng SVG sprite animation 24 frames). |
| `<style name="vitri" ... />` | Biểu tượng Ghim vị trí màu đỏ (hiệu ứng nảy bounce) khi hạ cánh từ drone xuống. |
| `<style name="tructhang" ... />` | Biểu tượng Trực thăng phát sáng (glow) dùng cho cảnh toàn cảnh trên cao. |
| `<style name="thongtin" ... />` | Biểu tượng [i] tròn phát xung (pulse) dùng mở popup thuyết minh thông tin. |
| `<action name="startup">` | Action tự động chạy khi khởi động, tự động load cảnh đầu tiên trong danh sách. |

---

## 🔌 3. SƠ ĐỒ TOÀN BỘ REST API (`_dev/server.js`)

| Phương thức | Endpoint | Tham số Body (JSON / FormData) | Tác dụng |
|-------------|----------|--------------------------------|----------|
| `GET` | `/api/scenes` | — | Lấy mảng tất cả các cảnh từ tất cả các file `scenes.xml`. |
| `GET` | `/api/locations` | — | Lấy danh sách địa điểm kèm ID và Tên hiển thị từ `locations.json`. |
| `POST` | `/api/locations/rename` | `{ locationId, newName }` | Đổi tên hiển thị tiếng Việt của Địa điểm vào `locations.json`. |
| `POST` | `/api/locations/create` | `{ locationName }` | Tạo thư mục địa điểm mới trong `tours/`. |
| `POST` | `/api/upload-pano-multi` | FormData: `panoramas` (files), `locationId`, `sceneNames`, `sceneTitles` | **Upload hàng loạt**: Gom tất cả ảnh vào đúng 1 thư mục Địa điểm và cắt tiles. |
| `GET` | `/api/tiling-status/:id` | — (Server-Sent Events) | Stream tiến độ cắt tiles % cho client. |
| `POST` | `/api/scenes/rename` | `{ sceneId, newTitle }` | Đổi tiêu đề `title="..."` của cảnh trong XML. |
| `POST` | `/api/scenes/move-location` | `{ sceneId, targetLocationId }` | **Di chuyển Cảnh**: Đổi vị trí XML, di chuyển folder tiles đĩa cứng và cập nhật `tour.xml`. |
| `POST` | `/api/scenes/delete` | `{ sceneId }` | Xóa cảnh khỏi XML và xóa folder tiles trên đĩa cứng. |
| `POST` | `/api/scenes/save` | `{ sceneId, hotspots: [...] }` | Lưu danh sách hotspot vào thẻ `<scene>` tương ứng trong XML. |
| `POST` | `/api/scenes/view` | `{ sceneId, hlookat, vlookat, fov }` | Lưu góc nhìn camera mặc định vào thẻ `<view>` trong XML. |

---

## 🗃️ 4. QUY ĐỊNH DỮ LIỆU & SCHEMAS

### 📄 1. File `tours/locations.json`
```json
{
  "lang_gom": "Làng Gốm Bàu Trúc",
  "nha_sinh_hoat": "Nhà Sinh hoạt cộng đồng Chăm",
  "thap_poklong_garai": "Tháp Po Klong Garai"
}
```

### 📄 2. Thẻ `<scene>` trong `tours/<dia_diem>/scenes.xml`
```xml
<krpano>
	<scene name="scene_cong_lang" title="Cổng làng Bàu Trúc" thumburl="panos/cong_lang.tiles/thumb.jpg">
		<view hlookat="-132.1" vlookat="1.4" fov="78.7" maxpixelzoom="2.0" fovmin="60" fovmax="120" />
		<preview url="panos/cong_lang.tiles/preview.jpg" />
		<image type="CUBE" multires="true" tilesize="512">
			<level tiledimagewidth="5120" tiledimageheight="5120">
				<cube url="panos/cong_lang.tiles/%s/l4/%0v/l4_%s_%0v_%0h.jpg" />
			</level>
			<!-- l3, l2, l1 resolution levels... -->
		</image>
		<!-- Hotspot liên kết scene -->
		<hotspot name="hs_new_486451" style="muiten" ath="-132.9560" atv="21.5825" linkedscene="scene_duongdi1" custom_title="Đi đến Đường đi 1" />
		<!-- Hotspot mở thuyết minh -->
		<hotspot name="hs_new_500049" style="thongtin" ath="15.2000" atv="5.1000" infoid="info_lang_gom_lichsu" custom_title="Lịch sử làng gốm" />
	</scene>
</krpano>
```

---

## 💡 5. HƯỚNG DẪN AI AGENT / DEV BẮT ĐẦU CÔNG VIỆC MỚI

Khi bạn là một **AI Agent** hoặc **Developer mới** nhận nhiệm vụ tiếp tục dự án:

1. **Đọc `README.md`** để hiểu bức tranh tổng thể và kiến trúc bàn giao.
2. **Đọc `MAPCODE.md` (file này)** để tra cứu chính xác file và số dòng cần sửa.
3. **KHÔNG CẦN QUÉT THƯ MỤC HÌNH ẢNH**: Tuyệt đối không tự động đọc hay liệt kê các file bên trong `tours/*/panos/` vì chứa hàng ngàn file tiles nhỏ sẽ gây quá tải context token.
4. **Kiểm tra Server Status**: Đảm bảo `node _dev/server.js` đang chạy nếu làm việc với trình Visual Editor.
