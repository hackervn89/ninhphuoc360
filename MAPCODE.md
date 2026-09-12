# BẢN ĐỒ MÃ NGUỒN CHI TIẾT (MAPCODE) — DỰ ÁN NINH PHƯỚC 360°

> **Cập nhật:** 09/2026 (Phiên bản 2.4.0)  
> **Dành cho:** AI Agents, Lập trình viên, Team Lead.  
> **Repository:** [https://github.com/hackervn89/ninhphuoc360](https://github.com/hackervn89/ninhphuoc360)  
> **Website Live:** [https://hackervn89.github.io/ninhphuoc360/](https://hackervn89.github.io/ninhphuoc360/)  
> **Mục đích:** Tra cứu chính xác vị trí dòng code, cấu trúc file, sơ đồ API và luồng dữ liệu mà KHÔNG CẦN đọc lại toàn bộ mã nguồn.

---

## 📂 1. CẤU TRÚC TỆP TIN & THƯ MỤC CHI TIẾT

```
e:\Viet Design\Ninhphuoc360\
├── index.html                           # [PUBLIC UI] Giao diện tour chính cho người dùng (nạp Leaflet + Google Maps)
├── tour.xml                             # [MASTER XML] Cấu hình master KrPano, styles hotspot, includes, native draghotspot
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
│   │   └── app.js                       # (~820 dòng) Logic JS public tour, Google Maps gl=VN, GPS phân cấp, Radar FOV Sync
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
│   ├── nha_tuong_niem_tranthi/          # Địa điểm: Nhà tưởng niệm đồng chí Trần Thi (GPS: 11.5462, 108.9425)
│   │   ├── scenes.xml
│   │   └── panos/
│   └── dinh_lang_van_phuoc/             # Địa điểm: Đình làng Vạn Phước
│       ├── scenes.xml
│       └── panos/
│
└── _dev/                                # [LOCAL VISUAL EDITOR TOOLING - BÀN GIAO CÓ THỂ XÓA]
    ├── server.js                        # (~1,760 dòng) Express Server (REST API, GPS Endpoints, Return Hotspot API, SSE Tiling, Reorder, View/Prealign, Info API)
    ├── editor.html                      # (~5,070 dòng) WYSIWYG Editor GUI (2-Tab Layout, Visual Return Hotspot Placement, View Angle Manager, Sidebar Resizer, Quick Toolbar)
    ├── test_hotspot.html                # Trang test hiển thị thử nghiệm hotspot
    ├── krpano-editor.config             # Config CLI template với %BASENAME% chống đè file
    └── krpano-tools/                    # KrPano CLI Executable & Templates (Loại trừ khỏi Git)
        └── krpanotools64.exe            # Executable cắt tiles tự động
```

---

## 🗺️ 2. BẢN ĐỒ CHI TIẾT DÒNG CODE TRONG CÁC FILE CHÍNH

### 📜 A. `_dev/server.js` (Express Server & REST API — ~1,760 dòng)

| Khoảng dòng | Tên Hàm / Khối | Chức năng & Luồng xử lý |
|-------------|----------------|--------------------------|
| `L1 - L40`  | `Imports & Setup` | Import `express`, `fs`, `path`, `multer`, `child_process`. Cấu hình cổng `3600`, thư mục `PROJECT_ROOT`. |
| `L41 - L80` | `Middleware & Static Routes` | No-cache header, static route `editor.html`, static `PROJECT_ROOT`, cấu hình multer upload temp, `tilingJobs` Map. |
| `L81 - L117` | `escapeRegex()`, `sanitizeTourXmlIncludes()` | Tự động quét `tour.xml` khi khởi động server, xóa các dòng `<include>` rỗng/không tồn tại. |
| `L120 - L180` | `GET /api/scenes` | Quét tất cả các thư mục trong `tours/`, phân tích cú pháp `scenes.xml` trả về danh sách cảnh + **GPS lat/lng riêng** + hotspots + views. |
| `L188 - L200` | `getCustomLocationNames()`, `saveCustomLocationNames()` | Đọc/ghi cấu hình tên hiển thị và tọa độ địa điểm vào `tours/locations.json`. |
| `L204 - L235` | `GET /api/locations` | Đọc `tours/locations.json` và trả về danh sách toàn bộ các địa điểm kèm tọa độ `lat, lng`. |
| `L238 - L258` | `POST /api/locations/rename` | Cập nhật tên hiển thị Tiếng Việt của địa điểm trong `tours/locations.json`. |
| `L260 - L300` | `POST /api/locations/gps` | **Cập nhật GPS Địa điểm**: Lưu tọa độ mặc định chung `{ lat, lng }` vào `tours/locations.json`. |
| `L302 - L372` | `POST /api/scenes/gps` | **Cập nhật GPS Riêng từng Cảnh**: Ghi đè hoặc gỡ bỏ thuộc tính `lat="..." lng="..."` trong thẻ `<scene>` của `scenes.xml`. |
| `L374 - L412` | `POST /api/locations/create` | Tạo mới thư mục địa điểm trong `tours/`, tạo `scenes.xml` khởi tạo và thêm `<include>` vào `tour.xml`. |
| `L414 - L484` | `POST /api/upload-pano-multi` | **Upload Hàng loạt Panorama**: Nhận nhiều file ảnh, lưu tạm và đẩy vào hàng đợi xử lý batch qua SSE. |
| `L486 - L513` | `processBatchJobs()` | Xử lý tuần tự từng ảnh trong batch: gọi `runKrPanoTiling`, `fixScenesXml`, `addIncludeToTourXml` và bắn SSE. |
| `L515 - L555` | `POST /api/scenes/rename` | Đổi title hoặc ID của thẻ `<scene>` trong `scenes.xml`. |
| `L557 - L622` | `POST /api/scenes/reorder` | **Sắp Xếp Thứ Tự Cảnh (Reorder)**: Bóc tách chính xác các thẻ `<scene>` và sắp xếp lại theo thứ tự mảng `orderedSceneIds` trong `scenes.xml`. |
| `L624 - L735` | `POST /api/scenes/move-location` | **Chuyển Địa điểm Cảnh**: Di chuyển thư mục tiles từ địa điểm cũ sang địa điểm mới, cắt `<scene>` cũ và chèn vào `scenes.xml` mới. |
| `L737 - L815` | `POST /api/scenes/delete` | Xóa thẻ `<scene>` khỏi `scenes.xml` và xóa sạch thư mục ảnh tiles liên quan. |
| `L817 - L873` | `POST /api/upload-pano` | Upload đơn lẻ 1 ảnh 360° và tạo tiles. |
| `L875 - L905` | `GET /api/tiling-status/:jobId` | **SSE Endpoint**: Truyền tiến độ cắt tiles realtime (% hoàn thành, scene hiện tại) về cho trình duyệt. |
| `L907 - L952` | `runKrPanoTiling()` | Thực thi `krpanotools64.exe makepano` tạo tiles 4 cấp độ phân giải. |
| `L954 - L984` | `fixScenesXml()` | Đọc thẻ `<scene>` sau khi cắt tiles và gọi `getJpgWidth()` để sửa kích thước tile chuẩn. |
| `L986 - L1084`| `getJpgWidth()` | **Exact Tile Engine**: Bóc tách chính xác độ rộng tile mép (`l1=640`, `l2=1280`, `l3=2560`, `l4=4864`), triệt tiêu khoảng đen ranh giới. |
| `L1093 - L1128`| `addIncludeToTourXml()` | Thêm thẻ `<include url="tours/.../scenes.xml" />` vào `tour.xml` nếu chưa có. |
| `L1134 - L1268`| `POST /api/scenes/save` | **Lưu Hotspots & Tự động Tạo Hotspot Quay Về**: Ghi hotspots vào `scenes.xml`, đồng thời tự động kích hoạt `ensureReturnHotspot()` tạo liên kết 2 chiều. |
| `L1270 - L1297`| `findSceneFilePath(sceneId)` | **Helper định vị file**: Quét tìm chính xác file `tours/.../scenes.xml` chứa `sceneId` trên toàn dự án. |
| `L1299 - L1392`| `ensureReturnHotspot()` | **Helper đồng bộ 2 chiều**: Tự động tính góc đảo 180° (hoặc nhận tọa độ chỉ định) và tạo/cập nhật thẻ `<hotspot>` quay về tại Cảnh B trỏ về Cảnh A. |
| `L1398 - L1429`| `POST /api/scenes/create-return-hotspot` | **API Hotspot Quay Về 2 Chiều**: Tạo hoặc cập nhật tọa độ hotspot quay về ở Cảnh B khi người dùng xác nhận vị trí trong Editor. |
| `L1435 - L1522`| `POST /api/scenes/view` | **Lưu View Mặc Định**: Ghi đè thẻ `<view fovtype="MFOV" hlookat="..." vlookat="..." fov="..." fovmin="..." fovmax="..." />`. |
| `L1528 - L1606`| `POST /api/scenes/prealign` | **Lưu Cân Bằng Độ Nghiêng**: Lưu ma trận xoay 3D `prealign="Pitch|Yaw|Roll"` vào thẻ `<image>` trong `scenes.xml`. |
| `L1612 - L1652`| `DELETE /api/scenes/:sceneId`| Xóa scene qua Restful parameter. |
| `L1660 - L1724`| `GET/POST/DELETE /api/infos` | API Quản lý kho bài viết thuyết minh tĩnh (`tours/infos.json`). |

---

### 🎨 B. `_dev/editor.html` (WYSIWYG Visual Editor — ~5,070 dòng)

| Khoảng dòng | Tên Khối / Hàm | Chức năng & Giao diện |
|-------------|----------------|-----------------------|
| `L13 - L1248`| `CSS Styles` | Toàn bộ giao diện Editor: Dark Theme, Resizer Handle, 2-Tab Navigation, Return Hotspot Placement Banner, Quick Toolbar, Laser Grid Overlay, GPS Modal. |
| `L1255 - L1298`| `#left-sidebar` | Panel quản lý cảnh: Resizer handle `#sidebar-resizer`, Search box + Clear button, Header counter badge (`X cảnh trong Y địa điểm`), Nút Thu gọn/Mở rộng tất cả, Cây thư mục cảnh. |
| `L1300 - L1335`| `#viewport-container` | Top Bar điều khiển, `#pano-wrapper`, Banner Đặt Hotspot Quay Về (`#return-pick-banner`), Khung banner vẽ Polygon, Lưới la-ze xanh cyan (`#horizon-grid-overlay`). |
| `L1338 - L1760`| `#right-panel` | **Bố Cục 2 Tab Độc Lập**: Tab 1 (Hotspots & Thuộc tính) và Tab 2 (Góc nhìn & Cân bằng đường chân trời Prealign). |
| `L1765 - L1820`| `Info Manager Modal` | Hộp thoại quản lý thuyết minh WYSIWYG (nền trắng, bảng chọn màu, định dạng H1/H2/H3, danh sách). |
| `L1823 - L1870`| `GPS Coordinates Modal`| **Hộp Thoại Tọa Độ GPS**: Modal nhập Vĩ độ & Kinh độ cho Địa điểm (📍) hoặc từng Cảnh riêng biệt (🎯). |
| `L1880 - L1965`| `embedpano & injectEditorXML()` | Khởi tạo KrPano Viewer, loại bỏ `loadxml(MERGE)` triệt tiêu lỗi camera bị nhảy về `(0, 0)` khi vào Editor. |
| `L1972 - L2038`| `getSceneDefaultView()`, `updateDefaultViewUI()` | Bóc tách góc nhìn mặc định từ bộ nhớ KrPano (`scene.content` hoặc `xml.view`) và cập nhật thẻ hiển thị thông số đã lưu. |
| `L2067 - L2180`| `detectScenesAndData()` | Bóc tách metadata cảnh và địa điểm, hỗ trợ nhận diện tọa độ riêng của scene hoặc thừa hưởng địa điểm. |
| `L2182 - L2345`| `Scene Drag & Reorder Events` | `handleSceneDragStart`, `handleSceneDragOver`, `handleSceneDrop` (kéo thả đổi thứ tự hoặc chuyển địa điểm). |
| `L2349 - L2397`| `moveSceneOrder()` | **Hàm Đổi Vị Trí Cảnh (Up/Down)**: Tráo đổi vị trí cảnh và gọi API `/api/scenes/reorder` cập nhật tức thì. |
| `L2399 - L2680`| `renderSceneList()` | Hiển thị danh sách cảnh theo cây thư mục có nút **📍 GPS Địa điểm**, **🎯 GPS Cảnh**, **Lên ↑**, **Xuống ↓**, Đổi tên, Xóa. Tối ưu CSS không bị cắt chữ. |
| `L2685 - L2795`| `GPS Handlers` | `promptEditLocationGps()`, `promptEditSceneGps()`, `submitGpsModal()`, `clearSceneCustomGps()`. |
| `L2800 - L2879`| `window.onSceneChange` | Hook chuyển cảnh: Cập nhật camera, đồng bộ thẻ Live View & Default View ở Tab 2, tự động kích hoạt preview ghim quay về nếu ở Return Pick Mode. |
| `L2881 - L3075`| `loadSceneHotspots()` | Nạp hotspots của cảnh hiện tại, hỗ trợ kéo thả mượt mà trên canvas 360°, tự động kích hoạt Tab 1 và hiển thị Quick Toolbar. |
| `L3080 - L3150`| `switchRightSidebarTab()`, `initRightSidebarTabs()` | Quản lý chuyển đổi giữa **Tab 1: HOTSPOTS** và **Tab 2: GÓC NHÌN & CÂN BẰNG**. |
| `L3155 - L3210`| `Mini Quick-Toolbar Module` | Thanh công cụ nổi mini hiển thị ngay trên canvas cạnh hotspot đang chọn (xóa nhanh, đổi loại icon). |
| `L3215 - L3270`| `Click-to-Link Scene Module` | `startPickLinkMode()`, `cancelPickLinkMode()`, `onScenePickedForLink()` (chọn cảnh đích trực tiếp từ sidebar). |
| `L3275 - L3495`| **Visual Return Hotspot Placement** | **Hệ thống Đặt Hotspot Quay Về Trực Quan**: `startReturnPickMode()`, `spawnReturnPreviewHotspot()`, `finishReturnPick()`, `cancelReturnPick()`. |
| `L3624 - L3840`| **Hệ thống Hotspot Đa Giác (Polygon)** | `startPolygonDrawing()`, `renderDraftPolygon()`, `finishPolygonDrawing()`, `renderPolygonInKrpano()`, `renderVertexHandles()`. |
| `L3848 - L4010`| `initSidebarResizer()` & Event Listeners | Kéo dãn thanh bên trái tùy ý (lưu `localStorage`), phím tắt Ctrl+S (lưu hotspot), Esc (hủy chế độ). |
| `L4140 - L4185`| View & Zoom Event Listeners | Xử lý các nút `#btn-save-view`, `#btn-reset-view`, gán nhanh FOV Min/Max theo mức zoom hiện tại. |
| `L4204 - L4250`| `applyLivePrealign()` | Cập nhật `image.prealign` và gọi `updateobject(true, true)` xoay ảnh 360° trực quan realtime. |
| `L4309 - L4365`| `saveCurrentViewAsDefault()` | Lưu góc nhìn hiện tại làm mặc định và đồng bộ trực tiếp vào bộ nhớ KrPano + file XML. |

---

### 🌐 C. `core/js/app.js` (Public Tour Logic — ~820 dòng)

| Khoảng dòng | Tên Khối / Hàm | Chức năng & Luồng xử lý |
|-------------|----------------|--------------------------|
| `L65 - L90`  | `Radar Rotation Loop` | Interval 60ms đọc `view.hlookat` từ KrPano và xoay nón `.map-radar` (tự động nghỉ khi map thu gọn). |
| `L95 - L190` | `buildDynamicTourData()` | Bóc tách cấu trúc tour từ KrPano XML và `locations.json`, nạp tọa độ GPS phân cấp (`scene.lat/lng` $\rightarrow$ `location.lat/lng`). |
| `L195 - L265`| `onSceneChange()` | Hook chuyển cảnh: Cập nhật tiêu đề, di chuyển radar và pan tâm Google Maps đến tọa độ chính xác của scene. |
| `L440 - L535`| `initMapControls()` | Xử lý click thu gọn (48px), phóng to màn hình lớn (`maximized` + `fitBounds`), chọn lớp Đường/Vệ tinh, màn che mờ overlay. |
| `L580 - L705`| `initGoogleMap()` | Khởi tạo Leaflet map với `zoomSnap: 0.1`, nạp 2 lớp Google Maps Tile (`gl=VN` & `hl=vi`), nạp GeoJSON ranh giới xã Ninh Phước, cắm glowing marker và popup chỉ đường. |
| `L715 - L735`| `syncMapToCurrentScene()`| Trượt tâm bản đồ và di chuyển radar đến tọa độ của cảnh đang mở. |

---

### ⚙️ D. `tour.xml` (KrPano Master Configuration — ~525 dòng)

| Khoảng dòng | Tên Thẻ / Action | Chức năng |
|-------------|------------------|-----------|
| `L1 - L40`  | `<skin_settings>` | Cấu hình giao diện chuẩn KrPano (gyro, webvr, maps, layout). |
| `L45 - L210`| `<style name="...">` | Định nghĩa các style Hotspot chuẩn: `muiten`, `vitri`, `tructhang`, `thongtin`. |
| `L490 - L515`| `<include url="tours/.../scenes.xml" />` | Include toàn bộ các file scenes của từng địa điểm trong tour. |
| `L514 - L526`| `<action name="draghotspot">` | **Action Native Kéo Thả Hotspot**: Xử lý biến đổi tọa độ cầu `ath, atv` theo chuyển động chuột cho Visual Editor mà không phụ thuộc `loadxml`. |
| `L528 - L535`| `<action name="startup">` | Tự động tải cảnh đầu tiên khi khởi động tour. |

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
| `POST` | `/api/scenes/save` | `{ sceneId, hotspots: [...] }` | Lưu danh sách hotspot vào `scenes.xml` và tự động đồng bộ return hotspot. |
| `POST` | `/api/scenes/create-return-hotspot` | `{ fromSceneId, toSceneId, ath, atv, style, isExplicitCoords }` | **Tạo hoặc cập nhật Hotspot quay về 2 chiều** ở Cảnh B trỏ ngược lại Cảnh A. |
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
