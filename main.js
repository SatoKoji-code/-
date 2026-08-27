import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { APP_CONFIG } from "./config.js";

import {
    modelGroup,
    loadTilesFromFolder
} from "./loader.js";

import {
    MeasurementManager
} from "./measurement.js";

// ============================================================
// ===== 追加箇所：メイン処理 開始 =====
// ============================================================

const canvasContainer =
    document.getElementById(
        "canvasContainer"
    );

const folderInput =
    document.getElementById(
        "folderInput"
    );

const folderNameElement =
    document.getElementById(
        "folderName"
    );

const modelStatus =
    document.getElementById(
        "modelStatus"
    );

const loadingPanel =
    document.getElementById(
        "loadingPanel"
    );

const loadingText =
    document.getElementById(
        "loadingText"
    );

const progressBar =
    document.getElementById(
        "progressBar"
    );


// ------------------------------------------------------------
// ===== 追加箇所：Three.js Scene =====
// ------------------------------------------------------------

const scene =
    new THREE.Scene();

scene.background =
    new THREE.Color(
        APP_CONFIG.VIEW.background
    );


const camera =
    new THREE.PerspectiveCamera(
        APP_CONFIG.VIEW.fov,
        1,
        APP_CONFIG.VIEW.near,
        APP_CONFIG.VIEW.far
    );

camera.position.set(
    5,
    5,
    5
);


const renderer =
    new THREE.WebGLRenderer({
        antialias:true
    });

renderer.setPixelRatio(
    Math.min(
        window.devicePixelRatio,
        2
    )
);

renderer.shadowMap.enabled = false;

canvasContainer.appendChild(
    renderer.domElement
);


// ------------------------------------------------------------
// ===== 追加箇所：OrbitControls =====
// ------------------------------------------------------------

const controls =
    new OrbitControls(
        camera,
        renderer.domElement
    );

controls.enableDamping = true;

controls.rotateSpeed =
    APP_CONFIG.VIEW.rotateSpeed;

controls.zoomSpeed =
    APP_CONFIG.VIEW.zoomSpeed;

controls.panSpeed =
    APP_CONFIG.VIEW.panSpeed;


// ------------------------------------------------------------
// ===== 追加箇所：ライト =====
// ------------------------------------------------------------

const ambient =
    new THREE.AmbientLight(
        0xffffff,
        APP_CONFIG.VIEW
            .ambientLightIntensity
    );

scene.add(ambient);


const hemisphere =
    new THREE.HemisphereLight(
        0xffffff,
        0x555555,
        APP_CONFIG.VIEW
            .hemisphereLightIntensity
    );

scene.add(hemisphere);


const directional =
    new THREE.DirectionalLight(
        0xffffff,
        APP_CONFIG.VIEW
            .directionalLightIntensity
    );

directional.position.set(
    10,
    20,
    10
);

directional.castShadow = false;

scene.add(directional);


// ------------------------------------------------------------
// ===== 追加箇所：モデルグループ =====
// ------------------------------------------------------------

scene.add(modelGroup);


// ------------------------------------------------------------
// ===== 追加箇所：座標軸表示 =====
// ------------------------------------------------------------

if(APP_CONFIG.VIEW.showAxes){

    const axes =
        new THREE.AxesHelper(1);

    scene.add(axes);
}


// ------------------------------------------------------------
// ===== 追加箇所：測定管理 =====
// ------------------------------------------------------------

const measurementManager =
    new MeasurementManager({
        scene,
        camera,
        renderer,
        controls,
        modelGroup
    });


// ------------------------------------------------------------
// ===== 追加箇所：フォルダ選択イベント =====
// ------------------------------------------------------------

folderInput.addEventListener(
    "change",
    async(event) => {

        const files =
            event.target.files;

        if(!files || files.length === 0){
            return;
        }


        measurementManager.clear();


        const relativePath =
            files[0]
                .webkitRelativePath ||
            files[0]
                .name;

        const firstFolder =
            relativePath.includes("/")
                ? relativePath.split("/")[0]
                : "選択フォルダ";

        folderNameElement.textContent =
            firstFolder;


        showLoading(
            "タイルGLBを検索しています..."
        );


        try{

            const result =
                await loadTilesFromFolder(
                    files,
                    {

                        onStatus:(text) => {

                            modelStatus.textContent =
                                text;

                            loadingText.textContent =
                                text;
                        },

                        onProgress:(ratio) => {

                            setProgress(ratio);
                        },

                        onFileLoaded:({
                            file,
                            number
                        }) => {

                            modelStatus.textContent =
                                `タイル${number} 読み込み完了: ${file.name}`;
                        },

                        onComplete:({
                            tileCount,
                            tiles
                        }) => {

                            modelStatus.textContent =
                                `${tileCount}個のGLBを読み込みました`;

                            loadingText.textContent =
                                `読み込み完了：${tileCount}個`;

                            setProgress(1);
                        },

                        onError:({
                            file,
                            error
                        }) => {

                            console.error(
                                "GLB load error:",
                                file?.name,
                                error
                            );
                        }
                    }
                );


            if(result.tileCount > 0){

                fitCameraToObject(
                    modelGroup
                );

                document
                    .getElementById(
                        "measurementResult"
                    )
                    .innerHTML =
                        "<b>読み込み完了</b><br><br>" +
                        result.tileCount +
                        "個のGLBを読み込みました。";
            }


            setTimeout(
                hideLoading,
                500
            );

        }
        catch(error){

            console.error(error);

            modelStatus.textContent =
                "読み込みエラー";

            loadingText.textContent =
                "読み込みエラー";

            document
                .getElementById(
                    "measurementResult"
                )
                .textContent =
                    error.message;

            setTimeout(
                hideLoading,
                1200
            );
        }
    }
);


// ------------------------------------------------------------
// ===== 追加箇所：カメラ自動フィット =====
// ------------------------------------------------------------

function fitCameraToObject(object){

    object.updateMatrixWorld(true);

    const box =
        new THREE.Box3()
            .setFromObject(object);

    if(box.isEmpty()){
        return;
    }

    const center =
        box.getCenter(
            new THREE.Vector3()
        );

    const size =
        box.getSize(
            new THREE.Vector3()
        );

    const maxSize =
        Math.max(
            size.x,
            size.y,
            size.z
        );

    const safeSize =
        Math.max(
            maxSize,
            0.001
        );

    const fov =
        THREE.MathUtils.degToRad(
            camera.fov
        );

    let distance =
        safeSize /
        (
            2 *
            Math.tan(
                fov / 2
            )
        );

    distance *= 1.5;


    camera.position.set(
        center.x + distance,
        center.y + distance * 0.7,
        center.z + distance
    );

    camera.near =
        Math.max(
            distance / 10000,
            0.001
        );

    camera.far =
        Math.max(
            distance * 100,
            1000
        );

    camera.updateProjectionMatrix();


    controls.target.copy(center);

    controls.update();
}


// ------------------------------------------------------------
// ===== 追加箇所：サイズ変更 =====
// ------------------------------------------------------------

function resize(){

    const width =
        canvasContainer.clientWidth;

    const height =
        canvasContainer.clientHeight;

    if(
        width <= 0 ||
        height <= 0
    ){
        return;
    }

    camera.aspect =
        width / height;

    camera.updateProjectionMatrix();

    renderer.setSize(
        width,
        height,
        false
    );
}


window.addEventListener(
    "resize",
    resize
);

resize();


// ------------------------------------------------------------
// ===== 追加箇所：ロードUI =====
// ------------------------------------------------------------

function showLoading(text){

    loadingPanel
        .classList
        .remove("hidden");

    loadingText.textContent =
        text;

    setProgress(0);
}


function hideLoading(){

    loadingPanel
        .classList
        .add("hidden");
}


function setProgress(ratio){

    const percent =
        THREE.MathUtils.clamp(
            ratio || 0,
            0,
            1
        ) * 100;

    progressBar.style.width =
        percent + "%";
}


// ------------------------------------------------------------
// ===== 追加箇所：描画ループ =====
// ------------------------------------------------------------

function animate(){

    requestAnimationFrame(
        animate
    );

    controls.update();

    renderer.render(
        scene,
        camera
    );
}

animate();

// ============================================================
// ===== 追加箇所：メイン処理 終了 =====
// ============================================================