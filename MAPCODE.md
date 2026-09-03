# BẢN ĐỒ MÃ NGUỒN CHI TIẾT (MAPCODE) — DỰ ÁN NINH PHƯỚC 360°

> **Cập nhật:** 09/2026 (Phiên bản 2.3.0)  
> **Dành cho:** AI Agents, Lập trình viên, Team Lead.  
> **Repository:** [https://github.com/hackervn89/ninhphuoc360](https://github.com/hackervn89/ninhphuoc360)  
> **Website Live:** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)  
> **Mục đích:** Tra cứu chính xác vị trí dòng code, cấu trúc file, sơ đồ API và luồng dữ liệu mà KHÔNG CẦN đọc lại toàn bộ mã nguồn.

---

## 📂 1. CẤU TRÚC TỆP TIN & THƯ MỤC CHI TIẾT

```
e:\Viet Design\Ninhphuoc360\
├── index.html                           # [PUBLIC UI] Giao diện tour chính cho người dùng (nạp Leaflet + Google Maps)
├── tour.xml                             # [MASTER XML] Cấu hình master KrPano, styles hotspot, includes
├── .gitignore                           # [GIT] Cấu hình bỏ qua node_modules, temp, binaries nặng
├── README.md                            # [DOCS] Hướng dẫn tổng quan dự án & cách vận hành
├── MAPCODE.md                           # [DOCS] Bản đồ mã nguồn chi tiết (Tệp tin này)
├── leaflet_minimap_guide.md             # [DOCS] Tài liệu quy chuẩn kỹ thuật Minimap Leaflet + Google Tile gl=VN
├── xaNinhPhuoc.geojson                  # [GEO DATA] Dữ liệu GeoJSON gốc ranh giới hành chính Xã Ninh Phước
├── robots.txt                           # [SEO] Cấu hình Robot Search Engine
├── sitemap.xml                          # [SEO] Sơ đồ trang web
│
├── core/                                # [ASSETS & LOGIC PUBLIC TOUR]
│   ├── css/
│   │   └── style.css                    # (~1,440 dòng) CSS Design System, White Glass & Red Accent Minimap, Responsive
│   ├── js/
│   │   └── app.js                       # (~815 dòng) Logic JS public tour, Google Maps gl=VN, GPS phân cấp, Radar FOV Sync
│   ├── data/
│   │   └── ninhphuoc-boundary.json      # [GEOJSON] Tệp ranh giới đa giác khép kín Xã Ninh Phước (1.579 điểm)
│   └── assets/                          # Favicon, og-preview.png, logo icon, SVG markers
│
├── engine/                              # [KRPANO BINARY ENGINE]
│   ├── tour.js                          # Trình phát KrPano HTML5 Viewer Core (KHÔNG SỬA)
│   ├── tour.swf                         # Flash fallback (legacy)
│   └── plugins/                         # WebVR, gyro2, scroll, sound-interface plugins
│
├── tours/                               # [DỮ LIỆU CÁC ĐỊA ĐIỂM / SCENES & INFOS]
│   ├── locations.json                   # [STATIC DATA] Cấu hình địa điểm kèm tọa độ GPS { name, lat, lng }
│   ├── infos.json                       # [STATIC DATA] Cơ sở dữ liệu bài viết thuyết minh (HTML/CSS)
│   ├── lang_gom/                        # Địa điểm: Làng Gốm Bàu Trúc (GPS: 11.5305, 108.9556)
│   │   ├── scenes.xml                   # Thẻ <scene> (hỗ trợ lat="..." lng="..." riêng từng cảnh)
│   │   └── panos/                       # Ảnh multi-resolution tiles (.tiles/ preview, thumb)
│   ├── nha_sinh_hoat/                   # Địa điểm: Nhà sinh hoạt cộng đồng Chăm (GPS: 11.5318, 108.9542)
│   │   ├── scenes.xml
│   │   └── panos/
│   ├── htx_gom_bautruc/                 # Địa điểm: HTX Gốm Chăm Bàu Trúc (GPS: 11.5312, 108.9568)
│   │   ├── scenes.xml
│   │   └── panos/
│   ├── bia_tuong_niem_van_phuoc/        # Địa điểm: Bia tưởng niệm làng Vạn Phước (GPS: 11.5450, 108.9410)
│   │   ├── scenes.xml
│   │   └── panos/
│   └── nha_tuong_niem_tranthi/          # Địa điểm: Nhà tưởng niệm đồng chí Trần Thi (GPS: 11.5462, 108.9425)
│       ├── scenes.xml
│       └── panos/
│
└── _dev/                                # [LOCAL VISUAL EDITOR TOOLING - BÀN GIAO CÓ THỂ XÓA]
    ├── server.js                        # (~1,550 dòng) Express Server (REST API, GPS Endpoints, SSE Tiling, Reorder, Prealign, Polygon, Info API)
    ├── editor.html                      # (~3,850 dòng) WYSIWYG Editor GUI (GPS Manager Modal, Reorder Up/Down & Drag, Hotspot Drag, Polygon Draw, Horizon Leveling, Info Manager)
    ├── test_hotspot.html                # Trang test hiển thị thử nghiệm hotspot
    ├── krpano-editor.config             # Config CLI template với %BASENAME% chống đè file
    └── krpano-tools/                    # KrPano CLI Executable & Templates (Loại trừ khỏi Git)
        └── krpanotools64.exe            # Executable cắt tiles tự động
```

---

## 🗺️ 2. BẢN ĐỒ CHI TIẾT DÒNG CODE TRONG CÁC FILE CHÍNH

### 📜 A. `_dev/server.js` (Express Server & REST API — ~1,550 dòng)

| Khoảng dòng | Tên Hàm / Khối | Chức năng & Luồng xử lý |
|-------------|----------------|--------------------------|
| `L1 - L40`  | `Imports & Setup` | Import `express`, `fs`, `path`, `multer`, `child_process`. Cấu hình cổng `3600`, thư mục `PROJECT_ROOT`. |
| `L41 - L82` | `Middleware & Static Routes` | No-cache header, static route `editor.html`, static `PROJECT_ROOT`, cấu hình multer upload temp, `tilingJobs` Map. |
| `L84 - L118` | `sanitizeTourXmlIncludes()` | Tự động quét `tour.xml` khi khởi động server, xóa các dòng `<include>` rỗng/không tồn tại. |
| `L120 - L194` | `GET /api/scenes` | Quét tất cả các thư mục trong `tours/`, phân tích cú pháp `scenes.xml` trả về danh sách cảnh + **GPS lat/lng riêng** + hotspots + views. |
| `L196 - L222` | `GET /api/locations` | Đọc `tours/locations.json` và trả về danh sách toàn bộ các địa điểm kèm tọa độ `lat, lng`. |
| `L224 - L240` | `POST /api/locations/rename` | Cập nhật tên hiển thị Tiếng Việt của địa điểm trong `tours/locations.json`. |
| `L242 - L280` | `POST /api/locations/gps` | **Cập nhật GPS Địa điểm**: Lưu tọa độ mặc định chung `{ lat, lng }` vào `tours/locations.json`. |
| `L282 - L345` | `POST /api/scenes/gps` | **Cập nhật GPS Riêng từng Cảnh**: Ghi đè hoặc gỡ bỏ thuộc tính `lat="..." lng="..."` trong thẻ `<scene>` của `scenes.xml`. |
| `L347 - L385` | `POST /api/locations/create` | Tạo mới thư mục địa điểm trong `tours/`, tạo `scenes.xml` khởi tạo và thêm `<include>` vào `tour.xml`. |
| `L387 - L460` | `POST /api/upload-pano-multi` | **Upload Hàng loạt Panorama**: Nhận nhiều file ảnh, lưu tạm và đẩy vào hàng đợi xử lý batch qua SSE. |
| `L462 - L490` | `processBatchJobs()` | Xử lý tuần tự từng ảnh trong batch: gọi `runKrPanoTiling`, `fixScenesXml`, `addIncludeToTourXml` và bắn SSE. |
| `L492 - L535` | `POST /api/scenes/rename` | Đổi title hoặc ID của thẻ `<scene>` trong `scenes.xml`. |
| `L537 - L605` | `POST /api/scenes/reorder` | **Sắp Xếp Thứ Tự Cảnh (Reorder)**: Bóc tách chính xác các thẻ `<scene>` và sắp xếp lại theo thứ tự mảng `orderedSceneIds` trong `scenes.xml`. |
| `L607 - L715` | `POST /api/scenes/move-location` | **Chuyển Địa điểm Cảnh**: Di chuyển thư mục tiles từ địa điểm cũ sang địa điểm mới, cắt `<scene>` cũ và chèn vào `scenes.xml` mới. |
| `L717 - L795` | `POST /api/scenes/delete` | Xóa thẻ `<scene>` khỏi `scenes.xml` và xóa sạch thư mục ảnh tiles liên quan. |
| `L797 - L855` | `POST /api/upload-pano` | Upload đơn lẻ 1 ảnh 360° và tạo tiles. |
| `L857 - L885` | `GET /api/tiling-status/:jobId` | **SSE Endpoint**: Truyền tiến độ cắt tiles realtime (% hoàn thành, scene hiện tại) về cho trình duyệt. |
| `L887 - L935` | `runKrPanoTiling()` | Thực thi `krpanotools64.exe makepano` tạo tiles 4 cấp độ phân giải. |
| `L937 - L965` | `fixScenesXml()` | Đọc thẻ `<scene>` sau khi cắt tiles và gọi `getJpgWidth()` để sửa kích thước tile chuẩn. |
| `L967 - L1065`| `getJpgWidth()` | **Exact Tile Engine**: Bóc tách chính xác độ rộng tile mép (`l1=640`, `l2=1280`, `l3=2560`, `l4=4864`), triệt tiêu khoảng đen ranh giới. |
| `L1075 - L1115`| `addIncludeToTourXml()` | Thêm thẻ `<include url="tours/.../scenes.xml" />` vào `tour.xml` nếu chưa có. |
| `L1117 - L1245`| `POST /api/scenes/save` | **Lưu Hotspots**: Hỗ trợ lưu cả Hotspot thường (`<hotspot .../>`) lẫn Hotspot đa giác (`<hotspot><point ath="..." atv="..."/></hotspot>`) vào `scenes.xml`. |
| `L1247 - L1335`| `POST /api/scenes/view` | **Lưu View Mặc Định**: Ghi đè thẻ `<view fovtype="MFOV" hlookat="..." vlookat="..." fov="..." fovmin="..." fovmax="..." />`. |
| `L1340 - L1420`| `POST /api/scenes/prealign` | **Lưu Cân Bằng Độ Nghiêng**: Lưu ma trận xoay 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>` trong `scenes.xml`. |
| `L1425 - L1470`| `DELETE /api/scenes/:sceneId`| Xóa scene qua Restful parameter. |
| `L1475 - L1555`| `GET/POST/DELETE /api/infos` | API Quản lý kho bài viết thuyết minh tĩnh (`tours/infos.json`). |

---

### 🎨 B. `_dev/editor.html` (WYSIWYG Visual Editor — ~3,850 dòng)

| Khoảng dòng | Tên Khối / Hàm | Chức năng & Giao diện |
|-------------|----------------|-----------------------|
| `L13 - L1086`| `CSS Styles` | Toàn bộ giao diện Editor: Dark Theme, Reorder Buttons CSS, Tree Scene Sidebar, Hotspot Panel, Laser Grid Overlay, WYSIWYG White Modal, Polygon Tools. |
| `L1093 - L1115`| `#left-sidebar` | Panel quản lý cảnh: Nút upload kéo thả, ô tìm kiếm cảnh, danh sách cây phân cấp. |
| `L1118 - L1151`| `#viewport-container` | Top Bar điều khiển, `#pano-wrapper`, Khung banner chế độ vẽ Polygon (`#poly-drawing-banner`), Lưới la-ze xanh cyan (`#horizon-grid-overlay`). |
| `L1154 - L1230`| `Info Manager Modal` | Hộp thoại quản lý thuyết minh WYSIWYG (nền trắng, bảng chọn màu, định dạng H1/H2/H3, danh sách). |
| `L1535 - L1585`| `GPS Coordinates Modal`| **Hộp Thoại Cài Đặt Tọa Độ GPS**: Modal nhập Vĩ độ & Kinh độ cho Địa điểm (📍) hoặc từng Cảnh riêng biệt (🎯). |
| `L1695 - L1800`| `detectScenesAndData()` | Bóc tách metadata cảnh và địa điểm, hỗ trợ nhận diện tọa độ riêng của scene hoặc thừa hưởng địa điểm. |
| `L1802 - L1940`| `Scene Drag & Reorder Events` | `handleSceneDragStart`, `handleSceneDragOver`, `handleSceneDrop` (hỗ trợ kéo thả đổi thứ tự trong cùng địa điểm hoặc di chuyển sang địa điểm khác). |
| `L1942 - L1985`| `moveSceneOrder()` | **Hàm Đổi Vị Trí Cảnh (Up/Down)**: Tráo đổi vị trí cảnh và gọi API `/api/scenes/reorder` cập nhật tức thì. |
| `L1988 - L2120`| `renderSceneList()` | Hiển thị danh sách cảnh theo cây thư mục có các nút **📍 GPS Địa điểm**, **🎯 GPS Cảnh**, **Lên ↑**, **Xuống ↓**, Đổi tên, Xóa. |
| `L2122 - L2250`| `Scene & Location CRUD` | Đổi tên địa điểm (`promptRenameLocation`), Đổi tên cảnh (`promptRenameScene`), Di chuyển cảnh (`promptMoveSceneLocation`), Xóa cảnh (`confirmDeleteScene`). |
| `L2255 - L2345`| `GPS Handlers` | `promptEditLocationGps()`, `promptEditSceneGps()`, `submitGpsModal()`, `clearSceneCustomGps()`. |
| `L2350 - L2405`| `window.onSceneChange` | Hook chuyển cảnh: Cập nhật camera, đồng bộ thanh trượt Prealign (Roll/Pitch/Yaw) và FOV. |
| `L2410 - L2590`| `loadSceneHotspots()` | Nạp hotspots của cảnh hiện tại, cho phép kéo thả di chuyển vị trí trực tiếp trên canvas 360°. |
| `L2600 - L2625`| `btn-delete-hotspot` | **Xóa & Đồng bộ tức thì**: Xóa hotspot khỏi canvas và gọi `saveHotspotsToServer()` ghi ngay vào XML. |
| `L2630 - L2810`| **Hệ thống Hotspot Đa Giác (Polygon)** | `startPolygonDrawing()`, `renderDraftPolygon()`, `finishPolygonDrawing()`, `renderPolygonInKrpano()`, `renderVertexHandles()`. |
| `L3080 - L3120`| `applyLivePrealign()` | Cập nhật `image.prealign` và gọi `updateobject(true, true)` xoay ảnh 360° trực quan realtime. |

---

### 🌐 C. `core/js/app.js` (Public Tour Logic — ~815 dòng)

| Khoảng dòng | Tên Khối / Hàm | Chức năng & Luồng xử lý |
|-------------|----------------|--------------------------|
| `L65 - L90`  | `Radar Rotation Loop` | Interval 60ms đọc `view.hlookat` từ KrPano và xoay nón `.map-radar` (tự động nghỉ khi map thu gọn). |
| `L95 - L190` | `buildDynamicTourData()` | Bóc tách cấu trúc tour từ KrPano XML và `locations.json`, nạp tọa độ GPS phân cấp (`scene.lat/lng` $\rightarrow$ `location.lat/lng`). |
| `L195 - L265`| `onSceneChange()` | Hook chuyển cảnh: Cập nhật tiêu đề, di chuyển radar và pan tâm Google Maps đến tọa độ chính xác của scene. |
| `L440 - L535`| `initMapControls()` | Xử lý click thu gọn (48px), phóng to màn hình lớn (`maximized` + `fitBounds`), chọn lớp Đường/Vệ tinh, màn che mờ overlay. |
| `L580 - L705`| `initGoogleMap()` | Khởi tạo Leaflet map với `zoomSnap: 0.1`, nạp 2 lớp Google Maps Tile (`gl=VN` & `hl=vi`), nạp GeoJSON ranh giới xã Ninh Phước, cắm glowing marker và popup chỉ đường. |
| `L715 - L735`| `syncMapToCurrentScene()`| Trượt tâm bản đồ và di chuyển radar đến tọa độ của cảnh đang mở. |

---

## 🔌 3. SƠ ĐỒ TOÀN BỘ REST API (`_dev/server.js`)

| Phương thức | Endpoint | Tham số Body / Query | Tác dụng |
|-------------|----------|----------------------|----------|
| `GET` | `/api/scenes` | — | Lấy toàn bộ danh sách cảnh, view, hotspot và tọa độ `lat/lng` từ các file `scenes.xml`. |
| `GET` | `/api/locations` | — | Lấy danh sách địa điểm và ánh xạ tên, tọa độ `lat, lng` từ `tours/locations.json`. |
| `POST` | `/api/locations/rename` | `{ locationId, newName }` | Đổi tên hiển thị tiếng Việt của địa điểm. |
| `POST` | `/api/locations/gps` | `{ locationId, lat, lng }` | **Cập nhật tọa độ GPS mặc định cho toàn bộ địa điểm**. |
| `POST` | `/api/scenes/gps` | `{ sceneId, lat, lng }` | **Cập nhật tọa độ GPS riêng cho từng cảnh** (hoặc xóa để dùng chung). |
| `POST` | `/api/locations/create` | `{ locationName }` | Tạo thư mục địa điểm mới + khởi tạo `scenes.xml` + thêm vào `tour.xml`. |
| `POST` | `/api/scenes/reorder` | `{ locationId, orderedSceneIds }` | **Sắp xếp thứ tự các cảnh trong địa điểm** và cập nhật lại file `scenes.xml`. |
| `POST` | `/api/upload-pano-multi` | `FormData: panoramas, locationId, sceneNames, sceneTitles` | Upload hàng loạt ảnh 360° và xếp hàng tạo tiles. |
| `GET` | `/api/tiling-status/:jobId` | Param `:jobId` | **SSE Stream**: Truyền tiến độ tạo tiles % theo thời gian thực. |
| `POST` | `/api/scenes/rename` | `{ sceneId, newTitle, newId }` | Đổi tiêu đề hoặc ID của cảnh trong XML. |
| `POST` | `/api/scenes/move-location` | `{ sceneId, targetLocationId }` | Di chuyển cảnh sang thư mục địa điểm khác. |
| `POST` | `/api/scenes/delete` | `{ sceneId }` | Xóa cảnh khỏi `scenes.xml` và dọn sạch thư mục tiles. |
| `DELETE`| `/api/scenes/:sceneId` | Param `:sceneId` | Xóa cảnh theo Restful parameter. |
| `POST` | `/api/upload-pano` | `FormData: panorama, sceneName, customTitle, locationId` | Upload và tạo tiles cho 1 ảnh đơn lẻ. |
| `POST` | `/api/scenes/save` | `{ sceneId, hotspots: [...] }` | Lưu danh sách hotspot (Point + Polygon) vào `scenes.xml`. |
| `POST` | `/api/scenes/view` | `{ sceneId, hlookat, vlookat, fov, fovmin, fovmax }` | Lưu góc nhìn camera mặc định vào thẻ `<view>`. |
| `POST` | `/api/scenes/prealign` | `{ sceneId, pitch, yaw, roll }` | Lưu ma trận xoay 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>`. |
| `GET` | `/api/infos` | — | Lấy toàn bộ bài viết thuyết minh từ `tours/infos.json`. |
| `POST` | `/api/infos/save` | `{ id, title, subtitle, content }` | Tạo mới hoặc cập nhật bài viết thuyết minh. |
| `DELETE`| `/api/infos/:id` | Param `:id` | Xóa bài viết thuyết minh khỏi `tours/infos.json`. |

---

## 💡 4. HƯỚNG DẪN AI AGENT / DEV BẮT ĐẦU CÔNG VIỆC MỚI

1. **Đọc `README.md`** để hiểu bức tranh tổng thể và kiến trúc bàn giao.
2. **Đọc `MAPCODE.md` (file này)** để tra cứu chính xác vị trí file, hàm và số dòng cần sửa.
3. **KHÔNG CẦN QUÉT THƯ MỤC HÌNH ẢNH**: Tuyệt đối không tự động đọc hay duyệt đệ quy các file bên trong `tours/*/panos/`.
4. **Kiểm tra Server Status**: Đảm bảo `node _dev/server.js` đang chạy trên cổng `3600` nếu làm việc với trình Visual Editor.

