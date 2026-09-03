# Cẩm nang kỹ thuật & Quy trình triển khai: Leaflet Minimap cho Virtual Tour 360

> **Tài liệu đào tạo nội bộ:** Hướng dẫn nhân viên mới về nguyên lý hoạt động, cấu trúc mã nguồn và quy trình 5 bước xây dựng module bản đồ vệ tinh (Leaflet Minimap) tương tác với KrPano Engine.

---

## 1. TỔNG QUAN KIẾN TRÚC VÀ NGUYÊN LÝ HOẠT ĐỘNG

### 1.1. Mô hình Decoupled UI (Tách lớp độc lập)
Dự án áp dụng kiến trúc tách lớp hoàn toàn giữa lõi hiển thị 3D và giao diện điều khiển:
* **Lớp Engine 3D (KrPano)**: Nằm ở dưới cùng (`#pano`), chỉ phụ trách xoay ảnh panorama 360°, xử lý trường nhìn WebGL và các Hotspot không gian 3D.
* **Lớp Giao diện (HTML/CSS/JS Overlay)**: Phủ bên trên `#ui-layer` với `pointer-events: none` (cho phép chuột thao tác xuyên qua để xoay ảnh 360), riêng các module như Menu, Minimap, Popup thì đặt `pointer-events: auto`.
* **Minimap (Leaflet.js)**: Chạy hoàn toàn trên tầng Web UI và giao tiếp 2 chiều với KrPano thông qua **Javascript Interface API**.

```
┌──────────────────────────────────────────────────────────┐
│  LỚP WEB UI (HTML / CSS Glassmorphism / Vanilla JS)       │
│  ├── Sidebar Accordion                                   │
│  ├── Info Modal                                          │
│  └── LEAFLET MINIMAP (Bản đồ vệ tinh + Radar + Marker)    │
│       ▲                                            │     │
│       │ (2) onSceneChange (GPS/Heading)            │ (1) loadscene(sceneId)
│       ▼                                            ▼     │
├──────────────────────────────────────────────────────────┤
│  LỚP KRPANO ENGINE (tour.xml + scenes.xml + panos/)      │
│  Render Panorama 360°, WebGL, Hotspots 3D                │
└──────────────────────────────────────────────────────────┘
```

---

### 1.2. Các chức năng cốt lõi của Minimap
1. **Định vị không gian thực tế**: Hiển thị bản đồ ảnh vệ tinh độ nét cao kết hợp đường viền ranh giới hành chính (GeoJSON).
2. **Chấm vị trí phát sáng (Glowing Marker)**: Đánh dấu các điểm chụp 360 trên bản đồ kèm nhãn tên (Tooltip).
3. **Điều hướng tương tác (Click-to-Teleport)**: Nhấp vào điểm trên bản đồ để chuyển thẳng tới cảnh 360 tương ứng (`loadscene`).
4. **Đồng bộ hướng nhìn thời gian thực (Radar FOV)**: Hình quạt nón quét trên bản đồ xoay liên tục theo hướng người xem đang nhìn trong ảnh 360 (`view.hlookat`).
5. **Đồng bộ chuyển cảnh 2 chiều**: Khi người dùng di chuyển trong ảnh 360 qua Hotspot hoặc Menu, tâm bản đồ và Radar tự động nhảy sang tọa độ của cảnh mới.
6. **Lazy Loading & Responsive**: Chỉ nạp và tải tile bản đồ khi người dùng mở panel, hỗ trợ chế độ xem toàn màn hình (Maximize) trên mobile và desktop.

---

## 2. CÁC THÀNH PHẦN KỸ THUẬT CẤU THÀNH (TECH STACK)

| Thành phần | Công nghệ / Nguồn | Vai trò trong dự án |
| :--- | :--- | :--- |
| **Bản đồ nền** | [Leaflet.js](https://leafletjs.com/) v1.9.4 | Thư viện Map mã nguồn mở nhẹ, mượt, không phụ thuộc Google Maps API key có tính phí. |
| **Ảnh vệ tinh** | **Esri World Imagery** TileServer | Bản đồ vệ tinh chụp từ không gian sắc nét, màu sắc chân thực và sang trọng. |
| **Nhãn địa danh** | **CartoDB Light Only Labels** TileServer | Phủ tên đường, tên địa danh màu trắng mờ lên nền ảnh vệ tinh. |
| **Ranh giới khu vực** | **GeoJSON** (Overpass Turbo / OSM) | Vẽ viền ranh giới địa phận (màu vàng gold `dashArray` nét đứt). |
| **Radar quét hướng** | Leaflet `L.divIcon` + CSS Shape | Con trỏ hình nón quét góc nhìn xoay theo `view.hlookat`. |
| **Marker phát sáng** | Leaflet `L.divIcon` + CSS Pulse Animation | Điểm tròn phát xung ánh sáng thu hút tương tác. |

---

## 3. QUY TRÌNH 5 BƯỚC TRIỂN KHAI CHO NHÂN VIÊN MỚI

---

### BƯỚC 1: Thu thập tọa độ GPS và Ranh giới (GeoData)

1. **Lấy tọa độ từng Scene (`lat`, `lng`)**:
   * *Cách 1 (Tự động)*: Lấy từ Exif GPS của ảnh chụp Flycam/Drone hoặc camera 360.
   * *Cách 2 (Thủ công)*: Mở [Google Maps](https://maps.google.com), nhấp chuột phải vào đúng vị trí chụp $\rightarrow$ Copy tọa độ (Ví dụ: `11.781682, 109.073644`).
   * *Lưu ý*: Với các tour có nhiều ảnh chi tiết ở cùng 1 phòng/sân nhỏ, có thể chỉ cần gán tọa độ cho ảnh chính đại diện hoặc dùng chung tọa độ cụm.

2. **Chuẩn bị file ranh giới GeoJSON (Nếu có)**:
   * Truy cập [Overpass Turbo](https://overpass-turbo.eu/) hoặc [geojson.io](https://geojson.io/).
   * Vẽ hoặc export ranh giới địa phận hành chính xã/dự án $\rightarrow$ Lưu file vào thư mục `core/data/conghai-boundary.json`.

---

### BƯỚC 2: Cấu trúc HTML & Nạp thư viện không chặn tải trang (Non-blocking)

Trong `index.html`:

1. **Nạp Leaflet theo cơ chế Lazy/Preload**:
```html
<!-- Preload CSS không gây nghẽn First Contentful Paint -->
<link rel="preload" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" as="style"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""
    onload="this.onload=null;this.rel='stylesheet'">
<noscript>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
</noscript>

<!-- Script Leaflet chạy với thuộc tính defer -->
<script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
```

2. **Khung DOM của Map Panel**:
```html
<!-- Màn che làm mờ khi phóng to bản đồ -->
<div id="map-maximized-overlay" style="display:none;"></div>

<!-- Khung bản đồ góc dưới phải -->
<div id="map-panel" class="glass-panel collapsed">
    <div id="map-header">
        <svg viewBox="0 0 24 24">
            <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
        </svg>
        <span>Bản đồ vị trí</span>
        <button id="btn-maximize-map" title="Phóng to bản đồ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
        </button>
        <button id="btn-toggle-map">▼</button>
    </div>
    <div id="map-container"></div>
</div>
```

---

### BƯỚC 3: Tạo hiệu ứng CSS cho Map, Marker và Radar

Trong `core/css/style.css`:

```css
/* 1. Khung Map Panel Glassmorphism */
#map-panel {
    position: absolute;
    bottom: calc(20px + var(--safe-bottom));
    right: calc(20px + var(--safe-right));
    width: 280px;
    height: 240px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(12px);
    transition: all 0.5s cubic-bezier(0.165, 0.84, 0.44, 1);
}

/* Trạng thái thu gọn */
#map-panel.collapsed {
    height: 48px;
}

/* Trạng thái phóng to toàn màn hình */
#map-panel.maximized {
    position: fixed;
    width: 80vw;
    height: 80vh;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2000;
    border-radius: 24px;
}

/* 2. Điểm đánh dấu phát sáng (Glowing Marker) */
.glowing-marker {
    width: 10px;
    height: 10px;
    background: var(--primary, #0088cc);
    border-radius: 50%;
    border: 2px solid #fff;
    position: relative;
    box-shadow: 0 0 10px rgba(0, 136, 204, 0.8);
}

.glowing-marker::before {
    content: '';
    position: absolute;
    inset: -10px;
    background: rgba(0, 136, 204, 0.4);
    border-radius: 50%;
    animation: pulse-marker 2s infinite;
    z-index: -1;
}

@keyframes pulse-marker {
    0% {
        transform: scale(0.5);
        opacity: 1;
    }
    100% {
        transform: scale(2.5);
        opacity: 0;
    }
}

/* 3. Radar quét góc nhìn (Hình nón vàng) */
.map-radar {
    width: 0;
    height: 0;
    border-left: 20px solid transparent;
    border-right: 20px solid transparent;
    border-top: 50px solid rgba(255, 191, 0, 0.45); /* Màu vàng trong suốt */
    position: absolute;
    top: -50px;
    left: -20px;
    transform-origin: 50% 100%; /* Trọng tâm xoay tại chân nón */
    pointer-events: none;
    z-index: 1000;
}

.map-radar::after {
    content: '';
    position: absolute;
    top: -4px;
    left: -4px;
    width: 8px;
    height: 8px;
    background: #fff;
    border: 2px solid #FFD700;
    border-radius: 50%;
}

/* 4. Tooltip nhãn tên cảnh khi hover */
.custom-map-tooltip {
    background: rgba(10, 15, 30, 0.85) !important;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 8px !important;
    color: #fff !important;
    font-size: 13px !important;
    font-weight: 600 !important;
}
```

---

### BƯỚC 4: Khai báo Dữ liệu Registry (`tourData`)

Trong `core/js/app.js`, nhân viên khai báo danh sách scene và tọa độ:

```javascript
const tourData = {
    toanCanh: {
        label: 'Toàn cảnh Công Hải',
        scenes: [
            { 
                id: 'scene_toancanhconghai', 
                title: 'Toàn cảnh Công Hải', 
                mapTitle: 'Toàn cảnh xã Công Hải', // Tên hiển thị trên tooltip bản đồ
                thumb: 'tours/toanCanh/panos/toancanhconghai.tiles/thumb.jpg', 
                lat: 11.781682, 
                lng: 109.073644 
            },
            { 
                id: 'scene_toancanhtrusoUBND', 
                title: 'Trụ sở UBND', 
                thumb: 'tours/toanCanh/panos/toancanhtrusoUBND.tiles/thumb.jpg', 
                lat: 11.781356, 
                lng: 109.072723 
            }
        ]
    },
    chuaLongCat: {
        label: 'Chùa Long Cát',
        scenes: [
            { 
                id: 'scene_1-cong_chinh', 
                title: 'Cổng chính', 
                mapTitle: 'Chùa Long Cát', 
                thumb: 'tours/chuaLongCat/panos/1-cong_chinh.tiles/thumb.jpg', 
                lat: 11.777472, 
                lng: 109.079204 
            }
        ]
    }
};
```

---

### BƯỚC 5: Logic Khởi tạo và Đồng bộ 2 chiều (Core JS)

1. **Lazy Initialization (Chỉ tạo Map khi người dùng mở panel)**:
```javascript
let leafMap = null;
let radarMarker = null;
let mapMarkers = [];
let isMapInitializing = false;

function ensureMapInitialized() {
    if (leafMap || isMapInitializing) return;
    isMapInitializing = true;

    // Kiểm tra thư viện Leaflet đã nạp xong chưa (do dùng script defer)
    if (!window.L) {
        setTimeout(() => {
            isMapInitializing = false;
            ensureMapInitialized();
        }, 200);
        return;
    }

    initMap();
    isMapInitializing = false;
    setTimeout(() => leafMap.invalidateSize(), 50);
    onSceneChange(); // Đồng bộ vị trí cảnh hiện tại ngay khi vừa khởi tạo
}
```

2. **Khởi tạo Bản đồ, Lớp vệ tinh, Ranh giới và Marker**:
```javascript
function initMap() {
    // 1. Tạo Map instance
    leafMap = L.map('map-container', {
        zoomControl: false,
        attributionControl: false
    }).setView([11.7818, 109.0738], 15);

    // 2. Thêm lớp ảnh vệ tinh Esri
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
    }).addTo(leafMap);

    // 3. Thêm lớp nhãn địa danh CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        opacity: 0.6
    }).addTo(leafMap);

    // 4. Nạp đường bao ranh giới GeoJSON
    fetch('core/data/conghai-boundary.json')
        .then(res => res.json())
        .then(data => {
            L.geoJSON(data, {
                style: {
                    color: '#FFD700',
                    weight: 2,
                    opacity: 0.8,
                    fillColor: '#FFD700',
                    fillOpacity: 0.08,
                    dashArray: '8, 8'
                }
            }).addTo(leafMap);
        }).catch(err => console.log('Không có file boundary GeoJSON'));

    // 5. Tạo Marker Radar hình quạt
    const radarIcon = L.divIcon({
        className: 'map-radar-wrapper',
        html: '<div class="map-radar"></div>',
        iconSize: [0, 0]
    });
    radarMarker = L.marker([11.7818, 109.0738], { icon: radarIcon }).addTo(leafMap);

    // 6. Tạo Marker cho tất cả scene có tọa độ
    const glowingIcon = L.divIcon({
        className: 'glowing-marker-wrapper',
        html: '<div class="glowing-marker"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    Object.values(tourData).forEach(group => {
        group.scenes.forEach(scene => {
            if (scene.lat && scene.lng) {
                const marker = L.marker([scene.lat, scene.lng], { icon: glowingIcon }).addTo(leafMap);
                
                // Tooltip tên địa điểm
                marker.bindTooltip(scene.mapTitle || scene.title, {
                    direction: 'top',
                    offset: [0, -10],
                    className: 'custom-map-tooltip'
                });

                // Sự kiện Click Marker -> Nhảy Scene KrPano
                marker.on('click', () => {
                    if (krpanoObj) {
                        krpanoObj.call(`loadscene('${scene.id}', null, MERGE, BLEND(0.5))`);
                        
                        // Tự động thu gọn bản đồ sau khi chọn điểm
                        const mapPanel = document.getElementById('map-panel');
                        if (mapPanel) {
                            mapPanel.classList.add('collapsed');
                            mapPanel.classList.remove('maximized');
                        }
                    }
                });

                mapMarkers.push({ id: scene.id, marker });
            }
        });
    });
}
```

3. **Đồng bộ Radar xoay theo góc nhìn KrPano (`view.hlookat`)**:
```javascript
// Đặt trong hàm krpanoReady()
setInterval(() => {
    if (krpanoObj && radarMarker) {
        let ath = Number(krpanoObj.get("view.hlookat")) || 0;
        // Chuẩn hóa góc quay về khoảng -180 đến +180 độ
        ath = ((ath + 180) % 360 + 360) % 360 - 180;

        const radarEl = document.querySelector('.map-radar');
        if (radarEl) {
            radarEl.style.transform = `rotate(${ath}deg)`;
        }
    }
}, 100);
```

4. **Đồng bộ vị trí khi Scene thay đổi (`onSceneChange`)**:
```javascript
function onSceneChange() {
    if (!krpanoObj) return;
    const sceneId = krpanoObj.get("xml.scene");
    if (!sceneId) return;

    // Tìm dữ liệu scene trong tourData
    let activeScene = null;
    for (const data of Object.values(tourData)) {
        const found = data.scenes.find(s => s.id === sceneId);
        if (found) { activeScene = found; break; }
    }

    // Nếu scene có tọa độ -> Cập nhật tâm bản đồ và vị trí Radar
    if (leafMap && activeScene && activeScene.lat) {
        const pos = [activeScene.lat, activeScene.lng];
        leafMap.setView(pos, 16);
        if (radarMarker) radarMarker.setLatLng(pos);
    }
}
```

---

## 4. BẢNG TỔNG HỢP CÁC LỖI THƯỜNG GẶP & CÁCH KHẮC PHỤC (GOTCHAS)

| STT | Hiện tượng lỗi | Nguyên nhân | Cách xử lý chuẩn |
| :---: | :--- | :--- | :--- |
| **1** | Bản đồ bị xám xịt / load thiếu tile khi vừa mở panel hoặc vừa maximize | Kích thước container `#map-container` bị thay đổi qua CSS transition nhưng Leaflet chưa kịp vẽ lại khung canvas. | Luôn gọi `leafMap.invalidateSize()` sau khoảng thời gian `setTimeout(..., 50)` hoặc sau khi animation transition hoàn tất. |
| **2** | Nhấp chuột vào Minimap bị nhảy góc quay 360 ở sau | Bị hiện tượng click-through (xuyên lớp) do container chưa chặn sự kiện. | Đảm bảo `#map-panel` có thuộc tính CSS `pointer-events: auto;` và z-index lớn hơn `#pano`. |
| **3** | Radar bị lệch tâm xoay khi quay | CSS `transform-origin` chưa được gán tại đỉnh nhọn chân nón. | Bắt buộc khai báo `transform-origin: 50% 100%;` cho class `.map-radar`. |
| **4** | Marker không hiển thị đúng chỗ | Tọa độ `lat` và `lng` bị đảo ngược thứ tự (Ví dụ: truyền `[lng, lat]` thay vì `[lat, lng]`). | Trong Leaflet, định dạng chuẩn luôn là **`[Vĩ độ (Latitude), Kinh độ (Longitude)]`** (Việt Nam có Lat $\approx 10-23$, Lng $\approx 102-109$). |
| **5** | Đứng ở cảnh mới nhưng Radar vẫn ở chỗ cũ | Scene trong `tourData` chưa được điền trường `lat` và `lng` (hoặc đặt giá trị `0, 0`). | Bổ sung đầy đủ tọa độ thực tế cho scene đó trong `tourData`. |
| **6** | Bản đồ bị thanh điều hướng tai thỏ / thanh vuốt iOS che mất | Chưa áp dụng vùng an toàn (Safe Area Insets) của iOS. | Sử dụng `bottom: calc(20px + var(--safe-bottom))` với `--safe-bottom: env(safe-area-inset-bottom, 0px)`. |

---

## 5. CHECKLIST KIỂM THỬ DÀNH CHO NHÂN VIÊN MỚI TRƯỚC KHI BÀN GIAO

- [ ] Tất cả các cảnh chính đều có `lat`, `lng` hợp lệ (không để `0, 0`).
- [ ] Nhấp vào Marker bất kỳ trên bản đồ: Tour chuyển đúng cảnh mượt mà (`BLEND(0.5)`).
- [ ] Xoay chuột trong tour 360: Con trỏ Radar trên bản đồ quay đồng bộ theo thời gian thực.
- [ ] Di chuyển scene bằng Hotspot 3D: Bản đồ tự trượt tâm (`setView`) và dời Radar tới vị trí mới.
- [ ] Đóng/mở và Phóng to bản đồ (`#btn-maximize-map`): Bản đồ render đủ tile, không bị vỡ hoặc xám nền.
- [ ] Kiểm tra hiển thị tốt trên cả Desktop và Điện thoại di động (iOS / Android).
