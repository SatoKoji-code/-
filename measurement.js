import * as THREE from "three";
import { APP_CONFIG } from "./config.js";

// ============================================================
// ===== 追加箇所：2点距離測定 改良版 開始 =====
// ============================================================

export class MeasurementManager {
    constructor({ scene, camera, renderer, controls, modelGroup }) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;
        this.modelGroup = modelGroup;

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.raycaster.params.Line.threshold = APP_CONFIG.MEASUREMENT.lineClickThreshold;

        this.mode = null;
        this.pendingPoints = [];
        this.pendingMarkers = [];
        this.measurements = [];
        this.visualObjects = [];
        this.pointerDownPosition = null;
        this.dragState = null;

        this.resultElement = document.getElementById("measurementResult");
        this.distanceButton = document.getElementById("measureDistanceButton");

        this.bindUI();
    }

    bindUI() {
        document.getElementById("measureDistanceButton")
            .addEventListener("click", () => this.startDistance());
        document.getElementById("measureSizeButton")
            .addEventListener("click", () => this.measureSize());
        document.getElementById("measureAreaButton")
            .addEventListener("click", () => this.measureArea());
        document.getElementById("measureVolumeButton")
            .addEventListener("click", () => this.measureVolume());
        document.getElementById("clearMeasurementButton")
            .addEventListener("click", () => this.clear());

        this.renderer.domElement.addEventListener("pointerdown", e => this.onPointerDown(e));
        this.renderer.domElement.addEventListener("pointermove", e => this.onPointerMove(e));
        this.renderer.domElement.addEventListener("pointerup", e => this.onPointerUp(e));
        this.renderer.domElement.addEventListener("pointercancel", e => this.endDrag(e));
    }

    hasModel() {
        return this.modelGroup && this.modelGroup.children.length > 0;
    }

    startDistance() {
        if (!this.hasModel()) {
            this.show("GLBモデルを先に読み込んでください。");
            return;
        }

        this.mode = "distance";
        this.pendingPoints = [];
        this.pendingMarkers = [];
        this.distanceButton.classList.add("active");

        this.show(
            "<b>2点距離</b><br><br>" +
            "1点目をクリックしてください。<br><br>" +
            "<small>作成後：赤い線をクリックすると測定結果を表示します。<br>" +
            "赤い点は後からドラッグして移動できます。</small>"
        );
    }

    // ===== 追加箇所：測定点ドラッグ開始 =====
    onPointerDown(event) {
        this.pointerDownPosition = { x: event.clientX, y: event.clientY };

        const hit = this.pickMeasurementMarker(event);
        if (!hit) return;

        const marker = hit.object;
        const measurement = marker.userData.measurement;
        if (!measurement) return;

        this.dragState = {
            measurement,
            pointIndex: marker.userData.pointIndex,
            marker
        };

        marker.material.color.setHex(APP_CONFIG.MEASUREMENT.activePointColor);
        this.controls.enabled = false;
        this.renderer.domElement.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    // ===== 追加箇所：測定点ドラッグ中 =====
    onPointerMove(event) {
        if (!this.dragState) return;

        const point = this.pickModelPoint(event);
        if (!point) return;

        const { measurement, pointIndex, marker } = this.dragState;
        measurement.points[pointIndex].copy(point);
        marker.position.copy(point);
        this.updateMeasurementLine(measurement);

        this.show("<b>測定点を移動中</b><br><br>マウスを離すと位置を確定します。");
    }

    onPointerUp(event) {
        if (this.dragState) {
            this.endDrag(event);
            this.show(
                "<b>測定点を移動しました。</b><br><br>" +
                "赤い測定線をクリックすると最新の測定結果を表示します。"
            );
            return;
        }

        if (!this.pointerDownPosition) return;

        const dx = event.clientX - this.pointerDownPosition.x;
        const dy = event.clientY - this.pointerDownPosition.y;
        const moved = Math.sqrt(dx * dx + dy * dy);
        if (moved > APP_CONFIG.MEASUREMENT.clickMoveTolerance) return;

        // ===== 追加箇所：線クリック時だけ測定値を表示 =====
        const lineHit = this.pickMeasurementLine(event);
        if (lineHit) {
            this.showMeasurementResult(lineHit.object.userData.measurement);
            return;
        }

        if (this.mode !== "distance") return;

        const point = this.pickModelPoint(event);
        if (!point) return;

        const marker = this.createPointMarker(point);
        this.pendingPoints.push(point.clone());
        this.pendingMarkers.push(marker);

        if (this.pendingPoints.length === 1) {
            this.show("<b>2点距離</b><br><br>1点目を設定しました。<br>2点目をクリックしてください。");
            return;
        }

        if (this.pendingPoints.length === 2) {
            const measurement = this.createMeasurement(
                this.pendingPoints[0],
                this.pendingPoints[1],
                this.pendingMarkers[0],
                this.pendingMarkers[1]
            );

            this.measurements.push(measurement);
            this.pendingPoints = [];
            this.pendingMarkers = [];

            // 数値は作成直後には表示しない
            this.show(
                "<b>測定線を作成しました。</b><br><br>" +
                "赤い線をクリックすると測定結果を表示します。<br>" +
                "赤い点はドラッグして位置を変更できます。"
            );
        }
    }

    endDrag(event) {
        if (!this.dragState) return;
        this.dragState.marker.material.color.setHex(APP_CONFIG.MEASUREMENT.pointColor);
        this.dragState = null;
        this.controls.enabled = true;
        if (event) this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    }

    createMeasurement(point1, point2, marker1, marker2) {
        const measurement = {
            points: [point1.clone(), point2.clone()],
            markers: [marker1, marker2],
            line: null
        };

        marker1.userData.measurement = measurement;
        marker1.userData.pointIndex = 0;
        marker2.userData.measurement = measurement;
        marker2.userData.pointIndex = 1;

        measurement.line = this.createLine(
            measurement.points[0],
            measurement.points[1],
            measurement
        );

        return measurement;
    }

    updateMeasurementLine(measurement) {
        const pos = measurement.line.geometry.attributes.position;
        const p1 = measurement.points[0];
        const p2 = measurement.points[1];
        pos.setXYZ(0, p1.x, p1.y, p1.z);
        pos.setXYZ(1, p2.x, p2.y, p2.z);
        pos.needsUpdate = true;
        measurement.line.geometry.computeBoundingSphere();
    }

    showMeasurementResult(measurement) {
        if (!measurement) return;

        const p1 = measurement.points[0];
        const p2 = measurement.points[1];
        const distance = p1.distanceTo(p2);
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs(p2.y - p1.y);
        const dz = Math.abs(p2.z - p1.z);
        const u = APP_CONFIG.MEASUREMENT.unit;

        this.show(
            "<b>2点距離</b><br><br>" +
            `距離： ${this.f(distance)} ${u}<br><br>` +
            `ΔX： ${this.f(dx)} ${u}<br>` +
            `ΔY： ${this.f(dy)} ${u}<br>` +
            `ΔZ： ${this.f(dz)} ${u}`
        );
    }

    updatePointer(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
    }

    pickModelPoint(event) {
        this.updatePointer(event);
        const meshes = [];
        this.modelGroup.traverse(child => {
            if (child.isMesh && child.visible) meshes.push(child);
        });
        const hits = this.raycaster.intersectObjects(meshes, false);
        return hits.length ? hits[0].point.clone() : null;
    }

    pickMeasurementMarker(event) {
        this.updatePointer(event);
        const markers = this.measurements.flatMap(m => m.markers).filter(Boolean);
        const hits = this.raycaster.intersectObjects(markers, false);
        return hits.length ? hits[0] : null;
    }

    pickMeasurementLine(event) {
        this.updatePointer(event);
        const lines = this.measurements.map(m => m.line).filter(Boolean);
        const hits = this.raycaster.intersectObjects(lines, false);
        return hits.length ? hits[0] : null;
    }

    createPointMarker(position) {
        const distance = this.camera.position.distanceTo(position);
        const radius = Math.max(
            distance * APP_CONFIG.MEASUREMENT.pointSizeRatio,
            0.001
        );

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 16, 16),
            new THREE.MeshBasicMaterial({
                color: APP_CONFIG.MEASUREMENT.pointColor,
                depthTest: false
            })
        );

        marker.position.copy(position);
        marker.renderOrder = 1001;
        this.scene.add(marker);
        this.visualObjects.push(marker);
        return marker;
    }

    createLine(p1, p2, measurement) {
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([p1, p2]),
            new THREE.LineBasicMaterial({
                color: APP_CONFIG.MEASUREMENT.lineColor,
                depthTest: false
            })
        );

        line.renderOrder = 1000;
        line.userData.measurement = measurement;
        this.scene.add(line);
        this.visualObjects.push(line);
        return line;
    }

    measureSize() {
        this.stopDistanceMode();
        if (!this.hasModel()) return this.show("GLBモデルを先に読み込んでください。");

        this.modelGroup.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.modelGroup);
        if (box.isEmpty()) return this.show("寸法を取得できませんでした。");

        const size = box.getSize(new THREE.Vector3());
        const u = APP_CONFIG.MEASUREMENT.unit;
        this.show(
            `<b>XYZ寸法</b><br><br>X： ${this.f(size.x)} ${u}<br>` +
            `Y： ${this.f(size.y)} ${u}<br>Z： ${this.f(size.z)} ${u}`
        );
    }

    measureArea() {
        this.stopDistanceMode();
        if (!this.hasModel()) return this.show("GLBモデルを先に読み込んでください。");

        this.modelGroup.updateMatrixWorld(true);
        let total = 0;
        let count = 0;
        this.modelGroup.traverse(mesh => {
            if (!mesh.isMesh || !mesh.visible) return;
            total += calculateMeshArea(mesh);
            count++;
        });

        const u = APP_CONFIG.MEASUREMENT.unit;
        this.show(`<b>表面積</b><br><br>${this.f(total)} ${u}²<br><br>対象Mesh数： ${count}`);
    }

    measureVolume() {
        this.stopDistanceMode();
        if (!this.hasModel()) return this.show("GLBモデルを先に読み込んでください。");

        this.modelGroup.updateMatrixWorld(true);
        let total = 0;
        let count = 0;
        this.modelGroup.traverse(mesh => {
            if (!mesh.isMesh || !mesh.visible) return;
            total += Math.abs(calculateMeshSignedVolume(mesh));
            count++;
        });

        const u = APP_CONFIG.MEASUREMENT.unit;
        this.show(
            `<b>体積</b><br><br>${this.f(total)} ${u}³<br><br>` +
            `対象Mesh数： ${count}<br><br>` +
            `<small>※正確な体積には閉じたメッシュが必要です。</small>`
        );
    }

    clear() {
        this.stopDistanceMode();
        this.endDrag();
        this.pendingPoints = [];
        this.pendingMarkers = [];

        for (const object of this.visualObjects) {
            this.scene.remove(object);
            object.geometry?.dispose();
            object.material?.dispose();
        }

        this.visualObjects = [];
        this.measurements = [];
        this.show("測定結果をクリアしました。");
    }

    stopDistanceMode() {
        this.mode = null;
        this.pendingPoints = [];
        this.pendingMarkers = [];
        this.distanceButton.classList.remove("active");
    }

    show(html) {
        this.resultElement.innerHTML = html;
    }

    f(value) {
        return Number(value).toFixed(APP_CONFIG.MEASUREMENT.decimals);
    }
}

function calculateMeshArea(mesh) {
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    if (!position) return 0;

    const index = geometry.index;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let area = 0;

    const add = (i1, i2, i3) => {
        a.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, i3).applyMatrix4(mesh.matrixWorld);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        cross.crossVectors(ab, ac);
        area += cross.length() * 0.5;
    };

    if (index) {
        for (let i = 0; i + 2 < index.count; i += 3) {
            add(index.getX(i), index.getX(i + 1), index.getX(i + 2));
        }
    } else {
        for (let i = 0; i + 2 < position.count; i += 3) add(i, i + 1, i + 2);
    }

    return area;
}

function calculateMeshSignedVolume(mesh) {
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    if (!position) return 0;

    const index = geometry.index;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let volume = 0;

    const add = (i1, i2, i3) => {
        a.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, i3).applyMatrix4(mesh.matrixWorld);
        cross.crossVectors(b, c);
        volume += a.dot(cross) / 6;
    };

    if (index) {
        for (let i = 0; i + 2 < index.count; i += 3) {
            add(index.getX(i), index.getX(i + 1), index.getX(i + 2));
        }
    } else {
        for (let i = 0; i + 2 < position.count; i += 3) add(i, i + 1, i + 2);
    }

    return volume;
}

// ============================================================
// ===== 追加箇所：2点距離測定 改良版 終了 =====
// ============================================================