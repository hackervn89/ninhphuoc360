/**
 * WebXR Bridge for Ninh Phước 360
 * Cung cấp trải nghiệm Thực tế ảo Immersive 360 độ (Full 360°) 
 * chuẩn W3C WebXR Device API dành riêng cho kính VR độc lập (Meta Quest 3, Quest 2, Quest Pro, Pico 4).
 *
 * Tương thích 100% với KrPano 1.19 mà không cần nâng cấp license hay can thiệp vào core engine.
 */

window.WebXRBridge = (function () {
    let manifest = null;
    let isInitialized = false;

    // Three.js Core Objects
    let renderer = null;
    let scene = null;
    let camera = null;
    let xrSession = null;
    let xrRefSpace = null;

    // VR Scene Objects
    let currentCubeTexture = null;
    let hotspotsGroup = null;
    let hudGroup = null;
    let raycaster = null;
    let controllers = [];
    let hoveredObject = null;

    // Gaze Cursor (Head Tracking Reticle Fallback)
    let gazeReticle = null;
    let gazeTarget = null;
    let gazeStartTime = 0;
    const GAZE_DWELL_TIME = 1500; // 1.5 giây

    // State Tracking
    let activeSceneId = '';
    let isTransitioning = false;
    let lastThumbstickTime = 0;

    /**
     * Khởi tạo và nạp dữ liệu manifest các scene 360
     */
    async function init() {
        if (isInitialized) return;
        try {
            const res = await fetch('core/data/vr-scenes-manifest.json?v=' + Date.now());
            if (res.ok) {
                manifest = await res.json();
                isInitialized = true;
                console.log('[WebXRBridge] Đã nạp manifest cho', Object.keys(manifest).length, 'cảnh.');
            }
        } catch (e) {
            console.warn('[WebXRBridge] Không thể tải vr-scenes-manifest.json:', e);
        }
    }

    /**
     * Kiểm tra thiết bị và trình duyệt có hỗ trợ WebXR Immersive-VR không
     */
    async function isSupported() {
        if (!navigator.xr) return false;
        try {
            return await navigator.xr.isSessionSupported('immersive-vr');
        } catch (e) {
            return false;
        }
    }

    /**
     * Kích hoạt phiên WebXR Immersive-VR khi người dùng bấm nút VR
     */
    async function enterVR() {
        if (!navigator.xr) {
            console.warn('[WebXRBridge] WebXR không được hỗ trợ.');
            return false;
        }

        if (!isInitialized) {
            await init();
        }

        if (typeof THREE === 'undefined') {
            console.error('[WebXRBridge] Không tìm thấy thư viện Three.js.');
            return false;
        }

        try {
            // Yêu cầu phiên Immersive-VR với Meta Quest
            const session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            });

            xrSession = session;
            setupThreeJS(session);

            session.addEventListener('end', onSessionEnded);

            // Xác định cảnh hiện tại từ KrPano
            let sceneName = '';
            if (window.krpanoObj) {
                sceneName = window.krpanoObj.get('xml.scene') || '';
            }
            if (!sceneName && manifest) {
                sceneName = Object.keys(manifest)[0] || '';
            }

            // Tải và hiển thị cảnh 360 đầu tiên
            await loadScene(sceneName);

            console.log('[WebXRBridge] Đã vào không gian thực tế ảo WebXR Full 360° thành công!');
            return true;
        } catch (err) {
            console.error('[WebXRBridge] Lỗi khi khởi tạo WebXR Session:', err);
            return false;
        }
    }

    /**
     * Thiết lập Renderer, Camera, Raycaster và Controllers trong Three.js
     */
    function setupThreeJS(session) {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Tạo container WebGL Renderer ẩn để cấp Framebuffer cho WebXR
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');
        renderer.xr.setSession(session);

        raycaster = new THREE.Raycaster();

        // Nhóm chứa các Hotspot và HUD 3D
        hotspotsGroup = new THREE.Group();
        scene.add(hotspotsGroup);

        hudGroup = new THREE.Group();
        scene.add(hudGroup);

        setupControllers();
        setupGazeReticle();
        buildVRHUD();

        // Vòng lặp render chính cho WebXR
        renderer.setAnimationLoop(renderLoop);
    }

    /**
     * Thiết lập tia laser và điểm trỏ cho Meta Quest Touch Controllers
     */
    function setupControllers() {
        controllers = [];

        for (let i = 0; i < 2; i++) {
            const controller = renderer.xr.getController(i);

            // Sự kiện bóp cò (Trigger)
            controller.addEventListener('selectstart', onSelectStart);
            controller.addEventListener('selectend', onSelectEnd);

            // Tạo tia laser hiển thị hướng ngắm
            const laserGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -5)
            ]);
            const laserMat = new THREE.LineBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.6,
                linewidth: 2
            });
            const laser = new THREE.Line(laserGeo, laserMat);
            laser.name = 'laser';
            controller.add(laser);

            // Điểm sáng ở đầu tia laser
            const dotGeo = new THREE.SphereGeometry(0.015, 12, 12);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.z = -5;
            dot.name = 'dot';
            controller.add(dot);

            scene.add(controller);
            controllers.push(controller);
        }
    }

    /**
     * Thiết lập tâm ngắm Reticle (phục vụ người dùng khi không cầm tay cầm)
     */
    function setupGazeReticle() {
        const ringGeo = new THREE.RingGeometry(0.015, 0.025, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
            depthTest: false
        });
        gazeReticle = new THREE.Mesh(ringGeo, ringMat);
        gazeReticle.position.z = -2; // Cách mắt 2 mét
        gazeReticle.renderOrder = 999;
        camera.add(gazeReticle);
        scene.add(camera);
    }

    /**
     * Xây dựng thanh điều khiển Menu nổi 3D (VR Control HUD)
     */
    function buildVRHUD() {
        hudGroup.clear();

        // Tạo bảng HUD nổi ở vị trí thuận tầm mắt
        hudGroup.position.set(0, 1.1, -2.2);
        hudGroup.rotation.x = -0.15; // Hơi nghiêng lên phía mặt

        // Nút Cảnh Trước
        const btnPrev = createVRButton('⬅ Cảnh trước', -0.5, 0, () => navigateRelativeScene(-1));
        hudGroup.add(btnPrev);

        // Bảng tên cảnh hiện tại
        const titleBadge = createVRTextBadge('Ninh Phước 360', 0, 0.12, 0.9, 0.16);
        titleBadge.name = 'hudTitleBadge';
        hudGroup.add(titleBadge);

        // Nút Cảnh Kế
        const btnNext = createVRButton('Cảnh kế ➡', 0.5, 0, () => navigateRelativeScene(1));
        hudGroup.add(btnNext);

        // Nút Thoát VR
        const btnExit = createVRButton('✕ Thoát VR', 0, -0.18, () => exitVR(), 0xff3b30);
        hudGroup.add(btnExit);
    }

    /**
     * Tạo một nút bấm 3D tương tác trong VR
     */
    function createVRButton(text, x, y, onClickCallback, bgColor = 0x0a192f) {
        const width = 0.38;
        const height = 0.12;

        const canvas = document.createElement('canvas');
        canvas.width = 380;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');

        // Vẽ nền bo góc
        ctx.fillStyle = bgColor === 0xff3b30 ? 'rgba(230, 40, 40, 0.85)' : 'rgba(15, 32, 67, 0.85)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 6;
        roundRect(ctx, 4, 4, 372, 112, 24);
        ctx.fill();
        ctx.stroke();

        // Chữ
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 190, 60);

        const texture = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(width, height);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0);
        mesh.userData = { isButton: true, onClick: onClickCallback, text: text, baseScale: 1 };
        return mesh;
    }

    /**
     * Tạo nhãn hiển thị tên cảnh hiện tại trên thanh HUD
     */
    function createVRTextBadge(text, x, y, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(5, 12, 28, 0.9)';
        ctx.strokeStyle = '#ffb300';
        ctx.lineWidth = 6;
        roundRect(ctx, 4, 4, 892, 152, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffb300';
        ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 450, 80);

        const texture = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(width, height);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0);
        mesh.userData = { canvas: canvas, ctx: ctx, texture: texture };
        return mesh;
    }

    function updateVRHUDTitle(title) {
        const badge = hudGroup.getObjectByName('hudTitleBadge');
        if (!badge || !badge.userData.canvas) return;

        const { canvas, ctx, texture } = badge.userData;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(5, 12, 28, 0.9)';
        ctx.strokeStyle = '#ffb300';
        ctx.lineWidth = 6;
        roundRect(ctx, 4, 4, 892, 152, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffb300';
        ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, 450, 80);

        texture.needsUpdate = true;
    }

    /**
     * Tải và áp dụng cảnh 360 độ mới
     */
    async function loadScene(sceneId) {
        if (!manifest || !manifest[sceneId]) {
            console.warn('[WebXRBridge] Không tìm thấy dữ liệu scene:', sceneId);
            return;
        }

        activeSceneId = sceneId;
        const sceneData = manifest[sceneId];

        // Lấy tiêu đề cảnh
        let sceneTitle = sceneId;
        if (window.krpanoObj) {
            sceneTitle = window.krpanoObj.get(`scene[${sceneId}].title`) || sceneId;
        }
        updateVRHUDTitle(sceneTitle);

        // 1. Tải ảnh preview (Cubestrip LFRBUD) siêu nhanh (< 50ms)
        try {
            await loadPreviewCubemap(sceneData.preview);
        } catch (e) {
            console.error('[WebXRBridge] Lỗi khi nạp preview:', e);
        }

        // 2. Cập nhật các Hotspot 3D cho cảnh mới
        updateVRHotspots(sceneId);

        // 3. Nâng cấp chất lượng lên Level 1 Tiles sắc nét trong nền
        if (sceneData.tilesDir) {
            loadHighResTiles(sceneData.tilesDir);
        }
    }

    /**
     * Cắt ảnh preview.jpg (LFRBUD cubestrip) thành 6 mặt CubeTexture cho Three.js
     */
    function loadPreviewCubemap(previewUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const faceSize = img.width; // 256
                const stripOrder = ['l', 'f', 'r', 'b', 'u', 'd'];
                const faceCanvases = {};

                for (let i = 0; i < 6; i++) {
                    const c = document.createElement('canvas');
                    c.width = faceSize;
                    c.height = faceSize;
                    const ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, i * faceSize, faceSize, faceSize, 0, 0, faceSize, faceSize);
                    faceCanvases[stripOrder[i]] = c;
                }

                // Three.js CubeTexture thứ tự: [px, nx, py, ny, pz, nz]
                // px=r, nx=l, py=u, ny=d, pz=b, nz=f
                const cubeTex = new THREE.CubeTexture([
                    faceCanvases.r,
                    faceCanvases.l,
                    faceCanvases.u,
                    faceCanvases.d,
                    faceCanvases.b,
                    faceCanvases.f
                ]);
                cubeTex.needsUpdate = true;
                scene.background = cubeTex;
                currentCubeTexture = cubeTex;
                resolve();
            };
            img.onerror = reject;
            img.src = previewUrl;
        });
    }

    /**
     * Ghép và nâng cấp các mảnh ảnh gạch (Level 1 multires tiles: 640x640)
     */
    async function loadHighResTiles(tilesDir) {
        const faces = ['r', 'l', 'u', 'd', 'b', 'f'];
        const faceCanvases = [];

        try {
            for (const face of faces) {
                const c = document.createElement('canvas');
                c.width = 640;
                c.height = 640;
                const ctx = c.getContext('2d');

                // Nạp 4 mảnh tile của mặt: 01_01, 01_02, 02_01, 02_02
                const p1 = loadImage(`${tilesDir}/${face}/l1/01/l1_${face}_01_01.jpg`);
                const p2 = loadImage(`${tilesDir}/${face}/l1/01/l1_${face}_01_02.jpg`);
                const p3 = loadImage(`${tilesDir}/${face}/l1/02/l1_${face}_02_01.jpg`);
                const p4 = loadImage(`${tilesDir}/${face}/l1/02/l1_${face}_02_02.jpg`);

                const [img1, img2, img3, img4] = await Promise.all([p1, p2, p3, p4]);

                ctx.drawImage(img1, 0, 0);       // 512x512
                ctx.drawImage(img2, 512, 0);     // 128x512
                ctx.drawImage(img3, 0, 512);     // 512x128
                ctx.drawImage(img4, 512, 512);   // 128x128

                faceCanvases.push(c);
            }

            // Cập nhật lại CubeTexture với độ nét cao 640x640
            const hiResCubeTex = new THREE.CubeTexture(faceCanvases);
            hiResCubeTex.needsUpdate = true;
            scene.background = hiResCubeTex;
            currentCubeTexture = hiResCubeTex;
        } catch (e) {
            // Nếu có lỗi nạp tile, vẫn giữ nguyên ảnh preview hoàn chỉnh
            console.warn('[WebXRBridge] Giữ nguyên ảnh preview do lỗi nạp tile sắc nét:', e);
        }
    }

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Không thể nạp: ' + url));
            img.src = url;
        });
    }

    /**
     * Cập nhật các Hotspot 3D trong không gian VR từ KrPano
     */
    function updateVRHotspots(sceneId) {
        hotspotsGroup.clear();
        if (!window.krpanoObj) return;

        const count = Number(window.krpanoObj.get('hotspot.count')) || 0;
        for (let i = 0; i < count; i++) {
            const linkedscene = window.krpanoObj.get(`hotspot[${i}].linkedscene`);
            if (!linkedscene) continue;

            const ath = Number(window.krpanoObj.get(`hotspot[${i}].ath`)) || 0;
            const atv = Number(window.krpanoObj.get(`hotspot[${i}].atv`)) || 0;
            const title = window.krpanoObj.get(`hotspot[${i}].custom_title`) ||
                window.krpanoObj.get(`hotspot[${i}].title`) || 'Xem tiếp';

            const hotspotMesh = create3DHotspot(ath, atv, linkedscene, title);
            hotspotsGroup.add(hotspotMesh);
        }
    }

    /**
     * Tạo một Hotspot 3D nổi dạng vòng tròn phát sáng và biển tên
     */
    function create3DHotspot(ath, atv, linkedscene, title) {
        const group = new THREE.Group();

        // Chuyển đổi tọa độ cầu sang tọa độ 3D Descarte
        const radius = 22; // Khoảng cách 22 mét
        const radAth = ath * (Math.PI / 180);
        const radAtv = atv * (Math.PI / 180);

        const r_h = radius * Math.cos(radAtv);
        const x = r_h * Math.sin(radAth);
        const y = -radius * Math.sin(radAtv);
        const z = -r_h * Math.cos(radAth);

        group.position.set(x, y, z);

        // Vòng tròn định hướng
        const ringGeo = new THREE.RingGeometry(0.8, 1.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2; // Nằm ngang song song mặt đất
        group.add(ringMesh);

        // Biển tên điểm đến
        const labelMesh = createHotspotLabel(title);
        labelMesh.position.y = 1.6;
        group.add(labelMesh);

        // Dữ liệu phục vụ tương tác Raycasting
        group.userData = {
            isHotspot: true,
            linkedscene: linkedscene,
            title: title,
            ringMesh: ringMesh,
            labelMesh: labelMesh,
            baseScale: 1
        };

        return group;
    }

    /**
     * Tạo nhãn chữ nổi cho Hotspot
     */
    function createHotspotLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        // Nền bóng kính bo góc
        ctx.fillStyle = 'rgba(10, 25, 47, 0.85)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 6;
        roundRect(ctx, 4, 4, 504, 152, 24);
        ctx.fill();
        ctx.stroke();

        // Chữ
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 80);

        const texture = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(3.2, 1.0);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        return mesh;
    }

    /**
     * Chuyển cảnh trong VR và đồng bộ với KrPano
     */
    async function switchScene(sceneId) {
        if (isTransitioning || sceneId === activeSceneId) return;
        isTransitioning = true;

        // Báo KrPano nạp cảnh để kích hoạt thuyết minh âm thanh
        if (window.krpanoObj) {
            window.krpanoObj.call(`loadscene(${sceneId}, null, MERGE, BLEND(0.5));`);
        }

        // Tải cảnh 360 trong WebXR
        await loadScene(sceneId);
        isTransitioning = false;
    }

    /**
     * Chuyển sang cảnh tiếp theo hoặc cảnh trước
     */
    function navigateRelativeScene(delta) {
        if (!manifest) return;
        const sceneIds = Object.keys(manifest);
        const currentIndex = sceneIds.indexOf(activeSceneId);
        if (currentIndex < 0) return;

        let nextIndex = (currentIndex + delta + sceneIds.length) % sceneIds.length;
        switchScene(sceneIds[nextIndex]);
    }

    /**
     * Sự kiện bóp cò (Trigger Click) trên tay cầm Meta Quest
     */
    function onSelectStart(event) {
        const controller = event.target;
        raycaster.set(controller.position, controller.getWorldDirection(new THREE.Vector3()).negate());

        // Kiểm tra tương tác với các nút trên HUD hoặc Hotspots
        const interactiveObjects = [];
        hudGroup.traverse(child => {
            if (child.userData && (child.userData.isButton || child.userData.onClick)) {
                interactiveObjects.push(child);
            }
        });
        hotspotsGroup.traverse(child => {
            if (child.userData && child.userData.isHotspot) {
                interactiveObjects.push(child);
            }
        });

        const intersects = raycaster.intersectObjects(interactiveObjects, true);
        if (intersects.length > 0) {
            let hit = intersects[0].object;
            while (hit && !hit.userData.isButton && !hit.userData.isHotspot && hit.parent) {
                hit = hit.parent;
            }

            if (hit && hit.userData) {
                // Rung phản hồi cảm ứng nhẹ trên tay cầm Quest (Haptic Pulse)
                if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                    controller.gamepad.hapticActuators[0].pulse(0.6, 60);
                }

                if (hit.userData.onClick) {
                    hit.userData.onClick();
                } else if (hit.userData.linkedscene) {
                    switchScene(hit.userData.linkedscene);
                }
            }
        }
    }

    function onSelectEnd() { }

    /**
     * Vòng lặp Render chính của WebXR
     */
    function renderLoop(time, frame) {
        // Luôn xoay các Hotspot quay mặt về phía người dùng (Billboard)
        hotspotsGroup.children.forEach(hs => {
            hs.lookAt(camera.position);
        });

        // Kiểm tra tương tác con trỏ và cần gạt Thumbstick trên tay cầm
        handleControllerInteractions();

        // Kiểm tra cơ chế ngắm Gaze Reticle nếu không dùng tay cầm
        handleGazeInteraction(time);

        renderer.render(scene, camera);
    }

    /**
     * Xử lý tương tác tia laser và lướt cần gạt (Thumbstick) trên tay cầm Quest
     */
    function handleControllerInteractions() {
        let anyControllerActive = false;

        controllers.forEach(controller => {
            if (!controller.visible) return;
            anyControllerActive = true;

            const tempMatrix = new THREE.Matrix4();
            tempMatrix.identity().extractRotation(controller.matrixWorld);

            const rayDir = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
            raycaster.set(controller.position, rayDir);

            // Kiểm tra tương tác Raycast
            const targets = [];
            hudGroup.traverse(c => { if (c.userData && (c.userData.isButton || c.userData.onClick)) targets.push(c); });
            hotspotsGroup.traverse(c => { if (c.userData && c.userData.isHotspot) targets.push(c); });

            const hits = raycaster.intersectObjects(targets, true);
            const dot = controller.getObjectByName('dot');

            if (hits.length > 0) {
                const dist = hits[0].distance;
                if (dot) dot.position.z = -dist;

                // Hiệu ứng rê chuột (Hover)
                let hitObj = hits[0].object;
                while (hitObj && !hitObj.userData.isButton && !hitObj.userData.isHotspot && hitObj.parent) {
                    hitObj = hitObj.parent;
                }
                if (hitObj) {
                    hitObj.scale.set(1.15, 1.15, 1.15);
                    hoveredObject = hitObj;
                }
            } else {
                if (dot) dot.position.z = -5;
                if (hoveredObject) {
                    hoveredObject.scale.set(1, 1, 1);
                    hoveredObject = null;
                }
            }

            // Xử lý cần gạt Thumbstick: Gạt sang phải -> Cảnh kế, Gạt sang trái -> Cảnh trước
            if (controller.gamepad && controller.gamepad.axes && controller.gamepad.axes.length >= 4) {
                const stickX = controller.gamepad.axes[2]; // Trục ngang Thumbstick
                const now = Date.now();
                if (now - lastThumbstickTime > 600) {
                    if (stickX > 0.6) {
                        navigateRelativeScene(1);
                        lastThumbstickTime = now;
                    } else if (stickX < -0.6) {
                        navigateRelativeScene(-1);
                        lastThumbstickTime = now;
                    }
                }
            }
        });

        // Nếu có tay cầm hoạt động thì ẩn tâm ngắm Gaze Reticle
        if (gazeReticle) {
            gazeReticle.visible = !anyControllerActive;
        }
    }

    /**
     * Xử lý cơ chế ngắm tự động (Gaze Dwell) khi không cầm tay cầm
     */
    function handleGazeInteraction(time) {
        if (!gazeReticle || !gazeReticle.visible) return;

        raycaster.set(camera.position, camera.getWorldDirection(new THREE.Vector3()));
        const targets = [];
        hudGroup.traverse(c => { if (c.userData && (c.userData.isButton || c.userData.onClick)) targets.push(c); });
        hotspotsGroup.traverse(c => { if (c.userData && c.userData.isHotspot) targets.push(c); });

        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length > 0) {
            let hit = hits[0].object;
            while (hit && !hit.userData.isButton && !hit.userData.isHotspot && hit.parent) {
                hit = hit.parent;
            }

            if (hit !== gazeTarget) {
                gazeTarget = hit;
                gazeStartTime = time;
            } else {
                const elapsed = time - gazeStartTime;
                const progress = Math.min(1.0, elapsed / GAZE_DWELL_TIME);
                gazeReticle.scale.set(1 + progress * 0.5, 1 + progress * 0.5, 1);

                if (elapsed >= GAZE_DWELL_TIME) {
                    // Tự động kích hoạt khi ngắm đủ thời gian
                    if (gazeTarget.userData.onClick) {
                        gazeTarget.userData.onClick();
                    } else if (gazeTarget.userData.linkedscene) {
                        switchScene(gazeTarget.userData.linkedscene);
                    }
                    gazeTarget = null;
                    gazeReticle.scale.set(1, 1, 1);
                }
            }
        } else {
            gazeTarget = null;
            gazeReticle.scale.set(1, 1, 1);
        }
    }

    /**
     * Thoát khỏi chế độ VR
     */
    function exitVR() {
        if (xrSession) {
            xrSession.end();
        }
    }

    /**
     * Xử lý khi phiên WebXR kết thúc
     */
    function onSessionEnded() {
        xrSession = null;
        if (renderer) {
            renderer.setAnimationLoop(null);
        }
        console.log('[WebXRBridge] Đã thoát chế độ VR. Trở về giao diện tour 2D.');
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    return {
        init: init,
        isSupported: isSupported,
        enterVR: enterVR,
        exitVR: exitVR,
        loadScene: switchScene
    };
})();

// Tự động nạp manifest khi script khởi động
document.addEventListener('DOMContentLoaded', () => {
    if (window.WebXRBridge) {
        window.WebXRBridge.init();
    }
});
