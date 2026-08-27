import * as THREE from "three";

import { APP_CONFIG } from "./config.js";

// ============================================================
// ===== 追加箇所：測定機能 開始 =====
// ============================================================

export class MeasurementManager{

    constructor({
        scene,
        camera,
        renderer,
        controls,
        modelGroup
    }){

        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;
        this.modelGroup = modelGroup;

        this.raycaster =
            new THREE.Raycaster();

        this.pointer =
            new THREE.Vector2();

        this.mode = null;

        this.points = [];
        this.visualObjects = [];

        this.pointerDownPosition = null;

        this.resultElement =
            document.getElementById(
                "measurementResult"
            );

        this.distanceButton =
            document.getElementById(
                "measureDistanceButton"
            );

        this.bindUI();
    }


    bindUI(){

        document
            .getElementById(
                "measureDistanceButton"
            )
            .addEventListener(
                "click",
                () => this.startDistance()
            );

        document
            .getElementById(
                "measureSizeButton"
            )
            .addEventListener(
                "click",
                () => this.measureSize()
            );

        document
            .getElementById(
                "measureAreaButton"
            )
            .addEventListener(
                "click",
                () => this.measureArea()
            );

        document
            .getElementById(
                "measureVolumeButton"
            )
            .addEventListener(
                "click",
                () => this.measureVolume()
            );

        document
            .getElementById(
                "clearMeasurementButton"
            )
            .addEventListener(
                "click",
                () => this.clear()
            );


        this.renderer.domElement
            .addEventListener(
                "pointerdown",
                (event) => {

                    this.pointerDownPosition = {
                        x: event.clientX,
                        y: event.clientY
                    };
                }
            );


        this.renderer.domElement
            .addEventListener(
                "pointerup",
                (event) => {

                    this.handlePointerUp(event);
                }
            );
    }


    hasModel(){

        return (
            this.modelGroup &&
            this.modelGroup.children.length > 0
        );
    }


    startDistance(){

        if(!this.hasModel()){

            this.show(
                "GLBモデルを先に読み込んでください。"
            );

            return;
        }

        this.mode = "distance";

        this.points = [];

        this.distanceButton
            .classList.add("active");

        this.show(
            "<b>2点距離</b><br><br>1点目をクリックしてください。"
        );
    }


    handlePointerUp(event){

        if(this.mode !== "distance"){
            return;
        }

        if(!this.pointerDownPosition){
            return;
        }

        const dx =
            event.clientX -
            this.pointerDownPosition.x;

        const dy =
            event.clientY -
            this.pointerDownPosition.y;

        const moved =
            Math.sqrt(
                dx * dx +
                dy * dy
            );

        if(
            moved >
            APP_CONFIG.MEASUREMENT.clickMoveTolerance
        ){
            return;
        }

        const point =
            this.pickPoint(event);

        if(!point){
            return;
        }

        this.points.push(point);

        this.createPointMarker(point);


        if(this.points.length === 1){

            this.show(
                "<b>2点距離</b><br><br>1点目を設定しました。<br>2点目をクリックしてください。"
            );

            return;
        }


        if(this.points.length === 2){

            const p1 = this.points[0];
            const p2 = this.points[1];

            this.createLine(p1,p2);

            const distance =
                p1.distanceTo(p2);

            const deltaX =
                Math.abs(p2.x - p1.x);

            const deltaY =
                Math.abs(p2.y - p1.y);

            const deltaZ =
                Math.abs(p2.z - p1.z);

            this.show(
                "<b>2点距離</b><br><br>" +
                "距離： " +
                this.f(distance) +
                " " +
                APP_CONFIG.MEASUREMENT.unit +
                "<br><br>" +

                "ΔX： " +
                this.f(deltaX) +
                " " +
                APP_CONFIG.MEASUREMENT.unit +
                "<br>" +

                "ΔY： " +
                this.f(deltaY) +
                " " +
                APP_CONFIG.MEASUREMENT.unit +
                "<br>" +

                "ΔZ： " +
                this.f(deltaZ) +
                " " +
                APP_CONFIG.MEASUREMENT.unit
            );

            /*
             * 続けて次の2点測定ができる。
             */
            this.points = [];
        }
    }


    pickPoint(event){

        const rect =
            this.renderer.domElement
                .getBoundingClientRect();

        this.pointer.x =
            (
                (
                    event.clientX -
                    rect.left
                ) /
                rect.width
            ) * 2 - 1;

        this.pointer.y =
            -(
                (
                    event.clientY -
                    rect.top
                ) /
                rect.height
            ) * 2 + 1;


        this.raycaster
            .setFromCamera(
                this.pointer,
                this.camera
            );


        const meshes = [];

        this.modelGroup.traverse((child) => {

            if(
                child.isMesh &&
                child.visible
            ){
                meshes.push(child);
            }
        });


        const hits =
            this.raycaster
                .intersectObjects(
                    meshes,
                    false
                );


        if(hits.length === 0){
            return null;
        }


        return hits[0]
            .point
            .clone();
    }


    measureSize(){

        this.stopDistanceMode();

        if(!this.hasModel()){

            this.show(
                "GLBモデルを先に読み込んでください。"
            );

            return;
        }

        this.modelGroup
            .updateMatrixWorld(true);

        const box =
            new THREE.Box3()
                .setFromObject(
                    this.modelGroup
                );

        if(box.isEmpty()){

            this.show(
                "寸法を取得できませんでした。"
            );

            return;
        }

        const size =
            new THREE.Vector3();

        box.getSize(size);

        const u =
            APP_CONFIG.MEASUREMENT.unit;

        this.show(
            "<b>XYZ寸法</b><br><br>" +
            "X： " +
            this.f(size.x) +
            " " +
            u +
            "<br>" +

            "Y： " +
            this.f(size.y) +
            " " +
            u +
            "<br>" +

            "Z： " +
            this.f(size.z) +
            " " +
            u
        );
    }


    measureArea(){

        this.stopDistanceMode();

        if(!this.hasModel()){

            this.show(
                "GLBモデルを先に読み込んでください。"
            );

            return;
        }

        this.modelGroup
            .updateMatrixWorld(true);

        let totalArea = 0;
        let meshCount = 0;

        this.modelGroup.traverse((mesh) => {

            if(
                !mesh.isMesh ||
                !mesh.visible
            ){
                return;
            }

            totalArea +=
                calculateMeshArea(mesh);

            meshCount++;
        });

        const u =
            APP_CONFIG.MEASUREMENT.unit;

        this.show(
            "<b>表面積</b><br><br>" +
            this.f(totalArea) +
            " " +
            u +
            "²" +
            "<br><br>" +
            "対象Mesh数： " +
            meshCount
        );
    }


    measureVolume(){

        this.stopDistanceMode();

        if(!this.hasModel()){

            this.show(
                "GLBモデルを先に読み込んでください。"
            );

            return;
        }

        this.modelGroup
            .updateMatrixWorld(true);

        let totalVolume = 0;
        let meshCount = 0;

        this.modelGroup.traverse((mesh) => {

            if(
                !mesh.isMesh ||
                !mesh.visible
            ){
                return;
            }

            /*
             * 独立した閉じたMeshを想定し、
             * 各Mesh体積の絶対値を合算。
             */
            totalVolume +=
                Math.abs(
                    calculateMeshSignedVolume(
                        mesh
                    )
                );

            meshCount++;
        });


        const u =
            APP_CONFIG.MEASUREMENT.unit;


        this.show(
            "<b>体積</b><br><br>" +
            this.f(totalVolume) +
            " " +
            u +
            "³" +
            "<br><br>" +
            "対象Mesh数： " +
            meshCount +
            "<br><br>" +
            "<small>※正確な体積には閉じたメッシュが必要です。</small>"
        );
    }


    createPointMarker(position){

        const distance =
            this.camera.position
                .distanceTo(position);

        const radius =
            Math.max(
                distance *
                APP_CONFIG.MEASUREMENT.pointSizeRatio,
                0.001
            );

        const geometry =
            new THREE.SphereGeometry(
                radius,
                14,
                14
            );

        const material =
            new THREE.MeshBasicMaterial({
                color:
                    APP_CONFIG.MEASUREMENT.pointColor,
                depthTest:false
            });

        const marker =
            new THREE.Mesh(
                geometry,
                material
            );

        marker.position.copy(position);

        marker.renderOrder = 999;

        this.scene.add(marker);

        this.visualObjects.push(marker);
    }


    createLine(p1,p2){

        const geometry =
            new THREE.BufferGeometry()
                .setFromPoints([
                    p1,
                    p2
                ]);

        const material =
            new THREE.LineBasicMaterial({
                color:
                    APP_CONFIG.MEASUREMENT.lineColor,
                depthTest:false
            });

        const line =
            new THREE.Line(
                geometry,
                material
            );

        line.renderOrder = 999;

        this.scene.add(line);

        this.visualObjects.push(line);
    }


    clear(){

        this.stopDistanceMode();

        this.points = [];

        for(const object of this.visualObjects){

            this.scene.remove(object);

            if(object.geometry){
                object.geometry.dispose();
            }

            if(object.material){
                object.material.dispose();
            }
        }

        this.visualObjects = [];

        this.show(
            "測定結果をクリアしました。"
        );
    }


    stopDistanceMode(){

        this.mode = null;

        this.points = [];

        this.distanceButton
            .classList.remove("active");
    }


    show(html){

        this.resultElement.innerHTML = html;
    }


    f(value){

        return Number(value)
            .toFixed(
                APP_CONFIG.MEASUREMENT.decimals
            );
    }
}


// ------------------------------------------------------------
// ===== 追加箇所：表面積計算 =====
// ------------------------------------------------------------

function calculateMeshArea(mesh){

    const geometry =
        mesh.geometry;

    const position =
        geometry?.attributes?.position;

    if(!position){
        return 0;
    }

    const index =
        geometry.index;

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const cross = new THREE.Vector3();

    let area = 0;


    const addTriangle = (
        i1,
        i2,
        i3
    ) => {

        a.fromBufferAttribute(
            position,
            i1
        ).applyMatrix4(
            mesh.matrixWorld
        );

        b.fromBufferAttribute(
            position,
            i2
        ).applyMatrix4(
            mesh.matrixWorld
        );

        c.fromBufferAttribute(
            position,
            i3
        ).applyMatrix4(
            mesh.matrixWorld
        );

        ab.subVectors(b,a);
        ac.subVectors(c,a);

        cross.crossVectors(ab,ac);

        area +=
            cross.length() * 0.5;
    };


    if(index){

        for(
            let i = 0;
            i + 2 < index.count;
            i += 3
        ){

            addTriangle(
                index.getX(i),
                index.getX(i+1),
                index.getX(i+2)
            );
        }

    }else{

        for(
            let i = 0;
            i + 2 < position.count;
            i += 3
        ){

            addTriangle(
                i,
                i+1,
                i+2
            );
        }
    }


    return area;
}


// ------------------------------------------------------------
// ===== 追加箇所：体積計算 =====
// ------------------------------------------------------------

function calculateMeshSignedVolume(mesh){

    const geometry =
        mesh.geometry;

    const position =
        geometry?.attributes?.position;

    if(!position){
        return 0;
    }

    const index =
        geometry.index;

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    const cross = new THREE.Vector3();

    let volume = 0;


    const addTriangle = (
        i1,
        i2,
        i3
    ) => {

        a.fromBufferAttribute(
            position,
            i1
        ).applyMatrix4(
            mesh.matrixWorld
        );

        b.fromBufferAttribute(
            position,
            i2
        ).applyMatrix4(
            mesh.matrixWorld
        );

        c.fromBufferAttribute(
            position,
            i3
        ).applyMatrix4(
            mesh.matrixWorld
        );

        cross.crossVectors(b,c);

        volume +=
            a.dot(cross) / 6;
    };


    if(index){

        for(
            let i = 0;
            i + 2 < index.count;
            i += 3
        ){

            addTriangle(
                index.getX(i),
                index.getX(i+1),
                index.getX(i+2)
            );
        }

    }else{

        for(
            let i = 0;
            i + 2 < position.count;
            i += 3
        ){

            addTriangle(
                i,
                i+1,
                i+2
            );
        }
    }


    return volume;
}

// ============================================================
// ===== 追加箇所：測定機能 終了 =====
// ============================================================
