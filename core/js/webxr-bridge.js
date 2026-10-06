/**
 * WebXR Bridge for Ninh Phước 360
 * Trải nghiệm Thực tế ảo Immersive 360 độ (Full 360°) chuẩn W3C WebXR
 * Tối ưu hoá đặc biệt cho Meta Quest 3, Quest 2, Quest Pro và Pico 4.
 */

window.WebXRBridge = (function () {
    let manifest = null;
    let isInitialized = false;

    // Three.js Core Objects
    let renderer = null;
    let scene = null;
    let camera = null;
    let xrSession = null;

    // 3D Scene Components
    let hotspotsGroup = null;
    let toastGroup = null;
    let fadeMesh = null;
    let raycaster = null;
    let controllers = [];
    let hoveredHotspot = null;

    // Gaze Cursor (Khi người dùng không cầm tay cầm)
    let gazeReticle = null;
    let gazeTarget = null;
    let gazeStartTime = 0;
    const GAZE_DWELL_TIME = 1500; // 1.5 giây

    // State Tracking
    let activeSceneId = '';
    let isTransitioning = false;
    let lastThumbstickTime = 0;
    let toastHideTimeout = null;

    /**
     * Nạp dữ liệu manifest đã tính toán sẵn 133 cảnh và 556 hotspots
     */
    async function init() {
        if (isInitialized) return;
        try {
            const res = await fetch('core/data/vr-scenes-manifest.json?v=' + Date.now());
            if (res.ok) {
                manifest = await res.json();
                isInitialized = true;
                console.log('[WebXRBridge] Đã nạp manifest cho', Object.keys(manifest).length, 'cảnh với đầy đủ Hotspots.');
            }
        } catch (e) {
            console.warn('[WebXRBridge] Không thể nạp vr-scenes-manifest.json:', e);
        }
    }

    /**
     * Kiểm tra trình duyệt và kính có hỗ trợ WebXR Immersive-VR không
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
     * Bắt đầu phiên thực tế ảo Immersive VR
     */
    async function enterVR() {
        if (!navigator.xr) return false;
        if (!isInitialized) await init();
        if (typeof THREE === 'undefined') return false;

        try {
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

            await loadScene(sceneName, false);
            console.log('[WebXRBridge] Đã vào không gian thực tế ảo WebXR Full 360°!');
            return true;
        } catch (err) {
            console.error('[WebXRBridge] Lỗi khởi tạo WebXR Session:', err);
            return false;
        }
    }

    /**
     * Cấu hình Three.js cho WebXR
     */
    function setupThreeJS(session) {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');
        renderer.xr.setSession(session);

        raycaster = new THREE.Raycaster();

        // Nhóm chứa toàn bộ Hotspots trong cảnh
        hotspotsGroup = new THREE.Group();
        scene.add(hotspotsGroup);

        // Nhóm chứa nhãn thông báo tên cảnh (tự ẩn sau 3.5 giây)
        toastGroup = new THREE.Group();
        scene.add(toastGroup);

        // Màn che chuyển cảnh mượt mà (Fade mesh)
        const fadeGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const fadeMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0,
            depthTest: false
        });
        fadeMesh = new THREE.Mesh(fadeGeo, fadeMat);
        fadeMesh.renderOrder = 9999;
        camera.add(fadeMesh);
        scene.add(camera);

        setupControllers();
        setupGazeReticle();

        renderer.setAnimationLoop(renderLoop);
    }

    /**
     * Cấu hình tia laser định vị cho tay cầm Meta Quest Touch
     */
    function setupControllers() {
        controllers = [];

        for (let i = 0; i < 2; i++) {
            const controller = renderer.xr.getController(i);

            controller.addEventListener('selectstart', onSelectStart);

            // Tia laser mỏng phát sáng
            const laserGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -8)
            ]);
            const laserMat = new THREE.LineBasicMaterial({
                color: 0x00f0ff,
                transparent: true,
                opacity: 0.5,
                linewidth: 2
            });
            const laser = new THREE.Line(laserGeo, laserMat);
            laser.name = 'laser';
            controller.add(laser);

            // Điểm sáng ở đầu tia laser
            const dotGeo = new THREE.SphereGeometry(0.015, 12, 12);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.z = -8;
            dot.name = 'dot';
            controller.add(dot);

            scene.add(controller);
            controllers.push(controller);
        }
    }

    /**
     * Tâm ngắm Reticle (hỗ trợ khi không cầm tay cầm)
     */
    function setupGazeReticle() {
        const ringGeo = new THREE.RingGeometry(0.015, 0.025, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });
        gazeReticle = new THREE.Mesh(ringGeo, ringMat);
        gazeReticle.position.z = -2;
        gazeReticle.renderOrder = 999;
        camera.add(gazeReticle);
    }

    /**
     * Nạp cảnh 360 độ và tạo các Hotspot tương ứng
     */
    async function loadScene(sceneId, useFade = true) {
        if (!manifest || !manifest[sceneId]) {
            console.warn('[WebXRBridge] Không tìm thấy dữ liệu scene:', sceneId);
            return;
        }

        activeSceneId = sceneId;
        const sceneData = manifest[sceneId];

        // Hiệu ứng mờ dần (Fade out) nếu chuyển cảnh
        if (useFade && fadeMesh) {
            await tweenFade(0, 1, 150);
        }

        // 1. Nạp ảnh Cubemap 360 độ (chuẩn LFRBUD)
        try {
            await loadPreviewCubemap(sceneData.preview);
        } catch (e) {
            console.error('[WebXRBridge] Lỗi khi nạp preview cubemap:', e);
        }

        // 2. Hiển thị nhãn thông báo tên cảnh tinh tế (tự biến mất sau 3.5s)
        showSceneToast(sceneData.title || sceneId);

        // 3. Tạo các Hotspot 3D sống động
        createSceneHotspots(sceneData.hotspots || []);

        // Mở sáng trở lại (Fade in)
        if (useFade && fadeMesh) {
            await tweenFade(1, 0, 200);
        }

        // 4. Nâng cấp chất lượng ảnh gạch L1 sắc nét trong nền
        if (sceneData.tilesDir) {
            loadHighResTiles(sceneData.tilesDir);
        }
    }

    /**
     * Cắt ảnh preview.jpg thành 6 mặt CubeTexture theo đúng tọa độ quang học
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

                // Three.js background shader áp dụng flipEnvMap = -1.0 trên trục X:
                // [px=l (bên Trái), nx=r (bên Phải), py=u (Trên), ny=d (Dưới), pz=b (Sau), nz=f (Trước)]
                const cubeTex = new THREE.CubeTexture([
                    faceCanvases.l,
                    faceCanvases.r,
                    faceCanvases.u,
                    faceCanvases.d,
                    faceCanvases.b,
                    faceCanvases.f
                ]);
                cubeTex.needsUpdate = true;
                scene.background = cubeTex;
                resolve();
            };
            img.onerror = reject;
            img.src = previewUrl;
        });
    }

    /**
     * Nạp và ghép các mảnh gạch đa phân giải Level 1 sắc nét (640x640)
     */
    async function loadHighResTiles(tilesDir) {
        const faces = ['l', 'r', 'u', 'd', 'b', 'f'];
        const faceCanvases = [];

        try {
            for (const face of faces) {
                const c = document.createElement('canvas');
                c.width = 640;
                c.height = 640;
                const ctx = c.getContext('2d');

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

            const hiResCubeTex = new THREE.CubeTexture(faceCanvases);
            hiResCubeTex.needsUpdate = true;
            scene.background = hiResCubeTex;
        } catch (e) {
            console.warn('[WebXRBridge] Giữ nguyên ảnh preview do lỗi nạp gạch:', e);
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
     * Tạo các Hotspot 3D sống động từ danh sách đã trích xuất của cảnh
     */
    function createSceneHotspots(hotspotsList) {
        hotspotsGroup.clear();

        hotspotsList.forEach(hs => {
            const mesh = createHotspotBillboard(hs.ath, hs.atv, hs.linkedscene, hs.title);
            hotspotsGroup.add(mesh);
        });
    }

    /**
     * Tạo một Hotspot 3D Billboard luôn hướng mặt về phía người dùng
     */
    function createHotspotBillboard(ath, atv, linkedscene, title) {
        // Đặt ở bán kính 8 mét (khoảng cách tối ưu để nhìn rõ và bấm dễ dàng trong VR)
        const R = 8.0;
        const radAth = ath * (Math.PI / 180);
        const radAtv = atv * (Math.PI / 180);

        const r_h = R * Math.cos(radAtv);
        const x = r_h * Math.sin(radAth);
        const z = -r_h * Math.cos(radAth);
        const y = 1.6 - R * Math.sin(radAtv);

        // Vẽ biểu tượng Hotspot phát sáng trên Canvas 512x512
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        drawHotspotCanvas(ctx, title);

        const texture = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(1.5, 1.5);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.renderOrder = 100;

        mesh.userData = {
            isHotspot: true,
            linkedscene: linkedscene,
            title: title,
            baseScale: 1.0,
            pulseOffset: Math.random() * Math.PI * 2
        };

        return mesh;
    }

    /**
     * Vẽ biểu tượng Hotspot mũi tên phát sáng và biển tên điểm đến
     */
    function drawHotspotCanvas(ctx, title) {
        ctx.clearRect(0, 0, 512, 512);

        const cx = 256;
        const cy = 200;

        // Vòng hào quang phát sáng ngoài
        const gradGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 90);
        gradGlow.addColorStop(0, 'rgba(0, 240, 255, 0.6)');
        gradGlow.addColorStop(0.5, 'rgba(0, 240, 255, 0.2)');
        gradGlow.addColorStop(1, 'rgba(0, 240, 255, 0)');
        ctx.fillStyle = gradGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, 90, 0, Math.PI * 2);
        ctx.fill();

        // Vòng tròn trung tâm
        ctx.fillStyle = 'rgba(10, 25, 47, 0.9)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, 55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Mũi tên chỉ hướng tiến về phía trước (Chevron Arrow)
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 25);
        ctx.lineTo(cx + 25, cy + 5);
        ctx.lineTo(cx + 14, cy + 18);
        ctx.lineTo(cx, cy + 4);
        ctx.lineTo(cx - 14, cy + 18);
        ctx.lineTo(cx - 25, cy + 5);
        ctx.closePath();
        ctx.fill();

        // Biển tên điểm đến bên dưới (Pill badge)
        if (title) {
            ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
            const textMetrics = ctx.measureText(title);
            const badgeW = Math.min(480, Math.max(160, textMetrics.width + 48));
            const badgeH = 64;
            const badgeX = cx - badgeW / 2;
            const badgeY = cy + 75;

            // Nền bóng kính
            ctx.fillStyle = 'rgba(5, 12, 28, 0.9)';
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 4;
            roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
            ctx.fill();
            ctx.stroke();

            // Chữ
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(title, cx, badgeY + badgeH / 2);
        }
    }

    /**
     * Hiển thị bảng tên cảnh thanh lịch nổi phía trên tầm mắt, tự ẩn sau 3.5 giây
     */
    function showSceneToast(title) {
        toastGroup.clear();
        if (toastHideTimeout) clearTimeout(toastHideTimeout);

        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');

        // Nền bóng kính bo tròn góc
        ctx.fillStyle = 'rgba(5, 12, 28, 0.85)';
        ctx.strokeStyle = 'rgba(255, 179, 0, 0.8)';
        ctx.lineWidth = 6;
        roundRect(ctx, 8, 8, 784, 144, 30);
        ctx.fill();
        ctx.stroke();

        // Chữ tên địa danh
        ctx.fillStyle = '#ffb300';
        ctx.font = 'bold 46px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📍 ' + title, 400, 80);

        const texture = new THREE.CanvasTexture(canvas);
        const geo = new THREE.PlaneGeometry(2.0, 0.4);
        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
            depthTest: false
        });

        const mesh = new THREE.Mesh(geo, mat);
        // Đặt ở vị trí cao phía trên tầm nhìn 15 độ, cách 3.5 mét
        mesh.position.set(0, 2.2, -3.5);
        mesh.rotation.x = 0.15;
        mesh.renderOrder = 200;
        toastGroup.add(mesh);

        // Mờ dần và ẩn sau 3.5 giây để trả lại không gian 360° thoáng đãng
        toastHideTimeout = setTimeout(() => {
            let op = 1.0;
            const fadeInterval = setInterval(() => {
                op -= 0.05;
                if (op <= 0) {
                    clearInterval(fadeInterval);
                    toastGroup.clear();
                } else {
                    mat.opacity = op;
                }
            }, 30);
        }, 3500);
    }

    /**
     * Chuyển cảnh trong VR và đồng bộ với KrPano
     */
    async function switchScene(sceneId) {
        if (isTransitioning || sceneId === activeSceneId) return;
        isTransitioning = true;

        // Báo KrPano cập nhật cảnh để kích hoạt giọng thuyết minh âm thanh
        if (window.krpanoObj) {
            window.krpanoObj.call(`loadscene(${sceneId}, null, MERGE, BLEND(0.5));`);
        }

        await loadScene(sceneId, true);
        isTransitioning = false;
    }

    /**
     * Chuyển sang cảnh tiếp theo / cảnh trước bằng cần gạt Thumbstick
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
     * Xử lý bóp cò (Trigger) trên tay cầm Quest
     */
    function onSelectStart(event) {
        const controller = event.target;
        raycaster.set(controller.position, controller.getWorldDirection(new THREE.Vector3()).negate());

        const targets = hotspotsGroup.children;
        const intersects = raycaster.intersectObjects(targets, true);

        if (intersects.length > 0) {
            let hit = intersects[0].object;
            while (hit && !hit.userData.isHotspot && hit.parent) {
                hit = hit.parent;
            }

            if (hit && hit.userData && hit.userData.linkedscene) {
                // Rung phản hồi nhẹ (Haptic pulse) trên tay cầm
                if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                    controller.gamepad.hapticActuators[0].pulse(0.7, 50);
                }
                switchScene(hit.userData.linkedscene);
            }
        }
    }

    /**
     * Vòng lặp Render chính của WebXR
     */
    function renderLoop(time, frame) {
        // 1. Luôn xoay các Hotspot hướng mặt về phía camera (Billboard hoàn hảo, không bao giờ bị dẹp)
        hotspotsGroup.children.forEach(hs => {
            hs.lookAt(camera.position);

            // Hiệu ứng phập phồng nhẹ tạo cảm giác sống động (Pulse animation)
            const pulse = 1 + 0.05 * Math.sin(time * 0.004 + (hs.userData.pulseOffset || 0));
            const targetScale = hs === hoveredHotspot ? 1.25 : pulse;
            hs.scale.set(targetScale, targetScale, 1);
        });

        // 2. Xử lý tương tác tay cầm Quest Touch
        handleControllerInteractions();

        // 3. Xử lý tâm ngắm tự động nếu không dùng tay cầm
        handleGazeInteraction(time);

        renderer.render(scene, camera);
    }

    /**
     * Xử lý tia laser ngắm và cần gạt Thumbstick
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

            const targets = hotspotsGroup.children;
            const hits = raycaster.intersectObjects(targets, true);
            const dot = controller.getObjectByName('dot');

            if (hits.length > 0) {
                const dist = hits[0].distance;
                if (dot) dot.position.z = -dist;

                let hitObj = hits[0].object;
                while (hitObj && !hitObj.userData.isHotspot && hitObj.parent) {
                    hitObj = hitObj.parent;
                }

                if (hitObj && hitObj !== hoveredHotspot) {
                    hoveredHotspot = hitObj;
                    // Rung nhẹ 15ms khi tia laser chạm vào Hotspot
                    if (controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators[0]) {
                        controller.gamepad.hapticActuators[0].pulse(0.3, 15);
                    }
                }
            } else {
                if (dot) dot.position.z = -8;
                if (hoveredHotspot) {
                    hoveredHotspot = null;
                }
            }

            // Gạt cần Thumbstick trên tay cầm: Gạt phải -> Cảnh kế, Gạt trái -> Cảnh trước
            if (controller.gamepad && controller.gamepad.axes && controller.gamepad.axes.length >= 4) {
                const stickX = controller.gamepad.axes[2];
                const now = Date.now();
                if (now - lastThumbstickTime > 500) {
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

        if (gazeReticle) {
            gazeReticle.visible = !anyControllerActive;
        }
    }

    /**
     * Xử lý cơ chế ngắm tự động (Gaze Dwell)
     */
    function handleGazeInteraction(time) {
        if (!gazeReticle || !gazeReticle.visible) return;

        raycaster.set(camera.position, camera.getWorldDirection(new THREE.Vector3()));
        const targets = hotspotsGroup.children;
        const hits = raycaster.intersectObjects(targets, true);

        if (hits.length > 0) {
            let hit = hits[0].object;
            while (hit && !hit.userData.isHotspot && hit.parent) {
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
                    if (gazeTarget.userData && gazeTarget.userData.linkedscene) {
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
     * Hiệu ứng chuyển cảnh mịn màng (Fade transition)
     */
    function tweenFade(fromAlpha, toAlpha, duration) {
        return new Promise(resolve => {
            const startTime = Date.now();
            const step = () => {
                const elapsed = Date.now() - startTime;
                const t = Math.min(1.0, elapsed / duration);
                fadeMesh.material.opacity = fromAlpha + (toAlpha - fromAlpha) * t;
                if (t < 1.0) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            };
            step();
        });
    }

    function onSessionEnded() {
        xrSession = null;
        if (renderer) {
            renderer.setAnimationLoop(null);
        }
        console.log('[WebXRBridge] Đã thoát VR. Trở về giao diện tour 2D.');
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
        loadScene: switchScene
    };
})();

// Tự động nạp manifest khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    if (window.WebXRBridge) {
        window.WebXRBridge.init();
    }
});
