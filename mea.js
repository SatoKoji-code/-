============================================================
【01_config.js】
============================================================

export const APP_CONFIG = {
    MODEL: {
        folderPath: "./models/",
        tileName: "タイル",
        startIndex: 1,
        maxTiles: 5000,
        batchSize: 50,
        batchWaitMs: 50,
        xUpToYUp: true
    },
    VIEW: {
        background: 0x20242b,
        ambientLightIntensity: 2.8,
        hemisphereLightIntensity: 2.2,
        directionalLightIntensity: 2.5,
        fillLightIntensity: 1.8,
        bottomLightIntensity: 2.0,
        rotateSpeed: 0.55,
        zoomSpeed: 1.0,
        panSpeed: 0.8,
        fov: 50,
        near: 0.01,
        far: 1000000,
        showAxes: true
    },
    MEASUREMENT: {
        unit: "m",
        decimals: 3,
        pointColor: 0xff4d4d,
        lineColor: 0xff4d4d,
        activePointColor: 0xffff00,
        clickMoveTolerance: 5,
        pointSizeRatio: 0.004,
        lineClickThreshold: 0.03,
        lineWidth: 4,
        rangeColor: 0x00d8ff,
        rangeOpacity: 0.15,
        cylinderSubdivisionDepth: 7
    }
};

============================================================
【02_loader.js】
============================================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { APP_CONFIG } from "./config.js";

export const modelGroup = new THREE.Group();
modelGroup.name = "LoadedGLBModelGroup";
const loader = new GLTFLoader();

export function clearLoadedModels(){
    for(let i=modelGroup.children.length-1;i>=0;i--){
        const child=modelGroup.children[i];
        modelGroup.remove(child);
        disposeObject3D(child);
    }
}

export async function loadSequentialTiles(callbacks={}){
    const {onStatus=()=>{},onFileLoaded=()=>{},onBatchLoaded=async()=>{},onComplete=()=>{},onError=()=>{}}=callbacks;
    clearLoadedModels();
    const cfg=APP_CONFIG.MODEL;
    const start=Math.max(1,Number(cfg.startIndex)||1);
    const max=Math.max(1,Number(cfg.maxTiles)||5000);
    const batchSize=Math.max(1,Number(cfg.batchSize)||50);
    const batchWaitMs=Math.max(0,Number(cfg.batchWaitMs)||0);
    let loadedCount=0;
    let batchStartNumber=start;

    for(let number=start;number<start+max;number++){
        onStatus(`タイル${number}を確認中...（現在 ${loadedCount}個読み込み済み）`);
        const result=await tryLoadTile(number);
        if(result.status==="missing"){
            if(loadedCount>0 && loadedCount%batchSize!==0){
                const batchCount=loadedCount%batchSize;
                const batchEndNumber=number-1;
                onStatus(`タイル${batchStartNumber}～${batchEndNumber} 読み込み完了。表示処理中...`);
                await onBatchLoaded({batchStartNumber,batchEndNumber,batchCount,loadedCount,isLastBatch:true});
                await waitForBrowserRender();
            }
            break;
        }
        if(result.status==="error"){
            onError({number,error:result.error});
            throw result.error;
        }
        const root=result.root;
        root.name=result.fileName;
        prepareRoot(root);
        modelGroup.add(root);
        root.updateMatrixWorld(true);
        loadedCount++;
        onFileLoaded({number,fileName:result.fileName,root,loadedCount});

        if(loadedCount%batchSize===0){
            const batchEndNumber=number;
            onStatus(`タイル${batchStartNumber}～${batchEndNumber} 読み込み完了。表示処理中...`);
            await onBatchLoaded({batchStartNumber,batchEndNumber,batchCount:batchSize,loadedCount,isLastBatch:false});
            await waitForBrowserRender();
            batchStartNumber=number+1;
            onStatus(`${loadedCount}個表示完了。タイル${number+1}から読み込みを再開します...`);
            if(batchWaitMs>0) await wait(batchWaitMs);
        }
    }
    if(loadedCount===0) throw new Error(`最初のGLBが見つかりません。確認先: ${folderPath()}`);
    onComplete({tileCount:loadedCount});
    return {tileCount:loadedCount};
}

function waitForBrowserRender(){
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function tryLoadTile(number){
    const cfg=APP_CONFIG.MODEL;
    const candidates=[`${cfg.tileName}${number}.glb`,`${cfg.tileName} ${number}.glb`];
    for(const fileName of candidates){
        const url=buildFileUrl(fileName);
        try{
            const response=await fetch(url,{method:"HEAD",cache:"no-store"});
            if(!response.ok) continue;
            const root=await loadOneGLB(url);
            return {status:"loaded",root,fileName,url};
        }catch(error){
            try{
                const root=await loadOneGLB(url);
                return {status:"loaded",root,fileName,url};
            }catch(loadError){
                if(isMissingError(loadError)) continue;
                return {status:"error",error:loadError};
            }
        }
    }
    return {status:"missing"};
}
function loadOneGLB(url){
    return new Promise((resolve,reject)=>loader.load(url,gltf=>{
        const root=gltf.scene||gltf.scenes?.[0];
        if(!root){reject(new Error(`GLB内にsceneがありません: ${url}`));return;}
        resolve(root);
    },undefined,reject));
}
function folderPath(){let folder=String(APP_CONFIG.MODEL.folderPath||"./models/");if(!folder.endsWith("/")) folder+="/";return folder;}
function buildFileUrl(fileName){return folderPath()+encodeURIComponent(fileName);}
function isMissingError(error){const text=String(error?.message||error||"");return /404|not found|failed to fetch|fetch/i.test(text);}
function prepareRoot(root){
    // ReCapのX-upをThree.jsのY-upへ補正
    if(APP_CONFIG.MODEL.xUpToYUp){
        root.rotation.z += Math.PI/2;
    }

    root.traverse((child)=>{
        if(!child.isMesh) return;

        // 影を完全に使用しない
        child.castShadow=false;
        child.receiveShadow=false;
        child.userData.measurementTarget=true;

        // 裏面も見えるようにする
        const materials=Array.isArray(child.material)
            ? child.material
            : [child.material];

        for(const material of materials){
            if(!material) continue;
            material.side=THREE.DoubleSide;
            material.needsUpdate=true;
        }
    });

    root.updateMatrixWorld(true);
}
function disposeObject3D(root){
    root.traverse(object=>{
        if(object.geometry) object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials){if(!material)continue;for(const key of Object.keys(material)){const value=material[key];if(value&&value.isTexture)value.dispose();}material.dispose();}
    });
}

============================================================
【03_main.js】
============================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { APP_CONFIG } from "./config.js";
import { modelGroup, loadSequentialTiles } from "./loader.js";
import { MeasurementManager } from "./measurement.js";

const canvasContainer=document.getElementById("canvasContainer");
const modelStatus=document.getElementById("modelStatus");
const loadingPanel=document.getElementById("loadingPanel");
const loadingText=document.getElementById("loadingText");
const progressBar=document.getElementById("progressBar");
const scene=new THREE.Scene();
scene.background=new THREE.Color(APP_CONFIG.VIEW.background);
const camera=new THREE.PerspectiveCamera(APP_CONFIG.VIEW.fov,1,APP_CONFIG.VIEW.near,APP_CONFIG.VIEW.far);
camera.position.set(5,5,5);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=false;
canvasContainer.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.rotateSpeed=APP_CONFIG.VIEW.rotateSpeed;
controls.zoomSpeed=APP_CONFIG.VIEW.zoomSpeed;
controls.panSpeed=APP_CONFIG.VIEW.panSpeed;
// ============================================================
// 照明：上・横・下からモデルを照らす
// ============================================================

// 全体の暗さを持ち上げる
const ambientLight=new THREE.AmbientLight(
    0xffffff,
    APP_CONFIG.VIEW.ambientLightIntensity
);
scene.add(ambientLight);

// 上下で色が極端に暗くならないよう補助
const hemisphereLight=new THREE.HemisphereLight(
    0xffffff,
    0xbfc7d5,
    APP_CONFIG.VIEW.hemisphereLightIntensity
);
scene.add(hemisphereLight);

// 上方からのメインライト
const directional=new THREE.DirectionalLight(
    0xffffff,
    APP_CONFIG.VIEW.directionalLightIntensity
);
directional.position.set(10,20,10);
directional.castShadow=false;
scene.add(directional);

// 横・反対側からの補助ライト
const fillLight=new THREE.DirectionalLight(
    0xffffff,
    APP_CONFIG.VIEW.fillLightIntensity
);
fillLight.position.set(-10,8,-10);
fillLight.castShadow=false;
scene.add(fillLight);

// 下側の面が黒くならないよう下から照らす
const bottomLight=new THREE.DirectionalLight(
    0xffffff,
    APP_CONFIG.VIEW.bottomLightIntensity ?? 2.0
);
bottomLight.position.set(0,-20,0);
bottomLight.target.position.set(0,0,0);
bottomLight.castShadow=false;
scene.add(bottomLight);
scene.add(bottomLight.target);

scene.add(modelGroup);
if(APP_CONFIG.VIEW.showAxes) scene.add(new THREE.AxesHelper(1));
new MeasurementManager({scene,camera,renderer,controls,modelGroup});

async function autoLoadModels(){
    showLoading("固定パスからGLBを読み込んでいます...");
    try{
        const result=await loadSequentialTiles({
            onStatus:text=>{modelStatus.textContent=text;loadingText.textContent=text;},
            onFileLoaded:({fileName,loadedCount})=>{modelStatus.textContent=`${loadedCount}個読込済み：${fileName}`;progressBar.style.width=`${Math.min(92,12+(loadedCount%50)/50*80)}%`;},
            onBatchLoaded:async({batchStartNumber,batchEndNumber,loadedCount})=>{
                modelGroup.updateMatrixWorld(true);
                renderer.render(scene,camera);
                modelStatus.textContent=`${loadedCount}個表示完了（タイル${batchStartNumber}～${batchEndNumber}）`;
                loadingText.textContent=`${loadedCount}個のモデルを表示しました`;
                progressBar.style.width="100%";
            },
            onComplete:({tileCount})=>{modelStatus.textContent=`${tileCount}個のGLBを読み込みました`;loadingText.textContent=`読み込み完了：${tileCount}個`;progressBar.style.width="100%";},
            onError:({number,error})=>console.error(`タイル${number} 読み込みエラー`,error)
        });
        fitCameraToObject(modelGroup);
        document.getElementById("measurementResult").innerHTML=`<b>読み込み完了</b><br><br>${result.tileCount}個のGLBを読み込みました。`;
        setTimeout(hideLoading,700);
    }catch(error){
        console.error(error);modelStatus.textContent="GLB読み込みエラー";loadingText.textContent="読み込みエラー";progressBar.style.width="100%";
        document.getElementById("measurementResult").innerHTML=`<b>読み込みエラー</b><br><br>${String(error.message||error)}`;
    }
}
function fitCameraToObject(object){
    object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object);if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());const maxSize=Math.max(size.x,size.y,size.z,0.001);const fov=THREE.MathUtils.degToRad(camera.fov);let distance=maxSize/(2*Math.tan(fov/2));distance*=1.5;
    camera.position.set(center.x+distance,center.y+distance*0.7,center.z+distance);camera.near=Math.max(distance/10000,0.001);camera.far=Math.max(distance*100,1000);camera.updateProjectionMatrix();controls.target.copy(center);controls.update();
}
function resize(){const width=canvasContainer.clientWidth;const height=canvasContainer.clientHeight;if(width<=0||height<=0)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
window.addEventListener("resize",resize);resize();
function showLoading(text){loadingPanel.classList.remove("hidden");loadingText.textContent=text;progressBar.style.width="8%";}
function hideLoading(){loadingPanel.classList.add("hidden");}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}
animate();
autoLoadModels();

============================================================
【04_measurementRange.js】
============================================================

import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export class MeasurementRange {
    constructor({scene,camera,renderer,controls,modelGroup}){
        this.scene=scene; this.camera=camera; this.renderer=renderer;
        this.controls=controls; this.modelGroup=modelGroup;
        this.type=null; this.object=null;
        this.scaleDrag=null; this._adjustingScale=false;

        this.transform=new TransformControls(camera,renderer.domElement);
        this.transform.setSpace("local");
        this.transform.setMode("translate");
        this.scene.add(this.transform.getHelper());
        this.transform.getHelper().visible=false;

        this.transform.addEventListener("dragging-changed",e=>{
            this.controls.enabled=!e.value;
            if(e.value && this.transform.getMode()==="scale") this.beginOneSidedScale();
            else if(!e.value) this.scaleDrag=null;
        });

        this.transform.addEventListener("objectChange",()=>{
            if(this._adjustingScale || !this.object ||
               this.transform.getMode()!=="scale" || !this.scaleDrag) return;
            this.applyOneSidedScale();
        });
    }

    create(type="box"){
        this.removeObject();
        this.type=type;
        const box=new THREE.Box3().setFromObject(this.modelGroup);
        const center=box.getCenter(new THREE.Vector3());
        const size=box.getSize(new THREE.Vector3());
        const base=Math.max(Math.min(size.x||1,size.y||1,size.z||1),0.1);

        const geometry=type==="cylinder"
            ? new THREE.CylinderGeometry(0.5,0.5,1,64,1,true)
            : new THREE.BoxGeometry(1,1,1);

        const material=new THREE.MeshBasicMaterial({
            color:0x00d8ff,transparent:true,opacity:0.22,
            depthTest:false,depthWrite:false,side:THREE.DoubleSide
        });

        this.object=new THREE.Mesh(geometry,material);
        this.object.position.copy(center);
        this.object.scale.set(base,base,base);
        this.object.renderOrder=2000;
        this.object.userData.isMeasurementRange=true;
        this.scene.add(this.object);

        const edges=new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({
                color:0x00ffff,depthTest:false,depthWrite:false,
                transparent:true,opacity:1
            })
        );
        edges.renderOrder=2002;
        this.object.add(edges);
        this.addDepthGuides(type);

        this.transform.attach(this.object);
        this.transform.getHelper().visible=true;
        return this.object;
    }

    addDepthGuides(type){
        const points=type==="cylinder"
            ? [0,-0.5,0,0,0.5,0,-0.5,0,0,0.5,0,0,0,0,-0.5,0,0,0.5]
            : [-0.5,0,0,0.5,0,0,0,-0.5,0,0,0.5,0,0,0,-0.5,0,0,0.5];
        const g=new THREE.BufferGeometry();
        g.setAttribute("position",new THREE.Float32BufferAttribute(points,3));
        const m=new THREE.LineBasicMaterial({
            color:0xffffff,transparent:true,opacity:0.85,
            depthTest:false,depthWrite:false
        });
        const guides=new THREE.LineSegments(g,m);
        guides.renderOrder=2003;
        this.object.add(guides);

        if(type==="box"){
            const mg=new THREE.SphereGeometry(0.018,12,8);
            const mm=new THREE.MeshBasicMaterial({
                color:0xffffff,depthTest:false,depthWrite:false
            });
            const front=new THREE.Mesh(mg,mm);
            front.position.set(0,0,0.5); front.renderOrder=2004;
            const back=new THREE.Mesh(mg.clone(),mm.clone());
            back.position.set(0,0,-0.5); back.renderOrder=2004;
            this.object.add(front,back);
        }
    }

    setMode(mode){
        if(!this.object || !["translate","rotate","scale"].includes(mode)) return;
        this.scaleDrag=null;
        this.transform.setMode(mode);
    }

    beginOneSidedScale(){
        if(!this.object) return;
        const t=String(this.transform.axis||"");
        const axis=t==="X"?"x":t==="Y"?"y":t==="Z"?"z":null;
        if(!axis){this.scaleDrag=null;return;}

        const pos=this.object.position.clone();
        const scale=this.object.scale.clone();
        const quat=this.object.quaternion.clone();
        const localAxis=axis==="x"?new THREE.Vector3(1,0,0):
                        axis==="y"?new THREE.Vector3(0,1,0):
                                   new THREE.Vector3(0,0,1);
        const worldAxis=localAxis.applyQuaternion(quat).normalize();
        const length=Math.abs(scale[axis]);
        const fixedPoint=pos.clone().addScaledVector(worldAxis,-length*0.5);
        this.scaleDrag={axis,worldAxis,fixedPoint};
    }

    applyOneSidedScale(){
        const d=this.scaleDrag;
        if(!d || !this.object) return;
        const length=Math.max(Math.abs(this.object.scale[d.axis]),1e-6);
        const newPos=d.fixedPoint.clone().addScaledVector(d.worldAxis,length*0.5);
        this._adjustingScale=true;
        this.object.position.copy(newPos);
        this.object.updateMatrixWorld(true);
        this._adjustingScale=false;
    }

    getRange(){
        if(!this.object || !this.type) return null;
        this.object.updateMatrixWorld(true);
        return {
            type:this.type,
            matrixWorld:this.object.matrixWorld.clone(),
            inverseMatrixWorld:this.object.matrixWorld.clone().invert()
        };
    }

    removeObject(){
        if(!this.object)return;
        this.scaleDrag=null;
        this.transform.detach();
        this.scene.remove(this.object);
        this.object.traverse(o=>{
            o.geometry?.dispose?.();
            if(Array.isArray(o.material))o.material.forEach(m=>m?.dispose?.());
            else o.material?.dispose?.();
        });
        this.object=null; this.type=null;
        this.transform.getHelper().visible=false;
    }

    clear(){this.removeObject();}
}

============================================================
【今回の変更】
============================================================

・ReCap X-up → Three.js Y-up 補正を有効化
・renderer.shadowMap.enabled=false
・全Meshの castShadow / receiveShadow=false
・AmbientLightを強化
・HemisphereLightを強化
・上方DirectionalLight
・横方向Fill Light
・下方DirectionalLightを追加
・MeshをDoubleSide表示
・表面積範囲ボックスの片面リサイズ
・半透明範囲＋外周線＋奥行きガイドを維持

上記4ファイルを、それぞれ同名ファイルへ置き換えてください。
