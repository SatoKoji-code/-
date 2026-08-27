import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { APP_CONFIG } from "./config.js";

// ============================================================
// ===== 追加箇所：GLBフォルダ自動読み込み 開始 =====
// ============================================================

export const modelGroup = new THREE.Group();
modelGroup.name = "LoadedGLBModelGroup";

const loader = new GLTFLoader();

let activeObjectUrls = [];


// ------------------------------------------------------------
// ===== 追加箇所：既存モデル削除 =====
// ------------------------------------------------------------

export function clearLoadedModels(){

    for(let i = modelGroup.children.length - 1; i >= 0; i--){

        const child = modelGroup.children[i];

        modelGroup.remove(child);

        disposeObject3D(child);
    }

    for(const url of activeObjectUrls){
        URL.revokeObjectURL(url);
    }

    activeObjectUrls = [];
}


// ------------------------------------------------------------
// ===== 追加箇所：フォルダ内タイル抽出 =====
// ------------------------------------------------------------

export function findSequentialTileFiles(fileList){

    const cfg = APP_CONFIG.MODEL;

    const files = Array.from(fileList || []);

    /*
     * 「タイル1.glb」
     * 「タイル 1.glb」
     * の両方に対応。
     */
    const escapedTileName =
        escapeRegExp(cfg.tileName);

    const pattern =
        new RegExp(
            "^" +
            escapedTileName +
            "\\s*(\\d+)\\.glb$",
            "i"
        );

    const tileMap = new Map();


    for(const file of files){

        /*
         * サブフォルダも選択対象になるため、
         * 最後のファイル名だけで判定。
         */
        const match = file.name.match(pattern);

        if(!match){
            continue;
        }

        const number = Number(match[1]);

        if(!Number.isInteger(number)){
            continue;
        }

        /*
         * 同じ番号が複数ある場合は、
         * 最初に見つかったものを使用。
         */
        if(!tileMap.has(number)){
            tileMap.set(number, file);
        }
    }


    const result = [];

    const start =
        Math.max(
            0,
            Number(cfg.startIndex) || 1
        );

    const maxTiles =
        Math.max(
            1,
            Number(cfg.maxTiles) || 5000
        );


    if(cfg.stopAtFirstMissing){

        for(
            let number = start;
            number < start + maxTiles;
            number++
        ){

            if(!tileMap.has(number)){
                break;
            }

            result.push({
                number,
                file: tileMap.get(number)
            });
        }

        return result;
    }


    return Array.from(tileMap.entries())
        .filter(([number]) => number >= start)
        .sort((a,b) => a[0] - b[0])
        .slice(0,maxTiles)
        .map(([number,file]) => ({
            number,
            file
        }));
}


// ------------------------------------------------------------
// ===== 追加箇所：選択フォルダからGLB一括読込 =====
// ------------------------------------------------------------

export async function loadTilesFromFolder(
    fileList,
    callbacks = {}
){

    const {
        onStatus = () => {},
        onProgress = () => {},
        onFileLoaded = () => {},
        onComplete = () => {},
        onError = () => {}
    } = callbacks;


    clearLoadedModels();


    const tileFiles =
        findSequentialTileFiles(fileList);


    if(tileFiles.length === 0){

        throw new Error(
            "タイル1.glb または タイル 1.glb から始まる連番GLBが見つかりません。"
        );
    }


    const total = tileFiles.length;


    for(let i = 0; i < total; i++){

        const item = tileFiles[i];

        const file = item.file;

        onStatus(
            `読み込み中 ${i + 1}/${total}: ${file.name}`
        );


        try{

            const objectUrl =
                URL.createObjectURL(file);

            activeObjectUrls.push(objectUrl);


            const root =
                await loadOneGLB(
                    objectUrl,
                    (fileRatio) => {

                        const overall =
                            (
                                i +
                                fileRatio
                            ) /
                            total;

                        onProgress(overall);
                    }
                );


            root.name =
                file.name;


            prepareRoot(root);


            modelGroup.add(root);


            onFileLoaded({
                index: i,
                number: item.number,
                file,
                root
            });

        }
        catch(error){

            onError({
                file,
                number: item.number,
                error
            });

            throw error;
        }
    }


    onProgress(1);


    onComplete({
        tileCount: total,
        tiles: tileFiles
    });


    return {
        tileCount: total,
        tiles: tileFiles
    };
}


// ------------------------------------------------------------
// ===== 追加箇所：単一GLB読込 =====
// ------------------------------------------------------------

function loadOneGLB(url,onProgress){

    return new Promise((resolve,reject) => {

        loader.load(

            url,

            (gltf) => {

                const root =
                    gltf.scene ||
                    gltf.scenes?.[0];

                if(!root){

                    reject(
                        new Error(
                            "GLB内にsceneがありません。"
                        )
                    );

                    return;
                }

                resolve(root);
            },

            (event) => {

                if(
                    event.lengthComputable &&
                    event.total > 0
                ){

                    onProgress(
                        event.loaded /
                        event.total
                    );

                }
            },

            (error) => {
                reject(error);
            }
        );
    });
}


// ------------------------------------------------------------
// ===== 追加箇所：GLB表示準備 =====
// ------------------------------------------------------------

function prepareRoot(root){

    const cfg =
        APP_CONFIG.MODEL;


    if(cfg.recapZUpToThreeYUp){

        /*
         * Z-up → Y-up
         */
        root.rotation.x =
            -Math.PI / 2;
    }


    root.traverse((child) => {

        if(!child.isMesh){
            return;
        }

        child.castShadow = false;
        child.receiveShadow = false;

        /*
         * Raycaster対象として使用。
         */
        child.userData.measurementTarget = true;
    });


    root.updateMatrixWorld(true);
}


// ------------------------------------------------------------
// ===== 追加箇所：メモリ解放 =====
// ------------------------------------------------------------

function disposeObject3D(root){

    root.traverse((object) => {

        if(object.geometry){
            object.geometry.dispose();
        }

        const materials =
            Array.isArray(object.material)
                ? object.material
                : [object.material];

        for(const material of materials){

            if(!material){
                continue;
            }

            for(const key of Object.keys(material)){

                const value =
                    material[key];

                if(
                    value &&
                    value.isTexture
                ){
                    value.dispose();
                }
            }

            material.dispose();
        }
    });
}


function escapeRegExp(text){

    return String(text)
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
}

// ============================================================
// ===== 追加箇所：GLBフォルダ自動読み込み 終了 =====
// ============================================================
