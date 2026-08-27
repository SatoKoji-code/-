import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { APP_CONFIG } from "./config.js";
import { modelGroup, loadSequentialTiles } from "./loader.js";
import { MeasurementManager } from "./measurement.js";

// ============================================================
// ===== 追加箇所：固定パス専用メイン処理 開始 =====
// ============================================================

const canvasContainer=document.getElementById("canvasContainer");
const modelStatus=document.getElementById("modelStatus");
const loadingPanel=document.getElementById("loadingPanel");
const loadingText=document.getElementById("loadingText");
const progressBar=document.getElementById("progressBar");

const scene=new THREE.Scene();
scene.background=new THREE.Color(APP_CONFIG.VIEW.background);

const camera=new THREE.PerspectiveCamera(
    APP_CONFIG.VIEW.fov,1,APP_CONFIG.VIEW.near,APP_CONFIG.VIEW.far
);
camera.position.set(5,5,5);

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled=false;
canvasContainer.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.rotateSpeed=APP_CONFIG.VIEW.rotateSpeed;
controls.zoomSpeed=APP_CONFIG.VIEW.zoomSpeed;
controls.panSpeed=APP_CONFIG.VIEW.panSpeed;

scene.add(new THREE.AmbientLight(0xffffff,APP_CONFIG.VIEW.ambientLightIntensity));
scene.add(new THREE.HemisphereLight(0xffffff,0x555555,APP_CONFIG.VIEW.hemisphereLightIntensity));
const directional=new THREE.DirectionalLight(0xffffff,APP_CONFIG.VIEW.directionalLightIntensity);
directional.position.set(10,20,10);
directional.castShadow=false;
scene.add(directional);

scene.add(modelGroup);
if(APP_CONFIG.VIEW.showAxes) scene.add(new THREE.AxesHelper(1));

new MeasurementManager({scene,camera,renderer,controls,modelGroup});

async function autoLoadModels(){
    showLoading("固定パスからGLBを読み込んでいます...");

    try{
        const result=await loadSequentialTiles({
            onStatus:(text)=>{
                modelStatus.textContent=text;
                loadingText.textContent=text;
            },
            onFileLoaded:({fileName,loadedCount})=>{
                modelStatus.textContent=`${loadedCount}個読込済み：${fileName}`;
                progressBar.style.width=`${Math.min(92,12+(loadedCount%12)*7)}%`;
            },
            onComplete:({tileCount})=>{
                modelStatus.textContent=`${tileCount}個のGLBを読み込みました`;
                loadingText.textContent=`読み込み完了：${tileCount}個`;
                progressBar.style.width="100%";
            },
            onError:({number,error})=>{
                console.error(`タイル${number} 読み込みエラー`,error);
            }
        });

        fitCameraToObject(modelGroup);
        document.getElementById("measurementResult").innerHTML=
            `<b>読み込み完了</b><br><br>${result.tileCount}個のGLBを読み込みました。`;
        setTimeout(hideLoading,700);
    }catch(error){
        console.error(error);
        modelStatus.textContent="GLB読み込みエラー";
        loadingText.textContent="読み込みエラー";
        progressBar.style.width="100%";
        document.getElementById("measurementResult").innerHTML=
            `<b>読み込みエラー</b><br><br>${String(error.message||error)}`;
    }
}

function fitCameraToObject(object){
    object.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(object);
    if(box.isEmpty()) return;

    const center=box.getCenter(new THREE.Vector3());
    const size=box.getSize(new THREE.Vector3());
    const maxSize=Math.max(size.x,size.y,size.z,0.001);
    const fov=THREE.MathUtils.degToRad(camera.fov);
    let distance=maxSize/(2*Math.tan(fov/2));
    distance*=1.5;

    camera.position.set(center.x+distance,center.y+distance*0.7,center.z+distance);
    camera.near=Math.max(distance/10000,0.001);
    camera.far=Math.max(distance*100,1000);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
}

function resize(){
    const width=canvasContainer.clientWidth;
    const height=canvasContainer.clientHeight;
    if(width<=0||height<=0) return;
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
}
window.addEventListener("resize",resize);
resize();

function showLoading(text){
    loadingPanel.classList.remove("hidden");
    loadingText.textContent=text;
    progressBar.style.width="8%";
}
function hideLoading(){
    loadingPanel.classList.add("hidden");
}

function animate(){
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene,camera);
}
animate();

// 起動時に固定パスだけを自動読み込み。手動選択機能はありません。
autoLoadModels();

// ============================================================
// ===== 追加箇所：固定パス専用メイン処理 終了 =====
// ============================================================