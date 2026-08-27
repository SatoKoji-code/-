import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { APP_CONFIG } from "./config.js";

// ============================================================
// ===== 追加箇所：固定パス連番GLB読み込み 開始 =====
// ============================================================

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
        onComplete=()=>{},
        onError=()=>{}
    }=callbacks;

    clearLoadedModels();

    const cfg=APP_CONFIG.MODEL;
    const start=Math.max(1,Number(cfg.startIndex)||1);
    const max=Math.max(1,Number(cfg.maxTiles)||5000);
    let loadedCount=0;

    for(let number=start;number<start+max;number++){
        onStatus(`タイル${number}を確認中...`);

        const result=await tryLoadTile(number);

        // 最初の欠番で終了
        if(result.status==="missing") break;

        if(result.status==="error"){
            onError({number,error:result.error});
            throw result.error;
        }

        const root=result.root;
        root.name=result.fileName;
        prepareRoot(root);
        modelGroup.add(root);
        loadedCount++;

        onFileLoaded({number,fileName:result.fileName,root,loadedCount});
    }

    if(loadedCount===0){
        throw new Error(`最初のGLBが見つかりません。確認先: ${folderPath()}`);
    }

    onComplete({tileCount:loadedCount});
    return {tileCount:loadedCount};
}

async function tryLoadTile(number){
    const cfg=APP_CONFIG.MODEL;
    const candidates=[
        `${cfg.tileName}${number}.glb`,
        `${cfg.tileName} ${number}.glb`
    ];

    for(const fileName of candidates){
        const url=buildFileUrl(fileName);
        try{
            const response=await fetch(url,{method:"HEAD",cache:"no-store"});
            if(!response.ok) continue;
            const root=await loadOneGLB(url);
            return {status:"loaded",root,fileName,url};
        }catch(error){
            // HEAD未対応サーバー向けにGLTFLoaderで直接試す
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
    return new Promise((resolve,reject)=>{
        loader.load(url,(gltf)=>{
            const root=gltf.scene||gltf.scenes?.[0];
            if(!root){
                reject(new Error(`GLB内にsceneがありません: ${url}`));
                return;
            }
            resolve(root);
        },undefined,reject);
    });
}

function folderPath(){
    let folder=String(APP_CONFIG.MODEL.folderPath||"./models/");
    if(!folder.endsWith("/")) folder+="/";
    return folder;
}

function buildFileUrl(fileName){
    return folderPath()+encodeURIComponent(fileName);
}

function isMissingError(error){
    const text=String(error?.message||error||"");
    return /404|not found|failed to fetch|fetch/i.test(text);
}

function prepareRoot(root){
    if(APP_CONFIG.MODEL.recapZUpToThreeYUp){
        root.rotation.x=-Math.PI/2;
    }

    root.traverse((child)=>{
        if(!child.isMesh) return;
        child.castShadow=false;
        child.receiveShadow=false;
        child.userData.measurementTarget=true;
    });

    root.updateMatrixWorld(true);
}

function disposeObject3D(root){
    root.traverse((object)=>{
        if(object.geometry) object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials){
            if(!material) continue;
            for(const key of Object.keys(material)){
                const value=material[key];
                if(value&&value.isTexture) value.dispose();
            }
            material.dispose();
        }
    });
}

// ============================================================
// ===== 追加箇所：固定パス連番GLB読み込み 終了 =====
// ============================================================
