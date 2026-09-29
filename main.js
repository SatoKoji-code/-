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
        batchDisplayWaitMs: 500,
        maxConsecutiveMissing: 10,
        loadRetryCount: 3,
        loadRetryWaitMs: 500,
        batchWaitMs: 50,
        xUpToYUp: true
    },
    VIEW: {
        background: 0x20242b,
        ambientLightIntensity: 2.2,
        hemisphereLightIntensity: 1.8,
        directionalLightIntensity: 2.2,
        fillLightIntensity: 1.4,
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
    const {
        onStatus=()=>{},
        onFileLoaded=()=>{},
        onBatchLoaded=async()=>{},
        onComplete=()=>{},
        onError=()=>{}
    }=callbacks;

    clearLoadedModels();

    const cfg=APP_CONFIG.MODEL;
    const start=Math.max(1,Number(cfg.startIndex)||1);
    const max=Math.max(1,Number(cfg.maxTiles)||5000);
    const batchSize=Math.max(1,Number(cfg.batchSize)||50);
    const batchDisplayWaitMs=Math.max(0,Number(cfg.batchDisplayWaitMs)||500);
    const maxConsecutiveMissing=Math.max(1,Number(cfg.maxConsecutiveMissing)||10);
    const retryCount=Math.max(1,Number(cfg.loadRetryCount)||3);
    const retryWaitMs=Math.max(0,Number(cfg.loadRetryWaitMs)||500);

    let loadedCount=0;
    let consecutiveMissing=0;
    let batchStartLoadedCount=0;
    let batchStartNumber=null;
    let lastLoadedNumber=null;
    const skippedNumbers=[];

    for(let number=start;number<start+max;number++){
        onStatus(
            `タイル${number}を読み込み中... ` +
            `（読込済み ${loadedCount}個）`
        );

        const result=await tryLoadTileWithRetry(
            number,
            retryCount,
            retryWaitMs,
            onStatus
        );

        if(result.status==="missing"){
            consecutiveMissing++;
            skippedNumbers.push(number);

            onStatus(
                `タイル${number}を確認できませんでした。` +
                `連続欠番 ${consecutiveMissing}/${maxConsecutiveMissing}`
            );

            // 1個の欠番では終了しない。
            // 指定数だけ連続して見つからなかった場合に初めて終了。
            if(consecutiveMissing>=maxConsecutiveMissing){
                break;
            }

            continue;
        }

        if(result.status==="error"){
            // 通信・解析等のエラーは「不存在」と決めつけず、
            // エラーとして記録して次番号へ進む。
            onError({
                number,
                error:result.error
            });

            skippedNumbers.push(number);
            consecutiveMissing=0;
            continue;
        }

        // 1個でも正常に読めたら連続欠番カウントをリセット
        consecutiveMissing=0;

        const root=result.root;
        root.name=result.fileName;
        prepareRoot(root);
        modelGroup.add(root);
        root.updateMatrixWorld(true);

        loadedCount++;
        lastLoadedNumber=number;

        if(batchStartNumber===null){
            batchStartNumber=number;
        }

        onFileLoaded({
            number,
            fileName:result.fileName,
            root,
            loadedCount
        });

        // 「ファイル番号」ではなく「正常に読み込めた個数」で50個ごとに区切る
        if(loadedCount-batchStartLoadedCount>=batchSize){
            await displayCurrentBatch({
                onStatus,
                onBatchLoaded,
                batchStartNumber,
                batchEndNumber:number,
                batchCount:loadedCount-batchStartLoadedCount,
                loadedCount,
                batchDisplayWaitMs,
                isLastBatch:false
            });

            batchStartLoadedCount=loadedCount;
            batchStartNumber=null;
        }
    }

    if(loadedCount===0){
        throw new Error(
            `GLBを1個も読み込めませんでした。確認先: ${folderPath()}`
        );
    }

    // 最後の50個未満も必ず表示
    if(loadedCount>batchStartLoadedCount && lastLoadedNumber!==null){
        await displayCurrentBatch({
            onStatus,
            onBatchLoaded,
            batchStartNumber:batchStartNumber ?? lastLoadedNumber,
            batchEndNumber:lastLoadedNumber,
            batchCount:loadedCount-batchStartLoadedCount,
            loadedCount,
            batchDisplayWaitMs,
            isLastBatch:true
        });
    }

    onComplete({
        tileCount:loadedCount,
        lastLoadedNumber,
        skippedNumbers
    });

    return {
        tileCount:loadedCount,
        lastLoadedNumber,
        skippedNumbers
    };
}

async function displayCurrentBatch({
    onStatus,
    onBatchLoaded,
    batchStartNumber,
    batchEndNumber,
    batchCount,
    loadedCount,
    batchDisplayWaitMs,
    isLastBatch
}){
    onStatus(
        `${loadedCount}個読み込み済み。` +
        `タイル${batchStartNumber}～${batchEndNumber}を画面表示中...`
    );

    // main.js側のカメラ調整＋renderer.render()完了まで待つ
    await onBatchLoaded({
        batchStartNumber,
        batchEndNumber,
        batchCount,
        loadedCount,
        isLastBatch
    });

    // ブラウザに描画フレームを確実に渡す
    await waitForBrowserRender();

    // 50個表示状態を一定時間保持
    await wait(batchDisplayWaitMs);
}

async function tryLoadTileWithRetry(
    number,
    retryCount,
    retryWaitMs,
    onStatus
){
    const cfg=APP_CONFIG.MODEL;

    const candidates=[
        `${cfg.tileName}${number}.glb`,
        `${cfg.tileName} ${number}.glb`
    ];

    let lastError=null;
    let missingLikeCount=0;

    // HEADリクエストは使わない。
    // GLTFLoaderで直接GLBを読み込む。
    for(const fileName of candidates){
        const url=buildFileUrl(fileName);

        for(let attempt=1;attempt<=retryCount;attempt++){
            try{
                if(attempt>1){
                    onStatus(
                        `${fileName} 再試行 ${attempt}/${retryCount}...`
                    );
                }

                const root=await loadOneGLB(url);

                return {
                    status:"loaded",
                    root,
                    fileName,
                    url
                };
            }catch(error){
                lastError=error;

                if(isDefinitelyMissing(error)){
                    // 明確な404なら同じ候補名を何度も再試行せず、
                    // 次の候補（「タイル 1.glb」等）を確認。
                    missingLikeCount++;
                    break;
                }

                // Failed to fetch等は「不存在」と断定しない。
                // 一時的な失敗の可能性があるのでリトライする。
                if(attempt<retryCount){
                    await wait(retryWaitMs*attempt);
                }
            }
        }
    }

    // 2候補とも明確な404等なら欠番扱い
    if(missingLikeCount>=candidates.length){
        return {
            status:"missing",
            error:lastError
        };
    }

    // 404以外で3回失敗した場合はerror。
    // 呼び出し側は全体を終了せず次番号へ進む。
    return {
        status:"error",
        error:lastError || new Error(`タイル${number}の読み込みに失敗しました`)
    };
}

function loadOneGLB(url){
    return new Promise((resolve,reject)=>{
        loader.load(
            url,
            (gltf)=>{
                const root=gltf.scene||gltf.scenes?.[0];

                if(!root){
                    reject(
                        new Error(`GLB内にsceneがありません: ${url}`)
                    );
                    return;
                }

                resolve(root);
            },
            undefined,
            reject
        );
    });
}

function folderPath(){
    let folder=String(
        APP_CONFIG.MODEL.folderPath||"./models/"
    );

    if(!folder.endsWith("/")){
        folder+="/";
    }

    return folder;
}

function buildFileUrl(fileName){
    return folderPath()+encodeURIComponent(fileName);
}

function isDefinitelyMissing(error){
    const text=String(
        error?.message||error||""
    );

    // 「Failed to fetch」はここに含めない。
    // 明確な不存在だけを欠番として扱う。
    return /404|not found/i.test(text);
}

function prepareRoot(root){
    if(APP_CONFIG.MODEL.xUpToYUp){
        root.rotation.z+=Math.PI/2;
    }

    root.traverse((child)=>{
        if(!child.isMesh) return;

        child.castShadow=false;
        child.receiveShadow=false;
        child.userData.measurementTarget=true;
    });

    root.updateMatrixWorld(true);
}

function waitForBrowserRender(){
    return new Promise(resolve=>{
        requestAnimationFrame(()=>{
            requestAnimationFrame(()=>{
                requestAnimationFrame(resolve);
            });
        });
    });
}

function wait(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms);
    });
}

function disposeObject3D(root){
    root.traverse((object)=>{
        if(object.geometry){
            object.geometry.dispose();
        }

        const materials=Array.isArray(object.material)
            ? object.material
            : [object.material];

        for(const material of materials){
            if(!material) continue;

            for(const key of Object.keys(material)){
                const value=material[key];

                if(value&&value.isTexture){
                    value.dispose();
                }
            }

            material.dispose();
        }
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
scene.add(new THREE.AmbientLight(0xffffff,APP_CONFIG.VIEW.ambientLightIntensity));
scene.add(new THREE.HemisphereLight(0xffffff,0x777777,APP_CONFIG.VIEW.hemisphereLightIntensity));
const directional=new THREE.DirectionalLight(0xffffff,APP_CONFIG.VIEW.directionalLightIntensity);directional.position.set(10,20,10);directional.castShadow=false;scene.add(directional);
const fillLight=new THREE.DirectionalLight(0xffffff,APP_CONFIG.VIEW.fillLightIntensity);fillLight.position.set(-10,8,-10);fillLight.castShadow=false;scene.add(fillLight);
scene.add(modelGroup);
if(APP_CONFIG.VIEW.showAxes) scene.add(new THREE.AxesHelper(1));
new MeasurementManager({scene,camera,renderer,controls,modelGroup});

async function autoLoadModels(){
    showLoading("固定パスからGLBを読み込んでいます...");
    try{
        const result=await loadSequentialTiles({
            onStatus:text=>{modelStatus.textContent=text;loadingText.textContent=text;},
            onFileLoaded:({fileName,loadedCount})=>{
                modelStatus.textContent=
                    `${loadedCount}個読込済み：${fileName}`;

                const batchSize=
                    Math.max(1,Number(APP_CONFIG.MODEL.batchSize)||50);

                const inBatch=loadedCount%batchSize;

                progressBar.style.width=
                    `${inBatch===0 ? 100 : Math.max(8,(inBatch/batchSize)*100)}%`;
            },

            onBatchLoaded:async({
                batchStartNumber,
                batchEndNumber,
                loadedCount
            })=>{
                modelGroup.updateMatrixWorld(true);

                // 50個ごとに、その時点のモデル全体へカメラを合わせる
                fitCameraToObject(modelGroup);

                controls.update();

                // 明示的に描画
                renderer.render(scene,camera);

                modelStatus.textContent=
                    `${loadedCount}個表示中 ` +
                    `（タイル${batchStartNumber}～${batchEndNumber}）`;

                loadingText.textContent=
                    `${loadedCount}個を画面に表示しました`;

                progressBar.style.width="100%";

                // DOM/GPU側へ描画処理を渡す
                await nextFrame();
                renderer.render(scene,camera);

                await nextFrame();
                renderer.render(scene,camera);

                await nextFrame();
            },

            onComplete:({
                tileCount,
                lastLoadedNumber,
                skippedNumbers=[]
            })=>{
                modelStatus.textContent=
                    `${tileCount}個のGLBを読み込みました`;

                loadingText.textContent=
                    `読み込み完了：${tileCount}個`;

                progressBar.style.width="100%";

                if(skippedNumbers.length>0){
                    console.warn(
                        "読み込めなかったタイル番号:",
                        skippedNumbers
                    );
                }
            },
            onError:({number,error})=>console.error(`タイル${number} 読み込みエラー`,error)
        });
        fitCameraToObject(modelGroup);
        document.getElementById("measurementResult").innerHTML=`<b>読み込み完了</b><br><br>` +
            `${result.tileCount}個のGLBを読み込みました。<br>` +
            `最終確認タイル: ${result.lastLoadedNumber ?? "-"}<br>` +
            (
                result.skippedNumbers?.length
                    ? `未読込番号: ${result.skippedNumbers.join(", ")}`
                    : `未読込番号: なし`
            );
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
function nextFrame(){
    return new Promise(resolve=>{
        requestAnimationFrame(resolve);
    });
}

function resize(){const width=canvasContainer.clientWidth;const height=canvasContainer.clientHeight;if(width<=0||height<=0)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
window.addEventListener("resize",resize);resize();
function showLoading(text){loadingPanel.classList.remove("hidden");loadingText.textContent=text;progressBar.style.width="8%";}
function hideLoading(){loadingPanel.classList.add("hidden");}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}
animate();
autoLoadModels();
